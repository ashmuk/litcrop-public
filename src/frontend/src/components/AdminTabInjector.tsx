/**
 * AdminTabInjector — injects admin tab into mobile bottom nav bar.
 *
 * The mobile tab bar is static Astro HTML (.tab-bar), not a Preact component.
 * This island appends a 5th "Admin" tab using safe DOM methods when the
 * cached isAdmin flag is true.
 */

import { useEffect } from 'preact/hooks';
import { getCachedIsAdmin } from '../lib/hooks';

interface Props {
  active?: boolean;
}

export default function AdminTabInjector({ active = false }: Props) {
  useEffect(() => {
    if (!getCachedIsAdmin()) return;
    const tabBar = document.querySelector('.tab-bar');
    if (!tabBar || tabBar.querySelector('[href="/admin/"]')) return;

    const link = document.createElement('a');
    link.href = '/admin/';
    link.className = `tab-bar__item${active ? ' tab-bar__item--active' : ''}`;
    link.setAttribute('aria-label', 'Admin dashboard');
    if (active) link.setAttribute('aria-current', 'page');

    const icon = document.createElement('span');
    icon.className = 'tab-bar__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '\u2699\uFE0F';

    const label = document.createElement('span');
    label.className = 'tab-bar__label';
    label.setAttribute('data-i18n', 'nav.admin');
    label.textContent = 'Admin';

    link.appendChild(icon);
    link.appendChild(label);
    tabBar.appendChild(link);
  }, []);

  return null;
}
