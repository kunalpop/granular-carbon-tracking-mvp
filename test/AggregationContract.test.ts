import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";


const PRODUCT_ID = 1n;

describe("AggregationContract", () => {
  // Full wiring: participants -> event registry -> token -> aggregator,
  // with three stages recorded (a miniature end-to-end of the pipeline).
  async function deploy() {
    const [admin, smelter, oem, recycler] = await ethers.getSigners();
    const participants = await ethers.deployContract("ParticipantRegistry", [admin.address]);
    const events = await ethers.deployContract("EmissionEventRegistry", [
      await participants.getAddress(),
    ]);
    const token = await ethers.deployContract("CarbonToken", [admin.address]);
    const aggregator = await ethers.deployContract("AggregationContract", [
      await events.getAddress(),
      await token.getAddress(),
    ]);

    await participants.registerParticipant(smelter.address, "AluCo", "smelter");
    await participants.authoriseStage(smelter.address, 1);
    await participants.registerParticipant(oem.address, "LaptopCorp", "oem");
    await participants.authoriseStage(oem.address, 5);
    await participants.registerParticipant(recycler.address, "ReCyc", "recycler");
    await participants.authoriseStage(recycler.address, 10);

    await events.connect(smelter).createProduct(PRODUCT_ID, "Laptop CMVP-001");

    const evidence = (s: string) => ethers.keccak256(ethers.toUtf8Bytes(s));
    // stage 1: 12 kg aluminium x 8,000 g/kg  = 96,000 g
    await events.connect(smelter).recordEvent(
      PRODUCT_ID, 1, 12_000n, "kg", 8_000_000n,
      "ecoinvent-3.11 v1", "GHGP S3C1", evidence("smelt.pdf"), "1.0.0");
    // stage 5: 5.5 kWh x 450 g/kWh = 2,475 g
    await events.connect(oem).recordEvent(
      PRODUCT_ID, 5, 5_500n, "kWh", 450_000n,
      "IEA-2026 v1", "GHGP S3C1", evidence("assembly.csv"), "1.0.0");
    // stage 10: 2 kg recycled x -1,500 g/kg = -3,000 g (credit)
    await events.connect(recycler).recordEvent(
      PRODUCT_ID, 10, 2_000n, "kg", -1_500_000n,
      "recycling-LCA v2", "GHGP S3C12", evidence("recycle.pdf"), "1.0.0");

    return { participants, events, token, aggregator, admin, smelter, oem, recycler };
  }

  it("rolls up the product total deterministically (credits subtract)", async () => {
    const { aggregator } = await loadFixture(deploy);
    // 96,000 + 2,475 - 3,000
    expect(await aggregator.productTotal(PRODUCT_ID)).to.equal(95_475n);
  });

  it("reports per-stage sub-totals", async () => {
    const { aggregator } = await loadFixture(deploy);
    expect(await aggregator.stageTotal(PRODUCT_ID, 1)).to.equal(96_000n);
    expect(await aggregator.stageTotal(PRODUCT_ID, 5)).to.equal(2_475n);
    expect(await aggregator.stageTotal(PRODUCT_ID, 10)).to.equal(-3_000n);
    expect(await aggregator.stageTotal(PRODUCT_ID, 7)).to.equal(0n); // no events
  });

  it("sums multiple events within one stage", async () => {
    const { aggregator, events, oem } = await loadFixture(deploy);
    await events.connect(oem).recordEvent(
      PRODUCT_ID, 5, 1_000n, "kWh", 450_000n, "IEA-2026 v1", "GHGP S3C1",
      ethers.keccak256(ethers.toUtf8Bytes("assembly2.csv")), "1.0.0");
    expect(await aggregator.stageTotal(PRODUCT_ID, 5)).to.equal(2_925n);
    expect(await aggregator.productTotal(PRODUCT_ID)).to.equal(95_925n);
  });

  it("flags missing stages (completeness check for Study B)", async () => {
    const { aggregator } = await loadFixture(deploy);
    const present = await aggregator.stagesPresent(PRODUCT_ID);
    expect(present[0]).to.equal(true);  // stage 1
    expect(present[4]).to.equal(true);  // stage 5
    expect(present[9]).to.equal(true);  // stage 10
    expect(present[1]).to.equal(false); // stage 2 missing
    expect(await aggregator.isComplete(PRODUCT_ID)).to.equal(false);
  });

  it("returns zero for a product with no events", async () => {
    const { aggregator, events, oem } = await loadFixture(deploy);
    await events.connect(oem).createProduct(7n, "empty product");
    expect(await aggregator.productTotal(7n)).to.equal(0n);
  });

  describe("cross-check between event registry and token supply", () => {
    it("is consistent when tokens mirror the events", async () => {
      const { aggregator, token, admin, oem } = await loadFixture(deploy);
      await token.mintPassport(PRODUCT_ID, oem.address);
      await token.mintCarbon(PRODUCT_ID, oem.address, 96_000n); // stage 1
      await token.mintCarbon(PRODUCT_ID, oem.address, 2_475n);  // stage 5
      await token.burnCarbon(PRODUCT_ID, oem.address, 3_000n);  // stage 10 credit

      const [eventTotal, tokenNet, consistent] = await aggregator.crossCheck(PRODUCT_ID);
      expect(eventTotal).to.equal(95_475n);
      expect(tokenNet).to.equal(95_475n);
      expect(consistent).to.equal(true);
    });

    it("flags a reconciliation error instead of silently passing", async () => {
      const { aggregator, token, oem } = await loadFixture(deploy);
      await token.mintPassport(PRODUCT_ID, oem.address);
      // Tokens deliberately do NOT match the events (short by stage 10 burn).
      await token.mintCarbon(PRODUCT_ID, oem.address, 96_000n);

      const [eventTotal, tokenNet, consistent] = await aggregator.crossCheck(PRODUCT_ID);
      expect(eventTotal).to.equal(95_475n);
      expect(tokenNet).to.equal(96_000n);
      expect(consistent).to.equal(false);
    });
  });
});
