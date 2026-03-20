/**
 * Tests for auth middleware (T-AUTH-01)
 *
 * The middleware has two code paths:
 *   1. Lambda event claims (production path) — set requestContext.authorizer.jwt.claims
 *   2. Bearer token decode (test/local path) — base64url-decode the payload section
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { authMiddleware, getAuthContext } from '../../middleware/auth';

// ── Helpers ───────────────────────────────────────────────────────

/** Build a mock JWT with the given payload (no real signing). */
function mockJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return `${header}.${body}.fakesig`;
}

/** Build a minimal Hono app with the auth middleware and a test route. */
function buildApp() {
  const app = new Hono();
  app.use('*', authMiddleware);
  app.get('/whoami', (c) => {
    const { userId, userEmail } = getAuthContext(c);
    return c.json({ userId, userEmail });
  });
  return app;
}

// ── Tests ──────────────────────────────────────────────────────────

describe('authMiddleware — Bearer token path', () => {
  it('extracts sub and email from a valid JWT', async () => {
    const app = buildApp();
    const token = mockJwt({ sub: 'user-abc', email: 'alice@example.com' });

    const res = await app.request('/whoami', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { userId: string; userEmail: string };
    expect(body.userId).toBe('user-abc');
    expect(body.userEmail).toBe('alice@example.com');
  });

  it('extracts sub when email is missing (email defaults to empty string)', async () => {
    const app = buildApp();
    const token = mockJwt({ sub: 'user-no-email' });

    const res = await app.request('/whoami', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { userId: string; userEmail: string };
    expect(body.userId).toBe('user-no-email');
    expect(body.userEmail).toBe('');
  });

  it('returns 401 when Authorization header is missing', async () => {
    const app = buildApp();
    const res = await app.request('/whoami');
    expect(res.status).toBe(401);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when Authorization is not Bearer scheme', async () => {
    const app = buildApp();
    const res = await app.request('/whoami', {
      headers: { Authorization: 'Basic dXNlcjpwYXNz' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 when Bearer token has wrong number of parts', async () => {
    const app = buildApp();
    const res = await app.request('/whoami', {
      headers: { Authorization: 'Bearer notavalidjwt' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 when token payload is not valid JSON', async () => {
    const app = buildApp();
    // manually construct a token with garbage base64url middle section
    const res = await app.request('/whoami', {
      headers: { Authorization: 'Bearer aaa.!!!.ccc' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 when token payload has no sub claim', async () => {
    const app = buildApp();
    const token = mockJwt({ email: 'nosub@example.com' });

    const res = await app.request('/whoami', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });
});

describe('authMiddleware — Lambda event claims path', () => {
  it('extracts sub and email from Lambda event requestContext', async () => {
    const app = new Hono();
    app.use('*', authMiddleware);
    app.get('/whoami', (c) => {
      const { userId, userEmail } = getAuthContext(c);
      return c.json({ userId, userEmail });
    });

    // Simulate Hono receiving a Lambda event with JWT claims
    // In Hono's Lambda adapter, `c.env.event` is the raw Lambda event
    const mockEvent = {
      requestContext: {
        authorizer: {
          jwt: {
            claims: {
              sub: 'cognito-sub-xyz',
              email: 'lambda-user@example.com',
            },
          },
        },
      },
    };

    // Build a Request with the Lambda event injected into the env
    const req = new Request('http://localhost/whoami');
    const res = await app.fetch(req, { event: mockEvent });

    expect(res.status).toBe(200);
    const body = await res.json() as { userId: string; userEmail: string };
    expect(body.userId).toBe('cognito-sub-xyz');
    expect(body.userEmail).toBe('lambda-user@example.com');
  });

  it('falls back to Bearer token when Lambda claims are absent', async () => {
    const app = buildApp();
    const token = mockJwt({ sub: 'fallback-user', email: 'fallback@example.com' });
    const req = new Request('http://localhost/whoami', {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Pass env without event claims
    const res = await app.fetch(req, {});

    expect(res.status).toBe(200);
    const body = await res.json() as { userId: string; userEmail: string };
    expect(body.userId).toBe('fallback-user');
  });
});
