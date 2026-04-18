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

// ── deleteCurrentUser — unit tests with mocked fetch ──────────────

describe('deleteCurrentUser', () => {
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
    const { deleteCurrentUser, CognitoError } = await import('../lib/auth');
    const err = await deleteCurrentUser().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CognitoError);
    expect(err).toMatchObject({ code: 'NotAuthenticated' });
  });

  it('resolves successfully after sign-in when DeleteUser call succeeds', async () => {
    await signInForTest();
    vi.stubGlobal('fetch', makeFetch(200, {}));
    const { deleteCurrentUser } = await import('../lib/auth');
    await expect(deleteCurrentUser()).resolves.toBeUndefined();
  });
});

// ── signUp — passes custom:display_name when provided ────────────

describe('signUp custom:display_name attribute', () => {
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
  });

  /**
   * Capture the request body sent to the mocked Cognito endpoint so
   * each test can assert the exact UserAttributes payload.
   */
  function mockCognitoCapture(status: number, body: object) {
    const calls: Array<{ url: string; init: { body?: string } }> = [];
    const fn = vi.fn().mockImplementation((url: string, init: { body?: string }) => {
      calls.push({ url, init });
      return Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(body),
      });
    });
    vi.stubGlobal('fetch', fn);
    return calls;
  }

  /** Extract the UserAttributes array from the first captured SignUp request. */
  function sentAttrs(calls: Array<{ init: { body?: string } }>): Array<{ Name: string; Value: string }> {
    const sent = JSON.parse(calls[0].init.body ?? '{}') as { UserAttributes: Array<{ Name: string; Value: string }> };
    return sent.UserAttributes;
  }

  it('omits custom:display_name when displayName is not provided', async () => {
    const calls = mockCognitoCapture(200, { UserSub: 'new-sub', UserConfirmed: false });
    const { signUp } = await import('../lib/auth');
    await signUp('alice@example.com', 'Password1!');

    expect(calls).toHaveLength(1);
    const names = sentAttrs(calls).map((a) => a.Name);
    expect(names).toContain('email');
    expect(names).not.toContain('custom:display_name');
  });

  it('includes custom:display_name when a non-empty name is provided', async () => {
    const calls = mockCognitoCapture(200, { UserSub: 'new-sub', UserConfirmed: false });
    const { signUp } = await import('../lib/auth');
    await signUp('bob@example.com', 'Password1!', 'Bob Smith');

    const displayAttr = sentAttrs(calls).find((a) => a.Name === 'custom:display_name');
    expect(displayAttr?.Value).toBe('Bob Smith');
  });

  it('omits custom:display_name when displayName is only whitespace', async () => {
    const calls = mockCognitoCapture(200, { UserSub: 'new-sub', UserConfirmed: false });
    const { signUp } = await import('../lib/auth');
    await signUp('carol@example.com', 'Password1!', '   ');

    const names = sentAttrs(calls).map((a) => a.Name);
    expect(names).not.toContain('custom:display_name');
  });

  it('trims whitespace around a valid displayName', async () => {
    const calls = mockCognitoCapture(200, { UserSub: 'new-sub', UserConfirmed: false });
    const { signUp } = await import('../lib/auth');
    await signUp('dan@example.com', 'Password1!', '  Dan  ');

    const displayAttr = sentAttrs(calls).find((a) => a.Name === 'custom:display_name');
    expect(displayAttr?.Value).toBe('Dan');
  });

  // ── C2: edge-case values for custom:display_name ──────────────────
  //
  // The frontend signUp must pass the (trimmed) value through verbatim to
  // Cognito.  Cognito's own maxLen=100 / character-class validation happens
  // server-side on SignUp — we only assert that the client-side trim is
  // applied and nothing else is mangled (no truncation, no escaping beyond
  // what JSON.stringify already does for transport).

  const ONE_HUNDRED_A = 'a'.repeat(100);
  const ONE_HUNDRED_ONE_A = 'a'.repeat(101);

  it.each([
    // [label, input, expected Value sent in UserAttributes]
    ['Japanese kanji (multi-byte)', '田中太郎', '田中太郎'],
    ['emoji with skin-tone modifier', '🌾👨‍🌾', '🌾👨‍🌾'],
    ['exact 100-char boundary',      ONE_HUNDRED_A, ONE_HUNDRED_A],
    ['101-char over-boundary passes through (Cognito rejects server-side)', ONE_HUNDRED_ONE_A, ONE_HUNDRED_ONE_A],
    ['leading + trailing whitespace only trimmed at edges', '  Hello World  ', 'Hello World'],
    ['internal whitespace preserved', 'Alice  Bob', 'Alice  Bob'],
    ['mixed quotes and backslashes preserved (JSON.stringify handles transport)', 'Alice "the" \\best/', 'Alice "the" \\best/'],
    ['apostrophe (typical user name)', "O'Brien", "O'Brien"],
    ['hyphen + accent (Latin-1)', 'Renée-Léa', 'Renée-Léa'],
    ['mixed script (Japanese + Latin + digits)', '佐藤 Alice 42', '佐藤 Alice 42'],
    // Pass-through contract: frontend does NOT sanitize these; Cognito's
    // server-side allowed-char validation is expected to reject them.
    // These tests document the boundary so future "defensive strip" refactors
    // surface as test failures and get an explicit review.
    ['null-byte inside the string is forwarded as-is (pass-through contract)', 'Alice\x00Bob', 'Alice\x00Bob'],
    ['RTL override mark is forwarded as-is (pass-through contract)', '\u202EAlice', '\u202EAlice'],
  ])('passes %s verbatim after edge-trimming', async (_label, input, expected) => {
    const calls = mockCognitoCapture(200, { UserSub: 'edge-sub', UserConfirmed: false });
    const { signUp } = await import('../lib/auth');
    await signUp('edge@example.com', 'Password1!', input);

    const displayAttr = sentAttrs(calls).find((a) => a.Name === 'custom:display_name');
    expect(displayAttr?.Value).toBe(expected);
  });

  it('omits custom:display_name when the input is only a single whitespace char', async () => {
    const calls = mockCognitoCapture(200, { UserSub: 's', UserConfirmed: false });
    const { signUp } = await import('../lib/auth');
    await signUp('ws@example.com', 'Password1!', '\t');

    const names = sentAttrs(calls).map((a) => a.Name);
    expect(names).not.toContain('custom:display_name');
  });

  it('omits custom:display_name when the input is only newlines', async () => {
    const calls = mockCognitoCapture(200, { UserSub: 's', UserConfirmed: false });
    const { signUp } = await import('../lib/auth');
    await signUp('nl@example.com', 'Password1!', '\n\n\n');

    const names = sentAttrs(calls).map((a) => a.Name);
    expect(names).not.toContain('custom:display_name');
  });
});
