import { describe, it, expect, vi } from 'vitest';
import { appEvents, type AppEventMap } from '../../services/events';

// Helper to build a minimal typed event
function makeSignupEvent(overrides?: Partial<AppEventMap['user.signup']>): AppEventMap['user.signup'] {
  return {
    type: 'user.signup',
    timestamp: '2026-04-01T00:00:00.000Z',
    actor_id: 'user-001',
    actor_email: 'actor@example.com',
    payload: { user_id: 'user-001', display_name: 'Alice', email: 'alice@example.com' },
    ...overrides,
  };
}

function makeFarmCreatedEvent(): AppEventMap['farm.created'] {
  return {
    type: 'farm.created',
    timestamp: '2026-04-01T00:00:00.000Z',
    actor_id: 'user-001',
    actor_email: 'actor@example.com',
    payload: { farm_id: 'farm-001', farm_name: 'Test Farm' },
  };
}

describe('TypedEventEmitter', () => {
  // Clean up listeners after each test by re-importing or using off()
  // We test via the exported singleton.

  it('emit with no listeners does not throw', () => {
    // No listener registered for this particular emit
    expect(() => appEvents.emit('farm.deleted', {
      type: 'farm.deleted',
      timestamp: '2026-04-01T00:00:00.000Z',
      actor_id: 'user-001',
      actor_email: '',
      payload: { farm_id: 'farm-001', farm_name: 'Test Farm' },
    })).not.toThrow();
  });

  it('emit fires registered listener with correct event', async () => {
    const listener = vi.fn();
    const event = makeSignupEvent();

    appEvents.on('user.signup', listener);

    appEvents.emit('user.signup', event);

    // Fire-and-forget: let microtasks drain
    await new Promise((r) => setTimeout(r, 10));

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(event);

    appEvents.off('user.signup', listener);
  });

  it('emit fires multiple listeners for the same event type', async () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    const event = makeFarmCreatedEvent();

    appEvents.on('farm.created', listener1);
    appEvents.on('farm.created', listener2);

    appEvents.emit('farm.created', event);
    await new Promise((r) => setTimeout(r, 10));

    expect(listener1).toHaveBeenCalledOnce();
    expect(listener2).toHaveBeenCalledOnce();

    appEvents.off('farm.created', listener1);
    appEvents.off('farm.created', listener2);
  });

  it('off removes listener — unsubscribed listener is not called', async () => {
    const listener = vi.fn();
    const event = makeSignupEvent();

    appEvents.on('user.signup', listener);
    appEvents.off('user.signup', listener);

    appEvents.emit('user.signup', event);
    await new Promise((r) => setTimeout(r, 10));

    expect(listener).not.toHaveBeenCalled();
  });

  it('throwing listener does not prevent other listeners from running', async () => {
    const throwingListener = vi.fn().mockImplementation(() => {
      throw new Error('listener boom');
    });
    const goodListener = vi.fn();
    const event = makeFarmCreatedEvent();

    appEvents.on('farm.created', throwingListener);
    appEvents.on('farm.created', goodListener);

    // Should not throw synchronously
    expect(() => appEvents.emit('farm.created', event)).not.toThrow();

    await new Promise((r) => setTimeout(r, 20));

    expect(throwingListener).toHaveBeenCalledOnce();
    expect(goodListener).toHaveBeenCalledOnce();

    appEvents.off('farm.created', throwingListener);
    appEvents.off('farm.created', goodListener);
  });

  it('async listener error is caught and does not propagate', async () => {
    const asyncThrowingListener = vi.fn().mockImplementation(async () => {
      throw new Error('async boom');
    });
    const event = makeFarmCreatedEvent();

    appEvents.on('farm.created', asyncThrowingListener);

    expect(() => appEvents.emit('farm.created', event)).not.toThrow();

    await new Promise((r) => setTimeout(r, 20));

    expect(asyncThrowingListener).toHaveBeenCalledOnce();

    appEvents.off('farm.created', asyncThrowingListener);
  });

  it('emit fires listeners for different event types independently', async () => {
    const signupListener = vi.fn();
    const farmListener = vi.fn();

    appEvents.on('user.signup', signupListener);
    appEvents.on('farm.created', farmListener);

    appEvents.emit('user.signup', makeSignupEvent());
    await new Promise((r) => setTimeout(r, 10));

    expect(signupListener).toHaveBeenCalledOnce();
    expect(farmListener).not.toHaveBeenCalled();

    appEvents.off('user.signup', signupListener);
    appEvents.off('farm.created', farmListener);
  });
});
