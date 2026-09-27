/**
 * Generates every app icon (SVG + PNG) from one geometric description, with
 * no dependencies: a tiny supersampling rasteriser and a minimal PNG encoder.
 *
 *   yarn icons   (or: docker compose run --rm icons)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const BG_TOP = '#178a84';
const BG_BOTTOM = '#0b4957';
const TILE_COLORS = ['#f6f3ea', '#9dd7ca', '#5cbfae', '#f1c56d'];

/** Shapes in unit coordinates (0..1). */
function scene({ cornerRadius, padding }) {
  const gap = (1 - 2 * padding) * 0.1;
  const size = (1 - 2 * padding - gap) / 2;
  const radius = size * 0.26;
  const tiles = [
    [padding, padding],
    [padding + size + gap, padding],
    [padding, padding + size + gap],
    [padding + size + gap, padding + size + gap],
  ].map(([x, y], i) => ({ x, y, w: size, h: size, r: radius, color: TILE_COLORS[i] }));
  return { background: { x: 0, y: 0, w: 1, h: 1, r: cornerRadius }, tiles };
}

// "any" icons carry their own rounded corners; maskable/Apple icons are full-bleed
// because the platform applies its own mask. Maskable content stays inside the 80% safe zone.
const VARIANTS = {
  any: scene({ cornerRadius: 0.225, padding: 0.2 }),
  apple: scene({ cornerRadius: 0, padding: 0.2 }),
  maskable: scene({ cornerRadius: 0, padding: 0.28 }),
};

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

function insideRoundRect(px, py, { x, y, w, h, r }) {
  if (px < x || py < y || px > x + w || py > y + h) return false;
  const dx = Math.max(x + r - px, 0, px - (x + w - r));
  const dy = Math.max(y + r - py, 0, py - (y + h - r));
  return dx * dx + dy * dy <= r * r;
}

function rasterize({ background, tiles }, size, samples = 4) {
  const top = hex(BG_TOP);
  const bottom = hex(BG_BOTTOM);
  const tileRgb = tiles.map((t) => hex(t.color));
  const pixels = Buffer.alloc(size * size * 4);
  const n = samples * samples;

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0; let g = 0; let b = 0; let a = 0;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const u = (px + (sx + 0.5) / samples) / size;
          const v = (py + (sy + 0.5) / samples) / size;
          if (!insideRoundRect(u, v, background)) continue;
          let rgb = top.map((c, i) => c + (bottom[i] - c) * v);
          for (let t = 0; t < tiles.length; t += 1) {
            if (insideRoundRect(u, v, tiles[t])) { rgb = tileRgb[t]; break; }
          }
          r += rgb[0]; g += rgb[1]; b += rgb[2]; a += 1;
        }
      }
      const o = (py * size + px) * 4;
      if (a) {
        pixels[o] = Math.round(r / a);
        pixels[o + 1] = Math.round(g / a);
        pixels[o + 2] = Math.round(b / a);
        pixels[o + 3] = Math.round((a / n) * 255);
      }
    }
  }
  return pixels;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(pixels, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function toSvg({ background, tiles }) {
  const s = 512;
  const f = (n) => +(n * s).toFixed(2);
  const rect = (o, fill) => `<rect x="${f(o.x)}" y="${f(o.y)}" width="${f(o.w)}" height="${f(o.h)}" rx="${f(o.r)}" fill="${fill}"/>`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}">`,
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${BG_TOP}"/><stop offset="1" stop-color="${BG_BOTTOM}"/></linearGradient></defs>`,
    rect(background, 'url(#bg)'),
    ...tiles.map((t) => rect(t, t.color)),
    '</svg>',
    '',
  ].join('\n');
}

const OUTPUTS = [
  ['favicon-32.png', 'any', 32],
  ['icon-192.png', 'any', 192],
  ['icon-512.png', 'any', 512],
  ['apple-touch-icon.png', 'apple', 180],
  ['maskable-192.png', 'maskable', 192],
  ['maskable-512.png', 'maskable', 512],
];

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'icon.svg'), toSvg(VARIANTS.any));
console.log('wrote icon.svg');
for (const [file, variant, size] of OUTPUTS) {
  writeFileSync(join(OUT, file), encodePng(rasterize(VARIANTS[variant], size), size));
  console.log(`wrote ${file} (${size}x${size})`);
}
