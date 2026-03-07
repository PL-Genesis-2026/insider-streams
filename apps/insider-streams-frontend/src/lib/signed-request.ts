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
