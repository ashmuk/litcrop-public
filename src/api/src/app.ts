import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { AppError, InternalError } from './errors';
import { authMiddleware } from './middleware/auth';
import farmsRouter from './routes/farms';
import farmMembersRouter from './routes/farm-members';
import bedsRouter from './routes/beds';
import plotsRouter from './routes/plots';
import imagesRouter from './routes/images';
import weatherRouter from './routes/weather';
import chatRouter from './routes/chat';
import usageRouter from './routes/usage';
import adminRouter from './routes/admin';
import meRouter from './routes/me';
import { farmDevicesRouter, deviceRouter } from './routes/devices';
import diaryRouter from './routes/diary';
import cropLibraryRouter from './routes/crop-library';

// ── Notification subscriptions (must import to initialize) ──────
// This side-effect import registers all event subscribers at module load time.
// Events emitted by route handlers will trigger email notifications.
import './services/notification';

// ── Activity log subscriptions (must import to initialize) ───────
// Registers subscribers for all 14 event types; writes ACTIVITY# items to DynamoDB.
import './services/activity';

const CLOUDFRONT_ORIGIN = process.env.CLOUDFRONT_ORIGIN;

const app = new Hono();

// ── CORS ─────────────────────────────────────────────────────────

const corsOrigins = [
  'http://localhost:4321',
  'http://localhost:3000',
  ...(CLOUDFRONT_ORIGIN ? [CLOUDFRONT_ORIGIN] : []),
];

app.use(
  '*',
  cors({
    origin: corsOrigins,
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Accept', 'Accept-Language', 'X-Request-Id', 'Authorization', 'X-Device-Key'],
    exposeHeaders: ['X-Request-Id'],
    maxAge: 86400,
    credentials: false,
  }),
);

// ── Request ID ───────────────────────────────────────────────────

app.use('*', async (c, next) => {
  const requestId = c.req.header('X-Request-Id') ?? crypto.randomUUID();
  c.set('requestId' as never, requestId);
  await next();
  c.res.headers.set('X-Request-Id', requestId);
});

// ── Structured JSON Logger ───────────────────────────────────────

app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  const requestId = c.res.headers.get('X-Request-Id') ?? '-';
  console.log(JSON.stringify({
    requestId,
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    ms,
  }));
});

// ── Content-Type validation for mutation routes ───────────────────

app.use('/api/v1/*', async (c, next) => {
  const method = c.req.method;
  if (method === 'POST' || method === 'PATCH') {
    const ct = c.req.header('Content-Type') ?? '';
    // Image upload accepts multipart/form-data; raw image endpoints accept image/* or
    // application/octet-stream; all other mutation endpoints require application/json.
    const isImageUpload = ct.startsWith('image/') || ct === 'application/octet-stream';
    const isJson = ct.startsWith('application/json');
    const isMultipart = ct.startsWith('multipart/form-data');
    if (!isJson && !isImageUpload && !isMultipart) {
      return c.json(
        {
          error: {
            code: 'UNSUPPORTED_MEDIA_TYPE',
            message: 'Content-Type must be application/json',
          },
        },
        415,
      );
    }
  }
  await next();
});

// ── Global error handler ─────────────────────────────────────────

app.onError((err, c) => {
  if (err instanceof AppError) {
    const body: Record<string, unknown> = {
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    };
    return c.json(body, err.statusCode as 400 | 401 | 404 | 409 | 413 | 415 | 429 | 500 | 502 | 503);
  }

  // Malformed JSON body — return 400 instead of 500
  if (err instanceof SyntaxError) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid JSON in request body' } }, 400);
  }

  // Unknown error — structured log and return generic 500
  const internal = new InternalError();
  const reqId = c.res.headers.get('X-Request-Id') ?? '-';
  console.error(JSON.stringify({ level: 'error', requestId: reqId, error: String(err) }));
  return c.json(
    { error: { code: internal.code, message: internal.message } },
    500,
  );
});

// ── Auth middleware (T-AUTH-01) ───────────────────────────────────
// Applied per-resource so /api/v1/health and /api/v1 stay public.
// Each resource needs both the root path and /* to cover POST /farms and GET /farms/:id.

app.use('/api/v1/farms', authMiddleware);
app.use('/api/v1/farms/*', authMiddleware);
app.use('/api/v1/beds', authMiddleware);
app.use('/api/v1/beds/*', authMiddleware);
app.use('/api/v1/plots', authMiddleware);
app.use('/api/v1/plots/*', authMiddleware);
app.use('/api/v1/images', authMiddleware);
app.use('/api/v1/images/*', authMiddleware);
app.use('/api/v1/chat', authMiddleware);
app.use('/api/v1/usage', authMiddleware);
app.use('/api/v1/admin', authMiddleware);
app.use('/api/v1/admin/*', authMiddleware);
app.use('/api/v1/me', authMiddleware);
app.use('/api/v1/me/*', authMiddleware);
app.use('/api/v1/devices', authMiddleware);
app.use('/api/v1/devices/*', authMiddleware);

// ── Routes ───────────────────────────────────────────────────────

app.get('/health', (c) => c.json({ status: 'ok', service: 'litcrop-api' }));
app.get('/api/v1/health', (c) => c.json({ status: 'ok', service: 'litcrop-api' }));
app.get('/api/v1', (c) => c.json({ version: '1', status: 'ok' }));

// GET|POST|PATCH|DELETE /api/v1/farms (CRUD + beds listing)
app.route('/api/v1/farms', farmsRouter);

// Discoverable farms, join requests, members CRUD, leave farm
app.route('/api/v1/farms', farmMembersRouter);

// GET /api/v1/farms/:farmId/weather
app.route('/api/v1/farms', weatherRouter);

// GET|PATCH /api/v1/beds/:bedId
// GET|POST /api/v1/beds/:bedId/images
app.route('/api/v1/beds', bedsRouter);

// GET /api/v1/plots/:plotId (410 Gone)
// GET|POST /api/v1/plots/:plotId/images (410 Gone)
app.route('/api/v1/plots', plotsRouter);

// GET /api/v1/images/:imageId
// POST /api/v1/images/:imageId/tags
app.route('/api/v1/images', imagesRouter);

// POST /api/v1/chat
app.route('/api/v1/chat', chatRouter);

// GET /api/v1/usage
app.route('/api/v1/usage', usageRouter);

// GET /api/v1/admin/stats
app.route('/api/v1/admin', adminRouter);

// GET|PATCH /api/v1/me/profile + profile-picture
app.route('/api/v1/me', meRouter);

// Device management (farm-scoped)
// POST|GET /api/v1/farms/:farmId/devices
// PATCH|DELETE /api/v1/farms/:farmId/devices/:deviceId
// POST /api/v1/farms/:farmId/devices/:deviceId/test-shot
app.route('/api/v1/farms', farmDevicesRouter);

// Device management (device-scoped, Pi-facing)
// GET /api/v1/devices/:deviceId/config
// POST /api/v1/devices/:deviceId/heartbeat
app.route('/api/v1/devices', deviceRouter);

// Diary management (farm-scoped, Beta-7)
// POST|GET /api/v1/farms/:farmId/diary
// GET|PATCH|DELETE /api/v1/farms/:farmId/diary/:entryId
app.route('/api/v1/farms', diaryRouter);

// Crop library (public reference data, no auth required, Beta-8 #274)
// GET /api/v1/crop-library
// GET /api/v1/crop-library/:cropId
app.route('/api/v1/crop-library', cropLibraryRouter);

export default app;
