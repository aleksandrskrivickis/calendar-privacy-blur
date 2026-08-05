# Calendar Privacy Blur for Outlook Web

Masks the text of calendar events on Outlook Web so your meeting titles stay
private while you share your screen. Icons stay visible, layout stays intact,
and one click in the toolbar popup turns it off again.

Unofficial and not affiliated with Microsoft. "Outlook" appears here only to
describe which site the extension works on.

## What it does

Screen-sharing a calendar leaks more than people expect: client names,
candidate interviews, "1:1 — performance review", the medical appointment at
3pm. Closing the calendar works but loses your view of the day.

This extension makes the *text* inside calendar event chips transparent and
leaves a soft smudge in its place, so:

- The grid, the chips, their colours and their positions all stay put — you can
  still see *that* you are busy, and when.
- Icons (recurring, private, response status) stay visible.
- Nothing is removed from the page: clicking, dragging and creating events all
  behave normally, and the accessible name is untouched, so screen readers still
  announce the real title.
- App chrome — "New event", the date arrows, the Day/Week/Month switcher, the
  calendar list — is never touched.

It is a visual mask, not encryption. Anyone with access to the machine can
switch it off or read the underlying page.

## Install for local testing

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this `calendar-privacy-blur/` folder — the
   one containing `manifest.json`.
4. Open your Outlook Web calendar. Event titles should already be masked.
   Supported hosts are `outlook.cloud.microsoft`, `outlook.office.com`,
   `outlook.office365.com` and `outlook.live.com`.
5. Click the extension icon to toggle. There is no popup — one click flips it,
   and the change applies to every open calendar tab immediately, with no
   reload.

If a calendar tab was already open *before* you loaded the extension, give it a
reload the first time. Chrome does not inject content scripts into pages that
were already open at install time.

The toolbar icon shows an **OFF** badge whenever masking is disabled, so you can
confirm the state at a glance before starting a screen share.

## Privacy

- **No network requests.** The extension has no remote code, no analytics, no
  fetch/XHR of any kind. You can confirm this in DevTools → Network while
  toggling.
- **No data collection.** The only thing ever written is a single boolean,
  `blurEnabled`, in `chrome.storage.local`. It never leaves the browser.
- **No page reading.** The content script sends one message — "a calendar
  document is live here" — and never inspects or extracts page content.
- **Permissions.** `storage` for the toggle, `scripting` to add and remove the
  stylesheet, and host access limited to the four Outlook Web calendar paths.
  Chrome shows no warnings beyond those hosts.

## How it works

| File | Role |
| --- | --- |
| `hide-events.css` | The mask. Never injected statically — see below. |
| `background.js` | Service worker. Owns all injection decisions, and flips the flag when the toolbar icon is clicked. |
| `content.js` | Tells the worker when a calendar document is live. |

There is no popup: clicking the toolbar icon toggles the mask directly.
`chrome.action.onClicked` only fires when no `default_popup` is declared, so the
two are mutually exclusive.

The stylesheet is applied with `chrome.scripting.insertCSS` and removed with
`removeCSS`, rather than being declared as a static `content_scripts.css` entry.
That is what makes the toggle instant: a static entry can only be undone by
reloading the page.

`chrome.storage.local` is the single source of truth. The popup writes the flag;
the service worker watches for the change and reconciles every open calendar tab
(not just the active one). The same reconcile runs on install, on browser
startup, and on tab navigation, which is what makes the setting persist across
restarts and apply automatically to newly opened tabs.

The CSS is injected with `origin: "USER"`. User-origin `!important` declarations
outrank author-origin ones, so Outlook's own styles cannot beat the mask. This is
a deliberate trade: if the mask ever fails, it should fail *loudly* (the toggle
appears stuck) rather than silently leaving a title readable on a shared screen.

## Known limitations

**The selector depends on Outlook Web's DOM, which Microsoft can change without
notice.** This is the part most likely to need maintenance.

It has been verified against live Outlook Web (`outlook.office.com`, work-week
view): 35/35 event chips masked, 59/59 icons still visible, the Ribbon and the
navigation toolbar untouched. In practice the `data-app-section` hook is what
does the work — Outlook's single `role="grid"` sits *outside* `[role="main"]`,
so that branch of the allowlist is dead weight kept only as a fallback.

**If you tighten the scope, verify against `[data-calitemid]`, not against
timestamps in the label.** All-day events live in a section called
`calendar-view-header-0`. Excluding "header" sections looks obviously correct and
drops exactly the chips with no clock time in their label — but those chips *are*
the all-day events, and you will have silently unmasked "PTO" and
"Interview: &lt;name&gt;" while everything still looks fine.

Outlook reuses `role="button"` for nearly every control in the app, so the mask
cannot simply target `[role="button"][aria-label]` the way the original console
snippet did — that blanks the whole UI. Instead it requires an event to sit
inside a calendar *data surface* (`grid`, `table`, `listbox`, or a container
whose `data-app-section` names it as calendar content) and excludes anything
descending from an app-chrome role. Both lists are in the tuning block at the top
of `hide-events.css`.

If a future Outlook update breaks it, the two symptoms and their fixes are:

- **Titles are no longer masked** — the calendar surface no longer matches the
  allowlist. Inspect an event chip in DevTools, walk up to its nearest container,
  and add that container to the allowlist.
- **Something outside the calendar got blanked** (the mini date picker is the
  most likely candidate, since it is itself a grid) — add its container's role or
  attribute to the denylist.

To check the scope against a live calendar, paste this into the DevTools console
on the calendar page. It counts the event chips the stylesheet would catch —
zero means the allowlist has drifted and needs the fix above:

```js
document.querySelectorAll(
  ':is([data-app-section*="calendar" i], [role="main"] :is([role="grid"],[role="table"],table,[role="listbox"])) :is([role="button"],[role="option"])[aria-label]'
).length;
```

`tools/selector-fixture.html` in the repo root reproduces the relevant ARIA
structure and asserts which elements should and should not be masked. Serve the
repo over `http://` and open it to re-check a selector change without needing an
Outlook account.

**The host list is the other silent failure mode, and it bites harder than the
selector.** Microsoft is migrating Outlook Web to `outlook.cloud.microsoft`;
`outlook.office.com` now redirects there for migrated accounts. A host that is
not in `host_permissions` gets no injection at all, so the mask just stops
working — with no error anywhere, because the extension is never invoked. If
masking stops, check the address bar first: if the domain is not one of the four
listed above, add it to `host_permissions` *and* `content_scripts.matches` in
`manifest.json`, and to `CALENDAR_MATCHES` / `CALENDAR_URL` in `background.js`.

Other limitations:

- **Hover cards and the reading pane are not masked.** Hovering or opening an
  event still reveals its full details. The mask covers the calendar grid only.
- **Browser vs. Outlook theme.** The smudge and icon colours follow the
  *browser's* light/dark setting via `CanvasText`. If you run Outlook's dark
  theme inside a light-scheme browser, set `--cpb-icon-color` and
  `--cpb-smudge-color` explicitly at the top of `hide-events.css`.
- **Text is masked, not deleted.** It remains in the DOM and can be selected and
  copied. This protects against onlookers, not against someone at the keyboard.

## Follow-ups

- **Chrome Web Store submission** is deliberately out of scope here: listing
  copy, screenshots, a privacy-policy URL and a paid developer account are all
  still to do. Test locally first.
- **Firefox / Edge Add-ons** compatibility is untested. The code is close to
  portable, but MV3 background-script differences will need work.

## License

GPL-3.0 — see [LICENSE](../LICENSE) in the repository root.
