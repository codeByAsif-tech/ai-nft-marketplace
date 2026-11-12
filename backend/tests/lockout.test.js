import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

// Env must be set before the app modules load, so they are imported dynamically below.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-definitely-longer-than-32-chars';
process.env.BCRYPT_SALT_ROUNDS = '4';
process.env.LOGIN_MAX_FAILED_ATTEMPTS = '5';
process.env.LOGIN_LOCK_MINUTES = '15';
// One trusted proxy: the tests choose the client IP with X-Forwarded-For.
process.env.TRUST_PROXY = '1';

const { MongoMemoryServer } = await import('mongodb-memory-server');
const { default: request } = await import('supertest');
const { createApp } = await import('../src/app.js');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { User } = await import('../src/models/User.js');
const { RefreshSession } = await import('../src/models/RefreshSession.js');
const { LoginThrottle } = await import('../src/models/LoginThrottle.js');

const EMAIL = 'alice@example.com';
const PASSWORD = 'secret123';
const MAX = 5;
const BLOCK_MS = 15 * 60 * 1000;
const IP = '203.0.113.10';
const OTHER_IP = '198.51.100.7';

let mongod;
let app;

const login = (password, { email = EMAIL, ip = IP } = {}) =>
  request(app).post('/api/auth/login').set('X-Forwarded-For', ip).send({ email, password });

/** n wrong passwords that are not yet the blocking one (each must say "invalid"). */
async function failTimes(n, opts) {
  for (let i = 0; i < n; i += 1) {
    const res = await login('wrongpass1', opts);
    assert.equal(res.status, 401);
    assert.equal(res.body.message, 'Invalid email or password');
  }
}

const throttle = (ip = IP) => LoginThrottle.findOne({ ip }).lean();

function assertBlocked(res) {
  assert.equal(res.status, 429);
  assert.equal(res.body.code, 'LOGIN_BLOCKED');
  assert.match(res.body.message, /^Your account is currently blocked/);
  assert.ok(Number(res.headers['retry-after']) > 0, 'Retry-After header');
  assert.equal(res.headers['set-cookie'], undefined, 'no session cookie');
}

before(async () => {
  mongod = await MongoMemoryServer.create();
  await connectDB(mongod.getUri());
  await Promise.all([User.init(), RefreshSession.init(), LoginThrottle.init()]);
  app = createApp();
});

after(async () => {
  await disconnectDB();
  await mongod.stop();
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), RefreshSession.deleteMany({}), LoginThrottle.deleteMany({})]);
  await request(app).post('/api/auth/register').send({ name: 'Alice', email: EMAIL, password: PASSWORD });
});

describe('login IP block', () => {
  it('blocks the IP for 15 minutes on the 5th failed attempt, with the "blocked" message', async () => {
    await failTimes(MAX - 1);
    assertBlocked(await login('wrongpass1')); // 5th failure: blocked, not "invalid"

    const doc = await throttle();
    assert.equal(doc.failedAttempts, MAX);
    const remaining = new Date(doc.blockedUntil).getTime() - Date.now();
    assert.ok(remaining > BLOCK_MS - 60_000 && remaining <= BLOCK_MS, `block lasts ~15 min (got ${remaining} ms)`);
  });

  it('refuses even the correct password while blocked', async () => {
    await failTimes(MAX - 1);
    await login('wrongpass1');
    const res = await login(PASSWORD);
    assertBlocked(res);
    assert.match(res.body.message, /Try again in 15 minutes\./);
  });

  it('does not block before the 5th failure', async () => {
    await failTimes(MAX - 1);
    assert.equal((await throttle()).blockedUntil, null);
    assert.equal((await login(PASSWORD)).status, 200);
  });

  it('counts failures for any email from the IP, including unknown emails', async () => {
    await failTimes(2);
    await failTimes(2, { email: 'nobody@example.com' });
    assertBlocked(await login('wrongpass1', { email: 'someone@example.com' }));

    // The whole IP is blocked, for every account.
    await request(app).post('/api/auth/register').send({ name: 'Bob', email: 'bob@example.com', password: PASSWORD });
    assertBlocked(await login(PASSWORD, { email: 'bob@example.com' }));
  });

  it('does not affect other IPs (no one can block your account from their IP)', async () => {
    await failTimes(MAX - 1);
    await login('wrongpass1');
    assert.equal((await login(PASSWORD, { ip: OTHER_IP })).status, 200);
  });

  it('does not extend the block when more attempts arrive while blocked', async () => {
    await failTimes(MAX - 1);
    await login('wrongpass1');
    const first = await throttle();
    await login('wrongpass1');
    await login(PASSWORD);
    const later = await throttle();
    assert.equal(later.failedAttempts, first.failedAttempts);
    assert.equal(new Date(later.blockedUntil).getTime(), new Date(first.blockedUntil).getTime());
  });

  it('cannot be bypassed with many parallel requests', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => login('wrongpass1')));
    assert.equal(results.filter((r) => r.status === 401).length, MAX - 1, 'only 4 plain failures');
    assert.equal(results.filter((r) => r.status === 429).length, 20 - (MAX - 1), 'everything else blocked');

    const doc = await throttle();
    assert.equal(doc.failedAttempts, MAX, 'exactly 5 attempts were evaluated');
    assertBlocked(await login(PASSWORD));
  });

  it('unblocks automatically when the block expires and starts counting from zero', async () => {
    await failTimes(MAX - 1);
    await login('wrongpass1');
    // Simulate 15 minutes passing.
    await LoginThrottle.updateOne({ ip: IP }, { blockedUntil: new Date(Date.now() - 1000) });

    await failTimes(1); // one new failure does not re-block
    assert.equal((await throttle()).failedAttempts, 1);
    assert.equal((await login(PASSWORD)).status, 200);
  });

  it('forgets old failures after the window (15 min without attempts)', async () => {
    await failTimes(MAX - 1);
    await LoginThrottle.updateOne({ ip: IP }, { lastAttemptAt: new Date(Date.now() - BLOCK_MS - 1000) });
    await failTimes(1);
    assert.equal((await throttle()).failedAttempts, 1);
  });

  it('a successful login resets the counter for that IP', async () => {
    await failTimes(MAX - 1);
    assert.equal((await login(PASSWORD)).status, 200);
    assert.equal((await throttle()).failedAttempts, 0);
    await failTimes(MAX - 1); // 4 more are fine again
    assert.equal((await login(PASSWORD)).status, 200);
  });

  it('a correct password on the 5th attempt logs in instead of blocking', async () => {
    await failTimes(MAX - 1);
    assert.equal((await login(PASSWORD)).status, 200);
    assert.equal((await throttle()).blockedUntil, null);
  });

  it('keeps blocking deactivated accounts after a correct password', async () => {
    await User.updateOne({ email: EMAIL }, { isActive: false });
    assert.equal((await login(PASSWORD)).status, 403);
  });

  it('treats ::ffff:-mapped and plain IPv4 addresses as the same client', async () => {
    await failTimes(MAX - 1, { ip: '::ffff:203.0.113.10' });
    assertBlocked(await login('wrongpass1'));
  });
});
