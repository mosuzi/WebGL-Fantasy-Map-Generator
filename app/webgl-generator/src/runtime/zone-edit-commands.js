import {OBJECT_KIND} from "./object-kinds.js";

const ZONE_STYLE_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["line-layers", "object-panels"])
});

const ZONE_PATTERNS = new Set(["diagonal", "cross", "dots"]);

export function createSetZoneStyleCommand(zoneId, patch = {}) {
  const normalizedZoneId = Number(zoneId);
  const normalizedPatch = normalizeZoneStylePatch(patch);
  let previous = null;

  return {
    label: `调整地区样式 #${normalizedZoneId}`,
    domain: OBJECT_KIND.ZONE,
    effects: {
      ...ZONE_STYLE_EFFECTS,
      affected: [{kind: OBJECT_KIND.ZONE, id: normalizedZoneId}]
    },
    apply(context) {
      const zone = readZone(context.map, normalizedZoneId);
      previous ??= snapshotZoneStyle(zone);
      if (normalizedPatch.pattern) zone.pattern = normalizedPatch.pattern;
      if (normalizedPatch.hexColor) zone.hexColor = normalizedPatch.hexColor;
    },
    revert(context) {
      const zone = readZone(context.map, normalizedZoneId);
      restoreZoneStyle(zone, previous);
    },
    isNoop(context) {
      const zone = findZone(context.map, normalizedZoneId);
      if (!zone || !Object.keys(normalizedPatch).length) return true;
      return Object.entries(normalizedPatch).every(([key, value]) => normalizeComparableStyleValue(key, zone[key]) === value);
    }
  };
}

function readZone(map, zoneId) {
  const zone = findZone(map, zoneId);
  if (!zone) throw new Error(`找不到地区 #${zoneId}`);
  return zone;
}

function findZone(map, zoneId) {
  return (map?.zones?.zones || map?.pack?.zones || []).find(zone => Number(zone?.i ?? zone?.id) === Number(zoneId)) || null;
}

function snapshotZoneStyle(zone) {
  return {
    pattern: zone.pattern,
    hexColor: zone.hexColor
  };
}

function restoreZoneStyle(zone, snapshot) {
  restoreOptionalField(zone, "pattern", snapshot?.pattern);
  restoreOptionalField(zone, "hexColor", snapshot?.hexColor);
}

function restoreOptionalField(target, key, value) {
  if (value === undefined) delete target[key];
  else target[key] = value;
}

function normalizeZoneStylePatch(patch) {
  const normalized = {};
  const pattern = normalizeZonePattern(patch.pattern);
  const hexColor = normalizeHexColor(patch.hexColor || patch.color);
  if (pattern) normalized.pattern = pattern;
  if (hexColor) normalized.hexColor = hexColor;
  return normalized;
}

function normalizeComparableStyleValue(key, value) {
  if (key === "pattern") return normalizeZonePattern(value);
  if (key === "hexColor") return normalizeHexColor(value);
  return value;
}

function normalizeZonePattern(pattern) {
  const value = typeof pattern === "string" ? pattern.trim() : "";
  return ZONE_PATTERNS.has(value) ? value : null;
}

function normalizeHexColor(color) {
  if (typeof color !== "string") return null;
  const match = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  return match ? `#${match[1].toLowerCase()}` : null;
}
