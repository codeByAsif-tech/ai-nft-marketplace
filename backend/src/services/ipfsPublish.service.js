import mongoose from 'mongoose';
import { AIGeneration, GENERATION_STATUS, IPFS_STATUS, IPFS_STEPS } from '../models/AIGeneration.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { ipfsClient } from './ipfs/index.js';
import { buildNftMetadata, checkReadyForIpfs, serializeMetadata, sha256 } from './ipfs/nftMetadata.js';
import { readStoredFile } from './storage/localStorage.service.js';

/**
 * Publishes an artwork draft to IPFS in two resumable steps:
 *
 *   1. IMAGE     upload the image file          -> save imageCid immediately
 *   2. METADATA  upload metadata JSON (image =  -> save metadataCid, mark COMPLETE
 *                ipfs://imageCid)
 *
 * Retry safety (no duplicate uploads):
 *  - Each step's result is persisted the moment it succeeds; a retry skips
 *    any step that already has a CID.
 *  - Every upload is labelled on Pinata with {app, generationId, kind, sha256}.
 *    Before uploading, we look for a file with exactly those labels. This
 *    covers the worst case: Pinata stored the file but the response (or our
 *    database write) was lost, so we never learned the CID.
 *  - A short, atomic lease (`ipfs.lockedUntil`) stops two requests (double
 *    click, two tabs) from publishing the same draft at the same time. It
 *    expires on its own if the server dies mid-upload.
 *  - Calling it again after success returns the stored result (idempotent).
 */

export const LOCK_MS = 2 * 60 * 1000;
const APP_LABEL = 'mintverse';

async function findOwned(userId, id) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.notFound('Artwork not found');
  const doc = await AIGeneration.findOne({ _id: id, user: userId });
  if (!doc) throw ApiError.notFound('Artwork not found');
  return doc;
}

/** Atomically takes the publish lease. Returns the locked document, or null if someone else holds it. */
function acquireLock(userId, id) {
  const now = new Date();
  return AIGeneration.findOneAndUpdate(
    {
      _id: id,
      user: userId,
      'ipfs.status': { $ne: IPFS_STATUS.COMPLETE },
      $or: [{ 'ipfs.lockedUntil': null }, { 'ipfs.lockedUntil': { $lte: now } }],
    },
    {
      $set: {
        'ipfs.lockedUntil': new Date(now.getTime() + LOCK_MS),
        'ipfs.status': IPFS_STATUS.IN_PROGRESS,
        'ipfs.failedStep': null,
        'ipfs.lastError': null,
      },
      $inc: { 'ipfs.attempts': 1 },
    },
    { new: true }
  );
}

const labels = (doc, kind, contentSha) => ({
  app: APP_LABEL,
  generationId: doc.id,
  kind,
  sha256: contentSha,
});

async function uploadImageStep(doc) {
  if (doc.ipfs.imageCid) return; // already done on an earlier attempt

  const bytes = await readStoredFile(doc.image.fileName);
  const contentSha = sha256(bytes);
  const result = await ipfsClient.ensureUploaded({
    data: bytes,
    fileName: `${doc.id}-image.${doc.image.fileName.split('.').pop()}`,
    mimeType: doc.image.mimeType,
    keyvalues: labels(doc, 'image', contentSha),
  });

  // Persist immediately, before starting the next step.
  doc.ipfs.imageCid = result.cid;
  doc.ipfs.imageFileId = result.id;
  doc.ipfs.imageSha256 = contentSha;
  doc.ipfs.imageUploadedAt = new Date();
  doc.ipfs.status = IPFS_STATUS.IMAGE_UPLOADED;
  await doc.save();
  logger.info(`IPFS image ${result.reused ? 'found (reused)' : 'uploaded'} for ${doc.id}: ${result.cid}`);
}

async function uploadMetadataStep(doc) {
  if (doc.ipfs.metadataCid) return;

  // Built from the stored draft at this moment. If the details were edited
  // after a failed attempt, the new details are used (nothing was pinned yet).
  const metadata = buildNftMetadata(doc, doc.ipfs.imageCid);
  const json = serializeMetadata(metadata);
  const contentSha = sha256(json);

  const result = await ipfsClient.ensureUploaded({
    data: Buffer.from(json, 'utf8'),
    fileName: `${doc.id}-metadata.json`,
    mimeType: 'application/json',
    keyvalues: labels(doc, 'metadata', contentSha),
  });

  doc.ipfs.metadataCid = result.cid;
  doc.ipfs.metadataFileId = result.id;
  doc.ipfs.metadataSha256 = contentSha;
  doc.ipfs.metadata = metadata;
  doc.ipfs.metadataUploadedAt = new Date();
  doc.ipfs.status = IPFS_STATUS.COMPLETE;
  doc.ipfs.lockedUntil = null;
  doc.status = GENERATION_STATUS.UPLOADED_TO_IPFS;
  await doc.save();
  logger.info(`IPFS metadata ${result.reused ? 'found (reused)' : 'uploaded'} for ${doc.id}: ${result.cid}`);
}

export async function publishToIpfs(userId, id) {
  const current = await findOwned(userId, id);

  // Idempotent: already published (or minted) -> return the stored result.
  if (current.ipfs?.status === IPFS_STATUS.COMPLETE) return current;
  if (current.status === GENERATION_STATUS.MINTED) throw ApiError.conflict('This artwork is already minted.');

  const problems = checkReadyForIpfs(current);
  if (problems.length) throw ApiError.badRequest(problems[0]);

  if (!ipfsClient.isConfigured) {
    throw new ApiError(503, 'IPFS uploads are not configured on this server (PINATA_JWT is missing).');
  }

  const doc = await acquireLock(userId, id);
  if (!doc) {
    const latest = await findOwned(userId, id);
    if (latest.ipfs?.status === IPFS_STATUS.COMPLETE) return latest; // finished by the other request
    throw ApiError.conflict('An IPFS upload for this artwork is already in progress. Please wait.');
  }

  let step = IPFS_STEPS.IMAGE;
  try {
    await uploadImageStep(doc);
    step = IPFS_STEPS.METADATA;
    await uploadMetadataStep(doc);
    return doc;
  } catch (err) {
    // Keep every CID we already have; record where it stopped and release the lease.
    // Only our own (safe) messages are stored and shown; unexpected errors stay generic.
    const lastError = err instanceof ApiError ? err.message : 'Unexpected error while uploading to IPFS.';
    await AIGeneration.updateOne(
      { _id: doc._id },
      {
        $set: {
          'ipfs.status': IPFS_STATUS.FAILED,
          'ipfs.failedStep': step,
          'ipfs.lastError': lastError,
          'ipfs.lockedUntil': null,
        },
      }
    );
    logger.warn(`IPFS publish failed at ${step} for ${doc.id}: ${err.message}`);
    throw err instanceof ApiError ? err : new ApiError(500, 'Unexpected error while uploading to IPFS.');
  }
}

/** True while a publish lease is active (used to block edits/deletes mid-upload). */
export function isPublishing(doc) {
  return Boolean(doc.ipfs?.lockedUntil && doc.ipfs.lockedUntil > new Date());
}
