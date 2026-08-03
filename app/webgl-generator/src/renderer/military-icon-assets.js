import {MILITARY_ICON_KEYS} from "./canvas-icon-registry.js";

const MILITARY_ICON_KEY_SET = new Set(MILITARY_ICON_KEYS);

export const MILITARY_ICON_LABELS = Object.freeze({
  "fleet-large": "大舰队",
  "fleet-small": "小舰队",
  archers: "弓兵",
  "archers-heavy": "重装弓兵",
  cavalry: "骑兵",
  "cavalry-heavy": "重骑兵",
  infantry: "步兵",
  "infantry-heavy": "重步兵",
  mountain: "山地兵",
  artillery: "器械"
});

const LEGACY_MILITARY_ICON_VARIANTS = Object.freeze({
  "步": "infantry",
  "弓": "archers",
  "骑": "cavalry",
  "械": "artillery",
  "舟": "fleet-small",
  "▴": "infantry",
  "▴🛡": "infantry-heavy",
  "🏹": "archers",
  "🏹⋯": "archers-heavy",
  "♞": "cavalry",
  "♞◈": "cavalry-heavy",
  "⚙": "artillery",
  "⛵": "fleet-small",
  "🚢": "fleet-large",
  "👒": "mountain"
});

export function normalizeMilitaryIconVariant(value, fallback = "infantry") {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  if (MILITARY_ICON_KEY_SET.has(raw)) return raw;
  return LEGACY_MILITARY_ICON_VARIANTS[raw] || fallback;
}

export function militaryIconLabelForVariant(variant) {
  const normalized = normalizeMilitaryIconVariant(variant);
  return MILITARY_ICON_LABELS[normalized] || MILITARY_ICON_LABELS.infantry;
}
