/**
 * Email notification service — Wave 2.
 * Subscribes to domain events and sends plain-text emails via AWS SES.
 * Disabled gracefully when SES_FROM_EMAIL or ADMIN_EMAILS are not configured.
 */

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import type { NotificationType } from '@litcrop/shared';
import { appEvents, type AppEventType, type AppEventMap, type JoinRequestSubmittedPayload, type JoinRequestResolvedPayload, type MemberRoleChangedPayload } from './events';
import { createNotification } from './repositories/notifications';

// ── Config ──────────────────────────────────────────────────────

const SES_FROM_EMAIL = process.env['SES_FROM_EMAIL'] ?? '';
const SES_REGION = process.env['SES_REGION'] ?? process.env['AWS_REGION'] ?? 'ap-northeast-1';
import { ADMIN_EMAILS_LIST as ADMIN_EMAILS } from '../config';

const ENABLED = SES_FROM_EMAIL.length > 0 && ADMIN_EMAILS.length > 0;

/** Whether email notifications are configured and active. */
export const isNotificationEnabled = ENABLED;

/** Send a diagnostic test email to all admins. Returns detailed result. */
export async function sendTestEmail(): Promise<{
  success: boolean;
  enabled: boolean;
  from: string;
  to: string[];
  error?: string;
}> {
  if (!ENABLED || !ses) {
    return {
      success: false,
      enabled: ENABLED,
      from: SES_FROM_EMAIL || '(not set)',
      to: ADMIN_EMAILS,
      error: !SES_FROM_EMAIL
        ? 'SES_FROM_EMAIL environment variable is not set'
        : 'ADMIN_EMAILS environment variable is not set',
    };
  }
  try {
    await ses.send(
      new SendEmailCommand({
        Source: SES_FROM_EMAIL,
        Destination: { ToAddresses: ADMIN_EMAILS },
        Message: {
          Subject: { Data: '[LitCrop] Test notification', Charset: 'UTF-8' },
          Body: {
            Text: {
              Data: 'This is a test email from LitCrop admin dashboard.\n\nIf you received this, email notifications are working correctly.',
              Charset: 'UTF-8',
            },
          },
        },
      }),
    );
    return { success: true, enabled: true, from: SES_FROM_EMAIL, to: ADMIN_EMAILS };
  } catch (err) {
    console.error('[notification] sendTestEmail failed:', err);
    return { success: false, enabled: true, from: SES_FROM_EMAIL, to: ADMIN_EMAILS, error: 'SES send failed — check server logs for details' };
  }
}

// ── SES Client ──────────────────────────────────────────────────

const ses = ENABLED ? new SESClient({ region: SES_REGION }) : null;

// ── Wave 2 event types (email notifications) ────────────────────

export const NOTIFICATION_EVENT_TYPES: AppEventType[] = [
  'user.signup',
  'farm.created',
  'farm.deleted',
  'join_request.submitted',
  'join_request.approved',
  'join_request.rejected',
  'account.deleted',
];

export const DEFAULT_NOTIFICATION_PREFS: Record<AppEventType, boolean> = {
  'user.signup': true,
  'farm.created': true,
  'farm.deleted': true,
  'join_request.submitted': true,
  'join_request.approved': true,
  'join_request.rejected': true,
  'account.deleted': true,
  // Wave 3 events (activity log only — not configurable as email notifications)
  'farm.updated': false,
  'bed.updated': false,
  'image.uploaded': false,
  'tag.created': false,
  'member.joined': false,
  'member.removed': false,
  'member.role_changed': false,
  'user.profile_updated': false,
  // Device events (Beta-5 — activity log only)
  'device.registered': false,
  'device.deregistered': false,
  'device.config_updated': false,
  'device.test_shot': false,
  // Diary events (Beta-7 — activity log only)
  'diary.created': false,
  'diary.updated': false,
  'diary.deleted': false,
};

// ── Email subject map ───────────────────────────────────────────

const EMAIL_SUBJECTS: Partial<Record<AppEventType, string>> = {
  'user.signup': 'New user registered',
  'farm.created': 'New farm created',
  'farm.deleted': 'Farm deleted',
  'join_request.submitted': 'New join request',
  'join_request.approved': 'Join request approved',
  'join_request.rejected': 'Join request rejected',
  'account.deleted': 'User account deleted',
};

// ── Email body formatter ────────────────────────────────────────

function formatEmailBody<T extends AppEventType>(event: AppEventMap[T]): string {
  const lines: string[] = [];

  switch (event.type) {
    case 'user.signup': {
      const p = event.payload as { user_id: string; display_name: string; email: string };
      lines.push('A new user has registered on LitCrop.');
      lines.push('');
      lines.push('Details:');
      lines.push(`- Display name: ${p.display_name || '(not set)'}`);
      lines.push(`- Email: ${p.email}`);
      break;
    }
    case 'farm.created': {
      const p = event.payload as { farm_id: string; farm_name: string };
      lines.push('A new farm has been created.');
      lines.push('');
      lines.push('Details:');
      lines.push(`- Farm: ${p.farm_name}`);
      lines.push(`- Farm ID: ${p.farm_id}`);
      break;
    }
    case 'farm.deleted': {
      const p = event.payload as { farm_id: string; farm_name: string };
      lines.push('A farm has been deleted.');
      lines.push('');
      lines.push('Details:');
      lines.push(`- Farm: ${p.farm_name}`);
      lines.push(`- Farm ID: ${p.farm_id}`);
      break;
    }
    case 'join_request.submitted': {
      const p = event.payload as { farm_id: string; farm_name: string; requester_name: string };
      lines.push('A user has requested to join a farm.');
      lines.push('');
      lines.push('Details:');
      lines.push(`- Farm: ${p.farm_name}`);
      lines.push(`- Requester: ${p.requester_name || '(anonymous)'}`);
      break;
    }
    case 'join_request.approved': {
      const p = event.payload as { farm_id: string; farm_name: string; target_user_name: string };
      lines.push('A join request has been approved.');
      lines.push('');
      lines.push('Details:');
      lines.push(`- Farm: ${p.farm_name}`);
      lines.push(`- User: ${p.target_user_name || '(unknown)'}`);
      break;
    }
    case 'join_request.rejected': {
      const p = event.payload as { farm_id: string; farm_name: string; target_user_name: string };
      lines.push('A join request has been rejected.');
      lines.push('');
      lines.push('Details:');
      lines.push(`- Farm: ${p.farm_name}`);
      lines.push(`- User: ${p.target_user_name || '(unknown)'}`);
      break;
    }
    case 'account.deleted': {
      const p = event.payload as { user_id: string; display_name: string; email: string };
      lines.push('A user has deleted their account.');
      lines.push('');
      lines.push('Details:');
      lines.push(`- Display name: ${p.display_name || '(not set)'}`);
      lines.push(`- Email: ${p.email}`);
      break;
    }
  }

  lines.push('');
  lines.push(`Triggered by: ${event.actor_email || event.actor_id}`);
  lines.push(`Time: ${event.timestamp}`);
  lines.push('');
  lines.push('--');
  lines.push('LitCrop Admin Notification');

  return lines.join('\n');
}

// ── Send helpers ────────────────────────────────────────────────

/** Low-level SES send. Fire-and-forget: logs errors but never throws. */
async function sendEmail(
  recipients: string[],
  subject: string,
  body: string,
  logLabel: string,
): Promise<void> {
  if (!ses || recipients.length === 0) return;

  try {
    await ses.send(
      new SendEmailCommand({
        Source: SES_FROM_EMAIL,
        Destination: { ToAddresses: recipients },
        Message: {
          Subject: { Data: `[LitCrop] ${subject}`, Charset: 'UTF-8' },
          Body: {
            Text: { Data: body, Charset: 'UTF-8' },
          },
        },
      }),
    );
    console.log(`[notification] sent ${logLabel}`);
  } catch (err) {
    console.error(`[notification] failed to send ${logLabel}:`, err);
  }
}

async function sendToAdmins(
  subject: string,
  body: string,
  eventType: AppEventType,
): Promise<void> {
  // TODO (Beta-4 implementation): Load per-admin preferences from DynamoDB
  // and filter ADMIN_EMAILS by opt-in status for this eventType.
  // For now, send to all admins.
  await sendEmail(ADMIN_EMAILS, subject, body, `${eventType} email to ${ADMIN_EMAILS.length} admin(s)`);
}

// ── Subscribe to events ─────────────────────────────────────────

function initNotificationSubscriptions(): void {
  if (!ENABLED) {
    console.log('[notification] disabled: SES_FROM_EMAIL or ADMIN_EMAILS not configured');
    return;
  }

  for (const eventType of NOTIFICATION_EVENT_TYPES) {
    appEvents.on(eventType, (event) => {
      const subject = EMAIL_SUBJECTS[eventType] ?? eventType;
      const body = formatEmailBody(event);
      // Do not await — fire-and-forget
      sendToAdmins(subject, body, eventType);
    });
  }

  console.log(`[notification] subscribed to ${NOTIFICATION_EVENT_TYPES.length} event types`);
}

// ── User-facing email notifications (#391) ─────────────────────

/** Event types that trigger an email to the affected user (not admins). */
const USER_NOTIFICATION_EVENT_TYPES: AppEventType[] = [
  'join_request.submitted',
  'join_request.approved',
  'join_request.rejected',
  'member.role_changed',
];

const USER_EMAIL_SUBJECTS: Partial<Record<AppEventType, string>> = {
  'join_request.submitted': 'New join request for your farm',
  'join_request.approved': "You've been accepted!",
  'join_request.rejected': 'Join request update',
  'member.role_changed': 'Your role has been updated',
};

function formatUserEmailBody<T extends AppEventType>(event: AppEventMap[T]): string {
  const lines: string[] = [];

  switch (event.type) {
    case 'join_request.submitted': {
      const p = event.payload as JoinRequestSubmittedPayload;
      lines.push(`${p.requester_name || 'A user'} has requested to join your farm "${p.farm_name}".`);
      lines.push('');
      lines.push('Log in to LitCrop to review and approve or reject this request.');
      break;
    }
    case 'join_request.approved': {
      const p = event.payload as JoinRequestResolvedPayload;
      lines.push(`Great news! Your request to join "${p.farm_name}" has been approved.`);
      lines.push('');
      lines.push('You now have access to the farm as a staff member. Log in to LitCrop to get started.');
      break;
    }
    case 'join_request.rejected': {
      const p = event.payload as JoinRequestResolvedPayload;
      lines.push(`Your request to join "${p.farm_name}" was not approved at this time.`);
      lines.push('');
      lines.push('If you believe this was a mistake, please contact the farm owner directly.');
      break;
    }
    case 'member.role_changed': {
      const p = event.payload as MemberRoleChangedPayload;
      lines.push(`Your role in "${p.farm_name}" has been changed from ${p.old_role} to ${p.new_role}.`);
      lines.push('');
      if (p.new_role === 'owner') {
        lines.push('As an owner, you can now manage members and farm settings.');
      } else {
        lines.push('Your permissions have been updated accordingly.');
      }
      break;
    }
  }

  lines.push('');
  lines.push('--');
  lines.push('LitCrop — Farm Management Platform');

  return lines.join('\n');
}

/** Send an email to a specific user. Fire-and-forget, same as admin emails. */
async function sendToUser(
  email: string,
  subject: string,
  body: string,
  eventType: AppEventType,
): Promise<void> {
  if (!email) return;
  // SES sandbox: this will fail for unverified recipient emails — expected
  await sendEmail([email], subject, body, `${eventType} user email to ${email}`);
}

function extractTargetEmail(event: AppEventMap[AppEventType]): string | undefined {
  const payload = event.payload as Record<string, unknown>;
  return (payload['target_user_email'] as string) || undefined;
}

function initUserNotificationSubscriptions(): void {
  if (!ENABLED) return;

  for (const eventType of USER_NOTIFICATION_EVENT_TYPES) {
    appEvents.on(eventType, (event) => {
      const targetEmail = extractTargetEmail(event);
      if (!targetEmail) {
        console.log(`[notification] skipping ${eventType} user email — no target email`);
        return;
      }
      const subject = USER_EMAIL_SUBJECTS[eventType] ?? eventType;
      const body = formatUserEmailBody(event);
      sendToUser(targetEmail, subject, body, eventType);
    });
  }

  console.log(`[notification] subscribed to ${USER_NOTIFICATION_EVENT_TYPES.length} user notification event types`);
}

// ── In-app notification persistence (#391) ─────────────────────

const EVENT_TO_NOTIF_TYPE: Partial<Record<AppEventType, NotificationType>> = {
  'join_request.submitted': 'join_submitted',
  'join_request.approved': 'join_approved',
  'join_request.rejected': 'join_rejected',
  'member.role_changed': 'role_changed',
};

/** Short in-app message (single line, no footer — distinct from email body). */
function formatInAppMessage<T extends AppEventType>(event: AppEventMap[T]): string {
  switch (event.type) {
    case 'join_request.submitted': {
      const p = event.payload as JoinRequestSubmittedPayload;
      return `${p.requester_name || 'Someone'} wants to join "${p.farm_name}".`;
    }
    case 'join_request.approved': {
      const p = event.payload as JoinRequestResolvedPayload;
      return `Your request to join "${p.farm_name}" has been approved.`;
    }
    case 'join_request.rejected': {
      const p = event.payload as JoinRequestResolvedPayload;
      return `Your request to join "${p.farm_name}" was not approved.`;
    }
    case 'member.role_changed': {
      const p = event.payload as MemberRoleChangedPayload;
      return `Your role in "${p.farm_name}" changed from ${p.old_role} to ${p.new_role}.`;
    }
    default:
      return event.type;
  }
}

function initInAppNotificationSubscriptions(): void {
  for (const eventType of USER_NOTIFICATION_EVENT_TYPES) {
    appEvents.on(eventType, (event) => {
      const payload = event.payload as Record<string, unknown>;
      const targetUserId = payload['target_user_id'] as string | undefined;
      if (!targetUserId) return;

      const notifType = EVENT_TO_NOTIF_TYPE[eventType];
      if (!notifType) return;

      const title = USER_EMAIL_SUBJECTS[eventType] ?? eventType;
      const body = formatInAppMessage(event);

      createNotification(targetUserId, {
        type: notifType,
        title,
        body,
        farm_id: payload['farm_id'] as string | undefined,
        farm_name: payload['farm_name'] as string | undefined,
      }).catch((err) => {
        console.error(`[notification] failed to persist ${eventType} in-app notification:`, err);
      });
    });
  }

  console.log('[notification] subscribed to in-app notification persistence');
}

/** Send a bug report email to all admins. Returns success status. */
export async function sendBugReport(
  reporterEmail: string,
  description: string,
  steps: string,
): Promise<boolean> {
  if (!ses || !ENABLED) return false;

  const body = [
    'Bug Report from LitCrop user',
    '',
    `Reporter: ${reporterEmail}`,
    `Time: ${new Date().toISOString()}`,
    '',
    'Description:',
    description,
    '',
    steps ? `Steps to reproduce:\n${steps}` : '',
    '',
    '--',
    'LitCrop Bug Report',
  ].join('\n');

  try {
    await ses.send(
      new SendEmailCommand({
        Source: SES_FROM_EMAIL,
        Destination: { ToAddresses: ADMIN_EMAILS },
        Message: {
          Subject: { Data: `[LitCrop] Bug Report from ${reporterEmail}`, Charset: 'UTF-8' },
          Body: { Text: { Data: body, Charset: 'UTF-8' } },
        },
      }),
    );
    return true;
  } catch (err) {
    console.error('[notification] sendBugReport failed:', err);
    return false;
  }
}

// Initialize subscriptions at module load time
initNotificationSubscriptions();
initUserNotificationSubscriptions();
initInAppNotificationSubscriptions();
