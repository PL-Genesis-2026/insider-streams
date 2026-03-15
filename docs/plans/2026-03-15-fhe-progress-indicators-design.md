# FHE Progress Indicators — Design

**Goal:** Make Zama FHE operations visible in the frontend during a demo recording for the PL Genesis hackathon (Zama sponsor bounty). Two flows enhanced, zero backend changes.

## Audience

Layered: accessible labels for investors/business, FHE type names and Zama-specific terminology inline for technical viewers.

## 1. Auction Creation — Vertical Stepper

A compact vertical stepper appears below the submit button when `submitState.status === "submitting"`. Shows estimated progress through the FHE pipeline.

### Steps

| # | Label | Detail | Condition | Est. duration |
|---|-------|--------|-----------|---------------|
| 1 | Preparing | Verifying signature | Always | 0-2s |
| 2 | Encrypting file for Filecoin | AES-256 encryption and uploading to Filecoin storage | File attached only | 2-7s |
| 3 | FHE Encryption | Encrypting prediction (ebool) and secret key (euint256) via Zama fhEVM Relayer — generating zero-knowledge proof | Always | 8-15s |
| 4 | On-chain submission | Submitting encrypted auction to FHESecretMarketplace on Sepolia | Always | 1-3s |
| 5 | Block confirmation | Waiting for Sepolia block confirmation | Always | 10-30s |

### Visual behavior

- Completed steps: muted text, emerald Check icon
- Active step: foreground text, spinning Loader2 in accent color, detail text visible
- Upcoming steps: muted text, dim circle placeholder
- The submit button text also updates to match the active step
- When the real response arrives (success or error), the stepper disappears and the existing success card or error alert renders

### Implementation

- `submittingStep` state (`useState<number>`) in the form component
- `useEffect` fires when status becomes `"submitting"`, runs `setTimeout` chain for step transitions
- Cleanup on unmount or when status changes
- Inline JSX in the form — no new component file
- Step 2 (Filecoin) conditionally included based on whether `attachment !== null`

### Timing strategy

Frontend-estimated, not backend-reported. The daemon's synchronous response arrives when the full pipeline completes, overriding whatever step is showing. If the daemon finishes faster than estimated, the stepper jumps to success. If slower, the last step lingers. Both are acceptable UX.

## 2. Deposit Flow — Inline Step Text

Real step tracking (not estimated) because FHE encryption happens client-side in the browser.

### Steps

| Step key | Button text | What's happening |
|----------|-------------|------------------|
| encrypting | Encrypting deposit with FHE... | `createEncryptedInput()` + `encrypt()` — ZK proof via Zama Relayer |
| confirming | Confirm transfer in wallet... | Wallet popup for `confidentialTransfer` (ERC-7984) |
| transferring | Submitting confidential transfer... | `waitForTransactionReceipt` on-chain |
| notifying | Registering deposit... | Sign message + POST to daemon |
| done | Deposit complete | Brief flash before reset to idle |

### Implementation

- Add `DepositStep` type and `useState<DepositStep>` to `useDeposit` hook
- Set step at each boundary in the existing `mutationFn`
- Return `depositStep` alongside the mutation result
- `wallet-action-center.tsx` switches button content based on `depositStep`

## 3. What we are NOT doing

- Bid flow — fast response is a feature, voiceover covers FHE
- Reputation resolution UI — demo uses pre-existing resolved data
- Etherscan side-by-side — demo recording technique, no code needed
- Backend changes — zero
- New component files — zero
- New dependencies — zero

## 4. Files changed

| File | Change | Est. lines |
|------|--------|------------|
| `create-auction-draft-form.tsx` | submittingStep state, useEffect timer, stepper JSX, button text per step | ~60 |
| `hooks.ts` (private-token) | DepositStep type, useState, set at boundaries, return with mutation | ~15 |
| `wallet-action-center.tsx` | Destructure depositStep, switch button text | ~15 |

Total: ~90 lines across 3 files.

## 5. Testing

- Manual verification on Sepolia for both flows
- Existing Playwright E2E tests should pass unchanged (additive UI)
