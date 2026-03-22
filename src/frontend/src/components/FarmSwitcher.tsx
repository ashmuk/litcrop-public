/**
 * FarmSwitcher — Phase B (Multi-Farm Foundation)
 *
 * Displays a dropdown of the user's farms. When a farm is selected, the
 * active farm ID is persisted to localStorage and the page data is refreshed.
 */

import { useState, useEffect } from 'preact/hooks';
import type { Farm, FarmRole } from '@litcrop/shared';
import { getMyFarms } from '../lib/api';
import { useLocalFarmId, setLocalFarmId, setLocalFarmList, LS_FARM_ID } from '../lib/hooks';

export interface FarmWithRole extends Farm {
  role: FarmRole;
}

interface Props {
  /** Default farm ID passed from server (e.g. from URL param or first-load). */
  defaultFarmId: string;
  /** Called when the user selects a different farm. */
  onFarmChange?: (farmId: string) => void;
}

export default function FarmSwitcher({ defaultFarmId, onFarmChange }: Props) {
  const [farms, setFarms] = useState<FarmWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const activeFarmId = useLocalFarmId(defaultFarmId);

  useEffect(() => {
    getMyFarms()
      .then((list) => {
        setFarms(list as FarmWithRole[]);
        setLocalFarmList(list);
        // If no active farm stored yet, persist the first one
        if (typeof window !== 'undefined' && !localStorage.getItem(LS_FARM_ID) && list.length > 0) {
          setLocalFarmId(list[0].id);
        }
      })
      .catch(() => {
        // Silent — switcher is non-critical
      })
      .finally(() => setLoading(false));
  }, []);

  function handleChange(e: Event) {
    const farmId = (e.target as HTMLSelectElement).value;
    setLocalFarmId(farmId);
    if (onFarmChange) {
      onFarmChange(farmId);
    } else {
      // Default: reload the page so all components pick up the new farmId
      window.location.reload();
    }
  }

  if (loading || farms.length <= 1) {
    // Don't render the switcher if there's only one farm — nothing to switch to
    return null;
  }

  return (
    <div class="farm-switcher">
      <label for="farm-select" class="farm-switcher__label">
        Farm
      </label>
      <select
        id="farm-select"
        class="farm-switcher__select"
        value={activeFarmId}
        onChange={handleChange}
      >
        {farms.map((farm) => (
          <option key={farm.id} value={farm.id}>
            {farm.name} ({farm.role})
          </option>
        ))}
      </select>
    </div>
  );
}
