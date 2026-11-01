# Chrome Web Store assets

Images for the store listing ([LISTING.md](LISTING.md) has every field). Not part of the extension package: the release
zip is built from `src/` only.

| File | Store slot | Size |
| --- | --- | --- |
| `icon-128.png` | Store icon | 128×128 |
| `screenshots/01-google-before-after.png` | Screenshot 1 | 1280×800 |
| `screenshots/02-google-masked.png` | Screenshot 2 | 1280×800 |
| `screenshots/03-outlook-before-after.png` | Screenshot 3 | 1280×800 |
| `screenshots/04-outlook-masked.png` | Screenshot 4 | 1280×800 |
| `screenshots/05-settings.png` | Screenshot 5 | 1280×800 |
| `promo-small-440x280.png` | Small promo tile | 440×280 |
| `promo-marquee-1400x560.png` | Marquee promo tile | 1400×560 |

Every image is generated. Don't edit them by hand.

## How they are made

`mock/` holds the pages the screenshots show, all running the shipped code:

- `google.html` and `outlook.html` are dark week views with invented events
  (`events.js`). They reproduce only the structure each built-in rule targets,
  and with `?masked` they apply `buildCss()` from `src/rules.js` — the same CSS
  the extension injects. In the Outlook shot the toolbar, column headers and
  hour gutter stay readable because the shipped rule's guard leaves them alone.
- `options.html` loads the real `src/options.html` and `options.js` with
  stand-ins for the `chrome.*` calls, starting from the default settings.

`render.html` puts those pages in a dark macOS window (with the toolbar button
showing the OFF badge when blur is off), builds the before/after splits and lays
out the two promo tiles. `tools/render-assets.mjs` serves the repo on localhost
and captures each image with headless Chrome at the exact store size, as a
24-bit PNG with no alpha channel:

    node tools/render-assets.mjs

The **Render store assets** workflow runs the same script on every push to a
branch other than `main` that touches `src/`, `mock/`, `render.html` or the
script, and commits the results to that branch. A rule change, a renamed
extension or a settings-page tweak therefore shows up in the screenshots
without anyone taking new ones.
