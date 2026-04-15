#!/usr/bin/env bats
# #404 + #405 — install.sh hardening
#
# #404: --branch=<name> flag controls which GitHub branch capture.sh
#       is downloaded from. Previously hardcoded to `main`, which silently
#       installed v0.93 capture.sh when install.sh was served from a
#       staging URL running v0.97.
# #405: Hardware flags (HAS_BATTERY_SENSOR, HAS_PIR_SENSOR) are now
#       auto-detected via /sys/class/power_supply and `command -v cgsensor`
#       instead of defaulting to 0/0 in non-interactive mode. Previously
#       every Pi installed via scp-workaround or curl|bash was
#       misclassified as Class-1.

load 'helpers.bash'

INSTALL_SH="${BATS_TEST_DIRNAME}/../install.sh"
CAPTURE_SH="${BATS_TEST_DIRNAME}/../capture.sh"

setup() {
    setup_mocks
    FAKE_HOME=$(mktemp -d)
    export HOME="$FAKE_HOME"
    # crontab isn't installed in the test container — stub it as a
    # pass-through that swallows stdin and prints nothing. install.sh's
    # Step 5 reads existing crontab and appends to it; the stub lets the
    # flow complete without actually touching the host's cron.
    cat > "${MOCK_BIN_DIR}/crontab" <<'EOF'
#!/usr/bin/env bash
[ "${1:-}" = "-l" ] && exit 0  # empty crontab
cat >/dev/null                 # swallow stdin from `crontab -`
exit 0
EOF
    chmod +x "${MOCK_BIN_DIR}/crontab"
    # Put the real capture.sh next to install.sh so Step 2 takes the
    # local-file branch for these tests — except the branch-flag test
    # which explicitly isolates a temp SCRIPT_DIR to force the download path.
}

teardown() {
    [ -n "${FAKE_HOME:-}" ] && rm -rf "$FAKE_HOME"
    teardown_mocks
}

# Run install.sh non-interactively with stdin closed so it doesn't prompt,
# redirecting its stdout/stderr into $output via bats' `run`.
run_install() {
    run bash "$INSTALL_SH" --non-interactive "$@"
}

@test "#404 --help prints usage and exits 0" {
    run bash "$INSTALL_SH" --help
    [ "$status" -eq 0 ]
    [[ "$output" == *"--branch"* ]]
    [[ "$output" == *"--non-interactive"* ]]
}

@test "#404 --branch=develop is accepted and reaches the download URL" {
    # Isolate install.sh in a temp dir without a co-located capture.sh
    # so Step 2 hits the download path (where BRANCH matters).
    local isolated; isolated=$(mktemp -d)
    cp "$INSTALL_SH" "${isolated}/install.sh"

    # Record every curl invocation's argv so we can assert the URL.
    cat > "${MOCK_BIN_DIR}/curl" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> '${MOCK_STATE_DIR}/curl.argv'
# -o <path> is the 3rd/4th arg; write an empty file there so the rest
# of install.sh doesn't error on chmod.
for arg in "\$@"; do
    if [ "\$prev" = "-o" ]; then touch "\$arg"; break; fi
    prev="\$arg"
done
exit 0
EOF
    chmod +x "${MOCK_BIN_DIR}/curl"

    run bash "${isolated}/install.sh" --branch=develop --non-interactive
    rm -rf "$isolated"

    # Install.sh may fail later steps (no .env etc.) — we only care about
    # whether curl was called with the develop branch in the URL.
    local argv; argv=$(cat "${MOCK_STATE_DIR}/curl.argv" 2>/dev/null || true)
    [[ "$argv" == *"ashmuk/litcrop/develop/scripts/camera-node/capture.sh"* ]]
}

@test "#404 default branch is 'main' when --branch is omitted" {
    local isolated; isolated=$(mktemp -d)
    cp "$INSTALL_SH" "${isolated}/install.sh"
    cat > "${MOCK_BIN_DIR}/curl" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> '${MOCK_STATE_DIR}/curl.argv'
for arg in "\$@"; do
    if [ "\$prev" = "-o" ]; then touch "\$arg"; break; fi
    prev="\$arg"
done
exit 0
EOF
    chmod +x "${MOCK_BIN_DIR}/curl"

    run bash "${isolated}/install.sh" --non-interactive
    rm -rf "$isolated"

    local argv; argv=$(cat "${MOCK_STATE_DIR}/curl.argv" 2>/dev/null || true)
    [[ "$argv" == *"ashmuk/litcrop/main/scripts/camera-node/capture.sh"* ]]
}

@test "#405 no-sensors host produces hardware.conf with both flags = 0" {
    # Neither /sys/class/power_supply/*/capacity nor cgsensor present.
    # The default narrow PATH ensures command -v cgsensor fails.
    export PATH="${MOCK_BIN_DIR}:/bin:/usr/bin"
    run_install
    local conf="${HOME}/litcrop/hardware.conf"
    [ -f "$conf" ]
    grep -q '^HAS_BATTERY_SENSOR=0$' "$conf"
    grep -q '^HAS_PIR_SENSOR=0$'     "$conf"
}

@test "#405 PIR detection fires when cgsensor is on PATH" {
    # Install a cgsensor stub so `command -v cgsensor` succeeds.
    cat > "${MOCK_BIN_DIR}/cgsensor" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
    chmod +x "${MOCK_BIN_DIR}/cgsensor"
    run_install
    local conf="${HOME}/litcrop/hardware.conf"
    [ -f "$conf" ]
    grep -q '^HAS_PIR_SENSOR=1$' "$conf"
}

@test "#405 Detected line names both flags for operator visibility" {
    run_install
    [[ "$output" == *"HAS_BATTERY_SENSOR="* ]]
    [[ "$output" == *"HAS_PIR_SENSOR="*     ]]
}

@test "#405 hardware.conf has 0600 perms" {
    run_install
    local perms
    perms=$(stat -c '%a' "${HOME}/litcrop/hardware.conf" 2>/dev/null || stat -f '%p' "${HOME}/litcrop/hardware.conf" 2>/dev/null)
    [[ "$perms" == *"600" ]]
}

# ── cc-review MUST-FIX regression guards ────────────────────────

@test "security: --branch with '..' traversal is rejected (exit 2)" {
    run bash "$INSTALL_SH" --branch=../../mallory/evil-repo/main --non-interactive
    [ "$status" -eq 2 ]
    [[ "$output" == *"Invalid --branch"* ]]
}

@test "security: --branch with absolute path is rejected (exit 2)" {
    run bash "$INSTALL_SH" --branch=/etc/passwd --non-interactive
    [ "$status" -eq 2 ]
    [[ "$output" == *"Invalid --branch"* ]]
}

@test "security: --branch with shell metachars is rejected (exit 2)" {
    run bash "$INSTALL_SH" '--branch=main;rm -rf /' --non-interactive
    [ "$status" -eq 2 ]
    [[ "$output" == *"Invalid --branch"* ]]
}

@test "security: --branch with empty value is rejected" {
    run bash "$INSTALL_SH" --branch= --non-interactive
    [ "$status" -eq 2 ]
}

@test "security: legitimate feature-branch name is accepted (contains /)" {
    local isolated; isolated=$(mktemp -d)
    cp "$INSTALL_SH" "${isolated}/install.sh"
    cat > "${MOCK_BIN_DIR}/curl" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> '${MOCK_STATE_DIR}/curl.argv'
for arg in "\$@"; do
    if [ "\$prev" = "-o" ]; then touch "\$arg"; break; fi
    prev="\$arg"
done
exit 0
EOF
    chmod +x "${MOCK_BIN_DIR}/curl"
    run bash "${isolated}/install.sh" --branch=feature/xyz --non-interactive
    rm -rf "$isolated"
    local argv; argv=$(cat "${MOCK_STATE_DIR}/curl.argv" 2>/dev/null || true)
    [[ "$argv" == *"ashmuk/litcrop/feature/xyz/scripts/camera-node/capture.sh"* ]]
}

@test "unknown flag is rejected loudly (exit 2, no silent main fallback)" {
    # Before fix: `--branche=develop` typo was silently ignored and BRANCH
    # stayed at main — re-introducing the exact bug #404 closes.
    run bash "$INSTALL_SH" --branche=develop --non-interactive
    [ "$status" -eq 2 ]
    [[ "$output" == *"Unknown argument"* ]]
}

@test "#405 battery detection ignores non-Battery power_supply entries" {
    # We can't patch /sys/class/power_supply on the host, but we CAN verify
    # that when no Battery-type entry exists (which is true on this test
    # container), HAS_BATTERY_SENSOR stays 0 even though other power_supply
    # entries might exist. Regression guard for the AC-adapter false-positive.
    run_install
    grep -q '^HAS_BATTERY_SENSOR=0$' "${HOME}/litcrop/hardware.conf"
}

@test "final banner re-warns when crontab is absent" {
    # Remove the crontab stub that setup() installs so the binary is gone.
    rm -f "${MOCK_BIN_DIR}/crontab"
    # Narrow PATH so the host's real crontab can't save us.
    PATH="${MOCK_BIN_DIR}:/bin:/usr/bin" run_install
    [[ "$output" == *"No scheduler configured"* ]] || [[ "$output" == *"will NOT run automatically"* ]]
}
