/**
 * Password Reset Form Island — T-FE-AUTH-05
 *
 * 2-step flow:
 *   Step 1 → Email input → sends Cognito reset code
 *   Step 2 → Code + new password → confirms reset → redirects to /login
 *
 * UX-DESIGNS.md §12.3
 */

import { useState, useEffect } from 'preact/hooks';
import { forgotPassword, confirmForgotPassword, CognitoError } from '../lib/auth';
import { t } from '../i18n/i18n';

// ── Password strength ─────────────────────────────────────────────

function checkPassword(pw: string) {
  return {
    length: pw.length >= 8,
    uppercase: /[A-Z]/.test(pw),
    lowercase: /[a-z]/.test(pw),
    number: /[0-9]/.test(pw),
  };
}

// ── Error mapping ─────────────────────────────────────────────────

function mapForgotError(err: unknown): string {
  if (err instanceof CognitoError) {
    switch (err.code) {
      case 'UserNotFoundException':
        // Don't reveal whether the email exists — generic response
        return t('auth.errors.generic');
      case 'LimitExceededException':
      case 'TooManyRequestsException':
        return t('auth.errors.too_many_requests');
      default:
        return t('auth.errors.generic');
    }
  }
  if (err instanceof TypeError) return t('auth.errors.network');
  return t('auth.errors.generic');
}

function mapConfirmError(err: unknown): string {
  if (err instanceof CognitoError) {
    switch (err.code) {
      case 'CodeMismatchException':
        return t('auth.errors.invalid_code');
      case 'ExpiredCodeException':
        return t('auth.errors.expired_code');
      case 'InvalidPasswordException':
        return t('auth.errors.weak_password');
      case 'LimitExceededException':
      case 'TooManyRequestsException':
        return t('auth.errors.too_many_requests');
      default:
        return t('auth.errors.generic');
    }
  }
  if (err instanceof TypeError) return t('auth.errors.network');
  return t('auth.errors.generic');
}

// ── Component ─────────────────────────────────────────────────────

type Step = 1 | 2 | 3;

export default function ResetPasswordForm() {
  const [step, setStep] = useState<Step>(1);

  // Step 1 state
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [step1ServerError, setStep1ServerError] = useState('');
  const [step1Loading, setStep1Loading] = useState(false);

  // Step 2 state
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [codeError, setCodeError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [step2ServerError, setStep2ServerError] = useState('');
  const [step2Loading, setStep2Loading] = useState(false);

  const pwCheck = checkPassword(newPassword);
  const pwScore = Object.values(pwCheck).filter(Boolean).length;

  // If already authenticated, redirect
  useEffect(() => {
    import('../lib/auth').then(({ getAccessToken }) => {
      getAccessToken().then((token) => {
        if (token) window.location.replace('/');
      });
    });
  }, []);

  // ── Step 1: Request reset code ────────────────────────────────

  async function handleStep1(e: Event) {
    e.preventDefault();
    setStep1ServerError('');

    if (!email.trim()) {
      setEmailError(t('auth.errors.email_required'));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError(t('auth.errors.email_invalid'));
      return;
    }
    setEmailError('');

    setStep1Loading(true);
    try {
      await forgotPassword(email);
      setStep(2);
    } catch (err) {
      setStep1ServerError(mapForgotError(err));
    } finally {
      setStep1Loading(false);
    }
  }

  // ── Step 2: Confirm reset ─────────────────────────────────────

  async function handleStep2(e: Event) {
    e.preventDefault();
    setStep2ServerError('');

    let valid = true;
    if (!code.trim()) {
      setCodeError(t('auth.errors.code_required'));
      valid = false;
    } else if (code.trim().length !== 6) {
      setCodeError(t('auth.errors.code_length'));
      valid = false;
    } else {
      setCodeError('');
    }

    if (!newPassword) {
      setPasswordError(t('auth.errors.password_required'));
      valid = false;
    } else if (pwScore < 4) {
      setPasswordError(t('auth.errors.weak_password'));
      valid = false;
    } else {
      setPasswordError('');
    }

    if (!valid) return;

    setStep2Loading(true);
    try {
      await confirmForgotPassword(email, code.trim(), newPassword);
      setStep(3);
      setTimeout(() => {
        window.location.replace('/login/');
      }, 2000);
    } catch (err) {
      setStep2ServerError(mapConfirmError(err));
    } finally {
      setStep2Loading(false);
    }
  }

  // ── Step dots ─────────────────────────────────────────────────

  function StepDots() {
    return (
      <div class="step-indicator" aria-label={`Step ${step} of 2`}>
        {([1, 2] as const).map((s) => (
          <div
            key={s}
            class={`step-dot${step === s ? ' step-dot--active' : step > s ? ' step-dot--done' : ''}`}
            aria-hidden="true"
          />
        ))}
      </div>
    );
  }

  // ── Success screen ────────────────────────────────────────────

  if (step === 3) {
    return (
      <div class="auth-success">
        <div class="auth-success__icon" aria-hidden="true">✓</div>
        <div class="auth-success__title">Password reset</div>
        <div class="auth-success__body">Redirecting to log in…</div>
      </div>
    );
  }

  // ── Step 2: New password ──────────────────────────────────────

  if (step === 2) {
    return (
      <form onSubmit={handleStep2} noValidate>
        <StepDots />

        <p style="font-size: var(--font-size-sm); color: var(--color-gray-700); margin-bottom: var(--space-5); text-align: center; line-height: var(--line-height-relaxed);">
          {t('auth.verify.body').replace('{email}', email)}
        </p>

        {step2ServerError && (
          <div class="auth-server-error" role="alert">
            <span class="auth-server-error__icon" aria-hidden="true">⚠</span>
            <span>{step2ServerError}</span>
          </div>
        )}

        <div class="form-group">
          <label class="form-label" for="reset-code">
            {t('auth.verify.code_label')}
          </label>
          <input
            id="reset-code"
            type="text"
            inputMode="numeric"
            class={`form-input${codeError ? ' form-input--error' : ''}`}
            value={code}
            onInput={(e) => {
              const val = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 6);
              setCode(val);
              setCodeError('');
            }}
            placeholder={t('auth.verify.code_placeholder')}
            maxLength={6}
            autocomplete="one-time-code"
            aria-describedby={codeError ? 'reset-code-error' : undefined}
            aria-invalid={codeError ? 'true' : undefined}
          />
          {codeError && (
            <span id="reset-code-error" class="form-error">
              <span aria-hidden="true">⚠</span> {codeError}
            </span>
          )}
        </div>

        <div class="form-group">
          <label class="form-label" for="reset-password">
            {t('auth.password.new')}
          </label>
          <div class="password-wrapper">
            <input
              id="reset-password"
              type={showPassword ? 'text' : 'password'}
              class={`form-input${passwordError ? ' form-input--error' : ''}`}
              value={newPassword}
              onInput={(e) => {
                setNewPassword((e.target as HTMLInputElement).value);
                setPasswordError('');
              }}
              placeholder={t('auth.password.placeholder')}
              autocomplete="new-password"
              aria-describedby="reset-password-strength"
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
            <span class="form-error">
              <span aria-hidden="true">⚠</span> {passwordError}
            </span>
          )}
          {newPassword && (
            <div id="reset-password-strength" class="password-requirements" aria-live="polite">
              {([
                ['length', 'auth.password_requirements.length'],
                ['uppercase', 'auth.password_requirements.uppercase'],
                ['lowercase', 'auth.password_requirements.lowercase'],
                ['number', 'auth.password_requirements.number'],
              ] as const).map(([key, labelKey]) => (
                <div key={key} class={`password-req${pwCheck[key] ? ' password-req--met' : ''}`}>
                  <span class="password-req__icon" aria-hidden="true">
                    {pwCheck[key] ? '✓' : '○'}
                  </span>
                  {t(labelKey)}
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          type="submit"
          class="btn-primary"
          style="width: 100%"
          disabled={step2Loading}
          aria-busy={step2Loading}
        >
          {step2Loading ? t('auth.reset.confirming') : t('auth.reset.confirm_button')}
        </button>

        <div class="auth-links">
          <button type="button" class="auth-link" onClick={() => setStep(1)}>
            ← Back
          </button>
        </div>
      </form>
    );
  }

  // ── Step 1: Email ─────────────────────────────────────────────

  return (
    <form onSubmit={handleStep1} noValidate>
      <StepDots />

      <p style="font-size: var(--font-size-sm); color: var(--color-gray-700); margin-bottom: var(--space-5); text-align: center; line-height: var(--line-height-relaxed);">
        Enter your email address and we'll send you a reset code.
      </p>

      {step1ServerError && (
        <div class="auth-server-error" role="alert">
          <span class="auth-server-error__icon" aria-hidden="true">⚠</span>
          <span>{step1ServerError}</span>
        </div>
      )}

      <div class="form-group">
        <label class="form-label" for="reset-email">
          {t('auth.email.label')}
        </label>
        <input
          id="reset-email"
          type="email"
          class={`form-input${emailError ? ' form-input--error' : ''}`}
          value={email}
          onInput={(e) => {
            setEmail((e.target as HTMLInputElement).value);
            setEmailError('');
          }}
          placeholder={t('auth.email.placeholder')}
          autocomplete="email"
          aria-describedby={emailError ? 'reset-email-error' : undefined}
          aria-invalid={emailError ? 'true' : undefined}
          required
        />
        {emailError && (
          <span id="reset-email-error" class="form-error">
            <span aria-hidden="true">⚠</span> {emailError}
          </span>
        )}
      </div>

      <button
        type="submit"
        class="btn-primary"
        style="width: 100%"
        disabled={step1Loading}
        aria-busy={step1Loading}
      >
        {step1Loading ? t('auth.reset.sending') : t('auth.reset.send_code')}
      </button>

      <div class="auth-links">
        <span>
          {t('auth.have_account')}{' '}
          <a href="/login">{t('auth.login_link')}</a>
        </span>
      </div>
    </form>
  );
}
