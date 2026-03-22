/**
 * Plots routes — DEPRECATED (Phase D: Farm→Bed flattening)
 *
 * All plot endpoints now return 410 Gone, pointing callers to the
 * new /beds/ endpoints. Kept registered so existing clients get a
 * clear error message instead of 404.
 */

import { Hono } from 'hono';

const router = new Hono();

const GONE_MESSAGE = 'This endpoint has been removed. Use the /api/v1/beds/ endpoints instead.';

router.get('/:plotId', (c) =>
  c.json({ error: { code: 'GONE', message: GONE_MESSAGE } }, 410),
);

router.get('/:plotId/images', (c) =>
  c.json({ error: { code: 'GONE', message: GONE_MESSAGE } }, 410),
);

router.post('/:plotId/images', (c) =>
  c.json({ error: { code: 'GONE', message: GONE_MESSAGE } }, 410),
);

export default router;
