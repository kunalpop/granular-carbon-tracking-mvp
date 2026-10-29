import { keccak256 } from "ethers";
import {
  getConsortiumMultisigContract,
  getEmissionEventRegistryContract,
  getGovernanceModuleContract,
} from "../hooks/useContracts";
import { getSelectedRole, getSigner } from "./getSigner";

export const EVENT_REGISTRY_ABI = [
  "function eventCount(uint256 productId) view returns (uint256)",
  "function eventAt(uint256 productId, uint256 index) view returns (tuple(uint256 productId, uint8 stageId, address actor, uint256 activityData, string activityUnit, int256 emissionFactor, string efSource, int256 co2eGrams, string methodology, bytes32 evidenceHash, bytes32 prevEventHash, uint64 timestamp, string schemaVersion, bytes32 eventHash))",
  "function auditStatus(uint256 productId, uint256 eventIndex) view returns (uint8)",
  "function setAuditStatus(uint256 productId, uint256 eventIndex, uint8 status)",
  "function recordEvent(uint256 productId, uint8 stageId, uint256 activityData, string activityUnit, int256 emissionFactor, string efSource, string methodology, bytes32 evidenceHash, string schemaVersion)",
];

export const GOVERNANCE_ABI = [
  "function discardedCorrectionTask(uint256 productId, uint256 eventIndex) view returns (bool)",
  "function discardCorrectionTask(uint256 productId, uint256 eventIndex)",
  "function correctEvent(uint256 productId, uint256 originalIndex, uint256 correctedActivityData, int256 correctedEmissionFactor, string reason, bytes32 evidenceHash) returns (uint256)",
  "function correctionCount() view returns (uint256)",
  "function correctionAt(uint256 correctionId) view returns (tuple(uint256 productId, uint256 originalIndex, bytes32 originalEventHash, uint256 correctedActivityData, int256 correctedEmissionFactor, int256 correctedCo2eGrams, string reason, bytes32 evidenceHash, address correctedBy, uint64 timestamp, uint256 supersedesCorrectionId))",
  "function latestCorrectionId(uint256 productId, uint256 eventIndex) view returns (uint256)",
  "function effectiveCo2e(uint256 productId, uint256 eventIndex) view returns (int256)",
  "function stageThresholdGrams(uint8 stageId) view returns (uint256)",
  "function setStageThreshold(uint8 stageId, uint256 maxAbsGrams)",
  "function screenProduct(uint256 productId) returns (uint256)",
  "function raiseEscalation(uint256 productId, uint256 eventIndex, string reason, bytes32 evidenceHash)",
  "function escalationCount() view returns (uint256)",
  "function escalationResolved(uint256 index) view returns (bool)",
  "function escalationResolvedAt(uint256 index) view returns (uint64)",
  "function resolveEscalation(uint256 index)",
  "function escalationAt(uint256 index) view returns (tuple(uint256 productId, uint256 eventIndex, int256 co2eGrams, uint256 thresholdGrams, string reason, bytes32 evidenceHash, address raisedBy, uint64 timestamp))",
];

export const MULTISIG_ABI = [
  "function required() view returns (uint256)",
  "function ownerCount() view returns (uint256)",
  "function isOwner(address) view returns (bool)",
  "function deployerOwner() view returns (address)",
  "function auditorOwner() view returns (address)",
  "function submit(address target, bytes data) returns (uint256)",
  "function submit(address target, bytes data, address eventOwner) returns (uint256)",
  "function vote(uint256 txId, uint8 decision)",
  "function confirm(uint256 txId)",
  "function reject(uint256 txId)",
  "function execute(uint256 txId)",
  "function transactionCount() view returns (uint256)",
  "function transactionAt(uint256 txId) view returns (tuple(address target, bytes data, bool executed, uint256 voteCount, uint8 status, address eventOwner))",
  "function voteStatus(uint256 txId, address owner) view returns (uint8)",
  "function owners(uint256 index) view returns (address)",
];

export function controlSigner() {
  return getSigner(getSelectedRole());
}

export function eventRegistryForControl() {
  return getEmissionEventRegistryContract(EVENT_REGISTRY_ABI, controlSigner());
}

export function governanceForControl() {
  return getGovernanceModuleContract(GOVERNANCE_ABI, controlSigner());
}

export async function loadStageThresholdsFromChain(stageIds: number[]) {
  const governance = governanceForControl();
  const entries = await Promise.all(stageIds.map(async (stageId) => [
    stageId,
    Number(await governance.stageThresholdGrams(stageId)) / 1000,
  ] as const));
  return Object.fromEntries(entries) as Record<number, number>;
}

export async function loadStageThresholdsFromChainOrIpfs(stageIds: number[]) {
  const onChain = await loadStageThresholdsFromChain(stageIds);
  if (stageIds.every((stageId) => onChain[stageId] > 0)) return onChain;
  try {
    const response = await fetch(`/api/documents/by-name/thresholds.json/plain?fresh=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return onChain;
    const file = await response.json() as unknown;
    const entries = Array.isArray(file)
      ? file
      : file && typeof file === "object" && "thresholds" in file && Array.isArray(file.thresholds)
        ? file.thresholds
        : file && typeof file === "object" && "stages" in file && Array.isArray(file.stages)
          ? file.stages
          : [];
    const fileThresholds = Object.fromEntries(entries.map((item) => {
      const value = item as { stageId?: number; threshold?: number; thresholdKg?: number };
      return [value.stageId, Number(value.threshold ?? value.thresholdKg ?? 0)];
    }));
    return Object.fromEntries(stageIds.map((stageId) => [stageId, onChain[stageId] > 0 ? onChain[stageId] : Number(fileThresholds[String(stageId)] ?? 0)]));
  } catch {
    return onChain;
  }
}

export async function loadStageThresholdUnitsFromIpfs(stageIds: number[]) {
  const units: Record<number, string> = {};
  try {
    const response = await fetch(`/api/documents/by-name/thresholds.json/plain?fresh=${Date.now()}`, { cache: "no-store" });
    const file = await response.json() as unknown;
    const entries = Array.isArray(file) ? file : [];
    for (const item of entries as Array<{ stageId?: number; unit?: string }>) {
      if (item.stageId !== undefined && item.unit) units[item.stageId] = item.unit;
    }
  } catch {
    // On-chain thresholds do not include a unit field.
  }
  return Object.fromEntries(stageIds.map((stageId) => [stageId, units[stageId] ?? "KgCO2e"]));
}

export function multisigForControl() {
  return getConsortiumMultisigContract(MULTISIG_ABI, controlSigner());
}

export async function hashEvidence(file?: File) {
  if (!file) return "0x" + "0".repeat(64);
  return keccak256(new Uint8Array(await file.arrayBuffer()));
}

export function formatAddress(address?: string) {
  if (!address || typeof address !== "string") return "Unknown address";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatGrams(value: bigint | number | string) {
  return `${Number(value).toLocaleString()} g`;
}
