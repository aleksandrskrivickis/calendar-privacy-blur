# calendar-privacy-blur

A Manifest V3 Chrome extension that masks calendar event titles on Outlook Web,
so meeting names stay private while you share your screen.

Grown out of [a DevTools console snippet][gist] that made event text transparent;
this repo turns it into a loadable extension with a real on/off toggle, a scoped
selector that leaves the rest of the Outlook UI alone, and no network access.

Outlook Web and Google Calendar both work out of the box. Right-click the
toolbar icon → **Options** to
add other sites, choosing the URLs and the CSS selectors to mask.

Unofficial, not affiliated with Microsoft.

```
src/     the extension — load this folder unpacked
tools/   icon generator and the selector test fixture
```

**→ [src/README.md](src/README.md)** for what
it does, how to load it in `chrome://extensions`, and the known limitations.

## Working on it

### Branch naming

```
<prefix>/<NNN>-<kebab-description>
```

| Prefix | For |
| --- | --- |
| `feature/` | new user-facing capability |
| `docs/` | documentation only |
| `refactor/` | internal restructuring, no behaviour change |
| `issue/` | actual issue that can be also tracked by GitHub issue |

`NNN` is zero-padded and increments across the whole repo regardless of prefix,
so branches sort in the order they were started. For `issue/`, use the issue
number instead of the sequence. Keep the description to four words or fewer.

```
feature/001-google-calendar-support
issue/42-all-day-events-unmasked
```

Take the next number from the [closed pull requests](../../pulls?q=is:pr+is:closed)
— each merged branch's number is recorded there. Branches created before this
convention keep their names and don't count toward the sequence.

### Versioning and releases

One workflow, [`release.yml`](.github/workflows/release.yml). When a change
lands on `main` that touches `src/`, it bumps the patch version in
`src/manifest.json`, commits it, and publishes a release with the store zip
attached.

Chrome refuses an upload that reuses a version, and `chrome://extensions` shows
the version of an unpacked build — so a distinct version per shipped change makes
"which build am I actually running?" answerable at a glance.

It runs on `main` rather than in the pull request, which keeps it serialised:
two merges cannot land on the same version, so nothing has to guard against
duplicates. Changes touching only docs or `tools/` don't bump, since they
don't ship in the extension. Its own commit is marked `[skip release]`.

If a run fails partway — version pushed but no release — re-run it from the
Actions tab. The bump will advance again, which costs nothing but a version
number.

To preview a bump locally without changing anything:

```bash
node tools/bump-version.mjs --dry-run
```

### Icons

Regenerate the icons after changing the mark:

```bash
node tools/make-icons.mjs
```

Check the CSS selector against a browser engine without needing an Outlook
account — serve the repo over HTTP and open `tools/selector-fixture.html`. It
reproduces Outlook's ARIA structure and asserts which elements the stylesheet
must mask and which it must leave alone. The stylesheet it tests is generated
from `src/rules.js`, so the fixture always checks what the extension would
actually inject.

## Publishing to the Chrome Web Store

Two constraints are baked into the code rather than left to the listing.

**The extension is named "Calendar Privacy Blur", with no other company's
product in it.** Store policy prohibits branding that implies affiliation or
endorsement. Outlook and Google Calendar are named in the description and in
this repo, where the use is plainly descriptive — but not in the name.

**Optional host access is `https` only.** Supporting user-added sites needs a
broad optional permission, and broad permissions get a deeper review. Dropping
`http` halves that surface for a capability nobody was using: calendars worth
masking are served over TLS. Settings rejects an `http://` pattern outright
rather than accepting one that could never be granted.

Paste-ready answers for the dashboard's **Privacy practices** tab:

> **Single purpose.** Visually masks calendar event titles on calendar websites
> so they cannot be read by onlookers during screen sharing.

| Permission | Justification |
| --- | --- |
| `storage` | Stores the on/off toggle and the user's list of configured sites locally. Nothing is transmitted. |
| `scripting` | Injects and removes the CSS that masks event text, so the toggle applies without a page reload. |
| Host permissions | Applies the mask on the calendar sites the extension supports out of the box. |
| Optional `https` hosts | Requested only when a user adds their own site in settings, granted per-site by the user, and revocable from `chrome://extensions`. |

Data disclosures are straightforward: the extension collects nothing, makes no
network requests, and contains no remote code. Searches of `src/` find no calls
to `fetch`, `XMLHttpRequest` or `eval`, and no assignments to `innerHTML`.

## License

GPL-3.0 — see [LICENSE](LICENSE).

[gist]: https://gist.github.com/aleksandrskrivickis/358af3da86d1ca413ff73cb54680fe6b
