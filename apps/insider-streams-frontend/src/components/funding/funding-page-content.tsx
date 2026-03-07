"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CONFIDENTIAL_USDC_DECIMALS,
  PRIVATE_CONFIDENTIAL_USDC_ADDRESS,
} from "@private-streams/common";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { getAddress, isAddressEqual, parseUnits, type Address } from "viem";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FundingStatusBadge } from "@/components/funding/funding-status-badge";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";
import { SwitchNetworkButton } from "@/components/wallet/switch-network-button";
import { formatAddress } from "@/lib/wallet/format-address";
import {
  formatFundingBalance,
  getDisplayFundingBalance,
} from "@/lib/funding/format-funding-balance";
import { useFundingSnapshot } from "@/lib/funding/use-funding-snapshot";
import {
  usePrivateBalancesMutation,
  usePrivateTransferFundingMutation,
  useVaultFunding,
} from "@/lib/private-token/hooks";
import { useWalletSession } from "@/lib/wallet/use-wallet-session";

type FundingStep =
  | "idle"
  | "approving"
  | "depositing"
  | "waiting_for_credit"
  | "ready_to_activate"
  | "activating"
  | "complete";

function findUsdcBalance(
  balances?: { token: string; amount: string }[],
): { token: string; amount: string } | undefined {
  return balances?.find((balance) => {
    try {
      return isAddressEqual(
        getAddress(balance.token),
        PRIVATE_CONFIDENTIAL_USDC_ADDRESS,
      );
    } catch {
      return false;
    }
  });
}

function hasPositiveBalance(value?: string | null) {
  return value !== undefined && value !== null && BigInt(value) > BigInt(0);
}

function StepDone({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-sm text-muted-foreground">
      <CheckCircle2 className="size-4 shrink-0 text-accent" />
      <span>{children}</span>
    </div>
  );
}

function StepLoading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <Loader2 className="size-4 shrink-0 animate-spin text-accent" />
      <span>{children}</span>
    </div>
  );
}

export function FundingPageContent() {
  const walletSession = useWalletSession();
  const fundingSnapshot = useFundingSnapshot();
  const privateBalancesMutation = usePrivateBalancesMutation(
    walletSession.address,
  );
  const privateTransferMutation = usePrivateTransferFundingMutation(
    walletSession.address,
  );

  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<FundingStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [depositMore, setDepositMore] = useState(false);
  const [balanceCheckEmpty, setBalanceCheckEmpty] = useState(false);

  const parsedAmount = useMemo(() => {
    const trimmed = amount.trim();
    if (!trimmed) return null;
    try {
      const wei = parseUnits(trimmed, CONFIDENTIAL_USDC_DECIMALS);
      return wei > BigInt(0) ? wei : null;
    } catch {
      return null;
    }
  }, [amount]);

  const vaultFunding = useVaultFunding(walletSession.address, parsedAmount);
  const platformRecipientAddress = fundingSnapshot.platformRecipientAddress;
  const privateBalanceLookup = privateBalancesMutation.data;
  const privateUsdcBalance = useMemo(
    () =>
      findUsdcBalance(
        privateBalanceLookup?.status === "ready"
          ? privateBalanceLookup.balances
          : [],
      ),
    [privateBalanceLookup],
  );
  const availableBalance = fundingSnapshot.balance?.available_balance ?? null;
  const hasAvailableBalance = hasPositiveBalance(availableBalance);

  const alreadyFunded =
    fundingSnapshot.status === "funded" ||
    fundingSnapshot.status === "withdrawal_available";

  useEffect(() => {
    if (alreadyFunded && !availableBalance && !privateBalanceLookup) {
      void privateBalancesMutation.mutateAsync();
    }
  }, [alreadyFunded, availableBalance, privateBalanceLookup]); // eslint-disable-line react-hooks/exhaustive-deps

  const displayBalance =
    getDisplayFundingBalance(fundingSnapshot.balance) ??
    (privateUsdcBalance
      ? formatFundingBalance(privateUsdcBalance.amount)
      : null);

  async function handleFund() {
    if (!parsedAmount) return;
    setError(null);
    setBalanceCheckEmpty(false);
    try {
      setStep("approving");
      await vaultFunding.approveMutation.mutateAsync();
      setStep("depositing");
      await vaultFunding.depositMutation.mutateAsync();
      setStep("waiting_for_credit");
    } catch (err) {
      setStep("idle");
      if (err instanceof Error) {
        setError(err.message);
      }
    }
  }

  async function handleCheckBalance() {
    setError(null);
    setBalanceCheckEmpty(false);
    try {
      const result = await privateBalancesMutation.mutateAsync();
      const usdcBalance = findUsdcBalance(
        result.status === "ready" ? result.balances : [],
      );
      if (usdcBalance && BigInt(usdcBalance.amount) > BigInt(0)) {
        setStep("ready_to_activate");
      } else {
        setBalanceCheckEmpty(true);
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      }
    }
  }

  async function handleActivate() {
    if (!platformRecipientAddress || !privateUsdcBalance) return;
    setError(null);
    try {
      setStep("activating");
      await privateTransferMutation.mutateAsync({
        recipient: platformRecipientAddress as Address,
        amount: privateUsdcBalance.amount,
      });
      await fundingSnapshot.refresh();
      setStep("complete");
      setDepositMore(false);
    } catch (err) {
      setStep("ready_to_activate");
      if (err instanceof Error) {
        setError(err.message);
      }
    }
  }

  return (
    <main className="min-h-screen text-foreground">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-8 px-6 py-10 md:px-10 md:py-16">
        <header className="space-y-4">
          <FundingStatusBadge status={fundingSnapshot.status} />
          <h1 className="font-serif text-[3rem] leading-[0.95] font-medium tracking-[-0.04em]">
            Fund your wallet
          </h1>
          <p className="text-[1.05rem] leading-8 text-muted-foreground">
            Deposit USDC to start bidding on auctions.
          </p>
        </header>

        <Card className="border-border/70">
          <CardContent className="space-y-6 pt-6">
            {!walletSession.isConnected ? (
              <div className="space-y-4">
                <p className="text-sm leading-7 text-muted-foreground">
                  Connect a Sepolia wallet to get started.
                </p>
                <ConnectWalletButton />
              </div>
            ) : !walletSession.isSupportedChain ? (
              <div className="space-y-4">
                <p className="text-sm leading-7 text-muted-foreground">
                  Switch to {walletSession.requiredChainName} to continue.
                </p>
                <SwitchNetworkButton showError />
              </div>
            ) : alreadyFunded && step === "idle" && !depositMore ? (
              <div className="space-y-5">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-5 text-accent" />
                  <p className="font-medium text-foreground">
                    Your wallet is funded
                  </p>
                </div>
                {displayBalance ? (
                  <p className="font-serif text-[2rem] leading-none font-medium tracking-[-0.04em]">
                    {displayBalance}
                  </p>
                ) : privateBalancesMutation.isPending ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    <span>Loading balance</span>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-3">
                  <Button asChild>
                    <Link href="/#auctions">
                      Browse auctions
                      <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDepositMore(true);
                      setAmount("");
                      setError(null);
                    }}
                  >
                    Deposit more
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <CheckCircle2 className="size-4 text-accent" />
                  <span className="font-mono">
                    {walletSession.address
                      ? formatAddress(walletSession.address)
                      : "Connected"}
                  </span>
                </div>

                {step === "idle" ? (
                  <div className="space-y-4">
                    <div className="grid gap-2">
                      <Label htmlFor="fund-amount">Amount (USDC)</Label>
                      <Input
                        id="fund-amount"
                        inputMode="decimal"
                        placeholder="10"
                        value={amount}
                        onChange={(e) => {
                          setAmount(e.target.value);
                          if (error) setError(null);
                        }}
                      />
                    </div>
                    <Button
                      className="w-full"
                      disabled={!parsedAmount}
                      onClick={() => {
                        void handleFund();
                      }}
                    >
                      Fund wallet
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full text-muted-foreground"
                      disabled={privateBalancesMutation.isPending}
                      onClick={() => {
                        void handleCheckBalance();
                      }}
                    >
                      {privateBalancesMutation.isPending
                        ? "Checking..."
                        : "Already deposited? Check balance"}
                    </Button>
                  </div>
                ) : null}

                {step === "approving" ? (
                  <StepLoading>
                    Approving USDC — confirm in your wallet
                  </StepLoading>
                ) : null}

                {step === "depositing" ? (
                  <div className="space-y-3">
                    <StepDone>USDC approved</StepDone>
                    <StepLoading>
                      Depositing into vault — confirm in your wallet
                    </StepLoading>
                  </div>
                ) : null}

                {step === "waiting_for_credit" ? (
                  <div className="space-y-4">
                    <StepDone>USDC approved</StepDone>
                    <StepDone>Deposited into vault</StepDone>
                    <p className="text-sm leading-7 text-muted-foreground">
                      {balanceCheckEmpty
                        ? "Still processing — wait a moment and try again."
                        : "Your deposit is being processed. This can take up to a minute."}
                    </p>
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled={privateBalancesMutation.isPending}
                      onClick={() => {
                        void handleCheckBalance();
                      }}
                    >
                      {privateBalancesMutation.isPending ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Checking...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="size-4" />
                          Check balance
                        </>
                      )}
                    </Button>
                  </div>
                ) : null}

                {step === "ready_to_activate" && privateUsdcBalance ? (
                  <div className="space-y-5">
                    <StepDone>Deposit confirmed</StepDone>
                    <p className="font-serif text-[2rem] leading-none font-medium tracking-[-0.04em]">
                      {formatFundingBalance(privateUsdcBalance.amount)}
                    </p>
                    <p className="text-sm leading-7 text-muted-foreground">
                      Sign one more message to activate your funds for bidding.
                    </p>
                    <Button
                      className="w-full"
                      disabled={!platformRecipientAddress}
                      onClick={() => {
                        void handleActivate();
                      }}
                    >
                      Activate funds
                    </Button>
                  </div>
                ) : null}

                {step === "activating" ? (
                  <div className="space-y-3">
                    <StepDone>Deposit confirmed</StepDone>
                    <StepLoading>
                      Activating funds — sign in your wallet
                    </StepLoading>
                  </div>
                ) : null}

                {step === "complete" ? (
                  <div className="space-y-5">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="size-5 text-accent" />
                      <p className="font-medium text-foreground">
                        Your wallet is funded
                      </p>
                    </div>
                    {displayBalance ? (
                      <p className="font-serif text-[2rem] leading-none font-medium tracking-[-0.04em]">
                        {displayBalance}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-3">
                      <Button asChild>
                        <Link href="/#auctions">
                          Browse auctions
                          <ArrowRight className="size-4" />
                        </Link>
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setStep("idle");
                          setDepositMore(true);
                          setAmount("");
                          setError(null);
                        }}
                      >
                        Deposit more
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {error ? (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertTitle>Something went wrong</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
