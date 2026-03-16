---
name: cc-adr
description: >-
  Create Architecture Decision Records (ADRs) for documenting important
  technical decisions. Use when user asks to "create an ADR", "document a
  decision", "record architecture choice", or needs to evaluate technology
  options. Do NOT use for implementation (use cc-implement) or design work
  (use cc-design).
metadata:
  version: 1.0.0
  category: workflow-automation
---

# SKILL - Create Architecture Decision Records

## Purpose
Document important decisions in a reproducible format for later reference. Record options and reasons, adoption/rejection reasons, impact scope, and rollback feasibility.

## When to use
- Use this skill when a technology choice, architecture pattern, or significant trade-off needs documenting
- Manually invoke when my-architect recommends recording a decision
- Coordinate with my-architect agent policies during decision evaluation

## Policy
- Coordinate with my-architect agent for architecture-level decisions
- Always include at least 2 options with honest pros/cons
- ADR quality check: Is the rationale understandable to an unfamiliar party in 2 years?

## Workflow
1. Gather inputs: decision title, context, options, constraints
2. Evaluate options against decision drivers (cost, complexity, operability, scalability, security, reversibility)
3. Document the chosen option with rationale and consequences
4. Include rollback plan and migration notes
5. Apply my-reviewer agent policy for validation of ADR completeness
6. Finalize outcome by this feedback loop
7. Preserve output in `docs/decisions/ADR-YYYYMMDD-<slug>.md`

## ADR Template
```md
# ADR-YYYYMMDD: <Decision Title>

## Status
- Proposed | Accepted | Superseded | Rejected

## Context
- (Background, challenges, assumptions)

## Decision Drivers
- (Decision criteria: e.g., cost, operability, portability, speed, learning curve)

## Options Considered
### Option A: ...
- Pros:
- Cons:
- Notes:

### Option B: ...
- Pros:
- Cons:
- Notes:

## Decision
- We choose **Option X** because ...

## Consequences
- Positive:
- Negative / Risks:
- Mitigations:
- Rollback plan:

## References
- Links / docs / tickets
```

## Examples

### Example 1: Technology choice
User says: "Create an ADR for choosing between PostgreSQL and DynamoDB"
Actions:
1. Gather context: data patterns, team expertise, cost constraints
2. Define options with pros/cons for each
3. Document decision with rationale and consequences
Result: `docs/decisions/ADR-20260312-database-selection.md`

### Example 2: Architecture pattern
User says: "Document our decision to use event-driven architecture"
Actions:
1. Capture context: why synchronous approach is insufficient
2. Evaluate options: REST polling, webhooks, event bus, CQRS
3. Record chosen approach with migration plan and rollback strategy
Result: `docs/decisions/ADR-20260312-event-driven-architecture.md`

## Troubleshooting

### Unclear decision scope
Cause: Decision involves multiple interrelated choices.
Solution: Split into separate ADRs — one per decision. Link them via the References section.

### Missing options or one-sided analysis
Cause: Only the preferred option was analyzed.
Solution: Always include at least 2 options with honest pros/cons. The ADR must show the decision was considered, not predetermined.
