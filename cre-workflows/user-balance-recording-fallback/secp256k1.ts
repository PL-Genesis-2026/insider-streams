// secp256k1.ts
// Minimal pure-JS secp256k1 ECDSA signing for CRE's QuickJS WASM runtime.
//
// CRE compiles TypeScript to WASM via Bun → Javy/QuickJS. The QuickJS engine
// does NOT provide `node:crypto` or `globalThis.crypto`, which means libraries
// like @noble/curves crash at module load time. This module implements only the
// subset we need (deterministic ECDSA sign via RFC 6979) using pure BigInt math.
//
// NOT a general-purpose crypto library. Only used for EIP-712 request signing.

// secp256k1 curve parameters
const P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2Fn;
const N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
const Gx = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798n;
const Gy = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8n;

function mod(a: bigint, m: bigint): bigint {
  const r = a % m;
  return r < 0n ? r + m : r;
}

function modInverse(a: bigint, m: bigint): bigint {
  let [old_r, r] = [mod(a, m), m];
  let [old_s, s] = [1n, 0n];
  while (r !== 0n) {
    const q = old_r / r;
    [old_r, r] = [r, old_r - q * r];
    [old_s, s] = [s, old_s - q * s];
  }
  return mod(old_s, m);
}

// Point at infinity represented as null
type Point = { x: bigint; y: bigint } | null;

function pointAdd(p1: Point, p2: Point): Point {
  if (p1 === null) return p2;
  if (p2 === null) return p1;
  if (p1.x === p2.x && p1.y === p2.y) return pointDouble(p1);
  if (p1.x === p2.x) return null; // P + (-P) = O

  const slope = mod((p2.y - p1.y) * modInverse(p2.x - p1.x, P), P);
  const x = mod(slope * slope - p1.x - p2.x, P);
  const y = mod(slope * (p1.x - x) - p1.y, P);
  return { x, y };
}

function pointDouble(p: Point): Point {
  if (p === null) return null;
  if (p.y === 0n) return null;

  const slope = mod(3n * p.x * p.x * modInverse(2n * p.y, P), P);
  const x = mod(slope * slope - 2n * p.x, P);
  const y = mod(slope * (p.x - x) - p.y, P);
  return { x, y };
}

function pointMultiply(k: bigint, p: Point): Point {
  let result: Point = null;
  let addend: Point = p;
  let scalar = mod(k, N);

  while (scalar > 0n) {
    if (scalar & 1n) {
      result = pointAdd(result, addend);
    }
    addend = pointDouble(addend);
    scalar >>= 1n;
  }
  return result;
}

// ── HMAC-SHA256 (pure JS) ──────────────────────────────────────────────────
// Needed for RFC 6979 deterministic k generation.
// Implements SHA-256 from FIPS 180-4 and HMAC from RFC 2104.

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

function sha256(data: Uint8Array): Uint8Array {
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  // Pre-processing: padding
  const bitLen = data.length * 8;
  const padLen = (64 - ((data.length + 9) % 64)) % 64;
  const padded = new Uint8Array(data.length + 1 + padLen + 8);
  padded.set(data);
  padded[data.length] = 0x80;
  // Length in bits as 64-bit big-endian (only lower 32 bits for messages < 512MB)
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 4, bitLen, false);

  const w = new Uint32Array(64);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = dv.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }

  const result = new Uint8Array(32);
  const rdv = new DataView(result.buffer);
  rdv.setUint32(0, h0, false); rdv.setUint32(4, h1, false);
  rdv.setUint32(8, h2, false); rdv.setUint32(12, h3, false);
  rdv.setUint32(16, h4, false); rdv.setUint32(20, h5, false);
  rdv.setUint32(24, h6, false); rdv.setUint32(28, h7, false);
  return result;
}

function hmacSha256(key: Uint8Array, message: Uint8Array): Uint8Array {
  const blockSize = 64;
  let k = key.length > blockSize ? sha256(key) : key;
  if (k.length < blockSize) {
    const padded = new Uint8Array(blockSize);
    padded.set(k);
    k = padded;
  }

  const iPad = new Uint8Array(blockSize);
  const oPad = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i++) {
    iPad[i] = k[i] ^ 0x36;
    oPad[i] = k[i] ^ 0x5c;
  }

  const inner = new Uint8Array(blockSize + message.length);
  inner.set(iPad);
  inner.set(message, blockSize);

  const innerHash = sha256(inner);

  const outer = new Uint8Array(blockSize + 32);
  outer.set(oPad);
  outer.set(innerHash, blockSize);

  return sha256(outer);
}

// ── RFC 6979 deterministic k ────────────────────────────────────────────────

function rfc6979K(hash: Uint8Array, privKey: Uint8Array): bigint {
  const qLen = 32; // secp256k1 order is 256 bits
  let v = new Uint8Array(32).fill(0x01);
  let k = new Uint8Array(32).fill(0x00);

  // K = HMAC_K(V || 0x00 || privKey || hash)
  const concat0 = new Uint8Array(32 + 1 + qLen + qLen);
  concat0.set(v);
  concat0[32] = 0x00;
  concat0.set(privKey, 33);
  concat0.set(hash, 33 + qLen);
  k = hmacSha256(k, concat0);
  v = hmacSha256(k, v);

  // K = HMAC_K(V || 0x01 || privKey || hash)
  const concat1 = new Uint8Array(32 + 1 + qLen + qLen);
  concat1.set(v);
  concat1[32] = 0x01;
  concat1.set(privKey, 33);
  concat1.set(hash, 33 + qLen);
  k = hmacSha256(k, concat1);
  v = hmacSha256(k, v);

  // Generate k candidates
  for (let attempt = 0; attempt < 1000; attempt++) {
    v = hmacSha256(k, v);
    const candidate = bytesToBigInt(v);
    if (candidate >= 1n && candidate < N) {
      return candidate;
    }
    // Rare: bad candidate, iterate
    const retry = new Uint8Array(33);
    retry.set(v);
    retry[32] = 0x00;
    k = hmacSha256(k, retry);
    v = hmacSha256(k, v);
  }
  throw new Error("RFC 6979: failed to generate valid k");
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (let i = 0; i < bytes.length; i++) {
    result = (result << 8n) | BigInt(bytes[i]);
  }
  return result;
}

function bigIntToBytes(n: bigint, len: number): Uint8Array {
  const bytes = new Uint8Array(len);
  let val = n;
  for (let i = len - 1; i >= 0; i--) {
    bytes[i] = Number(val & 0xFFn);
    val >>= 8n;
  }
  return bytes;
}

export function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(h.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(h.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHexStr(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

// ── Base64 encoding ─────────────────────────────────────────────────────────
// Buffer is not available in QuickJS WASM. Implement base64 manually.

const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function base64Encode(bytes: Uint8Array): string {
  let result = "";
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;

    result += B64_CHARS[(b0 >> 2) & 0x3f];
    result += B64_CHARS[((b0 << 4) | (b1 >> 4)) & 0x3f];
    result += i + 1 < len ? B64_CHARS[((b1 << 2) | (b2 >> 6)) & 0x3f] : "=";
    result += i + 2 < len ? B64_CHARS[b2 & 0x3f] : "=";
  }
  return result;
}

// ── ECDSA Sign (secp256k1) ──────────────────────────────────────────────────

export interface ECDSASignature {
  r: bigint;
  s: bigint;
  recovery: number;
}

/**
 * Sign a 32-byte message hash with a secp256k1 private key.
 * Returns { r, s, recovery } with low-S normalization per BIP-62.
 */
export function ecdsaSign(msgHash: Uint8Array, privKeyBytes: Uint8Array): ECDSASignature {
  const z = bytesToBigInt(msgHash);
  const d = bytesToBigInt(privKeyBytes);

  if (d <= 0n || d >= N) throw new Error("Invalid private key");

  const k = rfc6979K(msgHash, privKeyBytes);
  const R = pointMultiply(k, { x: Gx, y: Gy });
  if (R === null) throw new Error("Invalid k: R is point at infinity");

  const r = mod(R.x, N);
  if (r === 0n) throw new Error("Invalid k: r is zero");

  let s = mod(modInverse(k, N) * (z + r * d), N);
  let recovery = (R.y & 1n) === 0n ? 0 : 1;

  // Low-S normalization (BIP-62)
  const halfN = N >> 1n;
  if (s > halfN) {
    s = N - s;
    recovery ^= 1;
  }

  return { r, s, recovery };
}

/**
 * Sign a 0x-prefixed hex digest with a 0x-prefixed hex private key.
 * Returns a 0x-prefixed 65-byte hex signature (r || s || v).
 */
export function signDigest(digest: `0x${string}`, privateKey: `0x${string}`): string {
  const msgHash = hexToBytes(digest);
  const privKeyBytes = hexToBytes(privateKey);

  const { r, s, recovery } = ecdsaSign(msgHash, privKeyBytes);

  const rBytes = bigIntToBytes(r, 32);
  const sBytes = bigIntToBytes(s, 32);
  const v = recovery === 0 ? "1b" : "1c"; // 27 or 28

  return "0x" + bytesToHexStr(rBytes) + bytesToHexStr(sBytes) + v;
}
