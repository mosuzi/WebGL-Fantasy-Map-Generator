const WATER_LEVEL = 20;

export function extractFeatures(grid) {
  const cellCount = grid.points.length;
  const featureIds = new Array(cellCount).fill(-1);
  const features = [];

  for (let cell = 0; cell < cellCount; cell++) {
    if (featureIds[cell] !== -1) continue;
    const isWater = grid.cells.h[cell] < WATER_LEVEL;
    const feature = floodFeature(cell, isWater, featureIds, features.length, grid);
    features.push(feature);
  }

  const shore = buildShoreSegments(grid, features, featureIds);
  grid.cells.f = featureIds;

  return {
    features,
    shore,
    metadata: {
      featureCount: features.length,
      oceanFeatures: features.filter(feature => feature.type === "ocean").length,
      landFeatures: features.filter(feature => feature.type === "land").length,
      lakeFeatures: features.filter(feature => feature.type === "lake").length,
      coastlineSegments: shore.coastline.length,
      lakeShoreSegments: shore.lakeShore.length
    }
  };
}

function floodFeature(start, isWater, featureIds, featureId, grid) {
  const queue = [start];
  const cells = [];
  let touchesBorder = false;
  featureIds[start] = featureId;

  for (let cursor = 0; cursor < queue.length; cursor++) {
    const cell = queue[cursor];
    cells.push(cell);
    if (isBorderCell(cell, grid.metadata)) touchesBorder = true;

    for (const neighbor of getDirectNeighbors(cell, grid.metadata)) {
      if (featureIds[neighbor] !== -1) continue;
      if ((grid.cells.h[neighbor] < WATER_LEVEL) !== isWater) continue;
      featureIds[neighbor] = featureId;
      queue.push(neighbor);
    }
  }

  return {
    id: featureId,
    type: isWater ? (touchesBorder ? "ocean" : "lake") : "land",
    cells,
    touchesBorder,
    area: cells.length
  };
}

function buildShoreSegments(grid, features, featureIds) {
  const coastline = [];
  const lakeShore = [];

  for (let cell = 0; cell < grid.points.length; cell++) {
    for (const neighbor of getForwardNeighbors(cell, grid.metadata)) {
      const cellWater = grid.cells.h[cell] < WATER_LEVEL;
      const neighborWater = grid.cells.h[neighbor] < WATER_LEVEL;
      if (cellWater === neighborWater) continue;

      const waterCell = cellWater ? cell : neighbor;
      const waterFeature = features[featureIds[waterCell]];
      const segment = getSharedSegment(grid, cell, neighbor);
      if (!segment) continue;
      if (waterFeature.type === "ocean") coastline.push(segment);
      else lakeShore.push(segment);
    }
  }

  return {coastline, lakeShore};
}

function getDirectNeighbors(cell, metadata) {
  const neighbors = [];
  const {columns, rows} = metadata;
  const column = cell % columns;
  const row = Math.floor(cell / columns);
  if (column > 0) neighbors.push(cell - 1);
  if (column < columns - 1) neighbors.push(cell + 1);
  if (row > 0) neighbors.push(cell - columns);
  if (row < rows - 1) neighbors.push(cell + columns);
  return neighbors;
}

function getForwardNeighbors(cell, metadata) {
  const neighbors = [];
  const {columns, rows} = metadata;
  const column = cell % columns;
  const row = Math.floor(cell / columns);
  if (column < columns - 1) neighbors.push(cell + 1);
  if (row < rows - 1) neighbors.push(cell + columns);
  return neighbors;
}

function isBorderCell(cell, metadata) {
  const column = cell % metadata.columns;
  const row = Math.floor(cell / metadata.columns);
  return column === 0 || row === 0 || column === metadata.columns - 1 || row === metadata.rows - 1;
}

function getSharedSegment(grid, a, b) {
  const bVertices = new Set(grid.cells.v[b]);
  const shared = grid.cells.v[a].filter(vertexId => bVertices.has(vertexId));
  if (shared.length < 2) return null;
  return [grid.vertices.p[shared[0]], grid.vertices.p[shared[1]]];
}
