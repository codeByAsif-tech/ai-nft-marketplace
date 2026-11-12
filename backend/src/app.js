import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { ALLOWED_ORIGINS } from './config/cors.js';
import { env } from './config/env.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimiters.js';
import routes from './routes/index.js';
import { PUBLIC_PREFIX } from './services/storage/localStorage.service.js';

/**
 * Builds the Express app without starting a server or connecting to the
 * database, so tests can import it and drive it with supertest.
 */
export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.trustProxy);

  app.use(helmet());
  // credentials: true lets the browser send the HttpOnly refresh-token cookie.
  app.use(cors({ origin: [...ALLOWED_ORIGINS], credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  if (!env.isTest) app.use(morgan(env.isProduction ? 'combined' : 'dev'));

  app.use('/api', apiLimiter, routes);

  // Uploaded artwork. File names are random UUIDs written by the server.
  // Helmet's default Cross-Origin-Resource-Policy (same-origin) would stop the
  // frontend (another port) from showing these images, so relax it here only.
  app.use(
    PUBLIC_PREFIX,
    (_req, res, next) => {
      res.set('Cross-Origin-Resource-Policy', 'cross-origin');
      next();
    },
    express.static(env.uploads.dir, { index: false, dotfiles: 'deny', fallthrough: true, maxAge: '7d' })
  );

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
