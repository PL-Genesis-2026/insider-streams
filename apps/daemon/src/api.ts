/**
 * HTTP API
 *
 * Express server that the frontend proxies user actions through.
 * All endpoints that access user data require signature authentication:
 * the client signs a payload with their wallet, and the server recovers
 * the signer's address to identify them. No address appears in URLs.
 *
 * Signing convention (matches @private-streams/common):
 *   payload = { ...fields, timestamp }
 *   message = fast-json-stable-stringify(payload)
 *   signature = personal_sign(message)
 *   POST body = { ...payload, signature }
 */

import express, { type Request, type Response } from "express";
import { verifySignedRequest, mockUsdcAbi } from "@private-streams/common";
import { config } from "./config.js";
import {
  getOrCreateUser,
  getUserByAddress,
  recordBid,
  getActiveBid,
  updateBidTxHash,
  markBidFailed,
  getBidsByUserId,
  insertSecret,
  getSecretsByAuctionIds,
} from "./db.js";
import * as marketplace from "./marketplace.js";
import { getPublicClient, getWalletClient } from "./provider.js";

export function startApi(): void {
  const app = express();
  app.use(express.json());

  // CORS for development (frontend on :3000, daemon on :3001)
  app.use((_req: Request, res: Response, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (_req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // ---------------------------------------------------------------------------
  // GET /health — no auth required
  // ---------------------------------------------------------------------------
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // ---------------------------------------------------------------------------
  // POST /user — signature-authenticated
  //
  // Body: { timestamp, signature }
  // Returns the caller's pseudonymous ID (creates one if new).
  // ---------------------------------------------------------------------------
  app.post("/user", async (req: Request, res: Response) => {
    try {
      const result = await verifySignedRequest(req.body);
      if (!result.ok) {
        res.status(result.status).json({ error: result.error, code: result.code });
        return;
      }

      const user = getOrCreateUser(result.payload.userAddress);
      res.json({
        userId: user.userId,
        address: user.address,
        created: user.created,
      });
    } catch (err) {
      console.error("[api] POST /user error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /balance — signature-authenticated
  //
  // Body: { timestamp, signature }
  // Returns the caller's on-chain encrypted balance (decrypted by daemon).
  // ---------------------------------------------------------------------------
  app.post("/balance", async (req: Request, res: Response) => {
    try {
      const result = await verifySignedRequest(req.body);
      if (!result.ok) {
        res.status(result.status).json({ error: result.error, code: result.code });
        return;
      }

      const user = getUserByAddress(result.payload.userAddress);
      if (!user) {
        res.json({ userId: null, balance: "0" });
        return;
      }

      // Read on-chain encrypted balance and decrypt via Zama relayer
      const balance = await marketplace.getOnChainBalance(user.userId);
      res.json({ userId: user.userId, balance: balance.toString() });
    } catch (err) {
      console.error("[api] POST /balance error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /bid — signature-authenticated
  //
  // Body: { auctionId, amount, timestamp, signature }
  // ---------------------------------------------------------------------------
  app.post("/bid", async (req: Request, res: Response) => {
    try {
      const result = await verifySignedRequest<{ auctionId: string; amount: string }>(req.body);
      if (!result.ok) {
        res.status(result.status).json({ error: result.error, code: result.code });
        return;
      }

      const { userAddress, auctionId, amount } = result.payload;

      if (auctionId == null) {
        res.status(400).json({ error: "Missing auctionId" });
        return;
      }

      let parsedAmount: bigint;
      try {
        parsedAmount = BigInt(amount);
      } catch {
        res.status(400).json({ error: "Invalid amount" });
        return;
      }
      if (parsedAmount <= 0n) {
        res.status(400).json({ error: "Amount must be greater than 0" });
        return;
      }

      const user = getOrCreateUser(userAddress);

      // Read previous bidder from contract (always correct, free view call)
      let previousBidderId = "";
      try {
        const mp = marketplace.getMarketplace();
        const auction = await mp.read.getAuction([BigInt(auctionId)]);
        previousBidderId = auction[3] || ""; // currentBidderId
      } catch {
        // Auction may not exist yet — proceed without previousBidderId
      }

      const bid = recordBid(Number(auctionId), user.userId, String(amount));

      // Submit on-chain asynchronously — respond immediately so the user isn't
      // blocked for 15-30s waiting for Sepolia confirmation + FHE encryption.
      // The contract validates that the new bid exceeds the current bid on-chain.
      marketplace
        .placeBid(Number(auctionId), user.userId, previousBidderId, parsedAmount)
        .then((txHash) => {
          updateBidTxHash(bid.id, txHash);
          console.log(`[api] Bid ${bid.id} confirmed on-chain: ${txHash}`);
        })
        .catch((err) => {
          console.error(`[api] Bid ${bid.id} on-chain submission failed:`, err);
          markBidFailed(bid.id);
        });

      res.json({
        bidId: bid.id,
        auctionId: bid.auctionId,
        amount: bid.amount,
        status: "recorded",
      });
    } catch (err) {
      console.error("[api] POST /bid error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /create-auction — signature-authenticated
  //
  // Body: { eventId, eventTitle, endTime, prediction,
  //         [secretDataCid, secretDataKey] | [secretPayload],
  //         timestamp, signature }
  //
  // Either provide (secretDataCid + secretDataKey) for pre-encrypted data,
  // or (secretPayload) for plaintext — daemon generates CID/key from plaintext.
  // ---------------------------------------------------------------------------
  app.post("/create-auction", async (req: Request, res: Response) => {
    try {
      const result = await verifySignedRequest<{
        eventId: string;
        eventTitle: string;
        endTime: string;
        prediction?: string;
        secretDataCid?: string;
        secretDataKey?: string;
        secretPayload?: string;
      }>(req.body);
      if (!result.ok) {
        res.status(result.status).json({ error: result.error, code: result.code });
        return;
      }

      const { userAddress, eventId, eventTitle, endTime, prediction, secretPayload } = result.payload;
      let { secretDataCid, secretDataKey } = result.payload;

      if (eventId == null) {
        res.status(400).json({ error: "Missing eventId" });
        return;
      }
      if (!eventTitle) {
        res.status(400).json({ error: "Missing eventTitle" });
        return;
      }
      if (endTime == null) {
        res.status(400).json({ error: "Missing endTime" });
        return;
      }

      const user = getOrCreateUser(userAddress);

      // If secretPayload is provided (plaintext), generate CID/key from it
      if (secretPayload && !secretDataCid) {
        const { createHash, randomBytes } = await import("node:crypto");
        const keyBytes = randomBytes(32);
        secretDataKey = "0x" + keyBytes.toString("hex");
        secretDataCid = "0x" + createHash("sha256").update(secretPayload).digest("hex");
      }

      // Submit on-chain — wait for the tx so we can return auctionId + txHash
      if (prediction != null && secretDataCid && secretDataKey) {
        try {
          const { txHash, auctionId } = await marketplace.createAuction(
            user.userId,
            Number(eventId),
            eventTitle,
            Number(endTime),
            prediction === "true" || prediction === "1",
            secretDataCid,
            BigInt(secretDataKey),
          );
          console.log(`[api] Auction created on-chain: auctionId=${auctionId}, tx=${txHash}`);
          insertSecret(auctionId, user.userId, secretDataCid!, secretDataKey);

          res.json({
            success: true,
            auctionId: String(auctionId),
            sellerId: user.userId,
            txHash,
          });
        } catch (err) {
          console.error(`[api] Auction creation on-chain failed:`, err);
          res.status(500).json({
            success: false,
            error: err instanceof Error ? err.message : "On-chain auction creation failed",
            code: "FHE_TX_FAILED",
          });
        }
        return;
      }

      res.status(400).json({
        success: false,
        error: "Missing prediction or secret data",
        code: "MISSING_FIELDS",
      });
    } catch (err) {
      console.error("[api] POST /create-auction error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /withdraw — signature-authenticated
  //
  // Body: { amount, timestamp, signature }
  // ---------------------------------------------------------------------------
  app.post("/withdraw", async (req: Request, res: Response) => {
    try {
      const result = await verifySignedRequest<{ amount: string }>(req.body);
      if (!result.ok) {
        res.status(result.status).json({ error: result.error, code: result.code });
        return;
      }

      const { userAddress, amount } = result.payload;

      let parsedAmount: bigint;
      try {
        parsedAmount = BigInt(amount);
      } catch {
        res.status(400).json({ error: "Invalid amount" });
        return;
      }
      if (parsedAmount <= 0n) {
        res.status(400).json({ error: "Amount must be greater than 0" });
        return;
      }

      const user = getUserByAddress(userAddress);
      if (!user) {
        res.status(404).json({ error: "User not found — no deposits detected" });
        return;
      }

      // Submit on-chain directly (async — like /bid)
      let withdrawalId = `wd-${Date.now()}`;
      marketplace
        .withdrawFor(user.userId, parsedAmount)
        .then((txHash) => {
          console.log(`[api] Withdrawal ${withdrawalId} confirmed on-chain: ${txHash}`);
        })
        .catch((err) => {
          console.error(`[api] Withdrawal ${withdrawalId} on-chain failed:`, err);
        });

      res.json({
        withdrawalId,
        userId: user.userId,
        amount: parsedAmount.toString(),
        status: "pending",
      });
    } catch (err) {
      console.error("[api] POST /withdraw error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /deposit — signature-authenticated
  //
  // Body: { txHash, amount, timestamp, signature }
  // User-initiated deposit: user sends FHEConfidentialUSDC to platform EOA,
  // then calls this endpoint to trigger depositFor on the marketplace.
  // ---------------------------------------------------------------------------
  app.post("/deposit", async (req: Request, res: Response) => {
    try {
      const result = await verifySignedRequest<{ txHash: string; amount: string }>(req.body);
      if (!result.ok) {
        res.status(result.status).json({ error: result.error, code: result.code });
        return;
      }

      const { userAddress, amount } = result.payload;

      let parsedAmount: bigint;
      try {
        parsedAmount = BigInt(amount);
      } catch {
        res.status(400).json({ error: "Invalid amount" });
        return;
      }
      if (parsedAmount <= 0n) {
        res.status(400).json({ error: "Amount must be greater than 0" });
        return;
      }

      const user = getOrCreateUser(userAddress);

      // Submit on-chain asynchronously
      marketplace
        .depositFor(user.userId, parsedAmount)
        .then((txHash) => {
          console.log(`[api] Deposit for ${user.userId} confirmed on-chain: ${txHash}`);
        })
        .catch((err) => {
          console.error(`[api] Deposit for ${user.userId} on-chain failed:`, err);
        });

      res.json({
        userId: user.userId,
        amount: parsedAmount.toString(),
        status: "pending",
      });
    } catch (err) {
      console.error("[api] POST /deposit error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /bids — signature-authenticated
  //
  // Body: { timestamp, signature }
  // Returns the caller's bid history from SQLite.
  // ---------------------------------------------------------------------------
  app.post("/bids", async (req: Request, res: Response) => {
    try {
      const result = await verifySignedRequest(req.body);
      if (!result.ok) {
        res.status(result.status).json({ error: result.error, code: result.code });
        return;
      }

      const user = getUserByAddress(result.payload.userAddress);
      if (!user) {
        res.json({ bids: [] });
        return;
      }

      const bids = getBidsByUserId(user.userId);
      res.json({ bids });
    } catch (err) {
      console.error("[api] POST /bids error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /seller — signature-authenticated
  //
  // Body: { timestamp, signature }
  // Returns whether the caller is a registered seller (on-chain check).
  // ---------------------------------------------------------------------------
  app.post("/seller", async (req: Request, res: Response) => {
    try {
      const result = await verifySignedRequest(req.body);
      if (!result.ok) {
        res.status(result.status).json({ error: result.error, code: result.code });
        return;
      }

      const user = getUserByAddress(result.payload.userAddress);
      if (!user) {
        res.json({ isSeller: false, userId: null });
        return;
      }

      const mp = marketplace.getMarketplace();
      const seller = await mp.read.getSeller([user.userId]);
      res.json({
        isSeller: seller.registered,
        userId: user.userId,
        reputationScore: seller.reputationScore.toString(),
      });
    } catch (err) {
      console.error("[api] POST /seller error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /secrets — signature-authenticated
  //
  // Body: { auctionIds: number[], timestamp, signature }
  // Returns secret data for auctions the caller created or won.
  // The secretDataKey is only included if the caller is the seller or winning bidder.
  // ---------------------------------------------------------------------------
  app.post("/secrets", async (req: Request, res: Response) => {
    try {
      const result = await verifySignedRequest<{ auctionIds: number[] }>(req.body);
      if (!result.ok) {
        res.status(result.status).json({ error: result.error, code: result.code });
        return;
      }

      const { userAddress, auctionIds } = result.payload;

      if (!Array.isArray(auctionIds) || auctionIds.length === 0) {
        res.json({ secrets: [] });
        return;
      }

      const user = getUserByAddress(userAddress);
      if (!user) {
        res.json({ secrets: [] });
        return;
      }

      const secrets = getSecretsByAuctionIds(auctionIds.map(Number));

      // For each secret, check if the caller has access to the key
      const results = secrets.map((s) => {
        const isSeller = s.sellerId === user.userId;
        // Check if user is the winning bidder (active bid = winner after auction closes)
        const activeBid = getActiveBid(s.auctionId);
        const isWinner = activeBid?.bidderId === user.userId;
        const hasAccess = isSeller || isWinner;

        return {
          auctionId: s.auctionId,
          secretDataCid: s.secretDataCid,
          secretDataKey: hasAccess ? s.secretDataKey : null,
          hasAccess,
        };
      });

      res.json({ secrets: results });
    } catch (err) {
      console.error("[api] POST /secrets error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /dashboard — signature-authenticated
  //
  // Body: { timestamp, signature }
  // Returns the caller's bid history (from SQLite).
  // ---------------------------------------------------------------------------
  app.post("/dashboard", async (req: Request, res: Response) => {
    try {
      const result = await verifySignedRequest(req.body);
      if (!result.ok) {
        res.status(result.status).json({ error: result.error, code: result.code });
        return;
      }

      const user = getUserByAddress(result.payload.userAddress);
      if (!user) {
        res.json({ userId: null, bids: [] });
        return;
      }

      const bids = getBidsByUserId(user.userId);
      res.json({ userId: user.userId, bids });
    } catch (err) {
      console.error("[api] POST /dashboard error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /faucet — signature-authenticated
  //
  // Body: { timestamp, signature }
  // Mints test MockUSDC to the caller's address. Development only.
  // ---------------------------------------------------------------------------
  app.post("/faucet", async (req: Request, res: Response) => {
    try {
      const result = await verifySignedRequest(req.body);
      if (!result.ok) {
        res.status(result.status).json({ error: result.error, code: result.code });
        return;
      }

      if (!config.privateKey) {
        res.status(503).json({ error: "Faucet not configured — missing PRIVATE_KEY" });
        return;
      }

      const mintAmount = BigInt(1000) * BigInt(10 ** 6); // 1000 USDC (6 decimals)
      const hash = await getWalletClient().writeContract({
        address: config.confidentialUsdcAddress as `0x${string}`,
        abi: mockUsdcAbi,
        functionName: "mint",
        args: [result.payload.userAddress as `0x${string}`, mintAmount],
      });
      const receipt = await getPublicClient().waitForTransactionReceipt({ hash });

      res.json({
        txHash: receipt.transactionHash,
        amount: mintAmount.toString(),
        address: result.payload.userAddress,
      });
    } catch (err) {
      console.error("[api] POST /faucet error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ---------------------------------------------------------------------------
  // Start server
  // ---------------------------------------------------------------------------
  app.listen(config.apiPort, () => {
    console.log(`[api] Listening on port ${config.apiPort}`);
  });
}

// Run standalone
if (process.argv[1]?.endsWith("api.ts") || process.argv[1]?.endsWith("api.js")) {
  startApi();
}
