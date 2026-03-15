# Scripts VPS Setup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Set up new VPS (178.156.233.223) to run demo scripts (create-events, spawn-auctions, place-bids, request-settlements), offloading them from the daemon VPS (195.201.8.147).

**Architecture:** Create `bawler` user on new VPS, copy SSH keys (authorized_keys + GitHub deploy key) from source VPS (195.201.8.147), install Node.js toolchain via nvm, apply basic security hardening (UFW, fail2ban, disable root SSH password auth), clone the repo on `feat/zama-testing` branch, and set up env files adapted for remote daemon access.

**Tech Stack:** Ubuntu 24.04, nvm, Node.js (latest stable), pnpm, UFW, fail2ban

---

## Context

| Role | Host | User | Purpose |
|------|------|------|---------|
| Source/Daemon VPS | 195.201.8.147 | bawler | Runs daemon (systemd), HAProxy, ntfy, cron scripts — daemon stays here |
| New Scripts VPS | 178.156.233.223 | root (initially) → bawler | Will run demo scripts only |

**SSH keys on source VPS (195.201.8.147:/home/bawler/.ssh/):**
- `authorized_keys` — 3 keys (adoll, petrichor, k)
- `id_ed25519` / `id_ed25519.pub` — for chainlink-convergence GitHub repos
- `id_ed25519_2` / `id_ed25519_2.pub` — deploy key for PL-Genesis-2026 repos (used as `github-plgenesis` SSH alias)
- `config` — SSH config with `github-plgenesis` alias
- `known_hosts` — GitHub host key

**Env file changes needed for scripts VPS:**
- `scripts/.env`: `DAEMON_URL` must point to `https://api.insider-streams.com/api/zama` (not localhost)
- `scripts/.env`: `NTFY_HOST` must point to `https://api.insider-streams.com` (not localhost:8090)
- `scripts/.env`: Remove `FRONTEND_BASE_URL` (not needed for scripts)
- No `apps/daemon/.env` needed (daemon doesn't run here)

---

### Task 1: Create `bawler` user on new VPS

**Step 1: Create user with sudo privileges**

```bash
ssh root@178.156.233.223 "adduser --disabled-password --gecos '' bawler && usermod -aG sudo bawler && echo 'bawler ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/bawler && chmod 440 /etc/sudoers.d/bawler"
```

Expected: user created, passwordless sudo configured.

**Step 2: Create .ssh directory**

```bash
ssh root@178.156.233.223 "mkdir -p /home/bawler/.ssh && chmod 700 /home/bawler/.ssh && chown bawler:bawler /home/bawler/.ssh"
```

---

### Task 2: Copy SSH keys from source VPS

**Step 1: Copy authorized_keys**

```bash
ssh bawler@195.201.8.147 "cat ~/.ssh/authorized_keys" | ssh root@178.156.233.223 "cat > /home/bawler/.ssh/authorized_keys && chmod 600 /home/bawler/.ssh/authorized_keys && chown bawler:bawler /home/bawler/.ssh/authorized_keys"
```

**Step 2: Copy the GitHub deploy key (id_ed25519_2 — used for PL-Genesis-2026 repos)**

```bash
ssh bawler@195.201.8.147 "cat ~/.ssh/id_ed25519_2" | ssh root@178.156.233.223 "cat > /home/bawler/.ssh/id_ed25519_2 && chmod 600 /home/bawler/.ssh/id_ed25519_2 && chown bawler:bawler /home/bawler/.ssh/id_ed25519_2"

ssh bawler@195.201.8.147 "cat ~/.ssh/id_ed25519_2.pub" | ssh root@178.156.233.223 "cat > /home/bawler/.ssh/id_ed25519_2.pub && chmod 644 /home/bawler/.ssh/id_ed25519_2.pub && chown bawler:bawler /home/bawler/.ssh/id_ed25519_2.pub"
```

**Step 3: Create SSH config with github-plgenesis alias**

Write `~bawler/.ssh/config` on new VPS:

```
# Alias for PL-Genesis-2026 repos — uses id_ed25519_2
Host github-plgenesis
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519_2
    IdentitiesOnly yes
```

```bash
ssh root@178.156.233.223 "cat > /home/bawler/.ssh/config && chmod 600 /home/bawler/.ssh/config && chown bawler:bawler /home/bawler/.ssh/config" <<'EOF'
# Alias for PL-Genesis-2026 repos — uses id_ed25519_2
Host github-plgenesis
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519_2
    IdentitiesOnly yes
EOF
```

**Step 4: Copy known_hosts (for GitHub)**

```bash
ssh bawler@195.201.8.147 "cat ~/.ssh/known_hosts" | ssh root@178.156.233.223 "cat > /home/bawler/.ssh/known_hosts && chmod 644 /home/bawler/.ssh/known_hosts && chown bawler:bawler /home/bawler/.ssh/known_hosts"
```

**Step 5: Verify GitHub access**

```bash
ssh bawler@178.156.233.223 "ssh -T git@github-plgenesis 2>&1"
```

Expected: `Hi PL-Genesis-2026! You've successfully authenticated...` (or similar).

---

### Task 3: Basic security hardening

**Step 1: apt update + install essentials**

```bash
ssh root@178.156.233.223 "apt-get update && apt-get upgrade -y && apt-get install -y ufw fail2ban curl git build-essential"
```

**Step 2: Configure UFW firewall**

```bash
ssh root@178.156.233.223 "ufw default deny incoming && ufw default allow outgoing && ufw allow ssh && ufw --force enable"
```

**Step 3: Enable fail2ban**

```bash
ssh root@178.156.233.223 "systemctl enable fail2ban && systemctl start fail2ban"
```

**Step 4: Disable root password auth (key-only)**

```bash
ssh root@178.156.233.223 "sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config && sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config && systemctl restart sshd"
```

**Step 5: Verify SSH still works after sshd restart**

```bash
ssh root@178.156.233.223 "echo 'SSH OK'"
ssh bawler@178.156.233.223 "echo 'bawler SSH OK'"
```

---

### Task 4: Install nvm, Node.js (latest stable), and pnpm

**Step 1: Install nvm for bawler**

```bash
ssh bawler@178.156.233.223 "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash"
```

**Step 2: Install latest stable Node.js**

```bash
ssh bawler@178.156.233.223 "source ~/.nvm/nvm.sh && nvm install --lts && nvm alias default lts/* && node --version"
```

Note: Using LTS rather than `node` (current) for stability on a production scripts server.

**Step 3: Install pnpm**

```bash
ssh bawler@178.156.233.223 "source ~/.nvm/nvm.sh && corepack enable && corepack prepare pnpm@latest --activate && pnpm --version"
```

**Step 4: Verify**

```bash
ssh bawler@178.156.233.223 "source ~/.nvm/nvm.sh && node --version && pnpm --version && nvm --version"
```

---

### Task 5: Clone repo and checkout zama branch

**Step 1: Clone the repo**

```bash
ssh bawler@178.156.233.223 "git clone git@github-plgenesis:PL-Genesis-2026/insider-streams.git ~/private-streams-zama"
```

**Step 2: Checkout feat/zama-testing branch**

```bash
ssh bawler@178.156.233.223 "cd ~/private-streams-zama && git checkout feat/zama-testing"
```

**Step 3: Install dependencies**

```bash
ssh bawler@178.156.233.223 "source ~/.nvm/nvm.sh && cd ~/private-streams-zama && pnpm install"
```

**Step 4: Create logs directory**

```bash
ssh bawler@178.156.233.223 "mkdir -p ~/private-streams-zama/logs"
```

---

### Task 6: Set up env files

Only `scripts/.env` is needed (no daemon on this VPS).

**Step 1: Copy scripts/.env from source and adapt**

The scripts `.env` needs these changes from the source VPS version:
- `DAEMON_URL=https://api.insider-streams.com/api/zama` (remote daemon, not localhost)
- `NTFY_HOST=https://api.insider-streams.com` (remote ntfy, not localhost:8090)
- Remove `FRONTEND_BASE_URL` (not used by scripts)
- Remove `SUBGRAPH_URL` override (use default from code, or set to production gateway URL)

```bash
# Copy the base env from source, then patch it
ssh bawler@195.201.8.147 "cat ~/private-streams-zama/scripts/.env" | ssh bawler@178.156.233.223 "cat > ~/private-streams-zama/scripts/.env"
```

Then apply patches:

```bash
ssh bawler@178.156.233.223 "cd ~/private-streams-zama && sed -i 's|^DAEMON_URL=.*|DAEMON_URL=https://api.insider-streams.com/api/zama|' scripts/.env && sed -i '/^DAEMON_URL/!{/DAEMON_URL/d}' scripts/.env"
```

Wait — the source scripts `.env` doesn't have `DAEMON_URL` set. We need to add it, and fix `NTFY_HOST` and remove `FRONTEND_BASE_URL`:

```bash
ssh bawler@178.156.233.223 bash -s <<'PATCH_EOF'
cd ~/private-streams-zama

# Add DAEMON_URL (not present in source)
echo '' >> scripts/.env
echo '# Daemon API (remote — daemon runs on 195.201.8.147)' >> scripts/.env
echo 'DAEMON_URL=https://api.insider-streams.com/api/zama' >> scripts/.env

# Fix NTFY_HOST to point to remote ntfy (not localhost)
sed -i 's|^NTFY_HOST=http://localhost:8090|NTFY_HOST=https://api.insider-streams.com|' scripts/.env

# Remove FRONTEND_BASE_URL (not needed)
sed -i '/^FRONTEND_BASE_URL/d' scripts/.env
PATCH_EOF
```

**Step 2: Verify env file**

```bash
ssh bawler@178.156.233.223 "grep -E '(DAEMON_URL|NTFY_HOST|FRONTEND_BASE)' ~/private-streams-zama/scripts/.env"
```

Expected:
```
NTFY_HOST=https://api.insider-streams.com
DAEMON_URL=https://api.insider-streams.com/api/zama
```
(No FRONTEND_BASE_URL line.)

---

### Task 7: Verify setup end-to-end

**Step 1: Verify GitHub access**

```bash
ssh bawler@178.156.233.223 "ssh -T git@github-plgenesis 2>&1"
```

**Step 2: Verify node/pnpm**

```bash
ssh bawler@178.156.233.223 "source ~/.nvm/nvm.sh && node --version && pnpm --version"
```

**Step 3: Verify repo is on correct branch**

```bash
ssh bawler@178.156.233.223 "cd ~/private-streams-zama && git branch --show-current && git log --oneline -1"
```

**Step 4: Verify scripts can parse (dry syntax check)**

```bash
ssh bawler@178.156.233.223 "source ~/.nvm/nvm.sh && cd ~/private-streams-zama/scripts && npx tsx --eval 'console.log(\"tsx works\")'"
```

**Step 5: Verify firewall is active**

```bash
ssh bawler@178.156.233.223 "sudo ufw status"
```

---

### Task 8: Add new VPS to local SSH config

**Step 1: Add entry to ~/.ssh/config**

Add to local `~/.ssh/config`:

```
Host 178.156.233.223
  HostName 178.156.233.223
  User bawler
```

This allows `ssh 178.156.233.223` to connect as `bawler` by default.

---

## NOT in scope (future work)

- Cron job installation on new VPS (will be done when ready to move scripts)
- Removing cron jobs from source VPS
- Systemd services (no daemon runs here)
- HAProxy / SSL (no web services on this VPS)
- Updating `deploy.sh` to target the new VPS for scripts
