#!/usr/bin/env bash
# deploy-contracts.sh — Deploy FHE contracts via Hardhat and update addresses
#
# Deploys selected contracts via hardhat-deploy, then does a best-effort
# find-and-replace of old addresses across the codebase.
#
# Usage:
#   ./scripts/deploy-contracts.sh                  # interactive — prompts for each contract
#   ./scripts/deploy-contracts.sh --all             # non-interactive — deploy all 4 contracts
#   ./scripts/deploy-contracts.sh --marketplace     # non-interactive — deploy FHESecretMarketplace only
#
# Flags:
#   --mock-usdc         Deploy MockUSDC
#   --confidential-usdc Deploy FHEConfidentialUSDC
#   --prediction-market Deploy ExamplePredictionMarket
#   --marketplace       Deploy FHESecretMarketplace
#   --all               Deploy all four contracts
#
# Requires:
#   - contracts-fhe/.env with PRIVATE_KEY and RPC_URL

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS_DIR="$ROOT_DIR/contracts-fhe"

# ─── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ─── Parse CLI flags ─────────────────────────────────────────────────────────

CLI_MODE=false
DEPLOY_MOCK_USDC=false
DEPLOY_CONFIDENTIAL_USDC=false
DEPLOY_EXAMPLE_PREDICTION_MARKET=false
DEPLOY_SECRET_MARKETPLACE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mock-usdc)
      DEPLOY_MOCK_USDC=true
      CLI_MODE=true
      shift
      ;;
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
    --marketplace)
      DEPLOY_SECRET_MARKETPLACE=true
      CLI_MODE=true
      shift
      ;;
    --all)
      DEPLOY_MOCK_USDC=true
      DEPLOY_CONFIDENTIAL_USDC=true
      DEPLOY_EXAMPLE_PREDICTION_MARKET=true
      DEPLOY_SECRET_MARKETPLACE=true
      CLI_MODE=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [--mock-usdc] [--confidential-usdc] [--prediction-market] [--marketplace] [--all]"
      echo ""
      echo "  No flags               — interactive mode (prompts for each contract)"
      echo "  --mock-usdc            Deploy MockUSDC"
      echo "  --confidential-usdc    Deploy FHEConfidentialUSDC"
      echo "  --prediction-market    Deploy ExamplePredictionMarket"
      echo "  --marketplace          Deploy FHESecretMarketplace"
      echo "  --all                  Deploy all four contracts"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown flag: $1${NC}"
      echo "Usage: $0 [--mock-usdc] [--confidential-usdc] [--prediction-market] [--marketplace] [--all]"
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

  while IFS= read -r file; do
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
    ! -path '*/artifacts/*' \
    ! -path '*/deployments/*' \
    ! -name 'pnpm-lock.yaml' \
    ! -name '*.lock' \
    2>/dev/null)

  if [ $COUNT -eq 0 ]; then
    echo -e "    ${YELLOW}No files contained the old address.${NC}"
  else
    echo -e "    ${GREEN}Updated $COUNT file(s).${NC}"
  fi
}

# Deploy a contract tag via hardhat-deploy and return the new address.
# Address is extracted from the deployment artifact JSON.
deploy_contract() {
  local TAG="$1"
  local CONTRACT_NAME="$2"

  echo "" >&2
  echo -e "  ${CYAN}Deploying $CONTRACT_NAME (tag: $TAG)...${NC}" >&2

  local OUTPUT
  OUTPUT=$(cd "$CONTRACTS_DIR" && npx hardhat deploy --network sepolia --tags "$TAG" 2>&1) || {
    echo -e "  ${RED}ERROR: Deployment failed for $CONTRACT_NAME${NC}" >&2
    echo "$OUTPUT" | tail -20 >&2
    return 1
  }

  echo "$OUTPUT" >&2

  # Extract address from the deployment artifact
  local ARTIFACT="$CONTRACTS_DIR/deployments/sepolia/${CONTRACT_NAME}.json"
  if [ ! -f "$ARTIFACT" ]; then
    echo -e "  ${RED}ERROR: Deployment artifact not found at $ARTIFACT${NC}" >&2
    return 1
  fi

  local NEW_ADDR
  NEW_ADDR=$(jq -r '.address' "$ARTIFACT")

  if [ -z "$NEW_ADDR" ] || [[ ! "$NEW_ADDR" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
    echo -e "  ${RED}ERROR: Could not parse address from artifact${NC}" >&2
    return 1
  fi

  echo -e "  ${GREEN}$CONTRACT_NAME deployed at: $NEW_ADDR${NC}" >&2
  echo "$NEW_ADDR"
}

# Update an env var in a file.
fix_env_address() {
  local ENV_FILE="$1"
  local VAR_NAME="$2"
  local EXPECTED="$3"

  if [ ! -f "$ENV_FILE" ]; then
    return
  fi

  local DISPLAY_PATH="${ENV_FILE#$ROOT_DIR/}"
  local CURRENT
  CURRENT=$(grep "^${VAR_NAME}=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2- || true)
  if [ -n "$CURRENT" ] && [ "$CURRENT" != "$EXPECTED" ]; then
    sed -i.bak "s|^${VAR_NAME}=.*|${VAR_NAME}=${EXPECTED}|" "$ENV_FILE"
    rm -f "${ENV_FILE}.bak"
    echo -e "  ${GREEN}Fixed:${NC} $DISPLAY_PATH  ${VAR_NAME}=${EXPECTED}"
  fi
}

# ─── Read current addresses ─────────────────────────────────────────────────

CURRENT_MOCK_USDC=$(grep -A1 'MOCK_USDC_ADDRESS' "$ROOT_DIR/packages/common/src/consts.ts" | grep -oE '0x[0-9a-fA-F]{40}' | head -1)
CURRENT_CONFIDENTIAL_USDC=$(grep -A1 'CONFIDENTIAL_USDC_ADDRESS' "$ROOT_DIR/packages/common/src/consts.ts" | grep -oE '0x[0-9a-fA-F]{40}' | head -1)
CURRENT_PREDICTION_MARKET=$(grep -A1 'EXAMPLE_PREDICTION_MARKET_ADDRESS' "$ROOT_DIR/packages/common/src/consts.ts" | grep -oE '0x[0-9a-fA-F]{40}' | head -1)
CURRENT_SECRET_MARKETPLACE=$(grep -A1 'SECRET_MARKETPLACE_ADDRESS' "$ROOT_DIR/packages/common/src/consts.ts" | grep -oE '0x[0-9a-fA-F]{40}' | head -1)

echo "═══════════════════════════════════════════════════════"
echo "  Deploy Contracts (Hardhat)"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "  Current addresses (from packages/common/src/consts.ts):"
echo "    MockUSDC:                  $CURRENT_MOCK_USDC"
echo "    FHEConfidentialUSDC:       $CURRENT_CONFIDENTIAL_USDC"
echo "    ExamplePredictionMarket:   $CURRENT_PREDICTION_MARKET"
echo "    FHESecretMarketplace:      $CURRENT_SECRET_MARKETPLACE"

# ─── Ask which contracts to deploy (interactive only) ─────────────────────

if [ "$CLI_MODE" = false ]; then
  echo ""
  echo "  Which contracts do you want to redeploy?"
  echo ""

  read -rp "  Deploy MockUSDC? [y/N]: " ans
  [[ "$ans" =~ ^[Yy]$ ]] && DEPLOY_MOCK_USDC=true

  read -rp "  Deploy FHEConfidentialUSDC? [y/N]: " ans
  [[ "$ans" =~ ^[Yy]$ ]] && DEPLOY_CONFIDENTIAL_USDC=true

  read -rp "  Deploy ExamplePredictionMarket? [y/N]: " ans
  [[ "$ans" =~ ^[Yy]$ ]] && DEPLOY_EXAMPLE_PREDICTION_MARKET=true

  read -rp "  Deploy FHESecretMarketplace? [y/N]: " ans
  [[ "$ans" =~ ^[Yy]$ ]] && DEPLOY_SECRET_MARKETPLACE=true
fi

if [ "$DEPLOY_MOCK_USDC" = false ] && [ "$DEPLOY_CONFIDENTIAL_USDC" = false ] && [ "$DEPLOY_EXAMPLE_PREDICTION_MARKET" = false ] && [ "$DEPLOY_SECRET_MARKETPLACE" = false ]; then
  echo ""
  echo "  Nothing selected. Exiting."
  exit 0
fi

echo ""
echo "  Will deploy:"
[ "$DEPLOY_MOCK_USDC" = true ] && echo "    - MockUSDC"
[ "$DEPLOY_CONFIDENTIAL_USDC" = true ] && echo "    - FHEConfidentialUSDC"
[ "$DEPLOY_EXAMPLE_PREDICTION_MARKET" = true ] && echo "    - ExamplePredictionMarket"
[ "$DEPLOY_SECRET_MARKETPLACE" = true ] && echo "    - FHESecretMarketplace"

# ─── Deploy ──────────────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Deploying..."
echo "═══════════════════════════════════════════════════════"

NEW_MOCK_USDC=""
NEW_USDC=""
NEW_MARKET=""
NEW_MARKETPLACE=""

# hardhat-deploy handles dependency ordering via tags, but we deploy
# individually so we can track which addresses changed.

if [ "$DEPLOY_MOCK_USDC" = true ]; then
  NEW_MOCK_USDC=$(deploy_contract "MockUSDC" "MockUSDC")
fi

if [ "$DEPLOY_CONFIDENTIAL_USDC" = true ]; then
  NEW_USDC=$(deploy_contract "FHEConfidentialUSDC" "FHEConfidentialUSDC")
fi

if [ "$DEPLOY_EXAMPLE_PREDICTION_MARKET" = true ]; then
  NEW_MARKET=$(deploy_contract "ExamplePredictionMarket" "ExamplePredictionMarket")
fi

if [ "$DEPLOY_SECRET_MARKETPLACE" = true ]; then
  NEW_MARKETPLACE=$(deploy_contract "FHESecretMarketplace" "FHESecretMarketplace")
fi

# ─── Replace addresses across the codebase ───────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Updating addresses across codebase..."
echo "═══════════════════════════════════════════════════════"

if [ -n "$NEW_MOCK_USDC" ]; then
  replace_address "$CURRENT_MOCK_USDC" "$NEW_MOCK_USDC" "MockUSDC"
fi

if [ -n "$NEW_USDC" ]; then
  replace_address "$CURRENT_CONFIDENTIAL_USDC" "$NEW_USDC" "FHEConfidentialUSDC"
fi

if [ -n "$NEW_MARKET" ]; then
  replace_address "$CURRENT_PREDICTION_MARKET" "$NEW_MARKET" "ExamplePredictionMarket"
fi

if [ -n "$NEW_MARKETPLACE" ]; then
  replace_address "$CURRENT_SECRET_MARKETPLACE" "$NEW_MARKETPLACE" "FHESecretMarketplace"
fi

# ─── Fix stale addresses in .env files ───────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Fixing stale .env addresses..."
echo "═══════════════════════════════════════════════════════"

EXPECTED_MOCK_USDC="${NEW_MOCK_USDC:-$CURRENT_MOCK_USDC}"
EXPECTED_USDC="${NEW_USDC:-$CURRENT_CONFIDENTIAL_USDC}"
EXPECTED_MARKET="${NEW_MARKET:-$CURRENT_PREDICTION_MARKET}"
EXPECTED_MARKETPLACE="${NEW_MARKETPLACE:-$CURRENT_SECRET_MARKETPLACE}"

for ENV_FILE in "$ROOT_DIR/.env" "$ROOT_DIR/scripts/.env" "$ROOT_DIR/apps/daemon/.env"; do
  fix_env_address "$ENV_FILE" "MOCK_USDC_ADDRESS" "$EXPECTED_MOCK_USDC"
  fix_env_address "$ENV_FILE" "CONFIDENTIAL_USDC_ADDRESS" "$EXPECTED_USDC"
  fix_env_address "$ENV_FILE" "EXAMPLE_PREDICTION_MARKET_ADDRESS" "$EXPECTED_MARKET"
  fix_env_address "$ENV_FILE" "SECRET_MARKETPLACE_ADDRESS" "$EXPECTED_MARKETPLACE"
done

# ─── Summary ─────────────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Deployment Summary"
echo "═══════════════════════════════════════════════════════"

[ -n "$NEW_MOCK_USDC" ] && echo -e "  MockUSDC:                ${GREEN}$NEW_MOCK_USDC${NC}"
[ -n "$NEW_USDC" ] && echo -e "  FHEConfidentialUSDC:     ${GREEN}$NEW_USDC${NC}"
[ -n "$NEW_MARKET" ] && echo -e "  ExamplePredictionMarket: ${GREEN}$NEW_MARKET${NC}"
[ -n "$NEW_MARKETPLACE" ] && echo -e "  FHESecretMarketplace:    ${GREEN}$NEW_MARKETPLACE${NC}"

echo ""
echo "  Next steps:"
echo "    1. Run: cd packages/common && pnpm wagmi  (regenerate ABI types)"
echo "    2. Run: pnpm build  (verify everything compiles)"
echo "    3. If FHESecretMarketplace changed, deploy the subgraph:"
echo "       ./scripts/deploy-subgraph.sh --address <NEW_ADDRESS>"
echo "═══════════════════════════════════════════════════════"
