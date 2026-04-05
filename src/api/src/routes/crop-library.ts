import { Hono } from 'hono';
import { CROP_LIBRARY, getCropMeta } from '@litcrop/shared';
import { NotFoundError } from '../errors';

const cropLibraryRouter = new Hono();

// ── GET /api/v1/crop-library ─────────────────────────────────────
// Returns the full crop library (all entries). Public reference data.

cropLibraryRouter.get('/', (c) => {
  c.res.headers.set('Cache-Control', 'public, max-age=86400, immutable');
  return c.json({ data: CROP_LIBRARY });
});

// ── GET /api/v1/crop-library/:cropId ─────────────────────────────
// Returns crop metadata for a given crop ID. 404 if not found.

cropLibraryRouter.get('/:cropId', (c) => {
  const cropId = c.req.param('cropId');
  const entry = getCropMeta(cropId);
  if (!entry) {
    throw new NotFoundError(`Crop not found: ${cropId}`);
  }
  c.res.headers.set('Cache-Control', 'public, max-age=86400, immutable');
  return c.json(entry);
});

export default cropLibraryRouter;
