import { Contract, getBytes, Interface, keccak256, toUtf8Bytes } from "ethers";
import type { DocumentProof } from "./types";

// Records document proof values on the configured blockchain contract.
export async function recordDocumentProof(proof: DocumentProof): Promise<string | undefined> {
  /*
   * Perform the recordDocumentProof operation and handle its input, output, or errors.
   */
  /* Resolve optional registry configuration before preparing the blockchain transaction. */
  const address = (import.meta.env.VITE_DOCUMENT_PROOF_REGISTRY_ADDRESS as string | undefined)?.trim();
  if (!address) return undefined;

  const { getSigner } = await import("../services/getSigner");
  const abi = new Interface([
    "function recordDocumentProof(bytes32 documentId, string participantId, string cid, bytes32 originalHash, bytes32 encryptedHash, string metadataURI)",
  ]);
  /* Submit the normalized proof fields with the configured registry contract. */
  const signer = getSigner("deployer");
  const contract = new Contract(address, abi, signer) as Contract & {
    recordDocumentProof(...args: unknown[]): Promise<{ wait(): Promise<unknown>; hash: string }>;
  };
  const metadataURI = typeof proof.metadata.ipfsMetadataUri === "string" ? proof.metadata.ipfsMetadataUri : "";
  const transaction = await contract.recordDocumentProof(
    keccak256(toUtf8Bytes(proof.documentId)),
    proof.participantId,
    proof.cid,
    getBytes(proof.originalHash),
    getBytes(proof.encryptedHash),
    metadataURI,
  );
  await transaction.wait();
  return transaction.hash;
}
