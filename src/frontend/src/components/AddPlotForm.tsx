/**
 * AddPlotForm — DEPRECATED (Phase D)
 * Plot creation is replaced by bed-grid-based farm creation via FarmWizard.
 * Redirects to /profile/ where users can create farms with bed grids.
 */

export interface Props {
  defaultFarmId: string;
}

export default function AddPlotForm({ defaultFarmId: _defaultFarmId }: Props) {
  if (typeof window !== 'undefined') {
    window.location.replace('/profile/');
  }
  return null;
}
