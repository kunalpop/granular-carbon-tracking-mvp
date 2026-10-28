import type { IPFSUpload } from "./types";

const IPFS_API_URL = (import.meta.env.VITE_IPFS_API_URL as string | undefined)?.replace(/\/$/, "") ?? "http://127.0.0.1:5001";

// Uploads encrypted bytes to a compatible IPFS API and returns its CID.
export async function uploadToIPFS(encrypted: Blob, fileName: string): Promise<IPFSUpload> {
  /*
   * Perform the uploadToIPFS operation and handle its input, output, or errors.
   */
  const form = new FormData();
  form.append("file", encrypted, fileName);
  const response = await fetch(`${IPFS_API_URL}/api/v0/add?pin=false`, {
    method: "POST",
    body: form,
    headers: ipfsAuthHeaders(),
  });

// Builds optional authorization headers for the local IPFS API.
function ipfsAuthHeaders(): HeadersInit {
  /*
   * Perform the ipfsAuthHeaders operation and handle its input, output, or errors.
   */
  const token = (import.meta.env.VITE_IPFS_API_TOKEN as string | undefined)?.trim();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
  if (!response.ok) throw new Error(`IPFS upload failed: ${response.status} ${response.statusText}`);
  const result = (await response.text()).trim().split("\n").map((line) => JSON.parse(line)).at(-1) as { Hash: string; Size: string };
  if (!result?.Hash) throw new Error("IPFS upload returned no CID.");
  return { cid: result.Hash, size: Number(result.Size) };
}
