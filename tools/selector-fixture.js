/**
 * Drives tools/selector-fixture.html: asserts which elements hide-events.css
 * masks and which it must leave alone. Results land in the on-page table and on
 * `window.__cpbResults` for automated checks.
 */

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
  ["appsection-chip", "MASKED", "chip under data-app-section"],
  ["appsection-title", "MASKED", "title under data-app-section"],

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
