import mongoose from 'mongoose';
import { getNetworkByChainId } from '../config/networks.js';
import { AIGeneration, GENERATION_STATUS, IPFS_STATUS, MINT_PROGRESS } from '../models/AIGeneration.js';
import { Listing, LISTING_STATUS } from '../models/Listing.js';
import { NFT } from '../models/NFT.js';
import { Transaction, TRANSACTION_TYPES } from '../models/Transaction.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { nftCollectionInterface } from './blockchain/abis.js';
import { chainReader } from './blockchain/chainReader.js';

/**
 * Records a mint the user sent from their own wallet, but ONLY after
 * verifying it on-chain. The frontend saying "it worked" is never enough.
 *
 * Checks, in order:
 *   1. supported network with a configured NFT contract
 *   2. the user has a verified (signature-linked) wallet
 *   3. the artwork is the caller's and is fully on IPFS
 *   4. the receipt exists, succeeded, and has enough confirmations
 *   5. the tx was sent TO our NFT contract
 *   6. our contract emitted NFTMinted in that tx
 *   7. the minter (event `creator`) is the user's linked wallet
 *   8. the minted tokenURI equals this artwork's IPFS metadata URI
 *   9. current owner read live from ownerOf()
 * Duplicates are impossible: unique indexes on (chainId, txHash) and
 * (chainId, contract, tokenId), and an artwork can only be minted once.
 *
 * Returns { state: 'PENDING' | 'CONFIRMED', generation, nft? }.
 */
export async function recordMint(userId, { generationId, chainId, txHash }) {
  const hash = txHash.toLowerCase();

  // 1. Network
  const network = getNetworkByChainId(chainId);
  if (!network) throw ApiError.badRequest('Unsupported network');
  if (!network.nftContract) {
    throw ApiError.badRequest(`The NFT contract is not configured for ${network.name} yet.`);
  }

  // 2. Verified wallet
  const user = await User.findById(userId);
  if (!user?.walletAddress) {
    throw ApiError.badRequest('Verify and link your wallet (Dashboard → Wallet) before minting.');
  }

  // 3. Artwork
  if (!mongoose.isValidObjectId(generationId)) throw ApiError.notFound('Artwork not found');
  const generation = await AIGeneration.findOne({ _id: generationId, user: userId });
  if (!generation) throw ApiError.notFound('Artwork not found');

  if (generation.status === GENERATION_STATUS.MINTED) {
    // Idempotent: the same transaction reported again returns the stored result.
    if (generation.mint?.txHash === hash && generation.mint?.chainId === network.chainId) {
      const nft = await NFT.findById(generation.nft);
      return { state: 'CONFIRMED', generation, nft };
    }
    throw ApiError.conflict('This artwork has already been minted.');
  }
  if (generation.ipfs?.status !== IPFS_STATUS.COMPLETE || !generation.ipfs.metadataCid) {
    throw ApiError.conflict('Upload this artwork to IPFS before minting.');
  }

  const alreadyUsed = await NFT.findOne({ chainId: network.chainId, transactionHash: hash });
  if (alreadyUsed && !alreadyUsed.generation?.equals(generation._id)) {
    throw ApiError.conflict('This transaction has already been recorded for another NFT.');
  }

  // Remember the tx immediately, so it can be re-checked later if anything below fails.
  if (generation.mint?.txHash !== hash || generation.mint?.chainId !== network.chainId) {
    generation.mint = {
      status: MINT_PROGRESS.PENDING,
      chainId: network.chainId,
      txHash: hash,
      error: null,
      submittedAt: new Date(),
    };
    await generation.save();
  }

  // 4. Receipt
  const receipt = await chainReader.getReceipt(network.chainId, hash);
  if (!receipt) return { state: 'PENDING', generation };

  const fail = async (status, message) => {
    generation.mint.status = MINT_PROGRESS.FAILED;
    generation.mint.error = message;
    await generation.save();
    logger.warn(`Mint verification failed for ${generation.id} (${hash}): ${message}`);
    throw new ApiError(status, message);
  };

  if (receipt.status !== 1) return fail(400, 'The mint transaction failed on-chain (reverted). You can mint again.');

  const currentBlock = await chainReader.getBlockNumber(network.chainId);
  if (currentBlock - receipt.blockNumber + 1 < network.confirmations) return { state: 'PENDING', generation };

  // 5. Our contract
  if (receipt.to?.toLowerCase() !== network.nftContract) {
    return fail(400, 'This transaction was not sent to the marketplace NFT contract.');
  }

  // 6. NFTMinted from our contract
  let minted = null;
  for (const log of receipt.logs ?? []) {
    if (log.address?.toLowerCase() !== network.nftContract) continue;
    try {
      const parsed = nftCollectionInterface.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed?.name === 'NFTMinted') {
        minted = parsed;
        break;
      }
    } catch {
      /* not one of our events */
    }
  }
  if (!minted) {
    // Most common cause on a local chain: the node was restarted and the contract
    // isn't deployed any more, so the tx went to an empty address and did nothing.
    const deployed = await chainReader.hasCode(network.chainId, network.nftContract).catch(() => true);
    if (!deployed) {
      return fail(
        400,
        `No NFT contract is deployed at ${network.nftContract} on ${network.name}. ` +
          (network.isLocal
            ? 'The local chain was probably restarted: run "npm run deploy:local:reset" in contracts/, then mint again.'
            : 'Check the configured contract address.')
      );
    }
    return fail(400, 'No NFT was minted in this transaction.');
  }

  const tokenId = minted.args.tokenId.toString();
  const creatorAddress = minted.args.creator.toLowerCase();
  const tokenURI = minted.args.tokenURI;

  // 7. Minted by the user's own verified wallet
  if (creatorAddress !== user.walletAddress) {
    return fail(403, 'This NFT was minted by a different wallet than the one linked to your account.');
  }

  // 8. Correct metadata
  const expectedUri = `ipfs://${generation.ipfs.metadataCid}`;
  if (tokenURI !== expectedUri) {
    return fail(400, 'The minted token URI does not match this artwork’s IPFS metadata.');
  }

  // 9. Current owner from the chain
  const ownerAddress = await chainReader.getOwnerOf(network.chainId, network.nftContract, tokenId);

  const metadata = generation.ipfs.metadata ?? {};
  let nft;
  try {
    nft = await NFT.create({
      name: metadata.name ?? generation.name,
      description: metadata.description ?? generation.description ?? '',
      image: `ipfs://${generation.ipfs.imageCid}`,
      imageCID: generation.ipfs.imageCid,
      metadataURI: expectedUri,
      metadataCID: generation.ipfs.metadataCid,
      attributes: metadata.attributes ?? generation.attributes ?? [],
      collectionName: generation.collectionName ?? '',
      tokenId,
      contractAddress: network.nftContract,
      ownerAddress,
      ownerVerifiedAt: new Date(),
      creator: user._id,
      creatorAddress,
      generation: generation._id,
      blockchain: network.key,
      chainId: network.chainId,
      transactionHash: hash,
      blockNumber: receipt.blockNumber,
    });
  } catch (err) {
    if (err?.code !== 11000) throw err;
    // A concurrent request recorded it first: use that record.
    nft = await NFT.findOne({ chainId: network.chainId, transactionHash: hash });
    if (!nft || !nft.generation?.equals(generation._id)) {
      throw ApiError.conflict('This token has already been recorded.');
    }
  }

  try {
    await Transaction.create({
      nft: nft._id,
      seller: null,
      buyer: user._id,
      fromAddress: '0x0000000000000000000000000000000000000000',
      toAddress: creatorAddress,
      transactionHash: hash,
      logIndex: 0,
      transactionType: TRANSACTION_TYPES.MINT,
      blockchain: network.key,
      chainId: network.chainId,
      blockNumber: receipt.blockNumber,
    });
  } catch (err) {
    if (err?.code !== 11000) throw err; // already recorded: fine
  }

  generation.status = GENERATION_STATUS.MINTED;
  generation.nft = nft._id;
  generation.mint.status = MINT_PROGRESS.CONFIRMED;
  generation.mint.error = null;
  generation.mint.confirmedAt = new Date();
  await generation.save();

  logger.info(`Minted ${network.key} token ${tokenId} for artwork ${generation.id} (${hash})`);
  return { state: 'CONFIRMED', generation, nft };
}

/**
 * NFTs the user's linked wallet owns, plus the ones it has listed for sale
 * (those sit in marketplace escrow, but still belong to the seller until sold).
 */
export async function listMyNfts(userId, { page, limit, chainId }) {
  const user = await User.findById(userId);
  if (!user?.walletAddress) {
    return { items: [], pagination: { page, limit, total: 0, totalPages: 1 }, walletLinked: false };
  }
  const listedIds = await Listing.find({ sellerWallet: user.walletAddress, listingStatus: LISTING_STATUS.ACTIVE }).distinct(
    'nft'
  );
  const filter = { $or: [{ ownerAddress: user.walletAddress }, { _id: { $in: listedIds } }] };
  if (chainId) filter.chainId = chainId;
  const [items, total] = await Promise.all([
    NFT.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('generation', 'generatedImage')
      .populate('activeListing', 'price listingStatus listingId'),
    NFT.countDocuments(filter),
  ]);
  return {
    items: items.map((n) => {
      const json = n.toJSON();
      // Keep `generation` as a plain id, and expose the app's own copy of the image
      // as a fallback for when IPFS gateways are slow.
      json.generation = n.generation?._id?.toString() ?? null;
      json.localImage = n.generation?.generatedImage ?? null;
      json.activeListing = n.activeListing ? n.activeListing.toJSON() : null;
      return json;
    }),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    walletLinked: true,
  };
}

export async function getNft(id) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.notFound('NFT not found');
  const nft = await NFT.findById(id);
  if (!nft) throw ApiError.notFound('NFT not found');
  return nft;
}

/** Re-reads ownerOf() from the chain and updates the cached owner. */
export async function verifyOwner(id) {
  const nft = await getNft(id);
  const owner = await chainReader.getOwnerOf(nft.chainId, nft.contractAddress, nft.tokenId);
  const changed = owner !== nft.ownerAddress;
  nft.ownerAddress = owner;
  nft.ownerVerifiedAt = new Date();
  await nft.save();
  return { nft, changed };
}
