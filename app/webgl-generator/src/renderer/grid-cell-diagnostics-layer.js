import {createRenderContext} from "./render-context.js";
import {pushWorldVertex} from "./mesh-writer.js";

const GRID_LINE_COLOR = Object.freeze([0.055, 0.075, 0.09, 0.46]);
const HIGHLIGHT_FILL_COLOR = Object.freeze([0.96, 0.56, 0.12, 0.24]);
const HIGHLIGHT_LINE_COLOR = Object.freeze([1, 0.74, 0.2, 0.92]);

export async function buildGridCellDiagnostics(map, options = {}) {
  const startedAt = now();
  const yieldToBrowser = typeof options.yieldToBrowser === "function" ? options.yieldToBrowser : defaultYieldToBrowser;
  const shouldContinue = typeof options.shouldContinue === "function" ? options.shouldContinue : () => true;
  const sliceMs = positiveNumber(options.sliceMs, 5);
  const context = createRenderContext(map);
  const grid = map?.grid;
  const vertices = [];
  const edges = new Set();
  const packCounts = new Uint32Array(inferGridCellCount(map));
  let sliceStartedAt = now();
  let maxSliceMs = 0;

  for (const packCell of iterableValues(map?.pack?.cells?.i)) {
    const gridCell = Number(map?.pack?.cells?.g?.[packCell]);
    if (Number.isInteger(gridCell) && gridCell >= 0 && gridCell < packCounts.length) packCounts[gridCell]++;
  }

  const cellIds = iterableValues(grid?.cells?.i);
  for (let cursor = 0; cursor < cellIds.length; cursor++) {
    if (!shouldContinue()) return abortedResult(startedAt, maxSliceMs, packCounts);
    const cell = Number(cellIds[cursor]);
    const polygon = iterableValues(grid?.cells?.v?.[cell]).map(Number).filter(Number.isInteger);
    for (let index = 0; index < polygon.length; index++) {
      const aId = polygon[index];
      const bId = polygon[(index + 1) % polygon.length];
      const key = aId < bId ? `${aId}:${bId}` : `${bId}:${aId}`;
      if (edges.has(key)) continue;
      const a = grid?.vertices?.p?.[aId];
      const b = grid?.vertices?.p?.[bId];
      if (!validPoint(a) || !validPoint(b)) continue;
      edges.add(key);
      pushWorldVertex(vertices, context, a, GRID_LINE_COLOR);
      pushWorldVertex(vertices, context, b, GRID_LINE_COLOR);
    }

    const sliceElapsed = now() - sliceStartedAt;
    if (sliceElapsed < sliceMs) continue;
    maxSliceMs = Math.max(maxSliceMs, sliceElapsed);
    await yieldToBrowser();
    sliceStartedAt = now();
  }

  maxSliceMs = Math.max(maxSliceMs, now() - sliceStartedAt);
  const typedVertices = new Float32Array(vertices);
  return {
    aborted: false,
    vertices: typedVertices,
    edgeCount: edges.size,
    buildMs: roundMs(now() - startedAt),
    maxSliceMs: roundMs(maxSliceMs),
    bufferBytes: typedVertices.byteLength,
    packCounts
  };
}

export function buildGridCellDiagnosticHighlight(map, gridCell, pulse = 1) {
  const polygon = gridCellPolygon(map, gridCell);
  if (polygon.length < 3) return {fill: new Float32Array(), line: new Float32Array()};
  const context = createRenderContext(map);
  const fill = [];
  const line = [];
  const center = polygonCenter(polygon);
  const fillColor = [...HIGHLIGHT_FILL_COLOR];
  const lineColor = [...HIGHLIGHT_LINE_COLOR];
  fillColor[3] *= 0.72 + clamp01(pulse) * 0.28;
  lineColor[3] *= 0.74 + clamp01(pulse) * 0.26;
  for (let index = 0; index < polygon.length; index++) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    pushWorldVertex(fill, context, center, fillColor);
    pushWorldVertex(fill, context, a, fillColor);
    pushWorldVertex(fill, context, b, fillColor);
    pushWorldVertex(line, context, a, lineColor);
    pushWorldVertex(line, context, b, lineColor);
  }
  return {fill: new Float32Array(fill), line: new Float32Array(line)};
}

export function gridCellBounds(map, gridCell) {
  const polygon = gridCellPolygon(map, gridCell);
  if (!polygon.length) return null;
  return polygon.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, Number(point[0])),
    minY: Math.min(bounds.minY, Number(point[1])),
    maxX: Math.max(bounds.maxX, Number(point[0])),
    maxY: Math.max(bounds.maxY, Number(point[1]))
  }), {minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity});
}

export function gridCellCenter(map, gridCell) {
  const pointIndex = Number(map?.grid?.cells?.p?.[gridCell]);
  const point = Number.isInteger(pointIndex) ? map?.grid?.points?.[pointIndex] : null;
  if (validPoint(point)) return {x: Number(point[0]), y: Number(point[1])};
  const polygon = gridCellPolygon(map, gridCell);
  if (!polygon.length) return null;
  const center = polygonCenter(polygon);
  return {x: center[0], y: center[1]};
}

function gridCellPolygon(map, gridCell) {
  return iterableValues(map?.grid?.cells?.v?.[gridCell])
    .map(vertexId => map?.grid?.vertices?.p?.[Number(vertexId)])
    .filter(validPoint);
}

function polygonCenter(points) {
  const total = points.reduce((sum, point) => [sum[0] + Number(point[0]), sum[1] + Number(point[1])], [0, 0]);
  return [total[0] / points.length, total[1] / points.length];
}

function inferGridCellCount(map) {
  return Math.max(
    Number(map?.grid?.cells?.i?.length || 0),
    Number(map?.grid?.cells?.v?.length || 0),
    Number(map?.grid?.cells?.h?.length || 0)
  );
}

function abortedResult(startedAt, maxSliceMs, packCounts) {
  return {
    aborted: true,
    vertices: new Float32Array(),
    edgeCount: 0,
    buildMs: roundMs(now() - startedAt),
    maxSliceMs: roundMs(maxSliceMs),
    bufferBytes: 0,
    packCounts
  };
}

function defaultYieldToBrowser() {
  return new Promise(resolve => {
    const view = globalThis.window || globalThis;
    if (typeof view.requestAnimationFrame === "function") view.requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

function validPoint(point) {
  return Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]));
}

function iterableValues(value) {
  if (!value || typeof value[Symbol.iterator] !== "function") return [];
  return Array.from(value);
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function roundMs(value) {
  return Math.round(Number(value) * 10) / 10;
}
