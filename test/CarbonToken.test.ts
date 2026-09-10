import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";


const PRODUCT_ID = 1n;
const CARBON_OFFSET = 1n << 128n;

describe("CarbonToken", () => {
  async function deploy() {
    const [admin, holder, stranger] = await ethers.getSigners();
    const token = await ethers.deployContract("CarbonToken", [admin.address]);
    return { token, admin, holder, stranger };
  }

  describe("token id scheme", () => {
    it("separates passport and carbon id spaces", async () => {
      const { token } = await loadFixture(deploy);
      expect(await token.passportId(PRODUCT_ID)).to.equal(PRODUCT_ID);
      expect(await token.carbonId(PRODUCT_ID)).to.equal(PRODUCT_ID + CARBON_OFFSET);
    });

    it("rejects product ids that would collide with the carbon space", async () => {
      const { token } = await loadFixture(deploy);
      await expect(token.passportId(CARBON_OFFSET)).to.be.revertedWithCustomError(
        token, "ProductIdTooLarge"
      );
    });
  });

  describe("passport (non-fungible)", () => {
    it("mints exactly one passport per product, ever", async () => {
      const { token, holder } = await loadFixture(deploy);
      await expect(token.mintPassport(PRODUCT_ID, holder.address))
        .to.emit(token, "PassportMinted")
        .withArgs(PRODUCT_ID, holder.address);

      expect(await token.balanceOf(holder.address, PRODUCT_ID)).to.equal(1n);
      expect(await token.passportExists(PRODUCT_ID)).to.equal(true);

      await expect(
        token.mintPassport(PRODUCT_ID, holder.address)
      ).to.be.revertedWithCustomError(token, "PassportAlreadyMinted");
    });

    it("only a minter may mint", async () => {
      const { token, holder, stranger } = await loadFixture(deploy);
      await expect(
        token.connect(stranger).mintPassport(PRODUCT_ID, holder.address)
      ).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    });
  });

  describe("carbon quantity (fungible, grams CO2e)", () => {
    it("refuses to mint carbon for a product without a passport", async () => {
      const { token, holder } = await loadFixture(deploy);
      await expect(
        token.mintCarbon(PRODUCT_ID, holder.address, 96_000n)
      ).to.be.revertedWithCustomError(token, "NoPassport");
    });

    it("mints per-stage carbon and tracks cumulative totals", async () => {
      const { token, holder } = await loadFixture(deploy);
      await token.mintPassport(PRODUCT_ID, holder.address);
      await token.mintCarbon(PRODUCT_ID, holder.address, 96_000n); // stage 1
      await token.mintCarbon(PRODUCT_ID, holder.address, 2_475n);  // stage 5

      const carbonId = PRODUCT_ID + CARBON_OFFSET;
      expect(await token.balanceOf(holder.address, carbonId)).to.equal(98_475n);
      expect(await token["totalSupply(uint256)"](carbonId)).to.equal(98_475n);
      expect(await token.carbonMinted(PRODUCT_ID)).to.equal(98_475n);
      expect(await token.netCarbon(PRODUCT_ID)).to.equal(98_475n);
    });

    it("burns carbon for end-of-life credits and nets correctly", async () => {
      const { token, holder } = await loadFixture(deploy);
      await token.mintPassport(PRODUCT_ID, holder.address);
      await token.mintCarbon(PRODUCT_ID, holder.address, 98_475n);
      await expect(token.burnCarbon(PRODUCT_ID, holder.address, 3_000n))
        .to.emit(token, "CarbonBurned")
        .withArgs(PRODUCT_ID, holder.address, 3_000n);

      expect(await token.netCarbon(PRODUCT_ID)).to.equal(95_475n);
      expect(await token.carbonBurned(PRODUCT_ID)).to.equal(3_000n);
      expect(
        await token.balanceOf(holder.address, PRODUCT_ID + CARBON_OFFSET)
      ).to.equal(95_475n);
    });

    it("keeps carbon attribution separate per product", async () => {
      const { token, holder } = await loadFixture(deploy);
      await token.mintPassport(1n, holder.address);
      await token.mintPassport(2n, holder.address);
      await token.mintCarbon(1n, holder.address, 100n);
      await token.mintCarbon(2n, holder.address, 999n);
      expect(await token.netCarbon(1n)).to.equal(100n);
      expect(await token.netCarbon(2n)).to.equal(999n);
    });
  });
});
