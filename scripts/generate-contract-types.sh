#!/usr/bin/env bash
# generate-contract-types.sh — Compile contracts, regenerate types, update subgraph + frontend ABIs
#
# Steps:
#   1. Compile contracts with Foundry
#   2. Run wagmi CLI to regenerate TypeScript types in packages/common
#   3. Run pnpm install to update workspace links
#   4. Extract JSON ABIs from Foundry artifacts → subgraph abis/, then codegen + build + deploy
#   5. Copy JSON ABIs to frontend apps
#
# Usage: ./scripts/generate-contract-types.sh [--skip-deploy]
#   --skip-deploy  Skip subgraph deployment (only codegen + build)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKIP_DEPLOY=false

for arg in "$@"; do
  case "$arg" in
    --skip-deploy) SKIP_DEPLOY=true ;;
    *) echo "Unknown arg: $arg"; exit 1 ;;
  esac
done

echo "═══════════════════════════════════════════════════════"
echo "  Generate Contract Types"
echo "═══════════════════════════════════════════════════════"

# ─── Step 1: Compile contracts ────────────────────────────────────────────────
echo ""
echo "▶ Step 1: Compiling contracts..."
cd "$SCRIPT_DIR/contracts"
forge build --via-ir
echo "  Done."

# ─── Step 2: Generate TypeScript types via wagmi ──────────────────────────────
echo ""
echo "▶ Step 2: Generating TypeScript types (wagmi)..."
cd "$SCRIPT_DIR"
pnpm wagmi
echo "  Done. Output: packages/common/src/generated.ts"

# ─── Step 3: pnpm install ────────────────────────────────────────────────────
echo ""
echo "▶ Step 3: Running pnpm install..."
cd "$SCRIPT_DIR"
pnpm install
echo "  Done."

# ─── Step 4: Copy ABIs to subgraph, codegen + build + deploy ─────────────────
echo ""
echo "▶ Step 4: Updating subgraph ABIs..."

SUBGRAPH_DIR="$SCRIPT_DIR/subgraphs/secrets-marketplace"
ARTIFACTS_DIR="$SCRIPT_DIR/contracts/out"

# Extract just the ABI array from Foundry artifacts (subgraph expects plain ABI JSON, not full artifact)
python3 -c "
import json, sys
artifact = json.load(open(sys.argv[1]))
json.dump(artifact['abi'], open(sys.argv[2], 'w'), indent=2)
" "$ARTIFACTS_DIR/SecretMarketplace.sol/SecretMarketplace.json" \
  "$SUBGRAPH_DIR/abis/SecretMarketplace.json"

echo "  Copied SecretMarketplace ABI → subgraphs/secrets-marketplace/abis/"

cd "$SUBGRAPH_DIR"

# Install subgraph deps if needed (not in pnpm workspace — uses its own node_modules)
if [ ! -d "node_modules/@graphprotocol/graph-ts" ]; then
  echo "  Installing subgraph dependencies..."
  npm install --no-fund --no-audit
fi

echo "  Running graph codegen..."
npm run codegen

echo "  Running graph build..."
npm run build

if [ "$SKIP_DEPLOY" = false ]; then
  # Read version from subgraph package.json, deploy, then bump patch for next deploy
  CURRENT_VERSION=$(node -p "require('./package.json').version")
  echo "  Deploying subgraph (version: v$CURRENT_VERSION)..."
  if npm run deploy -- --version-label "v$CURRENT_VERSION"; then
    npm version patch --no-git-tag-version > /dev/null
    NEXT_VERSION=$(node -p "require('./package.json').version")
    echo "  Bumped subgraph version: v$CURRENT_VERSION → v$NEXT_VERSION"
  else
    echo "  WARNING: Deploy failed. Run 'npx graph auth --studio <DEPLOY_KEY>' in subgraphs/secrets-marketplace/ first."
    echo "  Codegen and build succeeded — only deploy was skipped."
  fi
else
  echo "  Skipping deploy (--skip-deploy)"
fi

# ─── Step 5: Copy ABIs to frontend apps ──────────────────────────────────────
echo ""
echo "▶ Step 5: Copying ABIs to frontend apps..."

CONTRACTS=("SecretMarketplace.sol/SecretMarketplace.json" "SimpleMarket.sol/SimpleMarket.json" "MockUSDC.sol/MockUSDC.json")
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
echo "  TypeScript:  packages/common/src/generated.ts"
echo "  Subgraph:    subgraphs/secrets-marketplace/abis/"
echo "  Frontends:   apps/*/src/abis/"
echo "═══════════════════════════════════════════════════════"
