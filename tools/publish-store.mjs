#!/usr/bin/env node
/**
 * Uploads a package to the Chrome Web Store and submits it for review.
 *
 * Driven by .github/workflows/release.yml after it has built the zip. Uses the
 * Chrome Web Store API v2 with an OAuth refresh token; see "Publishing to the
 * Chrome Web Store" in the README for getting one.
 *
 * Environment:
 *   CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN   OAuth credentials
 *   CWS_PUBLISHER_ID                                       Developer Dashboard → Publisher → Settings
 *   CWS_EXTENSION_ID                                       the listing's item ID
 *
 * Dependency-free on purpose, like the other tools.
 *
 * Usage:
 *   node tools/publish-store.mjs dist/calendar-privacy-blur-1.2.0.zip
 *   node tools/publish-store.mjs --status     # print the item's status only
 */

import { readFileSync } from "node:fs";

const API = "https://chromewebstore.googleapis.com";

function env(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

async function accessToken() {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: env("CWS_CLIENT_ID"),
      client_secret: env("CWS_CLIENT_SECRET"),
      refresh_token: env("CWS_REFRESH_TOKEN"),
      grant_type: "refresh_token",
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Token refresh failed: ${JSON.stringify(body)}`);
  return body.access_token;
}

/** One API call; throws with the API's own error on anything but 2xx. */
async function call(token, method, path, body, contentType) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(contentType && { "content-type": contentType }) },
    body,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}\n${JSON.stringify(json, null, 2)}`);
  return json;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const item = () => `/publishers/${env("CWS_PUBLISHER_ID")}/items/${env("CWS_EXTENSION_ID")}`;

const token = await accessToken();

if (process.argv[2] === "--status") {
  console.log(JSON.stringify(await call(token, "GET", `/v2${item()}:fetchStatus`), null, 2));
  process.exit(0);
}

const zip = process.argv[2];
if (!zip) throw new Error("Usage: node tools/publish-store.mjs <package.zip>");
const version = JSON.parse(readFileSync(new URL("../src/manifest.json", import.meta.url))).version;

console.log(`Uploading ${zip} (version ${version})…`);
let upload = await call(token, "POST", `/upload/v2${item()}:upload`, readFileSync(zip), "application/zip");
let state = upload.uploadState;

// Large packages are processed asynchronously; the status call reports when
// that is done.
for (let i = 0; i < 30 && /IN_PROGRESS/.test(state ?? ""); i++) {
  await sleep(5000);
  const status = await call(token, "GET", `/v2${item()}:fetchStatus`);
  state = status.lastAsyncUploadState ?? state;
}
console.log(`Upload state: ${state}${upload.crxVersion ? `, version ${upload.crxVersion}` : ""}`);
if (!/SUCCEEDED/.test(state ?? "")) throw new Error(`Upload did not succeed:\n${JSON.stringify(upload, null, 2)}`);
// The store refuses a version it already has, so this only trips on a
// package built from something other than src/.
if (upload.crxVersion && upload.crxVersion !== version) {
  throw new Error(`Store read version ${upload.crxVersion}, manifest says ${version}.`);
}

console.log("Submitting for review…");
const published = await call(token, "POST", `/v2${item()}:publish`, JSON.stringify({ publishType: "DEFAULT_PUBLISH" }), "application/json");
console.log(`Submission state: ${published.state}`);
for (const w of published.warningInfo?.warnings ?? []) console.log(`::warning::${w.reason}: ${w.description}`);
