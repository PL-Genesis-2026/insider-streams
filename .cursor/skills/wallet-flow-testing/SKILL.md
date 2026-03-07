---
name: wallet-flow-testing
description: Exercise live wallet flows in insider-streams, including connect, network switch, funding, activation, bidding, and browser/on-chain debugging. Use when the user wants to try the app live, reproduce wallet issues, inspect console or network behavior, or debug Sepolia private-token flows end-to-end.
---

# Wallet Flow Testing

Use this skill for live app testing in `insider-streams` when the task is about actually trying wallet-connected flows, not writing test files.

## Default workflow

1. Prefer the running local frontend if it already exists. Otherwise use the local app, usually `http://127.0.0.1:3001`.
2. Use browser automation first to reproduce the issue or complete the requested flow.
3. Before clicking anything, inspect the current state with tab listing and a page snapshot.
4. If the flow fails, gather evidence immediately:
   - browser snapshot
   - console messages
   - network requests
   - relevant API responses
   - on-chain state with `cast` when needed
5. If the failure may be stale frontend state, restart the local dev server cleanly and retry once.
6. If a code fix is needed, make the smallest production-grade change, then verify the flow again in the browser.

## Project-specific checks

- The app runs Sepolia wallet flows.
- Do not assume the public `CONFIDENTIAL_USDC_ADDRESS` and the vault-registered private token address are interchangeable.
- For funding issues, verify:
  - token address actually used by the client
  - allowance
  - wallet balance
  - nonce progression
  - deposit receipt behavior
  - post-deposit reconciliation
  - final balance display in the UI
- Prefer `pnpm`.
- Do not add Playwright test files unless explicitly asked.
- Do not commit changes unless explicitly asked.

## Good outcomes

- Wallet connected on the right network
- Funding flow completed end-to-end
- Bid flow reproduced or completed
- Root cause identified with concrete browser and on-chain evidence
- Any fix verified live after the change

## Example prompts

- "Try the funding flow live and see where it breaks."
- "Connect the wallet and place a bid."
- "Debug why the deposit step is stuck after approval."
- "Use the browser to test the wallet flow and inspect console/network errors."
