'use strict';

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// Minimal CRC32
function crc32(buf) {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = (crc >>> 8) ^ t[(crc ^ b) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.allocUnsafe(4); len.writeUInt32BE(data.length);
  const crcBuf = Buffer.allocUnsafe(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crcBuf]);
}

function makePNG(size, pixels) {
  // pixels: Uint8Array of size*size*4 (RGBA)
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 4)] = 0;
    for (let x = 0; x < size; x++) {
      const pi = (y * size + x) * 4;
      const ri = y * (1 + size * 4) + 1 + x * 4;
      raw.set(pixels.slice(pi, pi + 4), ri);
    }
  }
  const w = Buffer.allocUnsafe(4); w.writeUInt32BE(size);
  const h = Buffer.allocUnsafe(4); h.writeUInt32BE(size);
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    pngChunk('IHDR', Buffer.concat([w, h, Buffer.from([8,6,0,0,0])])),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function setPixel(px, size, x, y, r, g, b, a = 255) {
  if (x < 0 || x >= size || y < 0 || y >= size) return;
  const i = (y * size + x) * 4;
  const fa = a / 255, ba = px[i+3] / 255;
  const oa = fa + ba * (1 - fa);
  if (oa === 0) return;
  px[i]   = Math.round((r * fa + px[i]   * ba * (1 - fa)) / oa);
  px[i+1] = Math.round((g * fa + px[i+1] * ba * (1 - fa)) / oa);
  px[i+2] = Math.round((b * fa + px[i+2] * ba * (1 - fa)) / oa);
  px[i+3] = Math.round(oa * 255);
}

function drawRoundRect(px, size, x0, y0, w, h, r, R, G, B) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const rx = x - x0, ry = y - y0;
      let inside = false;
      if (rx >= r && rx < w - r) inside = true;
      else if (ry >= r && ry < h - r) inside = true;
      else {
        for (const [cx, cy] of [[r,r],[w-r,r],[r,h-r],[w-r,h-r]]) {
          if (Math.hypot(rx-cx, ry-cy) <= r) { inside = true; break; }
        }
      }
      if (inside) setPixel(px, size, x, y, R, G, B, 255);
    }
  }
}

function drawStar(px, size, cx, cy, outer, inner, R, G, B) {
  const verts = [];
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI / 5) - Math.PI / 2;
    const r = i % 2 === 0 ? outer : inner;
    verts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  function inPoly(px, py) {
    let inside = false;
    for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
      const [xi, yi] = verts[i], [xj, yj] = verts[j];
      if ((yi > py) !== (yj > py) && px < (xj-xi)*(py-yi)/(yj-yi)+xi)
        inside = !inside;
    }
    return inside;
  }
  // Draw with antialiasing
  for (let y = Math.floor(cy - outer) - 1; y <= Math.ceil(cy + outer) + 1; y++) {
    for (let x = Math.floor(cx - outer) - 1; x <= Math.ceil(cx + outer) + 1; x++) {
      // Sample 4 subpixels for AA
      let count = 0;
      for (const [ox, oy] of [[0.25,0.25],[0.75,0.25],[0.25,0.75],[0.75,0.75]])
        if (inPoly(x + ox, y + oy)) count++;
      if (count > 0) setPixel(px, size, x, y, R, G, B, Math.round(count / 4 * 255));
    }
  }
}

// Small bookmark ribbon (for tiny sizes like 16)
function drawBookmark(px, size, cx, cy, w, h, R, G, B) {
  const x0 = Math.round(cx - w/2), y0 = Math.round(cy - h/2);
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      // Bottom V-cut
      const ry = y - y0;
      const notch = h * 0.3;
      if (ry > h - notch) {
        const mid = x0 + w / 2;
        const cutDepth = (ry - (h - notch)) / notch;
        const cutW = Math.abs(x - mid) / (w / 2);
        if (cutDepth > cutW) continue;
      }
      setPixel(px, size, x, y, R, G, B, 255);
    }
  }
}

function generateIcon(size) {
  const px = new Uint8Array(size * size * 4);
  const pad = Math.max(1, Math.round(size * 0.07));
  const rr  = Math.round(size * 0.22);

  // Blue rounded-rect background
  drawRoundRect(px, size, pad, pad, size - pad*2, size - pad*2, rr, 0x1B, 0x7B, 0xF5);

  const cx = size / 2;

  if (size <= 20) {
    // Tiny: simple white bookmark
    const bw = Math.round(size * 0.42), bh = Math.round(size * 0.52);
    drawBookmark(px, size, cx, size * 0.5, bw, bh, 255, 255, 255);
  } else {
    // Larger: white star above a small bookmark ribbon
    const starCy = size * 0.42;
    const outer  = size * 0.30;
    const inner  = size * 0.13;
    drawStar(px, size, cx, starCy, outer, inner, 255, 255, 255);

    // Small bookmark beneath star
    const bw = Math.round(size * 0.22), bh = Math.round(size * 0.28);
    drawBookmark(px, size, cx, size * 0.76, bw, bh, 255, 255, 255);
  }

  return makePNG(size, px);
}

const outDir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });

for (const size of [16, 32, 48, 128]) {
  const buf = generateIcon(size);
  fs.writeFileSync(path.join(outDir, `icon_${size}.png`), buf);
  console.log(`✓ icon_${size}.png`);
}
console.log('Icons generated at public/icons/');
