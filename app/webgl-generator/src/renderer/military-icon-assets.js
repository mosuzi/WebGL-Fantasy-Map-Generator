import fleetLargeIconUrl from "../assets/military-icons/fleet-large.png";
import fleetSmallIconUrl from "../assets/military-icons/fleet-small.png";
import archersIconUrl from "../assets/military-icons/archers.png";
import archersHeavyIconUrl from "../assets/military-icons/archers-heavy.png";
import cavalryIconUrl from "../assets/military-icons/cavalry.png";
import cavalryHeavyIconUrl from "../assets/military-icons/cavalry-heavy.png";
import infantryIconUrl from "../assets/military-icons/infantry.png";
import infantryHeavyIconUrl from "../assets/military-icons/infantry-heavy.png";
import mountainIconUrl from "../assets/military-icons/mountain.png";
import artilleryIconUrl from "../assets/military-icons/artillery.png";

export const MILITARY_ICON_URLS = Object.freeze({
  "fleet-large": fleetLargeIconUrl,
  "fleet-small": fleetSmallIconUrl,
  archers: archersIconUrl,
  "archers-heavy": archersHeavyIconUrl,
  cavalry: cavalryIconUrl,
  "cavalry-heavy": cavalryHeavyIconUrl,
  infantry: infantryIconUrl,
  "infantry-heavy": infantryHeavyIconUrl,
  mountain: mountainIconUrl,
  artillery: artilleryIconUrl
});

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
  if (MILITARY_ICON_URLS[raw]) return raw;
  return LEGACY_MILITARY_ICON_VARIANTS[raw] || fallback;
}

export function militaryIconUrlForVariant(variant) {
  return MILITARY_ICON_URLS[normalizeMilitaryIconVariant(variant)] || MILITARY_ICON_URLS.infantry;
}

export function militaryIconLabelForVariant(variant) {
  const normalized = normalizeMilitaryIconVariant(variant);
  return MILITARY_ICON_LABELS[normalized] || MILITARY_ICON_LABELS.infantry;
}
