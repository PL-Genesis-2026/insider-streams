/**
 * Deposit Watcher Daemon
 *
 * Polls the Chainlink Private Token API for incoming transfers to the
 * platform EOA. When a new deposit is detected, looks up (or creates)
 * the sender's pseudonymous user ID in SQLite and logs the deposit.
 *
 * TODO: FHE encrypted input creation + on-chain `depositFor()` contract
 * call is deferred. Currently this service only detects and logs deposits.
 * A future iteration will:
 *   1. Create an FHE encrypted input for the deposit amount
 *   2. Call `depositFor(userId, encryptedAmount, inputProof)` on FHESecretMarketplace
 *   3. Mark the deposit as completed in the database
 *
 * Replaces: cre-workflows/user-balance-recording-fallback (deposit half)
 *
 * Run: pnpm deposit-watcher (or tsx src/deposit-watcher.ts)
 */

import { ethers } from "ethers";
import { PrivateTokenApiClient } from "@private-streams/chainlink-private-token-api-client";
import type { Transaction } from "@private-streams/chainlink-private-token-api-client";
import { config, requireConfig } from "./config.js";
import { getOrCreateUser, getDepositCursor, setDepositCursor } from "./db.js";
import { sendNotification } from "./notify.js";
import * as marketplace from "./marketplace.js";

const LOG_PREFIX = "[deposit-watcher]";

/**
 * Derive the platform EOA address from the configured private key.
 * This is the address that users send private token transfers to.
 */
function getPlatformAddress(): string {
  return new ethers.Wallet(config.privateKey).address;
}

/**
 * Process a single incoming transfer: look up (or create) the sender's
 * pseudonymous user ID and log the deposit.
 */
async function processIncomingTransfer(tx: Transaction): Promise<void> {
  const senderAddress = tx.sender?.toLowerCase();
  if (!senderAddress) {
    console.warn(`${LOG_PREFIX} Skipping transfer ${tx.id} — no sender address`);
    return;
  }

  // Look up or create pseudonymous user for this sender
  const user = getOrCreateUser(senderAddress);

  const amountFormatted = formatAmount(tx.amount);
  console.log(
    `${LOG_PREFIX} Deposit detected: ${amountFormatted} USDC from ${senderAddress} (user: ${user.userId}), tx: ${tx.id}`,
  );

  // Submit on-chain deposit
  try {
    const txHash = await marketplace.depositFor(user.userId, BigInt(tx.amount));
    console.log(`${LOG_PREFIX} depositFor confirmed: ${txHash}`);
  } catch (err) {
    console.error(`${LOG_PREFIX} depositFor failed for user ${user.userId}:`, err);
  }

  await sendNotification(
    `Deposit: ${amountFormatted} USDC`,
    `User ${user.userId} deposited ${amountFormatted} USDC\ntx: ${tx.id}`,
  );
}

/**
 * Format a raw amount string (6 decimals for USDC) into a human-readable value.
 */
function formatAmount(amount: string): string {
  try {
    return ethers.formatUnits(amount, 6);
  } catch {
    return amount;
  }
}

let _client: PrivateTokenApiClient | null = null;

function getClient(): PrivateTokenApiClient {
  if (!_client) {
    _client = new PrivateTokenApiClient(config.privateKey);
  }
  return _client;
}

/**
 * Main processing loop: fetches transactions from the Private Token API
 * starting from the saved cursor, filters for incoming transfers, and
 * processes each one.
 */
export async function processDeposits(): Promise<void> {
  const client = getClient();
  const cursor = getDepositCursor();

  if (cursor) {
    console.log(`${LOG_PREFIX} Resuming from cursor: ${cursor}`);
  }

  try {
    const response = await client.listTransactions({
      limit: 50,
      cursor: cursor || undefined,
    });

    const { transactions, has_more, next_cursor } = response;

    if (transactions.length === 0) {
      return;
    }

    console.log(`${LOG_PREFIX} Fetched ${transactions.length} transaction(s), has_more=${has_more}`);

    // Filter for incoming transfers to the platform EOA
    const incomingDeposits = transactions.filter(
      (tx) =>
        tx.type === "transfer" &&
        tx.is_incoming === true,
    );

    if (incomingDeposits.length > 0) {
      console.log(`${LOG_PREFIX} Found ${incomingDeposits.length} incoming deposit(s)`);

      for (const tx of incomingDeposits) {
        try {
          await processIncomingTransfer(tx);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`${LOG_PREFIX} Error processing transfer ${tx.id}:`, msg);
        }
      }
    }

    // Save cursor for next poll so we don't reprocess these transactions
    if (next_cursor) {
      setDepositCursor(next_cursor);
      console.log(`${LOG_PREFIX} Saved cursor: ${next_cursor}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${LOG_PREFIX} Error fetching transactions:`, msg);
  }
}

/**
 * Start the deposit watcher: run processDeposits immediately, then on interval.
 */
export async function startDepositWatcher(): Promise<void> {
  requireConfig(["privateKey"]);

  const platformAddress = getPlatformAddress();
  console.log(`${LOG_PREFIX} Platform EOA: ${platformAddress}`);
  console.log(`${LOG_PREFIX} Poll interval: ${config.depositWatcherIntervalMs}ms`);

  // Run immediately on startup
  await processDeposits();

  // Then poll on interval
  setInterval(async () => {
    try {
      await processDeposits();
    } catch (err) {
      console.error(`${LOG_PREFIX} Cycle error:`, err instanceof Error ? err.message : err);
    }
  }, config.depositWatcherIntervalMs);
}

// Run standalone
if (process.argv[1]?.endsWith("deposit-watcher.ts") || process.argv[1]?.endsWith("deposit-watcher.js")) {
  startDepositWatcher().catch((err) => {
    console.error(`${LOG_PREFIX} Fatal error:`, err);
    process.exit(1);
  });
}
