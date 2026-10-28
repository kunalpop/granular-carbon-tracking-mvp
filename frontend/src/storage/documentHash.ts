// Calculates the SHA-256 hash of document contents.
export async function calculateDocumentHash(blob: Blob): Promise<string> {
  /*
   * Perform the calculateDocumentHash operation and handle its input, output, or errors.
   */
  /* Hash the full file and format the digest as an Ethereum-compatible hex string. */
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return `0x${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
