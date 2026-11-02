#!/usr/bin/env node
/**
 * Assembles the GitHub Pages site in _site/.
 *
 * Driven by .github/workflows/pages.yml, which deploys the result. The pages
 * themselves live in site/; this copies them to the root and puts the rest of
 * what they use next to them at the same relative paths as in the repo, so the
 * demo's mocks still find ../../src/rules.js and run the shipped rules:
 *
 *   _site/              site/*, plus the Google site verification file
 *   _site/assets/       the calendar mocks, screenshots, promo tiles and icon
 *   _site/src/          rules.js and the icons, nothing else from the package
 *
 * Dependency-free on purpose, like the other tools.
 *
 * Usage:
 *   node tools/build-site.mjs
 *   python3 -m http.server -d _site    # to look at it locally
 */

import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "_site");

/** Repo path → path under _site/. Directories are copied whole. */
const COPIES = [
  ["site", "."],
  // Not mock/options.html: it needs the whole settings page from src/.
  ...["google.html", "outlook.html", "events.js", "mask.js"].map((f) => [`assets/mock/${f}`, `assets/mock/${f}`]),
  ["assets/screenshots", "assets/screenshots"],
  ["assets/icon-128.png", "assets/icon-128.png"],
  ["assets/promo-small-440x280.png", "assets/promo-small-440x280.png"],
  ["assets/promo-marquee-1400x560.png", "assets/promo-marquee-1400x560.png"],
  ["src/rules.js", "src/rules.js"],
  ["src/icons", "src/icons"],
];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
for (const [from, to] of COPIES) {
  cpSync(join(ROOT, from), join(OUT, to), { recursive: true });
  console.log(`${from}  ->  _site/${to}`);
}

// Search Console proves ownership with a google<id>.html file at the site root.
for (const f of readdirSync(ROOT)) {
  if (/^google[0-9a-f]+\.html$/.test(f)) {
    cpSync(join(ROOT, f), join(OUT, f));
    console.log(`${f}  ->  _site/${f}`);
  }
}
