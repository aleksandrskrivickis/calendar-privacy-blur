/**
 * Calendar(s) privacy blur — service worker.
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
  SCHEMA_VERSION,
  activePatterns,
  buildCss,
  getSettings,
  matchPatternToRegExp,
  mergeMissingBuiltins,
  normalise,
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
 * The exact CSS currently injected in a tab, and the document it went into,
 * remembered so it can be removed verbatim later. It lives in storage rather
 * than a Map because the worker can be torn down at any moment, and after a
 * restart a plain Map would have forgotten a stylesheet that is still on the
 * page — leaving no way to remove it if the rules have since changed.
 *
 * `chrome.storage.local`, not `.session`: an extension update clears session
 * storage but leaves the old version's stylesheets on open pages, and only the
 * record lets the new version take them off again. Records are kept per document
 * so a page restored from the back/forward cache can still be reconciled.
 *
 * Injected CSS belongs to a document, not a tab: a navigation drops it. So the
 * record names its document. Comparing document IDs is what tells a fresh page
 * apart from one that already has the stylesheet. Guessing that from events
 * instead (a tab update, a message from the page) let two signals for one page
 * load each insert a copy, and removeCSS takes away one copy per call, so the
 * blur could no longer be turned off until the page was reloaded.
 */
const tabKey = (tabId) => `tabcss:${tabId}`;
const LEGACY_CSS_RECOVERY_KEY = "legacySessionCssRecoveryComplete";

/** Returns the CSS records for each document in a tab. */
async function recordsFor(tabId) {
  const key = tabKey(tabId);
  const stored = await chrome.storage.local.get(key);
  const record = stored[key];
  if (record?.documents && typeof record.documents === "object") {
    return { ...record.documents };
  }
  // Read records written by the preceding single-document format.
  if (typeof record?.doc === "string" && typeof record.css === "string") {
    return { [record.doc]: record.css };
  }
  return {};
}

async function saveDocumentRecord(tabId, doc, css) {
  const records = await recordsFor(tabId);
  if (css) {
    records[doc] = css;
  } else {
    delete records[doc];
  }
  const key = tabKey(tabId);
  if (Object.keys(records).length) {
    await chrome.storage.local.set({ [key]: { documents: records } });
  } else {
    await chrome.storage.local.remove(key);
  }
}

/**
 * The ID of the document in the tab's top frame right now. A no-op script is
 * the one way to ask without the webNavigation permission; it runs in the
 * extension's isolated world and touches nothing on the page.
 */
async function currentDocument(tabId) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => 0,
    injectImmediately: true,
  });
  return result?.documentId;
}

async function forgetTab(tabId) {
  try {
    await chrome.storage.local.remove(tabKey(tabId));
  } catch {
    // Storage unavailable during teardown; nothing to do.
  }
}

/** Concatenated CSS of every enabled rule matching this URL. */
function cssForUrl(s, url) {
  if (!s.blurEnabled) return "";
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
 *
 * `documentId` is passed when the caller already knows it (a message from the
 * page carries it); otherwise it is looked up.
 */
async function applyToTab(tabId, url, documentId) {
  if (typeof tabId !== "number" || !url) return;

  const s = await settings();
  const wanted = cssForUrl(s, url);
  const records = await recordsFor(tabId);
  if (!wanted && Object.keys(records).length === 0) return;

  let doc = documentId;
  try {
    doc ??= await currentDocument(tabId);
  } catch {
    return; // no access to this tab's page; nothing can be injected either
  }
  if (!doc) return;

  const current = records[doc] ?? "";
  if (wanted === current) return;

  // Aimed at that document only, so CSS can never land on a page that
  // replaced it in the meantime without being recorded.
  const target = { tabId, documentIds: [doc] };
  let inserted = false;
  let removed = false;
  try {
    // Insert before removing, so a rule edit never opens a gap in which titles
    // would be briefly readable.
    if (wanted) {
      await chrome.scripting.insertCSS({ target, css: wanted, origin: CSS_ORIGIN });
      inserted = true;
    }
    if (current) {
      await chrome.scripting.removeCSS({ target, css: current, origin: CSS_ORIGIN });
    }
    removed = true;
    if (wanted) {
      await saveDocumentRecord(tabId, doc, wanted);
    } else {
      await saveDocumentRecord(tabId, doc, "");
    }
  } catch {
    // Undo a successful insertion so the page matches whatever the record still
    // claims; an untracked stylesheet could never be removed again.
    if (inserted) {
      try {
        await chrome.scripting.removeCSS({ target, css: wanted, origin: CSS_ORIGIN });
      } catch {
        // Tab gone or already clean; the record below stays authoritative.
      }
    }
    // The old stylesheet is confirmed gone, so only its document record must
    // be removed; other cached documents may still have their stylesheets.
    if (removed && current) {
      try {
        await saveDocumentRecord(tabId, doc, "");
      } catch {
        // Keep the record if storage is unavailable so removal can be retried.
      }
    }
    // Re-fires on the next navigation, toggle or settings change.
  }
}

/** Bring every open tab in line with the current rules. */
async function syncAllTabs() {
  const s = await settings();
  await reflectState(s.blurEnabled === true);

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
 * Browser startup ends the lifetime of the previous session's documents. Keep
 * records for the documents that are already live, including one reconciled
 * before this handler ran, and discard records from the previous session.
 */
async function pruneStaleTabRecords() {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({});
  } catch {
    return;
  }

  const liveDocuments = new Map();
  await Promise.all(tabs.map(async (tab) => {
    if (typeof tab.id !== "number" || !tab.url) return;
    try {
      const doc = await currentDocument(tab.id);
      if (doc) liveDocuments.set(tab.id, doc);
    } catch {
      // The tab may not be accessible yet; its old record is stale.
    }
  }));

  const all = await chrome.storage.local.get(null);
  const updates = {};
  const removals = [];
  for (const [key, record] of Object.entries(all)) {
    if (!key.startsWith("tabcss:")) continue;
    const tabId = Number(key.slice("tabcss:".length));
    const liveDoc = liveDocuments.get(tabId);
    const records = record?.documents && typeof record.documents === "object"
      ? record.documents
      : typeof record?.doc === "string" && typeof record.css === "string"
        ? { [record.doc]: record.css }
        : {};
    if (liveDoc && records[liveDoc]) {
      updates[key] = { documents: { [liveDoc]: records[liveDoc] } };
    } else {
      removals.push(key);
    }
  }
  if (Object.keys(updates).length) await chrome.storage.local.set(updates);
  if (removals.length) await chrome.storage.local.remove(removals);
}

/** Reload matching open pages once to clear CSS injected before local records existed. */
async function recoverLegacySessionCss(reason) {
  const { [LEGACY_CSS_RECOVERY_KEY]: complete } =
    await chrome.storage.local.get(LEGACY_CSS_RECOVERY_KEY);
  if (complete) return;

  if (reason === "update") {
    const s = await settings();
    if (s.blurEnabled) {
      try {
        const tabs = await chrome.tabs.query({});
        await Promise.all(tabs
          .filter((tab) => tab.id !== undefined && tab.url && cssForUrl(s, tab.url))
          .map(async (tab) => {
            try {
              await chrome.tabs.reload(tab.id);
            } catch {
              // A tab can close while the recovery is running.
            }
          }));
      } catch {
        return;
      }
    }
  }

  await chrome.storage.local.set({ [LEGACY_CSS_RECOVERY_KEY]: true });
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
        ? "Calendar(s) privacy blur — masking on (right-click for settings)"
        : "Calendar(s) privacy blur — masking off (right-click for settings)",
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

chrome.runtime.onInstalled.addListener((details) => {
  enqueue(async () => {
    // Persist a migration exactly once, from the one context that is guaranteed
    // to run alone. Everywhere else upgrades in memory only.
    const raw = await chrome.storage.local.get(null);
    if (!Array.isArray(raw.rules)) {
      // A fresh install gets the defaults, masking off; a v1 install keeps its
      // on/off choice. normalise() knows which is which.
      await saveSettings(normalise(raw));
    } else if ((raw.schemaVersion ?? 0) < SCHEMA_VERSION) {
      // An install that predates a built-in service picks it up here, once.
      // Pass the stored version so only services introduced after it are added.
      const storedVersion = raw.schemaVersion ?? 0;
      const normalised = normalise(raw);
      const merged = mergeMissingBuiltins(normalised, storedVersion);
      await saveSettings(merged ?? { ...normalised, schemaVersion: SCHEMA_VERSION });
    }
    invalidateCache();
    await recoverLegacySessionCss(details.reason);
    await syncDynamicContentScripts();
    await syncAllTabs();
  });
});

chrome.runtime.onStartup.addListener(() => {
  enqueue(async () => {
    await pruneStaleTabRecords();
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
    const { blurEnabled } = await chrome.storage.local.get({ blurEnabled: false });
    await chrome.storage.local.set({ blurEnabled: blurEnabled !== true });
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = changeInfo.url ?? tab?.url;
  if (!maybeCovered(url)) return;

  // No need to forget anything on `loading`: the record names its document,
  // so applyToTab sees for itself that a new page has nothing on it.
  if (!changeInfo.status && !changeInfo.url) return;

  // Acting on `loading` as well as `complete` closes the window in which titles
  // would be briefly readable while the page paints.
  enqueue(() => applyToTab(tabId, url));
});

chrome.tabs.onRemoved.addListener((tabId) => {
  enqueue(() => forgetTab(tabId));
});

/**
 * The content script reports each fresh document and each in-app route change,
 * covering what tabs.onUpdated misses: the extension being enabled while a tab
 * was already open, and SPA navigations that never surface as a tab update.
 *
 * Both are handled alike. The message names its document, and applyToTab
 * compares that with the record, so a fresh document is recognised without
 * being told and a route change keeps the record of the stylesheet it has.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if ((message?.type === "cpb:document" || message?.type === "cpb:route") && sender.tab) {
    const tabId = sender.tab.id;
    const url = sender.tab.url ?? sender.url;
    enqueue(() => applyToTab(tabId, url, sender.documentId));
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
