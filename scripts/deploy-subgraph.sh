#!/usr/bin/env bash
# deploy-subgraph.sh — Build and deploy the SecretMarketplace subgraph
#
# Prompts for a contract address (defaults to the one in subgraph.yaml).
# Always fetches the deployment block via RPC and updates both
# subgraph.yaml and networks.json before deploying.
#
# Usage: ./scripts/deploy-subgraph.sh [--skip-deploy] [--address <ADDRESS>]
#   --skip-deploy  Only run codegen + build, skip deployment
#   --address      Contract address (skips interactive prompt)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SUBGRAPH_DIR="$ROOT_DIR/subgraphs/secrets-marketplace"
ARTIFACTS_DIR="$ROOT_DIR/contracts/out"

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

# ─── Validate address format ─────────────────────────────────────────────────
if [[ ! "$CONTRACT_ADDRESS" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
  echo "  ERROR: Invalid address format: $CONTRACT_ADDRESS"
  echo "  Expected: 0x followed by 40 hex characters"
  exit 1
fi

# ─── Fetch deployment block via Blockscout API ───────────────────────────────
echo ""
echo "  Fetching deployment block for $CONTRACT_ADDRESS..."

BLOCKSCOUT_RESPONSE=$(curl -sf "https://eth-sepolia.blockscout.com/api?module=contract&action=getcontractcreation&contractaddresses=$CONTRACT_ADDRESS" 2>/dev/null) || true

START_BLOCK=$(echo "$BLOCKSCOUT_RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
if data.get('status') != '1' or not data.get('result'):
    sys.exit(1)
print(data['result'][0]['blockNumber'])
" 2>/dev/null)

if [ -z "$START_BLOCK" ]; then
  echo "  ERROR: Could not find contract creation on Blockscout for $CONTRACT_ADDRESS"
  exit 1
fi

echo "  Found deployment block: $START_BLOCK"

# ─── Update subgraph.yaml ──────────────────────────────────────────────────
echo "  Updating subgraph.yaml..."
sed -i.bak "s|address: \"$CURRENT_ADDRESS\"|address: \"$CONTRACT_ADDRESS\"|" "$SUBGRAPH_DIR/subgraph.yaml"
sed -i.bak "s|startBlock: $CURRENT_START_BLOCK|startBlock: $START_BLOCK|" "$SUBGRAPH_DIR/subgraph.yaml"
rm -f "$SUBGRAPH_DIR/subgraph.yaml.bak"

# ─── Update networks.json ──────────────────────────────────────────────────
echo "  Updating networks.json..."
python3 -c "
import json, sys
path = sys.argv[1]
addr = sys.argv[2]
block = int(sys.argv[3])
data = json.load(open(path))
data['sepolia']['SecretMarketplace']['address'] = addr
data['sepolia']['SecretMarketplace']['startBlock'] = block
with open(path, 'w') as f:
    json.dump(data, f, indent=2)
    f.write('\n')
" "$SUBGRAPH_DIR/networks.json" "$CONTRACT_ADDRESS" "$START_BLOCK"

echo "  Updated config:"
echo "    Address:    $CONTRACT_ADDRESS"
echo "    StartBlock: $START_BLOCK"

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
  npm version patch --no-git-tag-version > /dev/null
  DEPLOY_VERSION=$(node -p "require('./package.json').version")
  echo ""
  echo "▶ Deploying subgraph (version: v$DEPLOY_VERSION)..."
  if npm run deploy -- --version-label "v$DEPLOY_VERSION"; then
    echo ""
    echo "  To publish to The Graph Network, run from subgraphs/secrets-marketplace/:"
    echo "    npx graph publish --protocol-network arbitrum-one"
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
