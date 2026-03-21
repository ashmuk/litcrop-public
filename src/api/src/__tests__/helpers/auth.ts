/**
 * Shared authentication test helpers.
 *
 * S2 fix: Path 2 of the auth middleware (test/local-dev) requires the JWT
 * issuer claim to include 'cognito'. All test tokens must carry a
 * Cognito-like issuer to pass Path 2 — tokens without `iss` get 401.
 */

export const TEST_USER_ID = 'test-cognito-sub-001';

/** Cognito-like issuer used in all test tokens. */
export const TEST_ISSUER =
  'https://cognito-idp.ap-northeast-1.amazonaws.com/test-pool';

/**
 * Build a base64url-encoded JWT token (no real signing) with a Cognito issuer.
 * Returns the full token string (header.payload.signature).
 */
export function makeAuthToken(userId: string, email = 'test@example.com'): string {
  const payload = { sub: userId, email, iss: TEST_ISSUER };
  const encoded = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  return `aaa.${encoded}.sig`;
}

/**
 * Build Authorization headers for test requests.
 * Spreads directly into the `headers` object of `app.request()`.
 */
export function makeAuthHeaders(userId: string, email?: string): Record<string, string> {
  return { Authorization: `Bearer ${makeAuthToken(userId, email)}` };
}

/** Pre-built auth headers using the default TEST_USER_ID. */
export function authHeaders(): Record<string, string> {
  return makeAuthHeaders(TEST_USER_ID);
}
