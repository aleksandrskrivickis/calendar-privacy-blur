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
| `fix/` | bug fix |
| `chore/` | tooling, CI, dependencies — nothing user-facing |
| `docs/` | documentation only |
| `refactor/` | internal restructuring, no behaviour change |
| `issue/` | work tracked by a GitHub issue |

`NNN` is zero-padded and increments across the whole repo regardless of prefix,
so branches sort in the order they were started. For `issue/`, use the issue
number instead of the sequence. Keep the description to four words or fewer.

```
feature/001-google-calendar-support
fix/002-cloud-microsoft-host
issue/42-all-day-events-unmasked
```

Take the next number from `git branch -a`. Branches created before this
convention keep their names and don't count toward the sequence.

### Automatic version bumping

Handled by GitHub Actions — see
[`.github/workflows/bump-version.yml`](.github/workflows/bump-version.yml).
**Nothing to install or configure locally.**

When a change lands on `main` that touches `src/`, the workflow bumps the patch
version in `src/manifest.json` and pushes that back to `main`. Chrome refuses an
upload that reuses a version, and `chrome://extensions` shows the version of an
unpacked build — so a distinct version per shipped change makes "which build am
I actually running?" answerable at a glance.

What it does *not* do:

- Changes touching only docs or `tools/` don't bump — they don't ship in the
  extension.
- A version already changed by hand in the same push is left alone.
- Its own commit is marked `[skip bump]`, so it cannot loop. (The push uses the
  default `GITHUB_TOKEN`, and GitHub does not start new workflow runs from those
  events, so the marker is only insurance against someone swapping in a PAT.)

To preview a bump locally without changing anything:

```bash
node tools/bump-version.mjs --dry-run
```

**If `main` is a protected branch**, the workflow's push will be rejected and the
run will fail with an explicit error rather than quietly doing nothing. Either
allow `github-actions[bot]` to bypass the protection, or switch the trigger to
`pull_request` and push to `github.head_ref` so the bump travels in the PR
instead. Note that with the `pull_request` approach two PRs open at once both
bump from the same base and collide on merge; bumping on `main` serialises
naturally, which is why it is the default here.

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

## License

GPL-3.0 — see [LICENSE](LICENSE).

[gist]: https://gist.github.com/aleksandrskrivickis/358af3da86d1ca413ff73cb54680fe6b
