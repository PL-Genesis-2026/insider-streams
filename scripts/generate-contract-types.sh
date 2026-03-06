#!/usr/bin/env bash
# generate-contract-types.sh — Compile contracts, regenerate TypeScript types + frontend ABIs
#
# Steps:
#   1. Compile contracts with Foundry
#   2. Run wagmi CLI to regenerate TypeScript types in packages/common
#   3. Run pnpm install to update workspace links
#   4. Copy JSON ABIs to frontend apps
#
# Usage: ./scripts/generate-contract-types.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACTS_DIR="$SCRIPT_DIR/contracts/out"

echo "═══════════════════════════════════════════════════════"
echo "  Generate Contract Types"
echo "═══════════════════════════════════════════════════════"

# ─── Step 1: Compile contracts ────────────────────────────────────────────────
echo ""
echo "▶ Step 1: Compiling contracts..."
cd "$SCRIPT_DIR/contracts"
forge build --via-ir --skip SetupAll DeployPolicyEngine
echo "  Done."

# ─── Step 2: Generate TypeScript types via wagmi ──────────────────────────────
echo ""
echo "▶ Step 2: Generating TypeScript types (wagmi)..."
cd "$SCRIPT_DIR"
pnpm wagmi
echo "  Done. Output: packages/common/src/__generated__/contract-types.ts"

# ─── Step 3: pnpm install ────────────────────────────────────────────────────
echo ""
echo "▶ Step 3: Running pnpm install..."
cd "$SCRIPT_DIR"
pnpm install
echo "  Done."

# ─── Step 4: Copy ABIs to frontend apps ──────────────────────────────────────
echo ""
echo "▶ Step 4: Copying ABIs to frontend apps..."

CONTRACTS=("SecretMarketplace.sol/SecretMarketplace.json" "ExamplePredictionMarket.sol/ExamplePredictionMarket.json" "MockUSDC.sol/MockUSDC.json")
FRONTENDS=("insider-streams-frontend" "prediction-market-frontend")

for frontend in "${FRONTENDS[@]}"; do
  ABI_DIR="$SCRIPT_DIR/apps/$frontend/src/abis"
  mkdir -p "$ABI_DIR"
  for contract in "${CONTRACTS[@]}"; do
    NAME=$(basename "$contract")
    python3 -c "
import json, sys
artifact = json.load(open(sys.argv[1]))
json.dump(artifact['abi'], open(sys.argv[2], 'w'), indent=2)
" "$ARTIFACTS_DIR/$contract" "$ABI_DIR/$NAME"
  done
  echo "  Copied ABIs → apps/$frontend/src/abis/"
done

# ─── Done ────────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Done — Contract types regenerated"
echo "═══════════════════════════════════════════════════════"
echo "  TypeScript:  packages/common/src/__generated__/contract-types.ts"
echo "  Frontends:   apps/*/src/abis/"
echo "═══════════════════════════════════════════════════════"
