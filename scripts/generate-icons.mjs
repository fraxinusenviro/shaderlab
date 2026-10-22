// Generates the PWA PNG icons procedurally (no external assets, no deps).
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x / size, y / size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
// Anvil-spark motif: concentric interference rings inside a rounded square.
function icon(maskable) {
  return (u, v) => {
    const x = u - 0.5, y = v - 0.5;
    const r = Math.hypot(x, y);
    const inset = maskable ? 0 : 0.06;
    const half = 0.5 - inset;
    const rr = 0.18;
    const qx = Math.max(Math.abs(x) - (half - rr), 0), qy = Math.max(Math.abs(y) - (half - rr), 0);
    const outside = Math.hypot(qx, qy) > rr;
    if (outside && !maskable) return [0, 0, 0, 0];
    const k = maskable ? 0.8 : 1;
    const w = Math.sin((r / k) * 60 - Math.atan2(y, x) * 3) * 0.5 + 0.5;
    const glow = Math.exp(-r * r * 18 / (k * k));
    const R = 20 + 200 * glow * (0.6 + 0.4 * w) + 30 * w;
    const G = 12 + 120 * glow * w + 20 * w;
    const B = 30 + 60 * (1 - glow) * w + 40 * glow;
    return [clamp(R), clamp(G), clamp(B), 255];
  };
}
mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', png(192, icon(false)));
writeFileSync('public/icons/icon-512.png', png(512, icon(false)));
writeFileSync('public/icons/maskable-512.png', png(512, icon(true)));
writeFileSync('public/icons/apple-touch-icon.png', png(180, icon(true)));
console.log('icons written');
