---
name: cc-devcontainer-rebuild
description: Command - Rebuild the DevContainer environment from scratch using the current DevContainer configuration.
---

# Command: cc-devcontainer-rebuild

## Purpose
Rebuild the DevContainer environment from scratch using the current DevContainer configuration.

Use this command when:
- `.devcontainer/devcontainer.json` is modified
- Base images or dependencies are updated
- The environment becomes inconsistent or corrupted

---

## Preconditions
- Docker Desktop is running
- Dev Container CLI is available

---

## Command (Primary / CLI)

```bash
# Rebuild DevContainer without using cache
devcontainer up \
  --workspace-folder . \
  --remove-existing-container \
  --build-no-cache
```
