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

## How they were made

The screenshots are a real Google Calendar with every event title, location,
calendar name and the account avatar rewritten in the page before capture, so
nothing in them is real data. The masked versions apply the same CSS that
`buildCss()` in `src/rules.js` generates for the Google Calendar rule.

`01-before-after.png` and the promo tile are rendered from `render.html`. Serve
the repo root over HTTP, open `store/render.html#hero` or `#promo` in a
1280×800 viewport, and screenshot it. The promo tile is drawn in the centre, so
`sips -c 280 440` crops it out exactly.
