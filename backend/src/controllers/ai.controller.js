import { matchedData } from 'express-validator';
import { getAiStatus } from '../services/ai/index.js';
import * as generationService from '../services/aiGeneration.service.js';
import { getIpfsStatus } from '../services/ipfs/index.js';
import { publishToIpfs } from '../services/ipfsPublish.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const status = asyncHandler(async (_req, res) => {
  sendSuccess(res, { data: await getAiStatus() });
});

export const suggest = asyncHandler(async (req, res) => {
  const { prompt, style = 'none' } = req.body;
  const suggestion = await generationService.suggestMetadata(req.user.id, { prompt, style });
  sendSuccess(res, { message: 'Suggestion ready', data: { suggestion } });
});

export const create = asyncHandler(async (req, res) => {
  // matchedData = only fields that passed validation (sanitised), nothing extra.
  const details = matchedData(req, { locations: ['body'] });
  const generation = await generationService.createFromUpload(req.user.id, req.file, details);
  sendSuccess(res, { statusCode: 201, message: 'Artwork saved', data: { generation: generation.toJSON() } });
});

export const list = asyncHandler(async (req, res) => {
  const { page = 1, limit = 12 } = matchedData(req, { locations: ['query'] });
  sendSuccess(res, { data: await generationService.listForUser(req.user.id, { page, limit }) });
});

export const getOne = asyncHandler(async (req, res) => {
  const generation = await generationService.getForUser(req.user.id, req.params.id);
  const json = generation.toJSON();
  // Serialise the populated NFT with its own toJSON (adds id and gateway URLs).
  if (generation.populated('nft') && generation.nft) json.nft = generation.nft.toJSON();
  sendSuccess(res, { data: { generation: json } });
});

export const update = asyncHandler(async (req, res) => {
  const details = matchedData(req, { locations: ['body'] });
  const generation = await generationService.updateForUser(req.user.id, req.params.id, details);
  sendSuccess(res, { message: 'Artwork updated', data: { generation: generation.toJSON() } });
});

export const ipfsStatus = asyncHandler(async (_req, res) => {
  sendSuccess(res, { data: getIpfsStatus() });
});

/**
 * Starts or resumes publishing to IPFS. Safe to call repeatedly: completed
 * steps are skipped and a finished upload just returns the stored result.
 */
export const publishIpfs = asyncHandler(async (req, res) => {
  const generation = await publishToIpfs(req.user.id, req.params.id);
  sendSuccess(res, { message: 'Artwork is on IPFS', data: { generation: generation.toJSON() } });
});

export const remove = asyncHandler(async (req, res) => {
  await generationService.deleteForUser(req.user.id, req.params.id);
  sendSuccess(res, { message: 'Artwork deleted' });
});
