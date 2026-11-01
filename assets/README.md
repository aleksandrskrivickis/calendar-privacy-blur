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

`raw/` holds the unframed captures the screenshots are built from.

## How they were made

The raw captures are a real Google Calendar with every event title, location,
calendar name and the account avatar rewritten in the page before capture, so
nothing in them is real data. The masked versions apply the same CSS that
`buildCss()` in `src/rules.js` generates for the Google Calendar rule.

Everything in `screenshots/` and the promo tile is rendered from `render.html`,
which puts a raw capture in a dark macOS window. Serve the repo root over HTTP,
open `assets/render.html` in a 1280×800 viewport with one of these hashes, and
screenshot it:

- `#shot=02-week-masked` (any name from `raw/`)
- `#split` for the before/after image
- `#promo` for the promo tile, drawn in the centre so `sips -c 280 440` crops it
  out exactly
