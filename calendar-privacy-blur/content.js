/**
 * Calendar Privacy Blur for Outlook Web — page-side beacon.
 *
 * This is the whole content script. It injects nothing and reads nothing from
 * the page; it just tells the service worker "a calendar document is live
* here, sync it". That covers SPA navigations that chrome.tabs.onUpdated can miss:
*
*   Outlook is a single-page app — moving from Mail to Calendar, or between
*   calendar views, can swap the whole surface without a tab-level update.
*
 *      calendar views, can swap the whole surface without a tab-level update.
 *
 * The service worker owns the actual insertCSS/removeCSS decision, so this file
 * needs no knowledge of the toggle state.
 *
 * Runs at `document_start`: the earlier the worker hears about the document, the
 * smaller the window in which titles could paint before the mask lands.
 */

const sync = () => {
  // Rejects when no service worker is listening (e.g. mid-update). Nothing to
  // do about it, and an unhandled rejection would show up in the page console.
  chrome.runtime.sendMessage({ type: "cpb:sync" }).catch(() => {});
};

sync();

if (window.navigation) {
  // Navigation API: fires for the SPA's own history transitions.
  window.navigation.addEventListener("navigate", sync);
} else {
  window.addEventListener("popstate", sync);
}
