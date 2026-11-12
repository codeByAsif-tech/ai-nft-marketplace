import { getAddress } from 'ethers';

/**
 * Minimal Sign-In with Ethereum (EIP-4361) message builder, parser and validator.
 *
 * ethers.verifyMessage() only proves WHO signed a message. It says nothing about
 * whether the message is meant for this site, is fresh, or uses the right nonce.
 * validateSiweMessage() checks every field before the signature is trusted.
 *
 * Note: the Chain ID inside a signed message is just text the user agreed to.
 * It does not prove which network MetaMask was connected to.
 */

// EIP-4361: nonce is at least 8 alphanumeric characters.
export const NONCE_PATTERN = /^[A-Za-z0-9]{8,}$/;

// Tolerated clock difference between servers, in milliseconds.
const CLOCK_SKEW_MS = 60 * 1000;

const HEADER_SUFFIX = ' wants you to sign in with your Ethereum account:';

export function buildSiweMessage({ domain, uri, address, statement, chainId, nonce, issuedAt, expirationTime }) {
  return [
    `${domain}${HEADER_SUFFIX}`,
    address,
    '',
    statement,
    '',
    `URI: ${uri}`,
    'Version: 1',
    `Chain ID: ${chainId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt.toISOString()}`,
    `Expiration Time: ${expirationTime.toISOString()}`,
  ].join('\n');
}

/** Parses a message produced by buildSiweMessage. Returns null if it is malformed. */
export function parseSiweMessage(message) {
  if (typeof message !== 'string') return null;
  const lines = message.split('\n');
  if (lines.length < 11 || !lines[0].endsWith(HEADER_SUFFIX)) return null;

  const fields = {};
  for (const line of lines.slice(5)) {
    const idx = line.indexOf(': ');
    if (idx === -1) return null;
    fields[line.slice(0, idx)] = line.slice(idx + 2);
  }

  return {
    domain: lines[0].slice(0, -HEADER_SUFFIX.length),
    address: lines[1],
    statement: lines[3],
    uri: fields.URI,
    version: fields.Version,
    chainId: Number(fields['Chain ID']),
    nonce: fields.Nonce,
    issuedAt: fields['Issued At'],
    expirationTime: fields['Expiration Time'],
  };
}

function sameAddress(a, b) {
  try {
    return getAddress(a) === getAddress(b);
  } catch {
    return false;
  }
}

/**
 * Checks every field of a SIWE message against what the server expects.
 * Returns a list of problems (empty when valid).
 */
export function validateSiweMessage(message, expected, now = new Date()) {
  const parsed = parseSiweMessage(message);
  if (!parsed) return ['Message is not a valid sign-in message'];

  const errors = [];
  const issuedAt = new Date(parsed.issuedAt);
  const expirationTime = new Date(parsed.expirationTime);

  if (parsed.domain !== expected.domain) errors.push('Domain does not match this site');
  if (parsed.uri !== expected.uri) errors.push('URI does not match this site');
  if (parsed.version !== '1') errors.push('Unsupported message version');
  if (!sameAddress(parsed.address, expected.address)) errors.push('Address does not match');
  if (!Number.isInteger(parsed.chainId) || parsed.chainId !== expected.chainId) errors.push('Chain ID does not match');
  if (!expected.isSupportedChainId(parsed.chainId)) errors.push('Unsupported network');
  if (!NONCE_PATTERN.test(parsed.nonce ?? '') || parsed.nonce !== expected.nonce) errors.push('Nonce does not match');

  if (Number.isNaN(issuedAt.getTime())) errors.push('Invalid issued-at time');
  else if (issuedAt.getTime() > now.getTime() + CLOCK_SKEW_MS) errors.push('Message is issued in the future');

  if (Number.isNaN(expirationTime.getTime())) errors.push('Invalid expiration time');
  else {
    if (expirationTime.getTime() <= now.getTime()) errors.push('Message has expired');
    if (!Number.isNaN(issuedAt.getTime()) && expirationTime <= issuedAt) errors.push('Expiration is before issue time');
    if (expected.expiresAt && expirationTime.getTime() !== new Date(expected.expiresAt).getTime())
      errors.push('Expiration time does not match');
  }

  return errors;
}
