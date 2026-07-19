const CSS_PX_PER_CM = 96 / 2.54;
const INTERNAL_POPULATION_UNIT_PEOPLE = 1000;
const INTERNAL_PRECIPITATION_UNIT_MILLIMETERS = 100;
const INTERNAL_RIVER_FLOW_TO_CUBIC_METERS_PER_SECOND = 6;
const SECONDS_PER_YEAR = 365.25 * 24 * 60 * 60;

export const RIVER_RUNOFF_COEFFICIENTS = Object.freeze({
  low: 0.2,
  medium: 0.3,
  high: 0.5
});

export const DEFAULT_UNIT_PREFERENCES = Object.freeze({
  distanceUnit: "km-cn",
  areaUnit: "km2-cn",
  customUnits: Object.freeze([]),
  numberAbbreviation: "wan",
  mapScaleKmPerCm: 100,
  populationScale: 1,
  militaryScale: 1,
  precipitationScale: 1
});

export const UNIT_SCALE_LIMITS = Object.freeze({
  mapScaleKmPerCm: Object.freeze({min: 1, max: 1000, step: 1}),
  populationScale: Object.freeze({min: 0.1, max: 10, step: 0.1}),
  militaryScale: Object.freeze({min: 0.1, max: 10, step: 0.1}),
  precipitationScale: Object.freeze({min: 0.1, max: 5, step: 0.1})
});

export const DISTANCE_UNIT_OPTIONS = Object.freeze([
  distanceUnitOption("mm-cn", "毫米", "毫米", 0.000001, "mm2-cn", "平方毫米", "平方毫米"),
  distanceUnitOption("cm-cn", "厘米", "厘米", 0.00001, "cm2-cn", "平方厘米", "平方厘米"),
  distanceUnitOption("m-cn", "米", "米", 0.001, "m2-cn", "平方米", "平方米"),
  distanceUnitOption("km-cn", "千米", "千米", 1, "km2-cn", "平方公里", "平方公里"),
  distanceUnitOption("mm", "mm", "mm", 0.000001, "mm2", "mm²", "mm²"),
  distanceUnitOption("cm", "cm", "cm", 0.00001, "cm2", "cm²", "cm²"),
  distanceUnitOption("m", "m", "m", 0.001, "m2", "m²", "m²"),
  distanceUnitOption("km", "km", "km", 1, "km2", "km²", "km²"),
  distanceUnitOption("mi-cn", "英里", "英里", 1.609344, "mi2-cn", "平方英里", "平方英里"),
  distanceUnitOption("mi", "mi", "mi", 1.609344, "mi2", "mi²", "mi²"),
  distanceUnitOption("ft-cn", "英尺", "英尺", 0.0003048, "ft2-cn", "平方英尺", "平方英尺"),
  distanceUnitOption("ft", "ft", "ft", 0.0003048, "ft2", "ft²", "ft²"),
  distanceUnitOption("yd-cn", "码", "码", 0.0009144, "yd2-cn", "平方码", "平方码"),
  distanceUnitOption("yd", "yd", "yd", 0.0009144, "yd2", "yd²", "yd²"),
  distanceUnitOption("nmi-cn", "海里", "海里", 1.852, "nmi2-cn", "平方海里", "平方海里"),
  distanceUnitOption("nmi", "nmi", "nmi", 1.852, "nmi2", "nmi²", "nmi²")
]);

export const AREA_UNIT_OPTIONS = Object.freeze(DISTANCE_UNIT_OPTIONS.map(option => Object.freeze({
  value: option.areaValue,
  label: option.areaLabel,
  symbol: option.areaSymbol,
  squareKmPerUnit: option.kmPerUnit ** 2
})));

export const NUMBER_ABBREVIATION_OPTIONS = Object.freeze([
  Object.freeze({value: "wan", label: "万"}),
  Object.freeze({value: "thousand", label: "千"}),
  Object.freeze({value: "none", label: "完整"})
]);

const DISTANCE_UNITS = new Map(DISTANCE_UNIT_OPTIONS.map(option => [option.value, option]));
const AREA_UNITS = new Map(AREA_UNIT_OPTIONS.map(option => [option.value, option]));
const NUMBER_ABBREVIATIONS = new Map(NUMBER_ABBREVIATION_OPTIONS.map(option => [option.value, option]));

export function normalizeUnitPreferences(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const fallback = DEFAULT_UNIT_PREFERENCES;
  const customUnits = normalizeCustomUnitDefinitions(source.customUnits);
  const distanceUnit = resolveDistanceUnit(source.distanceUnit, customUnits)?.value || fallback.distanceUnit;
  return {
    distanceUnit,
    areaUnit: areaUnitForDistanceUnit(distanceUnit, source.areaUnit, {customUnits}),
    customUnits,
    numberAbbreviation: NUMBER_ABBREVIATIONS.has(source.numberAbbreviation) ? source.numberAbbreviation : fallback.numberAbbreviation,
    mapScaleKmPerCm: clampNumber(source.mapScaleKmPerCm, UNIT_SCALE_LIMITS.mapScaleKmPerCm, fallback.mapScaleKmPerCm),
    populationScale: clampNumber(source.populationScale, UNIT_SCALE_LIMITS.populationScale, fallback.populationScale),
    militaryScale: clampNumber(source.militaryScale, UNIT_SCALE_LIMITS.militaryScale, fallback.militaryScale),
    precipitationScale: clampNumber(source.precipitationScale, UNIT_SCALE_LIMITS.precipitationScale, fallback.precipitationScale)
  };
}

export function areaUnitForDistanceUnit(distanceUnit, fallbackAreaUnit = DEFAULT_UNIT_PREFERENCES.areaUnit, preferences = {}) {
  const resolved = resolveDistanceUnit(distanceUnit, normalizeCustomUnitDefinitions(preferences.customUnits));
  if (resolved?.areaValue) return resolved.areaValue;
  return AREA_UNITS.has(fallbackAreaUnit) ? fallbackAreaUnit : DEFAULT_UNIT_PREFERENCES.areaUnit;
}

export function areaUnitLabelForDistanceUnit(distanceUnit, preferences = {}) {
  const resolved = resolveDistanceUnit(distanceUnit, normalizeCustomUnitDefinitions(preferences.customUnits));
  return resolved?.areaLabel || AREA_UNITS.get(DEFAULT_UNIT_PREFERENCES.areaUnit).label;
}

export function distanceUnitOptionsForPreferences(preferences = {}) {
  const units = normalizeUnitPreferences(preferences);
  return [
    ...DISTANCE_UNIT_OPTIONS,
    ...units.customUnits.map(unit => ({value: customDistanceUnitValue(unit.id), label: `${unit.name}（${unit.symbol}）`}))
  ];
}

export function upsertCustomUnitDefinition(preferences = {}, definition = {}) {
  const units = normalizeUnitPreferences(preferences);
  const normalized = normalizeCustomUnitDefinition(definition);
  if (!normalized) throw new Error("自定义单位需要名称、符号和大于 0 的千米换算系数");
  const customUnits = units.customUnits.filter(unit => unit.id !== normalized.id);
  customUnits.push(normalized);
  return normalizeUnitPreferences({...units, customUnits, distanceUnit: customDistanceUnitValue(normalized.id)});
}

export function deleteCustomUnitDefinition(preferences = {}, id) {
  const units = normalizeUnitPreferences(preferences);
  const targetId = normalizeCustomUnitId(id);
  const customUnits = units.customUnits.filter(unit => unit.id !== targetId);
  const distanceUnit = units.distanceUnit === customDistanceUnitValue(targetId) ? DEFAULT_UNIT_PREFERENCES.distanceUnit : units.distanceUnit;
  return normalizeUnitPreferences({...units, customUnits, distanceUnit});
}

export function customUnitDefinitionForDistanceUnit(distanceUnit, preferences = {}) {
  const id = customUnitIdFromValue(distanceUnit);
  return id ? normalizeCustomUnitDefinitions(preferences.customUnits).find(unit => unit.id === id) || null : null;
}

export function mapUnitsToKm(value, preferences = {}) {
  const units = normalizeUnitPreferences(preferences);
  return numberOrZero(value) * units.mapScaleKmPerCm / CSS_PX_PER_CM;
}

export function mapUnitsToSquareKm(value, preferences = {}) {
  const units = normalizeUnitPreferences(preferences);
  const kmPerUnit = units.mapScaleKmPerCm / CSS_PX_PER_CM;
  return numberOrZero(value) * kmPerUnit * kmPerUnit;
}

export function formatDistance(value, preferences = {}) {
  const units = normalizeUnitPreferences(preferences);
  const km = mapUnitsToKm(value, units);
  const definition = resolveDistanceUnit(units.distanceUnit, units.customUnits) || DISTANCE_UNITS.get(DEFAULT_UNIT_PREFERENCES.distanceUnit);
  return `${formatNumber(km / definition.kmPerUnit, units, {maximumFractionDigits: 1})} ${definition.symbol}`;
}

export function formatArea(value, preferences = {}) {
  const units = normalizeUnitPreferences(preferences);
  const squareKm = mapUnitsToSquareKm(value, units);
  const definition = resolveDistanceUnit(units.distanceUnit, units.customUnits) || DISTANCE_UNITS.get(DEFAULT_UNIT_PREFERENCES.distanceUnit);
  return `${formatNumber(squareKm / definition.squareKmPerUnit, units, {maximumFractionDigits: 1})} ${definition.areaSymbol}`;
}

export function formatPopulation(value, preferences = {}) {
  const units = normalizeUnitPreferences(preferences);
  return `${formatNumber(populationUnitsToPeople(value, units), units, {maximumFractionDigits: 1})} 人`;
}

export function populationUnitsToPeople(value, preferences = {}) {
  const units = normalizeUnitPreferences(preferences);
  return numberOrZero(value) * INTERNAL_POPULATION_UNIT_PEOPLE * units.populationScale;
}

export function formatMilitary(value, preferences = {}) {
  const units = normalizeUnitPreferences(preferences);
  return formatNumber(militaryUnitsToPower(value, units), units, {maximumFractionDigits: 1});
}

export function militaryUnitsToPower(value, preferences = {}) {
  const units = normalizeUnitPreferences(preferences);
  return numberOrZero(value) * units.militaryScale;
}

export function formatPrecipitation(value, preferences = {}) {
  const millimeters = precipitationUnitsToMillimeters(value, preferences);
  return `${formatPlainNumber(millimeters, {maximumFractionDigits: millimeters >= 100 ? 0 : 1})} mm`;
}

export function precipitationUnitsToMillimeters(value, preferences = {}) {
  const units = normalizeUnitPreferences(preferences);
  return numberOrZero(value) * INTERNAL_PRECIPITATION_UNIT_MILLIMETERS * units.precipitationScale;
}

export function formatRiverFlow(value, preferences = {}) {
  const units = normalizeUnitPreferences(preferences);
  const flow = riverFluxToCubicMetersPerSecond(value, units);
  return formatCubicMetersPerSecond(flow);
}

export function riverFluxToCubicMetersPerSecond(value, preferences = {}) {
  const units = normalizeUnitPreferences(preferences);
  const scaleRatio = units.mapScaleKmPerCm / DEFAULT_UNIT_PREFERENCES.mapScaleKmPerCm;
  return numberOrZero(value) * INTERNAL_RIVER_FLOW_TO_CUBIC_METERS_PER_SECOND * scaleRatio * scaleRatio;
}

export function estimateRiverRunoffFlow(hydrology = {}, preferences = {}, coefficient = RIVER_RUNOFF_COEFFICIENTS.medium) {
  const areaKm2 = mapUnitsToSquareKm(hydrology.catchmentArea, preferences);
  const precipitationMm = precipitationUnitsToMillimeters(hydrology.averagePrecipitation, preferences);
  const runoffCoefficient = clampRunoffCoefficient(coefficient);
  return areaKm2 * 1000000 * (precipitationMm / 1000) * runoffCoefficient / SECONDS_PER_YEAR;
}

export function estimateRiverRunoffFlowRange(hydrology = {}, preferences = {}) {
  const low = estimateRiverRunoffFlow(hydrology, preferences, RIVER_RUNOFF_COEFFICIENTS.low);
  const medium = estimateRiverRunoffFlow(hydrology, preferences, RIVER_RUNOFF_COEFFICIENTS.medium);
  const high = estimateRiverRunoffFlow(hydrology, preferences, RIVER_RUNOFF_COEFFICIENTS.high);
  return {low, medium, high};
}

export function formatRiverRunoffFlowRange(hydrology = {}, preferences = {}) {
  const range = estimateRiverRunoffFlowRange(hydrology, preferences);
  return `${formatCubicMetersPerSecond(range.low)} .. ${formatCubicMetersPerSecond(range.high)}`;
}

export function formatCubicMetersPerSecond(value) {
  const flow = numberOrZero(value);
  return `${formatPlainNumber(flow, {maximumFractionDigits: flow >= 100 ? 0 : 1})} m³/s`;
}

export function formatScaleLabel(preferences = {}) {
  const units = normalizeUnitPreferences(preferences);
  return `1 cm = ${formatNumber(units.mapScaleKmPerCm, units, {maximumFractionDigits: 1})} km`;
}

export function formatScaleMultiplier(value) {
  return `${formatScaledNumber(value)}x`;
}

export function formatPlainNumber(value, {maximumFractionDigits = 1} = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0";
  return numeric.toLocaleString("zh-CN", {maximumFractionDigits});
}

export function formatNumber(value, preferences = {}, {maximumFractionDigits = 1, minimumCompactValue = null} = {}) {
  const units = normalizeUnitPreferences(preferences);
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0";
  const compact = compactNumber(numeric, units.numberAbbreviation, {maximumFractionDigits, minimumCompactValue});
  if (compact) return compact;
  return numeric.toLocaleString("zh-CN", {maximumFractionDigits});
}

export function formatHeight(value, preferences = {}, {heightExponent = 2, abs = false} = {}) {
  const height = heightUnitsToMeters(value, {heightExponent, abs});
  return `${formatNumber(height, preferences, {maximumFractionDigits: Math.abs(height) >= 100 ? 0 : 1})} 米`;
}

export function heightUnitsToMeters(value, {heightExponent = 2, abs = false} = {}) {
  const h = Number(value);
  if (!Number.isFinite(h)) return 0;
  let height = -990;
  if (h >= 20) height = (h - 18) ** heightExponent;
  else if (h < 20 && h > 0) height = ((h - 20) / h) * 50;
  if (abs) height = Math.abs(height);
  return Math.round(height * 10) / 10;
}

function formatScaledNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0";
  const compact = compactNumber(numeric, DEFAULT_UNIT_PREFERENCES.numberAbbreviation);
  if (compact) return compact;
  const abs = Math.abs(numeric);
  const maximumFractionDigits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return numeric.toLocaleString("zh-CN", {maximumFractionDigits});
}

function compactNumber(value, mode, {maximumFractionDigits = 1, minimumCompactValue = null} = {}) {
  const config = mode === "thousand"
    ? {divisor: 1000, suffix: "千", threshold: 1000}
    : mode === "wan"
      ? {divisor: 10000, suffix: "万", threshold: 10000}
      : null;
  if (!config) return "";
  const threshold = Number.isFinite(minimumCompactValue) ? minimumCompactValue : config.threshold;
  if (Math.abs(value) < threshold) return "";
  const scaled = value / config.divisor;
  const digits = Math.abs(scaled) >= 100 ? 0 : maximumFractionDigits;
  return `${scaled.toLocaleString("zh-CN", {maximumFractionDigits: digits})}${config.suffix}`;
}

function distanceUnitOption(value, label, symbol, kmPerUnit, areaValue, areaLabel, areaSymbol) {
  return Object.freeze({value, label, symbol, kmPerUnit, areaValue, areaLabel, areaSymbol, squareKmPerUnit: kmPerUnit ** 2});
}

function resolveDistanceUnit(value, customUnits = []) {
  const builtIn = DISTANCE_UNITS.get(value);
  if (builtIn) return builtIn;
  const id = customUnitIdFromValue(value);
  if (!id) return null;
  const custom = customUnits.find(unit => unit.id === id);
  if (!custom) return null;
  return {
    value: customDistanceUnitValue(custom.id),
    label: custom.name,
    symbol: custom.symbol,
    kmPerUnit: custom.kmPerUnit,
    areaValue: `custom-area:${custom.id}`,
    areaLabel: custom.areaName,
    areaSymbol: custom.areaSymbol,
    squareKmPerUnit: custom.squareKmPerUnit
  };
}

function normalizeCustomUnitDefinitions(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const normalized = [];
  for (const value of input.slice(0, 24)) {
    const unit = normalizeCustomUnitDefinition(value);
    if (!unit || seen.has(unit.id)) continue;
    seen.add(unit.id);
    normalized.push(unit);
  }
  return normalized;
}

function normalizeCustomUnitDefinition(input = {}) {
  if (!input || typeof input !== "object") return null;
  const id = normalizeCustomUnitId(input.id);
  const name = normalizeUnitText(input.name, 32);
  const symbol = normalizeUnitText(input.symbol, 12);
  const kmPerUnit = positiveFiniteNumber(input.kmPerUnit ?? input.kmFactor);
  if (!id || !name || !symbol || !kmPerUnit) return null;
  const hasExplicitArea = input.areaMode === "custom" || input.areaMode !== "derived" && Boolean(
    normalizeUnitText(input.areaName, 40)
    || normalizeUnitText(input.areaSymbol, 16)
    || positiveFiniteNumber(input.squareKmPerUnit ?? input.areaSquareKmFactor)
  );
  const areaMode = hasExplicitArea ? "custom" : "derived";
  const areaName = hasExplicitArea ? normalizeUnitText(input.areaName, 40) || `平方${name}` : `平方${name}`;
  const areaSymbol = hasExplicitArea ? normalizeUnitText(input.areaSymbol, 16) || `${symbol}²` : `${symbol}²`;
  const squareKmPerUnit = hasExplicitArea
    ? positiveFiniteNumber(input.squareKmPerUnit ?? input.areaSquareKmFactor) || kmPerUnit ** 2
    : kmPerUnit ** 2;
  return {id, name, symbol, kmPerUnit, areaMode, areaName, areaSymbol, squareKmPerUnit};
}

function normalizeCustomUnitId(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

function customDistanceUnitValue(id) {
  return `custom:${normalizeCustomUnitId(id)}`;
}

function customUnitIdFromValue(value) {
  const match = /^custom:([a-z0-9_-]+)$/.exec(String(value || "").trim().toLowerCase());
  return match?.[1] || "";
}

function normalizeUnitText(value, maxLength) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function positiveFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 && numeric <= 1e12 ? numeric : 0;
}

function clampNumber(value, limit, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(limit.min, Math.min(limit.max, roundToStep(numeric, limit.step)));
}

function roundToStep(value, step) {
  if (!Number.isFinite(step) || step <= 0) return value;
  const precision = decimalPrecision(step);
  return Number((Math.round(value / step) * step).toFixed(precision));
}

function decimalPrecision(value) {
  const text = String(value);
  const decimal = text.includes(".") ? text.split(".")[1] : "";
  return Math.min(12, decimal.length);
}

function clampRunoffCoefficient(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return RIVER_RUNOFF_COEFFICIENTS.medium;
  return Math.max(0, Math.min(1, numeric));
}

function numberOrZero(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}
