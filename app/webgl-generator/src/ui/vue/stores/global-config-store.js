import {useLocalStorage} from "@vueuse/core";
import {defineStore} from "pinia";

export const CONTROL_PREFERENCES_KEY = "webgl-generator-control-preferences";

const DEFAULT_CONTROL_PREFERENCES = Object.freeze({
  colorMode: "height",
  showOceanHeight: false,
  maxCityLabels: 5000,
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
    return patchPreferences({
      layers: {
        ...(preferences.value.layers || {}),
        [layer]: Boolean(visible)
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
    layers: patch.layers ? {...(current.layers || {}), ...patch.layers} : current.layers || {}
  };
}

function normalizePreferences(input = {}) {
  return {
    colorMode: typeof input.colorMode === "string" ? input.colorMode : DEFAULT_CONTROL_PREFERENCES.colorMode,
    showOceanHeight: typeof input.showOceanHeight === "boolean" ? input.showOceanHeight : DEFAULT_CONTROL_PREFERENCES.showOceanHeight,
    maxCityLabels: normalizeMaxCityLabels(input.maxCityLabels),
    layers: input.layers && typeof input.layers === "object" ? {...input.layers} : {}
  };
}

function normalizeMaxCityLabels(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_CONTROL_PREFERENCES.maxCityLabels;
  return Math.max(8, Math.min(5000, Math.round(number)));
}
