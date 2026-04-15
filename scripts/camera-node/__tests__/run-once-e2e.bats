#!/usr/bin/env bats
# cc-test gap #2 — end-to-end run_once with REAL poll_config applied
#
# active-window.bats stubs poll_config() to a no-op so it can pin
# in_active_window()/run_once() gating in isolation. That misses the
# integration case: does a freshly-polled active_window from the API
# actually reach the run_once gate, or does a schema-vs-regex mismatch
# cause silent default-fallthrough?
#
# These tests mock curl with a realistic API fixture, let the actual
# poll_config run, then assert that the values that reached the exported
# shell state are the ones the run_once gate reads.

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

# Source capture.sh but replace only the physical-effect functions — NOT
# poll_config, NOT in_active_window. The whole point is to verify those
# two interact correctly end-to-end.
source_capture_e2e() {
    # shellcheck source=/dev/null
    source "$CAPTURE_SH"
    send_heartbeat() { echo "heartbeat" >> "$HEARTBEAT_LOG"; }
    capture()        { echo "capture"   >> "$CAPTURE_LOG"; echo "/tmp/fake.jpg"; }
    upload()         { return 0; }
    upload_spool()   { return 0; }
    refresh_token()  { return 0; }
}

count_lines() { [ -f "$1" ] && wc -l < "$1" | tr -d ' ' || echo 0; }

@test "e2e: API-pushed window closed in the past → run_once hits [SKIP]" {
    # Push a window that ended one minute before "now" (mocked to 13:00).
    mock_curl '{"resolution":"1920x1080","active_window":{"start":"05:00","end":"12:59"}}' 200
    source_capture_e2e
    date() { echo "13:00"; }
    run run_once
    [ "$status" -eq 0 ]
    [[ "$output" == *"[SKIP]"* ]]
    [ "$(count_lines "$HEARTBEAT_LOG")" -eq 1 ]
    [ "$(count_lines "$CAPTURE_LOG")"   -eq 0 ]
}

@test "e2e: API-pushed window open through the day → run_once captures" {
    mock_curl '{"resolution":"1280x720","active_window":{"start":"05:00","end":"23:59"}}' 200
    source_capture_e2e
    date() { echo "13:00"; }
    run run_once
    [ "$status" -eq 0 ]
    [[ "$output" != *"[SKIP]"* ]]
    [ "$(count_lines "$CAPTURE_LOG")"   -eq 1 ]
    [ "$(count_lines "$HEARTBEAT_LOG")" -eq 1 ]
}

@test "e2e: API-pushed resolution 1280x720 reaches CAPTURE_WIDTH through a full run_once" {
    # This is the exact defect that silent jq-fallthrough caused on-Pi:
    # the API-pushed resolution must be observable in the exported shell
    # state after poll_config runs inside run_once.
    mock_curl '{"resolution":"1280x720","active_window":{"start":"05:00","end":"23:59"}}' 200
    source_capture_e2e
    date() { echo "13:00"; }
    run_once
    [ "$CAPTURE_WIDTH"  = "1280" ]
    [ "$CAPTURE_HEIGHT" = "720" ]
}

@test "e2e: API test_shot_requested=true bypasses a closed active_window" {
    # Combines the LITCROP_TRIGGER pathway with the window gate — the
    # Phase-0 contract the unit-level tests can't cover together.
    mock_curl '{"resolution":"1920x1080","test_shot_requested":true,"active_window":{"start":"05:00","end":"05:01"}}' 200
    source_capture_e2e
    date() { echo "13:00"; }
    run run_once
    [ "$status" -eq 0 ]
    [[ "$output" != *"[SKIP]"* ]]
    [ "$(count_lines "$CAPTURE_LOG")" -eq 1 ]
}
