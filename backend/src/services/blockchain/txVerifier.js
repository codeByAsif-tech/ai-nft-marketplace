import { ApiError } from '../../utils/ApiError.js';
import { chainReader } from './chainReader.js';

/**
 * Shared on-chain checks for any user-sent transaction.
 *
 * Returns:
 *   { state: 'PENDING' }                 not mined yet, or not enough confirmations
 *   { state: 'CONFIRMED', receipt }      mined, succeeded, confirmed, sent to `expectedTo`
 * Throws ApiError(400) if it reverted or was sent to another contract.
 */
export async function loadConfirmedReceipt(network, txHash, expectedTo) {
  const receipt = await chainReader.getReceipt(network.chainId, txHash);
  if (!receipt) return { state: 'PENDING' };
  if (receipt.status !== 1) throw ApiError.badRequest('The transaction failed on-chain (reverted).');

  const currentBlock = await chainReader.getBlockNumber(network.chainId);
  if (currentBlock - receipt.blockNumber + 1 < network.confirmations) return { state: 'PENDING' };

  if (expectedTo && receipt.to?.toLowerCase() !== expectedTo.toLowerCase()) {
    throw ApiError.badRequest('This transaction was not sent to the expected contract.');
  }
  return { state: 'CONFIRMED', receipt };
}

/**
 * Parsed events named `eventName` that were emitted by `address` in the receipt.
 * Logs from other contracts are ignored, so a look-alike event can't be spoofed.
 */
export function findEvents(receipt, contractInterface, address, eventName) {
  const results = [];
  for (const log of receipt.logs ?? []) {
    if (log.address?.toLowerCase() !== address.toLowerCase()) continue;
    try {
      const parsed = contractInterface.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed?.name === eventName) results.push({ ...parsed, logIndex: log.index ?? 0 });
    } catch {
      /* not one of this contract's events */
    }
  }
  return results;
}
