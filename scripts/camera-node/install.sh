#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# LitCrop Camera Node — Install Script
#
# Run ON THE PI after copying this directory to the Pi.
# Sets up directories, installs scripts, creates config, and
# optionally configures a systemd timer for scheduled capture.
#
# Usage:
#   # From your dev machine — copy the camera-node directory to the Pi:
#   scp -r scripts/camera-node litcrop@litcrop-cam-01.local:/tmp/litcrop-install
#
#   # SSH into the Pi and run:
#   ssh litcrop@litcrop-cam-01.local
#   cd /tmp/litcrop-install
#   sudo bash install.sh
#
# What this script does:
#   1. Creates /opt/litcrop/, /etc/litcrop/, /var/spool/litcrop/
#   2. Copies capture.sh and refresh-token.sh to /opt/litcrop/
#   3. Creates /etc/litcrop/node.conf from template (if not exists)
#   4. Installs curl (if missing)
#   5. Optionally sets up systemd timer for scheduled capture
#   6. Optionally installs AWS CLI for token refresh
# ──────────────────────────────────────────────────────────────────

set -euo pipefail

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; }

# ── Check root ───────────────────────────────────────────────────

if [ "$(id -u)" -ne 0 ]; then
    error "This script must be run as root (use: sudo bash install.sh)"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   LitCrop Camera Node — Install          ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── Step 1: Create directories ───────────────────────────────────

info "Creating directories..."
mkdir -p /opt/litcrop
mkdir -p /etc/litcrop
mkdir -p /var/spool/litcrop
mkdir -p /var/log

# ── Step 2: Install scripts ──────────────────────────────────────

info "Installing capture script → /opt/litcrop/capture.sh"
cp "${SCRIPT_DIR}/capture.sh" /opt/litcrop/capture.sh
chmod +x /opt/litcrop/capture.sh

info "Installing refresh script → /opt/litcrop/refresh-token.sh"
cp "${SCRIPT_DIR}/refresh-token.sh" /opt/litcrop/refresh-token.sh
chmod +x /opt/litcrop/refresh-token.sh

# ── Step 3: Create config ────────────────────────────────────────

if [ -f /etc/litcrop/node.conf ]; then
    warn "Config exists at /etc/litcrop/node.conf — skipping (not overwriting)"
else
    info "Creating config → /etc/litcrop/node.conf"
    cp "${SCRIPT_DIR}/node.conf.example" /etc/litcrop/node.conf
    warn "You MUST edit /etc/litcrop/node.conf before first run!"
    warn "  Required: BED_ID, API_BASE_URL, AUTH_TOKEN"
fi

# ── Step 4: Install dependencies ─────────────────────────────────

if command -v curl &>/dev/null; then
    info "curl is installed"
else
    info "Installing curl..."
    apt-get update -qq && apt-get install -y -qq curl
fi

# ── Step 5: Verify camera ────────────────────────────────────────

echo ""
info "Checking camera..."
if command -v rpicam-still &>/dev/null; then
    info "rpicam-still is available"
    # Try to detect camera
    if rpicam-hello --list-cameras 2>&1 | grep -q "Available cameras : 0"; then
        warn "No camera detected! Check the ribbon cable connection."
    else
        info "Camera detected"
    fi
elif command -v libcamera-still &>/dev/null; then
    warn "Found libcamera-still (older Pi OS). Creating symlink to rpicam-still..."
    ln -sf "$(command -v libcamera-still)" /usr/local/bin/rpicam-still
    info "Symlink created: rpicam-still → libcamera-still"
else
    warn "No camera tools found. Install with: sudo apt install rpicam-apps-lite"
fi

# ── Step 6: Systemd timer (optional) ─────────────────────────────

echo ""
read -rp "Set up systemd timer for scheduled capture? [y/N] " setup_timer

if [[ "$setup_timer" =~ ^[Yy]$ ]]; then
    read -rp "Capture interval in minutes [10]: " interval_min
    interval_min="${interval_min:-10}"

    info "Creating systemd service..."
    cat > /etc/systemd/system/litcrop-capture.service << 'EOF'
[Unit]
Description=LitCrop Camera Capture
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/opt/litcrop/capture.sh
User=root
StandardOutput=append:/var/log/litcrop-node.log
StandardError=append:/var/log/litcrop-node.log
EOF

    info "Creating systemd timer (every ${interval_min} minutes)..."
    cat > /etc/systemd/system/litcrop-capture.timer << EOF
[Unit]
Description=LitCrop Capture Timer (every ${interval_min} minutes)

[Timer]
OnCalendar=*:0/${interval_min}
Persistent=true

[Install]
WantedBy=timers.target
EOF

    systemctl daemon-reload
    info "Timer created. Enable after configuring node.conf:"
    echo "    sudo systemctl enable litcrop-capture.timer"
    echo "    sudo systemctl start litcrop-capture.timer"
fi

# ── Step 7: Token refresh cron (optional) ─────────────────────────

echo ""
read -rp "Set up token refresh cron (every 50 minutes)? [y/N] " setup_refresh

if [[ "$setup_refresh" =~ ^[Yy]$ ]]; then
    if command -v aws &>/dev/null; then
        info "AWS CLI is installed"
    else
        warn "AWS CLI not found. Installing..."
        apt-get install -y -qq python3-pip
        pip3 install awscli --break-system-packages --quiet 2>/dev/null || \
            pip3 install awscli --quiet
        info "AWS CLI installed"
    fi

    # Add cron entry (idempotent — check if already exists)
    CRON_LINE="*/50 * * * * /opt/litcrop/refresh-token.sh"
    if crontab -l 2>/dev/null | grep -qF "refresh-token.sh"; then
        warn "Token refresh cron already exists — skipping"
    else
        (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
        info "Token refresh cron added (every 50 minutes)"
    fi

    warn "You MUST set REFRESH_TOKEN and COGNITO_CLIENT_ID in /etc/litcrop/node.conf"
fi

# ── Done ─────────────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   Installation complete!                  ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo "  1. Edit config:    sudo nano /etc/litcrop/node.conf"
echo "     Set: BED_ID, API_BASE_URL, AUTH_TOKEN"
echo "     (See docs/CAMERA-NODE-SETUP.md §4-5 for how to get these values)"
echo ""
echo "  2. Test capture:   sudo /opt/litcrop/capture.sh"
echo "     Check log:      cat /var/log/litcrop-node.log"
echo ""
echo "  3. Start timer:    sudo systemctl enable --now litcrop-capture.timer"
echo "     Check status:   systemctl status litcrop-capture.timer"
echo ""
echo "  4. Verify in app:  Open LitCrop → your bed → image should appear"
echo ""
