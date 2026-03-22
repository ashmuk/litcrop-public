import type { FarmRole } from '@litcrop/shared';

export const LS_FARM_ID = 'litcrop-farmId';
export const LS_FARM_NAME = 'litcrop-farmName';

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
  const raw = localStorage.getItem('litcrop-farmList');
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
    localStorage.setItem('litcrop-farmList', JSON.stringify(farms));
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
