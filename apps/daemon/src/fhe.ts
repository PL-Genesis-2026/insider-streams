/**
 * FHE Encrypted Input Helper
 *
 * Wraps @zama-fhe/relayer-sdk to create encrypted inputs for the
 * FHESecretMarketplace contract. The FhevmInstance is initialized
 * once (downloads TFHE public key from the relayer) and reused.
 *
 * All encryption uses the admin EOA as the "user address" because
 * only the admin submits transactions in the admin-proxy model.
 */

import {
  createInstance,
  SepoliaConfig,
  type FhevmInstance,
} from "@zama-fhe/relayer-sdk/node";
import { config } from "./config.js";

let _instance: FhevmInstance | null = null;
let _initPromise: Promise<FhevmInstance> | null = null;

/**
 * Get or create the singleton FhevmInstance.
 * First call downloads TFHE public key from the relayer (may take a few seconds).
 */
export async function getFhevmInstance(): Promise<FhevmInstance> {
  if (_instance) return _instance;

  // Deduplicate concurrent init calls
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    console.log("[fhe] Initializing FhevmInstance (downloading public key from relayer)...");
    const instance = await createInstance({
      ...SepoliaConfig,
      network: config.rpcUrl,
    });
    console.log("[fhe] FhevmInstance ready.");
    _instance = instance;
    _initPromise = null;
    return instance;
  })();

  return _initPromise;
}

export interface EncryptedInput {
  handles: Uint8Array[];
  inputProof: Uint8Array;
}

/**
 * Encrypt a uint64 value for a contract call.
 * @param contractAddress - The target contract address
 * @param signerAddress - The address that will submit the tx (admin EOA)
 * @param value - The plaintext uint64 value
 */
export async function encryptUint64(
  contractAddress: string,
  signerAddress: string,
  value: bigint,
): Promise<EncryptedInput> {
  const instance = await getFhevmInstance();
  const input = instance.createEncryptedInput(contractAddress, signerAddress);
  input.add64(value);
  return input.encrypt();
}

/**
 * Encrypt a boolean value for a contract call.
 */
export async function encryptBool(
  contractAddress: string,
  signerAddress: string,
  value: boolean,
): Promise<EncryptedInput> {
  const instance = await getFhevmInstance();
  const input = instance.createEncryptedInput(contractAddress, signerAddress);
  input.addBool(value);
  return input.encrypt();
}

/**
 * Encrypt a uint256 value for a contract call.
 */
export async function encryptUint256(
  contractAddress: string,
  signerAddress: string,
  value: bigint,
): Promise<EncryptedInput> {
  const instance = await getFhevmInstance();
  const input = instance.createEncryptedInput(contractAddress, signerAddress);
  input.add256(value);
  return input.encrypt();
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
): Promise<EncryptedInput> {
  const instance = await getFhevmInstance();
  const input = instance.createEncryptedInput(contractAddress, signerAddress);
  input.addBool(prediction);
  input.add256(secretKey);
  return input.encrypt();
}
