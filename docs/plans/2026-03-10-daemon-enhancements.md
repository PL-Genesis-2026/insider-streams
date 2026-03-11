# Daemon Enhancements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add SQLite identity mapping, deposit watcher, and HTTP API to the daemon so the frontend can proxy all on-chain actions through the admin EOA, completing the privacy model.

**Architecture:** The daemon (`apps/daemon/`) already has settler, auction-closer, and reputation-resolver services. We add: (1) SQLite database for `users`, `bids`, and `withdrawal_queue` tables, (2) a deposit watcher polling Private Token API, (3) an Express HTTP API for frontend bid/auction/withdraw proxying. The daemon is the sole bridge between users and the on-chain admin-proxy contract — no user addresses ever appear on-chain.

**Tech Stack:** Node.js, TypeScript, ethers v6, Express, better-sqlite3, `@private-streams/chainlink-private-token-api-client`

**Key contract signatures (FHESecretMarketplace — admin-proxy Phase 9):**
- `depositFor(string userId, externalEuint64 encryptedAmount, bytes inputProof) onlyOwner`
- `withdrawFor(string userId, externalEuint64 encryptedAmount, bytes inputProof) onlyOwner`
- `placeBid(uint256 auctionId, string bidderId, string previousBidderId, externalEuint64 encryptedAmount, bytes inputProof) onlyOwner`
- `createAuction(string sellerId, uint256 eventId, string eventTitle, uint256 endTime, externalEbool encryptedPrediction, bytes32 secretDataCid, externalEuint256 encryptedSecretKey, bytes inputProof) onlyOwner`
- `closeAuction(uint256 auctionId) onlyOwner`
- `cancelAuction(uint256 auctionId) onlyOwner`
- `getAuction(uint256) view returns (string sellerId, uint256 endTime, euint64 currentBid, string currentBidderId, uint256 eventId, string eventTitle, uint8 status, bool reputationResolved, bytes32 secretDataCid)`
- `getBalance(string userId) view returns (euint64)`

**Important note on FHE encrypted inputs:** On Zama fhEVM, creating encrypted inputs (for `depositFor`, `withdrawFor`, `placeBid`, `createAuction`) requires the `fhevmjs` library to generate ZKPoK proofs. The admin EOA creates these proofs client-side. The daemon will need `fhevmjs` as a dependency. The exact API for creating encrypted inputs is:
```ts
import { createInstance } from "fhevmjs/node";
const fhevm = await createInstance({ networkUrl: RPC_URL, gatewayUrl: GATEWAY_URL });
const input = fhevm.createEncryptedInput(contractAddress, signerAddress);
input.addXX(value); // add64, addBool, add256
const encrypted = await input.encrypt();
// encrypted.handles[0] = handle, encrypted.inputProof = proof
```

This is complex and will be implemented as a helper module. For the initial plan, the HTTP API endpoints will be structured but the FHE encryption calls will use a shared helper.

---

### Task 1: Update ABIs for Phase 9 contract

**Files:**
- Modify: `apps/daemon/src/abis.ts`

**Step 1: Rewrite abis.ts with correct Phase 9 signatures**

Replace the entire file. The old ABIs reference removed fields (address seller, address winner, etc.).

```ts
// Minimal ABIs for daemon contract interactions (Phase 9 — admin-proxy model)

export const ExamplePredictionMarketABI = [
  "event SettlementRequested(uint256 indexed eventId, string question)",
  "event SettlementResponse(uint256 indexed eventId, uint8 indexed status, uint8 indexed outcome)",
  "function settleEvent(uint256 eventId, uint8 outcome, uint16 confidenceBps, string calldata evidenceURI) external",
  "function getMarketEvent(uint256 eventId) view returns (tuple(string question, address creator, uint256 eventOpen, uint256 eventClose, uint8 status, uint8 outcome, uint256 settledAt, string evidenceURI, uint16 confidenceBps, address yesToken, address noToken, uint256 yesShares, uint256 noShares, bool liquidityWithdrawn))",
  "function nextEventId() view returns (uint256)",
] as const;

export const FHESecretMarketplaceABI = [
  // Views
  "function getOpenAuctions() view returns (uint256[])",
  "function getAuction(uint256 auctionId) view returns (string sellerId, uint256 endTime, bytes32 currentBid, string currentBidderId, uint256 eventId, string eventTitle, uint8 status, bool reputationResolved, bytes32 secretDataCid)",
  "function getUnresolvedEvents() view returns (uint256[])",
  "function getEventAuctions(uint256 eventId) view returns (uint256[])",
  "function getSellerAuctions(string sellerId) view returns (uint256[])",
  "function getSeller(string sellerId) view returns (tuple(int256 reputationScore, bool registered))",
  "function getBalance(string userId) view returns (bytes32)",
  "function pendingAuctionClose(uint256 auctionId) view returns (bool)",
  "function pendingReputationDecrypt(uint256 auctionId) view returns (bool)",
  "function eventResolved(uint256 eventId) view returns (bool)",
  "function settler() view returns (address)",
  "function nextAuctionId() view returns (uint256)",
  "function paymentToken() view returns (address)",

  // Admin actions (onlyOwner)
  "function depositFor(string userId, bytes32 encryptedAmount, bytes inputProof) external",
  "function withdrawFor(string userId, bytes32 encryptedAmount, bytes inputProof) external",
  "function createAuction(string sellerId, uint256 eventId, string eventTitle, uint256 endTime, bytes32 encryptedPrediction, bytes32 secretDataCid, bytes32 encryptedSecretKey, bytes inputProof) external returns (uint256)",
  "function placeBid(uint256 auctionId, string bidderId, string previousBidderId, bytes32 encryptedAmount, bytes inputProof) external",
  "function closeAuction(uint256 auctionId) external",
  "function cancelAuction(uint256 auctionId) external",
  "function adminExpireAuction(uint256 auctionId) external",
  "function finalizeAuctionClose(uint256 auctionId, uint64 winningBid, bytes decryptionProof) external",
  "function resolveEventPredictions(uint256 eventId, bool actualOutcomeIsYes) external",
  "function finalizeReputationResult(uint256 auctionId, bool predictionWasCorrect, bytes decryptionProof) external",
  "function setSettler(address newSettler) external",

  // Events
  "event SellerRegistered(string sellerId)",
  "event AuctionCreated(uint256 indexed auctionId, uint256 indexed eventId, string sellerId, string eventTitle, uint256 endTime, bytes32 secretDataCid)",
  "event BidPlaced(uint256 indexed auctionId)",
  "event AuctionClosePending(uint256 indexed auctionId, string sellerId, uint256 eventId)",
  "event AuctionClosed(uint256 indexed auctionId, uint64 winningBid, string sellerId, uint256 eventId)",
  "event AuctionCancelled(uint256 indexed auctionId, string sellerId, uint256 eventId)",
  "event ExternalEventResolved(uint256 indexed externalEventId, uint256 auctionsAffected)",
  "event SellerReputationScoreUpdated(string sellerId, uint256 indexed auctionId, uint8 predictionOutcome, int8 scoreChange, int256 newScore)",
  "event AuctionAdminExpired(uint256 indexed auctionId)",
  "event SettlerUpdated(address indexed previousSettler, address indexed newSettler)",
  "event DepositedFor(string userId)",
  "event WithdrawnFor(string userId)",
] as const;
```

Note: `euint64`/`ebool`/`euint256` are `bytes32` handles in the ABI. The `externalEuint64` etc. are also `bytes32` in the ABI encoding.

**Step 2: Verify TypeScript compiles**

Run: `cd apps/daemon && npx tsc --noEmit`
Expected: Compilation succeeds (or existing errors only — the ABIs are just string arrays)

**Step 3: Commit**

```bash
git add apps/daemon/src/abis.ts
git commit -m "chore(daemon): update ABIs for Phase 9 admin-proxy contract"
```

---

### Task 2: Update auction-closer for new getAuction signature

**Files:**
- Modify: `apps/daemon/src/auction-closer.ts`

The `getAuction` return value changed. Old: `(address seller, string sellerId, uint256 endTime, ...)` — `endTime` was index 2. New: `(string sellerId, uint256 endTime, ...)` — `endTime` is index 1.

**Step 1: Update the endTime index in findExpiredAuctions**

Change `auction[2]` to `auction[1]` (endTime is now the 2nd return value):

```ts
const endTime = auction[1]; // endTime is 2nd return value (after sellerId)
```

**Step 2: Verify TypeScript compiles**

Run: `cd apps/daemon && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add apps/daemon/src/auction-closer.ts
git commit -m "fix(daemon): update getAuction index for Phase 9 return signature"
```

---

### Task 3: Install dependencies

**Files:**
- Modify: `apps/daemon/package.json`

**Step 1: Install runtime and dev dependencies**

```bash
cd apps/daemon
pnpm add better-sqlite3 express @private-streams/chainlink-private-token-api-client @private-streams/common
pnpm add -D @types/better-sqlite3 @types/express
```

**Step 2: Verify install succeeded**

Run: `cd apps/daemon && pnpm ls --depth=0`
Expected: All packages listed

**Step 3: Commit**

```bash
git add apps/daemon/package.json pnpm-lock.yaml
git commit -m "chore(daemon): add better-sqlite3, express, private-token-api deps"
```

---

### Task 4: Create SQLite database module

**Files:**
- Create: `apps/daemon/src/db.ts`

**Step 1: Write db.ts**

```ts
import Database from "better-sqlite3";
import path from "node:path";
import { config } from "./config.js";

const DB_PATH = config.dbPath || path.join(process.cwd(), "daemon.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    migrate(_db);
  }
  return _db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      address TEXT NOT NULL UNIQUE COLLATE NOCASE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bids (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      auction_id INTEGER NOT NULL,
      bidder_id TEXT NOT NULL,
      amount TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      tx_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS withdrawal_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      amount TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS deposit_cursor (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_cursor TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT OR IGNORE INTO deposit_cursor (id) VALUES (1);
  `);
}

// ── User helpers ──

/** Generate a pseudonymous ID like "bold-falcon-42" */
export function generatePseudonymousId(): string {
  const adjectives = [
    "bold", "calm", "dark", "fast", "keen", "loud", "pale", "rich", "warm", "wise",
    "blue", "cold", "deep", "fair", "gray", "high", "kind", "mild", "pure", "soft",
  ];
  const animals = [
    "bear", "crow", "deer", "dove", "duck", "eagle", "fox", "hare", "hawk", "lynx",
    "mole", "newt", "orca", "puma", "rook", "seal", "swan", "toad", "vole", "wolf",
  ];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  const num = Math.floor(Math.random() * 100);
  return `${adj}-${animal}-${num}`;
}

export function getUserByAddress(address: string): { id: string; address: string } | undefined {
  const db = getDb();
  return db.prepare("SELECT id, address FROM users WHERE address = ? COLLATE NOCASE").get(address.toLowerCase()) as
    | { id: string; address: string }
    | undefined;
}

export function getUserById(userId: string): { id: string; address: string } | undefined {
  const db = getDb();
  return db.prepare("SELECT id, address FROM users WHERE id = ?").get(userId) as
    | { id: string; address: string }
    | undefined;
}

export function getOrCreateUser(address: string): { id: string; address: string; created: boolean } {
  const existing = getUserByAddress(address);
  if (existing) return { ...existing, created: false };

  const db = getDb();
  let id = generatePseudonymousId();
  // Retry on collision (unlikely but possible)
  for (let i = 0; i < 10; i++) {
    try {
      db.prepare("INSERT INTO users (id, address) VALUES (?, ?)").run(id, address.toLowerCase());
      return { id, address: address.toLowerCase(), created: true };
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("UNIQUE constraint failed: users.id")) {
        id = generatePseudonymousId();
      } else {
        throw err;
      }
    }
  }
  throw new Error("Failed to generate unique pseudonymous ID after 10 attempts");
}

// ── Bid helpers ──

export function recordBid(auctionId: number, bidderId: string, amount: string, txHash?: string): number {
  const db = getDb();
  // Mark any existing active bid on this auction as outbid
  db.prepare("UPDATE bids SET status = 'outbid' WHERE auction_id = ? AND status = 'active'").run(auctionId);
  const result = db.prepare(
    "INSERT INTO bids (auction_id, bidder_id, amount, status, tx_hash) VALUES (?, ?, ?, 'active', ?)",
  ).run(auctionId, bidderId, amount, txHash ?? null);
  return Number(result.lastInsertRowid);
}

export function getActiveBid(auctionId: number): { bidder_id: string; amount: string } | undefined {
  const db = getDb();
  return db.prepare("SELECT bidder_id, amount FROM bids WHERE auction_id = ? AND status = 'active'").get(auctionId) as
    | { bidder_id: string; amount: string }
    | undefined;
}

export function markBidsForAuction(auctionId: number, status: "won" | "refunded" | "cancelled"): void {
  const db = getDb();
  db.prepare("UPDATE bids SET status = ? WHERE auction_id = ? AND status = 'active'").run(status, auctionId);
}

// ── Withdrawal helpers ──

export function queueWithdrawal(userId: string, amount: string): number {
  const db = getDb();
  const result = db.prepare("INSERT INTO withdrawal_queue (user_id, amount) VALUES (?, ?)").run(userId, amount);
  return Number(result.lastInsertRowid);
}

export function getPendingWithdrawals(): Array<{ id: number; user_id: string; amount: string }> {
  const db = getDb();
  return db.prepare("SELECT id, user_id, amount FROM withdrawal_queue WHERE status = 'pending' ORDER BY id").all() as Array<{
    id: number;
    user_id: string;
    amount: string;
  }>;
}

export function completeWithdrawal(id: number): void {
  const db = getDb();
  db.prepare("UPDATE withdrawal_queue SET status = 'completed', completed_at = datetime('now') WHERE id = ?").run(id);
}

export function failWithdrawal(id: number): void {
  const db = getDb();
  db.prepare("UPDATE withdrawal_queue SET status = 'failed' WHERE id = ?").run(id);
}

// ── Deposit cursor helpers ──

export function getDepositCursor(): string | null {
  const db = getDb();
  const row = db.prepare("SELECT last_cursor FROM deposit_cursor WHERE id = 1").get() as { last_cursor: string | null };
  return row?.last_cursor ?? null;
}

export function setDepositCursor(cursor: string): void {
  const db = getDb();
  db.prepare("UPDATE deposit_cursor SET last_cursor = ?, updated_at = datetime('now') WHERE id = 1").run(cursor);
}

// ── Cached balance helper ──

/** Get a user's cached balance from bid records. This is an approximation —
 *  the true balance is on-chain (encrypted). This tracks known deposits minus known bids. */
export function getCachedBalance(userId: string): bigint {
  const db = getDb();

  // Sum of active bids (money locked)
  const activeBids = db.prepare(
    "SELECT COALESCE(SUM(CAST(amount AS INTEGER)), 0) as total FROM bids WHERE bidder_id = ? AND status = 'active'",
  ).get(userId) as { total: number };

  // Sum of pending withdrawals
  const pendingWithdrawals = db.prepare(
    "SELECT COALESCE(SUM(CAST(amount AS INTEGER)), 0) as total FROM withdrawal_queue WHERE user_id = ? AND status = 'pending'",
  ).get(userId) as { total: number };

  // We don't track deposits in a separate table — the daemon knows about them
  // from the deposit-watcher. For now, return negative of locked funds as a "minimum reserved" indicator.
  // The actual available balance check should query on-chain state when possible.
  return BigInt(activeBids.total) + BigInt(pendingWithdrawals.total);
}
```

**Step 2: Add `dbPath` to config**

In `apps/daemon/src/config.ts`, add:
```ts
dbPath: process.env.DB_PATH || "",
```

**Step 3: Verify TypeScript compiles**

Run: `cd apps/daemon && npx tsc --noEmit`

**Step 4: Commit**

```bash
git add apps/daemon/src/db.ts apps/daemon/src/config.ts
git commit -m "feat(daemon): add SQLite database for user identity and bid tracking"
```

---

### Task 5: Create deposit watcher

**Files:**
- Create: `apps/daemon/src/deposit-watcher.ts`

**Step 1: Write deposit-watcher.ts**

The deposit watcher polls the Private Token API for new incoming transfers to the platform EOA, then calls `depositFor` on the contract.

```ts
/**
 * Deposit Watcher
 *
 * Polls the Private Token API for incoming transfers to the platform EOA.
 * When a new deposit is detected:
 * 1. Look up (or create) the user by sender address
 * 2. Call depositFor(userId, encryptedAmount, inputProof) on the contract
 *
 * NOTE: The FHE encrypted input creation requires fhevmjs. This is a stub
 * that logs detected deposits. Full FHE integration will be added when the
 * fhevmjs dependency is configured for the daemon.
 */

import { PrivateTokenApiClient } from "@private-streams/chainlink-private-token-api-client";
import { config, requireConfig } from "./config.js";
import { getOrCreateUser, getDepositCursor, setDepositCursor } from "./db.js";
import { sendNotification } from "./notify.js";

async function processDeposits(): Promise<void> {
  const client = new PrivateTokenApiClient(config.privateKey);
  const cursor = getDepositCursor();

  const response = await client.listTransactions({
    limit: 50,
    ...(cursor ? { cursor } : {}),
  });

  for (const tx of response.transactions) {
    // Only process incoming transfers (deposits to our platform EOA)
    if (!tx.is_incoming || tx.type !== "transfer") continue;
    if (!tx.sender) continue;

    const amount = tx.amount;
    const senderAddress = tx.sender;

    // Get or create pseudonymous user
    const user = getOrCreateUser(senderAddress);
    if (user.created) {
      console.log(`[deposit-watcher] New user registered: ${user.id} (${senderAddress})`);
    }

    console.log(`[deposit-watcher] Deposit detected: ${amount} from ${user.id}`);

    // TODO: Create FHE encrypted input and call depositFor on contract
    // This requires fhevmjs integration:
    //   const fhevm = await createInstance({ networkUrl, gatewayUrl });
    //   const input = fhevm.createEncryptedInput(contractAddress, walletAddress);
    //   input.add64(BigInt(amount));
    //   const encrypted = await input.encrypt();
    //   await marketplace.depositFor(user.id, encrypted.handles[0], encrypted.inputProof);

    await sendNotification(
      `Deposit: ${user.id}`,
      `${amount} tokens deposited by ${user.id}`,
    );
  }

  // Save cursor for next poll
  if (response.next_cursor) {
    setDepositCursor(response.next_cursor);
  }
}

export async function startDepositWatcher(): Promise<void> {
  requireConfig(["privateKey"]);

  const intervalMs = config.depositWatcherIntervalMs;
  console.log(`[deposit-watcher] Poll interval: ${intervalMs}ms`);
  console.log(`[deposit-watcher] Platform EOA: ${new (await import("ethers")).Wallet(config.privateKey).address}`);

  // Run immediately, then on interval
  try {
    await processDeposits();
  } catch (err) {
    console.warn("[deposit-watcher] Initial poll error:", err instanceof Error ? err.message : err);
  }

  setInterval(async () => {
    try {
      await processDeposits();
    } catch (err) {
      console.warn("[deposit-watcher] Poll error:", err instanceof Error ? err.message : err);
    }
  }, intervalMs);
}

// Run standalone
if (process.argv[1]?.endsWith("deposit-watcher.ts") || process.argv[1]?.endsWith("deposit-watcher.js")) {
  startDepositWatcher().catch((err) => {
    console.error("[deposit-watcher] Fatal error:", err);
    process.exit(1);
  });
}
```

**Step 2: Add depositWatcherIntervalMs to config.ts**

Add to config object:
```ts
depositWatcherIntervalMs: Number(process.env.DEPOSIT_WATCHER_INTERVAL_MS || 30_000),
```

**Step 3: Add script to package.json**

Add to scripts:
```json
"deposit-watcher": "tsx src/deposit-watcher.ts"
```

**Step 4: Verify TypeScript compiles**

Run: `cd apps/daemon && npx tsc --noEmit`

**Step 5: Commit**

```bash
git add apps/daemon/src/deposit-watcher.ts apps/daemon/src/config.ts apps/daemon/package.json
git commit -m "feat(daemon): add deposit watcher polling Private Token API"
```

---

### Task 6: Create HTTP API

**Files:**
- Create: `apps/daemon/src/api.ts`

This is the Express HTTP API that the frontend proxies through. Each endpoint validates the request, looks up the user's pseudonymous ID, and either queues the action or calls the contract directly.

**Step 1: Write api.ts**

```ts
/**
 * Daemon HTTP API
 *
 * Exposes endpoints for the frontend to proxy user actions through:
 * - POST /bid — place a bid on an auction
 * - POST /create-auction — create a new auction
 * - POST /cancel-auction — cancel an auction
 * - POST /withdraw — queue a withdrawal
 * - GET /balance/:address — get cached balance for a user
 * - GET /user/:address — get or create pseudonymous ID for an address
 * - GET /health — health check
 *
 * NOTE: Endpoints that require FHE encrypted inputs (bid, create-auction, withdraw)
 * are stubbed — they validate inputs and record in SQLite, but the actual contract
 * calls require fhevmjs integration (TODO).
 */

import express from "express";
import { config } from "./config.js";
import {
  getOrCreateUser,
  getUserByAddress,
  recordBid,
  getActiveBid,
  queueWithdrawal,
  getCachedBalance,
} from "./db.js";
import { sendNotification } from "./notify.js";

const app = express();
app.use(express.json());

// ── Health ──

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── User ──

app.get("/user/:address", (req, res) => {
  try {
    const { address } = req.params;
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      res.status(400).json({ error: "Invalid Ethereum address" });
      return;
    }
    const user = getOrCreateUser(address);
    res.json({ userId: user.id, address: user.address, created: user.created });
  } catch (err) {
    console.error("[api] GET /user error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Balance ──

app.get("/balance/:address", (req, res) => {
  try {
    const { address } = req.params;
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      res.status(400).json({ error: "Invalid Ethereum address" });
      return;
    }
    const user = getUserByAddress(address);
    if (!user) {
      res.json({ userId: null, lockedBalance: "0" });
      return;
    }
    const locked = getCachedBalance(user.id);
    res.json({ userId: user.id, lockedBalance: locked.toString() });
  } catch (err) {
    console.error("[api] GET /balance error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Bid ──

app.post("/bid", (req, res) => {
  try {
    const { address, auctionId, amount } = req.body;

    if (!address || !auctionId || !amount) {
      res.status(400).json({ error: "Missing required fields: address, auctionId, amount" });
      return;
    }

    const parsedAmount = BigInt(amount);
    if (parsedAmount <= 0n) {
      res.status(400).json({ error: "Amount must be positive" });
      return;
    }

    // Look up user
    const user = getOrCreateUser(address);

    // Check if there's an existing active bid on this auction
    const existingBid = getActiveBid(Number(auctionId));

    if (existingBid) {
      // Validate new bid is higher than existing
      if (parsedAmount <= BigInt(existingBid.amount)) {
        res.status(400).json({
          error: "Bid must be higher than current bid",
          currentBid: existingBid.amount,
        });
        return;
      }
    }

    // Record bid in SQLite
    const bidId = recordBid(Number(auctionId), user.id, amount);

    // TODO: Create FHE encrypted input and call placeBid on contract
    // For now, just record in SQLite

    console.log(`[api] Bid recorded: auction=${auctionId} bidder=${user.id} amount=${amount}`);

    res.json({
      bidId,
      userId: user.id,
      auctionId: Number(auctionId),
      amount,
      previousBidderId: existingBid?.bidder_id ?? null,
      status: "recorded",
    });
  } catch (err) {
    console.error("[api] POST /bid error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Create Auction ──

app.post("/create-auction", (req, res) => {
  try {
    const { address, eventId, eventTitle, endTime, prediction, secretDataCid, secretDataKey } = req.body;

    if (!address || eventId === undefined || !eventTitle || !endTime) {
      res.status(400).json({ error: "Missing required fields: address, eventId, eventTitle, endTime" });
      return;
    }

    const user = getOrCreateUser(address);

    // TODO: Create FHE encrypted inputs and call createAuction on contract
    // For now, just validate and return

    console.log(`[api] Auction creation requested: seller=${user.id} event=${eventId} title="${eventTitle}"`);

    res.json({
      userId: user.id,
      eventId: Number(eventId),
      eventTitle,
      endTime: Number(endTime),
      status: "pending_fhe",
    });
  } catch (err) {
    console.error("[api] POST /create-auction error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Cancel Auction ──

app.post("/cancel-auction", (req, res) => {
  try {
    const { address, auctionId } = req.body;

    if (!address || auctionId === undefined) {
      res.status(400).json({ error: "Missing required fields: address, auctionId" });
      return;
    }

    const user = getUserByAddress(address);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // TODO: Verify user is the seller, then call cancelAuction on contract

    console.log(`[api] Cancel requested: auction=${auctionId} by=${user.id}`);

    res.json({
      userId: user.id,
      auctionId: Number(auctionId),
      status: "pending",
    });
  } catch (err) {
    console.error("[api] POST /cancel-auction error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Withdraw ──

app.post("/withdraw", (req, res) => {
  try {
    const { address, amount } = req.body;

    if (!address || !amount) {
      res.status(400).json({ error: "Missing required fields: address, amount" });
      return;
    }

    const parsedAmount = BigInt(amount);
    if (parsedAmount <= 0n) {
      res.status(400).json({ error: "Amount must be positive" });
      return;
    }

    const user = getUserByAddress(address);
    if (!user) {
      res.status(404).json({ error: "User not found — no deposits detected" });
      return;
    }

    const withdrawalId = queueWithdrawal(user.id, amount);

    console.log(`[api] Withdrawal queued: user=${user.id} amount=${amount} id=${withdrawalId}`);

    res.json({
      withdrawalId,
      userId: user.id,
      amount,
      status: "queued",
    });
  } catch (err) {
    console.error("[api] POST /withdraw error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export function startApi(): void {
  const port = config.apiPort;
  app.listen(port, () => {
    console.log(`[api] HTTP server listening on port ${port}`);
  });
}
```

**Step 2: Add apiPort to config.ts**

Add to config object:
```ts
apiPort: Number(process.env.API_PORT || 3001),
```

**Step 3: Add script to package.json**

Add to scripts:
```json
"api": "tsx src/api.ts"
```

**Step 4: Verify TypeScript compiles**

Run: `cd apps/daemon && npx tsc --noEmit`

**Step 5: Commit**

```bash
git add apps/daemon/src/api.ts apps/daemon/src/config.ts apps/daemon/package.json
git commit -m "feat(daemon): add HTTP API for frontend proxy (bid, auction, withdraw)"
```

---

### Task 7: Update index.ts to start new services

**Files:**
- Modify: `apps/daemon/src/index.ts`

**Step 1: Add deposit watcher and API to the unified entry point**

```ts
/**
 * Private Streams Daemon — Unified Entry Point
 *
 * Runs all automation services:
 * 1. Settler — watches SettlementRequested, calls Gemini AI, settles on-chain
 * 2. Auction Closer — polls for expired auctions, closes them
 * 3. Reputation Resolver — watches SettlementResponse, resolves predictions
 * 4. Deposit Watcher — polls Private Token API for deposits
 * 5. HTTP API — frontend proxy for bids, auctions, withdrawals
 *
 * Can also run individual services via:
 *   pnpm settler / pnpm closer / pnpm resolver / pnpm deposit-watcher / pnpm api
 */

import { config } from "./config.js";
import { startSettler } from "./settler.js";
import { startAuctionCloser } from "./auction-closer.js";
import { startReputationResolver } from "./reputation-resolver.js";
import { startDepositWatcher } from "./deposit-watcher.js";
import { startApi } from "./api.js";

async function main() {
  console.log("=== Private Streams Daemon ===");
  console.log(`RPC: ${config.rpcUrl}`);
  console.log(`Prediction Market: ${config.predictionMarketAddress}`);
  console.log(`Secret Marketplace: ${config.secretMarketplaceAddress}`);
  console.log(`API Port: ${config.apiPort}`);
  console.log("");

  const services: Promise<void>[] = [];

  // Start settler if Gemini API key is configured
  if (config.geminiApiKey && config.predictionMarketAddress) {
    services.push(startSettler());
  } else {
    console.log("[daemon] Settler disabled — missing GEMINI_API_KEY or PREDICTION_MARKET_ADDRESS");
  }

  // Start auction closer if marketplace is configured
  if (config.secretMarketplaceAddress) {
    services.push(startAuctionCloser());
  } else {
    console.log("[daemon] Auction closer disabled — missing SECRET_MARKETPLACE_ADDRESS");
  }

  // Start reputation resolver if both contracts are configured
  if (config.predictionMarketAddress && config.secretMarketplaceAddress) {
    services.push(startReputationResolver());
  } else {
    console.log("[daemon] Reputation resolver disabled — missing contract addresses");
  }

  // Start deposit watcher
  if (config.privateKey) {
    services.push(startDepositWatcher());
  } else {
    console.log("[daemon] Deposit watcher disabled — missing PRIVATE_KEY");
  }

  // Always start HTTP API
  startApi();

  if (services.length === 0) {
    console.warn("[daemon] No background services configured. Only HTTP API is running.");
  }

  await Promise.all(services);

  // Keep alive
  console.log("\n[daemon] All services started. Press Ctrl+C to stop.");
}

main().catch((err) => {
  console.error("[daemon] Fatal error:", err);
  process.exit(1);
});
```

**Step 2: Verify TypeScript compiles**

Run: `cd apps/daemon && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add apps/daemon/src/index.ts
git commit -m "feat(daemon): wire deposit watcher and HTTP API into unified entry point"
```

---

### Task 8: Final config.ts consolidation

**Files:**
- Modify: `apps/daemon/src/config.ts`

All config additions from previous tasks should be consolidated. The final config.ts should look like:

```ts
import "dotenv/config";

export const config = {
  // Chain
  rpcUrl: process.env.RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
  privateKey: process.env.PRIVATE_KEY || "",
  chainId: 11155111,

  // Contracts
  predictionMarketAddress: process.env.PREDICTION_MARKET_ADDRESS || "",
  secretMarketplaceAddress: process.env.SECRET_MARKETPLACE_ADDRESS || "",
  confidentialUsdcAddress: process.env.CONFIDENTIAL_USDC_ADDRESS || "",

  // Gemini AI
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite-preview",

  // Firebase (audit trail)
  firebaseApiKey: process.env.FIREBASE_API_KEY || "",
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || "",

  // Ntfy notifications
  ntfyEnabled: process.env.NTFY_ENABLED !== "false",
  ntfyHost: process.env.NTFY_HOST || "https://api.insider-streams.com",
  ntfyTopic: process.env.NTFY_TOPIC || "private-streams-daemon",
  ntfyUser: process.env.NTFY_USER || "daemon",

  // Polling intervals
  auctionCloserIntervalMs: Number(process.env.AUCTION_CLOSER_INTERVAL_MS || 30_000),
  reputationResolverIntervalMs: Number(process.env.REPUTATION_RESOLVER_INTERVAL_MS || 60_000),
  depositWatcherIntervalMs: Number(process.env.DEPOSIT_WATCHER_INTERVAL_MS || 30_000),

  // HTTP API
  apiPort: Number(process.env.API_PORT || 3001),

  // SQLite
  dbPath: process.env.DB_PATH || "",
} as const;

export function requireConfig(keys: (keyof typeof config)[]): void {
  for (const key of keys) {
    if (!config[key]) {
      throw new Error(`Missing required config: ${key}. Set it in .env`);
    }
  }
}
```

**Step 1: Verify final config is correct**

Run: `cd apps/daemon && npx tsc --noEmit`

**Step 2: Commit**

```bash
git add apps/daemon/src/config.ts
git commit -m "chore(daemon): consolidate config with all new options"
```

---

### Task 9: Full build verification

**Step 1: Run TypeScript check**

```bash
cd apps/daemon && npx tsc --noEmit
```
Expected: 0 errors

**Step 2: Run turbo build for the workspace**

```bash
cd /Users/adoll/projects/private-streams && pnpm turbo run build --filter=@private-streams/daemon
```
Expected: Build succeeds

**Step 3: Verify daemon starts (dry run)**

```bash
cd apps/daemon && timeout 5 pnpm start 2>&1 || true
```
Expected: Prints banner, starts services (or warns about missing config), then times out

---

## Summary of Files

| File | Action | Purpose |
|---|---|---|
| `apps/daemon/src/abis.ts` | Rewrite | Update ABIs for Phase 9 contract |
| `apps/daemon/src/auction-closer.ts` | Modify (1 line) | Fix getAuction index |
| `apps/daemon/src/config.ts` | Modify | Add dbPath, apiPort, depositWatcherIntervalMs |
| `apps/daemon/src/db.ts` | Create | SQLite schema, user/bid/withdrawal helpers |
| `apps/daemon/src/deposit-watcher.ts` | Create | Poll Private Token API for deposits |
| `apps/daemon/src/api.ts` | Create | Express HTTP API for frontend proxy |
| `apps/daemon/src/index.ts` | Rewrite | Wire new services into unified entry |
| `apps/daemon/package.json` | Modify | Add dependencies |

## Known TODOs (deferred to next PR)

1. **FHE encrypted input creation** — The `depositFor`, `withdrawFor`, `placeBid`, and `createAuction` contract calls require `fhevmjs` to create encrypted inputs. This is a significant integration that requires:
   - Adding `fhevmjs` as a dependency
   - Creating an FHE helper module
   - Connecting to the Zama gateway
   - This is deferred to a follow-up task once the HTTP API structure is validated

2. **EIP-712 signature verification** — The HTTP API should verify user signatures to authenticate requests. Deferred until frontend integration.

3. **Withdrawal handler** — Processing the `withdrawal_queue` by calling `withdrawFor` + Private Token API transfer. Depends on FHE integration.
