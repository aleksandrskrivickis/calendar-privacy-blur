/**
 * Generates the extension's PNG icons — a crossed-out eye on a rounded tile.
 *
 * Dependency-free on purpose: PNG encoding is a zlib deflate plus three
 * chunks, and adding a build toolchain to a five-file extension would cost
 * more than it saves. Run it from the repo root when the mark changes:
 *
 *   node tools/make-icons.mjs
 *
 * Deliberately geometric — no Microsoft or Outlook imagery.
 */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "icons");
const SIZES = [16, 48, 128];
const SS = 8; // supersampling factor per axis

const INDIGO = [0x4c, 0x5f, 0xd8];
const WHITE = [0xff, 0xff, 0xff];

/* -- geometry, in a 0..1 unit square --------------------------------------- */

const TILE_RADIUS = 0.22;

// Lens (the eye outline) is the intersection of two circles centred above and
// below the middle. For half-width w and half-height h: R = k + h and
// w^2 = R^2 - k^2, which solves to the pair below for w=0.33, h=0.19.
const LENS_K = 0.1916;
const LENS_R = 0.3816;

const LENS_STROKE = 0.075; // the eye is an outline, not a filled almond
const PUPIL_R = 0.1;

const SLASH_A = [0.24, 0.26];
const SLASH_B = [0.76, 0.74];
const SLASH_GAP_HALF = 0.075; // tile-coloured cut, separates slash from eye
const SLASH_HALF = 0.042;

const dist = (x, y, cx, cy) => Math.hypot(x - cx, y - cy);

/** Is (x,y) inside a rounded rectangle filling the tile? */
function inTile(x, y) {
  const b = 0.5 - TILE_RADIUS; // half-extent of the straight-edged inner box
  const qx = Math.abs(x - 0.5) - b;
  const qy = Math.abs(y - 0.5) - b;
  if (qx <= 0 && qy <= 0) return true; // inner box
  if (qx <= 0 || qy <= 0) return true; // edge slab: the tile is full-bleed
  return Math.hypot(qx, qy) <= TILE_RADIUS; // corner arc
}

/** Intersection of the two circles, optionally eroded to leave a stroke. */
const inLens = (x, y, erode = 0) =>
  dist(x, y, 0.5, 0.5 + LENS_K) <= LENS_R - erode &&
  dist(x, y, 0.5, 0.5 - LENS_K) <= LENS_R - erode;

/** Distance from a point to the SLASH_A–SLASH_B segment. */
function slashDistance(x, y) {
  const [ax, ay] = SLASH_A;
  const [bx, by] = SLASH_B;
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

/** Topmost opaque shape at a point, or null where the tile is not painted. */
function sample(x, y) {
  const slash = slashDistance(x, y);
  if (slash <= SLASH_HALF) return WHITE;
  if (slash <= SLASH_GAP_HALF) return INDIGO; // gap, so the slash reads clearly
  if (dist(x, y, 0.5, 0.5) <= PUPIL_R) return WHITE; // pupil, as two crescents
  if (inLens(x, y) && !inLens(x, y, LENS_STROKE)) return WHITE; // eye outline
  if (inTile(x, y)) return INDIGO;
  return null;
}

/* -- rasteriser ------------------------------------------------------------ */

function render(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const total = SS * SS;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let covered = 0;
      let r = 0;
      let g = 0;
      let b = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const hit = sample((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size);
          if (!hit) continue;
          covered++;
          r += hit[0];
          g += hit[1];
          b += hit[2];
        }
      }

      const i = (py * size + px) * 4;
      if (covered === 0) continue;
      // Average only the covered subsamples, so edges do not bleed toward the
      // transparent backdrop and leave a dark halo.
      rgba[i] = Math.round(r / covered);
      rgba[i + 1] = Math.round(g / covered);
      rgba[i + 2] = Math.round(b / covered);
      rgba[i + 3] = Math.round((covered / total) * 255);
    }
  }

  return rgba;
}

/* -- PNG encoder ----------------------------------------------------------- */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter type: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // bytes 10-12 stay zero: deflate, adaptive filtering, no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* -- run ------------------------------------------------------------------- */

mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  const file = join(OUT_DIR, `icon${size}.png`);
  const png = encodePng(size, render(size));
  writeFileSync(file, png);
  console.log(`${file}  ${png.length} bytes`);
}
