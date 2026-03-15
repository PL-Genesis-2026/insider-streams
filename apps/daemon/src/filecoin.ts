/**
 * Filecoin encryption + upload via Synapse SDK.
 *
 * Ported from apps/insider-streams-frontend/src/lib/filecoin/server.ts.
 * Accepts Buffer + fileName + contentType (Express/multer gives Buffers).
 */

import {
  createCipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { config } from "./config.js";

const FILE_ENVELOPE_MAGIC = Buffer.from("ISF1", "utf8");
const SALT_BYTES = 16;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const SIZE_BYTES = 8;
const MIN_UPLOAD_BYTES = 127;

export type FilecoinStoredCopy = {
  providerId: string;
  dataSetId: string;
  pieceId: string;
  role: "primary" | "secondary";
  retrievalUrl: string;
  isNewDataSet: boolean;
};

export type FilecoinAttachmentMetadata = {
  encryptionKey: string;
  encryptionAlgorithm: string;
  fileName: string;
  encryptedFileName: string;
  contentType: string | null;
  fileMd5: string;
  fileSizeBytes: string;
  encryptedFileSizeBytes: string;
  pieceCid: string;
  retrievalUrl: string;
  copies: FilecoinStoredCopy[];
};

export function isFilecoinConfigured(): boolean {
  return Boolean(config.filecoinWalletPrivateKey);
}

function toBigEndianSize(size: number): Buffer {
  const buffer = Buffer.alloc(SIZE_BYTES);
  buffer.writeBigUInt64BE(BigInt(size));
  return buffer;
}

function encryptBytes(plaintext: Uint8Array) {
  const encryptionKey = randomBytes(24).toString("base64url");
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = scryptSync(encryptionKey, salt, 32);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(plaintext)),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  if (authTag.byteLength !== AUTH_TAG_BYTES) {
    throw new Error("Unexpected AES-GCM auth tag length");
  }
  const header = Buffer.concat([
    FILE_ENVELOPE_MAGIC,
    salt,
    iv,
    authTag,
    toBigEndianSize(plaintext.byteLength),
    toBigEndianSize(ciphertext.byteLength),
  ]);

  let encryptedPayload = Buffer.concat([header, ciphertext]);
  if (encryptedPayload.byteLength < MIN_UPLOAD_BYTES) {
    encryptedPayload = Buffer.concat([
      encryptedPayload,
      Buffer.alloc(MIN_UPLOAD_BYTES - encryptedPayload.byteLength),
    ]);
  }

  return {
    encryptionKey,
    encryptionAlgorithm: "AES-256-GCM+scrypt envelope v1",
    encryptedPayload,
  };
}

function normalizeFileName(fileName: string): string {
  const trimmed = fileName.trim();
  return trimmed.length > 0 ? trimmed : "attachment.bin";
}

export async function uploadEncryptedToFilecoin(
  buffer: Buffer,
  fileName: string,
  contentType: string,
): Promise<FilecoinAttachmentMetadata> {
  const normalized = normalizeFileName(fileName);
  const ct = contentType.trim() || null;

  if (buffer.byteLength === 0) {
    throw new Error("Uploaded file is empty");
  }

  const fileMd5 = createHash("md5").update(buffer).digest("hex");
  const { encryptionKey, encryptionAlgorithm, encryptedPayload } =
    encryptBytes(buffer);

  // Lazy-import Synapse SDK to avoid crashing when Filecoin is not configured
  const { Synapse } = await import("@filoz/synapse-sdk");
  const { calibration } = await import("@filoz/synapse-core/chains");
  const { http } = await import("viem");
  const { privateKeyToAccount } = await import("viem/accounts");

  const account = privateKeyToAccount(config.filecoinWalletPrivateKey as `0x${string}`);
  const synapse = Synapse.create({
    account,
    source: "insider-streams",
    chain: calibration,
    transport: config.filecoinRpcUrl ? http(config.filecoinRpcUrl) : undefined,
  });

  const prepareResult = await synapse.storage.prepare({
    dataSize: BigInt(encryptedPayload.byteLength),
  });

  if (prepareResult.transaction) {
    await prepareResult.transaction.execute();
  }

  const uploadResult = await synapse.storage.upload(encryptedPayload, {
    pieceMetadata: {
      fileName: normalized,
      encryptedFileName: `${normalized}.enc`,
      contentType: ct ?? "application/octet-stream",
      fileMd5,
    },
  });

  const primaryCopy =
    uploadResult.copies.find((copy: { role: string }) => copy.role === "primary") ??
    uploadResult.copies[0];

  if (!primaryCopy) {
    throw new Error("Filecoin upload completed without a retrievable copy");
  }

  return {
    encryptionKey,
    encryptionAlgorithm,
    fileName: normalized,
    encryptedFileName: `${normalized}.enc`,
    contentType: ct,
    fileMd5,
    fileSizeBytes: String(buffer.byteLength),
    encryptedFileSizeBytes: String(encryptedPayload.byteLength),
    pieceCid: uploadResult.pieceCid.toString(),
    retrievalUrl: primaryCopy.retrievalUrl,
    copies: uploadResult.copies.map((copy: { providerId: { toString(): string }; dataSetId: { toString(): string }; pieceId: { toString(): string }; role: "primary" | "secondary"; retrievalUrl: string; isNewDataSet: boolean }) => ({
      providerId: copy.providerId.toString(),
      dataSetId: copy.dataSetId.toString(),
      pieceId: copy.pieceId.toString(),
      role: copy.role,
      retrievalUrl: copy.retrievalUrl,
      isNewDataSet: copy.isNewDataSet,
    })),
  };
}
