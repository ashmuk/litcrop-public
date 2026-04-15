# Camera-node shell tests

Unit tests for `scripts/camera-node/*.sh` using [bats-core](https://github.com/bats-core/bats-core).

## Run

From the repo root:

```bash
npm run test:shell            # runs every *.bats in this directory
npx bats scripts/camera-node/__tests__/smoke.bats   # single file
```

The `bats-core` binary is a workspace devDependency (`npm ci` installs it).

## Writing a test

```bash
#!/usr/bin/env bats
load 'helpers.bash'

setup()    { setup_mocks; }
teardown() { teardown_mocks; }

@test "poll_config honors resolution 1280x720" {
    mock_curl '{"resolution":"1280x720"}' 200
    mock_jq_ok
    # source capture.sh here and assert exported vars…
}
```

## Helpers

`helpers.bash` shadows real binaries by prepending a per-test `$MOCK_BIN_DIR`
to `PATH`. Use `command -v` in the script under test to keep detection
faithful — shell-function overrides would bypass that check.

| Helper | Purpose |
|--------|---------|
| `setup_mocks` / `teardown_mocks` | Create / clean a temp PATH prefix |
| `mock_curl BODY [HTTP_CODE]` | Stub `curl` to emit a fixture response |
| `mock_cgpmgr [EXIT]` | Stub `cgpmgr`, records every invocation |
| `mock_jq_ok` | Alias real `jq` into the mock dir (skips test if jq missing) |
| `mock_jq_missing` | Simulate missing jq (returns 127) |
| `mock_call_count CMD` | Count invocations of a stubbed binary |
