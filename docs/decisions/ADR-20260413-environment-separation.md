# ADR-F08: Dev/Staging and Production Environment Separation in CDK

## Status
Accepted (2026-04-13) — reviewed: naming table corrected, budget collision fixed, Lambda alias noted

## Context

LitCrop currently operates a single CDK stack (`LitCropStack`) deployed from the `main` branch. All AWS resources carry a `litcrop-mvp` prefix. As the project approaches production readiness, we need environment separation so that:

1. **Development/staging** can be tested without risk to real user data.
2. **Production** operates on isolated resources with its own deployment lifecycle.
3. **CI/CD** deploys automatically from the correct branch to the correct environment.

### Current State
- **One CDK stack**: `LitCropStack` in `infra/bin/litcrop.ts`
- **Resource naming**: All resources hardcoded as `litcrop-mvp-*` (DynamoDB table, 4 S3 buckets, 2 Lambdas, API Gateway, CloudFront, Cognito, SNS, CloudWatch alarms)
- **Deploy workflow**: `.github/workflows/deploy.yml` triggers on `main` push, uses GitHub Environment `production` with approval gate
- **PR checks**: `.github/workflows/pr-checks.yml` runs build/test/lint/typecheck/cdk-synth on PRs to `main` or `develop`
- **Region**: `ap-northeast-1` (Japan), single AWS account
- **Auth**: GitHub Actions OIDC via `AWS_ROLE_ARN`
- **RETAIN policies**: DynamoDB table, Cognito User Pool, images bucket, thumbnails bucket all use `RemovalPolicy.RETAIN`
- **Budget**: Current spend ~$1.18/month, hard ceiling $5/month

### Decision Drivers
- **Data isolation**: Staging data must never leak into production (separate DynamoDB tables, S3 buckets)
- **Cost discipline**: Two environments must stay within the $5/month ceiling
- **Zero disruption**: Existing `litcrop-mvp` resources serve real users — no downtime during transition
- **Simplicity**: Solo developer; minimize operational overhead of managing two environments
- **Reversibility**: Prefer approaches that can be rolled back or adjusted without data loss
- **Git flow alignment**: `develop` branch is integration; `main` branch is production (per RULES.md)

### Resources Inventory

| Resource | Current Name | Needs Per-Env? | RETAIN Policy? |
|----------|-------------|----------------|----------------|
| Cognito User Pool | `litcrop-mvp-users` | Yes (see analysis) | Yes |
| Cognito App Client | `litcrop-mvp-web` | Yes (paired with pool) | No |
| DynamoDB Table | `litcrop-mvp` | **Yes** (critical) | Yes |
| S3 Images Bucket | `litcrop-mvp-images` | **Yes** | Yes |
| S3 Static Bucket | `litcrop-mvp-static` | **Yes** | No |
| S3 Thumbnails Bucket | `litcrop-mvp-thumbnails` | **Yes** | Yes |
| S3 Logs Bucket | `litcrop-mvp-logs` | Yes | No |
| Lambda API | `litcrop-api` | **Yes** | No |
| Lambda Thumbnail | `litcrop-thumb` | **Yes** | No |
| API Gateway | `litcrop-mvp-api` | **Yes** | No |
| CloudFront Distribution | (auto-named) | **Yes** | No |
| CloudFront Function | `litcrop-url-rewrite` | Yes | No |
| Response Headers Policy | `litcrop-security-headers` | Yes | No |
| SNS Alarm Topic | `litcrop-alarms` | Shared acceptable | No |
| CloudWatch Alarms (3x) | `litcrop-api-*`, `litcrop-dynamo-*` | Yes (per-env metrics) | No |
| CloudWatch Log Groups | `/litcrop/api-gateway-access` | Yes | No |
| Budget Alert | `litcrop-monthly-cost` | **Shared** (account-level) | No |
| SSM Parameter | `/litcrop/llm-api-key` | Shared acceptable | N/A (imported) |

## Options Considered

### Option 1: Parameterized Stack — One Class, Two Instantiations

**Description**: Add an `envName` prop to `LitCropStack`. Instantiate the stack twice in `bin/litcrop.ts` with different logical IDs (`LitCropStaging`, `LitCropProduction`). All resource names receive an environment prefix. CDK context or environment variables select which stack to deploy.

```typescript
// bin/litcrop.ts
const stg = new LitCropStack(app, 'LitCropStaging', {
  envName: 'stg',
  env: { account, region: 'ap-northeast-1' },
});

const prod = new LitCropStack(app, 'LitCropProduction', {
  envName: 'prod',
  env: { account, region: 'ap-northeast-1' },
});
```

Resource naming becomes: `litcrop-${envName}-*` (e.g., `litcrop-stg-images`, `litcrop-prod-images`).

**Pros**:
- Single stack class — DRY, one place to update resource definitions
- CDK-native approach: `cdk deploy LitCropStaging` or `cdk deploy LitCropProduction`
- Environment differences expressed as props (e.g., staging gets smaller alarm thresholds)
- `cdk diff LitCropProduction` shows production-only changes before deploy
- Both stacks coexist in the same CDK app — `cdk synth` validates both

**Cons**:
- Existing `LitCropStack` logical ID changes — CloudFormation will attempt to create new resources (not update existing)
- RETAIN resources (DynamoDB, Cognito, S3 images/thumbnails) survive stack deletion but must be imported or re-referenced
- Migration complexity: must carefully transition from `LitCropStack` to `LitCropProduction` without disrupting existing resources
- Risk of accidentally deploying both stacks when only one is intended

**Effort**: Medium
**Risk**: Medium (migration step is the critical path)

### Option 2: CDK Context-Driven Single Stack with Branch-Based Deploy

**Description**: Keep a single `LitCropStack` class but parameterize via CDK context (`-c env=stg`). The stack logical ID includes the environment (`LitCropStack-stg`). GitHub Actions passes the context value based on the triggering branch. The existing `LitCropStack` (no suffix) becomes the staging environment in-place, avoiding migration of RETAIN resources.

```typescript
// bin/litcrop.ts
const envName = app.node.tryGetContext('env') || 'stg';
const stackId = envName === 'prod' ? 'LitCropProd' : 'LitCropStack'; // Keep existing ID for staging

new LitCropStack(app, stackId, {
  envName,
  env: { account, region: 'ap-northeast-1' },
});
```

Key insight: The existing `LitCropStack` CloudFormation stack becomes staging. Its RETAIN resources (`litcrop-mvp` DynamoDB, Cognito, S3) stay in place. Production gets a brand-new `LitCropProd` stack with fresh `litcrop-prod-*` resources.

**Pros**:
- **Zero migration**: Existing `LitCropStack` keeps its CloudFormation stack name, so DynamoDB table, Cognito pool, and S3 buckets with RETAIN policy are untouched
- No data migration needed — staging inherits all existing data
- Production starts clean — appropriate for a fresh production launch
- Single CDK app, single stack class — simple mental model
- `cdk synth` with context flag is well-established CDK pattern
- `cdk-synth` PR check can validate both environments: `npx cdk synth -c env=stg && npx cdk synth -c env=prod`
- Gradual rollout: deploy staging first (no change), then add production when ready

**Cons**:
- `LitCropStack` keeps `litcrop-mvp` prefix for staging resources (naming inconsistency: "mvp" vs "stg")
- Context values must be passed correctly in every `cdk` invocation — easy to forget locally
- Single stack per deploy — cannot deploy both in one `cdk deploy` command (fine for CI/CD, minor inconvenience for manual)

**Effort**: Low-Medium
**Risk**: Low (staging is a no-op rename; production is a green-field stack)

### Option 3: Rename Existing Resources to `litcrop-stg` and Create `litcrop-prod`

**Description**: Refactor the stack to use `litcrop-stg-*` naming for staging and `litcrop-prod-*` for production. Migrate existing `litcrop-mvp` RETAIN resources to the new names (DynamoDB: export/import or update table name; S3: sync and redirect; Cognito: cannot rename — must re-create or keep).

**Pros**:
- Clean, consistent naming (`stg`/`prod`) across all resources
- No legacy naming artifacts
- Clear mental model for operators

**Cons**:
- **DynamoDB table rename is impossible** — must create new table + migrate data (export/import via S3, or scan/write)
- **Cognito User Pool cannot be renamed** — must re-create, forcing all users to re-register (unacceptable)
- **S3 bucket rename is impossible** — must create new + sync objects + update all references
- Highest risk: data loss during migration, user disruption
- Most effort: migration scripts, validation, rollback planning
- Violates zero-downtime requirement

**Effort**: High
**Risk**: High (user disruption, data loss potential)

### Option 4: Do Nothing

**Description**: Keep the single-stack, single-environment setup. Test on `litcrop-mvp` directly. Deploy to production via the existing `main` branch workflow.

**Pros**:
- Zero effort
- No additional cost
- No migration risk

**Cons**:
- Testing on production data — risky as user count grows
- No ability to validate CDK changes before they hit production
- Schema migrations tested directly on production DynamoDB
- No staging URL for stakeholder preview
- Blocks the Infra Sprint production launch (per PLANS.md roadmap)

**Effort**: None
**Risk**: Ongoing (increasing risk as the project matures)

## Decision

We choose **Option 2: CDK Context-Driven Single Stack with Branch-Based Deploy**.

Specifically:

1. **Staging** = existing `LitCropStack` CloudFormation stack, keeping all `litcrop-mvp-*` resource names. Deployed from `develop` branch.
2. **Production** = new `LitCropProd` CloudFormation stack with `litcrop-prod-*` resource names. Deployed from `main` branch.
3. **Cognito**: Separate User Pools per environment (full isolation). Production users register fresh; staging retains existing test accounts.
4. **SSM Parameter**: Shared `/litcrop/llm-api-key` (same Anthropic API key for both envs). No per-env SSM needed unless rate-limiting becomes an issue.
5. **Budget Alert**: Shared (account-level). Single $5 budget covers total account spend.
6. **SNS Alarm Topic**: Per-environment (`litcrop-stg-alarms`, `litcrop-prod-alarms`) so alarm routing is clear.

### Naming Convention

| Resource | Staging (existing — EXACT current names) | Production (new) |
|----------|------------------------------------------|-----------------|
| CloudFormation Stack | `LitCropStack` | `LitCropProd` |
| DynamoDB Table | `litcrop-mvp` | `litcrop-prod` |
| S3 Images | `litcrop-mvp-images` | `litcrop-prod-images` |
| S3 Static | `litcrop-mvp-static` | `litcrop-prod-static` |
| S3 Thumbnails | `litcrop-mvp-thumbnails` | `litcrop-prod-thumbnails` |
| S3 Logs | `litcrop-mvp-logs` | `litcrop-prod-logs` |
| Lambda API | `litcrop-api` | `litcrop-prod-api` |
| Lambda API alias | `litcrop-api:live` | `litcrop-prod-api:live` |
| Lambda Thumbnail | `litcrop-thumb` | `litcrop-prod-thumb` |
| API Gateway | `litcrop-mvp-api` | `litcrop-prod-api` |
| Cognito Pool | `litcrop-mvp-users` | `litcrop-prod-users` |
| CloudFront Function | `litcrop-url-rewrite` | `litcrop-prod-url-rewrite` |
| Headers Policy | `litcrop-security-headers` | `litcrop-prod-security-headers` |
| Alarms | `litcrop-api-lambda-errors`, `litcrop-api-5xx`, `litcrop-dynamo-throttle` | `litcrop-prod-api-lambda-errors`, `litcrop-prod-api-5xx`, `litcrop-prod-dynamo-throttle` |
| Log Group | `/litcrop/api-gateway-access` | `/litcrop/prod/api-gateway-access` |
| SNS Topic | `litcrop-alarms` | `litcrop-prod-alarms` |
| Budget Alert | `litcrop-monthly-cost` (shared — prod stack skips) | _(not created — shared)_ |

**Critical**: Staging keeps EXACT deployed names (no `mvp` prefix added to Lambda, CF Function, Headers Policy, Alarms, SNS, Log Group). Only resources that already have `litcrop-mvp-*` names keep that pattern. Any name change triggers CloudFormation resource replacement, breaking integrations.

**Budget**: `CfnBudget` is created only in the staging stack (`envName === 'mvp'`). It monitors total account spend, so one budget covers both environments.

## Rationale

### Why Option 2 over Option 1 (Two Instantiations)?
Option 1 changes the CloudFormation stack logical ID from `LitCropStack` to `LitCropStaging`, which CloudFormation treats as a new stack. Resources with `RemovalPolicy.RETAIN` (DynamoDB table, Cognito, S3 images/thumbnails) would be orphaned from the old stack and need manual import into the new stack. CloudFormation resource import is fragile and error-prone. Option 2 avoids this entirely by keeping the existing stack ID.

### Why Option 2 over Option 3 (Clean Rename)?
DynamoDB tables and S3 buckets cannot be renamed. Cognito User Pools cannot be renamed. Option 3 requires creating new resources and migrating data, which risks data loss and forces user re-registration. This directly violates the zero-downtime requirement.

### Why not shared Cognito (single pool for both envs)?
Sharing Cognito would mean staging and production share a user database. If a staging test corrupts user data or a migration script runs against the shared pool, production users are affected. Separate pools provide full isolation. The cost of a second Cognito pool is $0.00 (Cognito is free under 50,000 MAUs).

### Deciding Factors
1. **Zero migration risk**: Staging inherits the existing stack with no changes to RETAIN resources
2. **Low effort**: Parameterize one stack class, add one deploy workflow, configure GitHub Environments
3. **Cost neutral**: Lambda, DynamoDB on-demand, S3, and API Gateway are pay-per-use; idle staging costs essentially $0. A second CloudFront distribution costs $0 when idle (no minimum fee).
4. **Reversible**: If production stack has issues, delete it and re-deploy. Staging is unchanged.

## Consequences

### Positive
- Staging and production are fully isolated at the data layer (DynamoDB, S3, Cognito)
- `develop` branch changes are validated in staging before reaching `main`
- Production gets a clean start — no test data, no seed data artifacts
- CDK changes are validated against both environments in PR checks
- Alarms and monitoring are per-environment — clear signal routing
- Budget alert covers total account spend — catches runaway costs in either environment

### Negative / Trade-offs
- **Naming inconsistency**: Staging resources keep `litcrop-mvp` prefix instead of `litcrop-stg`. Documented and accepted.
- **Two CloudFront distributions**: Both are free when idle, but each invalidation costs $0.005/path (negligible at our scale). Cost risk is minimal.
- **IAM role scope**: The existing OIDC role must have permissions for both stacks' resources. May need to widen resource ARN patterns.
- **Local development confusion**: Developers must remember to pass `-c env=stg` or `-c env=prod`. Mitigated by defaulting to `stg` and documenting in the Makefile.
- **Cognito pool duplication**: Two pools mean users must register separately for staging and production. This is a feature, not a bug — it prevents test accounts from appearing in production.

## Cost Impact Analysis

| Resource | Staging (existing) | Production (new) | Delta |
|----------|-------------------|-----------------|-------|
| DynamoDB (on-demand) | ~$0.25/mo | ~$0.00 (idle) | +$0.00 |
| S3 (4 buckets) | ~$0.10/mo | ~$0.02 (near-empty) | +$0.02 |
| Lambda (2 functions) | ~$0.05/mo | ~$0.00 (idle) | +$0.00 |
| API Gateway | ~$0.03/mo | ~$0.00 (idle) | +$0.00 |
| CloudFront | ~$0.15/mo | ~$0.00 (idle) | +$0.00 |
| Cognito | $0.00 | $0.00 | +$0.00 |
| CloudWatch (alarms, logs) | ~$0.30/mo | ~$0.30 | +$0.30 |
| SNS | $0.00 | $0.00 | +$0.00 |
| **Total** | **~$1.18/mo** | **~$0.32** | **+$0.32** |

**Projected total**: ~$1.50/month (well within $5 ceiling).

Note: CloudWatch alarms are the primary cost driver for the idle production environment ($0.10/alarm x 3 alarms = $0.30). If this becomes a concern, staging alarms could be reduced or removed.

## Implementation Notes

### File Changes Required

#### 1. CDK Stack Parameterization (`infra/lib/litcrop-stack.ts`)
- Add `LitCropStackProps` interface extending `cdk.StackProps` with `envName: 'mvp' | 'prod'`
- Build a `names` lookup object that maps resource keys to their actual names:
  - For `envName='mvp'`: use EXACT current names (e.g., `litcrop-api`, `litcrop-url-rewrite`)
  - For `envName='prod'`: use `litcrop-prod-*` pattern (e.g., `litcrop-prod-api`, `litcrop-prod-url-rewrite`)
- Resources that already use `litcrop-mvp-*` pattern: DynamoDB, S3, API Gateway, Cognito → `litcrop-${envName}-*`
- Resources with bare names: Lambda (`litcrop-api`), CF Function (`litcrop-url-rewrite`), Headers Policy, Alarms, SNS, Log Group → conditional per envName
- `CfnBudget`: only created when `envName === 'mvp'` (shared, account-level)
- Lambda alias (`live`) and `currentVersionOptions` preserved in both environments

#### 2. CDK App Entry Point (`infra/bin/litcrop.ts`)
- Read `env` from CDK context: `app.node.tryGetContext('env') || 'stg'`
- Map `stg` to `envName: 'mvp'` (keep existing names), `prod` to `envName: 'prod'`
- Set stack ID: `stg` -> `'LitCropStack'`, `prod` -> `'LitCropProd'`

#### 3. Deploy Workflow (`.github/workflows/deploy.yml`)
- Rename to `deploy-production.yml` (clarity)
- Trigger: `push` to `main` only
- GitHub Environment: `production`
- CDK command: `npx cdk deploy LitCropProd -c env=prod --require-approval never`
- GitHub Variables: `FRONTEND_BUCKET=litcrop-prod-static`, `CLOUDFRONT_DIST_ID=<prod-dist-id>`, etc.

#### 4. New Staging Deploy Workflow (`.github/workflows/deploy-staging.yml`)
- Trigger: `push` to `develop`
- GitHub Environment: `staging` (no approval gate — auto-deploy)
- CDK command: `npx cdk deploy LitCropStack -c env=stg --require-approval never`
- GitHub Variables: existing values (unchanged from current production config)

#### 5. PR Checks Update (`.github/workflows/pr-checks.yml`)
- CDK synth step: validate both environments
  ```yaml
  - name: CDK synth (staging)
    run: npx cdk synth -c env=stg
  - name: CDK synth (production)
    run: npx cdk synth -c env=prod
  ```

#### 6. GitHub Configuration
- Create GitHub Environment: `staging`
  - No approval gate
  - Variables: Copy current `production` variables (they point to `litcrop-mvp-*` resources)
- Update GitHub Environment: `production`
  - Keep approval gate
  - Update variables to point to `litcrop-prod-*` resources (after first production deploy)
- Both environments share the same `AWS_ROLE_ARN` secret (single account)

#### 7. IAM Role Update
- The OIDC role's policy must allow actions on both `litcrop-mvp-*` and `litcrop-prod-*` resources
- Update resource ARN patterns: `arn:aws:dynamodb:ap-northeast-1:*:table/litcrop-*`
- Or use two inline policies (one per environment) for tighter scoping

### Migration Plan

**Phase 0: Preparation** (no deploy, no risk)
1. Parameterize `LitCropStack` with `envName` prop
2. Ensure `envName='mvp'` produces identical resource names to current stack
3. Run `cdk diff LitCropStack -c env=stg` — must show **zero changes**
4. Create `deploy-staging.yml` workflow (disabled or targeting `develop`)
5. Create GitHub Environment `staging` with current variable values

**Phase 1: Staging Validation** (deploy to develop, no production impact)
1. Merge parameterized CDK to `develop`
2. Trigger staging deploy via `deploy-staging.yml`
3. Verify: `cdk diff LitCropStack -c env=stg` shows zero changes
4. Verify: Existing `litcrop-mvp` resources are unmodified
5. Run smoke tests against staging URL

**Phase 2: Production Stack Creation** (new resources, no data migration)
1. Run `cdk deploy LitCropProd -c env=prod` (creates all `litcrop-prod-*` resources)
2. Verify: New DynamoDB table `litcrop-prod`, new S3 buckets, new CloudFront distribution
3. Note CloudFront distribution ID and API Gateway URL for GitHub variables
4. Update `production` GitHub Environment variables with new resource identifiers
5. Run smoke tests against production URL
6. Verify: Staging resources are completely unaffected

**Phase 3: CI/CD Cutover**
1. Update `deploy.yml` to use `-c env=prod` and target `LitCropProd`
2. Rename to `deploy-production.yml` for clarity
3. Enable `deploy-staging.yml` on `develop` push
4. Merge to `main` — triggers production deploy
5. Verify: Both deploy workflows run independently

**Phase 4: Validation**
1. Push a test change to `develop` — verify staging deploys
2. Merge to `main` — verify production deploys (with approval gate)
3. Confirm data isolation: write to staging DynamoDB, verify it does not appear in production
4. Monitor costs for one billing cycle

### Rollback Plan

Each phase is independently rollable:
- **Phase 0**: Revert the CDK parameterization commit. No deployed changes.
- **Phase 1**: Staging is the existing stack — no changes were made to resources. Revert workflow file.
- **Phase 2**: `cdk destroy LitCropProd -c env=prod`. All production resources are new and can be safely deleted. RETAIN resources (DynamoDB, Cognito) would be orphaned but can be manually deleted.
- **Phase 3**: Revert workflow files to use original `deploy.yml` targeting `LitCropStack`.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| CDK parameterization changes staging resource names | Low | High | `cdk diff` must show zero changes before deploy |
| OIDC role lacks permissions for new production resources | Medium | Medium | Test with `cdk deploy --dry-run`; update IAM policy proactively |
| CloudFormation name collisions (global resources like S3 buckets) | Low | Medium | S3 bucket names are globally unique; `litcrop-prod-*` is unlikely to be taken |
| Developers deploy to wrong environment locally | Medium | Low | Default context is `stg`; production requires explicit `-c env=prod` |
| Cost overrun from two CloudFront distributions | Low | Low | CloudFront is free when idle; budget alert catches anomalies |
| Staging `litcrop-mvp` naming confuses new team members | Medium | Low | Document in README and CDK code comments |

## Scope Progression

- **MVP (this ADR)**: Two stacks in same account, same region, branch-based deploy. Staging keeps existing naming.
- **Production**: Optional: rename staging resources to `litcrop-stg-*` via CloudFormation import (if naming consistency becomes important). Add WAF to production CloudFront. Consider custom domain (ADR pending, issue #238).
- **Future**: Multi-account separation (staging in account A, production in account B) if team grows or compliance requires it.

## References
- [ADR-008: IaC Tool Selection](ADR-20260320-iac-tool-selection.md) — CDK chosen, noted "Production: multi-stack, staging environment"
- [ADR-006: Cloud Provider](ADR-20260317-cloud-provider-hosting.md) — AWS ap-northeast-1, single account
- [PLANS.md Infra Sprint](../../PLANS.md) — Issue #239 (Production resource naming)
- [CDK Context Documentation](https://docs.aws.amazon.com/cdk/v2/guide/context.html)
- [GitHub Environments](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment)
