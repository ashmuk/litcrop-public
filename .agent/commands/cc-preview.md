---
name: cc-preview
description: Command - Preview project progress and next items with visual dashboard
---

Generate a visual project dashboard for the user's review. This command should be fast and data-driven.

## Data Collection (run in parallel)

1. **Git state**: `git log --oneline -5`, `git tag -l --sort=-version:refname | head -3`, `git branch --show-current`
2. **Test health**: `npx vitest run --reporter=verbose 2>&1 | tail -5`
3. **Task board**: Read `TASKS.md` for open/closed issues by milestone
4. **Memory**: Read MEMORY.md index for project status, backlog overrides, and restart points
5. **Uncommitted work**: `git status --short` and `git log origin/$(git branch --show-current)..HEAD --oneline`
6. **PROJECT.yaml**: Read current stage and project character

## Dashboard Sections

Present all findings in a single visual dashboard using ASCII box-drawing:

### 1. Status Bar
```
┌─────────────────────────────────────────────────┐
│  Version: vX.YY  │  Branch: <branch>            │
│  Tests:   NNN    │  Unpushed: N commits         │
└─────────────────────────────────────────────────┘
```

### 2. Sprint Progress
Show all milestones (Beta-1 through current + future) with progress bars:
```
 Beta  Milestone          Status        Tag
───────────────────────────────────────────────
  N    Description        ██████████ ✅  vX.YY
  N+1  Description        ██████░░░░ 🔨  in progress
  N+2  Description        ░░░░░░░░░░ ⏳  queued
```

### 3. Current Sprint Breakdown
If a sprint is in progress, show batch/task-level detail.

### 4. What's Next (by priority)
```
 Priority  Issue   What                          Sprint/Scope
─────────────────────────────────────────────────────────────
    1      #NNN    Description                   <scope>
    2      #NNN    Description                   <scope>
```

Group into: IMMEDIATE (this session), NEXT SPRINT, PRODUCTION PATH.

### 5. Upcoming Sprint Scope
Expand the next sprint's issues with sub-items.

### 6. Health Metrics
Test count, pass rate, source files, AWS cost, open issues.

### 7. Risk / Watch Items
Any blockers, budget concerns, or decisions needed.

### 8. Decision Points
Questions that need the user's input before proceeding.

## Guidelines

- Be data-driven: derive status from git tags, commits, and TASKS.md — don't guess
- Respect memory overrides (e.g., backlog items marked PENDING or BACKLOG)
- Include the user's feedback items if any are pending from the current session
- Keep the dashboard concise but comprehensive
- End with: "What would you like to tackle?" to prompt next action
