export const VISUAL_THEME_PRESETS = Object.freeze([
  {
    id: "default",
    label: "默认",
    canvas: {background: [0.36, 0.49, 0.64, 1]},
    effects: {canvasFilter: "none"},
    water: {fill: [0.37, 0.56, 0.76, 1]},
    lines: {
      coastline: [0.7, 0.76, 0.78, 0.58],
      lakeShore: [0.62, 0.76, 0.8, 0.54],
      stateBorder: [0.36, 0.34, 0.3, 0.34],
      provinceBorder: [0.45, 0.43, 0.38, 0.22],
      routePrimary: [0.56, 0.47, 0.34, 0.88],
      routeSecondary: [0.5, 0.43, 0.33, 0.8],
      routeMinor: [0.43, 0.38, 0.31, 0.64]
    },
    labels: {
      city: [0.11, 0.075, 0.04, 0.97],
      cityHalo: [0.95, 0.9, 0.77, 0.58],
      state: [0.26, 0.15, 0.055, 0.88],
      stateShadow: [0.96, 0.9, 0.75, 0.54],
      custom: [0.25, 0.14, 0.05, 0.96],
      customHalo: [0.96, 0.9, 0.75, 0.58],
      customBackground: [0.92, 0.84, 0.63, 0.48],
      customBorder: [0.29, 0.18, 0.08, 0.32]
    },
    scaleBar: {
      foreground: [0.93, 0.96, 0.96, 1],
      text: [0.95, 0.97, 0.98, 0.94],
      background: [0.05, 0.07, 0.09, 0.74],
      border: [0.82, 0.87, 0.88, 0.24]
    },
    legend: {
      text: [0.88, 0.93, 0.95, 1],
      muted: [0.88, 0.93, 0.95, 0.88],
      background: [0.05, 0.07, 0.09, 0.78],
      border: [0.82, 0.87, 0.88, 0.24],
      swatchBorder: [1, 1, 1, 0.28]
    },
    terrain: {
      heightRamp: [
        [20, [0.5, 0.63, 0.46, 1]],
        [36, [0.62, 0.68, 0.5, 1]],
        [56, [0.7, 0.67, 0.54, 1]],
        [76, [0.75, 0.71, 0.62, 1]],
        [92, [0.81, 0.79, 0.72, 1]],
        [100, [0.87, 0.86, 0.82, 1]]
      ]
    }
  },
  {
    id: "ancient",
    label: "古地图",
    canvas: {background: [0.55, 0.49, 0.36, 1]},
    effects: {canvasFilter: "sepia(0.32) saturate(0.82) contrast(1.06) brightness(1.03)"},
    water: {fill: [0.51, 0.62, 0.63, 1]},
    lines: {
      coastline: [0.42, 0.36, 0.24, 0.46],
      lakeShore: [0.45, 0.42, 0.28, 0.4],
      stateBorder: [0.31, 0.24, 0.15, 0.42],
      provinceBorder: [0.38, 0.3, 0.19, 0.28],
      routePrimary: [0.47, 0.31, 0.16, 0.9],
      routeSecondary: [0.42, 0.29, 0.18, 0.78],
      routeMinor: [0.36, 0.28, 0.2, 0.62]
    },
    labels: {
      city: [0.17, 0.11, 0.06, 1],
      cityHalo: [0.87, 0.78, 0.56, 0.72],
      state: [0.37, 0.22, 0.08, 0.92],
      stateShadow: [0.96, 0.86, 0.58, 0.52],
      custom: [0.36, 0.21, 0.08, 1],
      customBackground: [0.84, 0.73, 0.48, 0.72],
      customBorder: [0.36, 0.21, 0.08, 0.36]
    },
    scaleBar: {
      foreground: [0.31, 0.2, 0.1, 1],
      text: [0.28, 0.17, 0.08, 0.94],
      background: [0.86, 0.76, 0.52, 0.72],
      border: [0.36, 0.22, 0.08, 0.24]
    },
    legend: {
      text: [0.26, 0.15, 0.07, 1],
      muted: [0.28, 0.17, 0.08, 0.88],
      background: [0.84, 0.73, 0.48, 0.76],
      border: [0.36, 0.22, 0.08, 0.26],
      swatchBorder: [0.34, 0.2, 0.08, 0.34]
    },
    terrain: {
      heightRamp: [
        [20, [0.64, 0.59, 0.39, 1]],
        [38, [0.73, 0.67, 0.47, 1]],
        [58, [0.78, 0.7, 0.52, 1]],
        [78, [0.83, 0.76, 0.61, 1]],
        [100, [0.9, 0.84, 0.72, 1]]
      ]
    }
  },
  {
    id: "atlas",
    label: "浅色图册",
    canvas: {background: [0.78, 0.86, 0.88, 1]},
    effects: {canvasFilter: "saturate(0.9) brightness(1.07) contrast(0.97)"},
    water: {fill: [0.64, 0.79, 0.86, 1]},
    lines: {
      coastline: [0.46, 0.59, 0.62, 0.5],
      lakeShore: [0.46, 0.62, 0.66, 0.44],
      stateBorder: [0.28, 0.35, 0.4, 0.38],
      provinceBorder: [0.38, 0.44, 0.48, 0.24],
      routePrimary: [0.56, 0.43, 0.25, 0.84],
      routeSecondary: [0.52, 0.42, 0.3, 0.72],
      routeMinor: [0.45, 0.38, 0.3, 0.56]
    },
    labels: {
      city: [0.08, 0.13, 0.15, 1],
      cityHalo: [0.96, 0.98, 0.92, 0.72],
      state: [0.2, 0.28, 0.34, 0.92],
      stateShadow: [0.94, 0.97, 0.9, 0.56],
      custom: [0.08, 0.13, 0.15, 1],
      customBackground: [0.92, 0.96, 0.9, 0.72],
      customBorder: [0.35, 0.45, 0.42, 0.28]
    },
    scaleBar: {
      foreground: [0.18, 0.27, 0.31, 1],
      text: [0.18, 0.25, 0.29, 0.94],
      background: [0.93, 0.97, 0.94, 0.72],
      border: [0.26, 0.36, 0.4, 0.24]
    },
    legend: {
      text: [0.15, 0.23, 0.27, 1],
      muted: [0.18, 0.25, 0.29, 0.88],
      background: [0.93, 0.97, 0.94, 0.76],
      border: [0.26, 0.36, 0.4, 0.24],
      swatchBorder: [0.25, 0.36, 0.4, 0.3]
    },
    terrain: {
      heightRamp: [
        [20, [0.76, 0.83, 0.61, 1]],
        [40, [0.82, 0.84, 0.66, 1]],
        [60, [0.86, 0.8, 0.67, 1]],
        [80, [0.89, 0.84, 0.75, 1]],
        [100, [0.93, 0.91, 0.86, 1]]
      ]
    }
  },
  {
    id: "dark-seas",
    label: "暗海",
    canvas: {background: [0.08, 0.16, 0.2, 1]},
    effects: {canvasFilter: "saturate(0.78) brightness(0.86) contrast(1.16)"},
    water: {fill: [0.08, 0.22, 0.3, 1]},
    lines: {
      coastline: [0.55, 0.74, 0.77, 0.54],
      lakeShore: [0.5, 0.68, 0.73, 0.44],
      stateBorder: [0.76, 0.69, 0.47, 0.42],
      provinceBorder: [0.72, 0.67, 0.55, 0.26],
      routePrimary: [0.78, 0.64, 0.4, 0.88],
      routeSecondary: [0.66, 0.56, 0.38, 0.76],
      routeMinor: [0.55, 0.48, 0.36, 0.58]
    },
    labels: {
      city: [0.89, 0.89, 0.72, 1],
      cityHalo: [0.03, 0.06, 0.08, 0.72],
      state: [0.94, 0.78, 0.45, 0.92],
      stateShadow: [0.01, 0.02, 0.03, 0.84],
      custom: [0.95, 0.85, 0.56, 1],
      customBackground: [0.04, 0.09, 0.12, 0.78],
      customBorder: [0.74, 0.62, 0.38, 0.34]
    },
    scaleBar: {
      foreground: [0.84, 0.92, 0.92, 1],
      text: [0.84, 0.92, 0.92, 0.94],
      background: [0.02, 0.05, 0.07, 0.78],
      border: [0.68, 0.8, 0.82, 0.24]
    },
    legend: {
      text: [0.84, 0.92, 0.92, 1],
      muted: [0.78, 0.88, 0.88, 0.88],
      background: [0.02, 0.05, 0.07, 0.8],
      border: [0.68, 0.8, 0.82, 0.24],
      swatchBorder: [0.9, 0.95, 0.9, 0.28]
    },
    terrain: {
      heightRamp: [
        [20, [0.4, 0.54, 0.36, 1]],
        [40, [0.5, 0.58, 0.38, 1]],
        [60, [0.58, 0.54, 0.38, 1]],
        [80, [0.66, 0.6, 0.5, 1]],
        [100, [0.75, 0.73, 0.68, 1]]
      ]
    }
  },
  {
    id: "monochrome",
    label: "单色",
    canvas: {background: [0.56, 0.6, 0.58, 1]},
    effects: {canvasFilter: "grayscale(0.9) saturate(0.28) contrast(1.1) brightness(1.02)"},
    water: {fill: [0.62, 0.68, 0.66, 1]},
    lines: {
      coastline: [0.38, 0.42, 0.4, 0.46],
      lakeShore: [0.42, 0.46, 0.44, 0.4],
      stateBorder: [0.25, 0.25, 0.24, 0.36],
      provinceBorder: [0.33, 0.33, 0.32, 0.24],
      routePrimary: [0.34, 0.33, 0.31, 0.82],
      routeSecondary: [0.4, 0.39, 0.36, 0.68],
      routeMinor: [0.45, 0.43, 0.4, 0.52]
    },
    labels: {
      city: [0.12, 0.13, 0.12, 1],
      cityHalo: [0.9, 0.9, 0.86, 0.7],
      state: [0.16, 0.16, 0.15, 0.9],
      stateShadow: [0.86, 0.86, 0.82, 0.54],
      custom: [0.12, 0.13, 0.12, 1],
      customBackground: [0.88, 0.88, 0.82, 0.72],
      customBorder: [0.3, 0.3, 0.28, 0.3]
    },
    scaleBar: {
      foreground: [0.16, 0.17, 0.16, 1],
      text: [0.16, 0.17, 0.16, 0.94],
      background: [0.88, 0.88, 0.82, 0.72],
      border: [0.25, 0.26, 0.25, 0.24]
    },
    legend: {
      text: [0.14, 0.15, 0.14, 1],
      muted: [0.16, 0.17, 0.16, 0.88],
      background: [0.88, 0.88, 0.82, 0.76],
      border: [0.25, 0.26, 0.25, 0.24],
      swatchBorder: [0.22, 0.23, 0.22, 0.32]
    },
    terrain: {
      heightRamp: [
        [20, [0.58, 0.61, 0.57, 1]],
        [40, [0.65, 0.67, 0.63, 1]],
        [60, [0.73, 0.73, 0.69, 1]],
        [80, [0.82, 0.8, 0.76, 1]],
        [100, [0.9, 0.88, 0.84, 1]]
      ]
    }
  },
  {
    id: "night",
    label: "夜间",
    canvas: {background: [0.03, 0.06, 0.1, 1]},
    effects: {canvasFilter: "brightness(0.72) contrast(1.18) saturate(0.7) hue-rotate(190deg)"},
    water: {fill: [0.05, 0.13, 0.22, 1]},
    lines: {
      coastline: [0.3, 0.58, 0.72, 0.5],
      lakeShore: [0.26, 0.5, 0.66, 0.42],
      stateBorder: [0.82, 0.72, 0.46, 0.42],
      provinceBorder: [0.7, 0.66, 0.52, 0.25],
      routePrimary: [0.72, 0.58, 0.33, 0.9],
      routeSecondary: [0.58, 0.5, 0.34, 0.76],
      routeMinor: [0.46, 0.42, 0.34, 0.58]
    },
    labels: {
      city: [0.86, 0.9, 0.76, 1],
      cityHalo: [0.01, 0.03, 0.05, 0.78],
      state: [0.95, 0.78, 0.45, 0.94],
      stateShadow: [0, 0.01, 0.02, 0.88],
      custom: [0.95, 0.84, 0.58, 1],
      customBackground: [0.02, 0.05, 0.08, 0.82],
      customBorder: [0.74, 0.62, 0.38, 0.36]
    },
    scaleBar: {
      foreground: [0.82, 0.9, 0.9, 1],
      text: [0.84, 0.92, 0.92, 0.94],
      background: [0.01, 0.03, 0.05, 0.82],
      border: [0.56, 0.72, 0.78, 0.28]
    },
    legend: {
      text: [0.84, 0.92, 0.92, 1],
      muted: [0.76, 0.86, 0.88, 0.88],
      background: [0.01, 0.03, 0.05, 0.84],
      border: [0.56, 0.72, 0.78, 0.28],
      swatchBorder: [0.9, 0.95, 0.9, 0.3]
    },
    terrain: {
      heightRamp: [
        [20, [0.14, 0.24, 0.19, 1]],
        [40, [0.2, 0.31, 0.23, 1]],
        [60, [0.29, 0.34, 0.25, 1]],
        [80, [0.38, 0.38, 0.32, 1]],
        [100, [0.56, 0.54, 0.48, 1]]
      ]
    }
  }
]);

export const DEFAULT_VISUAL_THEME_ID = "default";
export const VISUAL_THEME_DOCUMENT_TYPE = "webgl-generator-visual-theme";
export const VISUAL_THEME_DOCUMENT_VERSION = 1;
export const VISUAL_THEME_COLOR_KEYS = Object.freeze([
  "land",
  "water",
  "stateBorder",
  "provinceBorder",
  "roads",
  "primaryLabel",
  "scaleBarForeground",
  "scaleBarBackground"
]);

const USER_VISUAL_THEMES = new Map();
const VISUAL_THEME_DOCUMENT_KEYS = new Set(["type", "version", "id", "label", "base", "colors"]);

export function visualThemeOptions() {
  return [
    ...VISUAL_THEME_PRESETS.map(theme => ({value: theme.id, label: theme.label, user: false})),
    ...[...USER_VISUAL_THEMES.values()].map(theme => ({value: theme.id, label: theme.label, user: true}))
  ];
}

export function normalizeVisualThemeId(value) {
  const id = String(value || DEFAULT_VISUAL_THEME_ID);
  return VISUAL_THEME_PRESETS.some(theme => theme.id === id) || USER_VISUAL_THEMES.has(id) ? id : DEFAULT_VISUAL_THEME_ID;
}

export function resolveVisualTheme(value) {
  const id = normalizeVisualThemeId(value);
  const userTheme = USER_VISUAL_THEMES.get(id);
  if (userTheme) return materializeUserVisualTheme(userTheme);
  return VISUAL_THEME_PRESETS.find(theme => theme.id === id) || VISUAL_THEME_PRESETS[0];
}

export function listVisualThemes() {
  return visualThemeOptions().map(option => ({...option}));
}

export function listUserVisualThemeDocuments() {
  return [...USER_VISUAL_THEMES.values()].map(cloneVisualThemeDocument);
}

export function isUserVisualTheme(themeId) {
  return USER_VISUAL_THEMES.has(String(themeId || ""));
}

export function replaceUserVisualThemes(documents = []) {
  if (!Array.isArray(documents)) throw new Error("用户主题列表必须是数组");
  const normalized = documents.map(document => normalizeVisualThemeDocument(document));
  USER_VISUAL_THEMES.clear();
  for (const document of normalized) USER_VISUAL_THEMES.set(document.id, document);
  return listUserVisualThemeDocuments();
}

export function mergeUserVisualThemes(documents = []) {
  if (!Array.isArray(documents)) throw new Error("用户主题列表必须是数组");
  for (const source of documents) {
    const document = normalizeVisualThemeDocument(source);
    USER_VISUAL_THEMES.set(document.id, document);
  }
  return listUserVisualThemeDocuments();
}

export function upsertUserVisualTheme(document) {
  const normalized = normalizeVisualThemeDocument(document);
  USER_VISUAL_THEMES.set(normalized.id, normalized);
  return cloneVisualThemeDocument(normalized);
}

export function removeUserVisualTheme(themeId) {
  return USER_VISUAL_THEMES.delete(String(themeId || ""));
}

export function createUserVisualThemeDocument({label = "", baseThemeId = DEFAULT_VISUAL_THEME_ID} = {}) {
  const base = normalizeBuiltinVisualThemeId(baseThemeId);
  const baseTheme = resolveVisualTheme(base);
  const fallbackLabel = `${baseTheme.label} 自定义`;
  const normalizedLabel = normalizeVisualThemeLabel(label || fallbackLabel);
  const id = uniqueUserVisualThemeId(normalizedLabel);
  return normalizeVisualThemeDocument({
    type: VISUAL_THEME_DOCUMENT_TYPE,
    version: VISUAL_THEME_DOCUMENT_VERSION,
    id,
    label: normalizedLabel,
    base,
    colors: editableColorsFromTheme(baseTheme)
  });
}

export function exportVisualThemeDocument(themeId) {
  const id = normalizeVisualThemeId(themeId);
  if (isUserVisualTheme(id)) return cloneVisualThemeDocument(USER_VISUAL_THEMES.get(id));
  const theme = resolveVisualTheme(id);
  return normalizeVisualThemeDocument({
    type: VISUAL_THEME_DOCUMENT_TYPE,
    version: VISUAL_THEME_DOCUMENT_VERSION,
    id: uniqueUserVisualThemeId(`${id}-copy`),
    label: `${theme.label} 副本`,
    base: id,
    colors: editableColorsFromTheme(theme)
  });
}

export function updateUserVisualThemeDocument(themeId, colorPatch = {}) {
  const current = USER_VISUAL_THEMES.get(String(themeId || ""));
  if (!current) throw new Error(`找不到用户主题：${themeId}`);
  if (!colorPatch || typeof colorPatch !== "object" || Array.isArray(colorPatch)) throw new Error("主题颜色补丁必须是对象");
  for (const key of Object.keys(colorPatch)) {
    if (!VISUAL_THEME_COLOR_KEYS.includes(key)) throw new Error(`未知主题颜色 token：${key}`);
  }
  return normalizeVisualThemeDocument({...current, colors: {...current.colors, ...colorPatch}});
}

export function normalizeVisualThemeDocument(source) {
  const document = typeof source === "string" ? parseVisualThemeDocument(source) : source;
  if (!document || typeof document !== "object" || Array.isArray(document)) throw new Error("主题文档必须是 JSON 对象");
  for (const key of Object.keys(document)) {
    if (!VISUAL_THEME_DOCUMENT_KEYS.has(key)) throw new Error(`未知主题字段：${key}`);
  }
  if (document.type !== VISUAL_THEME_DOCUMENT_TYPE) throw new Error("文件不是 WebGL 视觉主题");
  if (Number(document.version) !== VISUAL_THEME_DOCUMENT_VERSION) throw new Error(`不支持的主题版本：${document.version}`);
  const id = normalizeUserVisualThemeId(document.id);
  const label = normalizeVisualThemeLabel(document.label);
  const base = normalizeBuiltinVisualThemeId(document.base);
  const colors = normalizeVisualThemeColors(document.colors);
  return {type: VISUAL_THEME_DOCUMENT_TYPE, version: VISUAL_THEME_DOCUMENT_VERSION, id, label, base, colors};
}

export function colorArrayToHex(color) {
  if (!Array.isArray(color) || color.length < 3) return "#000000";
  return `#${color.slice(0, 3).map(channel => Math.round(clampColorChannel(channel) * 255).toString(16).padStart(2, "0")).join("")}`;
}

function parseVisualThemeDocument(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("主题文件不是有效 JSON");
  }
}

function normalizeVisualThemeColors(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) throw new Error("主题文档缺少 colors 对象");
  for (const key of Object.keys(source)) {
    if (!VISUAL_THEME_COLOR_KEYS.includes(key)) throw new Error(`未知主题颜色 token：${key}`);
  }
  const colors = {};
  for (const key of VISUAL_THEME_COLOR_KEYS) {
    if (!Object.hasOwn(source, key)) throw new Error(`主题文档缺少颜色 token：${key}`);
    colors[key] = normalizeHexColor(source[key], key);
  }
  return colors;
}

function normalizeHexColor(value, key) {
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value.trim())) throw new Error(`主题颜色 ${key} 必须是 #rrggbb`);
  return value.trim().toLowerCase();
}

function normalizeBuiltinVisualThemeId(value) {
  const id = String(value || DEFAULT_VISUAL_THEME_ID);
  if (!VISUAL_THEME_PRESETS.some(theme => theme.id === id)) throw new Error(`未知内置主题：${value}`);
  return id;
}

function normalizeUserVisualThemeId(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!/^user-[a-z0-9][a-z0-9-]{0,62}$/.test(raw)) throw new Error("用户主题 id 必须以 user- 开头，并只包含小写字母、数字和连字符");
  if (VISUAL_THEME_PRESETS.some(theme => theme.id === raw)) throw new Error(`用户主题 id 与内置主题冲突：${raw}`);
  return raw;
}

function normalizeVisualThemeLabel(value) {
  const label = String(value || "").trim();
  if (!label || label.length > 40) throw new Error("用户主题名称长度必须为 1 到 40 个字符");
  return label;
}

function uniqueUserVisualThemeId(value) {
  const slug = String(value || "theme").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "theme";
  const prefix = slug.startsWith("user-") ? slug : `user-${slug}`;
  let id = prefix;
  let index = 2;
  while (USER_VISUAL_THEMES.has(id) || VISUAL_THEME_PRESETS.some(theme => theme.id === id)) id = `${prefix}-${index++}`;
  return id;
}

function editableColorsFromTheme(theme) {
  return {
    land: colorArrayToHex(theme.land?.fill || theme.terrain?.heightRamp?.[0]?.[1]),
    water: colorArrayToHex(theme.water?.fill || theme.canvas?.background),
    stateBorder: colorArrayToHex(theme.lines?.stateBorder),
    provinceBorder: colorArrayToHex(theme.lines?.provinceBorder),
    roads: colorArrayToHex(theme.lines?.routePrimary),
    primaryLabel: colorArrayToHex(theme.labels?.city || theme.legend?.text),
    scaleBarForeground: colorArrayToHex(theme.scaleBar?.foreground),
    scaleBarBackground: colorArrayToHex(theme.scaleBar?.background)
  };
}

function materializeUserVisualTheme(document) {
  const base = VISUAL_THEME_PRESETS.find(theme => theme.id === document.base) || VISUAL_THEME_PRESETS[0];
  const theme = deepCloneTheme(base);
  const colors = document.colors;
  theme.id = document.id;
  theme.label = document.label;
  theme.user = true;
  theme.base = document.base;
  theme.land = {fill: hexToColorArray(colors.land, 1)};
  theme.water.fill = hexToColorArray(colors.water, theme.water.fill?.[3]);
  theme.canvas.background = hexToColorArray(colors.water, theme.canvas.background?.[3]);
  theme.lines.stateBorder = hexToColorArray(colors.stateBorder, theme.lines.stateBorder?.[3]);
  theme.lines.provinceBorder = hexToColorArray(colors.provinceBorder, theme.lines.provinceBorder?.[3]);
  theme.lines.routePrimary = hexToColorArray(colors.roads, theme.lines.routePrimary?.[3]);
  theme.lines.routeSecondary = hexToColorArray(colors.roads, theme.lines.routeSecondary?.[3]);
  theme.lines.routeMinor = hexToColorArray(colors.roads, theme.lines.routeMinor?.[3]);
  for (const key of ["city", "state", "custom"]) theme.labels[key] = hexToColorArray(colors.primaryLabel, theme.labels[key]?.[3]);
  theme.legend.text = hexToColorArray(colors.primaryLabel, theme.legend.text?.[3]);
  theme.legend.muted = hexToColorArray(colors.primaryLabel, theme.legend.muted?.[3]);
  theme.scaleBar.foreground = hexToColorArray(colors.scaleBarForeground, theme.scaleBar.foreground?.[3]);
  theme.scaleBar.text = hexToColorArray(colors.scaleBarForeground, theme.scaleBar.text?.[3]);
  theme.scaleBar.background = hexToColorArray(colors.scaleBarBackground, theme.scaleBar.background?.[3]);
  return theme;
}

function deepCloneTheme(theme) {
  return {
    ...theme,
    canvas: {...theme.canvas},
    effects: {...theme.effects},
    water: {...theme.water},
    lines: {...theme.lines},
    labels: {...theme.labels},
    scaleBar: {...theme.scaleBar},
    legend: {...theme.legend},
    terrain: {...theme.terrain, heightRamp: theme.terrain.heightRamp.map(([height, color]) => [height, [...color]])}
  };
}

function hexToColorArray(hex, alpha = 1) {
  return [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255).concat(Number.isFinite(alpha) ? alpha : 1);
}

function clampColorChannel(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}

function cloneVisualThemeDocument(document) {
  return {...document, colors: {...document.colors}};
}
