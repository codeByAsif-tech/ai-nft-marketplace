import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-definitely-longer-than-32-chars';
process.env.BCRYPT_SALT_ROUNDS = '4';
process.env.APP_ORIGIN = 'http://localhost:5173';

const { Wallet } = await import('ethers');
const { MongoMemoryServer } = await import('mongodb-memory-server');
const { default: request } = await import('supertest');
const { createApp } = await import('../src/app.js');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { User } = await import('../src/models/User.js');
const { WalletNonce } = await import('../src/models/WalletNonce.js');

const SEPOLIA = 11155111;
const BASE_SEPOLIA = 84532;

let mongod;
let app;

async function createUser(email = 'alice@example.com') {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Test User', email, password: 'secret123' });
  return res.body.data.token;
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function requestNonce(token, address, chainId = SEPOLIA) {
  return request(app).post('/api/wallet/nonce').set(auth(token)).send({ address, chainId });
}

async function verify(token, nonce, signature) {
  return request(app).post('/api/wallet/verify').set(auth(token)).send({ nonce, signature });
}

/** Full happy path: request a nonce, sign the server's message, verify. */
async function linkWallet(token, wallet, chainId = SEPOLIA) {
  const { body } = await requestNonce(token, wallet.address, chainId);
  const signature = await wallet.signMessage(body.data.message);
  return verify(token, body.data.nonce, signature);
}

before(async () => {
  mongod = await MongoMemoryServer.create();
  await connectDB(mongod.getUri());
  await Promise.all([User.init(), WalletNonce.init()]);
  app = createApp();
});

after(async () => {
  await disconnectDB();
  await mongod.stop();
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), WalletNonce.deleteMany({})]);
});

describe('GET /api/networks', () => {
  it('lists Sepolia and Base Sepolia (plus the local chain outside production)', async () => {
    const res = await request(app).get('/api/networks');
    assert.equal(res.status, 200);
    const ids = res.body.data.map((n) => n.chainId);
    assert.ok(ids.includes(SEPOLIA));
    assert.ok(ids.includes(BASE_SEPOLIA));
    assert.ok(ids.every((id) => [SEPOLIA, BASE_SEPOLIA, 31337].includes(id)));
    assert.ok(res.body.data.every((n) => n.rpcUrl === undefined), 'RPC URLs must not be exposed');
  });
});

describe('POST /api/wallet/nonce', () => {
  it('requires authentication', async () => {
    const res = await request(app)
      .post('/api/wallet/nonce')
      .send({ address: Wallet.createRandom().address, chainId: SEPOLIA });
    assert.equal(res.status, 401);
  });

  it('returns an EIP-4361 style message bound to the address, chain and nonce', async () => {
    const token = await createUser();
    const wallet = Wallet.createRandom();
    const res = await requestNonce(token, wallet.address, BASE_SEPOLIA);

    assert.equal(res.status, 201);
    const { nonce, message, expiresAt } = res.body.data;
    assert.match(nonce, /^[a-f0-9]{32}$/);
    assert.ok(message.startsWith('localhost:5173 wants you to sign in with your Ethereum account:'));
    assert.ok(message.includes(wallet.address));
    assert.ok(message.includes(`Chain ID: ${BASE_SEPOLIA}`));
    assert.ok(message.includes(`Nonce: ${nonce}`));
    assert.ok(new Date(expiresAt) > new Date());
  });

  it('rejects an invalid address', async () => {
    const token = await createUser();
    const res = await requestNonce(token, '0x123');
    assert.equal(res.status, 400);
  });

  it('rejects an unsupported chain (e.g. Ethereum mainnet)', async () => {
    const token = await createUser();
    const res = await requestNonce(token, Wallet.createRandom().address, 1);
    assert.equal(res.status, 400);
  });

  it('invalidates the previous nonce when a new one is requested', async () => {
    const token = await createUser();
    const wallet = Wallet.createRandom();
    const first = await requestNonce(token, wallet.address);
    await requestNonce(token, wallet.address);

    const sig = await wallet.signMessage(first.body.data.message);
    const res = await verify(token, first.body.data.nonce, sig);
    assert.equal(res.status, 400);
  });
});

describe('POST /api/wallet/verify', () => {
  it('links the wallet after a valid signature', async () => {
    const token = await createUser();
    const wallet = Wallet.createRandom();
    const res = await linkWallet(token, wallet);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.walletAddress, wallet.address.toLowerCase());
    assert.ok(res.body.data.user.walletLinkedAt);

    const me = await request(app).get('/api/auth/me').set(auth(token));
    assert.equal(me.body.data.user.walletAddress, wallet.address.toLowerCase());
  });

  it('accepts a lowercase address in the nonce request', async () => {
    const token = await createUser();
    const wallet = Wallet.createRandom();
    const { body } = await requestNonce(token, wallet.address.toLowerCase());
    const res = await verify(token, body.data.nonce, await wallet.signMessage(body.data.message));
    assert.equal(res.status, 200);
  });

  it('rejects a nonce that is used twice (replay)', async () => {
    const token = await createUser();
    const wallet = Wallet.createRandom();
    const { body } = await requestNonce(token, wallet.address);
    const sig = await wallet.signMessage(body.data.message);

    assert.equal((await verify(token, body.data.nonce, sig)).status, 200);
    assert.equal((await verify(token, body.data.nonce, sig)).status, 400);
  });

  it('rejects an expired nonce', async () => {
    const token = await createUser();
    const wallet = Wallet.createRandom();
    const { body } = await requestNonce(token, wallet.address);
    await WalletNonce.updateOne({ nonce: body.data.nonce }, { expiresAt: new Date(Date.now() - 1000) });

    const res = await verify(token, body.data.nonce, await wallet.signMessage(body.data.message));
    assert.equal(res.status, 400);
  });

  it('rejects a signature from a different wallet, and burns the nonce', async () => {
    const token = await createUser();
    const owner = Wallet.createRandom();
    const attacker = Wallet.createRandom();
    const { body } = await requestNonce(token, owner.address);

    const bad = await verify(token, body.data.nonce, await attacker.signMessage(body.data.message));
    assert.equal(bad.status, 400);

    // Even the correct signature fails now: each nonce gets exactly one attempt.
    const good = await verify(token, body.data.nonce, await owner.signMessage(body.data.message));
    assert.equal(good.status, 400);

    const user = await User.findOne({ email: 'alice@example.com' });
    assert.equal(user.walletAddress, null);
  });

  it('rejects a signature over a modified message', async () => {
    const token = await createUser();
    const wallet = Wallet.createRandom();
    const { body } = await requestNonce(token, wallet.address);
    const tampered = body.data.message.replace('Chain ID: 11155111', 'Chain ID: 1');

    const res = await verify(token, body.data.nonce, await wallet.signMessage(tampered));
    assert.equal(res.status, 400);
  });

  it("rejects using another user's nonce", async () => {
    const aliceToken = await createUser('alice@example.com');
    const bobToken = await createUser('bob@example.com');
    const wallet = Wallet.createRandom();
    const { body } = await requestNonce(aliceToken, wallet.address);

    const res = await verify(bobToken, body.data.nonce, await wallet.signMessage(body.data.message));
    assert.equal(res.status, 400);
  });

  it('rejects linking a wallet that belongs to another account', async () => {
    const aliceToken = await createUser('alice@example.com');
    const bobToken = await createUser('bob@example.com');
    const wallet = Wallet.createRandom();

    assert.equal((await linkWallet(aliceToken, wallet)).status, 200);
    assert.equal((await linkWallet(bobToken, wallet)).status, 409);
  });

  it('rejects malformed signatures and nonces', async () => {
    const token = await createUser();
    const res = await verify(token, 'not-a-nonce', '0xdeadbeef');
    assert.equal(res.status, 400);
    const fields = res.body.errors.map((e) => e.field);
    assert.ok(fields.includes('nonce'));
    assert.ok(fields.includes('signature'));
  });

  it('issues EIP-4361 compliant nonces (>= 8 alphanumeric chars, unique)', async () => {
    const token = await createUser();
    const wallet = Wallet.createRandom();
    const nonces = new Set();
    for (let i = 0; i < 5; i++) {
      const { body } = await requestNonce(token, wallet.address);
      assert.match(body.data.nonce, /^[A-Za-z0-9]{8,}$/);
      nonces.add(body.data.nonce);
    }
    assert.equal(nonces.size, 5);
  });

  it('rejects a stored challenge whose message no longer matches this site (domain check)', async () => {
    const token = await createUser();
    const wallet = Wallet.createRandom();
    const { body } = await requestNonce(token, wallet.address);

    // Simulate a message for another domain that is validly signed by the right wallet.
    const forged = body.data.message.replace('localhost:5173 wants you', 'evil.example wants you');
    await WalletNonce.updateOne({ nonce: body.data.nonce }, { message: forged });

    const res = await verify(token, body.data.nonce, await wallet.signMessage(forged));
    assert.equal(res.status, 400);
  });

  it('lets only one of two accounts link the same wallet when they race', async () => {
    const aliceToken = await createUser('alice@example.com');
    const bobToken = await createUser('bob@example.com');
    const wallet = Wallet.createRandom();

    const [a, b] = await Promise.all([requestNonce(aliceToken, wallet.address), requestNonce(bobToken, wallet.address)]);
    const [sigA, sigB] = await Promise.all([
      wallet.signMessage(a.body.data.message),
      wallet.signMessage(b.body.data.message),
    ]);

    const results = await Promise.all([
      verify(aliceToken, a.body.data.nonce, sigA),
      verify(bobToken, b.body.data.nonce, sigB),
    ]);
    const statuses = results.map((r) => r.status).sort();
    assert.deepEqual(statuses, [200, 409]);

    const owners = await User.countDocuments({ walletAddress: wallet.address.toLowerCase() });
    assert.equal(owners, 1);
  });

  it('enforces wallet uniqueness in the database itself, regardless of letter case', async () => {
    const wallet = Wallet.createRandom();
    await User.create({ name: 'One', email: 'one@example.com', password: 'x', walletAddress: wallet.address });
    await assert.rejects(
      User.create({
        name: 'Two',
        email: 'two@example.com',
        password: 'x',
        walletAddress: wallet.address.toLowerCase(),
      }),
      (err) => err.code === 11000
    );
  });

  it('allows switching to a different wallet with a fresh verification', async () => {
    const token = await createUser();
    const first = Wallet.createRandom();
    const second = Wallet.createRandom();
    await linkWallet(token, first);
    const res = await linkWallet(token, second);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.walletAddress, second.address.toLowerCase());
  });
});

describe('DELETE /api/wallet', () => {
  it('unlinks the wallet', async () => {
    const token = await createUser();
    await linkWallet(token, Wallet.createRandom());

    const res = await request(app).delete('/api/wallet').set(auth(token));
    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.walletAddress, null);
  });

  it('lets another account link the wallet after it is unlinked', async () => {
    const aliceToken = await createUser('alice@example.com');
    const bobToken = await createUser('bob@example.com');
    const wallet = Wallet.createRandom();

    await linkWallet(aliceToken, wallet);
    await request(app).delete('/api/wallet').set(auth(aliceToken));
    assert.equal((await linkWallet(bobToken, wallet)).status, 200);
  });
});
