# LitCrop

Remote farm observation and management web app — digitally track planting layouts, monitor crop growth through camera images, and make informed farming decisions from anywhere.

## Overview

LitCrop builds a digital twin of a small farm, enabling remote visibility into field conditions through periodic and motion-triggered camera captures. The system represents a farm's physical structure as a flat bed grid (Farm → Beds) and associates camera images with specific beds, creating a time-ordered growth record viewable on a mobile-first dashboard.

**Target deployment**: Nagano Prefecture, Japan (760m elevation, humid continental climate). Bilingual: English / Japanese.

**Name origin**: "Lit" as in Little, Lite, and Enlight.

## Project Status

**Current Stage**: Beta-4 complete — v0.32 (439 tests, 15 pages). Beta-5 design complete, implementation next.

**Scope Level**: ~~PoC~~ → ~~MVP~~ → ~~MVP+~~ → **Beta** → Production ([PLANS.md](PLANS.md))

### Milestones
| Stage | Version | Key Deliverables |
|-------|---------|-----------------|
| PoC | v0.6 | Camera sim, 7 screens, weather, AI chat, i18n |
| MVP | v0.9 | Auth, CDK infra, thumbnails, security hardening |
| MVP+ | v0.14 | CI/CD, multi-farm, time-lapse, Farm→Bed flattening, roles |
| Beta-1 | v0.22 | Device rename, ownership checks, admin farm access |
| Beta-2 | v0.28 | Settings sync, admin dashboard, observer onboarding, security |
| Beta-3 | v0.30 | Multi-farm membership, join requests, leave farm, farm discovery |
| Beta-4 | v0.32 | Change password, delete account, SES notifications, activity log |
| Beta-5 | *next* | Device configuration UI + API (#210), profile picture (#160) |

### Design Artifacts
- Requirements: 87+ functional, 38+ non-functional ([REQUIREMENTS.md](REQUIREMENTS.md))
- Architecture: System design with 15 ADRs ([docs/ARCHITECTURE.md](docs/ARCHITECTURE.md))
- UX/UI: 15+ screens ([docs/UX-DESIGNS.md](docs/UX-DESIGNS.md))
- API: 30+ endpoints with full request/response schemas ([docs/API-CONTRACTS.md](docs/API-CONTRACTS.md))
- System design: Sequence diagrams, component interfaces ([docs/SYSTEM-DESIGN.md](docs/SYSTEM-DESIGN.md))
- Mock-ups: 13 interactive HTML/CSS screens ([docs/mockups/](docs/mockups/))
- Execution plans: [docs/planning/](docs/planning/)

## Tech Stack

### Application
- **Frontend**: [Astro](https://astro.build/) + [Preact](https://preactjs.com/) islands (SSG, zero-JS default)
- **Backend**: [Hono](https://hono.dev/) on AWS Lambda (30+ REST endpoints)
- **Database**: DynamoDB single-table design (2 GSIs)
- **Language**: TypeScript
- **Styling**: CSS custom properties (design tokens), mobile-first

### Infrastructure
- **Cloud**: AWS ap-northeast-1 (Tokyo)
- **Compute**: Lambda behind API Gateway HTTP API (v2)
- **Storage**: S3 for images (lifecycle: Standard → IA 30d → Glacier 90d)
- **CDN**: CloudFront for static hosting (HTTPS)
- **Cost**: ~$0.73–1.18/month (well under $5 target)

### External Services
- **Weather**: [Open-Meteo API](https://open-meteo.com/) (free, no API key)
- **AI Chatbot**: [Anthropic Claude](https://www.anthropic.com/) (Haiku 4.5 via `@anthropic-ai/sdk`, multi-turn + tool use)
- **Email**: AWS SES (admin notifications for account/farm events)

### Development
- **Package Manager**: npm
- **DevContainer**: Docker-based development environment
- **Branch Strategy**: Git Flow (`main`, `develop`, `feature/*`)
- **CI**: GitHub Actions (lint, build, type check, test)

<details>
<summary>PoC Deliverables (completed v0.6)</summary>

1. Simulated camera node uploading sample images (periodic + motion-triggered) via HTTPS
2. Cloud backend receiving, storing, and serving farm images with plot association
3. Mobile-first web dashboard with 7 screens: Farm Overview (list + layout), Plot Detail, Image Timeline, Weather, Farm Setup, Settings
4. Static farm layout with seed data (fields, beds, plots, crop metadata)
5. Manual image tagging (Healthy / Slow Growth / Possible Issue / Animal Intrusion)
6. Weather integration via Open-Meteo with crop impact analysis
7. Farm setup with location input driving weather and climate profile
8. AI chatbot for location-aware crop planning
9. Theme options (Light / Dark / Earthy / System) and language toggle (EN / JA)

</details>

## Getting Started

### Prerequisites

- Node.js 22+
- Docker (for DevContainer)
- Git
- AWS CLI (configured with `litcrop` profile)

### Setup

```bash
# Clone the repository
git clone https://github.com/ashmuk/litcrop.git
cd litcrop

# Start DevContainer (recommended)
devcontainer up --workspace-folder .

# Or install dependencies locally
npm install
```

## Development

### Running Locally

```bash
npm run dev
```

### Building

```bash
npm run build
```

### Git Workflow

```bash
# Start a new feature
git checkout develop
git pull origin develop
git checkout -b feature/your-feature

# Commit using conventional commits
git commit -m "feat(scope): description"
git push -u origin feature/your-feature

# Open a pull request targeting develop
```

Commit format: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, etc.

## Repository Structure

```text
litcrop/
├── .agent/                     # AI agent source of truth (commands, subagents, skills)
├── .claude/                    # Claude Code configuration (generated by make sync)
├── .codex/                     # OpenAI Codex configuration (generated by make sync)
├── .cursor/                    # Cursor IDE rules (generated by make sync)
├── .devcontainer/              # Docker DevContainer setup
├── .github/                    # GitHub Actions workflows and templates
├── .githooks/                  # Git hooks (branch protection, pre-commit)
├── docs/
│   ├── decisions/              # Architecture Decision Records (15 ADRs)
│   ├── mockups/                # Interactive HTML/CSS mock-ups (13 screens)
│   ├── gantt/                  # Execution timeline visualization
│   ├── ARCHITECTURE.md         # System architecture
│   ├── API-CONTRACTS.md        # API request/response schemas
│   ├── SYSTEM-DESIGN.md        # Sequence diagrams, component interfaces
│   ├── UX-DESIGNS.md           # UX/UI specification
│   ├── TASK-BREAKDOWN.md       # Implementable tasks (30 for Beta-5)
│   ├── feedback/               # Review findings and remediation reports
│   └── PREREQUISITES.md        # Knowledge and tooling requirements
├── scripts/
│   └── iam-policy.json         # AWS IAM policy (least-privilege)
├── AGENTS.md                   # Repo map and quick commands
├── CLAUDE.md                   # AI assistant guidelines
├── PLANS.md                    # Scope-leveled roadmap
├── REQUIREMENTS.md             # Functional and non-functional requirements
├── RULES.md                    # Stable project policy
├── Vision.md                   # Project vision and concept
└── README.md                   # This file
```

## Architecture Decisions

| ADR | Decision | Date |
|-----|----------|------|
| [001](docs/decisions/ADR-20260317-frontend-framework.md) | Astro + Preact islands | 2026-03-17 |
| [002](docs/decisions/ADR-20260317-backend-platform.md) | Hono on single Lambda | 2026-03-17 |
| [003](docs/decisions/ADR-20260317-database-selection.md) | DynamoDB single-table | 2026-03-17 |
| [004](docs/decisions/ADR-20260317-image-storage-lifecycle.md) | S3 with lifecycle policies | 2026-03-17 |
| [005](docs/decisions/ADR-20260317-device-communication.md) | HTTPS POST upload | 2026-03-17 |
| [006](docs/decisions/ADR-20260317-cloud-provider-hosting.md) | AWS ap-northeast-1 | 2026-03-17 |
| [IAM](docs/decisions/ADR-20260317-iam-least-privilege.md) | Least-privilege IAM policy | 2026-03-17 |
| [Pipeline](docs/decisions/ADR-20260319-pipeline-improvements-mvp.md) | Per-phase gates, issue-first | 2026-03-19 |
| [007](docs/decisions/ADR-20260320-authentication-provider.md) | AWS Cognito User Pools + JWT | 2026-03-20 |
| [008](docs/decisions/ADR-20260320-iac-tool-selection.md) | AWS CDK (TypeScript) | 2026-03-20 |
| [009](docs/decisions/ADR-20260320-ai-llm-framework.md) | Anthropic SDK | 2026-03-20 |
| [Multi-farm](docs/decisions/ADR-20260322-multi-farm-membership.md) | Multi-farm membership model | 2026-03-22 |
| [Bed-grid](docs/decisions/ADR-20260322-phase-d-bed-grid-data-model.md) | Farm→Bed grid data model | 2026-03-22 |
| [Settings](docs/decisions/ADR-20260325-settings-sync.md) | Settings sync pattern | 2026-03-25 |
| [Notifications](docs/decisions/ADR-20260401-notification-architecture.md) | SES notification architecture | 2026-04-01 |

## Deployment

All infrastructure is managed by AWS CDK ([ADR-008](docs/decisions/ADR-20260320-iac-tool-selection.md)). Deployed to `ap-northeast-1` (Tokyo).

```bash
# Preview changes
cd infra && npx cdk diff

# Deploy infrastructure (Lambda, API Gateway, DynamoDB, S3, Cognito, CloudFront)
npx cdk deploy

# Build and deploy frontend
cd ../src/frontend && npm run build
aws s3 sync dist/ s3://litcrop-mvp-static/ --delete --region ap-northeast-1

# Invalidate CloudFront cache
aws cloudfront create-invalidation --distribution-id <DIST_ID> --paths "/*"
```

CI/CD: GitHub Actions runs on push to `main` via `.github/workflows/deploy.yml` (OIDC auth, environment approval gate).

## Guidelines

- All AI-generated code requires maintainer review before merge
- Never commit secrets (`.env`, API keys, credentials)
- Follow existing code patterns before introducing new ones
- See [RULES.md](RULES.md) for stable project policy
- See [CLAUDE.md](CLAUDE.md) for AI assistant guidelines

## License

Private — All rights reserved.
