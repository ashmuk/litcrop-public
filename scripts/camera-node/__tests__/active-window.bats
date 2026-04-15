#!/usr/bin/env bats
# T-395-03 — in_active_window() + run_once() gating
#
# Verifies:
#   - Outside the active window, run_once calls send_heartbeat exactly once
#     and does NOT invoke capture/upload.
#   - Inside the active window, run_once proceeds to capture/upload/heartbeat
#     and send_heartbeat is still called exactly once.
#   - test_shot trigger bypasses the window check.
#   - A cross-midnight window (end <= start) logs a warning and falls back
#     to 05:00-20:00.

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
    # Mock curl with an empty 200 so poll_config doesn't fail the run. Individual
    # tests override ACTIVE_WINDOW_* *after* source_capture so poll_config's
    # defaults don't clobber them.
    mock_curl '{}' 200
    HEARTBEAT_LOG="${MOCK_STATE_DIR}/heartbeat.log"
    CAPTURE_LOG="${MOCK_STATE_DIR}/capture.log"
    export HEARTBEAT_LOG CAPTURE_LOG
}

teardown() {
    [ -n "${FAKE_HOME:-}" ] && rm -rf "$FAKE_HOME"
    teardown_mocks
}

source_capture() {
    # shellcheck source=/dev/null
    source "$CAPTURE_SH"
    # Override heavyweight functions with recording stubs — unit tests don't
    # want to exec curl, rpicam-still, or sleep.
    send_heartbeat() { echo "heartbeat" >> "$HEARTBEAT_LOG"; }
    capture()        { echo "capture"   >> "$CAPTURE_LOG"; echo "/tmp/fake.jpg"; }
    upload()         { return 0; }
    upload_spool()   { return 0; }
    refresh_token()  { return 0; }
    poll_config()    { return 0; }  # leave ACTIVE_WINDOW_* untouched
}

count_lines() { [ -f "$1" ] && wc -l < "$1" | tr -d ' ' || echo 0; }

@test "outside active window: SKIP log + exactly one heartbeat, no capture" {
    source_capture
    ACTIVE_WINDOW_START="05:00"
    ACTIVE_WINDOW_END="12:00"
    # Pin now to 13:00
    date() { echo "13:00"; }
    run run_once
    [ "$status" -eq 0 ]
    [[ "$output" == *"[SKIP]"* ]]
    [ "$(count_lines "$HEARTBEAT_LOG")" -eq 1 ]
    [ "$(count_lines "$CAPTURE_LOG")"   -eq 0 ]
}

@test "inside active window: capture runs and heartbeat fires exactly once" {
    source_capture
    ACTIVE_WINDOW_START="05:00"
    ACTIVE_WINDOW_END="23:59"
    date() { echo "13:00"; }
    run run_once
    [ "$status" -eq 0 ]
    [[ "$output" != *"[SKIP]"* ]]
    [ "$(count_lines "$HEARTBEAT_LOG")" -eq 1 ]
    [ "$(count_lines "$CAPTURE_LOG")"   -eq 1 ]
}

@test "test_shot trigger bypasses the window check" {
    source_capture
    ACTIVE_WINDOW_START="05:00"
    ACTIVE_WINDOW_END="12:00"
    TRIGGER="test_shot"
    date() { echo "13:00"; }
    run run_once
    [ "$status" -eq 0 ]
    [[ "$output" != *"[SKIP]"* ]]
    [ "$(count_lines "$CAPTURE_LOG")" -eq 1 ]
}

@test "cross-midnight window logs a warning and falls back to 05:00-20:00" {
    source_capture
    ACTIVE_WINDOW_START="22:00"
    ACTIVE_WINDOW_END="04:00"
    date() { echo "13:00"; }
    run in_active_window
    [ "$status" -eq 0 ]
    [[ "$output" == *"cross-midnight"* ]]
}

@test "boundary: exactly at window start is inside" {
    source_capture
    ACTIVE_WINDOW_START="05:00"
    ACTIVE_WINDOW_END="20:00"
    date() { echo "05:00"; }
    run in_active_window
    [ "$status" -eq 0 ]
}

@test "boundary: exactly at window end is outside" {
    source_capture
    ACTIVE_WINDOW_START="05:00"
    ACTIVE_WINDOW_END="20:00"
    date() { echo "20:00"; }
    run in_active_window
    [ "$status" -ne 0 ]
}
