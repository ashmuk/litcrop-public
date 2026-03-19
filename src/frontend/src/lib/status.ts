import type { PlotStatus, TagValue } from '@litcrop/shared';

export const STATUS_CSS: Record<PlotStatus, string> = {
  issue: 'status-issue',
  animal_intrusion: 'status-intrusion',
  slow_growth: 'status-slow',
  healthy: 'status-healthy',
  no_data: 'status-nodata',
};

export const STATUS_ICONS: Record<PlotStatus, string> = {
  issue: '⚠',
  animal_intrusion: '🦌',
  slow_growth: '⏱',
  healthy: '✓',
  no_data: '—',
};

export const TAG_ICONS: Record<TagValue, string> = {
  healthy: '✓',
  slow_growth: '⏱',
  issue: '⚠',
  animal_intrusion: '🦌',
};
