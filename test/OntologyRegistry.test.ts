import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";


describe("OntologyRegistry", () => {
  async function deploy() {
    const [admin, stranger] = await ethers.getSigners();
    const ontology = await ethers.deployContract("OntologyRegistry", [admin.address]);
    const hash = (s: string) => ethers.keccak256(ethers.toUtf8Bytes(s));
    return { ontology, admin, stranger, hash };
  }

  it("registers a schema version and makes it current", async () => {
    const { ontology, hash } = await loadFixture(deploy);
    await expect(ontology.registerSchema("1.0.0", hash("schema-v1 doc"), "docs/schema-1.0.0.json"))
      .to.emit(ontology, "SchemaRegistered")
      .withArgs("1.0.0", hash("schema-v1 doc"), "docs/schema-1.0.0.json");

    expect(await ontology.currentVersion()).to.equal("1.0.0");
    expect(await ontology.isKnownVersion("1.0.0")).to.equal(true);
    expect(await ontology.isActiveVersion("1.0.0")).to.equal(true);
    const s = await ontology.getSchema("1.0.0");
    expect(s.schemaHash).to.equal(hash("schema-v1 doc"));
  });

  it("a version can never be silently redefined", async () => {
    const { ontology, hash } = await loadFixture(deploy);
    await ontology.registerSchema("1.0.0", hash("original"), "u");
    await expect(
      ontology.registerSchema("1.0.0", hash("quietly changed"), "u")
    ).to.be.revertedWithCustomError(ontology, "VersionAlreadyRegistered");
  });

  it("only the ontology admin can register or deprecate", async () => {
    const { ontology, stranger, hash } = await loadFixture(deploy);
    await expect(
      ontology.connect(stranger).registerSchema("9.9.9", hash("x"), "u")
    ).to.be.revertedWithCustomError(ontology, "AccessControlUnauthorizedAccount");
  });

  it("a new version supersedes as current; history stays queryable", async () => {
    const { ontology, hash } = await loadFixture(deploy);
    await ontology.registerSchema("1.0.0", hash("v1"), "u1");
    await expect(ontology.registerSchema("1.1.0", hash("v2"), "u2"))
      .to.emit(ontology, "CurrentVersionChanged")
      .withArgs("1.0.0", "1.1.0");

    expect(await ontology.currentVersion()).to.equal("1.1.0");
    expect(await ontology.versionCount()).to.equal(2n);
    expect(await ontology.versionAt(0)).to.equal("1.0.0"); // history intact
  });

  it("deprecation flags a version without erasing it", async () => {
    const { ontology, hash } = await loadFixture(deploy);
    await ontology.registerSchema("1.0.0", hash("v1"), "u1");
    await expect(ontology.deprecateSchema("1.0.0"))
      .to.emit(ontology, "SchemaDeprecated")
      .withArgs("1.0.0");

    expect(await ontology.isKnownVersion("1.0.0")).to.equal(true);  // still on record
    expect(await ontology.isActiveVersion("1.0.0")).to.equal(false); // but not for new events
  });

  it("rejects empty and unknown versions", async () => {
    const { ontology, hash } = await loadFixture(deploy);
    await expect(ontology.registerSchema("", hash("x"), "u"))
      .to.be.revertedWithCustomError(ontology, "EmptyVersion");
    await expect(ontology.deprecateSchema("0.0.1"))
      .to.be.revertedWithCustomError(ontology, "UnknownVersion");
    await expect(ontology.getSchema("0.0.1"))
      .to.be.revertedWithCustomError(ontology, "UnknownVersion");
  });
});
