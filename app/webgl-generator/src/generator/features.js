const WATER_LEVEL = 20;
const UNMARKED = 0;
const LAND_COAST = 1;
const WATER_COAST = -1;
const DEEP_WATER = -2;

export function extractFeatures(grid) {
  const cellCount = grid.points.length;
  const distanceField = new Int8Array(cellCount);
  const featureIds = new Uint16Array(cellCount);
  const features = [null];
  const queue = [0];

  for (let featureId = 1; queue[0] !== -1; featureId++) {
    const firstCell = queue[0];
    featureIds[firstCell] = featureId;
    const land = grid.cells.h[firstCell] >= WATER_LEVEL;
    let border = false;

    while (queue.length) {
      const cell = queue.pop();
      if (!border && grid.cells.b[cell]) border = true;

      for (const neighbor of getCellNeighbors(grid, cell)) {
        const neighborLand = grid.cells.h[neighbor] >= WATER_LEVEL;

        if (land === neighborLand && featureIds[neighbor] === UNMARKED) {
          featureIds[neighbor] = featureId;
          queue.push(neighbor);
        } else if (land && !neighborLand) {
          distanceField[cell] = LAND_COAST;
          distanceField[neighbor] = WATER_COAST;
        }
      }
    }

    const type = land ? "island" : border ? "ocean" : "lake";
    features.push({id: featureId, i: featureId, land, border, type, cells: []});
    queue[0] = featureIds.indexOf(UNMARKED);
  }

  markupDeepWater(distanceField, grid.cells.c);
  addLakesInDeepDepressions({grid, distanceField, featureIds, features});
  openNearSeaLakes({grid, distanceField, featureIds, features});
  rebuildFeatureCells(features, featureIds, cellCount);
  grid.cells.t = Array.from(distanceField);
  grid.cells.f = Array.from(featureIds);
  grid.features = features;

  const shore = buildShoreSegments(grid, features, featureIds);
  return {
    features,
    shore,
    metadata: {
      featureCount: features.filter(Boolean).length,
      oceanFeatures: features.filter(feature => feature?.type === "ocean").length,
      landFeatures: features.filter(feature => feature?.land).length,
      lakeFeatures: features.filter(feature => feature?.type === "lake").length,
      coastlineSegments: shore.coastline.length,
      lakeShoreSegments: shore.lakeShore.length
    }
  };
}

function markupDeepWater(distanceField, neighbors) {
  let marked = distanceField.filter(distance => distance === DEEP_WATER).length;

  for (let distance = DEEP_WATER; distance > -10; distance--) {
    const previousDistance = distance + 1;
    if (marked === distanceField.length) break;

    for (let cell = 0; cell < neighbors.length; cell++) {
      if (distanceField[cell] !== previousDistance) continue;

      for (const neighbor of neighbors[cell]) {
        if (distanceField[neighbor] !== UNMARKED) continue;
        distanceField[neighbor] = distance;
        marked++;
      }
    }
  }
}

function addLakesInDeepDepressions({grid, distanceField, featureIds, features}) {
  const elevationLimit = 20;
  if (elevationLimit === 80) return;
  const {c: neighbors, h: heights, b: borders, i: indexes} = grid.cells;

  for (const cell of indexes) {
    if (borders[cell] || heights[cell] < WATER_LEVEL) continue;
    const minNeighborHeight = Math.min(...(neighbors[cell] || []).map(neighbor => heights[neighbor]));
    if (heights[cell] > minNeighborHeight) continue;

    let deep = true;
    const threshold = heights[cell] + elevationLimit;
    const queue = [cell];
    const checked = [];
    checked[cell] = true;

    while (deep && queue.length) {
      const current = queue.pop();

      for (const neighbor of neighbors[current] || []) {
        if (checked[neighbor]) continue;
        if (heights[neighbor] >= threshold) continue;
        if (heights[neighbor] < WATER_LEVEL) {
          deep = false;
          break;
        }

        checked[neighbor] = true;
        queue.push(neighbor);
      }
    }

    if (!deep) continue;
    const lakeCells = [cell].concat((neighbors[cell] || []).filter(neighbor => heights[neighbor] === heights[cell]));
    addLake({lakeCells, grid, distanceField, featureIds, features});
  }
}

function addLake({lakeCells, grid, distanceField, featureIds, features}) {
  const featureId = features.length;
  for (const cell of lakeCells) {
    grid.cells.h[cell] = 19;
    distanceField[cell] = WATER_COAST;
    featureIds[cell] = featureId;
  }
  features.push({id: featureId, i: featureId, land: false, border: false, type: "lake", cells: []});
}

function openNearSeaLakes({grid, distanceField, featureIds, features}) {
  if (!features.some(feature => feature?.type === "lake")) return;
  const limit = 22;

  for (const cell of grid.cells.i) {
    const lakeFeatureId = featureIds[cell];
    if (features[lakeFeatureId]?.type !== "lake") continue;

    checkNeighbors: for (const thresholdCell of grid.cells.c[cell] || []) {
      if (distanceField[thresholdCell] !== LAND_COAST || grid.cells.h[thresholdCell] > limit) continue;

      for (const neighbor of grid.cells.c[thresholdCell] || []) {
        const oceanFeatureId = featureIds[neighbor];
        if (features[oceanFeatureId]?.type !== "ocean") continue;
        removeLake({grid, distanceField, featureIds, features, thresholdCell, lakeFeatureId, oceanFeatureId});
        break checkNeighbors;
      }
    }
  }
}

function removeLake({grid, distanceField, featureIds, features, thresholdCell, lakeFeatureId, oceanFeatureId}) {
  grid.cells.h[thresholdCell] = 19;
  distanceField[thresholdCell] = WATER_COAST;
  featureIds[thresholdCell] = oceanFeatureId;

  for (const neighbor of grid.cells.c[thresholdCell] || []) {
    if (grid.cells.h[neighbor] >= WATER_LEVEL) distanceField[neighbor] = LAND_COAST;
  }

  for (const cell of grid.cells.i) {
    if (featureIds[cell] === lakeFeatureId) featureIds[cell] = oceanFeatureId;
  }
  features[lakeFeatureId].type = "ocean";
}

function rebuildFeatureCells(features, featureIds, cellCount) {
  for (const feature of features) if (feature) feature.cells = [];
  for (let cell = 0; cell < cellCount; cell++) features[featureIds[cell]]?.cells.push(cell);
}

function buildShoreSegments(grid, features, featureIds) {
  const coastline = [];
  const lakeShore = [];

  for (let cell = 0; cell < grid.points.length; cell++) {
    for (const neighbor of getForwardNeighbors(grid, cell)) {
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

function getCellNeighbors(grid, cell) {
  return grid.cells.c?.[cell] || [];
}

function getForwardNeighbors(grid, cell) {
  return getCellNeighbors(grid, cell).filter(neighbor => neighbor > cell);
}

function getSharedSegment(grid, a, b) {
  const bVertices = new Set(grid.cells.v[b]);
  const shared = grid.cells.v[a].filter(vertexId => bVertices.has(vertexId));
  if (shared.length < 2) return null;
  return [grid.vertices.p[shared[0]], grid.vertices.p[shared[1]]];
}
