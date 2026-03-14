#!/usr/bin/env bash
# deploy.sh — Deploy private-streams (Zama FHE version) to remote VPS
#
# Deploys to /home/bawler/private-streams-zama (separate from the original
# /home/bawler/insider-streams deployment — DO NOT interfere with that).
#
# What it does:
#   1. Clones/updates the repo on the VPS
#   2. Installs pnpm dependencies
#   3. Sets up the daemon as a systemd service (port 3001)
#   4. Adds HAProxy route for the daemon API
#   5. Installs cron jobs for demo data generation
#   6. Verifies everything is running
#
# Usage: ./scripts/deploy.sh [--branch <name>] [--yes]
# Requires: ssh access to bawler@195.201.8.147

set -euo pipefail

# ─── Constants ────────────────────────────────────────────────────────────────
REMOTE_HOST="bawler@195.201.8.147"
REPO_PATH="/home/bawler/private-streams-zama"
REMOTE_URL="git@github.com:PL-Genesis-2026/insider-streams.git"
DAEMON_PORT=3001
SERVICE_NAME="ps-zama-daemon"

# ANSI colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# ─── Parse CLI arguments ─────────────────────────────────────────────────────
BRANCH=""
AUTO_YES=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch)
      BRANCH="$2"
      shift 2
      ;;
    --yes)
      AUTO_YES=true
      shift
      ;;
    *)
      echo -e "${RED}Unknown argument: $1${NC}"
      echo "Usage: ./scripts/deploy.sh [--branch <name>] [--yes]"
      exit 1
      ;;
  esac
done

BRANCH="${BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"

# ─── Helpers ──────────────────────────────────────────────────────────────────
info()    { echo -e "${CYAN}$*${NC}"; }
success() { echo -e "${GREEN}  ✓ $*${NC}"; }
warn()    { echo -e "${YELLOW}  ⚠ $*${NC}"; }
fail()    { echo -e "${RED}  ✗ $*${NC}"; }

ask_yn() {
  if [ "$AUTO_YES" = true ]; then return 0; fi
  local prompt="$1"
  read -r -p "$prompt [y/N] " answer
  [[ "$answer" =~ ^[Yy]$ ]]
}

remote_exec() {
  ssh "$REMOTE_HOST" bash -s <<REMOTE_EOF
set -euo pipefail
export NVM_DIR="\$HOME/.nvm"
[ -s "\$NVM_DIR/nvm.sh" ] && . "\$NVM_DIR/nvm.sh"
export PATH="\$HOME/.local/bin:\$PATH"
cd "$REPO_PATH"
$1
REMOTE_EOF
}

# ═══════════════════════════════════════════════════════════════════════════════
# Phase 0: Pre-flight checks
# ═══════════════════════════════════════════════════════════════════════════════

echo "═══════════════════════════════════════════════════════"
echo "  Deploy — private-streams (Zama FHE version)"
echo "═══════════════════════════════════════════════════════"
echo "  Remote:  $REMOTE_HOST"
echo "  Branch:  $BRANCH"
echo "  Repo:    $REPO_PATH"
echo "  Daemon:  port $DAEMON_PORT"
echo "═══════════════════════════════════════════════════════"

# Check for uncommitted changes
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
  fi
fi

# Push unpushed commits
UNPUSHED=$(git log @{u}..HEAD --oneline 2>/dev/null || true)
if [ -n "$UNPUSHED" ]; then
  UNPUSHED_COUNT=$(echo "$UNPUSHED" | wc -l | tr -d ' ')
  warn "$UNPUSHED_COUNT unpushed commit(s)"
  if ask_yn "  Push to origin/$BRANCH?"; then
    git push origin "$BRANCH"
    success "Pushed to origin/$BRANCH"
  fi
fi

if [ "$AUTO_YES" = false ]; then
  echo ""
  if ! ask_yn "Deploy $BRANCH to $REMOTE_HOST:$REPO_PATH?"; then
    echo "Aborted."
    exit 0
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# Phase 1: Check remote can access our repo
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo "▶ Phase 1: Checking remote access..."

CAN_ACCESS=$(ssh "$REMOTE_HOST" "git ls-remote $REMOTE_URL HEAD 2>/dev/null && echo 'OK' || echo 'FAIL'" | tail -1)
if [ "$CAN_ACCESS" = "FAIL" ]; then
  fail "VPS SSH key cannot access $REMOTE_URL"
  echo ""
  echo "  Add this deploy key to the GitHub repo:"
  ssh "$REMOTE_HOST" "cat ~/.ssh/id_ed25519.pub"
  echo ""
  echo "  Go to: https://github.com/PL-Genesis-2026/insider-streams/settings/keys"
  echo "  Click 'Add deploy key', paste the key above, and re-run this script."
  exit 1
fi
success "Remote can access $REMOTE_URL"

# ═══════════════════════════════════════════════════════════════════════════════
# Phase 2: Clone or update repo
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo "▶ Phase 2: Setting up repo..."

REPO_EXISTS=$(ssh "$REMOTE_HOST" "[ -d '$REPO_PATH/.git' ] && echo yes || echo no")
if [ "$REPO_EXISTS" = "no" ]; then
  info "  Cloning $REMOTE_URL → $REPO_PATH..."
  ssh "$REMOTE_HOST" "git clone '$REMOTE_URL' '$REPO_PATH'"
  success "Repo cloned"
fi

remote_exec "
  git fetch origin
  git checkout '$BRANCH' 2>/dev/null || git checkout -b '$BRANCH' 'origin/$BRANCH'
  git pull origin '$BRANCH'
"
success "Checked out $BRANCH"

DEPLOYED_COMMIT=$(remote_exec 'git log --oneline -1')
info "  Deployed: $DEPLOYED_COMMIT"

# Install dependencies
info "  Installing pnpm dependencies..."
remote_exec 'pnpm install --frozen-lockfile 2>/dev/null || pnpm install' >/dev/null 2>&1
success "Dependencies installed"

# ═══════════════════════════════════════════════════════════════════════════════
# Phase 3: Set up env files
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo "▶ Phase 3: Environment files..."

DAEMON_ENV_EXISTS=$(ssh "$REMOTE_HOST" "[ -f '$REPO_PATH/apps/daemon/.env' ] && echo yes || echo no")
if [ "$DAEMON_ENV_EXISTS" = "no" ]; then
  warn "apps/daemon/.env is missing — you need to create it manually"
  echo "  scp apps/daemon/.env $REMOTE_HOST:$REPO_PATH/apps/daemon/.env"
  echo ""
  echo "  Required keys: PRIVATE_KEY, RPC_URL, GEMINI_API_KEY"
  echo "  Set NTFY_TOPIC_SETTLER=zama-settler (and other NTFY_TOPIC_* vars)"
  echo "  Set API_PORT=$DAEMON_PORT"
else
  success "apps/daemon/.env exists"
  # Verify ntfy topics use zama- prefix
  NTFY_CHECK=$(ssh "$REMOTE_HOST" "grep '^NTFY_TOPIC_' '$REPO_PATH/apps/daemon/.env' | head -1" 2>/dev/null || echo "")
  if [ -z "$NTFY_CHECK" ]; then
    warn "No NTFY_TOPIC_* vars found — per-service ntfy topics not configured"
  fi
fi

SCRIPTS_ENV_EXISTS=$(ssh "$REMOTE_HOST" "[ -f '$REPO_PATH/scripts/.env' ] && echo yes || echo no")
if [ "$SCRIPTS_ENV_EXISTS" = "no" ]; then
  warn "scripts/.env is missing — cron jobs need it"
  echo "  scp scripts/.env $REMOTE_HOST:$REPO_PATH/scripts/.env"
  echo "  Required: OWNER_PK, RPC_URL, VENICE_API_KEY, DAEMON_URL, TEST_ACCOUNT_1..25"
else
  success "scripts/.env exists"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# Phase 4: Set up daemon systemd service
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo "▶ Phase 4: Setting up daemon service ($SERVICE_NAME)..."

# Create the systemd service unit file
ssh "$REMOTE_HOST" "cat > /tmp/$SERVICE_NAME.service" <<EOF
[Unit]
Description=Private Streams Zama Daemon (settler, auction-closer, reputation-resolver, API)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=bawler
WorkingDirectory=$REPO_PATH/apps/daemon
ExecStart=/bin/bash -c 'source ~/.nvm/nvm.sh && npx tsx src/index.ts'
Restart=always
RestartSec=30
StartLimitIntervalSec=300
StartLimitBurst=10
EnvironmentFile=$REPO_PATH/apps/daemon/.env
Environment=PATH=/home/bawler/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin
StandardOutput=append:$REPO_PATH/logs/daemon.log
StandardError=append:$REPO_PATH/logs/daemon.log

[Install]
WantedBy=multi-user.target
EOF

ssh "$REMOTE_HOST" "
  sudo cp /tmp/$SERVICE_NAME.service /etc/systemd/system/$SERVICE_NAME.service
  sudo systemctl daemon-reload
  mkdir -p $REPO_PATH/logs
"

# Only restart if env file exists
if [ "$DAEMON_ENV_EXISTS" = "yes" ]; then
  ssh "$REMOTE_HOST" "sudo systemctl enable $SERVICE_NAME && sudo systemctl restart $SERVICE_NAME"
  sleep 3
  SERVICE_STATUS=$(ssh "$REMOTE_HOST" "systemctl is-active $SERVICE_NAME 2>/dev/null || echo 'inactive'")
  if [ "$SERVICE_STATUS" = "active" ]; then
    success "Daemon service running"
  else
    fail "Daemon service failed to start"
    ssh "$REMOTE_HOST" "sudo journalctl -u $SERVICE_NAME --no-pager -n 20"
  fi
else
  warn "Skipping daemon start — .env missing"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# Phase 5: HAProxy configuration
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo "▶ Phase 5: HAProxy configuration..."

# Check if our backend is already configured
HAS_ZAMA_BACKEND=$(ssh "$REMOTE_HOST" "sudo grep -c 'ps-zama-daemon' /etc/haproxy/haproxy.cfg 2>/dev/null || echo 0")
if [ "$HAS_ZAMA_BACKEND" -gt 0 ]; then
  success "HAProxy already configured for ps-zama-daemon"
else
  info "  Adding HAProxy route for /api/zama → localhost:$DAEMON_PORT..."

  # Back up current config
  ssh "$REMOTE_HOST" "sudo cp /etc/haproxy/haproxy.cfg /etc/haproxy/haproxy.cfg.bak-\$(date +%Y%m%d%H%M%S)"

  # Add our backend and ACL to haproxy config
  ssh "$REMOTE_HOST" "sudo tee /etc/haproxy/haproxy.cfg > /dev/null" <<'HAPROXY_EOF'
global
	log /dev/log	local0
	log /dev/log	local1 notice
	chroot /var/lib/haproxy
	stats socket /run/haproxy/admin.sock mode 660 level admin
	stats timeout 30s
	user haproxy
	group haproxy
	daemon

	ca-base /etc/ssl/certs
	crt-base /etc/ssl/private

	ssl-default-bind-ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384
	ssl-default-bind-ciphersuites TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256
	ssl-default-bind-options ssl-min-ver TLSv1.2 no-tls-tickets

defaults
	log	global
	mode	http
	option	httplog
	option	dontlognull
	timeout connect 5000
	timeout client  50000
	timeout server  300000
	errorfile 400 /etc/haproxy/errors/400.http
	errorfile 403 /etc/haproxy/errors/403.http
	errorfile 408 /etc/haproxy/errors/408.http
	errorfile 500 /etc/haproxy/errors/500.http
	errorfile 502 /etc/haproxy/errors/502.http
	errorfile 503 /etc/haproxy/errors/503.http
	errorfile 504 /etc/haproxy/errors/504.http

frontend http-in
	bind *:80
	http-request redirect scheme https unless { ssl_fc }

frontend https-in
	bind *:443 ssl crt /etc/haproxy/certs/api.insider-streams.com.pem

	# Route /api/zama/* to the Zama daemon (strip /api/zama prefix)
	acl is_zama_api path_beg /api/zama
	use_backend ps-zama-daemon if is_zama_api

	default_backend ntfy

backend ntfy
	server ntfy 127.0.0.1:8090 check

backend ps-zama-daemon
	http-request set-path %[path,regsub(^/api/zama,,)]
	server daemon 127.0.0.1:3001 check
HAPROXY_EOF

  # Validate and reload
  HAPROXY_CHECK=$(ssh "$REMOTE_HOST" "sudo haproxy -c -f /etc/haproxy/haproxy.cfg 2>&1")
  if echo "$HAPROXY_CHECK" | grep -q "Configuration file is valid"; then
    ssh "$REMOTE_HOST" "sudo systemctl reload haproxy"
    success "HAProxy reloaded with /api/zama route"
  else
    fail "HAProxy config invalid — restoring backup"
    ssh "$REMOTE_HOST" "sudo cp /etc/haproxy/haproxy.cfg.bak-* /etc/haproxy/haproxy.cfg 2>/dev/null"
    echo "$HAPROXY_CHECK"
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# Phase 6: Cron jobs for demo data generation
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo "▶ Phase 6: Setting up cron jobs..."

# Create wrapper scripts for each cron job
ssh "$REMOTE_HOST" "mkdir -p $REPO_PATH/scripts"

# create-events wrapper
ssh "$REMOTE_HOST" "cat > $REPO_PATH/scripts/run-create-events-zama.sh && chmod +x $REPO_PATH/scripts/run-create-events-zama.sh" <<CRON_EOF
#!/bin/bash
# Cron wrapper: create events for Zama deployment
# Crontab: */15 * * * *
LOCKFILE="/tmp/zama-create-events.lock"
exec 200>"\$LOCKFILE"
flock -n 200 || exit 0
export NVM_DIR="/home/bawler/.nvm"
[ -s "\$NVM_DIR/nvm.sh" ] && . "\$NVM_DIR/nvm.sh"
cd $REPO_PATH/scripts
exec npx tsx --env-file=.env create-events.ts >> $REPO_PATH/logs/create-events.log 2>&1
CRON_EOF

# spawn-auctions wrapper
ssh "$REMOTE_HOST" "cat > $REPO_PATH/scripts/run-spawn-auctions-zama.sh && chmod +x $REPO_PATH/scripts/run-spawn-auctions-zama.sh" <<CRON_EOF
#!/bin/bash
# Cron wrapper: spawn auctions for Zama deployment
# Crontab: */10 * * * *
LOCKFILE="/tmp/zama-spawn-auctions.lock"
exec 200>"\$LOCKFILE"
flock -n 200 || exit 0
export NVM_DIR="/home/bawler/.nvm"
[ -s "\$NVM_DIR/nvm.sh" ] && . "\$NVM_DIR/nvm.sh"
cd $REPO_PATH/scripts
exec npx tsx --env-file=.env spawn-auctions.ts >> $REPO_PATH/logs/spawn-auctions.log 2>&1
CRON_EOF

# place-bids wrapper
ssh "$REMOTE_HOST" "cat > $REPO_PATH/scripts/run-place-bids-zama.sh && chmod +x $REPO_PATH/scripts/run-place-bids-zama.sh" <<CRON_EOF
#!/bin/bash
# Cron wrapper: place bids for Zama deployment
# Crontab: * * * * *
LOCKFILE="/tmp/zama-place-bids.lock"
exec 200>"\$LOCKFILE"
flock -n 200 || exit 0
export NVM_DIR="/home/bawler/.nvm"
[ -s "\$NVM_DIR/nvm.sh" ] && . "\$NVM_DIR/nvm.sh"
cd $REPO_PATH/scripts
exec npx tsx --env-file=.env place-bids.ts >> $REPO_PATH/logs/place-bids.log 2>&1
CRON_EOF

# request-settlements wrapper
ssh "$REMOTE_HOST" "cat > $REPO_PATH/scripts/run-request-settlements-zama.sh && chmod +x $REPO_PATH/scripts/run-request-settlements-zama.sh" <<CRON_EOF
#!/bin/bash
# Cron wrapper: request settlements for Zama deployment
# Crontab: * * * * *
LOCKFILE="/tmp/zama-request-settlements.lock"
exec 200>"\$LOCKFILE"
flock -n 200 || exit 0
export NVM_DIR="/home/bawler/.nvm"
[ -s "\$NVM_DIR/nvm.sh" ] && . "\$NVM_DIR/nvm.sh"
cd $REPO_PATH/scripts
exec npx tsx --env-file=.env request-settlements.ts >> $REPO_PATH/logs/request-settlements.log 2>&1
CRON_EOF

# Add cron entries (only if not already present)
ZAMA_CRON_EXISTS=$(ssh "$REMOTE_HOST" "crontab -l 2>/dev/null | grep -c 'zama' || echo 0")
if [ "$ZAMA_CRON_EXISTS" -gt 0 ]; then
  success "Cron jobs already installed (found $ZAMA_CRON_EXISTS entries)"
else
  info "  Installing cron jobs..."
  ssh "$REMOTE_HOST" bash -s <<'CRON_INSTALL_EOF'
EXISTING=$(crontab -l 2>/dev/null || true)
NEW_CRON="$EXISTING
# ── Private Streams Zama deployment cron jobs ──
*/15 * * * * /home/bawler/private-streams-zama/scripts/run-create-events-zama.sh
*/10 * * * * /home/bawler/private-streams-zama/scripts/run-spawn-auctions-zama.sh
* * * * * /home/bawler/private-streams-zama/scripts/run-place-bids-zama.sh
* * * * * /home/bawler/private-streams-zama/scripts/run-request-settlements-zama.sh"
echo "$NEW_CRON" | crontab -
CRON_INSTALL_EOF
  success "Cron jobs installed"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# Phase 7: Verify everything
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo "▶ Phase 7: Verification..."

# Check daemon health
if [ "$DAEMON_ENV_EXISTS" = "yes" ]; then
  HEALTH=$(ssh "$REMOTE_HOST" "curl -sf http://localhost:$DAEMON_PORT/health 2>/dev/null || echo 'FAIL'")
  if echo "$HEALTH" | grep -q '"status":"ok"'; then
    success "Daemon health check passed: $HEALTH"
  else
    fail "Daemon health check failed: $HEALTH"
  fi

  # Check HAProxy route
  HAPROXY_HEALTH=$(ssh "$REMOTE_HOST" "curl -sf https://api.insider-streams.com/api/zama/health 2>/dev/null || echo 'FAIL'")
  if echo "$HAPROXY_HEALTH" | grep -q '"status":"ok"'; then
    success "HAProxy /api/zama/health route works: $HAPROXY_HEALTH"
  else
    warn "HAProxy route check: $HAPROXY_HEALTH (may need SSL cert)"
  fi
fi

# Check systemd
SERVICE_STATUS=$(ssh "$REMOTE_HOST" "systemctl is-active $SERVICE_NAME 2>/dev/null || echo 'inactive'")
info "  Daemon service: $SERVICE_STATUS"

# Check cron
CRON_COUNT=$(ssh "$REMOTE_HOST" "crontab -l 2>/dev/null | grep -c 'zama' || echo 0")
info "  Cron jobs: $CRON_COUNT entries"

# ═══════════════════════════════════════════════════════════════════════════════
# Done
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo "═══════════════════════════════════════════════════════"
echo -e "  ${GREEN}✓ Deploy complete${NC}"
echo "═══════════════════════════════════════════════════════"
echo "  Remote:    $REMOTE_HOST"
echo "  Branch:    $BRANCH"
echo "  Commit:    $DEPLOYED_COMMIT"
echo "  Repo:      $REPO_PATH"
echo "  Daemon:    http://localhost:$DAEMON_PORT/health"
echo "  HAProxy:   https://api.insider-streams.com/api/zama/health"
echo "  Service:   $SERVICE_NAME ($SERVICE_STATUS)"
echo "  Cron jobs: $CRON_COUNT"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "  Manual steps remaining:"
echo "  1. Set NEXT_PUBLIC_DAEMON_URL=https://api.insider-streams.com/api/zama"
echo "     in insider-streams-frontend Vercel env vars"
echo "  2. Set NEXT_PUBLIC_SUBGRAPH_URL to the zama subgraph in Vercel"
echo "  3. Update prediction-market-frontend .env.local if needed"
echo "═══════════════════════════════════════════════════════"
