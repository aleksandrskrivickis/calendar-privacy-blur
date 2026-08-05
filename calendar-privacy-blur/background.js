/**
 * Calendar Privacy Blur for Outlook Web — service worker.
 *
 * Single responsibility: keep every Outlook Web calendar tab's injected CSS in
 * sync with the `blurEnabled` flag in chrome.storage.local.
 *
 * Clicking the toolbar icon only writes the flag; this file is the sole place
 * that injects. Storage is the single source of truth, which is what makes the
 * state survive browser restarts and apply to tabs opened later.
 */

const CSS_FILE = "hide-events.css";

/**
 * User-origin CSS beats author-origin `!important`. insertCSS and removeCSS
 * must agree on the origin or the removal silently does nothing.
 */
const CSS_ORIGIN = "USER";

/** Mirrors `host_permissions` in manifest.json. Keep the two in step. */
const CALENDAR_MATCHES = [
  "https://outlook.office.com/calendar/*",
  "https://outlook.office365.com/calendar/*",
  "https://outlook.live.com/calendar/*",
];

/**
 * Same three patterns as a regex, used to pre-check a URL before touching it.
 * Injecting into a tab we lack permission for would throw and log noise, so we
 * simply never ask. The trailing slash is required because the host permission
 * `…/calendar/*` does not cover a bare `…/calendar`.
 */
const CALENDAR_URL = /^https:\/\/outlook\.(?:office|office365|live)\.com\/calendar\//;

const DEFAULTS = { blurEnabled: true };

/**
 * Best-effort record of which tabs we believe already carry the stylesheet, so
 * routine events (SPA route changes, repeated `complete` ticks) do not re-inject
 * on every fire. The service worker can be torn down at any time and this map
 * goes with it; that is harmless. Chrome keys a CSS injection by its file, so a
 * duplicate insert collapses onto the same entry and one removeCSS still clears
 * it — the map is an optimisation, not a correctness requirement.
 */
const injected = new Map();

async function isEnabled() {
  const { blurEnabled } = await chrome.storage.local.get(DEFAULTS);
  return blurEnabled !== false;
}

/**
 * Serialises every reconcile. Without this, toggling twice quickly can let the
 * first run's removeCSS land after the second run's insertCSS, leaving a tab
 * unmasked while the stored state — and the badge — claim it is masked. That is
 * the one failure direction this extension must not have.
 */
let queue = Promise.resolve();
function enqueue(task) {
  // Runs the task whether the previous one settled or failed, and never leaves
  // a rejection dangling, so one bad reconcile cannot stall the chain.
  queue = queue.then(task, task).catch(() => {});
  return queue;
}

/**
 * Add or remove the stylesheet on one tab. Swallows the expected failures —
 * tab closed mid-flight, navigated away, host permission not granted — so the
 * page console stays clean.
 */
async function applyToTab(tabId, url, enabled) {
  if (typeof tabId !== "number" || !CALENDAR_URL.test(url ?? "")) return;

  const injection = {
    target: { tabId, allFrames: false },
    files: [CSS_FILE],
    origin: CSS_ORIGIN,
  };

  try {
    if (enabled) {
      if (injected.get(tabId)) return;
      await chrome.scripting.insertCSS(injection);
      injected.set(tabId, true);
    } else {
      await chrome.scripting.removeCSS(injection);
      injected.delete(tabId);
    }
  } catch {
    // Nothing actionable: re-fire on the next navigation or toggle.
    injected.delete(tabId);
  }
}

/** Bring every open calendar tab in line with the current flag. */
async function syncAllTabs(enabled) {
  const state = enabled ?? (await isEnabled());
  // Badge first, so it reflects the stored preference even if the tab query
  // below fails.
  await reflectState(state);

  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: CALENDAR_MATCHES });
  } catch {
    return;
  }
  await Promise.all(tabs.map((tab) => applyToTab(tab.id, tab.url, state)));
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
        ? "Calendar Privacy Blur — event titles hidden"
        : "Calendar Privacy Blur — event titles visible",
    });
  } catch {
    // Action API unavailable during teardown; state is re-applied on next wake.
  }
}

/* -------------------------------------------------------------------------- */
/* Wiring                                                                     */
/* -------------------------------------------------------------------------- */

chrome.runtime.onInstalled.addListener(() => {
  enqueue(async () => {
    // Seed the default without clobbering a returning user's choice on update.
    const stored = await chrome.storage.local.get("blurEnabled");
    if (typeof stored.blurEnabled !== "boolean") {
      await chrome.storage.local.set(DEFAULTS);
    }
    // Tabs already open when the extension was installed or updated.
    injected.clear();
    await syncAllTabs();
  });
});

chrome.runtime.onStartup.addListener(() => {
  enqueue(() => {
    injected.clear();
    return syncAllTabs();
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.blurEnabled) return;
  enqueue(() => syncAllTabs(changes.blurEnabled.newValue !== false));
});

/**
 * Clicking the toolbar icon flips the mask. There is no popup: `onClicked` only
 * fires when `action.default_popup` is unset.
 *
 * This writes the flag and stops. The storage listener above does the actual
 * reconcile, so icon clicks and any other future entry point all travel the
 * same path. Queued so a double-click cannot read a stale value and land on the
 * wrong state.
 */
chrome.action.onClicked.addListener(() => {
  enqueue(async () => {
    const enabled = await isEnabled();
    await chrome.storage.local.set({ blurEnabled: !enabled });
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = changeInfo.url ?? tab?.url;
  // Cheap rejection first: this fires for every tab in the browser, and reading
  // storage for each one would be wasteful. Tabs we hold no host permission for
  // report no URL at all, so they fall out here too.
  if (!CALENDAR_URL.test(url ?? "")) return;

  // A new document drops any previously injected CSS with it.
  if (changeInfo.status === "loading") injected.delete(tabId);
  if (!changeInfo.status && !changeInfo.url) return;

  // Acting on `loading` as well as `complete` closes the window in which titles
  // would be briefly readable while the page paints.
  enqueue(async () => applyToTab(tabId, url, await isEnabled()));
});

chrome.tabs.onRemoved.addListener((tabId) => {
  injected.delete(tabId);
});

/**
 * The content script reports each fresh document, covering the cases
 * tabs.onUpdated does not: extension enabled while a calendar tab was already
 * open, and in-app route changes that do not surface as a tab update.
 */
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== "cpb:sync" || !sender.tab) return;
  const tabId = sender.tab.id;
  const url = sender.tab.url ?? sender.url;
  injected.delete(tabId); // a fresh document, whatever we injected before is gone
  enqueue(async () => applyToTab(tabId, url, await isEnabled()));
  // No response: the sender does not await one.
});
