# AGENTS.md (Global) — Personal Operating Rules

## Default working style
- Start with: (1) short plan (2) execute (3) verify (4) summarize changes & next steps
- Prefer minimal diffs. Avoid large refactors unless explicitly requested.
- When uncertain, ask *one* precise question OR propose a safe default with assumptions.

## Safety / risk
- Never run destructive commands (delete/migrate/deploy/prod changes) without explicit approval.
- Never add new dependencies without stating rationale, size/impact, and rollback plan.
- Never include secrets. If a secret appears, stop and propose remediation.

## Quality bar
- Run the project’s standard checks (format/lint/test) when available.
- Keep changes reviewable (small commits, clear commit messages).
- Update docs when behavior changes.

## Repo instructions precedence
- Always read and follow: <project-root>/AGENTS.md, RULES.md, PLANS.md (if present).
- Project instructions override this global file.
