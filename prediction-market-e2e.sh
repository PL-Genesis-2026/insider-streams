#!/usr/bin/env bash
# prediction-market-e2e.sh — Full end-to-end prediction market test on Base Sepolia
# Follows the CRE prediction market demo flow:
#   1. Owner creates a market
#   2. Tester approves MockUSDC + makes prediction
#   3. Waits for market closure (3 minutes)
#   4. Owner requests settlement
#   5. CRE workflow simulation (dry run)
#   6. CRE workflow broadcast (on-chain settlement)
#   7. Verifies on-chain + Firestore results
#
# Usage: ./prediction-market-e2e.sh
# Requires: cast, cre CLI, curl, jq
# Reads config from: .env (root), cre-workflow/prediction-market-demo/config.json

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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

# Required vars
: "${OWNER_PK:?OWNER_PK not set in .env}"
: "${TESTER_PK:?TESTER_PK not set in .env}"
: "${RPC_URL:?RPC_URL not set in .env}"
: "${MOCK_USDC_ADDRESS:?MOCK_USDC_ADDRESS not set in .env}"
: "${MARKET_ADDRESS:?MARKET_ADDRESS not set in .env}"
: "${FIREBASE_API_KEY:?FIREBASE_API_KEY not set in .env}"
: "${FIREBASE_PROJECT_ID:?FIREBASE_PROJECT_ID not set in .env}"

MARKET="$MARKET_ADDRESS"
USDC="$MOCK_USDC_ADDRESS"
RPC="$RPC_URL"

QUESTION="${1:-The New York Yankees won the 2009 World Series.}"
PREDICTION_AMOUNT=1000000  # 1 USDC (6 decimals)

echo "═══════════════════════════════════════════════════════"
echo "  Prediction Market E2E Test"
echo "═══════════════════════════════════════════════════════"
echo "  Market:  $MARKET"
echo "  USDC:    $USDC"
echo "  RPC:     $RPC"
echo "  Question: $QUESTION"
echo "═══════════════════════════════════════════════════════"

# ─── Step 1: Owner creates a new market ─────────────────────────────────────
echo ""
echo "▶ Step 1: Creating market..."
TX_CREATE=$(cast send "$MARKET" "newMarket(string)" "$QUESTION" \
  --rpc-url "$RPC" --private-key "$OWNER_PK" --json 2>&1)

if echo "$TX_CREATE" | jq -e '.status == "0x1"' &>/dev/null; then
  echo "  ✓ Market created"
else
  echo "  ✗ Market creation failed"
  echo "$TX_CREATE"
  exit 1
fi

MARKET_ID_HEX=$(cast call "$MARKET" "nextMarketId()" --rpc-url "$RPC")
MARKET_ID=$((16#$(echo "$MARKET_ID_HEX" | sed 's/0x//')))
MARKET_ID=$((MARKET_ID - 1))
echo "  Market ID: $MARKET_ID"

# ─── Step 2: Tester approves USDC + predicts YES ───────────────────────────
echo ""
echo "▶ Step 2: Tester approving USDC and predicting YES..."
TX_APPROVE=$(cast send "$USDC" "approve(address,uint256)" "$MARKET" "$PREDICTION_AMOUNT" \
  --rpc-url "$RPC" --private-key "$TESTER_PK" --json 2>&1)

if echo "$TX_APPROVE" | jq -e '.status == "0x1"' &>/dev/null; then
  echo "  ✓ USDC approved"
else
  echo "  ✗ USDC approval failed"
  echo "$TX_APPROVE"
  exit 1
fi

# outcome=2 (YES)
TX_PREDICT=$(cast send "$MARKET" "makePrediction(uint256,uint8,uint256)" "$MARKET_ID" 2 "$PREDICTION_AMOUNT" \
  --rpc-url "$RPC" --private-key "$TESTER_PK" --json 2>&1)

if echo "$TX_PREDICT" | jq -e '.status == "0x1"' &>/dev/null; then
  echo "  ✓ Prediction made (YES, $PREDICTION_AMOUNT units)"
else
  echo "  ✗ Prediction failed"
  echo "$TX_PREDICT"
  exit 1
fi

# ─── Step 3: Wait for market closure ───────────────────────────────────────
echo ""
echo "▶ Step 3: Waiting for market closure (3 minutes + 15s buffer)..."
CLOSE_HEX=$(cast call "$MARKET" "getMarket(uint256)" "$MARKET_ID" --rpc-url "$RPC" | cut -c195-258)
CLOSE_TS=$((16#$(echo "$CLOSE_HEX" | sed 's/^0*//')))
NOW=$(date +%s)
WAIT=$((CLOSE_TS - NOW + 15))
if [ "$WAIT" -gt 0 ]; then
  echo "  Waiting ${WAIT}s (market closes at $CLOSE_TS, now $NOW)..."
  sleep "$WAIT"
else
  echo "  Market already closed"
fi

# ─── Step 4: Owner requests settlement ─────────────────────────────────────
echo ""
echo "▶ Step 4: Requesting settlement..."
TX_SETTLE=$(cast send "$MARKET" "requestSettlement(uint256)" "$MARKET_ID" \
  --rpc-url "$RPC" --private-key "$OWNER_PK" --json 2>&1)

if echo "$TX_SETTLE" | jq -e '.status == "0x1"' &>/dev/null; then
  SETTLE_HASH=$(echo "$TX_SETTLE" | jq -r '.transactionHash')
  echo "  ✓ Settlement requested: $SETTLE_HASH"
else
  echo "  ✗ Settlement request failed"
  echo "$TX_SETTLE"
  exit 1
fi

# ─── Step 5: CRE workflow simulation (dry run) ─────────────────────────────
echo ""
echo "▶ Step 5: Running CRE workflow simulation..."
cd "$SCRIPT_DIR/cre-workflow"
SIM_OUTPUT=$("$CRE" workflow simulate prediction-market-demo \
  --target local-simulation \
  --evm-tx-hash "$SETTLE_HASH" \
  --evm-event-index 0 \
  --non-interactive \
  --trigger-index 0 2>&1) || true

if echo "$SIM_OUTPUT" | grep -q "Settlement Request Processed"; then
  echo "  ✓ Simulation succeeded"
  echo "$SIM_OUTPUT" | grep "Gemini Response"
else
  echo "  ✗ Simulation failed"
  echo "$SIM_OUTPUT"
  exit 1
fi

# ─── Step 6: CRE workflow broadcast (on-chain) ─────────────────────────────
echo ""
echo "▶ Step 6: Running CRE workflow with broadcast..."
BROADCAST_OUTPUT=$("$CRE" workflow simulate prediction-market-demo \
  --target local-simulation \
  --evm-tx-hash "$SETTLE_HASH" \
  --evm-event-index 0 \
  --non-interactive \
  --trigger-index 0 \
  --broadcast 2>&1) || true

if echo "$BROADCAST_OUTPUT" | grep -q "Settlement Request Processed"; then
  SETTLE_TX=$(echo "$BROADCAST_OUTPUT" | grep "Settlement tx hash:" | awk '{print $NF}')
  echo "  ✓ Broadcast succeeded, settlement tx: $SETTLE_TX"
else
  echo "  ✗ Broadcast failed"
  echo "$BROADCAST_OUTPUT"
  exit 1
fi

cd "$SCRIPT_DIR"

# ─── Step 7: Verify on-chain + Firestore ───────────────────────────────────
echo ""
echo "▶ Step 7: Verifying results..."

# 7a: On-chain — check market status
MARKET_DATA=$(cast call "$MARKET" "getMarket(uint256)" "$MARKET_ID" --rpc-url "$RPC")
# Status is at offset 3 (4th 32-byte word): 0=Open, 1=SettlementRequested, 2=Settled, 3=NeedsManual
STATUS_HEX=$(echo "$MARKET_DATA" | cut -c259-322)
STATUS=$((16#0$(echo "$STATUS_HEX" | sed 's/^0*//')))

if [ "$STATUS" -eq 2 ]; then
  echo "  ✓ On-chain: Market $MARKET_ID is Settled (status=2)"
else
  echo "  ✗ On-chain: Market $MARKET_ID has unexpected status=$STATUS (expected 2=Settled)"
  exit 1
fi

# 7b: Firestore — check settlement document exists
FIRESTORE_RESPONSE_ID=$(echo "$BROADCAST_OUTPUT" | grep "Firestore Document:" | awk -F'/' '{print $NF}')
if [ -n "$FIRESTORE_RESPONSE_ID" ]; then
  FIRESTORE_DOC=$(curl -s "https://firestore.googleapis.com/v1/projects/$FIREBASE_PROJECT_ID/databases/(default)/documents/demo/$FIRESTORE_RESPONSE_ID")

  if echo "$FIRESTORE_DOC" | jq -e '.fields.question.stringValue' &>/dev/null; then
    FS_QUESTION=$(echo "$FIRESTORE_DOC" | jq -r '.fields.question.stringValue')
    FS_RESULT=$(echo "$FIRESTORE_DOC" | jq -r '.fields.geminiResponse.stringValue')
    echo "  ✓ Firestore: Document found"
    echo "    Question: $FS_QUESTION"
    echo "    AI Result: $FS_RESULT"
  else
    echo "  ✗ Firestore: Document missing or malformed"
    echo "$FIRESTORE_DOC"
    exit 1
  fi
else
  echo "  ⚠ Could not extract Firestore response ID from broadcast output"
fi

# ─── Summary ────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════"
echo "  ✓ PASS — Full E2E prediction market test completed"
echo "═══════════════════════════════════════════════════════"
echo "  Market ID:     $MARKET_ID"
echo "  Question:      $QUESTION"
echo "  Settlement TX: $SETTLE_TX"
echo "  On-chain:      Settled"
echo "  Firestore:     Verified"
echo "═══════════════════════════════════════════════════════"
