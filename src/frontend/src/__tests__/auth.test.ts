/**
 * Tests for auth.ts — changePassword, getCognitoAccessToken, and
 * PasswordStrengthIndicator pure helpers (checkPassword / strengthScore).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkPassword, strengthScore } from '../components/PasswordStrengthIndicator';

// ── checkPassword / strengthScore (pure functions — static import) ───

describe('checkPassword', () => {
  it('returns all false for empty string', () => {
    expect(checkPassword('')).toEqual({ length: false, uppercase: false, lowercase: false, number: false });
  });

  it('detects length >= 8', () => {
    expect(checkPassword('abcdefgh').length).toBe(true);
    expect(checkPassword('abcdefg').length).toBe(false);
  });

  it('detects uppercase letter', () => {
    expect(checkPassword('ABC').uppercase).toBe(true);
    expect(checkPassword('abc').uppercase).toBe(false);
  });

  it('detects lowercase letter', () => {
    expect(checkPassword('abc').lowercase).toBe(true);
    expect(checkPassword('ABC').lowercase).toBe(false);
  });

  it('detects number', () => {
    expect(checkPassword('1').number).toBe(true);
    expect(checkPassword('abc').number).toBe(false);
  });
});

describe('strengthScore', () => {
  it('returns 0 for empty password', () => {
    expect(strengthScore(checkPassword(''))).toBe(0);
  });

  it('returns 4 for a fully qualifying password', () => {
    expect(strengthScore(checkPassword('Abcdefg1'))).toBe(4);
  });

  it('returns 2 for lowercase-only long password', () => {
    expect(strengthScore(checkPassword('abcdefgh'))).toBe(2);
  });

  it('returns 1 for short uppercase-only string', () => {
    expect(strengthScore(checkPassword('A'))).toBe(1);
  });
});

// ── changePassword — unit tests with mocked fetch ─────────────────

const AUTH_RESULT_FIXTURE = {
  AuthenticationResult: {
    AccessToken: 'access-token-123',
    IdToken: `header.${btoa(JSON.stringify({ sub: 'user-abc' }))}.sig`,
    RefreshToken: 'refresh-token-xyz',
    ExpiresIn: 3600,
  },
};

function makeFetch(status: number, body: object) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

describe('changePassword', () => {
  const storageStore: Record<string, string> = {};
  const localStorageMock = {
    getItem: (k: string) => storageStore[k] ?? null,
    setItem: (k: string, v: string) => { storageStore[k] = v; },
    removeItem: (k: string) => { delete storageStore[k]; },
  };

  beforeEach(() => {
    vi.resetModules();
    Object.keys(storageStore).forEach((k) => delete storageStore[k]);
    vi.stubGlobal('localStorage', localStorageMock);
    vi.stubGlobal('window', { dispatchEvent: vi.fn() });
    vi.stubGlobal('fetch', undefined);
  });

  async function signInForTest() {
    vi.stubGlobal('fetch', makeFetch(200, AUTH_RESULT_FIXTURE));
    const { signIn } = await import('../lib/auth');
    await signIn('user@example.com', 'OldPass1!');
  }

  it('throws CognitoError with NotAuthenticated when no session exists', async () => {
    const { changePassword, CognitoError } = await import('../lib/auth');
    const err = await changePassword('old', 'new').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CognitoError);
    expect(err).toMatchObject({ code: 'NotAuthenticated' });
  });

  it('resolves when ChangePassword call succeeds', async () => {
    await signInForTest();
    vi.stubGlobal('fetch', makeFetch(200, {}));
    const { changePassword } = await import('../lib/auth');
    await expect(changePassword('OldPass1!', 'NewPass2@')).resolves.toBeUndefined();
  });

  it('throws NotAuthorizedException on wrong current password', async () => {
    await signInForTest();
    vi.stubGlobal('fetch', makeFetch(400, {
      __type: 'NotAuthorizedException',
      message: 'Incorrect username or password.',
    }));
    const { changePassword, CognitoError } = await import('../lib/auth');
    const err = await changePassword('WrongOld!', 'NewPass2@').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CognitoError);
    expect(err).toMatchObject({ code: 'NotAuthorizedException' });
  });

  it('throws LimitExceededException on rate limit', async () => {
    await signInForTest();
    vi.stubGlobal('fetch', makeFetch(400, {
      __type: 'LimitExceededException',
      message: 'Attempt limit exceeded.',
    }));
    const { changePassword, CognitoError } = await import('../lib/auth');
    const err = await changePassword('OldPass1!', 'NewPass2@').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CognitoError);
    expect(err).toMatchObject({ code: 'LimitExceededException' });
  });

  it('getCognitoAccessToken returns null before sign-in', async () => {
    const { getCognitoAccessToken } = await import('../lib/auth');
    expect(getCognitoAccessToken()).toBeNull();
  });

  it('getCognitoAccessToken returns the access token after sign-in', async () => {
    vi.stubGlobal('fetch', makeFetch(200, {
      ...AUTH_RESULT_FIXTURE,
      AuthenticationResult: { ...AUTH_RESULT_FIXTURE.AuthenticationResult, AccessToken: 'my-cognito-access-token' },
    }));
    const { signIn, getCognitoAccessToken } = await import('../lib/auth');
    await signIn('user@example.com', 'OldPass1!');
    expect(getCognitoAccessToken()).toBe('my-cognito-access-token');
  });
});
