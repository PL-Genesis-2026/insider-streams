import { VAULT_ADDRESS } from "@private-streams/common";
import { getAddress, type Address } from "viem";
import { sepolia } from "@reown/appkit/networks";

export const PRIVATE_TOKEN_API_BASE_URL =
  "https://convergence2026-token-api.cldev.cloud";

const RETRIEVE_BALANCES_PRIMARY_TYPE = "Retrieve Balances" as const;
const PRIVATE_TRANSFER_PRIMARY_TYPE = "Private Token Transfer" as const;
const WITHDRAW_PRIMARY_TYPE = "Withdraw Tokens" as const;

const retrieveBalancesTypes = {
  [RETRIEVE_BALANCES_PRIMARY_TYPE]: [
    { name: "account", type: "address" },
    { name: "timestamp", type: "uint256" },
  ],
} as const;

const privateTransferTypes = {
  [PRIVATE_TRANSFER_PRIMARY_TYPE]: [
    { name: "sender", type: "address" },
    { name: "recipient", type: "address" },
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "flags", type: "string[]" },
    { name: "timestamp", type: "uint256" },
  ],
} as const;

const withdrawTypes = {
  [WITHDRAW_PRIMARY_TYPE]: [
    { name: "account", type: "address" },
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "timestamp", type: "uint256" },
  ],
} as const;

export const privateTokenApiDomain = {
  name: "CompliantPrivateTokenDemo",
  version: "0.0.1",
  chainId: sepolia.id,
  verifyingContract: VAULT_ADDRESS,
} as const;

type RetrieveBalancesMessage = {
  account: Address;
  timestamp: bigint;
};

type PrivateTransferMessage = {
  sender: Address;
  recipient: Address;
  token: Address;
  amount: bigint;
  flags: string[];
  timestamp: bigint;
};

type WithdrawMessage = {
  account: Address;
  token: Address;
  amount: bigint;
  timestamp: bigint;
};

export type PrivateTokenSignaturePayload =
  | {
      domain: typeof privateTokenApiDomain;
      types: typeof retrieveBalancesTypes;
      primaryType: typeof RETRIEVE_BALANCES_PRIMARY_TYPE;
      message: RetrieveBalancesMessage;
    }
  | {
      domain: typeof privateTokenApiDomain;
      types: typeof privateTransferTypes;
      primaryType: typeof PRIVATE_TRANSFER_PRIMARY_TYPE;
      message: PrivateTransferMessage;
    }
  | {
      domain: typeof privateTokenApiDomain;
      types: typeof withdrawTypes;
      primaryType: typeof WITHDRAW_PRIMARY_TYPE;
      message: WithdrawMessage;
    };

function getUnixTimestampSeconds() {
  return Math.floor(Date.now() / 1000);
}

export function createRetrieveBalancesRequest(account: Address) {
  const normalizedAccount = getAddress(account);
  const timestamp = getUnixTimestampSeconds();

  return {
    body: {
      account: normalizedAccount,
      timestamp,
    },
    signaturePayload: {
      domain: privateTokenApiDomain,
      types: retrieveBalancesTypes,
      primaryType: RETRIEVE_BALANCES_PRIMARY_TYPE,
      message: {
        account: normalizedAccount,
        timestamp: BigInt(timestamp),
      },
    } satisfies PrivateTokenSignaturePayload,
  };
}

export function createPrivateTransferRequest(input: {
  sender: Address;
  recipient: Address;
  token: Address;
  amount: string;
  flags?: string[];
}) {
  const sender = getAddress(input.sender);
  const recipient = getAddress(input.recipient);
  const token = getAddress(input.token);
  const timestamp = getUnixTimestampSeconds();
  const flags = input.flags ?? [];

  return {
    body: {
      account: sender,
      recipient,
      token,
      amount: input.amount,
      flags,
      timestamp,
    },
    signaturePayload: {
      domain: privateTokenApiDomain,
      types: privateTransferTypes,
      primaryType: PRIVATE_TRANSFER_PRIMARY_TYPE,
      message: {
        sender,
        recipient,
        token,
        amount: BigInt(input.amount),
        flags,
        timestamp: BigInt(timestamp),
      },
    } satisfies PrivateTokenSignaturePayload,
  };
}

export function createWithdrawRequest(input: {
  account: Address;
  token: Address;
  amount: string;
}) {
  const account = getAddress(input.account);
  const token = getAddress(input.token);
  const timestamp = getUnixTimestampSeconds();

  return {
    body: {
      account,
      token,
      amount: input.amount,
      timestamp,
    },
    signaturePayload: {
      domain: privateTokenApiDomain,
      types: withdrawTypes,
      primaryType: WITHDRAW_PRIMARY_TYPE,
      message: {
        account,
        token,
        amount: BigInt(input.amount),
        timestamp: BigInt(timestamp),
      },
    } satisfies PrivateTokenSignaturePayload,
  };
}
