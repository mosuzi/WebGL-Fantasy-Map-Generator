import {colorForCell, isLandCell} from "./color-modes.js";
import {
  interpolateWorldPoint,
  isWorldPoint,
  midpoint,
  normalizeWorldVector,
  pointsNear,
  polygonArea,
  segmentsIntersect,
  smoothWorldPath,
  worldDistance
} from "./geometry.js";
import {pushWorldLine, pushWorldPolylineMesh, pushWorldVertex} from "./mesh-writer.js";
import {pickGridCell} from "./picking.js";
import {createRandom} from "../generator/random.js";
import {SHORE_TOPOLOGY_ALGORITHM, buildShoreTopologySnapshot} from "./coastline-topology.js";
import polygonClipping from "polygon-clipping";
import earcut from "earcut";
import {resolvedGridVertexPoint} from "./grid-vertex-geometry.js";
import {withSurfaceSideAlpha} from "./surface-side-depth.js";
import {filterShoreRenderSpikes as filterLabShoreRenderSpikes} from "../../../../prototype/boundary-topology-lab/src/shore-render-spike-filter.js";

const shoreSourceIndexCache = new WeakMap();
const shoreRingIndexCache = new WeakMap();
const shoreBandGeometryCache = new WeakMap();
const shoreSurfaceCorrectionCache = new WeakMap();
const shoreSurfaceDrawPacketCache = new WeakMap();

export const SHORE_VISUAL_STYLE = Object.freeze({
  bandWidthWorld: 44,
  minBandWidthWorld: 1.2,
  sidePreflightHalfWidthWorld: 6.5,
  bandWidthFitSteps: 6,
  maxRenderDisplacementWorld: SHORE_TOPOLOGY_ALGORITHM.maxDisplacement,
  maxRenderSegmentWorld: 18,
  spikeAngleCos: 0.86,
  hardSpikeAngleCos: 0.94,
  spikeDisplacementWorld: 2.5,
  smoothing: Object.freeze({iterations: 2, factor: 0.22}),
  coastlineWidthWorld: 0.09,
  lakeShoreWidthWorld: 0.08,
  surfaceBoundaryCoverWorld: 0.18,
  surfaceNeedlePolicy: "exact-xor-boundary-edge-overlap",
  coastlineStroke: Object.freeze([0.7, 0.76, 0.78, 0.58]),
  lakeShoreStroke: Object.freeze([0.62, 0.76, 0.8, 0.54])
});

export function boundaryLineModeForOptions(viewOptions, cellVisualMesh, shoreVisualPaths = null) {
  return viewOptions?.smoothCellBorders !== false && shoreVisualPaths?.topology
    ? "shore-topology-snapshot + butt-join-political"
    : "hard-cell-shore + butt-join-political";
}

export function pushShoreLineLayers(vertices, context, visibility = {}, cellVisualMesh = null, viewOptions = {}, paths = null) {
  const smoothCellBorders = viewOptions.smoothCellBorders !== false && paths?.topology;
  pushShoreLines(vertices, context, {
    cellVisualMesh,
    smoothCellBorders,
    paths,
    drawCoastline: visibility.coastline !== false,
    drawLakeShore: visibility.lakeShore !== false,
    visualTheme: viewOptions.visualTheme
  });
}

function pushShoreLines(vertices, context, options) {
  const {map} = context;
  const cells = map?.grid?.cells;
  const {smoothCellBorders, paths, drawCoastline, drawLakeShore, visualTheme} = options;
  if (!drawCoastline && !drawLakeShore) return;
  if (!cells?.i || !cells?.c) return;

  if (smoothCellBorders && paths) {
    if (drawCoastline) pushSnapshotShoreLines(vertices, paths.coastline, context, visualTheme?.lines?.coastline || SHORE_VISUAL_STYLE.coastlineStroke, SHORE_VISUAL_STYLE.coastlineWidthWorld);
    if (drawLakeShore) pushSnapshotShoreLines(vertices, paths.lakeShore, context, visualTheme?.lines?.lakeShore || SHORE_VISUAL_STYLE.lakeShoreStroke, SHORE_VISUAL_STYLE.lakeShoreWidthWorld);
    return;
  }

  for (const cell of cells.i || []) {
    for (const neighbor of cells.c[cell] || []) {
      if (neighbor <= cell) continue;
      const cellLand = isLandCell(cell, map);
      const neighborLand = isLandCell(neighbor, map);
      if (cellLand === neighborLand) continue;
      const waterCell = cellLand ? neighbor : cell;
      const waterFeature = map.features.features[cells.f?.[waterCell]];
      const isOcean = waterFeature?.type === "ocean";
      if (isOcean && !drawCoastline) continue;
      if (!isOcean && !drawLakeShore) continue;
      const color = isOcean
        ? visualTheme?.lines?.coastline || SHORE_VISUAL_STYLE.coastlineStroke
        : visualTheme?.lines?.lakeShore || SHORE_VISUAL_STYLE.lakeShoreStroke;
      const widthWorld = isOcean ? SHORE_VISUAL_STYLE.coastlineWidthWorld : SHORE_VISUAL_STYLE.lakeShoreWidthWorld;
      const edge = sharedVoronoiEdge(map, cell, neighbor);
      if (edge) pushWorldPolylineMesh(vertices, context, edge, color, widthWorld, {joinMode: "caps"});
    }
  }
}

function pushSnapshotShoreLines(vertices, paths, context, color, widthWorld) {
  for (const path of paths || []) {
    const points = buildShoreSurfaceModel(path, context.map).renderPoints;
    if (points.length < 2) continue;
    pushWorldPolylineMesh(vertices, context, points, color, widthWorld, {
      closed: path.closed && pointsNear(points[0], points.at(-1)),
      joinMode: "round",
      maxSegmentWorld: SHORE_VISUAL_STYLE.maxRenderSegmentWorld
    });
  }
}

export function sharedVoronoiEdge(map, cell, neighbor) {
  const shared = sharedVoronoiEdgeVertexIds(map, cell, neighbor);
  if (!shared) return null;
  return [
    resolvedGridVertexPoint(map.grid, shared[0]),
    resolvedGridVertexPoint(map.grid, shared[1])
  ];
}

export function sharedVoronoiEdgeVertexIds(map, cell, neighbor) {
  const ownVertices = map.grid.cells.v[cell] || [];
  const neighborVertices = new Set(map.grid.cells.v[neighbor] || []);
  const shared = ownVertices.filter(vertex => neighborVertices.has(vertex));
  if (shared.length < 2) return null;
  return [shared[0], shared[1]];
}

export function pushShoreVisualBands(vertices, context, colorMode, viewOptions, paths) {
  const layers = buildShoreSurfaceVertexLayers(context, colorMode, viewOptions, paths);
  for (const value of layers.landCorrections) vertices.push(value);
  for (const value of layers.waterCorrections) vertices.push(value);
}

export function buildShoreSurfaceVertexLayers(context, colorMode, viewOptions, paths) {
  const layers = {
    landCorrections: [],
    waterCorrections: [],
    landCovers: [],
    waterCovers: []
  };
  for (const path of [...paths.coastline, ...paths.lakeShore]) {
    pushShoreSurfaceCorrections(layers, path, context, colorMode, viewOptions);
  }
  return Object.fromEntries(Object.entries(layers).map(([key, values]) => [key, new Float32Array(values)]));
}

function pushShoreSurfaceCorrections(layers, path, context, colorMode, viewOptions) {
  const {map} = context;
  for (const command of buildShoreSurfaceDrawPacket(path, map).commands) {
    const cell = command.side === "land" ? command.landCell : command.waterCell;
    const color = withSurfaceSideAlpha(colorForCell(cell, map, colorMode, viewOptions), command.side);
    const target = command.kind === "correction"
      ? command.side === "land" ? layers.landCorrections : layers.waterCorrections
      : command.side === "land" ? layers.landCovers : layers.waterCovers;
    for (let index = 0; index < command.positions.length; index += 2) {
      pushWorldVertex(target, context, [command.positions[index], command.positions[index + 1]], color);
    }
  }
}

export function buildShoreSurfaceDrawPacket(path, map) {
  const cached = shoreSurfaceDrawPacketCache.get(path);
  if (cached?.map === map) return cached.packet;
  const model = buildShoreSurfaceModel(path, map);
  const correctionTriangles = model.triangles;
  const commands = [];
  const boundaryEdgeCovers = [];
  const boundaryCoverFallbacks = [];
  let skippedBoundaryCoverCount = 0;
  let fallbackBoundaryCoverCount = 0;
  for (const triangle of correctionTriangles) {
    commands.push(shoreDrawCommand("correction", triangle.points, triangle));
    for (const edge of triangle.boundaryEdges || []) {
      boundaryEdgeCovers.push({
        edge,
        side: triangle.side,
        landCell: triangle.landCell,
        waterCell: triangle.waterCell,
        insidePoint: triangleCentroid(triangle.points),
        targetRings: [model.renderPoints],
        landInside: model.landInside
      });
    }
  }
  const uniqueBoundaryEdgeCovers = deduplicateShoreBoundaryEdgeCovers(boundaryEdgeCovers);
  const resolvedBoundaryEdgeCovers = [];
  for (const cover of uniqueBoundaryEdgeCovers) {
    try {
      const result = buildShoreBoundaryEdgeCoverResult(cover);
      resolvedBoundaryEdgeCovers.push({...cover, fallback: result.fallback});
      if (result.fallback) {
        fallbackBoundaryCoverCount++;
        boundaryCoverFallbacks.push(Object.freeze({
          side: cover.side,
          landCell: cover.landCell,
          waterCell: cover.waterCell,
          edge: Object.freeze(cover.edge.map(point => Object.freeze([point[0], point[1]])))
        }));
      }
      if (!result.triangles.length && worldDistance(cover.edge[0], cover.edge[1]) > 0.000001) skippedBoundaryCoverCount++;
      const semantic = {...cover, coverMode: result.fallback ? "subdivided" : "direct"};
      for (const points of result.triangles) commands.push(shoreDrawCommand("boundary-cover", points, semantic));
    } catch {
      skippedBoundaryCoverCount++;
    }
  }
  const vertexCovers = buildShoreBoundaryVertexCoverTriangles(resolvedBoundaryEdgeCovers);
  for (const vertexCover of vertexCovers) {
    commands.push(shoreDrawCommand("boundary-cover", vertexCover.points, {
      ...vertexCover,
      coverMode: "vertex"
    }));
  }
  const packet = Object.freeze({
    coordinateType: "float32-world",
    drawOrder: Object.freeze(["correction", "boundary-cover"]),
    correctionTriangleCount: correctionTriangles.length,
    boundaryCoverTriangleCount: commands.length - correctionTriangles.length,
    skippedBoundaryCoverCount,
    fallbackBoundaryCoverCount,
    boundaryCoverFallbacks: Object.freeze(boundaryCoverFallbacks),
    landInside: typeof model.landInside === "boolean" ? model.landInside : null,
    surfaceFallbackReason: model.fallbackReason,
    surfaceFallbackDetail: model.fallbackDetail,
    surfaceFallbackLocation: model.fallbackReason === "surface-triangulation-fallback"
      ? shoreSurfaceFallbackLocation(path, model)
      : null,
    commands: Object.freeze(commands)
  });
  shoreSurfaceDrawPacketCache.set(path, {map, packet});
  return packet;
}

export function buildShoreBoundaryEdgeCoverTriangles(cover) {
  return buildShoreBoundaryEdgeCoverResult(cover).triangles;
}

function buildShoreBoundaryEdgeCoverResult(cover) {
  const needsFallback = shoreBoundaryCoverNeedsClippedFallback(cover);
  if (needsFallback) {
    try {
      const clipped = buildClippedShoreBoundaryEdgeCoverTriangles(cover);
      if (clipped.length) return {triangles: clipped, fallback: true};
    } catch {
      // 局部裁剪失败时继续走解析细分，不能让单边中断整张地图。
    }
  }
  const direct = buildDirectShoreBoundaryEdgeCoverTriangles(cover);
  if (direct.length || worldDistance(cover.edge[0], cover.edge[1]) <= 0.000001) {
    return {triangles: direct, fallback: needsFallback};
  }
  const triangles = buildSubdividedShoreBoundaryEdgeCoverTriangles(cover);
  return {triangles, fallback: true};
}

function shoreBoundaryCoverNeedsClippedFallback(cover) {
  if (!cover.targetRings?.length || typeof cover.landInside !== "boolean") return false;
  const [start, end] = cover.edge;
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);
  if (length <= 0.000001) return false;
  const middle = midpoint(start, end);
  let nx = -dy / length;
  let ny = dx / length;
  const distance = SHORE_VISUAL_STYLE.surfaceBoundaryCoverWorld * 0.75;
  const desiredLand = cover.side === "land";
  const positive = [middle[0] + nx * distance, middle[1] + ny * distance];
  const negative = [middle[0] - nx * distance, middle[1] - ny * distance];
  const positiveMatches = (pointInShoreRegion(positive, cover.targetRings) === cover.landInside) === desiredLand;
  const negativeMatches = (pointInShoreRegion(negative, cover.targetRings) === cover.landInside) === desiredLand;
  if (!positiveMatches && !negativeMatches) return true;
  if (positiveMatches && negativeMatches) {
    const insideDx = cover.insidePoint[0] - middle[0];
    const insideDy = cover.insidePoint[1] - middle[1];
    if (insideDx * nx + insideDy * ny > 0) {
      nx = -nx;
      ny = -ny;
    }
  } else if (!positiveMatches) {
    nx = -nx;
    ny = -ny;
  }
  const tangentX = dx / length;
  const tangentY = dy / length;
  for (const width of [
    SHORE_VISUAL_STYLE.surfaceBoundaryCoverWorld,
    SHORE_VISUAL_STYLE.surfaceBoundaryCoverWorld * 0.5,
    SHORE_VISUAL_STYLE.surfaceBoundaryCoverWorld * 0.25
  ]) {
    const cap = Math.min(width * 0.2, length * 0.05);
    const startMatches = shoreBoundaryCoverPointMatchesTarget(start, nx, ny, width, cover);
    const endMatches = shoreBoundaryCoverPointMatchesTarget(end, nx, ny, width, cover);
    const cappedStart = startMatches ? start : [start[0] + tangentX * cap, start[1] + tangentY * cap];
    const cappedEnd = endMatches ? end : [end[0] - tangentX * cap, end[1] - tangentY * cap];
    if (shoreBoundaryCoverMatchesTarget(cappedStart, cappedEnd, nx, ny, width, cover)) return false;
  }
  return true;
}

function buildClippedShoreBoundaryEdgeCoverTriangles(cover) {
  const [start, end] = cover.edge;
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);
  if (length <= 0.000001) return [];
  const tangentX = dx / length;
  const tangentY = dy / length;
  const nx = -tangentY;
  const ny = tangentX;
  const width = SHORE_VISUAL_STYLE.surfaceBoundaryCoverWorld * 2;
  const cap = Math.min(width * 0.2, length * 0.1);
  const origin = midpoint(start, end);
  const local = point => [
    Math.round((point[0] - origin[0]) * 1e7) / 1e7,
    Math.round((point[1] - origin[1]) * 1e7) / 1e7
  ];
  const strip = [[
    local([start[0] - tangentX * cap + nx * width, start[1] - tangentY * cap + ny * width]),
    local([end[0] + tangentX * cap + nx * width, end[1] + tangentY * cap + ny * width]),
    local([end[0] + tangentX * cap - nx * width, end[1] + tangentY * cap - ny * width]),
    local([start[0] - tangentX * cap - nx * width, start[1] - tangentY * cap - ny * width]),
    local([start[0] - tangentX * cap + nx * width, start[1] - tangentY * cap + ny * width])
  ]];
  const target = cover.targetRings.map(ring => ring.map(local));
  const desiredInside = (cover.side === "land") === cover.landInside;
  const clipped = desiredInside
    ? polygonClipping.intersection(strip, target)
    : polygonClipping.difference(strip, target);
  const triangles = [];
  for (const polygon of clipped || []) {
    const flat = flattenShorePolygon(polygon);
    const indices = earcut(flat.vertices, flat.holes, 2);
    for (let index = 0; index < indices.length; index += 3) {
      const points = [indices[index], indices[index + 1], indices[index + 2]].map(vertex => [
        flat.vertices[vertex * 2] + origin[0],
        flat.vertices[vertex * 2 + 1] + origin[1]
      ]);
      const area = triangleSignedArea(points);
      if (Math.abs(area) <= 0.000000001) continue;
      if (area < 0) [points[1], points[2]] = [points[2], points[1]];
      triangles.push(points);
    }
  }
  return triangles;
}

function buildDirectShoreBoundaryEdgeCoverTriangles(cover) {
  const [start, end] = cover.edge;
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);
  if (length <= 0.000001) return [];
  const middle = midpoint(start, end);
  const baseNx = -dy / length;
  const baseNy = dx / length;
  const insideDx = cover.insidePoint[0] - middle[0];
  const insideDy = cover.insidePoint[1] - middle[1];
  const preferredDirection = insideDx * baseNx + insideDy * baseNy > 0 ? -1 : 1;
  const tangentX = dx / length;
  const tangentY = dy / length;
  for (const width of [
    SHORE_VISUAL_STYLE.surfaceBoundaryCoverWorld,
    SHORE_VISUAL_STYLE.surfaceBoundaryCoverWorld * 0.5,
    SHORE_VISUAL_STYLE.surfaceBoundaryCoverWorld * 0.25,
    SHORE_VISUAL_STYLE.surfaceBoundaryCoverWorld * 0.125,
    SHORE_VISUAL_STYLE.surfaceBoundaryCoverWorld * 0.0625,
    SHORE_VISUAL_STYLE.surfaceBoundaryCoverWorld * 0.03125
  ]) {
    for (const direction of [preferredDirection, -preferredDirection]) {
      const nx = baseNx * direction;
      const ny = baseNy * direction;
      const cap = Math.min(width * 0.2, length * 0.05);
      const startMatches = shoreBoundaryCoverPointMatchesTarget(start, nx, ny, width, cover);
      const endMatches = shoreBoundaryCoverPointMatchesTarget(end, nx, ny, width, cover);
      const cappedStart = startMatches ? start : [start[0] + tangentX * cap, start[1] + tangentY * cap];
      const cappedEnd = endMatches ? end : [end[0] - tangentX * cap, end[1] - tangentY * cap];
      const outerStart = [cappedStart[0] + nx * width, cappedStart[1] + ny * width];
      const outerEnd = [cappedEnd[0] + nx * width, cappedEnd[1] + ny * width];
      if (cover.targetRings?.length && typeof cover.landInside === "boolean"
        && !shoreBoundaryCoverMatchesTarget(cappedStart, cappedEnd, nx, ny, width, cover)) continue;
      return [
        [cappedStart, cappedEnd, outerEnd],
        [cappedStart, outerEnd, outerStart]
      ];
    }
  }
  return [];
}

function buildSubdividedShoreBoundaryEdgeCoverTriangles(cover, depth = 0) {
  const [start, end] = cover.edge;
  const length = worldDistance(start, end);
  if (length <= 0.000001) return [];
  const direct = buildDirectShoreBoundaryEdgeCoverTriangles(cover);
  if (direct.length) return direct;
  if (depth < 9 && length > 0.002) {
    const middle = midpoint(start, end);
    const first = buildSubdividedShoreBoundaryEdgeCoverTriangles({...cover, edge: [start, middle]}, depth + 1);
    const second = buildSubdividedShoreBoundaryEdgeCoverTriangles({...cover, edge: [middle, end]}, depth + 1);
    if (first.length && second.length) return [...first, ...second];
  }
  return buildTerminalShoreBoundaryEdgeCoverTriangle(cover);
}

function buildTerminalShoreBoundaryEdgeCoverTriangle(cover) {
  const [start, end] = cover.edge;
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);
  if (length <= 0.000001) return [];
  const middle = midpoint(start, end);
  let nx = -dy / length;
  let ny = dx / length;
  const insideDx = cover.insidePoint[0] - middle[0];
  const insideDy = cover.insidePoint[1] - middle[1];
  if (insideDx * nx + insideDy * ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  const desiredLand = cover.side === "land";
  for (let step = 6; step <= 18; step++) {
    const width = SHORE_VISUAL_STYLE.surfaceBoundaryCoverWorld / 2 ** step;
    for (const direction of [1, -1]) {
      const apex = [middle[0] + nx * width * direction, middle[1] + ny * width * direction];
      const points = [start, end, apex];
      if (shoreBoundaryCoverTriangleMatchesTarget(points, desiredLand, cover)) return [points];
    }
  }
  const width = Math.max(Number.EPSILON * Math.max(1, Math.abs(middle[0]), Math.abs(middle[1])) * 32, 0.00000001);
  const apex = [middle[0] + nx * width, middle[1] + ny * width];
  return [[start, end, apex]];
}

function shoreBoundaryCoverTriangleMatchesTarget(points, desiredLand, cover) {
  const [start, end, apex] = points;
  for (const [edgeRatio, apexRatio] of [
    [0.5, 1],
    [0.25, 0.5],
    [0.5, 0.5],
    [0.75, 0.5],
    [0.4, 0.25],
    [0.6, 0.25]
  ]) {
    const edgePoint = interpolateWorldPoint(start, end, edgeRatio);
    const sample = interpolateWorldPoint(edgePoint, apex, apexRatio);
    const sampleLand = pointInShoreRegion(sample, cover.targetRings) === cover.landInside;
    if (sampleLand !== desiredLand) return false;
  }
  return true;
}

function shoreDrawCommand(kind, points, semantic) {
  return Object.freeze({
    kind,
    side: semantic.side,
    landCell: semantic.landCell,
    waterCell: semantic.waterCell,
    coverMode: semantic.coverMode || null,
    boundaryEdge: kind === "boundary-cover" && semantic.edge
      ? Object.freeze(semantic.edge.map(point => Object.freeze([point[0], point[1]])))
      : null,
    positions: new Float32Array(points.flat())
  });
}

function shoreBoundaryCoverMatchesTarget(start, end, nx, ny, width, cover) {
  const desiredLand = cover.side === "land";
  for (const along of [0.08, 0.25, 0.5, 0.75, 0.92]) {
    const edgePoint = interpolateWorldPoint(start, end, along);
    for (const outward of [0.2, 0.5, 0.8]) {
      const sample = [edgePoint[0] + nx * width * outward, edgePoint[1] + ny * width * outward];
      const sampleLand = pointInShoreRegion(sample, cover.targetRings) === cover.landInside;
      if (sampleLand !== desiredLand) return false;
    }
  }
  return true;
}

function shoreBoundaryCoverPointMatchesTarget(point, nx, ny, width, cover) {
  const desiredLand = cover.side === "land";
  for (const outward of [0.2, 0.5, 0.8]) {
    const sample = [point[0] + nx * width * outward, point[1] + ny * width * outward];
    const sampleLand = pointInShoreRegion(sample, cover.targetRings) === cover.landInside;
    if (sampleLand !== desiredLand) return false;
  }
  return true;
}

function buildShoreBoundaryVertexCoverTriangles(covers) {
  const groups = new Map();
  for (const cover of covers) {
    for (const [vertex, other] of [[cover.edge[0], cover.edge[1]], [cover.edge[1], cover.edge[0]]]) {
      const key = `${pointKey(vertex)}|${cover.side}:${cover.landCell}:${cover.waterCell}`;
      const entries = groups.get(key) || [];
      const length = worldDistance(vertex, other);
      if (length > 0.000001) {
        entries.push({
          vertex,
          cover
        });
      }
      groups.set(key, entries);
    }
  }
  const triangles = [];
  for (const entries of groups.values()) {
    if (entries.length < 2) continue;
    if (!entries.some(entry => entry.cover.fallback)) continue;
    const {vertex, cover} = entries[0];
    const radius = SHORE_VISUAL_STYLE.surfaceBoundaryCoverWorld;
    const local = point => [point[0] - vertex[0], point[1] - vertex[1]];
    const diskRing = [];
    for (let index = 0; index < 16; index++) {
      const angle = Math.PI * 2 * index / 16;
      diskRing.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
    }
    diskRing.push([...diskRing[0]]);
    const disk = [diskRing];
    const target = cover.targetRings.map(ring => ring.map(local));
    const desiredInside = (cover.side === "land") === cover.landInside;
    const clipped = desiredInside
      ? polygonClipping.intersection(disk, target)
      : polygonClipping.difference(disk, target);
    for (const polygon of clipped || []) {
      const flat = flattenShorePolygon(polygon);
      const indices = earcut(flat.vertices, flat.holes, 2);
      for (let index = 0; index < indices.length; index += 3) {
        const points = [indices[index], indices[index + 1], indices[index + 2]].map(pointIndex => [
          flat.vertices[pointIndex * 2] + vertex[0],
          flat.vertices[pointIndex * 2 + 1] + vertex[1]
        ]);
        const area = triangleSignedArea(points);
        if (Math.abs(area) <= 0.000000001) continue;
        if (area < 0) [points[1], points[2]] = [points[2], points[1]];
        triangles.push({points, side: cover.side, landCell: cover.landCell, waterCell: cover.waterCell});
      }
    }
  }
  return triangles;
}

export function shoreCorrectionTriangleAltitude(points) {
  const longestEdge = Math.max(
    worldDistance(points?.[0], points?.[1]),
    worldDistance(points?.[1], points?.[2]),
    worldDistance(points?.[2], points?.[0])
  );
  return longestEdge > 0.000000001 ? Math.abs(triangleSignedArea(points)) * 2 / longestEdge : 0;
}

export function shouldCullShoreSurfaceNeedle(triangle) {
  const altitude = shoreCorrectionTriangleAltitude(triangle?.points);
  return altitude <= 0.000000001;
}

export function buildShoreSurfaceCorrectionTriangles(path, map) {
  return buildShoreSurfaceModel(path, map).triangles;
}

export function buildShoreRenderPoints(path, map) {
  return buildShoreSurfaceModel(path, map).renderPoints;
}

function buildShoreSurfaceModel(path, map) {
  const cached = shoreSurfaceCorrectionCache.get(path);
  if (cached?.map === map) return cached.model;
  const sourcePoints = normalizeClosedShoreRing(path?.points || []);
  const candidateRenderPoints = clampedShoreRenderPoints(path).map(entry => entry.point);
  const renderPoints = normalizeClosedShoreRing(candidateRenderPoints);
  let model = {
    renderPoints: path?.closed ? renderPoints : [...(path?.points || [])],
    triangles: [],
    fallbackReason: path?.closed ? null : "open-arc-shared-source",
    fallbackDetail: null
  };
  if (path?.closed && sourcePoints.length >= 4 && renderPoints.length >= 4) {
    try {
      const landInside = resolveShoreLandInside(path, sourcePoints);
      const difference = polygonClipping.xor([sourcePoints], [renderPoints]);
      const triangles = triangulateShoreDifference(difference, sourcePoints, renderPoints, path, landInside);
      if (!validateShoreDifferenceArea(difference, triangles)) throw new Error("shore-difference-area-mismatch");
      model = {renderPoints, triangles, landInside, fallbackReason: null, fallbackDetail: null};
    } catch (error) {
      model = {
        renderPoints: [...sourcePoints],
        triangles: [],
        fallbackReason: "surface-triangulation-fallback",
        fallbackDetail: error instanceof Error ? error.message : String(error)
      };
    }
  }
  shoreSurfaceCorrectionCache.set(path, {map, model});
  return model;
}

function shoreSurfaceFallbackLocation(path, model) {
  const point = model.renderPoints?.[0] || path?.points?.[0] || null;
  return Object.freeze({
    landCell: Number.isInteger(path?.landCells?.[0]) ? path.landCells[0] : null,
    waterCell: Number.isInteger(path?.waterCells?.[0]) ? path.waterCells[0] : null,
    point: point ? Object.freeze([point[0], point[1]]) : null
  });
}

function normalizeClosedShoreRing(points) {
  const result = [];
  for (const point of points || []) {
    if (!isWorldPoint(point)) continue;
    if (!result.length || !pointsNear(result.at(-1), point)) result.push([point[0], point[1]]);
  }
  if (result.length >= 3 && !pointsNear(result[0], result.at(-1))) result.push([...result[0]]);
  return result;
}

function triangulateShoreDifference(difference, sourceRing, renderRing, path, landInside) {
  const triangles = [];
  for (const polygon of difference || []) {
    const flat = flattenShorePolygon(polygon);
    if (flat.vertices.length < 6) continue;
    const indices = earcut(flat.vertices, flat.holes, 2);
    for (let index = 0; index < indices.length; index += 3) {
      const points = [indices[index], indices[index + 1], indices[index + 2]]
        .map(vertex => [flat.vertices[vertex * 2], flat.vertices[vertex * 2 + 1]]);
      appendShoreDifferenceTriangle(triangles, points, sourceRing, renderRing, path, landInside);
    }
  }
  return triangles;
}

function flattenShorePolygon(polygon) {
  const vertices = [];
  const holes = [];
  for (let ringIndex = 0; ringIndex < (polygon || []).length; ringIndex++) {
    const ring = polygon[ringIndex] || [];
    if (ringIndex) holes.push(vertices.length / 2);
    const limit = ring.length > 1 && pointsNear(ring[0], ring.at(-1)) ? ring.length - 1 : ring.length;
    for (let index = 0; index < limit; index++) vertices.push(ring[index][0], ring[index][1]);
  }
  return {vertices, holes};
}

function appendShoreDifferenceTriangle(result, points, sourceRing, renderRing, path, landInside, depth = 0) {
  const area = Math.abs(triangleSignedArea(points));
  if (area <= 0.000000001) return;
  const center = triangleCentroid(points);
  const sourceInside = pointInShoreRing(center, sourceRing);
  const renderInside = pointInShoreRing(center, renderRing);
  if (sourceInside === renderInside) return;
  const projection = nearestShorePathProjection(center, path);
  const landCell = nearestPathCell(path.landCells, projection.sourceIndex, projection.t);
  const waterCell = nearestPathCell(path.waterCells, projection.sourceIndex, projection.t);
  const side = renderInside === landInside ? "land" : "water";
  const maxEdge = Math.max(
    worldDistance(points[0], points[1]),
    worldDistance(points[1], points[2]),
    worldDistance(points[2], points[0])
  );
  if (depth < 6 && maxEdge > SHORE_VISUAL_STYLE.maxRenderSegmentWorld) {
    const [a, b, c] = points;
    const edges = [
      {length: worldDistance(a, b), first: a, second: b, other: c},
      {length: worldDistance(b, c), first: b, second: c, other: a},
      {length: worldDistance(c, a), first: c, second: a, other: b}
    ].sort((left, right) => right.length - left.length);
    const middle = midpoint(edges[0].first, edges[0].second);
    appendShoreDifferenceTriangle(result, [edges[0].first, middle, edges[0].other], sourceRing, renderRing, path, landInside, depth + 1);
    appendShoreDifferenceTriangle(result, [middle, edges[0].second, edges[0].other], sourceRing, renderRing, path, landInside, depth + 1);
    return;
  }
  result.push({
    index: result.length,
    points,
    side,
    landCell,
    waterCell,
    area,
    boundaryEdges: triangleBoundaryRingEdges(points, sourceRing, renderRing)
  });
}

function triangleBoundaryRingEdges(points, sourceRing, renderRing) {
  const edges = [
    [points[0], points[1]],
    [points[1], points[2]],
    [points[2], points[0]]
  ];
  return edges.filter(edge => segmentLiesOnRing(edge, sourceRing) || segmentLiesOnRing(edge, renderRing));
}

function segmentLiesOnRing([start, end], ring) {
  const middle = midpoint(start, end);
  return [start, middle, end].every(point => nearestRingProjection(point, ring).distance <= 0.000001);
}

function deduplicateShoreBoundaryEdgeCovers(covers) {
  const unique = new Map();
  for (const cover of covers) {
    const [start, end] = cover.edge;
    const forward = `${pointKey(start)}>${pointKey(end)}`;
    const reverse = `${pointKey(end)}>${pointKey(start)}`;
    const semanticKey = cover.color
      ? cover.color.map(value => Number(value).toFixed(5)).join(":")
      : `${cover.side}:${cover.landCell}:${cover.waterCell}`;
    const key = `${forward < reverse ? forward : reverse}|${semanticKey}`;
    if (!unique.has(key)) unique.set(key, cover);
  }
  return [...unique.values()];
}

function pointKey(point) {
  return `${Number(point[0]).toFixed(6)}:${Number(point[1]).toFixed(6)}`;
}

function resolveShoreLandInside(path, sourceRing) {
  let insideVotes = 0;
  let outsideVotes = 0;
  const orientation = polygonArea(sourceRing) >= 0 ? 1 : -1;
  for (let index = 0; index < sourceRing.length - 1; index++) {
    const side = path.sideVectors?.[index];
    if (!side || Math.hypot(side.x, side.y) <= 0.000001) continue;
    const a = sourceRing[index];
    const b = sourceRing[index + 1];
    const interior = normalizeWorldVector(-(b[1] - a[1]) * orientation, (b[0] - a[0]) * orientation);
    const alignment = side.x * interior.x + side.y * interior.y;
    if (alignment > 0.000001) insideVotes++;
    else if (alignment < -0.000001) outsideVotes++;
  }
  if (insideVotes === outsideVotes) throw new Error("shore-interior-side-ambiguous");
  return insideVotes > outsideVotes;
}

function triangleSignedArea(points) {
  return (
    points[0][0] * (points[1][1] - points[2][1])
    + points[1][0] * (points[2][1] - points[0][1])
    + points[2][0] * (points[0][1] - points[1][1])
  ) / 2;
}

function triangleCentroid(points) {
  return [
    (points[0][0] + points[1][0] + points[2][0]) / 3,
    (points[0][1] + points[1][1] + points[2][1]) / 3
  ];
}

function pointInShoreRing(point, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const a = ring[index];
    const b = ring[previous];
    const crosses = (a[1] > point[1]) !== (b[1] > point[1])
      && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0];
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInShoreRegion(point, rings) {
  if (!rings?.length || !pointInShoreRing(point, rings[0])) return false;
  return !rings.slice(1).some(ring => pointInShoreRing(point, ring));
}

function validateShoreDifferenceArea(difference, triangles) {
  const polygonAreaTotal = (difference || []).reduce((total, polygon) => {
    const outer = Math.abs(polygonArea(polygon[0] || []));
    const holes = (polygon || []).slice(1).reduce((sum, ring) => sum + Math.abs(polygonArea(ring)), 0);
    return total + Math.max(0, outer - holes);
  }, 0);
  const triangleAreaTotal = triangles.reduce((sum, triangle) => sum + triangle.area, 0);
  const tolerance = Math.max(0.0001, polygonAreaTotal * 0.00001);
  return Math.abs(polygonAreaTotal - triangleAreaTotal) <= tolerance;
}

function pushShoreVisualBand(vertices, path, context, colorMode, viewOptions) {
  const {map} = context;
  for (const segment of buildSafeShoreVisualSegments(path, map, colorMode, viewOptions)) {
    const {
      centerA, centerB, landA, landB, waterA, waterB,
      landColorA, landColorB, waterColorA, waterColorB,
      landOuterColorA, landOuterColorB, waterOuterColorA, waterOuterColorB
    } = segment;
    pushWorldVertex(vertices, context, centerA, waterColorA);
    pushWorldVertex(vertices, context, waterA, waterOuterColorA);
    pushWorldVertex(vertices, context, waterB, waterOuterColorB);
    pushWorldVertex(vertices, context, centerA, waterColorA);
    pushWorldVertex(vertices, context, waterB, waterOuterColorB);
    pushWorldVertex(vertices, context, centerB, waterColorB);
    pushWorldVertex(vertices, context, centerA, landColorA);
    pushWorldVertex(vertices, context, centerB, landColorB);
    pushWorldVertex(vertices, context, landB, landOuterColorB);
    pushWorldVertex(vertices, context, centerA, landColorA);
    pushWorldVertex(vertices, context, landB, landOuterColorB);
    pushWorldVertex(vertices, context, landA, landOuterColorA);
  }
}

export function buildSafeShoreVisualSegments(path, map, colorMode, viewOptions) {
  const cached = shoreBandGeometryCache.get(path);
  if (cached?.map === map) return cached.segments.map(segment => colorizeShoreBandSegment(segment, map, colorMode, viewOptions));
  const visual = buildSmoothedShoreVisual(path, map, colorMode, viewOptions);
  if (!visual || visual.land.points.length < 2 || visual.water.points.length !== visual.land.points.length) return [];
  const widthScales = new Float32Array(visual.centers.length);
  widthScales.fill(1);
  const segments = [];
  for (let index = 0; index < visual.centers.length - 1; index++) {
    const segment = createShoreVisualSegment(visual, index, widthScales, map);
    segments.push(...subdivideShoreBandSegment(segment, map, colorMode, viewOptions));
  }
  for (let index = 0; index < segments.length; index++) segments[index].index = index;
  shoreBandGeometryCache.set(path, {map, segments});
  return segments.map(segment => colorizeShoreBandSegment(segment, map, colorMode, viewOptions));
}

function colorizeShoreBandSegment(segment, map, colorMode, viewOptions) {
  const landColor = colorForCell(segment.landCellA, map, colorMode, viewOptions);
  const waterColor = colorForCell(segment.waterCellA, map, colorMode, viewOptions);
  const landOuterColor = colorForCell(segment.landOuterCellA, map, colorMode, viewOptions);
  const waterOuterColor = colorForCell(segment.waterOuterCellA, map, colorMode, viewOptions);
  return {
    ...segment,
    landColorA: landColor,
    landColorB: landColor,
    waterColorA: waterColor,
    waterColorB: waterColor,
    landOuterColorA: landOuterColor,
    landOuterColorB: landOuterColor,
    waterOuterColorA: waterOuterColor,
    waterOuterColorB: waterOuterColor
  };
}

function subdivideShoreBandSegment(segment, map, colorMode, viewOptions) {
  const left = sliceShoreBandSegment(segment, 0, 0.5, 1, 1, map, colorMode, viewOptions, null, null);
  const right = sliceShoreBandSegment(segment, 0.5, 1, 1, 1, map, colorMode, viewOptions, null, null);
  const result = [];
  for (const slice of [left, right]) {
    if (isShoreBandSegmentSafe(map, slice)) appendColorSafeShoreBandSegment(result, slice, map, colorMode, viewOptions);
    else {
      for (const pinched of createPinchedShoreBandSegments(slice, map, colorMode, viewOptions)) {
        const geometrySafe = isShoreBandSegmentSafe(map, pinched);
        if (geometrySafe) appendColorSafeShoreBandSegment(result, {...pinched, geometryPinched: true}, map, colorMode, viewOptions);
      }
    }
  }
  return result;
}

function appendColorSafeShoreBandSegment(result, segment, map, colorMode, viewOptions) {
  const subdivision = inspectShoreColorSubdivision(segment, map);
  if (subdivision.center || subdivision.land || subdivision.water) {
    for (const colorSlice of splitShoreBandAtColorTransitions(segment, map, colorMode, viewOptions, subdivision)) {
      const centerSlices = splitShoreBandForCanonicalCenter(colorSlice, map, colorMode, viewOptions);
      for (const centerSlice of centerSlices) {
        const flattened = flattenShoreBandColors(centerSlice, map, colorMode, viewOptions);
        if (isShoreBandSegmentSafe(map, flattened)) result.push({...flattened, geometrySafe: true, colorSplit: true});
      }
    }
    return;
  }
  const flattened = flattenShoreBandColors(segment, map, colorMode, viewOptions);
  if (isShoreBandSegmentSafe(map, flattened)) result.push({...flattened, geometrySafe: true});
}

function splitShoreBandForCanonicalCenter(segment, map, colorMode, viewOptions, depth = 0) {
  const reference = canonicalShoreCellsAtPoint(segment, interpolateWorldPoint(segment.centerA, segment.centerB, 0.1));
  const consistent = [0.25, 0.5, 0.75, 0.9].every(t => {
    const center = interpolateWorldPoint(segment.centerA, segment.centerB, t);
    return sameShoreCells(canonicalShoreCellsAtPoint(segment, center), reference);
  });
  if (consistent || depth >= 12) return [segment];
  const left = sliceShoreBandSegment(segment, 0, 0.5, 1, 1, map, colorMode, viewOptions, null, null);
  const right = sliceShoreBandSegment(segment, 0.5, 1, 1, 1, map, colorMode, viewOptions, null, null);
  return [
    ...splitShoreBandForCanonicalCenter(left, map, colorMode, viewOptions, depth + 1),
    ...splitShoreBandForCanonicalCenter(right, map, colorMode, viewOptions, depth + 1)
  ];
}

function splitShoreBandAtColorTransitions(segment, map, colorMode, viewOptions, subdivision) {
  const breaks = [];
  if (subdivision.center) {
    const centerAt = t => interpolateWorldPoint(segment.centerA, segment.centerB, t);
    let previousCenterT = 0;
    let previousCenterCells = canonicalShoreCellsAtPoint(segment, centerAt(previousCenterT));
    for (let index = 1; index <= 64; index++) {
      const t = index / 64;
      const centerCells = canonicalShoreCellsAtPoint(segment, centerAt(t));
      if (!sameShoreCells(centerCells, previousCenterCells)) {
        let low = previousCenterT;
        let high = t;
        for (let pass = 0; pass < 14; pass++) {
          const middle = (low + high) / 2;
          const middleCells = canonicalShoreCellsAtPoint(segment, centerAt(middle));
          if (sameShoreCells(middleCells, previousCenterCells)) low = middle;
          else high = middle;
        }
        breaks.push((low + high) / 2);
      }
      previousCenterT = t;
      previousCenterCells = centerCells;
    }
  }
  for (const side of ["land", "water"]) {
    if (!subdivision[side]) continue;
    const pointAt = t => interpolateWorldPoint(segment[`${side}A`], segment[`${side}B`], t);
    let previousT = 0;
    let previousPoint = pointAt(previousT);
    let previousCell = pickGridCell(map, previousPoint[0], previousPoint[1])?.gridCell;
    for (let index = 1; index <= 64; index++) {
      const t = index / 64;
      const point = pointAt(t);
      const cell = pickGridCell(map, point[0], point[1])?.gridCell;
      if (cell !== previousCell) {
        let low = previousT;
        let high = t;
        for (let pass = 0; pass < 14; pass++) {
          const middle = (low + high) / 2;
          const middlePoint = pointAt(middle);
          const middleCell = pickGridCell(map, middlePoint[0], middlePoint[1])?.gridCell;
          if (middleCell === previousCell) low = middle;
          else high = middle;
        }
        breaks.push((low + high) / 2);
      }
      previousT = t;
      previousCell = cell;
    }
  }
  const stops = [0, ...breaks.filter(value => value > 0.000001 && value < 0.999999).sort((a, b) => a - b), 1]
    .filter((value, index, values) => index === 0 || Math.abs(value - values[index - 1]) > 0.000001);
  const slices = [];
  for (let index = 0; index < stops.length - 1; index++) {
    slices.push(sliceShoreBandSegment(segment, stops[index], stops[index + 1], 1, 1, map, colorMode, viewOptions, null, null));
  }
  return slices;
}

function inspectShoreColorSubdivision(segment, map) {
  const result = {
    center: segment.sourceIndexA !== segment.sourceIndexB ||
      segment.landCellA !== segment.landCellB ||
      segment.waterCellA !== segment.waterCellB,
    land: false,
    water: false
  };
  if (!result.center) {
    const centerReference = canonicalShoreCellsAtPoint(segment, interpolateWorldPoint(segment.centerA, segment.centerB, 0.1));
    for (const t of [0.25, 0.5, 0.75, 0.9]) {
      const center = interpolateWorldPoint(segment.centerA, segment.centerB, t);
      if (sameShoreCells(canonicalShoreCellsAtPoint(segment, center), centerReference)) continue;
      result.center = true;
      break;
    }
  }
  for (const side of ["land", "water"]) {
    const reference = pickGridCell(map, segment[`${side}A`][0], segment[`${side}A`][1])?.gridCell;
    for (const t of [0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      const point = interpolateWorldPoint(segment[`${side}A`], segment[`${side}B`], t);
      if (pickGridCell(map, point[0], point[1])?.gridCell === reference) continue;
      result[side] = true;
      break;
    }
  }
  return result;
}

function canonicalShoreCellsAtPoint(segment, point) {
  const sourcePath = segment.sourcePath;
  const projection = nearestShorePathProjection(point, sourcePath);
  return {
    landCell: nearestPathCell(sourcePath?.landCells, projection.sourceIndex),
    waterCell: nearestPathCell(sourcePath?.waterCells, projection.sourceIndex)
  };
}

function sameShoreCells(a, b) {
  return a.landCell === b.landCell && a.waterCell === b.waterCell;
}

function flattenShoreBandColors(segment, map, colorMode, viewOptions) {
  const center = interpolateWorldPoint(segment.centerA, segment.centerB, 0.5);
  const midpointLand = interpolateWorldPoint(segment.landA, segment.landB, 0.5);
  const midpointWater = interpolateWorldPoint(segment.waterA, segment.waterB, 0.5);
  const {landCell, waterCell} = canonicalShoreCellsAtPoint(segment, center);
  const landOuterCell = pickGridCell(map, midpointLand[0], midpointLand[1])?.gridCell ?? landCell;
  const waterOuterCell = pickGridCell(map, midpointWater[0], midpointWater[1])?.gridCell ?? waterCell;
  const landColor = colorForCell(landCell, map, colorMode, viewOptions);
  const waterColor = colorForCell(waterCell, map, colorMode, viewOptions);
  const landOuterColor = colorForCell(landOuterCell, map, colorMode, viewOptions);
  const waterOuterColor = colorForCell(waterOuterCell, map, colorMode, viewOptions);
  return {
    ...segment,
    landCellA: landCell,
    landCellB: landCell,
    waterCellA: waterCell,
    waterCellB: waterCell,
    landOuterCellA: landOuterCell,
    landOuterCellB: landOuterCell,
    waterOuterCellA: waterOuterCell,
    waterOuterCellB: waterOuterCell,
    landColorA: landColor,
    landColorB: landColor,
    waterColorA: waterColor,
    waterColorB: waterColor,
    landOuterColorA: landOuterColor,
    landOuterColorB: landOuterColor,
    waterOuterColorA: waterOuterColor,
    waterOuterColorB: waterOuterColor
  };
}

function createPinchedShoreBandSegments(segment, map, colorMode, viewOptions) {
  return [
    sliceShoreBandSegment(segment, 0, 0.5, 1, 0, map, colorMode, viewOptions, null, null),
    sliceShoreBandSegment(segment, 0.5, 1, 0, 1, map, colorMode, viewOptions, null, null)
  ];
}

function sliceShoreBandSegment(segment, t0, t1, scale0, scale1, map, colorMode, viewOptions, centerOverrideA, centerOverrideB) {
  const entry = (t, scale, centerOverride) => {
    const center = centerOverride || interpolateWorldPoint(segment.centerA, segment.centerB, t);
    const sourceLand = interpolateWorldPoint(segment.landA, segment.landB, t);
    const sourceWater = interpolateWorldPoint(segment.waterA, segment.waterB, t);
    const land = interpolateWorldPoint(center, sourceLand, scale);
    const water = interpolateWorldPoint(center, sourceWater, scale);
    const landCell = t < 0.5 ? segment.landCellA : segment.landCellB;
    const waterCell = t < 0.5 ? segment.waterCellA : segment.waterCellB;
    const sourceIndex = t < 0.5 ? segment.sourceIndexA : segment.sourceIndexB;
    const landColor = interpolateColor(segment.landColorA, segment.landColorB, t);
    const waterColor = interpolateColor(segment.waterColorA, segment.waterColorB, t);
    const landOuterCell = scale <= 0 ? landCell : pickGridCell(map, land[0], land[1])?.gridCell;
    const waterOuterCell = scale <= 0 ? waterCell : pickGridCell(map, water[0], water[1])?.gridCell;
    return {
      center,
      land,
      water,
      halfWidth: worldDistance(center, land),
      sourceIndex,
      landCell,
      waterCell,
      landOuterCell,
      waterOuterCell,
      landColor,
      waterColor,
      landOuterColor: scale <= 0 ? landColor : colorForCell(landOuterCell, map, colorMode, viewOptions),
      waterOuterColor: scale <= 0 ? waterColor : colorForCell(waterOuterCell, map, colorMode, viewOptions)
    };
  };
  const a = entry(t0, scale0, centerOverrideA);
  const b = entry(t1, scale1, centerOverrideB);
  return {
    centerA: a.center,
    centerB: b.center,
    landA: a.land,
    landB: b.land,
    waterA: a.water,
    waterB: b.water,
    halfWidthA: a.halfWidth,
    halfWidthB: b.halfWidth,
    sourceIndexA: a.sourceIndex,
    sourceIndexB: b.sourceIndex,
    sourcePath: segment.sourcePath,
    landCellA: a.landCell,
    landCellB: b.landCell,
    waterCellA: a.waterCell,
    waterCellB: b.waterCell,
    landOuterCellA: a.landOuterCell,
    landOuterCellB: b.landOuterCell,
    waterOuterCellA: a.waterOuterCell,
    waterOuterCellB: b.waterOuterCell,
    landColorA: a.landColor,
    landColorB: b.landColor,
    waterColorA: a.waterColor,
    waterColorB: b.waterColor,
    landOuterColorA: a.landOuterColor,
    landOuterColorB: b.landOuterColor,
    waterOuterColorA: a.waterOuterColor,
    waterOuterColorB: b.waterOuterColor,
    bandGenerated: true,
    bandTransition: scale0 !== scale1
  };
}

function interpolateColor(a, b, t) {
  return a.map((value, index) => value + ((b[index] ?? value) - value) * t);
}

function createShoreVisualSegment(visual, index, widthScales, map) {
  const entry = position => {
    const center = visual.centers[position];
    const side = visual.sides[position];
    const landCell = visual.land.cells[position];
    const waterCell = visual.water.cells[position];
    const sourceIndex = visual.sourceIndices[position];
    const preferred = (SHORE_VISUAL_STYLE.bandWidthWorld / 2) * widthScales[position];
    const halfWidth = fitShoreHalfWidth(map, center, side, preferred);
    const land = [center[0] + side.x * halfWidth, center[1] + side.y * halfWidth];
    const water = [center[0] - side.x * halfWidth, center[1] - side.y * halfWidth];
    const landOuterCell = pickGridCell(map, land[0], land[1])?.gridCell;
    const waterOuterCell = pickGridCell(map, water[0], water[1])?.gridCell;
    return {
      center,
      land,
      water,
      halfWidth,
      sourceIndex,
      landCell,
      waterCell,
      landOuterCell,
      waterOuterCell
    };
  };
  const a = entry(index);
  const b = entry(index + 1);
  return {
    index,
    centerA: a.center,
    centerB: b.center,
    landA: a.land,
    landB: b.land,
    waterA: a.water,
    waterB: b.water,
    halfWidthA: a.halfWidth,
    halfWidthB: b.halfWidth,
    sourceIndexA: a.sourceIndex,
    sourceIndexB: b.sourceIndex,
    sourcePath: visual.sourcePath,
    landCellA: a.landCell,
    landCellB: b.landCell,
    waterCellA: a.waterCell,
    waterCellB: b.waterCell,
    landOuterCellA: a.landOuterCell,
    landOuterCellB: b.landOuterCell,
    waterOuterCellA: a.waterOuterCell,
    waterOuterCellB: b.waterOuterCell,
    landColorA: visual.land.colors[index],
    landColorB: visual.land.colors[index + 1],
    waterColorA: visual.water.colors[index],
    waterColorB: visual.water.colors[index + 1],
    landOuterColorA: colorForCell(a.landOuterCell, map, visual.colorMode, visual.viewOptions),
    landOuterColorB: colorForCell(b.landOuterCell, map, visual.colorMode, visual.viewOptions),
    waterOuterColorA: colorForCell(a.waterOuterCell, map, visual.colorMode, visual.viewOptions),
    waterOuterColorB: colorForCell(b.waterOuterCell, map, visual.colorMode, visual.viewOptions)
  };
}

function isShoreBandSegmentSafe(map, segment) {
  const {centerA, centerB, landA, landB, waterA, waterB} = segment;
  const maxSegment = SHORE_VISUAL_STYLE.maxRenderSegmentWorld;
  if (worldDistance(centerA, centerB) > maxSegment) return false;
  const outerEdgeLimit = Math.hypot(maxSegment, SHORE_VISUAL_STYLE.bandWidthWorld / 2) * 1.2;
  if (worldDistance(landA, landB) > outerEdgeLimit || worldDistance(waterA, waterB) > outerEdgeLimit) return false;
  const crossLimit = Math.hypot(maxSegment, SHORE_VISUAL_STYLE.bandWidthWorld) * 1.2;
  if (worldDistance(landA, waterB) > crossLimit || worldDistance(waterA, landB) > crossLimit) return false;
  const collapsedAtA = pointsNear(landA, waterA);
  const collapsedAtB = pointsNear(landB, waterB);
  if (segmentsIntersect(landA, landB, waterA, waterB) && !collapsedAtA && !collapsedAtB) return false;
  if (!hasSafeShoreBandTriangles(segment)) return false;

  const area = Math.abs(polygonArea([landA, landB, waterB, waterA]));
  const expectedArea = Math.max(1, worldDistance(centerA, centerB) * SHORE_VISUAL_STYLE.bandWidthWorld);
  if (area > expectedArea * 2.5) return false;

  return true;
}

export function inspectShoreBandTriangleGeometry(segment, epsilon = 1e-8) {
  const triangles = [
    [segment.centerA, segment.waterA, segment.waterB],
    [segment.centerA, segment.waterB, segment.centerB],
    [segment.centerA, segment.centerB, segment.landB],
    [segment.centerA, segment.landB, segment.landA]
  ];
  const signedAreas = triangles.map(([a, b, c]) =>
    ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2
  );
  const finite = signedAreas.every(Number.isFinite);
  const nonDegenerate = signedAreas.filter(area => Math.abs(area) > epsilon);
  const winding = Math.sign(nonDegenerate[0] || 0);
  const oppositeWinding = nonDegenerate.some(area => Math.sign(area) !== winding);
  return {
    triangles,
    signedAreas,
    finite,
    winding,
    nonDegenerateCount: nonDegenerate.length,
    degenerateCount: signedAreas.length - nonDegenerate.length,
    oppositeWinding,
    safe: finite && nonDegenerate.length >= 2 && !oppositeWinding
  };
}

function hasSafeShoreBandTriangles(segment, epsilon = 1e-8) {
  const {centerA, centerB, landA, landB, waterA, waterB} = segment;
  const areas = [
    signedTriangleDoubleArea(centerA, waterA, waterB),
    signedTriangleDoubleArea(centerA, waterB, centerB),
    signedTriangleDoubleArea(centerA, centerB, landB),
    signedTriangleDoubleArea(centerA, landB, landA)
  ];
  let winding = 0;
  let nonDegenerateCount = 0;
  for (const area of areas) {
    if (!Number.isFinite(area)) return false;
    if (Math.abs(area) <= epsilon * 2) continue;
    const sign = Math.sign(area);
    if (winding && sign !== winding) return false;
    winding = sign;
    nonDegenerateCount++;
  }
  return nonDegenerateCount >= 2;
}

function signedTriangleDoubleArea(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function isLandSample(map, point) {
  const cell = pickGridCell(map, point[0], point[1])?.gridCell;
  return cell !== null && cell !== undefined && isLandCell(cell, map);
}

function isWaterSample(map, point) {
  const cell = pickGridCell(map, point[0], point[1])?.gridCell;
  return cell !== null && cell !== undefined && !isLandCell(cell, map);
}

export function pushShoreVisualLines(vertices, paths, context, color) {
  const {map} = context;
  for (const path of paths) {
    const visual = buildSmoothedShoreVisual(path, map, "height", {});
    if (!visual || visual.land.points.length < 2 || visual.water.points.length !== visual.land.points.length) continue;
    for (let index = 0; index < visual.land.points.length - 1; index++) {
      if (visual.breakBefore?.[index + 1]) continue;
      pushWorldLine(vertices, context, [midpoint(visual.land.points[index], visual.water.points[index]), midpoint(visual.land.points[index + 1], visual.water.points[index + 1])], color);
    }
  }
}

export function pushOriginalShoreContourLines(vertices, paths, context, color, widthWorld) {
  for (const path of paths || []) {
    const points = clampedShoreRenderPoints(path).map(entry => entry.point);
    pushWorldPolylineMesh(vertices, context, points, color, widthWorld, {closed: pointsNear(points?.[0], points?.[points.length - 1]), maxSegmentWorld: SHORE_VISUAL_STYLE.maxRenderSegmentWorld});
  }
}

function buildSmoothedShoreVisual(path, map, colorMode, viewOptions) {
  if (!path.points?.length || path.points.length !== path.sideVectors?.length) return null;
  const preferredHalfWidth = SHORE_VISUAL_STYLE.bandWidthWorld / 2;
  const renderPoints = clampedShoreRenderPoints(path);
  const landPoints = [];
  const waterPoints = [];
  const landColors = [];
  const waterColors = [];
  const landCells = [];
  const waterCells = [];
  const breakBefore = [];
  const centers = [];
  const sides = [];
  const sourceIndices = [];

  for (let renderIndex = 0; renderIndex < renderPoints.length; renderIndex++) {
    const entry = renderPoints[renderIndex];
    const point = entry.point;
    const sourceIndex = entry.sourceIndex;
    const landCell = entry.landCell ?? nearestPathCell(path.landCells, sourceIndex);
    const waterCell = entry.waterCell ?? nearestPathCell(path.waterCells, sourceIndex);
    const landCenter = cellCenterPoint(map.grid, landCell);
    const waterCenter = cellCenterPoint(map.grid, waterCell);
    const side = normalizeWorldVector(landCenter[0] - waterCenter[0], landCenter[1] - waterCenter[1]);
    const halfWidth = fitShoreHalfWidth(map, point, side, preferredHalfWidth);
    landPoints.push([point[0] + side.x * halfWidth, point[1] + side.y * halfWidth]);
    waterPoints.push([point[0] - side.x * halfWidth, point[1] - side.y * halfWidth]);
    landCells.push(landCell);
    waterCells.push(waterCell);
    landColors.push(colorForCell(landCell, map, colorMode, viewOptions));
    waterColors.push(colorForCell(waterCell, map, colorMode, viewOptions));
    centers.push(point);
    sides.push(side);
    sourceIndices.push(sourceIndex);
    breakBefore.push(false);
  }
  if (path.closed && centers.length > 1 && pointsNear(centers[0], centers.at(-1))) {
    const last = centers.length - 1;
    landPoints[last] = landPoints[0];
    waterPoints[last] = waterPoints[0];
    landColors[last] = landColors[0];
    waterColors[last] = waterColors[0];
    landCells[last] = landCells[0];
    waterCells[last] = waterCells[0];
    centers[last] = centers[0];
    sides[last] = sides[0];
    sourceIndices[last] = sourceIndices[0];
  }

  return {
    land: {points: landPoints, colors: landColors, cells: landCells},
    water: {points: waterPoints, colors: waterColors, cells: waterCells},
    breakBefore,
    centers,
    sides,
    sourceIndices,
    sourcePath: path,
    colorMode,
    viewOptions
  };
}

function fitShoreHalfWidth(map, point, side, preferredHalfWidth) {
  if (!isWorldPoint(point) || !side || (Math.abs(side.x) <= 0.000001 && Math.abs(side.y) <= 0.000001)) return 0;
  if (preferredHalfWidth <= 0) return 0;
  const minHalfWidth = SHORE_VISUAL_STYLE.minBandWidthWorld / 2;
  let halfWidth = preferredHalfWidth;
  for (let step = 0; step < SHORE_VISUAL_STYLE.bandWidthFitSteps; step++) {
    if (isShoreOffsetSafe(map, point, side, halfWidth)) return halfWidth;
    halfWidth *= 0.5;
    if (halfWidth < minHalfWidth) break;
  }
  return isShoreOffsetSafe(map, point, side, minHalfWidth) ? minHalfWidth : 0;
}

function isShoreOffsetSafe(map, point, side, halfWidth) {
  const landPoint = [point[0] + side.x * halfWidth, point[1] + side.y * halfWidth];
  const waterPoint = [point[0] - side.x * halfWidth, point[1] - side.y * halfWidth];
  return isLandSample(map, landPoint) && isWaterSample(map, waterPoint);
}

function clampedShoreRenderPoints(path) {
  const sourcePoints = path?.points || [];
  const renderPoints = path?.renderPoints?.length ? path.renderPoints : sourcePoints;
  const result = [];
  for (const point of renderPoints || []) {
    const projection = nearestShorePathProjection(point, path);
    const clamped = clampShoreRenderPoint(point, projection.point);
    if (isWorldPoint(clamped)) {
      result.push({
        point: clamped,
        projected: projection.point,
        sourceIndex: projection.sourceIndex,
        t: projection.t,
        side: interpolateShoreSide(path, projection.sourceIndex, projection.t),
        landCell: nearestPathCell(path.landCells, projection.sourceIndex, projection.t),
        waterCell: nearestPathCell(path.waterCells, projection.sourceIndex, projection.t)
      });
    }
  }
  return filterShoreRenderSpikes(result);
}

function clampShoreRenderPoint(point, sourcePoint) {
  if (!isWorldPoint(point) || !isWorldPoint(sourcePoint)) return point;
  const distance = worldDistance(point, sourcePoint);
  const maxDistance = SHORE_VISUAL_STYLE.maxRenderDisplacementWorld;
  if (distance <= maxDistance || distance <= 0.000001) return point;
  const ratio = maxDistance / distance;
  return [
    sourcePoint[0] + (point[0] - sourcePoint[0]) * ratio,
    sourcePoint[1] + (point[1] - sourcePoint[1]) * ratio
  ];
}

function nearestPathProjection(point, sourcePoints = []) {
  if (!isWorldPoint(point) || !sourcePoints.length) return {point, sourceIndex: 0, t: 0};
  if (sourcePoints.length === 1) return {point: sourcePoints[0], sourceIndex: 0, t: 0};
  const segmentCount = sourcePoints.length - 1;
  let best = {point: sourcePoints[0], sourceIndex: 0, t: 0, distance: Infinity};
  for (let index = 0; index < segmentCount; index++) {
    const a = sourcePoints[index];
    const b = sourcePoints[index + 1];
    if (!isWorldPoint(a) || !isWorldPoint(b)) continue;
    const projected = projectPointToSegment(point, a, b);
    if (projected.distance >= best.distance) continue;
    best = {point: projected.point, sourceIndex: index, t: projected.t, distance: projected.distance};
  }
  return best;
}

function nearestShorePathProjection(point, path) {
  const sourcePoints = path?.points || [];
  if (!path || typeof path !== "object" || sourcePoints.length < 2) return nearestPathProjection(point, sourcePoints);
  let index = shoreSourceIndexCache.get(path);
  if (!index || index.sourcePoints !== sourcePoints) {
    index = createShoreSourceIndex(sourcePoints);
    shoreSourceIndexCache.set(path, index);
  }
  return nearestIndexedPathProjection(point, index);
}

function nearestRingProjection(point, ring) {
  if (!Array.isArray(ring) || ring.length < 2) return nearestPathProjection(point, ring);
  let index = shoreRingIndexCache.get(ring);
  if (!index) {
    index = createShoreSourceIndex(ring);
    shoreRingIndexCache.set(ring, index);
  }
  return nearestIndexedPathProjection(point, index);
}

function nearestIndexedPathProjection(point, index) {
  const sourcePoints = index.sourcePoints;
  const bucketX = Math.floor(point[0] / index.bucketSize);
  const bucketY = Math.floor(point[1] / index.bucketSize);
  const visited = new Set();
  let best = {point: sourcePoints[0], sourceIndex: 0, t: 0, distance: Infinity};
  for (let radius = 0; radius <= index.maxRadius; radius++) {
    for (let y = bucketY - radius; y <= bucketY + radius; y++) {
      for (let x = bucketX - radius; x <= bucketX + radius; x++) {
        if (radius && x > bucketX - radius && x < bucketX + radius && y > bucketY - radius && y < bucketY + radius) continue;
        for (const sourceIndex of index.buckets.get(`${x}:${y}`) || []) {
          if (visited.has(sourceIndex)) continue;
          visited.add(sourceIndex);
          const projected = projectPointToSegment(point, sourcePoints[sourceIndex], sourcePoints[sourceIndex + 1]);
          const distanceDelta = projected.distance - best.distance;
          if (distanceDelta > 0.000000001 || (Math.abs(distanceDelta) <= 0.000000001 && sourceIndex >= best.sourceIndex)) continue;
          best = {point: projected.point, sourceIndex, t: projected.t, distance: projected.distance};
        }
      }
    }
    if (!Number.isFinite(best.distance)) continue;
    const left = (bucketX - radius) * index.bucketSize;
    const right = (bucketX + radius + 1) * index.bucketSize;
    const top = (bucketY - radius) * index.bucketSize;
    const bottom = (bucketY + radius + 1) * index.bucketSize;
    const distanceToOutside = Math.min(point[0] - left, right - point[0], point[1] - top, bottom - point[1]);
    if (best.distance <= distanceToOutside) return best;
  }
  return best;
}

function createShoreSourceIndex(sourcePoints) {
  const bucketSize = Math.max(16, SHORE_VISUAL_STYLE.maxRenderSegmentWorld * 2);
  const buckets = new Map();
  let minBucketX = Infinity;
  let maxBucketX = -Infinity;
  let minBucketY = Infinity;
  let maxBucketY = -Infinity;
  for (let index = 0; index < sourcePoints.length - 1; index++) {
    const a = sourcePoints[index];
    const b = sourcePoints[index + 1];
    if (!isWorldPoint(a) || !isWorldPoint(b)) continue;
    const x0 = Math.floor(Math.min(a[0], b[0]) / bucketSize);
    const x1 = Math.floor(Math.max(a[0], b[0]) / bucketSize);
    const y0 = Math.floor(Math.min(a[1], b[1]) / bucketSize);
    const y1 = Math.floor(Math.max(a[1], b[1]) / bucketSize);
    minBucketX = Math.min(minBucketX, x0);
    maxBucketX = Math.max(maxBucketX, x1);
    minBucketY = Math.min(minBucketY, y0);
    maxBucketY = Math.max(maxBucketY, y1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const key = `${x}:${y}`;
        const entries = buckets.get(key) || [];
        entries.push(index);
        buckets.set(key, entries);
      }
    }
  }
  const maxRadius = Number.isFinite(minBucketX)
    ? Math.max(maxBucketX - minBucketX, maxBucketY - minBucketY) + 1
    : 0;
  return {sourcePoints, bucketSize, buckets, maxRadius};
}

function projectPointToSegment(point, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return {point: a, t: 0, distance: worldDistance(point, a)};
  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared));
  const projected = [a[0] + dx * t, a[1] + dy * t];
  return {
    point: projected,
    t,
    distance: worldDistance(point, projected)
  };
}

function interpolateShoreSide(path, sourceIndex, t) {
  const a = path.sideVectors?.[sourceIndex] || {x: 0, y: 0};
  const b = path.sideVectors?.[Math.min(sourceIndex + 1, (path.sideVectors?.length || 1) - 1)] || a;
  return normalizeWorldVector(a.x * (1 - t) + b.x * t, a.y * (1 - t) + b.y * t);
}

function nearestPathCell(cells, sourceIndex, t) {
  if (!cells?.length) return 0;
  return cells[Math.min(sourceIndex + 1, cells.length - 1)];
}

export function filterShoreRenderSpikes(entries) {
  return filterLabShoreRenderSpikes(entries, {
    spikeAngleCos: SHORE_VISUAL_STYLE.spikeAngleCos,
    hardSpikeAngleCos: SHORE_VISUAL_STYLE.hardSpikeAngleCos,
    spikeDisplacementWorld: SHORE_VISUAL_STYLE.spikeDisplacementWorld
  });
}

export function buildShoreVisualPaths(map, algorithmOptions = {}) {
  const edges = collectShoreVisualEdges(map);
  const sideSafetyCache = new Map();
  const options = {
    ...algorithmOptions,
    gates: {
      ...algorithmOptions.gates,
      maxSegmentWorld: SHORE_VISUAL_STYLE.maxRenderSegmentWorld,
      spikeAngleCos: SHORE_VISUAL_STYLE.hardSpikeAngleCos
    },
    isSideSampleSafe: (point, side) => {
      const key = `${point[0]}:${point[1]}:${side.x}:${side.y}`;
      if (sideSafetyCache.has(key)) return sideSafetyCache.get(key);
      const safe = fitShoreHalfWidth(map, point, side, SHORE_VISUAL_STYLE.sidePreflightHalfWidthWorld) > 0;
      sideSafetyCache.set(key, safe);
      return safe;
    }
  };
  const coastline = buildShoreTopologySnapshot(buildShorePathsFromEdges(edges.coastline), map, options);
  const lakeShore = buildShoreTopologySnapshot(buildShorePathsFromEdges(edges.lakeShore), map, options);
  return Object.freeze({
    coastline: coastline.paths,
    lakeShore: lakeShore.paths,
    topology: mergeShoreTopologyStats(coastline.stats, lakeShore.stats)
  });
}

function attachOriginalCoastlinePoints(paths, map, featureType) {
  for (let index = 0; index < paths.length; index++) {
    paths[index].originalCoastlinePoints = buildOriginalCoastlineRenderPoints(paths[index].points, map, featureType, index);
  }
}

const ORIGINAL_COASTLINE_STYLE = Object.freeze({
  enabled: true,
  maxDepth: 4,
  baseAmplitude: 1.5,
  amplitudeDecay: 0.9,
  minEdge: 1,
  smoothThreshold: 0.25,
  roughnessContrast: 1.5,
  profileHarmonics: 4,
  lakeSmoothThreshMult: 2,
  simplifyTolerance: 0.3,
  smoothSamples: 4,
  jaggedSamples: 4
});

const COASTLINE_PROFILE_SIZE = 256;

function buildOriginalCoastlineRenderPoints(points, map, featureType, pathIndex) {
  const source = normalizeWorldPathPoints(points);
  if (source.length < 3 || !ORIGINAL_COASTLINE_STYLE.enabled) return source;
  const closed = pointsNear(source[0], source[source.length - 1]);
  const ring = closed ? source.slice(0, -1) : source;
  const simplified = simplifyWorldPath(ring, ORIGINAL_COASTLINE_STYLE.simplifyTolerance);
  if (simplified.length < 3) return source;
  const seed = `${map?.metadata?.seed || "map"}:coastline:${featureType}:${pathIndex}`;
  const random = createRandom(seed);
  const shape = fractalizeOriginalCoastline(simplified, map, featureType, random, closed);
  return buildOriginalCoastlineCurvePoints(shape, closed);
}

function normalizeWorldPathPoints(points) {
  const result = [];
  for (const point of points || []) {
    if (!isWorldPoint(point)) continue;
    const previous = result[result.length - 1];
    if (previous && pointsNear(previous, point)) continue;
    result.push([point[0], point[1]]);
  }
  if (result.length > 2 && pointsNear(result[0], result[result.length - 1])) result[result.length - 1] = result[0];
  return result;
}

function simplifyWorldPath(points, tolerance) {
  if (!points?.length || points.length <= 2 || tolerance <= 0) return points || [];
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  simplifyWorldPathSection(points, 0, points.length - 1, tolerance * tolerance, keep);
  return points.filter((_, index) => keep[index]);
}

function simplifyWorldPathSection(points, first, last, toleranceSquared, keep) {
  if (last <= first + 1) return;
  let maxDistance = 0;
  let split = -1;
  for (let index = first + 1; index < last; index++) {
    const distance = pointSegmentDistanceSquared(points[index], points[first], points[last]);
    if (distance > maxDistance) {
      maxDistance = distance;
      split = index;
    }
  }
  if (maxDistance <= toleranceSquared || split === -1) return;
  keep[split] = 1;
  simplifyWorldPathSection(points, first, split, toleranceSquared, keep);
  simplifyWorldPathSection(points, split, last, toleranceSquared, keep);
}

function pointSegmentDistanceSquared(point, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return (point[0] - a[0]) ** 2 + (point[1] - a[1]) ** 2;
  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared));
  const x = a[0] + dx * t;
  const y = a[1] + dy * t;
  return (point[0] - x) ** 2 + (point[1] - y) ** 2;
}

function fractalizeOriginalCoastline(points, map, featureType, random, closed) {
  const settings = featureType === "lake"
    ? {...ORIGINAL_COASTLINE_STYLE, smoothThreshold: Math.min(1, ORIGINAL_COASTLINE_STYLE.smoothThreshold * ORIGINAL_COASTLINE_STYLE.lakeSmoothThreshMult)}
    : ORIGINAL_COASTLINE_STYLE;
  const profile = makeCoastlineRoughnessProfile(() => random.next(), settings.roughnessContrast, settings.profileHarmonics);
  const segments = closed ? points.length : points.length - 1;
  let perimeter = 0;
  const lengths = new Array(segments);
  for (let index = 0; index < segments; index++) {
    lengths[index] = worldDistance(points[index], points[(index + 1) % points.length]);
    perimeter += lengths[index];
  }
  if (perimeter <= 0.000001) return {points, origIndices: points.map((_, index) => index)};

  let cumulative = 0;
  const tParams = new Array(points.length);
  for (let index = 0; index < points.length; index++) {
    tParams[index] = cumulative / perimeter;
    if (index < lengths.length) cumulative += lengths[index];
  }

  const result = [];
  const origIndices = [];
  for (let index = 0; index < points.length; index++) {
    origIndices.push(result.length);
    result.push(points[index]);
    if (!closed && index === points.length - 1) break;
    const nextIndex = (index + 1) % points.length;
    if (isOnMapBorderPoint(points[index], map) && isOnMapBorderPoint(points[nextIndex], map)) continue;
    subdivideOriginalCoastlineEdge(points[index], points[nextIndex], tParams[index], tParams[nextIndex] ?? 1, settings.maxDepth, settings.baseAmplitude, profile, () => random.next(), result, settings);
  }

  return {points: result, origIndices};
}

function makeCoastlineRoughnessProfile(rand, contrast, harmonics = 4) {
  const profile = new Float32Array(COASTLINE_PROFILE_SIZE);
  for (let harmonic = 1; harmonic <= harmonics; harmonic++) {
    const amplitude = rand();
    const phase = rand() * Math.PI * 2;
    for (let index = 0; index < COASTLINE_PROFILE_SIZE; index++) {
      profile[index] += amplitude * Math.cos((2 * Math.PI * harmonic * index) / COASTLINE_PROFILE_SIZE + phase);
    }
  }
  let min = Infinity;
  let max = -Infinity;
  for (const value of profile) {
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  const range = max - min || 1;
  for (let index = 0; index < COASTLINE_PROFILE_SIZE; index++) profile[index] = ((profile[index] - min) / range) ** contrast;
  return profile;
}

function sampleCoastlineProfile(profile, t) {
  const position = (((t % 1) + 1) % 1) * COASTLINE_PROFILE_SIZE;
  const index = Math.floor(position) % COASTLINE_PROFILE_SIZE;
  const f = position - Math.floor(position);
  return profile[index] * (1 - f) + profile[(index + 1) % COASTLINE_PROFILE_SIZE] * f;
}

function coastlineMidT(a, b) {
  const diff = b - a;
  if (Math.abs(diff) <= 0.5) return a + diff / 2;
  return ((a + (diff - Math.sign(diff)) / 2) % 1 + 1) % 1;
}

function subdivideOriginalCoastlineEdge(a, b, t0, t1, depth, amplitude, profile, rand, result, settings) {
  const length = worldDistance(a, b);
  if (depth === 0 || length < settings.minEdge) return;
  const tm = coastlineMidT(t0, t1);
  const roughness = sampleCoastlineProfile(profile, tm);
  if (roughness < settings.smoothThreshold) return;
  const normal = normalizeWorldVector(-(b[1] - a[1]), b[0] - a[0]);
  const displacement = (rand() - 0.5) * Math.sqrt(length) * amplitude * roughness;
  const middle = [(a[0] + b[0]) / 2 + normal.x * displacement, (a[1] + b[1]) / 2 + normal.y * displacement];
  const nextAmplitude = amplitude * settings.amplitudeDecay;
  subdivideOriginalCoastlineEdge(a, middle, t0, tm, depth - 1, nextAmplitude, profile, rand, result, settings);
  result.push(middle);
  subdivideOriginalCoastlineEdge(middle, b, tm, t1, depth - 1, nextAmplitude, profile, rand, result, settings);
}

function isOnMapBorderPoint(point, map) {
  const width = map?.metadata?.graphWidth || 0;
  const height = map?.metadata?.graphHeight || 0;
  return point[0] <= 0 || point[1] <= 0 || point[0] >= width || point[1] >= height;
}

function buildOriginalCoastlineCurvePoints(shape, closed) {
  if (!closed) return sampleCatmullRomWorldPath(shape.points, false, ORIGINAL_COASTLINE_STYLE.jaggedSamples);
  const {points, origIndices} = shape;
  const count = points.length;
  const originalCount = origIndices.length;
  if (count < 3 || originalCount < 3) return points;

  const smooth = new Array(originalCount);
  for (let index = 0; index < originalCount; index++) {
    const a = origIndices[index];
    const b = origIndices[(index + 1) % originalCount];
    smooth[index] = (b > a ? b - a : b + count - a) === 1;
  }

  const output = [];
  const first = points[origIndices[0]];
  const last = points[origIndices[originalCount - 1]];
  let atMid = smooth[originalCount - 1];
  output.push(atMid ? midpoint(last, first) : first);

  for (let index = 0; index < originalCount; index++) {
    const currentIndex = origIndices[index];
    const nextIndex = origIndices[(index + 1) % originalCount];
    const current = points[currentIndex];
    if (smooth[index]) {
      const next = points[nextIndex];
      const end = midpoint(current, next);
      if (atMid) appendQuadraticSamples(output, current, end, ORIGINAL_COASTLINE_STYLE.smoothSamples);
      else appendPointIfDistinct(output, end);
      atMid = true;
      continue;
    }

    if (atMid) appendPointIfDistinct(output, current);
    const end = nextIndex > currentIndex ? nextIndex : nextIndex + count;
    for (let sampleIndex = currentIndex; sampleIndex < end; sampleIndex++) {
      const a = points[sampleIndex % count];
      const b = points[(sampleIndex + 1) % count];
      const previous = points[(sampleIndex - 1 + count) % count];
      const next = points[(sampleIndex + 2) % count];
      const cp1 = [a[0] + (b[0] - previous[0]) / 8, a[1] + (b[1] - previous[1]) / 8];
      const cp2 = [b[0] - (next[0] - a[0]) / 8, b[1] - (next[1] - a[1]) / 8];
      appendCubicSamples(output, cp1, cp2, b, ORIGINAL_COASTLINE_STYLE.jaggedSamples);
    }
    atMid = false;
  }

  appendPointIfDistinct(output, output[0]);
  return output;
}

function sampleCatmullRomWorldPath(points, closed, samplesPerSegment) {
  if (points.length < 3) return points;
  const output = [points[0]];
  const end = closed ? points.length : points.length - 1;
  for (let index = 0; index < end; index++) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    const previous = closed ? points[(index - 1 + points.length) % points.length] : points[index - 1] || a;
    const next = closed ? points[(index + 2) % points.length] : points[index + 2] || b;
    const cp1 = [a[0] + (b[0] - previous[0]) / 8, a[1] + (b[1] - previous[1]) / 8];
    const cp2 = [b[0] - (next[0] - a[0]) / 8, b[1] - (next[1] - a[1]) / 8];
    appendCubicSamples(output, cp1, cp2, b, samplesPerSegment);
  }
  return output;
}

function appendQuadraticSamples(output, control, end, samples) {
  const start = output[output.length - 1];
  for (let step = 1; step <= samples; step++) {
    const t = step / samples;
    const mt = 1 - t;
    appendPointIfDistinct(output, [
      mt * mt * start[0] + 2 * mt * t * control[0] + t * t * end[0],
      mt * mt * start[1] + 2 * mt * t * control[1] + t * t * end[1]
    ]);
  }
}

function appendCubicSamples(output, controlA, controlB, end, samples) {
  const start = output[output.length - 1];
  for (let step = 1; step <= samples; step++) {
    const t = step / samples;
    const mt = 1 - t;
    appendPointIfDistinct(output, [
      mt ** 3 * start[0] + 3 * mt * mt * t * controlA[0] + 3 * mt * t * t * controlB[0] + t ** 3 * end[0],
      mt ** 3 * start[1] + 3 * mt * mt * t * controlA[1] + 3 * mt * t * t * controlB[1] + t ** 3 * end[1]
    ]);
  }
}

function appendPointIfDistinct(points, point) {
  const previous = points[points.length - 1];
  if (!previous || !pointsNear(previous, point)) points.push(point);
}

export function emptyShoreVisualPaths() {
  return Object.freeze({
    coastline: Object.freeze([]),
    lakeShore: Object.freeze([]),
    topology: mergeShoreTopologyStats(null, null)
  });
}

export function summarizeShoreVisualPaths(paths) {
  const coastlinePoints = countPathPoints(paths?.coastline);
  const lakeShorePoints = countPathPoints(paths?.lakeShore);
  return {
    coastlinePaths: paths?.coastline?.length || 0,
    lakeShorePaths: paths?.lakeShore?.length || 0,
    coastlinePoints,
    lakeShorePoints,
    bandWidthWorld: SHORE_VISUAL_STYLE.bandWidthWorld,
    smoothing: {...SHORE_VISUAL_STYLE.smoothing},
    coastlineStroke: [...SHORE_VISUAL_STYLE.coastlineStroke],
    lakeShoreStroke: [...SHORE_VISUAL_STYLE.lakeShoreStroke],
    topology: paths?.topology || mergeShoreTopologyStats(null, null)
  };
}

function mergeShoreTopologyStats(coastline, lakeShore) {
  const first = coastline || {};
  const second = lakeShore || {};
  const fallbackReasons = {};
  const localFallbackReasons = {};
  for (const stats of [first, second]) {
    for (const [reason, count] of Object.entries(stats.fallbackReasons || {})) {
      fallbackReasons[reason] = (fallbackReasons[reason] || 0) + count;
    }
    for (const [reason, count] of Object.entries(stats.localFallbackReasons || {})) {
      localFallbackReasons[reason] = (localFallbackReasons[reason] || 0) + count;
    }
  }
  const sourceLengthWorld = (first.sourceLengthWorld || 0) + (second.sourceLengthWorld || 0);
  const eligibleSourceLengthWorld = (first.eligibleSourceLengthWorld || 0) + (second.eligibleSourceLengthWorld || 0);
  const smoothedSourceLengthWorld = (first.smoothedSourceLengthWorld || 0) + (second.smoothedSourceLengthWorld || 0);
  return Object.freeze({
    snapshotVersion: 1,
    immutable: true,
    algorithmId: SHORE_TOPOLOGY_ALGORITHM.id,
    algorithmName: SHORE_TOPOLOGY_ALGORITHM.name,
    renderSource: "snapshot.renderPoints",
    bandAndStrokeShared: false,
    visualBand: "retired-after-exact-xor",
    surfaceAndStrokeShared: true,
    surfaceCorrection: "raw-snapshot-xor-triangulation",
    hardEdgeFallback: "shared-voronoi-edge",
    threshold: SHORE_TOPOLOGY_ALGORITHM.threshold,
    smoothness: SHORE_TOPOLOGY_ALGORITHM.smoothness,
    iterations: SHORE_TOPOLOGY_ALGORITHM.iterations,
    maxDisplacement: SHORE_TOPOLOGY_ALGORITHM.maxDisplacement,
    arcCount: (first.arcCount || 0) + (second.arcCount || 0),
    smoothedArcCount: (first.smoothedArcCount || 0) + (second.smoothedArcCount || 0),
    unchangedArcCount: (first.unchangedArcCount || 0) + (second.unchangedArcCount || 0),
    fallbackArcCount: (first.fallbackArcCount || 0) + (second.fallbackArcCount || 0),
    openArcCount: (first.openArcCount || 0) + (second.openArcCount || 0),
    closedArcCount: (first.closedArcCount || 0) + (second.closedArcCount || 0),
    sourcePointCount: (first.sourcePointCount || 0) + (second.sourcePointCount || 0),
    renderPointCount: (first.renderPointCount || 0) + (second.renderPointCount || 0),
    sourceSegmentCount: (first.sourceSegmentCount || 0) + (second.sourceSegmentCount || 0),
    eligibleSourceSegmentCount: (first.eligibleSourceSegmentCount || 0) + (second.eligibleSourceSegmentCount || 0),
    smoothedSourceSegmentCount: (first.smoothedSourceSegmentCount || 0) + (second.smoothedSourceSegmentCount || 0),
    locallyFallbackSourceSegmentCount: (first.locallyFallbackSourceSegmentCount || 0) + (second.locallyFallbackSourceSegmentCount || 0),
    locallyFallbackArcCount: (first.locallyFallbackArcCount || 0) + (second.locallyFallbackArcCount || 0),
    sourceLengthWorld: Math.round(sourceLengthWorld * 100) / 100,
    eligibleSourceLengthWorld: Math.round(eligibleSourceLengthWorld * 100) / 100,
    smoothedSourceLengthWorld: Math.round(smoothedSourceLengthWorld * 100) / 100,
    eligibleLengthRatio: sourceLengthWorld > 0
      ? Math.round(eligibleSourceLengthWorld / sourceLengthWorld * 10000) / 10000
      : 0,
    smoothedLengthRatio: sourceLengthWorld > 0
      ? Math.round(smoothedSourceLengthWorld / sourceLengthWorld * 10000) / 10000
      : 0,
    maxVisibleDisplacementWorld: Math.max(first.maxVisibleDisplacementWorld || 0, second.maxVisibleDisplacementWorld || 0),
    buildMs: Math.round(((first.buildMs || 0) + (second.buildMs || 0)) * 100) / 100,
    localFallbackReasons: Object.freeze(localFallbackReasons),
    fallbackReasons: Object.freeze(fallbackReasons),
    protectedObjects: Object.freeze({...(
      first.protectedObjects ||
      second.protectedObjects ||
      {towns: 0, roads: 0, rivers: 0}
    )})
  });
}

function countPathPoints(paths = []) {
  return paths.reduce((sum, path) => sum + (path.points?.length || 0), 0);
}

export function buildSmoothedShoreBoundaryPoints(path, map) {
  if (!path?.points?.length || path.points.length !== path.sideVectors?.length) return [];
  const preferredHalfWidth = SHORE_VISUAL_STYLE.bandWidthWorld / 2;
  const renderPoints = clampedShoreRenderPoints(path);
  const points = [];

  for (const entry of renderPoints) {
    const point = entry.point;
    const sourceIndex = entry.sourceIndex;
    const side = entry.side || path.sideVectors[sourceIndex] || {x: 0, y: 0};
    const halfWidth = fitShoreHalfWidth(map, point, side, preferredHalfWidth);
    if (halfWidth <= 0) continue;
    points.push([point[0] + side.x * halfWidth, point[1] + side.y * halfWidth]);
  }

  return smoothWorldPath(points, SHORE_VISUAL_STYLE.smoothing);
}

function collectShoreVisualEdges(map) {
  const coastline = [];
  const lakeShore = [];
  const cells = map?.grid?.cells;
  if (!cells?.c || !cells?.v || !cells?.h) return {coastline, lakeShore};

  for (const cell of cells.i || []) {
    for (const neighbor of cells.c[cell] || []) {
      if (neighbor <= cell) continue;
      const cellLand = isLandCell(cell, map);
      const neighborLand = isLandCell(neighbor, map);
      if (cellLand === neighborLand) continue;
      const landCell = cellLand ? cell : neighbor;
      const waterCell = cellLand ? neighbor : cell;
      const edge = sharedVoronoiEdge(map, cell, neighbor);
      if (!edge) continue;
      const waterFeature = map.features.features[cells.f?.[waterCell]];
      const target = waterFeature?.type === "ocean" ? coastline : lakeShore;
      const landCenter = cellCenterPoint(map.grid, landCell);
      const waterCenter = cellCenterPoint(map.grid, waterCell);
      const side = normalizeWorldVector(landCenter[0] - waterCenter[0], landCenter[1] - waterCenter[1]);
      target.push({
        a: edge[0],
        b: edge[1],
        landCell,
        waterCell,
        side
      });
    }
  }

  return {coastline, lakeShore};
}

function buildShorePathsFromEdges(edges) {
  const graph = buildShoreGraph(edges);
  const paths = [];
  const visited = new Uint8Array(graph.edges.length);

  for (const node of graph.nodes.values()) {
    if (node.edges.length === 2) continue;
    for (const edgeIndex of node.edges) {
      if (visited[edgeIndex]) continue;
      paths.push(createShorePath(graph, walkShorePath(graph, node.key, edgeIndex, visited)));
    }
  }

  for (let edgeIndex = 0; edgeIndex < graph.edges.length; edgeIndex++) {
    if (visited[edgeIndex]) continue;
    paths.push(createShorePath(graph, walkShorePath(graph, graph.edges[edgeIndex].a, edgeIndex, visited)));
  }

  return paths.filter(path => path.points.length >= 2);
}

function buildShoreGraph(edges) {
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

function ensureShoreNode(nodes, key, point) {
  if (!nodes.has(key)) nodes.set(key, {key, point: [point[0], point[1]], edges: []});
  return nodes.get(key);
}

function shorePointKey(point) {
  return `${Math.round(point[0] * 1000)}:${Math.round(point[1] * 1000)}`;
}

function walkShorePath(graph, startKey, firstEdgeIndex, visited) {
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
    edgeIndex = nextNode.edges.find(index => !visited[index]) ?? -1;
  }

  return {keys, edgeIndexes};
}

function createShorePath(graph, walk) {
  const points = [];
  const sideVectors = [];
  const landCells = [];
  const waterCells = [];

  for (let index = 0; index < walk.keys.length; index++) {
    const node = graph.nodes.get(walk.keys[index]);
    const adjacentEdges = [
      walk.edgeIndexes[index - 1],
      walk.edgeIndexes[index]
    ].filter(edgeIndex => edgeIndex !== undefined);
    const edge = graph.edges[adjacentEdges[0]] || graph.edges[walk.edgeIndexes[0]];
    points.push(node.point);
    sideVectors.push(averageEdgeSide(graph, adjacentEdges));
    landCells.push(edge?.landCell ?? 0);
    waterCells.push(edge?.waterCell ?? 0);
  }

  return {points, sideVectors, landCells, waterCells};
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
