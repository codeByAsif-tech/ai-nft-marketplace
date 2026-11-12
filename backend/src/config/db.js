import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';

/**
 * Connects Mongoose to MongoDB. Throws if the initial connection fails,
 * so the server never starts without a working database.
 */
export async function connectDB(uri) {
  mongoose.set('strictQuery', true);

  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
  mongoose.connection.on('error', (err) => logger.error('MongoDB error:', err.message));

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  logger.info(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
}

export async function disconnectDB() {
  await mongoose.connection.close();
}
