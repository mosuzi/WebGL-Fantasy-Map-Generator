export function isAncientTheme(theme) {
  return theme?.id === "ancient";
}

export function ancientDisplayColor(color) {
  if (!Array.isArray(color) || color.length < 3) return color;
  const [red, green, blue] = color.map(channel => clamp(Number(channel) || 0));
  const alpha = color[3] ?? 1;
  const warm = red >= green && green >= blue
    && red - green <= 0.34 && green - blue <= 0.36
    && (green - blue >= 1.35 * (red - green) - 0.015
      || red < 0.55 && green - blue >= 0.7 * (red - green))
    && (red < 0.65 || green >= 0.36);
  if (warm) return [red, green, blue, alpha];
  const light = red * 0.25 + green * 0.62 + blue * 0.13;
  return [
    clamp(0.17 + 0.68 * light + 0.08 * red),
    clamp(0.15 + 0.62 * light + 0.04 * green),
    clamp(0.075 + 0.43 * light + 0.04 * blue),
    alpha
  ];
}

export function ancientDisplayHex(value) {
  const match = /^#?([\da-f]{6})$/i.exec(String(value || "").trim());
  if (!match) return value;
  const hex = match[1];
  const color = [0, 2, 4].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  return `#${ancientDisplayColor(color).slice(0, 3).map(channel => Math.round(channel * 255).toString(16).padStart(2, "0")).join("")}`;
}

export function ancientMetricStops(type) {
  const source = type === "temperature"
    ? [[0.2, 0.38, 0.72, 1], [0.82, 0.32, 0.2, 1]]
    : [[0.72, 0.62, 0.36, 1], [0.16, 0.48, 0.68, 1]];
  return source.map(ancientDisplayColor);
}

export const ANCIENT_COLOR_PROJECTION_GLSL = `
vec4 projectAncientColor(vec4 color) {
  vec3 rgb = clamp(color.rgb, 0.0, 1.0);
  bool warm = rgb.r >= rgb.g && rgb.g >= rgb.b
    && rgb.r - rgb.g <= 0.34 && rgb.g - rgb.b <= 0.36
    && (rgb.g - rgb.b >= 1.35 * (rgb.r - rgb.g) - 0.015
      || rgb.r < 0.55 && rgb.g - rgb.b >= 0.7 * (rgb.r - rgb.g))
    && (rgb.r < 0.65 || rgb.g >= 0.36);
  if (warm) return vec4(rgb, color.a);
  float light = dot(rgb, vec3(0.25, 0.62, 0.13));
  return vec4(clamp(vec3(
    0.17 + 0.68 * light + 0.08 * rgb.r,
    0.15 + 0.62 * light + 0.04 * rgb.g,
    0.075 + 0.43 * light + 0.04 * rgb.b
  ), 0.0, 1.0), color.a);
}`;

function clamp(value) {
  return Math.max(0, Math.min(1, value));
}
