# FHE Progress Indicators Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make FHE operations visible in the frontend during demo recording via progress indicators in the auction creation and deposit flows.

**Architecture:** Two additive UI changes, zero new files, zero backend changes. Deposit flow uses real step tracking (FHE happens client-side). Auction creation uses frontend-estimated timing (daemon response is synchronous). See `docs/plans/2026-03-15-fhe-progress-indicators-design.md` for full design.

**Tech Stack:** React useState/useEffect, Tailwind CSS, lucide-react icons (Check, Loader2 already imported), TanStack Query useMutation

---

### Task 1: Add DepositStep type and step tracking to useDeposit hook

**Files:**
- Modify: `apps/insider-streams-frontend/src/lib/private-token/hooks.ts:19-93`

**Step 1: Add DepositStep type and step state to useDeposit**

Add the `DepositStep` type above `useDeposit`, add a `useState` inside the hook, set the step at each boundary in `mutationFn`, and return both `depositStep` and `resetDepositStep` alongside the mutation.

The mutation's `onSettled` callback resets the step to `"idle"` after completion (success or error).

```typescript
export type DepositStep =
  | "idle"
  | "encrypting"
  | "confirming"
  | "transferring"
  | "notifying"
  | "done";

export function useDeposit() {
  const queryClient = useQueryClient();
  const walletSession = useWalletSession();
  const { signMessageAsync } = useSignMessage();
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { instance: fhevmInstance } = useFhevm();
  const [depositStep, setDepositStep] = useState<DepositStep>("idle");

  const mutation = useMutation({
    mutationFn: async (amountHuman: string) => {
      if (!walletSession.address || !address) {
        throw new Error("Connect your wallet to deposit.");
      }
      if (!walletClient) {
        throw new Error("Wallet client not available.");
      }
      if (!publicClient) {
        throw new Error("Public client not available.");
      }
      if (!fhevmInstance) {
        throw new Error("FHE SDK not ready. Please wait a moment and try again.");
      }

      const parsed = parseUnits(amountHuman, CONFIDENTIAL_USDC_DECIMALS);
      if (parsed <= 0n) {
        throw new Error("Enter an amount greater than zero.");
      }

      // Step 1: Encrypt the amount using the Zama relayer SDK
      setDepositStep("encrypting");
      const contractAddress = CONFIDENTIAL_USDC_ADDRESS as `0x${string}`;
      const input = (fhevmInstance as any).createEncryptedInput(
        contractAddress,
        address,
      );
      input.add64(parsed);
      const encrypted = await input.encrypt();

      // Step 2: Transfer cUSDC from user's wallet to admin EOA (on-chain tx)
      setDepositStep("confirming");
      const handle = toHex(encrypted.handles[0] as Uint8Array);
      const proof = toHex(encrypted.inputProof as Uint8Array);
      const txHash = await walletClient.writeContract({
        address: contractAddress,
        abi: fheConfidentialUsdcAbi,
        functionName: "confidentialTransfer",
        args: [
          PLATFORM_EOA_ADDRESS as `0x${string}`,
          handle,
          proof,
        ],
      });

      // Wait for confirmation
      setDepositStep("transferring");
      await publicClient.waitForTransactionReceipt({ hash: txHash });

      // Step 3: Notify daemon to deposit from admin -> marketplace
      setDepositStep("notifying");
      const timestamp = Math.floor(Date.now() / 1000);
      const payload = { txHash, amount: parsed.toString(), timestamp };
      const signature = await signMessageAsync({
        message: stringify(payload),
      });

      const result = await requestFundingDeposit({
        ...payload,
        signature,
      });

      await queryClient.invalidateQueries({
        queryKey: getFundingSnapshotQueryKey(walletSession.address),
      });

      setDepositStep("done");
      return result;
    },
    onSettled: () => {
      // Reset step after a brief flash of "done" or on error
      setTimeout(() => setDepositStep("idle"), 1500);
    },
  });

  return { ...mutation, depositStep };
}
```

Key changes from original:
- Added `DepositStep` type export
- Added `const [depositStep, setDepositStep] = useState<DepositStep>("idle")`
- Inserted `setDepositStep(...)` calls at each boundary
- Split step 2 into "confirming" (wallet popup) and "transferring" (receipt wait)
- Added `onSettled` to reset step
- Changed from `return useMutation(...)` to `const mutation = useMutation(...)` then `return { ...mutation, depositStep }`

**Step 2: Run lint to verify no errors**

Run: `cd apps/insider-streams-frontend && pnpm run lint`
Expected: No new errors

**Step 3: Commit**

```bash
git add apps/insider-streams-frontend/src/lib/private-token/hooks.ts
git commit -m "feat: add FHE step tracking to useDeposit hook"
```

---

### Task 2: Update deposit button text in wallet-action-center.tsx

**Files:**
- Modify: `apps/insider-streams-frontend/src/components/dashboard/wallet-action-center.tsx:117,310,495-515`

**Step 1: Destructure depositStep and update button text**

Three changes in `wallet-action-center.tsx`:

**Change A — line 117:** Destructure `depositStep` from `useDeposit()`:

```typescript
// Before:
const depositMutation = useDeposit();

// After:
const { depositStep, ...depositMutation } = useDeposit();
```

**Change B — line 310:** Update `isDepositing` to also consider depositStep (no change needed — `isPending` from useMutation already covers the entire mutation lifecycle, and `depositStep` is only used for display text).

**Change C — lines 501-515:** Replace binary button text with step-specific labels:

```typescript
// Before:
{isDepositing ? (
  <>
    <Loader2 className="size-4 animate-spin" />
    Depositing...
  </>
) : fheSdkStatus === "loading" ? (
  <>
    <Loader2 className="size-4 animate-spin" />
    Loading FHE...
  </>
) : (
  "Deposit"
)}

// After:
{isDepositing ? (
  <>
    <Loader2 className="size-4 animate-spin" />
    {depositStep === "encrypting"
      ? "Encrypting deposit with FHE..."
      : depositStep === "confirming"
        ? "Confirm transfer in wallet..."
        : depositStep === "transferring"
          ? "Submitting confidential transfer..."
          : depositStep === "notifying"
            ? "Registering deposit..."
            : depositStep === "done"
              ? "Deposit complete"
              : "Depositing..."}
  </>
) : fheSdkStatus === "loading" ? (
  <>
    <Loader2 className="size-4 animate-spin" />
    Loading FHE...
  </>
) : (
  "Deposit"
)}
```

**Step 2: Run lint to verify no errors**

Run: `cd apps/insider-streams-frontend && pnpm run lint`
Expected: No new errors

**Step 3: Commit**

```bash
git add apps/insider-streams-frontend/src/components/dashboard/wallet-action-center.tsx
git commit -m "feat: show FHE step labels on deposit button"
```

---

### Task 3: Add vertical stepper to auction creation form

**Files:**
- Modify: `apps/insider-streams-frontend/src/components/create-auction/create-auction-draft-form.tsx:4,76-81,169-171,310,759-786`

**Step 1: Add submittingStep state and useEffect timer**

**Change A — line 4:** Add `useCallback` to the React import (already has `useEffect, useMemo, useState`):

```typescript
// Before:
import { useEffect, useMemo, useState } from "react";

// After:
import { useCallback, useEffect, useMemo, useState } from "react";
```

**Change B — after line 171 (after the submitState useState):** Add `submittingStep` state:

```typescript
const [submittingStep, setSubmittingStep] = useState(0);
```

**Change C — after the new submittingStep state:** Add useEffect for the timed step progression:

```typescript
useEffect(() => {
  if (submitState.status !== "submitting") {
    setSubmittingStep(0);
    return;
  }

  // Step 0 = preparing (already showing), advance through steps on timers
  const hasFile = attachment !== null;
  const delays = hasFile
    ? [2000, 7000, 15000, 3000] // preparing -> filecoin -> FHE -> on-chain -> confirmation
    : [2000, 15000, 3000];      // preparing -> FHE -> on-chain -> confirmation

  const timeouts: ReturnType<typeof setTimeout>[] = [];
  let cumulative = 0;
  for (let i = 0; i < delays.length; i++) {
    cumulative += delays[i];
    const step = i + 1;
    timeouts.push(setTimeout(() => setSubmittingStep(step), cumulative));
  }

  return () => timeouts.forEach(clearTimeout);
}, [submitState.status, attachment]);
```

**Change D — define the steps array as a `getSubmittingSteps` helper** (add above the component, after `getErrorDetails`):

```typescript
type SubmittingStepDef = {
  label: string;
  detail: string;
};

function getSubmittingSteps(hasFile: boolean): SubmittingStepDef[] {
  const steps: SubmittingStepDef[] = [
    { label: "Preparing", detail: "Verifying signature" },
  ];
  if (hasFile) {
    steps.push({
      label: "Encrypting file for Filecoin",
      detail: "AES-256 encryption and uploading to Filecoin storage",
    });
  }
  steps.push(
    {
      label: "FHE Encryption",
      detail: "Encrypting prediction (ebool) and secret key (euint256) via Zama fhEVM Relayer",
    },
    {
      label: "On-chain submission",
      detail: "Submitting encrypted auction to FHESecretMarketplace on Sepolia",
    },
    {
      label: "Block confirmation",
      detail: "Waiting for Sepolia block confirmation",
    },
  );
  return steps;
}
```

**Change E — lines 770-774:** Update the submit button text during "submitting" to show the active step label:

```typescript
// Before:
) : submitState.status === "submitting" ? (
  <>
    <Loader2 className="size-4 animate-spin" />
    Creating auction...
  </>

// After:
) : submitState.status === "submitting" ? (
  <>
    <Loader2 className="size-4 animate-spin" />
    {getSubmittingSteps(attachment !== null)[submittingStep]?.label ?? "Creating auction..."}
  </>
```

**Change F — after the submit button section (after line 786, before `</CardContent>`):** Add the vertical stepper JSX. Insert it between the button row `</div>` (line 786) and the closing `</CardContent>` (line 787):

```typescript
{submitState.status === "submitting" && (
  <div className="border-t border-border/60 pt-6">
    <ol className="space-y-3">
      {getSubmittingSteps(attachment !== null).map((step, i) => {
        const isCompleted = submittingStep > i;
        const isActive = submittingStep === i;
        return (
          <li key={step.label} className="flex items-start gap-3">
            <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
              {isCompleted ? (
                <Check className="size-4 text-emerald-400" />
              ) : isActive ? (
                <Loader2 className="size-4 animate-spin text-accent" />
              ) : (
                <div className="size-2 rounded-full bg-muted-foreground/30" />
              )}
            </div>
            <div>
              <p className={cn(
                "text-sm font-medium",
                isCompleted ? "text-muted-foreground" : isActive ? "text-foreground" : "text-muted-foreground/50"
              )}>
                {step.label}
              </p>
              {isActive && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {step.detail}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  </div>
)}
```

**Step 2: Run lint to verify no errors**

Run: `cd apps/insider-streams-frontend && pnpm run lint`
Expected: No new errors

**Step 3: Run build to verify types**

Run: `cd apps/insider-streams-frontend && pnpm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add apps/insider-streams-frontend/src/components/create-auction/create-auction-draft-form.tsx
git commit -m "feat: add FHE progress stepper to auction creation form"
```

---

### Task 4: Verify existing tests pass

**Step 1: Run frontend lint**

Run: `cd apps/insider-streams-frontend && pnpm run lint`
Expected: PASS

**Step 2: Run turborepo build**

Run: `turbo run build`
Expected: All packages build successfully

**Step 3: Commit the plan doc and push**

```bash
git add docs/plans/2026-03-15-fhe-progress-indicators.md
git commit -m "docs: add FHE progress indicators implementation plan"
git push
```

---

## Summary

| File | Change | Lines |
|------|--------|-------|
| `hooks.ts` | DepositStep type, useState, setDepositStep at each boundary, onSettled reset, spread return | ~20 |
| `wallet-action-center.tsx` | Destructure depositStep, step-specific button text | ~15 |
| `create-auction-draft-form.tsx` | submittingStep state, useEffect timer chain, getSubmittingSteps helper, stepper JSX, button text | ~65 |

Total: ~100 lines across 3 files, 0 new files, 0 backend changes.
