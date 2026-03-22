/**
 * Desktop Navigation Bar Island — T-DESK-06
 *
 * Displayed only at 1024px+ via CSS (display:none → display:flex).
 * Shows: LitCrop brand | Crops · Weather · Profile · Settings | user email + logout
 *
 * Reads the active tab from `activeTab` prop (passed from BaseLayout).
 * User email is read from localStorage on mount.
 */

import { useState, useEffect } from 'preact/hooks';
import { getCurrentUser, signOut } from '../lib/auth';
import { t } from '../i18n/i18n';
import { showToast } from './Toast';

export interface Props {
  activeTab?: 'farm' | 'weather' | 'setup' | 'settings';
}

const NAV_ITEMS: { tab: Props['activeTab']; href: string; icon: string; labelKey: string }[] = [
  { tab: 'farm',     href: '/',         icon: '🌾', labelKey: 'nav.farm' },
  { tab: 'weather',  href: '/weather',  icon: '⛅', labelKey: 'nav.weather' },
  { tab: 'setup',    href: '/profile/',  icon: '🌱', labelKey: 'nav.setup' },
  { tab: 'settings', href: '/profile/',  icon: '⚙️', labelKey: 'nav.settings' },
];

export default function DesktopNav({ activeTab = 'farm' }: Props) {
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const user = getCurrentUser();
    if (user) setUserEmail(user.email);

    // React to sign-out events from other islands
    function onSignout() {
      setUserEmail(null);
    }
    window.addEventListener('litcrop:signout', onSignout);
    return () => window.removeEventListener('litcrop:signout', onSignout);
  }, []);

  function handleLogout() {
    signOut();
    showToast(t('auth.logout_confirm'), 'success');
    setTimeout(() => {
      window.location.replace('/login/');
    }, 800);
  }

  return (
    <nav class="desktop-nav" role="navigation" aria-label="Main navigation">
      {/* Brand */}
      <a href="/" class="desktop-nav__brand" aria-label="LitCrop home">
        <span class="desktop-nav__brand-icon" aria-hidden="true">🌾</span>
        LitCrop
      </a>

      {/* Navigation links */}
      <div class="desktop-nav__links">
        {NAV_ITEMS.map(({ tab, href, icon, labelKey }) => (
          <a
            key={tab}
            href={href}
            class={`desktop-nav__link${activeTab === tab ? ' desktop-nav__link--active' : ''}`}
            aria-current={activeTab === tab ? 'page' : undefined}
          >
            <span aria-hidden="true">{icon}</span>
            {t(labelKey)}
          </a>
        ))}
      </div>

      {/* User email + logout */}
      <div class="desktop-nav__right">
        {userEmail && (
          <span class="desktop-nav__user" title={userEmail}>
            {userEmail}
          </span>
        )}
        <button
          type="button"
          class="desktop-nav__logout"
          onClick={handleLogout}
          aria-label={t('auth.logout')}
        >
          {t('auth.logout')}
        </button>
      </div>
    </nav>
  );
}
