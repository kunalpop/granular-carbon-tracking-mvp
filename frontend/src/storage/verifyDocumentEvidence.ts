import type { DocumentProof } from "./types";
import { verifyDocument } from "./verifyDocument";

// Verifies both the original and encrypted document evidence hashes.
export async function verifyDocumentEvidence(originalFile: Blob, encryptedFile: Blob, proof: DocumentProof): Promise<boolean> {
  /*
   * Perform the verifyDocumentEvidence operation and handle its input, output, or errors.
   */
  /* Check each file independently against the hash recorded in the document proof. */
  return (await verifyDocument(originalFile, proof.originalHash))
    && (await verifyDocument(encryptedFile, proof.encryptedHash));
}
