/**
 * Desktop Navigation Bar Island — T-DESK-06
 *
 * Displayed only at 1024px+ via CSS (display:none → display:flex).
 * Shows: LitCrop brand | Crops · Weather · Device · Profile [· Admin] | user email + logout
 *
 * Reads the active tab from `activeTab` prop (passed from BaseLayout).
 * User email is read from localStorage on mount.
 * Admin tab shown only when litcrop-isAdmin cache is 'true'.
 */

import { useState, useEffect } from 'preact/hooks';
import { getCurrentUser, signOut } from '../lib/auth';
import { getCachedIsAdmin } from '../lib/hooks';
import { t } from '../i18n/i18n';
import { showToast } from './Toast';

export interface Props {
  activeTab?: 'farm' | 'weather' | 'manage' | 'setup' | 'admin';
}

const NAV_ITEMS: { tab: Props['activeTab']; href: string; icon: string; labelKey: string }[] = [
  { tab: 'farm',     href: '/',         icon: '🌾', labelKey: 'nav.farm' },
  { tab: 'weather',  href: '/weather',  icon: '⛅', labelKey: 'nav.weather' },
  { tab: 'manage',   href: '/manage/',  icon: '📡', labelKey: 'nav.manage' },
  { tab: 'setup',    href: '/profile/', icon: '🌱', labelKey: 'nav.setup' },
];

export default function DesktopNav({ activeTab = 'farm' }: Props) {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const isAdmin = getCachedIsAdmin();

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
        {isAdmin && (
          <a
            href="/admin/"
            class={`desktop-nav__link${activeTab === 'admin' ? ' desktop-nav__link--active' : ''}`}
            aria-current={activeTab === 'admin' ? 'page' : undefined}
          >
            <span aria-hidden="true">⚙️</span>
            {t('nav.admin')}
          </a>
        )}
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
