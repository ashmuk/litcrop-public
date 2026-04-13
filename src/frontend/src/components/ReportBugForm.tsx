/**
 * ReportBugForm — #280
 * Simple bug report form that sends to admin email via API.
 * Requires authentication (uses /me/bug-report endpoint).
 */

import { useState } from 'preact/hooks';
import { sendBugReport } from '../lib/api';
import { t } from '../i18n/i18n';
import { showToast } from './Toast';

export default function ReportBugForm() {
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!description.trim()) {
      showToast(t('legal.report_bug_empty'), 'error');
      return;
    }
    setSending(true);
    try {
      await sendBugReport(description.trim(), steps.trim());
      setSent(true);
      showToast(t('legal.report_bug_success'), 'success');
    } catch {
      showToast(t('legal.report_bug_error'), 'error');
    } finally {
      setSending(false);
    }
  }

  return (
    <div style="max-width:640px;margin:0 auto;padding:var(--space-4) var(--space-4) var(--space-8)">
      <div style="margin-bottom:var(--space-4)">
        <a href="/login" style="font-size:var(--font-size-sm);color:var(--color-primary);text-decoration:none">
          &larr; {t('legal.back_to_app')}
        </a>
      </div>

      <h1 style="font-size:var(--font-size-xl);font-weight:var(--font-weight-bold);margin-bottom:var(--space-2);color:var(--color-text)">
        {t('legal.report_bug')}
      </h1>

      <p style="font-size:var(--font-size-sm);color:var(--color-gray-500);margin-bottom:var(--space-5)">
        {t('legal.report_bug_intro')}
      </p>

      {sent ? (
        <div class="empty-state">
          <span class="empty-state__icon">&#x2705;</span>
          <p class="empty-state__heading">{t('legal.report_bug_success')}</p>
          <a href="/" class="btn-primary" style="margin-top:var(--space-3);display:inline-block;text-decoration:none">
            {t('legal.back_to_app')}
          </a>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div style="margin-bottom:var(--space-4)">
            <label style="display:block;font-size:var(--font-size-sm);font-weight:var(--font-weight-semibold);margin-bottom:var(--space-1);color:var(--color-text)">
              {t('legal.report_bug_description')} *
            </label>
            <textarea
              value={description}
              onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)}
              placeholder={t('legal.report_bug_description_hint')}
              rows={5}
              maxLength={5000}
              required
              style="width:100%;padding:var(--space-3);border:var(--border-default);border-radius:var(--radius-md);font-size:var(--font-size-sm);font-family:inherit;resize:vertical;background:var(--color-surface);color:var(--color-text)"
            />
          </div>

          <div style="margin-bottom:var(--space-4)">
            <label style="display:block;font-size:var(--font-size-sm);font-weight:var(--font-weight-semibold);margin-bottom:var(--space-1);color:var(--color-text)">
              {t('legal.report_bug_steps')}
            </label>
            <textarea
              value={steps}
              onInput={(e) => setSteps((e.target as HTMLTextAreaElement).value)}
              placeholder={t('legal.report_bug_steps_hint')}
              rows={3}
              maxLength={2000}
              style="width:100%;padding:var(--space-3);border:var(--border-default);border-radius:var(--radius-md);font-size:var(--font-size-sm);font-family:inherit;resize:vertical;background:var(--color-surface);color:var(--color-text)"
            />
          </div>

          <button
            type="submit"
            class="btn-primary"
            disabled={sending || !description.trim()}
            style="width:100%"
          >
            {sending ? t('legal.report_bug_sending') : t('legal.report_bug_send')}
          </button>
        </form>
      )}

      <div style="margin-top:var(--space-6);padding-top:var(--space-4);border-top:var(--border-default);display:flex;gap:var(--space-4);font-size:var(--font-size-xs)">
        <a href="/terms" style="color:var(--color-primary);text-decoration:none">{t('legal.terms')}</a>
        <a href="/privacy" style="color:var(--color-primary);text-decoration:none">{t('legal.privacy')}</a>
        <a href="/whats-new" style="color:var(--color-primary);text-decoration:none">{t('legal.whats_new')}</a>
      </div>
    </div>
  );
}
