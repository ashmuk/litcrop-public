---
name: cc-deploy
description: >-
  Execute deployments, releases, and infrastructure provisioning from pre-built
  artifacts. Use when user asks to "deploy to [env]", "release", "provision",
  "execute deployment", "promote to [env]", or "rollback". This skill EXECUTES
  deployment operations — it does NOT write deployment code (use cc-implement)
  or plan deployment strategy (use cc-design).
metadata:
  version: 2.0.0
  category: workflow-automation
---

# SKILL - Deploy and Release

## Purpose
Execute pre-prepared deployment scripts, IaC, and release operations with mandatory safety gates. This is a post-pipeline toolbox skill — invoked after the 9-step design pipeline completes, typically after cc-test and cc-review.

Typical invocation flow:
`cc-implement (Step 8) → cc-test (Step 9) → cc-review → cc-deploy`

## Scope

### Positive scope (DOES)
- **Execute** pre-prepared deployment scripts, IaC, and release operations
- **Validate** pre-deployment prerequisites (credentials, env vars, infra health)
- **Orchestrate** multi-step deployment sequences with per-step rollback
- **Log** all commands and outcomes in docs/DEPLOYMENTS.md (audit trail)
- **Verify** post-deployment health (smoke tests, error rates, basic observability)
- **Rollback** on failure (user-approved, not automatic)

### Negative scope (does NOT)
- **Write** deployment code, IaC, CI/CD YAML, Dockerfiles — that's cc-implement
- **Plan** what to deploy or to which environments — that's cc-design / PLANS.md
- **Decide** scope progression strategy (PoC→MVP→Prod) — that's cc-design
- **Define** test strategy for deployment validation — that's cc-test
- **Review** deployment code quality — that's cc-review
- **Set up** long-term monitoring/observability infrastructure — that's cc-implement

## When to use
- Use this skill when end-user asks to 'deploy to [env]', 'release', 'provision', 'execute deployment', 'promote to [env]', or 'rollback'
- Manually invoke after cc-implement and cc-review have produced deployment-ready artifacts
- Coordinate with my-builder agent (executes operations) and my-reviewer agent (safety gate)

## Policy
- Every deployment requires my-reviewer pre-flight gate + user approval before any execution
- my-builder agent executes deployment operations following its own policies
- my-reviewer agent performs adversarial safety review before any execution
- Every step in the deployment plan MUST have a rollback command
- Rollback execution is always user-approved, never automatic
- All commands logged verbatim in docs/DEPLOYMENTS.md
- Production deployments require elevated gate: my-reviewer pre-flight + user approval with explicit blast radius acknowledgment + mandatory diff review of every command before execution
- Each environment approved separately in multi-environment operations

## Agent Ownership

| Role | Agent | Rationale |
|------|-------|-----------|
| **Primary** | my-builder | Already owns infrastructure & CI/CD, deployment scripts, runbooks |
| **Safety gate** (mandatory) | my-reviewer | Pre-flight review before any destructive/irreversible command |
| **Escalation** | my-architect | When deployment reveals infrastructure design problems |

### Model recommendations

| Phase | Model | Rationale |
|-------|-------|-----------|
| Pre-flight plan | Sonnet | Structured checklist generation |
| Safety gate | Opus | Adversarial reasoning about irreversible actions |
| Command execution | Sonnet | Deployment commands may be destructive; needs judgment on partial failures |
| Rollback assessment | Opus | Judgment under pressure |
| Verification checklist | Sonnet | Mechanical walk through PASS/FAIL items |
| Post-deploy findings | Sonnet | Issue triage and acceptance-criteria drafting; mechanical fixes can drop to Haiku |

## Workflow

### Phase 1: PLAN (my-builder)
1. Read PLANS.md (scope level), docs/ARCHITECTURE.md, docs/IMPLEMENTATIONS.md
2. Determine target: environment (local/staging/production) + scope level (PoC/MVP/Prod)
3. Generate `docs/DEPLOY_PLAN.md`:
   - Infrastructure changes (aws resources)
   - Application deployment steps
   - GitHub operations (releases, environments, secrets)
   - Rollback procedure per step
   - Health checks / smoke tests
   - Blast radius classification

### Phase 2: GATE (my-reviewer) — **STOP**
4. my-reviewer safety checklist:
   - Rollback exists for every destructive step
   - No secrets in artifacts
   - Correct environment targeted
   - Prerequisites met (credentials, env vars, infra health)
   - Blast radius acceptable
   - **Pre-deploy environment validation** — verify runtime config before deploying, not after:
     - [ ] Required env / config files exist with all expected variables set
     - [ ] External dependencies (APIs, DBs, queues) reachable from the target environment with the configured credentials
     - [ ] Inter-service contract spot-check: a sample call from each upstream caller returns the expected content type and shape (e.g. JSON, not an error page)
     - Adapt these checks to the current project's stack.
5. **STOP — Present deployment plan for user approval.**

   > **Decision options:**
   > - **Approve** → proceed to execution
   > - **Revise** → adjust plan, return to Phase 1
   > - **Abort** → cancel deployment

   Do NOT proceed to execution until user explicitly approves.

### Phase 3: EXECUTE (my-builder)
6. Execute steps sequentially per approved plan
7. After each major step: capture output, verify success
8. On failure: **STOP immediately**, capture state, present rollback options

### Phase 4: VERIFY (my-reviewer) — Structured Checklist

9. **Generate verification checklist** — output a deploy-specific checklist. Adapt the categories below to the project's surface area; only the relevant ones apply to any single deployment:

   **API / Service endpoints** (where applicable):
   - [ ] Each endpoint returns expected status code + response shape
   - [ ] Auth-protected endpoints reject unauthenticated requests (if auth is implemented)
   - [ ] Error responses match the project's error contract

   **Frontend / UI** (where applicable, per locale the project supports):
   - [ ] Every page loads without console errors
   - [ ] No hardcoded copy from another locale visible in any locale mode
   - [ ] Smallest supported viewport: no overflow, clipping, or layout shift
   - [ ] Largest supported viewport: responsive layout renders correctly

   **Cross-Cutting**:
   - [ ] User-facing settings (theme, locale, units, etc.) persist across navigation
   - [ ] Domain entities (account name, project name, etc.) appear where expected in the page chrome
   - [ ] Domain values render in their human-readable form, not raw codes

   The list above is a baseline — add project-specific items, and remove categories that don't apply.

10. **Execute checklist** — a Sonnet agent (or human) works through each item. Record PASS/FAIL for each.
11. Validate deployment outcome
12. Append to `docs/DEPLOYMENTS.md` (create file with header if it does not exist)

### Phase 5: POST-DEPLOY FINDINGS — Issue-First Rule

13. For ANY finding from verification (failed checklist items, unexpected behavior, UX issues):
    - **Track it before deciding fix-or-defer.** The "issue" is whatever tracker the project uses:
      - When `github_issues.enabled: true` in PROJECT.yaml, create a GitHub Issue via `/cc-issue-create` and tag with milestone, severity, and `step:deploy` label.
      - Otherwise, append the finding to `docs/feedback/REVIEW-FINDINGS.md` (or the project's chosen tracker) with severity.
    - THEN decide: fix now or defer to next cycle.
    - If fix now and the fix is mechanical (string renames, config tweaks, single-file edits): delegate to my-builder with acceptance criteria from the tracked finding; my-reviewer policy applies to the resulting diff.

14. Present results:

    > **Decision options:**
    > - **Accept** → deployment complete, any issues are tracked
    > - **Rollback** → execute rollback procedure (user-approved)
    > - **Investigate** → need more info before deciding
    > - **Fix now** → address critical findings immediately (issues already created)

## Tool Integration: Progressive Complexity

### aws-cli (infrastructure)
- **Provisioning**: `aws cloudformation deploy`, `aws s3 sync`, `aws ecs update-service`
- **Configuration**: `aws ssm put-parameter`, `aws secretsmanager create-secret`
- **Verification**: `aws cloudformation describe-stacks`, `aws ecs describe-services`
- All commands logged verbatim in docs/DEPLOYMENTS.md

### gh CLI (progressive by scope level)

| Scope | gh Usage | Examples |
|-------|----------|---------|
| **PoC** | Basic releases | `gh release create --prerelease`, `gh api` status |
| **MVP** | Environments + deployments | `gh secret set`, `gh api /repos/.../environments`, deployment status tracking |
| **Production** | Full deployment workflow | Environment protection rules, required reviewers, wait timers, `gh api --method POST /repos/{owner}/{repo}/deployments` with production env |

### Terraform/CDK (when project uses IaC)
- `terraform plan` output reviewed in Gate phase
- `terraform apply` only after user approval
- State management documented in plan

## Scope Progression

| Level | Strategy | Typical Operations |
|-------|----------|-------------------|
| **PoC** | Local / minimal | docker-compose, GitHub Actions workflow dispatch, `gh release create --prerelease` |
| **MVP** | Cloud staging | S3/CloudFront, ECS task update, Lambda deploy, gh environments |
| **Production** | Full with rollback | Blue-green/canary, CloudFormation/CDK stacks, DNS cutover, monitoring validation |

## Artifacts

| Artifact | Purpose | Lifecycle |
|----------|---------|-----------|
| `docs/DEPLOY_PLAN.md` | Pre-deployment plan | Overwritten per deployment (authoritative history lives in DEPLOYMENTS.md) |
| `docs/DEPLOYMENTS.md` | Append-only deployment log | Appended after each deployment |

## Output Template — docs/DEPLOYMENTS.md entry

```markdown
## Deployment — [date] — [environment]

### Plan
- Scope level: [PoC/MVP/Production]
- Target environment: [local/staging/production]
- Artifacts deployed: [list]

### Execution Log
| Step | Command | Status | Output |
|------|---------|--------|--------|
| 1 | [command] | SUCCESS/FAILED | [summary] |

### Health Checks
- [check]: PASS/FAIL

### Outcome
- Status: DEPLOYED / ROLLED_BACK / FAILED
- Rollback executed: Yes/No
- Notes: [any observations]
```

## Issue Integration (optional)
When `github_issues.enabled: true` and `auto_post: true` in PROJECT.yaml, detect linked issue(s) from:
(a) branch name pattern (first number after prefix slash, e.g., `feature/123-desc` → #123),
(b) issue references in recent commit messages (`Refs #N`), or
(c) conversation context.
If found:
1. Update the issue's step label to `step:deploy` (remove previous step labels)
2. Post deployment status as comment:
   ```
   ## Deployment (cc-deploy)
   - Environment: [target]
   - Scope level: [PoC/MVP/Production]
   - Status: [DEPLOYED/ROLLED_BACK/FAILED]
   ```
3. Do not close issues automatically — let `Closes #N` in the merged PR handle closure. If no PR will follow, ask the user whether to close the issue.
4. If `gh` fails (offline/no remote), skip and continue. If the issue is locked, log a note: "Issue #N is locked — skipping comment."

## Examples

### Example 1: PoC deployment to GitHub Pages
User says: "Deploy the PoC to GitHub Pages"
Actions:
1. my-builder generates DEPLOY_PLAN.md: gh-pages deploy, rollback = unpublish
2. my-reviewer validates: correct repo, no secrets, rollback exists
3. **STOP** — user approves plan
4. my-builder executes: `gh release create --prerelease`, triggers GitHub Actions deploy workflow
5. my-reviewer verifies: site accessible, content correct
Result: docs/DEPLOYMENTS.md updated with deployment log

### Example 2: MVP deployment to AWS staging
User says: "Deploy to staging"
Actions:
1. my-builder reads PLANS.md (MVP scope), generates DEPLOY_PLAN.md
2. my-reviewer safety gate: env vars set, staging targeted (not prod), rollback per step
3. **STOP** — user approves
4. my-builder executes: `terraform apply`, `aws ecs update-service`, health checks
5. my-reviewer verifies: service healthy, endpoints responding
Result: docs/DEPLOYMENTS.md updated

### Example 3: Rollback after failed deployment
During execution, ECS service fails health check:
1. **STOP immediately** — capture error state
2. Present rollback options from DEPLOY_PLAN.md
3. **User approves rollback**
4. my-builder executes rollback: `aws ecs update-service --task-definition [previous]`
5. my-reviewer verifies: service restored to previous state
Result: docs/DEPLOYMENTS.md records deployment failure + rollback

## Troubleshooting

### Prerequisites not met
Cause: Missing credentials, env vars, or infrastructure not provisioned.
Solution: List missing prerequisites. Recommend cc-implement to create missing infrastructure code, then re-invoke cc-deploy.

### Deployment code doesn't exist yet
Cause: User wants to deploy but no deployment scripts/IaC have been written.
Solution: cc-deploy executes, not writes. Recommend cc-implement to create deployment artifacts first.

### Deployment reveals infrastructure design problems
Cause: Infrastructure architecture doesn't support the deployment pattern needed.
Solution: Escalate to my-architect. Recommend `/cc-design` re-entry at Step 2 (architecture) or Step 5 (system design) depending on severity.

### Rollback impossible for a step
Cause: Some operations are inherently irreversible (e.g., data migrations, DNS propagation).
Solution: Elevate approval requirement. Document mitigation strategy in DEPLOY_PLAN.md. Require explicit user acknowledgment of irreversibility before proceeding.

## Connection to Feedback Loops
- **Post-deploy issues** → recommend re-entry: infra design → Step 2, system design → Step 5, code bugs → cc-remediate
- **Scope transition** → cc-deploy is the natural action after cc-implement's scope transition checkpoint
- **No pipeline STOP gate** — cc-deploy IS inherently gated (Phase 2 requires explicit approval)
