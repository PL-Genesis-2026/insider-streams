"use client";

import { useMemo, useState } from "react";
import {
  CONFIDENTIAL_USDC_DECIMALS,
  PLATFORM_EOA_ADDRESS,
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
import { parseUnits } from "viem";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import {
  formatFundingBalance,
  getDisplayFundingBalance,
} from "@/lib/funding/format-funding-balance";
import { useFundingSnapshot } from "@/lib/funding/use-funding-snapshot";
import { useDeposit, useWithdraw } from "@/lib/private-token/hooks";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";
import { SwitchNetworkButton } from "@/components/wallet/switch-network-button";
import { useConfidentialBalance } from "@/lib/fhevm/use-confidential-balance";
import { cn } from "@/lib/utils";
import { useWalletSession } from "@/lib/wallet/use-wallet-session";

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
  const [walletMode, setWalletMode] = useState<"deposit" | "withdraw">(
    "deposit",
  );
  const [amount, setAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fundingSnapshot = useFundingSnapshot({ enabled: isRevealed });
  const depositMutation = useDeposit();
  const withdrawMutation = useWithdraw();
  const walletBalance = useConfidentialBalance();

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

  const availableBalanceRaw = fundingSnapshot.balance
    ? BigInt(fundingSnapshot.balance)
    : BigInt(0);
  const displayAvailable = formatFundingBalance(availableBalanceRaw.toString());
  const canWithdraw = availableBalanceRaw > BigInt(0);

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

  async function handleDeposit() {
    if (!amount.trim() || !parsedAmount) return;
    setError(null);
    setSuccessMessage(null);

    try {
      await depositMutation.mutateAsync(amount.trim());
      await fundingSnapshot.refresh();
      setAmount("");
      setSuccessMessage("Deposit submitted. Your balance will update shortly.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to submit deposit.",
      );
    }
  }

  async function handleWithdraw() {
    if (!withdrawAmount.trim() || !parsedWithdrawAmount) return;

    if (parsedWithdrawAmount > availableBalanceRaw) {
      setError("Withdrawal amount exceeds available balance.");
      return;
    }

    setError(null);
    setSuccessMessage(null);

    try {
      await withdrawMutation.mutateAsync(withdrawAmount.trim());
      await fundingSnapshot.refresh();
      setWithdrawAmount("");
      setSuccessMessage("Withdrawal submitted. Funds are being returned to your balance.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to submit withdrawal.",
      );
    }
  }

  const actionState = !isRevealed
    ? "unlock"
    : fundingSnapshot.status === "funding_unavailable"
      ? "unavailable"
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
    },
    unavailable: {
      badge: "Wallet error",
      title: "Wallet data unavailable",
      description:
        "Your wallet data could not be loaded right now. Refresh and try again.",
    },
    deposit: {
      badge: "Deposit needed",
      title: "Add funds to start bidding",
      description:
        "Deposit USDC to your private bidding balance.",
    },
    withdraw: {
      badge: "Wallet ready",
      title: "Your wallet",
      description:
        "Deposit more to increase your bidding power, or withdraw to reclaim funds.",
    },
    ready: {
      badge: "Wallet ready",
      title: "Your wallet",
      description:
        "Your balance is ready for bidding. Browse auctions or deposit more below.",
    },
  }[actionState];

  const projectedRemaining =
    parsedWithdrawAmount && parsedWithdrawAmount <= availableBalanceRaw
      ? formatFundingBalance((availableBalanceRaw - parsedWithdrawAmount).toString())
      : displayAvailable;

  const resetActionInputs = () => {
    setAmount("");
    setWithdrawAmount("");
    setError(null);
    setSuccessMessage(null);
  };

  const refreshWallet = () => {
    void fundingSnapshot.refresh();
    void walletBalance.refresh();
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
                Connect your wallet to deposit funds or manage your bidding balance.
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

  const isDepositing = depositMutation.isPending;
  const isWithdrawing = withdrawMutation.isPending;

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
            <div className="grid gap-3 md:grid-cols-3">
              <CompactMetric label="Bidding balance" value={displayAvailable} accent />
              <CompactMetric
                label="Wallet balance"
                value={
                  walletBalance.balance !== null
                    ? formatFundingBalance(walletBalance.balance.toString())
                    : walletBalance.decryptState === "decrypting"
                      ? "Decrypting..."
                      : walletBalance.handle
                        ? "Encrypted"
                        : "—"
                }
              />
              <CompactMetric
                label="Status"
                value={fundingSnapshot.status === "not_funded_yet" ? "No deposits yet" : "Active"}
              />
            </div>
            {walletBalance.handle && walletBalance.balance === null && walletBalance.decryptState !== "decrypting" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { void walletBalance.decrypt(); }}
                disabled={!walletBalance.canDecrypt || walletBalance.isFhevmLoading}
              >
                {walletBalance.isFhevmLoading ? (
                  <><Loader2 className="size-3.5 animate-spin" /> Loading FHE...</>
                ) : (
                  <><Eye className="size-3.5" /> Decrypt wallet balance</>
                )}
              </Button>
            )}
            {walletBalance.error && (
              <p className="text-sm text-destructive">{walletBalance.error}</p>
            )}
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
                  Your wallet will ask you to sign a message. This proves you own this address and loads your balances. It does not cost gas or move any funds.
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
                        <ConfidentialUsdcFaucetButton />
                      </div>

                      <Button
                        className="w-full sm:w-auto"
                        disabled={!parsedAmount || isDepositing}
                        onClick={() => {
                          void handleDeposit();
                        }}
                      >
                        {isDepositing ? (
                          <>
                            <Loader2 className="size-4 animate-spin" />
                            Depositing...
                          </>
                        ) : (
                          "Deposit"
                        )}
                      </Button>
                    </div>

                    <div className="rounded-[calc(var(--radius)-4px)] border border-border/40 bg-muted/8 p-4">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60">
                        How it works
                      </p>
                      <ol className="mt-3 list-inside list-decimal space-y-2 text-sm leading-6 text-muted-foreground">
                        <li>Enter a USDC amount</li>
                        <li>Sign the deposit request</li>
                        <li>Funds are added to your bidding balance</li>
                      </ol>
                      <p className="mt-3 text-xs leading-5 text-muted-foreground/60">
                        One wallet signature. No on-chain gas required.
                      </p>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="withdraw" className="m-0">
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
                    <div className="space-y-4">
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
                            setSuccessMessage(null);
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
                            "Withdraw"
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
                          No available balance to withdraw. Deposit first.
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

          {error || successMessage ? (
            <div className="space-y-3">
              {error ? (
                <Alert variant="destructive">
                  <AlertCircle />
                  <AlertTitle>Wallet action failed</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              {successMessage ? (
                <Alert>
                  <CheckCircle2 />
                  <AlertTitle>Wallet updated</AlertTitle>
                  <AlertDescription>{successMessage}</AlertDescription>
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
              label="Current chain"
              value={
                walletSession.currentChainName ?? walletSession.requiredChainName
              }
            />
            <DiagnosticRow label="Address" value={walletSession.address} />
          </div>

          <div className="space-y-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground/70">
              Technical
            </p>
            <DiagnosticRow label="Funding status" value={fundingSnapshot.status} />
            <DiagnosticRow
              label="Bidding balance (marketplace)"
              value={getDisplayFundingBalance(fundingSnapshot.balance) ?? "Unavailable"}
            />
            <DiagnosticRow
              label="Wallet balance (cUSDC)"
              value={
                walletBalance.balance !== null
                  ? formatFundingBalance(walletBalance.balance.toString())
                  : walletBalance.handle
                    ? `Encrypted (${walletBalance.decryptState})`
                    : "No balance"
              }
            />
            <DiagnosticRow
              label="FHE SDK status"
              value={walletBalance.isFhevmLoading ? "Loading..." : walletBalance.handle ? "Ready" : "Idle"}
            />
            <DiagnosticRow
              label="Platform recipient"
              value={PLATFORM_EOA_ADDRESS}
            />
          </div>
        </div>
      </details>
    </section>
  );
}
