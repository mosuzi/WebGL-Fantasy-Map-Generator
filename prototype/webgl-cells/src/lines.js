import {getBoundaryColor, getRiverColor, getRouteColor} from "./colors.js";
import {clamp} from "./utils.js";

export const LINE_LAYER_IDS = ["stateBorders", "provinceBorders", "routes", "rivers"];

export function buildLineBuffers(snapshot) {
  const layers = createLineLayers();

  buildBoundaryLines(snapshot, layers.stateBorders, "state");
  buildBoundaryLines(snapshot, layers.provinceBorders, "province");
  buildRouteLines(snapshot, layers.routes);
  buildRiverLines(snapshot, layers.rivers);

  for (const layer of Object.values(layers)) {
    layer.positions = new Float32Array(layer.positions);
    layer.colors = new Float32Array(layer.colors);
    layer.vertexCount = layer.positions.length / 2;
    if (layer.primitive === "lines") layer.segmentCount = layer.vertexCount / 2;
    if (layer.primitive === "triangles") layer.triangleCount = layer.vertexCount / 3;
  }

  return {
    layers,
    stats: {
      stateBorderSegments: layers.stateBorders.segmentCount,
      provinceBorderSegments: layers.provinceBorders.segmentCount,
      routeCount: Array.isArray(snapshot.routes) ? snapshot.routes.length : 0,
      routeSegments: layers.routes.segmentCount,
      routeTriangles: layers.routes.triangleCount,
      routeGroups: layers.routes.groups,
      riverCount: Array.isArray(snapshot.rivers) ? snapshot.rivers.length : 0,
      riverSegments: layers.rivers.segmentCount,
      riverTriangles: layers.rivers.triangleCount,
      riverMouthsClipped: layers.rivers.mouthsClipped,
      riverOpenEnds: layers.rivers.openEnds,
      riverMinWidth: layers.rivers.minWidth === Infinity ? 0 : layers.rivers.minWidth,
      riverMaxWidth: layers.rivers.maxWidth,
      riverFallback: layers.rivers.fallback
    }
  };
}

export function uploadLineBuffers(gl, lineBuffers) {
  for (const layer of Object.values(lineBuffers.layers)) {
    layer.positionBuffer = createBuffer(gl, layer.positions);
    layer.colorBuffer = createBuffer(gl, layer.colors);
  }
}

export function disposeLineBuffers(gl, lineBuffers) {
  if (!lineBuffers) return;
  for (const layer of Object.values(lineBuffers.layers || {})) {
    if (layer.positionBuffer) gl.deleteBuffer(layer.positionBuffer);
    if (layer.colorBuffer) gl.deleteBuffer(layer.colorBuffer);
  }
}

function createLineLayers() {
  return {
    stateBorders: createLineLayer(),
    provinceBorders: createLineLayer(),
    routes: createLineLayer({primitive: "triangles", groups: {}}),
    rivers: createLineLayer({
      primitive: "triangles",
      fallback: false,
      mouthsClipped: 0,
      openEnds: 0,
      minWidth: Infinity,
      maxWidth: 0
    })
  };
}

function createLineLayer(extra = {}) {
  return {
    primitive: "lines",
    positions: [],
    colors: [],
    vertexCount: 0,
    segmentCount: 0,
    triangleCount: 0,
    ...extra
  };
}

function buildBoundaryLines(snapshot, layer, type) {
  const {cells, vertices} = snapshot;
  const edgeOwners = new Map();
  const color = getBoundaryColor(type === "province" ? "province" : "state");

  for (let cellIndex = 0; cellIndex < cells.i.length; cellIndex++) {
    const vertexIds = cells.v[cellIndex];
    if (!vertexIds || vertexIds.length < 3 || !isLand(cells, cellIndex)) continue;

    for (let index = 0; index < vertexIds.length; index++) {
      const a = vertexIds[index];
      const b = vertexIds[(index + 1) % vertexIds.length];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const owner = edgeOwners.get(key);

      if (!owner) {
        edgeOwners.set(key, {cellIndex, a, b});
        continue;
      }

      if (!isLand(cells, owner.cellIndex) || !shouldDrawBoundary(cells, owner.cellIndex, cellIndex, type)) continue;
      pushLine(layer.positions, vertices.p[a], vertices.p[b]);
      pushLineColor(layer.colors, color);
    }
  }
}

function shouldDrawBoundary(cells, cellA, cellB, type) {
  const stateA = cells.state?.[cellA] || 0;
  const stateB = cells.state?.[cellB] || 0;

  if (type === "state") return stateA && stateB && stateA !== stateB;

  const provinceA = cells.province?.[cellA] || 0;
  const provinceB = cells.province?.[cellB] || 0;
  return provinceA && provinceB && provinceA !== provinceB && stateA && stateA === stateB;
}

function buildRouteLines(snapshot, layer) {
  if (!Array.isArray(snapshot.routes)) return;

  for (const route of snapshot.routes) {
    const points = Array.isArray(route.points) ? route.points.filter(isPoint) : [];
    if (points.length < 2) continue;

    const group = route.group || "roads";
    layer.groups[group] = (layer.groups[group] || 0) + 1;
    const color = getRouteColor(group);
    const width = getRouteWidth(group);

    for (let index = 0; index < points.length - 1; index++) {
      const pushed = pushWideSegment(layer.positions, layer.colors, points[index], points[index + 1], width, width, color);
      if (pushed) layer.segmentCount++;
    }
  }
}

function getRouteWidth(group) {
  if (group === "roads") return 0.45;
  if (group === "searoutes") return 0.36;
  return 0.3;
}

function buildRiverLines(snapshot, layer) {
  if (!Array.isArray(snapshot.rivers)) return;

  for (const river of snapshot.rivers) {
    if (!Array.isArray(river.points) || river.points.length < 2) layer.fallback = true;
    const path = getRiverPath(river, snapshot, layer);
    if (path.length < 2) continue;

    pushRiverMesh(layer, river, path);
  }
}

function getRiverPath(river, snapshot, layer) {
  if (Array.isArray(river.cells) && river.cells.length >= 2) return getRiverPathFromCells(river, snapshot, layer);
  if (!Array.isArray(river.points) || river.points.length < 2) return [];
  return river.points.filter(isPoint).map(point => ({point, flux: point[2] || 0}));
}

function getRiverPathFromCells(river, snapshot, layer) {
  const path = [];
  const {cells} = snapshot;

  for (let index = 0; index < river.cells.length; index++) {
    const cellId = river.cells[index];
    if (cellId === -1) {
      const previousCellId = river.cells[index - 1];
      const previousPoint = path[path.length - 1]?.point || cells.p[previousCellId];
      const borderPoint = getBorderPoint(previousPoint, snapshot.metadata);
      if (borderPoint) {
        path.push({point: borderPoint, flux: getCellFlux(cells, previousCellId, river)});
        layer.mouthsClipped++;
      }
      break;
    }

    const point = cells.p[cellId];
    if (!point) continue;
    const height = cells.h[cellId] ?? 100;
    const flux = getCellFlux(cells, cellId, river);

    if (height >= 20 || !path.length) {
      path.push({point, flux});
      continue;
    }

    const previousCellId = river.cells[index - 1];
    const previousPoint = path[path.length - 1]?.point;
    const mouthPoint = getCellSharedEdgeMidpoint(snapshot, previousCellId, cellId) || getHeightInterpolatedPoint(cells, previousCellId, cellId, previousPoint, point);
    path.push({point: mouthPoint, flux: getCellFlux(cells, previousCellId, river)});
    layer.mouthsClipped++;
    break;
  }

  if (path.length >= 2 && !hasWaterMouth(river, cells)) layer.openEnds++;
  return path;
}

function pushRiverMesh(layer, river, path) {
  let maxFlux = 0;
  const color = getRiverColor(river);
  const widths = path.map((node, index) => {
    maxFlux = Math.max(maxFlux, node.flux || 0);
    const width = getRiverOffset(river, maxFlux, index);
    layer.minWidth = Math.min(layer.minWidth, width);
    layer.maxWidth = Math.max(layer.maxWidth, width);
    return width;
  });

  for (let index = 0; index < path.length - 1; index++) {
    const a = path[index].point;
    const b = path[index + 1].point;
    const pushed = pushWideSegment(layer.positions, layer.colors, a, b, widths[index], widths[index + 1], color);
    if (pushed) layer.segmentCount++;
  }
}

function getRiverOffset(river, flux, pointIndex) {
  const fluxWidth = Math.min((flux || 0) ** 0.7 / 500, 1);
  const lengthProgression = [1, 1, 2, 3, 5, 8, 13, 21, 34];
  const lengthWidth = pointIndex / 200 + (lengthProgression[pointIndex] ?? lengthProgression[lengthProgression.length - 1]) / 200;
  const sourceWidth = river.sourceWidth || 0.05;
  const widthFactor = river.widthFactor || 1;
  const offset = widthFactor * (lengthWidth + fluxWidth) + sourceWidth;
  return clamp(offset * 3, 0.35, 10);
}

function getCellFlux(cells, cellId, river) {
  if (cellId === undefined || cellId < 0) return river.discharge || 0;
  return cells.fl?.[cellId] || river.discharge || river.width || 0;
}

function hasWaterMouth(river, cells) {
  return river.cells.some(cellId => cellId === -1 || (cellId >= 0 && (cells.h[cellId] ?? 100) < 20));
}

function getCellSharedEdgeMidpoint(snapshot, landCellId, waterCellId) {
  const landVertices = snapshot.cells.v?.[landCellId];
  const waterVertices = snapshot.cells.v?.[waterCellId];
  if (!Array.isArray(landVertices) || !Array.isArray(waterVertices)) return null;

  const waterSet = new Set(waterVertices);
  const shared = landVertices.filter(vertexId => waterSet.has(vertexId));
  if (shared.length < 2) return null;

  let x = 0;
  let y = 0;
  let count = 0;
  for (const vertexId of shared) {
    const point = snapshot.vertices?.p?.[vertexId];
    if (!point) continue;
    x += point[0];
    y += point[1];
    count++;
  }

  return count ? [x / count, y / count] : null;
}

function getHeightInterpolatedPoint(cells, landCellId, waterCellId, landPoint, waterPoint) {
  if (!landPoint || !waterPoint) return landPoint || waterPoint;
  const landHeight = cells.h?.[landCellId] ?? 20;
  const waterHeight = cells.h?.[waterCellId] ?? 0;
  const amount = landHeight === waterHeight ? 0.5 : clamp((landHeight - 20) / (landHeight - waterHeight), 0, 1);
  return lerpPoint(landPoint, waterPoint, amount);
}

function getBorderPoint(point, metadata = {}) {
  if (!point) return null;
  const graphWidth = metadata.graphWidth || 0;
  const graphHeight = metadata.graphHeight || 0;
  const [x, y] = point;
  const min = Math.min(y, graphHeight - y, x, graphWidth - x);
  if (min === y) return [x, 0];
  if (min === graphHeight - y) return [x, graphHeight];
  if (min === x) return [0, y];
  return [graphWidth, y];
}

function isLand(cells, cellIndex) {
  return (cells.h[cellIndex] || 0) >= 20;
}

function isPoint(point) {
  return Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]);
}

function lerpPoint(a, b, amount) {
  return [a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount];
}

function pushWideSegment(positions, colors, a, b, widthA, widthB, color) {
  if (!a || !b) return false;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  if (!length) return false;

  const nx = -dy / length;
  const ny = dx / length;
  const aLeft = [a[0] + nx * widthA, a[1] + ny * widthA];
  const aRight = [a[0] - nx * widthA, a[1] - ny * widthA];
  const bLeft = [b[0] + nx * widthB, b[1] + ny * widthB];
  const bRight = [b[0] - nx * widthB, b[1] - ny * widthB];

  pushTriangle(positions, aLeft, aRight, bLeft);
  pushTriangle(positions, bLeft, aRight, bRight);
  pushTriangleColor(colors, color);
  pushTriangleColor(colors, color);
  return true;
}

function pushTriangle(target, a, b, c) {
  target.push(a[0], a[1], b[0], b[1], c[0], c[1]);
}

function pushTriangleColor(target, color) {
  for (let index = 0; index < 3; index++) target.push(color[0], color[1], color[2]);
}

function pushLine(target, a, b) {
  if (!a || !b) return;
  target.push(a[0], a[1], b[0], b[1]);
}

function pushLineColor(target, color) {
  target.push(color[0], color[1], color[2], color[0], color[1], color[2]);
}

function createBuffer(gl, data) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return buffer;
}
