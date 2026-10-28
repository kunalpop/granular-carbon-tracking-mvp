import type { EncryptionEnvelope } from "./types";

// Encrypts a document with AES-GCM and returns its ciphertext and decryption envelope.
export async function encryptDocument(file: Blob): Promise<EncryptionEnvelope> {
  /*
   * Perform the encryptDocument operation and handle its input, output, or errors.
   */
  /* Generate encryption material and encrypt the complete document in memory. */
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = await file.arrayBuffer();
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv.slice() }, key, plaintext);

  return {
    ciphertext: new Blob([ciphertext], { type: "application/octet-stream" }),
    algorithm: "AES-GCM",
    keyLength: 256,
    iv: bytesToBase64(iv),
    key: await crypto.subtle.exportKey("jwk", key),
  };
}

// Converts binary IV bytes into Base64 text for JSON storage.
function bytesToBase64(bytes: Uint8Array): string {
  /*
   * Perform the bytesToBase64 operation and handle its input, output, or errors.
   */
  /* Encode the byte sequence so it can be serialized safely as JSON. */
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}
