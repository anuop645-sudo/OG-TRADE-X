import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { createApiRouter, handleRouteError } from './server/createApiApp.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);

  const apiRouter = createApiRouter('express');

  // Mount all /api/* routes BEFORE Vite dev middleware or production SPA fallback
  app.use('/api', apiRouter);

  const distPath = resolve(__dirname, 'dist');
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd && existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (
        req.path === '/api' ||
        req.path.startsWith('/api/') ||
        req.originalUrl === '/api' ||
        req.originalUrl.startsWith('/api/')
      ) {
        res.status(404).json({ error: 'API endpoint not found.' });
        return;
      }
      res.sendFile(resolve(distPath, 'index.html'));
    });
  } else if (isProd) {
    // Dedicated API-only production mode (e.g. Render / Cloud Run backend paired with Netlify Drop)
    app.get('/', (_req, res) => {
      res.json({
        ok: true,
        service: 'OG TRADE API Server',
        healthEndpoint: '/api/health',
      });
    });
    app.use((_req, res) => {
      res.status(404).json({ error: 'Endpoint not found. Use /api/* routes.' });
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use((req, res, next) => {
      if (
        req.path === '/api' ||
        req.path.startsWith('/api/') ||
        req.originalUrl === '/api' ||
        req.originalUrl.startsWith('/api/')
      ) {
        res.status(404).json({ error: 'API endpoint not found.' });
        return;
      }
      vite.middlewares(req, res, next);
    });
  }

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (
      req.path === '/api' ||
      req.path.startsWith('/api/') ||
      req.originalUrl === '/api' ||
      req.originalUrl.startsWith('/api/')
    ) {
      handleRouteError(res, err);
      return;
    }
    console.error('Unhandled server error:', err);
    if (!res.headersSent) {
      res.status(500).send('Internal server error.');
    }
  });

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`OG TRADE server listening on http://0.0.0.0:${port}`);
  });
}

void startServer();
