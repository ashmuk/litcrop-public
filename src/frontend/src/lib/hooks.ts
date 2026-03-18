export function useLocalFarmId(defaultId: string): string {
  return (typeof window !== 'undefined' && localStorage.getItem('litcrop-farmId')) || defaultId;
}
