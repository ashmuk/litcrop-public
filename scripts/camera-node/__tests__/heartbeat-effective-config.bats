#!/usr/bin/env bats
# #406-c — send_heartbeat includes effective_config echoing runtime values
#
# The Pi sends its current runtime config (resolution, jpeg_quality,
# capture_interval, active_window) alongside health telemetry so the web
# UI can render an Applied / Pending / Offline badge. This test captures
# the JSON payload the Pi pipes to curl and asserts its structure.
#
# Why capture stdin instead of mocking the function return: we want to
# prove the *wire shape*, not just that send_heartbeat exits zero. A
# regression that silently drops effective_config would still return 0
# under a function-level mock.

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
    mock_curl '' 200
}

teardown() {
    [ -n "${FAKE_HOME:-}" ] && rm -rf "$FAKE_HOME"
    teardown_mocks
}

source_capture() {
    # shellcheck source=/dev/null
    source "$CAPTURE_SH"
}

@test "heartbeat payload includes effective_config with current runtime values" {
    source_capture
    CAPTURE_WIDTH=1280
    CAPTURE_HEIGHT=720
    JPEG_QUALITY=85
    INTERVAL_SECONDS=1800
    ACTIVE_WINDOW_START="06:00"
    ACTIVE_WINDOW_END="18:00"

    send_heartbeat
    local payload; payload=$(mock_curl_stdin)

    [ -n "$payload" ]
    [ "$(echo "$payload" | jq -r '.effective_config.resolution')"        = "1280x720" ]
    [ "$(echo "$payload" | jq -r '.effective_config.jpeg_quality')"      = "85" ]
    [ "$(echo "$payload" | jq -r '.effective_config.capture_interval')"  = "1800" ]
    [ "$(echo "$payload" | jq -r '.effective_config.active_window.start')" = "06:00" ]
    [ "$(echo "$payload" | jq -r '.effective_config.active_window.end')"   = "18:00" ]
}

@test "heartbeat emits capture_interval as JSON null when INTERVAL_SECONDS is unset" {
    # Per DESIGNS-395 §2.3.1, capture_interval is advisory under systemd —
    # a Pi whose timer drives cadence may legitimately have INTERVAL_SECONDS
    # unset. The payload must encode null (not the string "null" or "unset")
    # so the schema validates.
    source_capture
    CAPTURE_WIDTH=1920
    CAPTURE_HEIGHT=1080
    JPEG_QUALITY=85
    unset INTERVAL_SECONDS
    ACTIVE_WINDOW_START="05:00"
    ACTIVE_WINDOW_END="20:00"

    send_heartbeat
    local payload; payload=$(mock_curl_stdin)

    # jq prints 'null' (literal) for a JSON null value; confirm that's what we got.
    [ "$(echo "$payload" | jq '.effective_config.capture_interval')" = "null" ]
    # And confirm it is NOT the string "null".
    [ "$(echo "$payload" | jq -r '.effective_config.capture_interval | type')" = "null" ]
}

@test "heartbeat emits numeric jpeg_quality, not a string" {
    source_capture
    CAPTURE_WIDTH=1920
    CAPTURE_HEIGHT=1080
    JPEG_QUALITY=90
    ACTIVE_WINDOW_START="05:00"
    ACTIVE_WINDOW_END="20:00"

    send_heartbeat
    local payload; payload=$(mock_curl_stdin)

    [ "$(echo "$payload" | jq -r '.effective_config.jpeg_quality | type')" = "number" ]
}

@test "heartbeat payload still includes pre-existing health fields" {
    # Backward-compat: the #406 addition must not displace the existing
    # battery_level / wifi / storage_status / capabilities keys.
    source_capture
    CAPTURE_WIDTH=1920
    CAPTURE_HEIGHT=1080
    JPEG_QUALITY=85

    send_heartbeat
    local payload; payload=$(mock_curl_stdin)

    [ "$(echo "$payload" | jq 'has("battery_level")')"    = "true" ]
    [ "$(echo "$payload" | jq 'has("wifi_signal_dbm")')"  = "true" ]
    [ "$(echo "$payload" | jq 'has("storage_status")')"   = "true" ]
    [ "$(echo "$payload" | jq 'has("capabilities")')"     = "true" ]
    [ "$(echo "$payload" | jq 'has("effective_config")')" = "true" ]
}
