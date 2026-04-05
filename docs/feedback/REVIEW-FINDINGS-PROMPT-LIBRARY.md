# Review Findings: Prompt Library (review/architecture/perf-scale/cost/test/docs-dx)

**Date:** 2026-04-05
**Reviewer:** my-reviewer (5 parallel agents + lead synthesis)
**Scope:** All new/modified files in `.agent/prompts/` from this session

---

## Summary

- **MUST-FIX:** 2
- **SHOULD-FIX:** 4
- **SUGGESTION:** 5
- **Status:** needs-remediation

---

## Findings

| ID | File | Line | Issue | Severity |
|----|------|------|-------|----------|
| F-01 | `review/project_review_master_prompt.md` | 40 | Prompt count claims "15 prompts" but map lists 14 distinct files. Should be "14 deep-dive prompts + 1 master = 15 total" or corrected to 14. | MUST-FIX |
| F-02 | `review/project_review_master_prompt.md` | 412 | Scoring table row says "Cost & Sustainability" but section heading (line 202) and library map (line 32) say "Cost & Financial Sustainability". Inconsistent domain name. | MUST-FIX |
| F-03 | `perf-scale/performance_scalability_prompt.md` | 192-214 | Section 6 "Cost Efficiency" duplicates `cost/cost_sustainability_prompt.md` (compute right-sizing, data transfer, CDN offload, cost-per-request projection). Should be reduced to cross-reference. | SHOULD-FIX |
| F-04 | `perf-scale/performance_scalability_prompt.md` | 111, 127 | Table alignment uses `---:` (right-align) inconsistent with all other tables in the library. Should be left-aligned `---`. | SHOULD-FIX |
| F-05 | `cost/cost_sustainability_prompt.md` | 79-85 | AI/LLM Cost Optimization Checklist missing three material items for Anthropic-stack projects: extended thinking token pricing, tool-use token overhead, Batch API 50% discount. | SHOULD-FIX |
| F-06 | `review/project_review_master_prompt.md` | 437 | Executive summary missing `**Cost posture:**` line — it was added but the field name doesn't match the cost prompt's rating scale (`CRITICAL / WASTEFUL / FAIR / EFFICIENT / OPTIMIZED`). Verify alignment. | SHOULD-FIX |
| F-07 | `architecture/architecture_code_health_prompt.md` | Sec 2 | Dependency Architecture section overlaps with `psirt_supply_chain_prompt.md`. Scope is complementary (structural vs CVE) but no cross-reference exists. | SUGGESTION |
| F-08 | `architecture/architecture_code_health_prompt.md` | Sec 4 | Error Handling overlaps with AppSec prompt (code quality vs info disclosure). Cross-reference would clarify boundary. | SUGGESTION |
| F-09 | `test/test_adequacy_prompt.md` | Sec 6 | Security Testing section overlaps with AppSec prompt. Scoping is appropriate (test existence vs vulnerability analysis) but cross-reference would help. | SUGGESTION |
| F-10 | `review/project_review_master_prompt.md` | 28-29 | Library map lists `design_system_prompt.md` and `design_to_code_prompt.md` but neither is referenced in Section 4 body text or escalation table. Not broken, but could confuse. | SUGGESTION |
| F-11 | `review/project_review_master_prompt.md` | 469-486 | Operational Readiness has no domain-level escalation row; subsumed under Security. Consider explicit row for clarity. | SUGGESTION |

---

## Recommendations

### MUST-FIX

**F-01:** Change line 40 to: `**Totals:** 13 sections, 11 scored domains, 14 deep-dive prompts across 9 directories.`

**F-02:** Change scoring table row from `Cost & Sustainability` to `Cost & Financial Sustainability`.

### SHOULD-FIX

**F-03:** Replace perf-scale Section 6 with a brief cross-reference to `cost/cost_sustainability_prompt.md`, keeping only 3-4 performance-adjacent cost bullets. Renumber Section 7 to Section 6.

**F-04:** Fix right-aligned columns on perf-scale lines 111 and 127.

**F-05:** Add to cost prompt LLM checklist: extended thinking budget, tool-use token overhead, Batch API discount.

**F-06:** Verify the executive summary cost posture line matches the cost prompt's rating vocabulary.

### SUGGESTION (no action required, but recommended)

**F-07/F-08/F-09:** Add one-line cross-references to adjacent domain prompts where overlap exists (architecture → psirt, architecture → appsec, test → appsec).

**F-10:** Add `design_system_prompt.md` and `design_to_code_prompt.md` mentions to Section 4 body or escalation table.

**F-11:** Add explicit Operational Readiness row in escalation table pointing to `security/csirt_incident_response_prompt.md`.

---

## Verification Needed

- [ ] After F-01 fix, re-count prompts to confirm accuracy
- [ ] After F-02 fix, grep "Cost &" across master prompt to confirm no remaining inconsistencies
- [ ] After F-03 fix, verify perf-scale section numbering is sequential
- [ ] After F-05 fix, confirm Anthropic-specific items are generic enough for non-Anthropic projects

---

## Next

MUST-FIX findings exist. Invoke **cc-remediate** to apply fixes.
