/**
 * LitCrop Auth Service — T-FE-AUTH-01 + T-FE-AUTH-02
 *
 * Thin wrapper around the Cognito User Pools JSON API.
 * No SDK dependency — direct HTTP calls to the Cognito endpoint.
 *
 * Token storage:
 *   Access token  → module-level variable (in-memory, cleared on reload)
 *   Refresh token → localStorage key 'litcrop_refresh_token' (persistent)
 *
 * Auto-refresh: if the access token expires within 5 minutes,
 * getAccessToken() automatically exchanges the refresh token.
 */

// ── Cognito config (Vite PUBLIC_ env vars) ─────────────────────────
const REGION =
  (import.meta as { env?: Record<string, string> }).env?.PUBLIC_COGNITO_REGION ??
  'ap-northeast-1';
const CLIENT_ID =
  (import.meta as { env?: Record<string, string> }).env?.PUBLIC_COGNITO_CLIENT_ID ?? '';
const COGNITO_ENDPOINT = `https://cognito-idp.${REGION}.amazonaws.com/`;

// ── localStorage keys ─────────────────────────────────────────────
const REFRESH_TOKEN_KEY = 'litcrop_refresh_token';
const USER_EMAIL_KEY = 'litcrop_user_email';
const USER_SUB_KEY = 'litcrop_user_sub';

// ── In-memory token state (never persisted to localStorage) ─────────
let _accessToken: string | null = null;
let _tokenExpiry = 0; // Unix timestamp ms

// ── Cognito error ─────────────────────────────────────────────────

export class CognitoError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'CognitoError';
    this.code = code;
  }
}

// ── Cognito JSON API helper ───────────────────────────────────────

async function cognitoRequest(action: string, body: object): Promise<unknown> {
  const res = await fetch(COGNITO_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': `AWSCognitoIdentityProviderService.${action}`,
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as {
    __type?: string;
    message?: string;
    [key: string]: unknown;
  };

  if (!res.ok) {
    // Cognito error codes arrive as the fragment after '#' in __type
    const rawCode = data.__type ?? 'UnknownError';
    const code = rawCode.includes('#') ? rawCode.split('#')[1] : rawCode;
    throw new CognitoError(code, data.message ?? 'Unknown Cognito error');
  }

  return data;
}

// ── Token helpers ─────────────────────────────────────────────────

export interface AuthUser {
  sub: string;
  email: string;
}

function setTokens(accessToken: string, expiresIn: number, refreshToken?: string): void {
  _accessToken = accessToken;
  _tokenExpiry = Date.now() + expiresIn * 1000;
  if (refreshToken) {
    try {
      localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    } catch {
      // ignore
    }
  }
}

function clearTokens(): void {
  _accessToken = null;
  _tokenExpiry = 0;
  try {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_EMAIL_KEY);
    localStorage.removeItem(USER_SUB_KEY);
    // Clear all user-specific app state to prevent leaking between sessions
    localStorage.removeItem('litcrop-isAdmin');
    localStorage.removeItem('litcrop-locale');
    localStorage.removeItem('litcrop-temp-unit');
    localStorage.removeItem('litcrop-theme');
    localStorage.removeItem('litcrop-farmId');
    localStorage.removeItem('litcrop-farmName');
    localStorage.removeItem('litcrop-farmList');
  } catch {
    // ignore
  }
}

async function tryRefresh(): Promise<string | null> {
  let refreshToken: string | null = null;
  try {
    refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    // ignore
  }
  if (!refreshToken) return null;

  try {
    const data = (await cognitoRequest('InitiateAuth', {
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: CLIENT_ID,
      AuthParameters: { REFRESH_TOKEN: refreshToken },
    })) as {
      AuthenticationResult?: { AccessToken: string; IdToken: string; ExpiresIn: number };
    };

    const result = data.AuthenticationResult;
    if (!result) return null;

    // Use IdToken for API calls (see signIn comment for rationale)
    setTokens(result.IdToken, result.ExpiresIn);
    return result.IdToken;
  } catch {
    clearTokens();
    return null;
  }
}

// ── Public token API ──────────────────────────────────────────────

/**
 * Get a valid access token. Automatically refreshes if expiring within 5 minutes.
 * Returns null if the user is not authenticated or refresh fails.
 */
export async function getAccessToken(): Promise<string | null> {
  if (_accessToken && Date.now() < _tokenExpiry - 5 * 60 * 1000) {
    return _accessToken;
  }
  return tryRefresh();
}

/**
 * Quick sync check — true if there is an in-memory token or a refresh token in localStorage.
 * Not async; use getAccessToken() for a definitive validity check.
 */
export function isAuthenticated(): boolean {
  if (_accessToken && Date.now() < _tokenExpiry) return true;
  try {
    return Boolean(localStorage.getItem(REFRESH_TOKEN_KEY));
  } catch {
    return false;
  }
}

/** Return the cached user info (email + sub) stored after sign-in. */
export function getCurrentUser(): AuthUser | null {
  try {
    const sub = localStorage.getItem(USER_SUB_KEY);
    const email = localStorage.getItem(USER_EMAIL_KEY);
    if (sub && email) return { sub, email };
  } catch {
    // ignore
  }
  return null;
}

// ── Auth operations ───────────────────────────────────────────────

export interface SignInResult {
  user: AuthUser;
  /** True if the user has no farm set up yet (first login). */
  isNewUser: boolean;
}

/** Sign in with email and password. Throws CognitoError on failure. */
export async function signIn(email: string, password: string): Promise<SignInResult> {
  const data = (await cognitoRequest('InitiateAuth', {
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: CLIENT_ID,
    AuthParameters: {
      USERNAME: email,
      PASSWORD: password,
    },
  })) as {
    AuthenticationResult?: {
      AccessToken: string;
      RefreshToken: string;
      ExpiresIn: number;
      IdToken: string;
    };
  };

  const result = data.AuthenticationResult;
  if (!result) {
    throw new CognitoError('UnexpectedError', 'No authentication result returned');
  }

  // Parse user sub from the IdToken JWT payload (middle segment, base64-encoded)
  let sub = '';
  try {
    const payload = JSON.parse(atob(result.IdToken.split('.')[1])) as { sub?: string };
    sub = payload.sub ?? '';
  } catch {
    // ignore — sub won't be cached
  }

  // Use IdToken (not AccessToken) for API calls — API Gateway JWT authorizer
  // checks the `aud` claim, which only exists in Cognito ID tokens.
  setTokens(result.IdToken, result.ExpiresIn, result.RefreshToken);

  try {
    localStorage.setItem(USER_EMAIL_KEY, email);
    if (sub) localStorage.setItem(USER_SUB_KEY, sub);
  } catch {
    // ignore
  }

  const isNewUser = !localStorage.getItem('litcrop-farmId');
  return { user: { sub, email }, isNewUser };
}

/** Clear tokens and dispatch a logout event for other islands to react. */
export function signOut(): void {
  clearTokens();
  window.dispatchEvent(new CustomEvent('litcrop:signout'));
}

export interface SignUpResult {
  userSub: string;
  /** True if email confirmation is required (should always be true for our Cognito config). */
  needsConfirmation: boolean;
}

/** Register a new user. Returns needsConfirmation=true when email verification is required. */
export async function signUp(email: string, password: string): Promise<SignUpResult> {
  const data = (await cognitoRequest('SignUp', {
    ClientId: CLIENT_ID,
    Username: email,
    Password: password,
    UserAttributes: [{ Name: 'email', Value: email }],
  })) as { UserSub: string; UserConfirmed: boolean };

  return { userSub: data.UserSub, needsConfirmation: !data.UserConfirmed };
}

/** Confirm registration with the 6-digit code sent to the user's email. */
export async function confirmSignUp(email: string, code: string): Promise<void> {
  await cognitoRequest('ConfirmSignUp', {
    ClientId: CLIENT_ID,
    Username: email,
    ConfirmationCode: code,
  });
}

/** Resend the email verification code. */
export async function resendConfirmationCode(email: string): Promise<void> {
  await cognitoRequest('ResendConfirmationCode', {
    ClientId: CLIENT_ID,
    Username: email,
  });
}

/** Begin the forgot-password flow — sends a reset code to the user's email. */
export async function forgotPassword(email: string): Promise<void> {
  await cognitoRequest('ForgotPassword', {
    ClientId: CLIENT_ID,
    Username: email,
  });
}

/** Complete the forgot-password flow — verify the code and set a new password. */
export async function confirmForgotPassword(
  email: string,
  code: string,
  newPassword: string,
): Promise<void> {
  await cognitoRequest('ConfirmForgotPassword', {
    ClientId: CLIENT_ID,
    Username: email,
    ConfirmationCode: code,
    Password: newPassword,
  });
}
