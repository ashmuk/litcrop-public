/**
 * PasswordStrengthIndicator — shared password strength UI
 *
 * Displays a 3-segment strength bar, a strength label, and a requirements checklist.
 * Used by RegisterForm and ChangePasswordSection.
 */

import { t } from '../i18n/i18n';

// ── Password check logic (also exported for use by forms) ─────────

export interface PasswordCheck {
  length: boolean;
  uppercase: boolean;
  lowercase: boolean;
  number: boolean;
}

export function checkPassword(password: string): PasswordCheck {
  return {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
  };
}

export function strengthScore(check: PasswordCheck): number {
  return Object.values(check).filter(Boolean).length;
}

// ── Component ─────────────────────────────────────────────────────

interface Props {
  password: string;
}

export default function PasswordStrengthIndicator({ password }: Props) {
  if (!password) return null;

  const pwCheck = checkPassword(password);
  const score = strengthScore(pwCheck);

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

  return (
    <div class="password-strength" aria-live="polite">
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
  );
}
