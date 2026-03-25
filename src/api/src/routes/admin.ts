/**
 * Admin Routes — /api/v1/admin/*
 *
 * Returns entity counts, user list, farm list, and global budget for operators.
 * Access is restricted to users whose email appears in ADMIN_EMAILS env var,
 * using the same isAdmin flag from getAuthContext() (unified mechanism).
 * Returns 403 for all other authenticated users.
 */

import type { Context } from 'hono';
import { Hono } from 'hono';
import { getAuthContext } from '../middleware/auth';
import { dynamoRepo } from '../services/dynamodb';
import { getUsage } from '../services/budget';
import { ServiceUnavailableError } from '../errors';

const router = new Hono();

/**
 * Extracts auth context and verifies admin access via isAdmin (ADMIN_EMAILS).
 * Returns { userId } on success, or a 403 Response if not authorized.
 */
function requireAdmin(c: Context): { userId: string } | Response {
  const { userId, isAdmin } = getAuthContext(c);
  if (!isAdmin) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Not authorized' } }, 403);
  }
  return { userId };
}

// ── GET /api/v1/admin/stats ───────────────────────────────────────

router.get('/stats', async (c) => {
  const result = requireAdmin(c);
  if (result instanceof Response) return result;
  const { userId } = result;

  try {
    const [counts, usage] = await Promise.all([
      dynamoRepo.getStats(),
      getUsage(userId),
    ]);

    return c.json({
      entity_counts: counts,
      global_budget: usage.global_budget,
      period_start: usage.period_start,
      reset_at: usage.reset_at,
    });
  } catch (err) {
    console.error('[admin] failed to fetch stats', err);
    throw new ServiceUnavailableError('Unable to retrieve admin stats');
  }
});

// ── GET /api/v1/admin/users ───────────────────────────────────────

router.get('/users', async (c) => {
  const result = requireAdmin(c);
  if (result instanceof Response) return result;
  try {
    const profiles = await dynamoRepo.getAllUserProfiles();
    return c.json({ users: profiles, total: profiles.length });
  } catch (err) {
    console.error('[admin] failed to fetch users', err);
    throw new ServiceUnavailableError('Unable to retrieve user list');
  }
});

// ── GET /api/v1/admin/farms ───────────────────────────────────────

router.get('/farms', async (c) => {
  const result = requireAdmin(c);
  if (result instanceof Response) return result;
  try {
    const farms = await dynamoRepo.getAllFarms();
    const farmsWithCounts = await Promise.all(
      farms.map(async (farm) => {
        const members = await dynamoRepo.getFarmMembers(farm.id);
        return {
          id: farm.id,
          name: farm.name,
          latitude: farm.latitude,
          longitude: farm.longitude,
          grid_rows: farm.grid_rows,
          grid_cols: farm.grid_cols,
          member_count: members.length,
          created_at: farm.created_at,
        };
      }),
    );
    return c.json({ farms: farmsWithCounts, total: farmsWithCounts.length });
  } catch (err) {
    console.error('[admin] failed to fetch farms', err);
    throw new ServiceUnavailableError('Unable to retrieve farm list');
  }
});

export default router;
