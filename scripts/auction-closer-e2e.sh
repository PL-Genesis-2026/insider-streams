#!/usr/bin/env bash
# auction-closer-e2e.sh — Full E2E auction-closer workflow test on Eth Sepolia
# Flow:
#   1. Owner creates an auction (short duration for testing)
#   2. Tester approves MockUSDC + places bid
#   3. Waits for auction to expire
#   4. CRE workflow simulation (dry run) — detects expired auction
#   5. CRE workflow broadcast — closes auction on-chain
#   6. Verifies auction is closed on-chain
#
# NOTE: Update these defaults when new contracts are deployed.
#
# Usage: ./scripts/auction-closer-e2e.sh
# Requires: cast, cre CLI, jq

set -euo pipefail

# Root of the project (one level up from scripts/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ─── Load environment ───────────────────────────────────────────────────────
if [[ ! -f "$SCRIPT_DIR/.env" ]]; then
  echo "ERROR: .env not found at $SCRIPT_DIR/.env"
  exit 1
fi
set -a
source "$SCRIPT_DIR/.env"
set +a

# CRE CLI path
CRE="${CRE_BIN:-$HOME/.cre/bin/cre}"
if ! command -v "$CRE" &>/dev/null; then
  echo "ERROR: cre CLI not found at $CRE"
  exit 1
fi

# Required vars (no defaults — keys and RPC must be explicit)
: "${OWNER_PK:?OWNER_PK not set in .env}"
: "${TESTER_PK:?TESTER_PK not set in .env}"
: "${RPC_URL:?RPC_URL not set in .env}"

# Contract addresses — update defaults when redeployed
MOCK_USDC_ADDRESS="${MOCK_USDC_ADDRESS:-0xA75c910D441C99bA651a70451D3bE1d690c1DD85}"
SECRET_MARKETPLACE_ADDRESS="${SECRET_MARKETPLACE_ADDRESS:-0x197D1150858Ce0c125B69E02D80790D7e7b017f1}"

BID_AMOUNT=2000000        # 2 USDC (6 decimals)
AUCTION_DURATION=120      # 2 minutes (short for testing)
SELLER_NAME="TestSeller"

# Helper: parse field N from a cast tuple like "(addr, 0, 1000000 [1e6], ...)"
parse_tuple_field() {
  echo "$1" | sed 's/[()]//g' | awk -F', ' "{print \$$2}" | awk '{print $1}'
}

echo "═══════════════════════════════════════════════════════"
echo "  Auction Closer E2E Test"
echo "═══════════════════════════════════════════════════════"
echo "  SecretMarketplace: $SECRET_MARKETPLACE_ADDRESS"
echo "  MockUSDC:          $MOCK_USDC_ADDRESS"
echo "  RPC:               $RPC_URL"
echo "═══════════════════════════════════════════════════════"

# ─── Step 0: Mint USDC for tester if needed ──────────────────────────────────
echo ""
echo "▶ Step 0: Ensuring tester has USDC..."
TESTER_ADDR=$(cast wallet address "$TESTER_PK")
TESTER_BALANCE=$(cast call "$MOCK_USDC_ADDRESS" "balanceOf(address)(uint256)" "$TESTER_ADDR" --rpc-url "$RPC_URL")
echo "  Tester ($TESTER_ADDR) USDC balance: $TESTER_BALANCE"

if [ "$TESTER_BALANCE" -lt "$BID_AMOUNT" ]; then
  echo "  Minting USDC for tester..."
  cast send "$MOCK_USDC_ADDRESS" "mint(address,uint256)" "$TESTER_ADDR" 10000000 \
    --rpc-url "$RPC_URL" --private-key "$OWNER_PK" --json | jq -r '"  Mint tx: " + .transactionHash'
fi

# ─── Step 1: Owner creates a new auction ──────────────────────────────────────
echo ""
echo "▶ Step 1: Creating auction (duration=${AUCTION_DURATION}s)..."

# Approve USDC for SecretMarketplace from owner (admin places all bids)
cast send "$MOCK_USDC_ADDRESS" "approve(address,uint256)" "$SECRET_MARKETPLACE_ADDRESS" "$BID_AMOUNT" \
  --rpc-url "$RPC_URL" --private-key "$OWNER_PK" --json | jq -r '"  Owner USDC approval tx: " + .transactionHash'

# First create a market on ExamplePredictionMarket (needed for createAuction validation)
SIMPLE_MARKET_ADDRESS=$(cast call "$SECRET_MARKETPLACE_ADDRESS" "simpleMarket()" --rpc-url "$RPC_URL" | cast --to-address)
echo "  ExamplePredictionMarket: $SIMPLE_MARKET_ADDRESS"

# Approve + create market (requires 10 USDC initial liquidity)
cast send "$MOCK_USDC_ADDRESS" "approve(address,uint256)" "$SIMPLE_MARKET_ADDRESS" 10000000 \
  --rpc-url "$RPC_URL" --private-key "$OWNER_PK" --json | jq -r '"  Owner USDC approval for market tx: " + .transactionHash'
cast send "$SIMPLE_MARKET_ADDRESS" "newMarket(string)" "Test auction market" \
  --rpc-url "$RPC_URL" --private-key "$OWNER_PK" --json | jq -r '"  Market created tx: " + .transactionHash'

MARKET_ID_HEX=$(cast call "$SIMPLE_MARKET_ADDRESS" "nextMarketId()" --rpc-url "$RPC_URL")
MARKET_ID=$((16#$(echo "$MARKET_ID_HEX" | sed 's/0x//') - 1))
echo "  Market ID: $MARKET_ID"

# createAuction(string seller, uint256 eventId, string eventTitle, uint256 endTime)
END_TIME=$(( $(date +%s) + AUCTION_DURATION ))
TX_CREATE=$(cast send "$SECRET_MARKETPLACE_ADDRESS" \
  "createAuction(string,uint256,string,uint256)" "$SELLER_NAME" "$MARKET_ID" "Test auction market" "$END_TIME" \
  --rpc-url "$RPC_URL" --private-key "$OWNER_PK" --json 2>&1)

if echo "$TX_CREATE" | jq -e '.status == "0x1"' &>/dev/null; then
  CREATE_HASH=$(echo "$TX_CREATE" | jq -r '.transactionHash')
  echo "  Auction created: $CREATE_HASH"
else
  echo "  Auction creation failed"
  echo "$TX_CREATE"
  exit 1
fi

# Get the auction ID (nextAuctionId - 1)
NEXT_ID_HEX=$(cast call "$SECRET_MARKETPLACE_ADDRESS" "nextAuctionId()" --rpc-url "$RPC_URL")
NEXT_ID=$((16#$(echo "$NEXT_ID_HEX" | sed 's/0x//')))
AUCTION_ID=$((NEXT_ID - 1))
echo "  Auction ID: $AUCTION_ID"

# Verify it's in open auctions
OPEN=$(cast call "$SECRET_MARKETPLACE_ADDRESS" "getOpenAuctions()(uint256[])" --rpc-url "$RPC_URL")
echo "  Open auctions: $OPEN"

# ─── Step 2: Tester places a bid ─────────────────────────────────────────────
echo ""
echo "▶ Step 2: Admin placing bid of $BID_AMOUNT..."
TX_BID=$(cast send "$SECRET_MARKETPLACE_ADDRESS" \
  "placeBid(uint256,uint256)" "$AUCTION_ID" "$BID_AMOUNT" \
  --rpc-url "$RPC_URL" --private-key "$OWNER_PK" --json 2>&1)

if echo "$TX_BID" | jq -e '.status == "0x1"' &>/dev/null; then
  BID_HASH=$(echo "$TX_BID" | jq -r '.transactionHash')
  echo "  Bid placed: $BID_HASH"
else
  echo "  Bid failed"
  echo "$TX_BID"
  exit 1
fi

# ─── Step 3: Wait for auction to expire ───────────────────────────────────────
echo ""
echo "▶ Step 3: Waiting for auction to expire..."

# We know the end time since we set it ourselves
NOW=$(date +%s)
WAIT=$((END_TIME - NOW + 15))
if [ "$WAIT" -gt 0 ]; then
  echo "  Waiting ${WAIT}s (endTime=$END_TIME, now=$NOW)..."
  sleep "$WAIT"
else
  echo "  Auction already expired"
fi

# ─── Step 4: CRE workflow simulation (dry run) ───────────────────────────────
echo ""
echo "▶ Step 4: Running CRE auction-closer simulation (dry run)..."
cd "$SCRIPT_DIR/cre-workflows"
SIM_OUTPUT=$("$CRE" workflow simulate auction-closer \
  --target local-simulation \
  --non-interactive \
  --trigger-index 0 2>&1) || true

if echo "$SIM_OUTPUT" | grep -q "expired"; then
  echo "  Simulation detected expired auction"
  echo "$SIM_OUTPUT" | grep "\[USER LOG\]"
else
  echo "  Simulation output:"
  echo "$SIM_OUTPUT"
fi

# ─── Step 5: CRE workflow broadcast (close on-chain) ─────────────────────────
echo ""
echo "▶ Step 5: Running CRE auction-closer with broadcast..."
BROADCAST_OUTPUT=$("$CRE" workflow simulate auction-closer \
  --target local-simulation \
  --non-interactive \
  --trigger-index 0 \
  --broadcast 2>&1) || true

if echo "$BROADCAST_OUTPUT" | grep -q "closed"; then
  CLOSE_TX=$(echo "$BROADCAST_OUTPUT" | grep -oP 'tx=0x[a-f0-9]+' | head -1 | sed 's/tx=//')
  echo "  Auction closed on-chain: $CLOSE_TX"
else
  echo "  Broadcast output:"
  echo "$BROADCAST_OUTPUT"
  exit 1
fi

cd "$SCRIPT_DIR"

# ─── Step 6: Verify on-chain ─────────────────────────────────────────────────
echo ""
echo "▶ Step 6: Verifying auction is closed on-chain..."

# Check that auction is no longer in the open list (means it was closed)
OPEN_CHECK=$(cast call "$SECRET_MARKETPLACE_ADDRESS" "getOpenAuctions()(uint256[])" --rpc-url "$RPC_URL")
if echo "$OPEN_CHECK" | grep -q "$AUCTION_ID"; then
  echo "  Auction $AUCTION_ID is still open — close failed"
  exit 1
else
  echo "  Auction $AUCTION_ID is no longer in open list (closed successfully)"
fi

# Verify it's no longer in open auctions
OPEN_AFTER=$(cast call "$SECRET_MARKETPLACE_ADDRESS" "getOpenAuctions()(uint256[])" --rpc-url "$RPC_URL")
echo "  Open auctions after close: $OPEN_AFTER"

# ─── Summary ────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════"
echo "  PASS — Full E2E auction-closer test completed"
echo "═══════════════════════════════════════════════════════"
echo "  Auction ID:    $AUCTION_ID"
echo "  Bid Amount:    $BID_AMOUNT"
echo "  Close TX:      $CLOSE_TX"
echo "  On-chain:      Closed"
echo "═══════════════════════════════════════════════════════"
