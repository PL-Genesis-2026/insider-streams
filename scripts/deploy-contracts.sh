#!/usr/bin/env bash
# deploy-contracts.sh — Deploy contracts and update hardcoded addresses
#
# Deploys selected contracts via Foundry, then does a best-effort find-and-replace
# of old addresses across the codebase (source files, configs, scripts, .env files).
#
# Usage:
#   ./scripts/deploy-contracts.sh                                      # interactive — prompts for each contract
#   ./scripts/deploy-contracts.sh --prediction-market                  # non-interactive — deploy ExamplePredictionMarket only
#   ./scripts/deploy-contracts.sh --confidential-usdc --prediction-market  # non-interactive — deploy ConfidentialUSDC + ExamplePredictionMarket
#   ./scripts/deploy-contracts.sh --all                                # non-interactive — deploy everything
#
# Flags:
#   --confidential-usdc    Deploy ConfidentialUSDC
#   --prediction-market    Deploy ExamplePredictionMarket
#   --secret-marketplace   Deploy SecretMarketplace
#   --all                  Deploy all three contracts
#
# Requires:
#   - contracts/.env with PRIVATE_KEY and RPC_URL
#   - For ExamplePredictionMarket: CONFIDENTIAL_USDC_ADDRESS and CRE_FORWARDER_ADDRESS in contracts/.env
#   - For SecretMarketplace: CONFIDENTIAL_USDC_ADDRESS, EXAMPLE_PREDICTION_MARKET_ADDRESS, CRE_FORWARDER_ADDRESS in contracts/.env

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS_DIR="$ROOT_DIR/contracts"

# ─── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ─── Parse CLI flags ─────────────────────────────────────────────────────────

CLI_MODE=false
DEPLOY_CONFIDENTIAL_USDC=false
DEPLOY_EXAMPLE_PREDICTION_MARKET=false
DEPLOY_SECRET_MARKETPLACE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --confidential-usdc)
      DEPLOY_CONFIDENTIAL_USDC=true
      CLI_MODE=true
      shift
      ;;
    --prediction-market)
      DEPLOY_EXAMPLE_PREDICTION_MARKET=true
      CLI_MODE=true
      shift
      ;;
    --secret-marketplace)
      DEPLOY_SECRET_MARKETPLACE=true
      CLI_MODE=true
      shift
      ;;
    --all)
      DEPLOY_CONFIDENTIAL_USDC=true
      DEPLOY_EXAMPLE_PREDICTION_MARKET=true
      DEPLOY_SECRET_MARKETPLACE=true
      CLI_MODE=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [--confidential-usdc] [--prediction-market] [--secret-marketplace] [--all]"
      echo ""
      echo "  No flags               — interactive mode (prompts for each contract)"
      echo "  --confidential-usdc    Deploy ConfidentialUSDC"
      echo "  --prediction-market    Deploy ExamplePredictionMarket"
      echo "  --secret-marketplace   Deploy SecretMarketplace"
      echo "  --all                  Deploy all three contracts"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown flag: $1${NC}"
      echo "Usage: $0 [--confidential-usdc] [--prediction-market] [--secret-marketplace] [--all]"
      exit 1
      ;;
  esac
done

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
    ! -name 'pnpm-lock.yaml' \
    ! -name '*.lock' \
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

  local VERIFY_FLAGS=""
  if [ -n "$ETHERSCAN_API_KEY" ]; then
    VERIFY_FLAGS="--verify --etherscan-api-key $ETHERSCAN_API_KEY"
    echo -e "  ${GREEN}Etherscan verification enabled${NC}" >&2
  fi

  local OUTPUT
  OUTPUT=$(cd "$CONTRACTS_DIR" && forge script "script/$SCRIPT_NAME" \
    --rpc-url "$RPC_URL" \
    --broadcast \
    --via-ir \
    --skip SetupAll DeployPolicyEngine \
    $VERIFY_FLAGS \
    2>&1) || {
    echo -e "  ${RED}ERROR: Deployment failed for $CONTRACT_LABEL${NC}" >&2
    echo "$OUTPUT" | tail -20 >&2
    return 1
  }

  # Extract address from "ContractName deployed at: 0x..."
  local NEW_ADDR
  NEW_ADDR=$(echo "$OUTPUT" | grep -oE "deployed at: 0x[0-9a-fA-F]{40}" | head -1 | grep -oE "0x[0-9a-fA-F]{40}")

  if [ -z "$NEW_ADDR" ] || [[ ! "$NEW_ADDR" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
    echo -e "  ${RED}ERROR: Could not parse a valid address from forge output${NC}" >&2
    echo "$OUTPUT" | tail -20 >&2
    return 1
  fi

  echo -e "  ${GREEN}$CONTRACT_LABEL deployed at: $NEW_ADDR${NC}" >&2
  echo "$NEW_ADDR"
}

# ─── Read current addresses ─────────────────────────────────────────────────

# Read from packages/common/src/index.ts (the canonical source).
# Address may be on the same line or the next line, so grab both with -A1.
CURRENT_CONFIDENTIAL_USDC=$(grep -A1 'export const CONFIDENTIAL_USDC_ADDRESS' "$ROOT_DIR/packages/common/src/index.ts" | grep -oE '0x[0-9a-fA-F]{40}' | head -1)
CURRENT_PREDICTION_MARKET=$(grep -A1 'EXAMPLE_PREDICTION_MARKET_ADDRESS' "$ROOT_DIR/packages/common/src/index.ts" | grep -oE '0x[0-9a-fA-F]{40}' | head -1)
CURRENT_SECRET_MARKETPLACE=$(grep -A1 'SECRET_MARKETPLACE_ADDRESS' "$ROOT_DIR/packages/common/src/index.ts" | grep -oE '0x[0-9a-fA-F]{40}' | head -1)

# Also read from .env files — addresses there may differ from packages/common
# (stale from a previous deploy). We'll replace these too.
read_env_addr() {
  local FILE="$1" VAR="$2"
  if [ -f "$FILE" ]; then
    grep "^${VAR}=" "$FILE" 2>/dev/null | cut -d'=' -f2- || true
  fi
}
ALT_CONFIDENTIAL_USDC=$(read_env_addr "$ROOT_DIR/.env" "CONFIDENTIAL_USDC_ADDRESS")
ALT_PREDICTION_MARKET=$(read_env_addr "$ROOT_DIR/.env" "EXAMPLE_PREDICTION_MARKET_ADDRESS")
ALT_SECRET_MARKETPLACE=$(read_env_addr "$ROOT_DIR/.env" "SECRET_MARKETPLACE_ADDRESS")

# Read RPC_URL from contracts/.env
if [ -f "$CONTRACTS_DIR/.env" ]; then
  RPC_URL=$(grep '^RPC_URL=' "$CONTRACTS_DIR/.env" | cut -d'=' -f2-)
fi
: "${RPC_URL:?RPC_URL not found in contracts/.env}"

# Read ETHERSCAN_API_KEY from contracts/.env (optional — enables --verify)
ETHERSCAN_API_KEY=""
if [ -f "$CONTRACTS_DIR/.env" ]; then
  ETHERSCAN_API_KEY=$(grep '^ETHERSCAN_API_KEY=' "$CONTRACTS_DIR/.env" | cut -d'=' -f2- || true)
fi
if [ -z "$ETHERSCAN_API_KEY" ]; then
  echo -e "  ${YELLOW}ETHERSCAN_API_KEY not set in contracts/.env — contracts will NOT be verified on Etherscan${NC}"
fi

echo "═══════════════════════════════════════════════════════"
echo "  Deploy Contracts"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "  Current addresses (from packages/common/src/index.ts):"
echo "    ConfidentialUSDC:                  $CURRENT_CONFIDENTIAL_USDC"
echo "    ExamplePredictionMarket:  $CURRENT_PREDICTION_MARKET"
echo "    SecretMarketplace:        $CURRENT_SECRET_MARKETPLACE"
echo ""
echo "  RPC: $RPC_URL"

# ─── Ask which contracts to deploy (interactive only) ─────────────────────

if [ "$CLI_MODE" = false ]; then
  echo ""
  echo "  Which contracts do you want to redeploy?"
  echo ""

  read -rp "  Deploy ConfidentialUSDC? [y/N]: " ans
  [[ "$ans" =~ ^[Yy]$ ]] && DEPLOY_CONFIDENTIAL_USDC=true

  read -rp "  Deploy ExamplePredictionMarket? [y/N]: " ans
  [[ "$ans" =~ ^[Yy]$ ]] && DEPLOY_EXAMPLE_PREDICTION_MARKET=true

  read -rp "  Deploy SecretMarketplace? [y/N]: " ans
  [[ "$ans" =~ ^[Yy]$ ]] && DEPLOY_SECRET_MARKETPLACE=true
fi

if [ "$DEPLOY_CONFIDENTIAL_USDC" = false ] && [ "$DEPLOY_EXAMPLE_PREDICTION_MARKET" = false ] && [ "$DEPLOY_SECRET_MARKETPLACE" = false ]; then
  echo ""
  echo "  Nothing selected. Exiting."
  exit 0
fi

echo ""
echo "  Will deploy:"
[ "$DEPLOY_CONFIDENTIAL_USDC" = true ] && echo "    - ConfidentialUSDC"
[ "$DEPLOY_EXAMPLE_PREDICTION_MARKET" = true ] && echo "    - ExamplePredictionMarket"
[ "$DEPLOY_SECRET_MARKETPLACE" = true ] && echo "    - SecretMarketplace"

# ─── Verify contracts/.env has required vars ─────────────────────────────────

if [ "$DEPLOY_EXAMPLE_PREDICTION_MARKET" = true ] || [ "$DEPLOY_SECRET_MARKETPLACE" = true ]; then
  if ! grep -q '^CONFIDENTIAL_USDC_ADDRESS=' "$CONTRACTS_DIR/.env" 2>/dev/null; then
    if [ "$CLI_MODE" = true ]; then
      echo ""
      echo -e "  ${CYAN}Adding CONFIDENTIAL_USDC_ADDRESS=$CURRENT_CONFIDENTIAL_USDC to contracts/.env${NC}"
      echo "CONFIDENTIAL_USDC_ADDRESS=$CURRENT_CONFIDENTIAL_USDC" >> "$CONTRACTS_DIR/.env"
    else
      echo ""
      echo -e "  ${YELLOW}CONFIDENTIAL_USDC_ADDRESS not found in contracts/.env${NC}"
      echo "  ExamplePredictionMarket and SecretMarketplace need this."
      echo ""
      if [ "$DEPLOY_CONFIDENTIAL_USDC" = true ]; then
        echo "  It will be set automatically after ConfidentialUSDC is deployed."
      else
        echo "  Set it to the ConfidentialUSDC address: $CURRENT_CONFIDENTIAL_USDC"
        read -rp "  Add CONFIDENTIAL_USDC_ADDRESS=$CURRENT_CONFIDENTIAL_USDC to contracts/.env? [Y/n]: " ans
        if [[ ! "$ans" =~ ^[Nn]$ ]]; then
          echo "CONFIDENTIAL_USDC_ADDRESS=$CURRENT_CONFIDENTIAL_USDC" >> "$CONTRACTS_DIR/.env"
          echo "  Added."
        else
          echo "  Skipped. Deployment may fail without CONFIDENTIAL_USDC_ADDRESS."
        fi
      fi
    fi
  fi

  if ! grep -q '^CRE_FORWARDER_ADDRESS=' "$CONTRACTS_DIR/.env" 2>/dev/null; then
    CRE_FORWARDER="0x15fc6ae953e024d975e77382eeec56a9101f9f88"
    if [ "$CLI_MODE" = true ]; then
      echo -e "  ${CYAN}Adding CRE_FORWARDER_ADDRESS=$CRE_FORWARDER to contracts/.env${NC}"
      echo "CRE_FORWARDER_ADDRESS=$CRE_FORWARDER" >> "$CONTRACTS_DIR/.env"
    else
      echo ""
      echo -e "  ${YELLOW}CRE_FORWARDER_ADDRESS not found in contracts/.env${NC}"
      read -rp "  Add CRE_FORWARDER_ADDRESS=$CRE_FORWARDER to contracts/.env? [Y/n]: " ans
      if [[ ! "$ans" =~ ^[Nn]$ ]]; then
        echo "CRE_FORWARDER_ADDRESS=$CRE_FORWARDER" >> "$CONTRACTS_DIR/.env"
        echo "  Added."
      fi
    fi
  fi
fi

if [ "$DEPLOY_SECRET_MARKETPLACE" = true ] && [ "$DEPLOY_EXAMPLE_PREDICTION_MARKET" = false ]; then
  if ! grep -q '^EXAMPLE_PREDICTION_MARKET_ADDRESS=' "$CONTRACTS_DIR/.env" 2>/dev/null; then
    if [ "$CLI_MODE" = true ]; then
      echo -e "  ${CYAN}Adding EXAMPLE_PREDICTION_MARKET_ADDRESS=$CURRENT_PREDICTION_MARKET to contracts/.env${NC}"
      echo "EXAMPLE_PREDICTION_MARKET_ADDRESS=$CURRENT_PREDICTION_MARKET" >> "$CONTRACTS_DIR/.env"
    else
      echo ""
      echo -e "  ${YELLOW}EXAMPLE_PREDICTION_MARKET_ADDRESS not found in contracts/.env${NC}"
      read -rp "  Add EXAMPLE_PREDICTION_MARKET_ADDRESS=$CURRENT_PREDICTION_MARKET to contracts/.env? [Y/n]: " ans
      if [[ ! "$ans" =~ ^[Nn]$ ]]; then
        echo "EXAMPLE_PREDICTION_MARKET_ADDRESS=$CURRENT_PREDICTION_MARKET" >> "$CONTRACTS_DIR/.env"
        echo "  Added."
      fi
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

# Deploy ConfidentialUSDC
if [ "$DEPLOY_CONFIDENTIAL_USDC" = true ]; then
  NEW_USDC=$(deploy_contract "DeployConfidentialUSDC.s.sol:DeployConfidentialUSDC" "ConfidentialUSDC")

  # Update CONFIDENTIAL_USDC_ADDRESS in contracts/.env AND shell env for subsequent deploys
  if [ "$DEPLOY_EXAMPLE_PREDICTION_MARKET" = true ] || [ "$DEPLOY_SECRET_MARKETPLACE" = true ]; then
    if grep -q '^CONFIDENTIAL_USDC_ADDRESS=' "$CONTRACTS_DIR/.env" 2>/dev/null; then
      sed -i.bak "s|^CONFIDENTIAL_USDC_ADDRESS=.*|CONFIDENTIAL_USDC_ADDRESS=$NEW_USDC|" "$CONTRACTS_DIR/.env"
      rm -f "$CONTRACTS_DIR/.env.bak"
    else
      echo "CONFIDENTIAL_USDC_ADDRESS=$NEW_USDC" >> "$CONTRACTS_DIR/.env"
    fi
    export CONFIDENTIAL_USDC_ADDRESS="$NEW_USDC"
    echo "  Updated CONFIDENTIAL_USDC_ADDRESS in contracts/.env → $NEW_USDC"
  fi
fi

# Deploy ExamplePredictionMarket
if [ "$DEPLOY_EXAMPLE_PREDICTION_MARKET" = true ]; then
  NEW_MARKET=$(deploy_contract "DeployExamplePredictionMarket.s.sol:DeployExamplePredictionMarket" "ExamplePredictionMarket")

  # Update EXAMPLE_PREDICTION_MARKET_ADDRESS in contracts/.env AND shell env for SecretMarketplace deploy
  if [ "$DEPLOY_SECRET_MARKETPLACE" = true ]; then
    if grep -q '^EXAMPLE_PREDICTION_MARKET_ADDRESS=' "$CONTRACTS_DIR/.env" 2>/dev/null; then
      sed -i.bak "s|^EXAMPLE_PREDICTION_MARKET_ADDRESS=.*|EXAMPLE_PREDICTION_MARKET_ADDRESS=$NEW_MARKET|" "$CONTRACTS_DIR/.env"
      rm -f "$CONTRACTS_DIR/.env.bak"
    else
      echo "EXAMPLE_PREDICTION_MARKET_ADDRESS=$NEW_MARKET" >> "$CONTRACTS_DIR/.env"
    fi
    export EXAMPLE_PREDICTION_MARKET_ADDRESS="$NEW_MARKET"
    echo "  Updated EXAMPLE_PREDICTION_MARKET_ADDRESS in contracts/.env → $NEW_MARKET"
  fi
fi

# Deploy SecretMarketplace
if [ "$DEPLOY_SECRET_MARKETPLACE" = true ]; then
  NEW_MARKETPLACE=$(deploy_contract "DeploySecretMarketplace.s.sol:DeploySecretMarketplace" "SecretMarketplace")
fi

# ─── Replace addresses across the codebase ───────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Updating addresses across codebase..."
echo "═══════════════════════════════════════════════════════"

if [ -n "$NEW_USDC" ]; then
  replace_address "$CURRENT_CONFIDENTIAL_USDC" "$NEW_USDC" "ConfidentialUSDC"
  # Also replace the .env variant if it differs from the canonical address
  if [ -n "$ALT_CONFIDENTIAL_USDC" ] && [ "$ALT_CONFIDENTIAL_USDC" != "$CURRENT_CONFIDENTIAL_USDC" ]; then
    replace_address "$ALT_CONFIDENTIAL_USDC" "$NEW_USDC" "ConfidentialUSDC (.env variant)"
  fi
fi

if [ -n "$NEW_MARKET" ]; then
  replace_address "$CURRENT_PREDICTION_MARKET" "$NEW_MARKET" "ExamplePredictionMarket"
  if [ -n "$ALT_PREDICTION_MARKET" ] && [ "$ALT_PREDICTION_MARKET" != "$CURRENT_PREDICTION_MARKET" ]; then
    replace_address "$ALT_PREDICTION_MARKET" "$NEW_MARKET" "ExamplePredictionMarket (.env variant)"
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
EXPECTED_USDC="${NEW_USDC:-$CURRENT_CONFIDENTIAL_USDC}"
EXPECTED_MARKET="${NEW_MARKET:-$CURRENT_PREDICTION_MARKET}"
EXPECTED_MARKETPLACE="${NEW_MARKETPLACE:-$CURRENT_SECRET_MARKETPLACE}"

fix_env_address "$ROOT_DIR/.env" "CONFIDENTIAL_USDC_ADDRESS" "$EXPECTED_USDC" "ConfidentialUSDC"
fix_env_address "$ROOT_DIR/.env" "EXAMPLE_PREDICTION_MARKET_ADDRESS" "$EXPECTED_MARKET" "ExamplePredictionMarket"
fix_env_address "$ROOT_DIR/.env" "SECRET_MARKETPLACE_ADDRESS" "$EXPECTED_MARKETPLACE" "SecretMarketplace"
fix_env_address "$ROOT_DIR/scripts/.env" "CONFIDENTIAL_USDC_ADDRESS" "$EXPECTED_USDC" "ConfidentialUSDC"
fix_env_address "$ROOT_DIR/scripts/.env" "EXAMPLE_PREDICTION_MARKET_ADDRESS" "$EXPECTED_MARKET" "ExamplePredictionMarket"
fix_env_address "$ROOT_DIR/scripts/.env" "SECRET_MARKETPLACE_ADDRESS" "$EXPECTED_MARKETPLACE" "SecretMarketplace"

# ─── Summary ─────────────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Deployment Summary"
echo "═══════════════════════════════════════════════════════"

if [ -n "$NEW_USDC" ]; then
  echo -e "  ConfidentialUSDC:           ${GREEN}$NEW_USDC${NC}"
fi
if [ -n "$NEW_MARKET" ]; then
  echo -e "  ExamplePredictionMarket: ${GREEN}$NEW_MARKET${NC}"
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
