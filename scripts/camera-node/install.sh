#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# LitCrop Camera Node — Install Script
#
# Sets up ~/litcrop/ directory structure, installs capture.sh,
# and configures a cron job for scheduled capture.
# Does NOT require sudo for the core setup.
#
# Usage:
#   Production (main):
#     curl -sL https://litcrop.com/install.sh | bash
#
#   Staging (ahead of main — pull matching capture.sh from develop):
#     curl -sL https://<staging>/install.sh | bash -s -- --branch=develop
#
#   Or directly from GitHub:
#     curl -sL https://raw.githubusercontent.com/ashmuk/litcrop/main/scripts/camera-node/install.sh | bash
#
#   Or manually (preferred for dev — SCRIPT_DIR/capture.sh wins over download):
#     scp scripts/camera-node/* pi@host:/tmp/litcrop-setup/
#     ssh pi@host "bash /tmp/litcrop-setup/install.sh"
#
# Flags:
#   --branch=<name>   Git branch to download capture.sh from (default: main)
#   --non-interactive Suppress prompts; use auto-detected hardware flags
#
# After install, copy your .env file:
#   scp litcrop-dev-xxx.env pi@host:~/litcrop/.env
# ──────────────────────────────────────────────────────────────────

set -euo pipefail

# Detect if running interactively (stdin is a TTY) vs piped from curl
if [ -t 0 ]; then
  INTERACTIVE=1
else
  INTERACTIVE=0
fi

# #404: which branch of ashmuk/litcrop to pull capture.sh from when no
# local copy is available. Default is `main` so production install URLs
# keep working unchanged. Staging callers pass --branch=develop to get
# matching capture.sh for whatever is currently deployed to staging.
BRANCH="main"
for arg in "$@"; do
    case "$arg" in
        --branch=*) BRANCH="${arg#*=}" ;;
        --non-interactive) INTERACTIVE=0 ;;
        --help|-h)
            echo "Usage: $(basename "$0") [--branch=<name>] [--non-interactive]"
            echo "  --branch=<name>    Git branch for capture.sh download (default: main)"
            echo "  --non-interactive  Skip prompts; auto-detect hardware"
            exit 0
            ;;
        # Reject unknown arguments loudly. A silent-ignore of a typo like
        # `--branche=develop` would fall back to main and silently download
        # the wrong capture.sh — exactly the bug #404 closes.
        *)
            echo "[✗] Unknown argument: '${arg}'. See --help." >&2
            exit 2
            ;;
    esac
done

# Validate BRANCH before it reaches the curl URL. Without this guard,
# `--branch=../../evil-org/evil-repo/main` normalizes inside curl to a
# different GitHub owner/repo and the returned capture.sh is then
# chmod 700 and cron'd — full RCE as the Pi user.
# Git branch names legitimately include `/` (feature/foo), `-`, `_`, `.`,
# and alphanumerics. Anything else, or `..`, or leading/trailing `/`, is
# either invalid or an injection attempt — refuse.
case "$BRANCH" in
    ""|*..*|/*|*/|*[!a-zA-Z0-9._/-]*)
        echo "[✗] Invalid --branch value: '${BRANCH}'. Allowed: [a-zA-Z0-9._/-], no '..', no leading/trailing slash." >&2
        exit 2
        ;;
esac

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
    # #404: branch-aware download. Pulls from whatever branch the caller
    # named (default main). Prevents the "install.sh from staging v0.97
    # downloads capture.sh from main v0.93" footgun.
    info "Downloading capture.sh from GitHub (branch: ${BRANCH})..."
    curl -sL "https://raw.githubusercontent.com/ashmuk/litcrop/${BRANCH}/scripts/camera-node/capture.sh" \
        -o "${LITCROP_DIR}/capture.sh" || {
        error "Failed to download capture.sh from branch '${BRANCH}'"
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
    # jq is required as of #395 Phase 0 — the Pi silently falls back to
    # compiled defaults without it, and UI-side config changes never reach
    # the device. Offer to install when we have a TTY; fail loud otherwise.
    warn "  jq — NOT found (REQUIRED for UI-controlled config polling)"
    if [ "$INTERACTIVE" = 1 ]; then
        read -rp "  Install jq now via apt-get? [Y/n] " jq_answer
        jq_answer="${jq_answer:-Y}"
        if [[ "$jq_answer" =~ ^[Yy]$ ]]; then
            if sudo apt-get update && sudo apt-get install -y jq; then
                info "  jq — installed via apt"
            else
                warn "  apt-get failed — install manually: sudo apt install jq"
            fi
        else
            warn "  Skipped jq install. Your device will ignore resolution,"
            warn "  capture_interval, and active_window set from the web UI."
        fi
    else
        warn "  Non-interactive mode. Install before running capture.sh:"
        warn "    sudo apt-get update && sudo apt-get install -y jq"
    fi
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

if ! command -v crontab >/dev/null 2>&1; then
    # Phase 1 targets systemd timers; for now just warn loudly so the
    # operator knows they need to run capture.sh some other way.
    warn "crontab not installed — skipping cron setup"
    warn "Run capture.sh manually or via systemd: ~/litcrop/capture.sh"
elif crontab -l 2>/dev/null | grep -qF "capture.sh"; then
    warn "Cron job already exists — skipping"
else
    if [ "$INTERACTIVE" = 1 ]; then
      read -rp "Set up cron job for scheduled capture every 30 min (5am-8pm)? [Y/n] " setup_cron
      setup_cron="${setup_cron:-Y}"
    else
      setup_cron="Y"
      info "Non-interactive mode: auto-enabling cron job"
    fi
    if [[ "$setup_cron" =~ ^[Yy]$ ]]; then
        (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
        info "Cron job added: every 30 minutes, 5am-8pm"
    else
        info "Skipped cron setup — you can add manually later:"
        echo "    (crontab -l; echo '${CRON_LINE}') | crontab -"
    fi
fi

# ── Step 6: Hardware auto-detection (#405) ─────────────────────
#
# Pre-#405: prompted interactively, defaulted to 0/0 (Class-1) in
# non-interactive mode. That silently misclassified every Pi installed
# via `curl | bash` — the scp-workaround also runs non-interactively
# (ssh + bash). Real hardware was present but the UI showed Class-1.
#
# Now: probe the actual hardware. /sys/class/power_supply/*/capacity is
# the standard Linux interface for battery HATs; cgsensor is the RPZ-PIRS
# binary. Detection matches DESIGNS-395 §3.4 which Phase 1 T-395-N1-05
# will formalize across the broader install rewrite.

echo ""
echo "== Hardware Detection (Device Tier) =="

HAS_BATTERY_SENSOR=0
HAS_PIR_SENSOR=0

# Battery HAT — filter sysfs entries by `type == Battery`. The raw
# `/sys/class/power_supply/*/capacity` glob also matches USB chargers
# and AC adapters on headless Pis that expose mains power without a
# battery, which would falsely classify a Class-1 device as Class-2.
for _ps_dir in /sys/class/power_supply/*/; do
    [ -d "$_ps_dir" ] || continue
    if [ "$(cat "${_ps_dir}type" 2>/dev/null)" = "Battery" ]; then
        HAS_BATTERY_SENSOR=1
        break
    fi
done
unset _ps_dir

# PIR motion sensor — gated by whether the RPZ-PIRS userland binary
# `cgsensor` is installed and on PATH. PATH-only detection is a known
# limitation (a same-named unrelated binary would false-positive);
# acceptable for pilot scope, reviewed as NITPICK.
if command -v cgsensor >/dev/null 2>&1; then
    HAS_PIR_SENSOR=1
fi

info "Detected: HAS_BATTERY_SENSOR=${HAS_BATTERY_SENSOR} HAS_PIR_SENSOR=${HAS_PIR_SENSOR}"

# Allow interactive override so a user whose sensor is temporarily
# disconnected (or wired but not yet enabled) can self-declare the
# target tier without editing hardware.conf by hand.
#
# Empty answer = keep the auto-detected value. Previously the defaults
# were hard-coded to 0 before reading, so an operator hitting Enter
# through the prompts silently lost their Class-3 detection.
if [ "$INTERACTIVE" = 1 ]; then
    echo "  (Class 1 = no sensors, Class 2 = battery only, Class 3 = + PIR)"
    read -rp "Override detected values? [y/N] " override
    if [[ "$override" =~ ^[yY]$ ]]; then
        read -rp "Has battery HAT? [y/N, Enter=keep detected=${HAS_BATTERY_SENSOR}] " battery_answer
        case "$battery_answer" in
            [yY]*) HAS_BATTERY_SENSOR=1 ;;
            [nN]*) HAS_BATTERY_SENSOR=0 ;;
            "")    : ;;  # keep detected value
        esac

        read -rp "Has PIR motion sensor? [y/N, Enter=keep detected=${HAS_PIR_SENSOR}] " pir_answer
        case "$pir_answer" in
            [yY]*) HAS_PIR_SENSOR=1 ;;
            [nN]*) HAS_PIR_SENSOR=0 ;;
            "")    : ;;  # keep detected value
        esac
    fi
fi

# Write hardware flags to a dedicated file (not .env — keeps credentials
# separate from hardware config, so .env can be overwritten safely)
cat > "${LITCROP_DIR}/hardware.conf" <<EOF
# LitCrop hardware configuration (auto-detected by install.sh)
HAS_BATTERY_SENSOR=${HAS_BATTERY_SENSOR}
HAS_PIR_SENSOR=${HAS_PIR_SENSOR}
EOF
chmod 600 "${LITCROP_DIR}/hardware.conf"
info "Hardware flags saved to ${LITCROP_DIR}/hardware.conf"

# ── Step 7: Check for .env ──────────────────────────────────────

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

# If the cron step was skipped (crontab binary absent), re-state it in the
# final banner so the operator can't miss the fact that nothing will
# trigger capture.sh automatically.
if ! command -v crontab >/dev/null 2>&1; then
    warn "No scheduler configured — capture.sh will NOT run automatically."
    warn "Phase 1 will ship systemd timers. For now, wire up a scheduler manually."
    echo ""
fi
echo "Directory structure:"
echo "  ~/litcrop/"
echo "  ├── .env             ← credentials (download from web UI)"
echo "  ├── hardware.conf    ← HAS_BATTERY_SENSOR / HAS_PIR_SENSOR flags"
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
