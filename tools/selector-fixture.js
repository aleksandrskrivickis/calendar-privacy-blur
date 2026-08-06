/**
 * Drives tools/selector-fixture.html: asserts which elements the shipped
 * Outlook Web rule masks and which it must leave alone. Results land in the
 * on-page table and on `window.__cpbResults` for automated checks.
 *
 * The CSS is built from src/rules.js rather than read from a file, so the
 * fixture always tests exactly what the extension would inject.
 */

import { PRESETS, buildCss } from "../src/rules.js";

// Every shipped service, exactly as the extension would inject it.
const style = document.createElement("style");
style.id = "cpb-generated";
style.textContent = PRESETS.filter((p) => p.builtin).map(buildCss).join("\n\n");
document.head.appendChild(style);

const TRANSPARENT = "rgba(0, 0, 0, 0)";

/** MASKED = text pixels gone. VISIBLE = still rendering its own colour. */
const CASES = [
  // App chrome — the whole reason the selector is scoped.
  ["chrome-launcher", "VISIBLE", "app launcher (banner)"],
  ["chrome-search", "VISIBLE", "search box"],
  ["chrome-new", "VISIBLE", "New event button"],
  ["chrome-prev", "VISIBLE", "previous-week arrow"],
  ["chrome-next", "VISIBLE", "next-week arrow"],
  ["chrome-day", "VISIBLE", "view switcher: Day"],
  ["chrome-week", "VISIBLE", "view switcher: Week"],
  ["chrome-minidate", "VISIBLE", "mini date picker day"],
  ["chrome-calname", "VISIBLE", "calendar name in left rail"],

  // Grid furniture — carries aria-labels but nothing private.
  ["grid-colheader", "VISIBLE", "day-of-week column header"],
  ["grid-rowheader", "VISIBLE", "hour gutter row header"],
  ["dialog-save", "VISIBLE", "button inside a dialog"],

  // The actual payload.
  ["event-chip", "MASKED", "event chip in a gridcell"],
  ["event-title", "MASKED", "event title span"],
  ["event-time", "MASKED", "event time span"],
  ["agenda-option", "MASKED", "agenda list option"],
  ["agenda-title", "MASKED", "agenda option title"],
  ["appsection-chip", "MASKED", "timed event in calendar-view-0"],
  ["appsection-title", "MASKED", "timed event title in calendar-view-0"],

  // Regression guard. All-day events sit in a section named "…header…", so any
  // attempt to narrow the scope by excluding header sections unmasks them.
  ["allday-chip", "MASKED", "all-day event in calendar-view-header-0"],
  ["allday-title", "MASKED", "all-day event title (the easy one to lose)"],

  // Real chrome hooks from live Outlook.
  ["ribbon-new", "VISIBLE", "New event button in Ribbon"],
  ["navtoolbar-next", "VISIBLE", "next-week arrow in CalendarSurfaceNavigationToolbar"],

  // Icons stay readable inside a masked chip.
  ["event-icon", "VISIBLE", "recurring glyph inside masked chip"],
  ["event-svg-circle", "VISIBLE", "svg fill inside masked chip"],

  /* --- Google Calendar ---------------------------------------------------- */
  ["gcal-chip", "MASKED", "event chip in role=main"],
  ["gcal-title", "MASKED", "event title"],
  ["gcal-allday", "MASKED", "all-day chip (same data-eventchip hook)"],
  ["gcal-allday-title", "MASKED", "all-day event title"],
  ["gcal-svg", "VISIBLE", "chip icon root"],
  ["gcal-path-filled", "VISIBLE", "filled icon path follows currentColor"],
  // The regression guard. Restoring colour must not also force a fill.
  ["gcal-path-outline", "UNFILLED", "outline icon path keeps fill:none"],
  ["gcal-create", "VISIBLE", "Create button (outside role=main)"],
  ["gcal-search", "VISIBLE", "Search button (outside role=main)"],
];

function state(el) {
  const cs = getComputedStyle(el);
  // SVG shapes carry no text; judge them on `fill`.
  if (el.namespaceURI === "http://www.w3.org/2000/svg") {
    // UNFILLED is its own outcome, not a flavour of VISIBLE: a rule that forces
    // `fill: currentColor` would turn an outline icon into a solid block while
    // still counting as "visible".
    if (cs.fill === "none") return "UNFILLED";
    return cs.fill === TRANSPARENT ? "MASKED" : "VISIBLE";
  }
  const paint = cs.webkitTextFillColor || cs.color;
  return paint === TRANSPARENT ? "MASKED" : "VISIBLE";
}

const results = CASES.map(([id, expected, label]) => {
  const el = document.getElementById(id);
  if (!el) return { id, label, expected, actual: "MISSING", pass: false };
  const actual = state(el);
  return { id, label, expected, actual, pass: actual === expected };
});

const tbody = document.querySelector("#report tbody");
for (const r of results) {
  const row = document.createElement("tr");
  row.innerHTML =
    `<td>${r.label}</td><td>${r.expected}</td><td>${r.actual}</td>` +
    `<td class="${r.pass ? "pass" : "fail"}">${r.pass ? "PASS" : "FAIL"}</td>`;
  tbody.appendChild(row);
}

window.__cpbResults = {
  total: results.length,
  failed: results.filter((r) => !r.pass),
};
