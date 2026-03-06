#!/usr/bin/env bash
# deploy-subgraph.sh — Build and deploy the SecretMarketplace subgraph
#
# Prompts for a contract address (defaults to the one in subgraph.yaml).
# If a new address is provided, fetches its deployment block via RPC and
# updates subgraph.yaml before deploying.
#
# Usage: ./scripts/deploy-subgraph.sh [--skip-deploy] [--address <ADDRESS>]
#   --skip-deploy  Only run codegen + build, skip deployment
#   --address      Contract address (skips interactive prompt)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SUBGRAPH_DIR="$ROOT_DIR/subgraphs/secrets-marketplace"
ARTIFACTS_DIR="$ROOT_DIR/contracts/out"
RPC_URL="https://ethereum-sepolia-rpc.publicnode.com"

SKIP_DEPLOY=false
ADDRESS_ARG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-deploy) SKIP_DEPLOY=true; shift ;;
    --address)     ADDRESS_ARG="$2"; shift 2 ;;
    *)             echo "Unknown arg: $1"; exit 1 ;;
  esac
done

echo "═══════════════════════════════════════════════════════"
echo "  Deploy Subgraph"
echo "═══════════════════════════════════════════════════════"

# ─── Read current address from subgraph.yaml ────────────────────────────────
CURRENT_ADDRESS=$(sed -n 's/.*address: "\(0x[^"]*\)".*/\1/p' "$SUBGRAPH_DIR/subgraph.yaml")
CURRENT_START_BLOCK=$(sed -n 's/.*startBlock: \([0-9]*\)/\1/p' "$SUBGRAPH_DIR/subgraph.yaml")

echo ""
echo "  Current config:"
echo "    Address:    $CURRENT_ADDRESS"
echo "    StartBlock: $CURRENT_START_BLOCK"

# ─── Get contract address (interactive or from flag) ────────────────────────
if [ -n "$ADDRESS_ARG" ]; then
  CONTRACT_ADDRESS="$ADDRESS_ARG"
else
  echo ""
  read -rp "  Contract address [$CURRENT_ADDRESS]: " CONTRACT_ADDRESS
  CONTRACT_ADDRESS="${CONTRACT_ADDRESS:-$CURRENT_ADDRESS}"
fi

# ─── If address changed, fetch deployment block via RPC ─────────────────────
if [ "$CONTRACT_ADDRESS" != "$CURRENT_ADDRESS" ]; then
  echo ""
  echo "  Address changed — fetching deployment block for $CONTRACT_ADDRESS..."

  # eth_getCode to verify the contract exists
  CODE=$(curl -sf -X POST "$RPC_URL" \
    -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getCode\",\"params\":[\"$CONTRACT_ADDRESS\",\"latest\"],\"id\":1}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['result'])")

  if [ "$CODE" = "0x" ] || [ -z "$CODE" ]; then
    echo "  ERROR: No contract found at $CONTRACT_ADDRESS on Sepolia"
    exit 1
  fi

  # Binary search for the deployment block (first block where code exists)
  echo "  Binary-searching for deployment block..."
  LATEST_HEX=$(curl -sf -X POST "$RPC_URL" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['result'])")
  LATEST_BLOCK=$((LATEST_HEX))

  LOW=0
  HIGH=$LATEST_BLOCK

  while [ $LOW -lt $HIGH ]; do
    MID=$(( (LOW + HIGH) / 2 ))
    MID_HEX=$(printf "0x%x" $MID)

    CODE_AT_MID=$(curl -sf -X POST "$RPC_URL" \
      -H "Content-Type: application/json" \
      -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getCode\",\"params\":[\"$CONTRACT_ADDRESS\",\"$MID_HEX\"],\"id\":1}" \
      | python3 -c "import sys,json; print(json.load(sys.stdin)['result'])")

    if [ "$CODE_AT_MID" = "0x" ] || [ -z "$CODE_AT_MID" ]; then
      LOW=$(( MID + 1 ))
    else
      HIGH=$MID
    fi
  done

  START_BLOCK=$LOW
  echo "  Found deployment block: $START_BLOCK"

  # Update subgraph.yaml
  echo "  Updating subgraph.yaml..."
  sed -i.bak "s|address: \"$CURRENT_ADDRESS\"|address: \"$CONTRACT_ADDRESS\"|" "$SUBGRAPH_DIR/subgraph.yaml"
  sed -i.bak "s|startBlock: $CURRENT_START_BLOCK|startBlock: $START_BLOCK|" "$SUBGRAPH_DIR/subgraph.yaml"
  rm -f "$SUBGRAPH_DIR/subgraph.yaml.bak"

  echo "  Updated subgraph.yaml:"
  echo "    Address:    $CONTRACT_ADDRESS"
  echo "    StartBlock: $START_BLOCK"
else
  echo ""
  echo "  Using existing config (no changes)."
fi

# ─── Copy ABI from Foundry artifacts ────────────────────────────────────────
echo ""
echo "▶ Copying ABI..."
if [ -f "$ARTIFACTS_DIR/SecretMarketplace.sol/SecretMarketplace.json" ]; then
  python3 -c "
import json, sys
artifact = json.load(open(sys.argv[1]))
json.dump(artifact['abi'], open(sys.argv[2], 'w'), indent=2)
" "$ARTIFACTS_DIR/SecretMarketplace.sol/SecretMarketplace.json" \
    "$SUBGRAPH_DIR/abis/SecretMarketplace.json"
  echo "  Copied SecretMarketplace ABI → subgraphs/secrets-marketplace/abis/"
else
  echo "  Skipping ABI copy (Foundry artifacts not found — run 'forge build --via-ir' first)"
fi

# ─── Install deps if needed ─────────────────────────────────────────────────
cd "$SUBGRAPH_DIR"

if [ ! -d "node_modules/@graphprotocol/graph-ts" ]; then
  echo ""
  echo "▶ Installing subgraph dependencies..."
  npm install --no-fund --no-audit
fi

# ─── Codegen + Build ────────────────────────────────────────────────────────
echo ""
echo "▶ Running graph codegen..."
npm run codegen

echo ""
echo "▶ Running graph build..."
npm run build

# ─── Deploy ─────────────────────────────────────────────────────────────────
if [ "$SKIP_DEPLOY" = false ]; then
  CURRENT_VERSION=$(node -p "require('./package.json').version")
  echo ""
  echo "▶ Deploying subgraph (version: v$CURRENT_VERSION)..."
  if npm run deploy -- --version-label "v$CURRENT_VERSION"; then
    npm version patch --no-git-tag-version > /dev/null
    NEXT_VERSION=$(node -p "require('./package.json').version")
    echo "  Bumped subgraph version: v$CURRENT_VERSION → v$NEXT_VERSION"

    # ─── Publish prompt (only in interactive mode) ─────────────────────────
    # Publishing is an on-chain transaction on Arbitrum that requires wallet
    # signing. The Graph CLI has no headless/non-interactive publish mode —
    # `graph publish` always opens a browser window for wallet connection
    # and metadata entry before submitting the transaction.
    if [ -t 0 ]; then
      echo ""
      read -rp "  Publish to The Graph Network? (opens browser for wallet signing) [y/N]: " PUBLISH_ANSWER
      if [[ "$PUBLISH_ANSWER" =~ ^[Yy]$ ]]; then
        echo ""
        echo "▶ Publishing subgraph to The Graph Network..."
        echo "  Opening browser for wallet connection and metadata..."
        echo ""
        npx graph publish --protocol-network arbitrum-one
      fi
    fi
  else
    echo ""
    echo "  WARNING: Deploy failed. Run 'npx graph auth --studio <DEPLOY_KEY>' in subgraphs/secrets-marketplace/ first."
    echo "  Codegen and build succeeded — only deploy was skipped."
  fi
else
  echo ""
  echo "  Skipping deploy (--skip-deploy)"
fi

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Subgraph deploy complete"
echo "═══════════════════════════════════════════════════════"
