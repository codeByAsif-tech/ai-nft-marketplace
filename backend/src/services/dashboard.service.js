import mongoose from 'mongoose';
import { AIGeneration, GENERATION_STATUS } from '../models/AIGeneration.js';
import { NFT } from '../models/NFT.js';
import { Transaction, TRANSACTION_TYPES } from '../models/Transaction.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Everything the user dashboard shows, computed from real data in one call.
 * Marketplace numbers (listed / sold / purchases) count verified LIST and BUY
 * transactions; they stay 0 until the marketplace flow ships (Phase 8).
 */
export async function getDashboard(userId) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');

  const uid = new mongoose.Types.ObjectId(String(userId));
  const wallet = user.walletAddress;

  // Activity involving the user's account or their verified wallet.
  const activityFilter = {
    $or: [
      { buyer: uid },
      { seller: uid },
      ...(wallet ? [{ fromAddress: wallet }, { toAddress: wallet }] : []),
    ],
  };

  const [statusCounts, nftsCreated, nftsOwned, listed, sold, purchases, recentArtwork, recentActivity] =
    await Promise.all([
      AIGeneration.aggregate([{ $match: { user: uid } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      NFT.countDocuments({ creator: uid }),
      wallet ? NFT.countDocuments({ ownerAddress: wallet }) : 0,
      Transaction.countDocuments({ seller: uid, transactionType: TRANSACTION_TYPES.LIST }),
      Transaction.countDocuments({ seller: uid, transactionType: TRANSACTION_TYPES.BUY }),
      Transaction.countDocuments({ buyer: uid, transactionType: TRANSACTION_TYPES.BUY }),
      AIGeneration.find({ user: uid })
        .sort({ updatedAt: -1 })
        .limit(4)
        .select('name generatedImage status updatedAt'),
      Transaction.find(activityFilter)
        .sort({ createdAt: -1 })
        .limit(6)
        .populate('nft', 'name tokenId chainId imageCID generation'),
    ]);

  const byStatus = Object.fromEntries(statusCounts.map((s) => [s._id, s.count]));
  const artworks = statusCounts.reduce((sum, s) => sum + s.count, 0);
  const onIpfs = (byStatus[GENERATION_STATUS.UPLOADED_TO_IPFS] ?? 0) + (byStatus[GENERATION_STATUS.MINTED] ?? 0);

  return {
    stats: {
      artworks,
      drafts: byStatus[GENERATION_STATUS.DRAFT] ?? 0,
      onIpfs,
      nftsCreated,
      nftsOwned,
      listed,
      sold,
      purchases,
    },
    // Onboarding progress, derived from what the user has actually done.
    progress: {
      walletVerified: Boolean(wallet),
      createdArtwork: artworks > 0,
      uploadedToIpfs: onIpfs > 0,
      mintedNft: nftsCreated > 0,
    },
    recentArtwork: recentArtwork.map((a) => ({
      id: a.id,
      name: a.name,
      generatedImage: a.generatedImage,
      status: a.status,
      updatedAt: a.updatedAt,
    })),
    recentActivity: recentActivity.map((t) => ({
      id: t.id,
      type: t.transactionType,
      chainId: t.chainId,
      transactionHash: t.transactionHash,
      price: t.price,
      createdAt: t.createdAt,
      nft: t.nft
        ? { id: t.nft.id, name: t.nft.name, tokenId: t.nft.tokenId, generation: t.nft.generation?.toString() ?? null }
        : null,
    })),
  };
}
