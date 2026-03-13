# Bid Placement Workflow - Deep Analysis

Reference doc for E2E testing. Updated as bugs are found/fixed.

## Overview

The bid flow lets a funded user place an encrypted bid on an open auction.
It spans: auction page UI (bid gate + modal), Next.js proxy, daemon API, and on-chain FHE marketplace.

## End-to-End Flow

```text
User on /auction/:id
  |
  | Step 1: Unlock wallet (on auction page)
  |   Click "Unlock wallet" button in AuctionBidGate
  |   -> revealForAuctions([auctionId]) in PrivateDataProvider
  |   -> personal_sign (mock wallet auto-signs in tests)
  |   -> Fetches: /seller, /bids, /secrets in parallel
  |   -> useFundingSnapshot triggers: POST /api/funding/snapshot -> daemon /balance
  |   -> FHE balance decrypt (~7-60s depending on handle freshness)
  |
  | Step 2: Bid gate resolves
  |   Possible states:
  |   - "Loading balance..." -> waiting for daemon /balance response
  |   - "Place Bid" button -> user is funded (balance > 0)
  |   - "Deposit funds to bid" link -> user has no balance
  |   - "Retry funding snapshot" -> FHE decrypt or API failed
  |
  | Step 3: Open bid modal
  |   Click "Place Bid" -> opens <BidModal> dialog
  |   Modal shows: current bid, available balance, bid amount input
  |
  | Step 4: Fill bid amount and submit
  |   User enters amount in #bid-amount input
  |   Client-side validation:
  |     - Amount > 0
  |     - Amount >= currentBid + 1 (or >= 1 if no bids)
  |     - Amount <= available balance
  |   Click "Place Bid" in modal
  |
  | Step 5: Sign bid request (phase: "signing")
  |   signMessageAsync({ message: stringify({ auctionId, amount, timestamp }) })
  |   Mock wallet auto-signs in tests
  |
  | Step 6: Submit bid (phase: "submitting")
  |   POST /api/bid -> Next.js proxy -> daemon POST /bid
  |   Daemon responds immediately: { bidId, status: "recorded" }
  |   Shows: "Submitting bid on-chain..."
  |
  | Step 7: Success (phase: "success")
  |   Modal shows: "Bid placed successfully. Updating auction..."
  |   After 1.5s: modal closes, page refreshes
  |
  v
Daemon (async, after responding "recorded")
  |
  | Step 8: Place bid on-chain
  |   marketplace.placeBid(auctionId, bidderId, previousBidderId, amount)
  |     -> encryptUint64(marketplace_addr, admin_addr, amount) ~10s
  |     -> Read previous bidder from getAuction() view call
  |     -> withAdminLock: writeContract("placeBid", [...]) ~15-30s
  |   On success: updateBidTxHash(bidId, txHash)
  |   On failure: markBidFailed(bidId)
```

## Component Details

### 1. AuctionBidGate

**File:** `src/components/funding/auction-bid-gate.tsx`

Renders the bid access panel on the auction detail page. Shows different UI based on funding status:

| Status | UI Element | Test Selector |
| --- | --- | --- |
| `wallet_required` | Connect wallet button | `getByRole("button", { name: "Connect" })` |
| `wrong_network` | Switch network button | `getByRole("button", { name: /switch/i })` |
| `private_data_hidden` | "Unlock wallet" button | `getByRole("button", { name: "Unlock wallet" })` |
| Loading balance | "Loading balance..." button (disabled) | `getByRole("button", { name: "Loading balance" })` |
| `funding_unavailable` | "Retry funding snapshot" button | `getByRole("button", { name: "Retry funding snapshot" })` |
| `not_funded_yet` | "Deposit funds to bid" link | `getByRole("link", { name: "Deposit funds to bid" })` |
| `funded` / `withdrawal_available` | "Place Bid" button | `getByRole("button", { name: "Place Bid" })` |

**Unlock Flow:**
1. Calls `revealForAuctions([auctionId])` -> signs message, fetches private data
2. Simultaneously, `useFundingSnapshot({ enabled: isRevealed })` fires
3. Snapshot calls daemon `/balance` -> FHE decrypt on-chain -> returns balance
4. Status transitions: `private_data_hidden` -> loading -> `funded` / `not_funded_yet`

### 2. BidModal

**File:** `src/components/funding/bid-modal.tsx`

Dialog that appears when "Place Bid" is clicked.

**Props:**
- `auctionId` - auction to bid on
- `currentBidUsdc` - current highest bid (undefined = no bids)
- `availableBalance` - raw balance string from funding snapshot
- `onBidSuccess` - callback to refresh balance

**Input:** `#bid-amount` - type="number", min=minBid, step=1

**Phases:** `idle` -> `signing` -> `submitting` -> `success` | `error`

**Validation:**
- `Bid must be at least $X` - bid must exceed current bid + $1
- `Bid exceeds available balance of $X` - bid must be within balance

**Success text:** `"Bid placed successfully"` (inside a styled div, NOT a toast)

**Error text:** Rendered in `.text-destructive` class inside the dialog

### 3. Next.js Proxy

**File:** `src/app/api/bid/route.ts`

Simple proxy: `proxyToDaemon("/bid", body)` -> returns daemon response directly.

### 4. Daemon: POST /bid

**File:** `apps/daemon/src/api.ts` (lines 137-203)

1. `verifySignedRequest<{ auctionId, amount }>` - recover signer address
2. Parse amount as BigInt, validate > 0
3. `getOrCreateUser(userAddress)` -> get/create pseudonymous userId
4. Read previous bidder from `getAuction()` on-chain view call
5. `recordBid(auctionId, userId, amount)` in SQLite
6. Fire-and-forget: `marketplace.placeBid(auctionId, userId, previousBidderId, amount)`
7. Respond immediately: `{ bidId, auctionId, amount, status: "recorded" }`

**Important:** The daemon does NOT wait for on-chain confirmation. The frontend
sees "success" as soon as the daemon records the bid in SQLite. The on-chain tx
happens asynchronously (~30-60s).

### 5. Daemon: marketplace.placeBid()

**File:** `apps/daemon/src/marketplace.ts` (lines 106-139)

1. `encryptUint64(marketplace_addr, admin_addr, amount)` -> ~10s FHE encrypt
2. `withAdminLock`: serialized with all other admin txs
3. `writeContract("placeBid", [auctionId, bidderId, previousBidderId, handle, proof, amount])`
4. `waitForTransactionReceipt`
5. On success: `updateBidTxHash(bidId, txHash)`
6. On failure: `markBidFailed(bidId)`

### 6. Contract: placeBid()

The contract validates on-chain:
- Auction is open (not expired/cancelled/closed)
- New bid amount > current bid (encrypted comparison)
- Bidder has sufficient balance (encrypted check)
- Deducts bid from bidder's balance, refunds previous bidder

## Timing Summary

| Step | Duration | Notes |
| --- | --- | --- |
| Unlock wallet | <1s | Mock wallet auto-signs |
| Balance loading | 7-60s | FHE decrypt via daemon |
| Bid form + validation | <1s | Client-side |
| Signing | <1s | Mock wallet auto-signs |
| Submitting to daemon | <2s | HTTP round-trip |
| **User sees success** | **~10-65s** | After unlock + submit |
| On-chain confirmation | +30-60s | Async in daemon |

## E2E Test Considerations

### Finding an Open Auction

```typescript
// From helpers.ts - queries subgraph for auctions not closed/cancelled
const auctions = await findOpenAuctions(20, 600); // 10+ min remaining
const auctionId = auctions[0]?.auctionId ?? null;
```

Or use the global-setup state:
```typescript
const state = readTestState();
let auctionId = state?.bidAuctionId || null;
```

### Wallet Unlock on Auction Page

The auction page has its own unlock flow (different from /dashboard/wallet):
- Button text: "Unlock wallet" (not "Sign and unlock")
- After unlock: transitions through "Loading balance..." to "Place Bid"
- If balance check fails: shows "Retry funding snapshot"
- If not funded: shows "Deposit funds to bid" link

```typescript
// Retry pattern for unlock
await expect(async () => {
  const unlockButton = page.getByRole("button", { name: "Unlock wallet" });
  const unlockVisible = await unlockButton.isVisible().catch(() => false);
  if (unlockVisible) {
    await unlockButton.click();
    await page.waitForTimeout(3_000);
  }

  const loadingButton = page.getByRole("button", { name: "Loading balance" });
  const isLoading = await loadingButton.isVisible().catch(() => false);
  if (isLoading) throw new Error("STILL_LOADING");

  await expect(placeBidButton).toBeVisible({ timeout: 5_000 });
}).toPass({ timeout: 60_000, intervals: [5_000] });
```

### Bid Modal Interaction

```typescript
// Open modal
await placeBidButton.click();
const dialog = page.locator('[role="dialog"]');
await expect(dialog).toBeVisible({ timeout: 5_000 });

// Fill amount
const bidAmountInput = page.locator("#bid-amount");
await bidAmountInput.fill("50");

// Submit (button is inside the dialog)
const modalSubmit = dialog.getByRole("button", { name: "Place Bid" });
await expect(modalSubmit).toBeEnabled({ timeout: 5_000 });
await modalSubmit.click();
```

### Success Detection

```typescript
// "Bid placed successfully" text appears in the dialog
page.getByText("Bid placed successfully").waitFor({ timeout: 60_000 })
```

### Error Detection

```typescript
// Error text in .text-destructive inside dialog
dialog.locator(".text-destructive").first().waitFor({ timeout: 60_000 })
```

### Prerequisites

- User must have a bidding balance (deposit must have been processed)
- Auction must be open (not expired, closed, or cancelled)
- Bid amount must exceed current bid + $1
- Bid amount must not exceed available balance

## File Index

| File | Role |
| --- | --- |
| `src/components/funding/auction-bid-gate.tsx` | Bid gate UI (unlock -> loading -> place bid) |
| `src/components/funding/bid-modal.tsx` | Bid dialog (amount input, validation, submit) |
| `src/app/api/bid/route.ts` | Next.js proxy -> daemon /bid |
| `src/app/auction/[auctionId]/page.tsx` | Auction detail page (renders bid gate) |
| `src/lib/private-data/private-data-provider.tsx` | Private data context (reveal, seller, bids) |
| `src/lib/funding/use-funding-snapshot.ts` | Balance check hook |
| `apps/daemon/src/api.ts` | Daemon POST /bid handler |
| `apps/daemon/src/marketplace.ts` | `placeBid()` on-chain submission |
| `contracts-fhe/.../FHESecretMarketplace.sol` | `placeBid()` contract function |
