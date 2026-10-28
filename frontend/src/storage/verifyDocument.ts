import { calculateDocumentHash } from "./documentHash";

// Compares a document hash with an expected stored hash.
export async function verifyDocument(file: Blob, expectedHash: string): Promise<boolean> {
  /*
   * Perform the verifyDocument operation and handle its input, output, or errors.
   */
  /* Reject missing hashes, then compare normalized hexadecimal values. */
  if (!expectedHash.trim()) return false;
  return (await calculateDocumentHash(file)).toLowerCase() === expectedHash.toLowerCase();
}
