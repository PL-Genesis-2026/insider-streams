# Signature Auth for Secrets API

## Problem

The `/api/secrets` endpoint returns secret auction data to anyone who knows the auction ID. Only the seller and the winning bidder should be able to access a secret.

## Solution

Add EIP-191 signature authentication to the secrets API, reusing the same `verifySignedRequest` pattern used by the bid API.

## Authorization Rules

- **Seller**: Can always view their own secret (matched via `secrets.seller_id` -> `sellers.address`).
- **Winning bidder**: Can view the secret only after their bid `status = 'won'` in the `private_bids` table (matched via `bidder_address`).
- **Everyone else**: 403 Unauthorized.

## API Route Changes

Change `/api/secrets` from GET to POST.

**Request body:**

```json
{
  "auctionId": "5",
  "timestamp": 1741363200,
  "signature": "0x..."
}
```

**Server flow:**

1. Parse JSON body, call `verifySignedRequest(body)` to recover `userAddress`.
2. Validate `auctionId` is a non-empty string (Zod).
3. Query `secrets` table for the `auctionId`. If not found, return 404.
4. Join `sellers` table via `seller_id` to get the seller's `address`.
5. Query `private_bids` where `auction_id = auctionId` and `status = 'won'` to get the winner's `bidder_address`.
6. Compare `userAddress` (lowercased) against seller address and winner address.
7. If match: return `{ data: { secret_data, event_data } }`.
8. If no match: return `403 { error: "You are not authorized to view this secret", code: "UNAUTHORIZED" }`.

Uses `getSupabaseServiceClient()` (service role) for all DB queries.

## Client-Side Changes (SecretRevealCard)

The component becomes wallet-aware with three UI states:

1. **No wallet connected**: Button reads "Connect wallet to reveal" with Lock icon. Clicking opens the wallet connect modal.
2. **Wallet connected**: Button reads "Reveal secret" with Eye icon. Clicking triggers the signature flow.
3. **After reveal/error**: Same as current behavior (show secret data or error message).

**Signature flow on click:**

1. Build payload: `{ auctionId, timestamp: Math.floor(Date.now() / 1000) }`
2. Sign with `walletClient.signMessage({ message: stringify(payload) })` using `fast-json-stable-stringify`.
3. POST to `/api/secrets` with `{ ...payload, signature }`.
4. Handle response: 200 -> show secret, 403 -> show unauthorized message, other -> generic error.

## Error Handling

| Scenario | HTTP Status | UI Message |
|----------|-------------|------------|
| No secret found | 404 | "Secret not found" |
| Signature invalid/expired | 400 | "Failed to load secret. Please try again." |
| Not seller or winner | 403 | "You are not authorized to view this secret" |
| Server/DB error | 500 | "Failed to load secret. Please try again." |

## Files Changed

- `apps/insider-streams-frontend/src/app/api/secrets/route.ts` — rewrite from GET to POST with auth
- `apps/insider-streams-frontend/src/components/secret-reveal.tsx` — add wallet-aware signing flow
