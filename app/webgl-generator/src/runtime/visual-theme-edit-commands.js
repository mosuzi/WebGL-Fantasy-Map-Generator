import {listUserVisualThemeDocuments, replaceUserVisualThemes} from "../renderer/themes.js";
import {systemAffected} from "./edit-command-effects.js";

export function captureVisualThemeState(map, presentationPreset) {
  const preset = String(map?.visualTheme?.preset || map?.options?.visualTheme || "default");
  return {
    preset,
    presentationPreset: String(presentationPreset || preset),
    userThemes: Array.isArray(map?.visualTheme?.userThemes) ? map.visualTheme.userThemes.map(cloneDocument) : [],
    registryUserThemes: listUserVisualThemeDocuments()
  };
}

export function createSetUserVisualThemesCommand(before, after, {label = "更新用户主题"} = {}) {
  const beforeState = normalizeState(before);
  const afterState = normalizeState(after);
  let activeState = beforeState;
  return {
    label,
    domain: "visual-theme",
    effects: {
      render: "draw",
      selection: "none",
      runtimeStats: true,
      pickPanel: false,
      derived: ["visual-theme"],
      affected: systemAffected("visual-theme")
    },
    isNoop() {
      return JSON.stringify(beforeState) === JSON.stringify(afterState);
    },
    apply(context) {
      applyState(context?.map, afterState);
      activeState = afterState;
    },
    revert(context) {
      applyState(context?.map, beforeState);
      activeState = beforeState;
    },
    getResult() {
      return {preset: afterState.preset, userThemes: afterState.userThemes.length};
    },
    getPresentationPreset() {
      return activeState.presentationPreset;
    }
  };
}

function applyState(map, state) {
  replaceUserVisualThemes(state.registryUserThemes);
  if (!map) return;
  map.visualTheme = {
    ...(map.visualTheme || {}),
    version: 2,
    preset: state.preset,
    overrides: map.visualTheme?.overrides && typeof map.visualTheme.overrides === "object" ? {...map.visualTheme.overrides} : {},
    userThemes: state.userThemes.map(cloneDocument)
  };
  map.options = {...(map.options || {}), visualTheme: state.preset};
}

function normalizeState(state) {
  const preset = String(state?.preset || "default");
  const userThemes = Array.isArray(state?.userThemes) ? state.userThemes.map(cloneDocument) : [];
  return {
    preset,
    presentationPreset: String(state?.presentationPreset || preset),
    userThemes,
    registryUserThemes: Array.isArray(state?.registryUserThemes) ? state.registryUserThemes.map(cloneDocument) : userThemes.map(cloneDocument)
  };
}

function cloneDocument(document) {
  return {...document, colors: {...(document?.colors || {})}};
}
