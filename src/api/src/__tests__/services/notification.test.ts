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
