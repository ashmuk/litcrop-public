/**
 * VersionHistory — Preact island for /history
 * Renders the version changelog extracted from LegalPage.tsx's WhatsNewContent.
 * Standalone component so it can be used on the dedicated /history route.
 */

import { t } from '../i18n/i18n';

function VersionEntry({
  version,
  date,
  items,
  current,
}: {
  version: string;
  date: string;
  items: string[];
  current?: boolean;
}) {
  return (
    <div
      style={`margin-bottom:var(--space-6);padding:var(--space-4);background:var(--color-surface);border:var(--border-default);border-radius:var(--radius-md)${current ? ';border-left:3px solid var(--color-primary)' : ''}`}
    >
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

export default function VersionHistory() {
  return (
    <div style="max-width:640px;margin:0 auto;padding:var(--space-4) var(--space-4) var(--space-8)">
      {/* Back link */}
      <div style="margin-bottom:var(--space-4)">
        <a href="/profile/?tab=system" style="font-size:var(--font-size-sm);color:var(--color-primary);text-decoration:none">
          &larr; {t('legal.back_to_app')}
        </a>
      </div>

      <h1 style="font-size:var(--font-size-xl);font-weight:var(--font-weight-bold);margin-bottom:var(--space-2);color:var(--color-text)">
        {t('info.history')}
      </h1>

      <p style="font-size:var(--font-size-xs);color:var(--color-gray-400);margin-bottom:var(--space-5)">
        {t('legal.whats_new_intro')}
      </p>

      <VersionEntry
        version="v0.99.8.3"
        date="2026-04-29"
        items={[
          t('changelog.v0998_3_item_1'),
          t('changelog.v0998_3_item_2'),
        ]}
        current
      />
      <VersionEntry
        version="v0.99.8.2"
        date="2026-04-29"
        items={[
          t('changelog.v0998_2_item_1'),
          t('changelog.v0998_2_item_2'),
        ]}
      />
      <VersionEntry
        version="v0.99.8.1"
        date="2026-04-28"
        items={[
          t('changelog.v0998_1_item_1'),
          t('changelog.v0998_1_item_2'),
          t('changelog.v0998_1_item_3'),
        ]}
      />
      <VersionEntry
        version="v0.99.8.0"
        date="2026-04-24"
        items={[
          t('changelog.v0998_0_item_1'),
          t('changelog.v0998_0_item_2'),
          t('changelog.v0998_0_item_3'),
        ]}
      />
      <VersionEntry
        version="v0.99.7.6"
        date="2026-04-24"
        items={[t('changelog.v0997_6_item_1')]}
      />
      <VersionEntry
        version="v0.99.7.5"
        date="2026-04-23"
        items={[
          t('changelog.v0997_5_item_1'),
          t('changelog.v0997_5_item_2'),
        ]}
      />
      <VersionEntry
        version="v0.99.7.4"
        date="2026-04-21"
        items={[
          t('changelog.v0997_4_item_1'),
          t('changelog.v0997_4_item_2'),
          t('changelog.v0997_4_item_3'),
        ]}
      />
      <VersionEntry
        version="v0.99.7.3"
        date="2026-04-20"
        items={[t('changelog.v0997_3_item_1')]}
      />
      <VersionEntry
        version="v0.99.7.2"
        date="2026-04-20"
        items={[
          t('changelog.v0997_2_item_1'),
          t('changelog.v0997_2_item_2'),
        ]}
      />
      <VersionEntry
        version="v0.99.7.1"
        date="2026-04-20"
        items={[
          t('changelog.v0997_1_item_1'),
          t('changelog.v0997_1_item_2'),
        ]}
      />
      <VersionEntry
        version="v0.99.7"
        date="2026-04-20"
        items={[
          t('changelog.v0997_item_1'),
          t('changelog.v0997_item_2'),
          t('changelog.v0997_item_3'),
        ]}
      />
      <VersionEntry
        version="v0.99.6.5"
        date="2026-04-20"
        items={[
          t('changelog.v0996_5_item_1'),
          t('changelog.v0996_5_item_2'),
        ]}
      />
      <VersionEntry
        version="v0.99.6.3"
        date="2026-04-18"
        items={[t('changelog.v0996_3_item_1')]}
      />
      <VersionEntry
        version="v0.99.6.2"
        date="2026-04-18"
        items={[
          t('changelog.v0996_2_item_1'),
          t('changelog.v0996_2_item_2'),
          t('changelog.v0996_2_item_3'),
        ]}
      />
      <VersionEntry
        version="v0.99.6.1"
        date="2026-04-18"
        items={[t('changelog.v0996_1_item_1')]}
      />
      <VersionEntry
        version="v0.99.6"
        date="2026-04-18"
        items={[
          t('changelog.v0996_item_1'),
          t('changelog.v0996_item_2'),
        ]}
      />
      <VersionEntry
        version="v0.99.5"
        date="2026-04-18"
        items={[t('changelog.v0995_item_1'), t('changelog.v0995_item_2')]}
      />
      <VersionEntry
        version="v0.99.4"
        date="2026-04-17"
        items={[t('changelog.v0994_item_1'), t('changelog.v0994_item_2')]}
      />
      <VersionEntry
        version="v0.99.3"
        date="2026-04-17"
        items={[t('changelog.v0993_item_1')]}
      />
      <VersionEntry
        version="v0.99.2"
        date="2026-04-17"
        items={[t('changelog.v0992_item_1'), t('changelog.v0992_item_2')]}
      />
      <VersionEntry
        version="v0.99.1"
        date="2026-04-16"
        items={[t('changelog.v0991_item_1')]}
      />
      <VersionEntry
        version="v0.99"
        date="2026-04-16"
        items={[t('changelog.v099_item_1'), t('changelog.v099_item_2')]}
      />
      <VersionEntry
        version="v0.98"
        date="2026-04-15"
        items={[t('changelog.v098_item_1')]}
      />
      <VersionEntry
        version="v0.97"
        date="2026-04-15"
        items={[t('changelog.v097_item_1')]}
      />
      <VersionEntry
        version="v0.96"
        date="2026-04-15"
        items={[t('changelog.v096_item_1')]}
      />
      <VersionEntry
        version="v0.95"
        date="2026-04-14"
        items={[t('changelog.v095_item_1')]}
      />
      <VersionEntry
        version="v0.94"
        date="2026-04-14"
        items={[t('changelog.v094_item_1')]}
      />
      <VersionEntry
        version="v0.93"
        date="2026-04-13"
        items={[t('changelog.v093_item_1')]}
      />
      <VersionEntry
        version="v0.92"
        date="2026-04-13"
        items={[t('changelog.v092_item_1')]}
      />
      <VersionEntry
        version="v0.91"
        date="2026-04-12"
        items={[t('changelog.v091_item_1')]}
      />
      <VersionEntry
        version="v0.90"
        date="2026-04-11"
        items={[t('changelog.v090_item_1')]}
      />

      {/* Footer link row */}
      <div style="margin-top:var(--space-6);padding-top:var(--space-4);border-top:var(--border-default);display:flex;gap:var(--space-4);font-size:var(--font-size-xs)">
        <a href="/terms" style="color:var(--color-primary);text-decoration:none">{t('legal.terms')}</a>
        <a href="/privacy" style="color:var(--color-primary);text-decoration:none">{t('legal.privacy')}</a>
        <a href="/report-bug" style="color:var(--color-primary);text-decoration:none">{t('legal.report_bug')}</a>
      </div>
    </div>
  );
}
