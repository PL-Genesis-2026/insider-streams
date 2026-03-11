"use client";

import { useMemo, useState } from "react";
import stringify from "fast-json-stable-stringify";
import {
  CONFIDENTIAL_USDC_DECIMALS,
  PLATFORM_EOA_ADDRESS,
  PRIVATE_CONFIDENTIAL_USDC_ADDRESS,
} from "@private-streams/common";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Eye,
  Loader2,
  RefreshCw,
  Wallet,
} from "lucide-react";
import {
  erc20Abi,
  parseUnits,
  type Address,
  type Hex,
  zeroAddress,
} from "viem";
import { useReadContract, useSignMessage } from "wagmi";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfidentialUsdcFaucetButton } from "@/components/funding/confidential-usdc-faucet-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requestFundingWithdrawal } from "@/lib/funding/api";
import {
  formatFundingBalance,
  getDisplayFundingBalance,
} from "@/lib/funding/format-funding-balance";
import { useFundingSnapshot } from "@/lib/funding/use-funding-snapshot";
import { findUsdcBalance } from "@/lib/private-token/find-usdc-balance";
import {
  usePrivateBalancesMutation,
  usePrivateTransferFundingMutation,
  usePrivateWithdrawMutation,
  useRedeemWithdrawalTicketMutation,
  useVaultFunding,
} from "@/lib/private-token/hooks";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";
import { SwitchNetworkButton } from "@/components/wallet/switch-network-button";
import { cn } from "@/lib/utils";
import { useWalletSession } from "@/lib/wallet/use-wallet-session";

type FundingStep =
  | "idle"
  | "approving"
  | "depositing"
  | "waiting_for_credit"
  | "ready_to_activate"
  | "activating";

type WalletActionCenterProps = {
  id?: string;
  isRevealed: boolean;
  isRevealing: boolean;
  onReveal: () => void;
};

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

function CompactMetric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[calc(var(--radius)-6px)] px-4 py-3",
        accent
          ? "border border-accent/25 bg-accent/6"
          : "border border-border/50 bg-muted/10",
      )}
    >
      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground/70">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 font-serif leading-none tracking-[-0.05em]",
          accent
            ? "text-[1.7rem] text-foreground"
            : "text-[1.45rem] text-foreground/80",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function WalletActionCenter({
  id = "wallet",
  isRevealed,
  isRevealing,
  onReveal,
}: WalletActionCenterProps) {
  const walletSession = useWalletSession();
  const { signMessageAsync } = useSignMessage();
  const [step, setStep] = useState<FundingStep>("idle");
  const [walletMode, setWalletMode] = useState<"deposit" | "withdraw">(
    "deposit",
  );
  const [amount, setAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawSuccessMessage, setWithdrawSuccessMessage] = useState<
    string | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [balanceCheckEmpty, setBalanceCheckEmpty] = useState(false);

  const fundingSnapshot = useFundingSnapshot({ enabled: isRevealed });
  const publicWalletBalanceQuery = useReadContract({
    address: PRIVATE_CONFIDENTIAL_USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [walletSession.address ?? zeroAddress],
    query: {
      enabled: Boolean(walletSession.address) && walletSession.isSupportedChain,
    },
  });
  const {
    data: privateBalanceLookup,
    isPending: isCheckingPrivateBalances,
    mutateAsync: loadPrivateBalances,
  } = usePrivateBalancesMutation(walletSession.address);
  const privateTransferMutation = usePrivateTransferFundingMutation(
    walletSession.address,
  );
  const privateWithdrawMutation = usePrivateWithdrawMutation(
    walletSession.address,
  );
  const redeemWithdrawalTicketMutation = useRedeemWithdrawalTicketMutation();

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

  const parsedWithdrawAmount = useMemo(() => {
    const trimmed = withdrawAmount.trim();
    if (!trimmed) return null;
    try {
      const wei = parseUnits(trimmed, CONFIDENTIAL_USDC_DECIMALS);
      return wei > BigInt(0) ? wei : null;
    } catch {
      return null;
    }
  }, [withdrawAmount]);

  const vaultFunding = useVaultFunding(walletSession.address, parsedAmount);
  const privateUsdcBalance = useMemo(
    () =>
      findUsdcBalance(
        privateBalanceLookup?.status === "ready"
          ? privateBalanceLookup.balances
          : [],
      ),
    [privateBalanceLookup],
  );
  const availableBalanceRaw = fundingSnapshot.balance
    ? BigInt(fundingSnapshot.balance)
    : BigInt(0);
  const displayAvailable = formatFundingBalance(availableBalanceRaw.toString());
  const displayPublicWallet =
    publicWalletBalanceQuery.data !== undefined
      ? formatFundingBalance(publicWalletBalanceQuery.data.toString())
      : walletSession.isConnected && walletSession.isSupportedChain
        ? "Loading..."
        : "Connect wallet";

  const canWithdraw = availableBalanceRaw > BigInt(0);
  const hasDetectedPrivateBalance =
    privateUsdcBalance !== undefined &&
    BigInt(privateUsdcBalance.amount) > BigInt(0);


  const withdrawValidationMessage = useMemo(() => {
    if (!withdrawAmount.trim()) return null;
    if (!parsedWithdrawAmount) {
      return "Enter a valid withdrawal amount.";
    }
    if (parsedWithdrawAmount > availableBalanceRaw) {
      return "Withdrawal amount exceeds available balance.";
    }
    return null;
  }, [availableBalanceRaw, parsedWithdrawAmount, withdrawAmount]);

  async function handleFund() {
    if (!parsedAmount) return;
    setError(null);
    setBalanceCheckEmpty(false);
    setWithdrawSuccessMessage(null);

    try {
      setStep("approving");
      await vaultFunding.approveMutation.mutateAsync();
      setStep("depositing");
      await vaultFunding.depositMutation.mutateAsync();
      setStep("waiting_for_credit");
    } catch (fundError) {
      setStep("idle");
      if (fundError instanceof Error) {
        setError(fundError.message);
      }
    }
  }

  async function handleCheckBalance() {
    setError(null);
    setBalanceCheckEmpty(false);

    try {
      const result = await loadPrivateBalances({ forceFresh: true });
      const usdcBalance = findUsdcBalance(
        result.status === "ready" ? result.balances : [],
      );

      if (usdcBalance && BigInt(usdcBalance.amount) > BigInt(0)) {
        setStep("ready_to_activate");
      } else {
        setBalanceCheckEmpty(true);
      }
    } catch (checkError) {
      if (checkError instanceof Error) {
        setError(checkError.message);
      }
    }
  }

  async function handleActivate() {
    if (!privateUsdcBalance) {
      return;
    }

    setError(null);
    try {
      setStep("activating");
      await privateTransferMutation.mutateAsync({
        recipient: PLATFORM_EOA_ADDRESS as Address,
        amount: privateUsdcBalance.amount,
      });
      await Promise.all([
        fundingSnapshot.refresh(),
        loadPrivateBalances({ forceFresh: true }),
      ]);
      setStep("idle");
      setAmount("");
    } catch (activateError) {
      setStep("ready_to_activate");
      if (activateError instanceof Error) {
        setError(activateError.message);
      }
    }
  }

  async function handleWithdraw() {
    if (!parsedWithdrawAmount) {
      setError("Enter a valid withdrawal amount.");
      return;
    }

    if (parsedWithdrawAmount > availableBalanceRaw) {
      setError("Withdrawal amount exceeds available balance.");
      return;
    }

    setIsWithdrawing(true);
    setError(null);
    setWithdrawSuccessMessage(null);

    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const payload = {
        amount: parsedWithdrawAmount.toString(),
        timestamp,
      };
      const signature = await signMessageAsync({
        message: stringify(payload),
      });
      await requestFundingWithdrawal({
        ...payload,
        signature,
      });

      await Promise.all([
        fundingSnapshot.refresh(),
        publicWalletBalanceQuery.refetch(),
        loadPrivateBalances({ forceFresh: true }),
      ]);
      setWithdrawAmount("");
      setWithdrawSuccessMessage("Withdrawal completed to your public wallet.");
    } catch (withdrawError) {
      setError(
        withdrawError instanceof Error
          ? withdrawError.message
          : "Failed to submit withdrawal.",
      );
    } finally {
      setIsWithdrawing(false);
    }
  }

  async function handleWithdrawDetectedPrivateBalance() {
    if (!privateUsdcBalance) return;

    setIsWithdrawing(true);
    setError(null);
    setWithdrawSuccessMessage(null);

    try {
      const withdrawalResponse = await privateWithdrawMutation.mutateAsync({
        amount: privateUsdcBalance.amount,
      });
      await redeemWithdrawalTicketMutation.mutateAsync({
        amount: privateUsdcBalance.amount,
        ticket: withdrawalResponse.ticket as Hex,
      });
      await Promise.all([
        publicWalletBalanceQuery.refetch(),
        loadPrivateBalances({ forceFresh: true }),
      ]);
      setWithdrawSuccessMessage(
        `Moved ${formatFundingBalance(privateUsdcBalance.amount)} into your public wallet.`,
      );
    } catch (recoverError) {
      setError(
        recoverError instanceof Error
          ? recoverError.message
          : "Failed to withdraw the detected private balance.",
      );
    } finally {
      setIsWithdrawing(false);
    }
  }

  const actionState = !isRevealed
    ? "unlock"
    : fundingSnapshot.status === "funding_unavailable"
      ? "unavailable"
      : fundingSnapshot.status === "reconciling_transfer"
        ? "reconciling"
        : canWithdraw
          ? "withdraw"
          : fundingSnapshot.status === "not_funded_yet"
            ? "deposit"
            : "ready";

  const actionCopy = {
    unlock: {
      badge: "Wallet locked",
      title: "Unlock your wallet",
      description:
        "Sign once to load your balances and see what you can do next.",
      helper: null,
    },
    unavailable: {
      badge: "Wallet error",
      title: "Wallet data unavailable",
      description:
        "Your wallet data could not be loaded right now. Refresh and try again.",
      helper: null,
    },
    reconciling: {
      badge: "Transfer settling",
      title: "Your transfer is processing",
      description:
        "A deposit transfer is still settling. Your balance will update automatically once it lands.",
      helper: null,
    },
    deposit: {
      badge: "Deposit needed",
      title: "Add funds to start bidding",
      description:
        "Move USDC from your public wallet into your private bidding balance.",
      helper:
        "Two wallet signatures now, then one more after the deposit arrives.",
    },
    withdraw: {
      badge: "Wallet ready",
      title: "Your wallet",
      description:
        "Deposit more to increase your bidding power, or withdraw to your public wallet.",
      helper: "Withdrawals require two signatures and one on-chain confirmation.",
    },
    ready: {
      badge: "Wallet ready",
      title: "Your wallet",
      description:
        "Your balance is ready for bidding. Browse auctions or deposit more below.",
      helper: null,
    },
  }[actionState];

  const displayPrivateAggregate =
    isCheckingPrivateBalances
      ? "Loading..."
      : privateUsdcBalance
        ? formatFundingBalance(privateUsdcBalance.amount)
        : privateBalanceLookup?.status === "ready"
          ? "0 USDC"
          : "Not checked";

  const projectedRemaining =
    parsedWithdrawAmount && parsedWithdrawAmount <= availableBalanceRaw
      ? formatFundingBalance((availableBalanceRaw - parsedWithdrawAmount).toString())
      : displayAvailable;

  const resetActionInputs = () => {
    setAmount("");
    setWithdrawAmount("");
    setError(null);
    setWithdrawSuccessMessage(null);
    setStep("idle");
  };

  const refreshWallet = () => {
    void Promise.allSettled([
      fundingSnapshot.refresh(),
      publicWalletBalanceQuery.refetch(),
      loadPrivateBalances({ forceFresh: true }),
    ]);
  };

  if (!walletSession.isConnected || !walletSession.address) {
    return (
      <section id={id}>
        <Card className="border-border/70 bg-muted/24">
          <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.24em] text-accent">
                Wallet
              </p>
              <p className="text-sm leading-7 text-muted-foreground">
                Connect your wallet to deposit funds, resume withdrawals, or move money back to your public balance.
              </p>
            </div>
            <ConnectWalletButton className="w-full sm:w-auto" />
          </CardContent>
        </Card>
      </section>
    );
  }

  if (!walletSession.isSupportedChain) {
    return (
      <section id={id}>
        <Card className="border-border/70 bg-muted/24">
          <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.24em] text-accent">
                Wallet
              </p>
              <p className="text-sm leading-7 text-muted-foreground">
                Switch to {walletSession.requiredChainName} to manage bidding funds.
              </p>
            </div>
            <SwitchNetworkButton className="w-full sm:w-auto" showError />
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section id={id} className="space-y-4 scroll-mt-24">
      <Card className="overflow-hidden border-border/70 bg-[linear-gradient(135deg,rgba(195,146,110,0.12),transparent_40%),linear-gradient(180deg,color-mix(in_srgb,var(--card)_97%,transparent),color-mix(in_srgb,var(--secondary)_16%,transparent))]">
        <CardHeader className="gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-accent">
              <Wallet className="size-3.5" />
              {actionCopy.badge}
            </div>
            {isRevealed ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-auto gap-1.5 px-2 py-1 text-xs text-muted-foreground"
                onClick={refreshWallet}
              >
                <RefreshCw className="size-3" />
                Refresh
              </Button>
            ) : null}
          </div>

          <div className="space-y-2">
            <CardTitle className="text-[2rem] leading-[0.98] tracking-[-0.05em]">
              {actionCopy.title}
            </CardTitle>
            <CardDescription className="max-w-2xl text-[0.94rem] leading-6">
              {actionCopy.description}
            </CardDescription>
          </div>

          <div className="space-y-2">
            <div className="grid gap-3 md:grid-cols-2">
              <CompactMetric label="Bidding balance" value={displayAvailable} accent />
              <CompactMetric label="Public wallet" value={displayPublicWallet} />
            </div>
            {isRevealed && !hasDetectedPrivateBalance ? (
              <button
                type="button"
                className="text-xs text-accent underline-offset-2 transition-colors hover:underline disabled:opacity-50"
                disabled={isCheckingPrivateBalances}
                onClick={() => {
                  void handleCheckBalance();
                }}
              >
                {isCheckingPrivateBalances
                  ? "Checking private balance..."
                  : "Already deposited? Check private balance"}
              </button>
            ) : null}
            {balanceCheckEmpty ? (
              <p className="text-xs text-muted-foreground">
                Deposit is still processing. Wait a moment, then check again.
              </p>
            ) : null}
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {!isRevealed ? (
            <div className="flex flex-col items-start gap-4 rounded-[calc(var(--radius)-2px)] border border-dashed border-accent/30 bg-accent/4 p-5">
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-foreground">
                  Unlock your wallet to get started
                </p>
                <p className="text-sm leading-6 text-muted-foreground">
                  Your wallet will ask you to sign a message. This proves you own this address and loads your private balances. It does not cost gas or move any funds.
                </p>
              </div>
              <Button
                variant="accent"
                className="w-full sm:w-auto"
                onClick={onReveal}
                disabled={isRevealing}
              >
                {isRevealing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Eye className="size-4" />
                )}
                Sign and unlock
              </Button>
            </div>
          ) : null}

          {isRevealed ? (
            <div className="space-y-5">
              {actionState === "unavailable" ? (
                <div className="flex flex-col gap-4 rounded-[calc(var(--radius)-2px)] border border-destructive/30 bg-destructive/6 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      Could not load wallet data
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Something went wrong fetching your balances. Hit refresh
                      to try again.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={refreshWallet}
                  >
                    <RefreshCw className="size-4" />
                    Refresh
                  </Button>
                </div>
              ) : null}

              {actionState === "reconciling" ? (
                <div className="flex flex-col gap-4 rounded-[calc(var(--radius)-2px)] border border-accent/30 bg-accent/6 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin text-accent" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">
                        Transfer is settling
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Your deposit is being recorded. This usually takes a few
                        moments.
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={refreshWallet}
                  >
                    <RefreshCw className="size-4" />
                    Check now
                  </Button>
                </div>
              ) : null}

              <Tabs
                value={walletMode}
                onValueChange={(value) =>
                  setWalletMode(value === "withdraw" ? "withdraw" : "deposit")
                }
                className="gap-5"
              >
                <TabsList className="h-auto w-fit gap-0 rounded-none border-none bg-transparent p-0">
                  <TabsTrigger
                    value="deposit"
                    className="relative min-w-[100px] rounded-none border-none bg-transparent px-4 py-2 text-sm font-medium text-muted-foreground/60 shadow-none transition-colors after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:rounded-full after:bg-accent after:opacity-0 after:transition-opacity data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:after:opacity-100"
                  >
                    Deposit
                  </TabsTrigger>
                  <TabsTrigger
                    value="withdraw"
                    className="relative min-w-[100px] rounded-none border-none bg-transparent px-4 py-2 text-sm font-medium text-muted-foreground/60 shadow-none transition-colors after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:rounded-full after:bg-accent after:opacity-0 after:transition-opacity data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:after:opacity-100"
                  >
                    Withdraw
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="deposit" className="m-0 space-y-4">
                  {hasDetectedPrivateBalance ? (
                    <div className="flex flex-col gap-3 rounded-[calc(var(--radius)-4px)] border border-accent/25 bg-accent/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium text-foreground">
                          {formatFundingBalance(privateUsdcBalance.amount)} waiting in your private wallet
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Activate it to add to your bidding balance, or switch to Withdraw to move it public.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        className="w-full sm:w-auto"
                        disabled={
                          !privateUsdcBalance ||
                          step === "activating" ||
                          isWithdrawing
                        }
                        onClick={() => {
                          void handleActivate();
                        }}
                      >
                        {step === "activating" ? (
                          <>
                            <Loader2 className="size-4 animate-spin" />
                            Activating...
                          </>
                        ) : (
                          "Activate for bidding"
                        )}
                      </Button>
                    </div>
                  ) : null}

                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
                    <div className="space-y-4">
                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                        <div className="grid gap-1.5">
                          <Label htmlFor="wallet-fund-amount">
                            Amount (USDC)
                          </Label>
                          <Input
                            id="wallet-fund-amount"
                            inputMode="decimal"
                            placeholder="0.00"
                            value={amount}
                            onChange={(event) => {
                              setAmount(event.target.value);
                              setError(null);
                            }}
                          />
                        </div>
                        <ConfidentialUsdcFaucetButton
                          onSuccess={() => void publicWalletBalanceQuery.refetch()}
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <Button
                          className="w-full sm:w-auto"
                          disabled={!parsedAmount || step !== "idle"}
                          onClick={() => {
                            void handleFund();
                          }}
                        >
                          {step === "approving"
                            ? "Approving..."
                            : step === "depositing"
                              ? "Depositing..."
                              : step === "waiting_for_credit"
                                ? "Waiting for credit..."
                                : "Deposit"}
                        </Button>
                        {step === "waiting_for_credit" ? (
                          <Button
                            variant="outline"
                            className="w-full sm:w-auto"
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
                        ) : null}
                      </div>
                      {step === "waiting_for_credit" && balanceCheckEmpty ? (
                        <p className="text-xs text-muted-foreground">
                          Deposit is still processing. Wait a moment, then check again.
                        </p>
                      ) : null}
                    </div>

                    <div className="rounded-[calc(var(--radius)-4px)] border border-border/40 bg-muted/8 p-4">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60">
                        How it works
                      </p>
                      <ol className="mt-3 list-inside list-decimal space-y-2 text-sm leading-6 text-muted-foreground">
                        <li>Approve USDC spend</li>
                        <li>Deposit into the vault</li>
                        <li>Activate for bidding</li>
                      </ol>
                      {actionCopy.helper ? (
                        <p className="mt-3 text-xs leading-5 text-muted-foreground/60">
                          {actionCopy.helper}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="withdraw" className="m-0">
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
                    <div className="space-y-4">
                      {hasDetectedPrivateBalance ? (
                        <div className="flex flex-col gap-3 rounded-[calc(var(--radius)-4px)] border border-accent/25 bg-accent/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="space-y-0.5">
                            <p className="text-sm font-medium text-foreground">
                              {formatFundingBalance(privateUsdcBalance.amount)} waiting in your private wallet
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Move it to your public wallet, or switch to Deposit to activate it for bidding.
                            </p>
                          </div>
                          <Button
                            size="sm"
                            className="w-full sm:w-auto"
                            disabled={
                              isWithdrawing || step === "activating"
                            }
                            onClick={() => {
                              void handleWithdrawDetectedPrivateBalance();
                            }}
                          >
                            {isWithdrawing ? (
                              <>
                                <Loader2 className="size-4 animate-spin" />
                                Moving...
                              </>
                            ) : (
                              "Move to public wallet"
                            )}
                          </Button>
                        </div>
                      ) : null}

                      <div className="grid gap-1.5">
                        <Label htmlFor="wallet-withdraw-amount">
                          Amount (USDC)
                        </Label>
                        <Input
                          id="wallet-withdraw-amount"
                          inputMode="decimal"
                          placeholder="0.00"
                          value={withdrawAmount}
                          onChange={(event) => {
                            setWithdrawAmount(event.target.value);
                            setError(null);
                            setWithdrawSuccessMessage(null);
                          }}
                        />
                      </div>

                      {withdrawValidationMessage ? (
                        <p className="text-sm text-destructive">
                          {withdrawValidationMessage}
                        </p>
                      ) : null}

                      <div className="flex flex-wrap gap-3">
                        <Button
                          className="w-full sm:w-auto"
                          disabled={
                            !canWithdraw ||
                            isWithdrawing ||
                            !parsedWithdrawAmount ||
                            parsedWithdrawAmount > availableBalanceRaw
                          }
                          onClick={() => {
                            void handleWithdraw();
                          }}
                        >
                          {isWithdrawing ? (
                            <>
                              <Loader2 className="size-4 animate-spin" />
                              Withdrawing...
                            </>
                          ) : (
                            "Withdraw to wallet"
                          )}
                        </Button>
                        {withdrawAmount.trim() ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full sm:w-auto"
                            onClick={resetActionInputs}
                          >
                            Clear
                          </Button>
                        ) : null}
                      </div>

                      {!canWithdraw ? (
                        <p className="text-sm text-muted-foreground">
                          No available balance to withdraw. Deposit first or wait for locked funds to release.
                        </p>
                      ) : null}
                    </div>

                    <div className="rounded-[calc(var(--radius)-4px)] border border-border/40 bg-muted/8 p-4">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60">
                        Summary
                      </p>
                      <div className="mt-3 space-y-2.5">
                        <DiagnosticRow
                          label="Available"
                          value={displayAvailable}
                        />
                        <DiagnosticRow
                          label="After withdrawal"
                          value={projectedRemaining}
                        />
                        <DiagnosticRow
                          label="Public wallet"
                          value={displayPublicWallet}
                        />
                      </div>
                      <p className="mt-3 text-xs leading-5 text-muted-foreground/60">
                        Withdrawals reduce your bidding balance by the same amount.
                      </p>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          ) : null}

          {error || withdrawSuccessMessage ? (
            <div className="space-y-3">
              {error ? (
                <Alert variant="destructive">
                  <AlertCircle />
                  <AlertTitle>Wallet action failed</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              {withdrawSuccessMessage ? (
                <Alert>
                  <CheckCircle2 />
                  <AlertTitle>Wallet updated</AlertTitle>
                  <AlertDescription>{withdrawSuccessMessage}</AlertDescription>
                </Alert>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <details className="group rounded-[calc(var(--radius)+4px)] border border-border/50 bg-muted/10">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3.5 text-sm text-muted-foreground select-none [&::-webkit-details-marker]:hidden">
          <span>Activity and diagnostics</span>
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-5 border-t border-border/70 px-5 py-4">
          <div className="space-y-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground/70">
              Wallet details
            </p>
            <DiagnosticRow
              label="Aggregate private USDC"
              value={displayPrivateAggregate}
            />
            <DiagnosticRow
              label="Current chain"
              value={
                walletSession.currentChainName ?? walletSession.requiredChainName
              }
            />
            <DiagnosticRow label="Public wallet" value={walletSession.address} />
          </div>

          <div className="space-y-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground/70">
              Technical
            </p>
            <DiagnosticRow label="Funding status" value={fundingSnapshot.status} />
            <DiagnosticRow
              label="Public wallet balance"
              value={displayPublicWallet}
            />
            <DiagnosticRow
              label="Activated balance"
              value={getDisplayFundingBalance(fundingSnapshot.balance) ?? "Unavailable"}
            />
            <DiagnosticRow
              label="Platform recipient"
              value={PLATFORM_EOA_ADDRESS}
            />
            {balanceCheckEmpty ? (
              <p className="text-sm text-muted-foreground">
                Deposit has been submitted but has not been credited yet. Wait a moment and check again.
              </p>
            ) : null}
          </div>
        </div>
      </details>
    </section>
  );
}
