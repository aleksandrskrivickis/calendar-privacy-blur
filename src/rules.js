/**
 * Calendar Privacy Blur — rule model, shared by the service worker and the
 * settings page.
 *
 * A *rule* (called a "service" in the UI) is the whole configuration surface:
 * which URLs it covers, which elements get masked there, and which elements
 * stay visible. Everything the extension does on a page is derived from rules,
 * so this file is the single source of truth for both the defaults and the CSS
 * that gets generated from them.
 *
 * There is deliberately no user-supplied JavaScript here. See README.md
 * ("Why selectors and not scripts") — masking is a styling problem, and running
 * arbitrary user code would forfeit the extension's no-code-execution property
 * for no gain in what it can hide.
 */

/**
 * Bumped whenever a new built-in service ships, so an existing install picks it
 * up exactly once. See `mergeMissingBuiltins`.
 *   2 — rules replaced the single `blurEnabled` flag
 *   3 — Google Calendar added as a built-in
 */
export const SCHEMA_VERSION = 3;

/**
 * Appearance of the mask. Not user-configurable: these are the values verified
 * against live Outlook, and exposing them would add a settings surface nobody
 * asked for. Change them here if you want a different look.
 */
const APPEARANCE = `:root {
  --cpb-smudge-color: CanvasText;
  --cpb-smudge-radius: 7px;
  --cpb-smudge-strength: 45%;
  --cpb-icon-color: CanvasText;
}`;

/* -------------------------------------------------------------------------- */
/* Built-in services                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The Outlook Web selector, verified live: 35/35 event chips masked, 59/59
 * icons still visible, Ribbon and navigation toolbar untouched.
 *
 * It is bounded twice over, because Outlook reuses `role="button"` for nearly
 * every control in the app — New event, the date arrows, the view switcher, the
 * calendar list. Unscoped, a mask blanks the whole UI.
 *
 *   ALLOWLIST — the event must sit inside a calendar data surface. In practice
 *   `data-app-section` does all the work; the `[role="main"] [role="grid"]`
 *   branch matched *nothing* live, because Outlook's single `role="grid"` sits
 *   outside `[role="main"]`. It is kept only as a fallback.
 *
 *   DENYLIST — `:not(:is(…) *)`, "not a descendant of app chrome". Protects
 *   toolbars and, importantly, `columnheader`/`rowheader`: the day-of-week
 *   headers and hour gutter carry aria-labels too, and blanking them makes the
 *   calendar unreadable without hiding anything private.
 *
 * DO NOT narrow this by excluding sections whose name contains "header".
 * All-day events live in `calendar-view-header-0`. Filtering "header" out looks
 * obviously correct and drops exactly the chips with no clock time in their
 * label — but those chips *are* the all-day events, so it silently unmasks
 * "PTO" and "Interview: <name>". Verify against `[data-calitemid]` instead.
 */
const OUTLOOK_SCOPE =
  ':is([data-app-section*="calendar" i], [role="main"] :is([role="grid"], [role="table"], table, [role="listbox"]))';
const OUTLOOK_TARGET = ':is([role="button"], [role="option"])[aria-label]';
const OUTLOOK_GUARD =
  ':not(:is([role="toolbar"], [role="menubar"], [role="menu"], [role="tablist"], [role="navigation"], [role="banner"], [role="complementary"], [role="search"], [role="dialog"], [role="tree"], [role="columnheader"], [role="rowheader"]) *)';

/**
 * Templates offered by the "Add service" button. `verified` is honest about
 * whether the selectors have actually been checked against the live site — an
 * unverified template that silently matches nothing is the worst failure mode
 * this extension has, so the UI labels it rather than pretending.
 */
export const PRESETS = [
  {
    id: "outlook-web",
    name: "Outlook Web calendar",
    verified: true,
    builtin: true,
    introducedIn: 2, // schema version when this preset was first shipped
    matches: [
      "https://outlook.cloud.microsoft/calendar/*",
      "https://outlook.office.com/calendar/*",
      "https://outlook.office365.com/calendar/*",
      "https://outlook.live.com/calendar/*",
    ],
    mask: [`${OUTLOOK_SCOPE} ${OUTLOOK_TARGET}${OUTLOOK_GUARD}`],
    keepVisible: ["i", "svg", "svg *", "[data-icon-name]", '[class*="ms-Icon"]'],
    extraCss: "",
  },
  /**
   * Verified live against calendar.google.com: week view 40/40 chips masked,
   * month view 162/162 (111 timed and 51 all-day or multi-day), 0 app-chrome
   * elements touched, and all 115 icon paths still painted.
   *
   * `data-eventchip` does all the work and needs no denylist. Unlike Outlook,
   * Google marks timed and all-day events with the same attribute, so one
   * selector covers both — the all-day trap that Outlook has does not exist
   * here. Nothing else on the page carries the attribute: it matched exactly
   * the chips, with no false positives in either view.
   *
   * `[role="main"]` scopes it away from the sidebar mini-calendar, which is a
   * second `role="grid"` on the page, and from event detail popups.
   *
   * `svg *` is in keepVisible so inner paths get their colour back; see the
   * note in buildCss for why the rule must not touch `fill`.
   */
  {
    id: "google-calendar",
    name: "Google Calendar",
    verified: true,
    builtin: true,
    introducedIn: 3, // schema version when this preset was first shipped
    matches: ["https://calendar.google.com/*"],
    mask: ['[role="main"] [data-eventchip]'],
    keepVisible: ["i", "svg", "svg *", "img"],
    extraCss: "",
  },
  {
    id: "blank",
    name: "Custom site",
    verified: false,
    builtin: false,
    matches: [],
    mask: [],
    keepVisible: ["i", "svg", "svg *"],
    extraCss: "",
  },
];

/**
 * The shipped configuration: every built-in service on.
 *
 * A service is built in when its selectors have been verified against the live
 * site *and* its hosts are declared in the manifest, so it works on install
 * with no permission prompt. Templates that are neither stay in PRESETS for the
 * "Add service" picker.
 */
export function defaultSettings() {
  return {
    schemaVersion: SCHEMA_VERSION,
    blurEnabled: true,
    rules: PRESETS.filter((p) => p.builtin).map((p) => ({
      ...structuredClone(p),
      enabled: true,
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* CSS generation                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Turn one rule into a stylesheet.
 *
 * `color: transparent` rather than `filter: blur()` or `display: none`: layout,
 * chip colours, drag targets and click behaviour are all preserved, and the
 * accessible name stays intact for screen readers. Only the pixels go away.
 *
 * The mask needs two selectors — the element and its descendants — because
 * although `color` inherits, sites set explicit colours on inner spans that
 * would otherwise win. `-webkit-text-fill-color` rides along because it beats
 * `color` wherever a page uses it.
 *
 * The keep-visible rule needs an *explicit* colour, not `inherit`. `inherit`
 * resolves to the parent's computed colour, which the mask just made
 * transparent, so icons would vanish along with the text.
 *
 * It deliberately says nothing about `fill`. Restoring `color` is enough: an
 * icon painted with `fill="currentColor"` follows it, and one with its own
 * colour was never affected. Declaring `fill: currentColor !important` here
 * looks equivalent but is not — it also overrides `fill="none"`, and outline
 * icons drawn as unfilled paths turn into solid blobs. Google Calendar has 58
 * such paths in a month view; Outlook has none, which is why this only surfaced
 * when a second service was added.
 */
export function buildCss(rule) {
  const mask = (rule.mask ?? []).map((s) => s.trim()).filter(Boolean);
  if (mask.length === 0) return "";

  const keep = (rule.keepVisible ?? []).map((s) => s.trim()).filter(Boolean);
  const self = mask.join(",\n");
  const descendants = mask.map((s) => `:is(${s}) *`).join(",\n");

  const blocks = [
    `/* ${rule.name || rule.id} */`,
    APPEARANCE,
    `${self},
${descendants} {
  color: transparent !important;
  -webkit-text-fill-color: transparent !important;
  text-shadow: 0 0 var(--cpb-smudge-radius)
    color-mix(in srgb, var(--cpb-smudge-color) var(--cpb-smudge-strength), transparent) !important;
}`,
  ];

  if (keep.length > 0) {
    const keepSel = mask.map((s) => `${s} :is(${keep.join(", ")})`).join(",\n");
    blocks.push(`${keepSel} {
  color: var(--cpb-icon-color) !important;
  -webkit-text-fill-color: var(--cpb-icon-color) !important;
  text-shadow: none !important;
}`);
  }

  // Images are not text and are left alone, but their alt text would otherwise
  // inherit the smudge.
  blocks.push(`${mask.map((s) => `${s} img`).join(",\n")} {
  text-shadow: none !important;
}`);

  const extra = (rule.extraCss ?? "").trim();
  if (extra && !extraCssError(extra)) blocks.push(extra);

  return blocks.join("\n\n");
}

/* -------------------------------------------------------------------------- */
/* Extra CSS safety                                                           */
/* -------------------------------------------------------------------------- */

/** Declarations that make the browser fetch something. */
const RESOURCE_CSS_RE =
  /@import\b|(?:^|[^\w-])(?:url|src|image-set|-webkit-image-set)\s*\(/i;

/**
 * Extra CSS is appended verbatim, so it is the one place where a rule could
 * reach the network: `background-image: url(https://…)`, a remote `@font-face`
 * source or `@import` all issue requests wherever the page's CSP allows them.
 * That would forfeit the property the extension is built on — it looks at
 * pages, it never talks about them — so resource-loading CSS is refused rather
 * than shipped with a warning.
 *
 * Checked with the browser's own CSS parser where there is one (the settings
 * page), because serialising the parsed rules normalises escapes and comments
 * that a textual scan alone could be walked past. The raw text is scanned too:
 * constructed stylesheets drop `@import` silently, and unparseable input still
 * has to be judged.
 *
 * Returns an error message, or `null` when the CSS is fine.
 */
export function extraCssError(css) {
  const text = String(css ?? "");
  if (!text.trim()) return null;

  const candidates = [text];
  if (typeof CSSStyleSheet === "function") {
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(text);
      candidates.push([...sheet.cssRules].map((r) => r.cssText).join("\n"));
    } catch {
      // Nothing parsed; the raw scan below still applies.
    }
  }

  if (candidates.some((c) => RESOURCE_CSS_RE.test(c))) {
    return (
      "Extra CSS may not load remote resources: remove url(), image-set(), " +
      "src() and @import."
    );
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* URL matching                                                               */
/* -------------------------------------------------------------------------- */

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Compile a Chrome match pattern into a RegExp.
 *
 * Chrome offers no matcher to extensions, and `chrome.tabs.query({url})` only
 * helps for tabs that already exist — the worker also has to test a single URL
 * on every navigation, so we need our own. Throws on a malformed pattern, which
 * the settings page surfaces as a validation error.
 *
 * https only. The manifest grants optional host access to https origins and
 * nothing else, so an http or scheme-wildcard pattern could pass validation here
 * and then never be granted — the user would add a site, see no error, and get
 * no masking. Rejecting it up front turns that silent dead end into a message.
 * Narrowing to https also keeps the permission the Chrome Web Store reviews as
 * small as the feature allows.
 */
export function matchPatternToRegExp(pattern) {
  const p = String(pattern).trim();

  const m = /^(https):\/\/([^/]*)(\/.*)$/.exec(p);
  if (!m) throw new Error(`Not a valid https match pattern: "${p}"`);
  const [, scheme, host, path] = m;

  if (host === "") {
    throw new Error(`Pattern needs a host: "${p}"`);
  }
  if (host.indexOf("*") > 0 && !host.startsWith("*.")) {
    throw new Error(`"*" may only lead the host, as in *.example.com: "${p}"`);
  }

  const schemeRe = scheme;
  let hostRe;
  if (host === "*") hostRe = "[^/]+";
  else if (host.startsWith("*.")) hostRe = `(?:[^/]+\\.)?${escapeRe(host.slice(2))}`;
  else hostRe = escapeRe(host);

  // The path component of a match pattern is tested against path + query.
  const pathRe = path.split("*").map(escapeRe).join(".*");

  return new RegExp(`^${schemeRe}://${hostRe}${pathRe}$`);
}

/** Does `url` fall under any of the rule's patterns? Bad patterns are skipped. */
export function ruleMatchesUrl(rule, url) {
  if (!url) return false;
  const withoutHash = url.split("#")[0];
  return (rule.matches ?? []).some((pattern) => {
    try {
      return matchPatternToRegExp(pattern).test(withoutHash);
    } catch {
      return false;
    }
  });
}

/** Every pattern across enabled rules — used for tab queries and permissions. */
export function activePatterns(settings) {
  const out = new Set();
  for (const rule of settings.rules ?? []) {
    if (rule.enabled === false) continue;
    for (const p of rule.matches ?? []) {
      try {
        matchPatternToRegExp(p);
        out.add(p.trim());
      } catch {
        // Skip anything malformed; the settings page reports it.
      }
    }
  }
  return [...out];
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Cheap sanity checks for the settings page. Selector validity is checked with
 * the browser's own parser rather than a regex — `:is()`/`:not()` nesting is
 * far too subtle to second-guess.
 */
export function validateRule(rule) {
  const errors = [];

  if (!(rule.name ?? "").trim()) errors.push("Give the service a name.");

  for (const pattern of rule.matches ?? []) {
    try {
      matchPatternToRegExp(pattern);
    } catch (e) {
      errors.push(e.message);
    }
  }

  const check = (list, label) => {
    for (const sel of list ?? []) {
      try {
        document.createDocumentFragment().querySelector(sel);
      } catch {
        errors.push(`${label} is not a valid CSS selector: "${sel}"`);
      }
    }
  };

  if (typeof document !== "undefined") {
    check(rule.mask, "Mask selector");
    check(rule.keepVisible, "Keep-visible selector");
  }

  const extraError = extraCssError(rule.extraCss);
  if (extraError) errors.push(extraError);

  if ((rule.matches ?? []).length === 0) errors.push("Add at least one URL.");
  if ((rule.mask ?? []).length === 0) {
    errors.push("Add at least one element to mask, or this service does nothing.");
  }

  return errors;
}

/* -------------------------------------------------------------------------- */
/* Storage                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Read settings, upgrading anything older in memory. Deliberately does not
 * write: only `onInstalled` persists a migration, so two contexts reading at
 * once cannot race each other into a half-written config.
 */
export async function getSettings() {
  const raw = await chrome.storage.local.get(null);
  return normalise(raw);
}

export function normalise(raw) {
  const base = defaultSettings();
  if (!Array.isArray(raw?.rules)) {
    // v1 stored only `blurEnabled`. Keep the user's on/off choice, adopt the
    // new default rule set.
    return { ...base, blurEnabled: raw?.blurEnabled !== false };
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    blurEnabled: raw.blurEnabled !== false,
    rules: raw.rules.map((r) => ({
      id: r.id ?? crypto.randomUUID(),
      name: r.name ?? "Untitled service",
      enabled: r.enabled !== false,
      verified: r.verified === true,
      builtin: r.builtin === true,
      matches: Array.isArray(r.matches) ? r.matches : [],
      mask: Array.isArray(r.mask) ? r.mask : [],
      keepVisible: Array.isArray(r.keepVisible) ? r.keepVisible : [],
      extraCss: typeof r.extraCss === "string" ? r.extraCss : "",
    })),
  };
}

/**
 * Adds built-in services introduced after the stored schema version, for an
 * install that predates them. Returns a new settings object, or `null` if
 * nothing was missing.
 *
 * `storedSchemaVersion` is the version from storage before normalisation bumped
 * it. Only presets whose `introducedIn` exceeds that version are added, so an
 * old built-in that the user deliberately removed stays deleted.
 */
export function mergeMissingBuiltins(settings, storedSchemaVersion) {
  const have = new Set((settings.rules ?? []).map((r) => r.id));
  const missing = PRESETS.filter(
    (p) =>
      p.builtin && !have.has(p.id) && (p.introducedIn ?? 0) > storedSchemaVersion,
  );
  if (missing.length === 0) return null;
  return {
    ...settings,
    schemaVersion: SCHEMA_VERSION,
    rules: [
      ...settings.rules,
      ...missing.map((p) => ({ ...structuredClone(p), enabled: true })),
    ],
  };
}

export async function saveSettings(settings) {
  await chrome.storage.local.set({
    schemaVersion: SCHEMA_VERSION,
    blurEnabled: settings.blurEnabled !== false,
    rules: settings.rules,
  });
}
