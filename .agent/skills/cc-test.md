---
name: cc-test
description: >-
  Define test strategy, coverage gap analysis, test architecture and test plans
  (Step 9 of the 9-step design pipeline). Use when user asks for "test strategy",
  "test plan", "test coverage", "what to test", or "testing approach". This skill
  plans WHAT to test, not writes test code. Do NOT use for writing tests (use
  cc-implement), reviewing test results (use cc-review), or executing deployments
  (use cc-deploy).
metadata:
  version: 3.0.0
  category: workflow-automation
---

# SKILL - Step 9: Test Strategy

## Purpose
Own test strategy — coverage gap analysis, test architecture, test plans, and regression mapping. This skill plans WHAT to test; my-builder writes the actual test code.

This skill owns **Step 9** of the 9-step design pipeline:
`1 (cc-define) → 2 (STOP) → 3 → 4 (STOP) → 5 → 6 → 7 (STOP) → 8 (STOP) → 9`

Steps 8–9 form the **execution loop** — they repeat for each scope level (PoC → MVP → Production) as defined in PLANS.md (Step 7).

## When to use
- Use this skill when end-user asks for 'test strategy', 'test plan', 'test coverage', or 'testing'
- Manually invoke before implementation to define what needs testing
- Coordinate with my-analyst agent (strategic planning) and my-reviewer agent (validates coverage)

## Policy
- Test skill NEVER writes code — that is always delegated to my-builder via cc-implement skill
- my-builder NEVER decides test strategy — that is always owned by this skill
- Test implementation MUST be a separate my-builder invocation from feature implementation — the my-builder instance that writes tests must not be the same instance that wrote the feature code
- my-analyst agent drives strategic planning; my-reviewer agent validates coverage completeness

## Workflow
1. my-analyst agent reads PLANS.md (if exists), codebase, and available coverage data
2. Identify test pyramid ratios appropriate for the project (unit / integration / e2e)
3. Analyze coverage gaps: what is untested, undertested, or at risk
4. Define test architecture: fixture strategy, mock boundaries, test data management
5. Map regression risks: which areas need regression coverage and why
6. Scope non-functional testing: performance, security, accessibility as applicable
7. Assess flakiness risk in existing or planned tests
8. Select or confirm framework choices aligned with project conventions
9. my-reviewer agent validates coverage completeness and strategy soundness
10. Finalize outcome by this feedback loop
11. Preserve all outcome in docs/TEST_STRATEGY.md or docs/TEST_PLAN.md
12. Next: Invoke cc-implement skill so my-builder writes tests per the strategy, or invoke cc-deploy skill to execute deployment operations

## Issue Integration (optional)
When `github_issues.enabled: true` and `auto_post: true` in PROJECT.yaml, detect linked issue(s) from:
(a) branch name pattern (first number after prefix slash, e.g., `feature/123-desc` → #123),
(b) issue references in recent commit messages (`Refs #N`), or
(c) conversation context.
If found:
1. Update the issue's step label to `step:test` (remove previous step labels)
2. Post test strategy summary as comment:
   ```
   ## Test Strategy (cc-test)
   - Test pyramid: [ratios]
   - Coverage gaps identified: [count]
   - Framework: [chosen framework]
   ```
3. If `gh` fails (offline/no remote), skip and continue. If the issue is locked, log a note: "Issue #N is locked — skipping comment."

## Examples

### Example 1: Greenfield test strategy
User says: "Create a test strategy for the new payment service"
Actions:
1. my-analyst reads PLANS.md and analyzes payment service architecture
2. Defines test pyramid: 70% unit, 20% integration, 10% e2e
3. Maps critical paths: payment flow, refunds, webhook handling
4. my-reviewer validates coverage completeness
Result: docs/TEST_STRATEGY.md with prioritized test plan

### Example 2: Coverage gap analysis
User says: "What's our test coverage gap?"
Actions:
1. my-analyst reads existing tests and coverage reports
2. Identifies untested code paths and high-risk areas
3. Produces gap analysis with risk-ranked priorities
Result: docs/TEST_STRATEGY.md with coverage gaps and remediation plan

## Troubleshooting

### No existing tests or coverage data
Cause: Greenfield project or no test infrastructure.
Solution: Start with framework selection and test pyramid definition. Recommend starting with high-risk paths first.

### User asks to "write tests"
Cause: Confusion between test strategy and test implementation.
Solution: Define the strategy first with cc-test, then invoke cc-implement to have my-builder write the actual test code.

### Test strategy reveals design flaws
Cause: During test planning, the design turns out to be untestable — circular dependencies, missing seams for mocking, tightly coupled components, or no clear contract boundaries.
Solution: This is a design problem, not a testing problem. Recommend `/cc-design` re-entry at Step 5 (system design) to restructure for testability. Pass the specific testability concerns as context.

### Test failures indicate wrong assumptions
Cause: Tests fail not because of code bugs, but because the underlying assumptions are wrong (e.g., expected data shapes don't match reality, integration points behave differently than designed).
Solution: Distinguish the root cause:
- **Code bugs** (logic errors, typos, missing edge cases) → fix via `/cc-remediate`
- **Design assumption failures** (component contracts wrong, data flow incorrect) → recommend `/cc-design` re-entry at Step 5
- **Architecture assumption failures** (technology can't deliver required capability, fundamental approach flawed) → recommend `/cc-design` re-entry at Step 2
