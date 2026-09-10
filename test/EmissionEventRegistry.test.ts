import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";


const PRODUCT_ID = 1n;
const ZERO_HASH = ethers.ZeroHash;

describe("EmissionEventRegistry", () => {
  async function deploy() {
    const [admin, smelter, oem, recycler, stranger] = await ethers.getSigners();
    const participants = await ethers.deployContract("ParticipantRegistry", [admin.address]);
    const events = await ethers.deployContract("EmissionEventRegistry", [
      await participants.getAddress(),
    ]);

    await participants.registerParticipant(smelter.address, "AluCo", "smelter");
    await participants.authoriseStage(smelter.address, 1);
    await participants.registerParticipant(oem.address, "LaptopCorp", "oem");
    await participants.authoriseStage(oem.address, 5);
    await participants.registerParticipant(recycler.address, "ReCyc", "recycler");
    await participants.authoriseStage(recycler.address, 10);

    await events.connect(smelter).createProduct(PRODUCT_ID, "Laptop serial CMVP-001");
    return { participants, events, admin, smelter, oem, recycler, stranger };
  }

  const smelterArgs = [
    PRODUCT_ID,
    1, // stageId
    12_000n, // 12 kg aluminium (x1000)
    "kg",
    8_000_000n, // 8,000 gCO2e per kg (x1000)
    "ecoinvent-3.11 aluminium-ingot-CN v1",
    "GHG Protocol Scope 3 Cat 1",
    ethers.keccak256(ethers.toUtf8Bytes("smelter-meter-reading.pdf")),
    "1.0.0",
  ] as const;

  describe("product creation", () => {
    it("lets a registered participant open a product passport", async () => {
      const { events, oem } = await loadFixture(deploy);
      await expect(events.connect(oem).createProduct(2n, "Laptop CMVP-002"))
        .to.emit(events, "ProductCreated")
        .withArgs(2n, oem.address, "Laptop CMVP-002");
      expect(await events.productExists(2n)).to.equal(true);
    });

    it("refuses strangers and duplicate products", async () => {
      const { events, smelter, stranger } = await loadFixture(deploy);
      await expect(
        events.connect(stranger).createProduct(3n, "x")
      ).to.be.revertedWithCustomError(events, "NotRegisteredParticipant");
      await expect(
        events.connect(smelter).createProduct(PRODUCT_ID, "again")
      ).to.be.revertedWithCustomError(events, "ProductAlreadyExists");
    });
  });

  describe("recording events", () => {
    it("records an event with on-chain computed CO2e", async () => {
      const { events, smelter } = await loadFixture(deploy);
      await events.connect(smelter).recordEvent(...smelterArgs);

      expect(await events.eventCount(PRODUCT_ID)).to.equal(1n);
      const e = await events.eventAt(PRODUCT_ID, 0);
      expect(e.actor).to.equal(smelter.address);
      expect(e.stageId).to.equal(1);
      // 12,000 x 8,000,000 / 1,000,000 = 96,000 g = 96 kg CO2e
      expect(e.co2eGrams).to.equal(96_000n);
      expect(e.prevEventHash).to.equal(ZERO_HASH); // genesis event
      expect(e.eventHash).to.equal(await events.lastEventHash(PRODUCT_ID));
    });

    it("stamps the block timestamp so events cannot be backdated by the caller", async () => {
      const { events, smelter } = await loadFixture(deploy);
      const tx = await events.connect(smelter).recordEvent(...smelterArgs);
      const block = await tx.getBlock();
      const e = await events.eventAt(PRODUCT_ID, 0);
      expect(e.timestamp).to.equal(BigInt(block!.timestamp));
    });

    it("computes negative CO2e for a recycling credit", async () => {
      const { events, recycler } = await loadFixture(deploy);
      await events.connect(recycler).recordEvent(
        PRODUCT_ID,
        10,
        2_000n, // 2 kg recovered
        "kg",
        -1_500_000n, // credit: -1,500 g per kg
        "recycling-LCA-2026 v2",
        "GHG Protocol Scope 3 Cat 12",
        ethers.keccak256(ethers.toUtf8Bytes("recycling-receipt.pdf")),
        "1.0.0"
      );
      const e = await events.eventAt(PRODUCT_ID, 0);
      expect(e.co2eGrams).to.equal(-3_000n);
    });

    it("refuses an actor not authorised for the stage", async () => {
      const { events, oem, stranger } = await loadFixture(deploy);
      // oem is authorised for stage 5, not stage 1
      await expect(
        events.connect(oem).recordEvent(...smelterArgs)
      ).to.be.revertedWithCustomError(events, "NotAuthorisedForStage");
      await expect(
        events.connect(stranger).recordEvent(...smelterArgs)
      ).to.be.revertedWithCustomError(events, "NotAuthorisedForStage");
    });

    it("refuses events for unknown products", async () => {
      const { events, smelter } = await loadFixture(deploy);
      const badArgs = [...smelterArgs] as any[];
      badArgs[0] = 999n;
      await expect(
        events.connect(smelter).recordEvent(...(badArgs as typeof smelterArgs))
      ).to.be.revertedWithCustomError(events, "UnknownProduct");
    });

    it("a deactivated participant immediately loses write access", async () => {
      const { participants, events, smelter } = await loadFixture(deploy);
      await participants.deactivateParticipant(smelter.address);
      await expect(
        events.connect(smelter).recordEvent(...smelterArgs)
      ).to.be.revertedWithCustomError(events, "NotAuthorisedForStage");
    });
  });

  describe("hash chain", () => {
    it("links each event to the previous one", async () => {
      const { events, smelter, oem } = await loadFixture(deploy);
      await events.connect(smelter).recordEvent(...smelterArgs);
      await events.connect(oem).recordEvent(
        PRODUCT_ID, 5, 5_500n, "kWh", 450_000n,
        "IEA-2026 grid-CN v1", "GHG Protocol Scope 3 Cat 1",
        ethers.keccak256(ethers.toUtf8Bytes("factory-energy-log.csv")), "1.0.0"
      );

      const e0 = await events.eventAt(PRODUCT_ID, 0);
      const e1 = await events.eventAt(PRODUCT_ID, 1);
      expect(e1.prevEventHash).to.equal(e0.eventHash); // the link
      expect(await events.lastEventHash(PRODUCT_ID)).to.equal(e1.eventHash);

      const [ok, broken] = await events.verifyChain(PRODUCT_ID);
      expect(ok).to.equal(true);
      expect(broken).to.equal(ethers.MaxUint256);
    });

    it("an independent auditor can recompute every hash off-chain", async () => {
      const { events, smelter } = await loadFixture(deploy);
      await events.connect(smelter).recordEvent(...smelterArgs);
      const e = await events.eventAt(PRODUCT_ID, 0);

      // Recompute keccak256 over the same fields, entirely outside the chain.
      const coder = ethers.AbiCoder.defaultAbiCoder();
      const recomputed = ethers.keccak256(
        coder.encode(
          ["uint256", "uint8", "address", "uint256", "string", "int256",
           "string", "int256", "string", "bytes32", "bytes32", "uint64", "string"],
          [e.productId, e.stageId, e.actor, e.activityData, e.activityUnit,
           e.emissionFactor, e.efSource, e.co2eGrams, e.methodology,
           e.evidenceHash, e.prevEventHash, e.timestamp, e.schemaVersion]
        )
      );
      expect(recomputed).to.equal(e.eventHash);
    });

    it("keeps per-product chains independent", async () => {
      const { events, smelter } = await loadFixture(deploy);
      await events.connect(smelter).createProduct(2n, "Laptop CMVP-002");
      await events.connect(smelter).recordEvent(...smelterArgs);

      const argsB = [...smelterArgs] as any[];
      argsB[0] = 2n;
      await events.connect(smelter).recordEvent(...(argsB as typeof smelterArgs));

      const eA = await events.eventAt(PRODUCT_ID, 0);
      const eB = await events.eventAt(2n, 0);
      expect(eB.prevEventHash).to.equal(ZERO_HASH); // B starts its own chain
      expect(eA.eventHash).to.not.equal(eB.eventHash); // productId differs
    });

    it("exposes no function to modify or delete a recorded event", async () => {
      const { events } = await loadFixture(deploy);
      const writable = events.interface.fragments
        .filter((f: any) => f.type === "function" && !["view", "pure"].includes(f.stateMutability))
        .map((f: any) => f.name);
      expect(writable.sort()).to.deep.equal(["createProduct", "recordEvent"]);
    });
  });
});
