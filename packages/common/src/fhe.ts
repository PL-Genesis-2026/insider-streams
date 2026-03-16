/**
 * FHE Encrypted Input Helper
 *
 * Wraps @zama-fhe/relayer-sdk to create encrypted inputs for the
 * FHESecretMarketplace contract. The FhevmInstance is initialized
 * once (downloads TFHE public key from the relayer) and reused.
 *
 * All encryption uses the admin EOA as the "user address" because
 * only the admin submits transactions in the admin-proxy model.
 *
 * Rate limit handling: The Zama testnet relayer enforces per-IP rate limits
 * and returns Retry-After headers on 429 responses. All encrypt/decrypt/init
 * operations retry automatically using the relayer's indicated wait time.
 */

import {
  createInstance,
  SepoliaConfig,
  type FhevmInstance,
} from "@zama-fhe/relayer-sdk/node";

const RELAYER_INPUT_PROOF_URL = "https://relayer.testnet.zama.org/v2/input-proof";
const MAX_RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_FALLBACK_WAIT_MS = 60_000;

let _instance: FhevmInstance | null = null;
let _initPromise: Promise<FhevmInstance> | null = null;

// ---------------------------------------------------------------------------
// Rate-limit helpers
// ---------------------------------------------------------------------------

/**
 * Probe the Zama relayer for the Retry-After header value.
 * Returns the number of seconds to wait, or a fallback if unavailable.
 */
export async function getRelayerRetryAfterSeconds(): Promise<number> {
  try {
    const resp = await fetch(RELAYER_INPUT_PROOF_URL, {
      method: "HEAD",
      signal: AbortSignal.timeout(5_000),
    });
    const retryAfter = resp.headers.get("retry-after");
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (!Number.isNaN(seconds) && seconds > 0) return seconds;
    }
  } catch {
    // Probe failed — use fallback
  }
  return RATE_LIMIT_FALLBACK_WAIT_MS / 1000;
}

/**
 * Detect if an error is a Zama relayer 429 rate limit.
 * The SDK throws RelayerV2ResponseStatusError for encrypt/decrypt 429s,
 * but createInstance failures surface as plain objects with status: 429.
 */
export function isRelayer429(err: unknown): boolean {
  if (err instanceof Error) {
    if (err.message.includes("429")) return true;
    if (err.constructor.name === "RelayerV2ResponseStatusError") return true;
    if ("_status" in err && (err as Record<string, unknown>)._status === 429) return true;
  }
  // createInstance throws plain objects like { status: 429, statusText: 'Too Many Requests', ... }
  if (err != null && typeof err === "object" && "status" in err) {
    const status = (err as Record<string, unknown>).status;
    if (status === 429) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// FhevmInstance singleton
// ---------------------------------------------------------------------------

/**
 * Get or create the singleton FhevmInstance.
 * First call downloads TFHE public key from the relayer (may take a few seconds).
 * Retries on 429 using the relayer's Retry-After header.
 * @param rpcUrl - Ethereum RPC URL (e.g. Sepolia)
 */
export async function getFhevmInstance(rpcUrl: string): Promise<FhevmInstance> {
  if (_instance) return _instance;

  // Deduplicate concurrent init calls
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
      try {
        console.log("[fhe] Initializing FhevmInstance (downloading public key from relayer)...");
        const instance = await createInstance({
          ...SepoliaConfig,
          network: rpcUrl,
        });
        console.log("[fhe] FhevmInstance ready.");
        _instance = instance;
        return instance;
      } catch (err) {
        if (!isRelayer429(err) || attempt === MAX_RATE_LIMIT_RETRIES) throw err;

        const waitSeconds = await getRelayerRetryAfterSeconds();
        const totalWait = waitSeconds + 2;
        console.log(
          `[fhe] Init 429 — Retry-After: ${waitSeconds}s, waiting ${totalWait}s before retry ${attempt + 1}/${MAX_RATE_LIMIT_RETRIES}...`,
        );
        await new Promise((r) => setTimeout(r, totalWait * 1000));
      }
    }
    throw new Error("getFhevmInstance: unreachable");
  })().finally(() => {
    // Always clear the promise so failures can be retried
    _initPromise = null;
  });

  return _initPromise;
}

// ---------------------------------------------------------------------------
// Encryption
// ---------------------------------------------------------------------------

export interface EncryptedInput {
  handles: Uint8Array[];
  inputProof: Uint8Array;
}

/**
 * Retry wrapper for FHE encrypt() calls.
 * On 429, probes the relayer for Retry-After and waits before retrying.
 */
async function encryptWithRetry(
  rpcUrl: string,
  buildInput: (instance: FhevmInstance) => ReturnType<FhevmInstance["createEncryptedInput"]>,
): Promise<EncryptedInput> {
  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
    try {
      const instance = await getFhevmInstance(rpcUrl);
      const input = buildInput(instance);
      return await input.encrypt();
    } catch (err) {
      if (!isRelayer429(err) || attempt === MAX_RATE_LIMIT_RETRIES) throw err;

      const waitSeconds = await getRelayerRetryAfterSeconds();
      const totalWait = waitSeconds + 2;
      console.log(
        `[fhe] Relayer 429 — Retry-After: ${waitSeconds}s, waiting ${totalWait}s before retry ${attempt + 1}/${MAX_RATE_LIMIT_RETRIES}...`,
      );
      await new Promise((r) => setTimeout(r, totalWait * 1000));
    }
  }
  throw new Error("encryptWithRetry: unreachable");
}

/**
 * Encrypt a uint64 value for a contract call.
 * @param contractAddress - The target contract address
 * @param signerAddress - The address that will submit the tx (admin EOA)
 * @param value - The plaintext uint64 value
 * @param rpcUrl - Ethereum RPC URL
 */
export async function encryptUint64(
  contractAddress: string,
  signerAddress: string,
  value: bigint,
  rpcUrl: string,
): Promise<EncryptedInput> {
  return encryptWithRetry(rpcUrl, (instance) => {
    const input = instance.createEncryptedInput(contractAddress, signerAddress);
    input.add64(value);
    return input;
  });
}

/**
 * Encrypt a boolean value for a contract call.
 */
export async function encryptBool(
  contractAddress: string,
  signerAddress: string,
  value: boolean,
  rpcUrl: string,
): Promise<EncryptedInput> {
  return encryptWithRetry(rpcUrl, (instance) => {
    const input = instance.createEncryptedInput(contractAddress, signerAddress);
    input.addBool(value);
    return input;
  });
}

/**
 * Encrypt a uint256 value for a contract call.
 */
export async function encryptUint256(
  contractAddress: string,
  signerAddress: string,
  value: bigint,
  rpcUrl: string,
): Promise<EncryptedInput> {
  return encryptWithRetry(rpcUrl, (instance) => {
    const input = instance.createEncryptedInput(contractAddress, signerAddress);
    input.add256(value);
    return input;
  });
}

/**
 * Encrypt multiple values for createAuction: (bool prediction, uint256 secretKey).
 * Returns handles[0] = prediction, handles[1] = secretKey.
 */
export async function encryptAuctionInputs(
  contractAddress: string,
  signerAddress: string,
  prediction: boolean,
  secretKey: bigint,
  rpcUrl: string,
): Promise<EncryptedInput> {
  return encryptWithRetry(rpcUrl, (instance) => {
    const input = instance.createEncryptedInput(contractAddress, signerAddress);
    input.addBool(prediction);
    input.add256(secretKey);
    return input;
  });
}

// ---------------------------------------------------------------------------
// Decryption
// ---------------------------------------------------------------------------

/**
 * Decrypt an encrypted uint64 handle via the Zama Relayer.
 * The caller must hold ACL permission for the handle (e.g. platform EOA for received transfers).
 * Times out after 60s per attempt, retries on 429 using Retry-After.
 * @param handle - The encrypted handle (0x-prefixed bytes32)
 * @param rpcUrl - Ethereum RPC URL
 */
export async function publicDecryptUint64(handle: `0x${string}`, rpcUrl: string): Promise<bigint> {
  const DECRYPT_TIMEOUT_MS = 60_000;

  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
    try {
      const instance = await getFhevmInstance(rpcUrl);

      console.log(`[fhe] publicDecrypt(${handle}) — waiting for relayer...`);
      const decryptPromise = instance.publicDecrypt([handle]);
      let timer: ReturnType<typeof setTimeout>;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`publicDecrypt timed out after ${DECRYPT_TIMEOUT_MS / 1000}s`)),
          DECRYPT_TIMEOUT_MS,
        );
      });

      let result;
      try {
        result = await Promise.race([decryptPromise, timeoutPromise]);
      } finally {
        clearTimeout(timer!);
      }

      const clearValue = result.clearValues[handle];
      if (clearValue === undefined || clearValue === null) return 0n;
      return BigInt(clearValue as bigint);
    } catch (err) {
      if (!isRelayer429(err) || attempt === MAX_RATE_LIMIT_RETRIES) throw err;

      const waitSeconds = await getRelayerRetryAfterSeconds();
      const totalWait = waitSeconds + 2;
      console.log(
        `[fhe] publicDecrypt 429 — Retry-After: ${waitSeconds}s, waiting ${totalWait}s before retry ${attempt + 1}/${MAX_RATE_LIMIT_RETRIES}...`,
      );
      await new Promise((r) => setTimeout(r, totalWait * 1000));
    }
  }
  throw new Error("publicDecryptUint64: unreachable");
}
