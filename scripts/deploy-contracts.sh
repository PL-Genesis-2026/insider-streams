#!/usr/bin/env bash
# deploy-contracts.sh — Interactively deploy contracts and update hardcoded addresses
#
# Prompts which contracts to redeploy (MockUSDC, SimpleMarket, SecretMarketplace),
# deploys them via Foundry, then does a best-effort find-and-replace of the old
# addresses across the codebase (source files, configs, scripts, .env files).
#
# Usage: ./scripts/deploy-contracts.sh
#
# Requires:
#   - contracts/.env with PRIVATE_KEY and RPC_URL
#   - For SimpleMarket: PAYMENT_TOKEN and CRE_FORWARDER_ADDRESS in contracts/.env
#   - For SecretMarketplace: PAYMENT_TOKEN, SIMPLE_MARKET_ADDRESS, CRE_FORWARDER_ADDRESS in contracts/.env

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS_DIR="$ROOT_DIR/contracts"

# ─── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ─── Helpers ─────────────────────────────────────────────────────────────────

# Replace an old address with a new one across the codebase (case-insensitive).
# Skips node_modules, out, build, cache, .git directories.
replace_address() {
  local OLD_ADDR="$1"
  local NEW_ADDR="$2"
  local LABEL="$3"

  if [ "$OLD_ADDR" = "$NEW_ADDR" ]; then
    return
  fi

  echo ""
  echo -e "  ${CYAN}Replacing $LABEL addresses...${NC}"
  echo "    Old: $OLD_ADDR"
  echo "    New: $NEW_ADDR"

  local COUNT=0

  # Find files containing the old address (case-insensitive), excluding build artifacts.
  # Uses python3 for case-insensitive replacement (macOS sed lacks the I flag).
  while IFS= read -r file; do
    # Skip binary files and lock files
    case "$file" in
      *.lock|*.png|*.jpg|*.gif|*.ico|*.woff*|*.ttf) continue ;;
    esac

    if grep -qi "$OLD_ADDR" "$file" 2>/dev/null; then
      python3 -c "
import re, sys
old, new = sys.argv[1], sys.argv[2]
path = sys.argv[3]
with open(path, 'r') as f:
    content = f.read()
updated = re.sub(re.escape(old), new, content, flags=re.IGNORECASE)
if updated != content:
    with open(path, 'w') as f:
        f.write(updated)
" "$OLD_ADDR" "$NEW_ADDR" "$file"
      COUNT=$((COUNT + 1))
      echo -e "    ${GREEN}Updated:${NC} ${file#$ROOT_DIR/}"
    fi
  done < <(find "$ROOT_DIR" \
    -type f \
    \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.json' -o -name '*.yaml' \
       -o -name '*.yml' -o -name '*.sh' -o -name '*.md' -o -name '*.sol' -o -name '*.env' \
       -o -name '*.env.*' -o -name '*.toml' \) \
    ! -path '*/node_modules/*' \
    ! -path '*/out/*' \
    ! -path '*/build/*' \
    ! -path '*/cache/*' \
    ! -path '*/.git/*' \
    ! -path '*/__generated__/*' \
    ! -path '*/generated/*' \
    2>/dev/null)

  if [ $COUNT -eq 0 ]; then
    echo -e "    ${YELLOW}No files contained the old address.${NC}"
  else
    echo -e "    ${GREEN}Updated $COUNT file(s).${NC}"
  fi
}

# Deploy a contract and extract the new address from forge output.
# Prints the new address to stdout (for capture). Status messages go to stderr.
deploy_contract() {
  local SCRIPT_NAME="$1"
  local CONTRACT_LABEL="$2"

  echo "" >&2
  echo -e "  ${CYAN}Deploying $CONTRACT_LABEL...${NC}" >&2

  local OUTPUT
  OUTPUT=$(cd "$CONTRACTS_DIR" && forge script "script/$SCRIPT_NAME" \
    --rpc-url "$RPC_URL" \
    --broadcast \
    --via-ir \
    2>&1) || {
    echo -e "  ${RED}ERROR: Deployment failed for $CONTRACT_LABEL${NC}" >&2
    echo "$OUTPUT" | tail -20 >&2
    return 1
  }

  # Extract address from "ContractName deployed at: 0x..."
  local NEW_ADDR
  NEW_ADDR=$(echo "$OUTPUT" | grep -oE "deployed at: 0x[0-9a-fA-F]{40}" | head -1 | grep -oE "0x[0-9a-fA-F]{40}")

  if [ -z "$NEW_ADDR" ]; then
    echo -e "  ${RED}ERROR: Could not parse deployed address from forge output${NC}" >&2
    echo "$OUTPUT" | tail -20 >&2
    return 1
  fi

  echo -e "  ${GREEN}$CONTRACT_LABEL deployed at: $NEW_ADDR${NC}" >&2
  echo "$NEW_ADDR"
}

# ─── Read current addresses ─────────────────────────────────────────────────

# Read from packages/common/src/index.ts (the canonical source).
# Address may be on the same line or the next line, so grab both with -A1.
CURRENT_MOCK_USDC=$(grep -A1 'MOCK_USDC_ADDRESS' "$ROOT_DIR/packages/common/src/index.ts" | grep -oE '0x[0-9a-fA-F]{40}')
CURRENT_SIMPLE_MARKET=$(grep -A1 'SIMPLE_MARKET_ADDRESS' "$ROOT_DIR/packages/common/src/index.ts" | grep -oE '0x[0-9a-fA-F]{40}')
CURRENT_SECRET_MARKETPLACE=$(grep -A1 'SECRET_MARKETPLACE_ADDRESS' "$ROOT_DIR/packages/common/src/index.ts" | grep -oE '0x[0-9a-fA-F]{40}')

# Also read from .env files — addresses there may differ from packages/common
# (stale from a previous deploy). We'll replace these too.
read_env_addr() {
  local FILE="$1" VAR="$2"
  if [ -f "$FILE" ]; then
    grep "^${VAR}=" "$FILE" 2>/dev/null | cut -d'=' -f2- || true
  fi
}
ALT_MOCK_USDC=$(read_env_addr "$ROOT_DIR/.env" "MOCK_USDC_ADDRESS")
ALT_SIMPLE_MARKET=$(read_env_addr "$ROOT_DIR/.env" "SIMPLE_MARKET_ADDRESS")
ALT_SECRET_MARKETPLACE=$(read_env_addr "$ROOT_DIR/.env" "SECRET_MARKETPLACE_ADDRESS")

# Read RPC_URL from contracts/.env
if [ -f "$CONTRACTS_DIR/.env" ]; then
  RPC_URL=$(grep '^RPC_URL=' "$CONTRACTS_DIR/.env" | cut -d'=' -f2-)
fi
: "${RPC_URL:?RPC_URL not found in contracts/.env}"

echo "═══════════════════════════════════════════════════════"
echo "  Deploy Contracts"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "  Current addresses (from packages/common/src/index.ts):"
echo "    MockUSDC:           $CURRENT_MOCK_USDC"
echo "    SimpleMarket:       $CURRENT_SIMPLE_MARKET"
echo "    SecretMarketplace:  $CURRENT_SECRET_MARKETPLACE"
echo ""
echo "  RPC: $RPC_URL"

# ─── Ask which contracts to deploy ───────────────────────────────────────────
echo ""
echo "  Which contracts do you want to redeploy?"
echo ""

DEPLOY_USDC=false
DEPLOY_MARKET=false
DEPLOY_MARKETPLACE=false

read -rp "  Deploy MockUSDC? [y/N]: " ans
[[ "$ans" =~ ^[Yy]$ ]] && DEPLOY_USDC=true

read -rp "  Deploy SimpleMarket? [y/N]: " ans
[[ "$ans" =~ ^[Yy]$ ]] && DEPLOY_MARKET=true

read -rp "  Deploy SecretMarketplace? [y/N]: " ans
[[ "$ans" =~ ^[Yy]$ ]] && DEPLOY_MARKETPLACE=true

if [ "$DEPLOY_USDC" = false ] && [ "$DEPLOY_MARKET" = false ] && [ "$DEPLOY_MARKETPLACE" = false ]; then
  echo ""
  echo "  Nothing selected. Exiting."
  exit 0
fi

# ─── Verify contracts/.env has required vars ─────────────────────────────────

if [ "$DEPLOY_MARKET" = true ] || [ "$DEPLOY_MARKETPLACE" = true ]; then
  if ! grep -q '^PAYMENT_TOKEN=' "$CONTRACTS_DIR/.env" 2>/dev/null; then
    echo ""
    echo -e "  ${YELLOW}PAYMENT_TOKEN not found in contracts/.env${NC}"
    echo "  SimpleMarket and SecretMarketplace need this."
    echo ""
    if [ "$DEPLOY_USDC" = true ]; then
      echo "  It will be set automatically after MockUSDC is deployed."
    else
      echo "  Set it to the MockUSDC address: $CURRENT_MOCK_USDC"
      read -rp "  Add PAYMENT_TOKEN=$CURRENT_MOCK_USDC to contracts/.env? [Y/n]: " ans
      if [[ ! "$ans" =~ ^[Nn]$ ]]; then
        echo "PAYMENT_TOKEN=$CURRENT_MOCK_USDC" >> "$CONTRACTS_DIR/.env"
        echo "  Added."
      else
        echo "  Skipped. Deployment may fail without PAYMENT_TOKEN."
      fi
    fi
  fi

  if ! grep -q '^CRE_FORWARDER_ADDRESS=' "$CONTRACTS_DIR/.env" 2>/dev/null; then
    echo ""
    echo -e "  ${YELLOW}CRE_FORWARDER_ADDRESS not found in contracts/.env${NC}"
    CRE_FORWARDER="0x15fc6ae953e024d975e77382eeec56a9101f9f88"
    read -rp "  Add CRE_FORWARDER_ADDRESS=$CRE_FORWARDER to contracts/.env? [Y/n]: " ans
    if [[ ! "$ans" =~ ^[Nn]$ ]]; then
      echo "CRE_FORWARDER_ADDRESS=$CRE_FORWARDER" >> "$CONTRACTS_DIR/.env"
      echo "  Added."
    fi
  fi
fi

if [ "$DEPLOY_MARKETPLACE" = true ] && [ "$DEPLOY_MARKET" = false ]; then
  if ! grep -q '^SIMPLE_MARKET_ADDRESS=' "$CONTRACTS_DIR/.env" 2>/dev/null; then
    echo ""
    echo -e "  ${YELLOW}SIMPLE_MARKET_ADDRESS not found in contracts/.env${NC}"
    read -rp "  Add SIMPLE_MARKET_ADDRESS=$CURRENT_SIMPLE_MARKET to contracts/.env? [Y/n]: " ans
    if [[ ! "$ans" =~ ^[Nn]$ ]]; then
      echo "SIMPLE_MARKET_ADDRESS=$CURRENT_SIMPLE_MARKET" >> "$CONTRACTS_DIR/.env"
      echo "  Added."
    fi
  fi
fi

# ─── Deploy ──────────────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Deploying..."
echo "═══════════════════════════════════════════════════════"

NEW_USDC=""
NEW_MARKET=""
NEW_MARKETPLACE=""

# Deploy MockUSDC
if [ "$DEPLOY_USDC" = true ]; then
  NEW_USDC=$(deploy_contract "DeployMockUSDC.s.sol:DeployMockUSDC" "MockUSDC")

  # Update PAYMENT_TOKEN in contracts/.env for subsequent deploys
  if [ "$DEPLOY_MARKET" = true ] || [ "$DEPLOY_MARKETPLACE" = true ]; then
    if grep -q '^PAYMENT_TOKEN=' "$CONTRACTS_DIR/.env" 2>/dev/null; then
      sed -i.bak "s|^PAYMENT_TOKEN=.*|PAYMENT_TOKEN=$NEW_USDC|" "$CONTRACTS_DIR/.env"
      rm -f "$CONTRACTS_DIR/.env.bak"
    else
      echo "PAYMENT_TOKEN=$NEW_USDC" >> "$CONTRACTS_DIR/.env"
    fi
    echo "  Updated PAYMENT_TOKEN in contracts/.env → $NEW_USDC"
  fi
fi

# Deploy SimpleMarket
if [ "$DEPLOY_MARKET" = true ]; then
  NEW_MARKET=$(deploy_contract "DeploySimpleMarket.s.sol:DeploySimpleMarket" "SimpleMarket")

  # Update SIMPLE_MARKET_ADDRESS in contracts/.env for SecretMarketplace deploy
  if [ "$DEPLOY_MARKETPLACE" = true ]; then
    if grep -q '^SIMPLE_MARKET_ADDRESS=' "$CONTRACTS_DIR/.env" 2>/dev/null; then
      sed -i.bak "s|^SIMPLE_MARKET_ADDRESS=.*|SIMPLE_MARKET_ADDRESS=$NEW_MARKET|" "$CONTRACTS_DIR/.env"
      rm -f "$CONTRACTS_DIR/.env.bak"
    else
      echo "SIMPLE_MARKET_ADDRESS=$NEW_MARKET" >> "$CONTRACTS_DIR/.env"
    fi
    echo "  Updated SIMPLE_MARKET_ADDRESS in contracts/.env → $NEW_MARKET"
  fi
fi

# Deploy SecretMarketplace
if [ "$DEPLOY_MARKETPLACE" = true ]; then
  NEW_MARKETPLACE=$(deploy_contract "DeploySecretMarketplace.s.sol:DeploySecretMarketplace" "SecretMarketplace")
fi

# ─── Replace addresses across the codebase ───────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Updating addresses across codebase..."
echo "═══════════════════════════════════════════════════════"

if [ -n "$NEW_USDC" ]; then
  replace_address "$CURRENT_MOCK_USDC" "$NEW_USDC" "MockUSDC"
  # Also replace the .env variant if it differs from the canonical address
  if [ -n "$ALT_MOCK_USDC" ] && [ "$ALT_MOCK_USDC" != "$CURRENT_MOCK_USDC" ]; then
    replace_address "$ALT_MOCK_USDC" "$NEW_USDC" "MockUSDC (.env variant)"
  fi
fi

if [ -n "$NEW_MARKET" ]; then
  replace_address "$CURRENT_SIMPLE_MARKET" "$NEW_MARKET" "SimpleMarket"
  if [ -n "$ALT_SIMPLE_MARKET" ] && [ "$ALT_SIMPLE_MARKET" != "$CURRENT_SIMPLE_MARKET" ]; then
    replace_address "$ALT_SIMPLE_MARKET" "$NEW_MARKET" "SimpleMarket (.env variant)"
  fi
fi

if [ -n "$NEW_MARKETPLACE" ]; then
  replace_address "$CURRENT_SECRET_MARKETPLACE" "$NEW_MARKETPLACE" "SecretMarketplace"
  if [ -n "$ALT_SECRET_MARKETPLACE" ] && [ "$ALT_SECRET_MARKETPLACE" != "$CURRENT_SECRET_MARKETPLACE" ]; then
    replace_address "$ALT_SECRET_MARKETPLACE" "$NEW_MARKETPLACE" "SecretMarketplace (.env variant)"
  fi
fi

# ─── Fix stale addresses in .env files ───────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Fixing stale .env addresses..."
echo "═══════════════════════════════════════════════════════"

# Update an env var in a file. Handles both active and commented-out lines.
fix_env_address() {
  local ENV_FILE="$1"
  local VAR_NAME="$2"
  local EXPECTED="$3"
  local LABEL="$4"

  if [ ! -f "$ENV_FILE" ]; then
    return
  fi

  local DISPLAY_PATH="${ENV_FILE#$ROOT_DIR/}"

  # Fix active (uncommented) line
  local CURRENT
  CURRENT=$(grep "^${VAR_NAME}=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2- || true)
  if [ -n "$CURRENT" ] && [ "$CURRENT" != "$EXPECTED" ]; then
    sed -i.bak "s|^${VAR_NAME}=.*|${VAR_NAME}=${EXPECTED}|" "$ENV_FILE"
    rm -f "${ENV_FILE}.bak"
    echo -e "  ${GREEN}Fixed:${NC} $DISPLAY_PATH  ${VAR_NAME}=${EXPECTED}"
  fi

  # Fix commented-out line
  if grep -q "^# *${VAR_NAME}=" "$ENV_FILE" 2>/dev/null; then
    local COMMENTED
    COMMENTED=$(grep "^# *${VAR_NAME}=" "$ENV_FILE" | sed 's/^# *//' | cut -d'=' -f2-)
    if [ -n "$COMMENTED" ] && [ "$COMMENTED" != "$EXPECTED" ]; then
      sed -i.bak "s|^# *${VAR_NAME}=.*|# ${VAR_NAME}=${EXPECTED}|" "$ENV_FILE"
      rm -f "${ENV_FILE}.bak"
      echo -e "  ${GREEN}Fixed (commented):${NC} $DISPLAY_PATH  # ${VAR_NAME}=${EXPECTED}"
    fi
  fi
}

# Determine the final expected addresses
EXPECTED_USDC="${NEW_USDC:-$CURRENT_MOCK_USDC}"
EXPECTED_MARKET="${NEW_MARKET:-$CURRENT_SIMPLE_MARKET}"
EXPECTED_MARKETPLACE="${NEW_MARKETPLACE:-$CURRENT_SECRET_MARKETPLACE}"

fix_env_address "$ROOT_DIR/.env" "MOCK_USDC_ADDRESS" "$EXPECTED_USDC" "MockUSDC"
fix_env_address "$ROOT_DIR/.env" "SIMPLE_MARKET_ADDRESS" "$EXPECTED_MARKET" "SimpleMarket"
fix_env_address "$ROOT_DIR/.env" "SECRET_MARKETPLACE_ADDRESS" "$EXPECTED_MARKETPLACE" "SecretMarketplace"
fix_env_address "$ROOT_DIR/scripts/.env" "MOCK_USDC_ADDRESS" "$EXPECTED_USDC" "MockUSDC"
fix_env_address "$ROOT_DIR/scripts/.env" "SIMPLE_MARKET_ADDRESS" "$EXPECTED_MARKET" "SimpleMarket"
fix_env_address "$ROOT_DIR/scripts/.env" "SECRET_MARKETPLACE_ADDRESS" "$EXPECTED_MARKETPLACE" "SecretMarketplace"

# ─── Summary ─────────────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Deployment Summary"
echo "═══════════════════════════════════════════════════════"

if [ -n "$NEW_USDC" ]; then
  echo -e "  MockUSDC:           ${GREEN}$NEW_USDC${NC}"
fi
if [ -n "$NEW_MARKET" ]; then
  echo -e "  SimpleMarket:       ${GREEN}$NEW_MARKET${NC}"
fi
if [ -n "$NEW_MARKETPLACE" ]; then
  echo -e "  SecretMarketplace:  ${GREEN}$NEW_MARKETPLACE${NC}"
fi

echo ""
echo "  Next steps:"
echo "    1. Run ./scripts/generate-contract-types.sh to regenerate types"
echo "    2. If SecretMarketplace changed, run ./scripts/deploy-subgraph.sh"
echo "    3. If CRE workflow configs changed, redeploy the CRE workflows"
echo "═══════════════════════════════════════════════════════"
