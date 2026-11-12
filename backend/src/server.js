import { env } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import { createApp } from './app.js';
import { logger } from './utils/logger.js';

async function start() {
  await connectDB(env.mongoUri);

  const app = createApp();
  const server = app.listen(env.port, () => {
    logger.info(`API listening on http://localhost:${env.port}/api (${env.nodeEnv})`);
  });

  const shutdown = (signal) => {
    logger.info(`${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
    // Force exit if connections don't close in time.
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason);
});

start().catch((err) => {
  logger.error('Failed to start server:', err.message);
  process.exit(1);
});
