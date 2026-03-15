/**
 * Programmatic daemon API helpers for E2E test setup.
 *
 * Signs requests the same way the frontend does:
 *   message = fast-json-stable-stringify({ ...fields, timestamp })
 *   signature = personal_sign(message)
 *   POST body = { ...fields, timestamp, signature }
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import stringify from "fast-json-stable-stringify";
import { type PrivateKeyAccount } from "viem/accounts";
import type { TestState } from "./global-setup";

const DAEMON_URL = process.env.DAEMON_URL || "http://localhost:3001";

/** Sign a payload and POST it to the daemon. */
export async function signedDaemonRequest(
  path: string,
  account: PrivateKeyAccount,
  fields: Record<string, unknown> = {},
  timeoutMs = 120_000,
): Promise<{ status: number; data: Record<string, unknown> }> {
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = { ...fields, timestamp };
  const message = stringify(payload);
  const signature = await account.signMessage({ message });

  const res = await fetch(`${DAEMON_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, signature }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await res.json();
  return { status: res.status, data };
}

/** Deposit funds for a test account. Returns immediately (FHE tx is async). */
export async function depositFunds(
  account: PrivateKeyAccount,
  amountUsdc: number,
) {
  const amount = String(amountUsdc * 1_000_000); // 6 decimals
  return signedDaemonRequest("/deposit", account, { amount });
}

/** Create an auction via daemon API. Waits for on-chain FHE tx. */
export async function createTestAuction(
  account: PrivateKeyAccount,
  opts: {
    eventId: string;
    eventTitle: string;
    privateLeg: "yes" | "no";
    secretPayload: string;
    durationSeconds: number;
  },
) {
  const { createHash, randomBytes } = await import("node:crypto");
  const timestamp = Math.floor(Date.now() / 1000);
  const endTime = String(timestamp + opts.durationSeconds);
  const secretDataKey = "0x" + randomBytes(32).toString("hex");
  const secretDataCid =
    "0x" + createHash("sha256").update(opts.secretPayload).digest("hex");

  return signedDaemonRequest("/create-auction", account, {
    eventId: opts.eventId,
    eventTitle: opts.eventTitle,
    endTime,
    prediction: opts.privateLeg === "yes" ? "true" : "false",
    secretDataCid,
    secretDataKey,
    secretPayload: opts.secretPayload,
  });
}

/** Create an auction with a file attachment via daemon API (multipart). */
export async function createTestAuctionWithFile(
  account: PrivateKeyAccount,
  opts: {
    eventId: string;
    eventTitle: string;
    privateLeg: "yes" | "no";
    fileContent: string;
    fileName: string;
    durationSeconds: number;
  },
) {
  const timestamp = Math.floor(Date.now() / 1000);
  const endTime = String(timestamp + opts.durationSeconds);

  const payload = {
    eventId: opts.eventId,
    eventTitle: opts.eventTitle,
    endTime,
    prediction: opts.privateLeg === "yes" ? "true" : "false",
    timestamp,
  };
  const message = stringify(payload);
  const signature = await account.signMessage({ message });

  const form = new FormData();
  form.set("eventId", opts.eventId);
  form.set("eventTitle", opts.eventTitle);
  form.set("endTime", endTime);
  form.set("prediction", opts.privateLeg === "yes" ? "true" : "false");
  form.set("timestamp", String(timestamp));
  form.set("signature", signature);
  form.set("secretPayload", ""); // empty — file is the primary payload
  form.set(
    "file",
    new Blob([opts.fileContent], { type: "text/plain" }),
    opts.fileName,
  );

  const res = await fetch(`${DAEMON_URL}/create-auction`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(180_000),
  });
  const data = await res.json();
  return { status: res.status, data };
}

/** Read .test-state.json written by global-setup. Returns null if missing. */
export function readTestState(): TestState | null {
  try {
    return JSON.parse(
      readFileSync(resolve(__dirname, ".test-state.json"), "utf-8"),
    );
  } catch {
    return null;
  }
}

const SUBGRAPH_URL =
  process.env.NEXT_PUBLIC_SUBGRAPH_URL ||
  "https://gateway.thegraph.com/api/subgraphs/id/BttcQ7pVTEz7L94PgnhkFJCY33K5Vwk1vhffckmjgf5f";
const SUBGRAPH_API_KEY = process.env.NEXT_PUBLIC_SUBGRAPH_API_KEY || "";

/** Query the subgraph for open auctions (not cancelled/closed). */
export async function findOpenAuctions(
  limit = 20,
  minRemainingSeconds = 0,
): Promise<{ auctionId: string; sellerId: string; endTime: string }[]> {
  const now = Math.floor(Date.now() / 1000);
  const minEndTime = now + minRemainingSeconds;
  const query = `{
    auctionCreateds(
      where: { endTime_gt: "${minEndTime}" }
      first: ${limit}
      orderBy: endTime
      orderDirection: asc
    ) {
      auctionId
      sellerId
      endTime
    }
    auctionCancelleds(first: 1000) { auctionId }
    auctionCloseds(first: 1000) { auctionId }
  }`;

  try {
    const res = await fetch(SUBGRAPH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(SUBGRAPH_API_KEY ? { Authorization: `Bearer ${SUBGRAPH_API_KEY}` } : {}),
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json()) as {
      data?: {
        auctionCreateds?: {
          auctionId: string;
          sellerId: string;
          endTime: string;
        }[];
        auctionCancelleds?: { auctionId: string }[];
        auctionCloseds?: { auctionId: string }[];
      };
    };
    const created = json.data?.auctionCreateds ?? [];
    const cancelledIds = new Set(
      (json.data?.auctionCancelleds ?? []).map((a) => a.auctionId),
    );
    const closedIds = new Set(
      (json.data?.auctionCloseds ?? []).map((a) => a.auctionId),
    );
    const open = created.filter(
      (a) => !cancelledIds.has(a.auctionId) && !closedIds.has(a.auctionId),
    );
    console.log(`[helpers] Found ${created.length} auctions, ${cancelledIds.size} cancelled, ${closedIds.size} closed, ${open.length} open`);
    return open;
  } catch (err) {
    console.log(`[helpers] Subgraph query failed: ${err}`);
    return [];
  }
}

/** Poll daemon /balance until it reaches minBalance (raw 6-decimal units). */
export async function waitForBalance(
  account: PrivateKeyAccount,
  minBalance: bigint,
  timeoutMs = 120_000,
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { data } = await signedDaemonRequest("/balance", account);
    const balance = BigInt((data.balance as string) ?? "0");
    if (balance >= minBalance) return balance.toString();
    await new Promise((r) => setTimeout(r, 5_000));
  }
  throw new Error(`Balance did not reach ${minBalance} within ${timeoutMs}ms`);
}
