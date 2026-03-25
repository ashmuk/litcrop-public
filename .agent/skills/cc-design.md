---
name: cc-design
description: >-
  Create system architecture, UI/UX and API designs, task breakdowns and
  implementation plans (Steps 2–7 of the 9-step design pipeline). Use when
  user asks for "architecture", "system design", "UI/UX design", "API design",
  "task breakdown", or "implementation plan". Do NOT use for requirements
  gathering (use cc-define) or code implementation (use cc-implement).
metadata:
  version: 3.0.0
  category: workflow-automation
---

# SKILL - Design architecture, system, tasks and plans (Steps 2–7)

## Purpose
Create system architecture, designs, task breakdowns and plans, co-working with ClaudeCode built-in Plan agent(s).

This skill owns **Steps 2–7** of the 9-step design pipeline:
`1 (cc-define) → 2 (STOP) → 3 → 4 (STOP) → 5 → 6 → 7 (STOP) → 8 (STOP) → 9`

cc-design owns Steps 2–7. cc-define owns Step 1. cc-implement owns Step 8. cc-test owns Step 9.

**Precondition**: Step 1 (cc-define) should produce REQUIREMENTS.md before this skill runs.

## When to use
- Use this skill when end-user asks for 'architecture', 'system designs', 'tasks' or 'plans'
- Manually invoke after Step 1 (cc-define) produces REQUIREMENTS.md
- Coordinate with my-architect agent policies during architecture work
- Coordinate with my-designer agent policies during UX/UI and API design work

## Policy
ClaudeCode built-in Plan agent(s) respects my-architect agent's policies and my-designer agent's policies for UI/UX and API design

## Model Selection Guidance
This skill involves strategic and tactical work, requiring different model capabilities:

| Step | Model | Rationale |
|------|-------|-----------|
| **Step 2: Architecture** | Opus | Strategic decisions, technology trade-offs, ADR creation, and architecture review require deep reasoning |
| **Step 3: UX/UI Design** | Opus | Design judgment, Apple HIG, accessibility, API ergonomics require deep reasoning |
| **Step 4: Mock-up** | Sonnet | Tactical translation of design specs into markup — decisions already made in Step 3 |
| **Step 5: System Design** | Opus | Detailed design choices, component interactions, pattern selection need strong judgment |
| **Step 6: Task Breakdown** | Sonnet | Tactical decomposition, clear scope definition, practical sequencing |
| **Step 7: Planning** | Sonnet | Scope-leveled execution planning, resource estimation, dependency mapping |

**How to apply:**
- For Steps 2, 3, 5, prefer deeper reasoning (Opus-class agents) for strategic decisions
- For Steps 4, 6, 7, default Sonnet is sufficient for tactical work
- Claude (assistant) should apply these preferences when orchestrating agents

## Workflow

### Step 2: Architecture (Model: Opus) — STOP gate
Create high-level system architecture, technology decisions, and review checklist.

1. Plan agent(s) co-work with my-architect agent, respecting its policies
2. Read REQUIREMENTS.md (from Step 1)
3. Analyze the context and start designing (invoke Explore or relevant agents as needed)
4. Create system architecture using the model **Opus**
5. Include scope progression recommendation (PoC/MVP/Production) per my-architect's Scope Progression policy
6. Apply my-reviewer agent policy for validation of architecture
7. Finalize outcome by this feedback loop
8. Preserve all outcome in docs/ARCHITECTURE.md (including scope progression level)
9. Produce docs/PREREQUISITES.md summarizing what the user should review and prepare:
    - **Architecture review** — key design decisions, trade-offs, and alternatives to evaluate
    - **Tech stack assessment** — languages, frameworks, services, and tools recommended
    - **Scope progression** — confirm the PoC/MVP/Production level is appropriate
    - **Infrastructure & access** — compute, storage, networking, IAM roles, external accounts/keys to provision
    - **Manual approvals** — budget, compliance, vendor contracts, team sign-offs
    - Format as a markdown checklist so the user can tick off reviewed/completed items
10. **STOP — Present docs/PREREQUISITES.md to user for manual review.**
    Inform the user: "Review docs/ARCHITECTURE.md and docs/PREREQUISITES.md. Evaluate the architecture and tech stack, provision any prerequisites, and mark items complete."

    > **Decision options:**
    > - **Proceed** → resume with `/cc-design` to continue to Step 3
    > - **Revise** → request changes to the architecture; my-architect revises and re-presents
    > - **Redefine** → requirements have fundamentally changed; run `/cc-define` (Step 1) first

    Do NOT proceed to Step 3 until user explicitly resumes.

### Step 3: UX/UI & API Design (Model: Opus)
Create user experience, interface, and API design based on architecture.

Step 3 adapts to project context:
- Frontend project: Focus on UX/UI design, Apple HIG, accessibility
- Backend project: Focus on API contracts, data modeling, DX
- Full-stack: Both aspects
- Skip entirely if project has no UI or API design needs

1. Plan agent(s) co-work with my-designer agent, respecting its policies
2. Read docs/ARCHITECTURE.md (from Step 2)
3. Read .agent/prompts/design/ for detailed design guidance (if available)
4. Create UX/UI and/or API design using the model **Opus** (scope per context above)
5. Apply my-reviewer agent policy for validation of design
6. Finalize outcome by this feedback loop
7. Preserve all outcome in docs/UX-DESIGNS.md
8. Next: Proceed to Step 4 (Mock-up)

### Step 4: Mock-up (Model: Sonnet) — STOP gate
Create lightweight visual prototypes from UX design specs.

Step 4 adapts to project context:
- Frontend or full-stack project: Generate HTML/CSS mock-ups
- Backend-only / API-only project: Skip this step entirely

1. Read docs/UX-DESIGNS.md (from Step 3)
2. Read .agent/prompts/design/design_system_prompt.md for token structure (if available)
3. Generate HTML/CSS mock-up files in docs/mockups/:
    - index.html (navigation hub linking all screens)
    - One HTML file per key screen from UX-DESIGNS.md
    - style.css with design tokens (colors, typography, spacing, shadows, radius)
    - Pure HTML/CSS only — no JavaScript, no build tools, no frameworks
    - Responsive layout using CSS Grid/Flexbox
    - Include both light and dark mode via CSS media query or class toggle
4. Apply .agent/prompts/design/design_critique_prompt.md evaluation criteria against the mock-ups
5. **STOP — Present critique results to user for manual review.**
    Inform the user: "Review the design critique results and open docs/mockups/ in your browser. Evaluate the look and feel."

    > **Decision options:**
    > - **Proceed** → resume with `/cc-design` to continue to Step 5
    > - **Revise** → request changes to UX/UI design or mock-ups; my-designer revises and re-presents
    > - **Rearchitect** → architecture assumptions are wrong; re-enter at Step 2 with `/cc-design`

    Do NOT proceed to Step 5 until user explicitly resumes.

### Step 5: System Design (Model: Opus)
Create detailed system design based on architecture. Incorporate design decisions from Step 3.

1. Read docs/ARCHITECTURE.md (from Step 2)
2. Read docs/UX-DESIGNS.md (if exists, from Step 3)
3. Create system design using the model **Opus**
4. Apply my-reviewer agent policy for validation of design
5. Finalize outcome by this feedback loop
6. Preserve all outcome in docs/DESIGNS.md
7. Next: Proceed to Step 6 (Task Breakdown)

### Step 6: Task Breakdown (Model: Sonnet)
Break down design into actionable tasks.

1. Read docs/DESIGNS.md (if exists, from Step 5)
2. Create task breakdowns using the model **Sonnet**
3. Apply my-reviewer agent policy for validation of task breakdown
4. Finalize outcome by this feedback loop
5. Preserve all outcome in docs/TASK-BREAKDOWN.md
6. Next: Proceed to Step 7 (Planning)

### Step 7: Planning (Model: Sonnet) — STOP gate
Create scope-leveled execution plans respecting my-architect's scope progression (PoC → MVP → Production).

1. Read docs/TASK-BREAKDOWN.md (if exists, from Step 6)
2. Create plans using the model **Sonnet**, defining scope levels (PoC/MVP/Production) aligned with the scope progression recommended by my-architect
3. Apply my-reviewer agent policy for validation of plans
4. Finalize outcome by this feedback loop
5. Preserve all outcome in PLANS.md
6. **STOP — Present PLANS.md to user for manual review.**
    Inform the user: "Review PLANS.md. Confirm scope levels, task sequencing, and resource estimates."

    > **Decision options:**
    > - **Proceed** → continue to `/cc-test` (test strategy) or `/cc-implement` (build)
    > - **Revise** → request changes to the plan; tasks or scope adjusted and re-presented
    > - **Redesign** → system design needs rework; re-enter at Step 5 with `/cc-design`
    > - **Rearchitect** → architecture assumptions are wrong; re-enter at Step 2 with `/cc-design`

    Do NOT proceed until user explicitly resumes.

## Issue Integration (optional)
When `github_issues.enabled: true` and `auto_post: true` in PROJECT.yaml, detect linked issue(s) from:
(a) branch name pattern (first number after prefix slash, e.g., `feature/123-desc` → #123),
(b) issue references in recent commit messages (`Refs #N`), or
(c) conversation context.
If found:
1. Update the issue's step label to `step:design` (remove previous step labels)
2. After each STOP gate, post a comment to linked issues with the step outcome:
   ```
   ## Design (cc-design)
   - Step: [N]
   - Key decisions: [summary]
   - Artifacts: [list of docs produced]
   ```
   For public repositories, post only a summary reference ("Architecture decisions documented in docs/ARCHITECTURE.md") rather than full content.
3. If `gh` fails (offline/no remote), skip and continue. If the issue is locked, log a note: "Issue #N is locked — skipping comment."

## Examples

### Example 1: Full design from requirements
User says: "Design the architecture for our new e-commerce platform"
Actions:
1. Step 2: my-architect creates system architecture with scope progression (PoC/MVP/Production); architecture review checklist generated — **STOP for user review**
2. User resumes after reviewing architecture and provisioning prerequisites
3. Step 3: my-designer creates UX flows and API contracts
4. Step 4: HTML/CSS mock-ups generated in docs/mockups/; design critique applied — **STOP for user review**
5. User resumes after reviewing look and feel
6. Step 5: Detailed system design with component interactions
7. Step 6: Task breakdown into implementable units
8. Step 7: Scope-leveled execution plan — **STOP for user review**
9. User resumes and proceeds to `/cc-test` then `/cc-implement`
Result: docs/ARCHITECTURE.md, docs/PREREQUISITES.md, docs/UX-DESIGNS.md, docs/mockups/, docs/DESIGNS.md, docs/TASK-BREAKDOWN.md, PLANS.md

### Example 2: API design only (backend)
User says: "Design the REST API for the payment service"
Actions:
1. Step 2: my-architect defines service boundaries and technology choices; architecture review checklist — **STOP for user review**
2. User resumes after reviewing architecture and provisioning prerequisites
3. Step 3: my-designer creates API contracts, data models, error patterns (skip UX)
4. Step 4: Skipped (backend-only project)
5. Steps 5–7: System design, tasks, and scope-leveled plan — **STOP at Step 7 for plan review**
Result: Focused API design artifacts (no mock-ups)

## Troubleshooting

### REQUIREMENTS.md not found
Cause: Step 1 (cc-define) hasn't been run yet.
Solution: Run `/cc-define` first to produce REQUIREMENTS.md (Step 1), or ask the user for specific design goals.

### Step 3 unclear (frontend vs. backend)
Cause: Project context doesn't clearly indicate whether UI or API design is needed.
Solution: Ask the user. Step 3 adapts: frontend projects focus on UX/UI, backend on API contracts, full-stack on both. Skip entirely if neither applies.

### Step 4 skipped unexpectedly
Cause: Project was classified as backend-only.
Solution: If the project has a frontend component, clarify with the user. Step 4 only generates mock-ups for projects with UI needs.

### Architecture scope too broad
Cause: Trying to design everything at once.
Solution: Use my-architect's scope progression (PoC → MVP → Production) to constrain initial scope. Start with the smallest viable architecture.

### Planning scope unclear
Cause: Scope levels not well-defined or too ambitious for initial iteration.
Solution: Ensure Step 2 included a scope progression recommendation. Step 7 uses those levels to define what goes into each scope (PoC/MVP/Production). Start small.

## Re-entry Mode

cc-design supports **re-entry** — running again to revisit earlier steps when learnings or changes require it. Re-entry is triggered by STOP gate decisions, scope transitions, or escalations from cc-implement/cc-remediate/cc-test.

### Detecting re-entry
When cc-design is invoked, check for existing artifacts (docs/ARCHITECTURE.md, docs/DESIGNS.md, PLANS.md, etc.). If artifacts exist, this is a re-entry run — not a fresh start.

### Re-entry point table

| Trigger | Entry Step | What re-runs | What's preserved |
|---------|-----------|--------------|-----------------|
| STOP gate → **Revise** | Same step | Current step only | All other artifacts |
| STOP gate → **Redesign** | Step 5 | Steps 5–7 | Steps 1–4 artifacts |
| STOP gate → **Rearchitect** | Step 2 | Steps 2–7 | Step 1 (REQUIREMENTS.md) |
| STOP gate → **Redefine** | Step 1 | Steps 1–7 (full restart) | Nothing — fresh pipeline |
| cc-implement → **Replan** | Step 5 | Steps 5–7 | Steps 1–4 artifacts |
| cc-implement → **Rearchitect** | Step 2 | Steps 2–7 | Step 1 (REQUIREMENTS.md) |
| cc-remediate → **Escalation (design)** | Step 5 | Steps 5–7 | Steps 1–4 artifacts |
| cc-remediate → **Escalation (architecture)** | Step 2 | Steps 2–7 | Step 1 (REQUIREMENTS.md) |
| Scope transition → **Redesign** | Step 5 | Steps 5–7 | Steps 1–4 artifacts |
| Scope transition → **Rearchitect** | Step 2 | Steps 2–7 | Step 1 (REQUIREMENTS.md) |

### Re-entry workflow
1. Read the **iteration log** in PLANS.md (if present) — understand what changed and why
2. Identify the **entry point** from the trigger (see table above)
3. **Preserve** all artifacts from steps before the entry point — do not regenerate them
4. **Execute forward** from the entry point through the remaining steps, incorporating new learnings
5. **Update PLANS.md** with an iteration log entry:

PLANS.md uses two iteration log sub-formats under `## Iteration Log`:
- **Re-entry entries** (from cc-design re-entry) — use the format below
- **Scope transition entries** (from cc-implement transitions) — see cc-implement's Scope Level Transition section

```markdown
## Iteration Log
### Iteration [N] — [date]
- **Trigger**: [what caused re-entry — e.g., "scope transition from PoC to MVP"]
- **Entry point**: Step [N] ([step name])
- **What changed**: [summary of changes from this iteration]
- **What preserved**: [artifacts retained from prior iterations]
```
