import { getSigner } from "../../services/getSigner";
import {
  getCarbonTokenContract,
  getEmissionEventRegistryContract,
} from "../../hooks/useContracts";

const EMISSION_EVENT_REGISTRY_ABI = [
  "function createProduct(uint256 productId, string description)",
];
const CARBON_TOKEN_ABI = [
  "function mintPassport(uint256 productId, address to)",
];

export type MintedProduct = {
  productId: bigint;
  description: string;
  oemAddress: string;
};

/** Creates the product as OEM and mints its passport on behalf of the OEM. */
export async function mintProduct(
  productId: bigint,
  description: string,
  oemAddress: string,
): Promise<MintedProduct> {
  const oem = getSigner("oem");
  const events = getEmissionEventRegistryContract(
    EMISSION_EVENT_REGISTRY_ABI,
    oem,
  );
  await (await events.createProduct(productId, description)).wait();

  const token = getCarbonTokenContract(CARBON_TOKEN_ABI, getSigner("deployer"));
  await (await token.mintPassport(productId, oemAddress)).wait();

  console.log(
    `Passport NFT minted for product ${productId} to OEM (${oemAddress})`,
  );
  return { productId, description, oemAddress: oem.address };
}
