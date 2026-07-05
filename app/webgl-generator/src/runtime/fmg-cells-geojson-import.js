import {defineBiomesAndPopulation} from "../generator/biomes.js";
import {buildClimate} from "../generator/climate.js";
import {extractFeatures} from "../generator/features.js";
import {refreshPackFeatures} from "../generator/pack.js";
import {createRandom} from "../generator/random.js";
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
      refreshImportedTerrainDerivatives(context.map);
    },
    revert(context) {
      applyHeightChanges(context.map, changes, "before");
      refreshImportedTerrainDerivatives(context.map);
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

function refreshImportedTerrainDerivatives(map) {
  if (!map?.grid?.cells?.h) return;
  map.features = extractFeatures(map.grid);

  if (map.pack?.cells) {
    syncPackHeightsFromGrid(map);
    refreshPackFeatures(map.pack, map.grid);
  }

  const options = map.options || {};
  map.climate = buildClimate(map.grid, map.features, options, createRandom(options.seed || map.metadata?.seed || "geo-import"));
  if (map.pack?.cells) {
    const biomes = defineBiomesAndPopulation(map.grid, map.pack, options);
    map.climate.biomes = biomes.biomes;
    map.climate.metadata.biomeCounts = biomes.metadata.biomeCounts;
  }

  if (map.metadata) {
    map.metadata.featureCount = map.features.metadata?.featureCount ?? map.metadata.featureCount;
    map.metadata.packCells = map.pack?.metadata?.cells ?? map.metadata.packCells;
    map.metadata.geoImportDerivedRefresh = {
      featureCount: map.features.metadata?.featureCount || 0,
      packFeatureCount: map.pack?.metadata?.packFeatureCount || 0,
      refreshedAt: new Date().toISOString()
    };
  }
  if (map.summary) {
    map.summary.featureCount = map.features.metadata?.featureCount ?? map.summary.featureCount;
    map.summary.oceanFeatures = map.features.metadata?.oceanFeatures ?? map.summary.oceanFeatures;
    map.summary.landFeatures = map.features.metadata?.landFeatures ?? map.summary.landFeatures;
    map.summary.lakeFeatures = map.features.metadata?.lakeFeatures ?? map.summary.lakeFeatures;
    map.summary.packCells = map.pack?.metadata?.cells ?? map.summary.packCells;
  }
  markDerivedSystemsStale(map);
  delete map.__heightEditorPackCellsByGrid;
}

function syncPackHeightsFromGrid(map) {
  const cells = map.pack?.cells;
  if (!cells?.g || !cells?.h || !map.grid?.cells?.h) return;
  for (let packCell = 0; packCell < cells.g.length; packCell += 1) {
    const gridCell = cells.g[packCell];
    if (!Number.isInteger(gridCell) || gridCell < 0) continue;
    cells.h[packCell] = clampHeight(map.grid.cells.h[gridCell]);
    if (cells.temp) cells.temp[packCell] = map.grid.cells.temp?.[gridCell] ?? cells.temp[packCell] ?? 0;
    if (cells.prec) cells.prec[packCell] = map.grid.cells.prec?.[gridCell] ?? cells.prec[packCell] ?? 0;
  }
}

function markDerivedSystemsStale(map) {
  const current = Array.isArray(map.metadata?.derivedStale?.systems) ? map.metadata.derivedStale.systems : [];
  const systems = new Set(current);
  for (const system of ["rivers", "routes", "cities", "states", "provinces", "religions", "markers", "zones", "military", "economy", "diplomacy"]) {
    systems.add(system);
  }
  map.metadata = map.metadata || {};
  map.metadata.derivedStale = {
    ...(map.metadata.derivedStale || {}),
    systems: [...systems],
    reason: "fmg-cells-geojson-terrain-import"
  };
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
