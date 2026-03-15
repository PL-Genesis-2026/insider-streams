/**
 * Client-side decryption of Filecoin-stored encrypted files.
 *
 * Parses the ISF1 envelope format:
 *   magic (4) + salt (16) + IV (12) + authTag (16) + plainSize (8) + cipherSize (8) + ciphertext
 *
 * Uses scrypt key derivation (via @noble/hashes) + Web Crypto AES-GCM decryption.
 */

import { scrypt } from "@noble/hashes/scrypt";

const FILE_ENVELOPE_MAGIC = new TextEncoder().encode("ISF1");
const SALT_BYTES = 16;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const SIZE_BYTES = 8;
const HEADER_SIZE =
  FILE_ENVELOPE_MAGIC.length + SALT_BYTES + IV_BYTES + AUTH_TAG_BYTES + SIZE_BYTES * 2;

// scrypt parameters — must match server-side (Node crypto default N=2^14 for scryptSync)
const SCRYPT_N = 2 ** 14;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

export async function fetchAndDecrypt(
  retrievalUrl: string,
  encryptionKey: string,
): Promise<{ data: ArrayBuffer; fileName: string }> {
  const response = await fetch(retrievalUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch encrypted file: ${response.status} ${response.statusText}`);
  }

  const encryptedData = await response.arrayBuffer();
  const encrypted = new Uint8Array(encryptedData);

  if (encrypted.length < HEADER_SIZE) {
    throw new Error("Encrypted file too small — invalid ISF1 envelope");
  }

  // Parse header
  let offset = 0;
  const magic = encrypted.slice(offset, offset + FILE_ENVELOPE_MAGIC.length);
  offset += FILE_ENVELOPE_MAGIC.length;

  // Verify magic
  for (let i = 0; i < FILE_ENVELOPE_MAGIC.length; i++) {
    if (magic[i] !== FILE_ENVELOPE_MAGIC[i]) {
      throw new Error("Invalid file envelope — not ISF1 format");
    }
  }

  const salt = encrypted.slice(offset, offset + SALT_BYTES);
  offset += SALT_BYTES;

  const iv = encrypted.slice(offset, offset + IV_BYTES);
  offset += IV_BYTES;

  const authTag = encrypted.slice(offset, offset + AUTH_TAG_BYTES);
  offset += AUTH_TAG_BYTES;

  // Read plaintext size (big-endian uint64)
  const view = new DataView(encrypted.buffer, encrypted.byteOffset);
  const _plaintextSize = view.getBigUint64(offset, false);
  offset += SIZE_BYTES;

  // Read ciphertext size (big-endian uint64)
  const ciphertextSize = view.getBigUint64(offset, false);
  offset += SIZE_BYTES;

  const ciphertext = encrypted.slice(offset, offset + Number(ciphertextSize));

  // Derive key from encryptionKey + salt using scrypt
  const keyBytes = scrypt(
    new TextEncoder().encode(encryptionKey),
    salt,
    { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, dkLen: 32 },
  );

  // Copy to standard ArrayBuffer for Web Crypto compatibility
  const keyBuffer = new ArrayBuffer(keyBytes.length);
  new Uint8Array(keyBuffer).set(keyBytes);

  const ivBuffer = new ArrayBuffer(iv.length);
  new Uint8Array(ivBuffer).set(iv);

  // Import key for Web Crypto
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBuffer,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );

  // AES-GCM expects ciphertext + authTag concatenated
  const taggedBuffer = new ArrayBuffer(ciphertext.length + AUTH_TAG_BYTES);
  const taggedView = new Uint8Array(taggedBuffer);
  taggedView.set(ciphertext, 0);
  taggedView.set(authTag, ciphertext.length);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBuffer },
    cryptoKey,
    taggedBuffer,
  );

  return { data: decrypted, fileName: "decrypted" };
}
