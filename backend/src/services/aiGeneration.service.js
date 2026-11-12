import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { AIGeneration, GENERATION_SOURCES, GENERATION_STATUS, IPFS_STATUS } from '../models/AIGeneration.js';
import { ApiError } from '../utils/ApiError.js';
import { validateImage } from '../utils/imageValidation.js';
import { textProvider } from './ai/index.js';
import { isPublishing } from './ipfsPublish.service.js';
import { deleteFile, saveFile } from './storage/localStorage.service.js';

const EDITABLE_FIELDS = ['name', 'description', 'collectionName', 'attributes', 'prompt', 'style'];

// One AI request per user at a time: the CPU can only run one generation
// efficiently, and this stops a user from queueing dozens of slow requests.
const activeSuggestions = new Set();

export async function suggestMetadata(userId, { prompt, style }) {
  const key = String(userId);
  if (activeSuggestions.has(key)) {
    throw new ApiError(429, 'An AI suggestion is already in progress. Please wait for it to finish.');
  }
  activeSuggestions.add(key);
  try {
    return await textProvider.suggestMetadata({ prompt, style });
  } finally {
    activeSuggestions.delete(key);
  }
}

/** Validates the uploaded bytes, stores the file and creates the draft. */
export async function createFromUpload(userId, file, details) {
  if (!file?.buffer) throw ApiError.badRequest('Please choose an image to upload');

  let info;
  try {
    info = validateImage(file.buffer, { maxBytes: env.uploads.maxBytes });
  } catch (err) {
    throw ApiError.badRequest(err.message);
  }

  const stored = await saveFile(file.buffer, info.type.ext);

  try {
    return await AIGeneration.create({
      user: userId,
      source: GENERATION_SOURCES.UPLOAD,
      generatedImage: stored.url,
      image: {
        fileName: stored.fileName,
        mimeType: info.type.mime,
        size: file.buffer.length,
        width: info.width,
        height: info.height,
      },
      ...pickEditable(details),
      status: GENERATION_STATUS.DRAFT,
    });
  } catch (err) {
    await deleteFile(stored.fileName); // don't leave orphaned files behind
    throw err;
  }
}

function pickEditable(details = {}) {
  const out = {};
  for (const field of EDITABLE_FIELDS) {
    if (details[field] !== undefined) out[field] = details[field];
  }
  if (details.aiSuggested !== undefined) out.aiSuggested = Boolean(details.aiSuggested);
  return out;
}

/** Only ever returns the caller's own documents (404 otherwise, to not reveal existence). */
async function findOwned(userId, id) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.notFound('Artwork not found');
  const doc = await AIGeneration.findOne({ _id: id, user: userId });
  if (!doc) throw ApiError.notFound('Artwork not found');
  return doc;
}

export async function listForUser(userId, { page, limit }) {
  const filter = { user: userId };
  const [items, total] = await Promise.all([
    AIGeneration.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    AIGeneration.countDocuments(filter),
  ]);
  return {
    items: items.map((d) => d.toJSON()),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

export async function getForUser(userId, id) {
  const doc = await findOwned(userId, id);
  if (doc.nft) await doc.populate('nft'); // minted: include token id, chain, tx
  return doc;
}

export async function updateForUser(userId, id, details) {
  const doc = await findOwned(userId, id);
  if (doc.status === GENERATION_STATUS.MINTED) {
    throw ApiError.conflict('Minted artwork can no longer be edited');
  }
  if (isPublishing(doc)) {
    throw ApiError.conflict('This artwork is being uploaded to IPFS. Please wait until it finishes.');
  }
  // The pinned metadata is permanent: changing details now would no longer match it.
  if (doc.status === GENERATION_STATUS.UPLOADED_TO_IPFS || doc.ipfs?.status === IPFS_STATUS.COMPLETE) {
    throw ApiError.conflict('This artwork is already on IPFS, so its details are locked.');
  }
  const updates = pickEditable(details);
  if (Object.keys(updates).length === 0) throw ApiError.badRequest('No editable fields provided');
  doc.set(updates);
  await doc.save();
  return doc;
}

export async function deleteForUser(userId, id) {
  const doc = await findOwned(userId, id);
  if (doc.status === GENERATION_STATUS.MINTED) {
    throw ApiError.conflict('Minted artwork cannot be deleted');
  }
  if (isPublishing(doc)) {
    throw ApiError.conflict('This artwork is being uploaded to IPFS. Please wait until it finishes.');
  }
  // Note: files already pinned on IPFS stay on Pinata; only the local draft is removed.
  await doc.deleteOne();
  await deleteFile(doc.image.fileName);
}
