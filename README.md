<p align="center">
  <img src="assets/promo-marquee-1400x560.png" alt="Calendar(s) privacy blur: share your screen, not your schedule" width="100%">
</p>

# Calendar(s) privacy blur

A Manifest V3 Chrome extension that blurs calendar event titles with one click
on the toolbar, so you can share your screen without sharing your schedule.
Google Calendar and Outlook on the web work out of the box; any other web
calendar can be added in Settings.

Grown out of [a DevTools console snippet][gist] that made event text transparent;
this repo turns it into a loadable extension with a real on/off toggle, scoped
selectors that leave the rest of the calendar UI alone, and no network access.

Unofficial, not affiliated with Microsoft or Google.

**Website:** https://aleksandrskrivickis.github.io/calendar-privacy-blur/ (with a
live demo and the [privacy policy](https://aleksandrskrivickis.github.io/calendar-privacy-blur/privacy.html)).

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/01-google-before-after.png" alt="Google Calendar, blur off on the left and on on the right"></td>
    <td width="50%"><img src="assets/screenshots/03-outlook-before-after.png" alt="Outlook on the web, blur off on the left and on on the right"></td>
  </tr>
  <tr>
    <td align="center"><sub>Google Calendar</sub></td>
    <td align="center"><sub>Outlook on the web</sub></td>
  </tr>
</table>

```
src/      the extension — load this folder unpacked
assets/   Chrome Web Store images, rendered from mock calendars by CI
site/     the GitHub Pages site: home page with a live demo, privacy policy
tools/    icon generator, asset and site builders, store publisher, selector fixture
```

**→ [src/README.md](src/README.md)** for what it does, how to load it in
`chrome://extensions`, and the known limitations.

**→ [assets/LISTING.md](assets/LISTING.md)** for the Chrome Web Store listing:
every field, the description and the images.

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
`src/manifest.json`, commits it, and publishes a release with two zips attached:
the extension package, and the store assets
([`assets/LISTING.md`](assets/LISTING.md) with every image it shows). Then it
uploads the package to the Chrome Web Store and submits it for review.

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

### Publishing to the Chrome Web Store

The last step of `release.yml` runs
[`tools/publish-store.mjs`](tools/publish-store.mjs), which uses the
[Chrome Web Store API](https://developer.chrome.com/docs/webstore/using-api) v2
to upload the release zip to the existing listing and submit it for review. The
update goes live once review approves it. Without credentials the step is
skipped with a notice, and the release is still made.

One-time setup:

1. In [Google Cloud](https://console.cloud.google.com/), create a project,
   enable the **Chrome Web Store API**, set up the OAuth consent screen
   (External, add yourself as a test user), and create an OAuth client of type
   **Web application** with `https://developers.google.com/oauthplayground` as
   a redirect URI.
2. In the [OAuth Playground](https://developers.google.com/oauthplayground),
   under the gear icon, tick "Use your own OAuth credentials" and enter the
   client's ID and secret. Authorise the scope
   `https://www.googleapis.com/auth/chromewebstore` with the account that owns
   the listing, then exchange the code for tokens and copy the refresh token.
   Publish the consent screen to production first if you can: a refresh token
   issued while it is in testing expires after seven days.
3. Add them to the repo, under Settings → Secrets and variables → Actions:

   | Name | Kind | Value |
   | --- | --- | --- |
   | `CWS_CLIENT_ID` | secret | the OAuth client ID |
   | `CWS_CLIENT_SECRET` | secret | the OAuth client secret |
   | `CWS_REFRESH_TOKEN` | secret | the refresh token |
   | `CWS_PUBLISHER_ID` | variable | Developer Dashboard → Publisher → Settings → Publisher ID |
   | `CWS_EXTENSION_ID` | variable | optional; defaults to `epkaeencnloknpgpkajkjiiebllmhanb` |

To check the listing's status, or to publish a release zip by hand with the same
credentials in your environment:

```bash
node tools/publish-store.mjs --status
```

```bash
node tools/publish-store.mjs dist/calendar-privacy-blur-<version>.zip
```

### Store assets

The store images are generated from mock calendars running the shipped code,
and [`render-assets.yml`](.github/workflows/render-assets.yml) commits fresh
ones to any branch whose push touches `src/` or the mocks. To render locally:

```bash
node tools/render-assets.mjs
```

See [assets/README.md](assets/README.md) for how the mocks work.

### Website

[`pages.yml`](.github/workflows/pages.yml) deploys the site to GitHub Pages on
every push to `main` that touches `site/`, `assets/`, the rules or the icons.
It builds `_site/` from `site/` plus the calendar mocks and store images, so
the home page's demo runs the shipped rules from `src/rules.js`. To look at it
locally:

```bash
node tools/build-site.mjs && python3 -m http.server -d _site
```

The `google*.html` file at the repo root is the Search Console verification
for the site; the build copies it to the site root.

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
