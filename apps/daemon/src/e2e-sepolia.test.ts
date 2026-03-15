/**
 * Daemon Sepolia FHE Integration Test
 *
 * Tests that the daemon can correctly create FHE encrypted inputs using
 * @zama-fhe/relayer-sdk against the real Zama Sepolia relayer.
 *
 * Tests:
 * 1. FhevmInstance initialization (downloads public key from relayer)
 * 2. Encrypted input creation (euint64, ebool, euint256)
 * 3. Full ABI-encoded transaction data for depositFor, placeBid, createAuction
 *
 * This does NOT submit transactions (requires token balances + operator approval).
 * For full on-chain lifecycle, use the Hardhat smoke test in contracts-fhe/.
 *
 * Run: cd apps/daemon && pnpm test:sepolia
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { encodeFunctionData, keccak256, toBytes, toHex } from "viem";
import { createInstance, SepoliaConfig } from "@zama-fhe/relayer-sdk/node";
import type { FhevmInstance } from "@zama-fhe/relayer-sdk/node";
import { fheSecretMarketplaceAbi } from "@private-streams/common";
import "dotenv/config";

// ── Config ──

const RPC_URL = process.env.RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
// Use the known deployed address; fall back to env
const MARKETPLACE_ADDRESS =
  process.env.SECRET_MARKETPLACE_ADDRESS || "0xf74884348F7153c63A46a1e362ec6D90E754Cf15";
const ADMIN_ADDRESS = "0x6B789D957B87c12F30b48E9bFc58678c2f76f1c5";

// ── Shared state ──

let fhevmInstance: FhevmInstance;

// ── Setup ──

before(async function () {
  console.log("Initializing FhevmInstance (downloading public key from relayer)...");
  fhevmInstance = await createInstance({
    ...SepoliaConfig,
    network: RPC_URL,
  });
  console.log("FhevmInstance ready.");
});

// ── Tests ──

describe("FhevmInstance initialization", { timeout: 120_000 }, () => {
  it("creates an instance with public key", () => {
    const pk = fhevmInstance.getPublicKey();
    assert.ok(pk, "Should have a public key");
    assert.ok(pk.publicKey.length > 0, "Public key should be non-empty");
    assert.ok(pk.publicKeyId, "Public key should have an ID");
    console.log(`Public key ID: ${pk.publicKeyId}, size: ${pk.publicKey.length} bytes`);
  });
});

describe("Encrypted input creation", { timeout: 120_000 }, () => {
  it("encrypts a uint64 value", async () => {
    const input = fhevmInstance.createEncryptedInput(MARKETPLACE_ADDRESS, ADMIN_ADDRESS);
    input.add64(1_000_000n);
    const encrypted = await input.encrypt();

    assert.equal(encrypted.handles.length, 1, "Should have exactly one handle");
    assert.ok(encrypted.handles[0].length === 32, "Handle should be 32 bytes");
    assert.ok(encrypted.inputProof.length > 0, "Input proof should be non-empty");
    console.log(`euint64 handle: ${Buffer.from(encrypted.handles[0]).toString("hex").slice(0, 16)}...`);
    console.log(`inputProof size: ${encrypted.inputProof.length} bytes`);
  });

  it("encrypts a boolean value", async () => {
    const input = fhevmInstance.createEncryptedInput(MARKETPLACE_ADDRESS, ADMIN_ADDRESS);
    input.addBool(true);
    const encrypted = await input.encrypt();

    assert.equal(encrypted.handles.length, 1);
    assert.ok(encrypted.handles[0].length === 32);
    assert.ok(encrypted.inputProof.length > 0);
    console.log(`ebool handle: ${Buffer.from(encrypted.handles[0]).toString("hex").slice(0, 16)}...`);
  });

  it("encrypts a uint256 value", async () => {
    const input = fhevmInstance.createEncryptedInput(MARKETPLACE_ADDRESS, ADMIN_ADDRESS);
    input.add256(99999999999999999999n);
    const encrypted = await input.encrypt();

    assert.equal(encrypted.handles.length, 1);
    assert.ok(encrypted.handles[0].length === 32);
    assert.ok(encrypted.inputProof.length > 0);
    console.log(`euint256 handle: ${Buffer.from(encrypted.handles[0]).toString("hex").slice(0, 16)}...`);
  });

  it("encrypts multiple values in one batch (bool + uint256 for createAuction)", async () => {
    const input = fhevmInstance.createEncryptedInput(MARKETPLACE_ADDRESS, ADMIN_ADDRESS);
    input.addBool(true);
    input.add256(12345678n);
    const encrypted = await input.encrypt();

    assert.equal(encrypted.handles.length, 2, "Should have two handles");
    assert.ok(encrypted.handles[0].length === 32, "First handle (ebool) should be 32 bytes");
    assert.ok(encrypted.handles[1].length === 32, "Second handle (euint256) should be 32 bytes");
    assert.ok(encrypted.inputProof.length > 0, "Shared input proof should be non-empty");
    console.log(`Batch: handles[0]=${Buffer.from(encrypted.handles[0]).toString("hex").slice(0, 16)}...`);
    console.log(`Batch: handles[1]=${Buffer.from(encrypted.handles[1]).toString("hex").slice(0, 16)}...`);
    console.log(`Shared inputProof: ${encrypted.inputProof.length} bytes`);
  });
});

describe("ABI encoding with encrypted inputs", { timeout: 120_000 }, () => {
  it("encodes depositFor correctly", async () => {
    const input = fhevmInstance.createEncryptedInput(MARKETPLACE_ADDRESS, ADMIN_ADDRESS);
    input.add64(2_000_000n);
    const encrypted = await input.encrypt();

    const calldata = encodeFunctionData({
      abi: fheSecretMarketplaceAbi,
      functionName: "depositFor",
      args: [
        "bold-falcon-42",
        toHex(encrypted.handles[0]),
        toHex(encrypted.inputProof),
      ],
    });

    assert.ok(calldata.startsWith("0x"), "Calldata should be hex");
    assert.ok(calldata.length > 10, "Calldata should have selector + params");
    const selector = calldata.slice(0, 10);
    console.log(`depositFor calldata: ${calldata.length / 2 - 1} bytes, selector: ${selector}`);
  });

  it("encodes placeBid correctly", async () => {
    const input = fhevmInstance.createEncryptedInput(MARKETPLACE_ADDRESS, ADMIN_ADDRESS);
    input.add64(5_000_000n);
    const encrypted = await input.encrypt();

    const calldata = encodeFunctionData({
      abi: fheSecretMarketplaceAbi,
      functionName: "placeBid",
      args: [
        1n, // auctionId
        "keen-wolf-7",
        "bold-falcon-42", // previousBidderId
        toHex(encrypted.handles[0]),
        toHex(encrypted.inputProof),
        5_000_000n, // bidAmountPlaintext
      ],
    });

    const selector = calldata.slice(0, 10);
    console.log(`placeBid calldata: ${calldata.length / 2 - 1} bytes, selector: ${selector}`);
  });

  it("encodes createAuction correctly with batch-encrypted inputs", async () => {
    const input = fhevmInstance.createEncryptedInput(MARKETPLACE_ADDRESS, ADMIN_ADDRESS);
    input.addBool(true); // prediction
    input.add256(99999n); // secretKey
    const encrypted = await input.encrypt();

    const secretDataCid = keccak256(toBytes("QmTestCid"));

    const calldata = encodeFunctionData({
      abi: fheSecretMarketplaceAbi,
      functionName: "createAuction",
      args: [
        "calm-bear-99",
        42n, // eventId
        "Will BTC hit $200k?",
        1999999999n, // endTime
        toHex(encrypted.handles[0]), // prediction (ebool)
        secretDataCid,
        toHex(encrypted.handles[1]), // secretKey (euint256)
        toHex(encrypted.inputProof),
      ],
    });

    const selector = calldata.slice(0, 10);
    console.log(`createAuction calldata: ${calldata.length / 2 - 1} bytes, selector: ${selector}`);
  });
});
