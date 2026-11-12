import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

/**
 * Stores uploaded files on the local disk under env.uploads.dir and serves
 * them from /uploads. File names are random UUIDs chosen by the server, so
 * user-supplied names can never cause path traversal or overwrite files,
 * and URLs can't be guessed.
 *
 * Kept behind this small interface so it can be swapped for cloud storage
 * later. Permanent NFT storage is IPFS (Phase 4); this is the draft area.
 */

const SAFE_NAME = /^[0-9a-f-]{36}\.(png|jpg|gif|webp)$/;

export const PUBLIC_PREFIX = '/uploads';

export async function saveFile(buffer, ext) {
  await fs.mkdir(env.uploads.dir, { recursive: true });
  const fileName = `${crypto.randomUUID()}.${ext}`;
  // "wx" fails instead of overwriting if the name somehow already exists.
  await fs.writeFile(path.join(env.uploads.dir, fileName), buffer, { flag: 'wx' });
  return { fileName, url: `${PUBLIC_PREFIX}/${fileName}` };
}

export async function readStoredFile(fileName) {
  if (!SAFE_NAME.test(fileName ?? '')) throw new Error('Invalid stored file name');
  return fs.readFile(path.join(env.uploads.dir, fileName));
}

export async function deleteFile(fileName) {
  if (!SAFE_NAME.test(fileName ?? '')) return; // never touch anything we didn't create
  try {
    await fs.unlink(path.join(env.uploads.dir, fileName));
  } catch (err) {
    if (err.code !== 'ENOENT') logger.warn(`Could not delete upload ${fileName}: ${err.message}`);
  }
}
