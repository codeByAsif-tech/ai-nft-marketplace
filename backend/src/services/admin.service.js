import mongoose from 'mongoose';
import { AIGeneration, GENERATION_STATUS } from '../models/AIGeneration.js';
import { Listing, LISTING_STATUS } from '../models/Listing.js';
import { NFT } from '../models/NFT.js';
import { REVOKE_REASONS } from '../models/RefreshSession.js';
import { Transaction, TRANSACTION_TYPES } from '../models/Transaction.js';
import { ROLES, User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { revokeAllUserSessions } from './session.service.js';

/**
 * Admin-only reads and user management. Routes using this service are
 * protected on the backend by authenticate + requireRole('ADMIN').
 */

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const DAY = 24 * 60 * 60 * 1000;

/** Platform-wide numbers for the admin dashboard (all from real data). */
export async function getPlatformStats() {
  const weekAgo = new Date(Date.now() - 7 * DAY);

  const [
    users,
    activeUsers,
    admins,
    newUsers7d,
    walletsLinked,
    artworks,
    onIpfs,
    nfts,
    collectionNames,
    activeListings,
    totalListings,
    completedSales,
    volume,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ isActive: true }),
    User.countDocuments({ role: ROLES.ADMIN, isActive: true }),
    User.countDocuments({ createdAt: { $gte: weekAgo } }),
    User.countDocuments({ walletAddress: { $type: 'string' } }),
    AIGeneration.countDocuments(),
    AIGeneration.countDocuments({ status: { $in: [GENERATION_STATUS.UPLOADED_TO_IPFS, GENERATION_STATUS.MINTED] } }),
    NFT.countDocuments(),
    // Collections are a name on each NFT for now (a full Collection model comes later).
    NFT.distinct('collectionName', { collectionName: { $nin: ['', null] } }),
    Listing.countDocuments({ listingStatus: LISTING_STATUS.ACTIVE }),
    Listing.countDocuments(),
    Listing.countDocuments({ listingStatus: LISTING_STATUS.SOLD }),
    Listing.aggregate([
      { $match: { listingStatus: LISTING_STATUS.SOLD } },
      { $group: { _id: null, eth: { $sum: '$priceEth' } } },
    ]),
  ]);

  return {
    users: { total: users, active: activeUsers, inactive: users - activeUsers, admins, new7d: newUsers7d, walletsLinked },
    artworks: { total: artworks, onIpfs },
    nfts: { total: nfts },
    collections: { total: collectionNames.length },
    listings: { active: activeListings, total: totalListings },
    sales: { completed: completedSales, volumeEth: volume[0]?.eth ?? 0 },
  };
}

/** Latest verified on-chain activity across all users. */
export async function getPlatformActivity({ page, limit, type }) {
  const filter = type ? { transactionType: type } : {};
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
    items: items.map((t) => {
      const json = t.toJSON();
      if (t.nft) json.nft = { id: t.nft.id, name: t.nft.name, tokenId: t.nft.tokenId };
      if (t.buyer) json.buyer = { id: t.buyer.id, name: t.buyer.name };
      if (t.seller) json.seller = { id: t.seller.id, name: t.seller.name };
      return json;
    }),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

/** Per-user counts for a set of users, in a few grouped queries (not one per user). */
async function countsFor(users) {
  const ids = users.map((u) => u._id);
  const wallets = users.map((u) => u.walletAddress).filter(Boolean);
  const [created, owned, sold] = await Promise.all([
    NFT.aggregate([{ $match: { creator: { $in: ids } } }, { $group: { _id: '$creator', n: { $sum: 1 } } }]),
    wallets.length
      ? NFT.aggregate([{ $match: { ownerAddress: { $in: wallets } } }, { $group: { _id: '$ownerAddress', n: { $sum: 1 } } }])
      : [],
    Transaction.aggregate([
      { $match: { seller: { $in: ids }, transactionType: TRANSACTION_TYPES.BUY } },
      { $group: { _id: '$seller', n: { $sum: 1 } } },
    ]),
  ]);
  const byId = (rows) => Object.fromEntries(rows.map((r) => [String(r._id), r.n]));
  const createdBy = byId(created);
  const ownedBy = byId(owned);
  const soldBy = byId(sold);
  return (u) => ({
    nftsCreated: createdBy[String(u._id)] ?? 0,
    nftsOwned: u.walletAddress ? (ownedBy[u.walletAddress] ?? 0) : 0,
    sales: soldBy[String(u._id)] ?? 0,
  });
}

export async function listUsers({ page, limit, search, role, status }) {
  const filter = {};
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    filter.$or = [{ name: rx }, { email: rx }, { walletAddress: rx }];
  }
  if (role) filter.role = role;
  if (status === 'active') filter.isActive = true;
  if (status === 'inactive') filter.isActive = false;

  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(filter),
  ]);
  const counts = await countsFor(users);
  return {
    items: users.map((u) => ({ ...u.toJSON(), stats: counts(u) })),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

/**
 * Activate or deactivate a user. Roles can't be changed through the API
 * (admins are created only with the server-side `npm run seed:admin` script).
 * Safety rules:
 *  - an admin can't deactivate their own account (no accidental lock-out)
 *  - the last active admin can't be deactivated
 * Deactivated users lose access immediately: every request re-checks isActive.
 */
export async function setUserActive(adminId, userId, isActive) {
  if (!mongoose.isValidObjectId(userId)) throw ApiError.notFound('User not found');
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');

  const deactivating = isActive === false && user.isActive;
  if (deactivating && String(adminId) === String(user._id)) {
    throw ApiError.badRequest("You can't deactivate your own account.");
  }
  if (deactivating && user.role === ROLES.ADMIN) {
    const otherActiveAdmins = await User.countDocuments({ role: ROLES.ADMIN, isActive: true, _id: { $ne: user._id } });
    if (otherActiveAdmins === 0) throw ApiError.conflict('This is the last active admin and must stay active.');
  }

  user.isActive = isActive;
  await user.save();
  // Deactivation also ends every login session (refresh tokens stop working).
  if (deactivating) await revokeAllUserSessions(user._id, REVOKE_REASONS.INACTIVE);

  const counts = await countsFor([user]);
  return { ...user.toJSON(), stats: counts(user) };
}
