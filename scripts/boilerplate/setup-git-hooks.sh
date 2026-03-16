#!/usr/bin/env bash
# setup-git-hooks.sh - Configure git to use project hooks
# This script sets up the git hooks directory to use .githooks/ from this project.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HOOKS_DIR="${PROJECT_ROOT}/.githooks"

echo "[setup-git-hooks] Setting up git hooks..."

# Check if .githooks directory exists
if [[ ! -d "${HOOKS_DIR}" ]]; then
    echo "[error] .githooks directory not found at ${HOOKS_DIR}"
    exit 1
fi

# Configure git to use project hooks directory
git config core.hooksPath .githooks

# Make hooks executable
chmod +x "${HOOKS_DIR}"/*

echo "[setup-git-hooks] Git hooks configured successfully!"
echo "[setup-git-hooks] Hooks directory: ${HOOKS_DIR}"
echo ""
echo "Active hooks:"
for hook in "${HOOKS_DIR}"/*; do
    if [[ -f "${hook}" ]]; then
        echo "  - $(basename "${hook}")"
    fi
done
echo ""
echo "To verify, run: git config --get core.hooksPath"
