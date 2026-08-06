#!/usr/bin/env node
/**
 * Bumps the extension's patch version in src/manifest.json.
 *
 * Driven by .github/workflows/bump-version.yml, which commits the result. This
 * script does no git work of its own — it edits one file and reports what it
 * did, which keeps the version arithmetic testable without a repository.
 *
 * Chrome refuses an upload that reuses a version, and chrome://extensions shows
 * the version of an unpacked build, so a distinct version per change makes
 * "which build am I actually running?" answerable at a glance.
 *
 * Usage:
 *   node tools/bump-version.mjs             bump and write
 *   node tools/bump-version.mjs --dry-run   report only, change nothing
 *
 * In GitHub Actions it also appends `previous` and `version` to $GITHUB_OUTPUT.
 */

import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const MANIFEST = "src/manifest.json";
/** Chrome rejects any component above this. */
export const MAX_COMPONENT = 65535;

/** Bumps the last component: 1.1.0 → 1.1.1. Keeps the component count. */
export function nextVersion(version) {
  const parts = String(version).split(".");
  if (parts.length < 1 || parts.length > 4) {
    throw new Error(`"${version}" must have 1–4 dot-separated components`);
  }
  if (!parts.every((p) => /^(0|[1-9]\d*)$/.test(p))) {
    throw new Error(`"${version}" must be dot-separated integers without leading zeros`);
  }
  if (!parts.every((p) => Number(p) <= MAX_COMPONENT)) {
    throw new Error(`"${version}" has a component that exceeds Chrome's limit of ${MAX_COMPONENT}`);
  }
  const bumped = Number(parts[parts.length - 1]) + 1;
  if (bumped > MAX_COMPONENT) {
    throw new Error(`bumping "${version}" would exceed Chrome's limit of ${MAX_COMPONENT}`);
  }
  parts[parts.length - 1] = String(bumped);
  return parts.join(".");
}

/** Rewrites just the version field, leaving formatting and key order alone. */
export function withVersion(manifestText, version) {
  const pattern = /("version"\s*:\s*")([^"]+)(")/;
  if (!pattern.test(manifestText)) {
    throw new Error(`could not find the "version" field in ${MANIFEST}`);
  }
  const updated = manifestText.replace(pattern, `$1${version}$3`);
  if (JSON.parse(updated).version !== version) {
    throw new Error("post-write check failed");
  }
  return updated;
}

/* -------------------------------------------------------------------------- */
/* CLI                                                                        */
/* -------------------------------------------------------------------------- */

function main() {
  const dryRun = process.argv.includes("--dry-run");
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const manifestPath = join(repoRoot, MANIFEST);

  let original;
  try {
    original = readFileSync(manifestPath, "utf8");
  } catch {
    console.error(`version bump failed — cannot read ${MANIFEST}`);
    process.exit(1);
  }

  let current;
  try {
    current = JSON.parse(original).version;
  } catch (e) {
    console.error(`version bump failed — ${MANIFEST} is not valid JSON (${e.message})`);
    process.exit(1);
  }
  if (typeof current !== "string") {
    console.error(`version bump failed — ${MANIFEST} has no "version" string`);
    process.exit(1);
  }

  let next;
  let updated;
  try {
    next = nextVersion(current);
    updated = withVersion(original, next);
  } catch (e) {
    console.error(`version bump failed — ${e.message}`);
    process.exit(1);
  }

  if (!dryRun) writeFileSync(manifestPath, updated);

  console.log(`${current} → ${next}${dryRun ? " (dry run, nothing written)" : ""}`);

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `previous=${current}\nversion=${next}\n`);
  }
}

// Only run when invoked directly, so the helpers above stay importable in tests.
if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
