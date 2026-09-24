import { getSigner } from "../../services/getSigner";
import {
  getCarbonTokenContract,
  getEmissionEventRegistryContract,
} from "../../hooks/useContracts";

const EMISSION_EVENT_REGISTRY_ABI = [
  "function productExists(uint256 productId) view returns (bool)",
  "function createProduct(uint256 productId, string description)",
];

const CARBON_TOKEN_ABI = [
  "function mintPassport(uint256 productId, address to)",
  "function passportExists(uint256 productId) view returns (bool)",
];

export type RegisteredProduct = {
  productId: bigint;
  description: string;
  oemAddress: string;
};

const ADMIN = "deployer";

export async function isProductRegistered(productId: bigint): Promise<boolean> {
  const signer = getSigner(ADMIN);
  const events = getEmissionEventRegistryContract(
    EMISSION_EVENT_REGISTRY_ABI,
    signer,
  );
  const token = getCarbonTokenContract(CARBON_TOKEN_ABI, signer);

  return Boolean(
    (await events.productExists(productId)) &&
      (await token.passportExists(productId)),
  );
}

export async function registerProduct(description: string, oemAddress: string): Promise<RegisteredProduct> {
  const adminSigner = getSigner(ADMIN);
  const events = getEmissionEventRegistryContract(
    EMISSION_EVENT_REGISTRY_ABI,
    adminSigner,
  );
  const token = getCarbonTokenContract(CARBON_TOKEN_ABI, adminSigner);

  let productId = 1n;
  while (await events.productExists(productId)) productId++;

  const oem = getSigner("oem");

  const oemEvents = events.connect(oem) as typeof events & {
    createProduct(
      productId: bigint,
      description: string,
    ): Promise<{ wait(): Promise<unknown> }>;
  };
  await (await oemEvents.createProduct(productId, description)).wait();
  await (await token.mintPassport(productId, oemAddress)).wait();

  console.log(
    `Passport NFT minted for product ${productId} to OEM (${oemAddress})`,
  );
  return { productId, description, oemAddress: oem.address };
}
