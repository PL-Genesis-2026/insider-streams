#!/usr/bin/env bash
#
# run-demo.sh — Orchestrates the three demo-population scripts.
#
# Order of operations:
#   1. create-events  — runs once at startup to seed prediction market events
#   2. spawn-auctions — long-running daemon, creates one auction per cycle
#   3. place-bids     — long-running daemon, places one bid per cycle
#   4. create-events  — re-runs on a background loop to add fresh events
#
# Usage (from scripts/):
#   pnpm run-demo
#
# Optional env overrides (in scripts/.env or environment):
#   INTERVAL_MS                — spawn-auctions / place-bids cycle interval (default: 300000 / 5 min)
#   CREATE_EVENTS_INTERVAL_MS  — how often to re-run create-events (default: 1800000 / 30 min)
#   BASE_URL                   — frontend origin (default: http://localhost:3000)

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

CREATE_EVENTS_INTERVAL_S=$(( ${CREATE_EVENTS_INTERVAL_MS:-1800000} / 1000 ))
PLACE_BIDS_INTERVAL_S=$(( ${INTERVAL_MS:-300000} / 1000 ))

SPAWN_PID=""
BIDS_PID=""
REFRESH_PID=""

cleanup() {
  echo ""
  echo "[run-demo] shutting down all demo processes..."
  [ -n "$SPAWN_PID"   ] && kill "$SPAWN_PID"   2>/dev/null || true
  [ -n "$BIDS_PID"    ] && kill "$BIDS_PID"    2>/dev/null || true
  [ -n "$REFRESH_PID" ] && kill "$REFRESH_PID" 2>/dev/null || true
  exit 0
}

trap cleanup INT TERM

echo "[run-demo] =================================================="
echo "[run-demo]  Insider Streams — Demo Orchestrator"
echo "[run-demo] =================================================="
echo "[run-demo]  create-events:  once at startup, then every ${CREATE_EVENTS_INTERVAL_S}s"
echo "[run-demo]  spawn-auctions: via cron (run-demo loops it every ${PLACE_BIDS_INTERVAL_S}s)"
echo "[run-demo]  place-bids:     every ${PLACE_BIDS_INTERVAL_S}s"
echo "[run-demo]  base URL:       ${BASE_URL:-http://localhost:3000}"
echo ""

# ── 1. Seed prediction market events ─────────────────────────────────────────
echo "[run-demo] Running create-events (initial seed)..."
pnpm run create-events || echo "[run-demo] create-events exited non-zero — continuing"
echo ""

# ── 2. Start background loops ─────────────────────────────────────────────────
(
  while true; do
    pnpm run spawn-auctions || echo "[run-demo] spawn-auctions failed — continuing"
    sleep "$PLACE_BIDS_INTERVAL_S"
  done
) &
SPAWN_PID=$!
echo "[run-demo] spawn-auctions loop started (PID $SPAWN_PID)"

(
  while true; do
    pnpm run place-bids || echo "[run-demo] place-bids failed — continuing"
    sleep "$PLACE_BIDS_INTERVAL_S"
  done
) &
BIDS_PID=$!
echo "[run-demo] place-bids loop started (PID $BIDS_PID)"

# ── 3. Periodic create-events refresh ─────────────────────────────────────────
(
  while true; do
    sleep "$CREATE_EVENTS_INTERVAL_S"
    echo "[run-demo] Running create-events (scheduled refresh)..."
    pnpm run create-events || echo "[run-demo] create-events refresh failed — continuing"
  done
) &
REFRESH_PID=$!
echo "[run-demo] create-events refresh loop started (PID $REFRESH_PID)"

echo ""
echo "[run-demo] All processes running. Press Ctrl+C to stop all."
echo ""

wait "$SPAWN_PID" "$BIDS_PID" "$REFRESH_PID"
