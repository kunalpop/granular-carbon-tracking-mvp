import type { EncryptionEnvelope } from "./types";

export type StoredDocument = {
  documentId: string;
  participantId: string;
  cid: string;
  originalHash: string;
  encryptedHash: string;
  originalFileName: string;
  originalFileType: string;
  originalFileSize: number;
  encryption: EncryptionEnvelope;
  metadata: Record<string, unknown>;
  createdAt: string;
};

// Retrieves a stored document record and its CID from the backend.
export async function getDocument(documentId: string): Promise<StoredDocument> {
  /*
   * Perform the getDocument operation and handle its input, output, or errors.
   */
  /* Request the backend record and surface an error when the document is unavailable. */
  const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}`);
  if (!response.ok) throw new Error(`Unable to load document metadata: ${response.statusText}`);
  return response.json();
}
