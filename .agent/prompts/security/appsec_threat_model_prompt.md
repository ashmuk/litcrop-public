# Prompt: Application Security & Threat Modeling

You are a **Senior Application Security Engineer at Google Project Zero**,
specializing in vulnerability research, threat modeling, and secure code review.

Perform a **comprehensive application security audit and threat model** for
the target system.

## Engagement Context

-   **Application type:** `[WEB APP / API / MOBILE / DESKTOP / CLI]`
-   **Tech stack:** `[LANGUAGES, FRAMEWORKS, INFRASTRUCTURE]`
-   **Trust boundaries:** `[USER / SERVICE / NETWORK / DATA STORE]`
-   **Threat actors:** `[EXTERNAL / INSIDER / SUPPLY CHAIN / NATION-STATE]`

------------------------------------------------------------------------

# 1. Threat Modeling via STRIDE

Apply the **STRIDE** framework to each trust boundary and component.

-   **Spoofing** — Identity verification weaknesses
    -   Authentication mechanism analysis
    -   Session management review
    -   Token validation (JWT, OAuth, API keys)
-   **Tampering** — Data integrity threats
    -   Input modification vectors
    -   Man-in-the-middle opportunities
    -   Database/file tampering paths
-   **Repudiation** — Accountability gaps
    -   Audit logging completeness
    -   Transaction traceability
    -   Non-repudiation mechanisms
-   **Information Disclosure** — Data leakage paths
    -   Error message verbosity
    -   API response over-exposure
    -   Side-channel leaks (timing, cache)
-   **Denial of Service** — Availability threats
    -   Resource exhaustion vectors
    -   Rate limiting effectiveness
    -   Algorithmic complexity attacks
-   **Elevation of Privilege** — Authorization bypass
    -   Horizontal privilege escalation
    -   Vertical privilege escalation
    -   Role/permission boundary enforcement

### Deliverable

Data flow diagram annotations with STRIDE threats mapped to each
trust boundary crossing.

------------------------------------------------------------------------

# 2. OWASP Top 10 (2021) Deep Review

Evaluate the application against each OWASP Top 10 category:

| # | Category | Key Checks |
|---|----------|------------|
| A01 | Broken Access Control | IDOR, missing function-level access control, CORS misconfiguration |
| A02 | Cryptographic Failures | Weak algorithms, plaintext storage, missing TLS, poor key management |
| A03 | Injection | SQLi, XSS, command injection, LDAP injection, template injection |
| A04 | Insecure Design | Missing threat model, insecure business logic, inadequate separation |
| A05 | Security Misconfiguration | Default credentials, unnecessary features, missing headers, verbose errors |
| A06 | Vulnerable Components | Known CVEs in dependencies, outdated libraries, unmaintained packages |
| A07 | Authentication Failures | Credential stuffing, weak passwords, missing MFA, session fixation |
| A08 | Data Integrity Failures | Insecure deserialization, missing integrity checks, unsigned updates |
| A09 | Logging & Monitoring Failures | Missing audit trails, no alerting, insufficient log detail |
| A10 | SSRF | Unvalidated URL fetches, internal service exposure, cloud metadata access |

For each category: identify specific instances, rate likelihood and impact,
provide remediation steps.

------------------------------------------------------------------------

# 3. Code-Level Security Patterns

Review implementation for these secure coding patterns:

### Input Validation
-   Allowlist over denylist validation
-   Type-safe parsing (no raw string casting)
-   Length, range, and format constraints
-   Parameterized queries for all database access

### Output Encoding
-   Context-aware encoding (HTML, URL, JavaScript, CSS)
-   Content Security Policy headers
-   Strict Content-Type with charset

### Authentication & Session
-   Password hashing (Argon2id, bcrypt with cost >= 12)
-   Session token entropy (>= 128 bits)
-   Secure cookie attributes (HttpOnly, Secure, SameSite)
-   Token expiration and rotation

### Authorization
-   Principle of least privilege
-   Server-side enforcement (never client-only)
-   Resource-level access checks on every request
-   Consistent authorization middleware

### Error Handling
-   Generic user-facing error messages
-   Detailed internal logging (no secrets in logs)
-   Fail-closed behavior on exceptions
-   No stack traces in production responses

### Cryptography
-   No custom cryptographic implementations
-   AES-256-GCM for symmetric encryption
-   RSA-2048+ or Ed25519 for asymmetric
-   Cryptographically secure random number generation

------------------------------------------------------------------------

# 4. CVSS v4.0 Scoring Guide

Score each finding using **CVSS v4.0** (Common Vulnerability Scoring System):

### Base Metrics
-   **Attack Vector (AV):** Network / Adjacent / Local / Physical
-   **Attack Complexity (AC):** Low / High
-   **Attack Requirements (AT):** None / Present
-   **Privileges Required (PR):** None / Low / High
-   **User Interaction (UI):** None / Passive / Active
-   **Vulnerable System Impact:** Confidentiality / Integrity / Availability (None / Low / High)
-   **Subsequent System Impact:** Confidentiality / Integrity / Availability (None / Low / High)

### Severity Ratings
| Score | Rating | Response SLA |
|-------|--------|-------------|
| 9.0 - 10.0 | Critical | Immediate (< 24 hours) |
| 7.0 - 8.9 | High | Urgent (< 72 hours) |
| 4.0 - 6.9 | Medium | Planned (next sprint) |
| 0.1 - 3.9 | Low | Backlog |

------------------------------------------------------------------------

# 5. Output Format

Structure the audit report as follows:

### Executive Summary
-   Overall risk posture: `CRITICAL / HIGH / MODERATE / LOW`
-   Total findings by severity
-   Top 3 risks requiring immediate attention

### Threat Model
-   Data flow diagram with trust boundaries
-   STRIDE analysis per boundary
-   Attack tree for highest-risk paths

### Findings Table
| ID | Title | OWASP | CVSS | Severity | Status |
|----|-------|-------|------|----------|--------|
| F-001 | [description] | A01-A10 | [score] | Critical/High/Medium/Low | Open |

### Finding Detail (per finding)
-   **Description** — What the vulnerability is
-   **Evidence** — Code location, reproduction steps
-   **Impact** — What an attacker could achieve
-   **Remediation** — Specific fix with code example
-   **References** — CWE ID, relevant standards

### Remediation Priority Matrix
Rank findings by: exploitability x impact x fix effort.
