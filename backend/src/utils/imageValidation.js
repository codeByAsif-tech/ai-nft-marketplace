/**
 * Identifies images by their actual bytes ("magic numbers"), never by the
 * file name or the Content-Type the client sent: both are trivially faked.
 * Only raster formats are accepted. SVG is rejected on purpose because it
 * can contain scripts.
 */

export const ALLOWED_IMAGE_TYPES = Object.freeze({
  png: { mime: 'image/png', ext: 'png' },
  jpeg: { mime: 'image/jpeg', ext: 'jpg' },
  gif: { mime: 'image/gif', ext: 'gif' },
  webp: { mime: 'image/webp', ext: 'webp' },
});

export const IMAGE_LIMITS = Object.freeze({
  minDimension: 64,
  maxDimension: 8192,
});

const startsWith = (buf, bytes, offset = 0) =>
  buf.length >= offset + bytes.length && bytes.every((b, i) => buf[offset + i] === b);

const ascii = (buf, start, end) => buf.subarray(start, end).toString('latin1');

/** Returns one of ALLOWED_IMAGE_TYPES, or null if the bytes are not a supported image. */
export function detectImageType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return ALLOWED_IMAGE_TYPES.png;
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return ALLOWED_IMAGE_TYPES.jpeg;
  if (ascii(buf, 0, 6) === 'GIF87a' || ascii(buf, 0, 6) === 'GIF89a') return ALLOWED_IMAGE_TYPES.gif;
  if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WEBP') return ALLOWED_IMAGE_TYPES.webp;
  return null;
}

function pngSize(buf) {
  // Signature (8) + IHDR length (4) + "IHDR" (4), then width and height (big-endian).
  if (buf.length < 24 || ascii(buf, 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function gifSize(buf) {
  return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
}

function jpegSize(buf) {
  // Walk the JPEG segments until a Start-Of-Frame marker, which holds the size.
  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) return null;
    const marker = buf[offset + 1];
    if (marker === 0xff) {
      offset += 1; // fill byte
      continue;
    }
    // Standalone markers without a length field.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = buf.readUInt16BE(offset + 2);
    if (length < 2) return null;
    const isSOF = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isSOF) {
      return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

function webpSize(buf) {
  if (buf.length < 30) return null;
  const chunk = ascii(buf, 12, 16);
  if (chunk === 'VP8X') {
    // 24-bit little-endian canvas size, stored minus one.
    return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  }
  if (chunk === 'VP8 ') {
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    const bits = buf.readUInt32LE(21);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  return null;
}

export function getImageDimensions(buf, type) {
  try {
    switch (type?.ext) {
      case 'png':
        return pngSize(buf);
      case 'gif':
        return gifSize(buf);
      case 'jpg':
        return jpegSize(buf);
      case 'webp':
        return webpSize(buf);
      default:
        return null;
    }
  } catch {
    return null; // truncated or corrupt header
  }
}

/**
 * Full validation. Returns { type, width, height } or throws an Error with a
 * user-friendly message (callers turn it into a 400).
 */
export function validateImage(buf, { maxBytes }) {
  if (!buf || buf.length === 0) throw new Error('The uploaded file is empty');
  if (buf.length > maxBytes) throw new Error(`Image must be at most ${Math.round(maxBytes / 1024 / 1024)} MB`);

  const type = detectImageType(buf);
  if (!type) throw new Error('Unsupported file. Upload a PNG, JPEG, WebP or GIF image');

  const size = getImageDimensions(buf, type);
  if (!size || !size.width || !size.height) throw new Error('Could not read the image size. The file may be corrupt');

  const { minDimension, maxDimension } = IMAGE_LIMITS;
  if (size.width < minDimension || size.height < minDimension) {
    throw new Error(`Image must be at least ${minDimension}×${minDimension} pixels`);
  }
  if (size.width > maxDimension || size.height > maxDimension) {
    throw new Error(`Image must be at most ${maxDimension}×${maxDimension} pixels`);
  }

  return { type, width: size.width, height: size.height };
}
