---
name: cc-implement
description: >-
  Implement software, code, scripts, and artifacts from existing plans (Step 8
  of the 9-step design pipeline). Use when user asks to "build", "code",
  "implement", "create deployment scripts", "refactor", or "simplify" code.
  Writes deployment code/IaC but does NOT execute deployments (use cc-deploy).
  Do NOT use for architecture or design (use cc-design), test strategy (use
  cc-test), or code review (use cc-review).
metadata:
  version: 3.0.0
  category: workflow-automation
---

# SKILL - Step 8: Build

## Purpose
Implement software and relevant artifacts, co-working with ClaudeCode built-in general-purpose agent(s).

This skill owns **Step 8** of the 9-step design pipeline:
`1 (cc-define) → 2 (STOP) → 3 → 4 (STOP) → 5 → 6 → 7 (STOP) → 8 (STOP) → 9`

Steps 8–9 form the **execution loop** — they repeat for each scope level (PoC → MVP → Production) as defined in PLANS.md (Step 7).

## When to use
- Use this skill when end-user asks for 'implementations', 'build', 'coding', 'write deployment scripts', 'refactor' or 'simplify' (in the context of code/artifacts, not strategy or plans)
- Do NOT use for executing deployments ('deploy to [env]', 'release', 'provision') — use cc-deploy instead
- Manually invoke after processing 'plans' (PLANS.md exists)
- Coordinate with my-builder agent policies during implementation work

## Policy
- ClaudeCode built-in general-purpose agent(s) respects my-builder agent's policies
- When implementing tests from a test strategy, this MUST be a separate invocation from the feature implementation — never combine feature code and test code in the same implement session

## Workflow
1. general-purpose agent(s) is co-working with my-builder agent and respect its policies
2. Read PLANS.md (if exists) — identify the current scope level (PoC/MVP/Production)
3. Analyze the context and start implementations (invoke general-purpose or relevant agents as needed)
4. Implement using the appropriate model: **Sonnet** for multi-file or complex logic; **Haiku** for single-file, well-scoped tasks
5. Apply my-reviewer agent policy for validation of what was implemented
6. Finalize outcome by this feedback loop
7. Preserve notable points in docs/IMPLEMENTATIONS.md
8. **STOP — Present implementation to user for local review.**
    Inform the user: "Review the implementation locally. Verify it meets the plan for the current scope level."

    > **Decision options:**
    > - **Proceed** → continue to `/cc-test` (Step 9: Test Strategy)
    > - **Continue building** → resume `/cc-implement` for remaining tasks in this scope level
    > - **Replan** → implementation revealed plan issues; re-enter at Step 5 with `/cc-design`
    > - **Rearchitect** → architecture assumptions are fundamentally broken; re-enter at Step 2 with `/cc-design`
    > - **Review first** → run `/cc-review` before proceeding to test

    Do NOT proceed to Step 9 until user explicitly resumes.
9. Next: Invoke cc-test skill (Step 9) for test strategy

## Issue Creation (at scope transition) — Optional
When `github_issues.enabled: true` in PROJECT.yaml:

### First scope level (before Step 2)
If no open issues exist for the current scope level:
1. Parse PLANS.md or docs/TASK_BREAKDOWN.md for tasks in the current scope level
2. Prompt: "Create GitHub Issues for [current scope level]? ([N] tasks)"
3. If yes:
   a. Ensure labels and milestones exist (per cc-issue-create taxonomy)
   b. Create issues for that scope level only via `> /cc-issue-create --bulk --scope [level]`
   c. Run cc-issue-sync to refresh TASKS.md
4. If no: continue without issues for this scope level
5. If `gh` fails: skip and continue

### Scope level transitions (PoC → MVP, MVP → Production)
At each transition checkpoint (see Scope Level Transition below), before the user decides on next scope level:
1. Parse PLANS.md or docs/TASK_BREAKDOWN.md for tasks in the NEXT scope level
2. Prompt: "Create GitHub Issues for [next scope level]? ([N] tasks)"
3. If yes:
   a. Ensure labels and milestones exist (per cc-issue-create taxonomy)
   b. Create issues for that scope level only via `> /cc-issue-create --bulk --scope [level]`
   c. Run cc-issue-sync to refresh TASKS.md
4. If no: continue without issues for this scope level
5. If `gh` fails: skip and continue

## Issue Integration (optional)
When `github_issues.enabled: true` and `auto_post: true` in PROJECT.yaml, detect linked issue(s) from:
(a) branch name pattern (first number after prefix slash, e.g., `feature/123-desc` → #123),
(b) issue references in recent commit messages (`Refs #N`), or
(c) conversation context.
If found:
1. Update the issue's step label to `step:implement` (remove previous step labels)
2. Post implementation summary as comment:
   ```
   ## Implementation (cc-implement)
   - Files changed: [list]
   - Scope level: [PoC/MVP/Production]
   - Status: [complete/in-progress]
   ```
3. If `gh` fails (offline/no remote), skip and continue. If the issue is locked, log a note: "Issue #N is locked — skipping comment."

## Examples

### Example 1: Feature implementation from plan
User says: "Implement the authentication module from the plan"
Actions:
1. Read PLANS.md for authentication module tasks
2. my-builder implements code following project patterns
3. my-reviewer validates implementation against plan
Result: Feature code committed, docs/IMPLEMENTATIONS.md updated

### Example 2: Test implementation from strategy
User says: "Write the tests from the test strategy"
Actions:
1. Read docs/TEST_STRATEGY.md for test requirements
2. my-builder writes tests in a SEPARATE session from feature code
3. my-reviewer validates coverage against strategy
Result: Test suite created matching the defined strategy

## Troubleshooting

### PLANS.md not found
Cause: No plan exists to implement from.
Solution: Run cc-design skill first to produce PLANS.md, or ask the user for specific implementation instructions.

### Implementation diverges from plan
Cause: Plan assumptions don't match actual codebase.
Solution: Assess divergence severity and respond accordingly:

- **Minor** (naming differences, small API changes) — note in docs/IMPLEMENTATIONS.md and continue building
- **Moderate** (component boundaries shifted, new dependencies needed) — pause implementation, document the divergence, and recommend **Replan** at Step 5 via `/cc-design`
- **Major** (architecture assumptions broken, fundamental approach won't work) — pause implementation, document the divergence, and recommend **Rearchitect** at Step 2 via `/cc-design`

## Scope Level Transition

When Steps 8–9 complete for a scope level (e.g., PoC done, ready for MVP), perform a lightweight checkpoint before starting the next scope level.

### Transition checklist
1. **Capture learnings** — what worked, what surprised, what assumptions broke during this scope level
2. **Assess design validity** — do docs/ARCHITECTURE.md, docs/DESIGNS.md, and PLANS.md still hold for the next scope level?
3. **Recommend re-entry point** — based on what changed:
   - Designs still valid → **Proceed** to next scope level (Steps 8–9)
   - System design needs updates → **Redesign** at Step 5 via `/cc-design`
   - Architecture assumptions broke → **Rearchitect** at Step 2 via `/cc-design`
4. **Present to user** — summarize learnings and recommendation; user decides

**STOP — Do NOT begin the next scope level until user explicitly approves the transition.**

### Iteration log format
Add to PLANS.md after each scope level transition. This uses the "scope transition" sub-format; see cc-design's Re-entry Mode for the "re-entry" sub-format. Both live under `## Iteration Log` in PLANS.md.

```markdown
## Iteration Log
### [Scope Level] → [Next Scope Level] — [date]
- **Learnings**: [what was discovered during implementation and testing]
- **Design validity**: [still valid / needs updates at Step N]
- **Recommendation**: [proceed / redesign / rearchitect]
- **User decision**: [what the user chose]
```
