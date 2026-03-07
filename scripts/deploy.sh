#!/usr/bin/env bash
# deploy.sh — Deploy private-streams to remote server
#
# Checks out a branch on the remote, installs deps, runs E2E tests.
# Handles uncommitted local changes, offers rollback on failure.
#
# Usage: ./scripts/deploy.sh [--branch <name>] [--repo-path <path>] [--skip-e2e] [--yes]
# Requires: ssh access to remote

set -euo pipefail

# ─── Constants ────────────────────────────────────────────────────────────────
REMOTE_HOST="bawler@195.201.8.147"
DEFAULT_REPO_PATH="/home/bawler/insider-streams"

# ANSI colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ─── Parse CLI arguments ─────────────────────────────────────────────────────
BRANCH=""
REPO_PATH=""
SKIP_E2E=false
AUTO_YES=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch)
      BRANCH="$2"
      shift 2
      ;;
    --repo-path)
      REPO_PATH="$2"
      shift 2
      ;;
    --skip-e2e)
      SKIP_E2E=true
      shift
      ;;
    --yes)
      AUTO_YES=true
      shift
      ;;
    *)
      echo -e "${RED}Unknown argument: $1${NC}"
      echo "Usage: ./scripts/deploy.sh [--branch <name>] [--repo-path <path>] [--skip-e2e] [--yes]"
      exit 1
      ;;
  esac
done

# Defaults
BRANCH="${BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"
REPO_PATH="${REPO_PATH:-$DEFAULT_REPO_PATH}"

# Track deployment state for rollback
DEPLOY_STARTED=false
PREV_BRANCH=""
PREV_COMMIT=""

# E2E result tracking
SECRET_MARKETPLACE_RESULT="skipped"
SECRET_MARKETPLACE_AUCTION_CLOSER_RESULT="skipped"
SIMPLE_MARKET_RESULT="skipped"
USER_BALANCE_RECORDING_FALLBACK_RESULT="skipped"
REPUTATION_RESOLVER_RESULT="skipped"
FORCE_CLOSE_HANDLER_RESULT="skipped"

# ─── Helpers ──────────────────────────────────────────────────────────────────
info()    { echo -e "${CYAN}$*${NC}"; }
success() { echo -e "${GREEN}  ✓ $*${NC}"; }
warn()    { echo -e "${YELLOW}  ⚠ $*${NC}"; }
fail()    { echo -e "${RED}  ✗ $*${NC}"; }

ask_yn() {
  if [ "$AUTO_YES" = true ]; then
    return 0
  fi
  local prompt="$1"
  read -r -p "$prompt [y/N] " answer
  [[ "$answer" =~ ^[Yy]$ ]]
}

remote_exec() {
  ssh "$REMOTE_HOST" bash -s <<REMOTE_EOF
set -euo pipefail
export NVM_DIR="\$HOME/.nvm"
[ -s "\$NVM_DIR/nvm.sh" ] && . "\$NVM_DIR/nvm.sh"
export PATH="\$HOME/.cre/bin:\$HOME/.foundry/bin:\$HOME/.bun/bin:\$HOME/.local/bin:\$PATH"
cd "$REPO_PATH"
$1
REMOTE_EOF
}

do_rollback() {
  info "Rolling back remote to $PREV_BRANCH@${PREV_COMMIT:0:7}..."
  remote_exec "
    git checkout '$PREV_BRANCH'
    git reset --hard '$PREV_COMMIT'
    git submodule update --init --recursive 2>/dev/null || true
    pnpm install --frozen-lockfile 2>/dev/null || pnpm install
  " >/dev/null 2>&1

  for workflow in external-prediction-market-settler secret-marketplace-auction-closer user-balance-recording-fallback reputation-resolver force-close-handler; do
    if ssh "$REMOTE_HOST" "[ -d '$REPO_PATH/cre-workflows/$workflow' ]"; then
      remote_exec "cd cre-workflows/$workflow && bun install" >/dev/null 2>&1
    fi
  done

  success "Rolled back to $PREV_BRANCH@${PREV_COMMIT:0:7}"
}

# ─── Trap: offer rollback on unexpected exit ──────────────────────────────────
cleanup() {
  local exit_code=$?
  if [ "$DEPLOY_STARTED" = true ] && [ $exit_code -ne 0 ]; then
    echo ""
    fail "Deploy interrupted (exit code $exit_code)"
    if [ -n "$PREV_BRANCH" ] && [ -n "$PREV_COMMIT" ]; then
      if ask_yn "  Rollback remote to $PREV_BRANCH@${PREV_COMMIT:0:7}?"; then
        do_rollback
      fi
    fi
  fi
}
trap cleanup EXIT

# ═══════════════════════════════════════════════════════════════════════════════
# Phase 0: Local Checks & User Input
# ═══════════════════════════════════════════════════════════════════════════════

echo "═══════════════════════════════════════════════════════"
echo "  Deploy — private-streams"
echo "═══════════════════════════════════════════════════════"
echo "  Remote:  $REMOTE_HOST"
echo "  Branch:  $BRANCH"
echo "  Repo:    $REPO_PATH"
echo "  E2E:     $([ "$SKIP_E2E" = true ] && echo "skip" || echo "run")"
echo "═══════════════════════════════════════════════════════"

# ─── Check for uncommitted changes ───────────────────────────────────────────
echo ""
echo "▶ Phase 0: Local checks"

LOCAL_CHANGES=$(git status --porcelain)
if [ -n "$LOCAL_CHANGES" ]; then
  warn "Uncommitted local changes:"
  echo "$LOCAL_CHANGES" | head -20
  if [ "$AUTO_YES" = false ]; then
    if ask_yn "  Commit and push these changes?"; then
      read -r -p "  Commit message: " COMMIT_MSG
      git add -A
      git commit -m "$COMMIT_MSG"
      git push origin "$BRANCH"
      success "Changes committed and pushed"
    else
      warn "Continuing with uncommitted changes (remote won't have them)"
    fi
  else
    warn "Continuing with uncommitted changes (use interactive mode to commit)"
  fi
fi

# ─── Check for unpushed commits ──────────────────────────────────────────────
UNPUSHED=$(git log @{u}..HEAD --oneline 2>/dev/null || true)
if [ -n "$UNPUSHED" ]; then
  UNPUSHED_COUNT=$(echo "$UNPUSHED" | wc -l | tr -d ' ')
  warn "$UNPUSHED_COUNT unpushed commit(s):"
  echo "$UNPUSHED"
  if [ "$AUTO_YES" = false ]; then
    if ask_yn "  Push $UNPUSHED_COUNT commit(s) to origin/$BRANCH?"; then
      git push origin "$BRANCH"
      success "Pushed to origin/$BRANCH"
    else
      warn "Continuing without pushing (remote may be behind)"
    fi
  else
    warn "Continuing without pushing (use interactive mode to push)"
  fi
fi

# ─── Confirm deployment ──────────────────────────────────────────────────────
if [ "$AUTO_YES" = false ]; then
  echo ""
  if ! ask_yn "Deploy $BRANCH to $REMOTE_HOST?"; then
    echo "Aborted."
    exit 0
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# Phase 1: Remote Prerequisites Check
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo "▶ Phase 1: Checking remote prerequisites..."

PREREQ_OUTPUT=$(ssh "$REMOTE_HOST" bash -s <<'REMOTE_EOF'
set -euo pipefail
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
export PATH="$HOME/.cre/bin:$HOME/.foundry/bin:$HOME/.bun/bin:$HOME/.local/bin:$PATH"

ERRORS=0

check_cmd() {
  if command -v "$1" &>/dev/null; then
    echo "  OK: $1 ($(command -v "$1"))"
  else
    echo "  MISSING: $1"
    ERRORS=$((ERRORS + 1))
  fi
}

check_version() {
  local cmd="$1" min="$2" actual
  actual=$($cmd --version 2>/dev/null | grep -oP '\d+' | head -1)
  if [ -n "$actual" ] && [ "$actual" -ge "$min" ]; then
    echo "  OK: $cmd v$actual (>= $min)"
  else
    echo "  WARN: $cmd version $actual (need >= $min)"
  fi
}

check_cmd git
check_cmd node
check_cmd pnpm
check_cmd bun
check_cmd cre
check_cmd cast
check_cmd jq

check_version node 20
check_version pnpm 10

echo "---ERRORS:$ERRORS"
REMOTE_EOF
)

echo "$PREREQ_OUTPUT" | grep -v "^---"

PREREQ_ERRORS=$(echo "$PREREQ_OUTPUT" | grep "^---ERRORS:" | cut -d: -f2)
if [ "$PREREQ_ERRORS" -gt 0 ]; then
  fail "$PREREQ_ERRORS required tool(s) missing on remote"
  exit 1
fi
success "All prerequisites found"

# ─── Check repo exists ───────────────────────────────────────────────────────
REPO_EXISTS=$(ssh "$REMOTE_HOST" "[ -d '$REPO_PATH/.git' ] && echo yes || echo no")
if [ "$REPO_EXISTS" = "no" ]; then
  warn "Repo not found at $REPO_PATH"
  REMOTE_URL=$(git remote get-url origin)
  if ask_yn "  Clone $REMOTE_URL to $REPO_PATH?"; then
    ssh "$REMOTE_HOST" "git clone '$REMOTE_URL' '$REPO_PATH'"
    success "Repo cloned"
  else
    fail "No repo at $REPO_PATH — cannot continue"
    exit 1
  fi
fi

# ─── Check .env files ────────────────────────────────────────────────────────
ENV_CHECK=$(ssh "$REMOTE_HOST" bash -s <<REMOTE_EOF
[ -f "$REPO_PATH/.env" ] && echo "root-env:ok" || echo "root-env:missing"
[ -f "$REPO_PATH/cre-workflows/.env" ] && echo "cre-env:ok" || echo "cre-env:missing"
REMOTE_EOF
)

if echo "$ENV_CHECK" | grep -q "root-env:missing"; then
  warn ".env not found at $REPO_PATH/.env — E2E tests will fail"
fi
if echo "$ENV_CHECK" | grep -q "cre-env:missing"; then
  warn "cre-workflows/.env not found — CRE workflows will fail"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# Phase 2: Remote Deployment
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo "▶ Phase 2: Deploying to remote..."

# Record rollback state
ROLLBACK_STATE=$(remote_exec '
  echo "$(git rev-parse --abbrev-ref HEAD)"
  echo "$(git rev-parse HEAD)"
')
PREV_BRANCH=$(echo "$ROLLBACK_STATE" | head -1)
PREV_COMMIT=$(echo "$ROLLBACK_STATE" | tail -1)
DEPLOY_STARTED=true

info "  Rollback point: $PREV_BRANCH@${PREV_COMMIT:0:7}"

# Fetch and checkout
remote_exec "
  git fetch origin
  git checkout '$BRANCH' 2>/dev/null || git checkout -b '$BRANCH' 'origin/$BRANCH'
  git pull origin '$BRANCH'
  git submodule update --init --recursive 2>/dev/null || true
"
success "Checked out $BRANCH"

# Show deployed commit
DEPLOYED_COMMIT=$(remote_exec 'git log --oneline -1')
info "  Deployed: $DEPLOYED_COMMIT"

# Install pnpm dependencies
info "  Installing pnpm dependencies..."
remote_exec '
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install
' >/dev/null 2>&1
success "pnpm dependencies installed"

# Install CRE workflow dependencies (bun)
info "  Installing CRE workflow dependencies..."
for workflow in external-prediction-market-settler secret-marketplace-auction-closer user-balance-recording-fallback reputation-resolver force-close-handler; do
  if ssh "$REMOTE_HOST" "[ -d '$REPO_PATH/cre-workflows/$workflow' ]"; then
    remote_exec "cd cre-workflows/$workflow && bun install" >/dev/null 2>&1
    success "$workflow — bun install"
  else
    warn "$workflow — directory not found, skipping"
  fi
done

# ═══════════════════════════════════════════════════════════════════════════════
# Phase 3: E2E Verification
# ═══════════════════════════════════════════════════════════════════════════════

if [ "$SKIP_E2E" = true ]; then
  echo ""
  warn "Skipping E2E verification (--skip-e2e)"
else
  echo ""
  echo "▶ Phase 3: Running E2E verification..."
  E2E_FAILURES=0

  # 3a: secret-marketplace E2E (on-chain lifecycle)
  echo ""
  info "  Running secret-marketplace E2E..."
  MARKETPLACE_OUTPUT=$(ssh -t "$REMOTE_HOST" bash -c "'
    set -euo pipefail
    export NVM_DIR=\"\$HOME/.nvm\" && [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"; export PATH=\"\$HOME/.cre/bin:\$HOME/.foundry/bin:\$HOME/.bun/bin:\$HOME/.local/bin:\$PATH\"
    cd \"$REPO_PATH/scripts\"
    pnpm e2e:secret-marketplace 2>&1
  '" 2>&1) || true

  if echo "$MARKETPLACE_OUTPUT" | grep -q "PASS"; then
    SECRET_MARKETPLACE_RESULT="pass"
    success "secret-marketplace E2E passed"
  else
    SECRET_MARKETPLACE_RESULT="fail"
    fail "secret-marketplace E2E failed"
    echo "$MARKETPLACE_OUTPUT" | tail -20
    E2E_FAILURES=$((E2E_FAILURES + 1))
  fi

  # 3b: secret-marketplace-auction-closer E2E
  echo ""
  info "  Running secret-marketplace-auction-closer E2E..."
  AUCTION_OUTPUT=$(ssh -t "$REMOTE_HOST" bash -c "'
    set -euo pipefail
    export NVM_DIR=\"\$HOME/.nvm\" && [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"; export PATH=\"\$HOME/.cre/bin:\$HOME/.foundry/bin:\$HOME/.bun/bin:\$HOME/.local/bin:\$PATH\"
    cd \"$REPO_PATH/scripts\"
    pnpm e2e:secret-marketplace-auction-closer 2>&1
  '" 2>&1) || true

  if echo "$AUCTION_OUTPUT" | grep -q "PASS"; then
    SECRET_MARKETPLACE_AUCTION_CLOSER_RESULT="pass"
    success "secret-marketplace-auction-closer E2E passed"
  else
    SECRET_MARKETPLACE_AUCTION_CLOSER_RESULT="fail"
    fail "secret-marketplace-auction-closer E2E failed"
    echo "$AUCTION_OUTPUT" | tail -20
    E2E_FAILURES=$((E2E_FAILURES + 1))
  fi

  # 3c: simple-market E2E
  echo ""
  info "  Running simple-market E2E..."
  MARKET_OUTPUT=$(ssh -t "$REMOTE_HOST" bash -c "'
    set -euo pipefail
    export NVM_DIR=\"\$HOME/.nvm\" && [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"; export PATH=\"\$HOME/.cre/bin:\$HOME/.foundry/bin:\$HOME/.bun/bin:\$HOME/.local/bin:\$PATH\"
    cd \"$REPO_PATH/scripts\"
    pnpm e2e:external-prediction-market-settler 2>&1
  '" 2>&1) || true

  if echo "$MARKET_OUTPUT" | grep -q "PASS"; then
    SIMPLE_MARKET_RESULT="pass"
    success "simple-market E2E passed"
  else
    SIMPLE_MARKET_RESULT="fail"
    fail "simple-market E2E failed"
    echo "$MARKET_OUTPUT" | tail -20
    E2E_FAILURES=$((E2E_FAILURES + 1))
  fi

  # 3d: user-balance-recording-fallback E2E
  echo ""
  info "  Running user-balance-recording-fallback E2E..."
  DEPOSIT_EXIT=0
  DEPOSIT_OUTPUT=$(ssh -t "$REMOTE_HOST" bash -c "'
    set -euo pipefail
    export NVM_DIR=\"\$HOME/.nvm\" && [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"; export PATH=\"\$HOME/.cre/bin:\$HOME/.foundry/bin:\$HOME/.bun/bin:\$HOME/.local/bin:\$PATH\"
    cd \"$REPO_PATH/scripts\"
    pnpm e2e:user-balance-recording-fallback 2>&1
  '" 2>&1) || DEPOSIT_EXIT=$?

  if [ "$DEPOSIT_EXIT" -eq 0 ] && echo "$DEPOSIT_OUTPUT" | grep -qi "PASSED\|PASS"; then
    USER_BALANCE_RECORDING_FALLBACK_RESULT="pass"
    success "user-balance-recording-fallback E2E passed"
  else
    USER_BALANCE_RECORDING_FALLBACK_RESULT="fail"
    fail "user-balance-recording-fallback E2E failed"
    echo "$DEPOSIT_OUTPUT" | tail -20
    E2E_FAILURES=$((E2E_FAILURES + 1))
  fi

  # 3e: reputation-resolver E2E
  echo ""
  info "  Running reputation-resolver E2E..."
  REPUTATION_EXIT=0
  REPUTATION_OUTPUT=$(ssh -t "$REMOTE_HOST" bash -c "'
    set -euo pipefail
    export NVM_DIR=\"\$HOME/.nvm\" && [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"; export PATH=\"\$HOME/.cre/bin:\$HOME/.foundry/bin:\$HOME/.bun/bin:\$HOME/.local/bin:\$PATH\"
    cd \"$REPO_PATH/scripts\"
    pnpm e2e:reputation-resolver 2>&1
  '" 2>&1) || REPUTATION_EXIT=$?

  if [ "$REPUTATION_EXIT" -eq 0 ] && echo "$REPUTATION_OUTPUT" | grep -qi "PASS"; then
    REPUTATION_RESOLVER_RESULT="pass"
    success "reputation-resolver E2E passed"
  else
    REPUTATION_RESOLVER_RESULT="fail"
    fail "reputation-resolver E2E failed"
    echo "$REPUTATION_OUTPUT" | tail -20
    E2E_FAILURES=$((E2E_FAILURES + 1))
  fi

  # 3f: force-close-handler E2E
  echo ""
  info "  Running force-close-handler E2E..."
  FORCE_CLOSE_EXIT=0
  FORCE_CLOSE_OUTPUT=$(ssh -t "$REMOTE_HOST" bash -c "'
    set -euo pipefail
    export NVM_DIR=\"\$HOME/.nvm\" && [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"; export PATH=\"\$HOME/.cre/bin:\$HOME/.foundry/bin:\$HOME/.bun/bin:\$HOME/.local/bin:\$PATH\"
    cd \"$REPO_PATH/scripts\"
    pnpm e2e:force-close-handler 2>&1
  '" 2>&1) || FORCE_CLOSE_EXIT=$?

  if [ "$FORCE_CLOSE_EXIT" -eq 0 ] && echo "$FORCE_CLOSE_OUTPUT" | grep -qi "PASS"; then
    FORCE_CLOSE_HANDLER_RESULT="pass"
    success "force-close-handler E2E passed"
  else
    FORCE_CLOSE_HANDLER_RESULT="fail"
    fail "force-close-handler E2E failed"
    echo "$FORCE_CLOSE_OUTPUT" | tail -20
    E2E_FAILURES=$((E2E_FAILURES + 1))
  fi

  # ─── E2E Results Summary ──────────────────────────────────────────────────
  echo ""
  echo "  ┌──────────────────────────────────────────┬──────────┐"
  echo "  │ Workflow                                 │ Result   │"
  echo "  ├──────────────────────────────────────────┼──────────┤"
  printf "  │ %-40s │ %-8s │\n" "secret-marketplace" "$SECRET_MARKETPLACE_RESULT"
  printf "  │ %-40s │ %-8s │\n" "secret-marketplace-auction-closer" "$SECRET_MARKETPLACE_AUCTION_CLOSER_RESULT"
  printf "  │ %-40s │ %-8s │\n" "simple-market" "$SIMPLE_MARKET_RESULT"
  printf "  │ %-40s │ %-8s │\n" "user-balance-recording-fallback" "$USER_BALANCE_RECORDING_FALLBACK_RESULT"
  printf "  │ %-40s │ %-8s │\n" "reputation-resolver" "$REPUTATION_RESOLVER_RESULT"
  printf "  │ %-40s │ %-8s │\n" "force-close-handler" "$FORCE_CLOSE_HANDLER_RESULT"
  echo "  └──────────────────────────────────────────┴──────────┘"

  if [ $E2E_FAILURES -gt 0 ]; then
    echo ""
    fail "$E2E_FAILURES E2E test(s) failed"
    if ask_yn "  Rollback to $PREV_BRANCH@${PREV_COMMIT:0:7}?"; then
      do_rollback
      exit 1
    fi
    warn "Continuing despite failures"
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# Phase 5: Success Banner
# ═══════════════════════════════════════════════════════════════════════════════

# Clear the trap (successful deploy, no rollback needed)
DEPLOY_STARTED=false

echo ""
echo "═══════════════════════════════════════════════════════"
echo -e "  ${GREEN}✓ Deploy complete${NC}"
echo "═══════════════════════════════════════════════════════"
echo "  Remote:    $REMOTE_HOST"
echo "  Branch:    $BRANCH"
echo "  Commit:    $DEPLOYED_COMMIT"
echo "  Repo:      $REPO_PATH"
if [ "$SKIP_E2E" = false ]; then
  echo "  Workflows: secret-marketplace=$SECRET_MARKETPLACE_RESULT auction-closer=$SECRET_MARKETPLACE_AUCTION_CLOSER_RESULT simple-market=$SIMPLE_MARKET_RESULT deposit-reconciler=$USER_BALANCE_RECORDING_FALLBACK_RESULT reputation=$REPUTATION_RESOLVER_RESULT force-close=$FORCE_CLOSE_HANDLER_RESULT"
fi
echo "═══════════════════════════════════════════════════════"
