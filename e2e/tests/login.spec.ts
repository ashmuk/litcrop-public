/**
 * E2E — Login Page (golden path)
 *
 * Uses the base Playwright test (not the auth fixture) because login tests
 * start unauthenticated.  Cognito and /api/v1/farms are intercepted at the
 * network layer so no real AWS credentials are needed.
 */

import { test, expect } from '@playwright/test';
import { TEST_USER, myFarmsResponse } from '../fixtures/mock-data';
import { MOCK_ID_TOKEN } from '../fixtures/auth';

const COGNITO_SUCCESS_BODY = {
  AuthenticationResult: {
    AccessToken: 'mock-access-token-login-test',
    IdToken: MOCK_ID_TOKEN,
    RefreshToken: 'mock-refresh-token-login-test',
    ExpiresIn: 3600,
    TokenType: 'Bearer',
  },
};

const COGNITO_WRONG_PASSWORD_BODY = {
  __type: 'NotAuthorizedException',
  message: 'Incorrect username or password.',
};

// ── Tests ─────────────────────────────────────────────────────────

test.describe('Login Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    // Wait for the Preact island to hydrate
    await page.waitForSelector('#login-email');
  });

  test('page loads with email and password fields visible', async ({ page }) => {
    await expect(page.locator('#login-email')).toBeVisible();
    await expect(page.locator('#login-password')).toBeVisible();
    await expect(page.locator('button.btn-primary')).toBeVisible();
  });

  test('shows field-level validation errors when form is submitted empty', async ({ page }) => {
    await page.locator('button.btn-primary').click();

    // At least one .form-error should appear (email or password validation)
    await expect(page.locator('.form-error').first()).toBeVisible();
  });

  test('shows validation error for invalid email format', async ({ page }) => {
    await page.fill('#login-email', 'not-an-email');
    await page.fill('#login-password', 'SomePass1!');
    await page.locator('button.btn-primary').click();

    await expect(page.locator('.form-error').first()).toBeVisible();
  });

  test('shows server error when Cognito returns NotAuthorizedException', async ({ page }) => {
    // Intercept Cognito to return an auth error (400 + __type)
    await page.route(/cognito-idp\.[^.]+\.amazonaws\.com/, (route) => {
      route.fulfill({
        status: 400,
        contentType: 'application/x-amz-json-1.1',
        body: JSON.stringify(COGNITO_WRONG_PASSWORD_BODY),
      });
    });

    await page.fill('#login-email', 'user@example.com');
    await page.fill('#login-password', 'WrongPassword1!');
    await page.locator('button.btn-primary').click();

    // The auth-server-error div should appear with the mapped error message
    await expect(page.locator('.auth-server-error')).toBeVisible();
  });

  test('successful login redirects to home page', async ({ page }) => {
    // 1. Intercept Cognito to return valid tokens
    await page.route(/cognito-idp\.[^.]+\.amazonaws\.com/, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/x-amz-json-1.1',
        body: JSON.stringify(COGNITO_SUCCESS_BODY),
      });
    });

    // 2. Intercept GET /farms — LoginForm calls getMyFarm() after signIn
    await page.route('**/api/v1/farms', (route) => {
      if (route.request().method() === 'GET') {
        // Return a farm so LoginForm stores farmId in localStorage and
        // redirects to '/' (rather than '/profile/' for new users)
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(myFarmsResponse()),
        });
      } else {
        route.continue();
      }
    });

    await page.fill('#login-email', TEST_USER.email);
    await page.fill('#login-password', 'ValidPass1!');
    await page.locator('button.btn-primary').click();

    // Successful login navigates away from /login
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10_000 });
    expect(page.url()).not.toContain('/login');
  });

  test('forgot password link navigates to /reset', async ({ page }) => {
    const resetLink = page.locator('a[href="/reset"]');
    await expect(resetLink).toBeVisible();
    await resetLink.click();
    await page.waitForURL('**/reset');
    expect(page.url()).toContain('/reset');
  });

  test('register link navigates to /register', async ({ page }) => {
    const registerLink = page.locator('a[href="/register"]');
    await expect(registerLink).toBeVisible();
    await registerLink.click();
    await page.waitForURL('**/register');
    expect(page.url()).toContain('/register');
  });
});
