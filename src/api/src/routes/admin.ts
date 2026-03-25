/**
 * Admin Stats Route — GET /api/v1/admin/stats
 *
 * Returns entity counts and global budget usage for operators.
 * Access is restricted to Cognito user IDs listed in ADMIN_USER_IDS env var
 * (comma-separated). Returns 403 for all other authenticated users.
 */

import { Hono } from 'hono';
import { getAuthContext } from '../middleware/auth';
import { dynamoRepo } from '../services/dynamodb';
import { getUsage } from '../services/budget';
import { ServiceUnavailableError } from '../errors';

const router = new Hono();

function getAdminIds(): string[] {
  return (process.env['ADMIN_USER_IDS'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// ── GET /api/v1/admin/stats ───────────────────────────────────────

router.get('/stats', async (c) => {
  const { userId } = getAuthContext(c);

  if (!getAdminIds().includes(userId)) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Not authorized' } }, 403);
  }

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
  const { userId } = getAuthContext(c);
  if (!getAdminIds().includes(userId)) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Not authorized' } }, 403);
  }

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
  const { userId } = getAuthContext(c);
  if (!getAdminIds().includes(userId)) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Not authorized' } }, 403);
  }

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
