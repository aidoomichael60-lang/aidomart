import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { initDatabase } from './server/db.ts';
import { attachSession, PUBLIC_UPLOAD_DIR, requireCsrf } from './server/middleware.ts';
import { authRouter } from './server/routes/auth.ts';
import { marketplaceRouter } from './server/routes/marketplace.ts';
import { buyerRouter } from './server/routes/buyer.ts';
import { sellerRouter } from './server/routes/seller.ts';
import { adminRouter } from './server/routes/admin.ts';
import { promosRouter } from './server/routes/promos.ts';
import { notificationsRouter } from './server/routes/notifications.ts';

initDatabase();

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Security headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Serve existing AIDOMART static assets from ./static or ./public/static
const rootStaticDir = path.join(process.cwd(), 'static');
const publicStaticDir = path.join(process.cwd(), 'public', 'static');
if (fs.existsSync(rootStaticDir)) {
  app.use('/static', express.static(rootStaticDir));
}
if (fs.existsSync(publicStaticDir)) {
  app.use('/static', express.static(publicStaticDir));
}

// Serve ONLY public seller/product images (private verification docs are strictly behind admin auth)
app.use('/uploads/public', express.static(PUBLIC_UPLOAD_DIR));

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

// API error handler without leaking internal stack traces
app.use('/api', (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = err?.status || (err?.message?.includes('Only ') ? 400 : 500);
  const message =
    status < 500 && err?.message ? err.message : 'An unexpected server error occurred.';
  if (status >= 500) {
    console.error('Server error:', err);
  }
  res.status(status).json({ error: message });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (req, res) => {
      if (
        req.path.startsWith('/static/') ||
        req.path.startsWith('/uploads/') ||
        req.path.startsWith('/api/')
      ) {
        return res.status(404).end();
      }
      return res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AIDOMART server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
