import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { AppError, InternalError } from './errors';
import { authMiddleware } from './middleware/auth';
import farmsRouter from './routes/farms';
import plotsRouter from './routes/plots';
import imagesRouter from './routes/images';
import weatherRouter from './routes/weather';
import chatRouter from './routes/chat';
import usageRouter from './routes/usage';
import adminRouter from './routes/admin';

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
    allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Accept', 'Accept-Language', 'X-Request-Id', 'Authorization'],
    exposeHeaders: ['X-Request-Id'],
    maxAge: 86400,
    credentials: false,
  }),
);

// ── Logger ───────────────────────────────────────────────────────

app.use('*', logger());

// ── Request ID ───────────────────────────────────────────────────

app.use('*', async (c, next) => {
  const requestId = c.req.header('X-Request-Id') ?? crypto.randomUUID();
  c.set('requestId' as never, requestId);
  await next();
  c.res.headers.set('X-Request-Id', requestId);
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

  // Unknown error — log and return generic 500
  const internal = new InternalError();
  console.error('[unhandled]', err);
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
app.use('/api/v1/plots', authMiddleware);
app.use('/api/v1/plots/*', authMiddleware);
app.use('/api/v1/images', authMiddleware);
app.use('/api/v1/images/*', authMiddleware);
app.use('/api/v1/chat', authMiddleware);
app.use('/api/v1/usage', authMiddleware);
app.use('/api/v1/admin', authMiddleware);
app.use('/api/v1/admin/*', authMiddleware);

// ── Routes ───────────────────────────────────────────────────────

app.get('/health', (c) => c.json({ status: 'ok', service: 'litcrop-api' }));
app.get('/api/v1/health', (c) => c.json({ status: 'ok', service: 'litcrop-api' }));
app.get('/api/v1', (c) => c.json({ version: '1', status: 'ok' }));

// GET|POST|PATCH /api/v1/farms/...  (includes /:farmId/plots)
app.route('/api/v1/farms', farmsRouter);

// GET /api/v1/farms/:farmId/weather
app.route('/api/v1/farms', weatherRouter);

// GET /api/v1/plots/:plotId
// GET|POST /api/v1/plots/:plotId/images
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

export default app;
