import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  PrivateTokenApiClient,
  type Transaction as PrivateTokenTransaction,
} from "@private-streams/chainlink-private-token-api-client";
import {
  type Database,
  PRIVATE_CONFIDENTIAL_USDC_ADDRESS,
} from "@private-streams/common";
import { getAddress, isAddress, isAddressEqual, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { env } from "@/env";
import type {
  FundingServerSnapshot,
} from "./types";

type TransferInsert = Database["public"]["Tables"]["transfers"]["Insert"];
type ReconcileFundingResult = FundingServerSnapshot & {
  reconciledCount: number;
  scannedCount: number;
};

function toRawTransactionJson(transaction: PrivateTokenTransaction) {
  return {
    id: transaction.id,
    type: transaction.type,
    account: transaction.account ?? null,
    sender: transaction.sender ?? null,
    recipient: transaction.recipient ?? null,
    token: transaction.token,
    amount: transaction.amount,
    tx_hash: transaction.tx_hash ?? null,
    is_incoming: transaction.is_incoming ?? null,
    is_sender_hidden: transaction.is_sender_hidden ?? null,
  };
}

let serviceRoleClient: SupabaseClient<Database> | undefined;

function toCanonicalAddress(address: string): Lowercase<Address> {
  if (!isAddress(address)) {
    throw new Error(`Invalid EVM address: ${address}`);
  }

  return getAddress(address).toLowerCase() as Lowercase<Address>;
}

function getOwnerPrivateKeyOrUndefined() {
  if (!env.OWNER_PK) {
    return undefined;
  }

  return (env.OWNER_PK.startsWith("0x") ? env.OWNER_PK : `0x${env.OWNER_PK}`) as `0x${string}`;
}

function getOwnerPrivateKey() {
  const privateKey = getOwnerPrivateKeyOrUndefined();

  if (!privateKey) {
    throw new Error("Server funding sync is missing OWNER_PK.");
  }

  return privateKey;
}

function getPlatformRecipientAddress() {
  const privateKey = getOwnerPrivateKeyOrUndefined();

  if (!privateKey) {
    return undefined;
  }

  return privateKeyToAccount(privateKey).address;
}

function getServiceRoleKey() {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Server funding sync is missing SUPABASE_SERVICE_ROLE_KEY.");
  }

  return env.SUPABASE_SERVICE_ROLE_KEY;
}

function getServiceRoleSupabaseClient() {
  if (!serviceRoleClient) {
    serviceRoleClient = createClient<Database>(
      env.NEXT_PUBLIC_SUPABASE_URL,
      getServiceRoleKey(),
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );
  }

  return serviceRoleClient;
}

function mapTransactionToTransferInsert(
  transaction: PrivateTokenTransaction,
): TransferInsert | null {
  if (transaction.type !== "transfer") {
    return null;
  }

  if (!transaction.sender || !transaction.recipient || !isAddress(transaction.token)) {
    return null;
  }

  if (
    !isAddressEqual(
      transaction.token as `0x${string}`,
      PRIVATE_CONFIDENTIAL_USDC_ADDRESS,
    )
  ) {
    return null;
  }

  const senderAddress = toCanonicalAddress(transaction.sender);
  const recipientAddress = toCanonicalAddress(transaction.recipient);
  const tokenAddress = toCanonicalAddress(transaction.token);

  if (transaction.is_incoming) {
    return {
      transaction_id: transaction.id,
      user_address: senderAddress,
      sender_address: senderAddress,
      recipient_address: recipientAddress,
      token_address: tokenAddress,
      amount: transaction.amount,
      status: "confirmed",
      raw_data: toRawTransactionJson(transaction),
    };
  }

  return {
    transaction_id: transaction.id,
    user_address: recipientAddress,
    sender_address: senderAddress,
    recipient_address: recipientAddress,
    token_address: tokenAddress,
    amount: transaction.amount,
    status: "completed",
    raw_data: toRawTransactionJson(transaction),
  };
}

export async function getFundingServerSnapshot(
  address: string,
): Promise<FundingServerSnapshot> {
  const normalizedAddress = toCanonicalAddress(address);
  const supabase = getServiceRoleSupabaseClient();

  const [balanceResult, transferResult] = await Promise.all([
    supabase
      .from("balances")
      .select(
        "available_balance, locked_balance, pending_withdrawal, total_from_won_bids, user_address",
      )
      .eq("user_address", normalizedAddress)
      .maybeSingle(),
    supabase
      .from("transfers")
      .select(
        "amount, completed_at, created_at, credited_at, id, raw_data, recipient_address, sender_address, status, token_address, transaction_id, updated_at, user_address",
      )
      .eq("user_address", normalizedAddress)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (balanceResult.error) {
    throw new Error(
      `Failed to read funding balance for ${normalizedAddress}: ${balanceResult.error.message}`,
    );
  }

  if (transferResult.error) {
    throw new Error(
      `Failed to read funding transfers for ${normalizedAddress}: ${transferResult.error.message}`,
    );
  }

  const transfers = transferResult.data ?? [];

  return {
    platformRecipientAddress: getPlatformRecipientAddress(),
    balance: balanceResult.data,
    transfers,
  };
}

export async function reconcileFundingServerSnapshot(
  address: string,
): Promise<ReconcileFundingResult> {
  const privateTokenClient = new PrivateTokenApiClient(getOwnerPrivateKey());
  const { transactions } = await privateTokenClient.listTransactions({ limit: 100 });
  const rows = transactions
    .map(mapTransactionToTransferInsert)
    .filter((row): row is TransferInsert => row !== null);

  let reconciledCount = 0;

  if (rows.length > 0) {
    const supabase = getServiceRoleSupabaseClient();
    const { data, error } = await supabase
      .from("transfers")
      .upsert(rows, {
        onConflict: "transaction_id",
        ignoreDuplicates: true,
      })
      .select("transaction_id");

    if (error) {
      throw new Error(`Failed to reconcile funding transfers: ${error.message}`);
    }

    reconciledCount = data?.length ?? 0;
  }

  const snapshot = await getFundingServerSnapshot(address);

  return {
    ...snapshot,
    reconciledCount,
    scannedCount: transactions.length,
  };
}
