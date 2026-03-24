/**
 * Registration Form Island — T-FE-AUTH-04
 *
 * 3-step flow:
 *   Step 1 → Email + password (with strength indicator)
 *   Step 2 → 6-digit email verification code (with 60s resend cooldown)
 *   Step 3 → Success (redirect to /login after 2s)
 *
 * Cognito error mapping: email exists, weak password, invalid code.
 * UX-DESIGNS.md §12.2
 */

import { useState, useEffect, useRef } from 'preact/hooks';
import { signUp, confirmSignUp, resendConfirmationCode, getAccessToken, CognitoError } from '../lib/auth';
import { t } from '../i18n/i18n';

// ── Password strength ─────────────────────────────────────────────

interface PasswordCheck {
  length: boolean;
  uppercase: boolean;
  lowercase: boolean;
  number: boolean;
}

function checkPassword(password: string): PasswordCheck {
  return {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
  };
}

function strengthScore(check: PasswordCheck): number {
  return Object.values(check).filter(Boolean).length;
}

// ── Error mapping ─────────────────────────────────────────────────

function mapSignUpError(err: unknown): string {
  if (err instanceof CognitoError) {
    switch (err.code) {
      case 'UsernameExistsException':
        return t('auth.errors.email_exists');
      case 'InvalidPasswordException':
      case 'InvalidParameterException':
        return t('auth.errors.weak_password');
      case 'TooManyRequestsException':
      case 'LimitExceededException':
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
      case 'TooManyRequestsException':
      case 'LimitExceededException':
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

export default function RegisterForm() {
  const [step, setStep] = useState<Step>(1);

  // Step 1 state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [step1ServerError, setStep1ServerError] = useState('');
  const [step1Loading, setStep1Loading] = useState(false);

  // Preference state
  const [role, setRole] = useState<'manager' | 'observer'>('observer');
  const [regLocale, setRegLocale] = useState<'en' | 'ja'>(() => {
    try { const s = localStorage.getItem('litcrop-locale'); return s === 'ja' ? 'ja' : 'en'; } catch { return 'en'; }
  });
  const [regTempUnit, setRegTempUnit] = useState<'C' | 'F'>('C');

  // Step 2 state
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [step2ServerError, setStep2ServerError] = useState('');
  const [step2Loading, setStep2Loading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Password checks
  const pwCheck = checkPassword(password);
  const score = strengthScore(pwCheck);

  // If already authenticated, redirect away
  useEffect(() => {
    getAccessToken().then((token) => {
      if (token) window.location.replace('/');
    });
  }, []);

  // Cleanup cooldown interval on unmount
  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  function startResendCooldown() {
    setResendCooldown(60);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((s) => {
        if (s <= 1) {
          clearInterval(cooldownRef.current!);
          cooldownRef.current = null;
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  // ── Step 1: Sign up ───────────────────────────────────────────

  async function handleStep1(e: Event) {
    e.preventDefault();
    setStep1ServerError('');

    let valid = true;
    if (!email.trim()) {
      setEmailError(t('auth.errors.email_required'));
      valid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError(t('auth.errors.email_invalid'));
      valid = false;
    } else {
      setEmailError('');
    }

    if (!password) {
      setPasswordError(t('auth.errors.password_required'));
      valid = false;
    } else if (score < 4) {
      setPasswordError(t('auth.errors.weak_password'));
      valid = false;
    } else {
      setPasswordError('');
    }

    if (password !== confirmPassword) {
      setConfirmError(t('auth.errors.passwords_mismatch'));
      valid = false;
    } else {
      setConfirmError('');
    }

    if (!valid) return;

    setStep1Loading(true);
    try {
      await signUp(email, password);
      startResendCooldown();
      setStep(2);
    } catch (err) {
      setStep1ServerError(mapSignUpError(err));
    } finally {
      setStep1Loading(false);
    }
  }

  // ── Step 2: Confirm signup ────────────────────────────────────

  async function handleStep2(e: Event) {
    e.preventDefault();
    setStep2ServerError('');

    if (!code.trim()) {
      setCodeError(t('auth.errors.code_required'));
      return;
    }
    if (code.trim().length !== 6) {
      setCodeError(t('auth.errors.code_length'));
      return;
    }
    setCodeError('');

    setStep2Loading(true);
    try {
      await confirmSignUp(email, code.trim());
      // Store role for sync on first authenticated login (no auth token available post-confirm)
      try {
        localStorage.setItem('litcrop-pendingRole', role);
        localStorage.setItem('litcrop-locale', regLocale);
        localStorage.setItem('litcrop-temp-unit', regTempUnit);
      } catch {}
      setStep(3);
      // Auto-redirect to login after 2s
      setTimeout(() => {
        window.location.replace('/login/');
      }, 2000);
    } catch (err) {
      setStep2ServerError(mapConfirmError(err));
    } finally {
      setStep2Loading(false);
    }
  }

  async function handleResend() {
    if (resendCooldown > 0) return;
    try {
      await resendConfirmationCode(email);
      startResendCooldown();
    } catch {
      // ignore — not critical
    }
  }

  // ── Strength bar ──────────────────────────────────────────────

  let strengthLabel: string;
  let strengthIdx: number;
  if (score <= 1) {
    strengthLabel = t('auth.password_strength.weak');
    strengthIdx = 0;
  } else if (score <= 3) {
    strengthLabel = t('auth.password_strength.fair');
    strengthIdx = 1;
  } else {
    strengthLabel = t('auth.password_strength.strong');
    strengthIdx = 2;
  }

  // ── Step indicator dots ───────────────────────────────────────

  function StepDots() {
    return (
      <div class="step-indicator" aria-label={`Step ${step} of 3`}>
        {([1, 2, 3] as Step[]).map((s) => (
          <div
            key={s}
            class={`step-dot${step === s ? ' step-dot--active' : step > s ? ' step-dot--done' : ''}`}
            aria-hidden="true"
          />
        ))}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────

  if (step === 3) {
    return (
      <div class="auth-success">
        <div class="auth-success__icon" aria-hidden="true">✓</div>
        <div class="auth-success__title">{t('auth.register.step3')}</div>
        <div class="auth-success__body">
          Redirecting to log in…
        </div>
      </div>
    );
  }

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
          <label class="form-label" for="verify-code">
            {t('auth.verify.code_label')}
          </label>
          <input
            id="verify-code"
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
            aria-describedby={codeError ? 'verify-code-error' : undefined}
            aria-invalid={codeError ? 'true' : undefined}
          />
          {codeError && (
            <span id="verify-code-error" class="form-error">
              <span aria-hidden="true">⚠</span> {codeError}
            </span>
          )}
        </div>

        <button
          type="submit"
          class="btn-primary"
          style="width: 100%"
          disabled={step2Loading}
          aria-busy={step2Loading}
        >
          {step2Loading ? t('auth.verify.loading') : t('auth.verify.button')}
        </button>

        <div class="auth-links" style="margin-top: var(--space-4);">
          {resendCooldown > 0 ? (
            <span class="resend-info">
              {t('auth.verify.resend_in').replace('{s}', String(resendCooldown))}
            </span>
          ) : (
            <button type="button" class="auth-link" onClick={handleResend}>
              {t('auth.verify.resend')}
            </button>
          )}
        </div>
      </form>
    );
  }

  // Step 1: Account details
  return (
    <form onSubmit={handleStep1} noValidate>
      <StepDots />

      {step1ServerError && (
        <div class="auth-server-error" role="alert">
          <span class="auth-server-error__icon" aria-hidden="true">⚠</span>
          <span>{step1ServerError}</span>
        </div>
      )}

      <div class="form-group">
        <label class="form-label" for="reg-email">
          {t('auth.email.label')}
        </label>
        <input
          id="reg-email"
          type="email"
          class={`form-input${emailError ? ' form-input--error' : ''}`}
          value={email}
          onInput={(e) => {
            setEmail((e.target as HTMLInputElement).value);
            setEmailError('');
          }}
          placeholder={t('auth.email.placeholder')}
          autocomplete="email"
          aria-describedby={emailError ? 'reg-email-error' : undefined}
          aria-invalid={emailError ? 'true' : undefined}
          required
        />
        {emailError && (
          <span id="reg-email-error" class="form-error">
            <span aria-hidden="true">⚠</span> {emailError}
          </span>
        )}
      </div>

      <div class="form-group">
        <label class="form-label" for="reg-password">
          {t('auth.password.label')}
        </label>
        <div class="password-wrapper">
          <input
            id="reg-password"
            type={showPassword ? 'text' : 'password'}
            class={`form-input${passwordError ? ' form-input--error' : ''}`}
            value={password}
            onInput={(e) => {
              setPassword((e.target as HTMLInputElement).value);
              setPasswordError('');
            }}
            placeholder={t('auth.password.placeholder')}
            autocomplete="new-password"
            aria-describedby="reg-password-strength"
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

        {/* Password strength indicator */}
        {password && (
          <div id="reg-password-strength" class="password-strength" aria-live="polite">
            <div class="password-strength__bar">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  class={`password-strength__segment${score > 0 && i <= strengthIdx ? ` password-strength__segment--active-${strengthIdx}` : ''}`}
                />
              ))}
            </div>
            <div class="password-strength__label">{strengthLabel}</div>
            <div class="password-requirements">
              {([
                ['length', 'auth.password_requirements.length'],
                ['uppercase', 'auth.password_requirements.uppercase'],
                ['lowercase', 'auth.password_requirements.lowercase'],
                ['number', 'auth.password_requirements.number'],
              ] as [keyof PasswordCheck, string][]).map(([key, labelKey]) => (
                <div key={key} class={`password-req${pwCheck[key] ? ' password-req--met' : ''}`}>
                  <span class="password-req__icon" aria-hidden="true">
                    {pwCheck[key] ? '✓' : '○'}
                  </span>
                  {t(labelKey)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div class="form-group">
        <label class="form-label" for="reg-confirm">
          {t('auth.password.confirm')}
        </label>
        <input
          id="reg-confirm"
          type={showPassword ? 'text' : 'password'}
          class={`form-input${confirmError ? ' form-input--error' : ''}`}
          value={confirmPassword}
          onInput={(e) => {
            setConfirmPassword((e.target as HTMLInputElement).value);
            setConfirmError('');
          }}
          placeholder={t('auth.password.confirm_placeholder')}
          autocomplete="new-password"
          aria-describedby={confirmError ? 'reg-confirm-error' : undefined}
          aria-invalid={confirmError ? 'true' : undefined}
          required
        />
        {confirmError && (
          <span id="reg-confirm-error" class="form-error">
            <span aria-hidden="true">⚠</span> {confirmError}
          </span>
        )}
      </div>

      <div class="form-group">
        <label class="form-label">{t('auth.register.role_label')}</label>
        <div style="display:flex;gap:var(--space-3)">
          <label style="display:flex;align-items:center;gap:var(--space-1);cursor:pointer">
            <input type="radio" name="role" value="manager" checked={role === 'manager'} onChange={() => setRole('manager')} />
            {t('auth.register.role_manager')}
          </label>
          <label style="display:flex;align-items:center;gap:var(--space-1);cursor:pointer">
            <input type="radio" name="role" value="observer" checked={role === 'observer'} onChange={() => setRole('observer')} />
            {t('auth.register.role_reader')}
          </label>
        </div>
      </div>

      <div style="display:flex;gap:var(--space-3)">
        <div class="form-group" style="flex:1">
          <label class="form-label">{t('auth.register.language')}</label>
          <select class="form-input" value={regLocale} onChange={(e) => setRegLocale((e.target as HTMLSelectElement).value as 'en' | 'ja')}>
            <option value="en">English</option>
            <option value="ja">日本語</option>
          </select>
        </div>
        <div class="form-group" style="flex:1">
          <label class="form-label">{t('auth.register.temp_unit')}</label>
          <select class="form-input" value={regTempUnit} onChange={(e) => setRegTempUnit((e.target as HTMLSelectElement).value as 'C' | 'F')}>
            <option value="C">°C</option>
            <option value="F">°F</option>
          </select>
        </div>
      </div>

      <button
        type="submit"
        class="btn-primary"
        style="width: 100%"
        disabled={step1Loading}
        aria-busy={step1Loading}
      >
        {step1Loading ? t('auth.register.loading') : t('auth.register.button')}
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
