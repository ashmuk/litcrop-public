# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> For the main repo guide see AGENTS.md. For stable policy see RULES.md.

## Project Context
**See README.md** for project-specific information:
- Tech stack and dependencies
- Build instructions
- Module structure and conventions
- Development guide
etc.

## Quick Reference

### Project Character
This project supports two characters: Toolbox or Stage-Based.
See PROJECT.yaml (./PROJECT.yaml) for which character this project follows.

### Essential Commands
```bash
# Project setup
make init              # Interactive setup wizard (first time)
make setup-hooks       # Set up git hooks for branch protection
make help              # Show all available make commands

# Development workflow
make sync              # Sync .agent/ → .claude, .cursor, .codex
make sync-check        # Sync then show git status
make sync-verify       # Sync then verify all targets
make check-env         # Verify .env configuration

# DevContainer (preferred environment)
devcontainer up --workspace-folder .
devcontainer down --workspace-folder .

# Git workflow
git checkout develop                    # Work from develop branch
git checkout -b feature/your-feature    # Create feature branch
# ... make changes ...
git commit -m "feat(scope): description"
git push -u origin feature/your-feature
# Create PR via GitHub UI
```

### Slash Commands (Claude Code)
Use these commands for common workflows:

**Workflow Skills** (coordinate multi-step tasks):
- `/cc-define` — Understand context and define requirements (uses Explore agents)
- `/cc-design` — Create architecture, UI/UX and API designs, and implementation plans (uses my-architect + my-designer + Plan agents)
- `/cc-test` — Create test strategy and coverage plans (uses my-analyst + my-reviewer agents)
- `/cc-implement` — Build software and artifacts (uses general-purpose agents)
- `/cc-review` — Review project progress and validate implementations
- `/cc-remediate` — Apply fixes from review findings and re-validate (uses my-builder + my-reviewer agents)
- `/cc-deploy` — Execute deployments, releases, and infrastructure provisioning (uses my-builder + my-reviewer agents)

**Git Workflows**:
- `/cc-commit` — Stage changes and create conventional commit with generated message (includes issue refs when enabled)
- `/cc-pr-merge` — Validate and merge an open pull request on GitHub
- `/cc-push` — Push changes to remote with safety checks
- `/cc-pr-create` — Create pull request with auto-generated title and description (auto-links issues when enabled)

**Issue Tracking**:
- `/cc-issue-create` — Create GitHub Issue with labels and milestones
- `/cc-issue-sync` — Refresh TASKS.md from GitHub Issues

**DevContainer Lifecycle**:
- `/cc-devcontainer-up` — Start development environment
- `/cc-devcontainer-down` — Stop and clean up development environment
- `/cc-devcontainer-rebuild` — Rebuild environment from scratch

### Upstream Template Sync
Sync boilerplate from upstream template repository:
```bash
make fetch-from-upstream           # Sync from dotfiles template
make fetch-from-upstream-check     # Check for template differences
make fetch-from-upstream-status    # Show sync status
make fetch-from-upstream-dry-run   # Preview template sync
```

## Architecture Overview

### Multi-AI Coordination System
This repo uses a **centralized `.agent/` directory** as the source of truth:
- `.agent/` → source files (commands, subagents, skills)
- `make sync` generates configs for all three AI tools:

| Source | Claude Code | Cursor IDE | Codex |
|--------|-------------|------------|-------|
| `subagents/` | `.claude/agents/` (symlinks) | `.cursor/rules/agents/` (symlinks) | `.codex/AGENTS.override.md` (generated) |
| `skills/` | `.claude/skills/<name>/SKILL.md` | `.cursor/rules/skills/<name>/RULE.md` | `.codex/skills/<name>/SKILL.md` |
| `commands/` | `.claude/commands/` (symlinks) | *(not supported)* | *(not supported)* |

**Individual sync targets** (for debugging):
```bash
make sync-claude       # Sync to Claude Code only
make sync-cursor       # Sync to Cursor IDE only
make sync-codex        # Sync to OpenAI Codex only
```

**Important**: Always run `make sync` after modifying `.agent/` files to propagate changes.

### Agent-Based Workflow
This project uses specialized subagents (defined in `.claude/agents/`) for different responsibilities:

- **my-analyst** — System analysis, planning, risk identification
  - Use for: Breaking down complex tasks, analyzing existing systems, identifying risks

- **my-architect** — Technology decisions, trade-offs, ADR creation
  - Use for: Choosing tech stack, designing architecture, creating ADRs

- **my-designer** — UX/UI design, API design, user flows, accessibility
  - Use for: Visual design systems, interaction patterns, Apple HIG, API contracts, data modeling, accessibility audits

- **my-builder** — Implementation (code, scripts, CI/CD, infrastructure)
  - Use for: Writing code, creating scripts, setting up infrastructure

- **my-reviewer** — Code review, security validation, integrity checks
  - Use for: Validating implementations, security audits, final checks before merge

**Coordination**: Use workflow skills (`/cc-define`, `/cc-design`, `/cc-test`, `/cc-implement`, `/cc-review`, `/cc-remediate`, `/cc-deploy`) to automatically coordinate these agents for multi-step tasks.

## Claude-Specific Guidelines

### Safety & Approvals
- **DevContainer**: Prefer using it when available (`devcontainer up`)
- **Dangerous operations**: `claude-hard` alias requires explicit user approval before:
  - Merging to `main` branch
  - Force push, hard reset, rebase on shared branches
  - Infrastructure changes (AWS deployments, DNS)
  - Deleting production data

### Decision Documentation
When making architectural or technical decisions:
1. Create an ADR in `docs/decisions/ADR-YYYYMMDD-<slug>.md`
2. Use the template from `.agent/skills/cc-adr.md`
3. Include: Context, Options (pros/cons), Decision, Consequences, Rollback plan

Example: Choosing between authentication methods, selecting a database, CI/CD pipeline design.

### Branch & Merge Workflow
- **Automated** (no approval needed):
  - Creating PRs (feature → develop)
  - Running CI/CD checks
  - Merging to `develop` (when user says "proceed")

- **Require approval** (always ask first):
  - ⚠️ Merging to `main` (production deployment)
  - ⚠️ Force operations on shared branches
  - ⚠️ Infrastructure changes

## Key Constraints

1. **Commit secrets forbidden** — never commit `.env`, `config.json`, API keys
2. **Follow existing patterns** — read code before modifying.
3. **Stable Policy** — read RULES.md (./RULES.md)
4. **Git Flow branching** — `main` (prod) ← `develop` (integration) ← `feature/*`

## Project Context Pointers

- **Project overview**: README.md
- **Project character**: PROJECT.yaml
- **Repo entry point**: AGENTS.md
- **Stable rules**: RULES.md
- **Tech stack & statistics**: README.md (Tech Stack section)
- **ADR template**: .agent/skills/cc-adr.md
