import { formatEther } from 'ethers';
import mongoose from 'mongoose';
import { getNetworkByChainId } from '../config/networks.js';
import { Listing, LISTING_STATUS } from '../models/Listing.js';
import { NFT } from '../models/NFT.js';
import { Transaction, TRANSACTION_TYPES } from '../models/Transaction.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { nftCollectionInterface, nftMarketplaceInterface } from './blockchain/abis.js';
import { chainReader } from './blockchain/chainReader.js';
import { findEvents, loadConfirmedReceipt } from './blockchain/txVerifier.js';

/**
 * Marketplace recording. Users send every transaction from their own wallet;
 * the backend only records what it can verify on-chain:
 *   - the receipt succeeded, is confirmed and went to the right contract
 *   - the expected event was emitted BY that contract
 *   - the acting wallet (seller / buyer / sender) is the caller's verified wallet
 *   - ownership is re-read from ownerOf(), listing state from getListing()
 * Unique indexes plus status-conditional updates make double recording impossible.
 */

// --------------------------------------------------------------------- helpers

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function marketplaceNetwork(chainId) {
  const network = getNetworkByChainId(chainId);
  if (!network) throw ApiError.badRequest('Unsupported network');
  if (!network.marketplaceContract) {
    throw ApiError.badRequest(`The marketplace contract is not configured for ${network.name} yet.`);
  }
  return network;
}

async function requireVerifiedWallet(userId) {
  const user = await User.findById(userId);
  if (!user?.walletAddress) {
    throw ApiError.badRequest('Verify and link your wallet (Dashboard → Wallet) first.');
  }
  return user;
}

async function findNft(id) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.notFound('NFT not found');
  const nft = await NFT.findById(id);
  if (!nft) throw ApiError.notFound('NFT not found');
  return nft;
}

async function findListing(id) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.notFound('Listing not found');
  const listing = await Listing.findById(id);
  if (!listing) throw ApiError.notFound('Listing not found');
  return listing;
}

const userIdForWallet = async (wallet) => (await User.findOne({ walletAddress: wallet }).select('_id'))?._id ?? null;

async function recordTransaction(doc) {
  try {
    await Transaction.create(doc);
  } catch (err) {
    if (err?.code !== 11000) throw err; // already recorded: idempotent
  }
}

/**
 * Event synchronisation for one listing: if the DB says ACTIVE but the contract
 * says it's closed (sold or cancelled without the app being told), fix the DB.
 * Best effort: if the chain can't be reached, the listing is returned unchanged.
 */
export async function reconcileListing(listing) {
  if (listing.listingStatus !== LISTING_STATUS.ACTIVE) return listing;
  try {
    const onChain = await chainReader.getListing(listing.chainId, listing.contractAddress, listing.listingId);
    if (onChain.active) return listing;

    const owner = await chainReader.getOwnerOf(listing.chainId, listing.nftContract, listing.tokenId);
    const now = new Date();
    const update =
      owner === listing.sellerWallet
        ? { listingStatus: LISTING_STATUS.CANCELLED, cancelledAt: now }
        : {
            listingStatus: LISTING_STATUS.SOLD,
            soldAt: now,
            buyerWallet: owner,
            buyer: await userIdForWallet(owner),
          };
    const updated = await Listing.findOneAndUpdate(
      { _id: listing._id, listingStatus: LISTING_STATUS.ACTIVE },
      { $set: update },
      { new: true }
    );
    await NFT.updateOne(
      { _id: listing.nft, activeListing: listing._id },
      { $set: { activeListing: null, ownerAddress: owner, ownerVerifiedAt: now } }
    );
    logger.info(`Reconciled listing ${listing.id}: ${update.listingStatus}`);
    return updated ?? (await Listing.findById(listing._id));
  } catch (err) {
    logger.warn(`Could not reconcile listing ${listing.id}: ${err.message}`);
    return listing;
  }
}

// --------------------------------------------------------------------- list

export async function recordListing(userId, { nftId, txHash }) {
  const hash = txHash.toLowerCase();
  const user = await requireVerifiedWallet(userId);
  const nft = await findNft(nftId);
  const network = marketplaceNetwork(nft.chainId);

  // Idempotent: same listing tx reported again.
  const existing = await Listing.findOne({ chainId: nft.chainId, transactionHash: hash });
  if (existing) {
    if (!existing.nft.equals(nft._id)) throw ApiError.conflict('This transaction belongs to another listing.');
    return { state: 'CONFIRMED', listing: existing };
  }

  const result = await loadConfirmedReceipt(network, hash, network.marketplaceContract);
  if (result.state === 'PENDING') return { state: 'PENDING' };

  const [event] = findEvents(result.receipt, nftMarketplaceInterface, network.marketplaceContract, 'ItemListed');
  if (!event) throw ApiError.badRequest('No listing was created in this transaction.');

  const listingId = event.args.listingId.toString();
  const seller = event.args.seller.toLowerCase();
  const price = event.args.price.toString();

  if (seller !== user.walletAddress) {
    throw ApiError.forbidden('This listing was created by a different wallet than the one linked to your account.');
  }
  if (event.args.nft.toLowerCase() !== nft.contractAddress || event.args.tokenId.toString() !== nft.tokenId) {
    throw ApiError.badRequest('This listing is for a different NFT.');
  }

  // A stale ACTIVE listing for this NFT (closed on-chain but never reported) would
  // block the new one: sync it first.
  const stale = await Listing.findOne({ nft: nft._id, listingStatus: LISTING_STATUS.ACTIVE });
  if (stale) await reconcileListing(stale);

  const owner = await chainReader.getOwnerOf(network.chainId, nft.contractAddress, nft.tokenId);

  let listing;
  try {
    listing = await Listing.create({
      nft: nft._id,
      nftName: nft.name,
      seller: user._id,
      sellerWallet: seller,
      listingId,
      contractAddress: network.marketplaceContract,
      nftContract: nft.contractAddress,
      tokenId: nft.tokenId,
      blockchain: network.key,
      chainId: network.chainId,
      price,
      priceEth: Number(formatEther(price)),
      transactionHash: hash,
    });
  } catch (err) {
    if (err?.code !== 11000) throw err;
    listing = await Listing.findOne({ chainId: network.chainId, contractAddress: network.marketplaceContract, listingId });
    if (!listing) throw ApiError.conflict('This NFT already has an active listing.');
  }

  await NFT.updateOne(
    { _id: nft._id },
    { $set: { activeListing: listing._id, ownerAddress: owner, ownerVerifiedAt: new Date() } }
  );
  await recordTransaction({
    nft: nft._id,
    seller: user._id,
    fromAddress: seller,
    toAddress: network.marketplaceContract,
    transactionHash: hash,
    logIndex: event.logIndex,
    transactionType: TRANSACTION_TYPES.LIST,
    price,
    blockchain: network.key,
    chainId: network.chainId,
    blockNumber: result.receipt.blockNumber,
  });

  // If it was already bought/cancelled before we heard about it, reflect that.
  return { state: 'CONFIRMED', listing: await reconcileListing(listing) };
}

// ---------------------------------------------------------------------- buy

export async function recordPurchase(userId, { listingId, txHash }) {
  const hash = txHash.toLowerCase();
  const user = await requireVerifiedWallet(userId);
  const listing = await findListing(listingId);
  const network = marketplaceNetwork(listing.chainId);

  if (listing.listingStatus === LISTING_STATUS.SOLD) {
    if (listing.saleTxHash === hash) return { state: 'CONFIRMED', listing };
    // Reconciliation may have marked it SOLD before the buyer reported the tx:
    // accept the report only if it really is the sale transaction (checked below).
    if (listing.saleTxHash) throw ApiError.conflict('This NFT has already been sold.');
  }
  if (listing.listingStatus === LISTING_STATUS.CANCELLED) throw ApiError.conflict('This listing was cancelled.');

  const result = await loadConfirmedReceipt(network, hash, network.marketplaceContract);
  if (result.state === 'PENDING') return { state: 'PENDING' };

  const event = findEvents(result.receipt, nftMarketplaceInterface, network.marketplaceContract, 'ItemSold').find(
    (e) => e.args.listingId.toString() === listing.listingId
  );
  if (!event) throw ApiError.badRequest('This transaction did not buy this listing.');

  const buyer = event.args.buyer.toLowerCase();
  if (buyer !== user.walletAddress) {
    throw ApiError.forbidden('This purchase was made by a different wallet than the one linked to your account.');
  }

  const owner = await chainReader.getOwnerOf(network.chainId, listing.nftContract, listing.tokenId);
  const now = new Date();

  // Status-conditional update: only one sale can ever be recorded per listing.
  const updated = await Listing.findOneAndUpdate(
    { _id: listing._id, $or: [{ listingStatus: LISTING_STATUS.ACTIVE }, { listingStatus: LISTING_STATUS.SOLD, saleTxHash: null }] },
    {
      $set: {
        listingStatus: LISTING_STATUS.SOLD,
        buyer: user._id,
        buyerWallet: buyer,
        saleTxHash: hash,
        soldAt: listing.soldAt ?? now,
      },
    },
    { new: true }
  );
  if (!updated) {
    const latest = await Listing.findById(listing._id);
    if (latest?.saleTxHash === hash) return { state: 'CONFIRMED', listing: latest };
    throw ApiError.conflict('This NFT has already been sold.');
  }

  await NFT.updateOne(
    { _id: listing.nft },
    { $set: { activeListing: null, ownerAddress: owner, ownerVerifiedAt: now } }
  );
  await recordTransaction({
    nft: listing.nft,
    buyer: user._id,
    seller: listing.seller,
    fromAddress: listing.sellerWallet,
    toAddress: buyer,
    transactionHash: hash,
    logIndex: event.logIndex,
    transactionType: TRANSACTION_TYPES.BUY,
    price: event.args.price.toString(),
    blockchain: network.key,
    chainId: network.chainId,
    blockNumber: result.receipt.blockNumber,
  });

  return { state: 'CONFIRMED', listing: updated };
}

// ------------------------------------------------------------------- cancel

export async function recordCancel(userId, { listingId, txHash }) {
  const hash = txHash.toLowerCase();
  const user = await requireVerifiedWallet(userId);
  const listing = await findListing(listingId);
  const network = marketplaceNetwork(listing.chainId);

  if (listing.sellerWallet !== user.walletAddress) throw ApiError.forbidden('Only the seller can cancel this listing.');
  if (listing.listingStatus === LISTING_STATUS.CANCELLED) {
    if (listing.cancelTxHash === hash) return { state: 'CONFIRMED', listing }; // idempotent
    if (listing.cancelTxHash) throw ApiError.conflict('This listing was already cancelled.');
    // Cancelled via chain sync without a tx hash: still verify this tx below before attaching it.
  }
  if (listing.listingStatus === LISTING_STATUS.SOLD) throw ApiError.conflict('This NFT has already been sold.');

  const result = await loadConfirmedReceipt(network, hash, network.marketplaceContract);
  if (result.state === 'PENDING') return { state: 'PENDING' };

  const event = findEvents(result.receipt, nftMarketplaceInterface, network.marketplaceContract, 'ListingCancelled').find(
    (e) => e.args.listingId.toString() === listing.listingId
  );
  if (!event) throw ApiError.badRequest('This transaction did not cancel this listing.');
  if (event.args.seller.toLowerCase() !== user.walletAddress) {
    throw ApiError.forbidden('This listing was cancelled by a different wallet.');
  }

  const owner = await chainReader.getOwnerOf(network.chainId, listing.nftContract, listing.tokenId);
  const now = new Date();
  const updated = await Listing.findOneAndUpdate(
    { _id: listing._id, listingStatus: { $ne: LISTING_STATUS.SOLD } },
    { $set: { listingStatus: LISTING_STATUS.CANCELLED, cancelTxHash: hash, cancelledAt: listing.cancelledAt ?? now } },
    { new: true }
  );
  if (!updated) throw ApiError.conflict('This NFT has already been sold.');

  await NFT.updateOne(
    { _id: listing.nft },
    { $set: { activeListing: null, ownerAddress: owner, ownerVerifiedAt: now } }
  );
  await recordTransaction({
    nft: listing.nft,
    seller: user._id,
    fromAddress: network.marketplaceContract,
    toAddress: listing.sellerWallet,
    transactionHash: hash,
    logIndex: event.logIndex,
    transactionType: TRANSACTION_TYPES.CANCEL,
    price: listing.price,
    blockchain: network.key,
    chainId: network.chainId,
    blockNumber: result.receipt.blockNumber,
  });

  return { state: 'CONFIRMED', listing: updated };
}

// ----------------------------------------------------------------- transfer

export async function recordTransfer(userId, { nftId, txHash }) {
  const hash = txHash.toLowerCase();
  const user = await requireVerifiedWallet(userId);
  const nft = await findNft(nftId);
  const network = getNetworkByChainId(nft.chainId);
  if (!network) throw ApiError.badRequest('Unsupported network');

  const already = await Transaction.findOne({
    chainId: nft.chainId,
    transactionHash: hash,
    transactionType: TRANSACTION_TYPES.TRANSFER,
  });
  if (already) {
    if (!already.nft?.equals(nft._id)) throw ApiError.conflict('This transaction belongs to another NFT.');
    return { state: 'CONFIRMED', nft };
  }

  const result = await loadConfirmedReceipt(network, hash, nft.contractAddress);
  if (result.state === 'PENDING') return { state: 'PENDING' };

  const event = findEvents(result.receipt, nftCollectionInterface, nft.contractAddress, 'Transfer').find(
    (e) => e.args.tokenId.toString() === nft.tokenId
  );
  if (!event) throw ApiError.badRequest('This transaction did not transfer this NFT.');

  const from = event.args.from.toLowerCase();
  const to = event.args.to.toLowerCase();
  if (from !== user.walletAddress) {
    throw ApiError.forbidden('This NFT was transferred from a different wallet than the one linked to your account.');
  }

  const owner = await chainReader.getOwnerOf(network.chainId, nft.contractAddress, nft.tokenId);
  await NFT.updateOne({ _id: nft._id }, { $set: { ownerAddress: owner, ownerVerifiedAt: new Date() } });
  await recordTransaction({
    nft: nft._id,
    seller: user._id,
    buyer: await userIdForWallet(to),
    fromAddress: from,
    toAddress: to,
    transactionHash: hash,
    logIndex: event.logIndex,
    transactionType: TRANSACTION_TYPES.TRANSFER,
    blockchain: network.key,
    chainId: network.chainId,
    blockNumber: result.receipt.blockNumber,
  });

  return { state: 'CONFIRMED', nft: await NFT.findById(nft._id) };
}

// -------------------------------------------------------------------- reads

const SORTS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  price_asc: { priceEth: 1, createdAt: -1 },
  price_desc: { priceEth: -1, createdAt: -1 },
};

function serializeListing(listing) {
  const json = listing.toJSON();
  if (listing.populated?.('nft') && listing.nft) json.nft = listing.nft.toJSON();
  if (listing.populated?.('seller') && listing.seller) json.seller = { id: listing.seller.id, name: listing.seller.name };
  if (listing.populated?.('buyer') && listing.buyer) json.buyer = { id: listing.buyer.id, name: listing.buyer.name };
  return json;
}

/**
 * Public: active listings for the Explore page. A logged-in `viewer` doesn't
 * see their own listings (by account or verified wallet); those are shown in
 * "My NFTs" and on the NFT page instead.
 */
export async function listActiveListings({ chainId, search, sort = 'newest', page, limit, viewer = null }) {
  const filter = { listingStatus: LISTING_STATUS.ACTIVE };
  if (viewer) {
    filter.seller = { $ne: viewer._id };
    if (viewer.walletAddress) filter.sellerWallet = { $ne: viewer.walletAddress };
  }
  if (chainId) filter.chainId = chainId;
  if (search) filter.nftName = { $regex: escapeRegex(search), $options: 'i' };

  const [items, total] = await Promise.all([
    Listing.find(filter)
      .sort(SORTS[sort] ?? SORTS.newest)
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('nft')
      .populate('seller', 'name'),
    Listing.countDocuments(filter),
  ]);
  return {
    items: items.map(serializeListing),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

/** Public: one listing, re-checked against the chain first. */
export async function getListingDetails(id) {
  const listing = await reconcileListing(await findListing(id));
  await listing.populate([{ path: 'nft' }, { path: 'seller', select: 'name' }, { path: 'buyer', select: 'name' }]);
  return serializeListing(listing);
}

/** Public: NFT details page data (with its active listing, synced with the chain). */
export async function getNftDetails(id) {
  const nft = await findNft(id);
  if (nft.activeListing) {
    const listing = await Listing.findById(nft.activeListing);
    if (listing) await reconcileListing(listing);
  }
  const fresh = await NFT.findById(nft._id)
    .populate('creator', 'name')
    .populate('activeListing')
    .populate('generation', 'generatedImage');

  const json = fresh.toJSON();
  json.creator = fresh.creator ? { id: fresh.creator.id, name: fresh.creator.name } : null;
  json.activeListing = fresh.activeListing ? fresh.activeListing.toJSON() : null;
  json.generation = fresh.generation?._id?.toString() ?? null;
  json.localImage = fresh.generation?.generatedImage ?? null;
  json.ownerName = (await User.findOne({ walletAddress: fresh.ownerAddress }).select('name'))?.name ?? null;
  return json;
}

function serializeTransaction(t) {
  const json = t.toJSON();
  if (t.populated?.('nft') && t.nft) {
    json.nft = { id: t.nft.id, name: t.nft.name, tokenId: t.nft.tokenId, generation: t.nft.generation?.toString() ?? null };
  }
  if (t.populated?.('buyer') && t.buyer) json.buyer = { id: t.buyer.id, name: t.buyer.name };
  if (t.populated?.('seller') && t.seller) json.seller = { id: t.seller.id, name: t.seller.name };
  return json;
}

async function paginateTransactions(filter, { page, limit }) {
  const [items, total] = await Promise.all([
    Transaction.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('nft', 'name tokenId generation')
      .populate('buyer', 'name')
      .populate('seller', 'name'),
    Transaction.countDocuments(filter),
  ]);
  return {
    items: items.map(serializeTransaction),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

/** Public: activity history of one NFT. */
export async function getNftActivity(nftId, paging) {
  const nft = await findNft(nftId);
  return paginateTransactions({ nft: nft._id }, paging);
}

/** The caller's own transaction history (account or verified wallet involved). */
export async function getMyTransactions(userId, { type, ...paging }) {
  const user = await User.findById(userId);
  const uid = user._id;
  const wallet = user.walletAddress;
  const filter = {
    $or: [
      { buyer: uid },
      { seller: uid },
      ...(wallet ? [{ fromAddress: wallet }, { toAddress: wallet }] : []),
    ],
  };
  if (type) filter.transactionType = type;
  return paginateTransactions(filter, paging);
}
