import {listUserVisualThemeDocuments, mergeUserVisualThemes, replaceUserVisualThemes} from "../renderer/themes.js";

export const USER_VISUAL_THEME_STORAGE_KEY = "webgl-generator-user-visual-themes-v1";

export function loadUserVisualThemes(storage) {
  if (!storage?.getItem) return [];
  const text = storage.getItem(USER_VISUAL_THEME_STORAGE_KEY);
  if (!text) return [];
  try {
    const documents = JSON.parse(text);
    return replaceUserVisualThemes(Array.isArray(documents) ? documents : []);
  } catch {
    return [];
  }
}

export function mergePersistedUserVisualThemes(storage, documents = []) {
  const themes = mergeUserVisualThemes(Array.isArray(documents) ? documents : []);
  persistUserVisualThemes(storage);
  return themes;
}

export function persistUserVisualThemes(storage) {
  const documents = listUserVisualThemeDocuments();
  storage?.setItem?.(USER_VISUAL_THEME_STORAGE_KEY, JSON.stringify(documents));
  return documents;
}
