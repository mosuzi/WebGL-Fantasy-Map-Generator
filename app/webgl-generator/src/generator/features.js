import {createStageProfile} from "./profile.js";

const WATER_LEVEL = 20;
const UNMARKED = 0;
const LAND_COAST = 1;
const WATER_COAST = -1;
const DEEP_WATER = -2;

export function extractFeatures(grid) {
  const profile = createStageProfile();
  const cellCount = grid.points.length;
  const distanceField = new Int8Array(cellCount);
  const featureIds = new Uint16Array(cellCount);
  const features = [null];

  profile.stage("flood-features", "泛洪识别水陆 feature", () => floodGridFeatures({grid, distanceField, featureIds, features}));
  profile.stage("deep-water", "标记深水距离", () => markupDeepWater(distanceField, grid.cells.c));
  profile.stage("depression-lakes", "识别深洼湖泊", () => addLakesInDeepDepressions({grid, distanceField, featureIds, features}));
  profile.stage("open-near-sea-lakes", "打开近海湖泊", () => openNearSeaLakes({grid, distanceField, featureIds, features}));
  profile.stage("supplemental-basin-lakes", "补充内陆洼地湖泊", () => addSupplementalBasinLakes({grid, distanceField, featureIds, features}));
  profile.stage("rebuild-feature-cells", "重建 feature cell 列表", () => rebuildFeatureCells(features, featureIds, cellCount));
  profile.stage("sync-grid-fields", "同步 feature 字段到 grid", () => {
    grid.cells.t = Array.from(distanceField);
    grid.cells.f = Array.from(featureIds);
    grid.features = features;
  });

  const shore = profile.stage("shore-segments", "生成水陆线段", () => buildShoreSegments(grid, features, featureIds));
  const counts = profile.stage("metadata-counts", "统计 feature 指标", () => ({
    featureCount: features.filter(Boolean).length,
    oceanFeatures: features.filter(feature => feature?.type === "ocean").length,
    landFeatures: features.filter(feature => feature?.land).length,
    lakeFeatures: features.filter(feature => feature?.type === "lake").length
  }));
  const timing = profile.finish();

  return {
    features,
    shore,
    metadata: {
      ...counts,
      coastlineSegments: shore.coastline.length,
      lakeShoreSegments: shore.lakeShore.length,
      timing
    }
  };
}

function floodGridFeatures({grid, distanceField, featureIds, features}) {
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
  const checked = new Uint32Array(indexes.length);
  const queue = [];
  let stamp = 0;

  for (const cell of indexes) {
    if (borders[cell] || heights[cell] < WATER_LEVEL) continue;
    const minNeighborHeight = minNeighborValue(neighbors[cell] || [], heights);
    if (heights[cell] > minNeighborHeight) continue;

    let deep = true;
    const threshold = heights[cell] + elevationLimit;
    stamp++;
    queue.length = 0;
    queue.push(cell);
    checked[cell] = stamp;

    while (deep && queue.length) {
      const current = queue.pop();

      for (const neighbor of neighbors[current] || []) {
        if (checked[neighbor] === stamp) continue;
        if (heights[neighbor] >= threshold) continue;
        if (heights[neighbor] < WATER_LEVEL) {
          deep = false;
          break;
        }

        checked[neighbor] = stamp;
        queue.push(neighbor);
      }
    }

    if (!deep) continue;
    const lakeCells = [cell].concat((neighbors[cell] || []).filter(neighbor => heights[neighbor] === heights[cell]));
    addLake({lakeCells, grid, distanceField, featureIds, features});
  }
}

function addSupplementalBasinLakes({grid, distanceField, featureIds, features}) {
  if (hasLake(features)) return;

  const {c: neighbors, h: heights, b: borders, i: indexes} = grid.cells;
  const landDistance = buildLandDistanceFromWater(grid);
  const candidates = [];

  for (const cell of indexes) {
    if (borders[cell] || heights[cell] < WATER_LEVEL || heights[cell] > 45) continue;
    if (landDistance[cell] < 3) continue;
    if (!isLocalMinimum(neighbors[cell] || [], heights, cell)) continue;

    const meanNeighborHeight = meanNeighborValue(neighbors[cell] || [], heights);
    candidates.push({
      cell,
      score: landDistance[cell] * 4 + Math.max(0, 45 - heights[cell]) * 0.8 + Math.max(0, meanNeighborHeight - heights[cell])
    });
  }

  if (!candidates.length) return;

  candidates.sort((a, b) => b.score - a.score);
  const target = clamp(Math.round(candidates.length / 90), 1, 3);
  const selected = [];

  for (const candidate of candidates) {
    if (selected.some(cell => isWithinSteps(neighbors, candidate.cell, cell, 5))) continue;
    addLake({lakeCells: getSupplementalLakeCells(grid, candidate.cell), grid, distanceField, featureIds, features, supplemental: true});
    selected.push(candidate.cell);
    if (selected.length >= target) break;
  }
}

function hasLake(features) {
  return features.some(feature => feature?.type === "lake");
}

function buildLandDistanceFromWater(grid) {
  const {c: neighbors, h: heights, i: indexes} = grid.cells;
  const distance = new Uint8Array(heights.length);
  const queue = [];

  for (const cell of indexes) {
    if (heights[cell] < WATER_LEVEL) continue;
    if (!(neighbors[cell] || []).some(neighbor => heights[neighbor] < WATER_LEVEL)) continue;
    distance[cell] = 1;
    queue.push(cell);
  }

  for (let cursor = 0; cursor < queue.length; cursor++) {
    const cell = queue[cursor];
    if (distance[cell] >= 32) continue;

    for (const neighbor of neighbors[cell] || []) {
      if (heights[neighbor] < WATER_LEVEL || distance[neighbor]) continue;
      distance[neighbor] = distance[cell] + 1;
      queue.push(neighbor);
    }
  }

  return distance;
}

function isLocalMinimum(neighbors, heights, cell) {
  return heights[cell] <= minNeighborValue(neighbors, heights);
}

function meanNeighborValue(neighbors, values) {
  if (!neighbors.length) return values[0] || 0;
  return neighbors.reduce((sum, neighbor) => sum + values[neighbor], 0) / neighbors.length;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getSupplementalLakeCells(grid, cell) {
  const heights = grid.cells.h;
  const lakeCells = [cell];

  for (const neighbor of grid.cells.c[cell] || []) {
    if (heights[neighbor] !== heights[cell] || grid.cells.b[neighbor]) continue;
    lakeCells.push(neighbor);
  }

  return lakeCells;
}

function isWithinSteps(neighbors, start, target, maxSteps) {
  if (start === target) return true;
  let frontier = [start];
  const visited = new Set(frontier);

  for (let step = 0; step < maxSteps; step++) {
    const nextFrontier = [];
    for (const cell of frontier) {
      for (const neighbor of neighbors[cell] || []) {
        if (neighbor === target) return true;
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        nextFrontier.push(neighbor);
      }
    }
    frontier = nextFrontier;
    if (!frontier.length) break;
  }

  return false;
}

function minNeighborValue(neighbors, values) {
  let min = Infinity;
  for (const neighbor of neighbors) if (values[neighbor] < min) min = values[neighbor];
  return min;
}

function addLake({lakeCells, grid, distanceField, featureIds, features, supplemental = false}) {
  const featureId = features.length;
  for (const cell of lakeCells) {
    grid.cells.h[cell] = 19;
    distanceField[cell] = WATER_COAST;
    featureIds[cell] = featureId;
    for (const neighbor of grid.cells.c[cell] || []) if (grid.cells.h[neighbor] >= WATER_LEVEL) distanceField[neighbor] = LAND_COAST;
  }
  features.push({id: featureId, i: featureId, land: false, border: false, type: "lake", cells: [], supplemental});
}

function openNearSeaLakes({grid, distanceField, featureIds, features}) {
  if (!features.some(feature => feature?.type === "lake")) return;
  const limit = 22;

  for (const cell of grid.cells.i) {
    const lakeFeatureId = featureIds[cell];
    if (features[lakeFeatureId]?.type !== "lake" || features[lakeFeatureId]?.supplemental) continue;

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
    for (const neighbor of getCellNeighbors(grid, cell)) {
      if (neighbor <= cell) continue;
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

function getSharedSegment(grid, a, b) {
  const aVertices = grid.cells.v[a] || [];
  const bVertices = grid.cells.v[b] || [];
  const shared = [];

  for (const vertexId of aVertices) {
    if (!bVertices.includes(vertexId)) continue;
    shared.push(vertexId);
    if (shared.length >= 2) break;
  }

  if (shared.length < 2) return null;
  return [grid.vertices.p[shared[0]], grid.vertices.p[shared[1]]];
}
