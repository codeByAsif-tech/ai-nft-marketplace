import { matchedData } from 'express-validator';
import * as marketplace from '../services/marketplace.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/** 202 while the tx isn't confirmed yet (client polls), 200/201 once verified. */
function sendRecorded(res, result, message, statusCode = 200) {
  if (result.state === 'PENDING') {
    return sendSuccess(res, {
      statusCode: 202,
      message: 'Transaction is not confirmed yet. Check again shortly.',
      data: { state: 'PENDING' },
    });
  }
  const data = { state: 'CONFIRMED' };
  if (result.listing) data.listing = result.listing.toJSON();
  if (result.nft) data.nft = result.nft.toJSON();
  return sendSuccess(res, { statusCode, message, data });
}

export const explore = asyncHandler(async (req, res) => {
  const { page = 1, limit = 12, chainId, search, sort } = matchedData(req, { locations: ['query'] });
  sendSuccess(res, {
    data: await marketplace.listActiveListings({ page, limit, chainId, search, sort, viewer: req.user ?? null }),
  });
});

export const getListing = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: { listing: await marketplace.getListingDetails(req.params.id) } });
});

export const createListing = asyncHandler(async (req, res) => {
  const { nftId, txHash } = matchedData(req, { locations: ['body'] });
  sendRecorded(res, await marketplace.recordListing(req.user.id, { nftId, txHash }), 'Listed for sale', 201);
});

export const buy = asyncHandler(async (req, res) => {
  const { txHash } = matchedData(req, { locations: ['body'] });
  sendRecorded(res, await marketplace.recordPurchase(req.user.id, { listingId: req.params.id, txHash }), 'Purchase verified');
});

export const cancel = asyncHandler(async (req, res) => {
  const { txHash } = matchedData(req, { locations: ['body'] });
  sendRecorded(res, await marketplace.recordCancel(req.user.id, { listingId: req.params.id, txHash }), 'Listing cancelled');
});

export const nftDetails = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: { nft: await marketplace.getNftDetails(req.params.id) } });
});

export const nftActivity = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = matchedData(req, { locations: ['query'] });
  sendSuccess(res, { data: await marketplace.getNftActivity(req.params.id, { page, limit }) });
});

export const transfer = asyncHandler(async (req, res) => {
  const { txHash } = matchedData(req, { locations: ['body'] });
  sendRecorded(res, await marketplace.recordTransfer(req.user.id, { nftId: req.params.id, txHash }), 'Transfer verified');
});

export const myTransactions = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, type } = matchedData(req, { locations: ['query'] });
  sendSuccess(res, { data: await marketplace.getMyTransactions(req.user.id, { page, limit, type }) });
});
