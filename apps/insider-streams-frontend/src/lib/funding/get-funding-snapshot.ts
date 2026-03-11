import type { WalletSession } from "@/lib/wallet/use-wallet-session";
import type {
  FundingServerSnapshot,
  FundingSnapshot,
  FundingStatus,
} from "./types";

type FundingStatusCopy = {
  title: string;
  description: string;
};

const fundingStatusCopy: Record<FundingStatus, FundingStatusCopy> = {
  wallet_required: {
    title: "Connect wallet",
    description: "Connect a wallet to fund your Insider Streams private wallet.",
  },
  wrong_network: {
    title: "Switch to Sepolia",
    description: "Funding your Insider Streams private wallet is only supported on Ethereum Sepolia.",
  },
  funding_unavailable: {
    title: "Retry wallet",
    description:
      "Your wallet data could not be loaded right now. Refresh and try again.",
  },
  private_data_hidden: {
    title: "Unlock wallet",
    description:
      "Reveal private data to see your bidding balance, withdrawals, and next wallet action.",
  },
  not_funded_yet: {
    title: "Add funds",
    description:
      "Deposit USDC into the private wallet, then activate it so auction bids can use the balance.",
  },
  reconciling_transfer: {
    title: "Updating wallet",
    description:
      "A transfer is still settling. Your wallet will refresh automatically once the balance lands.",
  },
  funded: {
    title: "Ready to bid",
    description:
      "Your private balance is active. You can place bids now from auction pages.",
  },
  withdrawal_available: {
    title: "Ready to bid or withdraw",
    description:
      "Your wallet has available capital. Use it for bids or move it back to your public wallet.",
  },
};

export function getFundingStatusCopy(status: FundingStatus): FundingStatusCopy {
  const copy = fundingStatusCopy[status];
  if (copy) return copy;
  return fundingStatusCopy.private_data_hidden;
}

type FundingSnapshotOptions = {
  errorMessage?: string;
  fundingNotYetChecked?: boolean;
};

export function getFundingSnapshot(
  session: WalletSession,
  serverSnapshot?: FundingServerSnapshot,
  options?: FundingSnapshotOptions,
): FundingSnapshot {
  const balance = serverSnapshot?.balance ?? "0";

  if (!session.isConnected || !session.address) {
    return {
      status: "wallet_required",
      requiredChainName: session.requiredChainName,
      canPlaceBid: false,
      isReconciling: false,
      balance: "0",
    };
  }

  if (!session.isSupportedChain) {
    return {
      status: "wrong_network",
      address: session.address,
      currentChainName: session.currentChainName,
      requiredChainName: session.requiredChainName,
      canPlaceBid: false,
      isReconciling: false,
      balance: "0",
    };
  }

  if (options?.errorMessage) {
    return {
      status: "funding_unavailable",
      address: session.address,
      currentChainName: session.currentChainName,
      requiredChainName: session.requiredChainName,
      canPlaceBid: false,
      isReconciling: false,
      balance,
    };
  }

  if (options?.fundingNotYetChecked || serverSnapshot === undefined) {
    return {
      status: "private_data_hidden",
      address: session.address,
      currentChainName: session.currentChainName,
      requiredChainName: session.requiredChainName,
      canPlaceBid: false,
      isReconciling: false,
      balance: "0",
    };
  }

  const hasBalance = BigInt(balance) > BigInt(0);

  if (hasBalance) {
    return {
      status: "withdrawal_available",
      address: session.address,
      currentChainName: session.currentChainName,
      requiredChainName: session.requiredChainName,
      canPlaceBid: true,
      isReconciling: false,
      balance,
    };
  }

  return {
    status: "not_funded_yet",
    address: session.address,
    currentChainName: session.currentChainName,
    requiredChainName: session.requiredChainName,
    canPlaceBid: false,
    isReconciling: false,
    balance,
  };
}
