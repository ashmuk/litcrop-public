/**
 * Email notification service — Wave 2.
 * Subscribes to domain events and sends plain-text emails via AWS SES.
 * Disabled gracefully when SES_FROM_EMAIL or ADMIN_EMAILS are not configured.
 */

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { appEvents, type AppEventType, type AppEventMap } from './events';

// ── Config ──────────────────────────────────────────────────────

const SES_FROM_EMAIL = process.env['SES_FROM_EMAIL'] ?? '';
const SES_REGION = process.env['SES_REGION'] ?? process.env['AWS_REGION'] ?? 'ap-northeast-1';
const ADMIN_EMAILS: string[] = (process.env['ADMIN_EMAILS'] ?? '')
  .split(',')
  .map((e) => e.trim())
  .filter(Boolean);

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

// ── Send helper ─────────────────────────────────────────────────

async function sendToAdmins(
  subject: string,
  body: string,
  eventType: AppEventType,
): Promise<void> {
  if (!ses) return;

  // TODO (Beta-4 implementation): Load per-admin preferences from DynamoDB
  // and filter ADMIN_EMAILS by opt-in status for this eventType.
  // For now, send to all admins.
  const recipients = ADMIN_EMAILS;
  if (recipients.length === 0) return;

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
    console.log(`[notification] sent ${eventType} email to ${recipients.length} admin(s)`);
  } catch (err) {
    // Fire-and-forget: log error but never throw
    console.error(`[notification] failed to send ${eventType} email:`, err);
  }
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

// Initialize subscriptions at module load time
initNotificationSubscriptions();
