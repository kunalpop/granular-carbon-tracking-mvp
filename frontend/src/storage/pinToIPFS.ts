const IPFS_API_URL = (import.meta.env.VITE_IPFS_API_URL as string | undefined)?.replace(/\/$/, "") ?? "http://127.0.0.1:5001";

// Pins an uploaded IPFS CID using the configured IPFS API.
export async function pinToIPFS(cid: string): Promise<void> {
  /*
   * Perform the pinToIPFS operation and handle its input, output, or errors.
   */
  if (!cid.trim()) throw new Error("CID is required.");
  const token = (import.meta.env.VITE_IPFS_API_TOKEN as string | undefined)?.trim();
  const response = await fetch(`${IPFS_API_URL}/api/v0/pin/add?arg=${encodeURIComponent(cid)}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error(`IPFS pin failed: ${response.status} ${response.statusText}`);
}
