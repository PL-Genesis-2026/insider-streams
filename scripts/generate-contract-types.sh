#!/usr/bin/env bash
# generate-contract-types.sh — Compile contracts and regenerate TypeScript types
#
# Steps:
#   1. Compile contracts with Foundry
#   2. Run wagmi CLI to regenerate TypeScript types in packages/common
#   3. Run pnpm install to update workspace links
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

# ─── Done ────────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Done — Contract types regenerated"
echo "═══════════════════════════════════════════════════════"
echo "  TypeScript:  packages/common/src/__generated__/contract-types.ts"
echo "═══════════════════════════════════════════════════════"
