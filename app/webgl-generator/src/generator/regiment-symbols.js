export const MILITARY_ICON_LABELS = Object.freeze({
  "fleet-large": "大舰队",
  "fleet-small": "小舰队",
  archers: "轻弓兵",
  "archers-heavy": "重装弓兵",
  "archers-elite": "精锐弓兵",
  cavalry: "轻骑兵",
  "cavalry-heavy": "重装骑兵",
  "cavalry-elite": "精锐骑兵",
  "horse-archers": "弓骑兵",
  infantry: "步兵",
  "infantry-heavy": "重装步兵",
  "infantry-elite": "精锐步兵",
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

function knownVariant(value) {
  const raw = String(value || "").trim();
  if (Object.hasOwn(MILITARY_ICON_LABELS, raw)) return raw;
  return Object.hasOwn(LEGACY_MILITARY_ICON_VARIANTS, raw) ? LEGACY_MILITARY_ICON_VARIANTS[raw] : null;
}

// 旧档可能只有图标字符或主兵种，只解析显示值，不改写军团。
export function regimentIconVariant(regiment) {
  return knownVariant(regiment.iconVariant) || knownVariant(regiment.icon)
    || (regiment.type === "fleet" || regiment.dominantUnit === "fleet" ? "fleet-small" : knownVariant(regiment.dominantUnit))
    || "infantry";
}
