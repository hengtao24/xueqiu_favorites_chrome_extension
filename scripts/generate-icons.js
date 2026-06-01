'use strict';

/**
 * Pure Node.js PNG icon generator (no external deps).
 * Renders at 4× supersampling then downsamples for crisp results.
 * Design: blue rounded-rect + white star + white bookmark ribbon.
 */

const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

// ── PNG encoder ──────────────────────────────────────────────────────────────

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
  const t   = Buffer.from(type, 'ascii');
  const len = Buffer.allocUnsafe(4); len.writeUInt32BE(data.length);
  const c   = Buffer.allocUnsafe(4); c.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, c]);
}

function makePNG(size, pixels) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 4)] = 0;
    for (let x = 0; x < size; x++) {
      const pi = (y * size + x) * 4;
      raw.set(pixels.slice(pi, pi + 4), y * (1 + size * 4) + 1 + x * 4);
    }
  }
  const w = Buffer.allocUnsafe(4); w.writeUInt32BE(size);
  const h = Buffer.allocUnsafe(4); h.writeUInt32BE(size);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', Buffer.concat([w, h, Buffer.from([8, 6, 0, 0, 0])])),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Drawing primitives (operate on Float32 RGBA buffers) ──────────────────────

function blendPixel(buf, size, x, y, r, g, b, a) {
  if (x < 0 || x >= size || y < 0 || y >= size) return;
  const i  = (y * size + x) * 4;
  const sa = a, da = buf[i + 3];
  const oa = sa + da * (1 - sa);
  if (oa < 1e-6) return;
  buf[i]     = (r * sa + buf[i]     * da * (1 - sa)) / oa;
  buf[i + 1] = (g * sa + buf[i + 1] * da * (1 - sa)) / oa;
  buf[i + 2] = (b * sa + buf[i + 2] * da * (1 - sa)) / oa;
  buf[i + 3] = oa;
}

// Signed distance to rounded-rect (positive = inside)
function sdfRoundRect(px, py, x0, y0, w, h, r) {
  const qx = Math.abs(px - (x0 + w / 2)) - w / 2 + r;
  const qy = Math.abs(py - (y0 + h / 2)) - h / 2 + r;
  return r - Math.sqrt(Math.max(qx, 0) ** 2 + Math.max(qy, 0) ** 2) - Math.max(Math.min(qx, 0), Math.min(qy, 0));
}

// Fill rounded-rect with AA using SDF
function drawRoundRect(buf, size, x0, y0, w, h, r, R, G, B) {
  const x1 = Math.max(0, Math.floor(x0)), x2 = Math.min(size, Math.ceil(x0 + w));
  const y1 = Math.max(0, Math.floor(y0)), y2 = Math.min(size, Math.ceil(y0 + h));
  for (let y = y1; y < y2; y++) {
    for (let x = x1; x < x2; x++) {
      const d = sdfRoundRect(x + 0.5, y + 0.5, x0, y0, w, h, r);
      const a = Math.max(0, Math.min(1, d + 0.5));
      if (a > 0) blendPixel(buf, size, x, y, R, G, B, a);
    }
  }
}

// Star polygon via scanline rasterisation + AA
function drawStar(buf, size, cx, cy, outer, inner, R, G, B) {
  const verts = [];
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI / 5) - Math.PI / 2;
    const r = i % 2 === 0 ? outer : inner;
    verts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }

  function inStar(px, py) {
    let inside = false;
    for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
      const [xi, yi] = verts[i], [xj, yj] = verts[j];
      if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi)
        inside = !inside;
    }
    return inside;
  }

  const pad = 1;
  const x1 = Math.max(0, Math.floor(cx - outer - pad));
  const x2 = Math.min(size, Math.ceil(cx + outer + pad));
  const y1 = Math.max(0, Math.floor(cy - outer - pad));
  const y2 = Math.min(size, Math.ceil(cy + outer + pad));

  // 8× AA per pixel
  const N = 4;
  for (let y = y1; y < y2; y++) {
    for (let x = x1; x < x2; x++) {
      let count = 0;
      for (let sy = 0; sy < N; sy++)
        for (let sx = 0; sx < N; sx++)
          if (inStar(x + (sx + 0.5) / N, y + (sy + 0.5) / N)) count++;
      if (count > 0) blendPixel(buf, size, x, y, R, G, B, count / (N * N));
    }
  }
}

// Bookmark ribbon (rounded top, V-notch bottom)
function drawBookmark(buf, size, cx, cy, w, h, R, G, B) {
  const x0 = cx - w / 2, y0 = cy - h / 2;
  const notchH = h * 0.28;
  const x1 = Math.max(0, Math.floor(x0)), x2 = Math.min(size, Math.ceil(x0 + w));
  const yy1 = Math.max(0, Math.floor(y0)), yy2 = Math.min(size, Math.ceil(y0 + h));

  for (let y = yy1; y < yy2; y++) {
    for (let x = x1; x < x2; x++) {
      const rx = x + 0.5 - x0, ry = y + 0.5 - y0;
      // V-notch at bottom
      if (ry > h - notchH) {
        const t = (ry - (h - notchH)) / notchH;
        if (Math.abs(rx - w / 2) / (w / 2) < t) continue;
      }
      blendPixel(buf, size, x, y, R, G, B, 1);
    }
  }
}

// ── Supersample pipeline ──────────────────────────────────────────────────────

function generateIcon(size) {
  const SS   = 4;                     // supersampling factor
  const big  = size * SS;
  const buf  = new Float32Array(big * big * 4); // float RGBA, init 0

  const pad  = big * 0.07;
  const w    = big - pad * 2;
  const h    = big - pad * 2;
  const rr   = big * 0.22;

  // Blue rounded background
  drawRoundRect(buf, big, pad, pad, w, h, rr, 0x1B / 255, 0x7B / 255, 0xF5 / 255);

  const cx = big / 2;

  if (size <= 20) {
    // Tiny: just a bold bookmark
    drawBookmark(buf, big, cx, big * 0.5, big * 0.40, big * 0.50, 1, 1, 1);
  } else {
    // Star in upper portion
    const starCy = big * 0.41;
    drawStar(buf, big, cx, starCy, big * 0.29, big * 0.125, 1, 1, 1);
    // Bookmark ribbon below
    drawBookmark(buf, big, cx, big * 0.755, big * 0.22, big * 0.27, 1, 1, 1);
  }

  // Downsample SS×SS → 1×1 (box filter)
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * big + (x * SS + sx)) * 4;
          // Pre-multiplied alpha accumulation
          const pa = buf[i + 3];
          r += buf[i]     * pa;
          g += buf[i + 1] * pa;
          b += buf[i + 2] * pa;
          a += pa;
        }
      }
      const total = SS * SS;
      const oa = a / total;
      const i  = (y * size + x) * 4;
      out[i]     = Math.round((oa > 0 ? r / a : 0) * 255);
      out[i + 1] = Math.round((oa > 0 ? g / a : 0) * 255);
      out[i + 2] = Math.round((oa > 0 ? b / a : 0) * 255);
      out[i + 3] = Math.round(oa * 255);
    }
  }

  return makePNG(size, out);
}

// ── Generate ──────────────────────────────────────────────────────────────────

const outDir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });

for (const size of [16, 32, 48, 128]) {
  const buf = generateIcon(size);
  fs.writeFileSync(path.join(outDir, `icon_${size}.png`), buf);
  console.log(`✓ icon_${size}.png  (${buf.length} bytes)`);
}
console.log('Done → public/icons/');
