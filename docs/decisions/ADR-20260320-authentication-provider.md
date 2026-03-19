# ADR-007: Authentication Provider

## Status
Accepted (2026-03-20)

## Context
LitCrop is transitioning from a single-user PoC (no authentication) to a multi-user MVP. The PoC explicitly deferred authentication (PLANS.md: "Scope Exclusions — User authentication"). The MVP must now add user identity to protect farm data and enable per-user access control.

### Current State
- No authentication exists in the PoC
- Hono middleware layer is already structured for auth insertion (ADR-002 consequence)
- API Gateway HTTP API (v2) is the entry point, supporting JWT authorizers natively
- Frontend is Astro SSG with Preact islands (static files on CloudFront/S3)
- Backend is a single Lambda function behind API Gateway
- Region: AWS ap-northeast-1 (Tokyo)

### Requirements
- Support 1-10 users initially ("waiting list" model mentioned in PoC scope)
- Password-based login (email + password) as the minimum
- Password reset and email verification
- JWT-based API authorization (API Gateway JWT authorizer or Hono middleware)
- Session management compatible with a statically-generated Astro frontend (no server-side sessions)
- Future consideration: social login (Google, LINE for Japan market)
- Budget: must not meaningfully increase the ~$5/month target

### Decision Drivers
- Cost at small scale (1-10 users)
- Integration complexity with Hono on Lambda + API Gateway
- JWT validation approach (API Gateway native vs. middleware)
- Managed vs. self-managed security burden
- Password reset / email verification without building email infrastructure
- Future extensibility (social login, MFA)

## Options Considered

### Option A: AWS Cognito User Pools + JWT
- **Description**: Use Cognito User Pools for user management, authentication, and JWT issuance. API Gateway HTTP API has a native JWT authorizer that validates Cognito tokens with zero Lambda invocations. Frontend uses Cognito Hosted UI or `amazon-cognito-identity-js` / `@aws-amplify/auth` for login flows.
- **Pros**:
  - Managed service: password hashing, token rotation, email verification, password reset all handled
  - API Gateway JWT authorizer validates tokens at the gateway level (no Lambda cold start for auth)
  - Native AWS integration: IAM, CloudWatch metrics, WAF attachment
  - Free tier: 10,000 MAUs on Cognito User Pools (Lite tier) — more than sufficient
  - Built-in Hosted UI for login/signup (can be customized or replaced)
  - Social identity federation (Google, Apple, SAML, OIDC) available when needed
  - MFA support (TOTP, SMS) built in
  - SDK support: `amazon-cognito-identity-js` is lightweight (~45KB minified)
- **Cons**:
  - Configuration complexity: User Pool + App Client + Domain + Hosted UI is many moving parts
  - Cognito Hosted UI has limited customization (acceptable for MVP, can replace later)
  - Cognito-specific token format: migration away requires re-issuing all tokens
  - Email sending: Cognito uses SES in production (requires SES setup for custom domain email); default sandbox mode limits to 50 emails/day
  - Learning curve for Cognito-specific concepts (User Pool vs. Identity Pool, App Client settings)
  - Vendor lock-in: user password hashes are not exportable from Cognito
- **Effort**: Medium
- **Cost**: $0/month (10,000 MAU free tier on Lite; well within limits at 1-10 users)

### Option B: Custom Auth (bcrypt + JWT in DynamoDB)
- **Description**: Build authentication from scratch. Store users in a DynamoDB table with bcrypt-hashed passwords. Issue JWTs from a `/login` endpoint in the Hono app. Validate JWTs in Hono middleware or API Gateway custom authorizer.
- **Pros**:
  - Full control over user data model and authentication flow
  - No additional AWS service dependencies
  - Portable: DynamoDB user table can be exported/migrated
  - No vendor lock-in on auth provider
  - Simple mental model: one DynamoDB table, one JWT signing key
- **Cons**:
  - Must implement: password hashing, JWT signing/verification, token refresh, CSRF protection
  - Must build: email verification, password reset (requires email sending — SES setup)
  - Must build: rate limiting on login endpoint (brute force protection)
  - Must build: secure token storage on the client (HttpOnly cookies vs. localStorage)
  - Security liability: any bug in custom auth code is a vulnerability
  - JWT validation in Hono middleware means every request pays Lambda cold start cost
  - No built-in MFA, social login — must build from scratch later
  - bcrypt is CPU-intensive on Lambda (adds ~200ms to cold start, ~50ms per hash)
  - Ongoing maintenance burden for security patches and best practices
- **Effort**: High
- **Cost**: $0/month (DynamoDB free tier, Lambda free tier)

### Option C: Third-Party SaaS (Auth0, Clerk)
- **Description**: Use a managed authentication SaaS. Auth0 and Clerk both provide hosted login, JWT issuance, user management dashboards, social login, and SDKs.
- **Pros**:
  - Best developer experience: drop-in React/Preact components for login UI
  - Fully managed: password hashing, token rotation, email verification, MFA, social login
  - Excellent documentation and SDKs
  - Clerk: Preact-compatible components, modern DX
  - Auth0: industry standard, extensive integration ecosystem
  - JWT standard format: API Gateway JWT authorizer works with both
- **Cons**:
  - **Cost**: Auth0 free tier is 25,000 MAU (sufficient) but paid features (custom domains, MFA) start at $35/month; Clerk free tier is 10,000 MAU but paid starts at $25/month
  - External dependency: authentication availability depends on a third-party service
  - Data residency: user data stored outside AWS ap-northeast-1 (Auth0 closest is AU/US; Clerk is US)
  - Additional network hop: token validation may require JWKS fetch to external endpoint
  - Overkill for 1-10 users: paying for enterprise-grade auth infrastructure
  - Adds a non-AWS vendor to an otherwise all-AWS stack
  - GDPR/privacy: user PII stored with third party (relevant for Japanese data residency preferences)
- **Effort**: Low
- **Cost**: $0/month at free tier (Auth0: 25K MAU, Clerk: 10K MAU); $25-35/month when exceeding free tier or needing features

## Decision
We choose **Option A: AWS Cognito User Pools + JWT**.

Specifically:
- **Cognito User Pool** (Lite tier) in ap-northeast-1 for user registration and authentication
- **API Gateway JWT Authorizer** for stateless token validation at the gateway (zero Lambda cost for auth checks)
- **Cognito Hosted UI** for initial MVP login/signup flow (replace with custom UI later if needed)
- **`amazon-cognito-identity-js`** in the Astro frontend for programmatic auth (token refresh, session management)
- **JWT access tokens** stored in memory (Preact state); refresh tokens in `localStorage`
- Protected API routes: all `/api/v1/*` routes except `/health` require valid JWT
- Unprotected routes: `/health`, `/api/v1/health`, Cognito callback URLs

## Rationale

### Why Cognito over Custom Auth (Option B)?
The security burden of building authentication from scratch is disproportionate to the value. Password reset, email verification, brute-force protection, token refresh, and secure storage are all solved problems that Cognito handles out of the box. A single security bug in custom auth code could compromise all user data. The effort saved (estimated 2-3 weeks of implementation + ongoing maintenance) is better spent on MVP features.

### Why Cognito over Third-Party SaaS (Option C)?
At 1-10 users, a third-party SaaS is overkill. Cognito keeps all infrastructure within the AWS account, in the same region (ap-northeast-1), with no external dependencies. Data residency stays in Tokyo. The free tier (10,000 MAU) will never be exceeded at MVP scale. Third-party SaaS adds cost pressure as features are needed (custom domains, MFA) while Cognito includes these in the free tier.

### Why API Gateway JWT Authorizer?
API Gateway HTTP API natively validates Cognito JWTs without invoking Lambda. This means:
- Auth validation adds ~1ms latency (vs. ~300ms Lambda cold start for custom authorizer)
- Zero additional Lambda cost for auth
- Unauthenticated requests are rejected before reaching application code
- Hono middleware can still extract user identity from the validated JWT claims

### Deciding factors
1. **Zero cost** at MVP scale (10K MAU free tier)
2. **API Gateway native integration** eliminates auth-related Lambda invocations
3. **Managed security** reduces risk and maintenance burden
4. **Same-region data residency** (ap-northeast-1)
5. **Built-in features** (email verification, password reset, MFA, social login) available without additional implementation

## Consequences

### Positive
- Authentication is fully managed; no custom security code to maintain
- API Gateway JWT authorizer handles validation with no Lambda cost
- Password reset and email verification work out of the box (via Cognito default email)
- Social login (Google, LINE via OIDC) can be added by configuring identity providers — no code changes
- MFA (TOTP) can be enabled per-user with a configuration change
- User management dashboard available in AWS Console
- Free at MVP scale; cost only begins at 10,001 MAUs

### Negative / Risks
- **Cognito lock-in**: Password hashes cannot be exported. Migrating away requires users to reset passwords. Mitigation: at 1-10 users, manual re-onboarding is feasible.
- **Cognito Hosted UI limitations**: Limited visual customization. Mitigation: replace with custom login form using `amazon-cognito-identity-js` when UX polish becomes a priority.
- **Email sending limits**: Cognito default email (no-reply@verificationemail.com) is limited to 50/day. Mitigation: sufficient for 1-10 users; set up SES verified domain when scaling.
- **Configuration complexity**: User Pool + App Client + JWT Authorizer is several AWS resources. Mitigation: IaC (see ADR-008) will codify the configuration.

### Mitigations
- Lock-in risk is acceptable at MVP scale; revisit at Production scope if user count exceeds 1,000
- Hosted UI is a starting point; custom UI is a known future enhancement
- SES setup for custom email domain is a Production-scope concern

## Implementation Notes
- Create Cognito User Pool with email as username (not phone)
- Configure App Client with `ALLOW_USER_PASSWORD_AUTH` and `ALLOW_REFRESH_TOKEN_AUTH` flows
- Set password policy: minimum 8 characters, require mixed case + number (Cognito defaults)
- Add API Gateway JWT Authorizer pointing to Cognito User Pool issuer URL
- In Hono middleware: extract `sub` (user ID) and `email` from JWT claims for downstream use
- Frontend: initialize Cognito auth on app load; redirect to Hosted UI for login; store tokens in Preact context
- Add `user_id` (Cognito `sub`) to DynamoDB records for per-user data isolation

## Scope Progression
- **MVP**: Cognito Hosted UI, email/password only, API Gateway JWT authorizer
- **Production**: Custom login UI, SES verified domain for emails, social login (Google/LINE), MFA enablement, user roles (admin vs. viewer)

## References
- [Amazon Cognito Pricing](https://aws.amazon.com/cognito/pricing/) — Lite tier: 10,000 MAU free
- [API Gateway JWT Authorizer](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html)
- [amazon-cognito-identity-js](https://www.npmjs.com/package/amazon-cognito-identity-js)
- ADR-002 (Backend Platform): Hono middleware designed for auth insertion
- PLANS.md: "User authentication — Deferred. Single-user, no auth for PoC."
