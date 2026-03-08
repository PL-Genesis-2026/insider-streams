// notify.ts
// Sends a push notification via ntfy HTTP API.
// Uses 1 HTTP call from CRE's per-execution budget.
// No-op when config.ntfyEnabled is false.

import {
  cre,
  ok,
  type Runtime,
  type HTTPSendRequester,
  consensusIdenticalAggregation,
} from "@chainlink/cre-sdk";
import type { Config } from "./types";

// Base64 encoding (QuickJS WASM-safe, no Buffer)
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64Encode(bytes: Uint8Array): string {
  let r = "";
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;
    r += B64[(b0 >> 2) & 0x3f];
    r += B64[((b0 << 4) | (b1 >> 4)) & 0x3f];
    r += i + 1 < len ? B64[((b1 << 2) | (b2 >> 6)) & 0x3f] : "=";
    r += i + 2 < len ? B64[b2 & 0x3f] : "=";
  }
  return r;
}

/**
 * Sends a push notification via ntfy.
 * No-op if ntfyEnabled is false in config.
 * Errors are caught and logged — never throws.
 */
export function sendNotification(
  runtime: Runtime<Config>,
  title: string,
  message: string,
  clickUrl?: string,
): void {
  if (!runtime.config.ntfyEnabled) return;

  try {
    const httpClient = new cre.capabilities.HTTPClient();
    const url = `${runtime.config.ntfyHost}/${runtime.config.ntfyTopic}`;
    const body = `[${runtime.config.ntfyUser}] ${message}`;

    httpClient
      .sendRequest(
        runtime,
        postNotification(url, title, body, clickUrl),
        consensusIdenticalAggregation<number>(),
      )(runtime.config)
      .result();

    runtime.log(`[ntfy] sent: ${title}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    runtime.log(`[ntfy] failed (non-fatal): ${msg}`);
  }
}

const postNotification =
  (url: string, title: string, body: string, clickUrl?: string) =>
  (sendRequester: HTTPSendRequester, config: Config): number => {
    const encodedBody = base64Encode(new TextEncoder().encode(body));

    const headers: Record<string, string> = { Title: title };
    if (clickUrl) headers.Click = clickUrl;

    const resp = sendRequester
      .sendRequest({
        url,
        method: "POST" as const,
        body: encodedBody,
        headers,
        cacheSettings: { readFromCache: false, maxAgeMs: 0 },
      })
      .result();

    if (!ok(resp)) {
      const bodyText = new TextDecoder().decode(resp.body);
      throw new Error(`ntfy POST failed (${resp.statusCode}): ${bodyText}`);
    }

    return resp.statusCode;
  };
