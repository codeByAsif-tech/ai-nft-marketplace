import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';

const NFT_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const MARKET_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
const LOCAL = 31337;
const PRICE = 50000000000000000n; // 0.05 ETH

const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nft-market-'));

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-definitely-longer-than-32-chars';
process.env.BCRYPT_SALT_ROUNDS = '4';
process.env.APP_ORIGIN = 'http://localhost:5173';
process.env.UPLOAD_DIR = uploadDir;
process.env.AI_TEXT_PROVIDER = 'none';
process.env.ENABLE_LOCAL_CHAIN = 'true';
process.env.HARDHAT_NFT_CONTRACT = NFT_ADDRESS;
process.env.HARDHAT_MARKETPLACE_CONTRACT = MARKET_ADDRESS;

const { Wallet, Interface } = await import('ethers');
const { MongoMemoryServer } = await import('mongodb-memory-server');
const { default: request } = await import('supertest');
const { createApp } = await import('../src/app.js');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { User } = await import('../src/models/User.js');
const { NFT } = await import('../src/models/NFT.js');
const { Listing } = await import('../src/models/Listing.js');
const { Transaction } = await import('../src/models/Transaction.js');
const { chainReader } = await import('../src/services/blockchain/chainReader.js');
const { NFT_COLLECTION_ABI, NFT_MARKETPLACE_ABI } = await import('../src/services/blockchain/abis.js');

const nftIface = new Interface(NFT_COLLECTION_ABI);
const marketIface = new Interface(NFT_MARKETPLACE_ABI);
let mongod;
let app;

// ---------------------------------------------------------------------------
// Fake chain
// ---------------------------------------------------------------------------
const chain = { receipts: new Map(), owners: new Map(), listings: new Map(), blockNumber: 100 };
const original = { ...chainReader };
chainReader.getReceipt = async (_c, hash) => chain.receipts.get(hash) ?? null;
chainReader.getBlockNumber = async () => chain.blockNumber;
chainReader.getOwnerOf = async (_c, _contract, tokenId) => chain.owners.get(String(tokenId));
chainReader.getListing = async (_c, _m, id) => chain.listings.get(String(id)) ?? { active: false };
chainReader.hasCode = async () => true;

const randomHash = () =>
  `0x${[...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('')}`;

function receipt({ to, events }) {
  const logs = events.map(({ address, iface, name, args }, index) => {
    const { topics, data } = iface.encodeEventLog(name, args);
    return { address, topics, data, index };
  });
  return { status: 1, to, blockNumber: 100, logs };
}

const listedReceipt = ({ listingId = 1n, seller, tokenId = 1n, price = PRICE, nft = NFT_ADDRESS }) =>
  receipt({
    to: MARKET_ADDRESS,
    events: [{ address: MARKET_ADDRESS, iface: marketIface, name: 'ItemListed', args: [listingId, seller, nft, tokenId, price] }],
  });

const soldReceipt = ({ listingId = 1n, buyer, seller, tokenId = 1n, price = PRICE }) =>
  receipt({
    to: MARKET_ADDRESS,
    events: [
      { address: MARKET_ADDRESS, iface: marketIface, name: 'ItemSold', args: [listingId, buyer, seller, NFT_ADDRESS, tokenId, price] },
    ],
  });

const cancelledReceipt = ({ listingId = 1n, seller, tokenId = 1n }) =>
  receipt({
    to: MARKET_ADDRESS,
    events: [{ address: MARKET_ADDRESS, iface: marketIface, name: 'ListingCancelled', args: [listingId, seller, NFT_ADDRESS, tokenId] }],
  });

const transferReceipt = ({ from, to, tokenId = 1n }) =>
  receipt({
    to: NFT_ADDRESS,
    events: [{ address: NFT_ADDRESS, iface: nftIface, name: 'Transfer', args: [from, to, tokenId] }],
  });

// ---------------------------------------------------------------------------
const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function createUser(email) {
  const res = await request(app).post('/api/auth/register').send({ name: email.split('@')[0], email, password: 'secret123' });
  const token = res.body.data.token;
  const wallet = Wallet.createRandom();
  const nonce = await request(app).post('/api/wallet/nonce').set(auth(token)).send({ address: wallet.address, chainId: LOCAL });
  const signature = await wallet.signMessage(nonce.body.data.message);
  await request(app).post('/api/wallet/verify').set(auth(token)).send({ nonce: nonce.body.data.nonce, signature });
  return { token, id: res.body.data.user.id, wallet: wallet.address.toLowerCase() };
}

async function createNft(owner, { tokenId = '1', name = 'Neon Skyline' } = {}) {
  chain.owners.set(tokenId, owner.wallet);
  return NFT.create({
    name,
    image: 'ipfs://bafyimage',
    imageCID: 'bafyimage',
    metadataURI: 'ipfs://bafymeta',
    metadataCID: 'bafymeta',
    tokenId,
    contractAddress: NFT_ADDRESS,
    ownerAddress: owner.wallet,
    creator: owner.id,
    creatorAddress: owner.wallet,
    blockchain: 'hardhatLocal',
    chainId: LOCAL,
    transactionHash: randomHash(),
    blockNumber: 1,
  });
}

/** Seller lists `nft` on-chain (fake) and reports it. Returns the listing JSON. */
async function list(seller, nft, { listingId = 1n, price = PRICE } = {}) {
  const hash = randomHash();
  chain.receipts.set(hash, listedReceipt({ listingId, seller: seller.wallet, tokenId: BigInt(nft.tokenId), price }));
  chain.owners.set(nft.tokenId, MARKET_ADDRESS.toLowerCase()); // escrow
  chain.listings.set(String(listingId), { seller: seller.wallet, active: true });
  const res = await request(app).post('/api/marketplace/listings').set(auth(seller.token)).send({ nftId: nft.id, txHash: hash });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return { listing: res.body.data.listing, hash };
}

async function buy(buyer, seller, listing, { tokenId = '1' } = {}) {
  const hash = randomHash();
  chain.receipts.set(hash, soldReceipt({ listingId: BigInt(listing.listingId), buyer: buyer.wallet, seller: seller.wallet, tokenId: BigInt(tokenId) }));
  chain.owners.set(tokenId, buyer.wallet);
  chain.listings.set(listing.listingId, { seller: seller.wallet, active: false });
  return { res: await request(app).post(`/api/marketplace/listings/${listing.id}/buy`).set(auth(buyer.token)).send({ txHash: hash }), hash };
}

before(async () => {
  mongod = await MongoMemoryServer.create();
  await connectDB(mongod.getUri());
  await Promise.all([User.init(), NFT.init(), Listing.init(), Transaction.init()]);
  app = createApp();
});

after(async () => {
  Object.assign(chainReader, original);
  await disconnectDB();
  await mongod.stop();
  await fs.rm(uploadDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), NFT.deleteMany({}), Listing.deleteMany({}), Transaction.deleteMany({})]);
  chain.receipts.clear();
  chain.owners.clear();
  chain.listings.clear();
});

// ---------------------------------------------------------------------------
describe('listing', () => {
  it('records a verified listing: ACTIVE, NFT in escrow, LIST transaction, visible on Explore', async () => {
    const seller = await createUser('seller@example.com');
    const nft = await createNft(seller);
    const { listing, hash } = await list(seller, nft);

    assert.equal(listing.listingStatus, 'ACTIVE');
    assert.equal(listing.listingId, '1');
    assert.equal(listing.price, PRICE.toString());
    assert.equal(listing.priceEth, 0.05);
    assert.equal(listing.sellerWallet, seller.wallet);

    const stored = await NFT.findById(nft.id);
    assert.equal(stored.ownerAddress, MARKET_ADDRESS.toLowerCase());
    assert.equal(String(stored.activeListing), listing.id);
    assert.equal((await Transaction.findOne({ transactionHash: hash })).transactionType, 'LIST');

    const explore = await request(app).get('/api/marketplace/listings');
    assert.equal(explore.status, 200);
    assert.equal(explore.body.data.items.length, 1);
    assert.equal(explore.body.data.items[0].nft.name, 'Neon Skyline');
    assert.equal(explore.body.data.items[0].seller.name, 'seller');
  });

  it('keeps a listed NFT in the seller\'s "My NFTs" while it is in escrow', async () => {
    const seller = await createUser('seller@example.com');
    const nft = await createNft(seller);
    await list(seller, nft);
    const mine = await request(app).get('/api/nfts/mine').set(auth(seller.token));
    assert.equal(mine.body.data.items.length, 1);
    assert.equal(mine.body.data.items[0].activeListing.listingStatus, 'ACTIVE');
  });

  it('is idempotent and returns 202 while the tx is pending', async () => {
    const seller = await createUser('seller@example.com');
    const nft = await createNft(seller);
    const pending = await request(app)
      .post('/api/marketplace/listings')
      .set(auth(seller.token))
      .send({ nftId: nft.id, txHash: randomHash() });
    assert.equal(pending.status, 202);

    const { hash } = await list(seller, nft);
    const again = await request(app).post('/api/marketplace/listings').set(auth(seller.token)).send({ nftId: nft.id, txHash: hash });
    assert.equal(again.status, 201);
    assert.equal(await Listing.countDocuments(), 1);
    assert.equal(await Transaction.countDocuments(), 1);
  });

  it('rejects a listing created by a different wallet (unauthorized)', async () => {
    const seller = await createUser('seller@example.com');
    const attacker = await createUser('attacker@example.com');
    const nft = await createNft(seller);
    const hash = randomHash();
    chain.receipts.set(hash, listedReceipt({ seller: seller.wallet }));

    const res = await request(app).post('/api/marketplace/listings').set(auth(attacker.token)).send({ nftId: nft.id, txHash: hash });
    assert.equal(res.status, 403);
    assert.equal(await Listing.countDocuments(), 0);
  });

  it('rejects a listing event for a different token', async () => {
    const seller = await createUser('seller@example.com');
    const nft = await createNft(seller);
    const hash = randomHash();
    chain.receipts.set(hash, listedReceipt({ seller: seller.wallet, tokenId: 99n }));
    const res = await request(app).post('/api/marketplace/listings').set(auth(seller.token)).send({ nftId: nft.id, txHash: hash });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /different NFT/);
  });

  it('rejects a transaction to another contract, or with a spoofed event from another contract', async () => {
    const seller = await createUser('seller@example.com');
    const nft = await createNft(seller);

    const wrongTo = randomHash();
    chain.receipts.set(wrongTo, { ...listedReceipt({ seller: seller.wallet }), to: NFT_ADDRESS });
    const r1 = await request(app).post('/api/marketplace/listings').set(auth(seller.token)).send({ nftId: nft.id, txHash: wrongTo });
    assert.equal(r1.status, 400);

    const spoofed = randomHash();
    const fake = listedReceipt({ seller: seller.wallet });
    fake.logs[0].address = '0x000000000000000000000000000000000000dEaD';
    chain.receipts.set(spoofed, fake);
    const r2 = await request(app).post('/api/marketplace/listings').set(auth(seller.token)).send({ nftId: nft.id, txHash: spoofed });
    assert.equal(r2.status, 400);
    assert.match(r2.body.message, /No listing was created/);
  });

  it('requires login and a verified wallet', async () => {
    const res = await request(app).post('/api/marketplace/listings').send({ nftId: '000000000000000000000000', txHash: randomHash() });
    assert.equal(res.status, 401);
  });
});

// ---------------------------------------------------------------------------
describe('buying', () => {
  it('records a verified purchase: SOLD, new owner, BUY transaction for both sides', async () => {
    const seller = await createUser('seller@example.com');
    const buyer = await createUser('buyer@example.com');
    const nft = await createNft(seller);
    const { listing } = await list(seller, nft);

    const { res, hash } = await buy(buyer, seller, listing);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.listing.listingStatus, 'SOLD');
    assert.equal(res.body.data.listing.buyerWallet, buyer.wallet);

    const stored = await NFT.findById(nft.id);
    assert.equal(stored.ownerAddress, buyer.wallet);
    assert.equal(stored.activeListing, null);

    const tx = await Transaction.findOne({ transactionHash: hash });
    assert.equal(tx.transactionType, 'BUY');
    assert.equal(tx.price, PRICE.toString());
    assert.equal(String(tx.buyer), buyer.id);
    assert.equal(String(tx.seller), seller.id);

    // Gone from Explore; now in the buyer's NFTs, not the seller's.
    assert.equal((await request(app).get('/api/marketplace/listings')).body.data.items.length, 0);
    assert.equal((await request(app).get('/api/nfts/mine').set(auth(buyer.token))).body.data.items.length, 1);
    assert.equal((await request(app).get('/api/nfts/mine').set(auth(seller.token))).body.data.items.length, 0);

    // Both see it in their history.
    const sellerTx = await request(app).get('/api/users/me/transactions').set(auth(seller.token));
    const buyerTx = await request(app).get('/api/users/me/transactions?type=BUY').set(auth(buyer.token));
    assert.ok(sellerTx.body.data.items.some((t) => t.transactionType === 'BUY'));
    assert.equal(buyerTx.body.data.items.length, 1);
  });

  it('prevents a double purchase: a second sale of the same listing is refused', async () => {
    const seller = await createUser('seller@example.com');
    const buyer = await createUser('buyer@example.com');
    const other = await createUser('other@example.com');
    const nft = await createNft(seller);
    const { listing } = await list(seller, nft);
    await buy(buyer, seller, listing);

    const { res } = await buy(other, seller, listing);
    assert.equal(res.status, 409);
    assert.equal((await Transaction.countDocuments({ transactionType: 'BUY' })), 1);
    assert.equal((await NFT.findById(nft.id)).ownerAddress, buyer.wallet);
  });

  it('reporting the same purchase twice is idempotent', async () => {
    const seller = await createUser('seller@example.com');
    const buyer = await createUser('buyer@example.com');
    const nft = await createNft(seller);
    const { listing } = await list(seller, nft);
    const { hash } = await buy(buyer, seller, listing);

    const again = await request(app).post(`/api/marketplace/listings/${listing.id}/buy`).set(auth(buyer.token)).send({ txHash: hash });
    assert.equal(again.status, 200);
    assert.equal(await Transaction.countDocuments({ transactionType: 'BUY' }), 1);
  });

  it("rejects claiming someone else's purchase (buyer wallet mismatch)", async () => {
    const seller = await createUser('seller@example.com');
    const buyer = await createUser('buyer@example.com');
    const impostor = await createUser('impostor@example.com');
    const nft = await createNft(seller);
    const { listing } = await list(seller, nft);

    const hash = randomHash();
    chain.receipts.set(hash, soldReceipt({ buyer: buyer.wallet, seller: seller.wallet }));
    const res = await request(app).post(`/api/marketplace/listings/${listing.id}/buy`).set(auth(impostor.token)).send({ txHash: hash });
    assert.equal(res.status, 403);
    assert.equal((await Listing.findById(listing.id)).listingStatus, 'ACTIVE');
  });

  it('rejects a sale event for a different listing', async () => {
    const seller = await createUser('seller@example.com');
    const buyer = await createUser('buyer@example.com');
    const nft = await createNft(seller);
    const { listing } = await list(seller, nft);
    const hash = randomHash();
    chain.receipts.set(hash, soldReceipt({ listingId: 7n, buyer: buyer.wallet, seller: seller.wallet }));
    const res = await request(app).post(`/api/marketplace/listings/${listing.id}/buy`).set(auth(buyer.token)).send({ txHash: hash });
    assert.equal(res.status, 400);
  });

  it('cannot buy a cancelled listing', async () => {
    const seller = await createUser('seller@example.com');
    const buyer = await createUser('buyer@example.com');
    const nft = await createNft(seller);
    const { listing } = await list(seller, nft);
    const cancelHash = randomHash();
    chain.receipts.set(cancelHash, cancelledReceipt({ seller: seller.wallet }));
    chain.owners.set('1', seller.wallet);
    await request(app).post(`/api/marketplace/listings/${listing.id}/cancel`).set(auth(seller.token)).send({ txHash: cancelHash });

    const { res } = await buy(buyer, seller, listing);
    assert.equal(res.status, 409);
  });
});

// ---------------------------------------------------------------------------
describe('cancelling', () => {
  it('records a verified cancellation and returns the NFT to the seller', async () => {
    const seller = await createUser('seller@example.com');
    const nft = await createNft(seller);
    const { listing } = await list(seller, nft);

    const hash = randomHash();
    chain.receipts.set(hash, cancelledReceipt({ seller: seller.wallet }));
    chain.owners.set('1', seller.wallet);
    chain.listings.set('1', { seller: seller.wallet, active: false });

    const res = await request(app).post(`/api/marketplace/listings/${listing.id}/cancel`).set(auth(seller.token)).send({ txHash: hash });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.listing.listingStatus, 'CANCELLED');
    const stored = await NFT.findById(nft.id);
    assert.equal(stored.ownerAddress, seller.wallet);
    assert.equal(stored.activeListing, null);
    assert.equal(await Transaction.countDocuments({ transactionType: 'CANCEL' }), 1);
  });

  it('only the seller can cancel', async () => {
    const seller = await createUser('seller@example.com');
    const other = await createUser('other@example.com');
    const nft = await createNft(seller);
    const { listing } = await list(seller, nft);
    const res = await request(app).post(`/api/marketplace/listings/${listing.id}/cancel`).set(auth(other.token)).send({ txHash: randomHash() });
    assert.equal(res.status, 403);
  });

  it('cannot cancel after the NFT was sold', async () => {
    const seller = await createUser('seller@example.com');
    const buyer = await createUser('buyer@example.com');
    const nft = await createNft(seller);
    const { listing } = await list(seller, nft);
    await buy(buyer, seller, listing);
    const res = await request(app).post(`/api/marketplace/listings/${listing.id}/cancel`).set(auth(seller.token)).send({ txHash: randomHash() });
    assert.equal(res.status, 409);
  });

  it('allows listing again after cancelling', async () => {
    const seller = await createUser('seller@example.com');
    const nft = await createNft(seller);
    const { listing } = await list(seller, nft);
    const hash = randomHash();
    chain.receipts.set(hash, cancelledReceipt({ seller: seller.wallet }));
    chain.owners.set('1', seller.wallet);
    chain.listings.set('1', { seller: seller.wallet, active: false });
    await request(app).post(`/api/marketplace/listings/${listing.id}/cancel`).set(auth(seller.token)).send({ txHash: hash });

    const { listing: second } = await list(seller, nft, { listingId: 2n });
    assert.equal(second.listingId, '2');
    assert.equal(second.listingStatus, 'ACTIVE');
  });
});

// ---------------------------------------------------------------------------
describe('transfer', () => {
  it('records a verified transfer and updates the owner', async () => {
    const alice = await createUser('alice@example.com');
    const bob = await createUser('bob@example.com');
    const nft = await createNft(alice);
    const hash = randomHash();
    chain.receipts.set(hash, transferReceipt({ from: alice.wallet, to: bob.wallet }));
    chain.owners.set('1', bob.wallet);

    const res = await request(app).post(`/api/nfts/${nft.id}/transfer`).set(auth(alice.token)).send({ txHash: hash });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.nft.ownerAddress, bob.wallet);
    const tx = await Transaction.findOne({ transactionHash: hash });
    assert.equal(tx.transactionType, 'TRANSFER');
    assert.equal(String(tx.buyer), bob.id); // recipient account resolved from their wallet
  });

  it("rejects recording a transfer from someone else's wallet", async () => {
    const alice = await createUser('alice@example.com');
    const mallory = await createUser('mallory@example.com');
    const nft = await createNft(alice);
    const hash = randomHash();
    chain.receipts.set(hash, transferReceipt({ from: alice.wallet, to: mallory.wallet }));
    const res = await request(app).post(`/api/nfts/${nft.id}/transfer`).set(auth(mallory.token)).send({ txHash: hash });
    assert.equal(res.status, 403);
  });
});

// ---------------------------------------------------------------------------
describe('sync with the chain and public pages', () => {
  it('marks a listing SOLD when the chain shows it was bought but nobody reported it', async () => {
    const seller = await createUser('seller@example.com');
    const nft = await createNft(seller);
    const { listing } = await list(seller, nft);
    const stranger = Wallet.createRandom().address.toLowerCase();
    chain.listings.set('1', { seller: seller.wallet, active: false });
    chain.owners.set('1', stranger);

    const res = await request(app).get(`/api/marketplace/listings/${listing.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.listing.listingStatus, 'SOLD');
    assert.equal(res.body.data.listing.buyerWallet, stranger);
    assert.equal((await NFT.findById(nft.id)).ownerAddress, stranger);
  });

  it('marks a listing CANCELLED when the NFT went back to the seller', async () => {
    const seller = await createUser('seller@example.com');
    const nft = await createNft(seller);
    await list(seller, nft);
    chain.listings.set('1', { seller: seller.wallet, active: false });
    chain.owners.set('1', seller.wallet);

    const res = await request(app).get(`/api/nfts/${nft.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.nft.activeListing, null);
    assert.equal((await Listing.findOne()).listingStatus, 'CANCELLED');
  });

  it('shows public NFT details and activity without logging in', async () => {
    const seller = await createUser('seller@example.com');
    const nft = await createNft(seller);
    await list(seller, nft);

    const details = await request(app).get(`/api/nfts/${nft.id}`);
    assert.equal(details.status, 200);
    assert.equal(details.body.data.nft.creator.name, 'seller');
    assert.equal(details.body.data.nft.activeListing.listingStatus, 'ACTIVE');

    const activity = await request(app).get(`/api/nfts/${nft.id}/activity`);
    assert.equal(activity.status, 200);
    assert.equal(activity.body.data.items[0].transactionType, 'LIST');
  });

  it("hides a seller's own listings from their Explore, but shows them to everyone else", async () => {
    const seller = await createUser('seller@example.com');
    const visitor = await createUser('visitor@example.com');
    const nft = await createNft(seller);
    await list(seller, nft);

    const asSeller = await request(app).get('/api/marketplace/listings').set(auth(seller.token));
    const asVisitor = await request(app).get('/api/marketplace/listings').set(auth(visitor.token));
    const anonymous = await request(app).get('/api/marketplace/listings');
    const badToken = await request(app).get('/api/marketplace/listings').set(auth('not-a-real-token'));

    assert.equal(asSeller.body.data.items.length, 0);
    assert.equal(asVisitor.body.data.items.length, 1);
    assert.equal(anonymous.body.data.items.length, 1);
    assert.equal(badToken.status, 200, 'a bad token on a public page is treated as anonymous');
    assert.equal(badToken.body.data.items.length, 1);
  });

  it('filters Explore by name and sorts by price', async () => {
    const seller = await createUser('seller@example.com');
    const a = await createNft(seller, { tokenId: '1', name: 'Neon Skyline' });
    const b = await createNft(seller, { tokenId: '2', name: 'Ocean Dream' });
    await list(seller, a, { listingId: 1n, price: 3n * PRICE });
    await list(seller, b, { listingId: 2n, price: PRICE });

    const search = await request(app).get('/api/marketplace/listings?search=ocean');
    assert.deepEqual(search.body.data.items.map((l) => l.nft.name), ['Ocean Dream']);

    const cheap = await request(app).get('/api/marketplace/listings?sort=price_asc');
    assert.deepEqual(cheap.body.data.items.map((l) => l.nft.name), ['Ocean Dream', 'Neon Skyline']);

    const regex = await request(app).get('/api/marketplace/listings?search=.*');
    assert.equal(regex.body.data.items.length, 0, 'search text is matched literally, not as a regex');
  });
});
