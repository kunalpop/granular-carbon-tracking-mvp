import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";


const PRODUCT_ID = 1n;

describe("GovernanceModule", () => {
  async function deploy() {
    const [admin, gov2, gov3, smelter, oem, auditor, stranger] = await ethers.getSigners();

    const participants = await ethers.deployContract("ParticipantRegistry", [admin.address]);
    const events = await ethers.deployContract("EmissionEventRegistry", [
      await participants.getAddress(),
    ]);

    // 2-of-3 consortium multisig controls upgrades.
    const multisig = await ethers.deployContract("ConsortiumMultisig", [
      [admin.address, gov2.address, gov3.address],
      2n,
    ]);

    // GovernanceModule behind a UUPS (ERC1967) proxy.
    const impl = await ethers.deployContract("GovernanceModule");
    const initData = impl.interface.encodeFunctionData("initialize", [
      admin.address,
      await events.getAddress(),
      await multisig.getAddress(),
    ]);
    const proxy = await ethers.deployContract("ERC1967Proxy", [
      await impl.getAddress(),
      initData,
    ]);
    const governance = await ethers.getContractAt("GovernanceModule", await proxy.getAddress());

    await governance.grantRole(await governance.CORRECTOR_ROLE(), auditor.address);
    await governance.grantRole(await governance.AUDITOR_ROLE(), auditor.address);

    // Two recorded events to govern over.
    await participants.registerParticipant(smelter.address, "AluCo", "smelter");
    await participants.authoriseStage(smelter.address, 1);
    await participants.registerParticipant(oem.address, "LaptopCorp", "oem");
    await participants.authoriseStage(oem.address, 5);
    await events.connect(smelter).createProduct(PRODUCT_ID, "Laptop CMVP-001");
    const evidence = (s: string) => ethers.keccak256(ethers.toUtf8Bytes(s));
    // stage 1: 12 kg x 8,000 g/kg = 96,000 g
    await events.connect(smelter).recordEvent(
      PRODUCT_ID, 1, 12_000n, "kg", 8_000_000n,
      "ecoinvent-3.11 v1", "GHGP S3C1", evidence("smelt.pdf"), "1.0.0");
    // stage 5: 5.5 kWh x 450 g/kWh = 2,475 g
    await events.connect(oem).recordEvent(
      PRODUCT_ID, 5, 5_500n, "kWh", 450_000n,
      "IEA-2026 v1", "GHGP S3C1", evidence("assembly.csv"), "1.0.0");

    return { participants, events, multisig, governance, admin, gov2, gov3, smelter, oem, auditor, stranger };
  }

  describe("DP4: no silent overwriting, ever", () => {
    it("the ledger has no write-path to alter a past record (any caller)", async () => {
      const { events } = await loadFixture(deploy);
      const writable = events.interface.fragments
        .filter((f: any) => f.type === "function" && !["view", "pure"].includes(f.stateMutability))
        .map((f: any) => f.name);
      // Only appending exists; nothing can edit or delete.
      expect(writable.sort()).to.deep.equal(["createProduct", "recordEvent"]);
    });

    it("a normal user cannot log a correction", async () => {
      const { governance, stranger, smelter } = await loadFixture(deploy);
      for (const account of [stranger, smelter]) {
        await expect(
          governance.connect(account).correctEvent(
            PRODUCT_ID, 0, 10_000n, 8_000_000n, "let me fix this",
            ethers.keccak256(ethers.toUtf8Bytes("fake.pdf")))
        ).to.be.revertedWithCustomError(governance, "AccessControlUnauthorizedAccount");
      }
      expect(await governance.correctionCount()).to.equal(0n);
    });

    it("an authorised correction is appended, cross-referenced, and logged — and the original is untouched", async () => {
      const { governance, events, auditor } = await loadFixture(deploy);
      const before = await events.eventAt(PRODUCT_ID, 0);

      // Meter mis-read: actually 11.5 kg, not 12 kg -> 92,000 g.
      await expect(
        governance.connect(auditor).correctEvent(
          PRODUCT_ID, 0, 11_500n, 8_000_000n,
          "smelter meter mis-read; corrected against invoice #4411",
          ethers.keccak256(ethers.toUtf8Bytes("invoice-4411.pdf")))
      )
        .to.emit(governance, "CorrectionLogged")
        .withArgs(
          PRODUCT_ID, 0, before.eventHash, 1n, 0n,
          96_000n, 92_000n,
          "smelter meter mis-read; corrected against invoice #4411",
          auditor.address
        );

      // The correction is a first-class record with full provenance.
      const c = await governance.correctionAt(1n);
      expect(c.originalEventHash).to.equal(before.eventHash); // cross-reference
      expect(c.correctedCo2eGrams).to.equal(92_000n);
      expect(c.correctedBy).to.equal(auditor.address);
      expect(c.supersedesCorrectionId).to.equal(0n); // supersedes the original

      // The original record is bit-for-bit unchanged and its chain intact.
      const after = await events.eventAt(PRODUCT_ID, 0);
      expect(after.co2eGrams).to.equal(96_000n);
      expect(after.eventHash).to.equal(before.eventHash);
      const [ok] = await events.verifyChain(PRODUCT_ID);
      expect(ok).to.equal(true);
    });

    it("reporting uses the corrected value; the raw record remains visible", async () => {
      const { governance, auditor } = await loadFixture(deploy);
      await governance.connect(auditor).correctEvent(
        PRODUCT_ID, 0, 11_500n, 8_000_000n, "meter mis-read",
        ethers.keccak256(ethers.toUtf8Bytes("invoice.pdf")));

      expect(await governance.effectiveCo2e(PRODUCT_ID, 0)).to.equal(92_000n);
      expect(await governance.effectiveCo2e(PRODUCT_ID, 1)).to.equal(2_475n); // uncorrected
      // 92,000 + 2,475 (raw total would be 98,475)
      expect(await governance.effectiveProductTotal(PRODUCT_ID)).to.equal(94_475n);
    });

    it("a correction can itself be superseded, forming a visible chain", async () => {
      const { governance, auditor } = await loadFixture(deploy);
      const ev = (s: string) => ethers.keccak256(ethers.toUtf8Bytes(s));
      await governance.connect(auditor).correctEvent(
        PRODUCT_ID, 0, 11_500n, 8_000_000n, "first correction", ev("a.pdf"));
      await governance.connect(auditor).correctEvent(
        PRODUCT_ID, 0, 11_700n, 8_000_000n, "second correction: re-audit", ev("b.pdf"));

      const c2 = await governance.correctionAt(2n);
      expect(c2.supersedesCorrectionId).to.equal(1n); // chain of custody
      expect(await governance.latestCorrectionId(PRODUCT_ID, 0)).to.equal(2n);
      expect(await governance.effectiveCo2e(PRODUCT_ID, 0)).to.equal(93_600n);
      expect(await governance.correctionCount()).to.equal(2n); // both preserved
    });

    it("cannot correct an event that does not exist", async () => {
      const { governance, auditor } = await loadFixture(deploy);
      await expect(
        governance.connect(auditor).correctEvent(
          PRODUCT_ID, 99, 1n, 1n, "x", ethers.ZeroHash)
      ).to.be.reverted; // out-of-bounds read in the registry
    });
  });

  describe("DP5: automated escalation", () => {
    it("only a governor can set thresholds", async () => {
      const { governance, stranger } = await loadFixture(deploy);
      await expect(
        governance.connect(stranger).setStageThreshold(1, 50_000n)
      ).to.be.revertedWithCustomError(governance, "AccessControlUnauthorizedAccount");
    });

    it("screening flags a threshold breach exactly once, with an event", async () => {
      const { governance, admin, stranger } = await loadFixture(deploy);
      await governance.connect(admin).setStageThreshold(1, 50_000n); // stage 1 cap 50 kg

      // Anyone may screen; the breach (96,000 > 50,000) is flagged.
      await expect(governance.connect(stranger).screenProduct(PRODUCT_ID))
        .to.emit(governance, "EscalationRaised")
        .withArgs(PRODUCT_ID, 0, 96_000n, 50_000n, "threshold breach", stranger.address);
      expect(await governance.escalationCount()).to.equal(1n);

      // Re-screening does not duplicate the escalation.
      await governance.connect(stranger).screenProduct(PRODUCT_ID);
      expect(await governance.escalationCount()).to.equal(1n);
    });

    it("events under the threshold are not flagged", async () => {
      const { governance, admin, stranger } = await loadFixture(deploy);
      await governance.connect(admin).setStageThreshold(5, 50_000n); // stage 5 cap
      await governance.connect(stranger).screenProduct(PRODUCT_ID);
      expect(await governance.escalationCount()).to.equal(0n); // 2,475 < 50,000
    });

    it("an auditor can raise a manual escalation; strangers cannot", async () => {
      const { governance, auditor, stranger } = await loadFixture(deploy);
      await expect(
        governance.connect(auditor).raiseEscalation(PRODUCT_ID, 1, "factor looks implausible for region")
      )
        .to.emit(governance, "EscalationRaised")
        .withArgs(PRODUCT_ID, 1, 2_475n, 0n, "factor looks implausible for region", auditor.address);

      await expect(
        governance.connect(stranger).raiseEscalation(PRODUCT_ID, 1, "x")
      ).to.be.revertedWithCustomError(governance, "AccessControlUnauthorizedAccount");
    });
  });

  describe("upgradeability under multi-signature control (regulator override)", () => {
    it("no single account — not even the admin — can upgrade directly", async () => {
      const { governance, admin, stranger } = await loadFixture(deploy);
      const v2 = await ethers.deployContract("GovernanceModuleV2");
      for (const account of [admin, stranger]) {
        await expect(
          governance.connect(account).upgradeToAndCall(await v2.getAddress(), "0x")
        ).to.be.revertedWithCustomError(governance, "AccessControlUnauthorizedAccount");
      }
    });

    it("the consortium multisig can upgrade with 2-of-3 confirmations, preserving state", async () => {
      const { governance, multisig, admin, gov2, auditor } = await loadFixture(deploy);

      // Pre-existing state that must survive the upgrade.
      await governance.connect(auditor).correctEvent(
        PRODUCT_ID, 0, 11_500n, 8_000_000n, "meter mis-read",
        ethers.keccak256(ethers.toUtf8Bytes("invoice.pdf")));

      const v2 = await ethers.deployContract("GovernanceModuleV2");
      const upgradeCall = governance.interface.encodeFunctionData("upgradeToAndCall", [
        await v2.getAddress(),
        "0x",
      ]);

      await multisig.connect(admin).submit(await governance.getAddress(), upgradeCall);
      await multisig.connect(admin).confirm(0);

      // One confirmation is not enough.
      await expect(multisig.connect(admin).execute(0)).to.be.revertedWithCustomError(
        multisig, "NotEnoughConfirmations");

      // Second governor confirms; now it executes.
      await multisig.connect(gov2).confirm(0);
      await expect(multisig.connect(gov2).execute(0))
        .to.emit(multisig, "TransactionExecuted");

      // New logic is live at the same address...
      const upgraded = await ethers.getContractAt("GovernanceModuleV2", await governance.getAddress());
      expect(await upgraded.version()).to.equal("2.0.0");
      // ...and the correction log survived intact.
      expect(await upgraded.correctionCount()).to.equal(1n);
      expect((await upgraded.correctionAt(1n)).correctedCo2eGrams).to.equal(92_000n);
    });

    it("a non-owner cannot even submit to the multisig", async () => {
      const { multisig, governance, stranger } = await loadFixture(deploy);
      await expect(
        multisig.connect(stranger).submit(await governance.getAddress(), "0x")
      ).to.be.revertedWithCustomError(multisig, "NotAnOwner");
    });
  });
});
