import {createSampledHeightmap} from "./heightmap.js";

const SEA_LEVEL = 20;
const EQUAL_EARTH = Object.freeze({a1: 1.340264, a2: -0.081106, a3: 0.000893, a4: 0.003796});

export function createMapTemplateHeightmap(options, manifest, resource) {
  validateInputs(manifest, resource);
  const width = Math.max(1, Math.round(Number(options.graphWidth) || 1));
  const height = Math.max(1, Math.round(Number(options.graphHeight) || 1));
  const samples = new Uint8Array(width * height);
  const hydrology = new Uint8Array(width * height);
  const regionMask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const coordinate = unprojectTemplatePoint(manifest, x + 0.5, y + 0.5, width, height);
      if (!coordinate) continue;
      regionMask[index] = 1;
      const physical = samplePhysical(resource, coordinate.longitude, coordinate.latitude);
      const river = physical.land && resource.hydrologyMask[physical.index] === 1;
      hydrology[index] = river ? 1 : 0;
      samples[index] = encodeHeight(physical.elevation, physical.land, river);
    }
  }
  const anchors = protectTemplateAnchors(samples, regionMask, width, height, manifest, options.cellsTarget);
  const semanticChecksum = checksumTemplateEvidence(manifest, resource.metadata.sha256, options, samples, hydrology, regionMask);
  const source = {
    template: `map-template:${manifest.id}`,
    name: manifest.name,
    kind: "map-template",
    width,
    height,
    heightMin: 0,
    heightMax: 100,
    normalization: "canonical-elevation-v1",
    templateId: manifest.id,
    templateVersion: manifest.version,
    resourceId: resource.id,
    resourceChecksum: resource.metadata.sha256,
    semanticChecksum,
    projection: {...manifest.projection},
    bounds: {...manifest.bounds},
    mapCoordinates: templateMapCoordinates(manifest),
    requestedCells: Number(options.cellsTarget) || 1,
    protectedAnchors: anchors.protected,
    degradedAnchors: anchors.degraded
  };
  const heightmap = createSampledHeightmap(options, {
    ...source,
    sampleHeight: point => samples[sampleIndex(point, width, height, options)]
  });
  Object.assign(heightmap.source, source);
  Object.defineProperties(heightmap, {
    sampleTemplateHydrology: {value: point => hydrology[sampleIndex(point, width, height, options)], enumerable: false},
    sampleTemplateRegion: {value: point => regionMask[sampleIndex(point, width, height, options)], enumerable: false}
  });
  return heightmap;
}

export function applyMapTemplateGridEvidence(grid, heightmap) {
  if (heightmap?.source?.kind !== "map-template") return null;
  const count = grid.points.length;
  const hydrology = new Uint8Array(count);
  const regionMask = new Uint8Array(count);
  let hydrologyCells = 0;
  let regionCells = 0;
  for (let cell = 0; cell < count; cell++) {
    const point = grid.points[cell];
    hydrology[cell] = heightmap.sampleTemplateHydrology(point) ? 1 : 0;
    regionMask[cell] = heightmap.sampleTemplateRegion(point) ? 1 : 0;
    hydrologyCells += hydrology[cell];
    regionCells += regionMask[cell];
  }
  grid.cells.templateHydrology = hydrology;
  grid.cells.templateRegion = regionMask;
  grid.metadata.mapTemplate = {
    id: heightmap.source.templateId,
    version: heightmap.source.templateVersion,
    semanticChecksum: heightmap.source.semanticChecksum,
    hydrologyCells,
    regionCells
  };
  return grid.metadata.mapTemplate;
}

export function unprojectTemplatePoint(manifest, x, y, width, height) {
  const u = x / width;
  const v = y / height;
  if (manifest.projection.id === "equal-earth") return inverseEqualEarth(u, v);
  if (manifest.projection.id === "south-polar-stereographic") return inverseSouthPolar(manifest.bounds, u, v);
  return {
    longitude: interpolateLongitude(manifest.bounds, u),
    latitude: manifest.bounds.north - v * (manifest.bounds.north - manifest.bounds.south)
  };
}

export function projectTemplateCoordinate(manifest, longitude, latitude, width, height) {
  if (!insideBounds(manifest.bounds, longitude, latitude)) return null;
  if (manifest.projection.id === "equal-earth") return forwardEqualEarth(longitude, latitude, width, height);
  if (manifest.projection.id === "south-polar-stereographic") return forwardSouthPolar(manifest.bounds, longitude, latitude, width, height);
  return {
    x: longitudeFraction(manifest.bounds, longitude) * width,
    y: (manifest.bounds.north - latitude) / (manifest.bounds.north - manifest.bounds.south) * height
  };
}

function validateInputs(manifest, resource) {
  if (!manifest?.id || !manifest?.projection || !manifest?.bounds) throw new Error("地图模板 manifest 无效");
  if (!resource?.elevations || !resource?.landMask || !resource?.hydrologyMask) throw new Error("地图模板物理资源不完整");
  if (resource.elevations.length !== resource.width * resource.height) throw new Error("地图模板高程资源尺寸无效");
}

function samplePhysical(resource, longitude, latitude) {
  const x = wrap(Math.floor((normalizeLongitude(longitude) + 180) / 360 * resource.width), resource.width);
  const y = clamp(Math.floor((90 - latitude) / 180 * resource.height), 0, resource.height - 1);
  const index = y * resource.width + x;
  return {index, elevation: resource.elevations[index], land: resource.landMask[index] === 1};
}

function encodeHeight(elevation, land, river) {
  if (!land) return elevation >= 0 ? 18 : clamp(Math.round(18 - Math.min(18, Math.sqrt(-elevation / 10_603) * 18)), 0, 19);
  const normalized = Math.sqrt(Math.max(0, elevation) / 6_259);
  const height = clamp(Math.round(22 + Math.min(1, normalized) * 78), 21, 100);
  return river ? Math.max(21, height - 4) : height;
}

function protectTemplateAnchors(samples, regionMask, width, height, manifest, cellsTarget) {
  const protectedIds = [];
  const degradedIds = [];
  const radius = Math.max(1, Math.ceil(Math.sqrt(width * height / Math.max(1, Number(cellsTarget) || 1)) * 0.8));
  for (const anchor of manifest.protectedAnchors || []) {
    if (["continuity", "extent", "sea", "historical-region", "historical-capital"].includes(anchor.kind)) continue;
    if ((Number(cellsTarget) || 1) < anchor.minCells) {
      degradedIds.push(anchor.id);
      continue;
    }
    const point = projectTemplateCoordinate(manifest, anchor.longitude, anchor.latitude, width, height);
    if (!point) {
      degradedIds.push(anchor.id);
      continue;
    }
    stampLand(samples, regionMask, width, height, Math.round(point.x), Math.round(point.y), radius);
    protectedIds.push(anchor.id);
  }
  return {protected: protectedIds, degraded: degradedIds};
}

function stampLand(samples, regionMask, width, height, centerX, centerY, radius) {
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    if (dx * dx + dy * dy > radius * radius) continue;
    const x = clamp(centerX + dx, 0, width - 1);
    const y = clamp(centerY + dy, 0, height - 1);
    const index = y * width + x;
    if (!regionMask[index]) continue;
    samples[index] = Math.max(samples[index], 24);
  }
}

function sampleIndex(point, width, height, options) {
  const x = clamp(Math.round((Number(point?.[0]) || 0) / Math.max(1, Number(options.graphWidth) || width) * (width - 1)), 0, width - 1);
  const y = clamp(Math.round((Number(point?.[1]) || 0) / Math.max(1, Number(options.graphHeight) || height) * (height - 1)), 0, height - 1);
  return y * width + x;
}

function templateMapCoordinates(manifest) {
  const {west, south, east, north} = manifest.bounds;
  return {
    latT: north - south,
    latN: north,
    latS: south,
    latCenter: (north + south) / 2,
    latitudeMode: "template",
    latitudeLabel: `模板纬度 ${south}°～${north}°`,
    lonT: longitudeSpan(manifest.bounds),
    lonW: west,
    lonE: east,
    mapSizePercent: (north - south) / 180 * 100,
    latitudeRangePercent: (north - south) / 180 * 100,
    longitudeRangePercent: longitudeSpan(manifest.bounds) / 360 * 100,
    projection: manifest.projection.id
  };
}

function checksumTemplateEvidence(manifest, resourceChecksum, options, ...arrays) {
  let hash = 2166136261;
  const prefix = `${manifest.id}|${manifest.version}|${resourceChecksum}|${options.cellsTarget}|${options.seed}|${options.salt || 0}`;
  for (let index = 0; index < prefix.length; index++) hash = Math.imul(hash ^ prefix.charCodeAt(index), 16777619);
  for (const array of arrays) for (const value of array) hash = Math.imul(hash ^ value, 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function inverseEqualEarth(u, v) {
  const thetaMax = Math.asin(Math.sqrt(3) / 2);
  const yMax = equalEarthY(thetaMax);
  const y = (0.5 - v) * 2 * yMax;
  let theta = y / EQUAL_EARTH.a1;
  for (let iteration = 0; iteration < 12; iteration++) {
    const derivative = EQUAL_EARTH.a1 + 3 * EQUAL_EARTH.a2 * theta ** 2 + 7 * EQUAL_EARTH.a3 * theta ** 6 + 9 * EQUAL_EARTH.a4 * theta ** 8;
    theta -= (equalEarthY(theta) - y) / derivative;
  }
  const denominator = 3 * (9 * EQUAL_EARTH.a4 * theta ** 8 + 7 * EQUAL_EARTH.a3 * theta ** 6 + 3 * EQUAL_EARTH.a2 * theta ** 2 + EQUAL_EARTH.a1);
  const xMax = 2 * Math.sqrt(3) * Math.PI / (3 * EQUAL_EARTH.a1);
  const x = (u - 0.5) * 2 * xMax;
  const longitude = x * denominator / (2 * Math.sqrt(3) * Math.cos(theta)) * 180 / Math.PI;
  const latitude = Math.asin(Math.sin(theta) * 2 / Math.sqrt(3)) * 180 / Math.PI;
  if (Math.abs(longitude) > 180.0001 || Math.abs(latitude) > 90.0001) return null;
  return {longitude: clamp(longitude, -180, 180), latitude: clamp(latitude, -90, 90)};
}

function forwardEqualEarth(longitude, latitude, width, height) {
  const lambda = longitude * Math.PI / 180;
  const theta = Math.asin(Math.sqrt(3) / 2 * Math.sin(latitude * Math.PI / 180));
  const denominator = 3 * (9 * EQUAL_EARTH.a4 * theta ** 8 + 7 * EQUAL_EARTH.a3 * theta ** 6 + 3 * EQUAL_EARTH.a2 * theta ** 2 + EQUAL_EARTH.a1);
  const x = 2 * Math.sqrt(3) * lambda * Math.cos(theta) / denominator;
  const xMax = 2 * Math.sqrt(3) * Math.PI / (3 * EQUAL_EARTH.a1);
  const yMax = equalEarthY(Math.asin(Math.sqrt(3) / 2));
  return {x: (x / (2 * xMax) + 0.5) * width, y: (0.5 - equalEarthY(theta) / (2 * yMax)) * height};
}

function equalEarthY(theta) {
  return theta * (EQUAL_EARTH.a1 + EQUAL_EARTH.a2 * theta ** 2 + EQUAL_EARTH.a3 * theta ** 6 + EQUAL_EARTH.a4 * theta ** 8);
}

function inverseSouthPolar(bounds, u, v) {
  const dx = (u - 0.5) * 2;
  const dy = (v - 0.5) * 2;
  const radius = Math.hypot(dx, dy);
  if (radius > 1) return null;
  const longitude = normalizeLongitude(Math.atan2(dx, -dy) * 180 / Math.PI);
  const latitude = -90 + radius * (bounds.north + 90);
  return {longitude, latitude};
}

function forwardSouthPolar(bounds, longitude, latitude, width, height) {
  const radius = (latitude + 90) / (bounds.north + 90);
  const angle = longitude * Math.PI / 180;
  return {x: (0.5 + Math.sin(angle) * radius / 2) * width, y: (0.5 - Math.cos(angle) * radius / 2) * height};
}

function insideBounds(bounds, longitude, latitude) {
  return latitude >= bounds.south && latitude <= bounds.north && longitudeFraction(bounds, longitude) >= 0 && longitudeFraction(bounds, longitude) <= 1;
}

function interpolateLongitude(bounds, fraction) {
  return normalizeLongitude(bounds.west + longitudeSpan(bounds) * fraction);
}

function longitudeFraction(bounds, longitude) {
  const span = longitudeSpan(bounds);
  let delta = normalizeLongitude(longitude) - bounds.west;
  while (delta < 0) delta += 360;
  return delta / span;
}

function longitudeSpan(bounds) {
  const raw = bounds.east - bounds.west;
  return raw > 0 ? raw : raw + 360;
}

function normalizeLongitude(value) {
  return ((Number(value) + 180) % 360 + 360) % 360 - 180;
}

function wrap(value, length) {
  return ((value % length) + length) % length;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
