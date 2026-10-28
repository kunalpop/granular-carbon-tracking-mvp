import { calculateDocumentHash } from "./documentHash";
import { encryptDocument } from "./encryptDocument";
import { recordDocumentProof } from "./recordDocumentProof";
import type { DocumentMetadata, DocumentProof, UploadedDocument } from "./types";

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const ALLOWED_FILE_TYPES = new Set([
  "application/pdf",
  "text/csv",
  "text/plain",
  "image/jpeg",
  "image/png",
  "application/json",
]);

// Generates a unique identifier for a document.
export function generateDocumentId(): string {
  /*
   * Perform the generateDocumentId operation and handle its input, output, or errors.
   */
  /* Prefer the browser UUID implementation and fall back to a timestamp-based ID. */
  return crypto.randomUUID?.() ?? `${Date.now()}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(16)}`;
}

// Validates, encrypts, uploads, and records a document in the storage workflow.
export async function uploadDocument(file: File, participantId: string, metadata: DocumentMetadata = {}): Promise<UploadedDocument> {
  /*
   * Perform the uploadDocument operation and handle its input, output, or errors.
   */
  /* Validate the file and participant before starting encryption or network operations. */
  if (!ALLOWED_FILE_TYPES.has(file.type)) throw new Error(`Unsupported file type: ${file.type || "unknown"}`);
  if (file.size <= 0) throw new Error("File must not be empty.");
  if (file.size > MAX_FILE_SIZE_BYTES) throw new Error("File exceeds the maximum allowed size of 25 MB.");
  if (!participantId.trim()) throw new Error("Participant ID is required.");

  /* Create identifiers and hashes so the original and encrypted versions are traceable. */
  const documentId = generateDocumentId();
  const originalHash = await calculateDocumentHash(file);
  const encryption = await encryptDocument(file); // Encryption must happen before leaving the browser.
  const encryptedHash = await calculateDocumentHash(encryption.ciphertext);

  /* Package the encrypted document and all metadata for the secure backend upload endpoint. */
  const form = new FormData();
  form.append("encrypted", encryption.ciphertext, `${documentId}.encrypted`);
  form.append("documentId", documentId);
  form.append("participantId", participantId);
  form.append("originalHash", originalHash);
  form.append("encryptedHash", encryptedHash);
  form.append("originalFileName", file.name);
  form.append("originalFileType", file.type);
  form.append("originalFileSize", String(file.size));
  form.append("fileName", `${documentId}.encrypted`);
  form.append("metadata", JSON.stringify(metadata));
  form.append("encryption", JSON.stringify({
    algorithm: encryption.algorithm,
    keyLength: encryption.keyLength,
    iv: encryption.iv,
    key: encryption.key,
  }));

  /* Send the envelope to the backend, then create and record its blockchain proof. */
  const response = await fetch("/api/documents", { method: "POST", body: form });
  if (!response.ok) throw new Error((await response.json()).error || "Document upload failed.");
  const uploaded = await response.json();
  const proof: DocumentProof = {
    documentId,
    participantId,
    cid: uploaded.cid,
    originalHash,
    encryptedHash,
    metadata,
  };
  const transactionHash = await recordDocumentProof(proof);

  return {
    ...proof,
    originalFileName: file.name,
    originalFileType: file.type,
    originalFileSize: file.size,
    encryption,
    transactionHash,
  };
}
