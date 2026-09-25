import { Interface, keccak256, toUtf8Bytes } from "ethers";
import { multisigForControl } from "../../services/controlContracts";
import { CONTRACT_ADDRESSES } from "../../services/contractAddresses";

const GOVERNANCE_CORRECTION_ABI = [
  "function correctEvent(uint256 productId, uint256 originalIndex, uint256 correctedActivityData, int256 correctedEmissionFactor, string reason, bytes32 evidenceHash) returns (uint256)",
];

export async function submitCorrection(
  productId: string,
  eventIndex: string,
  activityData: number,
  emissionFactor: number,
  reason: string,
  eventOwner: string,
) {
  const evidenceHash = keccak256(toUtf8Bytes(JSON.stringify({ productId, eventIndex, activityData, emissionFactor, reason })));
  const iface = new Interface(GOVERNANCE_CORRECTION_ABI);
  const data = iface.encodeFunctionData("correctEvent", [
    productId,
    eventIndex,
    BigInt(Math.round(activityData * 1000)),
    BigInt(Math.round(emissionFactor * 1000)),
    reason,
    evidenceHash,
  ]);
  const multisig = multisigForControl();
  const transaction = await multisig["submit(address,bytes,address)"](CONTRACT_ADDRESSES.governanceModule, data, eventOwner);
  await transaction.wait();
}
