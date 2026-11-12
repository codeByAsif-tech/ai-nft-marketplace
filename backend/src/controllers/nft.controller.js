import { matchedData } from 'express-validator';
import * as mintService from '../services/mint.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Called by the frontend right after MetaMask returns a tx hash, and again
 * (polling / "Check status") until the mint is verified.
 * 202 = transaction not mined/confirmed yet; 201 = verified and recorded.
 */
export const recordMint = asyncHandler(async (req, res) => {
  const { generationId, chainId, txHash } = matchedData(req, { locations: ['body'] });
  const result = await mintService.recordMint(req.user.id, { generationId, chainId, txHash });

  if (result.state === 'PENDING') {
    return sendSuccess(res, {
      statusCode: 202,
      message: 'Transaction is not confirmed yet. Check again shortly.',
      data: { state: 'PENDING', generation: result.generation.toJSON() },
    });
  }
  sendSuccess(res, {
    statusCode: 201,
    message: 'NFT minted and verified',
    data: { state: 'CONFIRMED', nft: result.nft.toJSON(), generation: result.generation.toJSON() },
  });
});

export const listMine = asyncHandler(async (req, res) => {
  const { page = 1, limit = 12, chainId } = matchedData(req, { locations: ['query'] });
  sendSuccess(res, { data: await mintService.listMyNfts(req.user.id, { page, limit, chainId }) });
});

export const getOne = asyncHandler(async (req, res) => {
  const nft = await mintService.getNft(req.params.id);
  sendSuccess(res, { data: { nft: nft.toJSON() } });
});

export const verifyOwner = asyncHandler(async (req, res) => {
  const { nft, changed } = await mintService.verifyOwner(req.params.id);
  sendSuccess(res, {
    message: changed ? 'Owner updated from the blockchain' : 'Ownership confirmed on-chain',
    data: { nft: nft.toJSON(), changed },
  });
});
