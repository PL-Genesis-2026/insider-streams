#!/usr/bin/env bash
# deploy-subgraph.sh — Build and deploy the insider-streams-zama subgraph
#
# Supports multiple data sources in subgraph.yaml. Each data source has a
# contract name, address, and startBlock. By default the script only prompts
# for the SecretMarketplace address (the primary contract). Use --address to
# skip the prompt.
#
# Usage: ./scripts/deploy-subgraph.sh [--skip-deploy] [--address <ADDRESS>]
#   --skip-deploy  Only run codegen + build, skip deployment
#   --address      SecretMarketplace contract address (skips interactive prompt)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SUBGRAPH_DIR="$ROOT_DIR/subgraphs/secrets-marketplace"
ARTIFACTS_DIR="$ROOT_DIR/contracts-fhe/artifacts/contracts"

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

# ─── Read current data sources from subgraph.yaml ─────────────────────────
# Uses python3 to parse YAML — handles multiple data sources correctly.
read_datasource() {
  local name="$1"
  python3 -c "
import sys, json

# Minimal YAML parser for subgraph.yaml — reads dataSources array
# and finds the entry matching the given name.
name = sys.argv[1]
path = sys.argv[2]

with open(path) as f:
    content = f.read()

# Use a simple approach: find the data source block by name
import re
# Match 'name: <value>' then find 'address:' and 'startBlock:' nearby
blocks = re.split(r'(?=  - kind: ethereum)', content)
for block in blocks:
    name_match = re.search(r'name:\s+(\S+)', block)
    if not name_match or name_match.group(1) != name:
        continue
    addr_match = re.search(r'address:\s+\"(0x[0-9a-fA-F]+)\"', block)
    start_match = re.search(r'startBlock:\s+(\d+)', block)
    result = {
        'address': addr_match.group(1) if addr_match else '',
        'startBlock': start_match.group(1) if start_match else '',
    }
    print(json.dumps(result))
    sys.exit(0)
print('{}')
" "$name" "$SUBGRAPH_DIR/subgraph.yaml"
}

SM_CONFIG=$(read_datasource "SecretMarketplace")
SM_CURRENT_ADDRESS=$(echo "$SM_CONFIG" | python3 -c "import sys,json; print(json.load(sys.stdin).get('address',''))")
SM_CURRENT_START_BLOCK=$(echo "$SM_CONFIG" | python3 -c "import sys,json; print(json.load(sys.stdin).get('startBlock',''))")

echo ""
echo "  Current SecretMarketplace config:"
echo "    Address:    $SM_CURRENT_ADDRESS"
echo "    StartBlock: $SM_CURRENT_START_BLOCK"

# Show other data sources for reference
EPM_CONFIG=$(read_datasource "ExamplePredictionMarket")
EPM_ADDRESS=$(echo "$EPM_CONFIG" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('address',''))" 2>/dev/null)
if [ -n "$EPM_ADDRESS" ]; then
  EPM_START_BLOCK=$(echo "$EPM_CONFIG" | python3 -c "import sys,json; print(json.load(sys.stdin).get('startBlock',''))")
  echo ""
  echo "  Current ExamplePredictionMarket config:"
  echo "    Address:    $EPM_ADDRESS"
  echo "    StartBlock: $EPM_START_BLOCK"
fi

# ─── Get SecretMarketplace contract address ───────────────────────────────
if [ -n "$ADDRESS_ARG" ]; then
  CONTRACT_ADDRESS="$ADDRESS_ARG"
else
  echo ""
  read -rp "  SecretMarketplace address [$SM_CURRENT_ADDRESS]: " CONTRACT_ADDRESS
  CONTRACT_ADDRESS="${CONTRACT_ADDRESS:-$SM_CURRENT_ADDRESS}"
fi

# ─── Validate address format ─────────────────────────────────────────────
if [[ ! "$CONTRACT_ADDRESS" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
  echo "  ERROR: Invalid address format: $CONTRACT_ADDRESS"
  echo "  Expected: 0x followed by 40 hex characters"
  exit 1
fi

# ─── Fetch deployment block via Blockscout API ───────────────────────────
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

# ─── Update subgraph.yaml (targeted by data source name) ────────────────
echo "  Updating subgraph.yaml..."
python3 -c "
import sys, re

path = sys.argv[1]
old_addr = sys.argv[2]
new_addr = sys.argv[3]
old_block = sys.argv[4]
new_block = sys.argv[5]

with open(path) as f:
    content = f.read()

# Split into data source blocks and only update the SecretMarketplace one
blocks = re.split(r'(  - kind: ethereum)', content)
result = []
in_sm_block = False
for i, block in enumerate(blocks):
    if block.strip() == '- kind: ethereum':
        result.append(block)
        continue
    # Check if this block contains 'name: SecretMarketplace'
    if 'name: SecretMarketplace' in block:
        block = block.replace(
            'address: \"' + old_addr + '\"',
            'address: \"' + new_addr + '\"',
        )
        block = block.replace(
            'startBlock: ' + old_block,
            'startBlock: ' + new_block,
        )
    result.append(block)

with open(path, 'w') as f:
    f.write(''.join(result))
" "$SUBGRAPH_DIR/subgraph.yaml" "$SM_CURRENT_ADDRESS" "$CONTRACT_ADDRESS" "$SM_CURRENT_START_BLOCK" "$START_BLOCK"

# ─── Update networks.json ────────────────────────────────────────────────
echo "  Updating networks.json..."
python3 -c "
import json, sys
path = sys.argv[1]
addr = sys.argv[2]
block = int(sys.argv[3])
data = json.load(open(path))
if 'sepolia' in data and 'SecretMarketplace' in data['sepolia']:
    data['sepolia']['SecretMarketplace']['address'] = addr
    data['sepolia']['SecretMarketplace']['startBlock'] = block
with open(path, 'w') as f:
    json.dump(data, f, indent=2)
    f.write('\n')
" "$SUBGRAPH_DIR/networks.json" "$CONTRACT_ADDRESS" "$START_BLOCK"

echo "  Updated config:"
echo "    Address:    $CONTRACT_ADDRESS"
echo "    StartBlock: $START_BLOCK"

# ─── Copy ABIs from Hardhat artifacts (only when address changed) ─────────
echo ""
if [ "$CONTRACT_ADDRESS" != "$SM_CURRENT_ADDRESS" ]; then
  echo "▶ Copying ABIs (address changed)..."
  for contract in FHESecretMarketplace ExamplePredictionMarket; do
    # Map FHE contract name to subgraph ABI name
    case "$contract" in
      FHESecretMarketplace) abi_name="SecretMarketplace" ;;
      *) abi_name="$contract" ;;
    esac
    artifact="$ARTIFACTS_DIR/$contract.sol/$contract.json"
    if [ -f "$artifact" ]; then
      python3 -c "
import json, sys
artifact = json.load(open(sys.argv[1]))
json.dump(artifact['abi'], open(sys.argv[2], 'w'), indent=2)
" "$artifact" "$SUBGRAPH_DIR/abis/$abi_name.json"
      echo "  Copied $contract ABI -> subgraphs/secrets-marketplace/abis/$abi_name.json"
    else
      echo "  Skipping $contract ABI (Hardhat artifact not found at $artifact)"
    fi
  done
else
  echo "  Skipping ABI copy (address unchanged)"
fi

# ─── Install deps if needed ──────────────────────────────────────────────
cd "$SUBGRAPH_DIR"

if [ ! -d "node_modules/@graphprotocol/graph-ts" ]; then
  echo ""
  echo "▶ Installing subgraph dependencies..."
  npm install --no-fund --no-audit
fi

# ─── Codegen + Build ─────────────────────────────────────────────────────
echo ""
echo "▶ Running graph codegen..."
npm run codegen

echo ""
echo "▶ Running graph build..."
npm run build

# ─── Deploy ──────────────────────────────────────────────────────────────
if [ "$SKIP_DEPLOY" = false ]; then
  CURRENT_VERSION=$(node -p "require('./package.json').version")
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
    echo "  WARNING: Deploy failed — rolling back version to v$CURRENT_VERSION."
    npm version "$CURRENT_VERSION" --no-git-tag-version --allow-same-version > /dev/null
    echo "  Run 'npx graph auth --studio <DEPLOY_KEY>' in subgraphs/secrets-marketplace/ first."
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
