/**
 * Calendar Privacy Blur — service worker.
 *
 * Single responsibility: keep every matching tab's injected CSS in sync with
 * the rules in chrome.storage.local.
 *
 * Clicking the toolbar icon only writes the master flag; the settings page only
 * writes rules. This file is the sole place that injects, so storage stays the
 * single source of truth and the state survives browser restarts and applies to
 * tabs opened later.
 */

import {
  activePatterns,
  buildCss,
  defaultSettings,
  getSettings,
  matchPatternToRegExp,
  ruleMatchesUrl,
  saveSettings,
} from "./rules.js";

/**
 * User-origin CSS beats author-origin `!important`. insertCSS and removeCSS
 * must agree on the origin, and on the exact CSS text, or the removal silently
 * does nothing.
 */
const CSS_ORIGIN = "USER";

/** Content-script ID for user-added sites, registered at runtime. */
const DYNAMIC_SCRIPT_ID = "cpb-dynamic";

/* -------------------------------------------------------------------------- */
/* Settings cache                                                             */
/* -------------------------------------------------------------------------- */

let cached = null;
/**
 * Compiled patterns for the hot path. `chrome.tabs.onUpdated` fires for every
 * tab in the browser, and reading storage on each one would be wasteful, so the
 * listener rejects irrelevant URLs synchronously against this list.
 */
let compiled = null;

async function settings() {
  if (!cached) {
    cached = await getSettings();
    compiled = compilePatterns(cached);
  }
  return cached;
}

function compilePatterns(s) {
  const out = [];
  for (const rule of s.rules ?? []) {
    if (rule.enabled === false) continue;
    for (const pattern of rule.matches ?? []) {
      try {
        out.push(matchPatternToRegExp(pattern));
      } catch {
        // Malformed patterns are reported in the settings page, not here.
      }
    }
  }
  return out;
}

function invalidateCache() {
  cached = null;
  compiled = null;
}

/** Cheap synchronous "could any rule possibly apply here?" test. */
function maybeCovered(url) {
  if (!url) return false;
  if (!compiled) return true; // cache cold: let the async path decide
  const withoutHash = url.split("#")[0];
  return compiled.some((re) => re.test(withoutHash));
}

/* -------------------------------------------------------------------------- */
/* Serialisation                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Serialises every reconcile. Without this, toggling twice quickly can let the
 * first run's removeCSS land after the second run's insertCSS, leaving a tab
 * unmasked while the stored state — and the badge — claim it is masked. That is
 * the one failure direction this extension must not have.
 */
let queue = Promise.resolve();
function enqueue(task) {
  queue = queue.then(task, task).catch(() => {});
  return queue;
}

/* -------------------------------------------------------------------------- */
/* Injection                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The exact CSS currently injected in a tab, remembered so it can be removed
 * verbatim later. It lives in `chrome.storage.session` rather than a Map
 * because the worker can be torn down at any moment, and after a restart a
 * plain Map would have forgotten a stylesheet that is still on the page —
 * leaving no way to remove it if the rules have since changed.
 */
const tabKey = (tabId) => `tabcss:${tabId}`;

async function recordedCss(tabId) {
  const key = tabKey(tabId);
  const stored = await chrome.storage.session.get(key);
  return stored[key] ?? "";
}

async function forgetTab(tabId) {
  try {
    await chrome.storage.session.remove(tabKey(tabId));
  } catch {
    // Session storage unavailable during teardown; nothing to do.
  }
}

/** Concatenated CSS of every enabled rule matching this URL. */
function cssForUrl(s, url) {
  if (s.blurEnabled === false) return "";
  return (s.rules ?? [])
    .filter((rule) => rule.enabled !== false && ruleMatchesUrl(rule, url))
    .map(buildCss)
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Bring one tab in line. Swallows the expected failures — tab closed
 * mid-flight, navigated away, host permission not granted — so the page console
 * stays clean.
 */
async function applyToTab(tabId, url) {
  if (typeof tabId !== "number" || !url) return;

  const s = await settings();
  const wanted = cssForUrl(s, url);
  const current = await recordedCss(tabId);
  if (wanted === current) return;

  const target = { tabId, allFrames: false };
  try {
    // Insert before removing, so a rule edit never opens a gap in which titles
    // would be briefly readable.
    if (wanted) {
      await chrome.scripting.insertCSS({ target, css: wanted, origin: CSS_ORIGIN });
    }
    if (current) {
      await chrome.scripting.removeCSS({ target, css: current, origin: CSS_ORIGIN });
    }
    if (wanted) {
      await chrome.storage.session.set({ [tabKey(tabId)]: wanted });
    } else {
      await forgetTab(tabId);
    }
  } catch {
    // Re-fires on the next navigation, toggle or settings change.
    await forgetTab(tabId);
  }
}

/** Bring every open tab in line with the current rules. */
async function syncAllTabs() {
  const s = await settings();
  await reflectState(s.blurEnabled !== false);

  let tabs = [];
  try {
    // Query everything and filter locally: tabs we hold no host permission for
    // report no URL, so they drop out without needing the "tabs" permission.
    tabs = await chrome.tabs.query({});
  } catch {
    return;
  }
  await Promise.all(tabs.filter((t) => t.url).map((t) => applyToTab(t.id, t.url)));
}

/**
 * Surface the state on the toolbar icon. With no popup this badge is the only
 * state indicator, and the whole point is knowing whether titles are hidden
 * *before* sharing a screen.
 */
async function reflectState(enabled) {
  try {
    await chrome.action.setBadgeText({ text: enabled ? "" : "OFF" });
    await chrome.action.setBadgeBackgroundColor({ color: "#8A8F98" });
    await chrome.action.setTitle({
      title: enabled
        ? "Calendar Privacy Blur — masking on (right-click for settings)"
        : "Calendar Privacy Blur — masking off (right-click for settings)",
    });
  } catch {
    // Action API unavailable during teardown; re-applied on next wake.
  }
}

/* -------------------------------------------------------------------------- */
/* Content scripts for user-added sites                                       */
/* -------------------------------------------------------------------------- */

/**
 * The manifest can only declare content scripts for the hosts known at build
 * time. Sites added in settings get one registered at runtime instead, so SPA
 * route changes are noticed there too.
 *
 * Only granted origins are registered: `registerContentScripts` throws on a
 * pattern the extension has no permission for, which would take the whole call
 * down with it.
 */
async function syncDynamicContentScripts() {
  const s = await settings();
  const declared = new Set(
    (chrome.runtime.getManifest().content_scripts ?? []).flatMap((cs) => cs.matches ?? []),
  );

  const wanted = [];
  for (const pattern of activePatterns(s)) {
    if (declared.has(pattern)) continue;
    try {
      if (await chrome.permissions.contains({ origins: [pattern] })) wanted.push(pattern);
    } catch {
      // Not a shape the permissions API accepts; skip it.
    }
  }

  try {
    await chrome.scripting.unregisterContentScripts({ ids: [DYNAMIC_SCRIPT_ID] });
  } catch {
    // Nothing was registered.
  }
  if (wanted.length === 0) return;

  try {
    await chrome.scripting.registerContentScripts([
      {
        id: DYNAMIC_SCRIPT_ID,
        js: ["content.js"],
        matches: wanted,
        runAt: "document_start",
        allFrames: false,
        persistAcrossSessions: true,
      },
    ]);
  } catch {
    // A pattern Chrome rejected. The extension still works via tabs.onUpdated.
  }
}

/* -------------------------------------------------------------------------- */
/* Wiring                                                                     */
/* -------------------------------------------------------------------------- */

chrome.runtime.onInstalled.addListener(() => {
  enqueue(async () => {
    // Persist a migration exactly once, from the one context that is guaranteed
    // to run alone. Everywhere else upgrades in memory only.
    const raw = await chrome.storage.local.get(null);
    if (!Array.isArray(raw.rules)) {
      const seeded = defaultSettings();
      seeded.blurEnabled = raw.blurEnabled !== false;
      await saveSettings(seeded);
    }
    invalidateCache();
    await syncDynamicContentScripts();
    await syncAllTabs();
  });
});

chrome.runtime.onStartup.addListener(() => {
  enqueue(async () => {
    invalidateCache();
    await syncDynamicContentScripts();
    await syncAllTabs();
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (!changes.blurEnabled && !changes.rules) return;
  enqueue(async () => {
    invalidateCache();
    await syncDynamicContentScripts();
    await syncAllTabs();
  });
});

/** Granting or revoking a host in settings changes what we may inject into. */
chrome.permissions.onAdded.addListener(() => {
  enqueue(async () => {
    await syncDynamicContentScripts();
    await syncAllTabs();
  });
});
chrome.permissions.onRemoved.addListener(() => {
  enqueue(async () => {
    await syncDynamicContentScripts();
    await syncAllTabs();
  });
});

/**
 * Clicking the toolbar icon flips the master switch. There is no popup:
 * `onClicked` only fires when `action.default_popup` is unset. Right-clicking
 * the icon gives Chrome's own "Options" entry, which opens the settings page.
 *
 * This writes the flag and stops; the storage listener does the reconcile, so
 * every entry point travels the same path. Queued so a double-click cannot read
 * a stale value and land on the wrong state.
 */
chrome.action.onClicked.addListener(() => {
  enqueue(async () => {
    const s = await settings();
    await chrome.storage.local.set({ blurEnabled: s.blurEnabled === false });
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = changeInfo.url ?? tab?.url;
  if (!maybeCovered(url)) return;

  // A new document drops any previously injected CSS with it, so the record of
  // what is on the page has to go too — otherwise the next reconcile sees
  // "already correct" and leaves the fresh document unmasked.
  if (changeInfo.status === "loading") enqueue(() => forgetTab(tabId));
  if (!changeInfo.status && !changeInfo.url) return;

  // Acting on `loading` as well as `complete` closes the window in which titles
  // would be briefly readable while the page paints.
  enqueue(() => applyToTab(tabId, url));
});

chrome.tabs.onRemoved.addListener((tabId) => {
  enqueue(() => forgetTab(tabId));
});

/**
 * The content script reports each fresh document, covering what
 * tabs.onUpdated misses: the extension being enabled while a tab was already
 * open, and in-app route changes that never surface as a tab update.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "cpb:sync" && sender.tab) {
    const tabId = sender.tab.id;
    const url = sender.tab.url ?? sender.url;
    enqueue(async () => {
      await forgetTab(tabId); // fresh document
      await applyToTab(tabId, url);
    });
    return false;
  }

  // The settings page asks for a reconcile after saving, so changes land on
  // open tabs without waiting for the storage event to round-trip.
  if (message?.type === "cpb:reconcile") {
    enqueue(async () => {
      invalidateCache();
      await syncDynamicContentScripts();
      await syncAllTabs();
      sendResponse({ ok: true });
    });
    return true; // response is async
  }

  return false;
});
