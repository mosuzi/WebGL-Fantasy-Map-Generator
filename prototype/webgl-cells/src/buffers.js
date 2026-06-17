import {buildFeatureBuffers} from "./features.js";
import {buildLineBuffers, disposeLineBuffers, uploadLineBuffers} from "./lines.js";
import {buildPickingIndex} from "./picking.js";
import {buildPointBuffers, disposePointBuffers, uploadPointBuffers} from "./points.js";
import {buildThemeColors, getThemeStats} from "./themes.js";

export function buildCellBuffers(snapshot, themeId = "height") {
  const positions = [];
  const cellRanges = [];
  const renderGraph = getRenderGraph(snapshot);
  const gridToPack = buildGridToPackMap(snapshot);
  const {cells, vertices} = renderGraph;

  for (let index = 0; index < cells.i.length; index++) {
    const center = cells.p[index];
    const vertexIds = cells.v[index];
    if (!center || !vertexIds || vertexIds.length < 3) continue;

    const packCellId = gridToPack[index];
    const startVertex = positions.length / 2;

    for (let vertexIndex = 0; vertexIndex < vertexIds.length; vertexIndex++) {
      const a = vertices.p[vertexIds[vertexIndex]];
      const b = vertices.p[vertexIds[(vertexIndex + 1) % vertexIds.length]];
      if (!a || !b) continue;

      pushTriangle(positions, center, a, b);
    }

    const vertexCount = positions.length / 2 - startVertex;
    if (vertexCount) cellRanges.push({gridIndex: index, packCellId, startVertex, vertexCount});
  }

  const featureBuffers = buildFeatureBuffers(snapshot);
  const lineBuffers = buildLineBuffers(snapshot);
  const pointBuffers = buildPointBuffers(snapshot);
  const pickingIndex = buildPickingIndex(snapshot);
  const themeColors = buildThemeColors(snapshot, cellRanges, themeId);
  const themeStats = getThemeStats(snapshot, cellRanges);

  return {
    positions: new Float32Array(positions),
    themeColors,
    themeId,
    cellRanges,
    themeStats,
    landPositions: new Float32Array(featureBuffers.landPositions),
    landColors: new Float32Array(featureBuffers.landColors),
    lakePositions: new Float32Array(featureBuffers.lakePositions),
    lakeColors: new Float32Array(featureBuffers.lakeColors),
    lakeIslandPositions: new Float32Array(featureBuffers.lakeIslandPositions),
    lakeIslandColors: new Float32Array(featureBuffers.lakeIslandColors),
    coastlinePositions: new Float32Array(featureBuffers.coastlinePositions),
    coastlineColors: new Float32Array(featureBuffers.coastlineColors),
    lakeShorePositions: new Float32Array(featureBuffers.lakeShorePositions),
    lakeShoreColors: new Float32Array(featureBuffers.lakeShoreColors),
    lineBuffers,
    pointBuffers,
    vertexCount: positions.length / 2,
    landVertexCount: featureBuffers.landPositions.length / 2,
    lakeVertexCount: featureBuffers.lakePositions.length / 2,
    lakeIslandVertexCount: featureBuffers.lakeIslandPositions.length / 2,
    coastlineVertexCount: featureBuffers.coastlinePositions.length / 2,
    lakeShoreVertexCount: featureBuffers.lakeShorePositions.length / 2,
    stateBorderVertexCount: lineBuffers.layers.stateBorders.vertexCount,
    provinceBorderVertexCount: lineBuffers.layers.provinceBorders.vertexCount,
    routeVertexCount: lineBuffers.layers.routes.vertexCount,
    riverVertexCount: lineBuffers.layers.rivers.vertexCount,
    precipitationPointCount: pointBuffers.layers.precipitation.instanceCount,
    populationPointCount: pointBuffers.layers.population.instanceCount,
    burgIconPointCount: pointBuffers.layers.burgIcons.instanceCount,
    markerPointCount: pointBuffers.layers.markers.instanceCount,
    featureStats: featureBuffers.stats,
    lineStats: lineBuffers.stats,
    pointStats: pointBuffers.stats,
    riverCount: lineBuffers.stats.riverCount,
    renderCellCount: cells.i.length,
    renderVertexCount: vertices.p.length,
    renderSource: renderGraph.source,
    pickingIndex,
    samplePosition: positions.slice(0, 12),
    sampleThemeColor: Array.from(themeColors.slice(0, 9))
  };
}

export function uploadBuffers(gl, buffers) {
  buffers.positionBuffer = createBuffer(gl, buffers.positions);
  buffers.themeColorBuffer = createBuffer(gl, buffers.themeColors);
  buffers.landPositionBuffer = createBuffer(gl, buffers.landPositions);
  buffers.landColorBuffer = createBuffer(gl, buffers.landColors);
  buffers.lakePositionBuffer = createBuffer(gl, buffers.lakePositions);
  buffers.lakeColorBuffer = createBuffer(gl, buffers.lakeColors);
  buffers.lakeIslandPositionBuffer = createBuffer(gl, buffers.lakeIslandPositions);
  buffers.lakeIslandColorBuffer = createBuffer(gl, buffers.lakeIslandColors);
  buffers.coastlinePositionBuffer = createBuffer(gl, buffers.coastlinePositions);
  buffers.coastlineColorBuffer = createBuffer(gl, buffers.coastlineColors);
  buffers.lakeShorePositionBuffer = createBuffer(gl, buffers.lakeShorePositions);
  buffers.lakeShoreColorBuffer = createBuffer(gl, buffers.lakeShoreColors);
  uploadLineBuffers(gl, buffers.lineBuffers);
  uploadPointBuffers(gl, buffers.pointBuffers);
}

export function updateThemeColorBuffer(gl, buffers, snapshot, themeId) {
  buffers.themeColors = buildThemeColors(snapshot, buffers.cellRanges, themeId);
  buffers.themeId = themeId;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.themeColorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, buffers.themeColors, gl.STATIC_DRAW);
}

export function disposeBuffers(gl, buffers) {
  if (!buffers) return;
  for (const key of [
    "positionBuffer",
    "themeColorBuffer",
    "landPositionBuffer",
    "landColorBuffer",
    "lakePositionBuffer",
    "lakeColorBuffer",
    "lakeIslandPositionBuffer",
    "lakeIslandColorBuffer",
    "coastlinePositionBuffer",
    "coastlineColorBuffer",
    "lakeShorePositionBuffer",
    "lakeShoreColorBuffer"
  ]) {
    if (buffers[key]) gl.deleteBuffer(buffers[key]);
  }
  disposeLineBuffers(gl, buffers.lineBuffers);
  disposePointBuffers(gl, buffers.pointBuffers);
}

export function bindAttribute(gl, location, buffer, size) {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
}

function getRenderGraph(snapshot) {
  if (snapshot.grid?.cells?.i?.length && snapshot.grid?.vertices?.p?.length) {
    return {
      source: "grid",
      cells: snapshot.grid.cells,
      vertices: snapshot.grid.vertices
    };
  }

  return {
    source: "pack",
    cells: snapshot.cells,
    vertices: snapshot.vertices
  };
}

function buildGridToPackMap(snapshot) {
  const renderGraph = getRenderGraph(snapshot);
  if (renderGraph.source !== "grid") return snapshot.cells.i.map((_, index) => index);

  const map = [];
  const packGridRefs = snapshot.cells.g || [];
  for (let packCellId = 0; packCellId < packGridRefs.length; packCellId++) {
    const gridCellId = packGridRefs[packCellId];
    if (gridCellId === undefined || map[gridCellId] !== undefined) continue;
    map[gridCellId] = packCellId;
  }
  return map;
}

function pushTriangle(target, a, b, c) {
  target.push(a[0], a[1], b[0], b[1], c[0], c[1]);
}

function createBuffer(gl, data) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return buffer;
}
