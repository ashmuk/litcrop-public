#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# LitCrop Camera Node — Install Script
#
# Sets up ~/litcrop/ directory structure, installs capture.sh,
# and configures a cron job for scheduled capture.
# Does NOT require sudo for the core setup.
#
# Usage:
#   curl -sL https://raw.githubusercontent.com/ashmuk/litcrop/main/scripts/camera-node/install.sh | bash
#
#   Or manually:
#   scp scripts/camera-node/* pi@host:/tmp/litcrop-setup/
#   ssh pi@host "bash /tmp/litcrop-setup/install.sh"
#
# After install, copy your .env file:
#   scp litcrop-dev-xxx.env pi@host:~/litcrop/.env
# ──────────────────────────────────────────────────────────────────

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; }

LITCROP_DIR="${HOME}/litcrop"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}" 2>/dev/null)" && pwd 2>/dev/null || echo "/tmp/litcrop-setup")"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   LitCrop Camera Node — Install          ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── Step 1: Create ~/litcrop/ structure ─────────────────────────

info "Creating ${LITCROP_DIR}/ directory structure..."
mkdir -p "${LITCROP_DIR}"
mkdir -p "${LITCROP_DIR}/images"
mkdir -p "${LITCROP_DIR}/logs"
chmod 700 "${LITCROP_DIR}"

# ── Step 2: Install capture script ──────────────────────────────

if [ -f "${SCRIPT_DIR}/capture.sh" ]; then
    info "Installing capture.sh from local files"
    cp "${SCRIPT_DIR}/capture.sh" "${LITCROP_DIR}/capture.sh"
else
    info "Downloading capture.sh from GitHub..."
    curl -sL "https://raw.githubusercontent.com/ashmuk/litcrop/main/scripts/camera-node/capture.sh" \
        -o "${LITCROP_DIR}/capture.sh" || {
        error "Failed to download capture.sh"
        exit 1
    }
fi
chmod 700 "${LITCROP_DIR}/capture.sh"

# ── Step 3: Check dependencies ──────────────────────────────────

echo ""
info "Checking dependencies..."

if command -v curl &>/dev/null; then
    info "  curl — installed"
else
    warn "  curl — NOT found. Install: sudo apt install curl"
fi

if command -v jq &>/dev/null; then
    info "  jq — installed"
else
    warn "  jq — NOT found (optional, for config polling). Install: sudo apt install jq"
fi

# ── Step 4: Check camera ────────────────────────────────────────

echo ""
info "Checking camera..."

if command -v rpicam-still &>/dev/null; then
    info "  rpicam-still — available"
    if rpicam-hello --list-cameras 2>&1 | grep -q "Available cameras : 0"; then
        warn "  No camera detected! Check ribbon cable."
    else
        info "  Camera detected"
    fi
elif command -v libcamera-still &>/dev/null; then
    warn "  Found libcamera-still (older Pi OS)"
    warn "  Create symlink: sudo ln -sf \$(command -v libcamera-still) /usr/local/bin/rpicam-still"
else
    warn "  No camera tools found. Install: sudo apt install rpicam-apps-lite"
fi

# ── Step 5: Set up cron job ─────────────────────────────────────

echo ""
CRON_LINE="*/30 5-20 * * * ${LITCROP_DIR}/capture.sh >> ${LITCROP_DIR}/logs/capture.log 2>&1"

if crontab -l 2>/dev/null | grep -qF "capture.sh"; then
    warn "Cron job already exists — skipping"
else
    read -rp "Set up cron job for scheduled capture every 30 min (5am-8pm)? [Y/n] " setup_cron
    setup_cron="${setup_cron:-Y}"
    if [[ "$setup_cron" =~ ^[Yy]$ ]]; then
        (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
        info "Cron job added: every 30 minutes, 5am-8pm"
    else
        info "Skipped cron setup — you can add manually later:"
        echo "    (crontab -l; echo '${CRON_LINE}') | crontab -"
    fi
fi

# ── Step 6: Check for .env ──────────────────────────────────────

echo ""
if [ -f "${LITCROP_DIR}/.env" ]; then
    info ".env file found"
else
    warn "No .env file found at ${LITCROP_DIR}/.env"
    warn "Download from: LitCrop web app → Devices → your device → Download .env"
    warn "Then copy to Pi:  scp litcrop-dev-xxx.env pi@$(hostname):~/litcrop/.env"
fi

# ── Done ────────────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   Installation complete!                  ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "Directory structure:"
echo "  ~/litcrop/"
echo "  ├── .env             ← credentials (download from web UI)"
echo "  ├── capture.sh       ← capture + upload + heartbeat"
echo "  ├── images/          ← photo spool (auto-cleaned after upload)"
echo "  └── logs/"
echo "      └── capture.log  ← rotated at 1 MB"
echo ""
echo "Next steps:"
echo "  1. Copy .env:     scp litcrop-dev-xxx.env pi@$(hostname):~/litcrop/.env"
echo "  2. Test capture:  ~/litcrop/capture.sh"
echo "  3. Check log:     cat ~/litcrop/logs/capture.log"
echo "  4. Verify in app: Open LitCrop → your bed → image should appear"
echo ""
