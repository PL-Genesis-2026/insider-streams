/**
 * Programmatic daemon API helpers for E2E test setup.
 *
 * Signs requests the same way the frontend does:
 *   message = fast-json-stable-stringify({ ...fields, timestamp })
 *   signature = personal_sign(message)
 *   POST body = { ...fields, timestamp, signature }
 */
import stringify from "fast-json-stable-stringify";
import { type PrivateKeyAccount } from "viem/accounts";

const DAEMON_URL = "http://localhost:3001";

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
