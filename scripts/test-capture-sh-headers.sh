#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# Integration test — scripts/camera-node/capture.sh header contract
#
# Runs capture.sh in an isolated temp HOME with shimmed `curl` and
# `rpicam-still`. Each shimmed call logs its arguments to a per-call
# file; the test then asserts the expected auth headers are present
# on each endpoint.
#
# This exists because #341 had the heartbeat header mismatch silently
# for ~6 months. A CI-runnable regression check prevents recurrence
# on any future device-layer change.
#
# Exit codes:
#   0 = all assertions passed
#   1 = any assertion failed
#   2 = test scaffolding error
#
# Usage:
#   ./scripts/test-capture-sh-headers.sh
# ──────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CAPTURE_SH="${REPO_ROOT}/scripts/camera-node/capture.sh"

if [ ! -f "$CAPTURE_SH" ]; then
    echo "[ERROR] capture.sh not found at $CAPTURE_SH" >&2
    exit 2
fi

# ── Temp sandbox ────────────────────────────────────────────────

WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

FAKE_HOME="${WORKDIR}/home"
SHIM_DIR="${WORKDIR}/shim"
CALL_LOG_DIR="${WORKDIR}/calls"
mkdir -p "${FAKE_HOME}/litcrop" "$SHIM_DIR" "$CALL_LOG_DIR"

# ── Fake .env (LITCROP_* prefixed, as the web UI downloads) ─────

cat > "${FAKE_HOME}/litcrop/.env" <<'EOF'
export LITCROP_DEVICE_ID=dev-test-001
export LITCROP_BED_ID=bed-test-001
export LITCROP_API_BASE_URL=https://api.test.invalid
export LITCROP_API_KEY=dk_testkey_abcdef
export LITCROP_CONFIG_URL=https://api.test.invalid/api/v1/devices/dev-test-001/config
export LITCROP_REFRESH_TOKEN=test-refresh-token
export LITCROP_COGNITO_CLIENT_ID=test-client-id
export LITCROP_COGNITO_REGION=ap-northeast-1
EOF
chmod 600 "${FAKE_HOME}/litcrop/.env"

# Pre-seed the sidecar so refresh_token doesn't try to call real Cognito
printf '%s' "fake.jwt.token" > "${FAKE_HOME}/litcrop/.auth-token"
chmod 600 "${FAKE_HOME}/litcrop/.auth-token"

# hardware.conf — Class 2 device (battery sensor, no PIR)
cat > "${FAKE_HOME}/litcrop/hardware.conf" <<'EOF'
HAS_BATTERY_SENSOR=1
HAS_PIR_SENSOR=0
EOF

# ── Shims ───────────────────────────────────────────────────────

# curl shim — logs every invocation to a numbered file, then pretends
# to succeed with a predictable response shape. Each call's argv and
# the config file contents (headers) are captured.
cat > "${SHIM_DIR}/curl" <<'SHIM'
#!/usr/bin/env bash
set -e
LOG_DIR="${CALL_LOG_DIR:?}"
COUNTER_FILE="${LOG_DIR}/.counter"
touch "$COUNTER_FILE"
count=$(cat "$COUNTER_FILE" 2>/dev/null || echo 0)
count=$((count + 1))
echo "$count" > "$COUNTER_FILE"

log_file="${LOG_DIR}/call-${count}.log"
{
    echo "ARGV: $*"
    # If a -K config file was passed, dump its contents for header inspection
    prev=""
    for arg in "$@"; do
        if [ "$prev" = "-K" ] && [ -f "$arg" ]; then
            echo "--- -K config file contents ---"
            cat "$arg"
            echo "--- end ---"
        fi
        prev="$arg"
    done
} > "$log_file"

# Produce a plausible response depending on which endpoint was called.
# Look for the URL (last positional arg typically) and return 200.
if echo "$*" | grep -q '/heartbeat'; then
    # -w "%{http_code}" → just echo the status code
    if echo "$*" | grep -q -- '-w'; then
        printf '{"acknowledged":true}\n200'
    else
        printf '{"acknowledged":true}'
    fi
    exit 0
fi

if echo "$*" | grep -q '/config'; then
    if echo "$*" | grep -q -- '-w'; then
        printf '{"capture_interval":900,"resolution":"1920x1080","jpeg_quality":75,"active_window":{"start":"06:00","end":"18:00"},"trigger_type":"scheduled","bed_id":"bed-test-001","upload_url":"/api/v1/beds/bed-test-001/images","test_shot_requested":false}\n200'
    else
        printf '{"capture_interval":900,"resolution":"1920x1080","jpeg_quality":75,"active_window":{"start":"06:00","end":"18:00"},"trigger_type":"scheduled","bed_id":"bed-test-001","upload_url":"/api/v1/beds/bed-test-001/images","test_shot_requested":false}'
    fi
    exit 0
fi

if echo "$*" | grep -q '/images'; then
    if echo "$*" | grep -q -- '-w'; then
        printf '201'
    else
        printf '{"id":"img-test","status":"accepted"}'
    fi
    exit 0
fi

if echo "$*" | grep -q 'cognito-idp'; then
    # Should not be called because we pre-seeded .auth-token, but handle it
    printf '{"AuthenticationResult":{"IdToken":"new.jwt.token"}}'
    exit 0
fi

# Unknown URL — fail loud so the test can diagnose
echo "[SHIM ERROR] curl shim received unknown call: $*" >&2
exit 99
SHIM
chmod +x "${SHIM_DIR}/curl"

# rpicam-still shim — create a dummy JPEG so capture.sh doesn't bail
cat > "${SHIM_DIR}/rpicam-still" <<'SHIM'
#!/usr/bin/env bash
# Find --output argument and write 4 bytes to it
prev=""
for arg in "$@"; do
    if [ "$prev" = "--output" ]; then
        printf 'JPEG' > "$arg"
        exit 0
    fi
    prev="$arg"
done
exit 0
SHIM
chmod +x "${SHIM_DIR}/rpicam-still"

# ── Run capture.sh in sandbox ───────────────────────────────────

echo "▶ Running capture.sh --once in sandbox..."
if ! HOME="$FAKE_HOME" PATH="${SHIM_DIR}:${PATH}" CALL_LOG_DIR="$CALL_LOG_DIR" \
        bash "$CAPTURE_SH" 2>&1 | sed 's/^/  /'; then
    echo "[WARN] capture.sh exited non-zero — continuing to check captured headers"
fi

# ── Assertions ──────────────────────────────────────────────────

FAIL=0
assert() {
    local label="$1"
    local ok="$2"
    if [ "$ok" = "1" ]; then
        echo "  ✅ $label"
    else
        echo "  ❌ $label"
        FAIL=1
    fi
}

check_request() {
    local endpoint_pattern="$1"
    local header_pattern="$2"
    local label="$3"

    local found=0
    for log in "$CALL_LOG_DIR"/call-*.log; do
        [ -f "$log" ] || continue
        if grep -q "$endpoint_pattern" "$log" && grep -q "$header_pattern" "$log"; then
            found=1
            break
        fi
    done
    assert "$label" "$found"
}

check_not_in_request() {
    local endpoint_pattern="$1"
    local header_pattern="$2"
    local label="$3"

    local violation=0
    for log in "$CALL_LOG_DIR"/call-*.log; do
        [ -f "$log" ] || continue
        if grep -q "$endpoint_pattern" "$log" && grep -q "$header_pattern" "$log"; then
            violation=1
            break
        fi
    done
    [ "$violation" = "0" ] && assert "$label" "1" || assert "$label" "0"
}

echo ""
echo "▶ Checking captured HTTP requests..."

# Heartbeat — must have BOTH auth headers (#341 bug fix)
check_request '/heartbeat' 'Authorization: Bearer' \
    'heartbeat sends Authorization: Bearer'
check_request '/heartbeat' 'X-Device-Key: dk_testkey_abcdef' \
    'heartbeat sends X-Device-Key (#341 fix)'

# Config poll — must have BOTH auth headers (#341 bug fix)
check_request '/config' 'Authorization: Bearer' \
    'config poll sends Authorization: Bearer'
check_request '/config' 'X-Device-Key: dk_testkey_abcdef' \
    'config poll sends X-Device-Key (#341 fix)'

# Upload — must have Authorization but NOT X-Device-Key (JWT-only endpoint)
check_request '/images' 'Authorization: Bearer' \
    'upload sends Authorization: Bearer'
check_not_in_request '/images' 'X-Device-Key' \
    'upload does NOT send X-Device-Key (JWT-only)'

# Dual-auth on the same endpoint — both headers in the same config file
# (not in separate curl calls). This catches the case where someone
# accidentally puts them in sequential printfs that overwrite each other.
DUAL_AUTH_OK=0
for log in "$CALL_LOG_DIR"/call-*.log; do
    [ -f "$log" ] || continue
    if grep -q '/heartbeat' "$log" && \
       grep -q 'Authorization: Bearer' "$log" && \
       grep -q 'X-Device-Key' "$log"; then
        DUAL_AUTH_OK=1
        break
    fi
done
assert 'heartbeat has both auth headers in same -K config file' "$DUAL_AUTH_OK"

echo ""
if [ "$FAIL" = "0" ]; then
    echo "✅ All header assertions passed"
    exit 0
else
    echo "❌ One or more header assertions failed"
    echo ""
    echo "Captured calls for diagnosis:"
    for log in "$CALL_LOG_DIR"/call-*.log; do
        [ -f "$log" ] || continue
        echo "--- $(basename "$log") ---"
        cat "$log"
    done
    exit 1
fi
