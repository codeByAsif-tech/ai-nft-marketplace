import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';

// Env must be set before the app modules load, so they are imported dynamically below.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-definitely-longer-than-32-chars';
process.env.BCRYPT_SALT_ROUNDS = '4';
process.env.REFRESH_REUSE_GRACE_SECONDS = '10';

const { default: jwt } = await import('jsonwebtoken');
const { MongoMemoryServer } = await import('mongodb-memory-server');
const { default: request } = await import('supertest');
const { createApp } = await import('../src/app.js');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { User } = await import('../src/models/User.js');
const { RefreshSession } = await import('../src/models/RefreshSession.js');

const EMAIL = 'alice@example.com';
const PASSWORD = 'secret123';
const COOKIE = 'refresh_token';
const CSRF = { 'X-CSRF-Protection': '1' };

let mongod;
let app;

const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
const bearer = (token) => ({ Authorization: `Bearer ${token}` });

/** The raw Set-Cookie line for the refresh cookie, or undefined. */
const refreshSetCookie = (res) => (res.headers['set-cookie'] || []).find((c) => c.startsWith(`${COOKIE}=`));
/** The refresh token value set by a response. */
const refreshTokenFrom = (res) => refreshSetCookie(res)?.split(';')[0].slice(COOKIE.length + 1);
const cookie = (token) => ({ Cookie: `${COOKIE}=${token}` });

/** Logs in as one "device" and returns its access + refresh tokens. */
async function loginDevice(email = EMAIL) {
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  assert.equal(res.status, 200);
  return { access: res.body.data.token, refresh: refreshTokenFrom(res) };
}

const refresh = (token, headers = CSRF) => {
  const req = request(app).post('/api/auth/refresh').set(headers);
  return token ? req.set(cookie(token)) : req;
};

/** Pretends a token was rotated long ago, outside the reuse grace window. */
const ageRotation = (token) =>
  RefreshSession.updateOne({ tokenHash: sha256(token) }, { rotatedAt: new Date(Date.now() - 60_000) });
const me = (access) => request(app).get('/api/auth/me').set(bearer(access));

before(async () => {
  mongod = await MongoMemoryServer.create();
  await connectDB(mongod.getUri());
  await Promise.all([User.init(), RefreshSession.init()]);
  app = createApp();
});

after(async () => {
  await disconnectDB();
  await mongod.stop();
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), RefreshSession.deleteMany({})]);
  await request(app).post('/api/auth/register').send({ name: 'Alice', email: EMAIL, password: PASSWORD });
});

describe('refresh cookie and storage', () => {
  it('login sets an HttpOnly, SameSite=Strict cookie scoped to /api/auth and keeps the old body shape', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: EMAIL, password: PASSWORD });
    assert.equal(res.status, 200);
    assert.ok(res.body.data.token, 'access token still in the body');
    assert.equal(res.body.data.user.email, EMAIL);
    assert.equal(res.headers['cache-control'], 'no-store');

    const setCookie = refreshSetCookie(res);
    assert.ok(setCookie, 'refresh cookie set');
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Strict/i);
    assert.match(setCookie, /Path=\/api\/auth/);
    assert.match(setCookie, /Expires=/);
    assert.equal(res.body.data.refreshToken, undefined, 'refresh token is never in the body');
  });

  it('register also starts a session', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Bob', email: 'bob@example.com', password: PASSWORD });
    assert.equal(res.status, 201);
    assert.ok(refreshTokenFrom(res));
    assert.equal((await me(res.body.data.token)).status, 200);
  });

  it('stores only a SHA-256 hash of the refresh token', async () => {
    const { refresh: token } = await loginDevice();
    const docs = await RefreshSession.find({}).lean();
    assert.ok(docs.some((d) => d.tokenHash === sha256(token)));
    assert.ok(JSON.stringify(docs).includes(token) === false, 'raw token not stored anywhere');
  });

  it('has a TTL index that deletes expired sessions', async () => {
    const indexes = await RefreshSession.collection.indexes();
    const ttl = indexes.find((i) => i.key.expiresAt === 1);
    assert.ok(ttl, 'expiresAt index exists');
    assert.equal(ttl.expireAfterSeconds, 0);
  });
});

describe('POST /api/auth/refresh', () => {
  it('returns a new access token and rotates the refresh token', async () => {
    const device = await loginDevice();
    const res = await refresh(device.refresh);

    assert.equal(res.status, 200);
    assert.ok(res.body.data.token);
    assert.equal(res.body.data.user.email, EMAIL);
    const next = refreshTokenFrom(res);
    assert.ok(next);
    assert.notEqual(next, device.refresh, 'refresh token rotated');
    assert.equal((await me(res.body.data.token)).status, 200);

    const old = await RefreshSession.findOne({ tokenHash: sha256(device.refresh) }).lean();
    const current = await RefreshSession.findOne({ tokenHash: sha256(next) }).lean();
    assert.ok(old.rotatedAt, 'old token marked as used');
    assert.equal(old.family, current.family, 'same session family');
    assert.equal(
      new Date(current.sessionExpiresAt).getTime(),
      new Date(old.sessionExpiresAt).getTime(),
      'absolute session limit is not extended'
    );
    assert.ok(new Date(current.expiresAt) <= new Date(current.sessionExpiresAt));
  });

  it('can be chained: each new token works once', async () => {
    let { refresh: token } = await loginDevice();
    for (let i = 0; i < 3; i += 1) {
      const res = await refresh(token);
      assert.equal(res.status, 200);
      token = refreshTokenFrom(res);
    }
  });

  it('rejects a request without the CSRF header', async () => {
    const { refresh: token } = await loginDevice();
    const res = await refresh(token, {});
    assert.equal(res.status, 403);
    // The token was not consumed by the rejected request.
    assert.equal((await refresh(token)).status, 200);
  });

  it('rejects a request from a foreign Origin', async () => {
    const { refresh: token } = await loginDevice();
    const res = await refresh(token, { ...CSRF, Origin: 'https://evil.example' });
    assert.equal(res.status, 403);
    assert.equal((await refresh(token, { ...CSRF, Origin: 'http://localhost:5173' })).status, 200);
  });

  it('rejects a missing cookie', async () => {
    assert.equal((await refresh(null)).status, 401);
  });

  it('rejects an invalid token and clears the cookie', async () => {
    for (const bad of ['garbage', 'a'.repeat(43), '%E0%A4%A']) {
      const res = await refresh(bad);
      assert.equal(res.status, 401, bad);
      assert.match(refreshSetCookie(res) || '', /Expires=Thu, 01 Jan 1970/, 'cookie cleared');
    }
  });

  it('rejects an expired refresh token', async () => {
    const { refresh: token } = await loginDevice();
    await RefreshSession.updateOne({ tokenHash: sha256(token) }, { expiresAt: new Date(Date.now() - 1000) });
    assert.equal((await refresh(token)).status, 401);
  });

  it('detects reuse of a rotated token and revokes the whole family', async () => {
    const device = await loginDevice();
    const first = await refresh(device.refresh);
    const next = refreshTokenFrom(first);

    // Attacker (or a stale copy) replays the old token, after the grace window.
    await ageRotation(device.refresh);
    const replay = await refresh(device.refresh);
    assert.equal(replay.status, 401);

    // The legitimate newer token is now dead too, and so are its access tokens.
    assert.equal((await refresh(next)).status, 401);
    assert.equal((await me(first.body.data.token)).status, 401);
    assert.equal((await me(device.access)).status, 401);

    const { family } = await RefreshSession.findOne({ tokenHash: sha256(device.refresh) }).lean();
    const members = await RefreshSession.find({ family }).lean();
    assert.equal(members.length, 2);
    assert.ok(members.every((d) => d.revokedAt && d.revokedReason === 'reuse'));
  });

  it('two simultaneous refreshes with the same token rotate it only once', async () => {
    const { refresh: token } = await loginDevice();
    const [a, b] = await Promise.all([refresh(token), refresh(token)]);

    // Both succeed and receive the SAME next token: no second, independent rotation.
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(refreshTokenFrom(a), refreshTokenFrom(b));

    const { family } = await RefreshSession.findOne({ tokenHash: sha256(token) }).lean();
    assert.equal(await RefreshSession.countDocuments({ family }), 2, 'old token + exactly one new token');
    assert.equal(await RefreshSession.countDocuments({ family, revokedAt: { $ne: null } }), 0, 'session not revoked');
    assert.equal((await refresh(refreshTokenFrom(a))).status, 200, 'the shared next token works');
  });

  it('many simultaneous refreshes still produce exactly one next token', async () => {
    const { refresh: token } = await loginDevice();
    const results = await Promise.all(Array.from({ length: 5 }, () => refresh(token)));
    assert.ok(results.every((r) => r.status === 200));
    assert.equal(new Set(results.map(refreshTokenFrom)).size, 1);
  });

  it('reuse in one session does not affect other sessions of the same user', async () => {
    const phone = await loginDevice();
    const laptop = await loginDevice();
    await refresh(phone.refresh);
    await ageRotation(phone.refresh);
    await refresh(phone.refresh); // reuse -> phone family revoked

    assert.equal((await me(laptop.access)).status, 200);
    assert.equal((await refresh(laptop.refresh)).status, 200);
  });

  it('refuses to refresh for a deactivated account', async () => {
    const { refresh: token } = await loginDevice();
    await User.updateOne({ email: EMAIL }, { isActive: false });
    assert.equal((await refresh(token)).status, 401);
  });

  it('a new login in the same browser revokes the session in the old cookie', async () => {
    const old = await loginDevice();
    const res = await request(app)
      .post('/api/auth/login')
      .set(cookie(old.refresh))
      .send({ email: EMAIL, password: PASSWORD });
    assert.equal(res.status, 200);
    assert.equal((await refresh(old.refresh)).status, 401);
    assert.equal((await refresh(refreshTokenFrom(res))).status, 200);
  });
});

describe('lost refresh response (reuse grace window)', () => {
  const UA = { 'User-Agent': 'Mozilla/5.0 test-browser' };

  async function loginWithUa() {
    const res = await request(app).post('/api/auth/login').set(UA).send({ email: EMAIL, password: PASSWORD });
    return { access: res.body.data.token, refresh: refreshTokenFrom(res) };
  }

  it('re-sends the same next token when the previous one comes back within the grace window', async () => {
    const device = await loginWithUa();
    const first = await refresh(device.refresh, { ...CSRF, ...UA });
    assert.equal(first.status, 200);

    // The response above was "lost": the browser still has the old cookie and retries.
    const retry = await refresh(device.refresh, { ...CSRF, ...UA });
    assert.equal(retry.status, 200);
    assert.equal(refreshTokenFrom(retry), refreshTokenFrom(first), 'same next token, not a new one');
    assert.equal((await me(retry.body.data.token)).status, 200);

    // The session continues normally afterwards.
    assert.equal((await refresh(refreshTokenFrom(retry), { ...CSRF, ...UA })).status, 200);
  });

  it('treats it as reuse once the next token has already been used', async () => {
    const device = await loginWithUa();
    const first = await refresh(device.refresh, { ...CSRF, ...UA });
    const second = await refresh(refreshTokenFrom(first), { ...CSRF, ...UA });
    assert.equal(second.status, 200);

    // Old token replayed within the window, but its successor is already spent: theft.
    assert.equal((await refresh(device.refresh, { ...CSRF, ...UA })).status, 401);
    assert.equal((await refresh(refreshTokenFrom(second), { ...CSRF, ...UA })).status, 401, 'family revoked');
  });

  it('treats it as reuse when the replay comes from a different user agent', async () => {
    const device = await loginWithUa();
    const first = await refresh(device.refresh, { ...CSRF, ...UA });
    const replay = await refresh(device.refresh, { ...CSRF, 'User-Agent': 'curl/8.0' });
    assert.equal(replay.status, 401);
    assert.equal((await refresh(refreshTokenFrom(first), { ...CSRF, ...UA })).status, 401, 'family revoked');
  });

  it('treats it as reuse after the grace window', async () => {
    const device = await loginWithUa();
    const first = await refresh(device.refresh, { ...CSRF, ...UA });
    await ageRotation(device.refresh);
    assert.equal((await refresh(device.refresh, { ...CSRF, ...UA })).status, 401);
    assert.equal((await refresh(refreshTokenFrom(first), { ...CSRF, ...UA })).status, 401, 'family revoked');
  });

  it('does not revive a logged-out session', async () => {
    const device = await loginWithUa();
    const first = await refresh(device.refresh, { ...CSRF, ...UA });
    await request(app).post('/api/auth/logout').set(CSRF).set(cookie(refreshTokenFrom(first)));
    assert.equal((await refresh(device.refresh, { ...CSRF, ...UA })).status, 401);
  });
});

describe('POST /api/auth/logout (current device)', () => {
  it('revokes this session, clears the cookie and kills its access token at once', async () => {
    const device = await loginDevice();
    const res = await request(app).post('/api/auth/logout').set(CSRF).set(cookie(device.refresh));

    assert.equal(res.status, 200);
    assert.match(refreshSetCookie(res) || '', /Expires=Thu, 01 Jan 1970/);
    assert.equal((await refresh(device.refresh)).status, 401, 'revoked session cannot refresh');
    assert.equal((await me(device.access)).status, 401, 'access token stops working immediately');
  });

  it('keeps other devices logged in', async () => {
    const phone = await loginDevice();
    const laptop = await loginDevice();
    await request(app).post('/api/auth/logout').set(CSRF).set(cookie(phone.refresh));

    assert.equal((await me(laptop.access)).status, 200);
    assert.equal((await refresh(laptop.refresh)).status, 200);
  });

  it('works without a cookie (idempotent) and requires the CSRF header', async () => {
    assert.equal((await request(app).post('/api/auth/logout').set(CSRF)).status, 200);
    const { refresh: token } = await loginDevice();
    assert.equal((await request(app).post('/api/auth/logout').set(cookie(token))).status, 403);
    assert.equal((await refresh(token)).status, 200, 'session untouched by the rejected logout');
  });
});

describe('POST /api/auth/logout-all', () => {
  it('requires authentication', async () => {
    assert.equal((await request(app).post('/api/auth/logout-all')).status, 401);
  });

  it('revokes every session of the user; none can refresh or call the API', async () => {
    const phone = await loginDevice();
    const laptop = await loginDevice();
    const rotated = await refresh(laptop.refresh);
    const laptopRefresh = refreshTokenFrom(rotated);

    const res = await request(app).post('/api/auth/logout-all').set(bearer(phone.access));
    assert.equal(res.status, 200);
    assert.match(refreshSetCookie(res) || '', /Expires=Thu, 01 Jan 1970/);

    assert.equal((await refresh(phone.refresh)).status, 401);
    assert.equal((await refresh(laptopRefresh)).status, 401);
    assert.equal((await me(phone.access)).status, 401);
    assert.equal((await me(rotated.body.data.token)).status, 401);

    const active = await RefreshSession.countDocuments({ revokedAt: null });
    assert.equal(active, 0);
  });

  it('does not touch other users', async () => {
    await request(app).post('/api/auth/register').send({ name: 'Bob', email: 'bob@example.com', password: PASSWORD });
    const alice = await loginDevice();
    const bob = await loginDevice('bob@example.com');
    await request(app).post('/api/auth/logout-all').set(bearer(alice.access));

    assert.equal((await me(bob.access)).status, 200);
    assert.equal((await refresh(bob.refresh)).status, 200);
  });

  it('allows logging in again afterwards', async () => {
    const device = await loginDevice();
    await request(app).post('/api/auth/logout-all').set(bearer(device.access));
    const again = await loginDevice();
    assert.equal((await me(again.access)).status, 200);
    assert.equal((await refresh(again.refresh)).status, 200);
  });
});

describe('access tokens', () => {
  it('rejects a token without a session id (issued before sessions existed)', async () => {
    const user = await User.findOne({ email: EMAIL });
    const legacy = jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: '1d',
    });
    assert.equal((await me(legacy)).status, 401);
  });

  it('rejects an expired access token with the session-expired message', async () => {
    const { access } = await loginDevice();
    const { sub, sid } = jwt.decode(access);
    const expired = jwt.sign({ sub, sid, role: 'USER', exp: Math.floor(Date.now() / 1000) - 10 }, process.env.JWT_SECRET, {
      algorithm: 'HS256',
    });
    const res = await me(expired);
    assert.equal(res.status, 401);
    assert.equal(res.body.message, 'Session expired, please log in again');
  });

  it('carries a short default lifetime (15 minutes)', async () => {
    const { access } = await loginDevice();
    const { iat, exp } = jwt.decode(access);
    // The developer's .env may override JWT_EXPIRES_IN; only check the default when unset.
    if (!process.env.JWT_EXPIRES_IN) assert.equal(exp - iat, 15 * 60);
  });
});
