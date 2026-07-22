import {maxDistanceFromPolyline, pointDistance, samePoint, transformArc} from "./algorithms.js";

let snapshotSerial = 0;

export function buildSharedSnapshot(fixture, algorithmId, options = {}) {
  const snapshotId = `${fixture.id}:${algorithmId}:${++snapshotSerial}`;
  const mutableArcs = new Map();
  for (const rawArc of fixture.arcs) {
    const points = transformArc(rawArc.points, algorithmId, options, rawArc.closed);
    mutableArcs.set(rawArc.id, deepFreeze({
      id: rawArc.id,
      kind: rawArc.kind || "boundary",
      closed: Boolean(rawArc.closed),
      syntheticAnchor: Boolean(rawArc.syntheticAnchor),
      rawPoints: rawArc.points.map(copyPoint),
      points,
      displacement: maxDistanceFromPolyline(points, rawArc.points)
    }));
  }
  const arcs = readonlyMap(mutableArcs);

  const regions = fixture.regions.map(region => deepFreeze({
    ...region,
    rings: region.rings.map(ring => composeRing(ring, arcs))
  }));

  const snapshot = {id: snapshotId, fixtureId: fixture.id, algorithmId, arcs, regions};
  snapshot.renderModel = Object.freeze({
    snapshotId,
    fillSnapshot: snapshot,
    strokeSnapshot: snapshot
  });
  return deepFreeze(snapshot);
}

export function buildIndependentComparison(fixture, algorithmId, options = {}) {
  const regions = fixture.regions.map(region => ({
    ...region,
    rings: region.rings.map(ring => transformArc(composeRawRing(ring, fixture), algorithmId, options, true))
  }));
  const usages = collectIndependentSharedUsages(fixture, regions);
  const maximumDeviation = measureIndependentSeamErrorDetails(usages);
  return {
    fixtureId: fixture.id,
    regions,
    usages,
    seamError: maximumDeviation?.distance || 0,
    maximumDeviation,
    expectedFailure: algorithmId !== "raw" && [...arcUsageCounts(fixture).values()].some(count => count > 1)
  };
}

function collectIndependentSharedUsages(fixture, regions) {
  const usages = new Map();
  const counts = arcUsageCounts(fixture);
  fixture.regions.forEach((region, regionIndex) => region.rings.forEach((ring, ringIndex) => ring.forEach(arcRef => {
    if (counts.get(arcRef.arcId) <= 1) return;
    const rawArc = fixture.arcs.find(item => item.id === arcRef.arcId);
    const orientedArc = arcRef.reversed ? rawArc.points.toReversed() : rawArc.points;
    const records = usages.get(arcRef.arcId) || [];
    records.push({
      regionId: region.id,
      reversed: arcRef.reversed,
      points: projectArcOntoRing(orientedArc, regions[regionIndex].rings[ringIndex])
    });
    usages.set(arcRef.arcId, records);
  })));
  return usages;
}

function composeRing(refs, arcs) {
  return joinParts(refs.map(arcRef => {
    const arc = arcs.get(arcRef.arcId);
    if (!arc) throw new Error(`ArcRef 指向不存在的弧线：${arcRef.arcId}`);
    return arcRef.reversed ? arc.points.toReversed().map(copyPoint) : arc.points;
  }));
}

export function composeRawRing(refs, fixture) {
  return joinParts(refs.map(arcRef => {
    const arc = fixture.arcs.find(item => item.id === arcRef.arcId);
    if (!arc) throw new Error(`ArcRef 指向不存在的弧线：${arcRef.arcId}`);
    return arcRef.reversed ? arc.points.toReversed().map(copyPoint) : arc.points;
  }));
}

function joinParts(parts) {
  const ring = [];
  for (const points of parts) {
    if (!ring.length) {
      ring.push(...points.map(copyPoint));
      continue;
    }
    if (samePoint(ring.at(-1), points[0])) ring.push(...points.slice(1).map(copyPoint));
    else ring.push(...points.map(copyPoint));
  }
  if (ring.length && !samePoint(ring[0], ring.at(-1))) ring.push(copyPoint(ring[0]));
  return ring;
}

export function arcUsageCounts(fixture) {
  const counts = new Map(fixture.arcs.map(arc => [arc.id, 0]));
  for (const region of fixture.regions) {
    for (const ring of region.rings) {
      for (const arcRef of ring) counts.set(arcRef.arcId, (counts.get(arcRef.arcId) || 0) + 1);
    }
  }
  return counts;
}

export function sharedArcRefs(fixture) {
  const counts = arcUsageCounts(fixture);
  return fixture.regions.flatMap(region => region.rings.flatMap(ring => ring
    .filter(arcRef => counts.get(arcRef.arcId) > 1)
    .map(arcRef => ({regionId: region.id, ...arcRef}))));
}

export function measureIndependentSeamError(usages) {
  return measureIndependentSeamErrorDetails(usages)?.distance || 0;
}

export function measureIndependentSeamErrorDetails(usages) {
  let maximum = null;
  for (const [arcId, records] of usages) {
    if (records.length < 2) continue;
    const baselineRecord = records[0];
    const baseline = normalizedUsage(baselineRecord);
    for (let recordIndex = 1; recordIndex < records.length; recordIndex++) {
      const record = records[recordIndex];
      const candidate = normalizedUsage(record);
      for (let index = 0; index <= 24; index++) {
        const ratio = index / 24;
        const firstPoint = samplePolyline(baseline, ratio);
        const secondPoint = samplePolyline(candidate, ratio);
        const distance = pointDistance(firstPoint, secondPoint);
        if (maximum && distance <= maximum.distance) continue;
        maximum = {
          arcId,
          distance,
          ratio,
          first: {
            usageIndex: 0,
            regionId: baselineRecord.regionId,
            reversed: baselineRecord.reversed,
            point: firstPoint
          },
          second: {
            usageIndex: recordIndex,
            regionId: record.regionId,
            reversed: record.reversed,
            point: secondPoint
          }
        };
      }
    }
  }
  return maximum;
}

function projectArcOntoRing(rawArc, ring) {
  const start = nearestRingIndex(rawArc[0], ring);
  const end = nearestRingIndex(rawArc.at(-1), ring);
  if (start === end) return ring.map(copyPoint);
  const forward = sliceRing(ring, start, end);
  const backward = sliceRing(ring, end, start).toReversed();
  return polylineLength(forward) <= polylineLength(backward) ? forward : backward;
}

function nearestRingIndex(point, ring) {
  let best = 0;
  let distance = Infinity;
  for (let index = 0; index < ring.length - 1; index++) {
    const candidate = pointDistance(point, ring[index]);
    if (candidate < distance) {
      best = index;
      distance = candidate;
    }
  }
  return best;
}

function sliceRing(ring, start, end) {
  const unique = ring.slice(0, -1);
  const result = [copyPoint(unique[start])];
  let cursor = start;
  while (cursor !== end && result.length <= unique.length + 1) {
    cursor = (cursor + 1) % unique.length;
    result.push(copyPoint(unique[cursor]));
  }
  return result;
}

function polylineLength(points) {
  let total = 0;
  for (let index = 0; index < points.length - 1; index++) total += pointDistance(points[index], points[index + 1]);
  return total;
}

function normalizedUsage(record) {
  return record.reversed ? record.points.toReversed() : record.points;
}

export function samplePolyline(points, ratio) {
  if (points.length <= 1) return copyPoint(points[0] || [0, 0]);
  const lengths = [];
  let total = 0;
  for (let index = 0; index < points.length - 1; index++) {
    const length = pointDistance(points[index], points[index + 1]);
    lengths.push(length);
    total += length;
  }
  let target = total * ratio;
  for (let index = 0; index < lengths.length; index++) {
    if (target <= lengths[index] || index === lengths.length - 1) {
      const local = lengths[index] ? target / lengths[index] : 0;
      return [
        points[index][0] + (points[index + 1][0] - points[index][0]) * local,
        points[index][1] + (points[index + 1][1] - points[index][1]) * local
      ];
    }
    target -= lengths[index];
  }
  return copyPoint(points.at(-1));
}

function copyPoint(point) {
  return [point[0], point[1]];
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  if (value instanceof Map) {
    for (const [key, item] of value) {
      deepFreeze(key);
      deepFreeze(item);
    }
    return value;
  }
  for (const item of Object.values(value)) deepFreeze(item);
  return value;
}

function readonlyMap(source) {
  const facade = {
    get size() { return source.size; },
    get(key) { return source.get(key); },
    has(key) { return source.has(key); },
    keys() { return source.keys(); },
    values() { return source.values(); },
    entries() { return source.entries(); },
    forEach(callback, thisArg) { return source.forEach((value, key) => callback.call(thisArg, value, key, facade)); },
    [Symbol.iterator]() { return source[Symbol.iterator](); }
  };
  return Object.freeze(facade);
}
