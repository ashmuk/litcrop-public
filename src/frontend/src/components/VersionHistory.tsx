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
        version="v0.99.4"
        date="2026-04-17"
        items={[
          'New users are now visible in Admin immediately \u2014 profile auto-created on first page load',
          'Display name from registration syncs on any first page, not just Profile',
          'Earthy favicon: sandy background with sage-green sprout (matches app theme)',
          'CI build cache cleared on every deploy \u2014 fixes stale JS chunks that prevented prior features from shipping',
        ]}
        current
      />
      <VersionEntry
        version="v0.99.3"
        date="2026-04-17"
        items={[
          'Admin dashboard: Refresh button bypasses the stats cache so new users appear immediately',
          'Password show/hide toggle now tappable on mobile (was hidden behind iOS password manager overlay)',
          'Profile footer translated in Japanese locale',
        ]}
      />
      <VersionEntry
        version="v0.99.2"
        date="2026-04-17"
        items={[
          'Profile page reorganised into three tabs: Farms, You, System',
          'New /help/getting-started page with the 5-step platform guide',
          'New /history page with the full version changelog (replaces What\u2019s New)',
          'Desktop spacing gap between nav bar and pilot banner fixed',
          'Profile heading translates to Japanese in JA locale',
          '36 new tests covering tab switching, i18n keys, and link correctness',
        ]}
      />
      <VersionEntry
        version="v0.99.1"
        date="2026-04-16"
        items={[
          'Branded favicon — the LitCrop sprout icon now shows in browser tabs, bookmarks, and iOS/Android home screens',
          'Install LitCrop as a standalone app: tap "Add to Home Screen" for a full-screen experience without the browser chrome',
        ]}
      />
      <VersionEntry
        version="v0.99"
        date="2026-04-16"
        items={[
          'Content Security Policy hardened — inline-script allowance removed; only the app\u2019s own code can execute',
          'New help page for Pi Camera hardware setup at /help/device-setup (English and \u65e5\u672c\u8a9e), including the capture cycle diagram',
          'Branded social share card — LitCrop links posted on Slack, Twitter, LINE, or Discord now show an OG preview image',
          'Invitation code is now separate from the owner promotion code, so being invited no longer auto-grants owner privileges',
          'Developer-side: pre-commit hook catches cross-workspace type gaps locally before they reach CI',
        ]}
      />
      <VersionEntry
        version="v0.98"
        date="2026-04-15"
        items={[
          'Install script now accepts --branch so staging-served installs stay in sync with the deployed code',
          'Device hardware is auto-detected (battery HAT, PIR sensor) — no more silent Class-1 misclassification',
          'IAM least-privilege tightening for the ops principal (scoped API Gateway, CloudFront read-only, no role creation)',
        ]}
      />
      <VersionEntry
        version="v0.97"
        date="2026-04-15"
        items={[
          'Device capture hardening: full config round-trip (resolution, interval, active window)',
          'Active-window enforcement on the camera with [SKIP] heartbeat-only path',
          'Defense-in-depth HH:MM validation at API and on-device',
          'Applied / Pending config badge on the Device list — no more SSH to confirm propagation',
          'install.sh now prompts to install jq so UI-driven config changes always reach the device',
        ]}
      />
      <VersionEntry
        version="v0.96"
        date="2026-04-15"
        items={[
          'Public/private farm visibility toggle for discoverability',
          'What\u2019s New revised as a step-by-step platform guide',
          'ADR: farm-level promotion does not grant global owner capability',
        ]}
      />
      <VersionEntry
        version="v0.95"
        date="2026-04-14"
        items={[
          'Day-grouped image history with collapsible accordion',
          'Timelapse source filtering and date range selector',
          'Pilot mode: invitation code gate, notice banner, farm limit',
        ]}
      />
      <VersionEntry
        version="v0.94"
        date="2026-04-14"
        items={['User notification system: email + in-app + bell']}
      />
      <VersionEntry
        version="v0.93"
        date="2026-04-13"
        items={['Terms of Service, Privacy Policy, bug report form']}
      />
      <VersionEntry
        version="v0.92"
        date="2026-04-13"
        items={['WCAG 2.1 AA compliance, E2E tests, production hotfixes']}
      />
      <VersionEntry
        version="v0.91"
        date="2026-04-12"
        items={['Custom domain litcrop.com, environment separation']}
      />
      <VersionEntry
        version="v0.90"
        date="2026-04-11"
        items={['Production AWS resources, login redesign, device auth fix']}
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
