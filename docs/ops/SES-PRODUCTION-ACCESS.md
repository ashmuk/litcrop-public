# SES Production Access — Step-by-Step Guide

> **Status**: Pending (SES currently in sandbox)
> **Impact**: Bug reports + user notifications (#391) limited to admin email only
> **Urgency**: Before GA or before #391 user-facing email implementation

---

## Current State

- SES region: `ap-northeast-1`
- Verified sender: `admin@example.com` (SES_FROM_EMAIL)
- Sandbox limitation: only verified addresses can send AND receive
- Bug report form works (admin → admin), but user-facing emails won't reach non-admin users

## Steps to Production Access

### Step 1: Request Production Access (AWS Console)

1. Go to **AWS Console → SES → Account dashboard**
2. Click **"Request production access"** (or check the banner at the top)
3. Fill the form:

| Field | Value |
|-------|-------|
| Mail type | **Transactional** |
| Website URL | `https://litcrop.com` |
| Use case | Farm management app sending transactional notifications: account signup confirmations, join request approvals/rejections, role change alerts, and bug reports. Low volume (<100 emails/day), single verified sender domain. All recipients are registered users who opted in during account creation. |
| Expected daily volume | **Under 100** |
| How do you handle bounces? | Bounce notifications monitored via SES reputation dashboard. Hard bounces immediately stop sending to that address. |
| How do you handle complaints? | Complaint feedback loop via SES. Any complaint results in immediate unsubscribe. |

4. Submit and wait for approval (typically **24-48 hours**)

### Step 2: Verify litcrop.com Domain (after approval)

1. Go to **SES → Verified identities → Create identity**
2. Choose **Domain** → enter `litcrop.com`
3. Enable **DKIM** (SES provides 3 CNAME records)
4. Add the 3 CNAME records to **Route 53** hosted zone for litcrop.com
5. Optionally add **SPF** record: `v=spf1 include:amazonses.com ~all`
6. Wait for domain verification (minutes to hours)

### Step 3: Update Configuration

```bash
# Update .env (or CDK context) to use domain-verified sender
SES_FROM_EMAIL=noreply@litcrop.com

# Also consider:
# ADMIN_EMAILS can remain as admin@example.com
# User-facing emails come from noreply@litcrop.com
```

CDK changes (if sender address is in stack):
- `infra/lib/litcrop-stack.ts` — update SES_FROM_EMAIL environment variable on API Lambda

### Step 4: Test

1. Go to Admin dashboard → Test Email
2. Send to a non-verified external email address
3. Verify delivery (check spam folder first time)

### Step 5: Update Notification Service

After SES is in production mode, implement #391 user-facing emails:
- Join request approved → email requester
- Join request rejected → email requester  
- Role changed → email affected user
- `notification.ts` already has the event listeners — extend `sendToAdmins` pattern to `sendToUser`

---

## No-Code Workaround (while in sandbox)

- Bug reports: work for admin (admin@example.com sends to itself)
- User notifications: use **in-app toasts only** (no email) — this is the #391 partial implementation strategy
- Verify additional emails manually: SES → Verified identities → Create identity → Email address (ask users to click verification link)

---

## Cost

| Volume | Monthly Cost |
|--------|-------------|
| 100 emails/day | ~$0.03/month |
| 1,000 emails/day | ~$0.30/month |

SES pricing: $0.10 per 1,000 emails. Well within the $5/month ceiling.

---

## Related

- #391 — User notifications (blocked on SES production for email component)
- `src/api/src/services/notification.ts` — email sending logic
- `admin@example.com` — current verified sender/recipient
- ADR-20260413-monetization-strategy — cost projections include SES
