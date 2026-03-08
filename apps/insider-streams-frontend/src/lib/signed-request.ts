import "server-only";
import { NextResponse } from "next/server";
import { verifySignedRequest as verifyCore } from "@private-streams/common";

export type VerifyOk<T> = { ok: true; payload: T & { userAddress: string } };
export type VerifyFail = { ok: false; response: NextResponse };
export type VerifyResult<T> = VerifyOk<T> | VerifyFail;

/**
 * Verify a signed JSON request body — Next.js wrapper around the shared
 * verifySignedRequest in @private-streams/common.
 *
 * On failure returns a ready-to-return NextResponse instead of a plain error
 * object, so API routes can do: `if (!verified.ok) return verified.response`.
 */
export async function verifySignedRequest<T extends Record<string, unknown>>(
  body: unknown,
): Promise<VerifyResult<T>> {
  const result = await verifyCore<T>(body);
  if (!result.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: result.error, code: result.code },
        { status: result.status },
      ),
    };
  }
  return result;
}

/**
 * Verify a signed request that may contain unsigned body fields.
 *
 * The client signs only the fields NOT listed in `unsignedFields` (plus
 * `signature` which is always stripped). After verification the unsigned
 * fields are re-attached to the returned payload so route handlers can
 * access them.
 *
 * Example: body = { timestamp, auctionIds, signature }
 *   unsignedFields = ["auctionIds"]
 *   → core verifies signature over stringify({ timestamp })
 *   → returned payload includes { timestamp, auctionIds, userAddress }
 */
export async function verifyPrivateDataRequest<
  T extends Record<string, unknown>,
>(
  body: unknown,
  unsignedFields: string[] = [],
): Promise<VerifyResult<T>> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid request body", code: "INVALID_BODY" },
        { status: 400 },
      ),
    };
  }

  const raw = body as Record<string, unknown>;

  // Extract unsigned field values before stripping them
  const stripped: Record<string, unknown> = {};
  for (const field of unsignedFields) {
    if (field in raw) {
      stripped[field] = raw[field];
    }
  }

  // Build the body that the core function will verify (without unsigned fields)
  const bodyForVerification = { ...raw };
  for (const field of unsignedFields) {
    delete bodyForVerification[field];
  }

  const result = await verifyCore<T>(bodyForVerification);
  if (!result.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: result.error, code: result.code },
        { status: result.status },
      ),
    };
  }

  // Re-attach unsigned fields to the verified payload
  return {
    ok: true,
    payload: { ...result.payload, ...stripped } as T & { userAddress: string },
  };
}
