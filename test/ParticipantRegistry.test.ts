import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";


describe("ParticipantRegistry", () => {
  async function deploy() {
    const [admin, smelter, oem, stranger] = await ethers.getSigners();
    const registry = await ethers.deployContract("ParticipantRegistry", [admin.address]);
    return { registry, admin, smelter, oem, stranger };
  }

  it("registers a participant with name and role", async () => {
    const { registry, smelter } = await loadFixture(deploy);
    await expect(registry.registerParticipant(smelter.address, "AluCo Smelter", "smelter"))
      .to.emit(registry, "ParticipantRegistered")
      .withArgs(smelter.address, "AluCo Smelter", "smelter");

    const p = await registry.getParticipant(smelter.address);
    expect(p.name).to.equal("AluCo Smelter");
    expect(p.organisationRole).to.equal("smelter");
    expect(p.active).to.equal(true);
    expect(await registry.isRegistered(smelter.address)).to.equal(true);
  });

  it("refuses registration from a non-admin", async () => {
    const { registry, smelter, stranger } = await loadFixture(deploy);
    await expect(
      registry.connect(stranger).registerParticipant(smelter.address, "X", "smelter")
    ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
  });

  it("refuses to register the same account twice", async () => {
    const { registry, smelter } = await loadFixture(deploy);
    await registry.registerParticipant(smelter.address, "AluCo", "smelter");
    await expect(
      registry.registerParticipant(smelter.address, "AluCo again", "smelter")
    ).to.be.revertedWithCustomError(registry, "AlreadyRegistered");
  });

  it("authorises and gates stage writing", async () => {
    const { registry, smelter } = await loadFixture(deploy);
    await registry.registerParticipant(smelter.address, "AluCo", "smelter");

    expect(await registry.canWriteStage(smelter.address, 1)).to.equal(false);
    await expect(registry.authoriseStage(smelter.address, 1))
      .to.emit(registry, "StageAuthorised")
      .withArgs(smelter.address, 1);
    expect(await registry.canWriteStage(smelter.address, 1)).to.equal(true);
    // authorised for stage 1 only, not stage 2
    expect(await registry.canWriteStage(smelter.address, 2)).to.equal(false);
  });

  it("rejects out-of-range stages and unknown accounts", async () => {
    const { registry, smelter, stranger } = await loadFixture(deploy);
    await registry.registerParticipant(smelter.address, "AluCo", "smelter");
    await expect(registry.authoriseStage(smelter.address, 0))
      .to.be.revertedWithCustomError(registry, "InvalidStage");
    await expect(registry.authoriseStage(smelter.address, 11))
      .to.be.revertedWithCustomError(registry, "InvalidStage");
    await expect(registry.authoriseStage(stranger.address, 1))
      .to.be.revertedWithCustomError(registry, "NotRegistered");
  });

  it("deactivation suspends all permissions; reactivation restores them", async () => {
    const { registry, smelter } = await loadFixture(deploy);
    await registry.registerParticipant(smelter.address, "AluCo", "smelter");
    await registry.authoriseStage(smelter.address, 1);

    await registry.deactivateParticipant(smelter.address);
    expect(await registry.isRegistered(smelter.address)).to.equal(false);
    expect(await registry.canWriteStage(smelter.address, 1)).to.equal(false);

    await registry.reactivateParticipant(smelter.address);
    expect(await registry.canWriteStage(smelter.address, 1)).to.equal(true);
  });

  it("revokes a single stage without deactivating the participant", async () => {
    const { registry, oem } = await loadFixture(deploy);
    await registry.registerParticipant(oem.address, "OEM", "oem");
    await registry.authoriseStage(oem.address, 5);
    await registry.authoriseStage(oem.address, 6);

    await registry.revokeStage(oem.address, 6);
    expect(await registry.canWriteStage(oem.address, 5)).to.equal(true);
    expect(await registry.canWriteStage(oem.address, 6)).to.equal(false);
    expect(await registry.isRegistered(oem.address)).to.equal(true);
  });
});
