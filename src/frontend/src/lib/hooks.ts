import type { FarmRole } from '@litcrop/shared';

export const LS_FARM_ID = 'litcrop-farmId';
export const LS_FARM_NAME = 'litcrop-farmName';
export const LS_FARM_LIST = 'litcrop-farmList';

export function useLocalFarmId(defaultId: string): string {
  return (typeof window !== 'undefined' && localStorage.getItem(LS_FARM_ID)) || defaultId;
}

/** Persist the active farm ID to localStorage. */
export function setLocalFarmId(farmId: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(LS_FARM_ID, farmId);
  }
}

interface FarmListItem {
  id: string;
  name: string;
  role: FarmRole;
}

/** Read cached farm list from localStorage. Returns empty array if none. */
export function useLocalFarmList(): FarmListItem[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem(LS_FARM_LIST);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as FarmListItem[]) : [];
  } catch {
    return [];
  }
}

/** Persist farm list to localStorage. */
export function setLocalFarmList(farms: FarmListItem[]): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(LS_FARM_LIST, JSON.stringify(farms));
  }
}

/**
 * Return the role the current user has for the active farm.
 * Reads from the cached farm list. Defaults to 'observer' when unknown,
 * so UI write controls are hidden until the list is loaded.
 */
export function getLocalFarmRole(): FarmRole {
  const farmId = typeof window !== 'undefined' ? localStorage.getItem(LS_FARM_ID) : null;
  if (!farmId) return 'observer';
  const match = useLocalFarmList().find((f) => f.id === farmId);
  return match?.role ?? 'observer';
}

// ── Admin cache ───────────────────────────────────────────────────

const LS_IS_ADMIN = 'litcrop-isAdmin';

export function getCachedIsAdmin(): boolean {
  try {
    return localStorage.getItem(LS_IS_ADMIN) === 'true';
  } catch {
    return false;
  }
}

export function setCachedIsAdmin(value: boolean): void {
  try {
    localStorage.setItem(LS_IS_ADMIN, String(value));
  } catch {}
  // Notify nav components to re-render with updated admin state
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('litcrop:admin-updated'));
  }
}

type TempUnit = 'C' | 'F';

/** Read temperature unit preference from localStorage. Defaults to 'C'. */
export function useTempUnit(): TempUnit {
  if (typeof window === 'undefined') return 'C';
  const stored = localStorage.getItem('litcrop-temp-unit');
  return stored === 'F' ? 'F' : 'C';
}

/** Convert Celsius to the user's preferred unit and return formatted string. */
export function formatTemp(celsius: number, unit?: TempUnit): string {
  const u = unit ?? useTempUnit();
  if (u === 'F') {
    return `${Math.round(celsius * 9 / 5 + 32)}°F`;
  }
  return `${Math.round(celsius)}°C`;
}
