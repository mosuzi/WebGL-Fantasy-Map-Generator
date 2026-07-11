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
      city: [0.06, 0.08, 0.07, 1],
      cityHalo: [0.96, 0.94, 0.85, 0.72],
      state: [1, 0.91, 0.68, 0.92],
      stateShadow: [0.02, 0.03, 0.04, 0.82],
      custom: [0.97, 0.91, 0.73, 1],
      customBackground: [0.08, 0.11, 0.11, 0.74],
      customBorder: [0.93, 0.84, 0.57, 0.34]
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

export function visualThemeOptions() {
  return VISUAL_THEME_PRESETS.map(theme => ({value: theme.id, label: theme.label}));
}

export function normalizeVisualThemeId(value) {
  const id = String(value || DEFAULT_VISUAL_THEME_ID);
  return VISUAL_THEME_PRESETS.some(theme => theme.id === id) ? id : DEFAULT_VISUAL_THEME_ID;
}

export function resolveVisualTheme(value) {
  const id = normalizeVisualThemeId(value);
  return VISUAL_THEME_PRESETS.find(theme => theme.id === id) || VISUAL_THEME_PRESETS[0];
}
