export const SURFACE_SIDE_ALPHA = Object.freeze({
  land: 0.25,
  water: 0.75
});

export function surfaceSideAlpha(side) {
  return side === "land" ? SURFACE_SIDE_ALPHA.land : SURFACE_SIDE_ALPHA.water;
}

export function withSurfaceSideAlpha(color, side) {
  return [color[0], color[1], color[2], surfaceSideAlpha(side)];
}
