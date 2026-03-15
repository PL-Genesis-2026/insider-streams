/**
 * Bid status updates — abstraction over local SQLite vs remote API.
 *
 * When the daemon runs as a single process (DAEMON_MODE=all), bid status
 * updates go directly to SQLite via markBidsForAuction().
 *
 * When the daemon is split across VPSes to avoid Zama FHE relayer rate
 * limiting (DAEMON_MODE=workers on one box, DAEMON_MODE=api on another),
 * the workers can't access the API's SQLite file. Instead they call
 * POST /internal/mark-bids on the API, authenticated by a shared secret
 * (INTERNAL_API_KEY). Each VPS gets its own IP and Zama rate limit bucket.
 */

import { config } from "./config.js";
import { markBidsForAuction } from "./db.js";

/**
 * Mark all active bids for an auction with the given status.
 * Routes to local SQLite or remote API based on DAEMON_MODE.
 */
export async function markBids(
  auctionId: number,
  status: "won" | "cancelled",
): Promise<void> {
  if (config.daemonMode === "workers") {
    await markBidsRemote(auctionId, status);
  } else {
    markBidsForAuction(auctionId, status);
  }
}

/**
 * Call the API's internal endpoint to update bid status remotely.
 * Used when DAEMON_MODE=workers and SQLite lives on a different machine.
 */
async function markBidsRemote(
  auctionId: number,
  status: "won" | "cancelled",
): Promise<void> {
  const { apiInternalUrl, internalApiKey } = config;
  if (!apiInternalUrl || !internalApiKey) {
    throw new Error(
      "DAEMON_MODE=workers requires API_INTERNAL_URL and INTERNAL_API_KEY to be set",
    );
  }

  const url = `${apiInternalUrl}/internal/mark-bids`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Key": internalApiKey,
    },
    body: JSON.stringify({ auctionId, status }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`markBidsRemote failed (${resp.status}): ${body}`);
  }

  const data = (await resp.json()) as { ok: boolean; updated: number };
  console.log(`[mark-bids] Remote update: auction=${auctionId} status=${status} updated=${data.updated}`);
}
