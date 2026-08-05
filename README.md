# calendar-privacy-blur

A Manifest V3 Chrome extension that masks calendar event titles on Outlook Web,
so meeting names stay private while you share your screen.

Grown out of [a DevTools console snippet][gist] that made event text transparent;
this repo turns it into a loadable extension with a real on/off toggle, a scoped
selector that leaves the rest of the Outlook UI alone, and no network access.

Unofficial, not affiliated with Microsoft.

```
src/     the extension — load this folder unpacked
tools/   icon generator and the selector test fixture
```

**→ [src/README.md](src/README.md)** for what
it does, how to load it in `chrome://extensions`, and the known limitations.

## Working on it

Regenerate the icons after changing the mark:

```bash
node tools/make-icons.mjs
```

Check the CSS selector against a browser engine without needing an Outlook
account — serve the repo over HTTP and open `tools/selector-fixture.html`. It
reproduces Outlook's ARIA structure and asserts which elements the stylesheet
must mask and which it must leave alone.

## License

GPL-3.0 — see [LICENSE](LICENSE).

[gist]: https://gist.github.com/aleksandrskrivickis/358af3da86d1ca413ff73cb54680fe6b
