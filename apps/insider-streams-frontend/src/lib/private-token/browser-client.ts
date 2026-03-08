import { z } from "zod";
import type {
  ApiError,
  GetBalancesResponse,
  PrivateTransferRequest,
  PrivateTransferResponse,
  WithdrawRequest,
  WithdrawResponse,
} from "@private-streams/chainlink-private-token-api-client";
import type { Address, Hex } from "viem";
import {
  createPrivateTransferRequest,
  createRetrieveBalancesRequest,
  createWithdrawRequest,
  type PrivateTokenSignaturePayload,
} from "./domain";

const apiErrorSchema = z.object({
  error: z.string(),
  error_details: z.string().optional(),
  request_id: z.string().optional(),
});

const getBalancesResponseSchema = z.object({
  balances: z.array(
    z.object({
      token: z.string(),
      amount: z.string(),
    }),
  ),
});

const privateTransferResponseSchema = z.object({
  transaction_id: z.string(),
});

const withdrawResponseSchema = z.object({
  id: z.string(),
  account: z.string(),
  token: z.string(),
  amount: z.string(),
  deadline: z.number(),
  ticket: z.string(),
});

const PRIVATE_TOKEN_PROXY_BASE_PATH = "/api/private-token";

export type PrivateTokenSigner = (
  payload: PrivateTokenSignaturePayload,
) => Promise<Hex>;

export function isPrivateAccountNotFoundError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.toLowerCase().includes("account not found")
  );
}

async function getApiError(response: Response): Promise<ApiError | undefined> {
  const body = await response.json().catch(() => null);
  const parsed = apiErrorSchema.safeParse(body);

  if (!parsed.success) {
    return undefined;
  }

  return parsed.data;
}

async function postPrivateTokenJson<T>(
  endpoint: string,
  body: Record<string, unknown>,
  schema: z.ZodSchema<T>,
): Promise<T> {
  const response = await fetch(`${PRIVATE_TOKEN_PROXY_BASE_PATH}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const apiError = await getApiError(response);

    if (apiError) {
      const details = apiError.error_details
        ? `: ${apiError.error_details}`
        : "";
      throw new Error(`${apiError.error}${details}`);
    }

    throw new Error(
      `Private token API request failed with status ${response.status}.`,
    );
  }

  return schema.parse(await response.json());
}

export async function getBalances(
  account: Address,
  signTypedData: PrivateTokenSigner,
): Promise<GetBalancesResponse> {
  const request = createRetrieveBalancesRequest(account);
  const auth = await signTypedData(request.signaturePayload);

  return postPrivateTokenJson(
    "/balances",
    {
      ...request.body,
      auth,
    },
    getBalancesResponseSchema,
  );
}

export async function privateTransfer(
  account: Address,
  signTypedData: PrivateTokenSigner,
  payload: PrivateTransferRequest,
): Promise<PrivateTransferResponse> {
  const request = createPrivateTransferRequest({
    sender: account,
    recipient: payload.recipient as Address,
    token: payload.token as Address,
    amount: payload.amount,
    flags: payload.flags,
  });
  const auth = await signTypedData(request.signaturePayload);

  return postPrivateTokenJson(
    "/private-transfer",
    {
      ...request.body,
      auth,
    },
    privateTransferResponseSchema,
  );
}

export async function withdraw(
  account: Address,
  signTypedData: PrivateTokenSigner,
  payload: WithdrawRequest,
): Promise<WithdrawResponse> {
  const request = createWithdrawRequest({
    account,
    token: payload.token as Address,
    amount: payload.amount,
  });
  const auth = await signTypedData(request.signaturePayload);

  return postPrivateTokenJson(
    "/withdraw",
    {
      ...request.body,
      auth,
    },
    withdrawResponseSchema,
  );
}
