import { useState, useRef } from 'preact/hooks';
import { deleteMyAccount } from '../lib/api';
import { t } from '../i18n/i18n';
import { showToast } from './Toast';
import { getCurrentUser, signOut, changePassword, deleteCurrentUser, CognitoError } from '../lib/auth';
import type { FarmWithRole } from './FarmSwitcher';
import PasswordStrengthIndicator, { checkPassword, strengthScore } from './PasswordStrengthIndicator';
import ProfilePicture from './ProfilePicture';
import ProfileActivityList from './ProfileActivityList';

interface ProfileYouTabProps {
  userEmail: string | null;
  displayName: string;
  profilePictureUrl: string | null;
  editingName: boolean;
  savingName: boolean;
  farms: FarmWithRole[];
  onEditName: (v: boolean) => void;
  onDisplayNameChange: (v: string) => void;
  onSaveName: () => Promise<void>;
  onLogout: () => void;
}

// ── Change Password Section ───────────────────────────────────────

function ChangePasswordSection() {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const newScore = strengthScore(checkPassword(newPassword));
  const allFilled = currentPassword.length > 0 && newPassword.length > 0 && confirmPassword.length > 0;
  const canSubmit = allFilled && newScore >= 4 && newPassword === confirmPassword && !loading;

  function mapChangePasswordError(err: unknown): string {
    if (err instanceof CognitoError) {
      switch (err.code) {
        case 'NotAuthenticated':
          setTimeout(() => { window.location.replace('/login/'); }, 2000);
          return t('auth.session_expired');
        case 'NotAuthorizedException':
          return t('auth.errors.wrong_current_password');
        case 'InvalidPasswordException':
          return t('auth.errors.weak_password');
        case 'LimitExceededException':
        case 'TooManyRequestsException':
          return t('auth.errors.too_many_requests');
        case 'PasswordResetRequiredException':
          return t('auth.errors.password_reset_required');
        default:
          return t('auth.errors.generic');
      }
    }
    if (err instanceof TypeError) return t('auth.errors.network');
    return t('auth.errors.generic');
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    setError('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError(t('auth.errors.fields_required'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t('auth.errors.passwords_mismatch'));
      return;
    }

    if (newScore < 4) {
      setError(t('auth.errors.weak_password'));
      return;
    }

    if (newPassword === currentPassword) {
      setError(t('auth.errors.new_password_same'));
      return;
    }

    setLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
      showToast(t('profile.password_changed'), 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setOpen(false);
    } catch (err) {
      setError(mapChangePasswordError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style="margin-bottom:var(--space-4)">
      <button
        type="button"
        style="font-size:var(--font-size-sm);color:var(--color-primary);background:none;border:none;cursor:pointer;padding:0;display:flex;align-items:center;gap:var(--space-1)"
        aria-expanded={open}
        aria-controls="change-password-panel"
        onClick={() => { setOpen((v) => !v); setError(''); }}
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        {t('profile.change_password')}
      </button>

      {open && (
        <form
          id="change-password-panel"
          onSubmit={handleSubmit}
          noValidate
          style="margin-top:var(--space-3);display:flex;flex-direction:column;gap:var(--space-3);padding:var(--space-4);border:var(--border-default);border-radius:var(--radius-md);background:var(--color-surface)"
        >
          {error && (
            <div class="auth-server-error" role="alert">
              <span class="auth-server-error__icon" aria-hidden="true">⚠</span>
              <span>{error}</span>
            </div>
          )}

          <div class="form-group" style="margin-bottom:0">
            <label class="form-label" for="cp-current">
              {t('auth.password.current')}
            </label>
            <input
              id="cp-current"
              type="password"
              class="form-input"
              value={currentPassword}
              onInput={(e) => { setCurrentPassword((e.target as HTMLInputElement).value); setError(''); }}
              placeholder={t('auth.password.current_placeholder')}
              autocomplete="current-password"
            />
          </div>

          <div class="form-group" style="margin-bottom:0">
            <label class="form-label" for="cp-new">
              {t('auth.password.new')}
            </label>
            <input
              id="cp-new"
              type="password"
              class="form-input"
              value={newPassword}
              onInput={(e) => { setNewPassword((e.target as HTMLInputElement).value); setError(''); }}
              placeholder={t('auth.password.placeholder')}
              autocomplete="new-password"
              aria-describedby="cp-new-strength"
            />
            <div id="cp-new-strength">
              <PasswordStrengthIndicator password={newPassword} />
            </div>
          </div>

          <div class="form-group" style="margin-bottom:0">
            <label class="form-label" for="cp-confirm">
              {t('auth.password.confirm')}
            </label>
            <input
              id="cp-confirm"
              type="password"
              class="form-input"
              value={confirmPassword}
              onInput={(e) => { setConfirmPassword((e.target as HTMLInputElement).value); setError(''); }}
              placeholder={t('auth.password.confirm_placeholder')}
              autocomplete="new-password"
            />
          </div>

          <button
            type="submit"
            class="btn-primary"
            style="width:100%"
            disabled={!canSubmit}
            aria-busy={loading}
          >
            {loading ? '…' : t('profile.change_password')}
          </button>
        </form>
      )}
    </div>
  );
}

// ── Delete Account Section ────────────────────────────────────────

interface DeleteAccountSectionProps {
  farms: FarmWithRole[];
}

function DeleteAccountSection({ farms }: DeleteAccountSectionProps) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const CONFIRM_STRING = 'DELETE MY ACCOUNT';
  const canSubmit = confirmText === CONFIRM_STRING && !loading;

  const soleMemberFarms = farms.filter((f) => {
    return f.role === 'admin' || f.role === 'owner';
  });

  function handleOpen() {
    setOpen(true);
    setConfirmText('');
    setError('');
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  }

  async function handleDelete() {
    if (!canSubmit) return;
    setLoading(true);
    setError('');

    try {
      await deleteMyAccount();
    } catch (err) {
      console.error('[delete-account] API error:', err);
      setError(t('profile.delete_account.error'));
      setLoading(false);
      return;
    }

    try {
      await deleteCurrentUser();
    } catch (err) {
      console.error('[delete-account] Cognito error:', err);
      setError(t('profile.delete_account.cognito_warning'));
      signOut();
      setTimeout(() => { window.location.href = '/login/'; }, 2500);
      return;
    }

    signOut();
    window.location.href = '/login/';
  }

  return (
    <div style="margin-top:var(--space-6)">
      {!open ? (
        <button
          type="button"
          style="font-size:var(--font-size-sm);color:var(--color-error,#dc2626);background:none;border:none;cursor:pointer;padding:0;display:flex;align-items:center;gap:var(--space-1)"
          aria-expanded={open}
          aria-controls="delete-account-panel"
          onClick={handleOpen}
        >
          <span aria-hidden="true">▸</span>
          {t('profile.delete_account.expand_button')}
        </button>
      ) : (
        <div
          id="delete-account-panel"
          style="border:2px solid var(--color-error,#dc2626);border-radius:var(--radius-md);padding:var(--space-4)"
          role="alert"
        >
          <div style="font-weight:var(--font-weight-semibold);color:var(--color-error,#dc2626);margin-bottom:var(--space-3)">
            {t('profile.delete_account.title')}
          </div>

          <div style="font-size:var(--font-size-sm);color:var(--color-text);margin-bottom:var(--space-3)">
            {t('profile.delete_account.description')}
          </div>

          {soleMemberFarms.length > 0 && (
            <div style="font-size:var(--font-size-sm);color:var(--color-error,#dc2626);margin-bottom:var(--space-3)">
              <div style="font-weight:var(--font-weight-semibold);margin-bottom:var(--space-1)">
                {t('profile.delete_account.admin_transfer_warning')}
              </div>
              <ul style="margin:0;padding-left:var(--space-4)">
                {soleMemberFarms.map((f) => (
                  <li key={f.id} style="margin-bottom:var(--space-1)">{f.name}</li>
                ))}
              </ul>
            </div>
          )}

          <div class="form-group" style="margin-bottom:var(--space-3)">
            <label
              class="form-label"
              for="delete-account-confirm"
              style="font-size:var(--font-size-sm)"
            >
              {t('profile.delete_account.confirm_prompt')}
            </label>
            <input
              id="delete-account-confirm"
              ref={inputRef}
              type="text"
              class="form-input"
              value={confirmText}
              onInput={(e) => setConfirmText((e.target as HTMLInputElement).value)}
              placeholder={t('profile.delete_account.confirm_placeholder')}
              aria-label="Type DELETE MY ACCOUNT to confirm"
              autocomplete="off"
              autocorrect="off"
              autocapitalize="off"
              spellcheck={false}
            />
          </div>

          {error && (
            <div class="auth-server-error" role="alert" style="margin-bottom:var(--space-3)">
              <span class="auth-server-error__icon" aria-hidden="true">⚠</span>
              <span>{error}</span>
            </div>
          )}

          <div style="display:flex;gap:var(--space-2)">
            <button
              type="button"
              class="btn-secondary"
              style="font-size:var(--font-size-sm);padding:var(--space-1) var(--space-3);min-width:auto"
              onClick={() => { setOpen(false); setConfirmText(''); setError(''); }}
              disabled={loading}
            >
              {t('buttons.cancel')}
            </button>
            <button
              type="button"
              style={`font-size:var(--font-size-sm);padding:var(--space-1) var(--space-3);background:var(--color-error,#dc2626);color:#fff;border:none;border-radius:var(--radius-sm);cursor:${canSubmit ? 'pointer' : 'not-allowed'};opacity:${canSubmit ? '1' : '0.5'}`}
              onClick={() => void handleDelete()}
              disabled={!canSubmit}
              aria-disabled={!canSubmit}
              aria-busy={loading}
            >
              {loading ? t('profile.delete_account.deleting') : t('profile.delete_account.confirm_button')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ProfileYouTab ─────────────────────────────────────────────────

export default function ProfileYouTab({
  userEmail,
  displayName,
  profilePictureUrl,
  editingName,
  savingName,
  farms,
  onEditName,
  onDisplayNameChange,
  onSaveName,
  onLogout,
}: ProfileYouTabProps) {
  return (
    <section>
      <h2 style="font-size:var(--font-size-lg);font-weight:var(--font-weight-bold);margin-bottom:var(--space-3);color:var(--color-text)">
        👤 {t('profile.you')}
      </h2>

      <div style="display:flex;justify-content:center;margin-bottom:var(--space-4)">
        <ProfilePicture currentUrl={profilePictureUrl} displayName={displayName || userEmail || ''} />
      </div>

      <div style="display:flex;align-items:center;gap:var(--space-2);margin-bottom:var(--space-3)">
        {editingName ? (
          <>
            <input
              type="text"
              class="form-input"
              style="flex:1"
              value={displayName}
              onInput={(e) => onDisplayNameChange((e.target as HTMLInputElement).value)}
              placeholder={t('profile.name_placeholder')}
              maxLength={100}
            />
            <button class="btn-primary" style="font-size:var(--font-size-sm);padding:var(--space-1) var(--space-3)" onClick={onSaveName} disabled={savingName}>
              {savingName ? '...' : t('buttons.save')}
            </button>
            <button class="btn-secondary" style="font-size:var(--font-size-sm);padding:var(--space-1) var(--space-3)" onClick={() => onEditName(false)}>
              {t('buttons.cancel')}
            </button>
          </>
        ) : (
          <>
            <span style="font-weight:var(--font-weight-semibold);font-size:var(--font-size-base)">
              {displayName || t('profile.no_name')}
            </span>
            <button
              type="button"
              style="font-size:var(--font-size-xs);color:var(--color-primary);background:none;border:none;cursor:pointer;padding:var(--space-1)"
              onClick={() => onEditName(true)}
            >
              {t('profile.edit_name')}
            </button>
          </>
        )}
      </div>

      {userEmail && (
        <div style="font-size:var(--font-size-sm);color:var(--color-gray-700);margin-bottom:var(--space-4)">
          {t('profile.signed_in_as')} <strong>{userEmail}</strong>
        </div>
      )}

      {/* Logout kept above the activity feed so a long paginated feed can't
          push it below the fold. Account-management sections (Change Password,
          Delete Account) stay in the bottom cluster where users expect them. */}
      <div style="border-top:var(--border-default);padding-top:var(--space-4);margin-top:var(--space-2);margin-bottom:var(--space-4)">
        <button
          type="button"
          class="btn-secondary"
          style="width:100%"
          onClick={onLogout}
        >
          {t('auth.logout')}
        </button>
      </div>

      <ProfileActivityList />

      <ChangePasswordSection />

      <DeleteAccountSection farms={farms} />
    </section>
  );
}
