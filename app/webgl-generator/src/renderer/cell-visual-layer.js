import {colorForCell} from "./color-modes.js";
import {createRenderContext, worldToNdcPoint} from "./render-context.js";
import {isWorldPoint, midpoint, normalizeWorldVector, pointsNear, worldDistance} from "./geometry.js";
import earcut from "earcut";
import {resolvedGridVertexPoint} from "./grid-vertex-geometry.js";

const CELL_VISUAL_STYLE = Object.freeze({
  segmentsPerEdge: 3,
  curveFactor: 0.08,
  maxOffsetWorld: 0.9,
  noiseScaleWorld: 44
});

export function buildCellVisualMesh(map) {
  const startedAt = performance.now();
  const context = createRenderContext(map);
  const cells = [];
  const edgeCurves = new Map();
  let boundaryPoints = 0;
  let skippedCells = 0;
  let triangleCount = 0;
  let triangulationFallbackCells = 0;

  for (const cell of map?.grid?.cells?.i || []) {
    const points = buildCellVisualBoundary(map, cell, edgeCurves);
    if (points.length < 3) {
      skippedCells++;
      continue;
    }
    const center = cellCenterPoint(map.grid, cell);
    const triangulation = buildCellVisualNdcTriangles(context, center, points);
    const ndcTriangles = triangulation.ndcTriangles;
    if (triangulation.fallback) triangulationFallbackCells++;
    cells.push({cell, center, points, ndcTriangles, triangleCount: ndcTriangles.length / 6});
    boundaryPoints += points.length;
    triangleCount += ndcTriangles.length / 6;
  }

  return {
    cells,
    edgeCurves,
    cellCount: cells.length,
    skippedCells,
    boundaryPoints,
    triangleCount,
    triangulationMode: "earcut-boundary",
    triangulationFallbackCells,
    edgeCurveCount: edgeCurves.size,
    style: CELL_VISUAL_STYLE,
    buildMs: roundMs(performance.now() - startedAt)
  };
}

export function emptyCellVisualMesh() {
  return {
    cells: [],
    edgeCurves: new Map(),
    cellCount: 0,
    skippedCells: 0,
    boundaryPoints: 0,
    triangleCount: 0,
    triangulationMode: "earcut-boundary",
    triangulationFallbackCells: 0,
    edgeCurveCount: 0,
    style: CELL_VISUAL_STYLE,
    buildMs: 0
  };
}

export function summarizeCellVisualMesh(mesh) {
  return {
    cellCount: mesh?.cellCount || 0,
    skippedCells: mesh?.skippedCells || 0,
    boundaryPoints: mesh?.boundaryPoints || 0,
    triangleCount: mesh?.triangleCount || 0,
    triangulationMode: mesh?.triangulationMode || "earcut-boundary",
    triangulationFallbackCells: mesh?.triangulationFallbackCells || 0,
    averageBoundaryPoints: roundRatio(mesh?.boundaryPoints || 0, mesh?.cellCount || 0),
    edgeCurveCount: mesh?.edgeCurveCount || 0,
    style: {...CELL_VISUAL_STYLE},
    buildMs: mesh?.buildMs || 0
  };
}

export function buildCellVisualGridVertices(context, colorMode, viewOptions, cellVisualMesh) {
  const {map} = context;
  const cells = cellVisualMesh?.cells || [];
  let vertexCount = 0;
  for (const cellMesh of cells) vertexCount += (cellMesh?.ndcTriangles?.length || 0) / 2;

  const vertices = new Float32Array(vertexCount * 6);
  let offset = 0;
  for (const cellMesh of cells) {
    if (!cellMesh?.ndcTriangles?.length) continue;
    const color = colorForCell(cellMesh.cell, map, colorMode, viewOptions);
    const ndc = cellMesh.ndcTriangles;
    for (let index = 0; index < ndc.length; index += 2) {
      vertices[offset++] = ndc[index];
      vertices[offset++] = ndc[index + 1];
      vertices[offset++] = color[0];
      vertices[offset++] = color[1];
      vertices[offset++] = color[2];
      vertices[offset++] = color[3];
    }
  }

  return offset === vertices.length ? vertices : vertices.slice(0, offset);
}

function buildCellVisualNdcTriangles(context, center, points) {
  const indices = triangulateCellVisualBoundary(points);
  if (!indices.length) return {
    ndcTriangles: buildCellVisualFanNdcTriangles(context, center, points),
    fallback: true
  };
  const ndc = new Float32Array(indices.length * 2);
  let offset = 0;
  for (const pointIndex of indices) {
    const point = worldToNdcPoint(context, points[pointIndex]);
    ndc[offset++] = point[0];
    ndc[offset++] = point[1];
  }
  return {ndcTriangles: ndc, fallback: false};
}

export function triangulateCellVisualBoundary(points) {
  if (!Array.isArray(points) || points.length < 3 || points.some(point => !isWorldPoint(point))) return [];
  return earcut(points.flat(), null, 2);
}

export function countCellVisualFanLeaks(center, points) {
  if (!isWorldPoint(center) || !Array.isArray(points) || points.length < 3) return 0;
  let leaks = 0;
  for (let index = 0; index < points.length; index++) {
    const next = points[(index + 1) % points.length];
    const centroid = [
      (center[0] + points[index][0] + next[0]) / 3,
      (center[1] + points[index][1] + next[1]) / 3
    ];
    if (!pointInCellVisualBoundary(centroid, points)) leaks++;
  }
  return leaks;
}

export function countCellVisualTriangulationLeaks(points, indices = triangulateCellVisualBoundary(points)) {
  let leaks = 0;
  for (let index = 0; index < indices.length; index += 3) {
    const triangle = [points[indices[index]], points[indices[index + 1]], points[indices[index + 2]]];
    const centroid = [
      (triangle[0][0] + triangle[1][0] + triangle[2][0]) / 3,
      (triangle[0][1] + triangle[1][1] + triangle[2][1]) / 3
    ];
    if (!pointInCellVisualBoundary(centroid, points)) leaks++;
  }
  return leaks;
}

function buildCellVisualFanNdcTriangles(context, center, points) {
  const ndc = new Float32Array(points.length * 3 * 2);
  const centerNdc = worldToNdcPoint(context, center);
  let offset = 0;
  for (let index = 0; index < points.length; index++) {
    const nextIndex = (index + 1) % points.length;
    const current = worldToNdcPoint(context, points[index]);
    const next = worldToNdcPoint(context, points[nextIndex]);
    ndc[offset++] = centerNdc[0];
    ndc[offset++] = centerNdc[1];
    ndc[offset++] = current[0];
    ndc[offset++] = current[1];
    ndc[offset++] = next[0];
    ndc[offset++] = next[1];
  }
  return ndc;
}

function pointInCellVisualBoundary(point, points) {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
    const a = points[index];
    const b = points[previous];
    const crosses = (a[1] > point[1]) !== (b[1] > point[1])
      && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0];
    if (crosses) inside = !inside;
  }
  return inside;
}

function buildCellVisualBoundary(map, cell, edgeCurves) {
  const vertexIds = map?.grid?.cells?.v?.[cell] || [];
  if (vertexIds.length < 3) return [];
  const points = [];

  for (let index = 0; index < vertexIds.length; index++) {
    const a = vertexIds[index];
    const b = vertexIds[(index + 1) % vertexIds.length];
    const curve = cellVisualEdgeCurve(map, a, b, edgeCurves);
    const directed = a <= b ? curve : [...curve].reverse();
    for (let pointIndex = 0; pointIndex < directed.length; pointIndex++) {
      if (points.length && pointIndex === 0) continue;
      points.push(directed[pointIndex]);
    }
  }

  if (points.length > 1 && pointsNear(points[0], points[points.length - 1])) points.pop();
  return points;
}

function cellVisualEdgeCurve(map, a, b, edgeCurves) {
  const first = Math.min(a, b);
  const second = Math.max(a, b);
  const key = `${first}:${second}`;
  const cached = edgeCurves.get(key);
  if (cached) return cached;

  const start = resolvedGridVertexPoint(map?.grid, first);
  const end = resolvedGridVertexPoint(map?.grid, second);
  if (!isWorldPoint(start) || !isWorldPoint(end)) {
    const fallback = [];
    edgeCurves.set(key, fallback);
    return fallback;
  }

  const length = worldDistance(start, end);
  if (length <= 0.001) {
    const point = [[start[0], start[1]]];
    edgeCurves.set(key, point);
    return point;
  }

  const normal = normalizeWorldVector(-(end[1] - start[1]), end[0] - start[0]);
  const mid = midpoint(start, end);
  const offset = cellVisualEdgeOffset(key, mid, length);
  const control = [mid[0] + normal.x * offset, mid[1] + normal.y * offset];
  if (!isWorldPoint(control)) {
    const fallback = [start, end];
    edgeCurves.set(key, fallback);
    return fallback;
  }
  const curve = sampleQuadraticWorldPath(start, control, end, CELL_VISUAL_STYLE.segmentsPerEdge);
  edgeCurves.set(key, curve);
  return curve;
}

function cellVisualEdgeOffset(key, mid, length) {
  const coherent = coherentCellVisualNoise(mid[0], mid[1], CELL_VISUAL_STYLE.noiseScaleWorld);
  const local = cellVisualEdgeNoise(key) * 2 - 1;
  const signedNoise = coherent * 0.82 + local * 0.18;
  return signedNoise * Math.min(length * CELL_VISUAL_STYLE.curveFactor, CELL_VISUAL_STYLE.maxOffsetWorld);
}

function coherentCellVisualNoise(x, y, scale) {
  const safeScale = Math.max(1, scale);
  const gx = x / safeScale;
  const gy = y / safeScale;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const tx = smoothUnitStep(gx - x0);
  const ty = smoothUnitStep(gy - y0);
  const a = gridCellVisualNoise(x0, y0);
  const b = gridCellVisualNoise(x0 + 1, y0);
  const c = gridCellVisualNoise(x0, y0 + 1);
  const d = gridCellVisualNoise(x0 + 1, y0 + 1);
  return mixValue(mixValue(a, b, tx), mixValue(c, d, tx), ty);
}

function smoothUnitStep(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function mixValue(a, b, t) {
  return a + (b - a) * t;
}

function gridCellVisualNoise(x, y) {
  let hash = 2166136261;
  hash ^= x | 0;
  hash = Math.imul(hash, 16777619);
  hash ^= y | 0;
  hash = Math.imul(hash, 16777619);
  return ((hash >>> 0) / 4294967295) * 2 - 1;
}

function sampleQuadraticWorldPath(start, control, end, segments) {
  const points = [];
  const safeSegments = Math.max(1, segments);
  for (let index = 0; index <= safeSegments; index++) {
    const t = index / safeSegments;
    const inv = 1 - t;
    points.push([
      inv * inv * start[0] + 2 * inv * t * control[0] + t * t * end[0],
      inv * inv * start[1] + 2 * inv * t * control[1] + t * t * end[1]
    ]);
  }
  return points;
}

function cellVisualEdgeNoise(key) {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index++) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function cellCenterPoint(grid, cell) {
  return grid.points[grid.cells.p?.[cell]] || [0, 0];
}

function roundMs(value) {
  return Math.round(value * 100) / 100;
}

function roundRatio(count, total) {
  if (!total) return 0;
  return Math.round((count / total) * 1000) / 1000;
}
