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

@test "default fetch hits the CDN (litcrop.com/capture.sh) when --branch is omitted" {
    # Regression guard: the default path MUST NOT rely on GitHub raw,
    # which returns 404 for private repos and is the exact failure mode
    # reported in the field. When BRANCH=main (the default), capture.sh
    # must come from the CloudFront-fronted static site.
    local isolated; isolated=$(mktemp -d)
    cp "$INSTALL_SH" "${isolated}/install.sh"
    cat > "${MOCK_BIN_DIR}/curl" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> '${MOCK_STATE_DIR}/curl.argv'
# Emit a valid shebang so install.sh's post-download validation passes.
for arg in "\$@"; do
    if [ "\$prev" = "-o" ]; then printf '#!/usr/bin/env bash\n' > "\$arg"; break; fi
    prev="\$arg"
done
exit 0
EOF
    chmod +x "${MOCK_BIN_DIR}/curl"

    run bash "${isolated}/install.sh" --non-interactive
    rm -rf "$isolated"

    local argv; argv=$(cat "${MOCK_STATE_DIR}/curl.argv" 2>/dev/null || true)
    [[ "$argv" == *"https://litcrop.com/capture.sh"* ]]
    # Must NOT have fallen back to GitHub raw for the default case
    [[ "$argv" != *"raw.githubusercontent.com"* ]]
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

# ── #455 Class-2 false-positive guards ──────────────────────────

@test "#455 hardware.conf records the detection source for operator diagnosis" {
    # A bare test container with no sensors should produce a no-sensor
    # classification AND a 'battery=none' annotation so field operators
    # can see why a Pi landed in Class-1 without re-running the install.
    export PATH="${MOCK_BIN_DIR}:/bin:/usr/bin"
    run_install
    local conf="${HOME}/litcrop/hardware.conf"
    [ -f "$conf" ]
    grep -q '^# Detection sources: battery=none, pir=none$' "$conf"
}

@test "#455 cgpmgr-detected battery is recorded with source=cgpmgr" {
    # Install a cgpmgr stub — install.sh should flip HAS_BATTERY_SENSOR=1
    # AND mark the source so we can distinguish this from an i2c / sysfs hit.
    cat > "${MOCK_BIN_DIR}/cgpmgr" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
    chmod +x "${MOCK_BIN_DIR}/cgpmgr"
    run_install
    local conf="${HOME}/litcrop/hardware.conf"
    grep -q '^HAS_BATTERY_SENSOR=1$' "$conf"
    grep -q 'battery=cgpmgr' "$conf"
}

@test "#455 LITCROP_INSTALL_DEBUG=1 dumps detection inputs" {
    # Debug mode should surface the raw inputs (sysfs entries, cgpmgr/cgsensor
    # PATH status, i2c output) so a surprise classification can be diagnosed
    # without ssh'ing to the Pi. This test just asserts the debug header
    # + a representative line are printed.
    export PATH="${MOCK_BIN_DIR}:/bin:/usr/bin"
    LITCROP_INSTALL_DEBUG=1 run_install
    [[ "$output" == *"LITCROP_INSTALL_DEBUG: detection inputs"* ]]
    [[ "$output" == *"power_supply entries:"* ]]
    [[ "$output" == *"cgpmgr on PATH:"* ]]
}

@test "#455 Detected line names the battery source for operator visibility" {
    # The summary line previously read "Detected: HAS_BATTERY_SENSOR=0 HAS_PIR_SENSOR=0".
    # #455 adds the source in parentheses so "why did this flip?" is answerable
    # from a single line of log output.
    export PATH="${MOCK_BIN_DIR}:/bin:/usr/bin"
    run_install
    [[ "$output" == *"HAS_BATTERY_SENSOR=0 (none)"* ]]
    [[ "$output" == *"HAS_PIR_SENSOR=0 (none)"* ]]
}

@test "#455 i2c 0x6b grep is anchored to row 60: (row-prefix false positive)" {
    # Feed install.sh an i2cdetect stub whose output contains '6b' in a cell
    # on a NON-0x60 row. The old grep ' 6b' would have lit up false-positive;
    # the new row-anchored grep rejects it.
    #
    # We realistically can't inject a '6b' cell into i2cdetect output that
    # would ever appear outside row 60 in the real world (i2cdetect only
    # emits the address in its own row), but a verbose-mode build or
    # verbose logging prefix could include "6b" text. Simulate by emitting
    # a header line that contains "6b" as substring.
    cat > "${MOCK_BIN_DIR}/i2cdetect" <<'EOF'
#!/usr/bin/env bash
cat <<'OUT'
I will probe address range 0x08-0x77. Probing 6b-ish addresses may take longer.
     0  1  2  3  4  5  6  7  8  9  a  b  c  d  e  f
00:          -- -- -- -- -- -- -- -- -- -- -- -- --
10: -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
20: -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
30: -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
40: -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
50: -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
60: -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
70: -- -- -- -- -- -- -- --
OUT
EOF
    chmod +x "${MOCK_BIN_DIR}/i2cdetect"
    export PATH="${MOCK_BIN_DIR}:/bin:/usr/bin"
    run_install
    # No HAT on row 60 → should stay Class-1
    grep -q '^HAS_BATTERY_SENSOR=0$' "${HOME}/litcrop/hardware.conf"
}

@test "#455 i2c 0x6b on row 60: is correctly detected" {
    # The positive case — a real HAT at 0x6b shows up on row 60.
    cat > "${MOCK_BIN_DIR}/i2cdetect" <<'EOF'
#!/usr/bin/env bash
cat <<'OUT'
     0  1  2  3  4  5  6  7  8  9  a  b  c  d  e  f
00:          -- -- -- -- -- -- -- -- -- -- -- -- --
10: -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
20: -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
30: -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
40: -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
50: -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
60: -- -- -- -- -- -- -- -- -- -- -- 6b -- -- -- --
70: -- -- -- -- -- -- -- --
OUT
EOF
    chmod +x "${MOCK_BIN_DIR}/i2cdetect"
    export PATH="${MOCK_BIN_DIR}:/bin:/usr/bin"
    run_install
    grep -q '^HAS_BATTERY_SENSOR=1$' "${HOME}/litcrop/hardware.conf"
    grep -q 'battery=i2c:0x6b' "${HOME}/litcrop/hardware.conf"
}

@test "final banner re-warns when crontab is absent" {
    # Remove the crontab stub that setup() installs so the binary is gone.
    rm -f "${MOCK_BIN_DIR}/crontab"
    # Narrow PATH so the host's real crontab can't save us.
    PATH="${MOCK_BIN_DIR}:/bin:/usr/bin" run_install
    [[ "$output" == *"No scheduler configured"* ]] || [[ "$output" == *"will NOT run automatically"* ]]
}

# ── #454 cron schema v2 migration guards ────────────────────────

# Helper: install a STATEFUL crontab stub. Writes from `crontab -` are
# persisted in a state file; subsequent `crontab -l` calls return that
# same state. Without state, the stub would return the original seed on
# every -l call and the migration flow's "re-read after clean" would see
# stale data — defeating the point of the migration test.
install_stateful_crontab() {
    local initial_content="$1"
    local state_file="${MOCK_STATE_DIR}/crontab.state"
    printf '%s' "$initial_content" > "$state_file"
    # Write to a sibling then atomically rename via mv. Avoids ETXTBSY
    # ("Text file busy") when the previous crontab stub from setup() was
    # recently chmod+x'd — Linux can keep an i-node reference that
    # forbids O_TRUNC opens on the same path for a few ms, but rename(2)
    # is exempt from the text-busy check.
    local new_stub="${MOCK_BIN_DIR}/crontab.new"
    cat > "$new_stub" <<EOF
#!/usr/bin/env bash
STATE='${state_file}'
if [ "\${1:-}" = "-l" ]; then
    [ -f "\$STATE" ] && cat "\$STATE" || true
    exit 0
fi
# \`crontab -\` writes piped stdin to state. Use a tmp buffer + rename
# so the state file isn't truncated before the pipe drains — real bash
# opens '> STATE' with O_TRUNC at pipeline setup time, which races with
# a concurrent \`crontab -l\` in the same subshell reading the same
# state. Buffering via a sibling + mv makes the write atomic.
TMP="\${STATE}.tmp.\$\$"
cat > "\$TMP"
mv -f "\$TMP" "\$STATE"
exit 0
EOF
    chmod +x "$new_stub"
    mv -f "$new_stub" "${MOCK_BIN_DIR}/crontab"
}

@test "#454 fresh install writes cron schema v2 (*/5) with schema-tag comment" {
    install_stateful_crontab ""
    run_install
    local final; final=$(cat "${MOCK_STATE_DIR}/crontab.state" 2>/dev/null || true)
    [[ "$final" == *"LitCrop cron schema v2"* ]]
    [[ "$final" == *"*/5 5-20 * * *"* ]]
    [[ "$final" == *"capture.sh"* ]]
}

@test "#454 re-install replaces old */30 v1 entry with v2 (migration path)" {
    # Pilot Pi scenario: cron already has the old */30 line. Re-running
    # install.sh must REPLACE it — previously the elif branch just
    # warned "skipping", which would strand pilot Pis on v1 forever.
    install_stateful_crontab "*/30 5-20 * * * /home/pi/litcrop/capture.sh >> /home/pi/litcrop/logs/capture.log 2>&1"
    run_install
    local final; final=$(cat "${MOCK_STATE_DIR}/crontab.state" 2>/dev/null || true)
    [[ "$final" == *"*/5 5-20 * * *"* ]]
    [[ "$final" == *"LitCrop cron schema v2"* ]]
    [[ "$final" != *"*/30"* ]]
    # Operator-visible migration notice
    [[ "$output" == *"Removing outdated LitCrop cron entries"* ]]
}

@test "#454 re-install preserves unrelated user cron entries" {
    # Migration must be surgical — only remove LitCrop entries, not the
    # user's own cron jobs that happen to sit in the same crontab.
    local seed
    seed=$(printf '%s\n' \
        "0 3 * * * /usr/local/bin/backup.sh" \
        "*/30 5-20 * * * /home/pi/litcrop/capture.sh >> /home/pi/litcrop/logs/capture.log 2>&1" \
        "# User's weekly archive" \
        "@weekly /usr/local/bin/archive.sh")
    install_stateful_crontab "$seed"
    run_install
    local final; final=$(cat "${MOCK_STATE_DIR}/crontab.state" 2>/dev/null || true)
    [[ "$final" == *"backup.sh"* ]]
    [[ "$final" == *"archive.sh"* ]]
    [[ "$final" == *"*/5 5-20"* ]]
    # And MUST NOT retain the old */30 LitCrop entry
    [[ "$final" != *"*/30 5-20 * * * /home/pi/litcrop/capture.sh"* ]]
}

@test "#454 migration does NOT delete unrelated scripts containing 'capture.sh' outside /litcrop/" {
    # Regression guard for the grep-anchor my-reviewer SHOULD-FIX: a user
    # may have a cron entry naming e.g. /usr/local/bin/video-capture.sh
    # or ~/scripts/screen-capture.sh. The original regex `capture\.sh`
    # would have deleted those as collateral. The anchored
    # `/litcrop/capture\.sh` must leave them alone.
    local seed
    seed=$(printf '%s\n' \
        "*/10 * * * * /usr/local/bin/video-capture.sh" \
        "0 */4 * * * /home/pi/scripts/screen-capture.sh" \
        "*/30 5-20 * * * /home/pi/litcrop/capture.sh >> /home/pi/litcrop/logs/capture.log 2>&1")
    install_stateful_crontab "$seed"
    run_install
    local final; final=$(cat "${MOCK_STATE_DIR}/crontab.state" 2>/dev/null || true)
    # User's non-LitCrop capture scripts must still be there
    [[ "$final" == *"video-capture.sh"* ]]
    [[ "$final" == *"screen-capture.sh"* ]]
    # LitCrop's own v1 entry must be gone
    [[ "$final" != *"/home/pi/litcrop/capture.sh"* ]]
    # v2 schema must be installed
    [[ "$final" == *"*/5 5-20"* ]]
}
