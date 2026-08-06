/**
 * Drives tools/selector-fixture.html: asserts which elements the shipped
 * Outlook Web rule masks and which it must leave alone. Results land in the
 * on-page table and on `window.__cpbResults` for automated checks.
 *
 * The CSS is built from src/rules.js rather than read from a file, so the
 * fixture always tests exactly what the extension would inject.
 */

import { PRESETS, buildCss } from "../src/rules.js";

const outlook = PRESETS.find((preset) => preset.id === "outlook-web");
const style = document.createElement("style");
style.id = "cpb-generated";
style.textContent = buildCss(outlook);
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
];

function state(el) {
  const cs = getComputedStyle(el);
  const fill = cs.webkitTextFillColor || cs.color;
  // SVG shapes carry no text; judge them on `fill`.
  const paint = el.namespaceURI === "http://www.w3.org/2000/svg" ? cs.fill : fill;
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
