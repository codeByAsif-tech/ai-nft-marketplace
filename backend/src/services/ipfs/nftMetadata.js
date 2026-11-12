import crypto from 'node:crypto';
import { ART_STYLES } from '../../constants/artStyles.js';

/**
 * Builds ERC-721 metadata (the JSON that tokenURI points to), following the
 * widely used OpenSea metadata format:
 *   { name, description, image: "ipfs://<cid>", attributes: [{ trait_type, value }] }
 *
 * Built ONLY from data stored on the server, never from the request body,
 * so the client can't sneak different content into the pinned metadata.
 */
export function buildNftMetadata(generation, imageCid) {
  const attributes = (generation.attributes ?? []).map((a) => ({ trait_type: a.trait_type, value: a.value }));
  if (generation.style && generation.style !== 'none' && !attributes.some((a) => a.trait_type === 'Style')) {
    attributes.push({ trait_type: 'Style', value: ART_STYLES[generation.style] ?? generation.style });
  }

  const metadata = {
    name: generation.name.trim(),
    description: (generation.description ?? '').trim(),
    image: `ipfs://${imageCid}`,
    attributes,
  };
  if (generation.collectionName) {
    metadata.properties = { collection: generation.collectionName };
  }
  return metadata;
}

/** Stable serialisation: same metadata -> same bytes -> same fingerprint and CID. */
export const serializeMetadata = (metadata) => JSON.stringify(metadata, null, 2);

export const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');

/** Returns a list of problems that must be fixed before publishing. */
export function checkReadyForIpfs(generation) {
  const problems = [];
  if (!generation.name?.trim()) problems.push('Give your artwork a name before uploading it to IPFS.');
  return problems;
}
