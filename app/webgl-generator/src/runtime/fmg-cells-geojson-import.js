import {EDIT_REFRESH_PRESETS} from "./edit-refresh-scheduler.js";

const SPATIAL_BUCKETS = 64;

export function createImportFmgCellsHeightCommand(text, map, {label = "导入 FMG Cells 地形"} = {}) {
  const source = parseFmgCellsGeoJson(text, map);
  if (!source) return null;
  const changes = sampleSourceHeightsToGrid(source.samples, map);
  return {
    label: `${label} ${changes.length} cells`,
    effects: {
      ...EDIT_REFRESH_PRESETS.HEIGHT_SURFACE_ONLY,
      derived: ["terrain-caches", "height-field", "cell-colors", "line-layers", "height-stats", "panels"],
      affected: [{kind: "grid-cells", id: changes.length}]
    },
    apply(context) {
      applyHeightChanges(context.map, changes, "after");
    },
    revert(context) {
      applyHeightChanges(context.map, changes, "before");
    },
    isNoop() {
      return changes.length === 0;
    },
    getSummary() {
      return {
        sourceCells: source.sourceCells,
        sourceLandCells: source.sourceLandCells,
        sourceWaterCells: source.sourceWaterCells,
        appliedCells: changes.length,
        heightMin: source.heightMin,
        heightMax: source.heightMax
      };
    }
  };
}

function parseFmgCellsGeoJson(text, map) {
  let document;
  try {
    document = JSON.parse(text);
  } catch {
    return null;
  }
  const features = document?.type === "FeatureCollection" && Array.isArray(document.features) ? document.features : [];
  if (features.length < 100 || !looksLikeFmgCellsFeatures(features)) return null;
  const bbox = featureCollectionBbox(features);
  if (!bbox) return null;
  const width = mapWidth(map);
  const height = mapHeight(map);
  const samples = [];
  let sourceLandCells = 0;
  let sourceWaterCells = 0;
  let heightMin = Infinity;
  let heightMax = -Infinity;
  for (const feature of features) {
    const elevation = Number(feature.properties?.height);
    if (!Number.isFinite(elevation)) continue;
    const center = featureCenter(feature);
    if (!center) continue;
    const x = ((center.lon - bbox.minLon) / Math.max(1e-9, bbox.maxLon - bbox.minLon)) * width;
    const y = ((bbox.maxLat - center.lat) / Math.max(1e-9, bbox.maxLat - bbox.minLat)) * height;
    const heightValue = sourceElevationToHeight(elevation);
    samples.push({x, y, height: heightValue});
    if (heightValue >= 20) sourceLandCells++;
    else sourceWaterCells++;
    heightMin = Math.min(heightMin, elevation);
    heightMax = Math.max(heightMax, elevation);
  }
  if (samples.length < 100) return null;
  return {
    samples,
    sourceCells: samples.length,
    sourceLandCells,
    sourceWaterCells,
    heightMin,
    heightMax
  };
}

function looksLikeFmgCellsFeatures(features) {
  const sample = features.slice(0, Math.min(80, features.length));
  const matches = sample.filter(feature => {
    const properties = feature?.properties || {};
    return feature?.type === "Feature"
      && feature.geometry?.type === "Polygon"
      && Number.isFinite(Number(properties.id))
      && Number.isFinite(Number(properties.height))
      && Number.isFinite(Number(properties.biome))
      && Array.isArray(properties.neighbors);
  });
  return matches.length >= Math.max(10, sample.length * 0.75);
}

function featureCollectionBbox(features) {
  const bbox = {minLon: Infinity, minLat: Infinity, maxLon: -Infinity, maxLat: -Infinity};
  for (const feature of features) {
    forEachCoordinate(feature.geometry?.coordinates, coordinate => {
      const lon = Number(coordinate[0]);
      const lat = Number(coordinate[1]);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
      bbox.minLon = Math.min(bbox.minLon, lon);
      bbox.minLat = Math.min(bbox.minLat, lat);
      bbox.maxLon = Math.max(bbox.maxLon, lon);
      bbox.maxLat = Math.max(bbox.maxLat, lat);
    });
  }
  return Object.values(bbox).every(Number.isFinite) ? bbox : null;
}

function featureCenter(feature) {
  const coordinates = [];
  forEachCoordinate(feature.geometry?.coordinates?.[0], coordinate => {
    const lon = Number(coordinate[0]);
    const lat = Number(coordinate[1]);
    if (Number.isFinite(lon) && Number.isFinite(lat)) coordinates.push([lon, lat]);
  });
  const unique = dropDuplicateClosingCoordinate(coordinates);
  if (!unique.length) return null;
  const total = unique.reduce((sum, coordinate) => {
    sum.lon += coordinate[0];
    sum.lat += coordinate[1];
    return sum;
  }, {lon: 0, lat: 0});
  return {lon: total.lon / unique.length, lat: total.lat / unique.length};
}

function forEachCoordinate(value, callback) {
  if (!Array.isArray(value)) return;
  if (typeof value[0] === "number" && typeof value[1] === "number") {
    callback(value);
    return;
  }
  for (const item of value) forEachCoordinate(item, callback);
}

function dropDuplicateClosingCoordinate(coordinates) {
  if (coordinates.length < 2) return coordinates;
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) return coordinates;
  return coordinates.slice(0, -1);
}

function sampleSourceHeightsToGrid(samples, map) {
  const cells = map?.grid?.cells;
  const points = map?.grid?.points || cells?.p;
  if (!cells?.h || !Array.isArray(points)) return [];
  const index = createSpatialSampleIndex(samples, mapWidth(map), mapHeight(map));
  const changes = [];
  for (const cell of cells.i || points.keys()) {
    const point = points[cell];
    if (!point) continue;
    const nearest = findNearestSample(index, point[0], point[1]);
    if (!nearest) continue;
    const before = clampHeight(cells.h[cell]);
    const after = clampHeight(nearest.height);
    if (before === after) continue;
    changes.push({gridCell: cell, before, after});
  }
  return changes;
}

function createSpatialSampleIndex(samples, width, height) {
  const columns = SPATIAL_BUCKETS;
  const rows = SPATIAL_BUCKETS;
  const buckets = Array.from({length: columns * rows}, () => []);
  for (const sample of samples) {
    const x = bucketCoordinate(sample.x, width, columns);
    const y = bucketCoordinate(sample.y, height, rows);
    buckets[y * columns + x].push(sample);
  }
  return {samples, width, height, columns, rows, buckets};
}

function findNearestSample(index, x, y) {
  const startX = bucketCoordinate(x, index.width, index.columns);
  const startY = bucketCoordinate(y, index.height, index.rows);
  let best = null;
  let bestDistance = Infinity;
  const maxRadius = Math.max(index.columns, index.rows);
  for (let radius = 0; radius <= maxRadius; radius += 1) {
    let visited = 0;
    for (let by = startY - radius; by <= startY + radius; by += 1) {
      if (by < 0 || by >= index.rows) continue;
      for (let bx = startX - radius; bx <= startX + radius; bx += 1) {
        if (bx < 0 || bx >= index.columns) continue;
        if (radius > 0 && bx > startX - radius && bx < startX + radius && by > startY - radius && by < startY + radius) continue;
        visited++;
        for (const sample of index.buckets[by * index.columns + bx]) {
          const distance = (sample.x - x) ** 2 + (sample.y - y) ** 2;
          if (distance >= bestDistance) continue;
          bestDistance = distance;
          best = sample;
        }
      }
    }
    if (best && visited) return best;
  }
  return best || index.samples[0] || null;
}

function bucketCoordinate(value, max, count) {
  const ratio = max > 0 ? Number(value) / max : 0;
  return Math.max(0, Math.min(count - 1, Math.floor(ratio * count)));
}

function applyHeightChanges(map, changes, key) {
  if (!map?.grid?.cells?.h) return;
  for (const change of changes) {
    const value = clampHeight(change[key]);
    map.grid.cells.h[change.gridCell] = value;
    for (const packCell of getPackCellsForGrid(map, change.gridCell)) {
      map.pack.cells.h[packCell] = value;
    }
  }
}

function getPackCellsForGrid(map, gridCell) {
  if (!map?.pack?.cells?.g || !map?.pack?.cells?.h) return [];
  if (!map.__heightEditorPackCellsByGrid) {
    const byGrid = new Map();
    for (let packCell = 0; packCell < map.pack.cells.g.length; packCell += 1) {
      const mappedGrid = map.pack.cells.g[packCell];
      if (!Number.isInteger(mappedGrid) || mappedGrid < 0) continue;
      if (!byGrid.has(mappedGrid)) byGrid.set(mappedGrid, []);
      byGrid.get(mappedGrid).push(packCell);
    }
    map.__heightEditorPackCellsByGrid = byGrid;
  }
  return map.__heightEditorPackCellsByGrid.get(gridCell) || [];
}

function sourceElevationToHeight(elevation) {
  const meters = Number(elevation);
  if (!Number.isFinite(meters)) return 0;
  if (meters >= 0) return clampHeight(Math.round(Math.sqrt(meters) + 18));
  return clampHeight(Math.round(1000 / Math.max(1, 50 - meters)));
}

function clampHeight(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function mapWidth(map) {
  return Math.max(1, Number(map?.metadata?.graphWidth) || Number(map?.options?.graphWidth) || 1440);
}

function mapHeight(map) {
  return Math.max(1, Number(map?.metadata?.graphHeight) || Number(map?.options?.graphHeight) || 960);
}
