/**
 * GettingStartedGuide — Preact island for /help/getting-started
 * Renders the 5-step guide using existing guide.* i18n keys.
 * Extracted from LegalPage.tsx's WhatsNewContent (guide section only).
 */

import { t } from '../i18n/i18n';

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

export default function GettingStartedGuide() {
  return (
    <div style="max-width:640px;margin:0 auto;padding:var(--space-4) var(--space-4) var(--space-8)">
      {/* Back link */}
      <div style="margin-bottom:var(--space-4)">
        <a href="/profile/?tab=system" style="font-size:var(--font-size-sm);color:var(--color-primary);text-decoration:none">
          &larr; {t('legal.back_to_app')}
        </a>
      </div>

      <h1 style="font-size:var(--font-size-xl);font-weight:var(--font-weight-bold);margin-bottom:var(--space-2);color:var(--color-text)">
        {t('help.getting_started')}
      </h1>

      {/* Platform summary */}
      <div style="margin-bottom:var(--space-6)">
        <p style="font-size:var(--font-size-sm);color:var(--color-gray-700);line-height:1.7;margin-bottom:var(--space-3)">
          {t('guide.summary')}
        </p>

        {/* Key features grid */}
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

      {/* Getting Started steps */}
      <div style="margin-bottom:var(--space-6)">
        <h2 style="font-size:var(--font-size-md);font-weight:var(--font-weight-bold);margin-bottom:var(--space-4);color:var(--color-text)">
          {t('guide.getting_started')}
        </h2>
        {[
          { icon: '🌱', key: 'step1' },
          { icon: '🌾', key: 'step2' },
          { icon: '📷', key: 'step3' },
          { icon: '📓', key: 'step4' },
          { icon: '📡', key: 'step5' },
        ].map(({ icon, key }, i) => (
          <GuideStep
            key={key}
            step={i + 1}
            icon={icon}
            title={t(`guide.${key}_title`)}
            desc={t(`guide.${key}_desc`)}
          />
        ))}
      </div>

      {/* Footer link row */}
      <div style="margin-top:var(--space-6);padding-top:var(--space-4);border-top:var(--border-default);display:flex;gap:var(--space-4);font-size:var(--font-size-xs)">
        <a href="/terms" style="color:var(--color-primary);text-decoration:none">{t('legal.terms')}</a>
        <a href="/privacy" style="color:var(--color-primary);text-decoration:none">{t('legal.privacy')}</a>
        <a href="/history" style="color:var(--color-primary);text-decoration:none">{t('info.history')}</a>
        <a href="/report-bug" style="color:var(--color-primary);text-decoration:none">{t('legal.report_bug')}</a>
      </div>
    </div>
  );
}
