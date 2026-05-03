#!/bin/bash
# ════════════════════════════════════════════════════════════════════
# CLARK WhatsApp Bridge — VPS Setup Script
# ────────────────────────────────────────────────────────────────────
# This script installs everything needed to run the bridge on a fresh
# Ubuntu 22.04 / 24.04 VPS:
#
#   1. System updates
#   2. Docker + Docker Compose
#   3. UFW firewall (ports 22, 80, 443 only)
#   4. Bridge configuration (.env)
#   5. Build + start bridge + Caddy
#
# Usage (as root):
#   chmod +x setup-vps.sh
#   ./setup-vps.sh
#
# Or one-liner:
#   curl -sSL <url-to-this-script> | bash
# ════════════════════════════════════════════════════════════════════

set -e  # Exit on any error

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"; }
ok()  { echo -e "${GREEN}✓${NC} $1"; }
warn(){ echo -e "${YELLOW}⚠${NC} $1"; }
err() { echo -e "${RED}✗${NC} $1"; }

# ─── Pre-flight checks ─────────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
  err "Run this script as root: sudo ./setup-vps.sh"
  exit 1
fi

if [ ! -f "docker-compose.yml" ]; then
  err "docker-compose.yml not found in current directory."
  err "Make sure you're running this from the clark-wa-bridge folder."
  exit 1
fi

# ─── Step 1: System update ─────────────────────────────────────────
log "Step 1/6: Updating system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl ca-certificates ufw openssl
ok "System updated"

# ─── Step 2: Docker + Compose ──────────────────────────────────────
if command -v docker &> /dev/null; then
  ok "Docker already installed: $(docker --version)"
else
  log "Step 2/6: Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  ok "Docker installed: $(docker --version)"
fi

if docker compose version &> /dev/null; then
  ok "Docker Compose already available: $(docker compose version --short)"
else
  log "Installing Docker Compose plugin..."
  apt-get install -y docker-compose-plugin -qq
  ok "Docker Compose installed"
fi

# ─── Step 3: Firewall ──────────────────────────────────────────────
log "Step 3/6: Configuring firewall (UFW)..."
ufw --force reset > /dev/null 2>&1
ufw default deny incoming > /dev/null
ufw default allow outgoing > /dev/null
ufw allow 22/tcp comment "SSH" > /dev/null
ufw allow 80/tcp comment "HTTP (for Let's Encrypt)" > /dev/null
ufw allow 443/tcp comment "HTTPS" > /dev/null
ufw --force enable > /dev/null
ok "Firewall: ports 22, 80, 443 open"

# ─── Step 4: .env file ─────────────────────────────────────────────
log "Step 4/6: Configuring environment..."

if [ -f ".env" ]; then
  warn ".env already exists. Keeping current values."
  warn "  (Delete .env first if you want a fresh setup.)"
else
  if [ -z "$DOMAIN" ]; then
    read -rp "Enter your domain (e.g., clark-rmg.duckdns.org): " DOMAIN
  fi
  if [ -z "$DOMAIN" ]; then
    err "Domain cannot be empty."
    exit 1
  fi

  if [ -z "$AUTH_TOKEN" ]; then
    AUTH_TOKEN=$(openssl rand -hex 32)
    ok "Generated auth token: $AUTH_TOKEN"
    echo -e "${YELLOW}!! SAVE THIS TOKEN — you'll need it in CLARK !!${NC}"
  fi

  cat > .env <<EOF
DOMAIN=$DOMAIN
AUTH_TOKEN=$AUTH_TOKEN
TZ=Africa/Cairo
EOF
  ok ".env created"
fi

# Print final config
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Configuration:"
grep -E "^(DOMAIN|AUTH_TOKEN|TZ)=" .env | sed 's/AUTH_TOKEN=\(.\{8\}\).*/AUTH_TOKEN=\1•••••••• (full value in .env)/'
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ─── Step 5: Build & start ─────────────────────────────────────────
log "Step 5/6: Building bridge image (first time takes 3-5 min)..."
docker compose build --quiet

log "Starting services..."
docker compose up -d

# ─── Step 6: Health check ──────────────────────────────────────────
log "Step 6/6: Waiting for services to be ready..."
sleep 10

for i in {1..6}; do
  if docker compose ps | grep -q "Up"; then
    ok "Containers running"
    break
  fi
  log "  ...still starting (attempt $i/6)"
  sleep 5
done

# Show status
echo ""
docker compose ps
echo ""

# ─── Final instructions ────────────────────────────────────────────
DOMAIN_VALUE=$(grep "^DOMAIN=" .env | cut -d= -f2)
TOKEN_VALUE=$(grep "^AUTH_TOKEN=" .env | cut -d= -f2)

cat <<EOF

╔════════════════════════════════════════════════════════════════╗
║  ${GREEN}✓ Setup complete!${NC}                                          ║
╚════════════════════════════════════════════════════════════════╝

Your bridge is now running. Next steps:

  1. ${BLUE}Wait 30-60 seconds${NC} for Caddy to obtain HTTPS certificate
     from Let's Encrypt (first time only).

  2. ${BLUE}Open in browser:${NC}
     https://$DOMAIN_VALUE

     You should see the bridge status page with a QR code.

  3. ${BLUE}Scan the QR with WhatsApp${NC} on your secondary phone:
     WhatsApp → Settings → Linked Devices → Link a Device

  4. ${BLUE}In CLARK:${NC}
     Campaigns → ⚙️ بريدج → Settings:
       URL:   https://$DOMAIN_VALUE
       Token: $TOKEN_VALUE

  5. Click "Test Connection" — should show ✓ Connected

────────────────────────────────────────────────────────────────
${YELLOW}Useful commands:${NC}
  View logs:      docker compose logs -f
  Restart:        docker compose restart
  Stop:           docker compose down
  Update:         git pull && docker compose up -d --build
  View status:    curl https://$DOMAIN_VALUE/status
────────────────────────────────────────────────────────────────

EOF
