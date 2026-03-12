#!/usr/bin/env bash
#
# run-demo.sh — Orchestrates demo-population scripts.
#
# Order of operations:
#   1. create-events          — runs once at startup to seed prediction market events
#   2. spawn-auctions         — background loop, creates one auction per cycle
#   3. place-bids             — background loop, places bids on open auctions
#   4. request-settlements    — background loop, requests settlement for closed events
#   5. create-events          — re-runs on a background loop to add fresh events
#
# Usage (from scripts/):
#   pnpm run-demo
#
# Optional env overrides (in scripts/.env or environment):
#   INTERVAL_MS                      — spawn-auctions cycle interval (default: 300000 / 5 min)
#   CREATE_EVENTS_INTERVAL_MS        — how often to re-run create-events (default: 1800000 / 30 min)
#   REQUEST_SETTLEMENTS_INTERVAL_MS  — how often to request settlements (default: 120000 / 2 min)
#   BASE_URL                         — frontend origin (default: http://localhost:3000)

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

CREATE_EVENTS_INTERVAL_S=$(( ${CREATE_EVENTS_INTERVAL_MS:-1800000} / 1000 ))
SPAWN_INTERVAL_S=$(( ${INTERVAL_MS:-300000} / 1000 ))
REQUEST_SETTLEMENTS_INTERVAL_S=$(( ${REQUEST_SETTLEMENTS_INTERVAL_MS:-120000} / 1000 ))

SPAWN_PID=""
BIDS_PID=""
REFRESH_PID=""
REQUEST_SETTLEMENTS_PID=""

cleanup() {
  echo ""
  echo "[run-demo] shutting down all demo processes..."
  [ -n "$SPAWN_PID"               ] && kill "$SPAWN_PID"               2>/dev/null || true
  [ -n "$BIDS_PID"                ] && kill "$BIDS_PID"                2>/dev/null || true
  [ -n "$REFRESH_PID"             ] && kill "$REFRESH_PID"             2>/dev/null || true
  [ -n "$REQUEST_SETTLEMENTS_PID" ] && kill "$REQUEST_SETTLEMENTS_PID" 2>/dev/null || true
  exit 0
}

trap cleanup INT TERM

echo "[run-demo] =================================================="
echo "[run-demo]  Insider Streams — Demo Orchestrator"
echo "[run-demo] =================================================="
echo "[run-demo]  create-events:        once at startup, then every ${CREATE_EVENTS_INTERVAL_S}s"
echo "[run-demo]  spawn-auctions:       every ${SPAWN_INTERVAL_S}s"
echo "[run-demo]  place-bids:          every ${SPAWN_INTERVAL_S}s"
echo "[run-demo]  request-settlements:  every ${REQUEST_SETTLEMENTS_INTERVAL_S}s"
echo "[run-demo]  base URL:             ${BASE_URL:-http://localhost:3000}"
echo ""

# ── 1. Seed prediction market events ─────────────────────────────────────────
echo "[run-demo] Running create-events (initial seed)..."
pnpm run create-events || echo "[run-demo] create-events exited non-zero — continuing"
echo ""

# ── 2. Start spawn-auctions loop ────────────────────────────────────────────
(
  while true; do
    pnpm run spawn-auctions || echo "[run-demo] spawn-auctions failed — continuing"
    sleep "$SPAWN_INTERVAL_S"
  done
) &
SPAWN_PID=$!
echo "[run-demo] spawn-auctions loop started (PID $SPAWN_PID)"

# ── 3. Periodic place-bids ───────────────────────────────────────────────────
(
  while true; do
    sleep "$SPAWN_INTERVAL_S"
    pnpm run place-bids || echo "[run-demo] place-bids failed — continuing"
  done
) &
BIDS_PID=$!
echo "[run-demo] place-bids loop started (PID $BIDS_PID)"

# ── 4. Periodic request-settlements ─────────────────────────────────────────
(
  while true; do
    sleep "$REQUEST_SETTLEMENTS_INTERVAL_S"
    pnpm run request-settlements || echo "[run-demo] request-settlements failed — continuing"
  done
) &
REQUEST_SETTLEMENTS_PID=$!
echo "[run-demo] request-settlements loop started (PID $REQUEST_SETTLEMENTS_PID)"

# ── 5. Periodic create-events refresh ───────────────────────────────────────
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

wait "$SPAWN_PID" "$BIDS_PID" "$REQUEST_SETTLEMENTS_PID" "$REFRESH_PID"
