/**
 * LegalPage — #280
 * Renders Terms or Privacy content using i18n keys.
 * Used on public (no-auth) pages via AuthLayout.
 */

import { t } from '../i18n/i18n';

interface Props {
  page: 'terms' | 'privacy';
}

function Section({ titleKey, bodyKey }: { titleKey: string; bodyKey: string }) {
  return (
    <div style="margin-bottom:var(--space-5)">
      <h2 style="font-size:var(--font-size-md);font-weight:var(--font-weight-bold);margin-bottom:var(--space-2);color:var(--color-text)">
        {t(titleKey)}
      </h2>
      <p style="font-size:var(--font-size-sm);color:var(--color-gray-700);line-height:1.6">
        {t(bodyKey)}
      </p>
    </div>
  );
}

function TermsContent() {
  return (
    <>
      <p style="font-size:var(--font-size-sm);color:var(--color-gray-500);margin-bottom:var(--space-5)">
        {t('legal.terms_intro')}
      </p>
      {([1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const).map((n) => (
        <Section key={n} titleKey={`legal.terms_s${n}_title`} bodyKey={`legal.terms_s${n}_body`} />
      ))}
    </>
  );
}

function PrivacyContent() {
  return (
    <>
      <p style="font-size:var(--font-size-sm);color:var(--color-gray-500);margin-bottom:var(--space-5)">
        {t('legal.privacy_intro')}
      </p>
      <Section titleKey="legal.privacy_s1_title" bodyKey="legal.privacy_s1_body" />
      <Section titleKey="legal.privacy_s2_title" bodyKey="legal.privacy_s2_body" />
      <div style="margin-bottom:var(--space-5)">
        <h2 style="font-size:var(--font-size-md);font-weight:var(--font-weight-bold);margin-bottom:var(--space-2);color:var(--color-text)">
          {t('legal.privacy_s3_title')}
        </h2>
        <ul style="font-size:var(--font-size-sm);color:var(--color-gray-700);line-height:1.6;padding-left:var(--space-5);list-style:disc">
          <li style="margin-bottom:var(--space-1)">{t('legal.privacy_s3_body_you')}</li>
          <li style="margin-bottom:var(--space-1)">{t('legal.privacy_s3_body_members')}</li>
          <li style="margin-bottom:var(--space-1)">{t('legal.privacy_s3_body_admin')}</li>
          <li>{t('legal.privacy_s3_body_public')}</li>
        </ul>
      </div>
      {([4, 5, 6, 7, 8, 9] as const).map((n) => (
        <Section key={n} titleKey={`legal.privacy_s${n}_title`} bodyKey={`legal.privacy_s${n}_body`} />
      ))}
    </>
  );
}

export default function LegalPage({ page }: Props) {
  const titles: Record<string, string> = {
    terms: t('legal.terms'),
    privacy: t('legal.privacy'),
  };

  return (
    <div style="max-width:640px;margin:0 auto;padding:var(--space-4) var(--space-4) var(--space-8)">
      <div style="margin-bottom:var(--space-4)">
        <a href={page === 'terms' ? '/' : '/profile/'} style="font-size:var(--font-size-sm);color:var(--color-primary);text-decoration:none">
          &larr; {t('legal.back_to_app')}
        </a>
      </div>

      <h1 style="font-size:var(--font-size-xl);font-weight:var(--font-weight-bold);margin-bottom:var(--space-2);color:var(--color-text)">
        {titles[page]}
      </h1>

      <p style="font-size:var(--font-size-xs);color:var(--color-gray-400);margin-bottom:var(--space-5)">
        {t('legal.last_updated')}: 2026-04-13
      </p>

      {page === 'terms' && <TermsContent />}
      {page === 'privacy' && <PrivacyContent />}

      <div style="margin-top:var(--space-6);padding-top:var(--space-4);border-top:var(--border-default);display:flex;gap:var(--space-4);font-size:var(--font-size-xs)">
        <a href="/terms" style="color:var(--color-primary);text-decoration:none">{t('legal.terms')}</a>
        <a href="/privacy" style="color:var(--color-primary);text-decoration:none">{t('legal.privacy')}</a>
        <a href="/history" style="color:var(--color-primary);text-decoration:none">{t('info.history')}</a>
        <a href="/report-bug" style="color:var(--color-primary);text-decoration:none">{t('legal.report_bug')}</a>
      </div>
    </div>
  );
}
