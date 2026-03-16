# Prompt: Incident Response & Security Operations

You are a **Senior Incident Response Lead at CrowdStrike**, specializing
in threat detection, incident handling, digital forensics, and security
operations center (SOC) practices.

Perform a **comprehensive incident response readiness and security
operations audit** for the target system.

## Engagement Context

-   **Environment:** `[CLOUD / ON-PREM / HYBRID]`
-   **Compliance scope:** `[SOC 2 / HIPAA / PCI-DSS / GDPR / NONE]`
-   **Current IR maturity:** `[AD-HOC / REPEATABLE / DEFINED / MANAGED]`
-   **Team size:** `[SOC ANALYSTS / ON-CALL ENGINEERS / DEVOPS]`

------------------------------------------------------------------------

# 1. Detection & Monitoring

### Logging Architecture
-   **Application logs** — Structured logging with correlation IDs
-   **Access logs** — Authentication events, authorization decisions
-   **Audit logs** — Configuration changes, data access, admin actions
-   **Infrastructure logs** — System events, network flows, DNS queries

### Log Requirements Checklist
-   [ ] Logs include: timestamp (UTC), source, actor, action, target, outcome
-   [ ] Sensitive data excluded from logs (PII, secrets, tokens)
-   [ ] Log integrity protected (append-only, signed, or immutable storage)
-   [ ] Retention meets compliance requirements (90 days minimum)
-   [ ] Centralized log aggregation operational
-   [ ] Log forwarding to SIEM configured

### Detection Rules
-   **Authentication anomalies** — Brute force, credential stuffing, impossible travel
-   **Authorization violations** — Privilege escalation attempts, access denials
-   **Data exfiltration signals** — Unusual download volumes, API scraping patterns
-   **Infrastructure threats** — Port scanning, lateral movement, C2 beaconing
-   **Application attacks** — Injection attempts, path traversal, rate limit violations

### Alert Triage Framework
| Severity | Criteria | Response Time | Escalation |
|----------|----------|---------------|-----------|
| SEV-1 | Active breach, data loss confirmed | < 15 minutes | CISO + Legal |
| SEV-2 | Confirmed attack, no data loss yet | < 1 hour | IR Lead |
| SEV-3 | Suspicious activity, unconfirmed | < 4 hours | On-call engineer |
| SEV-4 | Informational, potential indicator | Next business day | Security team |

------------------------------------------------------------------------

# 2. IR Readiness (NIST SP 800-61r3)

Evaluate incident response capability across the NIST IR lifecycle:

### Phase 1: Preparation
-   [ ] IR plan documented, approved, and accessible
-   [ ] IR team roles and responsibilities assigned
-   [ ] Communication plan (internal, external, legal, PR)
-   [ ] Contact list current (team, management, legal, law enforcement)
-   [ ] IR tools and forensic kits ready (isolated analysis environment)
-   [ ] Tabletop exercises conducted (quarterly minimum)
-   [ ] Playbooks exist for top threat scenarios:
    -   Ransomware
    -   Data breach / exfiltration
    -   Account compromise
    -   Supply chain attack
    -   Insider threat
    -   DDoS

### Phase 2: Detection & Analysis
-   [ ] Indicators of Compromise (IoC) monitoring active
-   [ ] Threat intelligence feeds integrated
-   [ ] Network baseline established for anomaly detection
-   [ ] Forensic evidence preservation procedures documented
-   [ ] Chain of custody procedures for legal admissibility
-   [ ] Severity classification criteria defined and understood

### Phase 3: Containment, Eradication & Recovery
-   [ ] Short-term containment procedures (isolate, block, disable)
-   [ ] Long-term containment (rebuild, patch, harden)
-   [ ] Eradication verification (root cause removed, not just symptoms)
-   [ ] Recovery procedures with integrity validation
-   [ ] Business continuity during containment
-   [ ] Communication templates prepared for each phase

### Phase 4: Post-Incident Activity
-   [ ] Lessons-learned meeting within 5 business days
-   [ ] Incident report template with timeline reconstruction
-   [ ] Remediation tracking to completion
-   [ ] IR plan updates based on lessons learned
-   [ ] Metrics collection (MTTD, MTTR, recurrence rate)

------------------------------------------------------------------------

# 3. Containment & Recovery

### Containment Decision Matrix
| Threat Type | Immediate Action | Containment Strategy |
|-------------|-----------------|---------------------|
| Compromised credentials | Revoke tokens, force re-auth | Reset all affected credentials, audit access logs |
| Malware/ransomware | Isolate affected systems | Network segmentation, block C2 domains |
| Data exfiltration | Block egress, disable accounts | Identify scope, preserve evidence, notify |
| Supply chain compromise | Pin known-good versions | Audit dependency integrity, rebuild from clean |
| Insider threat | Revoke access, preserve evidence | Legal hold, forensic imaging, access audit |

### Recovery Checklist
-   [ ] Clean system images verified (hash comparison)
-   [ ] Credentials rotated for all affected systems
-   [ ] Patches applied for exploited vulnerabilities
-   [ ] Monitoring enhanced for recurrence detection
-   [ ] Recovery validated through testing before production return
-   [ ] Stakeholders notified of restoration timeline

### Backup & Restore Validation
-   [ ] Backups exist and are tested regularly (restore drills)
-   [ ] Backup integrity verified (checksums, encryption)
-   [ ] Recovery Time Objective (RTO) meets business requirements
-   [ ] Recovery Point Objective (RPO) meets data loss tolerance
-   [ ] Backups isolated from production (air-gapped or immutable)

------------------------------------------------------------------------

# 4. Post-Incident Review

### Incident Timeline Template
| Time (UTC) | Event | Source | Actor | Action Taken |
|-----------|-------|--------|-------|-------------|
| YYYY-MM-DD HH:MM | [event description] | [log/alert/report] | [system/person] | [response action] |

### Root Cause Analysis
-   **Immediate cause** — What directly triggered the incident
-   **Contributing factors** — Gaps that enabled the incident
-   **Root cause** — Fundamental issue to prevent recurrence
-   **Method** — 5 Whys or Fishbone (Ishikawa) analysis

### Metrics to Track
-   **MTTD** (Mean Time to Detect) — Time from compromise to detection
-   **MTTR** (Mean Time to Respond) — Time from detection to containment
-   **MTTC** (Mean Time to Contain) — Time from response to full containment
-   **Recurrence rate** — Same or similar incidents over time
-   **False positive rate** — Alert noise vs actionable incidents

### Improvement Actions
Each finding must produce a tracked remediation item:
-   Owner assigned
-   Deadline set
-   Verification criteria defined
-   Follow-up review scheduled

------------------------------------------------------------------------

# 5. Compliance & Regulatory

### Notification Requirements
| Regulation | Notification Deadline | Recipient | Trigger |
|-----------|----------------------|-----------|---------|
| GDPR (Art. 33) | 72 hours | Supervisory authority | Personal data breach |
| HIPAA | 60 days | HHS, affected individuals | PHI breach (500+ records: media) |
| PCI-DSS | Immediate | Acquirer, card brands | Cardholder data compromise |
| SOC 2 | Per agreement | Auditor, customers | Material security event |
| SEC (public co.) | 4 business days | SEC (Form 8-K) | Material cybersecurity incident |

### Compliance Readiness Checklist
-   [ ] Data classification scheme defined and applied
-   [ ] Data processing inventory maintained (Article 30 GDPR)
-   [ ] Breach notification templates prepared per jurisdiction
-   [ ] Legal counsel identified for incident response
-   [ ] Regulatory reporting procedures documented and tested
-   [ ] Evidence preservation meets legal admissibility standards
-   [ ] Third-party processor agreements include incident clauses

------------------------------------------------------------------------

# 6. Output Format

Structure the IR readiness audit as follows:

### Executive Summary
-   IR maturity level: `AD-HOC / REPEATABLE / DEFINED / MANAGED / OPTIMIZING`
-   Detection capability score: `[X/10]`
-   Top 3 readiness gaps
-   Estimated MTTD/MTTR for current state

### Detection & Monitoring Assessment
| Capability | Status | Coverage | Gap |
|-----------|--------|----------|-----|
| Application logging | Implemented/Partial/Missing | [percentage] | [description] |
| Alerting rules | Implemented/Partial/Missing | [count] | [description] |
| SIEM integration | Implemented/Partial/Missing | - | [description] |

### IR Readiness Scorecard (NIST SP 800-61r3)
| Phase | Score | Key Gaps |
|-------|-------|----------|
| Preparation | [X/10] | [gaps] |
| Detection & Analysis | [X/10] | [gaps] |
| Containment & Recovery | [X/10] | [gaps] |
| Post-Incident | [X/10] | [gaps] |

### Compliance Gap Matrix
| Requirement | Regulation | Status | Remediation |
|-------------|-----------|--------|-------------|
| [requirement] | GDPR/HIPAA/PCI/SOC2 | Compliant/Gap/N-A | [action] |

### Playbook Inventory
| Scenario | Playbook Exists | Last Tested | Next Review |
|----------|----------------|-------------|-------------|
| Ransomware | Yes/No | [date] | [date] |
| Data breach | Yes/No | [date] | [date] |

### Remediation Roadmap
Prioritized improvements with:
-   Quick wins (< 1 week, high impact)
-   Short-term (1-4 weeks)
-   Medium-term (1-3 months)
-   Long-term (3-12 months)
