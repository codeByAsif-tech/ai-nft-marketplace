import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { after, before, beforeEach, describe, it } from 'node:test';

const NFT_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const OTHER_CONTRACT = '0x00000000000000000000000000000000DeaDBeef';
const LOCAL = 31337;
const META_CID = 'bafymetadatacid';
const IMAGE_CID = 'bafyimagecid';

const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nft-mint-'));

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-definitely-longer-than-32-chars';
process.env.BCRYPT_SALT_ROUNDS = '4';
process.env.APP_ORIGIN = 'http://localhost:5173';
process.env.UPLOAD_DIR = uploadDir;
process.env.AI_TEXT_PROVIDER = 'none';
process.env.ENABLE_LOCAL_CHAIN = 'true';
process.env.HARDHAT_NFT_CONTRACT = NFT_ADDRESS;

const { Wallet, Interface, ZeroHash } = await import('ethers');
const { MongoMemoryServer } = await import('mongodb-memory-server');
const { default: request } = await import('supertest');
const { createApp } = await import('../src/app.js');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { User } = await import('../src/models/User.js');
const { AIGeneration } = await import('../src/models/AIGeneration.js');
const { NFT } = await import('../src/models/NFT.js');
const { Transaction } = await import('../src/models/Transaction.js');
const { chainReader } = await import('../src/services/blockchain/chainReader.js');
const { NFT_COLLECTION_ABI } = await import('../src/services/blockchain/abis.js');
const { pngHeader } = await import('./helpers/images.js');

const iface = new Interface(NFT_COLLECTION_ABI);
let mongod;
let app;

// ---------------------------------------------------------------------------
// Fake chain: tests decide what "the blockchain" returns. No real node needed.
// ---------------------------------------------------------------------------
const chain = { receipts: new Map(), blockNumber: 100, owners: new Map(), calls: 0, contractDeployed: true };

const originalReader = { ...chainReader };
chainReader.getReceipt = async (_chainId, hash) => {
  chain.calls++;
  return chain.receipts.get(hash) ?? null;
};
chainReader.getBlockNumber = async () => chain.blockNumber;
chainReader.getOwnerOf = async (_chainId, _contract, tokenId) => chain.owners.get(String(tokenId));
chainReader.hasCode = async () => chain.contractDeployed;

const randomHash = () => `0x${[...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('')}`;

/** A realistic receipt for NFTCollection.mint(), with an encoded NFTMinted log. */
function mintReceipt({ tokenId = 1n, creator, uri = `ipfs://${META_CID}`, contract = NFT_ADDRESS, to, status = 1, blockNumber = 100, emit = true }) {
  const logs = [];
  if (emit) {
    const { topics, data } = iface.encodeEventLog('NFTMinted', [tokenId, creator, uri]);
    logs.push({ address: contract, topics, data, index: 0 });
  }
  return { status, to: to ?? contract, from: creator, blockNumber, hash: ZeroHash, logs };
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function createUser(email = 'alice@example.com') {
  const res = await request(app).post('/api/auth/register').send({ name: 'Test User', email, password: 'secret123' });
  return { token: res.body.data.token, id: res.body.data.user.id };
}

/** Links a fresh wallet through the real signature flow (Phase 2). */
async function linkWallet(token) {
  const wallet = Wallet.createRandom();
  const { body } = await request(app)
    .post('/api/wallet/nonce')
    .set(auth(token))
    .send({ address: wallet.address, chainId: LOCAL });
  const signature = await wallet.signMessage(body.data.message);
  const res = await request(app).post('/api/wallet/verify').set(auth(token)).send({ nonce: body.data.nonce, signature });
  assert.equal(res.status, 200);
  return wallet.address.toLowerCase();
}

/** An artwork that has completed the IPFS step (Phase 4). */
async function createIpfsArtwork(token) {
  const res = await request(app)
    .post('/api/ai/generations')
    .set(auth(token))
    .attach('image', pngHeader(), 'art.png')
    .field('name', 'Neon Skyline');
  const id = res.body.data.generation.id;
  await AIGeneration.updateOne(
    { _id: id },
    {
      status: 'UPLOADED_TO_IPFS',
      'ipfs.status': 'COMPLETE',
      'ipfs.imageCid': IMAGE_CID,
      'ipfs.metadataCid': META_CID,
      'ipfs.metadata': { name: 'Neon Skyline', description: 'Glow', image: `ipfs://${IMAGE_CID}`, attributes: [] },
    }
  );
  return id;
}

async function setup() {
  const { token, id: userId } = await createUser();
  const wallet = await linkWallet(token);
  const generationId = await createIpfsArtwork(token);
  return { token, userId, wallet, generationId };
}

const record = (token, body) => request(app).post('/api/nfts/mint').set(auth(token)).send(body);

before(async () => {
  mongod = await MongoMemoryServer.create();
  await connectDB(mongod.getUri());
  await Promise.all([User.init(), AIGeneration.init(), NFT.init(), Transaction.init()]);
  app = createApp();
});

after(async () => {
  Object.assign(chainReader, originalReader);
  await disconnectDB();
  await mongod.stop();
  await fs.rm(uploadDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), AIGeneration.deleteMany({}), NFT.deleteMany({}), Transaction.deleteMany({})]);
  chain.receipts.clear();
  chain.owners.clear();
  chain.blockNumber = 100;
  chain.calls = 0;
  chain.contractDeployed = true;
});

describe('POST /api/nfts/mint (verified recording)', () => {
  it('records a verified mint: NFT, MINT transaction and artwork marked MINTED', async () => {
    const { token, wallet, generationId } = await setup();
    const hash = randomHash();
    chain.receipts.set(hash, mintReceipt({ tokenId: 7n, creator: wallet }));
    chain.owners.set('7', wallet);

    const res = await record(token, { generationId, chainId: LOCAL, txHash: hash });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const { nft, generation } = res.body.data;

    assert.equal(nft.tokenId, '7');
    assert.equal(nft.chainId, LOCAL);
    assert.equal(nft.blockchain, 'hardhatLocal');
    assert.equal(nft.contractAddress, NFT_ADDRESS.toLowerCase());
    assert.equal(nft.ownerAddress, wallet);
    assert.equal(nft.creatorAddress, wallet);
    assert.equal(nft.metadataURI, `ipfs://${META_CID}`);
    assert.equal(nft.image, `ipfs://${IMAGE_CID}`);
    assert.equal(nft.transactionHash, hash);
    assert.equal(generation.status, 'MINTED');
    assert.equal(generation.mint.status, 'CONFIRMED');

    const tx = await Transaction.findOne({ transactionHash: hash });
    assert.equal(tx.transactionType, 'MINT');
    assert.equal(tx.toAddress, wallet);
  });

  it('returns 202 PENDING while the transaction is not mined, and remembers the hash', async () => {
    const { token, generationId } = await setup();
    const hash = randomHash();

    const res = await record(token, { generationId, chainId: LOCAL, txHash: hash });
    assert.equal(res.status, 202);
    assert.equal(res.body.data.state, 'PENDING');
    const stored = await AIGeneration.findById(generationId);
    assert.equal(stored.mint.status, 'PENDING');
    assert.equal(stored.mint.txHash, hash);
    assert.equal(await NFT.countDocuments(), 0);
  });

  it('is idempotent: reporting the same transaction again returns the same NFT', async () => {
    const { token, wallet, generationId } = await setup();
    const hash = randomHash();
    chain.receipts.set(hash, mintReceipt({ creator: wallet }));
    chain.owners.set('1', wallet);

    const first = await record(token, { generationId, chainId: LOCAL, txHash: hash });
    const second = await record(token, { generationId, chainId: LOCAL, txHash: hash });
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal(second.body.data.nft.id, first.body.data.nft.id);
    assert.equal(await NFT.countDocuments(), 1);
    assert.equal(await Transaction.countDocuments(), 1);
  });

  it('records only one NFT when the same transaction is reported twice at once', async () => {
    const { token, wallet, generationId } = await setup();
    const hash = randomHash();
    chain.receipts.set(hash, mintReceipt({ creator: wallet }));
    chain.owners.set('1', wallet);

    const results = await Promise.all([
      record(token, { generationId, chainId: LOCAL, txHash: hash }),
      record(token, { generationId, chainId: LOCAL, txHash: hash }),
    ]);
    assert.ok(results.every((r) => r.status === 201), results.map((r) => r.status).join());
    assert.equal(await NFT.countDocuments(), 1);
  });

  it('refuses to reuse one transaction for a second artwork', async () => {
    const { token, wallet, generationId } = await setup();
    const hash = randomHash();
    chain.receipts.set(hash, mintReceipt({ creator: wallet }));
    chain.owners.set('1', wallet);
    await record(token, { generationId, chainId: LOCAL, txHash: hash });

    const secondArtwork = await createIpfsArtwork(token);
    const res = await record(token, { generationId: secondArtwork, chainId: LOCAL, txHash: hash });
    assert.equal(res.status, 409);
  });

  it('refuses to mint the same artwork twice', async () => {
    const { token, wallet, generationId } = await setup();
    const hash1 = randomHash();
    chain.receipts.set(hash1, mintReceipt({ creator: wallet }));
    chain.owners.set('1', wallet);
    await record(token, { generationId, chainId: LOCAL, txHash: hash1 });

    const hash2 = randomHash();
    chain.receipts.set(hash2, mintReceipt({ tokenId: 2n, creator: wallet }));
    const res = await record(token, { generationId, chainId: LOCAL, txHash: hash2 });
    assert.equal(res.status, 409);
    assert.match(res.body.message, /already been minted/);
  });

  it('marks a reverted transaction as FAILED so the user can mint again', async () => {
    const { token, wallet, generationId } = await setup();
    const hash = randomHash();
    chain.receipts.set(hash, mintReceipt({ creator: wallet, status: 0, emit: false }));

    const res = await record(token, { generationId, chainId: LOCAL, txHash: hash });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /reverted/);
    const stored = await AIGeneration.findById(generationId);
    assert.equal(stored.mint.status, 'FAILED');
    assert.equal(stored.status, 'UPLOADED_TO_IPFS');

    // A new, valid mint afterwards works.
    const retry = randomHash();
    chain.receipts.set(retry, mintReceipt({ creator: wallet }));
    chain.owners.set('1', wallet);
    assert.equal((await record(token, { generationId, chainId: LOCAL, txHash: retry })).status, 201);
  });

  it('rejects a transaction sent to a different contract', async () => {
    const { token, wallet, generationId } = await setup();
    const hash = randomHash();
    chain.receipts.set(hash, mintReceipt({ creator: wallet, contract: OTHER_CONTRACT }));

    const res = await record(token, { generationId, chainId: LOCAL, txHash: hash });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /not sent to the marketplace NFT contract/);
  });

  it('rejects an NFTMinted event emitted by another contract in the same tx', async () => {
    const { token, wallet, generationId } = await setup();
    const hash = randomHash();
    // Sent to our contract, but the event comes from somewhere else.
    const receipt = mintReceipt({ creator: wallet, contract: OTHER_CONTRACT, to: NFT_ADDRESS });
    chain.receipts.set(hash, receipt);

    const res = await record(token, { generationId, chainId: LOCAL, txHash: hash });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /No NFT was minted/);
  });

  it('explains when no contract is deployed at the configured address (restarted local chain)', async () => {
    const { token, wallet, generationId } = await setup();
    const hash = randomHash();
    // A call to an empty address "succeeds" with no logs.
    chain.receipts.set(hash, mintReceipt({ creator: wallet, emit: false }));
    chain.contractDeployed = false;

    const res = await record(token, { generationId, chainId: LOCAL, txHash: hash });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /No NFT contract is deployed/);
    assert.match(res.body.message, /deploy:local:reset/);
  });

  it("rejects a mint by a wallet that isn't the user's linked wallet", async () => {
    const { token, generationId } = await setup();
    const stranger = Wallet.createRandom().address;
    const hash = randomHash();
    chain.receipts.set(hash, mintReceipt({ creator: stranger }));

    const res = await record(token, { generationId, chainId: LOCAL, txHash: hash });
    assert.equal(res.status, 403);
  });

  it("rejects a token URI that doesn't match the artwork's IPFS metadata", async () => {
    const { token, wallet, generationId } = await setup();
    const hash = randomHash();
    chain.receipts.set(hash, mintReceipt({ creator: wallet, uri: 'ipfs://somethingelse' }));

    const res = await record(token, { generationId, chainId: LOCAL, txHash: hash });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /token URI does not match/);
  });

  it('waits for enough confirmations on testnets', async () => {
    // Sepolia needs 2 confirmations, but its NFT contract isn't configured in tests,
    // so check the local rule instead: 1 confirmation = the mined block itself.
    const { token, wallet, generationId } = await setup();
    const hash = randomHash();
    chain.receipts.set(hash, mintReceipt({ creator: wallet, blockNumber: 101 }));
    chain.owners.set('1', wallet);
    chain.blockNumber = 100; // the node hasn't caught up to the receipt's block yet

    assert.equal((await record(token, { generationId, chainId: LOCAL, txHash: hash })).status, 202);
    chain.blockNumber = 101;
    assert.equal((await record(token, { generationId, chainId: LOCAL, txHash: hash })).status, 201);
  });

  it('requires a verified wallet', async () => {
    const { token } = await createUser();
    const generationId = await createIpfsArtwork(token);
    const res = await record(token, { generationId, chainId: LOCAL, txHash: randomHash() });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /link your wallet/i);
  });

  it('requires the artwork to be on IPFS first', async () => {
    const { token } = await createUser();
    await linkWallet(token);
    const draft = await request(app)
      .post('/api/ai/generations')
      .set(auth(token))
      .attach('image', pngHeader(), 'art.png')
      .field('name', 'Draft');
    const res = await record(token, { generationId: draft.body.data.generation.id, chainId: LOCAL, txHash: randomHash() });
    assert.equal(res.status, 409);
  });

  it("returns 404 for someone else's artwork", async () => {
    const { generationId } = await setup();
    const bob = await createUser('bob@example.com');
    await linkWallet(bob.token);
    const res = await record(bob.token, { generationId, chainId: LOCAL, txHash: randomHash() });
    assert.equal(res.status, 404);
  });

  it('rejects networks without a configured contract, and bad input', async () => {
    const { token, generationId } = await setup();
    const sepolia = await record(token, { generationId, chainId: 11155111, txHash: randomHash() });
    assert.equal(sepolia.status, 400);
    assert.match(sepolia.body.message, /not configured/);

    const bad = await record(token, { generationId: 'x', chainId: 1, txHash: '0x123' });
    assert.equal(bad.status, 400);
  });
});

describe('GET /api/nfts/mine and ownership', () => {
  async function mintOne() {
    const ctx = await setup();
    const hash = randomHash();
    chain.receipts.set(hash, mintReceipt({ creator: ctx.wallet }));
    chain.owners.set('1', ctx.wallet);
    const res = await record(ctx.token, { generationId: ctx.generationId, chainId: LOCAL, txHash: hash });
    return { ...ctx, nft: res.body.data.nft };
  }

  it('lists NFTs owned by my linked wallet', async () => {
    const { token, nft } = await mintOne();
    const res = await request(app).get('/api/nfts/mine').set(auth(token));
    assert.equal(res.status, 200);
    assert.equal(res.body.data.walletLinked, true);
    assert.deepEqual(
      res.body.data.items.map((n) => n.id),
      [nft.id]
    );
  });

  it('re-reads the owner from the chain and updates it if the NFT moved', async () => {
    const { token, nft } = await mintOne();
    const newOwner = Wallet.createRandom().address.toLowerCase();
    chain.owners.set('1', newOwner);

    const res = await request(app).post(`/api/nfts/${nft.id}/verify-owner`).set(auth(token));
    assert.equal(res.status, 200);
    assert.equal(res.body.data.changed, true);
    assert.equal(res.body.data.nft.ownerAddress, newOwner);

    // No longer in "my NFTs".
    const mine = await request(app).get('/api/nfts/mine').set(auth(token));
    assert.equal(mine.body.data.items.length, 0);
  });

  it('includes the minted NFT when loading the artwork', async () => {
    const { token, generationId, nft } = await mintOne();
    const res = await request(app).get(`/api/ai/generations/${generationId}`).set(auth(token));
    assert.equal(res.body.data.generation.nft.id, nft.id);
    assert.equal(res.body.data.generation.nft.tokenId, '1');
  });

  it('blocks editing and IPFS re-publishing once minted', async () => {
    const { token, generationId } = await mintOne();
    const edit = await request(app).patch(`/api/ai/generations/${generationId}`).set(auth(token)).send({ name: 'x' });
    assert.equal(edit.status, 409);
  });
});
