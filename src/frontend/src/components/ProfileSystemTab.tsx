import type { Locale } from '@litcrop/shared';
import { LOCALE_OPTIONS } from '@litcrop/shared';
import { t } from '../i18n/i18n';
import ThemeSwitcher from './ThemeSwitcher';

interface ProfileSystemTabProps {
  locale: Locale;
  tempUnit: 'C' | 'F';
  onLocaleChange: (l: Locale) => void;
  onTempUnitChange: (u: 'C' | 'F') => void;
}

const infoLinkStyle = 'display:flex;align-items:center;gap:var(--space-2);padding:var(--space-3) 0;border-bottom:var(--border-default);font-size:var(--font-size-sm);color:var(--color-primary);text-decoration:none';
const infoLinkLastStyle = 'display:flex;align-items:center;gap:var(--space-2);padding:var(--space-3) 0;font-size:var(--font-size-sm);color:var(--color-primary);text-decoration:none';
const arrowStyle = 'margin-left:auto;color:var(--color-gray-300)';

const cardStyle = 'background:var(--color-surface);border:var(--border-default);border-radius:var(--radius-lg);padding:var(--space-4);margin-bottom:var(--space-4)';
const cardHeadingStyle = 'font-size:var(--font-size-md);font-weight:var(--font-weight-semibold);margin-bottom:var(--space-3);color:var(--color-text);display:flex;align-items:center;gap:var(--space-2)';

export default function ProfileSystemTab({
  locale,
  tempUnit,
  onLocaleChange,
  onTempUnitChange,
}: ProfileSystemTabProps) {
  return (
    <section>
      <h2 style="font-size:var(--font-size-lg);font-weight:var(--font-weight-bold);margin-bottom:var(--space-3);color:var(--color-text)">
        ⚙ {t('profile.app_settings')}
      </h2>

      {/* App Settings card */}
      <div style={cardStyle}>
        <div style={cardHeadingStyle}>
          ⚙ {t('profile.app_settings')}
        </div>

        <ThemeSwitcher />

        <div class="form-group">
          <label class="form-label" for="system-locale">
            {t('settings.locale')}
          </label>
          <select
            id="system-locale"
            class="form-select"
            value={locale}
            onChange={(e) => onLocaleChange((e.target as HTMLSelectElement).value as Locale)}
            aria-label="Language selection"
          >
            {LOCALE_OPTIONS.map((loc) => (
              <option key={loc} value={loc}>
                {t(`settings.locales.${loc}`)}
              </option>
            ))}
          </select>
        </div>

        <div class="form-group" style="margin-bottom:0">
          <label class="form-label" for="system-temp">
            {t('settings.temp_unit')}
          </label>
          <select
            id="system-temp"
            class="form-select"
            value={tempUnit}
            onChange={(e) => onTempUnitChange((e.target as HTMLSelectElement).value as 'C' | 'F')}
            aria-label="Temperature unit"
          >
            <option value="C">{t('settings.temp_units.C')}</option>
            <option value="F">{t('settings.temp_units.F')}</option>
          </select>
        </div>
      </div>

      {/* Help card */}
      <div style={cardStyle}>
        <div style={cardHeadingStyle}>
          📚 {t('profile.section_help')}
        </div>
        <a href="/help/getting-started" style={infoLinkStyle}>
          <span>🌱</span>
          <span>{t('help.getting_started')}</span>
          <span style={arrowStyle}>›</span>
        </a>
        <a href="/help/device-setup" style={infoLinkLastStyle}>
          <span>📡</span>
          <span>{t('help.device_setup')}</span>
          <span style={arrowStyle}>›</span>
        </a>
      </div>

      {/* Info card */}
      <div style={cardStyle}>
        <div style={cardHeadingStyle}>
          ℹ {t('profile.section_info')}
        </div>
        <a href="/history" style={infoLinkStyle}>
          <span>📋</span>
          <span>{t('info.history')}</span>
          <span style={arrowStyle}>›</span>
        </a>
        <a href="/terms" style={infoLinkStyle}>
          <span>📜</span>
          <span>{t('legal.terms')}</span>
          <span style={arrowStyle}>›</span>
        </a>
        <a href="/privacy" style={infoLinkStyle}>
          <span>🔒</span>
          <span>{t('legal.privacy')}</span>
          <span style={arrowStyle}>›</span>
        </a>
        <a href="/report-bug" style={infoLinkLastStyle}>
          <span>🐛</span>
          <span>{t('legal.report_bug')}</span>
          <span style={arrowStyle}>›</span>
        </a>
      </div>

      {/* Version footer */}
      <p style="text-align:center;color:var(--color-gray-400);font-size:var(--font-size-xs);padding:var(--space-3) 0 var(--space-6)">
        LitCrop {__APP_VERSION__}
      </p>
    </section>
  );
}
