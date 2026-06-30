import {isLandCell} from "./color-modes.js";
import {isWorldPoint} from "./geometry.js";
import {pushWorldPolylineMesh} from "./mesh-writer.js";

export const SHORE_VISUAL_STYLE = Object.freeze({
  bandWidthWorld: 13,
  minBandWidthWorld: 1.2,
  bandWidthFitSteps: 6,
  maxRenderDisplacementWorld: 5,
  maxRenderSegmentWorld: 14,
  spikeAngleCos: 0.86,
  hardSpikeAngleCos: 0.94,
  spikeDisplacementWorld: 2.5,
  smoothing: Object.freeze({iterations: 2, factor: 0.22}),
  coastlineWidthWorld: 0.42,
  lakeShoreWidthWorld: 0.34,
  coastlineStroke: Object.freeze([0.88, 0.84, 0.63, 0.68]),
  lakeShoreStroke: Object.freeze([0.58, 0.78, 0.84, 0.64])
});

export function boundaryLineModeForOptions(viewOptions, cellVisualMesh) {
  return viewOptions?.smoothCellBorders !== false && cellVisualMesh?.edgeCurves
    ? "visual-cell-shore + butt-join-political"
    : "hard-cell-shore + butt-join-political";
}

export function pushShoreLineLayers(vertices, context, visibility = {}, cellVisualMesh = null, viewOptions = {}) {
  const smoothCellBorders = viewOptions.smoothCellBorders !== false && cellVisualMesh?.edgeCurves;
  if (visibility.coastline !== false) {
    if (smoothCellBorders) pushCellVisualShoreLines(vertices, context, cellVisualMesh, "ocean", SHORE_VISUAL_STYLE.coastlineStroke, SHORE_VISUAL_STYLE.coastlineWidthWorld);
    else pushHardShoreLines(vertices, context, "ocean", SHORE_VISUAL_STYLE.coastlineStroke, SHORE_VISUAL_STYLE.coastlineWidthWorld);
  }
  if (visibility.lakeShore !== false) {
    if (smoothCellBorders) pushCellVisualShoreLines(vertices, context, cellVisualMesh, "lake", SHORE_VISUAL_STYLE.lakeShoreStroke, SHORE_VISUAL_STYLE.lakeShoreWidthWorld);
    else pushHardShoreLines(vertices, context, "lake", SHORE_VISUAL_STYLE.lakeShoreStroke, SHORE_VISUAL_STYLE.lakeShoreWidthWorld);
  }
}

function pushCellVisualShoreLines(vertices, context, cellVisualMesh, targetType, color, widthWorld) {
  const {map} = context;
  const cells = map?.grid?.cells;
  if (!cells?.i || !cells?.c) return;
  for (const cell of cells.i || []) {
    for (const neighbor of cells.c[cell] || []) {
      if (neighbor <= cell) continue;
      const cellLand = isLandCell(cell, map);
      const neighborLand = isLandCell(neighbor, map);
      if (cellLand === neighborLand) continue;
      const waterCell = cellLand ? neighbor : cell;
      const waterFeature = map.features.features[cells.f?.[waterCell]];
      const isOcean = waterFeature?.type === "ocean";
      if ((targetType === "ocean" && !isOcean) || (targetType === "lake" && isOcean)) continue;
      pushWorldPolylineMesh(vertices, context, visualSharedCellEdge(map, cell, neighbor, cellVisualMesh), color, widthWorld, {joinMode: "round"});
    }
  }
}

function pushHardShoreLines(vertices, context, targetType, color, widthWorld) {
  const {map} = context;
  const cells = map?.grid?.cells;
  if (!cells?.i || !cells?.c) return;
  for (const cell of cells.i || []) {
    for (const neighbor of cells.c[cell] || []) {
      if (neighbor <= cell) continue;
      const cellLand = isLandCell(cell, map);
      const neighborLand = isLandCell(neighbor, map);
      if (cellLand === neighborLand) continue;
      const waterCell = cellLand ? neighbor : cell;
      const waterFeature = map.features.features[cells.f?.[waterCell]];
      const isOcean = waterFeature?.type === "ocean";
      if ((targetType === "ocean" && !isOcean) || (targetType === "lake" && isOcean)) continue;
      const edge = sharedVoronoiEdge(map, cell, neighbor);
      if (edge) pushWorldPolylineMesh(vertices, context, edge, color, widthWorld, {joinMode: "caps"});
    }
  }
}

function visualSharedCellEdge(map, cell, neighbor, cellVisualMesh) {
  const shared = sharedVoronoiEdgeVertexIds(map, cell, neighbor);
  if (!shared) return [];
  const first = Math.min(shared[0], shared[1]);
  const second = Math.max(shared[0], shared[1]);
  const curve = cellVisualMesh?.edgeCurves?.get(`${first}:${second}`);
  if (curve?.length) return shared[0] <= shared[1] ? curve : [...curve].reverse();
  return shared.map(vertex => map.grid.vertices.p[vertex]).filter(isWorldPoint);
}

export function sharedVoronoiEdge(map, cell, neighbor) {
  const shared = sharedVoronoiEdgeVertexIds(map, cell, neighbor);
  if (!shared) return null;
  return [map.grid.vertices.p[shared[0]], map.grid.vertices.p[shared[1]]];
}

export function sharedVoronoiEdgeVertexIds(map, cell, neighbor) {
  const ownVertices = map.grid.cells.v[cell] || [];
  const neighborVertices = new Set(map.grid.cells.v[neighbor] || []);
  const shared = ownVertices.filter(vertex => neighborVertices.has(vertex));
  if (shared.length < 2) return null;
  return [shared[0], shared[1]];
}
