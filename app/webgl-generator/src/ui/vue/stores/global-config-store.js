import {useLocalStorage} from "@vueuse/core";
import {defineStore} from "pinia";
import {DEFAULT_UNIT_PREFERENCES, normalizeUnitPreferences} from "../../display-units.js";

export const CONTROL_PREFERENCES_KEY = "webgl-generator-control-preferences";

const DEFAULT_CONTROL_PREFERENCES = Object.freeze({
  colorMode: "height",
  showOceanHeight: false,
  smoothCellBorders: true,
  showHoverInfo: true,
  climateRangeRatioLocked: true,
  maxCityLabels: 5000,
  units: Object.freeze({...DEFAULT_UNIT_PREFERENCES}),
  layers: Object.freeze({})
});

export const useGlobalConfigStore = defineStore("global-config", () => {
  const preferences = useLocalStorage(CONTROL_PREFERENCES_KEY, {...DEFAULT_CONTROL_PREFERENCES}, {mergeDefaults: true});

  function readPreferences() {
    return normalizePreferences(preferences.value);
  }

  function patchPreferences(patch = {}) {
    preferences.value = normalizePreferences(mergePreferences(preferences.value, patch));
    return readPreferences();
  }

  function setLayerVisible(layer, visible) {
    if (!layer) return readPreferences();
    const patch = layerVisibilityPatch(layer, visible);
    return patchPreferences({
      layers: {
        ...(preferences.value.layers || {}),
        ...patch
      }
    });
  }

  return {
    preferences,
    readPreferences,
    patchPreferences,
    setLayerVisible
  };
});

function mergePreferences(current = {}, patch = {}) {
  return {
    ...current,
    ...patch,
    units: patch.units ? normalizeUnitPreferences({...current.units, ...patch.units}) : normalizeUnitPreferences(current.units),
    layers: patch.layers ? {...(current.layers || {}), ...patch.layers} : current.layers || {}
  };
}

function normalizePreferences(input = {}) {
  return {
    colorMode: typeof input.colorMode === "string" ? input.colorMode : DEFAULT_CONTROL_PREFERENCES.colorMode,
    showOceanHeight: typeof input.showOceanHeight === "boolean" ? input.showOceanHeight : DEFAULT_CONTROL_PREFERENCES.showOceanHeight,
    smoothCellBorders: typeof input.smoothCellBorders === "boolean" ? input.smoothCellBorders : DEFAULT_CONTROL_PREFERENCES.smoothCellBorders,
    showHoverInfo: typeof input.showHoverInfo === "boolean"
      ? input.showHoverInfo
      : typeof input.showHoverOverlay === "boolean"
        ? input.showHoverOverlay
        : DEFAULT_CONTROL_PREFERENCES.showHoverInfo,
    climateRangeRatioLocked: typeof input.climateRangeRatioLocked === "boolean" ? input.climateRangeRatioLocked : DEFAULT_CONTROL_PREFERENCES.climateRangeRatioLocked,
    maxCityLabels: normalizeMaxCityLabels(input.maxCityLabels),
    units: normalizeUnitPreferences(input.units),
    layers: normalizeLayerPreferences(input.layers)
  };
}

function layerVisibilityPatch(layer, visible) {
  const value = Boolean(visible);
  return layer === "coastline" ? {coastline: value, lakeShore: value} : {[layer]: value};
}

function normalizeLayerPreferences(layers) {
  const normalized = layers && typeof layers === "object" ? {...layers} : {};
  delete normalized.tradeFlows;
  if (Object.prototype.hasOwnProperty.call(normalized, "coastline")) normalized.lakeShore = normalized.coastline;
  return normalized;
}

function normalizeMaxCityLabels(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_CONTROL_PREFERENCES.maxCityLabels;
  return Math.max(8, Math.min(5000, Math.round(number)));
}
