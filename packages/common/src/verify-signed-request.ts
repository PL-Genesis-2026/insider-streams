/**
 * Portable signed-request verification — no framework dependencies.
 *
 * Signing convention (client side):
 *   const message = stringify({ ...fields, timestamp }); // fast-json-stable-stringify
 *   const signature = await signMessage({ message });    // personal_sign / eth_sign
 *
 * Used by:
 *   - apps/insider-streams-frontend/src/lib/signed-request.ts (wraps for NextResponse)
 *   - scripts/e2e_tests/bid-submission-e2e.ts (direct, for roundtrip testing)
 */

import stringify from "fast-json-stable-stringify";
import { recoverMessageAddress } from "viem";

const SIGNATURE_MAX_AGE_SECONDS = 600;

export type VerifySuccess<T extends Record<string, unknown>> = {
  ok: true;
  payload: T & { userAddress: string };
};

export type VerifyFailure = {
  ok: false;
  status: number;
  error: string;
  code: string;
};

export type VerifyResult<T extends Record<string, unknown>> =
  | VerifySuccess<T>
  | VerifyFailure;

export async function verifySignedRequest<T extends Record<string, unknown>>(
  body: unknown,
): Promise<VerifyResult<T>> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, status: 400, error: "Invalid request body", code: "INVALID_BODY" };
  }

  const raw = body as Record<string, unknown>;

  if (typeof raw.timestamp !== "number" || !Number.isInteger(raw.timestamp)) {
    return { ok: false, status: 400, error: "timestamp must be an integer", code: "VALIDATION_ERROR" };
  }

  if (typeof raw.signature !== "string" || !/^0x[a-fA-F0-9]+$/.test(raw.signature)) {
    return { ok: false, status: 400, error: "signature must be a hex string", code: "VALIDATION_ERROR" };
  }

  const { timestamp, signature } = raw as { timestamp: number; signature: string };

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestamp) > SIGNATURE_MAX_AGE_SECONDS) {
    return {
      ok: false,
      status: 400,
      error: "Signature expired or timestamp too far in the future",
      code: "STALE_SIGNATURE",
    };
  }

  const { signature: _sig, ...payloadWithoutSig } = raw;
  const message = stringify(payloadWithoutSig);

  let address: string;
  try {
    const recovered = await recoverMessageAddress({
      message,
      signature: signature as `0x${string}`,
    });
    address = recovered.toLowerCase();
  } catch {
    return { ok: false, status: 400, error: "Invalid signature", code: "INVALID_SIGNATURE" };
  }

  return {
    ok: true,
    payload: { ...payloadWithoutSig, userAddress: address } as unknown as T & {
      userAddress: string;
    },
  };
}
