import {listUserVisualThemeDocuments, replaceUserVisualThemes} from "../renderer/themes.js";
import {systemAffected} from "./edit-command-effects.js";

export function captureVisualThemeState(map, preset) {
  return {
    preset: String(preset || map?.visualTheme?.preset || "default"),
    userThemes: listUserVisualThemeDocuments()
  };
}

export function createSetUserVisualThemesCommand(before, after, {label = "更新用户主题"} = {}) {
  const beforeState = normalizeState(before);
  const afterState = normalizeState(after);
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
    },
    revert(context) {
      applyState(context?.map, beforeState);
    },
    getResult() {
      return {preset: afterState.preset, userThemes: afterState.userThemes.length};
    }
  };
}

function applyState(map, state) {
  replaceUserVisualThemes(state.userThemes);
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
  return {
    preset: String(state?.preset || "default"),
    userThemes: Array.isArray(state?.userThemes) ? state.userThemes.map(cloneDocument) : []
  };
}

function cloneDocument(document) {
  return {...document, colors: {...(document?.colors || {})}};
}
