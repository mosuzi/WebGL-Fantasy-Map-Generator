export const MILITARY_LABEL_BACKGROUND_ALPHA = 0.42;

const DEFAULT_STATE_COLOR = "#6f7773";
const BACKGROUND_RGB = Object.freeze([12, 18, 19]);

export function resolveMilitaryLabelPalette(stateColor) {
  const stateRgb = parseHexColor(stateColor) || parseHexColor(DEFAULT_STATE_COLOR);
  return Object.freeze({
    stateColor: hexColor(stateRgb),
    background: rgbaColor(BACKGROUND_RGB, MILITARY_LABEL_BACKGROUND_ALPHA),
    border: hexColor(stateRgb)
  });
}

function parseHexColor(value) {
  const hex = String(value || "").trim().replace(/^#/, "");
  if (!/^(?:[\da-f]{3}|[\da-f]{6})$/i.test(hex)) return null;
  const normalized = hex.length === 3 ? [...hex].map(character => character.repeat(2)).join("") : hex;
  return [0, 2, 4].map(offset => Number.parseInt(normalized.slice(offset, offset + 2), 16));
}

function hexColor(rgb) {
  return `#${rgb.map(channel => channel.toString(16).padStart(2, "0")).join("")}`;
}

function rgbaColor(rgb, alpha) {
  return `rgba(${rgb.join(", ")}, ${alpha})`;
}
