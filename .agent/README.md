# Multi-AI Coordination System

This directory (`.agent/`) is the **centralized source of truth** for AI tool configurations. Changes here propagate to Claude Code, Cursor IDE, and OpenAI Codex via `make sync`.

## Architecture Overview

### Complete File Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         UPSTREAM (~/dotfiles/templates/)                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  global/                           project/                                 │
│  ├── AGENTS_global.md              ├── AGENTS_project.md                    │
│  └── CLAUDE_global.md              ├── CLAUDE_project.md                    │
│                                    ├── RULES.md                             │
│                                    ├── Makefile                             │
│                                    ├── dot.gitignore                        │
│                                    ├── dot.agent/                           │
│                                    │   ├── commands/                        │
│                                    │   ├── subagents/                       │
│                                    │   ├── skills/                          │
│                                    │   └── starters/                        │
│                                    │       ├── PROJECT.staged.yaml          │
│                                    │       ├── PROJECT.toolbox.yaml         │
│                                    │       ├── PLANS.md                     │
│                                    │       └── BACKLOG.md                   │
│                                    └── scripts/boilerplate/                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ make fetch-from-upstream
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PROJECT ROOT (e.g., ~/projects/a2/)                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  SYNCED FROM UPSTREAM (Tier 1 & 2)     │  PROJECT-SPECIFIC (never synced)  │
│  ──────────────────────────────────    │  ────────────────────────────────  │
│  AGENTS_global.md                      │                                    │
│  CLAUDE_global.md                      │                                    │
│  AGENTS.md                             │  PROJECT.yaml    ← created by init │
│  CLAUDE.md                             │  PLANS.md        ← if staged       │
│  RULES.md                              │  BACKLOG.md      ← if toolbox      │
│  Makefile                              │  docs/decisions/ADR-*.md           │
│  .gitignore                            │                                    │
│  .agent/                               │                                    │
│    ├── commands/                       │                                    │
│    ├── subagents/                      │                                    │
│    ├── skills/                         │                                    │
│    └── starters/                       │                                    │
│        ├── PROJECT.staged.yaml         │                                    │
│        ├── PROJECT.toolbox.yaml        │                                    │
│        ├── PLANS.md                    │                                    │
│        └── BACKLOG.md                  │                                    │
│  scripts/boilerplate/                  │                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ make init-staged  OR  make init-toolbox
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         INITIALIZATION RESULT                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  make init-staged:                     make init-toolbox:                   │
│  ─────────────────                     ──────────────────                   │
│  .agent/starters/PROJECT.staged.yaml   .agent/starters/PROJECT.toolbox.yaml │
│           │                                     │                           │
│           ▼                                     ▼                           │
│  PROJECT.yaml (root)                   PROJECT.yaml (root)                  │
│                                                                             │
│  .agent/starters/PLANS.md              .agent/starters/BACKLOG.md           │
│           │                                     │                           │
│           ▼                                     ▼                           │
│  PLANS.md (root)                       BACKLOG.md (root)                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ make sync
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AI TOOL CONFIGURATIONS                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  .agent/                                                                    │
│     │                                                                       │
│     ├──────────────────┬────────────────────┬──────────────────────┐        │
│     ▼                  ▼                    ▼                      ▼        │
│  .claude/           .cursor/rules/       .codex/                            │
│  ├── agents/        ├── agents/          ├── AGENTS.override.md             │
│  ├── commands/      └── skills/          └── skills/                        │
│  └── skills/                                                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Terminology

The harness uses four distinct sequencing terms on different axes:

| Term | Axis | Values | Applies To |
|------|------|--------|-----------|
| **Step** | Pipeline workflow | 1–9 (see Pipeline Workflow below) | All projects, every pipeline run |
| **Stage** | Project lifecycle | 1–6+ (Analysis → Enhancement) | `character: staged` only |
| **Scope Level** | Feature breadth | PoC → MVP → Production | All projects, via PLANS.md |
| **Phase** | Deployment sub-workflow | 1–4 (Plan → Gate → Execute → Verify) | cc-deploy only |

**Nesting relationship:**
```
Project Lifecycle (Stage 1 → 2 → ... → 6+)
  └── Pipeline Run (Step 1 → 9)
       └── Execution Loop per Scope Level (PoC → MVP → Production)
            └── Deployment (Phase 1 → 4) [when deploying]
```

- **Step** applies to all projects — it's the universal pipeline sequence
- **Stage** is only relevant to `character: staged` projects — toolbox projects skip stages entirely
- **Scope Level** governs feature breadth within each execution cycle (Steps 8–9 repeat per scope level)
- **Phase** is internal to cc-deploy — it structures the deployment sub-workflow

## Directory Structure

```
.agent/
├── README.md           # This file
├── commands/           # Git workflow commands (Claude Code slash commands)
│   ├── cc-commit.md       # /cc-commit - Stage and commit with generated message
│   ├── cc-push.md         # /cc-push - Push with safety checks
│   ├── cc-pr-create.md    # /cc-pr-create - Create PR with generated description
│   ├── cc-pr-merge.md     # /cc-pr-merge - Validate and merge a pull request
│   ├── cc-issue-create.md # /cc-issue-create - Create GitHub Issue with labels
│   ├── cc-issue-sync.md   # /cc-issue-sync - Refresh TASKS.md from GitHub Issues
│   ├── cc-devcontainer-up.md
│   ├── cc-devcontainer-down.md
│   └── cc-devcontainer-rebuild.md
├── skills/             # Workflow skills (multi-step tasks)
│   ├── cc-adr.md          # /cc-adr - Create Architecture Decision Records
│   ├── cc-define.md       # /cc-define - Requirements gathering
│   ├── cc-design.md       # /cc-design - Architecture and planning
│   ├── cc-implement.md    # /cc-implement - Build software
│   ├── cc-deploy.md       # /cc-deploy - Execute deployments and releases
│   ├── cc-remediate.md    # /cc-remediate - Apply fixes and re-validate
│   ├── cc-review.md       # /cc-review - Validate and review
│   └── cc-test.md         # /cc-test - Test strategy and coverage plans
├── subagents/          # Agent definitions
│   ├── my-analyst.md   # System analysis, planning, risk identification
│   ├── my-architect.md # Technology decisions, trade-offs
│   ├── my-builder.md   # Implementation specialist
│   ├── my-designer.md  # UX/UI design, API design, user flows
│   └── my-reviewer.md  # Code review, security validation
└── starters/           # Project initialization templates
    ├── PROJECT.staged.yaml   # For staged development projects
    ├── PROJECT.toolbox.yaml  # For ad-hoc toolbox projects
    ├── PLANS.md              # Roadmap template (staged)
    └── BACKLOG.md            # Task queue template (toolbox)
```

## Dual-Mode Project Characters

This template supports two project characters via `PROJECT.yaml`:

```
One Template → Two Characters → Same Infrastructure

┌──────────────────────────────────────────────────────────────┐
│                     SHARED INFRASTRUCTURE                     │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐             │
│  │ Agents  │ │Commands │ │ Skills  │ │  ADRs   │             │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐             │
│  │Git Cmds │ │DevCtnr  │ │make sync│ │ RULES   │             │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘             │
├──────────────────────────────────────────────────────────────┤
│                     PROJECT.yaml                              │
│              ┌─────────────┴─────────────┐                   │
│              ▼                           ▼                   │
│     character: staged           character: toolbox           │
│     ┌─────────────────┐         ┌─────────────────┐          │
│     │ Linear stages   │         │ Ad-hoc tasks    │          │
│     │ PLANS.md        │         │ BACKLOG.md      │          │
│     │ Deployment gate │         │ Ship anytime    │          │
│     │ Full workflow   │         │ Scale to size   │          │
│     └─────────────────┘         └─────────────────┘          │
└──────────────────────────────────────────────────────────────┘
```

### Staged Projects

For linear, single-deliverable development:

```yaml
# PROJECT.yaml
version: 1
character: staged

staged:
  current_stage: 1
  deployment_gate: 5
  roadmap_file: PLANS.md
```

- Follows stages: Analysis → Asset Collection → Architecture → Implementation → Enhancement
- Uses `PLANS.md` for roadmap tracking
- Deployment blocked until specified stage

### Toolbox Projects

For ad-hoc tools, plugins, and experiments:

```yaml
# PROJECT.yaml
version: 1
character: toolbox

toolbox:
  backlog_file: BACKLOG.md
  shipping: continuous
```

- No stages, no gates
- Uses `BACKLOG.md` for task tracking
- Workflow scales to task size:
  - Small (1 file, <50 LOC): `/cc-implement` directly
  - Medium (2-5 files, 50-500 LOC): `/cc-design` → `/cc-implement`
  - Large (cross-cutting, >500 LOC): Full workflow

## GitHub Issues Integration

When `github_issues.enabled: true` in PROJECT.yaml, the pipeline integrates with GitHub Issues as an optional enhancement layer.

### Data Flow
```
GitHub Issues (authoritative source of truth)
    ↕ sync (cc-issue-sync)
TASKS.md (auto-generated snapshot — project root)
    ↓ consumed by
Pipeline skills (cc-define, cc-implement, cc-review, etc.)
    ↓ auto-post updates to (when auto_post: true)
GitHub Issues (comments with pipeline step status)
```

### Configuration
```yaml
# PROJECT.yaml
github_issues:
  enabled: true      # Toggle for projects without GitHub remote
  auto_post: false   # Set to true to auto-post pipeline status to linked issues
```

### Key Files
| File | Purpose |
|------|---------|
| `TASKS.md` (root) | Auto-generated snapshot of GitHub Issues (via cc-issue-sync) |
| `docs/TASK_BREAKDOWN.md` | Design artifact from cc-design Step 6 (task decomposition) |
| `PLANS.md` / `BACKLOG.md` | Manually authored strategy and task definitions |

### Commands
- `/cc-issue-create` — Create issues with labels and milestones (single or `--bulk` mode)
- `/cc-issue-sync` — Refresh TASKS.md from GitHub Issues

### Offline Graceful Degradation
The entire system remains fully functional without GitHub Issues. When `gh` commands fail (offline, no remote), all pipeline skills skip auto-post gracefully and continue. TASKS.md (if previously generated) serves as a stale-but-readable cache.

## Pipeline Workflow

The 9-step pipeline with STOP gates:

```
Step 1: Define (cc-define)     → REQUIREMENTS.md
Step 2: Architecture (cc-design) → docs/ARCHITECTURE.md  ← STOP
Step 3: UX/UI & API Design    → docs/UX-DESIGNS.md
Step 4: Mock-up                → docs/mockups/            ← STOP
Step 5: System Design          → docs/DESIGNS.md
Step 6: Task Breakdown         → docs/TASK_BREAKDOWN.md
Step 7: Planning               → PLANS.md                 ← STOP
Step 8: Build (cc-implement)   → code + artifacts         ← STOP
Step 9: Test Strategy (cc-test) → docs/TEST_STRATEGY.md
```

Steps 8–9 form the **execution loop** — they repeat for each Scope Level (PoC → MVP → Production) as defined in PLANS.md. At each scope transition, cc-implement offers to create GitHub Issues for the next scope level.

Post-pipeline: `cc-review → cc-remediate → cc-deploy`

See individual skill files in `skills/` for detailed step documentation.

## Quick Start

### Initialize Project Character

```bash
# For ad-hoc projects (plugins, tools, experiments)
make init-toolbox

# For staged development (single deliverable)
make init-staged

# Check current character
make show-character
```

### Sync to AI Tools

```bash
# Propagate .agent/ to .claude/, .cursor/, .codex/
make sync

# Check sync status
make sync-check
```

### Update from Upstream Template

```bash
# Fetch updates from ~/dotfiles/templates/
make fetch-from-upstream

# Check for differences first
make fetch-from-upstream-check

# Push local improvements back to template
make push-to-upstream
```

## File Protection Matrix

| File | Synced from Upstream? | Protected? |
|------|----------------------|------------|
| `.agent/*` | Yes | No - template files |
| `PROJECT.yaml` | Never | Yes - project-specific |
| `PLANS.md` | Never | Yes - project-specific |
| `BACKLOG.md` | Never | Yes - project-specific |
| `docs/decisions/*` | Never | Yes - project-specific |

## AI Agent Logic

When AI agents read this project, they follow this logic:

```
┌─────────────────────────────────┐
│ Read PROJECT.yaml               │
│         │                       │
│         ▼                       │
│   File exists?                  │
│    │         │                  │
│   Yes        No                 │
│    │         │                  │
│    ▼         ▼                  │
│  Parse    Assume               │
│  character  "staged"            │
│             (default)           │
└─────────────────────────────────┘
```

- If `PROJECT.yaml` exists: Use declared character
- If missing: Default to `staged` (backwards compatible)
