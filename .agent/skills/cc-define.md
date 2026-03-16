---
name: cc-define
description: >-
  Understand context and define requirements for a project (Step 1 of the
  9-step design pipeline). Use when user asks to "define requirements", "gather
  requirements", "analyze scope", or "understand the project". Do NOT use for
  architecture or design (use cc-design) or implementation (use cc-implement).
metadata:
  version: 3.0.0
  category: workflow-automation
---

# SKILL - Step 1: Understand and Define Requirements

## Purpose
Understand context and define requirements for this project, co-working with ClaudeCode built-in Explore agent(s).

This skill owns **Step 1** of the 9-step design pipeline:
`1 (cc-define) → 2 (STOP) → 3 → 4 (STOP) → 5 → 6 → 7 (STOP) → 8 (STOP) → 9`

## When to use
- Use this skill when end-user asks for 'requirements' definition
- Manually invoke when ClaudeCode built-in Explore agent(s) are needed for requirements analysis
- Coordinate with my-analyst agent policies during requirements gathering

## Policy
ClaudeCode built-in Explore agent(s) respects my-analyst agent's policies

## Model Selection
| Step | Model | Rationale |
|------|-------|-----------|
| **Step 1: Requirements** | Opus | Deep investigation, stakeholder analysis, constraint identification |

## Workflow — Step 1: Requirements (Model: Opus)
1. Explore agent(s) co-work with my-analyst agent, respecting its policies
2. Read Vision.md (if exists), or input from end-user
3. Analyze the context and start search and investigation (invoke Explore or relevant agents as needed)
4. Define requirements for what to achieve
5. Apply my-reviewer agent policy for validation of what was investigated
6. Finalize outcome by this feedback loop
7. Preserve all outcome in REQUIREMENTS.md
8. Next: Suggest cc-design skill (Step 2 onward) as recommended next step — "Run `/cc-design` to begin Step 2: Architecture"

## Issue Integration (optional)
When `github_issues.enabled: true` and `auto_post: true` in PROJECT.yaml, detect linked issue(s) from:
(a) branch name pattern (first number after prefix slash, e.g., `feature/123-desc` → #123),
(b) issue references in recent commit messages (`Refs #N`), or
(c) conversation context.
If found:
1. Update the issue's step label to `step:define` (remove previous step labels)
2. Post a comment to the linked issue summarizing the requirements outcome:
   ```
   ## Requirements (cc-define)
   - Functional requirements: [count]
   - Non-functional requirements: [count]
   - Constraints: [count]
   - Status: Step 1 complete
   ```
3. If `gh` fails (offline/no remote), skip and continue. If the issue is locked, log a note: "Issue #N is locked — skipping comment."

## Examples

### Example 1: New project kickoff
User says: "Define the requirements for our new authentication service"
Actions:
1. Explore agent reads existing codebase, Vision.md, and related docs
2. my-analyst identifies stakeholders, constraints, and functional needs
3. Requirements are structured into functional, non-functional, and constraints
4. my-reviewer validates completeness and clarity
Result: REQUIREMENTS.md created with prioritized requirements
Next step suggestion: "Step 1 complete. Run `/cc-design` to proceed to Step 2: Architecture."

### Example 2: Mid-project scope clarification
User says: "What exactly do we need for the API migration?"
Actions:
1. Explore agent investigates current API surface and dependencies
2. my-analyst maps existing vs. target state
3. Gap analysis produces clear requirement set
Result: REQUIREMENTS.md updated with migration-specific requirements
Next step suggestion: "Step 1 complete. Run `/cc-design` to proceed to Step 2: Architecture."

## Troubleshooting

### Vision.md or input not found
Cause: No Vision.md exists and user provided no input.
Solution: Ask the user to describe the project goals, or create a minimal Vision.md with project objectives.

### Requirements too broad or vague
Cause: Insufficient context or overly ambitious scope.
Solution: Break down into sub-domains. Use Explore agents to investigate each area separately, then consolidate.
