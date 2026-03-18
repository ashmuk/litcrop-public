import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

const app = new Hono();

app.use('*', cors({
  origin: [
    'http://localhost:4321',
    'http://localhost:3000',
  ],
  allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Accept', 'Accept-Language', 'X-Request-Id'],
  exposeHeaders: ['X-Request-Id'],
  maxAge: 86400,
  credentials: false,
}));

app.use('*', logger());

// Health check
app.get('/health', (c) => c.json({ status: 'ok', service: 'litcrop-api' }));

// API v1 placeholder — routes will be added per task
app.get('/api/v1', (c) => c.json({ version: '1', status: 'ok' }));

export default app;
