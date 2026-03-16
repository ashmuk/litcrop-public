#!/bin/bash
# init-firewall.sh - Optional firewall initialization for DevContainer
# This script is called by postStartCommand in devcontainer.json
# Currently a no-op for development; can be enhanced for network isolation

set -e

echo "[init-firewall] Firewall initialization skipped (development mode)"
echo "[init-firewall] For network isolation, use: docker compose --profile no-net up"

exit 0
