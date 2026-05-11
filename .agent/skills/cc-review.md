---
name: cc-review
description: >-
  Review and validate project progress, code quality, and security. Use when
  user asks to "review", "validate", "check code", "audit", or "verify" work
  in progress. Do NOT use to fix issues (use cc-remediate) or write code (use
  cc-implement). This skill is read-only.
metadata:
  version: 1.0.0
  category: workflow-automation
---

# SKILL - Review project progress

## Purpose
Review all relevant aspects of project progress, co-working with ClaudeCode built-in agent(s) which are relevant

## When to use
- Use this skill at any stage to validate work in progress
- Manually invoke for final validation before commits/deployments
- Apply my-reviewer agent policies throughout all workflows

## Policy
- ClaudeCode built-in agent(s) respects my-reviewer agent's policies
- Review is strictly read-only — no code modifications. All fixes flow through cc-remediate skill to my-builder agent.

## Workflow
1. Apply my-reviewer agent policies (from .agent/subagents/my-reviewer.md)
2. Understand context from input or artifacts (REQUIREMENTS.md, ARCHITECTURE.md, etc.)
3. Review using my-reviewer checklist:
   - Alignment with plan/requirements
   - Security vulnerabilities
   - For security-focused reviews, read .agent/prompts/security/ for detailed guidance
   - For OSS license and legal compliance reviews, read .agent/prompts/legal/ for detailed guidance
   - Code quality and maintainability
   - Safety for destructive actions
4. Provide findings with severity: MUST-FIX / SHOULD-FIX / SUGGESTION
5. Recommend concrete, actionable fixes
6. Preserve findings in docs/feedback/REVIEW-FINDINGS.md (create the `docs/feedback/` directory first if it does not exist)
7. Next: If MUST-FIX findings exist, invoke cc-remediate skill. Otherwise, accept.

## Issue Integration (optional)
When `github_issues.enabled: true` and `auto_post: true` in PROJECT.yaml, detect linked issue(s) from:
(a) branch name pattern (first number after prefix slash, e.g., `feature/123-desc` → #123),
(b) issue references in recent commit messages (`Refs #N`), or
(c) conversation context.
If found:
1. Update the issue's step label to `step:review` (remove previous step labels)
2. Post review findings summary as comment:
   ```
   ## Review (cc-review)
   - MUST-FIX: [count]
   - SHOULD-FIX: [count]
   - SUGGESTION: [count]
   - Status: [accepted/needs-remediation]
   ```
3. If `gh` fails (offline/no remote), skip and continue. If the issue is locked, log a note: "Issue #N is locked — skipping comment."

## Examples

### Example 1: Pre-commit validation
User says: "Review the changes before I commit"
Actions:
1. Read staged changes and related plan artifacts
2. Apply my-reviewer checklist (alignment, security, quality, safety)
3. Produce findings table with severity levels
Result: docs/feedback/REVIEW-FINDINGS.md with actionable findings

### Example 2: Security-focused audit
User says: "Audit the auth module for security issues"
Actions:
1. Read .agent/prompts/security/ for detailed guidance
2. Apply OWASP Top 10 and STRIDE analysis
3. Check for injection, auth bypass, data exposure
Result: docs/feedback/REVIEW-FINDINGS.md with security-specific findings

## Troubleshooting

### No artifacts to review
Cause: No REQUIREMENTS.md, ARCHITECTURE.md, or code changes to review.
Solution: Ask the user what specifically should be reviewed, or run cc-define / cc-design first.

### Reviewer attempts to fix code
Cause: Reviewer crossed into implementation territory.
Solution: Stop immediately. Findings go to docs/feedback/REVIEW-FINDINGS.md. All fixes must flow through cc-remediate to my-builder.
