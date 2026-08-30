import {colorForState, colorForProvince, isLandCell} from "./color-modes.js";
import {createRenderContext} from "./render-context.js";
import {isWorldPoint, midpoint, normalizeWorldVector, pointsNear, smoothWorldPathAndColors, worldDistance} from "./geometry.js";
import {pushWorldPolylineMesh, pushWorldVertex} from "./mesh-writer.js";
import {pickGridCell} from "./picking.js";
import {SHORE_VISUAL_STYLE, buildSmoothedShoreBoundaryPoints, sharedVoronoiEdge} from "./shore-layer.js";
import Delaunator from "../vendor/delaunator.js";

export const STATE_VISUAL_STYLE = Object.freeze({
  bandWidthWorld: 7,
  smoothing: Object.freeze({iterations: 1, factor: 0.18}),
  borderWidthWorld: 0.36,
  borderStroke: Object.freeze([0.36, 0.34, 0.3, 0.34]),
  meshAlpha: 0.72,
  colorForValue: colorForState
});

export const PROVINCE_VISUAL_STYLE = Object.freeze({
  bandWidthWorld: 4,
  smoothing: Object.freeze({iterations: 1, factor: 0.14}),
  borderWidthWorld: 0.24,
  borderDashWorld: Object.freeze({dashWorld: 2, gapWorld: 2}),
  borderStroke: Object.freeze([0.45, 0.43, 0.38, 0.22]),
  meshAlpha: 0.68,
  colorForValue: colorForProvince
});

export function pushPoliticalBoundaryStrokes(vertices, paths, context, color, widthWorld, dashWorld = null) {
  for (const path of paths?.boundaries || []) {
    pushWorldPolylineMesh(vertices, context, path.points, color, widthWorld, {
      closed: pointsNear(path.points?.[0], path.points?.[path.points.length - 1]),
      joinMode: "none",
      dashWorld
    });
  }
}

function countPathPoints(paths = []) {
  return paths.reduce((sum, path) => sum + (path.points?.length || 0), 0);
}

export function pushPoliticalVisualBands(vertices, context, paths, style) {
  for (const path of paths.boundaries) pushPoliticalVisualBand(vertices, path, context, style);
}

function pushPoliticalVisualBand(vertices, path, context, style) {
  const {map} = context;
  const visual = buildSmoothedPoliticalVisual(path, map, style);
  if (!visual || visual.a.points.length < 2 || visual.b.points.length !== visual.a.points.length) return;

  for (let index = 0; index < visual.a.points.length - 1; index++) {
    const a0 = visual.a.points[index];
    const a1 = visual.a.points[index + 1];
    const b0 = visual.b.points[index];
    const b1 = visual.b.points[index + 1];
    const colorA0 = visual.a.colors[index];
    const colorA1 = visual.a.colors[index + 1];
    const colorB0 = visual.b.colors[index];
    const colorB1 = visual.b.colors[index + 1];
    pushWorldVertex(vertices, context, a0, colorA0);
    pushWorldVertex(vertices, context, b0, colorB0);
    pushWorldVertex(vertices, context, b1, colorB1);
    pushWorldVertex(vertices, context, a0, colorA0);
    pushWorldVertex(vertices, context, b1, colorB1);
    pushWorldVertex(vertices, context, a1, colorA1);
  }
}

function buildSmoothedPoliticalVisual(path, map, style) {
  if (!path.points?.length || path.points.length !== path.sideVectors?.length) return null;
  const halfWidth = style.bandWidthWorld / 2;
  const pointsA = [];
  const pointsB = [];
  const colorsA = [];
  const colorsB = [];

  for (let index = 0; index < path.points.length; index++) {
    const point = path.points[index];
    const side = path.sideVectors[index] || {x: 0, y: 0};
    pointsA.push([point[0] + side.x * halfWidth, point[1] + side.y * halfWidth]);
    pointsB.push([point[0] - side.x * halfWidth, point[1] - side.y * halfWidth]);
    colorsA.push(style.colorForValue(path.valuesA[index], map));
    colorsB.push(style.colorForValue(path.valuesB[index], map));
  }

  const a = smoothWorldPathAndColors(pointsA, colorsA, style.smoothing);
  const b = smoothWorldPathAndColors(pointsB, colorsB, style.smoothing);
  if (Number.isFinite(style.bandAlpha)) {
    a.colors = a.colors.map(color => withAlpha(color, style.bandAlpha));
    b.colors = b.colors.map(color => withAlpha(color, style.bandAlpha));
  }
  return {
    a,
    b
  };
}

export function buildStateVisualPaths(map) {
  return {
    boundaries: buildPoliticalPathsFromEdges(collectPoliticalVisualEdges(map, "state"))
  };
}

export function buildProvinceVisualPaths(map) {
  return {
    boundaries: buildPoliticalPathsFromEdges(collectPoliticalVisualEdges(map, "province"))
  };
}

export function emptyPoliticalVisualPaths() {
  return {boundaries: []};
}

export function summarizePoliticalVisualPaths(paths, style) {
  return {
    paths: paths?.boundaries?.length || 0,
    points: countPathPoints(paths?.boundaries),
    bandWidthWorld: style.bandWidthWorld,
    smoothing: {...style.smoothing},
    borderDashWorld: style.borderDashWorld ? {...style.borderDashWorld} : null,
    borderStroke: [...style.borderStroke]
  };
}

export function buildPoliticalVisualMeshCache(map, field, paths, shorePaths, style) {
  const context = createRenderContext(map);
  const startedAt = performance.now();
  const groups = collectPoliticalVisualMeshGroups(map, field, paths, shorePaths, style);
  const vertices = [];
  const surfaceVertices = [];
  const quality = createPoliticalMeshQualityStats(map);
  let pointCount = 0;
  let candidateTriangles = 0;
  let keptTriangles = 0;
  let rejectedTriangles = 0;
  let longEdgeFilteredTriangles = 0;
  let skinnyFilteredTriangles = 0;
  let sampleFilteredTriangles = 0;
  let skippedGroups = 0;
  const groupStats = [];

  for (const group of groups.values()) {
    pointCount += group.points.length;
    if (group.points.length < 3) {
      skippedGroups++;
      groupStats.push({value: group.value, points: group.points.length, candidateTriangles: 0, keptTriangles: 0, rejectedTriangles: 0, skipped: true});
      continue;
    }

    const delaunay = Delaunator.from(group.points);
    const candidate = Math.floor(delaunay.triangles.length / 3);
    let kept = 0;
    let rejected = 0;
    let longEdgeFiltered = 0;
    let skinnyFiltered = 0;
    let sampleFiltered = 0;
    const groupQuality = createPoliticalMeshGroupQualityStats();
    for (let index = 0; index < delaunay.triangles.length; index += 3) {
      const a = group.points[delaunay.triangles[index]];
      const b = group.points[delaunay.triangles[index + 1]];
      const c = group.points[delaunay.triangles[index + 2]];
      const maxEdgeWorld = triangleMaxEdgeWorld(a, b, c);
      if (maxEdgeWorld > quality.longEdgeThresholdWorld) {
        longEdgeFiltered++;
        rememberPoliticalMeshNotableTriangle(quality, group.value, a, b, c, maxEdgeWorld, false, false, "long");
        continue;
      }
      if (shouldFilterPoliticalMeshSkinnyTriangle(quality, a, b, c, maxEdgeWorld)) {
        skinnyFiltered++;
        rememberPoliticalMeshNotableTriangle(quality, group.value, a, b, c, maxEdgeWorld, false, false, "skinny");
        continue;
      }
      const centroid = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
      const picked = pickGridCell(map, centroid[0], centroid[1]);
      if (picked?.gridCell !== null && picked?.gridCell !== undefined && isLandCell(picked.gridCell, map) && (map.grid.cells[field]?.[picked.gridCell] || 0) === group.value) {
        const sampleStatus = inspectPoliticalMeshTriangleSamples(map, field, group.value, a, b, c);
        if (shouldFilterPoliticalMeshSampleTriangle(quality, maxEdgeWorld, sampleStatus)) {
          sampleFiltered++;
          rememberPoliticalMeshNotableTriangle(quality, group.value, a, b, c, maxEdgeWorld, sampleStatus.boundaryMismatch, sampleStatus.waterSample, "sample");
          continue;
        }
        kept++;
        addPoliticalMeshTriangleQuality(quality, groupQuality, map, field, group.value, a, b, c, maxEdgeWorld, sampleStatus);
        const surfaceColor = style.colorForValue(group.value, map);
        const debugColor = withAlpha(surfaceColor, style.meshAlpha ?? 0.7);
        pushWorldVertex(surfaceVertices, context, a, surfaceColor);
        pushWorldVertex(surfaceVertices, context, b, surfaceColor);
        pushWorldVertex(surfaceVertices, context, c, surfaceColor);
        pushWorldVertex(vertices, context, a, debugColor);
        pushWorldVertex(vertices, context, b, debugColor);
        pushWorldVertex(vertices, context, c, debugColor);
      } else {
        rejected++;
      }
    }

    candidateTriangles += candidate;
    keptTriangles += kept;
    rejectedTriangles += rejected;
    longEdgeFilteredTriangles += longEdgeFiltered;
    skinnyFilteredTriangles += skinnyFiltered;
    sampleFilteredTriangles += sampleFiltered;
    groupStats.push({
      value: group.value,
      points: group.points.length,
      candidateTriangles: candidate,
      keptTriangles: kept,
      rejectedTriangles: rejected,
      longEdgeFilteredTriangles: longEdgeFiltered,
      skinnyFilteredTriangles: skinnyFiltered,
      sampleFilteredTriangles: sampleFiltered,
      skipped: false,
      maxEdgeWorld: roundValue(groupQuality.maxEdgeWorld),
      longTriangleCount: groupQuality.longTriangleCount,
      boundaryMismatchTriangleCount: groupQuality.boundaryMismatchTriangleCount,
      waterSampleTriangleCount: groupQuality.waterSampleTriangleCount
    });
  }

  groupStats.sort((a, b) => b.keptTriangles - a.keptTriangles);
  return {
    field,
    groups: groups.size,
    pointCount,
    candidateTriangles,
    keptTriangles,
    rejectedTriangles,
    longEdgeFilteredTriangles,
    skinnyFilteredTriangles,
    sampleFilteredTriangles,
    skippedGroups,
    vertices: new Float32Array(vertices),
    surfaceVertices: new Float32Array(surfaceVertices),
    vertexCount: surfaceVertices.length / 6,
    quality: summarizePoliticalMeshQualityStats(quality, keptTriangles),
    buildMs: roundMs(performance.now() - startedAt),
    largestGroups: groupStats.slice(0, 8)
  };
}

function createPoliticalMeshQualityStats(map) {
  const averageGridSpacingWorld = estimateGridSpacingWorld(map);
  const longEdgeThresholdWorld = Math.max(averageGridSpacingWorld * 4.5, SHORE_VISUAL_STYLE.bandWidthWorld * 1.25);
  return {
    averageGridSpacingWorld,
    longEdgeThresholdWorld,
    maxEdgeWorld: 0,
    filteredLongTriangleCount: 0,
    filteredSkinnyTriangleCount: 0,
    filteredSampleTriangleCount: 0,
    longTriangleCount: 0,
    boundaryMismatchTriangleCount: 0,
    waterSampleTriangleCount: 0,
    notableTriangles: []
  };
}

function createPoliticalMeshGroupQualityStats() {
  return {
    maxEdgeWorld: 0,
    longTriangleCount: 0,
    boundaryMismatchTriangleCount: 0,
    waterSampleTriangleCount: 0
  };
}

function addPoliticalMeshTriangleQuality(quality, groupQuality, map, field, value, a, b, c, maxEdgeWorld = triangleMaxEdgeWorld(a, b, c), sampleStatus = inspectPoliticalMeshTriangleSamples(map, field, value, a, b, c)) {
  quality.maxEdgeWorld = Math.max(quality.maxEdgeWorld, maxEdgeWorld);
  groupQuality.maxEdgeWorld = Math.max(groupQuality.maxEdgeWorld, maxEdgeWorld);
  if (maxEdgeWorld > quality.longEdgeThresholdWorld) {
    quality.longTriangleCount++;
    groupQuality.longTriangleCount++;
  }

  const {boundaryMismatch, waterSample} = sampleStatus;

  if (boundaryMismatch) {
    quality.boundaryMismatchTriangleCount++;
    groupQuality.boundaryMismatchTriangleCount++;
  }
  if (waterSample) {
    quality.waterSampleTriangleCount++;
    groupQuality.waterSampleTriangleCount++;
  }
  if (maxEdgeWorld > quality.longEdgeThresholdWorld || boundaryMismatch || waterSample) {
    rememberPoliticalMeshNotableTriangle(quality, value, a, b, c, maxEdgeWorld, boundaryMismatch, waterSample, false);
  }
}

function inspectPoliticalMeshTriangleSamples(map, field, value, a, b, c) {
  const samples = [midpoint(a, b), midpoint(b, c), midpoint(c, a)];
  let boundaryMismatch = false;
  let waterSample = false;
  for (const sample of samples) {
    const picked = pickGridCell(map, sample[0], sample[1]);
    const cell = picked?.gridCell;
    if (cell === null || cell === undefined || !isLandCell(cell, map)) {
      waterSample = true;
      continue;
    }
    if ((map.grid.cells[field]?.[cell] || 0) !== value) boundaryMismatch = true;
  }
  return {boundaryMismatch, waterSample};
}

function shouldFilterPoliticalMeshSkinnyTriangle(quality, a, b, c, maxEdgeWorld) {
  const minAltitude = triangleMinAltitudeWorld(a, b, c, maxEdgeWorld);
  return maxEdgeWorld > quality.averageGridSpacingWorld * 1.5 && minAltitude < quality.averageGridSpacingWorld * 0.25;
}

function shouldFilterPoliticalMeshSampleTriangle(quality, maxEdgeWorld, sampleStatus) {
  const sampleThreshold = quality.averageGridSpacingWorld * 2.5;
  const waterThreshold = quality.averageGridSpacingWorld * 3.2;
  return (sampleStatus.boundaryMismatch && maxEdgeWorld > sampleThreshold) || (sampleStatus.waterSample && maxEdgeWorld > waterThreshold);
}

function triangleMaxEdgeWorld(a, b, c) {
  return Math.max(worldDistance(a, b), worldDistance(b, c), worldDistance(c, a));
}

function triangleMinAltitudeWorld(a, b, c, maxEdgeWorld = triangleMaxEdgeWorld(a, b, c)) {
  if (!maxEdgeWorld) return 0;
  return triangleDoubleAreaWorld(a, b, c) / maxEdgeWorld;
}

function triangleDoubleAreaWorld(a, b, c) {
  return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
}

function rememberPoliticalMeshNotableTriangle(quality, value, a, b, c, maxEdgeWorld, boundaryMismatch, waterSample, filterReason) {
  if (filterReason === "long") quality.filteredLongTriangleCount++;
  if (filterReason === "skinny") quality.filteredSkinnyTriangleCount++;
  if (filterReason === "sample") quality.filteredSampleTriangleCount++;
  const centroid = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
  const filtered = Boolean(filterReason);
  const score = maxEdgeWorld + (boundaryMismatch ? quality.longEdgeThresholdWorld : 0) + (waterSample ? quality.longEdgeThresholdWorld * 0.5 : 0) + (filtered ? quality.longEdgeThresholdWorld : 0);
  const item = {
    value,
    x: roundValue(centroid[0]),
    y: roundValue(centroid[1]),
    maxEdgeWorld: roundValue(maxEdgeWorld),
    boundaryMismatch,
    waterSample,
    filtered,
    filterReason: filterReason || null,
    score: roundValue(score)
  };
  quality.notableTriangles.push(item);
  quality.notableTriangles.sort((aItem, bItem) => bItem.score - aItem.score);
  if (quality.notableTriangles.length > 8) quality.notableTriangles.length = 8;
}

function summarizePoliticalMeshQualityStats(quality, keptTriangles) {
  return {
    averageGridSpacingWorld: roundValue(quality.averageGridSpacingWorld),
    longEdgeThresholdWorld: roundValue(quality.longEdgeThresholdWorld),
    maxEdgeWorld: roundValue(quality.maxEdgeWorld),
    filteredLongTriangleCount: quality.filteredLongTriangleCount,
    filteredSkinnyTriangleCount: quality.filteredSkinnyTriangleCount,
    filteredSampleTriangleCount: quality.filteredSampleTriangleCount,
    longTriangleCount: quality.longTriangleCount,
    longTriangleRatio: roundRatio(quality.longTriangleCount, keptTriangles),
    boundaryMismatchTriangleCount: quality.boundaryMismatchTriangleCount,
    boundaryMismatchRatio: roundRatio(quality.boundaryMismatchTriangleCount, keptTriangles),
    waterSampleTriangleCount: quality.waterSampleTriangleCount,
    waterSampleRatio: roundRatio(quality.waterSampleTriangleCount, keptTriangles),
    notableTriangles: quality.notableTriangles
  };
}

function estimateGridSpacingWorld(map) {
  const cells = map?.grid?.cells;
  const points = map?.grid?.points;
  if (!cells?.i || !cells?.c || !points) return Math.sqrt((map?.metadata?.graphWidth || 1) * (map?.metadata?.graphHeight || 1) / 10000);
  let total = 0;
  let count = 0;
  for (const cell of cells.i) {
    const center = cellCenterPoint(map.grid, cell);
    if (!isWorldPoint(center)) continue;
    for (const neighbor of cells.c[cell] || []) {
      if (neighbor <= cell) continue;
      const neighborCenter = cellCenterPoint(map.grid, neighbor);
      if (!isWorldPoint(neighborCenter)) continue;
      total += worldDistance(center, neighborCenter);
      count++;
      if (count >= 6000) return total / count;
    }
  }
  return count ? total / count : Math.sqrt((map?.metadata?.graphWidth || 1) * (map?.metadata?.graphHeight || 1) / Math.max(1, cells.i.length || 1));
}

function collectPoliticalVisualMeshGroups(map, field, paths, shorePaths, style) {
  const groups = new Map();
  const cells = map?.grid?.cells;
  if (!cells?.i || !cells?.[field]) return groups;

  for (const cell of cells.i) {
    if (!isLandCell(cell, map)) continue;
    const value = cells[field][cell] || 0;
    if (!value) continue;
    addPoliticalVisualMeshPoint(ensurePoliticalVisualMeshGroup(groups, value), cellCenterPoint(map.grid, cell));
  }

  for (const path of paths?.boundaries || []) {
    const visual = buildSmoothedPoliticalVisual(path, map, style);
    if (!visual) continue;
    const valueA = path.valuesA?.[0] || 0;
    const valueB = path.valuesB?.[0] || 0;
    if (valueA) for (const point of visual.a.points) addPoliticalVisualMeshPoint(ensurePoliticalVisualMeshGroup(groups, valueA), point);
    if (valueB) for (const point of visual.b.points) addPoliticalVisualMeshPoint(ensurePoliticalVisualMeshGroup(groups, valueB), point);
  }

  addShoreVisualMeshPoints(groups, map, field, shorePaths);

  return groups;
}

function addShoreVisualMeshPoints(groups, map, field, shorePaths) {
  for (const path of [...(shorePaths?.coastline || []), ...(shorePaths?.lakeShore || [])]) {
    const points = buildSmoothedShoreBoundaryPoints(path, map);
    for (const point of points) {
      const picked = pickGridCell(map, point[0], point[1]);
      const cell = picked?.gridCell;
      if (cell === null || cell === undefined || !isLandCell(cell, map)) continue;
      const value = map.grid.cells[field]?.[cell] || 0;
      if (value) addPoliticalVisualMeshPoint(ensurePoliticalVisualMeshGroup(groups, value), point);
    }
  }
}

function ensurePoliticalVisualMeshGroup(groups, value) {
  if (!groups.has(value)) groups.set(value, {value, points: [], pointKeys: new Set()});
  return groups.get(value);
}

function addPoliticalVisualMeshPoint(group, point) {
  if (!isWorldPoint(point)) return;
  const key = `${Math.round(point[0] * 100)}:${Math.round(point[1] * 100)}`;
  if (group.pointKeys.has(key)) return;
  group.pointKeys.add(key);
  group.points.push([point[0], point[1]]);
}

export function emptyPoliticalVisualMeshes() {
  return {
    states: emptyPoliticalVisualMeshCache("state"),
    provinces: emptyPoliticalVisualMeshCache("province")
  };
}

function emptyPoliticalVisualMeshCache(field) {
  return {
    field,
    groups: 0,
    pointCount: 0,
    candidateTriangles: 0,
    keptTriangles: 0,
    rejectedTriangles: 0,
    longEdgeFilteredTriangles: 0,
    skinnyFilteredTriangles: 0,
    sampleFilteredTriangles: 0,
    skippedGroups: 0,
    vertices: new Float32Array(),
    surfaceVertices: new Float32Array(),
    vertexCount: 0,
    quality: summarizePoliticalMeshQualityStats(createPoliticalMeshQualityStats(null), 0),
    buildMs: 0,
    largestGroups: []
  };
}

export function summarizePoliticalVisualMeshes(meshes) {
  return {
    states: summarizePoliticalVisualMeshCache(meshes?.states),
    provinces: summarizePoliticalVisualMeshCache(meshes?.provinces)
  };
}

function summarizePoliticalVisualMeshCache(cache) {
  const safeCache = cache || emptyPoliticalVisualMeshCache("unknown");
  return {
    field: safeCache.field,
    groups: safeCache.groups,
    pointCount: safeCache.pointCount,
    candidateTriangles: safeCache.candidateTriangles,
    keptTriangles: safeCache.keptTriangles,
    rejectedTriangles: safeCache.rejectedTriangles,
    longEdgeFilteredTriangles: safeCache.longEdgeFilteredTriangles || 0,
    skinnyFilteredTriangles: safeCache.skinnyFilteredTriangles || 0,
    sampleFilteredTriangles: safeCache.sampleFilteredTriangles || 0,
    skippedGroups: safeCache.skippedGroups,
    vertexCount: safeCache.vertexCount,
    quality: safeCache.quality,
    buildMs: safeCache.buildMs,
    largestGroups: safeCache.largestGroups
  };
}

export function normalizePoliticalMeshDebugMode(mode) {
  if (mode === "states" || mode === "state") return "states";
  if (mode === "provinces" || mode === "province") return "provinces";
  return "none";
}

export function politicalMeshDebugCache(meshes, mode) {
  if (mode === "states") return meshes?.states;
  if (mode === "provinces") return meshes?.provinces;
  return null;
}

function collectPoliticalVisualEdges(map, field) {
  const edges = [];
  const cells = map?.grid?.cells;
  if (!cells?.c || !cells?.v || !cells?.[field]) return edges;

  for (const cell of cells.i || []) {
    if (!isLandCell(cell, map)) continue;
    const valueA = cells[field][cell] || 0;
    for (const neighbor of cells.c[cell] || []) {
      if (neighbor <= cell || !isLandCell(neighbor, map)) continue;
      const valueB = cells[field][neighbor] || 0;
      if (valueA === valueB || (!valueA && !valueB)) continue;
      if (field !== "state" && (!valueA || !valueB)) continue;
      const edge = sharedVoronoiEdge(map, cell, neighbor);
      if (!edge) continue;
      const centerA = cellCenterPoint(map.grid, cell);
      const centerB = cellCenterPoint(map.grid, neighbor);
      const firstValue = Math.min(valueA, valueB);
      const secondValue = Math.max(valueA, valueB);
      const side = valueA === firstValue
        ? normalizeWorldVector(centerA[0] - centerB[0], centerA[1] - centerB[1])
        : normalizeWorldVector(centerB[0] - centerA[0], centerB[1] - centerA[1]);
      edges.push({
        a: edge[0],
        b: edge[1],
        pair: `${firstValue}:${secondValue}`,
        valueA: firstValue,
        valueB: secondValue,
        side
      });
    }
  }

  return edges;
}

function buildPoliticalPathsFromEdges(edges) {
  const graph = buildPoliticalGraph(edges);
  const paths = [];
  const visited = new Uint8Array(graph.edges.length);

  for (const node of graph.nodes.values()) {
    if (node.edges.length === 2) continue;
    for (const edgeIndex of node.edges) {
      if (visited[edgeIndex]) continue;
      paths.push(createPoliticalPath(graph, walkPoliticalPath(graph, node.key, edgeIndex, visited)));
    }
  }

  for (let edgeIndex = 0; edgeIndex < graph.edges.length; edgeIndex++) {
    if (visited[edgeIndex]) continue;
    paths.push(createPoliticalPath(graph, walkPoliticalPath(graph, graph.edges[edgeIndex].a, edgeIndex, visited)));
  }

  return paths.filter(path => path.points.length >= 2);
}

function buildPoliticalGraph(edges) {
  const nodes = new Map();
  const graphEdges = [];
  for (const edge of edges) {
    if (!isWorldPoint(edge.a) || !isWorldPoint(edge.b)) continue;
    const a = shorePointKey(edge.a);
    const b = shorePointKey(edge.b);
    if (a === b) continue;
    const edgeIndex = graphEdges.length;
    ensureShoreNode(nodes, a, edge.a).edges.push(edgeIndex);
    ensureShoreNode(nodes, b, edge.b).edges.push(edgeIndex);
    graphEdges.push({...edge, a, b});
  }
  return {nodes, edges: graphEdges};
}

function walkPoliticalPath(graph, startKey, firstEdgeIndex, visited) {
  const pair = graph.edges[firstEdgeIndex]?.pair;
  const keys = [startKey];
  const edgeIndexes = [];
  let currentKey = startKey;
  let edgeIndex = firstEdgeIndex;

  while (edgeIndex !== -1 && !visited[edgeIndex]) {
    visited[edgeIndex] = 1;
    edgeIndexes.push(edgeIndex);
    const edge = graph.edges[edgeIndex];
    const nextKey = edge.a === currentKey ? edge.b : edge.a;
    keys.push(nextKey);
    const nextNode = graph.nodes.get(nextKey);
    if (!nextNode || (nextNode.edges.length !== 2 && nextKey !== startKey)) break;
    currentKey = nextKey;
    edgeIndex = nextNode.edges.find(index => !visited[index] && graph.edges[index]?.pair === pair) ?? -1;
  }

  return {keys, edgeIndexes};
}

function createPoliticalPath(graph, walk) {
  const points = [];
  const sideVectors = [];
  const valuesA = [];
  const valuesB = [];

  for (let index = 0; index < walk.keys.length; index++) {
    const node = graph.nodes.get(walk.keys[index]);
    const adjacentEdges = [
      walk.edgeIndexes[index - 1],
      walk.edgeIndexes[index]
    ].filter(edgeIndex => edgeIndex !== undefined);
    const edge = graph.edges[adjacentEdges[0]] || graph.edges[walk.edgeIndexes[0]];
    points.push(node.point);
    sideVectors.push(averageEdgeSide(graph, adjacentEdges));
    valuesA.push(edge?.valueA ?? 0);
    valuesB.push(edge?.valueB ?? 0);
  }

  return {points, sideVectors, valuesA, valuesB};
}

function ensureShoreNode(nodes, key, point) {
  if (!nodes.has(key)) nodes.set(key, {key, point: [point[0], point[1]], edges: []});
  return nodes.get(key);
}

function shorePointKey(point) {
  return `${Math.round(point[0] * 1000)}:${Math.round(point[1] * 1000)}`;
}

function averageEdgeSide(graph, edgeIndexes) {
  let x = 0;
  let y = 0;
  for (const edgeIndex of edgeIndexes) {
    const side = graph.edges[edgeIndex]?.side;
    if (!side) continue;
    x += side.x;
    y += side.y;
  }
  return normalizeWorldVector(x, y);
}

function cellCenterPoint(grid, cell) {
  return grid.points[grid.cells.p?.[cell]] || [0, 0];
}

function withAlpha(color, alpha) {
  return [color?.[0] ?? 0, color?.[1] ?? 0, color?.[2] ?? 0, alpha];
}

function roundMs(value) {
  return Math.round(value * 100) / 100;
}

function roundValue(value) {
  return Math.round(value * 10) / 10;
}

function roundRatio(count, total) {
  if (!total) return 0;
  return Math.round((count / total) * 1000) / 1000;
}
