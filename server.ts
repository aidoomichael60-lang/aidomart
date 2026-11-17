import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { initDatabase } from './server/db.ts';
import { createApp } from './server/app.ts';

initDatabase();

const app = createApp();
const PORT = Number(process.env.PORT || 3000);

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
