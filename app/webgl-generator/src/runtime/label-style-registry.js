export const LABEL_STYLE_VERSION = 1;

export const LABEL_STYLE_TYPE = Object.freeze({
  STATE: "state",
  PROVINCE: "province",
  CAPITAL: "capital",
  CITY: "city",
  CUSTOM: "custom"
});

export const LABEL_STYLE_TYPES = Object.freeze(Object.values(LABEL_STYLE_TYPE));

export const LABEL_FONT_FAMILIES = Object.freeze({
  system: "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
  serif: "Georgia, \"Times New Roman\", serif",
  sans: "\"Segoe UI\", Arial, sans-serif",
  condensed: "\"Arial Narrow\", \"Segoe UI\", sans-serif",
  mono: "Consolas, \"Courier New\", monospace"
});

export const LABEL_STYLE_DEFAULTS = Object.freeze({
  [LABEL_STYLE_TYPE.STATE]: freezeStyle({fontFamilyId: "serif", fontSize: 30, fontWeight: 700, italic: false, letterSpacing: 2, color: "#fff0b8", opacity: 0.92, strokeColor: "#16202a", strokeWidth: 0, shadowColor: "#16202a", shadowOffsetX: 0, shadowOffsetY: 1, shadowBlur: 2}),
  [LABEL_STYLE_TYPE.PROVINCE]: freezeStyle({fontFamilyId: "serif", fontSize: 18, fontWeight: 650, italic: false, letterSpacing: 1.2, color: "#fff0b8", opacity: 0.86, strokeColor: "#16202a", strokeWidth: 0, shadowColor: "#16202a", shadowOffsetX: 0, shadowOffsetY: 1, shadowBlur: 2}),
  [LABEL_STYLE_TYPE.CAPITAL]: freezeStyle({fontFamilyId: "serif", fontSize: 16, fontWeight: 800, italic: false, letterSpacing: 0.2, color: "#ffffff", opacity: 0.96, strokeColor: "#0d141b", strokeWidth: 0, shadowColor: "#0d141b", shadowOffsetX: 0, shadowOffsetY: 1, shadowBlur: 2}),
  [LABEL_STYLE_TYPE.CITY]: freezeStyle({fontFamilyId: "sans", fontSize: 13, fontWeight: 650, italic: false, letterSpacing: 0, color: "#ffffff", opacity: 0.94, strokeColor: "#0d141b", strokeWidth: 0, shadowColor: "#0d141b", shadowOffsetX: 0, shadowOffsetY: 1, shadowBlur: 2}),
  [LABEL_STYLE_TYPE.CUSTOM]: freezeStyle({fontFamilyId: "serif", fontSize: 15, fontWeight: 700, italic: false, letterSpacing: 0.4, color: "#f8ead0", opacity: 0.98, strokeColor: "#6a4d2f", strokeWidth: 0, shadowColor: "#0d141b", shadowOffsetX: 0, shadowOffsetY: 1, shadowBlur: 2})
});

const STYLE_FIELDS = Object.freeze(Object.keys(LABEL_STYLE_DEFAULTS[LABEL_STYLE_TYPE.CITY]));
const STYLE_FIELD_SET = new Set(STYLE_FIELDS);
const FONT_WEIGHT_VALUES = Object.freeze([300, 400, 500, 600, 650, 700, 800, 900]);
const NUMBER_RULES = Object.freeze({
  fontSize: [8, 72],
  letterSpacing: [-2, 12],
  opacity: [0, 1],
  strokeWidth: [0, 8],
  shadowOffsetX: [-20, 20],
  shadowOffsetY: [-20, 20],
  shadowBlur: [0, 30]
});

export function normalizeLabelStyleStore(source, {strict = false} = {}) {
  const overrides = {};
  if (strict && source !== undefined && (!source || typeof source !== "object" || Array.isArray(source))) {
    throw new Error("标签样式存储无效");
  }
  if (strict && source !== undefined && source.version !== LABEL_STYLE_VERSION) {
    throw new Error("标签样式存储版本无效");
  }
  if (strict && source) {
    for (const key of Object.keys(source)) {
      if (key !== "version" && key !== "overrides") throw new Error(`未知标签样式存储字段：${key}`);
    }
  }
  const input = source?.overrides;
  if (strict && source !== undefined && (!input || typeof input !== "object" || Array.isArray(input))) {
    throw new Error("标签样式覆盖表无效");
  }
  for (const styleType of LABEL_STYLE_TYPES) {
    if (!Object.hasOwn(input || {}, styleType)) continue;
    const override = normalizeLabelStyleOverride(input[styleType], {strict});
    if (Object.keys(override).length) overrides[styleType] = override;
  }
  if (strict && input) {
    for (const styleType of Object.keys(input)) assertLabelStyleType(styleType);
  }
  return {version: LABEL_STYLE_VERSION, overrides};
}

export function validateLabelStyleStore(source) {
  normalizeLabelStyleStore(source, {strict: true});
  return true;
}

export function ensureLabelStyleStore(map) {
  if (!map.labels || typeof map.labels !== "object") map.labels = {};
  map.labels.styles = normalizeLabelStyleStore(map.labels.styles);
  return map.labels.styles;
}

export function resolveLabelStyle(mapOrStore, styleType, visualTheme = null) {
  assertLabelStyleType(styleType);
  const store = mapOrStore?.labels?.styles || mapOrStore?.styles || mapOrStore;
  const override = normalizeLabelStyleStore(store).overrides[styleType] || {};
  const resolved = {
    ...LABEL_STYLE_DEFAULTS[styleType],
    ...themeStyleForType(visualTheme, styleType),
    ...override
  };
  return Object.freeze({...resolved, fontFamily: LABEL_FONT_FAMILIES[resolved.fontFamilyId]});
}

export function readLabelStyleOverride(mapOrStore, styleType) {
  assertLabelStyleType(styleType);
  const store = mapOrStore?.labels?.styles || mapOrStore?.styles || mapOrStore;
  return {...(normalizeLabelStyleStore(store).overrides[styleType] || {})};
}

export function patchLabelStyle(map, styleType, patch) {
  assertLabelStyleType(styleType);
  const store = ensureLabelStyleStore(map);
  const normalizedPatch = normalizeLabelStyleOverride(patch, {strict: true});
  const next = {...(store.overrides[styleType] || {}), ...normalizedPatch};
  if (Object.keys(next).length) store.overrides[styleType] = next;
  else delete store.overrides[styleType];
  return readLabelStyleOverride(store, styleType);
}

export function resetLabelStyle(map, styleType) {
  assertLabelStyleType(styleType);
  const store = ensureLabelStyleStore(map);
  delete store.overrides[styleType];
}

export function resetAllLabelStyles(map) {
  ensureLabelStyleStore(map).overrides = {};
}

export function labelStyleTypeForTarget(targetKind, item = null) {
  if (targetKind === LABEL_STYLE_TYPE.STATE) return LABEL_STYLE_TYPE.STATE;
  if (targetKind === LABEL_STYLE_TYPE.PROVINCE) return LABEL_STYLE_TYPE.PROVINCE;
  if (targetKind === LABEL_STYLE_TYPE.CUSTOM) return LABEL_STYLE_TYPE.CUSTOM;
  return item?.capital ? LABEL_STYLE_TYPE.CAPITAL : LABEL_STYLE_TYPE.CITY;
}

export function estimateLabelTextBox(text, style) {
  const value = String(text || "");
  const fontSize = Number(style?.fontSize) || 13;
  const letterSpacing = Number(style?.letterSpacing) || 0;
  let width = 0;
  for (const character of value) width += fontSize * (/[\u2E80-\u9FFF]/u.test(character) ? 0.96 : /[A-ZMW]/.test(character) ? 0.72 : 0.57);
  width += Math.max(0, value.length - 1) * letterSpacing;
  const stroke = Math.max(0, Number(style?.strokeWidth) || 0);
  const shadowX = Math.abs(Number(style?.shadowOffsetX) || 0);
  const shadowY = Math.abs(Number(style?.shadowOffsetY) || 0);
  const shadowBlur = Math.max(0, Number(style?.shadowBlur) || 0);
  return Object.freeze({
    width: Math.max(fontSize, width) + stroke * 2 + shadowX + shadowBlur,
    height: fontSize * 1.28 + stroke * 2 + shadowY + shadowBlur
  });
}

function normalizeLabelStyleOverride(source, {strict = false} = {}) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    if (strict) throw new Error("标签样式覆盖无效");
    return {};
  }
  const result = {};
  for (const [field, value] of Object.entries(source)) {
    if (!STYLE_FIELD_SET.has(field)) {
      if (strict) throw new Error(`未知标签样式字段：${field}`);
      continue;
    }
    if (field === "fontFamilyId") {
      if (!Object.hasOwn(LABEL_FONT_FAMILIES, value)) {
        if (strict) throw new Error(`不支持的标签字体：${value}`);
        continue;
      }
      result[field] = value;
      continue;
    }
    if (field === "fontWeight") {
      const numeric = Number(value);
      if (!FONT_WEIGHT_VALUES.includes(numeric)) {
        if (strict) throw new Error(`不支持的标签字重：${value}`);
        continue;
      }
      result[field] = numeric;
      continue;
    }
    if (field === "italic") {
      if (typeof value !== "boolean") {
        if (strict) throw new Error("标签斜体字段必须为布尔值");
        continue;
      }
      result[field] = value;
      continue;
    }
    if (field === "color" || field === "strokeColor" || field === "shadowColor") {
      const color = normalizeHexColor(value);
      if (!color) {
        if (strict) throw new Error(`标签颜色无效：${value}`);
        continue;
      }
      result[field] = color;
      continue;
    }
    const range = NUMBER_RULES[field];
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      if (strict) throw new Error(`标签样式数值无效：${field}`);
      continue;
    }
    result[field] = clamp(numeric, range[0], range[1]);
  }
  return result;
}

function themeStyleForType(theme, styleType) {
  const labels = theme?.labels || {};
  const stateLike = styleType === LABEL_STYLE_TYPE.STATE || styleType === LABEL_STYLE_TYPE.PROVINCE;
  const custom = styleType === LABEL_STYLE_TYPE.CUSTOM;
  const color = stateLike ? labels.state : custom ? labels.custom : labels.city;
  const halo = stateLike ? labels.stateShadow : custom ? labels.customBorder : labels.cityHalo;
  const result = {};
  if (Array.isArray(color)) {
    result.color = rgbaToHex(color);
    if (Number.isFinite(Number(color[3]))) result.opacity = clamp(Number(color[3]), 0, 1);
  }
  if (Array.isArray(halo)) {
    result.strokeColor = rgbaToHex(halo);
    result.shadowColor = rgbaToHex(halo);
  }
  return result;
}

function rgbaToHex(color) {
  return `#${color.slice(0, 3).map(value => clamp(Math.round(Number(value || 0) * 255), 0, 255).toString(16).padStart(2, "0")).join("")}`;
}

function normalizeHexColor(value) {
  const match = String(value || "").trim().match(/^#([\da-f]{6})$/i);
  return match ? `#${match[1].toLowerCase()}` : "";
}

function assertLabelStyleType(styleType) {
  if (!LABEL_STYLE_TYPES.includes(styleType)) throw new Error(`未知标签样式类型：${styleType}`);
}

function freezeStyle(style) {
  return Object.freeze(style);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
