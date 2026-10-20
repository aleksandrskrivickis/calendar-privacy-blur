# Calendar Privacy Blur

Masks the text of calendar events so your meeting titles stay private while you
share your screen. Icons stay visible, layout stays intact, and one click on the
toolbar icon turns it off again.

**Outlook Web and Google Calendar both work out of the box.** Other sites can be
added in **Settings** (right-click the toolbar icon → Options), where you choose
the URLs and the elements to mask.

Unofficial and not affiliated with Microsoft or Google. Their names appear here
only to describe which sites the extension works on.

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
3. Click **Load unpacked** and select this `src/` folder — the
   one containing `manifest.json`.
4. Open your calendar. Event titles should already be masked. Supported hosts
   are `outlook.cloud.microsoft`, `outlook.office.com`, `outlook.office365.com`,
   `outlook.live.com` and `calendar.google.com`.
5. Click the extension icon to toggle. There is no popup — one click flips it,
   and the change applies to every open calendar tab immediately, with no
   reload.
6. **Right-click** the icon and choose **Options** for settings.

If a calendar tab was already open *before* you loaded the extension, give it a
reload the first time. Chrome does not inject content scripts into pages that
were already open at install time.

The toolbar icon shows an **OFF** badge whenever masking is disabled, so you can
confirm the state at a glance before starting a screen share.

## Privacy

- **No network requests.** The extension has no remote code, no analytics, no
  fetch/XHR of any kind. You can confirm this in DevTools → Network while
  toggling.
- **No data collection.** The only things ever written are your on/off flag and
  your list of services, in `chrome.storage.local`. Neither leaves the browser.
- **No page reading.** The content script sends one message — "a calendar
  document is live here" — and never inspects or extracts page content.
- **Permissions.** `storage` for settings, `scripting` to add and remove the
  stylesheet, and host access limited to the four Outlook Web calendar paths
  plus `calendar.google.com`. Any other site you add in settings asks for its
  own permission at that point, and you can revoke it from `chrome://extensions`
  at any time. If you only use one of the two calendars, disable the other
  service in settings — that stops the extension acting on it, though revoking
  the host permission itself has to be done from `chrome://extensions`.
- **`https` only.** Sites you add must be `https`; the optional permission the
  extension can request covers nothing else. An `http://` pattern is rejected in
  settings with a message rather than accepted and then silently never granted.

## Settings

**Right-click the toolbar icon → Options.** From there you can:

- turn masking on or off (the same switch as left-clicking the icon);
- enable, disable, edit or remove each **service**;
- set the **URLs** a service covers, as Chrome match patterns;
- set which **elements** get masked, and which stay visible, as CSS selectors;
- add extra CSS for a service, if selectors alone are not enough.

Two things in there are worth knowing about.

**"Test on an open tab"** counts what your selectors actually hit on a live page.
Use it. A selector that matches nothing looks exactly like an extension that is
working fine, right up until someone shares their screen — that silent failure is
the main hazard of this whole design, and the test button is the antidote.

**The "unverified" badge is meant literally.** The two shipped services, Outlook
Web and Google Calendar, have both been checked against the live sites and are
marked verified. Anything you add yourself starts unverified, and editing a
verified service's URLs or selectors drops the badge — the claim belongs to the
selectors that were actually tested, not to the name on the card.

### Why selectors and not scripts

Settings take CSS selectors and CSS, never JavaScript. Masking text is a styling
problem, and every case worth covering is reachable with a selector. Running
user-supplied script would give rules direct access to page data, so scripts are
not supported. Extra CSS is available as an advanced escape hatch, and it is
rejected if it can fetch anything — `url(...)`, `image-set(...)`, `src(...)` and
`@import` are refused — so a rule still cannot send a request from your page.

## How it works

| File | Role |
| --- | --- |
| `rules.js` | The rule model: default services, CSS generation, URL matching, validation. Shared by the worker and the settings page. |
| `background.js` | Service worker. Owns all injection decisions, and flips the flag when the toolbar icon is clicked. |
| `content.js` | Tells the worker when a matching document is live. |
| `options.*` | The settings page. Writes rules; never injects anything itself. |

There is no popup: clicking the toolbar icon toggles the mask directly.
`chrome.action.onClicked` only fires when no `default_popup` is declared, so the
two are mutually exclusive. Right-clicking gives Chrome's own **Options** entry,
which is where the settings page lives.

Stylesheets are generated from the rules rather than shipped as a static file, so
there is one source of truth for the selectors. The exact CSS injected into each
tab is recorded in `chrome.storage.session` — not a plain `Map` — because the
service worker can be torn down at any moment, and `removeCSS` will only remove a
stylesheet if it is handed back the identical text. A forgotten string would mean
a stale mask that nothing can lift.

The stylesheet is applied with `chrome.scripting.insertCSS` and removed with
`removeCSS`, rather than being declared as a static `content_scripts.css` entry.
That is what makes the toggle instant: a static entry can only be undone by
reloading the page.

`chrome.storage.local` is the single source of truth. Clicking the toolbar icon
writes the flag; the service worker watches for the change and reconciles every
open calendar tab (not just the active one). The same reconcile runs on install,
on browser startup, and on tab navigation, which is what makes the setting persist
across restarts and apply automatically to newly opened tabs.

The CSS is injected with `origin: "USER"`. User-origin `!important` declarations
outrank author-origin ones, so Outlook's own styles cannot beat the mask. This is
a deliberate trade: if the mask ever fails, it should fail *loudly* (the toggle
appears stuck) rather than silently leaving a title readable on a shared screen.

## Known limitations

**Google Calendar** is masked via `[role="main"] [data-eventchip]`. Verified live:
40/40 chips in week view, 162/162 in month view (111 timed and 51 all-day or
multi-day), no app chrome touched, and all 115 icon paths still painted. It
needs no denylist — `data-eventchip` matched exactly the event chips with no
false positives, and `[role="main"]` keeps it clear of the sidebar
mini-calendar, which is a second `role="grid"` on the page.

Unlike Outlook, Google marks timed and all-day events with the *same* attribute,
so one selector covers both and the all-day trap described below does not exist
there.

One thing to preserve if you edit the keep-visible rules: Google draws icons as
a mix of filled and outline paths, and 58 of them in a month view carry
`fill="none"`. The generated CSS restores `color` but deliberately never
declares `fill` — a `fill: currentColor !important` would override those and
turn outline icons into solid blocks.

**The Outlook selector depends on Outlook Web's DOM, which Microsoft can change
without notice.** This is the part most likely to need maintenance.

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
descending from an app-chrome role. Both lists are in the `outlook-web` preset at
the top of `rules.js`, and are editable per service in settings.

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
masking stops, check the address bar first.

Since v1.1.0 you can fix this yourself without touching code: open settings, add
the new domain to the Outlook service's URL list, and click **Grant access**. To
make it a shipped default instead, add it to `host_permissions` *and*
`content_scripts.matches` in `manifest.json`, and to the `outlook-web` preset's
`matches` in `rules.js`.

Other limitations:

- **Hover cards and the reading pane are not masked.** Hovering or opening an
  event still reveals its full details. The mask covers the calendar grid only.
- **Browser vs. Outlook theme.** The smudge and icon colours follow the
  *browser's* light/dark setting via `CanvasText`. If you run Outlook's dark
  theme inside a light-scheme browser, override `--cpb-icon-color` and
  `--cpb-smudge-color` in a service's **Extra CSS**, or change the `APPEARANCE`
  block in `rules.js`.
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
