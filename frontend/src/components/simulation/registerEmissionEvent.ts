import { keccak256, toUtf8Bytes } from "ethers";
import {
  getCarbonTokenContract,
  getEmissionEventRegistryContract,
} from "../../hooks/useContracts";
import { getSigner, type AccountRole } from "../../services/getSigner";
import type { Stage } from "../../services/getTypes";

// Cache key used to find the product created on the Product page.
const PRODUCT_CACHE_KEY = "registered-product-cache";
// Administrator role used to update the carbon-token mirror.
const ADMIN = "deployer" as AccountRole;

// ABI methods required to submit and retrieve an emission event.
const EMISSION_EVENT_REGISTRY_ABI = [
  "function recordEvent(uint256 productId, uint8 stageId, uint256 activityData, string activityUnit, int256 emissionFactor, string efSource, string methodology, bytes32 evidenceHash, string schemaVersion)",
  "function eventCount(uint256 productId) view returns (uint256)",
  "function eventAt(uint256 productId, uint256 index) view returns (tuple(uint256 productId, uint8 stageId, address actor, uint256 activityData, string activityUnit, int256 emissionFactor, string efSource, int256 co2eGrams, string methodology, bytes32 evidenceHash, bytes32 prevEventHash, uint64 timestamp, string schemaVersion, bytes32 eventHash))",
];

// ABI methods required to mirror emissions as carbon tokens.
const CARBON_TOKEN_ABI = [
  "function mintCarbon(uint256 productId, address to, uint256 amount)",
  "function burnCarbon(uint256 productId, address from, uint256 amount)",
];

// Read the registered product ID from local storage.
function getProductId(): bigint {
  const cached = window.localStorage.getItem(PRODUCT_CACHE_KEY);
  if (!cached) throw new Error("Register a product before recording events.");

  const saved = JSON.parse(cached) as { productId?: string };
  if (!saved.productId) throw new Error("Registered product ID is missing.");
  return BigInt(saved.productId);
}

// Record one lifecycle emission event and mirror its CO2e value on-chain.
export async function registerEmissionEvent(stage: Stage, schemaVersion: string) {
  // Load the product and select the participant responsible for this stage.
  const productId = getProductId();
  const actor = getSigner(stage.actorRole as AccountRole);
  const admin = getSigner(ADMIN);
  const events = getEmissionEventRegistryContract(
    EMISSION_EVENT_REGISTRY_ABI,
    actor,
  );
  const token = getCarbonTokenContract(CARBON_TOKEN_ABI, admin);

  // Convert decimal values to the contract's fixed-point x1000 representation.
  const activityData = BigInt(Math.round(stage.activityValue * 1000));
  const emissionFactor = BigInt(
    Math.round(stage.emissionFactor_gCO2ePerUnit * 1000),
  );

  // Hash the event evidence so its integrity can be verified later.
  const evidenceHash = keccak256(
    toUtf8Bytes(
      JSON.stringify({
        productId: productId.toString(),
        stageId: stage.stageId,
        stage: stage.name,
        activity: `${stage.activityValue} ${stage.activityUnit}`,
      }),
    ),
  );

  // Submit the event using the stage participant's wallet.
  await (
    await events.recordEvent(
      productId,
      stage.stageId,
      activityData,
      stage.activityUnit,
      emissionFactor,
      stage.efSource,
      stage.methodology,
      evidenceHash,
      schemaVersion,
    )
  ).wait();

  // Retrieve the newly recorded event and its on-chain CO2e calculation.
  const index = (await events.eventCount(productId)) - 1n;
  const record = await events.eventAt(productId, index);
  const passportHolder = getSigner("oem").address;

  // Mint emissions or burn credits to keep the carbon-token mirror consistent.
  if (record.co2eGrams > 0n) {
    await (await token.mintCarbon(productId, passportHolder, record.co2eGrams)).wait();
  } else if (record.co2eGrams < 0n) {
    await (await token.burnCarbon(productId, passportHolder, -record.co2eGrams)).wait();
  }

  // Return display-ready values for the simulation card.
  return {
    co2eKg: Number(record.co2eGrams) / 1000,
    emissionFactor: Number(record.emissionFactor) / 1000,
    eventHash: record.eventHash,
  };
}
