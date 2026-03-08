# Secrets API Signature Auth — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add EIP-191 signature authentication to `/api/secrets` so only the seller and winning bidder can view secret data.

**Architecture:** Change the secrets route from GET to POST with a signed JSON body. Reuse the existing `verifySignedRequest` from `@private-streams/common` to recover the signer's address, then check it against the seller address (from `sellers` table) and the winning bidder address (from `private_bids` table). Update `SecretRevealCard` to be wallet-aware, showing a "Connect wallet to reveal" button when disconnected and triggering a signature flow when connected.

**Tech Stack:** Next.js API routes, viem (EIP-191 signing + recovery), wagmi v3 (`useAccount`, `useWalletClient`), `@reown/appkit/react` (`useAppKit`), `fast-json-stable-stringify`, Zod, Supabase (service role client).

**Design doc:** `docs/plans/2026-03-07-secrets-api-signature-auth-design.md`

---

### Task 1: Rewrite the Secrets API Route (GET → POST with signature auth)

**Files:**
- Modify: `apps/insider-streams-frontend/src/app/api/secrets/route.ts`

**Step 1: Rewrite the route**

Replace the entire file. The new POST handler:
1. Parses JSON body
2. Verifies signature via `verifySignedRequest`
3. Validates `auctionId` with Zod
4. Queries the `secrets` table for the auction
5. Looks up the seller's address from `sellers` table
6. Looks up the winning bidder from `private_bids` table
7. Compares the recovered address against both
8. Returns the secret or 403

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifySignedRequest } from "@/lib/signed-request";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

const secretsFieldsSchema = z.object({
  auctionId: z.string().min(1, "auctionId is required"),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const verified = await verifySignedRequest(body);
  if (!verified.ok) return verified.response;

  const parsed = secretsFieldsSchema.safeParse(verified.payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues.map((e) => e.message).join("; "),
        code: "VALIDATION_ERROR",
      },
      { status: 400 },
    );
  }

  const { auctionId } = parsed.data;
  const userAddress = verified.payload.userAddress;
  const supabase = getSupabaseServiceClient();

  // 1. Fetch the secret and the seller's address in one query
  const { data: secret, error: secretError } = await supabase
    .from("secrets")
    .select("auction_id, secret_data, event_data, seller_id, sellers(address)")
    .eq("auction_id", auctionId)
    .maybeSingle();

  if (secretError) {
    console.error("[secrets] DB error:", secretError.message);
    return NextResponse.json(
      { error: "Internal server error", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  if (!secret) {
    return NextResponse.json(
      { error: "Secret not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  // 2. Check if user is the seller
  const sellerAddress = (
    secret.sellers as unknown as { address: string } | null
  )?.address?.toLowerCase();
  const isSeller = sellerAddress === userAddress;

  // 3. Check if user is the winning bidder
  let isWinner = false;
  if (!isSeller) {
    const { data: winningBid } = await supabase
      .from("private_bids")
      .select("bidder_address")
      .eq("auction_id", auctionId)
      .eq("status", "won")
      .maybeSingle();

    isWinner = winningBid?.bidder_address?.toLowerCase() === userAddress;
  }

  if (!isSeller && !isWinner) {
    return NextResponse.json(
      {
        error: "You are not authorized to view this secret",
        code: "UNAUTHORIZED",
      },
      { status: 403 },
    );
  }

  return NextResponse.json({
    data: {
      secret_data: secret.secret_data,
      event_data: secret.event_data,
    },
  });
}
```

**Step 2: Verify the route compiles**

Run from repo root:
```bash
cd apps/insider-streams-frontend && npx tsc --noEmit
```
Expected: no errors related to `api/secrets/route.ts`. (There may be pre-existing errors in other files.)

**Step 3: Commit**

```bash
git add apps/insider-streams-frontend/src/app/api/secrets/route.ts
git commit -m "feat: add signature auth to secrets API route"
```

---

### Task 2: Update SecretRevealCard to use wallet signing

**Files:**
- Modify: `apps/insider-streams-frontend/src/components/secret-reveal.tsx`

**Step 1: Rewrite the component**

The component needs these changes:
- Import `useAccount` and `useWalletClient` from wagmi
- Import `useAppKit` from `@reown/appkit/react`
- Import `stringify` from `fast-json-stable-stringify`
- When no wallet is connected: show "Connect wallet to reveal" button that opens the connect modal
- When wallet is connected: show "Reveal secret" button that signs + POSTs
- Handle 403 responses with the specific unauthorized message

```typescript
"use client";

import Image from "next/image";
import { useCallback, useState } from "react";
import { ExternalLink, Eye, EyeOff, Loader2, Lock } from "lucide-react";
import { useAccount, useWalletClient } from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import stringify from "fast-json-stable-stringify";
import { EXAMPLE_PREDICTION_MARKET_NAME } from "@private-streams/common";
import { Button } from "@/components/ui/button";
import { env } from "@/env";
import type { EventData } from "@/lib/supabase/secrets";
import { cn } from "@/lib/utils";

type SecretRevealCardProps = {
  auctionId: string;
};

type RevealedSecret = {
  secret_data: string;
  event_data: EventData | null;
};

type RevealState =
  | { status: "hidden" }
  | { status: "loading" }
  | { status: "revealed"; data: RevealedSecret }
  | { status: "error"; message: string };

function BlurredSkeleton() {
  return (
    <div className="select-none" aria-hidden>
      <div className="space-y-2">
        <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground/40">
          Secret data
        </span>
        <div className="space-y-2">
          <div className="h-4 w-full rounded bg-muted-foreground/8" />
          <div className="h-4 w-3/4 rounded bg-muted-foreground/8" />
        </div>
      </div>
      <div className="my-5 border-t border-border/40" />
      <div className="h-10 w-full rounded-md border border-border/40 bg-muted-foreground/5" />
    </div>
  );
}

function MarketLink({ eventData }: { eventData: EventData }) {
  const baseUrl = env.NEXT_PUBLIC_EXTERNAL_PREDICTION_MARKET_BASE_URL;
  const href = `${baseUrl}/events/${eventData.marketId}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex w-full items-center gap-3 rounded-md border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      <Image
        src="/ExternalPredictionMarketLogo.svg"
        alt={EXAMPLE_PREDICTION_MARKET_NAME}
        width={16}
        height={20}
        className="shrink-0"
      />
      <span className="min-w-0 flex-1 truncate">{eventData.event}</span>
      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
    </a>
  );
}

function RevealedContent({ data }: { data: RevealedSecret }) {
  return (
    <div>
      <div className="space-y-2">
        <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60">
          Secret data
        </span>
        <p className="text-sm leading-7 text-foreground">{data.secret_data}</p>
      </div>
      {data.event_data && (
        <>
          <div className="my-5 border-t border-border/40" />
          <MarketLink eventData={data.event_data} />
        </>
      )}
    </div>
  );
}

export function SecretRevealCard({ auctionId }: SecretRevealCardProps) {
  const [state, setState] = useState<RevealState>({ status: "hidden" });
  const { isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { open } = useAppKit();

  const handleConnect = useCallback(() => {
    void open({ view: "Connect" });
  }, [open]);

  const handleReveal = useCallback(async () => {
    if (!walletClient) return;

    setState({ status: "loading" });

    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const payload = { auctionId, timestamp };
      const message = stringify(payload);
      const signature = await walletClient.signMessage({ message });

      const res = await fetch("/api/secrets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, signature }),
      });

      if (res.status === 403) {
        const json = await res.json();
        setState({
          status: "error",
          message: json.error ?? "You are not authorized to view this secret",
        });
        return;
      }

      if (!res.ok) {
        throw new Error(`Request failed (${res.status})`);
      }

      const json = await res.json();
      const row = json.data;

      if (!row) {
        setState({ status: "error", message: "Secret not found" });
        return;
      }

      setState({
        status: "revealed",
        data: {
          secret_data: row.secret_data,
          event_data: row.event_data,
        },
      });
    } catch {
      setState({
        status: "error",
        message: "Failed to load secret. Please try again.",
      });
    }
  }, [auctionId, walletClient]);

  const handleHide = useCallback(() => {
    setState({ status: "hidden" });
  }, []);

  if (state.status === "revealed") {
    return (
      <div>
        <RevealedContent data={state.data} />
        <div className="mt-5 flex justify-center">
          <Button variant="ghost" size="sm" onClick={handleHide}>
            <EyeOff className="size-3.5" />
            Hide secret
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        className={cn(
          "blur-[6px] transition-[filter] duration-300",
          state.status === "loading" && "blur-[3px]",
        )}
      >
        <BlurredSkeleton />
      </div>

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
        {state.status === "error" && (
          <p className="text-xs text-destructive">{state.message}</p>
        )}

        {!isConnected ? (
          <Button variant="outline" size="sm" onClick={handleConnect}>
            <Lock className="size-3.5" />
            Connect wallet to reveal
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleReveal()}
            disabled={state.status === "loading"}
          >
            {state.status === "loading" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Eye className="size-3.5" />
            )}
            {state.status === "loading" ? "Revealing..." : "Reveal secret"}
          </Button>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify compilation**

```bash
cd apps/insider-streams-frontend && npx tsc --noEmit
```
Expected: no new errors from `secret-reveal.tsx`.

**Step 3: Commit**

```bash
git add apps/insider-streams-frontend/src/components/secret-reveal.tsx
git commit -m "feat: add wallet signing flow to SecretRevealCard"
```

---

### Task 3: Manual verification

**Step 1: Start the dev server**

```bash
turbo run dev --filter=insider-streams-frontend
```

**Step 2: Test the happy path (seller)**

1. Navigate to an auction detail page
2. Connect with the seller's wallet
3. Click "Reveal secret"
4. Sign the message in the wallet popup
5. Verify the secret data is displayed

**Step 3: Test the unauthorized path**

1. Connect with a wallet that is neither the seller nor the winning bidder
2. Click "Reveal secret"
3. Sign the message
4. Verify the error message "You are not authorized to view this secret" is displayed

**Step 4: Test the disconnected state**

1. Disconnect the wallet
2. Verify the button says "Connect wallet to reveal"
3. Click it and verify the wallet connect modal opens

**Step 5: Commit any fixes if needed**

---

### Reference: Key file locations

| File | Role |
|------|------|
| `packages/common/src/verify-signed-request.ts` | Core EIP-191 verification (shared, don't modify) |
| `apps/insider-streams-frontend/src/lib/signed-request.ts` | Next.js wrapper for verification (shared, don't modify) |
| `apps/insider-streams-frontend/src/lib/supabase/server.ts` | `getSupabaseServiceClient()` — service role client |
| `apps/insider-streams-frontend/src/lib/wallet/config.ts` | Wagmi + AppKit config |
| `apps/insider-streams-frontend/src/components/wallet/connect-wallet-button.tsx` | Reference for `useAppKit()` usage pattern |
| `apps/insider-streams-frontend/src/app/api/bid/route.ts` | Reference for signed request pattern in API routes |
| `scripts/migrations/001_initial_schema.sql` | DB schema: `secrets`, `sellers`, `private_bids` tables |
