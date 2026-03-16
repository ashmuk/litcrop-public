# AGENTS.md — Repo Guide (Entry Point)

> This file is intentionally short. Detailed rules and current plans live in:
> - RULES.md (stable policy)
> - PLANS.md, if present (current scope level, tasks, progress)
> - BACKLOG.md, if present

## Project
- Follow README.md and {PLANS.md, BACKLOG.md} for current work
- See RULES.md for stable policy

## Where things live (repo map)
**📖 See Repository Structure in [README.md](./README.md)**

## Available agents
- my-analyst — Analyze systems, break down work, identify risks, plan execution
- my-architect — Technology choices, trade-offs, ADR documentation
- my-designer — UX/UI design, API design, user flows, accessibility, Apple HIG
- my-builder — Implement code, scripts, CI/CD, infrastructure, collect assets
- my-reviewer — Code review, security, safety escalation, integrity verification

### Terminology
- **Step** (1–9): Pipeline workflow sequence — applies to all projects
- **Stage** (1–6+): Project lifecycle progression — `character: staged` only
- **Scope Level** (PoC/MVP/Production): Feature breadth per execution cycle
- **Phase** (1–4): Deployment sub-workflow within cc-deploy

## Agent-Skill Coverage Matrix

| Skill | Primary Agent | Co-working Built-in | Reviewer Gate | Escalation |
|-------|--------------|---------------------|---------------|------------|
| `/cc-define` | my-analyst | Explore | my-reviewer | — |
| `/cc-design` | my-architect + my-designer | Plan | my-reviewer | — |
| `/cc-test` | my-analyst | — | my-reviewer | implement (my-builder) |
| `/cc-implement` | my-builder | general-purpose | my-reviewer | — |
| `/cc-review` | my-reviewer | — | (self) | — |
| `/cc-remediate` | my-builder | — | my-reviewer | my-architect (systemic) |
| `/cc-deploy` | my-builder | — | my-reviewer (mandatory gate) | my-architect (infra design) |
| `/cc-adr` | (template) | — | — | — |

**Workflow chain:** `cc-define(my-analyst) → cc-design(my-architect+my-designer) → cc-implement(my-builder) → cc-test(my-analyst) → cc-review(my-reviewer) → cc-remediate(my-builder+my-reviewer) → cc-deploy(my-builder+my-reviewer)`

### GitHub Issues Integration
When `github_issues.enabled: true` in PROJECT.yaml, the pipeline integrates with GitHub Issues:
- **cc-implement** creates issues at scope transition checkpoints (per scope level)
- **All pipeline skills** auto-post status comments to linked issues
- **cc-commit** includes `Refs #N` / `Closes #N` in commit messages
- **cc-pr-create** auto-detects and references issues in PR body
- **cc-issue-sync** refreshes TASKS.md (auto-generated snapshot of GitHub Issues)
- **Offline**: all issue operations degrade gracefully — pipeline works without GitHub

## Model Selection Matrix

> **Principle: Plan with Opus, Build with Sonnet, Run with Haiku**
>
> Advisory only — Claude Code does not yet support dynamic model selection per agent invocation.
> This matrix documents recommended model assignments per pipeline step and command.
> For future reference when model-variant agents or per-step model parameters become available.

### Skills — Per-Step Model Recommendations

| Skill | Step | Agent | Model | Rationale |
|-------|------|-------|-------|-----------|
| `/cc-define` | Step 1: Context exploration | my-analyst + Explore | Sonnet | Read-and-summarize |
| `/cc-define` | Step 1: Requirements synthesis | my-analyst | Opus | Judgment under ambiguity |
| `/cc-define` | Step 1: Validation | my-reviewer (policy) | Sonnet | Checklist-driven |
| `/cc-design` | Step 2: Architecture | my-architect + Plan | Opus | Novel trade-offs |
| `/cc-design` | Step 3: UX/UI Design | my-designer + Plan | Opus | Design judgment, HIG, API ergonomics |
| `/cc-design` | Step 4: Mock-up | my-designer | Sonnet | Tactical HTML/CSS from design specs |
| `/cc-design` | Step 5: System Design | my-architect + Plan | Opus | Lasting design choices |
| `/cc-design` | Step 6: Task Breakdown | Plan agents | Sonnet | Structured decomposition |
| `/cc-design` | Step 7: Planning | Plan agents | Sonnet | Sequencing |
| `/cc-test` | Test planning/strategy | my-analyst | Opus | Coverage gaps, risk reasoning |
| `/cc-test` | Strategy validation | my-reviewer | Sonnet | Checklist completeness |
| `/cc-implement` | Feature code | my-builder | Sonnet | Standard implementation |
| `/cc-implement` | Test creation | my-builder | Sonnet | Writing tests from strategy |
| `/cc-implement` | Scaffolding/boilerplate | my-builder | Haiku | Template-following |
| `/cc-implement` | Test execution | — | Haiku | Run commands, report results |
| `/cc-review` | Full security audit | my-reviewer | Opus | Adversarial reasoning |
| `/cc-review` | Standard code review | my-reviewer | Sonnet | Structured quality check |
| `/cc-remediate` | Apply fixes | my-builder | Sonnet | Known fixes from findings |
| `/cc-remediate` | Re-validation | my-reviewer | Sonnet | Scoped fix verification |
| `/cc-remediate` | Systemic escalation | my-architect | Opus | Architectural judgment |
| `/cc-deploy` | Pre-flight plan | my-builder | Sonnet | Structured checklist generation |
| `/cc-deploy` | Safety gate | my-reviewer | Opus | Adversarial reasoning about irreversible actions |
| `/cc-deploy` | Command execution | my-builder | Sonnet | Deployment commands may be destructive; needs judgment on partial failures |
| `/cc-deploy` | Rollback assessment | my-reviewer | Opus | Judgment under pressure |
| `/cc-adr` | ADR creation | — | Opus | Decision quality matters |

### Commands — Model Recommendations

| Command | Model | Rationale |
|---------|-------|-----------|
| `/cc-commit` | Haiku | Read diff, generate conventional commit |
| `/cc-push` | Haiku | Rule-based safety checks |
| `/cc-pr-create` | Sonnet | Summarization quality for PR descriptions |
| `/cc-pr-merge` | Sonnet | Validation logic and merge execution |
| `/cc-devcontainer-up` | Haiku | Shell command execution |
| `/cc-devcontainer-down` | Haiku | Shell command execution |
| `/cc-devcontainer-rebuild` | Haiku | Shell command execution |
| `/cc-issue-create` | Sonnet | Label inference and issue body generation |
| `/cc-issue-sync` | Haiku | Fetch and format issues |

## Quick commands
### Agent/AI workflows
- Sync: `make sync` (generate + sync .agent → .claude/.cursor)
- Check: `make sync-check` (sync + show git status)
- Skills: `make sync-codex-skills` (sync Codex skills)

### DevContainer
- Start: `devcontainer up --workspace-folder .`
- Stop: `devcontainer down --workspace-folder .`
- Rebuild: `devcontainer up --workspace-folder . --remove-existing-container --build-no-cache`

> **Note**: `claude-hard` alias (dangerous mode) is only available inside DevContainer

### Slash Commands (Claude Code)
Available slash commands for common workflows:

**Git workflows:**
- `/cc-commit` — Stage changes and create conventional commit (includes issue refs when enabled)
- `/cc-push` — Push changes with safety checks
- `/cc-pr-create` — Create pull request with generated description (auto-links issues when enabled)
- `/cc-pr-merge` — Validate and merge an open pull request

**Issue tracking:**
- `/cc-issue-create` — Create GitHub Issue with labels and milestones
- `/cc-issue-sync` — Refresh TASKS.md from GitHub Issues

**DevContainer lifecycle:**
- `/cc-devcontainer-up` — Start development environment
- `/cc-devcontainer-down` — Stop development environment
- `/cc-devcontainer-rebuild` — Rebuild environment from scratch

**Naming convention:** `cc-` prefix with hyphen-separated namespaces (e.g., `cc-namespace-action`)
**Structure:** Flat files in `.claude/commands/*.md` (like agents, not nested like skills)
**Source of truth:** `.agent/commands/` → synced to `.claude/commands/` via `make sync`

## How to work in this repo
1) Read RULES.md and {PLANS.md, BACKLOG.md}
2) Use my-analyst agent to understand situation and plan work
3) Use my-architect agent for technology decisions (creates ADRs)
4) Use my-designer agent for design (UX, API, accessibility)
5) Use my-builder agent to implement changes
6) Use my-reviewer agent to verify before commit
