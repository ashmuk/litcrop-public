#!/usr/bin/env bats
# Smoke test — verifies the bats harness is wired correctly.

load 'helpers.bash'

setup() {
    setup_mocks
}

teardown() {
    teardown_mocks
}

@test "bats harness runs and setup_mocks prepends a writable bin dir to PATH" {
    [ -d "$MOCK_BIN_DIR" ]
    [[ ":$PATH:" == *":${MOCK_BIN_DIR}:"* ]]
}

@test "mock_curl responds with the body and http code we choose" {
    mock_curl '{"ok":true}' 200
    run curl https://example.invalid
    [ "$status" -eq 0 ]
    [[ "$output" == *'{"ok":true}'* ]]
    [[ "$output" == *'200'* ]]
}

@test "mock_cgpmgr logs invocations and honors the exit code" {
    mock_cgpmgr 0
    run cgpmgr -set 1800
    [ "$status" -eq 0 ]
    [ "$(mock_call_count cgpmgr)" -eq 1 ]
}
