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

export function drawLandMaskedTriangles(gl, range) {
  if (range?.count > 0) {
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.depthFunc(gl.GREATER);
    gl.drawArrays(gl.TRIANGLES, range.first || 0, range.count);
  }
  restoreOverlayDepthState(gl);
}

export function restoreOverlayDepthState(gl) {
  gl.disable(gl.DEPTH_TEST);
  gl.depthMask(false);
  gl.depthFunc(gl.LESS);
}
