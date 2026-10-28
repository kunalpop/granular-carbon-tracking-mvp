export type DocumentMetadata = Record<string, unknown>;

export type EncryptionEnvelope = {
  ciphertext: Blob;
  algorithm: "AES-GCM";
  keyLength: 256;
  iv: string;
  key: JsonWebKey;
};

export type IPFSUpload = { cid: string; size: number };

export type DocumentProof = {
  documentId: string;
  participantId: string;
  cid: string;
  originalHash: string;
  encryptedHash: string;
  metadata: DocumentMetadata;
};

export type UploadedDocument = DocumentProof & {
  originalFileName: string;
  originalFileType: string;
  originalFileSize: number;
  encryption: EncryptionEnvelope;
  transactionHash?: string;
};
