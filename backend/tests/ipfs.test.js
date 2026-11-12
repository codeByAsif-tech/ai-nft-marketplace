import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import express from 'express';
import multer from 'multer';

// ---------------------------------------------------------------------------
// Fake Pinata v3 API. Stores uploads in memory and can be told to fail.
// ---------------------------------------------------------------------------
const TEST_JWT = 'test-pinata-jwt';

const pinata = {
  files: [], // { id, cid, name, keyvalues, mimeType, content }
  uploadCalls: [], // { kind, name }
  lookupCalls: 0,
  // Queue of failures for the next uploads: { kind, status, storeAnyway }
  // storeAnyway = Pinata saved the file but the response was lost (worst case).
  failures: [],
  delayMs: 0,
};

const fakeCid = (buffer) => `bafy${crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 40)}`;

const fake = express();
const upload = multer({ storage: multer.memoryStorage() });

fake.use((req, res, next) => {
  if (req.headers.authorization !== `Bearer ${TEST_JWT}`) return res.status(401).json({ error: 'Unauthorized' });
  next();
});

fake.post('/upload/files', upload.single('file'), async (req, res) => {
  const keyvalues = JSON.parse(req.body.keyvalues ?? '{}');
  pinata.uploadCalls.push({ kind: keyvalues.kind, name: req.body.name });
  if (pinata.delayMs) await new Promise((r) => setTimeout(r, pinata.delayMs));

  const failIndex = pinata.failures.findIndex((f) => f.kind === keyvalues.kind);
  const failure = failIndex >= 0 ? pinata.failures.splice(failIndex, 1)[0] : null;

  const file = {
    id: crypto.randomUUID(),
    cid: fakeCid(req.file.buffer),
    name: req.body.name,
    keyvalues,
    mimeType: req.file.mimetype,
    content: req.file.buffer,
    network: req.body.network,
  };
  if (!failure || failure.storeAnyway) pinata.files.push(file);
  if (failure) return res.status(failure.status).json({ error: 'Simulated failure' });

  res.json({ data: { id: file.id, cid: file.cid, name: file.name, mime_type: file.mimeType, is_duplicate: false } });
});

fake.get('/api/files/public', (req, res) => {
  pinata.lookupCalls++;
  // Express 5's simple query parser keeps "metadata[key]" as literal keys.
  const filters = Object.entries(req.query)
    .filter(([k]) => k.startsWith('metadata['))
    .map(([k, v]) => [k.slice(9, -1), v]);
  const files = pinata.files
    .filter((f) => filters.every(([k, v]) => f.keyvalues[k] === v))
    .map((f) => ({ id: f.id, cid: f.cid, name: f.name, keyvalues: f.keyvalues }));
  res.json({ data: { files, next_page_token: null } });
});

const fakeServer = await new Promise((resolve) => {
  const s = fake.listen(0, '127.0.0.1', () => resolve(s));
});
const fakeUrl = `http://127.0.0.1:${fakeServer.address().port}`;

// ---------------------------------------------------------------------------
const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nft-ipfs-'));

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-definitely-longer-than-32-chars';
process.env.BCRYPT_SALT_ROUNDS = '4';
process.env.UPLOAD_DIR = uploadDir;
process.env.AI_TEXT_PROVIDER = 'none';
process.env.PINATA_JWT = TEST_JWT;
process.env.PINATA_UPLOAD_URL = `${fakeUrl}/upload`;
process.env.PINATA_API_URL = `${fakeUrl}/api`;
process.env.IPFS_GATEWAY_URL = 'https://gateway.test/ipfs';
process.env.IPFS_TIMEOUT_MS = '1500';

const { MongoMemoryServer } = await import('mongodb-memory-server');
const { default: request } = await import('supertest');
const { createApp } = await import('../src/app.js');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { User } = await import('../src/models/User.js');
const { AIGeneration } = await import('../src/models/AIGeneration.js');
const { pngHeader } = await import('./helpers/images.js');
const { buildNftMetadata } = await import('../src/services/ipfs/nftMetadata.js');

let mongod;
let app;

const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function createUser(email = 'alice@example.com') {
  const res = await request(app).post('/api/auth/register').send({ name: 'Test User', email, password: 'secret123' });
  return res.body.data.token;
}

async function createDraft(token, fields = {}) {
  const req = request(app).post('/api/ai/generations').set(auth(token)).attach('image', pngHeader(512, 512), 'art.png');
  const all = {
    name: 'Neon Skyline',
    description: 'A glowing city.',
    collectionName: 'Electric Dreams',
    style: 'cyberpunk',
    attributes: [{ trait_type: 'Mood', value: 'Mysterious' }],
    ...fields,
  };
  for (const [k, v] of Object.entries(all)) req.field(k, typeof v === 'string' ? v : JSON.stringify(v));
  const res = await req;
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data.generation;
}

const publish = (token, id) => request(app).post(`/api/ai/generations/${id}/ipfs`).set(auth(token));
const uploadsOf = (kind) => pinata.uploadCalls.filter((c) => c.kind === kind).length;

before(async () => {
  mongod = await MongoMemoryServer.create();
  await connectDB(mongod.getUri());
  await Promise.all([User.init(), AIGeneration.init()]);
  app = createApp();
});

after(async () => {
  await disconnectDB();
  await mongod.stop();
  await new Promise((resolve) => fakeServer.close(resolve));
  await fs.rm(uploadDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), AIGeneration.deleteMany({})]);
  pinata.files = [];
  pinata.uploadCalls = [];
  pinata.lookupCalls = 0;
  pinata.failures = [];
  pinata.delayMs = 0;
});

describe('POST /api/ai/generations/:id/ipfs (happy path)', () => {
  it('uploads image then metadata once each and stores both CIDs', async () => {
    const token = await createUser();
    const draft = await createDraft(token);

    const res = await publish(token, draft.id);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const { ipfs, status } = res.body.data.generation;

    assert.equal(status, 'UPLOADED_TO_IPFS');
    assert.equal(ipfs.status, 'COMPLETE');
    assert.ok(ipfs.imageCid);
    assert.ok(ipfs.metadataCid);
    assert.equal(ipfs.imageUri, `ipfs://${ipfs.imageCid}`);
    assert.equal(ipfs.metadataUri, `ipfs://${ipfs.metadataCid}`);
    assert.equal(ipfs.imageGatewayUrl, `https://gateway.test/ipfs/${ipfs.imageCid}`);
    assert.equal(ipfs.failedStep, null);
    assert.equal(ipfs.inProgress, false);
    assert.equal(uploadsOf('image'), 1);
    assert.equal(uploadsOf('metadata'), 1);

    // Uploaded publicly, with labels used for duplicate detection.
    const image = pinata.files.find((f) => f.keyvalues.kind === 'image');
    assert.equal(image.network, 'public');
    assert.equal(image.keyvalues.generationId, draft.id);
    assert.match(image.keyvalues.sha256, /^[a-f0-9]{64}$/);
  });

  it('pins standard NFT metadata that points at the image CID', async () => {
    const token = await createUser();
    const draft = await createDraft(token);
    const res = await publish(token, draft.id);
    const { ipfs } = res.body.data.generation;

    const pinned = JSON.parse(pinata.files.find((f) => f.keyvalues.kind === 'metadata').content.toString('utf8'));
    assert.deepEqual(pinned, {
      name: 'Neon Skyline',
      description: 'A glowing city.',
      image: `ipfs://${ipfs.imageCid}`,
      attributes: [
        { trait_type: 'Mood', value: 'Mysterious' },
        { trait_type: 'Style', value: 'Cyberpunk' },
      ],
      properties: { collection: 'Electric Dreams' },
    });
    assert.deepEqual(ipfs.metadata, pinned);
  });

  it('is idempotent: calling again after success uploads nothing', async () => {
    const token = await createUser();
    const draft = await createDraft(token);
    const first = await publish(token, draft.id);
    const second = await publish(token, draft.id);

    assert.equal(second.status, 200);
    assert.equal(second.body.data.generation.ipfs.metadataCid, first.body.data.generation.ipfs.metadataCid);
    assert.equal(pinata.uploadCalls.length, 2);
  });
});

describe('retry without duplicates', () => {
  it('image OK + metadata fails -> retry reuses the image CID and uploads only the metadata', async () => {
    const token = await createUser();
    const draft = await createDraft(token);
    pinata.failures.push({ kind: 'metadata', status: 500 });

    const failed = await publish(token, draft.id);
    assert.equal(failed.status, 503);
    const stored = await AIGeneration.findById(draft.id);
    assert.equal(stored.ipfs.status, 'FAILED');
    assert.equal(stored.ipfs.failedStep, 'METADATA');
    assert.ok(stored.ipfs.imageCid, 'image CID must be kept after a metadata failure');
    assert.equal(stored.ipfs.metadataCid, null);
    assert.match(stored.ipfs.lastError, /Pinata is temporarily unavailable/);
    assert.equal(stored.ipfs.lockedUntil, null, 'lock must be released after a failure');
    assert.equal(stored.status, 'DRAFT');

    const retried = await publish(token, draft.id);
    assert.equal(retried.status, 200);
    assert.equal(retried.body.data.generation.ipfs.imageCid, stored.ipfs.imageCid);
    assert.equal(retried.body.data.generation.ipfs.status, 'COMPLETE');
    assert.equal(uploadsOf('image'), 1, 'image must not be uploaded twice');
    assert.equal(uploadsOf('metadata'), 2); // 1 failed + 1 successful
    assert.equal(pinata.files.filter((f) => f.keyvalues.kind === 'image').length, 1);
  });

  it('image upload fails -> nothing is saved and the retry uploads it once', async () => {
    const token = await createUser();
    const draft = await createDraft(token);
    pinata.failures.push({ kind: 'image', status: 500 });

    const failed = await publish(token, draft.id);
    assert.equal(failed.status, 503);
    const stored = await AIGeneration.findById(draft.id);
    assert.equal(stored.ipfs.failedStep, 'IMAGE');
    assert.equal(stored.ipfs.imageCid, null);

    assert.equal((await publish(token, draft.id)).status, 200);
    assert.equal(pinata.files.filter((f) => f.keyvalues.kind === 'image').length, 1);
  });

  it('Pinata stored the image but the response was lost -> retry finds it instead of re-uploading', async () => {
    const token = await createUser();
    const draft = await createDraft(token);
    pinata.failures.push({ kind: 'image', status: 502, storeAnyway: true });

    assert.equal((await publish(token, draft.id)).status, 503); // Pinata 5xx -> "temporarily unavailable"
    assert.equal(pinata.files.length, 1, 'Pinata kept the file even though we got an error');

    const retried = await publish(token, draft.id);
    assert.equal(retried.status, 200);
    assert.equal(uploadsOf('image'), 1, 'the lost upload must be found, not repeated');
    assert.equal(pinata.files.filter((f) => f.keyvalues.kind === 'image').length, 1);
    assert.equal(retried.body.data.generation.ipfs.imageCid, pinata.files[0].cid);
  });

  it('Pinata stored the metadata but the response was lost -> retry finds it too', async () => {
    const token = await createUser();
    const draft = await createDraft(token);
    pinata.failures.push({ kind: 'metadata', status: 504, storeAnyway: true });

    await publish(token, draft.id);
    const retried = await publish(token, draft.id);
    assert.equal(retried.status, 200);
    assert.equal(uploadsOf('metadata'), 1);
    assert.equal(pinata.files.filter((f) => f.keyvalues.kind === 'metadata').length, 1);
  });

  it('edited details after a metadata failure are used in the retried metadata', async () => {
    const token = await createUser();
    const draft = await createDraft(token);
    pinata.failures.push({ kind: 'metadata', status: 500 });
    await publish(token, draft.id);

    const edit = await request(app)
      .patch(`/api/ai/generations/${draft.id}`)
      .set(auth(token))
      .send({ name: 'Neon Skyline II' });
    assert.equal(edit.status, 200);

    const retried = await publish(token, draft.id);
    assert.equal(retried.body.data.generation.ipfs.metadata.name, 'Neon Skyline II');
    assert.equal(uploadsOf('image'), 1);
  });

  it('records a clear error when Pinata rejects the JWT', async () => {
    const token = await createUser();
    const draft = await createDraft(token);
    // Simulate a revoked key on Pinata's side.
    fakeServer.removeAllListeners('request');
    const reject = express().use((_req, res) => res.status(401).json({ error: 'Unauthorized' }));
    fakeServer.on('request', reject);
    try {
      const res = await publish(token, draft.id);
      assert.equal(res.status, 503);
      assert.match(res.body.message, /PINATA_JWT/);
    } finally {
      fakeServer.removeAllListeners('request');
      fakeServer.on('request', fake);
    }
  });
});

describe('key without read access', () => {
  it('still uploads when the duplicate lookup is forbidden (403)', async () => {
    const { createPinataClient } = await import('../src/services/ipfs/pinata.client.js');
    const writeOnly = express();
    let uploads = 0;
    writeOnly.get('/api/files/public', (_req, res) => res.status(403).json({ error: 'Forbidden' }));
    writeOnly.post('/upload/files', (_req, res) => {
      uploads++;
      res.json({ data: { id: 'f1', cid: 'bafywriteonly' } });
    });
    const server = await new Promise((resolve) => {
      const s = writeOnly.listen(0, '127.0.0.1', () => resolve(s));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      const client = createPinataClient({ jwt: 'x', uploadUrl: `${base}/upload`, apiUrl: `${base}/api`, timeoutMs: 1500 });
      const result = await client.ensureUploaded({
        data: Buffer.from('hello'),
        fileName: 'a.json',
        mimeType: 'application/json',
        keyvalues: { kind: 'metadata' },
      });
      assert.equal(result.cid, 'bafywriteonly');
      assert.equal(uploads, 1);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

describe('locking', () => {
  it('lets only one of two simultaneous requests publish (double-click)', async () => {
    const token = await createUser();
    const draft = await createDraft(token);
    pinata.delayMs = 300;

    const [a, b] = await Promise.all([publish(token, draft.id), publish(token, draft.id)]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409]);
    assert.equal(uploadsOf('image'), 1);
    assert.equal(uploadsOf('metadata'), 1);
  });

  it('recovers from a stale lock left by a crashed server', async () => {
    const token = await createUser();
    const draft = await createDraft(token);
    await AIGeneration.updateOne(
      { _id: draft.id },
      { 'ipfs.status': 'IN_PROGRESS', 'ipfs.lockedUntil': new Date(Date.now() - 1000) }
    );
    assert.equal((await publish(token, draft.id)).status, 200);
  });

  it('blocks edits and deletes while an upload is in progress', async () => {
    const token = await createUser();
    const draft = await createDraft(token);
    await AIGeneration.updateOne(
      { _id: draft.id },
      { 'ipfs.status': 'IN_PROGRESS', 'ipfs.lockedUntil': new Date(Date.now() + 60_000) }
    );

    const edit = await request(app).patch(`/api/ai/generations/${draft.id}`).set(auth(token)).send({ name: 'x' });
    const del = await request(app).delete(`/api/ai/generations/${draft.id}`).set(auth(token));
    const again = await publish(token, draft.id);
    assert.equal(edit.status, 409);
    assert.equal(del.status, 409);
    assert.equal(again.status, 409);
    assert.match(again.body.message, /already in progress/);
  });
});

describe('rules', () => {
  it('locks the details once the artwork is on IPFS', async () => {
    const token = await createUser();
    const draft = await createDraft(token);
    await publish(token, draft.id);
    const edit = await request(app).patch(`/api/ai/generations/${draft.id}`).set(auth(token)).send({ name: 'Changed' });
    assert.equal(edit.status, 409);
    assert.match(edit.body.message, /locked/);
  });

  it('requires a name before uploading, without calling Pinata', async () => {
    const token = await createUser();
    const draft = await createDraft(token, { name: '' });
    const res = await publish(token, draft.id);
    assert.equal(res.status, 400);
    assert.equal(pinata.uploadCalls.length, 0);
  });

  it("returns 404 for someone else's artwork", async () => {
    const alice = await createUser('alice@example.com');
    const bob = await createUser('bob@example.com');
    const draft = await createDraft(alice);
    assert.equal((await publish(bob, draft.id)).status, 404);
    assert.equal(pinata.uploadCalls.length, 0);
  });

  it('reports IPFS as configured without exposing the JWT', async () => {
    const token = await createUser();
    const res = await request(app).get('/api/ai/ipfs/status').set(auth(token));
    assert.equal(res.status, 200);
    assert.equal(res.body.data.configured, true);
    assert.ok(!JSON.stringify(res.body).includes(TEST_JWT));
  });
});

describe('buildNftMetadata', () => {
  it('omits the Style trait for "none" and the collection when empty', () => {
    const meta = buildNftMetadata({ name: ' Plain ', description: '', style: 'none', attributes: [] }, 'bafyabc');
    assert.deepEqual(meta, { name: 'Plain', description: '', image: 'ipfs://bafyabc', attributes: [] });
  });

  it("doesn't duplicate a Style trait the user already added", () => {
    const meta = buildNftMetadata(
      { name: 'X', style: 'anime', attributes: [{ trait_type: 'Style', value: 'Custom' }] },
      'bafyabc'
    );
    assert.deepEqual(meta.attributes, [{ trait_type: 'Style', value: 'Custom' }]);
  });
});
