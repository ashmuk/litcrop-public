import { Hono } from 'hono';
import { getAuthContext } from '../middleware/auth';
import { getUsage } from '../services/budget';
import { ServiceUnavailableError } from '../errors';

const router = new Hono();

// ── 5.12 GET /api/v1/usage ────────────────────────────────────────

router.get('/', async (c) => {
  const { userId } = getAuthContext(c);
  try {
    const usage = await getUsage(userId);
    return c.json(usage);
  } catch (err) {
    console.error('[usage] failed to fetch usage', err);
    throw new ServiceUnavailableError('Unable to retrieve usage data');
  }
});

export default router;
