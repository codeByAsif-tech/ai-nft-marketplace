import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildSuggestionMessages, cleanText, extractJson, parseSuggestion } from '../src/services/ai/suggestion.js';

describe('extractJson', () => {
  it('parses plain JSON, fenced JSON and JSON surrounded by text', () => {
    assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
    assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
    assert.deepEqual(extractJson('Sure! Here it is: {"a":1} Enjoy.'), { a: 1 });
    assert.equal(extractJson('no json here'), null);
    assert.equal(extractJson('{broken'), null);
  });
});

describe('cleanText', () => {
  it('trims, collapses whitespace, strips control chars and quotes', () => {
    assert.equal(cleanText('  "Neon\n\nDreams"  ', 60), 'Neon Dreams');
    assert.equal(cleanText('a\u0000b', 60), 'a b');
    assert.equal(cleanText(42, 60), '42');
    assert.equal(cleanText({}, 60), '');
  });

  it('clamps long text at a word boundary', () => {
    const out = cleanText('one two three four five six seven', 15);
    assert.ok(out.length <= 15);
    assert.ok(!out.endsWith(' '));
  });
});

describe('parseSuggestion', () => {
  it('returns a clean suggestion from good output', () => {
    const raw = JSON.stringify({
      name: 'Neon Skyline',
      description: 'A glowing city at night.',
      collectionName: 'Electric Dreams',
      attributes: [
        { trait_type: 'Mood', value: 'Mysterious' },
        { trait_type: 'Palette', value: 'Neon' },
      ],
    });
    assert.deepEqual(parseSuggestion(raw), {
      name: 'Neon Skyline',
      description: 'A glowing city at night.',
      collectionName: 'Electric Dreams',
      attributes: [
        { trait_type: 'Mood', value: 'Mysterious' },
        { trait_type: 'Palette', value: 'Neon' },
      ],
    });
  });

  it('accepts common alternative key names small models use', () => {
    const s = parseSuggestion({
      title: 'Alt',
      description: 'Desc',
      collection: 'Coll',
      attributes: [{ traitType: 'Era', value: 1999 }],
    });
    assert.equal(s.name, 'Alt');
    assert.equal(s.collectionName, 'Coll');
    assert.deepEqual(s.attributes, [{ trait_type: 'Era', value: '1999' }]);
  });

  it('drops empty and duplicate traits and caps the count at 6', () => {
    const attributes = [
      { trait_type: 'Mood', value: 'Calm' },
      { trait_type: 'mood', value: 'Dup' },
      { trait_type: '', value: 'x' },
      { trait_type: 'Empty', value: '' },
      ...Array.from({ length: 10 }, (_, i) => ({ trait_type: `T${i}`, value: 'v' })),
    ];
    const s = parseSuggestion({ name: 'N', description: 'D', attributes });
    assert.equal(s.attributes.length, 6);
    assert.equal(s.attributes[0].value, 'Calm');
  });

  it('returns null when name or description is missing', () => {
    assert.equal(parseSuggestion('{"name":"Only name"}'), null);
    assert.equal(parseSuggestion('garbage'), null);
  });

  it('clamps overly long fields', () => {
    const s = parseSuggestion({ name: 'x'.repeat(200), description: 'y '.repeat(600) });
    assert.ok(s.name.length <= 60);
    assert.ok(s.description.length <= 500);
  });
});

describe('buildSuggestionMessages', () => {
  it('includes the style label only when a style is chosen', () => {
    const withStyle = buildSuggestionMessages({ prompt: 'a cat', style: 'pixel-art' });
    assert.match(withStyle[1].content, /Style: Pixel art/);
    const noStyle = buildSuggestionMessages({ prompt: 'a cat', style: 'none' });
    assert.doesNotMatch(noStyle[1].content, /Style:/);
  });
});
