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
  const shoreEdges = collectShoreCellVisualEdges(map);
  let boundaryPoints = 0;
  let skippedCells = 0;
  let triangleCount = 0;
  let triangulationFallbackCells = 0;
  let triangulationRetriedCells = 0;
  let triangulationSkippedCells = 0;
  let triangulationHardFallbackCells = 0;
  let triangulationHardFanFallbackCells = 0;
  let triangulationEmergencyHardFanCells = 0;
  let triangulationCanonicalOrderFallbackCells = 0;
  let triangulationVoronoiRecoveryCells = 0;
  let triangulationUnfilledCells = 0;
  const triangulationVoronoiRecoveryCellIds = [];
  const triangulationFailures = [];

  for (const cell of map?.grid?.cells?.i || []) {
    const points = buildCellVisualBoundary(map, cell, edgeCurves, shoreEdges);
    if (points.length < 3) {
      skippedCells++;
      continue;
    }
    const center = cellCenterPoint(map.grid, cell);
    const smoothTriangulation = buildCellVisualNdcTriangles(context, points);
    let triangulation = smoothTriangulation;
    let fallbackMode = null;
    if (smoothTriangulation.retried) triangulationRetriedCells++;
    if (smoothTriangulation.skipped) {
      triangulationSkippedCells++;
      let hardPoints = buildHardCellVisualBoundary(map, cell, true);
      triangulation = buildCellVisualNdcTriangles(context, hardPoints, center);
      let hardBoundarySource = "resolved";
      if (triangulation.skipped) {
        hardPoints = buildHardCellVisualBoundary(map, cell, false);
        triangulation = buildCellVisualNdcTriangles(context, hardPoints, center);
        hardBoundarySource = "stored";
      }
      if (triangulation.skipped) {
        hardPoints = buildCanonicalOrderedCellVisualBoundary(map, cell, true);
        triangulation = buildCellVisualNdcTriangles(context, hardPoints, center);
        hardBoundarySource = "canonical-resolved";
      }
      if (triangulation.skipped) {
        hardPoints = buildCanonicalOrderedCellVisualBoundary(map, cell, false);
        triangulation = buildCellVisualNdcTriangles(context, hardPoints, center);
        hardBoundarySource = "canonical-stored";
      }
      if (triangulation.skipped) {
        hardPoints = buildVoronoiRecoveredCellVisualBoundary(map, cell);
        triangulation = buildCellVisualNdcTriangles(context, hardPoints, center);
        hardBoundarySource = "voronoi-recovered";
      }
      if (!triangulation.skipped) {
        triangulationHardFallbackCells++;
        if (triangulation.safeHardFan) triangulationHardFanFallbackCells++;
        if (hardBoundarySource.startsWith("canonical-")) triangulationCanonicalOrderFallbackCells++;
        if (hardBoundarySource === "voronoi-recovered") {
          triangulationVoronoiRecoveryCells++;
          triangulationVoronoiRecoveryCellIds.push(cell);
        }
        fallbackMode ||= triangulation.safeHardFan
          ? `validated-${hardBoundarySource}-hard-fan`
          : `${hardBoundarySource}-hard-boundary-earcut`;
      }
      if (triangulationFailures.length < 32) {
        triangulationFailures.push({
          cell,
          reason: smoothTriangulation.reason,
          sourcePointCount: points.length,
          cleanedPointCount: smoothTriangulation.points.length,
          fallback: triangulation.skipped ? "unfilled" : fallbackMode,
          fallbackReason: triangulation.reason,
          hardPointCount: hardPoints.length
        });
      }
    }
    if (triangulation.fallback) triangulationFallbackCells++;
    if (triangulation.skipped) {
      triangulationUnfilledCells++;
      skippedCells++;
      continue;
    }
    const ndcTriangles = triangulation.ndcTriangles;
    const cellMesh = {
      cell,
      center,
      points: triangulation.points,
      ndcTriangles,
      triangleCount: ndcTriangles.length / 6,
      triangulationFallback: smoothTriangulation.skipped ? fallbackMode : null
    };
    cells.push(cellMesh);
    boundaryPoints += triangulation.points.length;
    triangleCount += ndcTriangles.length / 6;
  }

  return {
    cells,
    edgeCurves,
    shoreEdges,
    cellCount: cells.length,
    skippedCells,
    boundaryPoints,
    triangleCount,
    triangulationMode: "earcut-boundary",
    triangulationFallbackCells,
    triangulationRetriedCells,
    triangulationSkippedCells,
    triangulationHardFallbackCells,
    triangulationHardFanFallbackCells,
    triangulationEmergencyHardFanCells,
    triangulationCanonicalOrderFallbackCells,
    triangulationVoronoiRecoveryCells,
    triangulationVoronoiRecoveryCellIds,
    triangulationUnfilledCells,
    triangulationFailures,
    edgeCurveCount: edgeCurves.size,
    shoreEdgeCount: shoreEdges.size,
    style: CELL_VISUAL_STYLE,
    buildMs: roundMs(performance.now() - startedAt)
  };
}

export function emptyCellVisualMesh() {
  return {
    cells: [],
    edgeCurves: new Map(),
    shoreEdges: new Set(),
    cellCount: 0,
    skippedCells: 0,
    boundaryPoints: 0,
    triangleCount: 0,
    triangulationMode: "earcut-boundary",
    triangulationFallbackCells: 0,
    triangulationRetriedCells: 0,
    triangulationSkippedCells: 0,
    triangulationHardFallbackCells: 0,
    triangulationHardFanFallbackCells: 0,
    triangulationEmergencyHardFanCells: 0,
    triangulationCanonicalOrderFallbackCells: 0,
    triangulationVoronoiRecoveryCells: 0,
    triangulationVoronoiRecoveryCellIds: [],
    triangulationUnfilledCells: 0,
    triangulationFailures: [],
    edgeCurveCount: 0,
    shoreEdgeCount: 0,
    style: CELL_VISUAL_STYLE,
    buildMs: 0
  };
}

function buildCellVisualMeshCell(map, cell, edgeCurves, shoreEdges) {
  const points = buildCellVisualBoundary(map, cell, edgeCurves, shoreEdges);
  if (points.length < 3) return null;
  const center = cellCenterPoint(map.grid, cell);
  const smoothTriangulation = buildCellVisualNdcTriangles(createRenderContext(map), points);
  let triangulation = smoothTriangulation;
  let fallbackMode = null;
  if (smoothTriangulation.skipped) {
    let hardPoints = buildHardCellVisualBoundary(map, cell, true);
    triangulation = buildCellVisualNdcTriangles(createRenderContext(map), hardPoints, center);
    let hardBoundarySource = "resolved";
    if (triangulation.skipped) {
      hardPoints = buildHardCellVisualBoundary(map, cell, false);
      triangulation = buildCellVisualNdcTriangles(createRenderContext(map), hardPoints, center);
      hardBoundarySource = "stored";
    }
    if (triangulation.skipped) {
      hardPoints = buildCanonicalOrderedCellVisualBoundary(map, cell, true);
      triangulation = buildCellVisualNdcTriangles(createRenderContext(map), hardPoints, center);
      hardBoundarySource = "canonical-resolved";
    }
    if (triangulation.skipped) {
      hardPoints = buildCanonicalOrderedCellVisualBoundary(map, cell, false);
      triangulation = buildCellVisualNdcTriangles(createRenderContext(map), hardPoints, center);
      hardBoundarySource = "canonical-stored";
    }
    if (triangulation.skipped) {
      hardPoints = buildVoronoiRecoveredCellVisualBoundary(map, cell);
      triangulation = buildCellVisualNdcTriangles(createRenderContext(map), hardPoints, center);
      hardBoundarySource = "voronoi-recovered";
    }
    if (!triangulation.skipped) {
      fallbackMode ||= triangulation.safeHardFan
        ? `validated-${hardBoundarySource}-hard-fan`
        : `${hardBoundarySource}-hard-boundary-earcut`;
    }
  }
  if (triangulation.skipped) return null;
  const ndcTriangles = triangulation.ndcTriangles;
  return {
    cellMesh: {
      cell,
      center,
      points: triangulation.points,
      ndcTriangles,
      triangleCount: ndcTriangles.length / 6,
      triangulationFallback: smoothTriangulation.skipped ? fallbackMode : null
    }
  };
}

function cellVisualBoundaryEdgeKeys(map, cell) {
  const vertices = map.grid.cells.v[cell] || [];
  const keys = [];
  for (let index = 0; index < vertices.length; index++) {
    const first = vertices[index];
    const second = vertices[(index + 1) % vertices.length];
    keys.push(`${Math.min(first, second)}:${Math.max(first, second)}`);
  }
  return keys;
}

export function refreshCellVisualMeshCells(map, previousMesh, changedGridCells) {
  if (!map || !previousMesh?.cells?.length || !(previousMesh.shoreEdges instanceof Set)) return null;
  const cells = map.grid?.cells;
  if (!cells?.c || !cells?.v || !cells?.h) return null;
  const changed = new Set((changedGridCells || []).map(Number).filter(cell => Number.isInteger(cell) && cell >= 0));
  if (!changed.size) return {mesh: previousMesh, changedCells: [], buildMs: 0};

  const affected = new Set(changed);
  for (const cell of changed) for (const neighbor of cells.c[cell] || []) {
    if (Number.isInteger(neighbor) && neighbor >= 0) affected.add(neighbor);
  }
  for (const cell of cells.i || []) {
    if ((cells.c[cell] || []).some(neighbor => changed.has(neighbor))) affected.add(cell);
  }

  const edgeCurves = new Map(previousMesh.edgeCurves || []);
  const shoreEdges = collectShoreCellVisualEdges(map);
  for (const cell of affected) {
    for (const key of cellVisualBoundaryEdgeKeys(map, cell)) edgeCurves.delete(key);
  }

  const entries = new Map(previousMesh.cells.map(cellMesh => [cellMesh.cell, cellMesh]));
  const startedAt = performance.now();
  for (const cell of affected) {
    const next = buildCellVisualMeshCell(map, cell, edgeCurves, shoreEdges);
    if (!next?.cellMesh || !entries.has(cell)) return null;
    entries.set(cell, next.cellMesh);
  }

  const refreshedCells = previousMesh.cells.map(cellMesh => entries.get(cellMesh.cell));
  const nextCells = [
    ...refreshedCells.filter(cellMesh => cellMesh.triangulationFallback === "emergency-hard-surface-fan"),
    ...refreshedCells.filter(cellMesh => cellMesh.triangulationFallback !== "emergency-hard-surface-fan")
  ];
  const boundaryPoints = nextCells.reduce((sum, cellMesh) => sum + cellMesh.points.length, 0);
  const triangleCount = nextCells.reduce((sum, cellMesh) => sum + cellMesh.triangleCount, 0);
  return {
    mesh: {
      ...previousMesh,
      cells: nextCells,
      edgeCurves,
      shoreEdges,
      cellCount: nextCells.length,
      boundaryPoints,
      triangleCount,
      edgeCurveCount: edgeCurves.size,
      shoreEdgeCount: shoreEdges.size,
      buildMs: roundMs(performance.now() - startedAt)
    },
    changedCells: [...affected].sort((a, b) => a - b),
    buildMs: roundMs(performance.now() - startedAt)
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
    triangulationRetriedCells: mesh?.triangulationRetriedCells || 0,
    triangulationSkippedCells: mesh?.triangulationSkippedCells || 0,
    triangulationHardFallbackCells: mesh?.triangulationHardFallbackCells || 0,
    triangulationHardFanFallbackCells: mesh?.triangulationHardFanFallbackCells || 0,
    triangulationEmergencyHardFanCells: mesh?.triangulationEmergencyHardFanCells || 0,
    triangulationCanonicalOrderFallbackCells: mesh?.triangulationCanonicalOrderFallbackCells || 0,
    triangulationVoronoiRecoveryCells: mesh?.triangulationVoronoiRecoveryCells || 0,
    triangulationVoronoiRecoveryCellIds: [...(mesh?.triangulationVoronoiRecoveryCellIds || [])],
    triangulationUnfilledCells: mesh?.triangulationUnfilledCells || 0,
    triangulationFailures: [...(mesh?.triangulationFailures || [])],
    averageBoundaryPoints: roundRatio(mesh?.boundaryPoints || 0, mesh?.cellCount || 0),
    edgeCurveCount: mesh?.edgeCurveCount || 0,
    shoreEdgeCount: mesh?.shoreEdgeCount || 0,
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

function buildCellVisualNdcTriangles(context, points, safeFanCenter = null) {
  const triangulation = triangulateCellVisualBoundarySafely(points);
  let indices = triangulation.indices;
  let safeHardFan = false;
  if (triangulation.status === "skipped" && isWorldPoint(safeFanCenter)) {
    indices = buildValidatedHardBoundaryFanIndices(triangulation.points, safeFanCenter);
    safeHardFan = indices.length > 0;
  }
  if (triangulation.status === "skipped" && !safeHardFan) return {
      ndcTriangles: new Float32Array(),
      fallback: false,
      skipped: true,
      retried: triangulation.retried,
      reason: triangulation.reason,
      points: triangulation.points,
      safeHardFan: false
    };
  const ndc = new Float32Array(indices.length * 2);
  let offset = 0;
  const fanPoints = safeHardFan ? [safeFanCenter, ...triangulation.points] : triangulation.points;
  for (const pointIndex of indices) {
    const point = worldToNdcPoint(context, fanPoints[pointIndex]);
    ndc[offset++] = point[0];
    ndc[offset++] = point[1];
  }
  return {
    ndcTriangles: ndc,
    fallback: false,
    skipped: false,
    retried: triangulation.retried,
    reason: null,
    points: triangulation.points,
    safeHardFan
  };
}

export function triangulateCellVisualBoundary(points) {
  if (!Array.isArray(points) || points.length < 3 || points.some(point => !isWorldPoint(point))) return [];
  return earcut(points.flat(), null, 2);
}

export function triangulateCellVisualBoundarySafely(points) {
  if (!Array.isArray(points) || points.length < 3 || points.some(point => !isWorldPoint(point))) {
    return {status: "skipped", reason: "invalid-boundary", retried: false, removedPointCount: 0, points: [], indices: []};
  }
  const source = points.map(point => [point[0], point[1]]);
  const cleaned = cleanCellVisualBoundary(source);
  const retried = cleaned.length !== source.length || cleaned.some((point, index) => !pointsNear(point, source[index], 0.000000001));
  const candidate = retried ? cleaned : source;
  if (candidate.length < 3) {
    return {
      status: "skipped",
      reason: "boundary-collapsed-after-cleanup",
      retried,
      removedPointCount: source.length - candidate.length,
      points: candidate,
      indices: []
    };
  }
  const convex = cellVisualBoundaryIsStrictlyConvex(candidate);
  if (!convex && cellVisualBoundarySelfIntersects(candidate)) {
    return {
      status: "skipped",
      reason: "self-intersecting-boundary",
      retried,
      removedPointCount: source.length - candidate.length,
      points: candidate,
      indices: []
    };
  }
  const indices = triangulateCellVisualBoundary(candidate);
  const valid = convex
    ? validateConvexCellVisualTriangulation(candidate, indices)
    : validateCellVisualTriangulation(candidate, indices);
  if (!valid) {
    return {
      status: "skipped",
      reason: indices.length ? "unsafe-earcut-result" : "earcut-empty",
      retried: true,
      removedPointCount: source.length - candidate.length,
      points: candidate,
      indices: []
    };
  }
  return {
    status: "ok",
    reason: null,
    retried,
    removedPointCount: source.length - candidate.length,
    points: candidate,
    indices
  };
}

function cellVisualBoundaryIsStrictlyConvex(points) {
  if (points.length < 3) return false;
  let direction = 0;
  for (let index = 0; index < points.length; index++) {
    const cross = cross2d(points[index], points[(index + 1) % points.length], points[(index + 2) % points.length]);
    if (Math.abs(cross) <= 0.000000000001) return false;
    const nextDirection = Math.sign(cross);
    if (direction && nextDirection !== direction) return false;
    direction = nextDirection;
  }
  return true;
}

function validateConvexCellVisualTriangulation(points, indices) {
  if (!indices.length || indices.length % 3 || indices.length !== (points.length - 2) * 3) return false;
  const polygonArea = Math.abs(cellVisualBoundaryArea(points));
  if (polygonArea <= 0.000000001) return false;
  let triangleArea = 0;
  for (let index = 0; index < indices.length; index += 3) {
    const triangle = [points[indices[index]], points[indices[index + 1]], points[indices[index + 2]]];
    if (triangle.some(point => !point)) return false;
    const area = Math.abs(cellVisualTriangleArea(triangle));
    if (area <= 0.000000001) return false;
    triangleArea += area;
  }
  return Math.abs(triangleArea - polygonArea) <= Math.max(0.000001, polygonArea * 0.000001);
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

function buildHardCellVisualBoundary(map, cell, resolved) {
  const vertexIds = map?.grid?.cells?.v?.[cell] || [];
  const points = vertexIds
    .map(vertex => resolved ? resolvedGridVertexPoint(map.grid, vertex) : map?.grid?.vertices?.p?.[vertex])
    .filter(isWorldPoint);
  return cleanCellVisualBoundary(points);
}

export function buildCanonicalOrderedCellVisualBoundary(map, cell, resolved = true) {
  const center = cellCenterPoint(map?.grid, cell);
  if (!isWorldPoint(center)) return [];
  const points = (map?.grid?.cells?.v?.[cell] || [])
    .map(vertex => resolved ? resolvedGridVertexPoint(map.grid, vertex) : map?.grid?.vertices?.p?.[vertex])
    .filter(isWorldPoint)
    .map(point => [...point]);
  if (points.length < 3) return [];
  points.sort((left, right) => {
    const angle = Math.atan2(left[1] - center[1], left[0] - center[0]) - Math.atan2(right[1] - center[1], right[0] - center[0]);
    if (Math.abs(angle) > 0.000000000001) return angle;
    return worldDistance(center, left) - worldDistance(center, right);
  });
  const boundary = cleanCellVisualBoundary(points);
  if (boundary.length < 3 || cellVisualBoundarySelfIntersects(boundary) || !pointInCellVisualBoundary(center, boundary)) return [];
  return triangulateCellVisualBoundarySafely(boundary).status === "ok" ? boundary : [];
}

export function buildVoronoiRecoveredCellVisualBoundary(map, cell) {
  const grid = map?.grid;
  const center = cellCenterPoint(grid, cell);
  const width = Number(map?.metadata?.graphWidth || grid?.metadata?.graphWidth);
  const height = Number(map?.metadata?.graphHeight || grid?.metadata?.graphHeight);
  if (!isWorldPoint(center) || !(width > 0) || !(height > 0)) return [];
  if (center[0] < 0 || center[0] > width || center[1] < 0 || center[1] > height) return [];

  const neighborPoints = [];
  const seen = new Set();
  for (const neighbor of grid?.cells?.c?.[cell] || []) {
    const point = grid?.points?.[neighbor];
    if (!isWorldPoint(point) || pointsNear(point, center, 0.000000001)) continue;
    const key = `${point[0]}:${point[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    neighborPoints.push(point);
  }
  if (neighborPoints.length < 2) return [];

  let boundary = [[0, 0], [width, 0], [width, height], [0, height]];
  for (const neighbor of neighborPoints) {
    boundary = clipVoronoiRecoveryBoundary(boundary, center, neighbor);
    if (boundary.length < 3) return [];
  }
  boundary = cleanCellVisualBoundary(boundary);
  if (boundary.length < 3 || (!pointInCellVisualBoundary(center, boundary) && !pointOnCellVisualBoundary(center, boundary))) return [];
  return triangulateCellVisualBoundarySafely(boundary).status === "ok" ? boundary : [];
}

function pointOnCellVisualBoundary(point, boundary) {
  const span = Math.max(
    Math.max(...boundary.map(item => item[0])) - Math.min(...boundary.map(item => item[0])),
    Math.max(...boundary.map(item => item[1])) - Math.min(...boundary.map(item => item[1])),
    1
  );
  const epsilon = Math.max(0.0000001, span * 0.00000001);
  for (let index = 0; index < boundary.length; index++) {
    if (pointSegmentDistance(point, boundary[index], boundary[(index + 1) % boundary.length]) <= epsilon) return true;
  }
  return false;
}

function clipVoronoiRecoveryBoundary(boundary, center, neighbor) {
  if (boundary.length < 3) return [];
  const normalX = neighbor[0] - center[0];
  const normalY = neighbor[1] - center[1];
  const midpointX = (neighbor[0] + center[0]) / 2;
  const midpointY = (neighbor[1] + center[1]) / 2;
  const epsilon = Math.max(0.000000001, Math.hypot(normalX, normalY) * 0.000000001);
  const signedDistance = point => (point[0] - midpointX) * normalX + (point[1] - midpointY) * normalY;
  const output = [];
  for (let index = 0; index < boundary.length; index++) {
    const start = boundary[index];
    const end = boundary[(index + 1) % boundary.length];
    const startDistance = signedDistance(start);
    const endDistance = signedDistance(end);
    const startInside = startDistance <= epsilon;
    const endInside = endDistance <= epsilon;
    if (startInside !== endInside) {
      const divisor = startDistance - endDistance;
      if (Math.abs(divisor) <= 0.000000000001) return [];
      const t = startDistance / divisor;
      output.push([
        start[0] + (end[0] - start[0]) * t,
        start[1] + (end[1] - start[1]) * t
      ]);
    }
    if (endInside) output.push([...end]);
  }
  return output;
}

function buildValidatedHardBoundaryFanIndices(points, center) {
  if (points.length < 3 || cellVisualBoundarySelfIntersects(points) || !pointInCellVisualBoundary(center, points)) return [];
  const fanPoints = [center, ...points];
  const indices = [];
  for (let index = 0; index < points.length; index++) {
    indices.push(0, index + 1, (index + 1) % points.length + 1);
  }
  if (!validateCellVisualTriangulation(fanPoints, indices, points)) return [];
  return indices;
}

function cleanCellVisualBoundary(points) {
  if (!points.length) return [];
  const span = Math.max(
    Math.max(...points.map(point => point[0])) - Math.min(...points.map(point => point[0])),
    Math.max(...points.map(point => point[1])) - Math.min(...points.map(point => point[1])),
    1
  );
  const epsilon = Math.max(0.0000001, span * 0.00000001);
  let cleaned = [];
  for (const point of points) {
    if (!cleaned.length || worldDistance(cleaned.at(-1), point) > epsilon) cleaned.push([...point]);
  }
  if (cleaned.length > 1 && worldDistance(cleaned[0], cleaned.at(-1)) <= epsilon) cleaned.pop();
  let changed = true;
  while (changed && cleaned.length >= 3) {
    changed = false;
    const next = [];
    for (let index = 0; index < cleaned.length; index++) {
      const previous = cleaned[(index + cleaned.length - 1) % cleaned.length];
      const point = cleaned[index];
      const following = cleaned[(index + 1) % cleaned.length];
      if (pointSegmentDistance(point, previous, following) <= epsilon
        && worldDistance(previous, following) + epsilon >= worldDistance(previous, point) + worldDistance(point, following)) {
        changed = true;
        continue;
      }
      next.push(point);
    }
    cleaned = next;
  }
  return cleaned;
}

function validateCellVisualTriangulation(points, indices, coverageBoundary = points) {
  if (!indices.length || indices.length % 3) return false;
  const polygonArea = Math.abs(cellVisualBoundaryArea(coverageBoundary));
  if (polygonArea <= 0.000000001) return false;
  let triangleArea = 0;
  for (let index = 0; index < indices.length; index += 3) {
    const triangle = [points[indices[index]], points[indices[index + 1]], points[indices[index + 2]]];
    if (triangle.some(point => !point)) return false;
    const area = Math.abs(cellVisualTriangleArea(triangle));
    if (area <= 0.000000001) return false;
    triangleArea += area;
    const centroid = [
      (triangle[0][0] + triangle[1][0] + triangle[2][0]) / 3,
      (triangle[0][1] + triangle[1][1] + triangle[2][1]) / 3
    ];
    if (!pointInCellVisualBoundary(centroid, coverageBoundary)) return false;
  }
  return Math.abs(triangleArea - polygonArea) <= Math.max(0.000001, polygonArea * 0.000001);
}

function cellVisualBoundaryArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index++) {
    const next = points[(index + 1) % points.length];
    area += points[index][0] * next[1] - next[0] * points[index][1];
  }
  return area / 2;
}

function cellVisualTriangleArea(points) {
  return (
    points[0][0] * (points[1][1] - points[2][1])
    + points[1][0] * (points[2][1] - points[0][1])
    + points[2][0] * (points[0][1] - points[1][1])
  ) / 2;
}

function cellVisualBoundarySelfIntersects(points) {
  for (let first = 0; first < points.length; first++) {
    const firstNext = (first + 1) % points.length;
    for (let second = first + 1; second < points.length; second++) {
      const secondNext = (second + 1) % points.length;
      if (first === second || firstNext === second || secondNext === first) continue;
      if (segmentsProperlyIntersect(points[first], points[firstNext], points[second], points[secondNext])) return true;
    }
  }
  return false;
}

function segmentsProperlyIntersect(a, b, c, d) {
  const abC = cross2d(a, b, c);
  const abD = cross2d(a, b, d);
  const cdA = cross2d(c, d, a);
  const cdB = cross2d(c, d, b);
  return abC * abD < -0.000000000001 && cdA * cdB < -0.000000000001;
}

function cross2d(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function pointSegmentDistance(point, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0.000000000001) return worldDistance(point, a);
  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared));
  return worldDistance(point, [a[0] + dx * t, a[1] + dy * t]);
}

function buildCellVisualBoundary(map, cell, edgeCurves, shoreEdges) {
  const vertexIds = map?.grid?.cells?.v?.[cell] || [];
  if (vertexIds.length < 3) return [];
  const points = [];

  for (let index = 0; index < vertexIds.length; index++) {
    const a = vertexIds[index];
    const b = vertexIds[(index + 1) % vertexIds.length];
    const curve = cellVisualEdgeCurve(map, a, b, edgeCurves, shoreEdges);
    const directed = a <= b ? curve : [...curve].reverse();
    for (let pointIndex = 0; pointIndex < directed.length; pointIndex++) {
      if (points.length && pointIndex === 0) continue;
      points.push(directed[pointIndex]);
    }
  }

  if (points.length > 1 && pointsNear(points[0], points[points.length - 1])) points.pop();
  return points;
}

function cellVisualEdgeCurve(map, a, b, edgeCurves, shoreEdges) {
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
  if (shoreEdges.has(key)) {
    const edge = [start, end];
    edgeCurves.set(key, edge);
    return edge;
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

function collectShoreCellVisualEdges(map) {
  const cells = map?.grid?.cells;
  const edges = new Set();
  if (!cells?.i || !cells?.c || !cells?.v || !cells?.h) return edges;
  for (const cell of cells.i) {
    const land = Number(cells.h[cell]) >= 20;
    for (const neighbor of cells.c[cell] || []) {
      if (neighbor <= cell || land === (Number(cells.h[neighbor]) >= 20)) continue;
      const neighborVertices = new Set(cells.v[neighbor] || []);
      const shared = (cells.v[cell] || []).filter(vertex => neighborVertices.has(vertex));
      if (shared.length < 2) continue;
      edges.add(`${Math.min(shared[0], shared[1])}:${Math.max(shared[0], shared[1])}`);
    }
  }
  return edges;
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
