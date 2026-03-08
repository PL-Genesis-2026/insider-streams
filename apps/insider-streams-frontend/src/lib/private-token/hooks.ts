"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  PRIVATE_CONFIDENTIAL_USDC_ADDRESS,
  VAULT_ADDRESS,
} from "@private-streams/common";
import { erc20Abi, type Address, type Hex, zeroAddress } from "viem";
import {
  usePublicClient,
  useReadContract,
  useSignTypedData,
  useWriteContract,
} from "wagmi";
import { reconcileFunding } from "@/lib/funding/api";
import { getFundingSnapshotQueryKey } from "@/lib/funding/queries";
import { useSignedWalletSession } from "@/lib/wallet/use-signed-wallet-session";
import {
  getBalances,
  isPrivateAccountNotFoundError,
  privateTransfer,
  withdraw,
  type PrivateTokenSigner,
} from "./browser-client";

type PrivateTransferFundingVariables = {
  recipient: Address;
  amount: string;
  flags?: string[];
};

type PrivateTransferFundingResult = {
  transactionId: string;
  reconcileErrorMessage?: string;
};

type PrivateWithdrawFundingVariables = {
  amount: string;
};

type RedeemWithdrawalTicketVariables = {
  amount: string;
  ticket: Hex;
};

const vaultAbi = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "withdrawWithTicket",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "ticket", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

export type PrivateBalancesResult =
  | {
      status: "ready";
      balances: Awaited<ReturnType<typeof getBalances>>["balances"];
    }
  | {
      status: "not_funded_yet";
      balances: [];
    };

const PRIVATE_BALANCE_CACHE_TTL_SECONDS = 25;
const privateBalanceResultCache = new Map<
  string,
  { result: PrivateBalancesResult; timestamp: number }
>();

type ReadPrivateBalancesOptions = {
  forceFresh?: boolean;
};

async function readPrivateBalances(
  address: Address,
  signTypedData: PrivateTokenSigner,
  options?: ReadPrivateBalancesOptions,
): Promise<PrivateBalancesResult> {
  const cacheKey = address.toLowerCase();
  const cached = privateBalanceResultCache.get(cacheKey);
  const now = Math.floor(Date.now() / 1000);

  if (
    !options?.forceFresh &&
    cached &&
    now - cached.timestamp < PRIVATE_BALANCE_CACHE_TTL_SECONDS
  ) {
    return cached.result;
  }

  let result: PrivateBalancesResult;

  try {
    const response = await getBalances(address, signTypedData);

    result = {
      status: "ready",
      balances: response.balances,
    };
  } catch (error) {
    if (!isPrivateAccountNotFoundError(error)) {
      throw error;
    }

    result = {
      status: "not_funded_yet",
      balances: [],
    };
  }

  privateBalanceResultCache.set(cacheKey, { result, timestamp: now });
  return result;
}

function usePrivateTokenSigner(): PrivateTokenSigner {
  const { signTypedDataAsync } = useSignTypedData();

  return (payload) => {
    if (payload.primaryType === "Retrieve Balances") {
      return signTypedDataAsync(payload);
    }

    return signTypedDataAsync(
      payload as Parameters<typeof signTypedDataAsync>[0],
    );
  };
}

export function usePrivateBalancesMutation(address?: Address) {
  const signTypedData = usePrivateTokenSigner();

  return useMutation({
    mutationFn: async (options?: ReadPrivateBalancesOptions) => {
      if (!address) {
        throw new Error("Fetching private balances requires a connected wallet.");
      }

      return readPrivateBalances(address, signTypedData, options);
    },
  });
}

export function usePrivateTransferFundingMutation(address?: Address) {
  const queryClient = useQueryClient();
  const signTypedData = usePrivateTokenSigner();
  const { getSignedSession } = useSignedWalletSession();

  return useMutation({
    mutationFn: async (
      variables: PrivateTransferFundingVariables,
    ): Promise<PrivateTransferFundingResult> => {
      if (!address) {
        throw new Error("Submitting a private transfer requires a connected wallet.");
      }

      let transferResponse: Awaited<ReturnType<typeof privateTransfer>>;

      try {
        transferResponse = await privateTransfer(address, signTypedData, {
          recipient: variables.recipient,
          token: PRIVATE_CONFIDENTIAL_USDC_ADDRESS,
          amount: variables.amount,
          flags: variables.flags,
        });
      } catch (error) {
        if (isPrivateAccountNotFoundError(error)) {
          throw new Error(
            "This wallet does not have private USDC yet. Approve USDC and deposit into the private vault first, then check balance again before using this step.",
          );
        }

        throw error;
      }

      try {
        const signedSession = await getSignedSession();
        const reconcileResponse = await reconcileFunding(signedSession);

        queryClient.setQueryData(
          getFundingSnapshotQueryKey(address),
          reconcileResponse.data,
        );
      } catch (error) {
        return {
          transactionId: transferResponse.transaction_id,
          reconcileErrorMessage:
            error instanceof Error
              ? error.message
              : "Private transfer submitted, but funding reconciliation failed.",
        };
      }

      await queryClient.invalidateQueries({
        queryKey: getFundingSnapshotQueryKey(address),
      });

      return {
        transactionId: transferResponse.transaction_id,
      };
    },
  });
}

export function usePrivateWithdrawMutation(address?: Address) {
  const signTypedData = usePrivateTokenSigner();

  return useMutation({
    mutationFn: async (variables: PrivateWithdrawFundingVariables) => {
      if (!address) {
        throw new Error("Withdrawing private funds requires a connected wallet.");
      }

      try {
        return await withdraw(address, signTypedData, {
          token: PRIVATE_CONFIDENTIAL_USDC_ADDRESS,
          amount: variables.amount,
        });
      } catch (error) {
        if (isPrivateAccountNotFoundError(error)) {
          throw new Error(
            "The private withdrawal could not find a funded account for this wallet yet. Try again in a moment.",
          );
        }

        throw error;
      }
    },
  });
}

export function useRedeemWithdrawalTicketMutation() {
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  return useMutation({
    mutationFn: async (variables: RedeemWithdrawalTicketVariables) => {
      if (!publicClient) {
        throw new Error("Wallet client unavailable. Try reconnecting your wallet.");
      }

      const hash = await writeContractAsync({
        address: VAULT_ADDRESS,
        abi: vaultAbi,
        functionName: "withdrawWithTicket",
        args: [
          PRIVATE_CONFIDENTIAL_USDC_ADDRESS,
          BigInt(variables.amount),
          variables.ticket,
        ],
      });

      await publicClient.waitForTransactionReceipt({ hash });
      return { hash };
    },
  });
}

export function useVaultFunding(address?: Address, amount?: bigint | null) {
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const allowanceQuery = useReadContract({
    address: PRIVATE_CONFIDENTIAL_USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "allowance",
    args: [address ?? zeroAddress, VAULT_ADDRESS],
    query: {
      enabled: Boolean(address) && amount !== null && amount !== undefined,
    },
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!address || amount === null || amount === undefined) {
        throw new Error("Enter a USDC amount before approving the vault.");
      }

      if (!publicClient) {
        throw new Error("Wallet client unavailable. Try reconnecting your wallet.");
      }

      const hash = await writeContractAsync({
        address: PRIVATE_CONFIDENTIAL_USDC_ADDRESS,
        abi: erc20Abi,
        functionName: "approve",
        args: [VAULT_ADDRESS, amount],
      });

      await publicClient.waitForTransactionReceipt({ hash });
      await allowanceQuery.refetch();

      return { hash };
    },
  });

  const depositMutation = useMutation({
    mutationFn: async () => {
      if (!address || amount === null || amount === undefined) {
        throw new Error("Enter a USDC amount before depositing into the vault.");
      }

      if (!publicClient) {
        throw new Error("Wallet client unavailable. Try reconnecting your wallet.");
      }

      const hash = await writeContractAsync({
        address: VAULT_ADDRESS,
        abi: vaultAbi,
        functionName: "deposit",
        args: [PRIVATE_CONFIDENTIAL_USDC_ADDRESS, amount],
      });

      await publicClient.waitForTransactionReceipt({ hash });

      return { hash };
    },
  });

  const hasVaultApproval =
    amount !== null &&
    amount !== undefined &&
    allowanceQuery.data !== undefined &&
    allowanceQuery.data >= amount;

  return {
    hasVaultApproval,
    approveMutation,
    depositMutation,
  };
}
