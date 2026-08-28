export const DEFAULT_STATE_BORDER_BLEND = Object.freeze({
  enabled: false,
  widthWorld: 7,
  strength: 0.25
});

export function normalizeStateBorderBlendStyle(source = DEFAULT_STATE_BORDER_BLEND) {
  const input = source && typeof source === "object" && !Array.isArray(source) ? source : {};
  return {
    enabled: input.enabled === true,
    widthWorld: clampNumber(input.widthWorld, 1, 24, DEFAULT_STATE_BORDER_BLEND.widthWorld),
    strength: clampNumber(input.strength, 0, 1, DEFAULT_STATE_BORDER_BLEND.strength)
  };
}

function clampNumber(value, minimum, maximum, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, number));
}
