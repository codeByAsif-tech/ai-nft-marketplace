import multer from 'multer';
import { env } from '../config/env.js';

/**
 * Accepts exactly one file in the "image" field, kept in memory so its
 * bytes can be inspected before anything touches the disk.
 * Type checks happen afterwards on the real bytes (utils/imageValidation.js);
 * the client's file name and Content-Type are never trusted.
 */
export const uploadSingleImage = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.uploads.maxBytes,
    files: 1,
    fields: 12,
    fieldSize: 16 * 1024,
    parts: 14,
  },
}).single('image');
