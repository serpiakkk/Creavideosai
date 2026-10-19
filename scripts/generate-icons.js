import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// Minimal compliant PNG builder in pure Node.js
function createPng(width, height, getPixel) {
  const bytesPerPixel = 4; // RGBA
  const rowSize = 1 + width * bytesPerPixel;
  const rawData = Buffer.alloc(height * rowSize);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixel(x, y, width, height);
      const pixelOffset = rowOffset + 1 + x * bytesPerPixel;
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData);

  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      let byte = buf[i];
      crc ^= byte;
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    const crcValue = crc32(Buffer.concat([typeBuf, data]));
    crcBuf.writeUInt32BE(crcValue, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8 bits per channel
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0; // Compression
  ihdrData[11] = 0; // Filter
  ihdrData[12] = 0; // Interlace
  const ihdrChunk = chunk('IHDR', ihdrData);

  // IDAT
  const idatChunk = chunk('IDAT', compressed);

  // IEND
  const iendChunk = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Generate beautiful branded icon
function getAutoVideoPixel(x, y, width, height, isMaskable = false) {
  const cx = width / 2;
  const cy = height / 2;
  const nx = (x - cx) / (width / 2);
  const ny = (y - cy) / (height / 2);
  const dist = Math.sqrt(nx * nx + ny * ny);

  // Dark modern slate-indigo background
  // Subtle radial gradient
  const rBg = Math.round(15 + (1 - dist) * 15);
  const gBg = Math.round(23 + (1 - dist) * 18);
  const bBg = Math.round(42 + (1 - dist) * 45);

  const scale = isMaskable ? 0.75 : 0.88;
  const sx = nx / scale;
  const sy = ny / scale;

  // Video Clapper Frame Box: rounded rectangle from x in [-0.55, 0.55], y in [-0.45, 0.45]
  const inBox = Math.abs(sx) < 0.58 && Math.abs(sy) < 0.48;
  const isBoxBorder = inBox && (Math.abs(sx) > 0.52 || Math.abs(sy) > 0.42);

  // Top clapper stripe
  const isTopBar = inBox && sy < -0.22;
  const isStripe = isTopBar && ((Math.floor((sx + 1) * 6)) % 2 === 0);

  // Play button triangle: vertices at (-0.12, -0.18), (0.24, 0), (-0.12, 0.18)
  const inPlayX = sx >= -0.12 && sx <= 0.24;
  const expectedHalfHeight = (0.24 - sx) * (0.22 / 0.36);
  const inPlayTriangle = inPlayX && Math.abs(sy) <= expectedHalfHeight;

  // Star sparkle at top right: (0.42, -0.42)
  const starDist = Math.sqrt((sx - 0.42) * (sx - 0.42) + (sy + 0.42) * (sy + 0.42));
  const isStar = starDist < 0.08;

  if (isStar) {
    return [56, 189, 248, 255]; // bright cyan
  }

  if (inPlayTriangle) {
    // White/Indigo vibrant play mark
    const factor = (sx + 0.12) / 0.36;
    return [255, Math.round(255 - factor * 40), Math.round(255 - factor * 20), 255];
  }

  if (isBoxBorder) {
    return [99, 102, 241, 255]; // Indigo-500
  }

  if (isStripe) {
    return [129, 140, 248, 255]; // Indigo-400
  }

  if (inBox) {
    return [30, 34, 56, 255]; // Card surface
  }

  return [Math.max(0, Math.min(255, rBg)), Math.max(0, Math.min(255, gBg)), Math.max(0, Math.min(255, bBg)), 255];
}

const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

console.log('Generating PNG icons for PWA...');

// 1. apple-touch-icon.png (180x180)
fs.writeFileSync(
  path.join(publicDir, 'apple-touch-icon.png'),
  createPng(180, 180, (x, y, w, h) => getAutoVideoPixel(x, y, w, h, false))
);

// 2. pwa-192x192.png (192x192)
fs.writeFileSync(
  path.join(publicDir, 'pwa-192x192.png'),
  createPng(192, 192, (x, y, w, h) => getAutoVideoPixel(x, y, w, h, false))
);

// 3. pwa-512x512.png (512x512)
fs.writeFileSync(
  path.join(publicDir, 'pwa-512x512.png'),
  createPng(512, 512, (x, y, w, h) => getAutoVideoPixel(x, y, w, h, false))
);

// 4. pwa-maskable-512x512.png (512x512 with safe padding)
fs.writeFileSync(
  path.join(publicDir, 'pwa-maskable-512x512.png'),
  createPng(512, 512, (x, y, w, h) => getAutoVideoPixel(x, y, w, h, true))
);

// 5. favicon.ico
fs.writeFileSync(
  path.join(publicDir, 'favicon.ico'),
  createPng(64, 64, (x, y, w, h) => getAutoVideoPixel(x, y, w, h, false))
);

console.log('Icons generated successfully in public/');
