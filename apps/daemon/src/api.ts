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
import multer from "multer";
import { createHash, randomBytes } from "node:crypto";
import { decodeEventLog } from "viem";
import { verifySignedRequest, fheConfidentialUsdcAbi, fheSecretMarketplaceAbi, PLATFORM_EOA_ADDRESS } from "@private-streams/common";
import { config } from "./config.js";
import {
  getOrCreateUser,
  getUserByAddress,
  recordBid,
  getActiveBid,
  getWonBid,
  updateBidTxHash,
  markBidFailed,
  markBidsForAuction,
  getBidsByUserId,
  insertSecret,
  insertSecretWithFilecoin,
  getSecretsByAuctionIds,
} from "./db.js";
import * as marketplace from "./marketplace.js";
import { getPublicClient, getWalletClient, waitForReceipt } from "./provider.js";
import { withAdminLock } from "./admin-lock.js";
import { validateUploadedFile } from "./file-validation.js";
import { isFilecoinConfigured, uploadEncryptedToFilecoin } from "./filecoin.js";
import { encryptWithKek, decryptWithKek } from "./crypto.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes },
});

const jsonMiddleware = express.json();

export function startApi(): void {
  const app = express();
  // NOTE: No global express.json() — applied per-route to avoid consuming
  // the body stream before multer can parse multipart requests.

  // Request logging
  app.use((req: Request, res: Response, next) => {
    const start = Date.now();
    res.on("finish", () => {
      console.log(`[api] ${req.method} ${req.path} → ${res.statusCode} (${Date.now() - start}ms)`);
    });
    next();
  });

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
  app.post("/user", jsonMiddleware, async (req: Request, res: Response) => {
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
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[api] POST /user error:", msg);
      res.status(500).json({ error: msg });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /balance — signature-authenticated
  //
  // Body: { timestamp, signature }
  // Returns the caller's on-chain encrypted balance (decrypted by daemon).
  // ---------------------------------------------------------------------------
  app.post("/balance", jsonMiddleware, async (req: Request, res: Response) => {
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

      // Read on-chain encrypted balance and decrypt via Zama relayer.
      // If decryption fails (e.g. relayer down), return balance as null
      // so the frontend can still allow bidding (contract validates on-chain).
      try {
        const balance = await marketplace.getOnChainBalance(user.userId);
        console.log(`[api] Balance for ${user.userId}: ${balance}`);
        res.json({ userId: user.userId, balance: balance.toString() });
      } catch (decryptErr) {
        const msg = decryptErr instanceof Error ? decryptErr.message : String(decryptErr);
        console.warn(`[api] Balance decryption failed for ${user.userId}: ${msg}`);
        res.json({ userId: user.userId, balance: null, balanceUnavailable: true, error: msg });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[api] POST /balance error:", msg);
      res.status(500).json({ error: msg });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /bid — signature-authenticated
  //
  // Body: { auctionId, amount, timestamp, signature }
  // ---------------------------------------------------------------------------
  app.post("/bid", jsonMiddleware, async (req: Request, res: Response) => {
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

      // Read auction from contract to get previousBidderId and check self-bid
      let previousBidderId = "";
      try {
        const mp = marketplace.getMarketplace();
        const auction = await mp.read.getAuction([BigInt(auctionId)]);
        const sellerId = auction[0]; // sellerId
        if (sellerId === user.userId) {
          res.status(400).json({ error: "You cannot bid on your own auction", code: "SELF_BID" });
          return;
        }
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
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[api] POST /bid error:", msg);
      res.status(500).json({ error: msg });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /create-auction — signature-authenticated
  //
  // Accepts either:
  //   - Multipart FormData: file field + form fields
  //   - JSON body: { eventId, eventTitle, endTime, prediction,
  //                  [secretDataCid, secretDataKey] | [secretPayload],
  //                  timestamp, signature }
  // ---------------------------------------------------------------------------
  app.post("/create-auction", upload.single("file"), jsonMiddleware, async (req: Request, res: Response) => {
    try {
      // For multipart requests, multer populates req.body with form fields.
      // For JSON requests, express.json() populates req.body.
      // In both cases, req.body is an object. FormData fields arrive as strings.
      const rawBody = req.body ?? {};

      // Coerce timestamp to number (FormData sends strings)
      if (typeof rawBody.timestamp === "string") {
        rawBody.timestamp = Number(rawBody.timestamp);
      }

      const result = await verifySignedRequest<{
        eventId: string;
        eventTitle: string;
        endTime: string;
        prediction?: string;
        secretDataCid?: string;
        secretDataKey?: string;
        secretPayload?: string;
      }>(rawBody);
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
      const file = (req as Request & { file?: Express.Multer.File }).file;

      // ── File upload path ──
      if (file) {
        const validation = validateUploadedFile(
          file.buffer,
          file.originalname,
          file.mimetype,
        );
        if (!validation.ok) {
          res.status(400).json({ error: validation.error, code: "FILE_VALIDATION_FAILED" });
          return;
        }

        // SHA256 of plaintext → on-chain commitment
        secretDataCid = "0x" + createHash("sha256").update(file.buffer).digest("hex");
        const keyBytes = randomBytes(32);
        secretDataKey = "0x" + keyBytes.toString("hex");

        // Try Filecoin upload
        if (isFilecoinConfigured()) {
          try {
            const metadata = await uploadEncryptedToFilecoin(
              file.buffer,
              file.originalname,
              file.mimetype,
            );

            // Submit on-chain
            if (prediction != null) {
              const { txHash, auctionId } = await marketplace.createAuction(
                user.userId,
                Number(eventId),
                eventTitle,
                Number(endTime),
                prediction === "true" || prediction === "1",
                secretDataCid,
                BigInt(secretDataKey),
              );

              const eventDataJson = JSON.stringify({
                marketplace: "insider-streams",
                event: eventTitle,
                marketId: Number(eventId),
                outcome: prediction === "true" || prediction === "1" ? "yes" : "no",
              });

              insertSecretWithFilecoin(
                auctionId,
                user.userId,
                secretDataCid,
                secretDataKey,
                secretPayload ?? undefined,
                eventDataJson,
                {
                  pieceCid: metadata.pieceCid,
                  retrievalUrl: metadata.retrievalUrl,
                  copiesJson: JSON.stringify(metadata.copies),
                  fileName: metadata.fileName,
                  contentType: metadata.contentType,
                  fileSizeBytes: Number(metadata.fileSizeBytes),
                  encryptedFileSizeBytes: Number(metadata.encryptedFileSizeBytes),
                  encryptedSecretKey: encryptWithKek(metadata.encryptionKey),
                  encryptionAlgorithm: metadata.encryptionAlgorithm,
                  encryptedFileName: metadata.encryptedFileName,
                  fileMd5: metadata.fileMd5,
                },
              );

              res.json({
                success: true,
                auctionId: String(auctionId),
                sellerId: user.userId,
                txHash,
              });
              return;
            }
          } catch (err) {
            console.error("[api] Filecoin upload failed:", err);
            res.status(502).json({
              success: false,
              error: `Filecoin upload failed: ${err instanceof Error ? err.message : String(err)}`,
              code: "FILECOIN_UPLOAD_FAILED",
            });
            return;
          }
        }
        // Filecoin not configured — fall through to text path using file content
      }

      // ── Text payload path (or file without Filecoin) ──
      // Only use file content as text fallback for actual text files — not binary (images, PDFs, etc.)
      const isTextFile = file ? /\.(txt|md|json)$/i.test(file.originalname) : false;
      const effectiveSecretPayload = secretPayload || (file && isTextFile ? file.buffer.toString("utf8") : undefined);

      // If secretPayload is provided (plaintext), generate CID/key from it
      if (effectiveSecretPayload && !secretDataCid) {
        const keyBytes = randomBytes(32);
        secretDataKey = "0x" + keyBytes.toString("hex");
        secretDataCid = "0x" + createHash("sha256").update(effectiveSecretPayload).digest("hex");
      }

      // If we have Filecoin and text payload, upload as .txt file
      if (effectiveSecretPayload && isFilecoinConfigured() && !file) {
        try {
          const textBuffer = Buffer.from(effectiveSecretPayload, "utf8");
          const metadata = await uploadEncryptedToFilecoin(
            textBuffer,
            "secret.txt",
            "text/plain",
          );

          if (prediction != null && secretDataCid && secretDataKey) {
            const { txHash, auctionId } = await marketplace.createAuction(
              user.userId,
              Number(eventId),
              eventTitle,
              Number(endTime),
              prediction === "true" || prediction === "1",
              secretDataCid,
              BigInt(secretDataKey),
            );

            const eventDataJson = JSON.stringify({
              marketplace: "insider-streams",
              event: eventTitle,
              marketId: Number(eventId),
              outcome: prediction === "true" || prediction === "1" ? "yes" : "no",
            });

            insertSecretWithFilecoin(
              auctionId,
              user.userId,
              secretDataCid,
              secretDataKey,
              effectiveSecretPayload,
              eventDataJson,
              {
                pieceCid: metadata.pieceCid,
                retrievalUrl: metadata.retrievalUrl,
                copiesJson: JSON.stringify(metadata.copies),
                fileName: "secret.txt",
                contentType: "text/plain",
                fileSizeBytes: textBuffer.byteLength,
                encryptedFileSizeBytes: Number(metadata.encryptedFileSizeBytes),
                encryptedSecretKey: encryptWithKek(metadata.encryptionKey),
                encryptionAlgorithm: metadata.encryptionAlgorithm,
                encryptedFileName: "secret.txt.enc",
                fileMd5: metadata.fileMd5,
              },
            );

            res.json({
              success: true,
              auctionId: String(auctionId),
              sellerId: user.userId,
              txHash,
            });
            return;
          }
        } catch (err) {
          // Filecoin failed for text — fall through to non-Filecoin path
          console.warn("[api] Filecoin text upload failed, falling back:", err);
        }
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
          const eventDataJson = JSON.stringify({
            marketplace: "insider-streams",
            event: eventTitle,
            marketId: Number(eventId),
            outcome: prediction === "true" || prediction === "1" ? "yes" : "no",
          });
          insertSecret(auctionId, user.userId, secretDataCid!, secretDataKey, effectiveSecretPayload ?? undefined, eventDataJson);

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
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[api] POST /create-auction error:", msg);
      res.status(500).json({ success: false, error: msg, code: "UNHANDLED_ERROR" });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /withdraw — signature-authenticated
  //
  // Body: { amount, timestamp, signature }
  // ---------------------------------------------------------------------------
  app.post("/withdraw", jsonMiddleware, async (req: Request, res: Response) => {
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

      // Verify user has sufficient on-chain balance before attempting withdrawal.
      // withdrawFor uses FHESafeMath.tryDecrease which silently transfers 0 on
      // insufficient balance (does NOT revert), so we must pre-check.
      const withdrawalId = `wd-${Date.now()}`;
      let balanceBefore: bigint;
      try {
        balanceBefore = await marketplace.getOnChainBalance(user.userId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[api] Withdrawal ${withdrawalId} balance check failed:`, msg);
        res.status(503).json({ error: "Could not verify balance — try again later" });
        return;
      }

      if (balanceBefore < parsedAmount) {
        res.status(400).json({
          error: `Insufficient balance: have ${balanceBefore.toString()}, need ${parsedAmount.toString()}`,
          code: "INSUFFICIENT_BALANCE",
        });
        return;
      }

      // Step 1: withdrawFor moves cUSDC from marketplace → admin wallet (async)
      // Step 2: mintPlaintext sends cUSDC to user's wallet
      (async () => {
        const txHash = await marketplace.withdrawFor(user.userId, parsedAmount);
        console.log(`[api] Withdrawal ${withdrawalId} step 1 (marketplace→admin) confirmed: ${txHash}`);

        // Send cUSDC from admin to user's wallet
        const sendHash = await withAdminLock(() =>
          getWalletClient().writeContract({
            address: config.confidentialUsdcAddress as `0x${string}`,
            abi: fheConfidentialUsdcAbi,
            functionName: "mintPlaintext",
            args: [userAddress as `0x${string}`, parsedAmount],
          }),
        );
        await waitForReceipt(sendHash);
        console.log(`[api] Withdrawal ${withdrawalId} step 2 (admin→user wallet) confirmed: ${sendHash}`);
      })().catch((err) => {
        console.error(`[api] Withdrawal ${withdrawalId} failed:`, err);
      });

      res.json({
        withdrawalId,
        userId: user.userId,
        amount: parsedAmount.toString(),
        status: "pending",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[api] POST /withdraw error:", msg);
      res.status(500).json({ error: msg });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /deposit — signature-authenticated
  //
  // Body: { txHash, amount, timestamp, signature }
  // User-initiated deposit: user sends FHEConfidentialUSDC to platform EOA,
  // then calls this endpoint to trigger depositFor on the marketplace.
  // ---------------------------------------------------------------------------
  // Replay protection: track processed deposit txHashes
  const processedDepositTxHashes = new Set<string>();

  app.post("/deposit", jsonMiddleware, async (req: Request, res: Response) => {
    try {
      const result = await verifySignedRequest<{ txHash: string; amount: string }>(req.body);
      if (!result.ok) {
        res.status(result.status).json({ error: result.error, code: result.code });
        return;
      }

      const { userAddress, txHash, amount } = result.payload;

      if (!txHash) {
        res.status(400).json({ error: "Missing txHash" });
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

      // Replay protection: reject duplicate txHash
      if (processedDepositTxHashes.has(txHash)) {
        res.status(409).json({ error: "Deposit already processed", code: "DUPLICATE_DEPOSIT" });
        return;
      }

      // Verify the on-chain transfer: confirm the tx exists, succeeded,
      // was sent to the cUSDC contract, and emitted a ConfidentialTransfer
      // from the signer to the platform EOA.
      // NOTE: The transfer amount is an encrypted euint64 handle (FHE privacy)
      // and cannot be verified from logs. We trust the client-supplied amount
      // because the on-chain FHE balance accounting is the ultimate source of
      // truth — depositFor will fail if the admin doesn't actually hold enough.
      const publicClient = getPublicClient();
      let receipt;
      try {
        receipt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(400).json({ error: `Could not find transaction: ${msg}`, code: "TX_NOT_FOUND" });
        return;
      }

      if (receipt.status !== "success") {
        res.status(400).json({ error: "Transaction failed on-chain", code: "TX_FAILED" });
        return;
      }

      // Verify the tx targeted the correct cUSDC contract
      const cUsdcAddress = config.confidentialUsdcAddress.toLowerCase();
      if (receipt.to?.toLowerCase() !== cUsdcAddress) {
        res.status(400).json({
          error: "Transaction was not sent to the cUSDC contract",
          code: "WRONG_CONTRACT",
        });
        return;
      }

      // Verify a ConfidentialTransfer event was emitted from the cUSDC contract
      // with from=signer and to=platformEOA
      const platformEoa = PLATFORM_EOA_ADDRESS.toLowerCase();
      const signerLower = userAddress.toLowerCase();
      let foundValidTransfer = false;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== cUsdcAddress) continue;
        try {
          const decoded = decodeEventLog({
            abi: fheConfidentialUsdcAbi,
            data: log.data,
            topics: log.topics,
          });
          if (
            decoded.eventName === "ConfidentialTransfer" &&
            "from" in decoded.args &&
            "to" in decoded.args &&
            (decoded.args.from as string).toLowerCase() === signerLower &&
            (decoded.args.to as string).toLowerCase() === platformEoa
          ) {
            foundValidTransfer = true;
            break;
          }
        } catch {
          // Not a matching event — skip
        }
      }

      if (!foundValidTransfer) {
        res.status(400).json({
          error: "No valid cUSDC transfer from your address to the platform was found in this transaction",
          code: "TRANSFER_NOT_FOUND",
        });
        return;
      }

      // Mark as processed before async work to prevent concurrent replays
      processedDepositTxHashes.add(txHash);

      const user = getOrCreateUser(userAddress);

      // User must have already transferred cUSDC to admin EOA on-chain.
      // depositFor transfers from admin → marketplace contract and credits user's balance.
      marketplace
        .depositFor(user.userId, parsedAmount)
        .then((depositTxHash) => {
          console.log(`[api] Deposit for ${user.userId} confirmed on-chain: ${depositTxHash}`);
        })
        .catch((err) => {
          console.error(`[api] Deposit for ${user.userId} on-chain failed:`, err);
          // Allow retry on failure
          processedDepositTxHashes.delete(txHash);
        });

      res.json({
        userId: user.userId,
        amount: parsedAmount.toString(),
        status: "pending",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[api] POST /deposit error:", msg);
      res.status(500).json({ error: msg });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /bids — signature-authenticated
  //
  // Body: { timestamp, signature }
  // Returns the caller's bid history from SQLite.
  // ---------------------------------------------------------------------------
  app.post("/bids", jsonMiddleware, async (req: Request, res: Response) => {
    try {
      // Strip unsigned fields before verification — frontend signs only { timestamp }
      const { auctionIds: _unused, ...signedBody } = req.body;
      const result = await verifySignedRequest(signedBody);
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
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[api] POST /bids error:", msg);
      res.status(500).json({ error: msg });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /seller — signature-authenticated
  //
  // Body: { timestamp, signature }
  // Returns whether the caller is a registered seller (on-chain check).
  // ---------------------------------------------------------------------------
  app.post("/seller", jsonMiddleware, async (req: Request, res: Response) => {
    try {
      const result = await verifySignedRequest(req.body);
      if (!result.ok) {
        res.status(result.status).json({ error: result.error, code: result.code });
        return;
      }

      const user = getOrCreateUser(result.payload.userAddress);

      const mp = marketplace.getMarketplace();
      const seller = await mp.read.getSeller([user.userId]);
      res.json({
        isSeller: seller.registered,
        userId: user.userId,
        reputationScore: seller.reputationScore.toString(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[api] POST /seller error:", msg);
      res.status(500).json({ error: msg });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /secrets — signature-authenticated
  //
  // Body: { auctionIds: number[], timestamp, signature }
  // Returns secret data for auctions the caller created or won.
  // The secretDataKey is only included if the caller is the seller or winning bidder.
  // ---------------------------------------------------------------------------
  app.post("/secrets", jsonMiddleware, async (req: Request, res: Response) => {
    try {
      // Extract auctionIds before signature verification — the frontend signs
      // only { timestamp } and passes auctionIds as an unsigned extra field.
      const { auctionIds: rawAuctionIds, ...signedBody } = req.body;
      const result = await verifySignedRequest(signedBody);
      if (!result.ok) {
        res.status(result.status).json({ error: result.error, code: result.code });
        return;
      }

      const { userAddress } = result.payload;
      const auctionIds: number[] = rawAuctionIds ?? [];

      if (!Array.isArray(auctionIds) || auctionIds.length === 0) {
        res.json({ secrets: [] });
        return;
      }

      const user = getOrCreateUser(userAddress);

      const secrets = getSecretsByAuctionIds(auctionIds.map(Number));

      // For each secret, check if the caller has access to the key
      const results = secrets.map((s) => {
        const isSeller = s.sellerId === user.userId;
        // Check if user is the winning bidder (bid status = "won" after auction closes)
        const wonBid = getWonBid(s.auctionId);
        const isWinner = wonBid?.bidderId === user.userId;
        const hasAccess = isSeller || isWinner;

        // Build file metadata if Filecoin data exists
        let file = null;
        if (s.retrievalUrl && s.fileName) {
          let decryptedKey: string | null = null;
          if (hasAccess && s.encryptedSecretKey) {
            try {
              decryptedKey = decryptWithKek(s.encryptedSecretKey);
            } catch (err) {
              console.warn(`[api] Failed to decrypt secret key for auction ${s.auctionId}:`, err);
            }
          }

          let copies: unknown[] = [];
          if (s.copiesJson) {
            try {
              copies = JSON.parse(s.copiesJson);
            } catch { /* ignore */ }
          }

          file = {
            encryptionKey: hasAccess ? decryptedKey : null,
            encryptionAlgorithm: s.encryptionAlgorithm,
            fileName: s.fileName,
            encryptedFileName: s.encryptedFileName,
            contentType: s.contentType,
            fileMd5: s.fileMd5,
            fileSizeBytes: s.fileSizeBytes != null ? String(s.fileSizeBytes) : null,
            encryptedFileSizeBytes: s.encryptedFileSizeBytes != null ? String(s.encryptedFileSizeBytes) : null,
            pieceCid: s.pieceCid,
            retrievalUrl: s.retrievalUrl,
            copies,
          };
        }

        return {
          auctionId: s.auctionId,
          secretDataCid: s.secretDataCid,
          secretDataKey: hasAccess ? s.secretDataKey : null,
          secretData: hasAccess ? s.secretData : null,
          eventData: hasAccess ? s.eventData : null,
          hasAccess,
          file,
        };
      });

      res.json({ secrets: results });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[api] POST /secrets error:", msg);
      res.status(500).json({ error: msg });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /dashboard — signature-authenticated
  //
  // Body: { timestamp, signature }
  // Returns the caller's bid history (from SQLite).
  // ---------------------------------------------------------------------------
  app.post("/dashboard", jsonMiddleware, async (req: Request, res: Response) => {
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
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[api] POST /dashboard error:", msg);
      res.status(500).json({ error: msg });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /faucet — signature-authenticated
  //
  // Body: { timestamp, signature }
  // Mints test MockUSDC to the caller's address. Development only.
  // ---------------------------------------------------------------------------
  app.post("/faucet", jsonMiddleware, async (req: Request, res: Response) => {
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

      const mintAmount = BigInt(1000) * BigInt(10 ** 6); // 1000 cUSDC (6 decimals)
      const mintHash = await withAdminLock(() =>
        getWalletClient().writeContract({
          address: config.confidentialUsdcAddress as `0x${string}`,
          abi: fheConfidentialUsdcAbi,
          functionName: "mintPlaintext",
          args: [result.payload.userAddress as `0x${string}`, mintAmount],
        }),
      );
      const mintReceipt = await waitForReceipt(mintHash);
      const txHash = mintReceipt.transactionHash;

      res.json({
        txHash,
        amount: mintAmount.toString(),
        address: result.payload.userAddress,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[api] POST /faucet error:", msg);
      res.status(500).json({ error: `Faucet mint failed: ${msg}` });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /admin-expire — signature-authenticated, admin-only
  //
  // Body: { auctionId, timestamp, signature }
  // Calls adminExpireAuction on-chain (sets endTime to now).
  // The auction-closer will then close it on the next pass.
  // ---------------------------------------------------------------------------
  app.post("/admin-expire", jsonMiddleware, async (req: Request, res: Response) => {
    try {
      const result = await verifySignedRequest(req.body);
      if (!result.ok) {
        res.status(result.status).json({ error: result.error, code: result.code });
        return;
      }

      // Admin-only gate
      if (result.payload.userAddress.toLowerCase() !== PLATFORM_EOA_ADDRESS.toLowerCase()) {
        res.status(403).json({ error: "Only the platform admin can expire auctions" });
        return;
      }

      const { auctionId } = req.body as { auctionId: string };
      if (!auctionId) {
        res.status(400).json({ error: "Missing auctionId" });
        return;
      }

      const txHash = await withAdminLock(() =>
        getWalletClient().writeContract({
          address: config.secretMarketplaceAddress as `0x${string}`,
          abi: fheSecretMarketplaceAbi,
          functionName: "adminExpireAuction",
          args: [BigInt(auctionId)],
        }),
      );
      const receipt = await waitForReceipt(txHash);

      console.log(`[api] Admin expired auction ${auctionId}, tx: ${receipt.transactionHash}`);
      res.json({ txHash: receipt.transactionHash, auctionId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[api] POST /admin-expire error:", msg);
      res.status(500).json({ error: `Admin expire failed: ${msg}` });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /internal/mark-bids — internal, API-key authenticated
  //
  // The daemon can be split across multiple VPSes (DAEMON_MODE=api on one,
  // DAEMON_MODE=workers on another) so that each machine gets its own IP and
  // its own Zama FHE relayer rate limit bucket. This prevents background
  // workers (settler, auction-closer, reputation-resolver) from consuming
  // Zama quota that the frontend-facing API needs for user operations like
  // balance checks, bids, and deposits.
  //
  // When split, the workers can't write to the API's SQLite database directly.
  // This endpoint lets them update bid status (won/cancelled) remotely after
  // closing auctions on-chain.
  //
  // Auth: X-Internal-Key header must match INTERNAL_API_KEY env var.
  // This is a simple shared secret — sufficient because:
  //   1. This endpoint is not user-facing (only called by our own workers)
  //   2. Both keys are managed by the same operator on machines we control
  //   3. Traffic goes over HTTPS (HAProxy terminates TLS)
  // ---------------------------------------------------------------------------
  app.post("/internal/mark-bids", jsonMiddleware, async (req: Request, res: Response) => {
    try {
      const key = req.headers["x-internal-key"];
      if (!config.internalApiKey || key !== config.internalApiKey) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { auctionId, status } = req.body as { auctionId: number; status: string };

      if (auctionId == null || typeof auctionId !== "number") {
        res.status(400).json({ error: "Missing or invalid auctionId" });
        return;
      }

      if (status !== "won" && status !== "cancelled") {
        res.status(400).json({ error: "Invalid status — must be 'won' or 'cancelled'" });
        return;
      }

      const updated = markBidsForAuction(auctionId, status);
      console.log(`[api] /internal/mark-bids: auction=${auctionId} status=${status} updated=${updated}`);
      res.json({ ok: true, updated });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[api] POST /internal/mark-bids error:", msg);
      res.status(500).json({ error: msg });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /internal/register-user — internal, API-key authenticated
  //
  // Called by scripts running on a separate VPS to register/get a user's
  // pseudonymous ID without going through signature auth. Keeps user
  // records in sync so scripts can submit on-chain txs directly while
  // the daemon tracks the user mapping.
  // ---------------------------------------------------------------------------
  app.post("/internal/register-user", jsonMiddleware, async (req: Request, res: Response) => {
    try {
      const key = req.headers["x-internal-key"];
      if (!config.internalApiKey || key !== config.internalApiKey) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      // Express req.body is `any` without middleware typing; fields validated below
      const { address } = req.body as { address: string };
      if (!address) {
        res.status(400).json({ error: "Missing address" });
        return;
      }

      const user = getOrCreateUser(address);
      res.json({ userId: user.userId, address: user.address, created: user.created });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[api] POST /internal/register-user error:", msg);
      res.status(500).json({ error: msg });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /internal/record-bid — internal, API-key authenticated
  //
  // Called by scripts to record a bid in SQLite after submitting it
  // on-chain directly. The daemon needs this record so the auction-closer
  // and reputation-resolver can mark bids as won/cancelled.
  // ---------------------------------------------------------------------------
  app.post("/internal/record-bid", jsonMiddleware, async (req: Request, res: Response) => {
    try {
      const key = req.headers["x-internal-key"];
      if (!config.internalApiKey || key !== config.internalApiKey) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      // Express req.body is `any` without middleware typing; fields validated below
      const { auctionId, bidderId, amount, txHash } = req.body as {
        auctionId: number;
        bidderId: string;
        amount: string;
        txHash?: string;
      };

      if (auctionId == null || typeof auctionId !== "number") {
        res.status(400).json({ error: "Missing or invalid auctionId" });
        return;
      }
      if (!bidderId) {
        res.status(400).json({ error: "Missing bidderId" });
        return;
      }
      if (!amount) {
        res.status(400).json({ error: "Missing amount" });
        return;
      }

      const bid = recordBid(auctionId, bidderId, amount, txHash);
      console.log(`[api] /internal/record-bid: auction=${auctionId} bidder=${bidderId} amount=${amount} bidId=${bid.id}`);
      res.json({ ok: true, bidId: bid.id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[api] POST /internal/record-bid error:", msg);
      res.status(500).json({ error: msg });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /internal/insert-secret — internal, API-key authenticated
  //
  // Called by scripts to store auction secret data in SQLite after
  // creating an auction on-chain directly.
  // ---------------------------------------------------------------------------
  app.post("/internal/insert-secret", jsonMiddleware, async (req: Request, res: Response) => {
    try {
      const key = req.headers["x-internal-key"];
      if (!config.internalApiKey || key !== config.internalApiKey) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      // Express req.body is `any` without middleware typing; fields validated below
      const { auctionId, sellerId, secretDataCid, secretDataKey, secretData, eventData } = req.body as {
        auctionId: number;
        sellerId: string;
        secretDataCid: string;
        secretDataKey?: string;
        secretData?: string;
        eventData?: string;
      };

      if (auctionId == null || typeof auctionId !== "number") {
        res.status(400).json({ error: "Missing or invalid auctionId" });
        return;
      }
      if (!sellerId) {
        res.status(400).json({ error: "Missing sellerId" });
        return;
      }
      if (!secretDataCid) {
        res.status(400).json({ error: "Missing secretDataCid" });
        return;
      }

      insertSecret(auctionId, sellerId, secretDataCid, secretDataKey, secretData, eventData);
      console.log(`[api] /internal/insert-secret: auction=${auctionId} seller=${sellerId}`);
      res.json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[api] POST /internal/insert-secret error:", msg);
      res.status(500).json({ error: msg });
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
