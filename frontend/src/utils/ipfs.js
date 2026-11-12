// Public IPFS gateways, tried in order after the backend's configured gateway.
// Any gateway can serve any public CID, but speed varies a lot: the first load
// of a new file can take a while because the gateway has to find it on Pinata.
const FALLBACK_GATEWAYS = ['https://gateway.pinata.cloud/ipfs', 'https://dweb.link/ipfs', 'https://ipfs.io/ipfs']

export const ipfsUri = (cid) => (cid ? `ipfs://${cid}` : '')

/** Candidate image URLs for a CID: configured gateway first, then public ones, de-duplicated. */
export function gatewayCandidates(cid, preferredUrl) {
  if (!cid) return preferredUrl ? [preferredUrl] : []
  const urls = [preferredUrl, ...FALLBACK_GATEWAYS.map((g) => `${g}/${cid}`)].filter(Boolean)
  return [...new Set(urls)]
}
