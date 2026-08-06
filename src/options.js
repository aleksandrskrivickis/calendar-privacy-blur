/**
 * Calendar Privacy Blur — settings page.
 *
 * Edits an in-memory copy of the settings and writes it back on Save. Nothing
 * here injects anything: it stores rules, and the service worker reconciles
 * open tabs. That keeps one code path responsible for what ends up on a page.
 */

import {
  PRESETS,
  buildCss,
  defaultSettings,
  getSettings,
  matchPatternToRegExp,
  saveSettings,
  validateRule,
} from "./rules.js";

const el = (id) => document.getElementById(id);
const toLines = (value) => value.split("\n").map((s) => s.trim()).filter(Boolean);
const fromLines = (list) => (list ?? []).join("\n");

let model = null;
let dirty = false;

/* -------------------------------------------------------------------------- */
/* Status bar                                                                 */
/* -------------------------------------------------------------------------- */

function status(message, kind = "") {
  const node = el("status");
  node.textContent = message;
  node.className = `actionbar__status${kind ? ` actionbar__status--${kind}` : ""}`;
}

function markDirty() {
  dirty = true;
  status("Unsaved changes");
}

/* -------------------------------------------------------------------------- */
/* Rendering                                                                  */
/* -------------------------------------------------------------------------- */

function renderPresetPicker() {
  const picker = el("preset-picker");
  picker.replaceChildren(
    ...PRESETS.map((preset) => {
      const option = document.createElement("option");
      option.value = preset.id;
      option.textContent = preset.verified ? preset.name : `${preset.name} (unverified)`;
      return option;
    }),
  );
}

function render() {
  const host = el("services");
  host.replaceChildren(...model.rules.map(buildCard));
  el("empty-state").hidden = model.rules.length > 0;
}

function buildCard(rule) {
  const card = el("service-template").content.firstElementChild.cloneNode(true);
  card._rule = rule;

  const q = (sel) => card.querySelector(sel);

  q(".js-enabled").checked = rule.enabled !== false;
  q(".js-name").value = rule.name ?? "";
  q(".js-matches").value = fromLines(rule.matches);
  q(".js-mask").value = fromLines(rule.mask);
  q(".js-keep").value = fromLines(rule.keepVisible);
  q(".js-extra").value = rule.extraCss ?? "";

  const badge = q(".js-verified");
  // Keep the js- hook in the class list: assigning className wholesale would
  // drop it and break any later lookup.
  badge.className = `pill js-verified pill--${rule.verified ? "ok" : "warn"}`;
  badge.textContent = rule.verified ? "verified" : "unverified";
  badge.title = rule.verified
    ? "These selectors have been checked against the live site."
    : "Nobody has confirmed these selectors match. Use Test below.";

  q(".js-enabled").addEventListener("change", (e) => {
    rule.enabled = e.target.checked;
    markDirty();
  });
  q(".js-name").addEventListener("input", (e) => {
    rule.name = e.target.value;
    markDirty();
  });
  q(".js-matches").addEventListener("input", (e) => {
    rule.matches = toLines(e.target.value);
    markDirty();
    refreshPermission(card);
  });

  for (const [selector, apply] of [
    [".js-mask", (v) => (rule.mask = toLines(v))],
    [".js-keep", (v) => (rule.keepVisible = toLines(v))],
    [".js-extra", (v) => (rule.extraCss = v)],
  ]) {
    q(selector).addEventListener("input", (e) => {
      apply(e.target.value);
      markDirty();
      refreshCssPreview(card);
    });
  }

  q(".js-remove").addEventListener("click", () => {
    model.rules = model.rules.filter((r) => r !== rule);
    render();
    markDirty();
  });

  q(".js-test").addEventListener("click", () => testRule(card));

  refreshCssPreview(card);
  refreshPermission(card);
  return card;
}

function refreshCssPreview(card) {
  const css = buildCss(card._rule);
  card.querySelector(".js-css").textContent =
    css || "Nothing — add at least one selector under “Mask these elements”.";
}

function showMessage(card, text, isError) {
  const node = card.querySelector(".js-errors");
  node.textContent = text;
  node.hidden = !text;
  node.classList.toggle("service__errors--info", !isError);
}

/* -------------------------------------------------------------------------- */
/* Host permissions                                                           */
/* -------------------------------------------------------------------------- */

/** Patterns Chrome will accept as an origin; malformed ones are reported on save. */
function usablePatterns(rule) {
  return (rule.matches ?? []).filter((p) => {
    try {
      matchPatternToRegExp(p);
      return true;
    } catch {
      return false;
    }
  });
}

async function refreshPermission(card) {
  const rule = card._rule;
  const node = card.querySelector(".js-perm");
  const origins = usablePatterns(rule);

  node.classList.remove("service__perm--needed");
  if (origins.length === 0) {
    node.textContent = "Add a URL to request access.";
    return;
  }

  let granted = false;
  try {
    granted = await chrome.permissions.contains({ origins });
  } catch {
    node.textContent = "Chrome cannot check access for these URLs.";
    return;
  }

  if (granted) {
    node.textContent = "Access granted for these URLs.";
    return;
  }

  node.classList.add("service__perm--needed");
  node.textContent = "Chrome needs permission for these URLs. ";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn";
  button.textContent = "Grant access";
  button.addEventListener("click", () => {
    // Called synchronously inside the click so the user gesture is still live —
    // awaiting anything first makes Chrome reject the request.
    chrome.permissions
      .request({ origins })
      .then((ok) => {
        if (ok) refreshPermission(card);
        else showMessage(card, "Access was declined, so this service stays inactive.", true);
      })
      .catch((e) => showMessage(card, `Chrome refused the request: ${e.message}`, true));
  });
  node.append(button);
}

/* -------------------------------------------------------------------------- */
/* Test against a live tab                                                    */
/* -------------------------------------------------------------------------- */

/** Runs in the page. Must be self-contained — it is serialised, not closed over. */
function countMatches(mask, keep) {
  const tally = (selectors) =>
    selectors.map((selector) => {
      try {
        return { selector, count: document.querySelectorAll(selector).length };
      } catch {
        return { selector, count: -1 };
      }
    });
  const roots = [];
  for (const selector of mask) {
    try {
      roots.push(...document.querySelectorAll(selector));
    } catch {
      // Invalid selectors are already represented in the mask tally.
    }
  }
  const keepTally = keep.map((selector) => {
    try {
      const count = [...document.querySelectorAll(selector)].filter((node) =>
        roots.some((root) => root !== node && root.contains(node)),
      ).length;
      return { selector, count };
    } catch {
      return { selector, count: -1 };
    }
  });
  return { url: location.href, mask: tally(mask), keep: keepTally };
}

/**
 * Counts what the selectors actually hit on a real page.
 *
 * This exists because the worst failure mode here is silent: a selector that
 * matches nothing looks exactly like an extension that is working fine, right
 * up until someone shares their screen.
 */
async function testRule(card) {
  const rule = card._rule;
  const origins = usablePatterns(rule);

  if (origins.length === 0 || (rule.mask ?? []).length === 0) {
    showMessage(card, "Add at least one URL and one mask selector first.", true);
    return;
  }

  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: origins });
  } catch (e) {
    showMessage(card, `Could not look for a matching tab: ${e.message}`, true);
    return;
  }
  if (tabs.length === 0) {
    showMessage(card, "Open a tab on one of these URLs, then test again.", true);
    return;
  }

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: countMatches,
      args: [rule.mask ?? [], rule.keepVisible ?? []],
    });
    const { url, mask, keep } = result.result;

    const describe = (rows) =>
      rows
        .map((r) => (r.count < 0 ? `  ${r.selector} → invalid selector` : `  ${r.selector} → ${r.count}`))
        .join("\n");

    const total = mask.reduce((sum, r) => sum + Math.max(0, r.count), 0);
    const headline =
      total === 0
        ? "No elements matched — this service would do nothing on that page."
        : `${total} element${total === 1 ? "" : "s"} would be masked.`;

    showMessage(
      card,
      `${headline}\nTested on ${url}\n\nMask:\n${describe(mask)}` +
        (keep.length ? `\n\nKeep visible:\n${describe(keep)}` : ""),
      total === 0,
    );
  } catch (e) {
    showMessage(card, `Could not run the test: ${e.message}. Grant access first?`, true);
  }
}

/* -------------------------------------------------------------------------- */
/* Actions                                                                    */
/* -------------------------------------------------------------------------- */

function addService() {
  const preset = PRESETS.find((p) => p.id === el("preset-picker").value);
  if (!preset) return;

  const copy = structuredClone(preset);
  copy.enabled = true;
  if (model.rules.some((r) => r.id === copy.id)) {
    copy.id = `${copy.id}-${crypto.randomUUID().slice(0, 8)}`;
  }
  // Only the shipped Outlook rule carries the built-in flag; a copy is the
  // user's to edit and delete.
  copy.builtin = false;
  model.rules.push(copy);
  render();
  markDirty();
  el("services").lastElementChild?.querySelector(".js-name")?.focus();
}

async function save() {
  const cards = [...el("services").children];
  let bad = 0;

  for (const card of cards) {
    const errors = validateRule(card._rule);
    // A disabled service is allowed to be incomplete — it does nothing.
    if (card._rule.enabled === false || errors.length === 0) {
      if (!card.querySelector(".js-errors").classList.contains("service__errors--info")) {
        showMessage(card, "", false);
      }
      continue;
    }
    bad++;
    showMessage(card, errors.join("\n"), true);
  }

  if (bad > 0) {
    status(`${bad === 1 ? "1 service needs" : `${bad} services need`} fixing before saving`, "err");
    return;
  }

  try {
    await saveSettings(model);
    await chrome.runtime.sendMessage({ type: "cpb:reconcile" }).catch(() => {});
    dirty = false;
    status("Saved. Open tabs updated.", "ok");
    for (const card of cards) refreshPermission(card);
  } catch (e) {
    status(`Could not save: ${e.message}`, "err");
  }
}

async function resetAll() {
  const ok = confirm(
    "Reset all services to the shipped defaults?\n\nAny services you added and any selector edits will be lost.",
  );
  if (!ok) return;
  model = defaultSettings();
  el("master-toggle").checked = model.blurEnabled;
  render();
  await saveSettings(model);
  await chrome.runtime.sendMessage({ type: "cpb:reconcile" }).catch(() => {});
  dirty = false;
  status("Reset to defaults.", "ok");
}

/* -------------------------------------------------------------------------- */
/* Boot                                                                       */
/* -------------------------------------------------------------------------- */

async function init() {
  model = await getSettings();

  renderPresetPicker();
  el("master-toggle").checked = model.blurEnabled !== false;
  render();

  el("master-toggle").addEventListener("change", async (e) => {
    model.blurEnabled = e.target.checked;
    // The master switch is the one control that applies immediately: it mirrors
    // clicking the toolbar icon, and a "Save" step there would be surprising.
    await chrome.storage.local.set({ blurEnabled: model.blurEnabled });
    status(model.blurEnabled ? "Masking on." : "Masking off.", "ok");
  });

  el("add-service").addEventListener("click", addService);
  el("save").addEventListener("click", save);
  el("reset").addEventListener("click", resetAll);

  // Reflect a toggle made from the toolbar icon while this page is open.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.blurEnabled) {
      model.blurEnabled = changes.blurEnabled.newValue !== false;
      el("master-toggle").checked = model.blurEnabled;
    }
  });

  window.addEventListener("beforeunload", (e) => {
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = "";
  });

  status("");
}

init().catch((e) => status(`Could not load settings: ${e.message}`, "err"));
