---
name: cc-remediate
description: >-
  Apply fixes for review findings and re-validate. Use when user asks to
  "remediate", "fix findings", "resolve review issues", or "apply fixes from
  review". Invoked after cc-review produces MUST-FIX findings. Do NOT use for
  initial review (use cc-review) or new implementation (use cc-implement).
metadata:
  version: 1.0.0
  category: workflow-automation
---

# SKILL - Remediate Review Findings

## Purpose
Close the broken review feedback loop. Take my-reviewer findings, coordinate my-builder to apply fixes, then re-invoke my-reviewer to validate. This is the "Next" step from cc-review when MUST-FIX findings exist.

## When to use
- Use this skill when end-user asks to 'remediate', 'fix findings', or 'resolve issues'
- Manually invoke after cc-review skill produces MUST-FIX findings
- Coordinate with my-builder agent (applies fixes) and my-reviewer agent (re-validates)

## Policy
- my-builder agent applies fixes following its own policies
- my-reviewer agent re-validates following its own policies
- Maximum 3 remediation iterations before mandatory escalation
- Reviewer re-validates ONLY the original finding set; new concerns are logged as SUGGESTION for the next review cycle
- SHOULD-FIX findings are addressed when feasible; SUGGESTIONS are optional

## Systemic Issue Criteria
An issue is "systemic" and requires escalation to my-architect when:
- (a) The same finding category recurs across 2+ iterations
- (b) Fixes require changes outside the original scope
- (c) The iteration cap (3) is reached without full resolution

## Workflow
1. Read my-reviewer findings from docs/REVIEW_FINDINGS.md (MUST-FIX / SHOULD-FIX / SUGGESTION)
2. Triage findings: separate MUST-FIX from lower-priority items
3. my-builder agent applies fixes for all MUST-FIX findings
4. my-builder agent addresses SHOULD-FIX findings where feasible
5. my-reviewer agent re-validates the fixed code against the original finding set only (new concerns logged as SUGGESTION for next review cycle)
6. If MUST-FIX findings remain from the original set, return to step 3 (max 3 iterations)
7. If iteration cap reached or systemic issue criteria met, escalate to my-architect agent
8. Preserve findings and resolution status in docs/REMEDIATION.md (see output template below)
9. Next: Determine outcome based on resolution status:
   - **All MUST-FIX resolved** → accept; remediation complete
   - **Systemic / architectural issues** → escalate beyond remediation:
     - If the pattern suggests **system design flaws** (component boundaries, API contracts, data flow) → recommend `/cc-design` re-entry at Step 5, with docs/REMEDIATION.md as context
     - If the pattern suggests **architecture flaws** (technology choices, fundamental structure) → recommend `/cc-design` re-entry at Step 2, with docs/REMEDIATION.md as context
     - Document the escalation recommendation in docs/REMEDIATION.md under the Escalations section

## Output Template — docs/REMEDIATION.md

```markdown
# Remediation Report

## Summary
- Review source: docs/REVIEW_FINDINGS.md
- Iterations: [N of 3 max]
- Status: RESOLVED / ESCALATED

## Findings Resolution

| # | Finding | Severity | Status | Notes |
|---|---------|----------|--------|-------|
| 1 | [description] | MUST-FIX | FIXED / DEFERRED / ESCALATED | [what was done] |
| 2 | [description] | SHOULD-FIX | FIXED / DEFERRED / ESCALATED | [what was done] |

## Iteration Log
### Iteration 1
- Findings addressed: [list]
- Outcome: [remaining issues or resolved]

## Escalations (if any)
- [Systemic issue description and reason for escalation]
```

## Issue Integration (optional)
When `github_issues.enabled: true` and `auto_post: true` in PROJECT.yaml, detect linked issue(s) from:
(a) branch name pattern (first number after prefix slash, e.g., `feature/123-desc` → #123),
(b) issue references in recent commit messages (`Refs #N`), or
(c) conversation context.
If found:
1. Update the issue's step label to `step:remediate` (remove previous step labels)
2. Post remediation summary as comment:
   ```
   ## Remediation (cc-remediate)
   - Iteration: [N of 3]
   - MUST-FIX resolved: [count]
   - Status: [RESOLVED/ESCALATED]
   ```
3. If `gh` fails (offline/no remote), skip and continue. If the issue is locked, log a note: "Issue #N is locked — skipping comment."

## Examples

### Example 1: Straightforward fix cycle
User says: "Fix the review findings"
Actions:
1. Read docs/REVIEW_FINDINGS.md — 2 MUST-FIX, 1 SHOULD-FIX
2. my-builder fixes both MUST-FIX items and the SHOULD-FIX
3. my-reviewer re-validates — all resolved
Result: docs/REMEDIATION.md with Status: RESOLVED in 1 iteration

### Example 2: Escalation to architect
User says: "Remediate the security findings"
Actions:
1. Read docs/REVIEW_FINDINGS.md — 3 MUST-FIX (same auth pattern issue)
2. my-builder fixes in iteration 1, but reviewer finds same category in iteration 2
3. Systemic issue criteria met (same finding category across 2+ iterations)
Result: Escalated to my-architect for architectural resolution

## Troubleshooting

### docs/REVIEW_FINDINGS.md not found
Cause: No review has been run yet.
Solution: Run cc-review skill first to produce findings.

### Iteration cap reached without resolution
Cause: Fixes keep introducing new issues or the root cause is architectural.
Solution: Escalate to my-architect per systemic issue criteria. Document the pattern in docs/REMEDIATION.md.

### Reviewer finds design flaws, not just code bugs
Cause: The review findings point to design-level problems (wrong abstractions, missing components, broken contracts) rather than implementation bugs.
Solution: More remediation iterations won't help — the design itself needs to change. Recommend `/cc-design` re-entry at Step 5 (system design) or Step 2 (architecture) depending on severity, passing docs/REMEDIATION.md as context for what broke.
