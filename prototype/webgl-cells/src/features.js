import {getCoastlineColor, getLakeColor, getLandmassColor} from "./colors.js";

export function buildFeatureBuffers(snapshot) {
  const landPositions = [];
  const landColors = [];
  const lakePositions = [];
  const lakeColors = [];
  const lakeIslandPositions = [];
  const lakeIslandColors = [];
  const coastlinePositions = [];
  const coastlineColors = [];
  const lakeShorePositions = [];
  const lakeShoreColors = [];
  const stats = createFeatureStats(snapshot);

  if (!Array.isArray(snapshot.features)) {
    return {
      landPositions,
      landColors,
      lakePositions,
      lakeColors,
      lakeIslandPositions,
      lakeIslandColors,
      coastlinePositions,
      coastlineColors,
      lakeShorePositions,
      lakeShoreColors,
      stats
    };
  }

  const featuresById = new Map(snapshot.features.filter(Boolean).map(feature => [feature.i, feature]));
  pushLakeCellFills(snapshot, lakePositions, lakeColors, featuresById);

  for (const feature of snapshot.features) {
    if (!feature || feature.type === "ocean") continue;

    const points = getFeaturePoints(snapshot, feature);
    if (points.length < 3) continue;

    if (feature.type === "lake") {
      pushFeatureLine(lakeShorePositions, lakeShoreColors, points, getCoastlineColor("lake", feature.group));
      continue;
    }

    if (feature.group === "lake_island") {
      pushFeatureFill(lakeIslandPositions, lakeIslandColors, points, getLandmassColor(feature.group));
      pushFeatureLine(lakeShorePositions, lakeShoreColors, points, getCoastlineColor("lake", feature.group));
      continue;
    }

    pushFeatureFill(landPositions, landColors, points, getLandmassColor(feature.group));
    pushFeatureLine(coastlinePositions, coastlineColors, points, getCoastlineColor("coast", feature.group));
  }

  return {
    landPositions,
    landColors,
    lakePositions,
    lakeColors,
    lakeIslandPositions,
    lakeIslandColors,
    coastlinePositions,
    coastlineColors,
    lakeShorePositions,
    lakeShoreColors,
    stats
  };
}

export function getFeatureStats(snapshot) {
  return createFeatureStats(snapshot);
}

function createFeatureStats(snapshot) {
  const stats = {
    features: 0,
    landFeatures: 0,
    lakeFeatures: 0,
    lakeIslandFeatures: 0,
    coastlineFeatures: 0,
    lakeGroups: {}
  };

  if (!Array.isArray(snapshot.features)) return stats;

  for (const feature of snapshot.features) {
    if (!feature) continue;
    stats.features++;
    if (feature.type === "lake") {
      stats.lakeFeatures++;
      const group = feature.group || "freshwater";
      stats.lakeGroups[group] = (stats.lakeGroups[group] || 0) + 1;
    } else if (feature.type === "island") {
      stats.landFeatures++;
      if (feature.group === "lake_island") stats.lakeIslandFeatures++;
      else stats.coastlineFeatures++;
    }
  }

  return stats;
}

function getFeaturePoints(snapshot, feature) {
  if (!Array.isArray(feature.vertices)) return [];
  return feature.vertices.map(vertexId => snapshot.vertices?.p?.[vertexId]).filter(Boolean);
}

function pushLakeCellFills(snapshot, positions, colors, featuresById) {
  const {cells, vertices} = snapshot;
  if (!cells?.i || !cells?.f || !vertices?.p) return;

  for (let cellIndex = 0; cellIndex < cells.i.length; cellIndex++) {
    if ((cells.h?.[cellIndex] ?? 100) >= 20) continue;

    const feature = featuresById.get(cells.f[cellIndex]);
    if (feature?.type !== "lake") continue;

    pushCellFill(positions, colors, cells.p[cellIndex], cells.v[cellIndex], vertices.p, getLakeColor(feature.group));
  }
}

function pushCellFill(positions, colors, center, vertexIds, vertices, color) {
  if (!center || !Array.isArray(vertexIds) || vertexIds.length < 3) return;

  for (let index = 0; index < vertexIds.length; index++) {
    const a = vertices[vertexIds[index]];
    const b = vertices[vertexIds[(index + 1) % vertexIds.length]];
    if (!a || !b) continue;

    positions.push(center[0], center[1], a[0], a[1], b[0], b[1]);
    pushTriangleColor(colors, color);
  }
}

function pushFeatureFill(positions, colors, points, color) {
  const center = getPolygonCenter(points);
  for (let index = 0; index < points.length; index++) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    positions.push(center[0], center[1], a[0], a[1], b[0], b[1]);
    pushTriangleColor(colors, color);
  }
}

function pushFeatureLine(positions, colors, points, color) {
  for (let index = 0; index < points.length; index++) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    positions.push(a[0], a[1], b[0], b[1]);
    colors.push(color[0], color[1], color[2], color[0], color[1], color[2]);
  }
}

function pushTriangleColor(colors, color) {
  for (let index = 0; index < 3; index++) colors.push(color[0], color[1], color[2]);
}

function getPolygonCenter(points) {
  let x = 0;
  let y = 0;
  for (const point of points) {
    x += point[0];
    y += point[1];
  }
  return [x / points.length, y / points.length];
}
