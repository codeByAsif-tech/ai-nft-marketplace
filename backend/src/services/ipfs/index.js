import { env } from '../../config/env.js';
import { createPinataClient } from './pinata.client.js';

/** IPFS storage client (Pinata). Swappable for another pinning service later. */
export const ipfsClient = createPinataClient(env.ipfs);

export const toIpfsUri = (cid) => `ipfs://${cid}`;

export function getIpfsStatus() {
  return {
    configured: ipfsClient.isConfigured,
    provider: 'pinata',
    gatewayUrl: env.ipfs.gatewayUrl,
    reason: ipfsClient.isConfigured ? null : 'PINATA_JWT is not set on the server.',
  };
}
