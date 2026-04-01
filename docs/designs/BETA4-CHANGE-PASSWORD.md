# Design: Change Password (#204)

> Wave 0 -- Beta-4. Add a "Change Password" collapsible section to the ProfilePage "You" area.

## 1. Overview

### Problem

Authenticated users have no way to change their password from within the app. They must use the "Forgot Password" flow (sign out, request reset code via email, enter code + new password). This is a poor experience for users who know their current password and simply want to rotate it.

### Users

| Persona | Goal |
|---------|------|
| **Any authenticated user** | Change password without leaving the Profile page |

### Constraints

- Cognito password policy: 8+ chars, uppercase, lowercase, digit (no symbol requirement)
- Cognito `ChangePassword` action requires the **AccessToken** (not IdToken)
- Current auth.ts stores IdToken in `_accessToken` and uses it for API Gateway calls; the real AccessToken is discarded after sign-in. This design must address that gap.
- No backend API changes needed -- this is a direct Cognito call from the frontend
- Reuse the existing password strength indicator from RegisterForm (extract to shared component)
- **Known limitation**: Cognito does not enforce password history for `ChangePassword`. Users may revert to a previously used password. Acceptable for MVP.

---

## 2. UX Wireframes (ASCII)

### 2.1 Collapsed State (default)

The "Change Password" row sits between the email display and ThemeSwitcher. It shows a single disclosure row. Note: `ChangePasswordSection` introduces a new collapsible disclosure widget to ProfilePage — there are no existing collapsible sections on this page. The visual language (chevron, row style) is drawn from the "Edit name" inline-edit pattern, but the expand/collapse mechanic is new here.

```
+--------------------------------------------------+
| "You" section                                     |
|                                                   |
|  Display Name               [Edit]                |
|                                                   |
|  Signed in as you@example.com                     |
|                                                   |
|  +----------------------------------------------+ |
|  | Change Password                        [ > ] | |
|  +----------------------------------------------+ |
|                                                   |
|  Theme: [Light v]                                 |
|  Language: [English v]                            |
|  Temperature Unit: [Celsius v]                    |
|                                                   |
|  ------------------------------------------------ |
|  [ Log out ]                                      |
+--------------------------------------------------+
```

The `[ > ]` chevron rotates to `[ v ]` when expanded. The row uses the same `font-size:var(--font-size-sm)` and `color:var(--color-primary)` as the "Edit name" link for visual consistency.

### 2.2 Expanded State

```
+--------------------------------------------------+
| "You" section                                     |
|                                                   |
|  Display Name               [Edit]                |
|                                                   |
|  Signed in as you@example.com                     |
|                                                   |
|  +----------------------------------------------+ |
|  | Change Password                        [ v ] | |
|  |                                              | |
|  | Current Password     [________] [eye]        | |
|  |                                              | |
|  | New Password         [________] [eye]        | |
|  |                                              | |
|  |  [====-------- ] Fair                        | |
|  |  * At least 8 characters           [met]     | |
|  |  * Uppercase letter                 [met]     | |
|  |  * Lowercase letter                 [unmet]   | |
|  |  * Number                           [unmet]   | |
|  |                                              | |
|  | Confirm New Password [________] [eye]        | |
|  |                                              | |
|  |          [ Change Password ]                 | |
|  |                                              | |
|  +----------------------------------------------+ |
|                                                   |
|  Theme: [Light v]                                 |
```

### 2.3 Success State

After a successful password change, the section collapses and a toast (`showToast`) appears:

```
  Toast: "Password changed successfully"
```

All three input fields are cleared before collapsing.

### 2.4 Error State (inline)

Errors display below the submit button as a `form-error` span, matching the RegisterForm pattern:

```
|  |          [ Change Password ]                 | |
|  |  !! Current password is incorrect.           | |
```

---

## 3. Component Design

### 3.1 Extract: `PasswordStrengthIndicator`

**File**: `src/frontend/src/components/PasswordStrengthIndicator.tsx`

Extract the password check logic and the visual indicator from `RegisterForm.tsx` (lines 19-37 for logic, lines 426-454 for markup) into a shared component.

```typescript
// ---- Types (exported for reuse) ----

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

// ---- Component ----

interface Props {
  password: string;
  /** HTML id for aria-describedby linkage from the input */
  id: string;
}

export default function PasswordStrengthIndicator({ password, id }: Props)
```

**Rendering logic** (identical to RegisterForm today):
- 3-segment bar colored by `strengthIdx` (0 = weak, 1 = fair, 2 = strong)
- `strengthIdx` mapping: score 0-1 = 0, score 2-3 = 1, score 4 = 2
- Label via `t('auth.password_strength.{weak|fair|strong}')`
- Requirements checklist with check/circle icons

**CSS classes reused**: `password-strength`, `password-strength__bar`, `password-strength__segment`, `password-strength__segment--active-{0|1|2}`, `password-strength__label`, `password-requirements`, `password-req`, `password-req--met`, `password-req__icon`. No new CSS needed.

**RegisterForm refactor**: Replace lines 19-37 (type + functions) and lines 426-454 (JSX) with an import of this shared component. The RegisterForm still manages its own `password` state and passes it as a prop.

### 3.2 New: `ChangePasswordSection`

**File**: `src/frontend/src/components/ChangePasswordSection.tsx`

#### Props

```typescript
interface Props {
  /** No props needed -- section is self-contained.
   *  It calls getAccessToken() internally. */
}
```

#### Internal State

| State | Type | Default | Purpose |
|-------|------|---------|---------|
| `expanded` | `boolean` | `false` | Toggle collapsed/expanded |
| `currentPassword` | `string` | `''` | Current password field |
| `newPassword` | `string` | `''` | New password field |
| `confirmPassword` | `string` | `''` | Confirm new password field |
| `showCurrentPassword` | `boolean` | `false` | Eye toggle for current pw |
| `showNewPassword` | `boolean` | `false` | Eye toggle for new + confirm |
| `error` | `string` | `''` | Inline error message |
| `submitting` | `boolean` | `false` | Loading state for submit button |

#### Validation Rules (client-side, before Cognito call)

1. All three fields are required (non-empty).
2. `newPassword` must score 4 (strong) in the password check -- all 4 criteria met.
3. `newPassword` must equal `confirmPassword`.
4. `newPassword` must differ from `currentPassword`.

If any rule fails, set `error` to the corresponding i18n key and do not call Cognito.

#### Submit Flow

1. Set `submitting = true`, clear `error`.
2. Run client-side validation. If fail, set error, set `submitting = false`, return.
3. Call `changePassword(accessToken, currentPassword, newPassword)` from auth.ts.
4. On success:
   - Clear all fields.
   - Set `expanded = false`.
   - Call `showToast(t('profile.password_changed'))`.
5. On error:
   - Map the `CognitoError.code` to an i18n key (see section 4 error mapping).
   - Set `error` to the translated message.
6. Set `submitting = false`.

#### Keyboard & Accessibility

- The collapse trigger is a `<button>` element (not a div) with `aria-expanded={expanded}`.
- The collapsible content region has `id="change-password-panel"` and the trigger has `aria-controls="change-password-panel"`.
- Each password input has an associated `<label>` with `for` attribute.
- The new password input has `aria-describedby` pointing to the `PasswordStrengthIndicator` id.
- The submit button is disabled while `submitting` is true.
- All inputs have `autocomplete` attributes: `current-password` for the current field, `new-password` for the new and confirm fields.
- Focus moves to the "Current Password" input when the section expands.

#### Placement in ProfilePage

Insert between the email display (line 616) and `<ThemeSwitcher />` (line 618):

```tsx
{/* After the "Signed in as" div, before ThemeSwitcher */}
<ChangePasswordSection />
```

---

## 4. Auth Function Spec

### 4.1 AccessToken Gap

**Problem**: The Cognito `ChangePassword` action requires the real `AccessToken`, but `auth.ts` currently discards it and stores the `IdToken` instead (see `signIn()` line 220 and `tryRefresh()` line 132). The IdToken is used for API Gateway JWT authorization.

**Solution**: Store both tokens.

Update `auth.ts` internal state:

```typescript
// Current (single token):
let _accessToken: string | null = null;

// New (dual tokens):
let _idToken: string | null = null;
let _realAccessToken: string | null = null;
let _tokenExpiry = 0;
```

Update `setTokens()` to accept and store both:

```typescript
function setTokens(
  idToken: string,
  accessToken: string,
  expiresIn: number,
  refreshToken?: string
): void {
  _idToken = idToken;
  _realAccessToken = accessToken;
  _tokenExpiry = Date.now() + expiresIn * 1000;
  // ... refreshToken storage unchanged
}
```

Update call sites:
- `signIn()`: `setTokens(result.IdToken, result.AccessToken, result.ExpiresIn, result.RefreshToken)`
- `tryRefresh()`: `setTokens(result.IdToken, result.AccessToken, result.ExpiresIn)` -- note: `REFRESH_TOKEN_AUTH` returns both IdToken and AccessToken in `AuthenticationResult`, but does **not** return a new RefreshToken; only IdToken and AccessToken are updated during refresh.

Update `getAccessToken()` (the public API used for API Gateway calls) to return `_idToken` (preserving existing behavior -- the name is misleading but changing the public API name is out of scope).

Add a new internal getter:

```typescript
/** Get the real Cognito AccessToken for user-pool operations (e.g., ChangePassword). */
export async function getCognitoAccessToken(): Promise<string | null> {
  if (_realAccessToken && Date.now() < _tokenExpiry - 5 * 60 * 1000) {
    return _realAccessToken;
  }
  // tryRefresh() now stores both tokens
  await tryRefresh();
  return _realAccessToken;
}
```

### 4.2 New Function: `changePassword`

Add to `auth.ts`:

```typescript
/**
 * Change the authenticated user's password.
 * Requires the real Cognito AccessToken (not the IdToken used for API calls).
 * Throws CognitoError on failure.
 */
export async function changePassword(
  previousPassword: string,
  proposedPassword: string,
): Promise<void> {
  const accessToken = await getCognitoAccessToken();
  if (!accessToken) {
    throw new CognitoError('NotAuthorizedException', 'Not authenticated');
  }

  await cognitoRequest('ChangePassword', {
    AccessToken: accessToken,
    PreviousPassword: previousPassword,
    ProposedPassword: proposedPassword,
  });
}
```

**Session expiry edge case**: If `getCognitoAccessToken()` returns `null` (session expired before or during the operation), display `t('auth.session_expired')` and redirect to `/login/` after 2 seconds, matching RegisterForm's existing pattern. Do not surface this as a generic auth error.

**Cognito API details**:
- Action: `AWSCognitoIdentityProviderService.ChangePassword`
- Request body: `{ AccessToken, PreviousPassword, ProposedPassword }`
- Success: HTTP 200 with empty JSON object `{}`
- Errors: see mapping below

### 4.3 Cognito Error Mapping

> **Session expiry pre-check**: Before calling `changePassword()`, the component should call `getCognitoAccessToken()` and check whether it returns `null`. If it does (session expired), display `t('auth.session_expired')` and redirect to `/login/` after 2 seconds — do not proceed to `changePassword()`. This prevents `NotAuthorizedException` from being surfaced as "Current password is incorrect" when the real cause is an expired session.

| Cognito Error Code | HTTP | Cause | i18n Key |
|--------------------|------|-------|----------|
| `NotAuthorizedException` | 400 | Wrong current password or expired token | `auth.errors.wrong_current_password` |
| `InvalidPasswordException` | 400 | New password fails Cognito policy | `auth.errors.weak_password` (reuse existing) |
| `InvalidParameterException` | 400 | Malformed request | `auth.errors.weak_password` (reuse existing) |
| `LimitExceededException` | 400 | Too many attempts | `auth.errors.too_many_requests` (reuse existing) |
| `TooManyRequestsException` | 400 | Rate limited | `auth.errors.too_many_requests` (reuse existing) |
| `PasswordResetRequiredException` | 400 | Admin forced reset | `auth.errors.password_reset_required` |
| Other / network | - | Unknown | `auth.errors.generic` / `auth.errors.network` (reuse existing) |

Error mapping function in `ChangePasswordSection.tsx`:

```typescript
function mapChangePasswordError(err: unknown): string {
  if (err instanceof CognitoError) {
    switch (err.code) {
      case 'NotAuthorizedException':
        return t('auth.errors.wrong_current_password');
      case 'InvalidPasswordException':
      case 'InvalidParameterException':
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
```

---

## 5. i18n Keys

### 5.1 New Keys -- English (`en.json`)

Add under existing sections:

```json
{
  "profile": {
    "change_password": "Change Password",
    "password_changed": "Password changed successfully"
  },
  "auth": {
    "password": {
      "current": "Current Password",
      "current_placeholder": "Enter current password"
    },
    "errors": {
      "wrong_current_password": "Current password is incorrect.",
      "password_reset_required": "A password reset is required. Please use the forgot password flow.",
      "new_password_same": "New password must be different from your current password.",
      "fields_required": "All password fields are required."
    }
  }
}
```

Total: 8 new keys. All other labels reuse existing keys:
- `auth.password.new` -- "New password" (exists)
- `auth.password.confirm` -- "Confirm password" (exists)
- `auth.password.placeholder` -- "8+ characters" (exists)
- `auth.password.show` / `auth.password.hide` (exist)
- `auth.password_strength.*` (exist)
- `auth.password_requirements.*` (exist)
- `auth.errors.passwords_mismatch` (exists)
- `auth.errors.weak_password` (exists)
- `auth.errors.too_many_requests` (exists)
- `buttons.save` / `buttons.cancel` (exist, though submit uses `profile.change_password`)

### 5.2 New Keys -- Japanese (`ja.json`)

```json
{
  "profile": {
    "change_password": "パスワード変更",
    "password_changed": "パスワードを変更しました"
  },
  "auth": {
    "password": {
      "current": "現在のパスワード",
      "current_placeholder": "現在のパスワードを入力"
    },
    "errors": {
      "wrong_current_password": "現在のパスワードが正しくありません。",
      "password_reset_required": "パスワードのリセットが必要です。パスワードをお忘れの方はリセットしてください。",
      "new_password_same": "新しいパスワードは現在のパスワードと異なる必要があります。",
      "fields_required": "すべてのパスワード欄を入力してください。"
    }
  }
}
```

---

## 6. Component State Matrix

### 6.1 ChangePasswordSection

| State | Collapsed Row | Expanded Panel | Submit Button | Error Area |
|-------|--------------|----------------|---------------|------------|
| **Collapsed** | Visible, chevron `>` | Hidden | Hidden | Hidden |
| **Expanded, empty** | Visible, chevron `v` | Visible, fields empty | Visible, enabled | Hidden |
| **Expanded, partial** | Visible, chevron `v` | Visible, fields partially filled | Visible, enabled | Hidden |
| **Expanded, valid** | Visible, chevron `v` | All fields filled, strength = strong, passwords match | Visible, enabled | Hidden |
| **Submitting** | Visible, chevron `v` | Fields disabled | Disabled, shows "..." | Hidden |
| **Error** | Visible, chevron `v` | Fields enabled (values preserved) | Enabled | Visible, red text |
| **Success** | Visible, chevron `>` (auto-collapsed) | Hidden (fields cleared) | Hidden | Hidden |

### 6.2 PasswordStrengthIndicator

| Score | Segments Lit | Color Class | Label |
|-------|-------------|-------------|-------|
| 0 | 0/3 | (none) | (hidden -- only shows when password non-empty) |
| 1 | 1/3 | `--active-0` (red) | Weak |
| 2-3 | 2/3 | `--active-1` (amber) | Fair |
| 4 | 3/3 | `--active-2` (green) | Strong |

---

## 7. Interaction Flow

```
User taps "Change Password" row
  |
  v
Section expands, focus moves to "Current Password" input
  |
  v
User fills Current Password, New Password, Confirm Password
  |
  v
PasswordStrengthIndicator updates live as New Password is typed
  |
  v
User taps "Change Password" button
  |
  +---> Client validation fails?
  |       |
  |       v
  |     Show inline error, stay expanded
  |       - "All password fields are required."
  |       - "Password does not meet requirements."
  |       - "Passwords do not match."
  |       - "New password must be different from your current password."
  |
  +---> Client validation passes
          |
          v
        Call changePassword(currentPw, newPw)
          |
          +---> Cognito error?
          |       |
          |       v
          |     Map error code, show inline:
          |       - "Current password is incorrect."
          |       - "Too many attempts. Please wait..."
          |       - "A password reset is required..."
          |
          +---> Success
                  |
                  v
                Clear fields, collapse section, show toast:
                  "Password changed successfully"
```

---

## 8. File Change Summary

| File | Action | Description |
|------|--------|-------------|
| `src/frontend/src/components/PasswordStrengthIndicator.tsx` | **Create** | Shared component extracted from RegisterForm |
| `src/frontend/src/components/ChangePasswordSection.tsx` | **Create** | New collapsible section for ProfilePage |
| `src/frontend/src/components/RegisterForm.tsx` | **Modify** | Replace inline strength indicator with shared component import; remove duplicated `PasswordCheck` type and functions |
| `src/frontend/src/components/ProfilePage.tsx` | **Modify** | Import and render `<ChangePasswordSection />` between email display and ThemeSwitcher |
| `src/frontend/src/lib/auth.ts` | **Modify** | Store both IdToken and AccessToken; add `getCognitoAccessToken()`; add `changePassword()` |
| `src/frontend/src/i18n/en.json` | **Modify** | Add 8 new keys (see section 5.1) |
| `src/frontend/src/i18n/ja.json` | **Modify** | Add 8 new keys (see section 5.2) |

---

## 9. Test Plan

### 9.1 Unit Tests

| Test | What to verify |
|------|----------------|
| `checkPassword()` | Returns correct booleans for edge cases: empty string, 7 chars, exactly 8 chars, mixed case + digit |
| `strengthScore()` | Returns 0-4 correctly |
| `PasswordStrengthIndicator` render | Correct segment classes and label for each score level |
| `changePassword()` | Calls `cognitoRequest('ChangePassword', ...)` with correct payload |
| `changePassword()` error | Throws `CognitoError` with mapped code for 400 responses |
| `getCognitoAccessToken()` | Returns the real AccessToken (not IdToken) |
| `mapChangePasswordError()` | Maps each Cognito error code to the correct i18n key |

### 9.2 Component Tests (ChangePasswordSection)

| Test | Steps | Expected |
|------|-------|----------|
| Collapsed by default | Render component | Panel hidden, chevron points right |
| Toggle expand/collapse | Click header | Panel visibility toggles, `aria-expanded` updates |
| Focus on expand | Click header to expand | Focus moves to "Current Password" input |
| Empty submit blocked | Expand, click submit with empty fields | Error: "All password fields are required." |
| Weak password blocked | Enter current pw + weak new pw (only lowercase) | Error: "Password does not meet requirements." |
| Mismatch blocked | Enter current pw + strong new pw + different confirm | Error: "Passwords do not match." |
| Same password blocked | Enter same value for current and new | Error: "New password must be different..." |
| Success flow | Enter valid current + strong new + matching confirm, mock Cognito success | Fields cleared, section collapsed, toast shown |
| Wrong current password | Mock Cognito `NotAuthorizedException` | Error: "Current password is incorrect." |
| Rate limit | Mock Cognito `LimitExceededException` | Error: "Too many attempts..." |
| Submit disables form | Click submit with valid input | Button shows "...", inputs disabled until response |

### 9.3 Integration / E2E

| Test | Steps | Expected |
|------|-------|----------|
| Full happy path | Log in, go to Profile, expand Change Password, fill all fields correctly, submit | Toast appears, section collapses, can log out and log back in with new password |
| Wrong current password (real Cognito) | Enter wrong current password | Inline error, no password change |
| Session expired during change | Let token expire, attempt change | Handled gracefully (auto-refresh or error message) |

### 9.4 Accessibility Checks

- [ ] All inputs have visible labels and `for`/`id` linkage
- [ ] Strength indicator linked via `aria-describedby`
- [ ] Collapse trigger is a `<button>` with `aria-expanded` and `aria-controls`
- [ ] Error messages are announced (parent has `aria-live="polite"` or error is in `aria-describedby`)
- [ ] Password toggle buttons have `aria-label` and `aria-pressed`
- [ ] Tab order: header button -> current pw -> toggle -> new pw -> toggle -> confirm -> toggle -> submit
- [ ] Touch targets >= 44x44pt for all buttons
- [ ] Color contrast >= 4.5:1 for all text, >= 3:1 for strength bar segments

---

## 10. WCAG Checklist

- [x] Color contrast ratio >= 4.5:1 (text) -- reuses existing form-input and form-error styles
- [x] All interactive elements keyboard accessible -- native button and input elements
- [x] Focus indicators visible -- inherits from global `:focus-visible` styles
- [x] Touch targets minimum 44x44pt -- password toggle and submit button sized via existing btn classes
- [x] Form inputs have associated labels -- explicit `<label for>` on every input
- [x] `aria-expanded` and `aria-controls` on disclosure widget
- [x] `aria-describedby` linking new password input to strength indicator
- [x] `aria-live="polite"` on error region and strength indicator
- [x] `autocomplete` attributes: `current-password`, `new-password` for browser/password-manager support
