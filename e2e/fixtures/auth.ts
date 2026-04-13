/**
 * LitCrop E2E Auth Fixtures
 *
 * Provides two Playwright fixtures:
 *   - authenticatedPage  A Page with Cognito + API calls intercepted and
 *                        localStorage pre-seeded with auth state.
 *   - mockApi            Helper object for registering per-test API stubs.
 *
 * Auth model (mirrors src/frontend/src/lib/auth.ts):
 *   - Cognito endpoint  POST https://cognito-idp.*.amazonaws.com/
 *                       with X-Amz-Target header
 *   - IdToken used as   Authorization: Bearer <idToken>
 *   - localStorage keys litcrop_refresh_token, litcrop_user_email,
 *                       litcrop_user_sub
 */

import { test as base, expect, type Page, type Route } from '@playwright/test';

// ── Constants ──────────────────────────────────────────────────────

const TEST_USER_SUB = 'test-user-sub-123';
const TEST_USER_EMAIL = 'test@litcrop.com';
const MOCK_REFRESH_TOKEN = 'mock-refresh-token-e2e';

/**
 * Build a minimal but structurally valid JWT (3 dot-separated base64url
 * segments).  The payload carries the claims the auth service parses.
 */
function buildMockJwt(payload: Record<string, unknown>): string {
  const header = { alg: 'RS256', typ: 'JWT' };
  const b64 = (obj: unknown): string =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  // Signature segment is a stub — tests never verify the sig
  return `${b64(header)}.${b64(payload)}.mock-signature`;
}

const MOCK_ID_TOKEN = buildMockJwt({
  sub: TEST_USER_SUB,
  email: TEST_USER_EMAIL,
  aud: 'test-client-id',
  iss: 'https://cognito-idp.ap-northeast-1.amazonaws.com/ap-northeast-1_TESTPOOL',
  token_use: 'id',
  // Expires 1 hour from a fixed future time so isAuthenticated() stays true
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
});

const MOCK_ACCESS_TOKEN = buildMockJwt({
  sub: TEST_USER_SUB,
  token_use: 'access',
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
});

/** Response body for InitiateAuth (sign-in or refresh). */
const COGNITO_AUTH_RESULT = {
  AuthenticationResult: {
    AccessToken: MOCK_ACCESS_TOKEN,
    IdToken: MOCK_ID_TOKEN,
    RefreshToken: MOCK_REFRESH_TOKEN,
    ExpiresIn: 3600,
    TokenType: 'Bearer',
  },
};

// ── MockApi type ───────────────────────────────────────────────────

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface MockApi {
  onGet(path: string, response: unknown, status?: number): Promise<void>;
  onPost(path: string, response: unknown, status?: number): Promise<void>;
  onPatch(path: string, response: unknown, status?: number): Promise<void>;
  onDelete(path: string, response: unknown, status?: number): Promise<void>;
}

// ── Fixture types ──────────────────────────────────────────────────

type LitCropFixtures = {
  authenticatedPage: Page;
  mockApi: MockApi;
};

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Seed the three localStorage keys that auth.ts reads on startup so
 * isAuthenticated() returns true before any navigation.
 */
async function seedAuthStorage(page: Page): Promise<void> {
  await page.addInitScript(
    ([sub, email, refresh]) => {
      localStorage.setItem('litcrop_refresh_token', refresh);
      localStorage.setItem('litcrop_user_email', email);
      localStorage.setItem('litcrop_user_sub', sub);
    },
    [TEST_USER_SUB, TEST_USER_EMAIL, MOCK_REFRESH_TOKEN] as [string, string, string],
  );
}

/**
 * Register a route handler that intercepts all Cognito JSON API calls and
 * returns mock authentication results regardless of which action is targeted
 * (InitiateAuth for sign-in, REFRESH_TOKEN_AUTH, etc.).
 */
async function interceptCognito(page: Page): Promise<void> {
  await page.route(/cognito-idp\.[^.]+\.amazonaws\.com/, (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/x-amz-json-1.1',
      body: JSON.stringify(COGNITO_AUTH_RESULT),
    });
  });
}

/**
 * Build a MockApi bound to the given page.  Each method registers a
 * Playwright route that matches the exact HTTP method and path under
 * /api/v1/ and fulfills it with the provided JSON body.
 *
 * Later calls for the same path+method override earlier ones because
 * Playwright applies routes in reverse registration order.
 */
function buildMockApi(page: Page): MockApi {
  async function register(
    method: HttpMethod,
    path: string,
    response: unknown,
    status = 200,
  ): Promise<void> {
    // Normalize — strip a leading slash if the caller included one
    const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
    const urlPattern = `**/api/v1/${normalizedPath}`;

    await page.route(urlPattern, (route: Route) => {
      if (route.request().method() !== method) {
        // Pass through requests for other methods on the same URL
        route.fallback();
        return;
      }
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(response),
      });
    });
  }

  return {
    onGet: (path, response, status?) => register('GET', path, response, status),
    onPost: (path, response, status?) => register('POST', path, response, status),
    onPatch: (path, response, status?) => register('PATCH', path, response, status),
    onDelete: (path, response, status?) => register('DELETE', path, response, status),
  };
}

// ── Extended test ──────────────────────────────────────────────────

export const test = base.extend<LitCropFixtures>({
  /**
   * A Page that has:
   *  1. localStorage pre-seeded with auth tokens (via addInitScript so it
   *     runs before the first page script).
   *  2. All Cognito requests intercepted and answered with mock tokens.
   *  3. A catch-all /api/v1/** route that returns 404 for unregistered
   *     paths (prevents accidental real network calls in tests).
   */
   
  authenticatedPage: async ({ page }, use) => {
    // 1. Seed localStorage before any navigation
    await seedAuthStorage(page);

    // 2. Intercept Cognito
    await interceptCognito(page);

    // 3. Catch-all fallback for unregistered API routes — returns a clear
    //    404 so tests fail loudly rather than hanging on network calls.
    await page.route('**/api/v1/**', (route: Route) => {
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'E2E_UNREGISTERED_ROUTE',
            message: `No mockApi stub registered for ${route.request().method()} ${route.request().url()}`,
          },
        }),
      });
    });

    await use(page);
  },

  /**
   * A MockApi helper scoped to the current test's page.  Register stubs
   * before navigating so routes are in place when the page loads.
   */
  mockApi: async ({ authenticatedPage }, use) => {
    const api = buildMockApi(authenticatedPage);
    await use(api);
  },
});

export { expect };

// Re-export token constants so individual tests can assert on auth headers
// without duplicating the values.
export { MOCK_ID_TOKEN, MOCK_ACCESS_TOKEN, MOCK_REFRESH_TOKEN };
