#!/usr/bin/env bats
# #454 / ADR-20260419 — capture_interval self-skip gate
#
# Under cron schema v2, install.sh sets cron to `*/5 5-20` (fast tick).
# capture.sh's should_capture_now() throttles the actual capture to the
# UI-configured INTERVAL_SECONDS by checking the mtime of a sidecar
# sentinel file (.last-capture). Heartbeat still fires on the skip
# path — the freshness win that motivates this design.
#
# These tests pin the contract:
#   - Fresh run (no sidecar)         → capture
#   - Recent capture within interval → skip, heartbeat fires
#   - Old capture past interval      → capture
#   - Legacy mode (no INTERVAL_SECONDS) → always capture
#   - test_shot trigger              → always capture (bypass gate)

load 'helpers.bash'

CAPTURE_SH="${BATS_TEST_DIRNAME}/../capture.sh"

setup() {
    setup_mocks
    FAKE_HOME=$(mktemp -d)
    export HOME="$FAKE_HOME"
    mkdir -p "${FAKE_HOME}/litcrop/images" "${FAKE_HOME}/litcrop/logs"
    cat > "${FAKE_HOME}/litcrop/.env" <<'EOF'
LITCROP_DEVICE_ID=dev-test
LITCROP_BED_ID=bed-1
LITCROP_API_BASE_URL=https://api.invalid
LITCROP_API_KEY=dk_test
LITCROP_REFRESH_TOKEN=rt_test
LITCROP_COGNITO_CLIENT_ID=cid
LITCROP_COGNITO_REGION=ap-northeast-1
EOF
    export AUTH_TOKEN='fake-jwt'
    mock_jq_ok
    HEARTBEAT_LOG="${MOCK_STATE_DIR}/heartbeat.log"
    CAPTURE_LOG="${MOCK_STATE_DIR}/capture.log"
    export HEARTBEAT_LOG CAPTURE_LOG
}

teardown() {
    [ -n "${FAKE_HOME:-}" ] && rm -rf "$FAKE_HOME"
    teardown_mocks
}

# Source capture.sh and replace only the physical-effect functions so the
# gate logic runs against realistic poll_config state. The touch that
# capture.sh does on LAST_CAPTURE_FILE after a successful capture is
# preserved — that's what drives the sidecar-mtime-within-interval test.
source_capture_gate() {
    # shellcheck source=/dev/null
    source "$CAPTURE_SH"
    send_heartbeat() { echo "heartbeat" >> "$HEARTBEAT_LOG"; }
    capture()        { echo "capture"   >> "$CAPTURE_LOG"; echo "/tmp/fake.jpg"; }
    upload()         { return 0; }
    upload_spool()   { return 0; }
    refresh_token()  { return 0; }
}

count_lines() { [ -f "$1" ] && wc -l < "$1" | tr -d ' ' || echo 0; }

@test "#454 first run (no .last-capture sidecar) always captures" {
    # INTERVAL_SECONDS=900 (15 min) but no prior capture → gate allows.
    mock_curl '{"resolution":"1920x1080","capture_interval":900,"active_window":{"start":"00:00","end":"23:59"}}' 200
    source_capture_gate
    date() { echo "13:00"; }
    run run_once
    [ "$status" -eq 0 ]
    [ "$(count_lines "$CAPTURE_LOG")"   -eq 1 ]
    [ "$(count_lines "$HEARTBEAT_LOG")" -eq 1 ]
    # Sidecar written post-capture
    [ -f "${FAKE_HOME}/litcrop/.last-capture" ]
}

@test "#454 within-interval fires [SKIP], sends heartbeat, does NOT capture" {
    # Pre-seed a sidecar with an mtime ~30s ago, configure 900s interval.
    # Gate must reject since 30s < 900s.
    mock_curl '{"resolution":"1920x1080","capture_interval":900,"active_window":{"start":"00:00","end":"23:59"}}' 200
    source_capture_gate
    date() { echo "13:00"; }
    touch "${FAKE_HOME}/litcrop/.last-capture"
    run run_once
    [ "$status" -eq 0 ]
    [[ "$output" == *"[SKIP] Interval not elapsed"* ]]
    [ "$(count_lines "$CAPTURE_LOG")"   -eq 0 ]
    [ "$(count_lines "$HEARTBEAT_LOG")" -eq 1 ]
}

@test "#454 past-interval captures (sidecar older than INTERVAL_SECONDS)" {
    # Backdate the sidecar to 1 hour ago, configure 300s interval → allow.
    mock_curl '{"resolution":"1920x1080","capture_interval":300,"active_window":{"start":"00:00","end":"23:59"}}' 200
    source_capture_gate
    date() { echo "13:00"; }
    touch "${FAKE_HOME}/litcrop/.last-capture"
    # Backdate: POSIX touch -d is GNU-specific; fall back to -t format for portability
    touch -d "1 hour ago" "${FAKE_HOME}/litcrop/.last-capture" 2>/dev/null \
        || touch -t "$(date -v-1H '+%Y%m%d%H%M.%S' 2>/dev/null || echo '202001010000.00')" "${FAKE_HOME}/litcrop/.last-capture"
    run run_once
    [ "$status" -eq 0 ]
    [[ "$output" != *"[SKIP] Interval not elapsed"* ]]
    [ "$(count_lines "$CAPTURE_LOG")"   -eq 1 ]
    [ "$(count_lines "$HEARTBEAT_LOG")" -eq 1 ]
}

@test "#454 legacy mode (no capture_interval in config) always captures" {
    # Pre-seed sidecar so if the gate were active, we'd skip. With no
    # INTERVAL_SECONDS the should_capture_now legacy branch must allow.
    mock_curl '{"resolution":"1920x1080","active_window":{"start":"00:00","end":"23:59"}}' 200
    source_capture_gate
    date() { echo "13:00"; }
    touch "${FAKE_HOME}/litcrop/.last-capture"
    run run_once
    [ "$status" -eq 0 ]
    [[ "$output" != *"[SKIP] Interval not elapsed"* ]]
    [ "$(count_lines "$CAPTURE_LOG")" -eq 1 ]
}

@test "#454 test_shot bypasses the interval gate" {
    # Recent sidecar would normally skip, but test_shot_requested=true
    # must override: combines the #287 trigger pathway with the new gate.
    mock_curl '{"resolution":"1920x1080","capture_interval":900,"test_shot_requested":true,"active_window":{"start":"00:00","end":"23:59"}}' 200
    source_capture_gate
    date() { echo "13:00"; }
    touch "${FAKE_HOME}/litcrop/.last-capture"
    run run_once
    [ "$status" -eq 0 ]
    [[ "$output" != *"[SKIP] Interval not elapsed"* ]]
    [ "$(count_lines "$CAPTURE_LOG")" -eq 1 ]
}

@test "#454 touch of .last-capture on successful capture updates mtime" {
    # Verify the sidecar gets refreshed — that's what feeds the NEXT
    # gate decision. Without this, the gate would perma-allow (because
    # the first-run branch would keep firing).
    mock_curl '{"resolution":"1920x1080","capture_interval":900,"active_window":{"start":"00:00","end":"23:59"}}' 200
    source_capture_gate
    date() { echo "13:00"; }
    [ ! -f "${FAKE_HOME}/litcrop/.last-capture" ]
    run_once
    [ -f "${FAKE_HOME}/litcrop/.last-capture" ]
    # Second invocation (immediately after) should SKIP — sidecar is fresh.
    run run_once
    [[ "$output" == *"[SKIP] Interval not elapsed"* ]]
    [ "$(count_lines "$CAPTURE_LOG")" -eq 1 ]     # still just the first capture
    [ "$(count_lines "$HEARTBEAT_LOG")" -eq 2 ]   # two heartbeats (capture + skip)
}
