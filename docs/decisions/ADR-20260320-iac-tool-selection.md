# ADR-008: Infrastructure as Code Tool Selection

## Status
Accepted (2026-03-20)

## Context
LitCrop PoC was deployed manually from the CLI (`aws` commands). For the MVP, infrastructure must be codified to ensure reproducible deployments, enable CI/CD, and reduce deployment errors. The PoC deployment experience revealed fragility — environment variables were lost between sessions (see feedback_env_deploy.md), and manual steps were error-prone.

### Current State
- All infrastructure is manually provisioned via AWS CLI
- Resources: 1 Lambda function, 1 API Gateway HTTP API, 2 DynamoDB tables, 1 S3 bucket, 1 CloudFront distribution, IAM roles/policies
- MVP will add: Cognito User Pool + App Client (ADR-007), API Gateway JWT Authorizer, possibly additional Lambda functions
- Build tooling: esbuild for Lambda bundling, npm scripts for frontend
- All application code is TypeScript
- Single cloud: AWS ap-northeast-1 (ADR-006)
- Solo developer
- No existing IaC files in the repository

### Decision Drivers
- Language alignment: TypeScript already used for all application code
- Learning curve: solo developer, minimize new concepts
- Serverless fit: tool should have first-class support for Lambda, API Gateway, DynamoDB, S3, CloudFront, Cognito
- Local development: ability to test Lambda locally
- CI/CD integration: must work in GitHub Actions
- Community and longevity: active maintenance, good documentation
- Resource coverage: all current and planned AWS resources must be supported

## Options Considered

### Option A: AWS CDK (TypeScript)
- **Description**: AWS Cloud Development Kit using TypeScript. Define infrastructure using L2/L3 constructs that synthesize to CloudFormation. Uses `cdk deploy` for provisioning.
- **Pros**:
  - Same language as the application (TypeScript) — single toolchain
  - L2 constructs provide sensible defaults (e.g., `new lambda.Function()` auto-creates IAM role)
  - Strong typing: IDE autocomplete for every AWS resource property
  - Backed by AWS: long-term support, first to get new service support
  - Large community: extensive construct library, Stack Overflow coverage, CDK Patterns
  - CloudFormation under the hood: proven deployment engine with rollback
  - `cdk diff` shows changes before deploy — safe iteration
  - `cdk watch` for development iteration (auto-deploy on file changes)
  - Native support for all required services (Lambda, APIGW, DynamoDB, S3, CloudFront, Cognito)
  - CDK-nag for security/compliance validation
  - Handles asset bundling (can bundle Lambda code with esbuild via `NodejsFunction`)
- **Cons**:
  - CloudFormation synthesis adds a layer of abstraction (harder to debug CFN issues)
  - Bootstrap required (`cdk bootstrap`) before first deploy — creates an S3 bucket + IAM roles
  - CloudFormation stack limits (500 resources per stack) — not a concern at MVP scale
  - CDK version upgrades occasionally require code changes (L2 construct API changes)
  - Verbose for simple resources (an S3 bucket is still ~10 lines vs. 5 in SAM)
- **Effort**: Medium
- **Learning Curve**: Low-Medium (TypeScript developers find it natural)

### Option B: AWS SAM (Serverless Application Model)
- **Description**: YAML/JSON templates extending CloudFormation with serverless-specific shorthand. Uses `sam deploy` for provisioning, `sam local` for local Lambda testing.
- **Pros**:
  - Purpose-built for serverless: `AWS::Serverless::Function` is concise
  - `sam local invoke` and `sam local start-api` for local testing
  - `sam build` handles Lambda packaging
  - Simpler model: YAML template, no programming language needed
  - Tight integration with AWS serverless services
  - No bootstrap step required
  - SAM Accelerate (`sam sync`) for fast iteration
- **Cons**:
  - YAML templates: no type safety, no IDE autocomplete for resource properties
  - Limited to serverless-focused resources; non-serverless resources (CloudFront, Cognito) require raw CloudFormation
  - No programming language constructs (loops, conditionals) — must use CloudFormation intrinsic functions
  - Harder to share patterns and abstractions across stacks
  - CloudFront distribution in SAM requires full CloudFormation syntax (~80 lines of YAML)
  - Cognitive split: application code in TypeScript, infrastructure in YAML
- **Effort**: Low-Medium
- **Learning Curve**: Low (if familiar with YAML and CloudFormation concepts)

### Option C: SST (Ion)
- **Description**: SST v3 (Ion) — a TypeScript-first framework for serverless AWS apps. Uses Pulumi under the hood (not CloudFormation). Provides high-level components and `sst dev` for live Lambda development.
- **Pros**:
  - TypeScript infrastructure code — same as application
  - `sst dev` provides live Lambda debugging (code changes deploy in seconds, no emulator)
  - High-level components: `new sst.aws.Function()`, `new sst.aws.Astro()` for Astro sites
  - Built-in support for Astro, linking resources (type-safe environment variable injection)
  - Active community and rapid iteration
  - Pulumi engine: faster deployments than CloudFormation (parallel resource creation)
  - Console (sst.dev/console) for monitoring and log tailing
- **Cons**:
  - **Maturity risk**: SST Ion (v3) is relatively new; v2 was recently deprecated
  - Pulumi under the hood: another layer of abstraction, state management differs from CloudFormation
  - Smaller community than CDK or Terraform
  - State management: requires Pulumi state backend (S3 or Pulumi Cloud)
  - Cognito support: SST does not have a dedicated Cognito component — must use `aws.cognito.UserPool` (Pulumi native) with less abstraction
  - Breaking changes: SST has historically made breaking changes between major versions
  - Dependency on SST team's continued development and support
  - Less documentation for non-standard configurations
- **Effort**: Low
- **Learning Curve**: Low (for TypeScript developers)

### Option D: Terraform (HCL)
- **Description**: HashiCorp's declarative IaC tool using HCL (HashiCorp Configuration Language). Cloud-agnostic with AWS provider. Uses `terraform apply` for provisioning.
- **Pros**:
  - Cloud-agnostic: can manage AWS, GCP, Azure, and SaaS providers
  - Mature and battle-tested: largest IaC community
  - Declarative: state-based, predictable diffs (`terraform plan`)
  - Extensive AWS provider coverage (every AWS resource)
  - Terraform Cloud free tier for state management
  - Module ecosystem: pre-built modules for common patterns
- **Cons**:
  - **Different language**: HCL is neither TypeScript nor YAML — new syntax to learn
  - No built-in Lambda local testing (need separate tooling)
  - State management: requires state backend (S3 + DynamoDB for locking) or Terraform Cloud
  - Cloud-agnostic benefit is irrelevant: LitCrop is single-cloud AWS (ADR-006)
  - No Lambda bundling: must handle esbuild/packaging separately
  - Cognitive split: application in TypeScript, infra in HCL — two different mental models
  - HashiCorp BSL license change (2023): no longer fully open source
  - OpenTofu fork exists but adds ecosystem fragmentation uncertainty
- **Effort**: Medium-High
- **Learning Curve**: Medium (new language, new state management concepts)

## Decision
We choose **Option A: AWS CDK (TypeScript)**.

Specifically:
- **AWS CDK v2** with TypeScript
- **Single stack** for all MVP resources (Lambda, API Gateway, DynamoDB, S3, CloudFront, Cognito)
- **`NodejsFunction`** construct for Lambda bundling (replaces manual esbuild config)
- **`cdk diff`** before every deploy for safety
- **CDK-nag** for automated security checks
- Infrastructure code in `infra/` directory at the repository root
- CI/CD: `cdk deploy` in GitHub Actions with OIDC-based AWS credentials (no long-lived keys)

## Rationale

### Why CDK over SAM (Option B)?
SAM excels for pure-serverless templates but falls short when managing CloudFront, Cognito, and S3 bucket policies — which require raw CloudFormation YAML. The MVP stack includes all of these. CDK provides a unified TypeScript experience for all resources, with L2 constructs that set sensible defaults for security (encrypted buckets, least-privilege IAM). The cognitive benefit of writing infrastructure in the same language as the application outweighs SAM's simpler getting-started experience.

### Why CDK over SST (Option C)?
SST's `sst dev` live Lambda feature is compelling, but the maturity risk is too high for a solo developer without fallback expertise. SST Ion (v3) is new, has a smaller community, and SST's history of breaking changes between major versions is a concern. Cognito support requires dropping down to raw Pulumi constructs, negating SST's high-level abstraction advantage. CDK's CloudFormation foundation provides proven rollback semantics and broader community support. If SST matures further, migration from CDK is feasible since both are TypeScript.

### Why CDK over Terraform (Option D)?
Terraform's cloud-agnostic design is irrelevant for a single-cloud AWS project. Learning HCL adds cognitive overhead with no compensating benefit. CDK's TypeScript constructs provide IDE autocomplete and compile-time checking that HCL lacks. Lambda bundling is built into CDK's `NodejsFunction` construct, while Terraform requires separate build tooling.

### Deciding factors
1. **Language alignment**: TypeScript for everything (app + infra) — one mental model
2. **L2 constructs**: `NodejsFunction`, `HttpApi`, `Table`, `Bucket` reduce boilerplate and set secure defaults
3. **CloudFormation foundation**: proven deployment engine with automatic rollback on failure
4. **Community size**: CDK has the largest serverless IaC community after Terraform
5. **AWS backing**: first-class support for all AWS services, including Cognito

## Consequences

### Positive
- Single language (TypeScript) for application and infrastructure code
- L2 constructs enforce security best practices by default
- `NodejsFunction` handles Lambda bundling with esbuild — can remove manual `esbuild.config.mjs`
- `cdk diff` provides safe pre-deploy review
- CDK-nag catches security misconfigurations before deployment
- CloudFormation rollback protects against failed deployments
- Infrastructure is version-controlled and reviewable in PRs

### Negative / Risks
- **Bootstrap dependency**: `cdk bootstrap` creates an S3 bucket and IAM roles in the account. Mitigation: one-time setup, well-documented.
- **CloudFormation debugging**: When CFN errors occur, must read CFN event logs (not just CDK output). Mitigation: `cdk deploy --verbose` and CloudFormation console.
- **CDK version churn**: L2 construct APIs occasionally change. Mitigation: pin CDK version in package.json, update deliberately.
- **Abstraction leakage**: Some advanced configurations require L1 (raw CFN) constructs. Mitigation: acceptable escape hatch, well-documented in CDK docs.

## Implementation Notes
- Run `cdk bootstrap aws://<ACCOUNT_ID>/ap-northeast-1` once to set up the CDK toolkit stack
- Create `infra/` directory with CDK app structure:
  ```
  infra/
    bin/litcrop.ts          # CDK app entry point
    lib/litcrop-stack.ts    # Main stack definition
    cdk.json                # CDK configuration
    package.json            # CDK dependencies
    tsconfig.json           # TypeScript config
  ```
- Define all resources in a single `LitCropStack`:
  - DynamoDB tables (farms, images)
  - S3 bucket (images)
  - Lambda function (Hono API) using `NodejsFunction`
  - API Gateway HTTP API with JWT authorizer
  - Cognito User Pool and App Client
  - CloudFront distribution
- Add `cdk diff` step to CI before deploy
- Add CDK-nag as a dev dependency for security linting

## Scope Progression
- **MVP**: Single CDK stack, manual `cdk deploy` from CLI, GitHub Actions for CI (lint + diff)
- **Production**: CD pipeline with `cdk deploy` in GitHub Actions, multi-stack (separate stateful/stateless), staging environment

## References
- [AWS CDK v2 Developer Guide](https://docs.aws.amazon.com/cdk/v2/guide/)
- [CDK NodejsFunction](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda_nodejs-readme.html)
- [CDK-nag](https://github.com/cdklabs/cdk-nag)
- [SST Ion Documentation](https://sst.dev/docs/) — evaluated but not chosen
- ADR-006 (Cloud Provider): AWS single-cloud decision
- ADR-002 (Backend Platform): esbuild bundling, Hono on Lambda
