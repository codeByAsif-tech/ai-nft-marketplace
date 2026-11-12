import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detectImageType, getImageDimensions, validateImage } from '../src/utils/imageValidation.js';
import { gifHeader, jpegHeader, pngHeader, svgFile, webpHeader } from './helpers/images.js';

const MB = 1024 * 1024;

describe('detectImageType', () => {
  it('detects PNG, JPEG, GIF and WebP from their bytes', () => {
    assert.equal(detectImageType(pngHeader()).ext, 'png');
    assert.equal(detectImageType(jpegHeader()).ext, 'jpg');
    assert.equal(detectImageType(gifHeader()).ext, 'gif');
    assert.equal(detectImageType(webpHeader()).ext, 'webp');
  });

  it('rejects SVG, text, executables and tiny buffers', () => {
    assert.equal(detectImageType(svgFile), null);
    assert.equal(detectImageType(Buffer.from('just some text, not an image')), null);
    assert.equal(detectImageType(Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00')), null);
    assert.equal(detectImageType(Buffer.from([0x89, 0x50])), null);
    assert.equal(detectImageType('not a buffer'), null);
  });
});

describe('getImageDimensions', () => {
  it('reads the size from each format', () => {
    assert.deepEqual(getImageDimensions(pngHeader(512, 256), detectImageType(pngHeader())), { width: 512, height: 256 });
    assert.deepEqual(getImageDimensions(jpegHeader(640, 480), detectImageType(jpegHeader())), {
      width: 640,
      height: 480,
    });
    assert.deepEqual(getImageDimensions(gifHeader(300, 200), detectImageType(gifHeader())), { width: 300, height: 200 });
    assert.deepEqual(getImageDimensions(webpHeader(800, 600), detectImageType(webpHeader())), {
      width: 800,
      height: 600,
    });
  });

  it('returns null for a truncated JPEG without a size marker', () => {
    const truncated = jpegHeader().subarray(0, 22);
    assert.equal(getImageDimensions(truncated, detectImageType(truncated)), null);
  });
});

describe('validateImage', () => {
  it('accepts a valid image and returns type and size', () => {
    const result = validateImage(pngHeader(1024, 1024), { maxBytes: 10 * MB });
    assert.equal(result.type.mime, 'image/png');
    assert.equal(result.width, 1024);
  });

  it('rejects empty, oversized, unsupported, too small and too large images', () => {
    assert.throws(() => validateImage(Buffer.alloc(0), { maxBytes: MB }), /empty/);
    assert.throws(() => validateImage(pngHeader(), { maxBytes: 10 }), /at most/);
    assert.throws(() => validateImage(svgFile, { maxBytes: MB }), /Unsupported file/);
    assert.throws(() => validateImage(pngHeader(32, 32), { maxBytes: MB }), /at least 64/);
    assert.throws(() => validateImage(pngHeader(10000, 500), { maxBytes: MB }), /at most 8192/);
  });
});
