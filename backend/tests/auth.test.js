import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

// Env must be set before the app modules load, so they are imported dynamically below.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-definitely-longer-than-32-chars';
process.env.BCRYPT_SALT_ROUNDS = '4'; // fast hashing in tests

const { MongoMemoryServer } = await import('mongodb-memory-server');
const { default: request } = await import('supertest');
const { createApp } = await import('../src/app.js');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { User } = await import('../src/models/User.js');
const { requireRole } = await import('../src/middleware/requireRole.js');

let mongod;
let app;

const validUser = { name: 'Alice Doe', email: 'Alice@Example.com', password: 'secret123' };

async function registerAndGetToken(overrides = {}) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ ...validUser, ...overrides });
  return res.body.data.token;
}

before(async () => {
  mongod = await MongoMemoryServer.create();
  await connectDB(mongod.getUri());
  await User.init(); // make sure unique indexes exist before the tests run
  app = createApp();
});

after(async () => {
  await disconnectDB();
  await mongod.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
});

describe('GET /api/health', () => {
  it('reports the database as connected', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.database, 'connected');
  });
});

describe('POST /api/auth/register', () => {
  it('creates a user, hashes the password and returns a token', async () => {
    const res = await request(app).post('/api/auth/register').send(validUser);

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.token);
    assert.equal(res.body.data.user.email, 'alice@example.com');
    assert.equal(res.body.data.user.role, 'USER');
    assert.equal(res.body.data.user.password, undefined);

    const stored = await User.findOne({ email: 'alice@example.com' }).select('+password');
    assert.notEqual(stored.password, validUser.password);
    assert.match(stored.password, /^\$2[aby]\$/);
  });

  it('ignores a role sent by the client', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, role: 'ADMIN' });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.user.role, 'USER');
  });

  it('ignores a walletAddress sent by the client', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, walletAddress: '0x000000000000000000000000000000000000dEaD' });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.user.walletAddress, null);
  });

  it('rejects a duplicate email (case-insensitive)', async () => {
    await request(app).post('/api/auth/register').send(validUser);
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, email: 'ALICE@example.com' });
    assert.equal(res.status, 409);
  });

  it('returns field errors for invalid input', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'A', email: 'not-an-email', password: 'short' });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    const fields = res.body.errors.map((e) => e.field);
    assert.ok(fields.includes('name'));
    assert.ok(fields.includes('email'));
    assert.ok(fields.includes('password'));
  });

  it('rejects malformed JSON', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .set('Content-Type', 'application/json')
      .send('{"name": ');
    assert.equal(res.status, 400);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/register').send(validUser);
  });

  it('logs in with correct credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: validUser.password });
    assert.equal(res.status, 200);
    assert.ok(res.body.data.token);
  });

  it('returns the same error for a wrong password and an unknown email', async () => {
    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'wrongpass1' });
    const unknownEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrongpass1' });

    assert.equal(wrongPassword.status, 401);
    assert.equal(unknownEmail.status, 401);
    assert.equal(wrongPassword.body.message, unknownEmail.body.message);
  });

  it('blocks deactivated accounts', async () => {
    await User.updateOne({ email: 'alice@example.com' }, { isActive: false });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: validUser.password });
    assert.equal(res.status, 403);
  });
});

describe('GET /api/auth/me', () => {
  it('returns the current user for a valid token', async () => {
    const token = await registerAndGetToken();
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.email, 'alice@example.com');
  });

  it('rejects a missing token', async () => {
    const res = await request(app).get('/api/auth/me');
    assert.equal(res.status, 401);
  });

  it('rejects a tampered token', async () => {
    const token = await registerAndGetToken();
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token.slice(0, -2)}xx`);
    assert.equal(res.status, 401);
  });

  it('rejects a token for a deleted user', async () => {
    const token = await registerAndGetToken();
    await User.deleteMany({});
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 401);
  });

  it('rejects a token once the account is deactivated', async () => {
    const token = await registerAndGetToken();
    await User.updateOne({ email: 'alice@example.com' }, { isActive: false });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 403);
  });
});

describe('PATCH /api/users/me', () => {
  it('updates name and bio', async () => {
    const token = await registerAndGetToken();
    const res = await request(app)
      .patch('/api/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Alice Updated', bio: 'Digital artist' });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.name, 'Alice Updated');
    assert.equal(res.body.data.user.bio, 'Digital artist');
  });

  it('cannot change role, email or wallet', async () => {
    const token = await registerAndGetToken();
    const res = await request(app)
      .patch('/api/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Alice', role: 'ADMIN', email: 'evil@example.com', walletAddress: '0xabc' });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.role, 'USER');
    assert.equal(res.body.data.user.email, 'alice@example.com');
    assert.equal(res.body.data.user.walletAddress, null);
  });

  it('rejects a request with no updatable fields', async () => {
    const token = await registerAndGetToken();
    const res = await request(app)
      .patch('/api/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'ADMIN' });
    assert.equal(res.status, 400);
  });
});

describe('GET /api/users/me/dashboard', () => {
  it('requires authentication', async () => {
    assert.equal((await request(app).get('/api/users/me/dashboard')).status, 401);
  });

  it('returns zeroed stats and progress for a new user', async () => {
    const token = await registerAndGetToken();
    const res = await request(app).get('/api/users/me/dashboard').set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.stats, {
      artworks: 0,
      drafts: 0,
      onIpfs: 0,
      nftsCreated: 0,
      nftsOwned: 0,
      listed: 0,
      sold: 0,
      purchases: 0,
    });
    assert.deepEqual(res.body.data.progress, {
      walletVerified: false,
      createdArtwork: false,
      uploadedToIpfs: false,
      mintedNft: false,
    });
    assert.deepEqual(res.body.data.recentArtwork, []);
    assert.deepEqual(res.body.data.recentActivity, []);
  });
});

describe('requireRole middleware', () => {
  const run = (user) =>
    new Promise((resolve) => requireRole('ADMIN')({ user }, {}, (err) => resolve(err)));

  it('allows a matching role', async () => {
    assert.equal(await run({ role: 'ADMIN' }), undefined);
  });

  it('blocks a non-matching role with 403', async () => {
    const err = await run({ role: 'USER' });
    assert.equal(err.statusCode, 403);
  });

  it('blocks an unauthenticated request with 401', async () => {
    const err = await run(undefined);
    assert.equal(err.statusCode, 401);
  });
});

describe('unknown routes', () => {
  it('return a 404 JSON error', async () => {
    const res = await request(app).get('/api/does-not-exist');
    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
  });
});
