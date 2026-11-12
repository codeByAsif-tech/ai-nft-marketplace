import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';

// --- Fake Groq API (OpenAI-compatible): tests never call Groq or use real quota. ---
const TEST_KEY = 'gsk_test_key';
const TEST_MODEL = 'openai/gpt-oss-20b';

const fakeGroq = {
  models: [TEST_MODEL, 'llama-3.1-8b-instant'],
  replies: [], // queue of { status, body } returned by /chat/completions
  calls: [], // { headers, body } of each chat completion request
  delayMs: 0,
};

const groqReply = (content) => ({
  status: 200,
  body: { choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }] },
});
const groqError = (status, message, code) => ({
  status,
  body: { error: { message, type: 'invalid_request_error', ...(code ? { code } : {}) } },
});

const groqServer = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (chunk) => (raw += chunk));
  req.on('end', async () => {
    res.setHeader('Content-Type', 'application/json');
    const send = ({ status, body }) => {
      res.statusCode = status;
      res.end(JSON.stringify(body));
    };
    if (req.headers.authorization !== `Bearer ${TEST_KEY}`) {
      return send(groqError(401, 'Invalid API Key', 'invalid_api_key'));
    }
    if (req.method === 'GET' && req.url === '/models') {
      return send({ status: 200, body: { object: 'list', data: fakeGroq.models.map((id) => ({ id, object: 'model' })) } });
    }
    if (req.method === 'POST' && req.url === '/chat/completions') {
      fakeGroq.calls.push({ headers: req.headers, body: JSON.parse(raw) });
      if (fakeGroq.delayMs) await new Promise((r) => setTimeout(r, fakeGroq.delayMs));
      return send(fakeGroq.replies.shift() ?? groqReply('{}'));
    }
    send(groqError(404, 'Unknown route'));
  });
});
await new Promise((resolve) => groqServer.listen(0, '127.0.0.1', resolve));
const groqUrl = `http://127.0.0.1:${groqServer.address().port}`;

const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nft-uploads-'));

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-definitely-longer-than-32-chars';
process.env.BCRYPT_SALT_ROUNDS = '4';
process.env.UPLOAD_DIR = uploadDir;
process.env.MAX_UPLOAD_MB = '1';
process.env.AI_TEXT_PROVIDER = 'groq';
process.env.AI_IMAGE_PROVIDER = 'none';
process.env.GROQ_API_KEY = TEST_KEY;
process.env.GROQ_MODEL = TEST_MODEL;
process.env.GROQ_BASE_URL = groqUrl;
process.env.GROQ_TIMEOUT_MS = '1500';

const { MongoMemoryServer } = await import('mongodb-memory-server');
const { default: request } = await import('supertest');
const { createApp } = await import('../src/app.js');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { User } = await import('../src/models/User.js');
const { AIGeneration } = await import('../src/models/AIGeneration.js');
const { pngHeader, jpegHeader, svgFile } = await import('./helpers/images.js');
const { createGroqTextProvider } = await import('../src/services/ai/providers/groqText.provider.js');

let mongod;
let app;

const GOOD_SUGGESTION = JSON.stringify({
  name: 'Neon Skyline',
  description: 'A glowing cyberpunk city at night.',
  collectionName: 'Electric Dreams',
  attributes: [
    { trait_type: 'Mood', value: 'Mysterious' },
    { trait_type: 'Palette', value: 'Neon' },
  ],
});

async function createUser(email = 'alice@example.com') {
  const res = await request(app).post('/api/auth/register').send({ name: 'Test User', email, password: 'secret123' });
  return res.body.data.token;
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

function uploadArtwork(token, file = pngHeader(), fields = {}, filename = 'art.png') {
  const req = request(app).post('/api/ai/generations').set(auth(token)).attach('image', file, filename);
  for (const [k, v] of Object.entries(fields)) req.field(k, typeof v === 'string' ? v : JSON.stringify(v));
  return req;
}

before(async () => {
  mongod = await MongoMemoryServer.create();
  await connectDB(mongod.getUri());
  await Promise.all([User.init(), AIGeneration.init()]);
  app = createApp();
});

after(async () => {
  await disconnectDB();
  await mongod.stop();
  await new Promise((resolve) => groqServer.close(resolve));
  await fs.rm(uploadDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), AIGeneration.deleteMany({})]);
  fakeGroq.models = [TEST_MODEL, 'llama-3.1-8b-instant'];
  fakeGroq.replies = [];
  fakeGroq.calls = [];
  fakeGroq.delayMs = 0;
});

const suggest = (token, body) => request(app).post('/api/ai/suggest').set(auth(token)).send(body);

describe('GET /api/ai/status', () => {
  it('requires authentication', async () => {
    assert.equal((await request(app).get('/api/ai/status')).status, 401);
  });

  it('reports text AI available and image AI disabled', async () => {
    const token = await createUser();
    const res = await request(app).get('/api/ai/status').set(auth(token));
    assert.equal(res.status, 200);
    assert.equal(res.body.data.text.available, true);
    assert.equal(res.body.data.text.provider, 'groq');
    assert.equal(res.body.data.text.model, TEST_MODEL);
    assert.equal(res.body.data.image.available, false);
    assert.match(res.body.data.image.reason, /Upload your own artwork/);
  });
});

describe('Groq provider', () => {
  const config = { apiKey: TEST_KEY, model: TEST_MODEL, baseUrl: '', timeoutMs: 1500 };
  const provider = (overrides) => createGroqTextProvider({ ...config, baseUrl: groqUrl, ...overrides });

  it('reports a missing API key without calling Groq', async () => {
    const status = await provider({ apiKey: '' }).getStatus();
    assert.equal(status.available, false);
    assert.match(status.reason, /GROQ_API_KEY is not set/);
  });

  it('reports an invalid API key', async () => {
    const status = await provider({ apiKey: 'wrong' }).getStatus();
    assert.equal(status.available, false);
    assert.match(status.reason, /invalid GROQ_API_KEY/);
  });

  it('reports a model that does not exist', async () => {
    const status = await provider({ model: 'no-such-model' }).getStatus();
    assert.equal(status.available, false);
    assert.match(status.reason, /not available/);
  });

  it('reports an unreachable API', async () => {
    const status = await provider({ baseUrl: 'http://127.0.0.1:9' }).getStatus();
    assert.equal(status.available, false);
    assert.match(status.reason, /Could not reach/);
  });

  it('uses plain JSON mode for models without schema support', async () => {
    fakeGroq.replies.push(groqReply(GOOD_SUGGESTION));
    const s = await provider({ model: 'llama-3.1-8b-instant' }).suggestMetadata({ prompt: 'a cat', style: 'none' });
    assert.equal(s.name, 'Neon Skyline');
    const body = fakeGroq.calls[0].body;
    assert.deepEqual(body.response_format, { type: 'json_object' });
    assert.equal(body.reasoning_effort, undefined);
  });
});

describe('POST /api/ai/suggest', () => {
  it('returns a cleaned suggestion and sends a correct Groq request', async () => {
    fakeGroq.replies.push(groqReply(GOOD_SUGGESTION));
    const token = await createUser();
    const res = await suggest(token, { prompt: 'a futuristic city with neon lights', style: 'cyberpunk' });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.suggestion.name, 'Neon Skyline');
    assert.equal(res.body.data.suggestion.attributes.length, 2);

    const { headers, body } = fakeGroq.calls[0];
    assert.equal(headers.authorization, `Bearer ${TEST_KEY}`);
    assert.equal(body.model, TEST_MODEL);
    assert.equal(body.response_format.type, 'json_schema');
    assert.equal(body.response_format.json_schema.schema.type, 'object');
    assert.equal(body.reasoning_effort, 'low');
    assert.equal(body.messages[0].role, 'system');
    assert.match(body.messages[0].content, /JSON/); // required by Groq's JSON modes
    assert.match(body.messages[1].content, /futuristic city/);
    assert.match(body.messages[1].content, /Style: Cyberpunk/);
  });

  it('never returns the API key to the client', async () => {
    fakeGroq.replies.push(groqReply(GOOD_SUGGESTION));
    const token = await createUser();
    const res = await suggest(token, { prompt: 'a cat in space' });
    const status = await request(app).get('/api/ai/status').set(auth(token));
    assert.ok(!JSON.stringify(res.body).includes(TEST_KEY));
    assert.ok(!JSON.stringify(status.body).includes(TEST_KEY));
  });

  it('retries once when the model returns unusable output', async () => {
    fakeGroq.replies.push(groqReply('I am not JSON'), groqReply(GOOD_SUGGESTION));
    const token = await createUser();
    const res = await suggest(token, { prompt: 'a cat in space' });
    assert.equal(res.status, 200);
    assert.equal(fakeGroq.calls.length, 2);
  });

  it("retries once when Groq reports the output failed JSON validation", async () => {
    fakeGroq.replies.push(
      groqError(400, 'Failed to validate JSON', 'json_validate_failed'),
      groqReply(GOOD_SUGGESTION)
    );
    const token = await createUser();
    const res = await suggest(token, { prompt: 'a cat in space' });
    assert.equal(res.status, 200);
    assert.equal(fakeGroq.calls.length, 2);
  });

  it('returns 502 after two unusable answers', async () => {
    fakeGroq.replies.push(groqReply('nope'), groqReply('still nope'));
    const token = await createUser();
    assert.equal((await suggest(token, { prompt: 'a cat in space' })).status, 502);
  });

  it('explains when the free rate limit is reached (429)', async () => {
    fakeGroq.replies.push(groqError(429, 'Rate limit reached', 'rate_limit_exceeded'));
    const token = await createUser();
    const res = await suggest(token, { prompt: 'a cat in space' });
    assert.equal(res.status, 429);
    assert.match(res.body.message, /free Groq limit/);
  });

  it('returns 503 when Groq rejects the key', async () => {
    fakeGroq.replies.push(groqError(401, 'Invalid API Key', 'invalid_api_key'));
    const token = await createUser();
    assert.equal((await suggest(token, { prompt: 'a cat in space' })).status, 503);
  });

  it('returns 504 when Groq is too slow', async () => {
    fakeGroq.delayMs = 2500; // longer than GROQ_TIMEOUT_MS
    const token = await createUser();
    assert.equal((await suggest(token, { prompt: 'a cat in space' })).status, 504);
  });

  it('allows only one AI request per user at a time', async () => {
    fakeGroq.delayMs = 400;
    fakeGroq.replies.push(groqReply(GOOD_SUGGESTION), groqReply(GOOD_SUGGESTION));
    const token = await createUser();
    const [a, b] = await Promise.all([
      suggest(token, { prompt: 'first idea' }),
      suggest(token, { prompt: 'second idea' }),
    ]);
    assert.deepEqual([a.status, b.status].sort(), [200, 429]);
  });

  it('validates the prompt and style', async () => {
    const token = await createUser();
    assert.equal((await suggest(token, { prompt: 'a' })).status, 400);
    assert.equal((await suggest(token, { prompt: 'a valid prompt', style: 'not-a-style' })).status, 400);
  });
});

describe('POST /api/ai/generations (upload)', () => {
  it('stores a valid image with details and serves it from /uploads', async () => {
    const token = await createUser();
    const res = await uploadArtwork(token, pngHeader(512, 512), {
      name: 'Neon Skyline',
      description: 'A glowing city',
      collectionName: 'Electric Dreams',
      prompt: 'a futuristic city',
      style: 'cyberpunk',
      aiSuggested: 'true',
      attributes: [{ trait_type: 'Mood', value: 'Mysterious' }],
    });

    assert.equal(res.status, 201);
    const gen = res.body.data.generation;
    assert.equal(gen.source, 'UPLOAD');
    assert.equal(gen.status, 'DRAFT');
    assert.equal(gen.image.mimeType, 'image/png');
    assert.equal(gen.image.width, 512);
    assert.equal(gen.aiSuggested, true);
    assert.deepEqual(gen.attributes, [{ trait_type: 'Mood', value: 'Mysterious' }]);
    assert.match(gen.generatedImage, /^\/uploads\/[0-9a-f-]{36}\.png$/);

    const files = await fs.readdir(uploadDir);
    assert.ok(files.includes(gen.image.fileName));

    const served = await request(app).get(gen.generatedImage);
    assert.equal(served.status, 200);
    assert.equal(served.headers['content-type'], 'image/png');
    assert.equal(served.headers['cross-origin-resource-policy'], 'cross-origin');
    assert.equal(served.headers['x-content-type-options'], 'nosniff');
  });

  it('uses the real file type, not the file name the client sent', async () => {
    const token = await createUser();
    const res = await uploadArtwork(token, jpegHeader(), {}, 'innocent.png');
    assert.equal(res.status, 201);
    assert.equal(res.body.data.generation.image.mimeType, 'image/jpeg');
    assert.match(res.body.data.generation.generatedImage, /\.jpg$/);
  });

  it('rejects an SVG renamed to .png', async () => {
    const token = await createUser();
    // Earlier tests leave their files in the shared temp folder, so compare before/after.
    const filesBefore = (await fs.readdir(uploadDir)).length;
    const res = await uploadArtwork(token, svgFile, {}, 'evil.png');
    assert.equal(res.status, 400);
    assert.match(res.body.message, /Unsupported file/);
    assert.equal((await fs.readdir(uploadDir)).length, filesBefore, 'a rejected file must not be written to disk');
  });

  it('rejects files over the size limit with 413', async () => {
    const token = await createUser();
    const big = Buffer.concat([pngHeader(), Buffer.alloc(1.5 * 1024 * 1024)]);
    const res = await uploadArtwork(token, big);
    assert.equal(res.status, 413);
  });

  it('rejects images that are too small', async () => {
    const token = await createUser();
    const res = await uploadArtwork(token, pngHeader(16, 16));
    assert.equal(res.status, 400);
    assert.match(res.body.message, /at least 64/);
  });

  it('requires an image', async () => {
    const token = await createUser();
    const res = await request(app).post('/api/ai/generations').set(auth(token)).field('name', 'No image');
    assert.equal(res.status, 400);
  });

  it('validates attributes', async () => {
    const token = await createUser();
    const dup = await uploadArtwork(token, pngHeader(), {
      attributes: [
        { trait_type: 'Mood', value: 'a' },
        { trait_type: 'mood', value: 'b' },
      ],
    });
    const notJson = await uploadArtwork(token, pngHeader(), { attributes: 'not json' });
    assert.equal(dup.status, 400);
    assert.equal(notJson.status, 400);
  });
});

describe('artwork library', () => {
  it('lists only my artwork, newest first, with pagination', async () => {
    const alice = await createUser('alice@example.com');
    const bob = await createUser('bob@example.com');
    for (let i = 0; i < 3; i++) await uploadArtwork(alice, pngHeader(), { name: `A${i}` });
    await uploadArtwork(bob, pngHeader(), { name: 'B0' });

    const page1 = await request(app).get('/api/ai/generations?limit=2&page=1').set(auth(alice));
    assert.equal(page1.status, 200);
    assert.deepEqual(
      page1.body.data.items.map((g) => g.name),
      ['A2', 'A1']
    );
    assert.deepEqual(page1.body.data.pagination, { page: 1, limit: 2, total: 3, totalPages: 2 });

    const page2 = await request(app).get('/api/ai/generations?limit=2&page=2').set(auth(alice));
    assert.deepEqual(
      page2.body.data.items.map((g) => g.name),
      ['A0']
    );
  });

  it("returns 404 for someone else's artwork (get, update, delete)", async () => {
    const alice = await createUser('alice@example.com');
    const bob = await createUser('bob@example.com');
    const { body } = await uploadArtwork(alice, pngHeader(), { name: 'Mine' });
    const id = body.data.generation.id;

    assert.equal((await request(app).get(`/api/ai/generations/${id}`).set(auth(bob))).status, 404);
    assert.equal(
      (await request(app).patch(`/api/ai/generations/${id}`).set(auth(bob)).send({ name: 'Hacked' })).status,
      404
    );
    assert.equal((await request(app).delete(`/api/ai/generations/${id}`).set(auth(bob))).status, 404);
  });

  it('updates details', async () => {
    const token = await createUser();
    const { body } = await uploadArtwork(token, pngHeader(), { name: 'Old' });
    const id = body.data.generation.id;

    const res = await request(app)
      .patch(`/api/ai/generations/${id}`)
      .set(auth(token))
      .send({ name: 'New', attributes: [{ trait_type: 'Rarity', value: 'Rare' }] });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.generation.name, 'New');
    assert.deepEqual(res.body.data.generation.attributes, [{ trait_type: 'Rarity', value: 'Rare' }]);
  });

  it('cannot change protected fields through update', async () => {
    const token = await createUser();
    const { body } = await uploadArtwork(token, pngHeader());
    const id = body.data.generation.id;

    const res = await request(app)
      .patch(`/api/ai/generations/${id}`)
      .set(auth(token))
      .send({ name: 'x', status: 'MINTED', generatedImage: '/uploads/other.png', user: '000000000000000000000000' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.generation.status, 'DRAFT');
    assert.equal(res.body.data.generation.generatedImage, body.data.generation.generatedImage);
  });

  it('deletes the draft and its file', async () => {
    const token = await createUser();
    const { body } = await uploadArtwork(token, pngHeader());
    const { id, image } = body.data.generation;

    const res = await request(app).delete(`/api/ai/generations/${id}`).set(auth(token));
    assert.equal(res.status, 200);
    assert.equal(await AIGeneration.countDocuments(), 0);
    assert.ok(!(await fs.readdir(uploadDir)).includes(image.fileName));
  });

  it('refuses to edit or delete minted artwork', async () => {
    const token = await createUser();
    const { body } = await uploadArtwork(token, pngHeader());
    const id = body.data.generation.id;
    await AIGeneration.updateOne({ _id: id }, { status: 'MINTED' });

    assert.equal((await request(app).patch(`/api/ai/generations/${id}`).set(auth(token)).send({ name: 'x' })).status, 409);
    assert.equal((await request(app).delete(`/api/ai/generations/${id}`).set(auth(token))).status, 409);
  });

  it('rejects an invalid id', async () => {
    const token = await createUser();
    assert.equal((await request(app).get('/api/ai/generations/not-an-id').set(auth(token))).status, 400);
  });
});
