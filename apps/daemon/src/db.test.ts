/**
 * Database Unit Tests
 *
 * Tests bid status tracking logic directly (SQLite layer).
 * These functions are called by background services (auction-closer),
 * not by API endpoints, so they can't be tested through the HTTP API.
 *
 * Usage: cd apps/daemon && pnpm test:db
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, unlinkSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Set DB_PATH before importing db.ts so it uses a temp database
const tmpDir = mkdtempSync(join(tmpdir(), "daemon-db-test-"));
const dbPath = join(tmpDir, "test.db");
process.env.DB_PATH = dbPath;

// Now import — db.ts reads DB_PATH from config at module load time
const {
  getDb,
  getOrCreateUser,
  recordBid,
  getActiveBid,
  markBidsForAuction,
  getBidsByUserId,
  insertSecret,
  insertSecretWithFilecoin,
  getSecretsByAuctionIds,
} = await import("./db.js");

after(() => {
  // Close DB and clean up temp files
  try {
    getDb().close();
  } catch { /* ignore */ }
  for (const suffix of ["", "-wal", "-shm"]) {
    try { unlinkSync(`${dbPath}${suffix}`); } catch { /* ignore */ }
  }
  try { rmdirSync(tmpDir); } catch { /* ignore */ }
});

// ════════════════════════════════════════════════════════════════════════════
// Tests
// ════════════════════════════════════════════════════════════════════════════

describe("recordBid — outbid tracking", () => {
  it("first bid on an auction is active", () => {
    const user = getOrCreateUser("0xaaaa000000000000000000000000000000000001");
    const bid = recordBid(1, user.userId, "1000000");
    assert.equal(bid.status, "active");
    assert.equal(bid.auctionId, 1);

    const active = getActiveBid(1);
    assert.ok(active);
    assert.equal(active.bidderId, user.userId);
    assert.equal(active.amount, "1000000");
  });

  it("second bid marks first as outbid", () => {
    const user1 = getOrCreateUser("0xaaaa000000000000000000000000000000000001");
    const user2 = getOrCreateUser("0xaaaa000000000000000000000000000000000002");

    // user1 already has a bid on auction 1 from previous test
    recordBid(1, user2.userId, "2000000");

    // user2 is now active
    const active = getActiveBid(1);
    assert.ok(active);
    assert.equal(active.bidderId, user2.userId);
    assert.equal(active.amount, "2000000");

    // user1's bid should be outbid
    const user1Bids = getBidsByUserId(user1.userId);
    const auction1Bids = user1Bids.filter((b) => b.auctionId === 1);
    assert.equal(auction1Bids.length, 1);
    assert.equal(auction1Bids[0].status, "outbid");
  });

  it("third bid marks second as outbid too", () => {
    const user3 = getOrCreateUser("0xaaaa000000000000000000000000000000000003");
    recordBid(1, user3.userId, "3000000");

    const active = getActiveBid(1);
    assert.ok(active);
    assert.equal(active.bidderId, user3.userId);

    // Previous bidder should be outbid
    const user2 = getOrCreateUser("0xaaaa000000000000000000000000000000000002");
    const user2Bids = getBidsByUserId(user2.userId);
    const auction1Bids = user2Bids.filter((b) => b.auctionId === 1);
    assert.equal(auction1Bids[0].status, "outbid");
  });

  it("bids on different auctions are independent", () => {
    const userA = getOrCreateUser("0xaaaa000000000000000000000000000000000004");
    const userB = getOrCreateUser("0xaaaa000000000000000000000000000000000005");

    recordBid(10, userA.userId, "500");
    recordBid(20, userB.userId, "600");

    // Both should be active on their respective auctions
    const activeA = getActiveBid(10);
    const activeB = getActiveBid(20);
    assert.ok(activeA);
    assert.ok(activeB);
    assert.equal(activeA.bidderId, userA.userId);
    assert.equal(activeB.bidderId, userB.userId);
  });
});

describe("markBidsForAuction — auction close (won)", () => {
  it("marks active bid as won", () => {
    const user = getOrCreateUser("0xbbbb000000000000000000000000000000000001");
    recordBid(100, user.userId, "5000000");

    // Verify bid is active
    const before = getActiveBid(100);
    assert.ok(before);
    assert.equal(before.status, "active");

    // Simulate auction close
    markBidsForAuction(100, "won");

    // Active bid should now be null (no more active bids)
    const after = getActiveBid(100);
    assert.equal(after, undefined);

    // User's bid should show as won
    const bids = getBidsByUserId(user.userId);
    const auction100Bids = bids.filter((b) => b.auctionId === 100);
    assert.equal(auction100Bids.length, 1);
    assert.equal(auction100Bids[0].status, "won");
  });

  it("does not affect outbid entries", () => {
    const user1 = getOrCreateUser("0xbbbb000000000000000000000000000000000002");
    const user2 = getOrCreateUser("0xbbbb000000000000000000000000000000000003");

    recordBid(101, user1.userId, "1000");
    recordBid(101, user2.userId, "2000"); // user1 becomes outbid

    // Now close auction — only active bid (user2) should become won
    markBidsForAuction(101, "won");

    const user1Bids = getBidsByUserId(user1.userId).filter((b) => b.auctionId === 101);
    const user2Bids = getBidsByUserId(user2.userId).filter((b) => b.auctionId === 101);

    assert.equal(user1Bids[0].status, "outbid", "outbid stays outbid");
    assert.equal(user2Bids[0].status, "won", "active becomes won");
  });

  it("does not affect bids on other auctions", () => {
    const user = getOrCreateUser("0xbbbb000000000000000000000000000000000004");

    recordBid(102, user.userId, "1000");
    recordBid(103, user.userId, "2000");

    // Close only auction 102
    markBidsForAuction(102, "won");

    const bids = getBidsByUserId(user.userId);
    const a102 = bids.filter((b) => b.auctionId === 102);
    const a103 = bids.filter((b) => b.auctionId === 103);

    assert.equal(a102[0].status, "won");
    assert.equal(a103[0].status, "active", "other auction untouched");
  });
});

describe("markBidsForAuction — auction cancel (cancelled)", () => {
  it("marks active bid as cancelled", () => {
    const user = getOrCreateUser("0xcccc000000000000000000000000000000000001");
    recordBid(200, user.userId, "3000000");

    markBidsForAuction(200, "cancelled");

    const active = getActiveBid(200);
    assert.equal(active, undefined);

    const bids = getBidsByUserId(user.userId).filter((b) => b.auctionId === 200);
    assert.equal(bids[0].status, "cancelled");
  });

  it("does not affect outbid entries on cancellation", () => {
    const user1 = getOrCreateUser("0xcccc000000000000000000000000000000000002");
    const user2 = getOrCreateUser("0xcccc000000000000000000000000000000000003");

    recordBid(201, user1.userId, "1000");
    recordBid(201, user2.userId, "2000"); // user1 outbid

    markBidsForAuction(201, "cancelled");

    const u1Bids = getBidsByUserId(user1.userId).filter((b) => b.auctionId === 201);
    const u2Bids = getBidsByUserId(user2.userId).filter((b) => b.auctionId === 201);

    assert.equal(u1Bids[0].status, "outbid", "outbid stays outbid");
    assert.equal(u2Bids[0].status, "cancelled", "active becomes cancelled");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Secret + Filecoin attachment tests
// ════════════════════════════════════════════════════════════════════════════

describe("insertSecret — basic secret storage", () => {
  it("inserts and retrieves a simple secret", () => {
    const user = getOrCreateUser("0xeeee000000000000000000000000000000000001");
    insertSecret(5000, user.userId, "0xabc123", "0xkey456", "my secret text", '{"event":"test"}');

    const secrets = getSecretsByAuctionIds([5000]);
    assert.equal(secrets.length, 1);
    assert.equal(secrets[0].auctionId, 5000);
    assert.equal(secrets[0].sellerId, user.userId);
    assert.equal(secrets[0].secretDataCid, "0xabc123");
    assert.equal(secrets[0].secretDataKey, "0xkey456");
    assert.equal(secrets[0].secretData, "my secret text");
    assert.equal(secrets[0].eventData, '{"event":"test"}');
    // Filecoin fields should be null
    assert.equal(secrets[0].pieceCid, null);
    assert.equal(secrets[0].retrievalUrl, null);
    assert.equal(secrets[0].fileName, null);
    assert.equal(secrets[0].encryptedSecretKey, null);
  });
});

describe("insertSecretWithFilecoin — full Filecoin metadata", () => {
  it("stores and retrieves all Filecoin fields", () => {
    const user = getOrCreateUser("0xeeee000000000000000000000000000000000002");
    insertSecretWithFilecoin(
      5001,
      user.userId,
      "0xsha256hash",
      "0xsecretkey",
      "plain text payload",
      '{"event":"filecoin-test"}',
      {
        pieceCid: "bafypiece123",
        retrievalUrl: "https://filecoin.example/retrieve/abc",
        copiesJson: '[{"providerId":"sp1","role":"primary"}]',
        fileName: "report.txt",
        contentType: "text/plain",
        fileSizeBytes: 1024,
        encryptedFileSizeBytes: 2048,
        encryptedSecretKey: "base64encryptedkey==",
        encryptionAlgorithm: "AES-256-GCM+scrypt envelope v1",
        encryptedFileName: "report.txt.enc",
        fileMd5: "d41d8cd98f00b204e9800998ecf8427e",
      },
    );

    const secrets = getSecretsByAuctionIds([5001]);
    assert.equal(secrets.length, 1);
    const s = secrets[0];
    assert.equal(s.auctionId, 5001);
    assert.equal(s.sellerId, user.userId);
    assert.equal(s.secretDataCid, "0xsha256hash");
    assert.equal(s.secretData, "plain text payload");
    assert.equal(s.pieceCid, "bafypiece123");
    assert.equal(s.retrievalUrl, "https://filecoin.example/retrieve/abc");
    assert.equal(s.fileName, "report.txt");
    assert.equal(s.contentType, "text/plain");
    assert.equal(s.fileSizeBytes, 1024);
    assert.equal(s.encryptedFileSizeBytes, 2048);
    assert.equal(s.encryptedSecretKey, "base64encryptedkey==");
    assert.equal(s.encryptionAlgorithm, "AES-256-GCM+scrypt envelope v1");
    assert.equal(s.encryptedFileName, "report.txt.enc");
    assert.equal(s.fileMd5, "d41d8cd98f00b204e9800998ecf8427e");
    assert.equal(s.copiesJson, '[{"providerId":"sp1","role":"primary"}]');
  });

  it("retrieves multiple secrets including mixed types", () => {
    const user = getOrCreateUser("0xeeee000000000000000000000000000000000003");
    insertSecret(5002, user.userId, "0xplain", "0xkey");
    insertSecretWithFilecoin(5003, user.userId, "0xfile", "0xkey2", undefined, undefined, {
      pieceCid: "bafypiece456",
      retrievalUrl: "https://filecoin.example/retrieve/def",
      copiesJson: "[]",
      fileName: "data.txt",
      contentType: "text/plain",
      fileSizeBytes: 512,
      encryptedFileSizeBytes: 1024,
      encryptedSecretKey: "enc==",
      encryptionAlgorithm: "AES-256-GCM+scrypt envelope v1",
      encryptedFileName: "data.txt.enc",
      fileMd5: "abc123",
    });

    const secrets = getSecretsByAuctionIds([5002, 5003, 9999]);
    assert.equal(secrets.length, 2);

    const plain = secrets.find((s) => s.auctionId === 5002)!;
    assert.equal(plain.pieceCid, null);

    const filecoin = secrets.find((s) => s.auctionId === 5003)!;
    assert.equal(filecoin.pieceCid, "bafypiece456");
    assert.equal(filecoin.fileName, "data.txt");
  });
});

describe("markBidsForAuction — no-op cases", () => {
  it("no-op on auction with no bids", () => {
    // Should not throw
    markBidsForAuction(9999, "won");
    const active = getActiveBid(9999);
    assert.equal(active, undefined);
  });

  it("no-op on auction where all bids already resolved", () => {
    const user = getOrCreateUser("0xdddd000000000000000000000000000000000001");
    recordBid(300, user.userId, "1000");
    markBidsForAuction(300, "won");

    // Call again — should not throw or change anything
    markBidsForAuction(300, "cancelled");

    const bids = getBidsByUserId(user.userId).filter((b) => b.auctionId === 300);
    assert.equal(bids[0].status, "won", "already-won bid stays won");
  });
});
