#!/usr/bin/env node
/**
 * Renders the Chrome Web Store images in assets/ from the raw captures.
 *
 * Driven by .github/workflows/render-assets.yml, which commits the result. Each
 * image is one headless Chrome run against assets/render.html at the image's
 * exact size, so nothing is cropped or resized afterwards. Chrome writes an
 * opaque page as a 24-bit PNG with no alpha channel, which is what the store
 * asks for.
 *
 * Dependency-free on purpose, like the other tools: the only requirement is a
 * Chrome install. Set CHROME to its binary if it is not in the usual place.
 *
 * Usage:
 *   node tools/render-assets.mjs
 */

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = join(ROOT, "assets");
const PAGE = pathToFileURL(join(ASSETS, "render.html")).href;

const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

function findChrome() {
  const chrome = process.env.CHROME ?? CHROME_PATHS.find((p) => existsSync(p));
  if (!chrome) throw new Error("Chrome not found; set CHROME to its binary.");
  return chrome;
}

/** Every image to render: output path, page hash, and size. */
function jobs() {
  const raws = readdirSync(join(ASSETS, "raw"))
    .filter((f) => f.endsWith(".png"))
    .map((f) => f.slice(0, -4));
  return [
    { out: "screenshots/01-before-after.png", hash: "split", size: [1280, 800] },
    ...raws.map((name) => ({ out: `screenshots/${name}.png`, hash: `shot=${name}`, size: [1280, 800] })),
    { out: "promo-small-440x280.png", hash: "promo", size: [440, 280] },
    { out: "promo-marquee-1400x560.png", hash: "marquee", size: [1400, 560] },
  ];
}

function render(chrome, profile, { out, hash, size: [w, h] }) {
  const result = spawnSync(chrome, [
    "--headless",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--force-device-scale-factor=1",
    // Ubuntu 24.04 runners block the user namespaces Chrome's sandbox needs.
    // The page is our own local file, so CI can run without it.
    ...(process.env.CI ? ["--no-sandbox"] : []),
    // The page loads the raw captures and the icon from neighbouring files.
    "--allow-file-access-from-files",
    `--user-data-dir=${profile}`,
    `--window-size=${w},${h}`,
    // Lets the web font and images load before the capture.
    "--virtual-time-budget=10000",
    `--screenshot=${join(ASSETS, out)}`,
    `${PAGE}#${hash}`,
  ], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`Chrome failed on ${out}:\n${result.stderr}`);
  }
  console.log(`${out}  ${w}x${h}`);
}

const chrome = findChrome();
const profile = mkdtempSync(join(tmpdir(), "cpb-render-"));
try {
  mkdirSync(join(ASSETS, "screenshots"), { recursive: true });
  for (const job of jobs()) render(chrome, profile, job);
  copyFileSync(join(ROOT, "src", "icons", "icon128.png"), join(ASSETS, "icon-128.png"));
  console.log("icon-128.png  copied from src/icons/icon128.png");
} finally {
  rmSync(profile, { recursive: true, force: true });
}
