import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { AppError, InternalError } from './errors';

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
    allowHeaders: ['Content-Type', 'Accept', 'Accept-Language', 'X-Request-Id'],
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
    // Image upload endpoint accepts application/octet-stream or image/jpeg;
    // all other mutation endpoints must be application/json.
    const isImageUpload = ct.startsWith('image/') || ct === 'application/octet-stream';
    const isJson = ct.startsWith('application/json');
    if (!isJson && !isImageUpload) {
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
    return c.json(body, err.statusCode as 400 | 404 | 409 | 415 | 500);
  }

  // Unknown error — log and return generic 500
  const internal = new InternalError();
  console.error('[unhandled]', err);
  return c.json(
    { error: { code: internal.code, message: internal.message } },
    500,
  );
});

// ── Routes ───────────────────────────────────────────────────────

app.get('/health', (c) => c.json({ status: 'ok', service: 'litcrop-api' }));
app.get('/api/v1', (c) => c.json({ version: '1', status: 'ok' }));

export default app;
