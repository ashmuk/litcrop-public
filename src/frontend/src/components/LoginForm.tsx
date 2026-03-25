/**
 * Login Form Island — T-FE-AUTH-03
 *
 * Email + password form with:
 * - Field-level validation
 * - Cognito error mapping (wrong password, not confirmed, rate limit)
 * - "Forgot password?" and "Create account" links
 * - Post-login redirect (reads sessionStorage litcrop_return_url)
 * - Redirect to /setup if user has no farm yet
 *
 * UX-DESIGNS.md §12.1
 */

import { useState, useEffect } from 'preact/hooks';
import { signIn, getAccessToken, CognitoError } from '../lib/auth';
import { getMyFarm } from '../lib/api';
import { LS_FARM_ID, LS_FARM_NAME } from '../lib/hooks';
import { t } from '../i18n/i18n';

function mapError(err: unknown): string {
  if (err instanceof CognitoError) {
    switch (err.code) {
      case 'NotAuthorizedException':
      case 'UserNotFoundException':
        // Same message to prevent user enumeration
        return t('auth.errors.wrong_password');
      case 'UserNotConfirmedException':
        return t('auth.errors.not_confirmed');
      case 'TooManyRequestsException':
      case 'LimitExceededException':
        return t('auth.errors.too_many_requests');
      default:
        return t('auth.errors.generic');
    }
  }
  if (err instanceof TypeError) {
    return t('auth.errors.network');
  }
  return t('auth.errors.generic');
}

function validateEmail(value: string): string {
  if (!value.trim()) return t('auth.errors.email_required');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return t('auth.errors.email_invalid');
  return '';
}

function validatePassword(value: string): string {
  if (!value) return t('auth.errors.password_required');
  return '';
}

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);

  // If already authenticated, redirect away from login page
  useEffect(() => {
    getAccessToken().then((token) => {
      if (token) window.location.replace('/');
    });
  }, []);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    setServerError('');

    const eErr = validateEmail(email);
    const pErr = validatePassword(password);
    setEmailError(eErr);
    setPasswordError(pErr);
    if (eErr || pErr) return;

    setLoading(true);
    try {
      await signIn(email, password);
      // Fetch farm from API — reliable cross-device check (replaces localStorage isNewUser)
      const farm = await getMyFarm();
      if (!farm) {
        // Observers go to Profile (to find/join farms), managers go to Setup (to create)
        const pendingRole = localStorage.getItem('litcrop-pendingRole');
        window.location.replace(pendingRole === 'observer' ? '/profile/' : '/setup/');
        return;
      }
      try {
        localStorage.setItem(LS_FARM_ID, farm.id);
        localStorage.setItem(LS_FARM_NAME, farm.name);
      } catch { /* ignore */ }
      let returnUrl = '/';
      try {
        const saved = sessionStorage.getItem('litcrop_return_url');
        if (saved && saved.startsWith('/') && !saved.startsWith('/login')) {
          returnUrl = saved;
          sessionStorage.removeItem('litcrop_return_url');
        }
      } catch {
        // ignore
      }
      window.location.replace(returnUrl);
    } catch (err) {
      setServerError(mapError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {serverError && (
        <div class="auth-server-error" role="alert">
          <span class="auth-server-error__icon" aria-hidden="true">⚠</span>
          <span>{serverError}</span>
        </div>
      )}

      <div class="form-group">
        <label class="form-label" for="login-email">
          {t('auth.email.label')}
        </label>
        <input
          id="login-email"
          type="email"
          class={`form-input${emailError ? ' form-input--error' : ''}`}
          value={email}
          onInput={(e) => {
            setEmail((e.target as HTMLInputElement).value);
            setEmailError('');
          }}
          placeholder={t('auth.email.placeholder')}
          autocomplete="email"
          aria-describedby={emailError ? 'login-email-error' : undefined}
          aria-invalid={emailError ? 'true' : undefined}
          required
        />
        {emailError && (
          <span id="login-email-error" class="form-error">
            <span aria-hidden="true">⚠</span> {emailError}
          </span>
        )}
      </div>

      <div class="form-group">
        <label class="form-label" for="login-password">
          {t('auth.password.label')}
        </label>
        <div class="password-wrapper">
          <input
            id="login-password"
            type={showPassword ? 'text' : 'password'}
            class={`form-input${passwordError ? ' form-input--error' : ''}`}
            value={password}
            onInput={(e) => {
              setPassword((e.target as HTMLInputElement).value);
              setPasswordError('');
            }}
            placeholder={t('auth.password.placeholder')}
            autocomplete="current-password"
            aria-describedby={passwordError ? 'login-password-error' : undefined}
            aria-invalid={passwordError ? 'true' : undefined}
            required
          />
          <button
            type="button"
            class="password-toggle"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? t('auth.password.hide') : t('auth.password.show')}
            aria-pressed={showPassword}
          >
            {showPassword ? '🙈' : '👁'}
          </button>
        </div>
        {passwordError && (
          <span id="login-password-error" class="form-error">
            <span aria-hidden="true">⚠</span> {passwordError}
          </span>
        )}
        <div style="margin-top: var(--space-1);">
          <a href="/reset" class="auth-link" style="font-size: var(--font-size-xs);">
            {t('auth.forgot_password')}
          </a>
        </div>
      </div>

      <button
        type="submit"
        class="btn-primary"
        style="width: 100%"
        disabled={loading}
        aria-busy={loading}
      >
        {loading ? t('auth.login.loading') : t('auth.login.button')}
      </button>

      <div class="auth-links">
        <span>
          {t('auth.no_account')}{' '}
          <a href="/register">{t('auth.signup_link')}</a>
        </span>
      </div>
    </form>
  );
}
