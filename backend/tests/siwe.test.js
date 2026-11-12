import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Wallet } from 'ethers';
import { NONCE_PATTERN, buildSiweMessage, parseSiweMessage, validateSiweMessage } from '../src/utils/siwe.js';

const SEPOLIA = 11155111;
const isSupportedChainId = (id) => [11155111, 84532].includes(id);

function makeMessage(overrides = {}) {
  const now = new Date('2026-01-01T12:00:00.000Z');
  const params = {
    domain: 'localhost:5173',
    uri: 'http://localhost:5173',
    address: Wallet.createRandom().address,
    statement: 'Link this wallet.',
    chainId: SEPOLIA,
    nonce: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
    issuedAt: now,
    expirationTime: new Date(now.getTime() + 5 * 60 * 1000),
    ...overrides,
  };
  const expected = {
    domain: 'localhost:5173',
    uri: 'http://localhost:5173',
    address: params.address,
    chainId: SEPOLIA,
    nonce: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
    expiresAt: params.expirationTime,
    isSupportedChainId,
  };
  return { message: buildSiweMessage(params), expected, now: new Date(now.getTime() + 1000) };
}

describe('SIWE message', () => {
  it('round-trips through build and parse', () => {
    const { message, expected } = makeMessage();
    const parsed = parseSiweMessage(message);
    assert.equal(parsed.domain, 'localhost:5173');
    assert.equal(parsed.uri, 'http://localhost:5173');
    assert.equal(parsed.version, '1');
    assert.equal(parsed.chainId, SEPOLIA);
    assert.equal(parsed.nonce, expected.nonce);
    assert.equal(parsed.address, expected.address);
  });

  it('accepts a valid message', () => {
    const { message, expected, now } = makeMessage();
    assert.deepEqual(validateSiweMessage(message, expected, now), []);
  });

  it('rejects malformed input', () => {
    assert.deepEqual(validateSiweMessage('hello', {}, new Date()), ['Message is not a valid sign-in message']);
    assert.equal(parseSiweMessage(undefined), null);
  });

  const cases = [
    ['a different domain', { domain: 'evil.example' }, 'Domain does not match this site'],
    ['a different URI', { uri: 'https://evil.example' }, 'URI does not match this site'],
    ['a different chain', { chainId: 84532 }, 'Chain ID does not match'],
    ['an unsupported chain', { chainId: 1 }, 'Unsupported network'],
    ['a different nonce', { nonce: 'ffffffffffffffffffffffffffffffff' }, 'Nonce does not match'],
    ['a too-short nonce', { nonce: 'abc' }, 'Nonce does not match'],
    ['a different address', { address: Wallet.createRandom().address }, 'Address does not match'],
  ];

  for (const [label, override, error] of cases) {
    it(`rejects ${label}`, () => {
      const { expected, now } = makeMessage();
      const { message } = makeMessage({ ...override, address: override.address ?? expected.address });
      assert.ok(validateSiweMessage(message, expected, now).includes(error));
    });
  }

  it('rejects an expired message', () => {
    const { message, expected } = makeMessage();
    const later = new Date('2026-01-01T12:06:00.000Z');
    assert.ok(validateSiweMessage(message, expected, later).includes('Message has expired'));
  });

  it('rejects a message issued in the future (beyond clock skew)', () => {
    const { message, expected } = makeMessage();
    const earlier = new Date('2026-01-01T11:50:00.000Z');
    assert.ok(validateSiweMessage(message, expected, earlier).includes('Message is issued in the future'));
  });

  it('tolerates small clock skew on issued-at', () => {
    const { message, expected } = makeMessage();
    const slightlyEarlier = new Date('2026-01-01T11:59:30.000Z');
    assert.deepEqual(validateSiweMessage(message, expected, slightlyEarlier), []);
  });

  it('rejects an expiration that differs from the stored one', () => {
    const { message, expected, now } = makeMessage();
    const tampered = { ...expected, expiresAt: new Date(expected.expiresAt.getTime() + 60_000) };
    assert.ok(validateSiweMessage(message, tampered, now).includes('Expiration time does not match'));
  });

  it('rejects a wrong version', () => {
    const { message, expected, now } = makeMessage();
    const v2 = message.replace('Version: 1', 'Version: 2');
    assert.ok(validateSiweMessage(v2, expected, now).includes('Unsupported message version'));
  });
});

describe('NONCE_PATTERN', () => {
  it('requires at least 8 alphanumeric characters', () => {
    assert.ok(NONCE_PATTERN.test('abcd1234'));
    assert.ok(!NONCE_PATTERN.test('abc123'));
    assert.ok(!NONCE_PATTERN.test('abcd-1234'));
  });
});
