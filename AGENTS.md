# AGENTS.md

Instructions for AI coding agents working in this repository. Humans want
[README.md](README.md) instead.

## What this is

A Manifest V3 Chrome extension that masks calendar event titles so they cannot
be read over someone's shoulder during a screen share. It ships with two
services — Outlook Web and Google Calendar — and users can add their own sites
in settings.

```
src/     the extension; the only thing that ships
tools/   icon generator, version bumper, selector test fixture
```

## Invariants

Break any of these and the change is wrong, however well it tests.

**No network, no code execution.** `src/` contains no `fetch`, `XMLHttpRequest`,
`WebSocket`, `sendBeacon`, `eval`, `new Function` or `innerHTML`, and must not
gain any. The extension's whole claim is that it looks at pages and never talks
about them. Grep before you finish.

**Settings take CSS, never JavaScript.** Masking is a styling problem. Rules are
CSS selectors plus optional extra CSS, and that extra CSS is rejected if it can
fetch anything (`url()`, `image-set()`, `src()`, `@import`). Do not add a way to
run user script.

**Match patterns are `https` only.** The manifest's optional host permission
covers nothing else, so accepting an `http://` pattern would validate and then
never be grantable — a site added, no error, no masking.

**The extension name carries no other company's product.** It is
`Calendar Privacy Blur`. Chrome Web Store policy prohibits a name implying
affiliation. Outlook and Google Calendar may be named in the description and
docs, where the use is descriptive.

**Never hand-edit `version` in `src/manifest.json`.** `.github/workflows/release.yml`
owns it: any change landing on `main` that touches `src/` bumps the patch
version, commits it, and publishes a release with the store zip attached.

## Verifying a change

`tools/selector-fixture.html` reproduces the ARIA and `data-app-section`
structure of both shipped services and asserts which elements get masked and
which must not — 34 assertions, no account needed. Serve the repo over HTTP and
open it; results land on `window.__cpbResults`. The CSS it tests is generated
from `src/rules.js`, so it always checks what would actually be injected.

For live checks, extract only structure — roles, tags, attribute names. Never
read event titles out of someone's calendar.

## Traps that have already cost time

**Outlook all-day events live in `calendar-view-header-0`.** Excluding sections
whose name contains "header" looks obviously correct and drops exactly the chips
with no clock time in their `aria-label` — but those chips *are* the all-day
events. You will have silently unmasked "PTO" and "Interview: &lt;name&gt;".
Verify against `[data-calitemid]`, never against timestamps in the label.

**The keep-visible rule must never declare `fill`.** Restoring `color` is
sufficient: an icon painted with `fill="currentColor"` follows it. Declaring
`fill: currentColor !important` also overrides `fill="none"`, and Google draws
58 outline paths that way in a month view — they turn into solid blocks.

**`data-app-section` does the work on Outlook.** The
`[role="main"] [role="grid"]` branch of the allowlist matches nothing live,
because Outlook's single `role="grid"` sits outside `[role="main"]`. It is a
fallback, not the mechanism.

**A missing host is a total, silent failure.** A host absent from
`host_permissions` gets no injection at all — no console error, nothing in
`chrome://extensions`, because the extension is never invoked. When masking
stops working, check the address bar before suspecting the selector. Microsoft's
migration to `outlook.cloud.microsoft` broke this exactly once already.

**A selector matching nothing looks identical to working software**, right up
until someone shares their screen. Prefer failures that are loud.

## Conventions

Branches are `<prefix>/<NNN>-<kebab-description>`, with prefixes `feature/`,
`docs/`, `refactor/` and `issue/` — no others. `NNN` is zero-padded and
increments across the repo; for `issue/`, use the GitHub issue number. Take the
next number from the repo's closed pull requests.

Commit messages explain why, not what — the diff covers what. Match the
surrounding prose style in comments and docs: full sentences, no bullet-point
shorthand, and say what a reader would otherwise have to rediscover.
