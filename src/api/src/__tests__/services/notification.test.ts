import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock @aws-sdk/client-ses ─────────────────────────────────────
// Use vi.hoisted so mockSend is available inside vi.mock factory (hoisted before imports)
const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));

vi.mock('@aws-sdk/client-ses', () => {
  class MockSESClient {
    send(cmd: unknown) { return mockSend(cmd); }
  }
  class MockSendEmailCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  return {
    SESClient: MockSESClient,
    SendEmailCommand: MockSendEmailCommand,
  };
});

// ── Set env vars before importing notification service ───────────
vi.hoisted(() => {
  process.env['SES_FROM_EMAIL'] = 'from@litcrop.test';
  process.env['ADMIN_EMAILS'] = 'admin@litcrop.test';
  process.env['AWS_REGION'] = 'ap-northeast-1';
});

// Import after mocks are set up
import { appEvents } from '../../services/events';
// Import notification to register subscriptions
import '../../services/notification';

function makeEvent<T extends string>(type: T, payload: unknown) {
  return {
    type,
    timestamp: '2026-04-01T00:00:00.000Z',
    actor_id: 'user-001',
    actor_email: 'actor@litcrop.test',
    payload,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper builds partial events
  } as any;
}

describe('notification service', () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockSend.mockResolvedValue({});
  });

  it('sends email when user.signup is emitted', async () => {
    appEvents.emit('user.signup', makeEvent('user.signup', {
      user_id: 'user-001',
      display_name: 'Alice',
      email: 'alice@litcrop.test',
    }));
    await new Promise((r) => setTimeout(r, 50));

    expect(mockSend).toHaveBeenCalledOnce();
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.Source).toBe('from@litcrop.test');
    expect(cmd.input.Destination.ToAddresses).toContain('admin@litcrop.test');
    expect(cmd.input.Message.Subject.Data).toBe('[LitCrop] New user registered');
    expect(cmd.input.Message.Body.Text.Data).toContain('Alice');
  });

  it('sends email when farm.created is emitted', async () => {
    appEvents.emit('farm.created', makeEvent('farm.created', {
      farm_id: 'farm-001',
      farm_name: 'Green Acres',
    }));
    await new Promise((r) => setTimeout(r, 50));

    expect(mockSend).toHaveBeenCalledOnce();
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.Message.Subject.Data).toBe('[LitCrop] New farm created');
    expect(cmd.input.Message.Body.Text.Data).toContain('Green Acres');
  });

  it('sends email when farm.deleted is emitted', async () => {
    appEvents.emit('farm.deleted', makeEvent('farm.deleted', {
      farm_id: 'farm-001',
      farm_name: 'Old Farm',
    }));
    await new Promise((r) => setTimeout(r, 50));

    expect(mockSend).toHaveBeenCalledOnce();
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.Message.Subject.Data).toBe('[LitCrop] Farm deleted');
  });

  it('sends email when join_request.submitted is emitted', async () => {
    appEvents.emit('join_request.submitted', makeEvent('join_request.submitted', {
      farm_id: 'farm-001',
      farm_name: 'Test Farm',
      requester_name: 'Bob',
    }));
    await new Promise((r) => setTimeout(r, 50));

    expect(mockSend).toHaveBeenCalledOnce();
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.Message.Subject.Data).toBe('[LitCrop] New join request');
    expect(cmd.input.Message.Body.Text.Data).toContain('Bob');
  });

  it('sends email when join_request.approved is emitted', async () => {
    appEvents.emit('join_request.approved', makeEvent('join_request.approved', {
      farm_id: 'farm-001',
      farm_name: 'Test Farm',
      target_user_id: 'user-002',
      target_user_name: 'Charlie',
    }));
    await new Promise((r) => setTimeout(r, 50));

    expect(mockSend).toHaveBeenCalledOnce();
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.Message.Subject.Data).toBe('[LitCrop] Join request approved');
  });

  it('sends email when join_request.rejected is emitted', async () => {
    appEvents.emit('join_request.rejected', makeEvent('join_request.rejected', {
      farm_id: 'farm-001',
      farm_name: 'Test Farm',
      target_user_id: 'user-002',
      target_user_name: 'Dave',
    }));
    await new Promise((r) => setTimeout(r, 50));

    expect(mockSend).toHaveBeenCalledOnce();
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.Message.Subject.Data).toBe('[LitCrop] Join request rejected');
  });

  it('sends email when account.deleted is emitted', async () => {
    appEvents.emit('account.deleted', makeEvent('account.deleted', {
      user_id: 'user-001',
      display_name: 'Eve',
      email: 'eve@litcrop.test',
    }));
    await new Promise((r) => setTimeout(r, 50));

    expect(mockSend).toHaveBeenCalledOnce();
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.Message.Subject.Data).toBe('[LitCrop] User account deleted');
    expect(cmd.input.Message.Body.Text.Data).toContain('Eve');
  });

  it('email body includes actor email and timestamp', async () => {
    appEvents.emit('farm.created', makeEvent('farm.created', {
      farm_id: 'farm-001',
      farm_name: 'Test Farm',
    }));
    await new Promise((r) => setTimeout(r, 50));

    const cmd = mockSend.mock.calls[0][0];
    const body: string = cmd.input.Message.Body.Text.Data;
    expect(body).toContain('actor@litcrop.test');
    expect(body).toContain('2026-04-01T00:00:00.000Z');
    expect(body).toContain('LitCrop Admin Notification');
  });

  it('SES send failure does not throw or reject', async () => {
    mockSend.mockRejectedValue(new Error('SES error'));

    // Should not throw
    expect(() => appEvents.emit('farm.created', makeEvent('farm.created', {
      farm_id: 'farm-001',
      farm_name: 'Test Farm',
    }))).not.toThrow();

    // Wait for async handlers
    await new Promise((r) => setTimeout(r, 50));
    // Just verifying no unhandled rejections — mockSend was called
    expect(mockSend).toHaveBeenCalledOnce();
  });

  it('Wave 3 events (farm.updated) do not send email', async () => {
    appEvents.emit('farm.updated', {
      type: 'farm.updated',
      timestamp: '2026-04-01T00:00:00.000Z',
      actor_id: 'user-001',
      actor_email: 'actor@litcrop.test',
      payload: { farm_id: 'farm-001', farm_name: 'Test Farm' },
    });
    await new Promise((r) => setTimeout(r, 50));

    expect(mockSend).not.toHaveBeenCalled();
  });
});

// ── User-facing email notifications (#391) ─────────────────────

describe('user-facing notifications (#391)', () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockSend.mockResolvedValue({});
  });

  it('sends user email on join_request.approved with target_user_email', async () => {
    appEvents.emit('join_request.approved', makeEvent('join_request.approved', {
      farm_id: 'farm-001',
      farm_name: 'Green Acres',
      target_user_id: 'user-002',
      target_user_name: 'Bob',
      target_user_email: 'bob@example.com',
    }));
    await new Promise((r) => setTimeout(r, 50));

    // 2 calls: admin email + user email
    expect(mockSend).toHaveBeenCalledTimes(2);
    const userCmd = mockSend.mock.calls[1][0];
    expect(userCmd.input.Destination.ToAddresses).toEqual(['bob@example.com']);
    expect(userCmd.input.Message.Subject.Data).toBe("[LitCrop] You've been accepted!");
    expect(userCmd.input.Message.Body.Text.Data).toContain('Green Acres');
    expect(userCmd.input.Message.Body.Text.Data).toContain('approved');
  });

  it('sends user email on join_request.rejected with target_user_email', async () => {
    appEvents.emit('join_request.rejected', makeEvent('join_request.rejected', {
      farm_id: 'farm-001',
      farm_name: 'Green Acres',
      target_user_id: 'user-002',
      target_user_name: 'Carol',
      target_user_email: 'carol@example.com',
    }));
    await new Promise((r) => setTimeout(r, 50));

    expect(mockSend).toHaveBeenCalledTimes(2);
    const userCmd = mockSend.mock.calls[1][0];
    expect(userCmd.input.Destination.ToAddresses).toEqual(['carol@example.com']);
    expect(userCmd.input.Message.Subject.Data).toBe('[LitCrop] Join request update');
    expect(userCmd.input.Message.Body.Text.Data).toContain('not approved');
  });

  it('sends user email on member.role_changed with target_user_email', async () => {
    appEvents.emit('member.role_changed', makeEvent('member.role_changed', {
      farm_id: 'farm-001',
      farm_name: 'Green Acres',
      target_user_id: 'user-002',
      target_user_name: 'Dave',
      target_user_email: 'dave@example.com',
      old_role: 'staff',
      new_role: 'owner',
    }));
    await new Promise((r) => setTimeout(r, 50));

    // Only user email — member.role_changed is not in admin NOTIFICATION_EVENT_TYPES
    expect(mockSend).toHaveBeenCalledOnce();
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.Destination.ToAddresses).toEqual(['dave@example.com']);
    expect(cmd.input.Message.Subject.Data).toBe('[LitCrop] Your role has been updated');
    expect(cmd.input.Message.Body.Text.Data).toContain('staff');
    expect(cmd.input.Message.Body.Text.Data).toContain('owner');
    expect(cmd.input.Message.Body.Text.Data).toContain('manage members');
  });

  it('skips user email when target_user_email is missing', async () => {
    appEvents.emit('join_request.approved', makeEvent('join_request.approved', {
      farm_id: 'farm-001',
      farm_name: 'Test Farm',
      target_user_id: 'user-002',
      target_user_name: 'Eve',
      // no target_user_email
    }));
    await new Promise((r) => setTimeout(r, 50));

    // Only admin email — user email skipped
    expect(mockSend).toHaveBeenCalledOnce();
    expect(mockSend.mock.calls[0][0].input.Destination.ToAddresses).toContain('admin@litcrop.test');
  });

  it('user email SES failure does not throw', async () => {
    // First call (admin) succeeds, second call (user) fails
    mockSend.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('SES sandbox'));

    expect(() => appEvents.emit('join_request.approved', makeEvent('join_request.approved', {
      farm_id: 'farm-001',
      farm_name: 'Test Farm',
      target_user_id: 'user-002',
      target_user_name: 'Frank',
      target_user_email: 'unverified@example.com',
    }))).not.toThrow();

    await new Promise((r) => setTimeout(r, 50));
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('role change to staff shows generic permissions message', async () => {
    appEvents.emit('member.role_changed', makeEvent('member.role_changed', {
      farm_id: 'farm-001',
      farm_name: 'Green Acres',
      target_user_id: 'user-002',
      target_user_name: 'Grace',
      target_user_email: 'grace@example.com',
      old_role: 'owner',
      new_role: 'staff',
    }));
    await new Promise((r) => setTimeout(r, 50));

    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.Message.Body.Text.Data).toContain('permissions have been updated');
    expect(cmd.input.Message.Body.Text.Data).not.toContain('manage members');
  });
});
