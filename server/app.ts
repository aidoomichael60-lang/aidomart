import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { attachSession, PUBLIC_UPLOAD_DIR, requireCsrf } from './middleware.ts';
import { authRouter } from './routes/auth.ts';
import { marketplaceRouter } from './routes/marketplace.ts';
import { buyerRouter } from './routes/buyer.ts';
import { sellerRouter } from './routes/seller.ts';
import { adminRouter } from './routes/admin.ts';
import { promosRouter } from './routes/promos.ts';
import { notificationsRouter } from './routes/notifications.ts';

function normalizeNetlifyPath(rawUrl: string): string {
  const fnPrefix = '/.netlify/functions/api';
  if (!rawUrl.startsWith(fnPrefix)) {
    return rawUrl;
  }
  const rest = rawUrl.slice(fnPrefix.length) || '/';
  if (
    rest === '/api' ||
    rest.startsWith('/api/') ||
    rest.startsWith('/api?') ||
    rest.startsWith('/uploads/') ||
    rest.startsWith('/static/')
  ) {
    return rest;
  }
  if (rest === '/' || rest.startsWith('?')) {
    return `/api${rest}`;
  }
  return `/api${rest.startsWith('/') ? rest : `/${rest}`}`;
}

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // Normalize Netlify function paths so routes always resolve under /api/* or /uploads/*
  app.use((req, _res, next) => {
    const normalized = normalizeNetlifyPath(req.url);
    if (normalized !== req.url) {
      req.url = normalized;
    }
    next();
  });

  app.use(express.json({ limit: '6mb' }));
  app.use(express.urlencoded({ extended: true, limit: '6mb' }));

  // Security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Serve existing AIDOMART static assets from ./static, ./public/static, or ./dist/static
  const staticCandidates = [
    path.join(process.cwd(), 'static'),
    path.join(process.cwd(), 'public', 'static'),
    path.join(process.cwd(), 'dist', 'static'),
  ];
  for (const staticDir of staticCandidates) {
    if (fs.existsSync(staticDir)) {
      app.use('/static', express.static(staticDir));
    }
  }

  // Serve ONLY public seller/product images (private verification docs are strictly behind admin auth)
  app.use('/uploads/public', express.static(PUBLIC_UPLOAD_DIR));

  // Disable caching on all API routes so auth sessions and newly published items are always fresh
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });

  // Session & CSRF protection on API routes
  app.use('/api', attachSession);
  app.use('/api', requireCsrf);

  app.use('/api/auth', authRouter);
  app.use('/api/marketplace', marketplaceRouter);
  app.use('/api', buyerRouter);
  app.use('/api/seller', sellerRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/promos', promosRouter);
  app.use('/api/notifications', notificationsRouter);

  // Explicit JSON 404 for unmatched API endpoints
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  // API error handler without leaking internal stack traces
  app.use(
    '/api',
    (
      err: any,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      const isMulterLimit = err?.code === 'LIMIT_FILE_SIZE' || err?.code === 'LIMIT_FILE_COUNT';
      const status =
        err?.status || (isMulterLimit || err?.message?.includes('Only ') ? 400 : 500);
      const message =
        err?.code === 'LIMIT_FILE_SIZE'
          ? 'Uploaded file is too large. Maximum size is 10 MB per image (8 MB for documents).'
          : status < 500 && err?.message
            ? err.message
            : 'An unexpected server error occurred.';
      if (status >= 500) {
        console.error('Server error:', err);
      }
      res.status(status).json({ error: message });
    }
  );

  return app;
}
