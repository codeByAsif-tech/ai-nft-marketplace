import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-definitely-longer-than-32-chars';
process.env.BCRYPT_SALT_ROUNDS = '4';
process.env.AI_TEXT_PROVIDER = 'none';

const { MongoMemoryServer } = await import('mongodb-memory-server');
const { default: request } = await import('supertest');
const { createApp } = await import('../src/app.js');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { User } = await import('../src/models/User.js');
const { NFT } = await import('../src/models/NFT.js');
const { Listing } = await import('../src/models/Listing.js');
const { Transaction } = await import('../src/models/Transaction.js');

let mongod;
let app;

const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function register(email, name = email.split('@')[0]) {
  const res = await request(app).post('/api/auth/register').send({ name, email, password: 'secret123' });
  return { token: res.body.data.token, id: res.body.data.user.id };
}

async function registerAdmin(email = 'admin@example.com') {
  const user = await register(email, 'Admin');
  await User.updateOne({ _id: user.id }, { role: 'ADMIN' });
  return user;
}

before(async () => {
  mongod = await MongoMemoryServer.create();
  await connectDB(mongod.getUri());
  await Promise.all([User.init(), NFT.init(), Listing.init(), Transaction.init()]);
  app = createApp();
});

after(async () => {
  await disconnectDB();
  await mongod.stop();
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), NFT.deleteMany({}), Listing.deleteMany({}), Transaction.deleteMany({})]);
});

describe('admin access control (enforced by the backend)', () => {
  const routes = [
    ['get', '/api/admin/stats'],
    ['get', '/api/admin/activity'],
    ['get', '/api/admin/users'],
    ['patch', '/api/admin/users/000000000000000000000000'],
  ];

  it('rejects anonymous requests with 401', async () => {
    for (const [method, path] of routes) {
      assert.equal((await request(app)[method](path)).status, 401, path);
    }
  });

  it('rejects normal users with 403', async () => {
    const { token } = await register('user@example.com');
    for (const [method, path] of routes) {
      const res = await request(app)[method](path).set(auth(token)).send({ isActive: false });
      assert.equal(res.status, 403, path);
    }
  });

  it('if the ADMIN role is removed in the database, access ends on the very next request', async () => {
    const admin = await registerAdmin();
    assert.equal((await request(app).get('/api/admin/stats').set(auth(admin.token))).status, 200);
    await User.updateOne({ _id: admin.id }, { role: 'USER' });
    assert.equal((await request(app).get('/api/admin/stats').set(auth(admin.token))).status, 403);
  });
});

describe('GET /api/admin/stats', () => {
  it('counts users, NFTs, collections, listings and sales from real data', async () => {
    const admin = await registerAdmin();
    const alice = await register('alice@example.com');
    await register('bob@example.com');
    await User.updateOne({ _id: alice.id }, { isActive: false, walletAddress: '0x' + 'a'.repeat(40) });

    const base = {
      image: 'ipfs://x',
      imageCID: 'x',
      metadataURI: 'ipfs://y',
      metadataCID: 'y',
      contractAddress: '0x' + 'c'.repeat(40),
      ownerAddress: '0x' + 'a'.repeat(40),
      creator: alice.id,
      creatorAddress: '0x' + 'a'.repeat(40),
      blockchain: 'hardhatLocal',
      chainId: 31337,
      blockNumber: 1,
    };
    const n1 = await NFT.create({ ...base, name: 'One', tokenId: '1', collectionName: 'Neon', transactionHash: '0x1' });
    const n2 = await NFT.create({ ...base, name: 'Two', tokenId: '2', collectionName: 'Neon', transactionHash: '0x2' });
    await NFT.create({ ...base, name: 'Three', tokenId: '3', collectionName: 'Ocean', transactionHash: '0x3' });

    const listing = {
      sellerWallet: '0x' + 'a'.repeat(40),
      contractAddress: '0x' + 'd'.repeat(40),
      nftContract: base.contractAddress,
      blockchain: 'hardhatLocal',
      chainId: 31337,
      transactionHash: '0xl',
    };
    await Listing.create({ ...listing, nft: n1._id, listingId: '1', tokenId: '1', price: '1', priceEth: 1.5, listingStatus: 'SOLD' });
    await Listing.create({ ...listing, nft: n2._id, listingId: '2', tokenId: '2', price: '1', priceEth: 0.5, listingStatus: 'ACTIVE' });

    const res = await request(app).get('/api/admin/stats').set(auth(admin.token));
    assert.equal(res.status, 200);
    const s = res.body.data;
    assert.deepEqual(s.users, { total: 3, active: 2, inactive: 1, admins: 1, new7d: 3, walletsLinked: 1 });
    assert.equal(s.nfts.total, 3);
    assert.equal(s.collections.total, 2);
    assert.deepEqual(s.listings, { active: 1, total: 2 });
    assert.deepEqual(s.sales, { completed: 1, volumeEth: 1.5 });
  });
});

describe('user management', () => {
  it('lists, searches and filters users with per-user stats', async () => {
    const admin = await registerAdmin();
    await register('alice@example.com', 'Alice Doe');
    await new Promise((r) => setTimeout(r, 10)); // distinct createdAt for a stable order
    await register('bob@example.com', 'Bob Roe');

    const all = await request(app).get('/api/admin/users').set(auth(admin.token));
    assert.equal(all.status, 200);
    assert.equal(all.body.data.pagination.total, 3);
    assert.ok(all.body.data.items.every((u) => u.password === undefined));
    assert.deepEqual(all.body.data.items[0].stats, { nftsCreated: 0, nftsOwned: 0, sales: 0 });

    const search = await request(app).get('/api/admin/users?search=alice').set(auth(admin.token));
    assert.deepEqual(search.body.data.items.map((u) => u.email), ['alice@example.com']);

    const admins = await request(app).get('/api/admin/users?role=ADMIN').set(auth(admin.token));
    assert.deepEqual(admins.body.data.items.map((u) => u.email), ['admin@example.com']);

    const regex = await request(app).get('/api/admin/users?search=.*').set(auth(admin.token));
    assert.equal(regex.body.data.items.length, 0, 'search is literal, not a regex');
  });

  it('deactivating a user blocks their existing session and login immediately', async () => {
    const admin = await registerAdmin();
    const alice = await register('alice@example.com');

    const res = await request(app).patch(`/api/admin/users/${alice.id}`).set(auth(admin.token)).send({ isActive: false });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.isActive, false);

    assert.equal((await request(app).get('/api/auth/me').set(auth(alice.token))).status, 403);
    const login = await request(app).post('/api/auth/login').send({ email: 'alice@example.com', password: 'secret123' });
    assert.equal(login.status, 403);

    // Reactivate. Deactivation ended Alice's old sessions, so her old token stays
    // dead; she has to log in again, which now works.
    await request(app).patch(`/api/admin/users/${alice.id}`).set(auth(admin.token)).send({ isActive: true });
    assert.equal((await request(app).get('/api/auth/me').set(auth(alice.token))).status, 401);
    const relogin = await request(app).post('/api/auth/login').send({ email: 'alice@example.com', password: 'secret123' });
    assert.equal(relogin.status, 200);
    assert.equal((await request(app).get('/api/auth/me').set(auth(relogin.body.data.token))).status, 200);
  });

  it('roles cannot be changed through the API (role in the body is ignored)', async () => {
    const admin = await registerAdmin();
    const alice = await register('alice@example.com');

    const res = await request(app)
      .patch(`/api/admin/users/${alice.id}`)
      .set(auth(admin.token))
      .send({ isActive: true, role: 'ADMIN' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.role, 'USER');
    assert.equal((await User.findById(alice.id)).role, 'USER');
    assert.equal((await request(app).get('/api/admin/stats').set(auth(alice.token))).status, 403);

    // A body with only a role is rejected outright (isActive is required).
    const roleOnly = await request(app).patch(`/api/admin/users/${alice.id}`).set(auth(admin.token)).send({ role: 'ADMIN' });
    assert.equal(roleOnly.status, 400);
  });

  it("an admin can't deactivate their own account", async () => {
    const admin = await registerAdmin();
    await registerAdmin('admin2@example.com');
    const res = await request(app).patch(`/api/admin/users/${admin.id}`).set(auth(admin.token)).send({ isActive: false });
    assert.equal(res.status, 400);
  });

  it('keeps at least one active admin', async () => {
    const a = await registerAdmin('a@example.com');
    const b = await registerAdmin('b@example.com');

    // A deactivates B: allowed, A is still an active admin.
    const res = await request(app).patch(`/api/admin/users/${b.id}`).set(auth(a.token)).send({ isActive: false });
    assert.equal(res.status, 200);

    // Now A is the last active admin: the service refuses to deactivate them.
    const { setUserActive } = await import('../src/services/admin.service.js');
    await assert.rejects(setUserActive(b.id, a.id, false), /last active admin/);
  });

  it('ignores fields other than isActive', async () => {
    const admin = await registerAdmin();
    const alice = await register('alice@example.com');
    const res = await request(app)
      .patch(`/api/admin/users/${alice.id}`)
      .set(auth(admin.token))
      .send({ isActive: true, email: 'hacked@example.com', password: 'x', walletAddress: '0xabc' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.email, 'alice@example.com');
    assert.equal(res.body.data.user.walletAddress, null);
  });

  it('validates input', async () => {
    const admin = await registerAdmin();
    const alice = await register('alice@example.com');
    const patch = (id, body) => request(app).patch(`/api/admin/users/${id}`).set(auth(admin.token)).send(body);
    assert.equal((await patch(alice.id, {})).status, 400);
    assert.equal((await patch(alice.id, { isActive: 'yes' })).status, 400);
    assert.equal((await patch('not-an-id', { isActive: true })).status, 400);
  });
});

describe('GET /api/admin/activity', () => {
  it('returns recent platform transactions, newest first', async () => {
    const admin = await registerAdmin();
    await Transaction.create({ transactionHash: '0xa', transactionType: 'MINT', blockchain: 'hardhatLocal', chainId: 31337 });
    await new Promise((r) => setTimeout(r, 10)); // distinct createdAt for a stable order
    await Transaction.create({ transactionHash: '0xb', transactionType: 'BUY', price: '1', blockchain: 'hardhatLocal', chainId: 31337 });

    const res = await request(app).get('/api/admin/activity').set(auth(admin.token));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.items.map((t) => t.transactionType), ['BUY', 'MINT']);

    const buys = await request(app).get('/api/admin/activity?type=BUY').set(auth(admin.token));
    assert.equal(buys.body.data.items.length, 1);
  });
});
