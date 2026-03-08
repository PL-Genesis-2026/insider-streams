import "server-only";

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
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type {
  FundingServerSnapshot,
} from "./types";

type TransferInsert = Database["public"]["Tables"]["transfers"]["Insert"];
type ReconcileFundingResult = FundingServerSnapshot & {
  reconciledCount: number;
  scannedCount: number;
};
type WithdrawFundingResult = FundingServerSnapshot & {
  transactionId: string;
};
type FinalizeWithdrawFundingResult = FundingServerSnapshot & {
  transactionId: string;
  withdrawalId: string;
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

function validateRawAmount(amount: string) {
  if (!/^\d+$/.test(amount)) {
    throw new Error("Withdrawal amount must be a base-unit integer string.");
  }

  const parsed = BigInt(amount);
  if (parsed <= BigInt(0)) {
    throw new Error("Withdrawal amount must be greater than zero.");
  }

  return parsed;
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
  const supabase = getSupabaseServiceClient();

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
    const supabase = getSupabaseServiceClient();
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

export async function requestFundingWithdrawal(
  address: string,
  amount: string,
): Promise<WithdrawFundingResult> {
  const normalizedAddress = toCanonicalAddress(address);
  validateRawAmount(amount);
  const ownerPrivateKey = getOwnerPrivateKey();
  const ownerAddress = privateKeyToAccount(ownerPrivateKey).address;
  const supabase = getSupabaseServiceClient();

  // Reserve balance by inserting a 'requested' row BEFORE the private transfer.
  // The balances view subtracts 'requested' amounts from available_balance,
  // so any concurrent request's subsequent read will see reduced availability.
  const reservationTxId = `withdraw-reserve-${crypto.randomUUID()}`;
  const { error: reserveError } = await supabase.from("transfers").insert({
    transaction_id: reservationTxId,
    user_address: normalizedAddress,
    sender_address: toCanonicalAddress(ownerAddress),
    recipient_address: normalizedAddress,
    token_address: toCanonicalAddress(PRIVATE_CONFIDENTIAL_USDC_ADDRESS),
    amount,
    status: "requested",
  });

  if (reserveError) {
    throw new Error(
      `Failed to reserve withdrawal for ${normalizedAddress}: ${reserveError.message}`,
    );
  }

  // Verify the balance is still non-negative after this reservation committed.
  // If a concurrent request also reserved, both will see a negative balance
  // and both will roll back — conservative but prevents double-spend.
  const { data: balanceRow, error: balanceError } = await supabase
    .from("balances")
    .select("available_balance")
    .eq("user_address", normalizedAddress)
    .maybeSingle();

  if (balanceError || !balanceRow) {
    await releaseWithdrawalReservation(supabase, reservationTxId);
    throw new Error(
      balanceError
        ? `Failed to verify balance for ${normalizedAddress}: ${balanceError.message}`
        : "Withdrawal amount exceeds available balance.",
    );
  }

  const postReserveBalance = BigInt(balanceRow.available_balance ?? "0");
  if (postReserveBalance < BigInt(0)) {
    await releaseWithdrawalReservation(supabase, reservationTxId);
    throw new Error("Withdrawal amount exceeds available balance.");
  }

  // Balance verified with reservation held — execute the private transfer.
  let transferTxId: string;
  try {
    const privateTokenClient = new PrivateTokenApiClient(ownerPrivateKey);
    const transfer = await privateTokenClient.privateTransfer({
      recipient: normalizedAddress,
      token: PRIVATE_CONFIDENTIAL_USDC_ADDRESS,
      amount,
    });
    transferTxId = transfer.transaction_id;
  } catch (err) {
    await releaseWithdrawalReservation(supabase, reservationTxId);
    throw err;
  }

  // Promote the reservation to a real transfer record.
  const completedAt = new Date().toISOString();
  const { error: promoteError } = await supabase
    .from("transfers")
    .update({
      transaction_id: transferTxId,
      status: "transferring",
      raw_data: {
        id: transferTxId,
        type: "transfer",
        account: ownerAddress,
        sender: ownerAddress,
        recipient: normalizedAddress,
        token: PRIVATE_CONFIDENTIAL_USDC_ADDRESS,
        amount,
        is_incoming: false,
        private_transfer_completed_at: completedAt,
        public_withdrawal_state: "awaiting_wallet_signature",
        source: "nextjs-withdraw-route",
        reservation_id: reservationTxId,
      },
    })
    .eq("transaction_id", reservationTxId);

  if (promoteError) {
    throw new Error(
      `Withdrawal transfer succeeded but recording it failed: ${promoteError.message}`,
    );
  }

  const snapshot = await getFundingServerSnapshot(normalizedAddress);

  return {
    ...snapshot,
    transactionId: transferTxId,
  };
}

async function releaseWithdrawalReservation(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  reservationTxId: string,
) {
  await supabase
    .from("transfers")
    .update({ status: "failed" })
    .eq("transaction_id", reservationTxId);
}

export async function finalizeFundingWithdrawal(
  address: string,
  input: {
    amount: string;
    transactionId: string;
    withdrawalId: string;
    ticket: string;
    deadline: number;
  },
): Promise<FinalizeWithdrawFundingResult> {
  const normalizedAddress = toCanonicalAddress(address);
  const amountRaw = validateRawAmount(input.amount);
  const supabase = getSupabaseServiceClient();

  const { data: transferRow, error: transferError } = await supabase
    .from("transfers")
    .select("amount, raw_data, status, transaction_id, user_address")
    .eq("transaction_id", input.transactionId)
    .eq("user_address", normalizedAddress)
    .maybeSingle();

  if (transferError) {
    throw new Error(
      `Failed to read withdrawal transfer for ${normalizedAddress}: ${transferError.message}`,
    );
  }

  if (!transferRow) {
    throw new Error("Withdrawal transfer could not be found.");
  }

  if (BigInt(transferRow.amount) !== amountRaw) {
    throw new Error("Withdrawal amount does not match the recorded transfer.");
  }

  const completedAt = new Date().toISOString();
  const rawData =
    transferRow.raw_data &&
    typeof transferRow.raw_data === "object" &&
    !Array.isArray(transferRow.raw_data)
      ? transferRow.raw_data
      : {};

  const { error: updateError } = await supabase
    .from("transfers")
    .update({
      status: "completed",
      completed_at: completedAt,
      raw_data: {
        ...rawData,
        public_withdrawal_state: "submitted",
        withdrawal: {
          id: input.withdrawalId,
          ticket: input.ticket,
          deadline: input.deadline,
          submitted_at: completedAt,
        },
      },
    })
    .eq("transaction_id", input.transactionId)
    .eq("user_address", normalizedAddress);

  if (updateError) {
    throw new Error(
      `Private withdrawal succeeded but recording completion failed: ${updateError.message}`,
    );
  }

  const snapshot = await getFundingServerSnapshot(normalizedAddress);

  return {
    ...snapshot,
    transactionId: input.transactionId,
    withdrawalId: input.withdrawalId,
  };
}
