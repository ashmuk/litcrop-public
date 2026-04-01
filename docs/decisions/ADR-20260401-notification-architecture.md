# ADR-20260401: Email Notification Architecture

## Status
Proposed

## Context
LitCrop needs to notify admin users when significant platform events occur (user signup,
farm lifecycle, join request flow, account deletion). The system currently has no
application-level email capability -- only Cognito transactional emails exist.

Key constraints:
- Monthly email volume: <50 emails/month
- AWS budget: ~$1.18/month, $5 ceiling
- Only admin users receive notifications (small, known recipient set)
- This notification layer must be reusable by Wave 3 Activity Log
- SES sandbox provides 200 emails/day free to verified addresses

## Options Considered

### Option 1: SES Direct from Lambda (with in-process EventEmitter)
- **Description**: API Lambda calls SES directly. Route handlers emit typed events
  via an in-process pub/sub; a notification subscriber sends emails. No new AWS services
  beyond SES.
- **Pros**: Simplest architecture, zero incremental cost, single Lambda to monitor,
  EventEmitter provides Wave 3 subscription point
- **Cons**: No automatic retry on send failure, best-effort delivery, email adds
  50-200ms (fire-and-forget, not blocking)
- **Effort**: Low

### Option 2: SNS Fan-out to SES
- **Description**: Lambda publishes to SNS topic; a subscriber Lambda sends via SES.
- **Pros**: Built-in retry, easy to add subscribers
- **Cons**: Additional infrastructure, SNS cannot format HTML emails natively, overkill
  for <50 emails/month
- **Effort**: Medium

### Option 3: EventBridge to Lambda to SES
- **Description**: Lambda emits to EventBridge; rules trigger a notification Lambda.
- **Pros**: Schema registry, event replay, filtering
- **Cons**: Significant complexity, 500ms+ latency, second Lambda required,
  over-engineered for current scale
- **Effort**: High

## Decision
Option 1: SES Direct from Lambda with a typed in-process EventEmitter.

The EventEmitter is a simple TypeScript pub/sub within the Lambda process -- not AWS
EventBridge. Route handlers call `appEvents.emit('event.type', payload)`. The
notification service subscribes at module load time and sends SES emails. Wave 3
Activity Log will subscribe to the same events to write audit records.

SES stays in sandbox mode for Beta-4. Only verified admin emails receive notifications.

## Rationale
At <50 emails/month with a single recipient group (admins), the simplest solution wins.
SNS and EventBridge add operational complexity without proportional benefit at this scale.
The in-process EventEmitter provides the decoupling and extensibility needed for Wave 3
without distributed messaging overhead.

Cost impact is $0.00 (SES sandbox free tier). No budget ceiling risk.

## Consequences

### Positive
- Zero incremental AWS cost
- Single service to monitor (existing API Lambda)
- Wave 3 Activity Log gets a ready-made event subscription layer
- No new Lambda functions or infrastructure services
- Graceful degradation: if SES_FROM_EMAIL is unset, events still fire but no emails sent

### Negative
- No automatic retry on SES send failure (mitigated: log and alert)
- Best-effort delivery, not guaranteed (acceptable for admin notifications)
- SES sandbox requires manual verification of each admin email address
- If Lambda process crashes mid-handler, queued fire-and-forget events are lost

## Implementation Notes
- Full design: `docs/designs/BETA4-EMAIL-NOTIFICATIONS.md`
- New files: `services/events.ts` (EventEmitter), `services/notification.ts` (SES subscriber)
- CDK changes: add `SES_FROM_EMAIL` env var, add `ses:SendEmail` IAM permission
- Progression: revisit for SNS fan-out or EventBridge when volume exceeds 200/day or
  guaranteed delivery is required
