import {routeWorldWidth} from "./line-width-projection.js";

export const SELECTED_ROUTE_COLOR = Object.freeze([1, 0.82, 0.34, 1]);

const DEFAULT_ROUTE_COLORS = Object.freeze({
  primary: Object.freeze([0.56, 0.47, 0.34, 0.88]),
  secondary: Object.freeze([0.5, 0.43, 0.33, 0.8]),
  minor: Object.freeze([0.43, 0.38, 0.31, 0.64])
});

export function resolveRouteStyle(route, visualTheme) {
  const level = route.level === "primary" ? "primary" : route.level === "secondary" ? "secondary" : "minor";
  const color = visualTheme?.lines?.[`route${capitalize(level)}`] || DEFAULT_ROUTE_COLORS[level];
  return {
    color,
    seaColor: [1, 1, 1, color[3]],
    worldWidth: routeWorldWidth(level)
  };
}

export function emptyRouteDrawRanges() {
  return {
    ordinary: {first: 0, count: 0},
    seaLand: {first: 0, count: 0},
    seaWater: {first: 0, count: 0}
  };
}

export function drawRouteMeshBatches(gl, ranges) {
  const ordinary = ranges?.ordinary;
  const seaLand = ranges?.seaLand;
  const seaWater = ranges?.seaWater;
  if (seaLand?.count > 0 || seaWater?.count > 0) {
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false);
    if (seaLand?.count > 0) {
      gl.depthFunc(gl.GREATER);
      gl.drawArrays(gl.TRIANGLES, seaLand.first, seaLand.count);
    }
    if (seaWater?.count > 0) {
      gl.depthFunc(gl.LESS);
      gl.drawArrays(gl.TRIANGLES, seaWater.first, seaWater.count);
    }
  }
  gl.disable(gl.DEPTH_TEST);
  gl.depthMask(false);
  gl.depthFunc(gl.LESS);
  if (ordinary?.count > 0) gl.drawArrays(gl.TRIANGLES, ordinary.first, ordinary.count);
}

function capitalize(value) {
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}
