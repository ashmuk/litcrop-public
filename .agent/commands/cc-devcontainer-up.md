---
name: cc-devcontainer-up
description: Command - Start the development environment using DevContainer for this repository.
---

# Command: cc-devcontainer-up

## Purpose
Start the development environment using DevContainer for this repository.

This command is the **single source of truth** for how to bring up the development
environment. Both humans and AI agents must follow this procedure.

---

## Preconditions
- Docker Desktop is running
- Dev Container CLI is available
  (`npm install -g @devcontainers/cli` if needed)

---

## Command (Primary / CLI)

```bash
# Start DevContainer for this repository
devcontainer up --workspace-folder .

# (Optional) Open a shell inside the running container
devcontainer exec --workspace-folder . zsh
```
