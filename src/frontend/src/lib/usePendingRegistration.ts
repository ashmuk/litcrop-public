/**
 * usePendingRegistration — owns profile-identity state for the Profile
 * page (display name, picture, admin flag, preferred role) and, on
 * mount, flushes any pre-login pending values from localStorage to the
 * server.
 *
 * Pre-login keys (set by the registration flow when the user has not
 * yet authenticated):
 *   - litcrop-pendingRole  → `preferred_role` (owner / staff)
 *   - litcrop-pendingName  → `display_name`
 *
 * On mount:
 *   1. Fetch the authoritative profile via `getMyProfile`.
 *   2. Seed state from the response (display_name, picture, is_admin,
 *      preferred_role).
 *   3. If pending localStorage values exist, push them via
 *      `updateMyProfile` and clear the keys on success. Pending values
 *      override the server's existing `preferred_role` / `display_name`
 *      because registration is the more recent signal.
 *
 * `setDisplayName` is returned so ProfilePage can drive the inline
 * "edit display name" UI — the rest of the fields are read-only from
 * the caller's perspective.
 */

import { useState, useEffect } from 'preact/hooks';
import { getMyProfile, updateMyProfile } from './api';
import { setCachedIsAdmin } from './hooks';

export type PreferredRole = 'owner' | 'staff';

export interface PendingRegistration {
  displayName: string;
  setDisplayName: (next: string) => void;
  profilePictureUrl: string | null;
  isSystemAdmin: boolean;
  preferredRole: PreferredRole | null;
}

export function usePendingRegistration(): PendingRegistration {
  const [displayName, setDisplayName] = useState('');
  const [profilePictureUrl, setProfilePictureUrl] = useState<string | null>(null);
  const [isSystemAdmin, setIsSystemAdmin] = useState(false);
  const [preferredRole, setPreferredRole] = useState<PreferredRole | null>(null);

  useEffect(() => {
    const pendingRole = localStorage.getItem('litcrop-pendingRole');
    const pendingName = localStorage.getItem('litcrop-pendingName');
    getMyProfile().then((p) => {
      if (p.display_name) setDisplayName(p.display_name);
      if (p.profile_picture_thumb_url) setProfilePictureUrl(p.profile_picture_thumb_url);
      if (p.is_admin) setIsSystemAdmin(true);
      setCachedIsAdmin(p.is_admin === true);
      if (pendingRole || pendingName) {
        const updates: Record<string, string> = {};
        if (pendingRole === 'owner' || pendingRole === 'staff') {
          setPreferredRole(pendingRole);
          updates['preferred_role'] = pendingRole;
        }
        if (pendingName) {
          setDisplayName(pendingName);
          updates['display_name'] = pendingName;
        }
        if (Object.keys(updates).length > 0) {
          updateMyProfile(updates)
            .then(() => {
              localStorage.removeItem('litcrop-pendingRole');
              localStorage.removeItem('litcrop-pendingName');
            })
            .catch(() => {});
        }
      } else if (p.preferred_role) {
        setPreferredRole(p.preferred_role);
      }
    }).catch(() => {});
  }, []);

  return { displayName, setDisplayName, profilePictureUrl, isSystemAdmin, preferredRole };
}
