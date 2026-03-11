/**
 * E2E tests for frontend proxy routes.
 *
 * Spawns the daemon, then hits daemon endpoints that the frontend
 * API routes proxy to. Validates that the daemon accepts the same
 * request shapes the frontend sends.
 *
 * Run: node --import tsx --test src/e2e-proxy.test.ts
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync, unlinkSync, rmdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import stringify from "fast-json-stable-stringify";

/* ── config ──────────────────────────────────────────────── */

const DAEMON_PORT = 13401;
const DAEMON_URL = `http://localhost:${DAEMON_PORT}`;

// TEST_ACCOUNT_25 — daemon server process
const DAEMON_PK =
  "0x7e70fc45d677c1c5e6db2d221e4d30a67544301dbdf2f97e613df5e409d71b6d";

// TEST_ACCOUNT_1 — acts as "user"
const USER_PK =
  "0xbcb81f1084a2fa1eacf4bd45929c04c9fa8d0b1ef7dcf2d49e5e26eaf0d5f5e9" as Hex;
const USER = privateKeyToAccount(USER_PK);

/* ── helpers ─────────────────────────────────────────────── */

async function signPayload(
  account: ReturnType<typeof privateKeyToAccount>,
  fields: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = { ...fields, timestamp };
  const message = stringify(payload);
  const signature = await account.signMessage({ message });
  return { ...payload, signature };
}

async function post(
  path: string,
  body: Record<string, unknown>,
): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await fetch(`${DAEMON_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const data = (await res.json()) as Record<string, unknown>;
    return { status: res.status, data };
  }
  await res.text();
  return { status: res.status, data: {} };
}

async function signedPost(
  path: string,
  fields: Record<string, unknown> = {},
): Promise<{ status: number; data: Record<string, unknown> }> {
  const body = await signPayload(USER, fields);
  return post(path, body);
}

async function waitForDaemon(timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${DAEMON_URL}/health`);
      if (res.ok) return;
    } catch {
      /* not ready yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Daemon did not start in time");
}

/* ── lifecycle ───────────────────────────────────────────── */

let daemon: ChildProcess;
let tmpDir: string;
let dbPath: string;

function cleanupDb() {
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      unlinkSync(`${dbPath}${suffix}`);
    } catch {
      /* ignore */
    }
  }
  try {
    rmdirSync(tmpDir);
  } catch {
    /* ignore */
  }
}

before(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "proxy-e2e-"));
  dbPath = join(tmpDir, "test.db");

  daemon = spawn("npx", ["tsx", "src/api.ts"], {
    cwd: resolve(fileURLToPath(import.meta.url), "..", "..", "..", "daemon"),
    env: {
      ...process.env,
      PRIVATE_KEY: DAEMON_PK,
      API_PORT: String(DAEMON_PORT),
      DB_PATH: dbPath,
      RPC_URL: "https://ethereum-sepolia-rpc.publicnode.com",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  daemon.stderr?.on("data", (chunk: Buffer) => {
    const line = chunk.toString().trim();
    if (line && !line.includes("npm warn")) console.error(`[daemon] ${line}`);
  });

  await waitForDaemon();
});

after(() => {
  daemon?.kill("SIGTERM");
  cleanupDb();
});

/* ── tests ───────────────────────────────────────────────── */

describe("Frontend proxy route targets", () => {
  let userId: string;

  it("GET /health — daemon is alive", async () => {
    const res = await fetch(`${DAEMON_URL}/health`);
    assert.equal(res.status, 200);
    const data = (await res.json()) as Record<string, unknown>;
    assert.equal(data.status, "ok");
  });

  describe("/user (proxied by frontend /api/private-data/seller)", () => {
    it("registers a new user and returns a pseudonymous ID", async () => {
      const { status, data } = await signedPost("/user");
      assert.equal(status, 200);
      assert.ok(typeof data.userId === "string" && data.userId.length > 0);
      userId = data.userId as string;
    });
  });

  describe("/balance (proxied by frontend /api/funding/snapshot)", () => {
    it("returns balance for registered user", async () => {
      const { status, data } = await signedPost("/balance", { userId });
      assert.equal(status, 200);
      assert.equal(typeof data.balance, "string");
    });
  });

  describe("/deposit (proxied by frontend /api/funding/deposit)", () => {
    it("rejects deposit with zero amount", async () => {
      const { status } = await signedPost("/deposit", {
        userId,
        amount: 0,
      });
      assert.equal(status, 400);
    });

    it("accepts valid deposit request", async () => {
      const { status } = await signedPost("/deposit", {
        userId,
        amount: 1_000_000,
      });
      assert.equal(status, 200);
    });
  });

  describe("/withdraw (proxied by frontend /api/funding/withdraw)", () => {
    it("rejects withdrawal with zero amount", async () => {
      const { status } = await signedPost("/withdraw", {
        userId,
        amount: 0,
      });
      assert.equal(status, 400);
    });
  });

  describe("/bid (proxied by frontend /api/bid)", () => {
    it("rejects bid without required fields", async () => {
      const { status } = await signedPost("/bid", { userId });
      assert.equal(status, 400);
    });
  });

  describe("/create-auction (proxied by frontend /api/create-auction)", () => {
    it("rejects create-auction without required fields", async () => {
      const { status } = await signedPost("/create-auction", { userId });
      assert.equal(status, 400);
    });
  });
});
