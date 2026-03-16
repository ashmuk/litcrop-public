---
name: cc-devcontainer-down
description: Command - Stop and clean up the DevContainer environment for this repository.
---

# Command: cc-devcontainer-down

## Purpose
Stop and clean up the DevContainer environment for this repository.

This command is used when development work is finished or when the container
needs to be shut down safely without removing cached images or volumes.

---

## Preconditions
- DevContainer for this repository has been started at least once
- Docker Desktop is running

---

## Command (Primary / CLI)

```bash
# Stop DevContainer for this repository
devcontainer down --workspace-folder .
```
