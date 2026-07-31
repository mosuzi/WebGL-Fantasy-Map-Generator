export const EVENT_ZONE_TYPES = Object.freeze(["Warzone", "Invasion", "Rebels", "Proselytism", "Crusade", "Disease", "Disaster", "Eruption", "Avalanche", "Fault", "Flood", "Tsunami"]);
export const NATURAL_ZONE_TYPES = Object.freeze(["Wilderness", "Desert", "Swamp", "DeepForest", "Grassland", "Tundra", "Highland", "Badlands", "VolcanicLand"]);
export const NEUTRAL_ZONE_EFFECTS = Object.freeze({habitability: 0, movementCost: 1, economy: 1, defense: 0});

const EVENT_TYPES = new Set(EVENT_ZONE_TYPES);
const NATURAL_TYPES = new Set(NATURAL_ZONE_TYPES);
const CATEGORIES = new Set(["event", "natural", "custom"]);
const COVERAGE = new Set(["base", "overlay"]);

export function zoneTypeModel(type, options = {}) {
  const normalizedType = String(type || "Disaster").trim() || "Disaster";
  const inferredCategory = EVENT_TYPES.has(normalizedType) ? "event" : NATURAL_TYPES.has(normalizedType) ? "natural" : "custom";
  const category = CATEGORIES.has(options.category) ? options.category : inferredCategory;
  const coverage = category === "event" ? "overlay" : category === "natural" ? "base" : COVERAGE.has(options.coverage) ? options.coverage : "base";
  return {
    type: category === "custom" && !normalizedType ? "Custom" : normalizedType,
    category,
    source: normalizeSource(options.source, category),
    customTypeName: category === "custom" ? normalizeText(options.customTypeName || (normalizedType === "Custom" ? "自定义地区" : normalizedType), 48) : "",
    description: normalizeText(options.description, 240),
    coverage,
    effects: normalizeZoneEffects(options.effects)
  };
}

export function normalizeZoneTypeRecord(zone) {
  if (!zone || typeof zone !== "object") return zone;
  return {...zone, ...zoneTypeModel(zone.type, zone)};
}

export function normalizeZoneEffects(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    habitability: boundedNumber(source.habitability, -100, 100, 0),
    movementCost: boundedNumber(source.movementCost, 0, 10, 1),
    economy: boundedNumber(source.economy, 0, 10, 1),
    defense: boundedNumber(source.defense, -100, 100, 0)
  };
}

export function normalizeZonePropertiesPatch(zone, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("地区属性必须是对象");
  const merged = {...zone, ...patch, effects: patch.effects === undefined ? zone.effects : {...(zone.effects || {}), ...(patch.effects || {})}};
  const model = zoneTypeModel(merged.type, merged);
  const name = normalizeText(patch.name ?? zone.name, 64) || zone.name;
  return {
    ...model,
    name,
    nameMode: zone.source === "auto-wilderness" && name !== zone.name ? "manual" : zone.nameMode || "auto",
    description: normalizeText(patch.description ?? zone.description, 240)
  };
}

export function zoneCoverageConflicts(candidate, existing) {
  const left = normalizeZoneTypeRecord(candidate);
  const right = normalizeZoneTypeRecord(existing);
  if (left.coverage === "base" && right.coverage === "base") return true;
  if (left.coverage === "overlay" && right.coverage === "overlay") return true;
  return false;
}

export function resolveZoneEffectsAtCell(map, packCell) {
  const cell = Number(packCell);
  const count = map?.pack?.cells?.i?.length || map?.pack?.cells?.h?.length || 0;
  if (!Number.isInteger(cell) || cell < 0 || cell >= count) throw new Error("pack cell 超出范围");
  const zones = (map?.zones?.zones || map?.pack?.zones || [])
    .filter(zone => zone?.cells?.includes(cell))
    .map(normalizeZoneTypeRecord)
    .sort((left, right) => Number(left.i ?? left.id) - Number(right.i ?? right.id));
  const effects = {...NEUTRAL_ZONE_EFFECTS};
  for (const zone of zones) {
    effects.habitability += zone.effects.habitability;
    effects.movementCost *= zone.effects.movementCost;
    effects.economy *= zone.effects.economy;
    effects.defense += zone.effects.defense;
  }
  effects.habitability = boundedNumber(effects.habitability, -100, 100, 0);
  effects.defense = boundedNumber(effects.defense, -100, 100, 0);
  effects.movementCost = round(boundedNumber(effects.movementCost, 0.1, 10, 1));
  effects.economy = round(boundedNumber(effects.economy, 0.1, 10, 1));
  return {packCell: cell, effects, zones: zones.map(zone => ({id: Number(zone.i ?? zone.id), name: zone.name, category: zone.category, coverage: zone.coverage, effects: zone.effects}))};
}

export function zoneCategoryLabel(value) {
  return ({event: "事件地区", natural: "自然地区", custom: "自定义地区"})[value] || value;
}

function normalizeSource(value, category) {
  const source = String(value || "").trim();
  if (["generated", "manual", "imported", "auto-neutral", "auto-wilderness"].includes(source)) return source;
  return category === "event" ? "generated" : "manual";
}

function normalizeText(value, maxLength) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

function boundedNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function round(value) {
  return Math.round(value * 1e6) / 1e6;
}
