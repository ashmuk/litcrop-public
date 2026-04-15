#!/usr/bin/env bash
# Test helpers for scripts/camera-node/*.sh unit tests.
#
# Call setup_mocks / teardown_mocks from your test's setup() / teardown().
# Install a stub on PATH with mock_curl / mock_cgpmgr / mock_jq_ok — capture.sh
# uses `command -v` for detection, so stubs must live on PATH (not shell funcs).

# Usage:
#   load "${BATS_TEST_DIRNAME}/helpers.bash"
#   setup() { setup_mocks; }
#   teardown() { teardown_mocks; }

setup_mocks() {
    MOCK_BIN_DIR=$(mktemp -d)
    MOCK_STATE_DIR=$(mktemp -d)
    export MOCK_BIN_DIR MOCK_STATE_DIR
    export PATH="${MOCK_BIN_DIR}:${PATH}"
}

teardown_mocks() {
    [ -n "${MOCK_BIN_DIR:-}" ] && rm -rf "$MOCK_BIN_DIR"
    [ -n "${MOCK_STATE_DIR:-}" ] && rm -rf "$MOCK_STATE_DIR"
}

# Install a `curl` stub that echoes $1 on stdout and $2 as the HTTP trailer.
# capture.sh reads `response=$(curl ...)` then splits the last line as the code.
mock_curl() {
    local body="$1"
    local http_code="${2:-200}"
    cat > "${MOCK_BIN_DIR}/curl" <<EOF
#!/usr/bin/env bash
printf '%s\n%s\n' '${body}' '${http_code}'
exit 0
EOF
    chmod +x "${MOCK_BIN_DIR}/curl"
}

# Install a `cgpmgr` stub that records every invocation to MOCK_STATE_DIR/cgpmgr.log
# and exits with $1 (default 0).
mock_cgpmgr() {
    local exit_code="${1:-0}"
    cat > "${MOCK_BIN_DIR}/cgpmgr" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> '${MOCK_STATE_DIR}/cgpmgr.log'
exit ${exit_code}
EOF
    chmod +x "${MOCK_BIN_DIR}/cgpmgr"
}

# Install a real-ish `jq` — delegates to the system jq if present, so fixtures
# parse authentically. Call `mock_jq_missing` to simulate missing jq.
mock_jq_ok() {
    local real_jq; real_jq=$(command -v jq 2>/dev/null || true)
    if [ -z "$real_jq" ]; then
        skip "system jq not installed — bats tests require jq on PATH"
    fi
    ln -sf "$real_jq" "${MOCK_BIN_DIR}/jq"
}

# Simulate jq being absent from the system. `command -v jq` must fail, so we
# narrow PATH to the mock dir only (plus /bin for essential coreutils) and
# ensure no jq stub is left behind.
mock_jq_missing() {
    rm -f "${MOCK_BIN_DIR}/jq"
    export PATH="${MOCK_BIN_DIR}:/bin:/usr/bin"
    # Guard: if jq is still reachable on the narrowed PATH, the caller can
    # override PATH further — but log a skip so green tests don't lie.
    if command -v jq >/dev/null 2>&1; then
        skip "jq is available via system PATH even after narrowing — helper cannot simulate missing jq here"
    fi
}

# Count invocations of a mocked command (reads the log written by its stub).
mock_call_count() {
    local cmd="$1"
    local log="${MOCK_STATE_DIR}/${cmd}.log"
    [ -f "$log" ] || { echo 0; return; }
    wc -l < "$log" | tr -d ' '
}
