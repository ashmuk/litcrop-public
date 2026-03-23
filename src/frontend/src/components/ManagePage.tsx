/**
 * ManagePage — F-01: IoT Camera Node Monitoring
 * Read-only list of camera nodes derived from Image records.
 * Groups images by node_id across all beds in the current farm.
 *
 * Known limitation: fetches first page of images per bed (N+1 pattern).
 * Acceptable for MVP with <10 beds. Replace with a server-side aggregate
 * endpoint (GET /farms/:farmId/nodes) for PROD-1.
 */

import { useState, useEffect } from 'preact/hooks';
import type { ImageListItem } from '@litcrop/shared';
import { getBeds, getImages } from '../lib/api';
import { t } from '../i18n/i18n';
import { useLocalFarmId } from '../lib/hooks';
import { formatRelativeTime } from '../lib/format';

interface NodeSummary {
  node_id: string;
  image_count: number;
  last_upload: string;
  bed_names: string[];
}

export interface Props {
  farmId: string;
}

export default function ManagePage({ farmId }: Props) {
  const [nodes, setNodes] = useState<NodeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const effectiveFarmId = useLocalFarmId(farmId);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const beds = await getBeds(effectiveFarmId);
        if (cancelled) return;

        const allImages: Array<ImageListItem & { bed_name: string }> = [];
        await Promise.all(
          beds.map(async (bed) => {
            try {
              const result = await getImages(bed.id);
              if (cancelled) return;
              for (const img of result.data) {
                allImages.push({ ...img, bed_name: bed.name });
              }
            } catch {
              // Skip beds with no images or access issues
            }
          }),
        );
        if (cancelled) return;

        const nodeMap = new Map<string, NodeSummary>();
        for (const img of allImages) {
          const existing = nodeMap.get(img.node_id);
          if (existing) {
            existing.image_count++;
            if (img.captured_at > existing.last_upload) {
              existing.last_upload = img.captured_at;
            }
            if (!existing.bed_names.includes(img.bed_name)) {
              existing.bed_names.push(img.bed_name);
            }
          } else {
            nodeMap.set(img.node_id, {
              node_id: img.node_id,
              image_count: 1,
              last_upload: img.captured_at,
              bed_names: [img.bed_name],
            });
          }
        }

        const sorted = [...nodeMap.values()].sort(
          (a, b) => new Date(b.last_upload).getTime() - new Date(a.last_upload).getTime(),
        );
        setNodes(sorted);
      } catch {
        if (!cancelled) setError(t('farm.error_loading'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [effectiveFarmId]);

  if (loading) {
    return (
      <div style="padding:var(--space-4);display:flex;flex-direction:column;gap:var(--space-3)">
        {[0, 1, 2].map((i) => <div key={i} class="skeleton skeleton-tile" />)}
      </div>
    );
  }

  if (error) {
    return (
      <div class="empty-state">
        <span class="empty-state__icon">⚠️</span>
        <p class="empty-state__heading">{t('farm.error_loading')}</p>
        <p class="empty-state__body">{t('farm.error_body')}</p>
        <button class="btn-primary mt-4" onClick={() => location.reload()}>
          {t('buttons.retry')}
        </button>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div class="empty-state" style="padding:var(--space-8)">
        <span class="empty-state__icon">📡</span>
        <p class="empty-state__heading">{t('manage.no_nodes')}</p>
        <p class="empty-state__body">{t('manage.no_nodes_body')}</p>
      </div>
    );
  }

  return (
    <div style="padding:var(--space-4);display:flex;flex-direction:column;gap:var(--space-3)">
      <div class="section-heading">{t('manage.camera_nodes')}</div>
      {nodes.map((node) => (
        <div
          key={node.node_id}
          style="background:var(--color-surface);border:var(--border-default);border-radius:var(--radius-md);padding:var(--space-4);display:flex;flex-direction:column;gap:var(--space-2)"
        >
          <div style="display:flex;align-items:center;justify-content:space-between">
            <div style="display:flex;align-items:center;gap:var(--space-2)">
              <span style="font-size:20px" aria-hidden="true">📷</span>
              <span style="font-weight:var(--font-weight-semibold)">{node.node_id}</span>
            </div>
            <span
              style="font-size:var(--font-size-xs);color:var(--color-gray-500)"
            >
              {formatRelativeTime(node.last_upload)}
            </span>
          </div>
          <div
            style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2);font-size:var(--font-size-sm)"
          >
            <div>
              <div style="color:var(--color-gray-500);font-size:var(--font-size-xs)">
                {t('manage.image_count')}
              </div>
              <div style="font-weight:var(--font-weight-semibold)">{node.image_count}</div>
            </div>
            <div>
              <div style="color:var(--color-gray-500);font-size:var(--font-size-xs)">
                {t('manage.target_bed')}
              </div>
              <div style="font-weight:var(--font-weight-semibold)">{node.bed_names.join(', ')}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
