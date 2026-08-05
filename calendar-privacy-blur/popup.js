/**
 * Calendar Privacy Blur — popup.
 *
 * Writes `blurEnabled` and nothing else. The service worker watches storage and
 * does the injecting, so there is exactly one path that can change the state and
 * the popup cannot drift out of sync with what is actually on the page.
 */

const DEFAULTS = { blurEnabled: true };

/** Mirrors `host_permissions` in manifest.json. */
const CALENDAR_MATCHES = [
  "https://outlook.office.com/calendar/*",
  "https://outlook.office365.com/calendar/*",
  "https://outlook.live.com/calendar/*",
];

const toggle = document.getElementById("blur-toggle");
const status = document.getElementById("status");
const notice = document.getElementById("notice");

function render(enabled) {
  toggle.checked = enabled;
  status.textContent = enabled
    ? "Titles are masked on your calendar"
    : "Titles are fully visible";
}

async function init() {
  const { blurEnabled } = await chrome.storage.local.get(DEFAULTS);
  render(blurEnabled !== false);

  // Querying by URL works on host permissions alone — asking for the "tabs"
  // permission just to read the active tab's URL would add a "read your
  // browsing history" warning for a one-line hint. Not worth it.
  const matching = await chrome.tabs.query({
    active: true,
    currentWindow: true,
    url: CALENDAR_MATCHES,
  });

  if (matching.length === 0) {
    notice.textContent =
      "This tab is not an Outlook Web calendar. The setting is saved and will apply when you open one.";
    notice.hidden = false;
  }
}

toggle.addEventListener("change", async () => {
  const next = toggle.checked;
  render(next);
  try {
    await chrome.storage.local.set({ blurEnabled: next });
  } catch {
    // Never leave the switch claiming a state that was not saved — on a privacy
    // control, a UI that lies is worse than one that fails visibly.
    render(!next);
    notice.textContent = "Could not save the setting. Try again.";
    notice.hidden = false;
  }
});

// Reflect changes made in another popup window or by a browser sync.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.blurEnabled) {
    render(changes.blurEnabled.newValue !== false);
  }
});

init().catch(() => {
  status.textContent = "Could not read the current setting";
});
