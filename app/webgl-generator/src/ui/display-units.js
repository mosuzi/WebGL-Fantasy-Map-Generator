const CSS_PX_PER_CM = 96 / 2.54;

export const DEFAULT_UNIT_PREFERENCES = Object.freeze({
  distanceUnit: "km-cn",
  areaUnit: "km2-cn",
  mapScaleKmPerCm: 100,
  populationScale: 1,
  precipitationScale: 1
});

export const UNIT_SCALE_LIMITS = Object.freeze({
  mapScaleKmPerCm: Object.freeze({min: 1, max: 1000, step: 1}),
  populationScale: Object.freeze({min: 0.1, max: 10, step: 0.1}),
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

const DISTANCE_UNITS = new Map(DISTANCE_UNIT_OPTIONS.map(option => [option.value, option]));
const AREA_UNITS = new Map(AREA_UNIT_OPTIONS.map(option => [option.value, option]));

export function normalizeUnitPreferences(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const fallback = DEFAULT_UNIT_PREFERENCES;
  return {
    distanceUnit: DISTANCE_UNITS.has(source.distanceUnit) ? source.distanceUnit : fallback.distanceUnit,
    areaUnit: AREA_UNITS.has(source.areaUnit) ? source.areaUnit : fallback.areaUnit,
    mapScaleKmPerCm: clampNumber(source.mapScaleKmPerCm, UNIT_SCALE_LIMITS.mapScaleKmPerCm, fallback.mapScaleKmPerCm),
    populationScale: clampNumber(source.populationScale, UNIT_SCALE_LIMITS.populationScale, fallback.populationScale),
    precipitationScale: clampNumber(source.precipitationScale, UNIT_SCALE_LIMITS.precipitationScale, fallback.precipitationScale)
  };
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
  if (units.distanceUnit === "m-cn") return `${formatScaledNumber(km * 1000)} 米`;
  if (units.distanceUnit === "m") return `${formatScaledNumber(km * 1000)} m`;
  if (units.distanceUnit === "km") return `${formatScaledNumber(km)} km`;
  return `${formatScaledNumber(km)} 千米`;
}

export function formatArea(value, preferences = {}) {
  const units = normalizeUnitPreferences(preferences);
  const squareKm = mapUnitsToSquareKm(value, units);
  if (units.areaUnit === "m2-cn") return `${formatScaledNumber(squareKm * 1000000)} 平方米`;
  if (units.areaUnit === "m2") return `${formatScaledNumber(squareKm * 1000000)} m²`;
  if (units.areaUnit === "km2") return `${formatScaledNumber(squareKm)} km²`;
  return `${formatScaledNumber(squareKm)} 平方公里`;
}

export function formatPopulation(value, preferences = {}) {
  const units = normalizeUnitPreferences(preferences);
  return `${formatWholeNumber(numberOrZero(value) * units.populationScale)} 人`;
}

export function formatPrecipitation(value, preferences = {}) {
  const units = normalizeUnitPreferences(preferences);
  return `${formatScaledNumber(numberOrZero(value) * units.precipitationScale)} mm`;
}

export function formatScaleLabel(preferences = {}) {
  const units = normalizeUnitPreferences(preferences);
  return `1 cm = ${formatScaledNumber(units.mapScaleKmPerCm)} km`;
}

export function formatScaleMultiplier(value) {
  return `${formatScaledNumber(value)}x`;
}

export function formatPlainNumber(value, {maximumFractionDigits = 1} = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0";
  return numeric.toLocaleString("zh-CN", {maximumFractionDigits});
}

function formatWholeNumber(value) {
  const numeric = Math.round(Number(value) || 0);
  return numeric.toLocaleString("zh-CN");
}

function formatScaledNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0";
  const abs = Math.abs(numeric);
  const maximumFractionDigits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return numeric.toLocaleString("zh-CN", {maximumFractionDigits});
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
