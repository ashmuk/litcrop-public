# Security Policy

## Supported Versions

LitCrop is in pilot phase. We patch the currently-deployed minor series and the previous one.

| Version series | Supported          |
| -------------- | ------------------ |
| `v0.99.6.x`    | :white_check_mark: current production |
| `v0.99.5.x`    | :white_check_mark: previous series, security-only |
| `< v0.99.5`    | :x: no longer supported |

Post-GA (v1.0) we will publish a formal N/N-1 support policy.

## Reporting a Vulnerability

**Please do not open a public GitHub issue for a security-sensitive report.**

Instead, email the maintainer (contact via GitHub profile) with:

- A clear description of the issue
- Steps to reproduce or a proof-of-concept, if available
- The affected version(s) — e.g. `v0.99.6.5`
- Your contact details (so we can acknowledge and keep you informed)

### Response expectations

| Stage | Target |
| ----- | ------ |
| Acknowledgement of your report | within **5 business days** |
| Triage and initial assessment  | within **14 days** |
| Fix timeline communication     | after triage, based on severity |
| Public disclosure coordination | after a patch ships, with credit (opt-in) |

We are a small project and cannot guarantee SLAs tighter than the above during pilot phase. If your report is time-sensitive (e.g. an actively exploited issue), please mark the email subject line with `[URGENT]`.

## Scope

The following are in scope for security reports:

- Authentication and authorization bypasses
- Data exposure (PII, credentials, API keys, photos, farm records)
- Injection vulnerabilities (XSS, SQL/NoSQL, command, path traversal)
- Privilege escalation across farm roles (admin / owner / staff)
- Vulnerabilities in our device install scripts (`install.sh`, `capture.sh`) that could compromise a Raspberry Pi
- AWS infrastructure exposure (S3 objects, DynamoDB records, IAM roles)
- Supply-chain concerns in our published static assets (CDN-served `install.sh` / `capture.sh`)

The following are **out of scope**:

- Vulnerabilities in third-party dependencies without a demonstrated exploit path in LitCrop's usage (we track these via `npm audit` and patch on release cycles)
- Self-inflicted issues by users running modified/unofficial builds
- Social-engineering or physical-access attacks
- Denial-of-service requiring pre-existing privileged access
- Reports based solely on automated scanner output without analysis

## Credit

We recognise reporters who follow coordinated disclosure with an entry in the release notes for the patched version, unless anonymity is requested.

## PGP

PGP is not currently required. If you prefer to encrypt your report, request a key via the above email and we will provide one before you send details.
