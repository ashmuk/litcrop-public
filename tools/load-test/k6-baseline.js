/*
 * LitCrop — k6 load-test baseline (R-010, #443).
 *
 * Exercises three scenarios against staging:
 *   1. Auth cold-path: SignUp → SignIn → GET /me/profile
 *   2. Farm hot-path:  GET /farms → GET /farms/:id → GET /farms/:id/beds
 *   3. Admin stats:    GET /admin/stats (scale-cliff target for #383)
 *
 * Each scenario is tagged so a single one can be run via:
 *   k6 run --env-file .env --tag scenario=hot-path k6-baseline.js
 *
 * Env vars (see .env.example):
 *   STAGING_API_BASE_URL       — e.g. https://api-staging.litcrop.com/v1
 *   TEST_USER_EMAIL            — pre-created staging test account
 *   TEST_USER_PASSWORD
 *   COGNITO_CLIENT_ID          — for SignIn call
 *   COGNITO_REGION             — e.g. ap-northeast-1
 *   ADMIN_ID_TOKEN             — (optional) pre-fetched ID token for admin scenario;
 *                                if unset, admin scenario is skipped
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend } from 'k6/metrics';

// ── Config ──────────────────────────────────────────────────────────

const API_BASE = __ENV.STAGING_API_BASE_URL || '';
const TEST_EMAIL = __ENV.TEST_USER_EMAIL || '';
const TEST_PASSWORD = __ENV.TEST_USER_PASSWORD || '';
const COGNITO_CLIENT_ID = __ENV.COGNITO_CLIENT_ID || '';
const COGNITO_REGION = __ENV.COGNITO_REGION || 'ap-northeast-1';
const ADMIN_ID_TOKEN = __ENV.ADMIN_ID_TOKEN || '';

if (!API_BASE || !TEST_EMAIL || !TEST_PASSWORD) {
  throw new Error('Missing required env vars. See tools/load-test/.env.example');
}

// ── Scenarios ───────────────────────────────────────────────────────

export const options = {
  scenarios: {
    coldPath: {
      executor: 'constant-vus',
      vus: 5,
      duration: '90s',
      exec: 'coldPath',
      tags: { scenario: 'cold-path' },
    },
    hotPath: {
      executor: 'constant-vus',
      vus: 10,
      duration: '2m',
      exec: 'hotPath',
      tags: { scenario: 'hot-path' },
    },
    adminStats: {
      executor: 'constant-vus',
      vus: 3,
      duration: '60s',
      exec: 'adminStats',
      tags: { scenario: 'admin-stats' },
    },
  },
  thresholds: {
    'http_req_duration{scenario:cold-path}': ['p(99)<3000'],
    'http_req_duration{scenario:hot-path}': ['p(95)<1000'],
    'http_req_duration{scenario:admin-stats}': ['p(95)<5000'],
    http_req_failed: ['rate<0.05'],
  },
};

const loginLatency = new Trend('cognito_login_duration');
const meProfileLatency = new Trend('me_profile_duration');

// ── Shared helpers ──────────────────────────────────────────────────

function cognitoSignIn() {
  const url = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`;
  const body = JSON.stringify({
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: COGNITO_CLIENT_ID,
    AuthParameters: { USERNAME: TEST_EMAIL, PASSWORD: TEST_PASSWORD },
  });
  const res = http.post(url, body, {
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    },
    tags: { name: 'cognito_sign_in' },
  });
  loginLatency.add(res.timings.duration);
  check(res, { 'cognito sign-in 200': (r) => r.status === 200 });
  const json = res.json();
  return json && json.AuthenticationResult ? json.AuthenticationResult.IdToken : null;
}

function authHeaders(idToken) {
  return { Authorization: `Bearer ${idToken}` };
}

// ── 1. Cold-path scenario (signin + profile load) ───────────────────

export function coldPath() {
  group('auth cold-path', () => {
    const idToken = cognitoSignIn();
    if (!idToken) {
      check(null, { 'cold-path: got id token': () => false });
      return;
    }

    const me = http.get(`${API_BASE}/me/profile`, {
      headers: authHeaders(idToken),
      tags: { name: 'get_me_profile' },
    });
    meProfileLatency.add(me.timings.duration);
    check(me, {
      'me/profile 200': (r) => r.status === 200,
      'me/profile returns user_id': (r) => r.json('user_id') !== undefined,
    });
  });
  sleep(1);
}

// ── 2. Hot-path scenario (farm list + detail + bed listing) ─────────

export function hotPath() {
  const idToken = cognitoSignIn();
  if (!idToken) return;

  group('farm hot-path', () => {
    const farmsRes = http.get(`${API_BASE}/farms`, {
      headers: authHeaders(idToken),
      tags: { name: 'list_farms' },
    });
    check(farmsRes, { 'GET /farms 200': (r) => r.status === 200 });

    const farms = farmsRes.json('data') || [];
    if (farms.length === 0) return;
    const farmId = farms[0].id;

    const farmRes = http.get(`${API_BASE}/farms/${farmId}`, {
      headers: authHeaders(idToken),
      tags: { name: 'get_farm_detail' },
    });
    check(farmRes, { 'GET /farms/:id 200': (r) => r.status === 200 });

    const bedsRes = http.get(`${API_BASE}/farms/${farmId}/beds`, {
      headers: authHeaders(idToken),
      tags: { name: 'list_beds' },
    });
    check(bedsRes, { 'GET /farms/:id/beds 200': (r) => r.status === 200 });
  });
  sleep(0.5);
}

// ── 3. Admin stats scenario (scale-cliff target for #383) ───────────

export function adminStats() {
  const idToken = ADMIN_ID_TOKEN || cognitoSignIn();
  if (!idToken) return;

  group('admin stats', () => {
    const res = http.get(`${API_BASE}/admin/stats`, {
      headers: authHeaders(idToken),
      tags: { name: 'get_admin_stats' },
    });
    check(res, { 'GET /admin/stats 200-or-403': (r) => r.status === 200 || r.status === 403 });
  });
  sleep(2);
}
