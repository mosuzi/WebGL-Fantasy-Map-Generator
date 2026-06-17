export function roundMs(value) {
  return Math.round(value * 100) / 100;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function clampIndex(value, length) {
  return Math.max(0, Math.min(length - 1, value));
}
