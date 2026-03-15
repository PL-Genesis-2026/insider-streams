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

    CREATE TABLE IF NOT EXISTS secrets (
      auction_id INTEGER PRIMARY KEY,
      seller_id TEXT NOT NULL,
      secret_data_cid TEXT NOT NULL,
      secret_data_key TEXT,
      secret_data TEXT,
      event_data TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_bids_auction_status ON bids(auction_id, status);

  `);

  // Migrations for existing DBs
  const cols = db.prepare("PRAGMA table_info(secrets)").all() as { name: string }[];
  const colNames = new Set(cols.map((c) => c.name));
  if (!colNames.has("secret_data")) {
    db.exec("ALTER TABLE secrets ADD COLUMN secret_data TEXT");
  }
  if (!colNames.has("event_data")) {
    db.exec("ALTER TABLE secrets ADD COLUMN event_data TEXT");
  }

  // Filecoin attachment columns
  const filecoinCols = [
    ["piece_cid", "TEXT"],
    ["retrieval_url", "TEXT"],
    ["copies_json", "TEXT"],
    ["file_name", "TEXT"],
    ["content_type", "TEXT"],
    ["file_size_bytes", "INTEGER"],
    ["encrypted_file_size_bytes", "INTEGER"],
    ["encrypted_secret_key", "TEXT"],
    ["encryption_algorithm", "TEXT"],
    ["encrypted_file_name", "TEXT"],
    ["file_md5", "TEXT"],
  ] as const;
  for (const [col, type] of filecoinCols) {
    if (!colNames.has(col)) {
      db.exec(`ALTER TABLE secrets ADD COLUMN ${col} ${type}`);
    }
  }
}

// ── Pseudonymous ID generation ──

const ADJECTIVES = [
  "bold", "calm", "dark", "fast", "keen", "loud", "pale", "rich", "warm", "wise",
  "blue", "cold", "deep", "fair", "gray", "high", "kind", "mild", "pure", "soft",
];
const ANIMALS = [
  "bear", "crow", "deer", "dove", "duck", "eagle", "fox", "hare", "hawk", "lynx",
  "mole", "newt", "orca", "puma", "rook", "seal", "swan", "toad", "vole", "wolf",
];

export function generatePseudonymousId(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  const num = Math.floor(Math.random() * 100);
  return `${adj}-${animal}-${num}`;
}

// ── User helpers ──

export interface User {
  userId: string;
  address: string;
}

interface UserRow {
  id: string;
  address: string;
}

export function getUserByAddress(address: string): User | undefined {
  const db = getDb();
  const row = db.prepare("SELECT id, address FROM users WHERE address = ? COLLATE NOCASE").get(address.toLowerCase()) as UserRow | undefined;
  return row ? { userId: row.id, address: row.address } : undefined;
}

export function getUserById(userId: string): User | undefined {
  const db = getDb();
  const row = db.prepare("SELECT id, address FROM users WHERE id = ?").get(userId) as UserRow | undefined;
  return row ? { userId: row.id, address: row.address } : undefined;
}

export function getOrCreateUser(address: string): User & { created: boolean } {
  const existing = getUserByAddress(address);
  if (existing) return { ...existing, created: false };

  const db = getDb();
  let id = generatePseudonymousId();
  for (let i = 0; i < 10; i++) {
    try {
      db.prepare("INSERT INTO users (id, address) VALUES (?, ?)").run(id, address.toLowerCase());
      return { userId: id, address: address.toLowerCase(), created: true };
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

export interface Bid {
  id: number;
  auctionId: number;
  bidderId: string;
  amount: string;
  status: string;
  txHash: string | null;
}

interface BidRow {
  id: number;
  auction_id: number;
  bidder_id: string;
  amount: string;
  status: string;
  tx_hash: string | null;
}

function toBid(row: BidRow): Bid {
  return {
    id: row.id,
    auctionId: row.auction_id,
    bidderId: row.bidder_id,
    amount: row.amount,
    status: row.status,
    txHash: row.tx_hash,
  };
}

export function recordBid(auctionId: number, bidderId: string, amount: string, txHash?: string): Bid {
  const db = getDb();
  const result = db.transaction(() => {
    // Mark previous active bid as outbid
    db.prepare("UPDATE bids SET status = 'outbid' WHERE auction_id = ? AND status = 'active'").run(auctionId);

    // Insert new active bid
    const insert = db.prepare(
      "INSERT INTO bids (auction_id, bidder_id, amount, status, tx_hash) VALUES (?, ?, ?, 'active', ?)",
    ).run(auctionId, bidderId, amount, txHash ?? null);

    return { id: Number(insert.lastInsertRowid) };
  })();

  return {
    id: result.id,
    auctionId,
    bidderId,
    amount,
    status: "active",
    txHash: txHash ?? null,
  };
}

export function getActiveBid(auctionId: number): Bid | undefined {
  const db = getDb();
  const row = db.prepare(
    "SELECT id, auction_id, bidder_id, amount, status, tx_hash FROM bids WHERE auction_id = ? AND status = 'active'",
  ).get(auctionId) as BidRow | undefined;
  return row ? toBid(row) : undefined;
}

export function getWonBid(auctionId: number): Bid | undefined {
  const db = getDb();
  const row = db.prepare(
    "SELECT id, auction_id, bidder_id, amount, status, tx_hash FROM bids WHERE auction_id = ? AND status = 'won'",
  ).get(auctionId) as BidRow | undefined;
  return row ? toBid(row) : undefined;
}

export function getActiveBidPreviousBidderId(auctionId: number): string | null {
  const db = getDb();
  // Get the most recent outbid entry for this auction (that's the previous bidder)
  const row = db.prepare(
    "SELECT bidder_id FROM bids WHERE auction_id = ? AND status = 'outbid' ORDER BY id DESC LIMIT 1",
  ).get(auctionId) as { bidder_id: string } | undefined;
  return row?.bidder_id ?? null;
}

export function updateBidTxHash(bidId: number, txHash: string): void {
  const db = getDb();
  db.prepare("UPDATE bids SET tx_hash = ? WHERE id = ?").run(txHash, bidId);
}

export function markBidFailed(bidId: number): void {
  const db = getDb();
  db.transaction(() => {
    // Get the auction for this bid so we can restore the previous bid
    const bid = db.prepare("SELECT auction_id FROM bids WHERE id = ?").get(bidId) as { auction_id: number } | undefined;
    db.prepare("UPDATE bids SET status = 'failed' WHERE id = ?").run(bidId);

    // Restore the most recent outbid entry for this auction back to active,
    // since the on-chain state still has the previous bid as current.
    if (bid) {
      db.prepare(
        "UPDATE bids SET status = 'active' WHERE id = (SELECT id FROM bids WHERE auction_id = ? AND status = 'outbid' ORDER BY id DESC LIMIT 1)",
      ).run(bid.auction_id);
    }
  })();
}

export function markBidsForAuction(auctionId: number, status: "won" | "refunded" | "cancelled"): number {
  const db = getDb();
  const result = db.prepare("UPDATE bids SET status = ? WHERE auction_id = ? AND status = 'active'").run(status, auctionId);
  return result.changes;
}

// ── Withdrawal helpers ──

export interface Withdrawal {
  id: number;
  userId: string;
  amount: string;
  status: string;
}

interface WithdrawalRow {
  id: number;
  user_id: string;
  amount: string;
  status: string;
}

export function queueWithdrawal(userId: string, amount: string): number {
  const db = getDb();
  const result = db.prepare("INSERT INTO withdrawal_queue (user_id, amount) VALUES (?, ?)").run(userId, amount);
  return Number(result.lastInsertRowid);
}

export function getPendingWithdrawals(): Withdrawal[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT id, user_id, amount, status FROM withdrawal_queue WHERE status = 'pending' ORDER BY id",
  ).all() as WithdrawalRow[];
  return rows.map((r) => ({ id: r.id, userId: r.user_id, amount: r.amount, status: r.status }));
}

export function completeWithdrawal(id: number): void {
  const db = getDb();
  db.prepare("UPDATE withdrawal_queue SET status = 'completed', completed_at = datetime('now') WHERE id = ?").run(id);
}

export function failWithdrawal(id: number): void {
  const db = getDb();
  db.prepare("UPDATE withdrawal_queue SET status = 'failed' WHERE id = ?").run(id);
}

// ── Bid query helpers ──

interface BidHistoryRow {
  auction_id: number;
  amount: string;
  status: string;
  tx_hash: string | null;
  created_at: string;
}

export interface BidHistoryEntry {
  auctionId: number;
  amount: string;
  status: string;
  txHash: string | null;
  createdAt: string;
}

export function getBidsByUserId(userId: string): BidHistoryEntry[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT auction_id, amount, status, tx_hash, created_at FROM bids WHERE bidder_id = ? ORDER BY id DESC",
  ).all(userId) as BidHistoryRow[];
  return rows.map((r) => ({
    auctionId: r.auction_id,
    amount: r.amount,
    status: r.status,
    txHash: r.tx_hash,
    createdAt: r.created_at,
  }));
}

// ── Secret helpers ──

export interface Secret {
  auctionId: number;
  sellerId: string;
  secretDataCid: string;
  secretDataKey: string | null;
  secretData: string | null;
  eventData: string | null;
  // Filecoin attachment fields
  pieceCid: string | null;
  retrievalUrl: string | null;
  copiesJson: string | null;
  fileName: string | null;
  contentType: string | null;
  fileSizeBytes: number | null;
  encryptedFileSizeBytes: number | null;
  encryptedSecretKey: string | null;
  encryptionAlgorithm: string | null;
  encryptedFileName: string | null;
  fileMd5: string | null;
}

interface SecretRow {
  auction_id: number;
  seller_id: string;
  secret_data_cid: string;
  secret_data_key: string | null;
  secret_data: string | null;
  event_data: string | null;
  piece_cid: string | null;
  retrieval_url: string | null;
  copies_json: string | null;
  file_name: string | null;
  content_type: string | null;
  file_size_bytes: number | null;
  encrypted_file_size_bytes: number | null;
  encrypted_secret_key: string | null;
  encryption_algorithm: string | null;
  encrypted_file_name: string | null;
  file_md5: string | null;
}

export function insertSecret(
  auctionId: number,
  sellerId: string,
  secretDataCid: string,
  secretDataKey?: string,
  secretData?: string,
  eventData?: string,
): void {
  const db = getDb();
  db.prepare(
    "INSERT OR REPLACE INTO secrets (auction_id, seller_id, secret_data_cid, secret_data_key, secret_data, event_data) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(auctionId, sellerId, secretDataCid, secretDataKey ?? null, secretData ?? null, eventData ?? null);
}

export function getSecretsByAuctionIds(auctionIds: number[]): Secret[] {
  if (auctionIds.length === 0) return [];
  const db = getDb();
  const placeholders = auctionIds.map(() => "?").join(",");
  const rows = db.prepare(
    `SELECT auction_id, seller_id, secret_data_cid, secret_data_key, secret_data, event_data,
            piece_cid, retrieval_url, copies_json, file_name, content_type,
            file_size_bytes, encrypted_file_size_bytes, encrypted_secret_key,
            encryption_algorithm, encrypted_file_name, file_md5
     FROM secrets WHERE auction_id IN (${placeholders})`,
  ).all(...auctionIds) as SecretRow[];
  return rows.map((r) => ({
    auctionId: r.auction_id,
    sellerId: r.seller_id,
    secretDataCid: r.secret_data_cid,
    secretDataKey: r.secret_data_key,
    secretData: r.secret_data,
    eventData: r.event_data,
    pieceCid: r.piece_cid,
    retrievalUrl: r.retrieval_url,
    copiesJson: r.copies_json,
    fileName: r.file_name,
    contentType: r.content_type,
    fileSizeBytes: r.file_size_bytes,
    encryptedFileSizeBytes: r.encrypted_file_size_bytes,
    encryptedSecretKey: r.encrypted_secret_key,
    encryptionAlgorithm: r.encryption_algorithm,
    encryptedFileName: r.encrypted_file_name,
    fileMd5: r.file_md5,
  }));
}

export function insertSecretWithFilecoin(
  auctionId: number,
  sellerId: string,
  secretDataCid: string,
  secretDataKey: string | undefined,
  secretData: string | undefined,
  eventData: string | undefined,
  filecoin: {
    pieceCid: string;
    retrievalUrl: string;
    copiesJson: string;
    fileName: string;
    contentType: string | null;
    fileSizeBytes: number;
    encryptedFileSizeBytes: number;
    encryptedSecretKey: string;
    encryptionAlgorithm: string;
    encryptedFileName: string;
    fileMd5: string;
  },
): void {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO secrets (
      auction_id, seller_id, secret_data_cid, secret_data_key, secret_data, event_data,
      piece_cid, retrieval_url, copies_json, file_name, content_type,
      file_size_bytes, encrypted_file_size_bytes, encrypted_secret_key,
      encryption_algorithm, encrypted_file_name, file_md5
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    auctionId,
    sellerId,
    secretDataCid,
    secretDataKey ?? null,
    secretData ?? null,
    eventData ?? null,
    filecoin.pieceCid,
    filecoin.retrievalUrl,
    filecoin.copiesJson,
    filecoin.fileName,
    filecoin.contentType,
    filecoin.fileSizeBytes,
    filecoin.encryptedFileSizeBytes,
    filecoin.encryptedSecretKey,
    filecoin.encryptionAlgorithm,
    filecoin.encryptedFileName,
    filecoin.fileMd5,
  );
}

