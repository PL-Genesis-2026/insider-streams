/**
 * KEK (Key Encryption Key) utilities.
 *
 * Encrypts Filecoin encryption keys before storing in SQLite.
 * Derives a KEK from the daemon's PRIVATE_KEY via scrypt.
 *
 * Threat model: protects against DB dump without daemon process.
 * If attacker has PRIVATE_KEY, they already control the admin wallet.
 */

import {
  scryptSync,
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { config } from "./config.js";

const KEK_SALT = "insider-streams-kek-v1";
const KEK_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

let _kek: Buffer | null = null;

function getKek(): Buffer {
  if (!_kek) {
    if (!config.privateKey) {
      throw new Error("PRIVATE_KEY is required for KEK derivation");
    }
    _kek = scryptSync(config.privateKey, KEK_SALT, KEK_LENGTH);
  }
  return _kek;
}

export function encryptWithKek(plaintext: string): string {
  const kek = getKek();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", kek, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  // Pack: iv (12) + authTag (16) + ciphertext
  const packed = Buffer.concat([iv, authTag, ciphertext]);
  return packed.toString("base64");
}

export function decryptWithKek(encoded: string): string {
  const kek = getKek();
  const packed = Buffer.from(encoded, "base64");
  if (packed.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Invalid KEK-encrypted data: too short");
  }
  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", kek, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
