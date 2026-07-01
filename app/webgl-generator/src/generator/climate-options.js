export const DEFAULT_CLIMATE_LATITUDE_MODE = "auto";
export const DEFAULT_ATMOSPHERE_DIRECTION = "auto";

export const CLIMATE_LATITUDE_OPTIONS = Object.freeze([
  Object.freeze({value: "auto", label: "自动纬度"}),
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
  Object.freeze({value: "west", label: "西风", angle: 90}),
  Object.freeze({value: "east", label: "东风", angle: 270}),
  Object.freeze({value: "north", label: "北风", angle: 180}),
  Object.freeze({value: "south", label: "南风", angle: 0}),
  Object.freeze({value: "northwest", label: "西北风", angle: 135}),
  Object.freeze({value: "northeast", label: "东北风", angle: 225}),
  Object.freeze({value: "southwest", label: "西南风", angle: 45}),
  Object.freeze({value: "southeast", label: "东南风", angle: 315})
]);

const LATITUDE_OPTIONS_BY_VALUE = new Map(CLIMATE_LATITUDE_OPTIONS.map(option => [option.value, option]));
const ATMOSPHERE_OPTIONS_BY_VALUE = new Map(ATMOSPHERE_DIRECTION_OPTIONS.map(option => [option.value, option]));

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

function normalizeWindAngles(values) {
  const source = Array.isArray(values) && values.length ? values : [225, 45, 225, 315, 135, 315];
  return source.map(value => {
    const angle = Number(value);
    if (!Number.isFinite(angle)) return 0;
    return ((Math.round(angle) % 360) + 360) % 360;
  });
}
