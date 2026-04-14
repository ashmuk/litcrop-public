/**
 * LegalPage — #280
 * Renders Terms, Privacy, or What's New content using i18n keys.
 * Used on public (no-auth) pages via AuthLayout.
 */

import { t } from '../i18n/i18n';

interface Props {
  page: 'terms' | 'privacy' | 'whats-new';
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

function GuideStep({ step, icon, title, desc }: { step: number; icon: string; title: string; desc: string }) {
  return (
    <div style="display:flex;gap:var(--space-3);margin-bottom:var(--space-4)">
      <div style="flex-shrink:0;width:32px;height:32px;border-radius:50%;background:var(--color-primary);color:#fff;display:flex;align-items:center;justify-content:center;font-size:var(--font-size-sm);font-weight:var(--font-weight-bold)">{step}</div>
      <div>
        <div style="font-weight:var(--font-weight-semibold);font-size:var(--font-size-sm);margin-bottom:2px">
          <span aria-hidden="true">{icon} </span>{title}
        </div>
        <div style="font-size:var(--font-size-xs);color:var(--color-gray-600);line-height:1.5">{desc}</div>
      </div>
    </div>
  );
}

function WhatsNewContent() {
  return (
    <>
      {/* Platform Summary */}
      <div style="margin-bottom:var(--space-6)">
        <p style="font-size:var(--font-size-sm);color:var(--color-gray-700);line-height:1.7;margin-bottom:var(--space-3)">
          {t('guide.summary')}
        </p>

        {/* Key Features */}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);margin-bottom:var(--space-4)">
          {[
            { icon: '🌾', key: 'guide.feature_crops' },
            { icon: '📓', key: 'guide.feature_diary' },
            { icon: '📡', key: 'guide.feature_device' },
            { icon: '📊', key: 'guide.feature_timelapse' },
            { icon: '🔔', key: 'guide.feature_notifications' },
            { icon: '⛅', key: 'guide.feature_weather' },
          ].map(({ icon, key }) => (
            <div key={key} style="font-size:var(--font-size-xs);color:var(--color-gray-700);padding:var(--space-2);background:var(--color-gray-50);border-radius:var(--radius-sm)">
              <span aria-hidden="true">{icon} </span>{t(key)}
            </div>
          ))}
        </div>
      </div>

      {/* Getting Started Guide */}
      <div style="margin-bottom:var(--space-6)">
        <h2 style="font-size:var(--font-size-md);font-weight:var(--font-weight-bold);margin-bottom:var(--space-4);color:var(--color-text)">
          {t('guide.getting_started')}
        </h2>
        <GuideStep step={1} icon="🌱" title={t('guide.step1_title')} desc={t('guide.step1_desc')} />
        <GuideStep step={2} icon="🌾" title={t('guide.step2_title')} desc={t('guide.step2_desc')} />
        <GuideStep step={3} icon="📷" title={t('guide.step3_title')} desc={t('guide.step3_desc')} />
        <GuideStep step={4} icon="📓" title={t('guide.step4_title')} desc={t('guide.step4_desc')} />
        <GuideStep step={5} icon="📡" title={t('guide.step5_title')} desc={t('guide.step5_desc')} />
      </div>

      {/* Changelog (collapsible) */}
      <details style="margin-bottom:var(--space-4)">
        <summary style="cursor:pointer;font-size:var(--font-size-md);font-weight:var(--font-weight-bold);color:var(--color-text);padding:var(--space-2) 0;user-select:none">
          {t('guide.changelog')}
        </summary>
        <div style="margin-top:var(--space-3)">
          <VersionEntry version="v0.95" date="2026-04-14" items={[
            'Day-grouped image history with collapsible accordion',
            'Timelapse source filtering and date range selector',
            'Pilot mode: invitation code gate, notice banner, farm limit',
          ]} current />
          <VersionEntry version="v0.94" date="2026-04-14" items={[
            'User notification system: email + in-app + bell',
          ]} />
          <VersionEntry version="v0.93" date="2026-04-13" items={[
            'Terms of Service, Privacy Policy, bug report form',
          ]} />
          <VersionEntry version="v0.92" date="2026-04-13" items={[
            'WCAG 2.1 AA compliance, E2E tests, production hotfixes',
          ]} />
          <VersionEntry version="v0.91" date="2026-04-12" items={[
            'Custom domain litcrop.com, environment separation',
          ]} />
          <VersionEntry version="v0.90" date="2026-04-11" items={[
            'Production AWS resources, login redesign, device auth fix',
          ]} />
        </div>
      </details>
    </>
  );
}

function VersionEntry({ version, date, items, current }: { version: string; date: string; items: string[]; current?: boolean }) {
  return (
    <div style={`margin-bottom:var(--space-6);padding:var(--space-4);background:var(--color-surface);border:var(--border-default);border-radius:var(--radius-md)${current ? ';border-left:3px solid var(--color-primary)' : ''}`}>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-2)">
        <span style="font-weight:var(--font-weight-bold);font-size:var(--font-size-md);color:var(--color-text)">
          {version}
          {current && (
            <span style="margin-left:var(--space-2);font-size:var(--font-size-xs);padding:2px 8px;background:var(--color-primary);color:white;border-radius:var(--radius-full);font-weight:var(--font-weight-medium)">
              current
            </span>
          )}
        </span>
        <span style="font-size:var(--font-size-xs);color:var(--color-gray-500)">{date}</span>
      </div>
      <ul style="font-size:var(--font-size-sm);color:var(--color-gray-700);line-height:1.6;padding-left:var(--space-5);list-style:disc">
        {items.map((item, i) => (
          <li key={i} style="margin-bottom:var(--space-1)">{item}</li>
        ))}
      </ul>
    </div>
  );
}

export default function LegalPage({ page }: Props) {
  const titles: Record<string, string> = {
    terms: t('legal.terms'),
    privacy: t('legal.privacy'),
    'whats-new': t('legal.whats_new'),
  };

  return (
    <div style="max-width:640px;margin:0 auto;padding:var(--space-4) var(--space-4) var(--space-8)">
      <div style="margin-bottom:var(--space-4)">
        <a href="/" style="font-size:var(--font-size-sm);color:var(--color-primary);text-decoration:none">
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
      {page === 'whats-new' && <WhatsNewContent />}

      <div style="margin-top:var(--space-6);padding-top:var(--space-4);border-top:var(--border-default);display:flex;gap:var(--space-4);font-size:var(--font-size-xs)">
        <a href="/terms" style="color:var(--color-primary);text-decoration:none">{t('legal.terms')}</a>
        <a href="/privacy" style="color:var(--color-primary);text-decoration:none">{t('legal.privacy')}</a>
        <a href="/whats-new" style="color:var(--color-primary);text-decoration:none">{t('legal.whats_new')}</a>
        <a href="/report-bug" style="color:var(--color-primary);text-decoration:none">{t('legal.report_bug')}</a>
      </div>
    </div>
  );
}
