import { useCallback, useEffect, useState } from 'preact/hooks';
import type { ActivityItem } from '@litcrop/shared';
import { ActivityFeedResponseSchema } from '@litcrop/shared';
import { getMyActivity } from './api';

export interface UseMeActivityResult {
  items: ActivityItem[];
  loading: boolean;
  /** True during the initial fetch only — distinguishes first-load skeleton from Load-more spinner. */
  initialLoading: boolean;
  error: string | null;
  hasMore: boolean;
  totalCount: number;
  loadMore: () => void;
  retry: () => void;
}

/**
 * Fetches the user's activity feed and manages cursor-based pagination.
 * The cursor is opaque — the hook round-trips next_cursor without inspecting
 * it. Response is Zod-validated against ActivityFeedResponseSchema so a
 * schema-broken server response surfaces as an error rather than silently
 * rendering malformed items.
 */
export function useMeActivity(initialLimit = 20): UseMeActivityResult {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const fetchPage = useCallback(
    async (nextCursor: string | null, append: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const raw = await getMyActivity({
          cursor: nextCursor ?? undefined,
          limit: initialLimit,
        });
        const parsed = ActivityFeedResponseSchema.safeParse(raw);
        if (!parsed.success) {
          setError('parse_error');
          return;
        }
        const body = parsed.data;
        setItems((prev) => (append ? [...prev, ...body.items] : body.items));
        setCursor(body.next_cursor);
        setHasMore(body.next_cursor !== null);
        setTotalCount(body.total_count);
      } catch {
        setError('fetch_error');
      } finally {
        setLoading(false);
        setInitialLoading(false);
      }
    },
    [initialLimit],
  );

  // Initial fetch + reload trigger.
  useEffect(() => {
    void fetchPage(null, false);
  }, [fetchPage, reloadKey]);

  const loadMore = useCallback(() => {
    if (!cursor || loading) return;
    void fetchPage(cursor, true);
  }, [cursor, loading, fetchPage]);

  const retry = useCallback(() => {
    setInitialLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  return { items, loading, initialLoading, error, hasMore, totalCount, loadMore, retry };
}
