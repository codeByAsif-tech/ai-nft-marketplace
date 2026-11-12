import crypto from 'node:crypto';
import { getAddress, verifyMessage } from 'ethers';
import { env } from '../config/env.js';
import { getNetworkByChainId, isSupportedChainId } from '../config/networks.js';
import { User } from '../models/User.js';
import { WalletNonce } from '../models/WalletNonce.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { NONCE_PATTERN, buildSiweMessage, validateSiweMessage } from '../utils/siwe.js';

const APP_NAME = 'Mintverse';
const STATEMENT = `Link this wallet to your ${APP_NAME} account. This only proves you own the wallet: it does not send a transaction, cost gas, or give ${APP_NAME} access to your funds.`;

const INVALID_CHALLENGE = 'This verification request is invalid, expired or already used. Please try again.';

/** The domain and URI this server expects in every signed message. */
function siteIdentity() {
  const origin = new URL(env.appOrigin);
  return { domain: origin.host, uri: origin.origin };
}

/** Cryptographically secure, EIP-4361 compliant nonce (32 hex chars = 128 bits). */
function generateNonce() {
  const nonce = crypto.randomBytes(16).toString('hex');
  if (!NONCE_PATTERN.test(nonce)) throw new Error('Nonce generation failed');
  return nonce;
}

/** Step 1: issue a single-use challenge for (user, address, chain). */
export async function createNonce(userId, { address, chainId }) {
  // The chain ID is only a claim from the client: validate it against our config.
  const network = getNetworkByChainId(chainId);
  if (!network) throw ApiError.badRequest('Unsupported network');

  let checksumAddress;
  try {
    checksumAddress = getAddress(address);
  } catch {
    throw ApiError.badRequest('Invalid wallet address');
  }

  // Only one outstanding challenge per user: requesting a new one invalidates older ones.
  await WalletNonce.deleteMany({ user: userId, usedAt: null });

  const nonce = generateNonce();
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + env.walletNonceTtlSeconds * 1000);
  const message = buildSiweMessage({
    ...siteIdentity(),
    address: checksumAddress,
    statement: STATEMENT,
    chainId: network.chainId,
    nonce,
    issuedAt,
    expirationTime: expiresAt,
  });

  await WalletNonce.create({
    user: userId,
    address: checksumAddress,
    chainId: network.chainId,
    nonce,
    message,
    expiresAt,
  });

  return { nonce, message, expiresAt };
}

/**
 * Step 2: verify the signature and link the wallet.
 *  a. Consume the nonce atomically (single use, even if later checks fail).
 *  b. Re-validate every SIWE field (domain, URI, version, address, chain, nonce, times).
 *  c. Recover the signer and compare it with the challenged address.
 *  d. Save the address; the unique index is the final guard against races.
 */
export async function verifyAndLinkWallet(userId, { nonce, signature }) {
  const now = new Date();

  // MongoDB's TTL monitor deletes expired nonces asynchronously (roughly every
  // 60 seconds), so an expired document can still exist. This explicit
  // `expiresAt > now` condition is what actually enforces expiry; keep it.
  const challenge = await WalletNonce.findOneAndUpdate(
    { nonce, user: userId, usedAt: null, expiresAt: { $gt: now } },
    { $set: { usedAt: now } },
    { new: true }
  );
  if (!challenge) throw ApiError.badRequest(INVALID_CHALLENGE);

  const problems = validateSiweMessage(
    challenge.message,
    {
      ...siteIdentity(),
      address: challenge.address,
      chainId: challenge.chainId,
      nonce: challenge.nonce,
      expiresAt: challenge.expiresAt,
      isSupportedChainId,
    },
    now
  );
  if (problems.length > 0) {
    logger.warn(`SIWE validation failed for user ${userId}: ${problems.join('; ')}`);
    throw ApiError.badRequest(INVALID_CHALLENGE);
  }

  let recovered;
  try {
    recovered = verifyMessage(challenge.message, signature);
  } catch {
    throw ApiError.badRequest('Invalid signature');
  }

  if (getAddress(recovered) !== getAddress(challenge.address)) {
    logger.warn(`Wallet signature mismatch for user ${userId}`);
    throw ApiError.badRequest('Signature does not match the wallet address');
  }

  const address = challenge.address; // stored lowercase (normalized)

  // Fast, friendly check. Not sufficient on its own: two accounts could pass it
  // at the same time, so the unique index on User.walletAddress decides.
  const ownedByOther = await User.exists({ walletAddress: address, _id: { $ne: userId } });
  if (ownedByOther) {
    throw ApiError.conflict('This wallet is already linked to another account');
  }

  try {
    const user = await User.findByIdAndUpdate(
      userId,
      { walletAddress: address, walletLinkedAt: now },
      { new: true }
    );
    if (!user) throw ApiError.notFound('User not found');
    return user;
  } catch (err) {
    if (err?.code === 11000) throw ApiError.conflict('This wallet is already linked to another account');
    throw err;
  }
}

export async function unlinkWallet(userId) {
  const user = await User.findByIdAndUpdate(
    userId,
    { walletAddress: null, walletLinkedAt: null },
    { new: true }
  );
  if (!user) throw ApiError.notFound('User not found');
  await WalletNonce.deleteMany({ user: userId, usedAt: null });
  return user;
}
