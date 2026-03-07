import type { TransferRow } from "./types";

export type TransferDirection = "deposit" | "withdrawal" | "unknown";

const DEPOSIT_STATUSES = new Set(["pending", "confirmed"]);
const WITHDRAWAL_STATUSES = new Set(["requested", "transferring", "completed"]);

function normalizeAddress(address?: string | null) {
  return address?.trim().toLowerCase() ?? null;
}

export function inferTransferDirection(
  transfer: Pick<
    TransferRow,
    "recipient_address" | "sender_address" | "status" | "user_address"
  >,
): TransferDirection {
  const userAddress = normalizeAddress(transfer.user_address);
  const senderAddress = normalizeAddress(transfer.sender_address);
  const recipientAddress = normalizeAddress(transfer.recipient_address);

  if (senderAddress && userAddress && senderAddress === userAddress) {
    return "deposit";
  }

  if (recipientAddress && userAddress && recipientAddress === userAddress) {
    return "withdrawal";
  }

  if (DEPOSIT_STATUSES.has(transfer.status)) {
    return "deposit";
  }

  if (WITHDRAWAL_STATUSES.has(transfer.status)) {
    return "withdrawal";
  }

  return "unknown";
}
