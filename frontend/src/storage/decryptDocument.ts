import type { EncryptionEnvelope } from "./types";

// Decrypts document ciphertext using the stored AES-GCM key and IV.
export async function decryptDocument(encrypted: Blob, encryption: EncryptionEnvelope): Promise<Blob> {
  /*
   * Validate the encryption algorithm and restore the Web Crypto key and IV
   * before decrypting the encrypted file contents.
   */
  if (encryption.algorithm !== "AES-GCM") throw new Error("Unsupported encryption algorithm.");
  const key = await crypto.subtle.importKey(
    "jwk",
    encryption.key,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
  const iv = base64ToBytes(encryption.iv);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv.slice() }, key, await encrypted.arrayBuffer());
  return new Blob([plaintext]);
}

// Converts an encrypted IV stored as Base64 text back into bytes.
function base64ToBytes(value: string): Uint8Array {
  /*
   * Perform the base64ToBytes operation and handle its input, output, or errors.
   */
  /* Decode the text representation and map each character to its byte value. */
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
