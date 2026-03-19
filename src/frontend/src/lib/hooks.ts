export function useLocalFarmId(defaultId: string): string {
  return (typeof window !== 'undefined' && localStorage.getItem('litcrop-farmId')) || defaultId;
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
