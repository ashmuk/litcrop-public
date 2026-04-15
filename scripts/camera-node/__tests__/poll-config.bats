#!/usr/bin/env bats
# T-395-02 — poll_config() parses resolution, capture_interval, active_window
#
# poll_config reads the JSON response returned by curl, so we build a fake
# $HOME with a minimal .env, mock curl to emit a fixture payload, source
# capture.sh (which is guarded against auto-run via BASH_SOURCE check), then
# invoke poll_config and inspect the exported variables.

load 'helpers.bash'

CAPTURE_SH="${BATS_TEST_DIRNAME}/../capture.sh"

setup() {
    setup_mocks
    # Fake HOME so capture.sh's $ENV_FILE points at our fixture.
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
    AUTH_TOKEN='fake-jwt'
    export AUTH_TOKEN
    mock_jq_ok
}

teardown() {
    [ -n "${FAKE_HOME:-}" ] && rm -rf "$FAKE_HOME"
    teardown_mocks
}

source_capture() {
    # shellcheck source=/dev/null
    source "$CAPTURE_SH"
}

@test "poll_config parses resolution '1280x720' into CAPTURE_WIDTH and CAPTURE_HEIGHT" {
    mock_curl '{"resolution":"1280x720","jpeg_quality":90,"capture_interval":3600,"active_window":{"start":"06:00","end":"18:00"}}' 200
    source_capture
    poll_config
    [ "$CAPTURE_WIDTH" = "1280" ]
    [ "$CAPTURE_HEIGHT" = "720" ]
}

@test "poll_config parses capture_interval into exported INTERVAL_SECONDS" {
    mock_curl '{"resolution":"1920x1080","capture_interval":3600,"active_window":{"start":"05:00","end":"20:00"}}' 200
    source_capture
    poll_config
    [ "$INTERVAL_SECONDS" = "3600" ]
}

@test "poll_config parses active_window into ACTIVE_WINDOW_START / ACTIVE_WINDOW_END" {
    mock_curl '{"resolution":"1920x1080","active_window":{"start":"06:00","end":"18:00"}}' 200
    source_capture
    poll_config
    [ "$ACTIVE_WINDOW_START" = "06:00" ]
    [ "$ACTIVE_WINDOW_END"   = "18:00" ]
}

@test "poll_config defaults active_window when field is absent" {
    mock_curl '{"resolution":"1920x1080"}' 200
    source_capture
    poll_config
    [ "$ACTIVE_WINDOW_START" = "05:00" ]
    [ "$ACTIVE_WINDOW_END"   = "20:00" ]
}

@test "poll_config ignores malformed resolution (regex guard)" {
    mock_curl '{"resolution":"not-a-resolution"}' 200
    source_capture
    local before_w="$CAPTURE_WIDTH"
    local before_h="$CAPTURE_HEIGHT"
    poll_config
    [ "$CAPTURE_WIDTH"  = "$before_w" ]
    [ "$CAPTURE_HEIGHT" = "$before_h" ]
}

@test "poll_config ignores non-numeric capture_interval (regex guard)" {
    mock_curl '{"capture_interval":"not-a-number"}' 200
    source_capture
    INTERVAL_SECONDS="600"
    poll_config
    [ "$INTERVAL_SECONDS" = "600" ]
}

@test "poll_config sets LITCROP_TRIGGER=test_shot when test_shot_requested=true" {
    mock_curl '{"resolution":"1920x1080","test_shot_requested":true}' 200
    source_capture
    poll_config
    [ "$LITCROP_TRIGGER" = "test_shot" ]
    [ "$TRIGGER" = "test_shot" ]
}

@test "poll_config logs default-fallback message when jq is missing" {
    mock_jq_missing
    mock_curl '{"resolution":"1280x720"}' 200
    source_capture
    run poll_config
    [[ "$output" == *"jq not installed"* ]]
}

# T-395-04 remediation: defense-in-depth against a malformed time value
# slipping past the API schema. /^\d{2}:\d{2}$/ used to accept "25:99" —
# the Pi's string-compare gate would treat such a value as if the window
# extended past 24:00, silently keeping captures running. The shell guard
# rejects the bad value so the device falls back to the default 20:00.
@test "poll_config rejects malformed active_window end '25:99' (regex guard)" {
    mock_curl '{"resolution":"1920x1080","active_window":{"start":"05:00","end":"25:99"}}' 200
    source_capture
    poll_config
    [ "$ACTIVE_WINDOW_START" = "05:00" ]
    [ "$ACTIVE_WINDOW_END"   = "20:00" ]
}

@test "poll_config rejects malformed active_window start 'noon' (regex guard)" {
    mock_curl '{"resolution":"1920x1080","active_window":{"start":"noon","end":"18:00"}}' 200
    source_capture
    poll_config
    [ "$ACTIVE_WINDOW_START" = "05:00" ]
    [ "$ACTIVE_WINDOW_END"   = "18:00" ]
}
