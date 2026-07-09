const CSS_PX_PER_CM = 96 / 2.54;
const INTERNAL_POPULATION_UNIT_PEOPLE = 1000;
const INTERNAL_PRECIPITATION_UNIT_MILLIMETERS = 100;
const INTERNAL_RIVER_FLOW_TO_CUBIC_METERS_PER_SECOND = 6;

export const DEFAULT_UNIT_PREFERENCES = Object.freeze({
  distanceUnit: "km-cn",
  areaUnit: "km2-cn",
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
  Object.freeze({value: "m-cn", label: "米"}),
  Object.freeze({value: "km-cn", label: "千米"}),
  Object.freeze({value: "m", label: "m"}),
  Object.freeze({value: "km", label: "km"})
]);

export const AREA_UNIT_OPTIONS = Object.freeze([
  Object.freeze({value: "m2-cn", label: "平方米"}),
  Object.freeze({value: "km2-cn", label: "平方公里"}),
  Object.freeze({value: "m2", label: "m²"}),
  Object.freeze({value: "km2", label: "km²"})
]);

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
  const distanceUnit = DISTANCE_UNITS.has(source.distanceUnit) ? source.distanceUnit : fallback.distanceUnit;
  return {
    distanceUnit,
    areaUnit: areaUnitForDistanceUnit(distanceUnit, source.areaUnit),
    numberAbbreviation: NUMBER_ABBREVIATIONS.has(source.numberAbbreviation) ? source.numberAbbreviation : fallback.numberAbbreviation,
    mapScaleKmPerCm: clampNumber(source.mapScaleKmPerCm, UNIT_SCALE_LIMITS.mapScaleKmPerCm, fallback.mapScaleKmPerCm),
    populationScale: clampNumber(source.populationScale, UNIT_SCALE_LIMITS.populationScale, fallback.populationScale),
    militaryScale: clampNumber(source.militaryScale, UNIT_SCALE_LIMITS.militaryScale, fallback.militaryScale),
    precipitationScale: clampNumber(source.precipitationScale, UNIT_SCALE_LIMITS.precipitationScale, fallback.precipitationScale)
  };
}

export function areaUnitForDistanceUnit(distanceUnit, fallbackAreaUnit = DEFAULT_UNIT_PREFERENCES.areaUnit) {
  if (distanceUnit === "m-cn") return "m2-cn";
  if (distanceUnit === "m") return "m2";
  if (distanceUnit === "km") return "km2";
  if (distanceUnit === "km-cn") return "km2-cn";
  return AREA_UNITS.has(fallbackAreaUnit) ? fallbackAreaUnit : DEFAULT_UNIT_PREFERENCES.areaUnit;
}

export function areaUnitLabelForDistanceUnit(distanceUnit) {
  const areaUnit = areaUnitForDistanceUnit(distanceUnit);
  return AREA_UNITS.get(areaUnit)?.label || AREA_UNITS.get(DEFAULT_UNIT_PREFERENCES.areaUnit).label;
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
  if (units.distanceUnit === "m-cn") return `${formatNumber(km * 1000, units, {maximumFractionDigits: 1})} 米`;
  if (units.distanceUnit === "m") return `${formatNumber(km * 1000, units, {maximumFractionDigits: 1})} m`;
  if (units.distanceUnit === "km") return `${formatNumber(km, units, {maximumFractionDigits: 1})} km`;
  return `${formatNumber(km, units, {maximumFractionDigits: 1})} 千米`;
}

export function formatArea(value, preferences = {}) {
  const units = normalizeUnitPreferences(preferences);
  const squareKm = mapUnitsToSquareKm(value, units);
  if (units.areaUnit === "m2-cn") return `${formatNumber(squareKm * 1000000, units, {maximumFractionDigits: 1})} 平方米`;
  if (units.areaUnit === "m2") return `${formatNumber(squareKm * 1000000, units, {maximumFractionDigits: 1})} m²`;
  if (units.areaUnit === "km2") return `${formatNumber(squareKm, units, {maximumFractionDigits: 1})} km²`;
  return `${formatNumber(squareKm, units, {maximumFractionDigits: 1})} 平方公里`;
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
  return `${formatPlainNumber(flow, {maximumFractionDigits: flow >= 100 ? 0 : 1})} m³/s`;
}

export function riverFluxToCubicMetersPerSecond(value, preferences = {}) {
  const units = normalizeUnitPreferences(preferences);
  const scaleRatio = units.mapScaleKmPerCm / DEFAULT_UNIT_PREFERENCES.mapScaleKmPerCm;
  return numberOrZero(value) * INTERNAL_RIVER_FLOW_TO_CUBIC_METERS_PER_SECOND * scaleRatio * scaleRatio;
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

function clampNumber(value, limit, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(limit.min, Math.min(limit.max, roundToStep(numeric, limit.step)));
}

function roundToStep(value, step) {
  if (!Number.isFinite(step) || step <= 0) return value;
  return Math.round(value / step) * step;
}

function numberOrZero(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}
