"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSignTypedData } from "wagmi";
import {
  AlertCircle,
  Calendar,
  Check,
  Hash,
  Loader2,
  Store,
  Wallet,
} from "lucide-react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CREATE_AUCTION_DURATIONS,
  CREATE_AUCTION_EIP712_DOMAIN,
  CREATE_AUCTION_EIP712_TYPES,
  type CreateAuctionDuration,
  type CreateAuctionResponse,
} from "@/lib/create-auction/shared";
import { formatAddress } from "@/lib/wallet/format-address";
import { useWalletSession } from "@/lib/wallet/use-wallet-session";
import { SwitchNetworkButton } from "@/components/wallet/switch-network-button";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";
import { cn } from "@/lib/utils";

type DraftState = {
  eventId: string;
  privateLeg: "yes" | "no" | "";
  secretPayload: string;
  duration: CreateAuctionDuration;
};

type PredictionMarketEvent = {
  eventId: string;
  title: string;
  eventCloseIso: string;
};

type PredictionMarketEventError = {
  error?: string;
};

type PredictionMarketEventsResponse = {
  events: PredictionMarketEvent[];
};

type EventCatalogState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; events: PredictionMarketEvent[] };

type SubmitState =
  | { status: "idle" }
  | { status: "signing" }
  | { status: "submitting" }
  | { status: "error"; message: string; auctionId?: string; txHash?: string }
  | { status: "success"; auctionId: string; sellerId: string; txHash: string };

const initialDraftState: DraftState = {
  eventId: "",
  privateLeg: "",
  secretPayload: "",
  duration: "24h",
};

const CLOSE_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
};

function isPredictionMarketEventsResponse(
  value: PredictionMarketEventsResponse | PredictionMarketEventError,
): value is PredictionMarketEventsResponse {
  return "events" in value && Array.isArray(value.events);
}

function formatCloseDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", CLOSE_DATE_FORMAT).format(
    new Date(iso),
  );
}

function timeUntilClose(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const hours = Math.floor(ms / 3_600_000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h remaining`;
  if (hours > 0) return `${hours}h remaining`;
  const minutes = Math.ceil(ms / 60_000);
  return `${minutes}m remaining`;
}

function getErrorDetails(result: CreateAuctionResponse) {
  if (result.success) {
    return {};
  }

  return {
    auctionId: result.auctionId,
    txHash: result.txHash,
  };
}

export function CreateAuctionDraftForm() {
  const walletSession = useWalletSession();
  const { signTypedDataAsync } = useSignTypedData();
  const [draft, setDraft] = useState<DraftState>(initialDraftState);
  const [eventCatalog, setEventCatalog] = useState<EventCatalogState>({
    status: "idle",
  });
  const [submitState, setSubmitState] = useState<SubmitState>({
    status: "idle",
  });

  function setDraftField<Key extends keyof DraftState>(
    key: Key,
    value: DraftState[Key],
  ) {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }));

    setSubmitState((current) =>
      current.status === "error" ? { status: "idle" } : current,
    );
  }

  const selectedEvent = useMemo(() => {
    if (eventCatalog.status !== "ready" || draft.eventId === "") return null;
    return eventCatalog.events.find((event) => event.eventId === draft.eventId) ?? null;
  }, [draft.eventId, eventCatalog]);

  useEffect(() => {
    let cancelled = false;

    async function loadEvents() {
      setEventCatalog({ status: "loading" });

      try {
        const response = await fetch("/api/prediction-market/events", {
          method: "GET",
          headers: { Accept: "application/json" },
        });

        const payload = (await response.json()) as
          | PredictionMarketEventsResponse
          | PredictionMarketEventError;

        if (!response.ok) {
          const errorMessage =
            "error" in payload ? payload.error : "Failed to load events";
          throw new Error(errorMessage ?? "Failed to load events");
        }

        if (!isPredictionMarketEventsResponse(payload)) {
          throw new Error("Prediction market returned an unexpected payload.");
        }

        if (!cancelled) {
          setEventCatalog({ status: "ready", events: payload.events });
        }
      } catch (error) {
        if (!cancelled) {
          setEventCatalog({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Failed to load prediction market events.",
          });
        }
      }
    }

    void loadEvents();

    return () => {
      cancelled = true;
    };
  }, []);

  const isSubmitting =
    submitState.status === "signing" || submitState.status === "submitting";

  const canSubmit =
    walletSession.isSupportedChain &&
    draft.eventId !== "" &&
    draft.privateLeg !== "" &&
    draft.secretPayload.trim().length > 0 &&
    !isSubmitting;

  async function handleSubmit() {
    if (!canSubmit || draft.privateLeg === "") {
      return;
    }

    setSubmitState({ status: "signing" });

    const timestamp = Math.floor(Date.now() / 1000);

    let signature: `0x${string}`;
    try {
      signature = await signTypedDataAsync({
        domain: CREATE_AUCTION_EIP712_DOMAIN,
        types: CREATE_AUCTION_EIP712_TYPES,
        primaryType: "CreateAuction",
        message: {
          eventId: draft.eventId,
          privateLeg: draft.privateLeg,
          duration: draft.duration,
          timestamp: BigInt(timestamp),
        },
      });
    } catch (error) {
      setSubmitState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Wallet signature rejected.",
      });
      return;
    }

    setSubmitState({ status: "submitting" });

    try {
      const response = await fetch("/api/create-auction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: draft.eventId,
          privateLeg: draft.privateLeg,
          secretPayload: draft.secretPayload,
          duration: draft.duration,
          timestamp,
          signature,
        }),
      });

      const result = (await response.json()) as CreateAuctionResponse;

      if (!response.ok || !result.success) {
        const details = getErrorDetails(result);
        throw Object.assign(
          new Error(result.success ? "Auction creation failed." : result.error),
          details,
        );
      }

      setSubmitState({
        status: "success",
        auctionId: result.auctionId,
        sellerId: result.sellerId,
        txHash: result.txHash,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Auction creation failed.";
      const auctionId =
        error instanceof Error && "auctionId" in error
          ? (error.auctionId as string | undefined)
          : undefined;
      const txHash =
        error instanceof Error && "txHash" in error
          ? (error.txHash as string | undefined)
          : undefined;

      setSubmitState({
        status: "error",
        message,
        auctionId,
        txHash,
      });
    }
  }

  if (!walletSession.isConnected || !walletSession.address) {
    return (
      <section className="mx-auto w-full max-w-7xl px-6 pb-20 md:px-10">
        <Card className="mx-auto max-w-lg border-border/70 bg-background/92">
          <CardHeader className="items-center border-b border-border/60 text-center">
            <div className="mb-2 flex size-14 items-center justify-center rounded-full border border-border/50 bg-muted/40">
              <Wallet className="size-6 text-muted-foreground" />
            </div>
            <CardTitle>Connect your wallet</CardTitle>
            <CardDescription>
              A connected wallet is required to create auctions. Your seller
              identity will be auto-generated and permanently linked to this
              wallet the first time you list.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4 pt-2">
            <ConnectWalletButton size="lg" variant="accent" />
          </CardContent>
        </Card>
      </section>
    );
  }

  if (submitState.status === "success") {
    return (
      <section className="mx-auto w-full max-w-7xl px-6 pb-20 md:px-10">
        <Card className="mx-auto max-w-lg border-emerald-500/25 bg-emerald-500/5">
          <CardHeader className="items-center border-b border-emerald-500/20 text-center">
            <div className="mb-2 flex size-14 items-center justify-center rounded-full border border-emerald-500/25 bg-emerald-500/10 text-emerald-300">
              <Check className="size-6" />
            </div>
            <CardTitle>Auction created</CardTitle>
            <CardDescription>
              The auction was created on-chain and the seller identity was
              resolved for this wallet.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 pt-2">
            <div className="grid gap-3 rounded-lg border border-border/50 bg-background/50 p-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Auction ID</span>
                <span className="font-mono font-medium text-foreground">
                  #{submitState.auctionId}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Seller ID</span>
                <Badge variant="secondary">{submitState.sellerId}</Badge>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Transaction</span>
                <a
                  href={`https://sepolia.etherscan.io/tx/${submitState.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-primary underline underline-offset-4 hover:text-primary/80"
                >
                  {submitState.txHash.slice(0, 10)}...
                  {submitState.txHash.slice(-6)}
                </a>
              </div>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <Button asChild>
                <Link href={`/auction/${submitState.auctionId}`}>View auction</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/#auctions">Browse auctions</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="mx-auto grid w-full max-w-7xl gap-8 px-6 pb-20 md:px-10 lg:grid-cols-[minmax(0,1.08fr)_360px]">
      <Card className="border-border/70 bg-background/92">
        <CardHeader className="border-b border-border/60">
          <CardTitle>Create auction</CardTitle>
          <CardDescription>
            Pick a prediction market, declare your position, and describe the
            signal you are selling. Your seller identity will be auto-assigned
            when you submit.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-8">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/50 bg-muted/20 p-4">
            <div className="flex size-9 items-center justify-center rounded-full border border-emerald-500/25 bg-emerald-500/10 text-emerald-300">
              <Wallet className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground/70">
                Connected wallet
              </p>
              <p className="mt-0.5 truncate font-mono text-sm text-foreground">
                {formatAddress(walletSession.address)}
              </p>
            </div>
            <Badge variant="outline" className="text-[0.65rem] font-normal">
              {walletSession.currentChainName ?? walletSession.requiredChainName}
            </Badge>
          </div>

          {!walletSession.isSupportedChain ? (
            <Alert>
              <AlertCircle className="size-4" />
              <AlertTitle>Wrong network</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>
                  Switch to {walletSession.requiredChainName} before signing the
                  create-auction request.
                </p>
                <SwitchNetworkButton size="sm" showError />
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-5 border-t border-border/60 pt-8">
            <div className="space-y-1">
              <h2 className="font-serif text-[1.5rem] leading-none tracking-[-0.04em]">
                Event &amp; position
              </h2>
              <p className="text-sm leading-7 text-muted-foreground">
                Pick an open prediction market, then declare your position.
              </p>
            </div>

            <div className="grid gap-2">
              <Label>Prediction market event</Label>
              <Select
                value={draft.eventId}
                onValueChange={(eventId) => {
                  setDraftField("eventId", eventId);
                  setDraftField("privateLeg", "");
                }}
                disabled={eventCatalog.status === "loading" || isSubmitting}
              >
                <SelectTrigger className="h-11 w-full rounded-[calc(var(--radius)-4px)] border-input bg-background/80 px-4 text-sm">
                  <SelectValue
                    placeholder={
                      eventCatalog.status === "loading"
                        ? "Loading events..."
                        : "Choose an event"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {eventCatalog.status === "ready"
                    ? eventCatalog.events.map((event) => (
                        <SelectItem key={event.eventId} value={event.eventId}>
                          {`#${event.eventId} - ${event.title}`}
                        </SelectItem>
                      ))
                    : null}
                </SelectContent>
              </Select>
            </div>

            {eventCatalog.status === "error" ? (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertTitle>Event list failed to load</AlertTitle>
                <AlertDescription>{eventCatalog.message}</AlertDescription>
              </Alert>
            ) : null}

            {eventCatalog.status === "loading" ? (
              <Alert>
                <Loader2 className="size-4 animate-spin" />
                <AlertTitle>Loading prediction market events</AlertTitle>
                <AlertDescription>
                  Pulling the current list of events from the market contract.
                </AlertDescription>
              </Alert>
            ) : null}

            {selectedEvent !== null ? (
              <div className="rounded-lg border border-border/60 bg-muted/30 p-5">
                <p className="text-base font-medium leading-snug text-foreground">
                  {selectedEvent.title}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Store className="size-3.5" />
                    Example Prediction Market
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Hash className="size-3.5" />
                    Event {selectedEvent.eventId}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="size-3.5" />
                    Closes {formatCloseDate(selectedEvent.eventCloseIso)}
                  </span>
                  <Badge variant="outline" className="text-[0.65rem] font-normal">
                    {timeUntilClose(selectedEvent.eventCloseIso)}
                  </Badge>
                </div>

                <div className="mt-5 space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    What&apos;s your call?
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => setDraftField("privateLeg", "yes")}
                      className={cn(
                        "flex h-12 items-center justify-center rounded-md border text-sm font-semibold transition-colors",
                        draft.privateLeg === "yes"
                          ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                          : "border-border/60 bg-background/60 text-muted-foreground hover:border-emerald-500/40 hover:text-emerald-400/80",
                      )}
                    >
                      YES
                    </button>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => setDraftField("privateLeg", "no")}
                      className={cn(
                        "flex h-12 items-center justify-center rounded-md border text-sm font-semibold transition-colors",
                        draft.privateLeg === "no"
                          ? "border-rose-500 bg-rose-500/10 text-rose-400"
                          : "border-border/60 bg-background/60 text-muted-foreground hover:border-rose-500/40 hover:text-rose-400/80",
                      )}
                    >
                      NO
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid gap-5 border-t border-border/60 pt-8">
            <div className="space-y-1">
              <h2 className="font-serif text-[1.5rem] leading-none tracking-[-0.04em]">
                Signal details
              </h2>
              <p className="text-sm leading-7 text-muted-foreground">
                Buyers should understand the category of information without
                seeing the actual secret.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="secret-payload">Private signal payload</Label>
              <Textarea
                id="secret-payload"
                rows={7}
                disabled={isSubmitting}
                placeholder="The actual thesis, supporting detail, and why it matters."
                value={draft.secretPayload}
                onChange={(event) =>
                  setDraftField("secretPayload", event.target.value)
                }
              />
            </div>

            <div className="grid gap-2 md:max-w-xs">
              <Label>Auction duration</Label>
              <Select
                value={draft.duration}
                onValueChange={(value) =>
                  setDraftField("duration", value as CreateAuctionDuration)
                }
                disabled={isSubmitting}
              >
                <SelectTrigger className="h-11 w-full rounded-[calc(var(--radius)-4px)] border-input bg-background/80 px-4 text-sm">
                  <SelectValue placeholder="Select duration" />
                </SelectTrigger>
                <SelectContent>
                  {CREATE_AUCTION_DURATIONS.map((duration) => (
                    <SelectItem key={duration} value={duration}>
                      {duration === "6h"
                        ? "6 hours"
                        : duration === "12h"
                          ? "12 hours"
                          : duration === "24h"
                            ? "24 hours"
                            : "48 hours"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {submitState.status === "error" ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertTitle>Auction creation failed</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>{submitState.message}</p>
                {submitState.txHash ? (
                  <p className="text-xs">
                    Transaction{" "}
                    <a
                      href={`https://sepolia.etherscan.io/tx/${submitState.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono underline underline-offset-4"
                    >
                      {submitState.txHash}
                    </a>
                  </p>
                ) : null}
                {submitState.auctionId ? (
                  <p className="text-xs">
                    Auction{" "}
                    <Link
                      href={`/auction/${submitState.auctionId}`}
                      className="font-mono underline underline-offset-4"
                    >
                      #{submitState.auctionId}
                    </Link>
                  </p>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 border-t border-border/60 pt-8">
            <Button
              type="button"
              disabled={!canSubmit}
              onClick={() => void handleSubmit()}
            >
              {submitState.status === "signing" ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Sign with wallet...
                </>
              ) : submitState.status === "submitting" ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Creating auction...
                </>
              ) : (
                "Create auction"
              )}
            </Button>
            <Button asChild variant="outline">
              <Link href="/#auctions">Browse live auctions</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6">
        <Card className="border-border/70 bg-background/88">
          <CardHeader className="border-b border-border/60">
            <Badge variant="secondary" className="w-fit">
              How it works
            </Badge>
            <CardTitle className="text-[1.85rem]">Seller identity</CardTitle>
            <CardDescription>
              Your seller identity is auto-generated and permanently linked to
              your wallet the first time you create an auction.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm leading-7 text-muted-foreground">
            <p>Connect wallet to start</p>
            <p>Seller ID assigned on first auction</p>
            <p>Reputation accumulates on that identity</p>
            <p>Same ID used for every future listing</p>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-background/88">
          <CardHeader className="border-b border-border/60">
            <Badge variant="secondary" className="w-fit">
              Public
            </Badge>
            <CardTitle className="text-[1.85rem]">
              Visible in the listing
            </CardTitle>
            <CardDescription>
              Safe metadata that can land in the contract and subgraph.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm leading-7 text-muted-foreground">
            <p>Auto-assigned seller ID and reputation</p>
            <p>Event title and market close</p>
            <p>Auction timing</p>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-background/88">
          <CardHeader className="border-b border-border/60">
            <Badge variant="outline" className="w-fit">
              Private
            </Badge>
            <CardTitle className="text-[1.85rem]">Offchain only</CardTitle>
            <CardDescription>
              Data that should stay in authenticated API and Supabase paths.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm leading-7 text-muted-foreground">
            <p>Wallet ownership</p>
            <p>Seller&apos;s position (YES / NO)</p>
            <p>Secret payload</p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
