import {calculateVoronoi} from "./grid.js";
import {createStageProfile} from "./profile.js";

const WATER_LEVEL = 20;
const UINT16_MAX = 65535;
const UNMARKED = 0;
const LAND_COAST = 1;
const LANDLOCKED = 2;
const DEEPER_LAND = 3;
const WATER_COAST = -1;
const DEEP_WATER = -2;

export function buildPack(grid, features) {
  const startedAt = performance.now();
  const profile = createStageProfile();
  const {newCells, gridToPack, counters} = profile.stage("select-pack-points", "选择 pack 点", () => collectPackPoints(grid, features));

  const {cells, vertices} = profile.stage("regraph-voronoi", "重建 pack Voronoi", () => calculateVoronoi(newCells.p, grid.boundary || []));
  profile.stage("copy-point-fields", "写入 pack 点字段", () => {
    cells.p = newCells.p;
    cells.g = Uint32Array.from(newCells.g);
    cells.h = Uint8Array.from(newCells.h);
  });
  cells.area = profile.stage("cell-areas", "计算 pack cell 面积", () =>
    Uint16Array.from(cells.i, cellId => Math.min(Math.abs(packCellArea(cells, vertices, cellId)), UINT16_MAX))
  );

  grid.cells.pack = gridToPack;

  const neighborDegrees = profile.stage("degree-metrics", "统计 pack 邻接指标", () => cells.c.map(neighbors => neighbors.length));
  const maxNeighborDegree = maxValue(neighborDegrees);
  const pack = {
    cells,
    vertices,
    metadata: {
      cells: cells.g.length,
      vertices: vertices.p.length,
      mapping: "source-regraph-pack",
      semanticFields: ["gridCell", "feature", "height", "type", "culture", "religion", "state", "province", "region", "population", "burg"],
      excludedDeepWater: counters.excludedDeepWater,
      excludedLakePoints: counters.excludedLakePoints,
      keptGridPoints: counters.keptGridPoints,
      coastMidpoints: counters.coastMidpoints,
      averageNeighborDegree: round(average(neighborDegrees), 2),
      maxNeighborDegree,
      borderCells: cells.b.reduce((sum, value) => sum + (value ? 1 : 0), 0),
      buildMs: roundMs(performance.now() - startedAt)
    }
  };

  profile.stage("copy-grid-semantics", "复制 grid 语义字段", () => copyGridSemantics(cells, grid, features));
  const featureTiming = profile.stage("markup-pack-features", "标注 pack feature", () => markupPackFeatures(pack, grid));
  profile.stage("metadata-counts", "统计 pack 指标", () => {
    pack.metadata.packFeatureCount = pack.features.filter(Boolean).length;
    pack.metadata.havenCells = countPositive(cells.haven);
    pack.metadata.harborCells = countPositive(cells.harbor);
    pack.metadata.featureGroups = countByKey(pack.features.filter(Boolean), feature => feature.group || "none");
  });
  pack.metadata.featureTiming = featureTiming;
  pack.metadata.timing = profile.finish();

  return pack;
}

function collectPackPoints(grid, features) {
  const newCells = {p: [], g: [], h: []};
  const gridToPack = new Array(grid.points.length).fill(-1);
  const spacing2 = grid.metadata.spacing ** 2;
  const counters = {
    keptGridPoints: 0,
    excludedDeepWater: 0,
    excludedLakePoints: 0,
    coastMidpoints: 0
  };

  for (const gridCell of grid.cells.i) {
    const height = grid.cells.h[gridCell];
    const type = grid.cells.t?.[gridCell] ?? 0;
    const feature = features.features?.[grid.cells.f?.[gridCell]];

    if (height < WATER_LEVEL && type !== -1 && type !== -2) {
      counters.excludedDeepWater++;
      continue;
    }

    if (type === -2 && (gridCell % 4 === 0 || feature?.type === "lake")) {
      counters.excludedLakePoints++;
      continue;
    }

    const [x, y] = grid.points[gridCell];
    addNewPoint(newCells, gridToPack, gridCell, x, y, height);
    counters.keptGridPoints++;

    if (type === 1 || type === -1) {
      if (grid.cells.b[gridCell]) continue;
      for (const neighbor of grid.cells.c[gridCell] || []) {
        if (gridCell > neighbor) continue;
        if (grid.cells.t?.[neighbor] !== type) continue;
        const [nx, ny] = grid.points[neighbor];
        const dist2 = (y - ny) ** 2 + (x - nx) ** 2;
        if (dist2 < spacing2) continue;
        addNewPoint(newCells, gridToPack, gridCell, round((x + nx) / 2, 1), round((y + ny) / 2, 1), height, false);
        counters.coastMidpoints++;
      }
    }
  }

  return {newCells, gridToPack, counters};
}

function addNewPoint(newCells, gridToPack, gridCell, x, y, height, primary = true) {
  const packCell = newCells.p.length;
  newCells.p.push([x, y]);
  newCells.g.push(gridCell);
  newCells.h.push(height);
  if (primary && gridToPack[gridCell] === -1) gridToPack[gridCell] = packCell;
}

function copyGridSemantics(cells, grid, features) {
  const length = cells.g.length;
  cells.f = new Array(length);
  cells.temp = new Array(length);
  cells.prec = new Array(length);
  cells.biome = new Array(length);
  cells.culture = new Array(length);
  cells.religion = new Array(length);
  cells.state = new Array(length);
  cells.province = new Array(length);
  cells.region = new Array(length);
  cells.pop = new Array(length);
  cells.burg = new Array(length);
  cells.type = new Array(length);

  for (let packCell = 0; packCell < length; packCell++) {
    const gridCell = cells.g[packCell];
    const featureId = grid.cells.f?.[gridCell] ?? 0;
    const feature = features.features?.[featureId];
    cells.f[packCell] = featureId;
    cells.temp[packCell] = grid.cells.temp?.[gridCell] ?? 0;
    cells.prec[packCell] = grid.cells.prec?.[gridCell] ?? 0;
    cells.biome[packCell] = grid.cells.biome?.[gridCell] ?? 0;
    cells.culture[packCell] = grid.cells.culture?.[gridCell] ?? 0;
    cells.religion[packCell] = grid.cells.religion?.[gridCell] ?? 0;
    cells.state[packCell] = grid.cells.state?.[gridCell] ?? -1;
    cells.province[packCell] = grid.cells.province?.[gridCell] ?? -1;
    cells.region[packCell] = grid.cells.region?.[gridCell] ?? -1;
    cells.pop[packCell] = grid.cells.pop?.[gridCell] ?? 0;
    cells.burg[packCell] = grid.cells.burg?.[gridCell] ?? -1;
    cells.type[packCell] = feature?.type || "unknown";
  }
}

function markupPackFeatures(pack, grid) {
  const profile = createStageProfile();
  const {cells, vertices} = pack;
  const length = cells.i.length;
  const distanceField = new Int8Array(length);
  const featureIds = new Uint16Array(length);
  const haven = new Uint32Array(length);
  const harbor = new Uint8Array(length);
  const features = [null];
  const queue = [0];

  profile.stage("flood-features", "泛洪识别 pack feature", () => {
    for (let featureId = 1; queue[0] !== -1; featureId++) {
      const firstCell = queue[0];
      const featureCells = [];
      featureIds[firstCell] = featureId;
      const land = isLand(cells, firstCell);
      let border = Boolean(cells.b[firstCell]);
      let totalCells = 1;

      while (queue.length) {
        const cell = queue.pop();
        featureCells.push(cell);
        if (cells.b[cell]) border = true;

        for (const neighbor of cells.c[cell] || []) {
          const neighborLand = isLand(cells, neighbor);

          if (land && !neighborLand) {
            distanceField[cell] = LAND_COAST;
            distanceField[neighbor] = WATER_COAST;
            if (!haven[cell]) defineHaven(cells, cell, haven, harbor);
          } else if (land && neighborLand) {
            if (distanceField[neighbor] === UNMARKED && distanceField[cell] === LAND_COAST) distanceField[neighbor] = LANDLOCKED;
            else if (distanceField[cell] === UNMARKED && distanceField[neighbor] === LAND_COAST) distanceField[cell] = LANDLOCKED;
          }

          if (!featureIds[neighbor] && land === neighborLand) {
            queue.push(neighbor);
            featureIds[neighbor] = featureId;
            totalCells++;
          }
        }
      }

      featureCells.sort((a, b) => a - b);
      features.push(createPackFeature({pack, grid, featureIds, featureCells, firstCell, featureId, land, border, totalCells}));
      queue[0] = featureIds.indexOf(UNMARKED);
    }
  });

  profile.stage("distance-land", "标记内陆距离", () => markupDistanceField(distanceField, cells.c, DEEPER_LAND, 1));
  profile.stage("distance-water", "标记深水距离", () => markupDistanceField(distanceField, cells.c, DEEP_WATER, -1, -10));

  profile.stage("sync-fields", "同步 pack feature 字段", () => {
    cells.t = distanceField;
    cells.f = featureIds;
    cells.haven = haven;
    cells.harbor = harbor;
    for (let cell = 0; cell < length; cell++) cells.type[cell] = features[featureIds[cell]]?.type || "unknown";
    pack.features = features;
  });
  profile.stage("feature-groups", "定义 feature 分组", () => defineFeatureGroups(pack, grid));
  return profile.finish();
}

function defineHaven(cells, cell, haven, harbor) {
  const waterCells = (cells.c[cell] || []).filter(neighbor => isWater(cells, neighbor));
  let closest = waterCells[0] ?? 0;
  let closestDistance = Infinity;
  for (const waterCell of waterCells) {
    const distance = distanceSquared(cells.p[cell], cells.p[waterCell]);
    if (distance >= closestDistance) continue;
    closest = waterCell;
    closestDistance = distance;
  }
  haven[cell] = closest;
  harbor[cell] = waterCells.length;
}

function createPackFeature({pack, grid, featureIds, featureCells, firstCell, featureId, land, border, totalCells}) {
  const {cells, vertices} = pack;
  const type = land ? "island" : border ? "ocean" : "lake";
  const startCell = type === "ocean" ? firstCell : findFeatureBorderCell(cells, featureIds, featureCells, firstCell, featureId);
  const featureVertices = type === "ocean" ? [] : collectBoundaryVertices(cells, vertices, featureIds, featureCells, featureId);
  const feature = {
    id: featureId,
    i: featureId,
    type,
    land,
    border,
    cells: totalCells,
    firstCell: startCell,
    vertices: featureVertices,
    area: round(sumFeatureArea(cells, featureCells)),
    shoreline: [],
    height: 0,
    group: "none"
  };

  if (type === "lake") {
    feature.shoreline = collectLakeShoreline(cells, featureCells);
    feature.height = getLakeHeight(cells, feature.shoreline);
    feature.temp = getMeanGridValue(grid, cells, feature.shoreline, "temp");
    feature.flux = getSumGridValue(grid, cells, feature.shoreline, "prec");
    feature.evaporation = Math.max(1, round((feature.temp + 20) * Math.max(1, feature.cells) * 0.04));
  }

  return feature;
}

function findFeatureBorderCell(cells, featureIds, featureCells, firstCell, featureId) {
  if (isFeatureBorderCell(cells, featureIds, firstCell, featureId)) return firstCell;
  for (const cell of featureCells) {
    if (isFeatureBorderCell(cells, featureIds, cell, featureId)) return cell;
  }
  return firstCell;
}

function isFeatureBorderCell(cells, featureIds, cell, featureId) {
  return Boolean(cells.b[cell]) || (cells.c[cell] || []).some(neighbor => featureIds[neighbor] !== featureId);
}

function collectBoundaryVertices(cells, vertices, featureIds, featureCells, featureId) {
  const result = [];
  const seen = new Set();
  for (const cell of featureCells) {
    for (const vertexId of cells.v[cell] || []) {
      const vertexCells = vertices.c[vertexId] || [];
      if (!vertexCells.some(neighbor => neighbor < featureIds.length && featureIds[neighbor] !== featureId)) continue;
      if (seen.has(vertexId)) continue;
      seen.add(vertexId);
      result.push(vertexId);
    }
  }
  return result;
}

function collectLakeShoreline(cells, featureCells) {
  const shoreline = [];
  const seen = new Set();
  for (const cell of featureCells) {
    for (const neighbor of cells.c[cell] || []) {
      if (!isLand(cells, neighbor) || seen.has(neighbor)) continue;
      seen.add(neighbor);
      shoreline.push(neighbor);
    }
  }
  return shoreline;
}

function getLakeHeight(cells, shoreline) {
  if (!shoreline.length) return WATER_LEVEL;
  const minShoreHeight = Math.min(...shoreline.map(cell => cells.h[cell]));
  return round(minShoreHeight - 0.1, 2);
}

export function defineFeatureGroups(pack, grid) {
  const gridCellsNumber = grid.cells.i.length;
  const oceanMinSize = gridCellsNumber / 25;
  const seaMinSize = gridCellsNumber / 1000;
  const continentMinSize = gridCellsNumber / 10;
  const islandMinSize = gridCellsNumber / 1000;

  for (const feature of pack.features) {
    if (!feature) continue;
    if (feature.type === "island") {
      const previousFeature = pack.features[pack.cells.f[feature.firstCell - 1]];
      feature.group = previousFeature?.type === "lake" ? "lake_island" : feature.cells > continentMinSize ? "continent" : feature.cells > islandMinSize ? "island" : "isle";
    } else if (feature.type === "ocean") {
      feature.group = feature.cells > oceanMinSize ? "ocean" : feature.cells > seaMinSize ? "sea" : "gulf";
    } else if (feature.type === "lake") {
      feature.group = defineLakeGroup(feature);
    }
  }
}

function defineLakeGroup(feature) {
  if (feature.temp < -3) return "frozen";
  if (feature.height > 60 && feature.cells < 10 && feature.firstCell % 10 === 0) return "lava";
  if (!feature.inlets?.length && !feature.outlet) {
    if (feature.evaporation > feature.flux * 4) return "dry";
    if (feature.cells < 3 && feature.firstCell % 10 === 0) return "sinkhole";
  }
  if (!feature.outlet && feature.evaporation > feature.flux) return "salt";
  return "freshwater";
}

function markupDistanceField(distanceField, neighbors, start, increment, limit = 127) {
  for (let distance = start, marked = Infinity; marked > 0 && distance !== limit; distance += increment) {
    marked = 0;
    const previousDistance = distance - increment;
    for (let cell = 0; cell < neighbors.length; cell++) {
      if (distanceField[cell] !== previousDistance) continue;
      for (const neighbor of neighbors[cell] || []) {
        if (distanceField[neighbor] !== UNMARKED) continue;
        distanceField[neighbor] = distance;
        marked++;
      }
    }
  }
}

function sumFeatureArea(cells, featureCells) {
  let area = 0;
  for (const cell of featureCells) area += cells.area[cell] || 0;
  return area;
}

function getMeanGridValue(grid, cells, shoreline, field) {
  if (!shoreline.length) return 0;
  return round(getSumGridValue(grid, cells, shoreline, field) / shoreline.length, 1);
}

function getSumGridValue(grid, cells, shoreline, field) {
  let sum = 0;
  const values = grid.cells[field] || [];
  for (const cell of shoreline) sum += values[cells.g[cell]] || 0;
  return sum;
}

function isLand(cells, cell) {
  return cells.h[cell] >= WATER_LEVEL;
}

function isWater(cells, cell) {
  return cells.h[cell] < WATER_LEVEL;
}

function distanceSquared(a, b) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
}

function packCellArea(cells, vertices, cellId) {
  const vertexIds = cells.v[cellId] || [];
  let area = 0;
  let first = null;
  let previous = null;
  let points = 0;

  for (const vertexId of vertexIds) {
    const point = vertices.p[vertexId];
    if (!point) continue;
    if (!first) first = point;
    if (previous) area += previous[0] * point[1] - point[0] * previous[1];
    previous = point;
    points++;
  }

  if (points < 3) return 0;
  area += previous[0] * first[1] - first[0] * previous[1];
  return area / 2;
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function maxValue(values) {
  let max = -Infinity;
  for (const value of values) if (value > max) max = value;
  return max === -Infinity ? 0 : max;
}

function countPositive(values = []) {
  let count = 0;
  for (const value of values) if (value > 0) count++;
  return count;
}

function countByKey(items, keyFn) {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function round(value, digits = 0) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function roundMs(value) {
  return Math.round(value * 100) / 100;
}
