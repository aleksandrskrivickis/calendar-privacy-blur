/**
 * Applies a shipped rule to a mock page when the URL says `?masked`.
 *
 * The CSS comes from buildCss() in src/rules.js, the same function the service
 * worker uses, so a masked screenshot shows exactly what the extension paints.
 * The extension injects it as a user stylesheet; the mocks set no !important
 * colours, so an author <style> lands the same way here.
 */

import { PRESETS, buildCss } from "../../src/rules.js";

export function applyMask(ruleId) {
  if (!new URLSearchParams(location.search).has("masked")) return;
  const rule = PRESETS.find((p) => p.id === ruleId);
  if (!rule) throw new Error(`No shipped rule "${ruleId}"`);
  const style = document.createElement("style");
  style.id = "cpb-mask";
  style.textContent = buildCss(rule);
  document.head.append(style);
}
