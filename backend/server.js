import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createDecipheriv } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env") });
const databasePath = path.join(root, "backend", "documents.json");
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const app = express();
app.use(express.json());

async function readDatabase() {
  try {
    return JSON.parse(await readFile(databasePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeDatabase(documents) {
  await mkdir(path.dirname(databasePath), { recursive: true });
  await writeFile(databasePath, JSON.stringify(documents, null, 2));
}

function pinataToken() {
  const token = process.env.PINATA_JWT?.replace(/\s/g, "");
  if (!token) throw new Error("PINATA_JWT is not configured");
  if (token.split(".").length !== 3) throw new Error("PINATA_JWT must be a three-part JWT. Generate a new JWT from Pinata and replace it in .env.");
  return token;
}

app.post("/api/documents", upload.single("encrypted"), async (request, response) => {
  try {
    if (!request.file) return response.status(400).json({ error: "Encrypted file is required." });
    const encryption = JSON.parse(request.body.encryption);
    const metadata = request.body.metadata ? JSON.parse(request.body.metadata) : {};
    const form = new FormData();
    form.append("file", new Blob([request.file.buffer], { type: "application/octet-stream" }), request.body.fileName);
    form.append("pinataMetadata", JSON.stringify({ name: request.body.fileName }));

    const pinataResponse = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: { Authorization: `Bearer ${pinataToken()}` },
      body: form,
    });
    const pinataResult = await pinataResponse.json();
    if (!pinataResponse.ok || !pinataResult.IpfsHash) {
      return response.status(502).json({ error: pinataResult.error?.details || "Pinata upload failed." });
    }

    const document = {
      documentId: request.body.documentId,
      participantId: request.body.participantId,
      cid: pinataResult.IpfsHash,
      originalHash: request.body.originalHash,
      encryptedHash: request.body.encryptedHash,
      originalFileName: request.body.originalFileName,
      originalFileType: request.body.originalFileType,
      originalFileSize: Number(request.body.originalFileSize),
      encryption,
      metadata,
      createdAt: new Date().toISOString(),
    };
    const documents = await readDatabase();
    documents.push(document);
    await writeDatabase(documents);
    response.status(201).json(document);
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: error instanceof Error ? error.message : "Document upload failed." });
  }
});

app.get("/api/documents/:documentId", async (request, response) => {
  const document = (await readDatabase()).find(({ documentId }) => documentId === request.params.documentId);
  if (!document) return response.status(404).json({ error: "Document not found." });
  response.json(document);
});

app.get("/api/documents/by-name/:fileName", async (request, response) => {
  const document = (await readDatabase())
    .filter(({ originalFileName }) => originalFileName === request.params.fileName)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!document) return response.status(404).json({ error: "Document not found." });
  response.json(document);
});

async function fetchEncryptedDocument(document) {
  const gateway = (process.env.PINATA_GATEWAY_URL || "https://gateway.pinata.cloud/ipfs").replace(/\/$/, "");
  const result = await fetch(`${gateway}/${encodeURIComponent(document.cid)}`, {
    headers: { Authorization: `Bearer ${pinataToken()}` },
  });
  if (!result.ok) throw new Error("Unable to retrieve document from Pinata.");
  return Buffer.from(await result.arrayBuffer());
}

function decryptDocumentEnvelope(document, ciphertext) {
  const keyBytes = Buffer.from(document.encryption.key.k, "base64url");
  const iv = Buffer.from(document.encryption.iv, "base64");
  const tag = ciphertext.subarray(ciphertext.length - 16);
  const encrypted = ciphertext.subarray(0, ciphertext.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", keyBytes, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

app.get("/api/documents/by-name/:fileName/plain", async (request, response) => {
  try {
    const document = (await readDatabase())
      .filter(({ originalFileName }) => originalFileName === request.params.fileName)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!document) return response.status(404).json({ error: "Document not found." });
    const ciphertext = await fetchEncryptedDocument(document);
    response.type("application/json").send(decryptDocumentEnvelope(document, ciphertext));
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Unable to decrypt the document." });
  }
});

app.delete("/api/documents/configuration", async (request, response) => {
  const configurationNames = new Set(["role-participant-map.json", "emission-factors.json"]);
  const documents = await readDatabase();
  const remaining = documents.filter((document) => !configurationNames.has(document.originalFileName));
  await writeDatabase(remaining);
  response.json({ reset: true });
});

app.get("/api/documents/:documentId/file", async (request, response) => {
  try {
    const document = (await readDatabase()).find(({ documentId }) => documentId === request.params.documentId);
    if (!document) return response.status(404).json({ error: "Document not found." });
    const gateway = (process.env.PINATA_GATEWAY_URL || "https://gateway.pinata.cloud/ipfs").replace(/\/$/, "");
    const result = await fetch(`${gateway}/${encodeURIComponent(document.cid)}`, {
      headers: { Authorization: `Bearer ${pinataToken()}` },
    });
    if (!result.ok) return response.status(502).send("Unable to retrieve document from Pinata.");
    response.setHeader("Content-Type", "application/octet-stream");
    response.send(Buffer.from(await result.arrayBuffer()));
  } catch (error) {
    console.error(error);
    response.status(500).send("Unable to retrieve document.");
  }
});

app.get("/api/documents/:documentId/plain-file", async (request, response) => {
  try {
    const document = (await readDatabase()).find(({ documentId }) => documentId === request.params.documentId);
    if (!document) return response.status(404).send("Document not found.");
    const ciphertext = await fetchEncryptedDocument(document);
    const plaintext = decryptDocumentEnvelope(document, ciphertext);
    response.setHeader("Content-Type", document.originalFileType || "application/octet-stream");
    response.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(document.originalFileName)}`);
    response.send(plaintext);
  } catch (error) {
    console.error(error);
    response.status(500).send("Unable to retrieve document.");
  }
});

app.get("/api/documents/by-original-hash/:hash", async (request, response) => {
  const productId = request.query.productId?.toString();
  const eventIndex = request.query.eventIndex?.toString();
  const document = (await readDatabase()).find((candidate) =>
    String(candidate.originalHash).toLowerCase() === request.params.hash.toLowerCase() &&
    (!productId || String(candidate.metadata?.productId) === productId) &&
    (!eventIndex || String(candidate.metadata?.eventIndex) === eventIndex),
  );
  if (!document) return response.status(404).json({ error: "Document not found." });
  response.json(document);
});

app.get("/api/documents/by-original-hash/:hash/plain-file", async (request, response) => {
  try {
    const productId = request.query.productId?.toString();
    const eventIndex = request.query.eventIndex?.toString();
    const document = (await readDatabase()).find((candidate) =>
      String(candidate.originalHash).toLowerCase() === request.params.hash.toLowerCase() &&
      (!productId || String(candidate.metadata?.productId) === productId) &&
      (!eventIndex || String(candidate.metadata?.eventIndex) === eventIndex),
    );
    if (!document) return response.status(404).send("Document not found.");
    const plaintext = decryptDocumentEnvelope(document, await fetchEncryptedDocument(document));
    response.setHeader("Content-Type", document.originalFileType || "application/octet-stream");
    response.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(document.originalFileName)}`);
    response.send(plaintext);
  } catch (error) {
    console.error(error);
    response.status(500).send("Unable to retrieve document.");
  }
});

const port = Number(process.env.PORT || 3001);
app.listen(port, () => console.log(`Document backend listening on http://127.0.0.1:${port}`));
