import {isWorldPoint, pointsNear, segmentsIntersect, worldDistance} from "./geometry.js";

const EPSILON = 1e-9;

export const SHORE_TOPOLOGY_ALGORITHM = Object.freeze({
  id: "visvalingam-limited-chaikin",
  name: "Visvalingam + 有限 Chaikin",
  threshold: 6,
  smoothness: 0.25,
  iterations: 2,
  maxDisplacement: 18
});

export const SHORE_TOPOLOGY_GATES = Object.freeze({
  maxSegmentWorld: 14,
  spikeAngleCos: 0.94,
  protectedDistanceWorld: 18,
  protectedClearanceWorld: 1.2,
  mouthDistanceWorld: 7
});

export function buildShoreTopologySnapshot(paths, map, options = {}) {
  const startedAt = nowMs();
  const settings = {...SHORE_TOPOLOGY_ALGORITHM, ...options};
  const gates = {...SHORE_TOPOLOGY_GATES, maxDisplacement: settings.maxDisplacement, ...options.gates};
  const protectedObjects = collectProtectedShoreObjects(map);
  const stats = {
    snapshotVersion: 1,
    immutable: true,
    algorithmId: SHORE_TOPOLOGY_ALGORITHM.id,
    algorithmName: SHORE_TOPOLOGY_ALGORITHM.name,
    renderSource: "snapshot.renderPoints",
    bandAndStrokeShared: false,
    visualBand: "retired-after-exact-xor",
    surfaceAndStrokeShared: true,
    surfaceCorrection: "raw-snapshot-xor-triangulation",
    hardEdgeFallback: "shared-voronoi-edge",
    threshold: settings.threshold,
    smoothness: settings.smoothness,
    iterations: settings.iterations,
    maxDisplacement: settings.maxDisplacement,
    arcCount: 0,
    smoothedArcCount: 0,
    unchangedArcCount: 0,
    fallbackArcCount: 0,
    openArcCount: 0,
    closedArcCount: 0,
    sourcePointCount: 0,
    renderPointCount: 0,
    sourceSegmentCount: 0,
    eligibleSourceSegmentCount: 0,
    smoothedSourceSegmentCount: 0,
    locallyFallbackSourceSegmentCount: 0,
    locallyFallbackArcCount: 0,
    sourceLengthWorld: 0,
    eligibleSourceLengthWorld: 0,
    smoothedSourceLengthWorld: 0,
    eligibleLengthRatio: 0,
    smoothedLengthRatio: 0,
    maxVisibleDisplacementWorld: 0,
    localFallbackReasons: {},
    fallbackReasons: {},
    protectedObjects: {
      towns: protectedObjects.towns.length,
      roads: protectedObjects.roads.length,
      rivers: protectedObjects.rivers.length
    }
  };

  const snapshotPaths = [];
  for (const path of paths || []) {
    const result = buildShoreArcSnapshot(path, protectedObjects, {
      ...settings,
      gates,
      isSideSampleSafe: options.isSideSampleSafe
    });
    snapshotPaths.push(result.path);
    stats.arcCount++;
    stats.sourcePointCount += result.path.sourcePoints.length;
    stats.renderPointCount += result.path.renderPoints.length;
    stats.sourceSegmentCount += result.sourceSegmentCount;
    stats.eligibleSourceSegmentCount += result.eligibleSourceSegmentCount;
    stats.smoothedSourceSegmentCount += result.smoothedSourceSegmentCount;
    stats.locallyFallbackSourceSegmentCount += result.locallyFallbackSourceSegmentCount;
    stats.sourceLengthWorld += result.sourceLengthWorld;
    stats.eligibleSourceLengthWorld += result.eligibleSourceLengthWorld;
    stats.smoothedSourceLengthWorld += result.smoothedSourceLengthWorld;
    stats.maxVisibleDisplacementWorld = Math.max(stats.maxVisibleDisplacementWorld, result.maxVisibleDisplacementWorld);
    if (result.locallyFallbackSourceSegmentCount > 0 && !result.fallbackReason) stats.locallyFallbackArcCount++;
    for (const [reason, count] of Object.entries(result.localFallbackReasons)) {
      stats.localFallbackReasons[reason] = (stats.localFallbackReasons[reason] || 0) + count;
    }
    if (result.path.closed) stats.closedArcCount++;
    else stats.openArcCount++;
    if (result.fallbackReason) {
      stats.fallbackArcCount++;
      stats.fallbackReasons[result.fallbackReason] = (stats.fallbackReasons[result.fallbackReason] || 0) + 1;
    } else if (result.smoothedSourceSegmentCount > 0) {
      stats.smoothedArcCount++;
    } else {
      stats.unchangedArcCount++;
    }
  }
  stats.eligibleLengthRatio = stats.sourceLengthWorld > EPSILON
    ? roundRatio(stats.eligibleSourceLengthWorld / stats.sourceLengthWorld)
    : 0;
  stats.smoothedLengthRatio = stats.sourceLengthWorld > EPSILON
    ? roundRatio(stats.smoothedSourceLengthWorld / stats.sourceLengthWorld)
    : 0;
  stats.sourceLengthWorld = roundMs(stats.sourceLengthWorld);
  stats.eligibleSourceLengthWorld = roundMs(stats.eligibleSourceLengthWorld);
  stats.smoothedSourceLengthWorld = roundMs(stats.smoothedSourceLengthWorld);
  stats.maxVisibleDisplacementWorld = roundMs(stats.maxVisibleDisplacementWorld);
  stats.buildMs = roundMs(nowMs() - startedAt);

  return Object.freeze({
    paths: Object.freeze(snapshotPaths),
    stats: freezeStats(stats)
  });
}

export function buildShoreArcSnapshot(path, protectedObjects = {towns: [], roads: [], rivers: []}, options = {}) {
  const settings = {...SHORE_TOPOLOGY_ALGORITHM, ...options};
  const gates = {...SHORE_TOPOLOGY_GATES, maxDisplacement: settings.maxDisplacement, ...options.gates};
  const sourceDefinitionValid = Array.isArray(path?.points) && path.points.every(isWorldPoint);
  const sourcePoints = normalizePoints(path?.points);
  const closed = isClosed(sourcePoints);
  let renderPoints = sourcePoints;
  let fallbackReason = sourceDefinitionValid ? validateSource(sourcePoints, closed) : "invalid-source";
  let localFallbackSegments = new Set();
  let localFallbackReasons = {};

  if (!fallbackReason) {
    try {
      renderPoints = transformRecommendedShoreArc(sourcePoints, settings);
      fallbackReason = validateTransformedArc(sourcePoints, renderPoints, closed, gates);
      if (!fallbackReason) {
        const localResult = applyLocalSafetyFallback(
          path,
          sourcePoints,
          renderPoints,
          protectedObjects,
          settings,
          gates,
          options.isSideSampleSafe
        );
        renderPoints = localResult.renderPoints;
        localFallbackSegments = localResult.segments;
        localFallbackReasons = localResult.reasons;
        fallbackReason = localResult.fallbackReason;
      }
    } catch {
      fallbackReason = "invalid-transform";
    }
  }

  if (fallbackReason) {
    renderPoints = sourcePoints.map(copyPoint);
    localFallbackSegments = new Set();
    localFallbackReasons = {};
  }
  const sourceSegmentCount = Math.max(0, sourcePoints.length - 1);
  const sourceLengthWorld = polylineLength(sourcePoints);
  const eligibleSourceLengthWorld = fallbackReason
    ? 0
    : sourceSegmentLengthExcluding(sourcePoints, localFallbackSegments);
  const changeAnalysis = fallbackReason || options.measureChanges === false
    ? {segments: new Set(), maxDisplacement: 0}
    : analyzeChangedSourceSegments(sourcePoints, renderPoints);
  const changedSegments = changeAnalysis.segments;
  for (const segment of localFallbackSegments) changedSegments.delete(segment);
  const smoothedSourceLengthWorld = sourceSegmentLengthIncluding(sourcePoints, changedSegments);
  const maxVisibleDisplacementWorld = changeAnalysis.maxDisplacement;
  const frozenSource = freezePoints(sourcePoints);
  const frozenRender = freezePoints(renderPoints);
  const frozenPath = Object.freeze({
    ...copyPathMetadata(path),
    points: frozenSource,
    sourcePoints: frozenSource,
    renderPoints: frozenRender,
    closed,
    topologyFallbackReason: fallbackReason || null,
    topologyLocalFallbackSegments: Object.freeze([...localFallbackSegments].sort((a, b) => a - b)),
    topologyLocalFallbackReasons: Object.freeze({...localFallbackReasons})
  });
  return Object.freeze({
    path: frozenPath,
    fallbackReason: fallbackReason || null,
    sourceSegmentCount,
    eligibleSourceSegmentCount: fallbackReason ? 0 : sourceSegmentCount - localFallbackSegments.size,
    smoothedSourceSegmentCount: changedSegments.size,
    locallyFallbackSourceSegmentCount: fallbackReason ? 0 : localFallbackSegments.size,
    sourceLengthWorld,
    eligibleSourceLengthWorld,
    smoothedSourceLengthWorld,
    maxVisibleDisplacementWorld,
    localFallbackReasons: Object.freeze({...localFallbackReasons})
  });
}

export function transformRecommendedShoreArc(points, options = {}) {
  const settings = {...SHORE_TOPOLOGY_ALGORITHM, ...options};
  const closed = isClosed(points);
  const source = normalizePoints(points, closed);
  const simplified = visvalingam(source, settings.threshold, closed);
  let smoothed = simplified;
  const iterations = Math.max(1, Math.min(3, Math.floor(settings.iterations || 1)));
  for (let iteration = 0; iteration < iterations; iteration++) {
    smoothed = limitedChaikin(smoothed, Math.min(settings.smoothness, 0.25), closed);
  }
  const displaced = limitDisplacement(smoothed, source, settings.maxDisplacement);
  return lockAnchors(displaced, source, closed);
}

export function maxShoreDisplacement(points, source) {
  const sourceIndex = createSegmentSpatialIndex(source, SHORE_TOPOLOGY_ALGORITHM.maxDisplacement);
  const pointsIndex = createSegmentSpatialIndex(points, SHORE_TOPOLOGY_ALGORITHM.maxDisplacement);
  return Math.max(
    directedMaxShoreDisplacement(points, source, sourceIndex),
    directedMaxShoreDisplacement(source, points, pointsIndex)
  );
}

function directedMaxShoreDisplacement(points, source, sourceIndex) {
  let maximum = 0;
  for (const point of points || []) maximum = Math.max(maximum, nearestPathProjection(point, source, sourceIndex).distance);
  return maximum;
}

export function collectProtectedShoreObjects(map) {
  const towns = [];
  for (const city of map?.settlements?.cities || []) {
    if (Number.isFinite(city?.x) && Number.isFinite(city?.y)) towns.push(Object.freeze([city.x, city.y]));
  }

  const roads = [];
  for (const route of map?.settlements?.routes || []) {
    const points = normalizePoints(route?.points);
    if (points.length >= 2) roads.push(freezePoints(points));
  }

  const rivers = [];
  for (const river of map?.rivers?.rivers || []) {
    const points = normalizePoints(river?.points);
    if (points.length >= 2) rivers.push(freezePoints(points));
  }

  const result = {
    towns: Object.freeze(towns),
    roads: Object.freeze(roads),
    rivers: Object.freeze(rivers)
  };
  result.spatialIndex = buildProtectedObjectSpatialIndex(result);
  return Object.freeze(result);
}

function validateSource(points, closed) {
  if (points.length < (closed ? 4 : 2)) return "degenerate-source";
  if (points.some(point => !isWorldPoint(point))) return "invalid-source";
  return null;
}

function validateTransformedArc(source, render, closed, gates) {
  if (render.length < (closed ? 4 : 2) || render.some(point => !isWorldPoint(point))) return "degenerate-transform";
  if (closed !== isClosed(render)) return "anchor-lock";
  if (!closed && (!pointsNear(source[0], render[0]) || !pointsNear(source.at(-1), render.at(-1)))) return "anchor-lock";
  if (closed && !pointsNear(render[0], render.at(-1))) return "anchor-lock";
  if (maxShoreDisplacement(render, source) > gates.maxDisplacement + 1e-6) return "max-displacement";

  const sourceMaxSegment = maximumSegmentLength(source);
  const maxSegment = Math.max(gates.maxSegmentWorld, sourceMaxSegment * 2);
  if (maximumSegmentLength(render) > maxSegment) return "long-segment";
  if (hasHardSpike(render, gates.spikeAngleCos, closed)) return "spike";
  if (hasCrossingProjectionQuad(render, source)) return "crossing-quad";
  return null;
}

function applyLocalSafetyFallback(path, source, candidate, protectedObjects, settings, gates, isSideSampleSafe) {
  const segmentCount = Math.max(0, source.length - 1);
  const closed = isClosed(source);
  const segments = new Set();
  const reasons = {};
  let renderPoints = candidate;

  for (let attempt = 0; attempt < 2; attempt++) {
    const side = typeof isSideSampleSafe === "function"
      ? collectUnsafeSideSegments(path, renderPoints, isSideSampleSafe)
      : {segments: new Set(), reasons: {}};
    const protectedResult = collectUnsafeProtectedSegments(source, renderPoints, protectedObjects, gates);
    const previousSize = segments.size;
    mergeSegmentSets(segments, side.segments);
    mergeSegmentSets(segments, protectedResult.segments);
    mergeReasonCounts(reasons, side.reasons);
    mergeReasonCounts(reasons, protectedResult.reasons);
    if (closed && segments.size > 0) segments.add(0);
    if (segments.size === 0) return {renderPoints, segments, reasons, fallbackReason: null};
    if (segments.size === previousSize) {
      const transformedFailure = validateTransformedArc(source, renderPoints, closed, gates);
      return {renderPoints, segments, reasons, fallbackReason: transformedFailure};
    }
    if (segments.size >= segmentCount) {
      return {
        renderPoints: source.map(copyPoint),
        segments,
        reasons,
        fallbackReason: primaryFallbackReason(reasons)
      };
    }
    renderPoints = buildMixedShoreArc(source, segments, settings);
  }

  const transformedFailure = validateTransformedArc(source, renderPoints, closed, gates);
  if (transformedFailure) {
    return {renderPoints: source.map(copyPoint), segments, reasons, fallbackReason: transformedFailure};
  }
  const remainingSide = typeof isSideSampleSafe === "function"
    ? collectUnsafeSideSegments(path, renderPoints, isSideSampleSafe)
    : {segments: new Set()};
  if (remainingSide.segments.size) {
    return {renderPoints: source.map(copyPoint), segments, reasons, fallbackReason: "land-water-side"};
  }
  const remainingProtected = collectUnsafeProtectedSegments(source, renderPoints, protectedObjects, gates);
  if (remainingProtected.segments.size) {
    mergeSegmentSets(segments, remainingProtected.segments);
    mergeReasonCounts(reasons, remainingProtected.reasons);
    if (closed && segments.size > 0) segments.add(0);
    if (segments.size >= segmentCount) {
      return {
        renderPoints: source.map(copyPoint),
        segments,
        reasons,
        fallbackReason: primaryFallbackReason(remainingProtected.reasons) || "protected-object"
      };
    }
    renderPoints = buildMixedShoreArc(source, segments, settings);
    const finalTransformFailure = validateTransformedArc(source, renderPoints, closed, gates);
    const finalSide = typeof isSideSampleSafe === "function"
      ? collectUnsafeSideSegments(path, renderPoints, isSideSampleSafe)
      : {segments: new Set()};
    const finalProtected = collectUnsafeProtectedSegments(source, renderPoints, protectedObjects, gates);
    if (finalTransformFailure || finalSide.segments.size || finalProtected.segments.size) {
      return {
        renderPoints: source.map(copyPoint),
        segments,
        reasons,
        fallbackReason: finalTransformFailure ||
          (finalSide.segments.size ? "land-water-side" : null) ||
          primaryFallbackReason(finalProtected.reasons) ||
          "protected-object"
      };
    }
  }
  return {renderPoints, segments, reasons, fallbackReason: null};
}

function buildMixedShoreArc(source, fallbackSegments, settings) {
  const output = [copyPoint(source[0])];
  const segmentCount = Math.max(0, source.length - 1);
  for (let segment = 0; segment < segmentCount;) {
    if (fallbackSegments.has(segment)) {
      appendPointIfDistinct(output, source[segment + 1]);
      segment++;
      continue;
    }
    const first = segment;
    while (segment < segmentCount && !fallbackSegments.has(segment)) segment++;
    const run = source.slice(first, segment + 1);
    const transformed = transformRecommendedShoreArc(run, settings);
    for (let index = 1; index < transformed.length; index++) appendPointIfDistinct(output, transformed[index]);
  }
  return isClosed(source) ? closeRing(output) : output;
}

function markLocalSegment(segments, index, segmentCount, closed, padding = 0) {
  if (!segmentCount) return;
  for (let offset = -padding; offset <= padding; offset++) {
    let candidate = index + offset;
    if (closed) candidate = (candidate % segmentCount + segmentCount) % segmentCount;
    if (candidate >= 0 && candidate < segmentCount) segments.add(candidate);
  }
}

function markObjectNearSourceSegments(segments, objectPoints, source, sourceIndex, distance, closed) {
  const segmentCount = Math.max(0, source.length - 1);
  for (let index = 0; index < objectPoints.length - 1; index++) {
    const bounds = segmentBounds(objectPoints[index], objectPoints[index + 1], distance);
    for (const sourceSegment of querySegmentIndexesByBounds(sourceIndex, bounds)) {
      const a = source[sourceSegment];
      const b = source[sourceSegment + 1];
      if (segmentSegmentDistance(objectPoints[index], objectPoints[index + 1], a, b) <= distance + EPSILON) {
        markLocalSegment(segments, sourceSegment, segmentCount, closed, 1);
      }
    }
  }
}

function mergeSegmentSets(target, source) {
  for (const value of source) target.add(value);
}

function mergeReasonCounts(target, source) {
  for (const [reason, count] of Object.entries(source || {})) {
    target[reason] = (target[reason] || 0) + count;
  }
}

function primaryFallbackReason(reasons) {
  return Object.keys(reasons || {})[0] || "local-safety";
}

function collectUnsafeSideSegments(path, renderPoints, isSideSampleSafe) {
  const segments = new Set();
  const reasons = {};
  const sourceIndex = createSegmentSpatialIndex(path?.points || [], SHORE_TOPOLOGY_ALGORITHM.maxDisplacement);
  const segmentCount = Math.max(0, (path?.points?.length || 0) - 1);
  const step = Math.max(1, Math.ceil(renderPoints.length / 3072));
  for (let index = 0; index < renderPoints.length; index += step) {
    const point = renderPoints[index];
    const projection = nearestPathProjection(point, path?.points || [], sourceIndex);
    const side = interpolateSide(path?.sideVectors, projection.sourceIndex, projection.t);
    if (projection.distance > EPSILON && !isSideSampleSafe(point, side)) {
      markLocalSegment(segments, projection.sourceIndex, segmentCount, isClosed(path?.points), 0);
      reasons["land-water-side"] = (reasons["land-water-side"] || 0) + 1;
    }
    const nextPoint = renderPoints[Math.min(index + step, renderPoints.length - 1)];
    if (!pointsNear(point, nextPoint)) {
      const middle = lerpPoint(point, nextPoint, 0.5);
      const middleProjection = nearestPathProjection(middle, path?.points || [], sourceIndex);
      const middleSide = interpolateSide(path?.sideVectors, middleProjection.sourceIndex, middleProjection.t);
      if (middleProjection.distance > EPSILON && !isSideSampleSafe(middle, middleSide)) {
        markLocalSegment(segments, middleProjection.sourceIndex, segmentCount, isClosed(path?.points), 0);
        reasons["land-water-side"] = (reasons["land-water-side"] || 0) + 1;
      }
    }
  }
  const lastPoint = renderPoints.at(-1);
  if (lastPoint && (renderPoints.length - 1) % step !== 0) {
    const projection = nearestPathProjection(lastPoint, path?.points || [], sourceIndex);
    const side = interpolateSide(path?.sideVectors, projection.sourceIndex, projection.t);
    if (projection.distance > EPSILON && !isSideSampleSafe(lastPoint, side)) {
      markLocalSegment(segments, projection.sourceIndex, segmentCount, isClosed(path?.points), 0);
      reasons["land-water-side"] = (reasons["land-water-side"] || 0) + 1;
    }
  }
  return {segments, reasons};
}

function collectUnsafeProtectedSegments(source, render, protectedObjects, gates) {
  const segments = new Set();
  const reasons = {};
  const segmentCount = Math.max(0, source.length - 1);
  const closed = isClosed(source);
  const safeObjects = protectedObjects || {};
  if (!(safeObjects.towns?.length || safeObjects.roads?.length || safeObjects.rivers?.length)) {
    return {segments, reasons};
  }
  const sourceBounds = polylineBounds(source, gates.protectedDistanceWorld);
  const sourceIndex = createSegmentSpatialIndex(source, gates.maxDisplacement);
  const renderIndex = createSegmentSpatialIndex(render, gates.maxDisplacement);
  const nearbyObjects = queryProtectedObjects(safeObjects, sourceBounds);
  for (const town of nearbyObjects.towns) {
    if (!pointInBounds(town, sourceBounds)) continue;
    const sourceProjection = nearestPathProjection(town, source, sourceIndex);
    if (sourceProjection.distance > gates.protectedDistanceWorld) continue;
    const renderProjection = nearestPathProjection(town, render, renderIndex);
    const clearance = Math.min(gates.protectedClearanceWorld, sourceProjection.distance * 0.5);
    const sourceSide = signedProjectionSide(town, sourceProjection);
    const renderSide = signedProjectionSide(town, renderProjection);
    if (renderProjection.distance + EPSILON < clearance ||
      (Math.abs(sourceSide) > EPSILON && Math.abs(renderSide) > EPSILON && sourceSide * renderSide < 0)) {
      markLocalSegment(segments, sourceProjection.sourceIndex, segmentCount, closed, 1);
      reasons["protected-town"] = (reasons["protected-town"] || 0) + 1;
    }
  }

  for (const road of nearbyObjects.roads) {
    const sourceRelation = inspectObjectShoreRelation(road, source, sourceIndex, gates.protectedDistanceWorld);
    if (!sourceRelation.near) continue;
    const renderRelation = inspectObjectShoreRelation(road, render, renderIndex, 0);
    if (renderRelation.crossings > sourceRelation.crossings) {
      markObjectNearSourceSegments(segments, road, source, sourceIndex, gates.protectedDistanceWorld, closed);
      reasons["protected-road"] = (reasons["protected-road"] || 0) + 1;
    }
  }

  for (const river of nearbyObjects.rivers) {
    const sourceRelation = inspectObjectShoreRelation(river, source, sourceIndex, gates.protectedDistanceWorld);
    if (!sourceRelation.near) continue;
    const renderRelation = inspectObjectShoreRelation(river, render, renderIndex, 0);
    const sourceCrossings = sourceRelation.crossings;
    const renderCrossings = renderRelation.crossings;
    if (renderCrossings > sourceCrossings) {
      markObjectNearSourceSegments(segments, river, source, sourceIndex, gates.protectedDistanceWorld, closed);
      reasons["protected-river"] = (reasons["protected-river"] || 0) + 1;
    }
    const mouth = river.at(-1);
    const sourceMouthDistance = nearestPathProjection(mouth, source, sourceIndex).distance;
    if (sourceMouthDistance <= gates.protectedDistanceWorld) {
      const renderMouthDistance = nearestPathProjection(mouth, render, renderIndex).distance;
      if (renderMouthDistance > Math.max(gates.mouthDistanceWorld, sourceMouthDistance + 3) ||
        (sourceCrossings > 0 && renderCrossings === 0)) {
        const mouthProjection = nearestPathProjection(mouth, source, sourceIndex);
        markLocalSegment(segments, mouthProjection.sourceIndex, segmentCount, closed, 1);
        reasons["protected-mouth"] = (reasons["protected-mouth"] || 0) + 1;
      }
    }
  }
  return {segments, reasons};
}

function buildProtectedObjectSpatialIndex(objects, cellSize = 32) {
  const buckets = new Map();
  for (const type of ["towns", "roads", "rivers"]) {
    for (let index = 0; index < (objects[type] || []).length; index++) {
      const item = objects[type][index];
      const bounds = type === "towns"
        ? {minX: item[0], minY: item[1], maxX: item[0], maxY: item[1]}
        : polylineBounds(item);
      forEachBoundsCell(bounds, cellSize, (column, row) => {
        const key = `${column}:${row}`;
        if (!buckets.has(key)) buckets.set(key, {towns: new Set(), roads: new Set(), rivers: new Set()});
        buckets.get(key)[type].add(index);
      });
    }
  }
  return {buckets, cellSize};
}

function queryProtectedObjects(objects, bounds) {
  if (!objects?.spatialIndex?.buckets) {
    return {
      towns: objects?.towns || [],
      roads: objects?.roads || [],
      rivers: objects?.rivers || []
    };
  }
  const indexes = {towns: new Set(), roads: new Set(), rivers: new Set()};
  forEachBoundsCell(bounds, objects.spatialIndex.cellSize, (column, row) => {
    const bucket = objects.spatialIndex.buckets.get(`${column}:${row}`);
    if (!bucket) return;
    for (const type of ["towns", "roads", "rivers"]) {
      for (const index of bucket[type]) indexes[type].add(index);
    }
  });
  return {
    towns: [...indexes.towns].map(index => objects.towns[index]),
    roads: [...indexes.roads].map(index => objects.roads[index]),
    rivers: [...indexes.rivers].map(index => objects.rivers[index])
  };
}

function inspectObjectShoreRelation(objectPoints, shorePoints, shoreIndex, distance) {
  let near = false;
  let crossings = 0;
  for (let objectIndex = 0; objectIndex < objectPoints.length - 1; objectIndex++) {
    const a = objectPoints[objectIndex];
    const b = objectPoints[objectIndex + 1];
    const bounds = segmentBounds(a, b, distance);
    for (const shoreSegmentIndex of querySegmentIndexesByBounds(shoreIndex, bounds)) {
      const c = shorePoints[shoreSegmentIndex];
      const d = shorePoints[shoreSegmentIndex + 1];
      if (!segmentBoundsIntersect(bounds, segmentBounds(c, d))) continue;
      const intersects = segmentsIntersect(a, b, c, d);
      if (intersects) crossings++;
      if (intersects || segmentSegmentDistance(a, b, c, d) <= distance + EPSILON) near = true;
    }
  }
  return {near, crossings};
}

function polylineBounds(points, padding = 0) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points || []) {
    minX = Math.min(minX, point[0]);
    minY = Math.min(minY, point[1]);
    maxX = Math.max(maxX, point[0]);
    maxY = Math.max(maxY, point[1]);
  }
  return {minX: minX - padding, minY: minY - padding, maxX: maxX + padding, maxY: maxY + padding};
}

function pointInBounds(point, bounds) {
  return point[0] >= bounds.minX && point[0] <= bounds.maxX &&
    point[1] >= bounds.minY && point[1] <= bounds.maxY;
}

function boundsIntersect(a, b) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

function forEachBoundsCell(bounds, cellSize, visit) {
  const firstColumn = Math.floor(bounds.minX / cellSize);
  const lastColumn = Math.floor(bounds.maxX / cellSize);
  const firstRow = Math.floor(bounds.minY / cellSize);
  const lastRow = Math.floor(bounds.maxY / cellSize);
  for (let column = firstColumn; column <= lastColumn; column++) {
    for (let row = firstRow; row <= lastRow; row++) visit(column, row);
  }
}

function visvalingam(points, threshold, closed) {
  if (closed) return simplifyClosed(points, threshold);
  return simplifyOpenVisvalingam(points, threshold);
}

function simplifyOpenVisvalingam(points, threshold) {
  if (points.length <= 2 || threshold <= 0) return points.map(copyPoint);
  const areaLimit = threshold * threshold;
  const nodes = points.map((point, index) => ({
    point: copyPoint(point),
    index,
    previous: index - 1,
    next: index + 1 < points.length ? index + 1 : -1,
    version: 0,
    removed: false
  }));
  const heap = [];
  for (let index = 1; index < nodes.length - 1; index++) pushVisvalingamCandidate(heap, nodes, index);

  while (heap.length) {
    const candidate = heapPop(heap);
    const node = nodes[candidate.index];
    if (node.removed || node.version !== candidate.version) continue;
    if (candidate.area >= areaLimit) break;
    node.removed = true;
    const previous = nodes[node.previous];
    const next = nodes[node.next];
    previous.next = node.next;
    next.previous = node.previous;
    if (previous.previous !== -1) pushVisvalingamCandidate(heap, nodes, previous.index);
    if (next.next !== -1) pushVisvalingamCandidate(heap, nodes, next.index);
  }

  const result = [];
  for (let index = 0; index !== -1; index = nodes[index].next) {
    if (!nodes[index].removed) result.push(copyPoint(nodes[index].point));
  }
  return result;
}

function pushVisvalingamCandidate(heap, nodes, index) {
  const node = nodes[index];
  if (!node || node.removed || node.previous === -1 || node.next === -1) return;
  node.version++;
  heapPush(heap, {
    area: triangleArea(nodes[node.previous].point, node.point, nodes[node.next].point),
    index: node.index,
    version: node.version
  });
}

function heapPush(heap, value) {
  heap.push(value);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (compareHeapEntry(heap[parent], value) <= 0) break;
    heap[index] = heap[parent];
    index = parent;
  }
  heap[index] = value;
}

function heapPop(heap) {
  const first = heap[0];
  const last = heap.pop();
  if (!heap.length) return first;
  let index = 0;
  while (true) {
    const left = index * 2 + 1;
    const right = left + 1;
    if (left >= heap.length) break;
    const child = right < heap.length && compareHeapEntry(heap[right], heap[left]) < 0 ? right : left;
    if (compareHeapEntry(last, heap[child]) <= 0) break;
    heap[index] = heap[child];
    index = child;
  }
  heap[index] = last;
  return first;
}

function compareHeapEntry(a, b) {
  return a.area - b.area || a.index - b.index;
}

function simplifyClosed(points, threshold) {
  const unique = stripClosure(points);
  if (unique.length <= 4) return closeRing(unique);
  const simplified = simplifyOpenVisvalingam([...unique, unique[0]], threshold);
  return simplified.length >= 4 ? closeRing(stripClosure(simplified)) : closeRing(unique.slice(0, 3));
}

function limitedChaikin(points, coefficient, closed) {
  const ratio = clamp(coefficient, 0, 0.25);
  if (ratio <= EPSILON || points.length < 3) return points.map(copyPoint);
  const unique = closed ? stripClosure(points) : points;
  const result = [];
  if (!closed) result.push(copyPoint(unique[0]));
  const edgeCount = closed ? unique.length : unique.length - 1;
  for (let index = 0; index < edgeCount; index++) {
    const a = unique[index];
    const b = unique[(index + 1) % unique.length];
    result.push(lerpPoint(a, b, ratio), lerpPoint(a, b, 1 - ratio));
  }
  if (!closed) result.push(copyPoint(unique.at(-1)));
  return closed ? closeRing(result) : result;
}

function limitDisplacement(points, source, maxDisplacement) {
  if (!Number.isFinite(maxDisplacement) || maxDisplacement < 0) return points.map(copyPoint);
  const spatialIndex = createSegmentSpatialIndex(source, Math.max(1, maxDisplacement));
  return points.map(point => {
    const projection = nearestPathProjection(point, source, spatialIndex);
    if (projection.distance <= maxDisplacement + EPSILON) return copyPoint(point);
    return lerpPoint(projection.point, point, maxDisplacement / projection.distance);
  });
}

function lockAnchors(points, source, closed) {
  if (closed) return closeRing(stripClosure(points));
  const result = points.map(copyPoint);
  result[0] = copyPoint(source[0]);
  result[result.length - 1] = copyPoint(source.at(-1));
  return result;
}

function hasHardSpike(points, threshold, closed) {
  const unique = closed ? stripClosure(points) : points;
  const start = closed ? 0 : 1;
  const end = closed ? unique.length : unique.length - 1;
  for (let index = start; index < end; index++) {
    const previous = unique[(index - 1 + unique.length) % unique.length];
    const current = unique[index];
    const next = unique[(index + 1) % unique.length];
    const aLength = worldDistance(previous, current);
    const bLength = worldDistance(next, current);
    if (aLength <= EPSILON || bLength <= EPSILON) return true;
    const cosine = ((previous[0] - current[0]) * (next[0] - current[0]) +
      (previous[1] - current[1]) * (next[1] - current[1])) / (aLength * bLength);
    if (cosine > threshold) return true;
  }
  return false;
}

function hasCrossingProjectionQuad(points, source) {
  const spatialIndex = createSegmentSpatialIndex(source, SHORE_TOPOLOGY_ALGORITHM.maxDisplacement);
  let previous = nearestPathProjection(points[0], source, spatialIndex);
  for (let index = 1; index < points.length; index++) {
    const current = nearestPathProjection(points[index], source, spatialIndex);
    if (!pointsNear(previous.point, current.point) &&
      segmentsIntersect(points[index - 1], previous.point, points[index], current.point)) {
      return true;
    }
    previous = current;
  }
  return false;
}

function nearestPathProjection(point, source, spatialIndex = null) {
  if (!isWorldPoint(point) || !source?.length) return {point, sourceIndex: 0, t: 0, distance: Infinity};
  if (source.length === 1) return {point: source[0], sourceIndex: 0, t: 0, distance: worldDistance(point, source[0])};
  if (spatialIndex?.buckets?.size) return nearestIndexedPathProjection(point, source, spatialIndex);
  return nearestPathProjectionFromSegments(point, source, null);
}

function nearestPathProjectionFromSegments(point, source, segmentIndexes) {
  let best = {point: source[0], sourceIndex: 0, t: 0, distance: Infinity, tangent: [0, 0]};
  const indexes = segmentIndexes || Array.from({length: source.length - 1}, (_, index) => index);
  for (const index of indexes) {
    const a = source[index];
    const b = source[index + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared <= EPSILON ? 0 : clamp(((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared, 0, 1);
    const projected = [a[0] + dx * t, a[1] + dy * t];
    const distance = worldDistance(point, projected);
    if (distance < best.distance) best = {point: projected, sourceIndex: index, t, distance, tangent: [dx, dy]};
  }
  return best;
}

function createSegmentSpatialIndex(line, cellSize = 7) {
  const size = Math.max(0.5, Number(cellSize) || 7);
  const buckets = new Map();
  let minColumn = Infinity;
  let maxColumn = -Infinity;
  let minRow = Infinity;
  let maxRow = -Infinity;
  for (let index = 0; index < (line?.length || 0) - 1; index++) {
    const a = line[index];
    const b = line[index + 1];
    const firstColumn = Math.floor(Math.min(a[0], b[0]) / size);
    const lastColumn = Math.floor(Math.max(a[0], b[0]) / size);
    const firstRow = Math.floor(Math.min(a[1], b[1]) / size);
    const lastRow = Math.floor(Math.max(a[1], b[1]) / size);
    minColumn = Math.min(minColumn, firstColumn);
    maxColumn = Math.max(maxColumn, lastColumn);
    minRow = Math.min(minRow, firstRow);
    maxRow = Math.max(maxRow, lastRow);
    for (let column = firstColumn; column <= lastColumn; column++) {
      for (let row = firstRow; row <= lastRow; row++) {
        const key = `${column}:${row}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(index);
      }
    }
  }
  return {buckets, cellSize: size, minColumn, maxColumn, minRow, maxRow};
}

function nearestIndexedPathProjection(point, source, index) {
  const column = Math.floor(point[0] / index.cellSize);
  const row = Math.floor(point[1] / index.cellSize);
  const maxRing = Math.max(
    Math.abs(column - index.minColumn),
    Math.abs(column - index.maxColumn),
    Math.abs(row - index.minRow),
    Math.abs(row - index.maxRow)
  );
  const visited = new Set();
  let best = null;
  for (let ring = 0; ring <= maxRing; ring++) {
    forEachRingCell(column, row, ring, (cellColumn, cellRow) => {
      for (const segmentIndex of index.buckets.get(`${cellColumn}:${cellRow}`) || []) {
        if (visited.has(segmentIndex)) continue;
        visited.add(segmentIndex);
        const candidate = projectPointToPathSegment(point, source, segmentIndex);
        if (!best || candidate.distance < best.distance) best = candidate;
      }
    });
    if (best && Math.max(0, ring - 1) * index.cellSize > best.distance) return best;
  }
  return best || nearestPathProjectionFromSegments(point, source, null);
}

function projectPointToPathSegment(point, source, index) {
  const a = source[index];
  const b = source[index + 1];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared <= EPSILON ? 0 : clamp(((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared, 0, 1);
  const projected = [a[0] + dx * t, a[1] + dy * t];
  return {
    point: projected,
    sourceIndex: index,
    t,
    distance: worldDistance(point, projected),
    tangent: [dx, dy]
  };
}

function querySegmentIndexesByBounds(index, bounds) {
  const result = new Set();
  if (!index?.buckets) return result;
  forEachBoundsCell(bounds, index.cellSize, (column, row) => {
    for (const segmentIndex of index.buckets.get(`${column}:${row}`) || []) result.add(segmentIndex);
  });
  return result;
}

function forEachRingCell(column, row, ring, visit) {
  if (ring === 0) {
    visit(column, row);
    return;
  }
  for (let x = column - ring; x <= column + ring; x++) {
    visit(x, row - ring);
    visit(x, row + ring);
  }
  for (let y = row - ring + 1; y < row + ring; y++) {
    visit(column - ring, y);
    visit(column + ring, y);
  }
}

function signedProjectionSide(point, projection) {
  return projection.tangent[0] * (point[1] - projection.point[1]) -
    projection.tangent[1] * (point[0] - projection.point[0]);
}

function interpolateSide(sideVectors, sourceIndex, t) {
  const a = sideVectors?.[sourceIndex] || {x: 0, y: 0};
  const b = sideVectors?.[Math.min(sourceIndex + 1, (sideVectors?.length || 1) - 1)] || a;
  const x = a.x * (1 - t) + b.x * t;
  const y = a.y * (1 - t) + b.y * t;
  const length = Math.hypot(x, y);
  return length > EPSILON ? {x: x / length, y: y / length} : {x: 0, y: 0};
}

function segmentBounds(a, b, padding = 0) {
  return {
    minX: Math.min(a[0], b[0]) - padding,
    minY: Math.min(a[1], b[1]) - padding,
    maxX: Math.max(a[0], b[0]) + padding,
    maxY: Math.max(a[1], b[1]) + padding
  };
}

function segmentBoundsIntersect(a, b) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

function segmentSegmentDistance(a, b, c, d) {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(
    pointSegmentDistance(a, c, d),
    pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b),
    pointSegmentDistance(d, a, b)
  );
}

function pointSegmentDistance(point, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared <= EPSILON ? 0 : clamp(((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared, 0, 1);
  return worldDistance(point, [a[0] + dx * t, a[1] + dy * t]);
}

function maximumSegmentLength(points) {
  let maximum = 0;
  for (let index = 0; index < points.length - 1; index++) maximum = Math.max(maximum, worldDistance(points[index], points[index + 1]));
  return maximum;
}

function polylineLength(points) {
  let length = 0;
  for (let index = 0; index < points.length - 1; index++) length += worldDistance(points[index], points[index + 1]);
  return length;
}

function sourceSegmentLengthExcluding(points, excluded) {
  let length = 0;
  for (let index = 0; index < points.length - 1; index++) {
    if (!excluded.has(index)) length += worldDistance(points[index], points[index + 1]);
  }
  return length;
}

function sourceSegmentLengthIncluding(points, included) {
  let length = 0;
  for (const index of included) {
    if (index >= 0 && index < points.length - 1) length += worldDistance(points[index], points[index + 1]);
  }
  return length;
}

function analyzeChangedSourceSegments(source, render, tolerance = 0.001) {
  const changed = new Set();
  let maxDisplacement = 0;
  const sourceIndex = createSegmentSpatialIndex(source, SHORE_TOPOLOGY_ALGORITHM.maxDisplacement);
  const renderIndex = createSegmentSpatialIndex(render, SHORE_TOPOLOGY_ALGORITHM.maxDisplacement);
  const renderStep = Math.max(1, Math.ceil(render.length / 8192));
  for (let index = 0; index < render.length - 1; index += renderStep) {
    const nextIndex = Math.min(index + renderStep, render.length - 1);
    const point = lerpPoint(render[index], render[nextIndex], 0.5);
    const projection = nearestPathProjection(point, source, sourceIndex);
    maxDisplacement = Math.max(maxDisplacement, projection.distance);
    if (projection.distance > tolerance) {
      const start = nearestPathProjection(render[index], source, sourceIndex).sourceIndex;
      const end = nearestPathProjection(render[nextIndex], source, sourceIndex).sourceIndex;
      for (let sourceSegment = Math.min(start, end); sourceSegment <= Math.max(start, end); sourceSegment++) {
        if (sourceSegment >= 0 && sourceSegment < source.length - 1) changed.add(sourceSegment);
      }
    }
  }
  const sourceStep = Math.max(1, Math.ceil(source.length / 8192));
  for (let index = 0; index < source.length; index += sourceStep) {
    const projection = nearestPathProjection(source[index], render, renderIndex);
    maxDisplacement = Math.max(maxDisplacement, projection.distance);
    if (projection.distance > tolerance) {
      if (index > 0) changed.add(index - 1);
      if (index < source.length - 1) changed.add(index);
    }
  }
  return {segments: changed, maxDisplacement};
}

function triangleArea(a, b, c) {
  return Math.abs((a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1])) / 2);
}

function normalizePoints(points, closed = isClosed(points)) {
  const copied = (points || []).filter(isWorldPoint).map(copyPoint);
  return closed ? closeRing(stripClosure(copied)) : copied;
}

function isClosed(points) {
  return points?.length > 2 && pointsNear(points[0], points.at(-1));
}

function stripClosure(points) {
  return isClosed(points) ? points.slice(0, -1).map(copyPoint) : points.map(copyPoint);
}

function closeRing(points) {
  const result = points.map(copyPoint);
  if (result.length && !pointsNear(result[0], result.at(-1))) result.push(copyPoint(result[0]));
  return result;
}

function copyPathMetadata(path) {
  return {
    sideVectors: Object.freeze((path?.sideVectors || []).map(side => Object.freeze({x: side?.x || 0, y: side?.y || 0}))),
    landCells: Object.freeze([...(path?.landCells || [])]),
    waterCells: Object.freeze([...(path?.waterCells || [])])
  };
}

function freezePoints(points) {
  return Object.freeze(points.map(point => Object.freeze(copyPoint(point))));
}

function freezeStats(stats) {
  return Object.freeze({
    ...stats,
    localFallbackReasons: Object.freeze({...stats.localFallbackReasons}),
    fallbackReasons: Object.freeze({...stats.fallbackReasons}),
    protectedObjects: Object.freeze({...stats.protectedObjects})
  });
}

function appendPointIfDistinct(points, point) {
  if (!points.length || !pointsNear(points.at(-1), point)) points.push(copyPoint(point));
}

function copyPoint(point) {
  return [point[0], point[1]];
}

function lerpPoint(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function nowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function roundMs(value) {
  return Math.round(value * 100) / 100;
}

function roundRatio(value) {
  return Math.round(value * 10000) / 10000;
}
