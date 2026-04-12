/**
 * Authentication middleware — Phase 1 (T-AUTH-01)
 *
 * Extracts userId (Cognito sub) and userEmail from the request:
 *   1. Production path: reads JWT claims injected by API Gateway JWT Authorizer
 *      via c.env.event.requestContext.authorizer.jwt.claims
 *   2. Test / local-dev path: base64url-decodes the Bearer token payload
 *      (no signature verification — the gateway handles that in production)
 *
 * Sets context variables:
 *   - userId    — Cognito sub (unique across accounts)
 *   - userEmail — Cognito email claim (may be empty in test tokens)
 */

import type { Context, MiddlewareHandler } from 'hono';

// ── Types ─────────────────────────────────────────────────────────

interface LambdaEvent {
  requestContext?: {
    authorizer?: {
      jwt?: {
        claims?: Record<string, unknown>;
      };
    };
  };
}

export interface AuthContext {
  userId: string;
  userEmail: string;
  /** True when userEmail appears in the ADMIN_EMAILS env var (comma-separated). */
  isAdmin: boolean;
}

// ── Context accessor ─────────────────────────────────────────────

/**
 * Read auth context from Hono context variables set by authMiddleware.
 * Uses `as never` to avoid threading generic type params through all routes.
 */
import { ADMIN_EMAILS_SET } from '../config';

export function getAuthContext(c: Context): AuthContext {
  const userEmail = c.get('userEmail' as never) as string;
  return {
    userId: c.get('userId' as never) as string,
    userEmail,
    isAdmin: userEmail.length > 0 && ADMIN_EMAILS_SET.has(userEmail.toLowerCase()),
  };
}

// ── Middleware ────────────────────────────────────────────────────

/**
 * Hono middleware that populates userId/userEmail from JWT claims.
 * Must be mounted AFTER the CORS and logger middleware.
 */
export const authMiddleware: MiddlewareHandler = async (c, next) => {
  // Path 1: Lambda event context (production — API Gateway JWT Authorizer)
  const event = (c.env as Record<string, unknown> | undefined)?.['event'] as LambdaEvent | undefined;
  const claims = event?.requestContext?.authorizer?.jwt?.claims;

  if (claims?.['sub']) {
    c.set('userId' as never, claims['sub'] as string);
    c.set('userEmail' as never, (claims['email'] ?? '') as string);
    await next();
    return;
  }

  // Path 2: Decode Bearer token payload (test / local dev — no sig verification)
  // S1: Disallowed in production — Path 1 must have succeeded above.
  if (process.env['NODE_ENV'] === 'production') {
    return c.json(
      { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      401,
    );
  }

  const authHeader = c.req.header('Authorization') ?? '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const parts = token.split('.');
    if (parts.length === 3) {
      try {
        // base64url → base64 → JSON
        const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(atob(b64)) as Record<string, unknown>;
        // S2: Basic issuer + subject validation
        const iss = typeof payload['iss'] === 'string' ? payload['iss'] : '';
        const sub = typeof payload['sub'] === 'string' ? payload['sub'] : '';
        if (iss.toLowerCase().includes('cognito') && sub.length > 0) {
          console.warn('[auth] WARNING: Using unverified JWT decode (Path 2) — development only');
          c.set('userId' as never, sub);
          c.set('userEmail' as never, (payload['email'] as string | undefined) ?? '');
          await next();
          return;
        }
      } catch {
        // malformed token — fall through to 401
      }
    }
  }

  return c.json(
    { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
    401,
  );
};
