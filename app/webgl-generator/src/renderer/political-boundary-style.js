export const POLITICAL_BOUNDARY_SOFTNESS_MIN = 0;
export const POLITICAL_BOUNDARY_SOFTNESS_MAX = 100;
export const DEFAULT_POLITICAL_BOUNDARY_SOFTNESS = 50;

export function normalizePoliticalBoundarySoftness(value, fallback = DEFAULT_POLITICAL_BOUNDARY_SOFTNESS) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return normalizeFallback(fallback);
  return Math.max(POLITICAL_BOUNDARY_SOFTNESS_MIN, Math.min(POLITICAL_BOUNDARY_SOFTNESS_MAX, Math.round(numeric)));
}

export function resolvePoliticalBoundaryStroke(style, color, softness = DEFAULT_POLITICAL_BOUNDARY_SOFTNESS) {
  const normalized = normalizePoliticalBoundarySoftness(softness);
  const factors = politicalBoundarySoftnessFactors(normalized);
  const sourceColor = Array.isArray(color) || ArrayBuffer.isView(color) ? color : style.borderStroke;
  const alpha = Math.max(0, Math.min(1, Number(sourceColor?.[3]) || 0));
  return {
    softness: normalized,
    widthWorld: style.borderWidthWorld * factors.width,
    color: [
      Number(sourceColor?.[0]) || 0,
      Number(sourceColor?.[1]) || 0,
      Number(sourceColor?.[2]) || 0,
      Math.min(1, alpha * factors.alpha)
    ]
  };
}

export function politicalBoundarySoftnessFactors(value) {
  const softness = normalizePoliticalBoundarySoftness(value);
  if (softness <= DEFAULT_POLITICAL_BOUNDARY_SOFTNESS) {
    const amount = softness / DEFAULT_POLITICAL_BOUNDARY_SOFTNESS;
    return {
      width: interpolate(3, 1, amount),
      alpha: interpolate(2.2, 1, amount)
    };
  }
  const amount = (softness - DEFAULT_POLITICAL_BOUNDARY_SOFTNESS) / (POLITICAL_BOUNDARY_SOFTNESS_MAX - DEFAULT_POLITICAL_BOUNDARY_SOFTNESS);
  return {
    width: interpolate(1, 0.72, amount),
    alpha: interpolate(1, 0.55, amount)
  };
}

function normalizeFallback(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_POLITICAL_BOUNDARY_SOFTNESS;
  return Math.max(POLITICAL_BOUNDARY_SOFTNESS_MIN, Math.min(POLITICAL_BOUNDARY_SOFTNESS_MAX, Math.round(numeric)));
}

function interpolate(from, to, amount) {
  return from + (to - from) * amount;
}
