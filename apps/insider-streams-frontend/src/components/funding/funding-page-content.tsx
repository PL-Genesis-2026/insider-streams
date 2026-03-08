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
  ChevronDown,
  Eye,
  Loader2,
  RefreshCw,
} from "lucide-react";
import {
  erc20Abi,
  parseUnits,
  type Address,
  zeroAddress,
} from "viem";
import { useReadContract } from "wagmi";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ConfidentialUsdcFaucetButton } from "@/components/funding/confidential-usdc-faucet-button";
import { FundingStatusBadge } from "@/components/funding/funding-status-badge";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";
import { SwitchNetworkButton } from "@/components/wallet/switch-network-button";
import { getFundingStatusCopy } from "@/lib/funding/get-funding-snapshot";
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
import { findUsdcBalance } from "@/lib/private-token/find-usdc-balance";
import { useWalletSession } from "@/lib/wallet/use-wallet-session";

type FundingStep =
  | "idle"
  | "approving"
  | "depositing"
  | "waiting_for_credit"
  | "ready_to_activate"
  | "activating"
  | "complete";

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

function DiagnosticRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground/70">{label}</span>
      <span className="text-right text-foreground">{value}</span>
    </div>
  );
}

function BalancePanel({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-[calc(var(--radius)-2px)] border border-border/70 bg-muted/20 p-4">
      <p className="text-xs font-medium uppercase tracking-[0.22em] text-accent">
        {label}
      </p>
      <p className="mt-3 font-serif text-[1.8rem] leading-none font-medium tracking-[-0.04em] text-foreground">
        {value}
      </p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

export function FundingPageContent() {
  const walletSession = useWalletSession();
  const [hasRequestedFundingCheck, setHasRequestedFundingCheck] =
    useState(false);
  const fundingSnapshot = useFundingSnapshot({
    enabled:
      hasRequestedFundingCheck &&
      walletSession.isConnected &&
      walletSession.isSupportedChain,
  });
  const publicWalletBalanceQuery = useReadContract({
    address: PRIVATE_CONFIDENTIAL_USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [walletSession.address ?? zeroAddress],
    query: {
      enabled: Boolean(walletSession.address) && walletSession.isSupportedChain,
    },
  });
  const statusCopy = getFundingStatusCopy(fundingSnapshot.status);
  const {
    data: privateBalanceLookup,
    isPending: isCheckingPrivateBalances,
    mutateAsync: loadPrivateBalances,
  } = usePrivateBalancesMutation(
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

  const alreadyFunded =
    fundingSnapshot.status === "funded" ||
    fundingSnapshot.status === "withdrawal_available";

  useEffect(() => {
    if (alreadyFunded && !availableBalance && !privateBalanceLookup) {
      void loadPrivateBalances({});
    }
  }, [alreadyFunded, availableBalance, privateBalanceLookup, loadPrivateBalances]);

  const displayBalance =
    getDisplayFundingBalance(fundingSnapshot.balance) ??
    (privateUsdcBalance
      ? formatFundingBalance(privateUsdcBalance.amount)
      : null);
  const publicWalletBalanceDisplay =
    publicWalletBalanceQuery.data !== undefined
      ? formatFundingBalance(publicWalletBalanceQuery.data.toString())
      : walletSession.isConnected && walletSession.isSupportedChain
        ? "Loading..."
        : "Connect wallet";
  const latestTransfer = fundingSnapshot.transfers[0];
  const hasRecordedSnapshot =
    fundingSnapshot.balance !== undefined || fundingSnapshot.transfers.length > 0;
  const privateBalanceState =
    privateBalanceLookup === undefined
      ? "Not checked yet"
      : privateBalanceLookup.status === "not_funded_yet"
        ? "No private wallet credit yet"
        : privateUsdcBalance
          ? formatFundingBalance(privateUsdcBalance.amount)
          : "Private wallet active, but no USDC balance";
  const diagnosticsNote =
    walletSession.isConnected && walletSession.isSupportedChain
      ? fundingSnapshot.status === "not_funded_yet" && !hasRecordedSnapshot
        ? "This wallet has no funding snapshot yet. That usually means no deposit has been recorded for this address, or the private-token credit has not landed yet."
        : fundingSnapshot.status === "funding_unavailable"
          ? "The funding snapshot request failed. The wallet may be connected correctly, but the app could not read the balance or transfer history."
          : null
      : null;

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
      const result = await loadPrivateBalances({});
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
            {statusCopy.title}
          </h1>
          <p className="text-[1.05rem] leading-8 text-muted-foreground">
            {statusCopy.description}
          </p>
        </header>

        <Card className="border-border/70 bg-muted/30">
          <CardContent className="flex items-center justify-between gap-4 pt-6">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-accent">
                Testnet faucet
              </p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Need test tokens? Mint ConfidentialUSDC directly to your wallet,
                then deposit below.
              </p>
            </div>
            <ConfidentialUsdcFaucetButton
              onSuccess={() => void publicWalletBalanceQuery.refetch()}
            />
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <BalancePanel
            label="Public wallet balance"
            value={publicWalletBalanceDisplay}
            description="This stays in your Sepolia wallet. Deposit from here into the vault."
          />
          <BalancePanel
            label="Private bidding balance"
            value={
              displayBalance ??
              (fundingSnapshot.status === "private_data_hidden"
                ? fundingSnapshot.isLoading
                  ? "Checking..."
                  : "—"
                : walletSession.isConnected
                  ? "Not funded yet"
                  : "Connect wallet")
            }
            description="This lives in the private system and is the balance used for bids."
          />
        </div>

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
            ) : fundingSnapshot.status === "private_data_hidden" ? (
              <div className="space-y-4">
                <p className="text-sm leading-7 text-muted-foreground">
                  Check your private bidding balance and funding status. This
                  requires a one-time signature.
                </p>
                <Button
                  onClick={() => setHasRequestedFundingCheck(true)}
                  disabled={fundingSnapshot.isLoading}
                >
                  {fundingSnapshot.isLoading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Checking...
                    </>
                  ) : (
                    <>
                      <Eye className="size-4" />
                      Check funding status
                    </>
                  )}
                </Button>
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
                ) : isCheckingPrivateBalances ? (
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

                <details className="group rounded-[calc(var(--radius)-2px)] border border-border/70 bg-muted/20">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground select-none [&::-webkit-details-marker]:hidden">
                    Wallet diagnostics
                    <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="space-y-3 px-4 pb-4">
                    <div className="flex items-center justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-auto px-0 text-xs text-muted-foreground"
                        onClick={() => {
                          void fundingSnapshot.refresh();
                        }}
                      >
                        Refresh snapshot
                      </Button>
                    </div>
                    <DiagnosticRow
                      label="Address"
                      value={walletSession.address ?? "Unavailable"}
                    />
                    <DiagnosticRow
                      label="Network"
                      value={
                        walletSession.currentChainName ??
                        walletSession.requiredChainName
                      }
                    />
                    <DiagnosticRow
                      label="Funding status"
                      value={statusCopy.title}
                    />
                    <DiagnosticRow
                      label="Public wallet balance"
                      value={publicWalletBalanceDisplay}
                    />
                    <DiagnosticRow
                      label="Recorded balance"
                      value={displayBalance ?? "None recorded yet"}
                    />
                    <DiagnosticRow
                      label="Private balance check"
                      value={privateBalanceState}
                    />
                    <DiagnosticRow
                      label="Transfer history"
                      value={
                        fundingSnapshot.transfers.length === 0
                          ? "No transfers recorded"
                          : `${fundingSnapshot.transfers.length} recent transfer${fundingSnapshot.transfers.length === 1 ? "" : "s"}`
                      }
                    />
                    <DiagnosticRow
                      label="Platform recipient"
                      value={
                        fundingSnapshot.platformRecipientAddress ?? "Unavailable"
                      }
                    />
                    {latestTransfer ? (
                      <>
                        <Separator className="my-3" />
                        <div className="space-y-2 text-sm">
                          <p className="text-xs font-medium uppercase tracking-[0.22em] text-accent">
                            Latest transfer
                          </p>
                          <DiagnosticRow
                            label="Amount"
                            value={formatFundingBalance(latestTransfer.amount)}
                          />
                          <DiagnosticRow
                            label="Status"
                            value={latestTransfer.status}
                          />
                          <DiagnosticRow
                            label="Recorded"
                            value={new Date(latestTransfer.created_at).toLocaleString()}
                          />
                        </div>
                      </>
                    ) : null}
                    {diagnosticsNote ? (
                      <p className="mt-3 text-sm leading-7 text-muted-foreground">
                        {diagnosticsNote}
                      </p>
                    ) : null}
                  </div>
                </details>

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
                      disabled={isCheckingPrivateBalances}
                      onClick={() => {
                        void handleCheckBalance();
                      }}
                    >
                      {isCheckingPrivateBalances
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
                      disabled={isCheckingPrivateBalances}
                      onClick={() => {
                        void handleCheckBalance();
                      }}
                    >
                      {isCheckingPrivateBalances ? (
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
