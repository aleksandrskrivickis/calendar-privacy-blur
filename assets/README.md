# Chrome Web Store assets

Images for the store listing. Not part of the extension package: the release
zip is built from `src/` only.

| File | Store slot | Size |
| --- | --- | --- |
| `icon-128.png` | Store icon | 128×128 |
| `screenshots/01-before-after.png` | Screenshot 1 | 1280×800 |
| `screenshots/02-week-masked.png` | Screenshot 2 | 1280×800 |
| `screenshots/03-week-unmasked.png` | Screenshot 3 | 1280×800 |
| `screenshots/04-month-masked.png` | Screenshot 4 | 1280×800 |
| `screenshots/05-month-unmasked.png` | Screenshot 5 | 1280×800 |
| `promo-small-440x280.png` | Small promo tile | 440×280 |
| `promo-marquee-1400x560.png` | Marquee promo tile | 1400×560 |

`raw/` holds the unframed captures the screenshots are built from.

## How they were made

The raw captures are a real Google Calendar with every event title, location,
calendar name and the account avatar rewritten in the page before capture, so
nothing in them is real data. The masked versions apply the same CSS that
`buildCss()` in `src/rules.js` generates for the Google Calendar rule.

Everything except `raw/` is generated. `render.html` lays out each image (a
raw capture in a dark macOS window, the before/after split, the two promo
tiles) and `tools/render-assets.mjs` captures it with headless Chrome at the
exact store size, as a 24-bit PNG with no alpha channel:

    node tools/render-assets.mjs

The **Render store assets** workflow runs the same script on every push to a
branch other than `main` that touches `raw/`, `render.html`, the script or the
icon, and commits the results to that branch. To change a screenshot, replace
its file in `raw/` (any 1280×800 PNG) and push; to add one, add a new file there.
