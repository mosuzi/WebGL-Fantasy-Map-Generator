export const DEFAULT_CLIMATE_LATITUDE_MODE = "auto";
export const DEFAULT_ATMOSPHERE_DIRECTION = "auto";

export const CLIMATE_LATITUDE_OPTIONS = Object.freeze([
  Object.freeze({value: "auto", label: "自动纬度"}),
  Object.freeze({value: "custom", label: "自定义纬度", center: 0, span: 45}),
  Object.freeze({value: "equatorial", label: "赤道带", center: 0, span: 45}),
  Object.freeze({value: "northSubtropical", label: "北亚热带", center: 25, span: 40}),
  Object.freeze({value: "northTemperate", label: "北温带", center: 45, span: 40}),
  Object.freeze({value: "northBoreal", label: "北寒带", center: 65, span: 35}),
  Object.freeze({value: "southSubtropical", label: "南亚热带", center: -25, span: 40}),
  Object.freeze({value: "southTemperate", label: "南温带", center: -45, span: 40}),
  Object.freeze({value: "southBoreal", label: "南寒带", center: -65, span: 35})
]);

export const ATMOSPHERE_DIRECTION_OPTIONS = Object.freeze([
  Object.freeze({value: "auto", label: "自动风带"}),
  Object.freeze({value: "customBands", label: "自定义风带", custom: true}),
  Object.freeze({value: "west", label: "西风", angle: 90}),
  Object.freeze({value: "east", label: "东风", angle: 270}),
  Object.freeze({value: "north", label: "北风", angle: 180}),
  Object.freeze({value: "south", label: "南风", angle: 0}),
  Object.freeze({value: "northwest", label: "西北风", angle: 135}),
  Object.freeze({value: "northeast", label: "东北风", angle: 225}),
  Object.freeze({value: "southwest", label: "西南风", angle: 45}),
  Object.freeze({value: "southeast", label: "东南风", angle: 315})
]);

export const WIND_DIRECTION_OPTIONS = Object.freeze([
  Object.freeze({value: "northeast", label: "东北", angle: 225, arrow: "↙"}),
  Object.freeze({value: "southeast", label: "东南", angle: 315, arrow: "↖"}),
  Object.freeze({value: "northwest", label: "西北", angle: 135, arrow: "↘"}),
  Object.freeze({value: "southwest", label: "西南", angle: 45, arrow: "↗"})
]);

export const WIND_BAND_OPTIONS = Object.freeze([
  Object.freeze({value: 0, label: "北极带", range: "90°N-60°N"}),
  Object.freeze({value: 1, label: "北温带", range: "60°N-30°N"}),
  Object.freeze({value: 2, label: "北热带", range: "30°N-0°"}),
  Object.freeze({value: 3, label: "南热带", range: "0°-30°S"}),
  Object.freeze({value: 4, label: "南温带", range: "30°S-60°S"}),
  Object.freeze({value: 5, label: "南极带", range: "60°S-90°S"})
]);

const LATITUDE_OPTIONS_BY_VALUE = new Map(CLIMATE_LATITUDE_OPTIONS.map(option => [option.value, option]));
const ATMOSPHERE_OPTIONS_BY_VALUE = new Map(ATMOSPHERE_DIRECTION_OPTIONS.map(option => [option.value, option]));
const WIND_DIRECTIONS_BY_VALUE = new Map(WIND_DIRECTION_OPTIONS.map(option => [option.value, option]));
const WIND_DIRECTIONS_BY_ANGLE = new Map(WIND_DIRECTION_OPTIONS.map(option => [option.angle, option]));

export function normalizeClimateLatitudeMode(value) {
  const key = typeof value === "string" ? value : DEFAULT_CLIMATE_LATITUDE_MODE;
  return LATITUDE_OPTIONS_BY_VALUE.has(key) ? key : DEFAULT_CLIMATE_LATITUDE_MODE;
}

export function normalizeAtmosphereDirection(value) {
  const key = typeof value === "string" ? value : DEFAULT_ATMOSPHERE_DIRECTION;
  return ATMOSPHERE_OPTIONS_BY_VALUE.has(key) ? key : DEFAULT_ATMOSPHERE_DIRECTION;
}

export function resolveClimateLatitudePreset(value) {
  const mode = normalizeClimateLatitudeMode(value);
  const option = LATITUDE_OPTIONS_BY_VALUE.get(mode);
  return option?.center === undefined ? null : option;
}

export function resolveAtmosphereWindProfile(value, fallbackWinds) {
  const direction = normalizeAtmosphereDirection(value);
  const option = ATMOSPHERE_OPTIONS_BY_VALUE.get(direction) || ATMOSPHERE_OPTIONS_BY_VALUE.get(DEFAULT_ATMOSPHERE_DIRECTION);
  const fallback = normalizeWindAngles(fallbackWinds);
  if (option.custom) {
    return {
      direction: option.value,
      label: option.label,
      angle: null,
      winds: fallback
    };
  }

  if (option.angle === undefined) {
    return {
      direction: option.value,
      label: option.label,
      angle: null,
      winds: fallback
    };
  }

  return {
    direction: option.value,
    label: option.label,
    angle: option.angle,
    winds: fallback.map(() => option.angle)
  };
}

export function climateLatitudeLabel(value) {
  return LATITUDE_OPTIONS_BY_VALUE.get(normalizeClimateLatitudeMode(value))?.label || "自动纬度";
}

export function atmosphereDirectionLabel(value) {
  return ATMOSPHERE_OPTIONS_BY_VALUE.get(normalizeAtmosphereDirection(value))?.label || "自动风带";
}

export function normalizeWindProfile(values) {
  const angles = Array.isArray(values) ? values : typeof values === "string" ? values.split(",") : [];
  const normalized = normalizeWindAngles(angles);
  while (normalized.length < WIND_BAND_OPTIONS.length) normalized.push(defaultWindProfile()[normalized.length]);
  return normalized.slice(0, WIND_BAND_OPTIONS.length);
}

export function defaultWindProfile() {
  return normalizeWindAngles([225, 45, 225, 315, 135, 315]);
}

export function windDirectionValueFromAngle(angle) {
  const normalized = normalizeWindAngles([angle])[0];
  return WIND_DIRECTIONS_BY_ANGLE.get(normalized)?.value || "northeast";
}

export function windAngleFromDirection(value) {
  return WIND_DIRECTIONS_BY_VALUE.get(value)?.angle ?? WIND_DIRECTION_OPTIONS[0].angle;
}

export function windDirectionLabelFromAngle(angle) {
  const normalized = normalizeWindAngles([angle])[0];
  return WIND_DIRECTIONS_BY_ANGLE.get(normalized)?.label || `${normalized}°`;
}

function normalizeWindAngles(values) {
  const source = Array.isArray(values) && values.length ? values : [225, 45, 225, 315, 135, 315];
  return source.map(value => {
    const angle = Number(value);
    if (!Number.isFinite(angle)) return 0;
    return ((Math.round(angle) % 360) + 360) % 360;
  });
}
