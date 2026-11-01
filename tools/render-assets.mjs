#!/usr/bin/env node
/**
 * Renders the Chrome Web Store images in assets/ from the mock pages.
 *
 * Driven by .github/workflows/render-assets.yml, which commits the result.
 * Nothing in the images is a stored capture: assets/mock/ holds a Google
 * Calendar week, an Outlook week and the real settings page, and the masked
 * views apply buildCss() from src/rules.js. Change a rule or the settings page
 * and the next render shows it.
 *
 * The repo is served over a throwaway local HTTP server (the mocks are ES
 * modules, which Chrome will not load from file://), and each image is one
 * headless Chrome run against assets/render.html at the image's exact size, so
 * nothing is cropped or resized afterwards. Chrome writes an opaque page as a
 * 24-bit PNG with no alpha channel, which is what the store asks for.
 *
 * Dependency-free on purpose, like the other tools: the only requirement is a
 * Chrome install. Set CHROME to its binary if it is not in the usual place.
 *
 * Usage:
 *   node tools/render-assets.mjs
 */

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = join(ROOT, "assets");

const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

/** Every image to render: output path, render.html hash, and size. */
const JOBS = [
  { out: "screenshots/01-google-before-after.png", hash: "split=google", size: [1280, 800] },
  { out: "screenshots/02-google-masked.png", hash: "shot=google-masked", size: [1280, 800] },
  { out: "screenshots/03-outlook-before-after.png", hash: "split=outlook", size: [1280, 800] },
  { out: "screenshots/04-outlook-masked.png", hash: "shot=outlook-masked", size: [1280, 800] },
  { out: "screenshots/05-settings.png", hash: "shot=options", size: [1280, 800] },
  { out: "promo-small-440x280.png", hash: "promo", size: [440, 280] },
  { out: "promo-marquee-1400x560.png", hash: "marquee", size: [1400, 560] },
];

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
};

function findChrome() {
  const chrome = process.env.CHROME ?? CHROME_PATHS.find((p) => existsSync(p));
  if (!chrome) throw new Error("Chrome not found; set CHROME to its binary.");
  return chrome;
}

/** Serves the repo root read-only on a free localhost port. */
function serve() {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
    try {
      const body = await readFile(join(ROOT, path));
      res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function render(chrome, profile, origin, { out, hash, size: [w, h] }) {
  const args = [
    "--headless",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--force-device-scale-factor=1",
    // Dark mode for every page, including the settings page's own theme.
    "--force-dark-mode",
    // Ubuntu 24.04 runners block the user namespaces Chrome's sandbox needs.
    // The pages are our own, served from localhost, so CI can run without it.
    ...(process.env.CI ? ["--no-sandbox"] : []),
    `--user-data-dir=${profile}`,
    `--window-size=${w},${h}`,
    // Lets the web fonts, iframes and module scripts settle before capture.
    "--virtual-time-budget=15000",
    `--screenshot=${join(ASSETS, out)}`,
    `${origin}/assets/render.html#${hash}`,
  ];
  // Async spawn: a sync one would block the event loop this server runs on.
  return new Promise((resolve, reject) => {
    const child = spawn(chrome, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) return reject(new Error(`Chrome failed on ${out}:\n${stderr}`));
      console.log(`${out}  ${w}x${h}`);
      resolve();
    });
  });
}

const chrome = findChrome();
const server = await serve();
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = mkdtempSync(join(tmpdir(), "cpb-render-"));
try {
  // Start clean so a renamed or dropped screenshot does not linger.
  const shots = join(ASSETS, "screenshots");
  mkdirSync(shots, { recursive: true });
  for (const f of readdirSync(shots)) if (f.endsWith(".png")) rmSync(join(shots, f));

  for (const job of JOBS) await render(chrome, profile, origin, job);
  copyFileSync(join(ROOT, "src", "icons", "icon128.png"), join(ASSETS, "icon-128.png"));
  console.log("icon-128.png  copied from src/icons/icon128.png");
} finally {
  server.close();
  rmSync(profile, { recursive: true, force: true });
}
