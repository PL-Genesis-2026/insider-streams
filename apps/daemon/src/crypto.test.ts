/**
 * KEK Encryption Tests
 *
 * Tests the key-encryption-key (KEK) round-trip for protecting
 * Filecoin encryption keys stored in SQLite.
 *
 * Usage: cd apps/daemon && pnpm test:crypto
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Derive a deterministic test-only key from a fixed seed (not a real key)
import { createHash } from "node:crypto";
process.env.PRIVATE_KEY = "0x" + createHash("sha256").update("crypto-test-seed").digest("hex");

const { encryptWithKek, decryptWithKek } = await import("./crypto.js");

describe("encryptWithKek / decryptWithKek", () => {
  it("round-trips a simple string", () => {
    const plaintext = "test-encryption-key-abc123";
    const encrypted = encryptWithKek(plaintext);
    const decrypted = decryptWithKek(encrypted);
    assert.equal(decrypted, plaintext);
  });

  it("round-trips an empty string", () => {
    const encrypted = encryptWithKek("");
    const decrypted = decryptWithKek(encrypted);
    assert.equal(decrypted, "");
  });

  it("round-trips a base64url key (realistic Filecoin key)", () => {
    const key = "YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4";
    const encrypted = encryptWithKek(key);
    const decrypted = decryptWithKek(encrypted);
    assert.equal(decrypted, key);
  });

  it("different plaintexts produce different ciphertexts", () => {
    const enc1 = encryptWithKek("key-one");
    const enc2 = encryptWithKek("key-two");
    assert.notEqual(enc1, enc2);
  });

  it("same plaintext produces different ciphertexts (random IV)", () => {
    const enc1 = encryptWithKek("same-key");
    const enc2 = encryptWithKek("same-key");
    assert.notEqual(enc1, enc2);
    // Both decrypt to the same value
    assert.equal(decryptWithKek(enc1), "same-key");
    assert.equal(decryptWithKek(enc2), "same-key");
  });

  it("throws on tampered ciphertext", () => {
    const encrypted = encryptWithKek("secret");
    const buf = Buffer.from(encrypted, "base64");
    // Flip a byte in the ciphertext portion
    buf[buf.length - 1] ^= 0xff;
    const tampered = buf.toString("base64");
    assert.throws(() => decryptWithKek(tampered));
  });

  it("throws on truncated data", () => {
    const encrypted = encryptWithKek("secret");
    const truncated = encrypted.slice(0, 10);
    assert.throws(() => decryptWithKek(truncated));
  });
});
