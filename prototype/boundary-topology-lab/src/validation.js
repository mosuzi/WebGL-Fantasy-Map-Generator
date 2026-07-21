import {closestPointOnPolyline, isClosed, maxDistanceFromPolyline, pointDistance, samePoint} from "./algorithms.js";
import {arcUsageCounts, buildIndependentComparison, buildSharedSnapshot, composeRawRing, sharedArcRefs} from "./topology.js";

const EPSILON = 1e-6;
export const HAUSDORFF_LIMITS = Object.freeze({coast: 6, state: 4, province: 3});

export function validateFixture(fixture, algorithmId = "recommended", options = {}) {
  const snapshot = buildSharedSnapshot(fixture, algorithmId, options);
  const comparison = buildIndependentComparison(fixture, algorithmId, options);
  const issues = [];

  validateDefinition(fixture, issues);
  validateEndpointLocks(fixture, snapshot, issues);
  validateRings(snapshot, issues);
  validateRawRings(fixture, issues);
  validateArcRefs(fixture, snapshot, issues);
  const seamMetrics = validateSharedSeams(fixture, snapshot, issues);
  const regionCrossings = countRegionCrossings(snapshot);
  const coverageOverlap = countCoverageOverlaps(snapshot);
  if (coverageOverlap) issues.push(`区域间出现 ${coverageOverlap} 处 coverage overlap`);

  const maxDisplacement = Math.max(0, ...[...snapshot.arcs.values()].map(arc => maxDistanceFromPolyline(arc.points, arc.rawPoints)));
  const maxAllowed = Number(options.maxDisplacement ?? 7);
  if (maxDisplacement > maxAllowed + EPSILON) issues.push(`最大位移 ${maxDisplacement.toFixed(3)} 超过限制 ${maxAllowed}`);

  const renderModelSameSnapshot = snapshot.renderModel.fillSnapshot === snapshot.renderModel.strokeSnapshot
    && snapshot.renderModel.fillSnapshot === snapshot;
  if (!renderModelSameSnapshot) issues.push("填充与描边没有引用同一拓扑快照");

  const usageCounts = arcUsageCounts(fixture);
  const sharedCount = [...usageCounts.values()].filter(count => count > 1).length;
  const selfIntersections = countSnapshotSelfIntersections(snapshot);
  if (selfIntersections) issues.push(`区域环出现 ${selfIntersections} 处自交`);
  const shapeMetrics = measureRegionShapeError(fixture, snapshot);
  for (const regionError of shapeMetrics.regions) {
    const limit = HAUSDORFF_LIMITS[regionError.kind];
    if (regionError.hausdorff > limit + EPSILON) issues.push(`${regionError.regionId} 双向 Hausdorff ${regionError.hausdorff.toFixed(3)} 超过 ${limit}`);
  }
  if (algorithmId === "recommended") {
    for (const [kind, p95] of Object.entries(shapeMetrics.areaP95)) {
      const limit = kind === "province" ? 1 : 0.5;
      if (p95 > limit + EPSILON) issues.push(`${kind} 面积 P95 ${p95.toFixed(3)}% 超过 ${limit}%`);
    }
  }
  const caseConstraints = evaluateCaseConstraints(fixture, snapshot);
  for (const constraint of caseConstraints.filter(item => !item.pass)) issues.push(`案例约束失败：${constraint.label}`);

  return {
    ok: issues.length === 0,
    fixtureId: fixture.id,
    fixtureName: fixture.name,
    category: fixture.category,
    algorithmId,
    issues,
    metrics: {
      arcCount: snapshot.arcs.size,
      sharedArcCount: sharedCount,
      nodeCount: uniqueNodeCount(snapshot),
      seamGap: seamMetrics.gap,
      seamOverlap: coverageOverlap,
      coverageOverlap,
      regionCrossings,
      independentError: comparison.seamError,
      maxDisplacement,
      selfIntersections,
      validRings: issues.filter(issue => issue.includes("区域环")).length === 0,
      reverseArcRefs: sharedArcRefs(fixture).filter(arcRef => arcRef.reversed).length,
      renderModelSameSnapshot,
      areaP95: shapeMetrics.areaP95,
      maxAreaError: shapeMetrics.maxAreaError,
      hausdorff: shapeMetrics.hausdorff,
      hausdorffLimit: Math.min(...shapeMetrics.regions.map(item => HAUSDORFF_LIMITS[item.kind])),
      regionShapeErrors: shapeMetrics.regions,
      caseConstraints
    },
    snapshot,
    comparison
  };
}

export function validateSharedSeams(fixture, snapshot, issues = []) {
  const groups = new Map();
  const flatUsages = [];
  for (const region of fixture.regions) for (const ring of region.rings) for (const arcRef of ring) {
    const usage = {regionId: region.id, ...arcRef};
    const list = groups.get(arcRef.arcId) || [];
    list.push(usage);
    flatUsages.push(usage);
    groups.set(arcRef.arcId, list);
  }
  for (let first = 0; first < flatUsages.length; first++) for (let second = first + 1; second < flatUsages.length; second++) {
    const a = flatUsages[first];
    const b = flatUsages[second];
    if (a.regionId === b.regionId || a.arcId === b.arcId) continue;
    const aArc = snapshot.arcs.get(a.arcId);
    const bArc = snapshot.arcs.get(b.arcId);
    if (aArc && bArc && bidirectionalHausdorff(aArc.points, bArc.points) <= EPSILON) {
      issues.push(`同一几何共享边被拆为不同 arcId：${a.arcId}/${b.arcId}`);
    }
  }
  let gap = 0;
  for (const region of fixture.regions) for (const ring of region.rings) {
    for (let index = 0; index < ring.length; index++) {
      const currentRef = ring[index];
      const nextRef = ring[(index + 1) % ring.length];
      const currentArc = snapshot.arcs.get(currentRef.arcId);
      const nextArc = snapshot.arcs.get(nextRef.arcId);
      if (!currentArc || !nextArc) continue;
      const currentEnd = currentRef.reversed ? currentArc.points[0] : currentArc.points.at(-1);
      const nextStart = nextRef.reversed ? nextArc.points.at(-1) : nextArc.points[0];
      gap = Math.max(gap, pointDistance(currentEnd, nextStart));
    }
  }
  for (const [arcId, usages] of groups) {
    if (usages.length < 2) continue;
    if (usages.length !== 2) issues.push(`共享 arc ${arcId} 被 ${usages.length} 个区域引用`);
    const first = usages[0];
    const second = usages[1];
    if (first.arcId !== second.arcId) issues.push(`共享边两侧 arcId 不一致：${arcId}`);
    if (first.reversed === second.reversed) issues.push(`共享 arc ${arcId} 两侧方向没有相反`);
    const arc = snapshot.arcs.get(arcId);
    const firstPoints = first.reversed ? arc.points.toReversed() : arc.points;
    const secondPoints = second.reversed ? arc.points.toReversed() : arc.points;
    const reversedSecond = secondPoints.toReversed();
    if (firstPoints.length !== reversedSecond.length) {
      gap = Infinity;
      issues.push(`共享 arc ${arcId} 两侧坐标数量不一致`);
      continue;
    }
    for (let index = 0; index < firstPoints.length; index++) gap = Math.max(gap, pointDistance(firstPoints[index], reversedSecond[index]));
  }
  if (gap > EPSILON) issues.push(`共享边界坐标反向误差 ${gap.toFixed(6)}`);
  return {gap};
}

export function measureRegionShapeError(fixture, snapshot) {
  const errors = [];
  for (const region of fixture.regions) {
    const transformed = snapshot.regions.find(item => item.id === region.id);
    const rawRings = region.rings.map(ring => composeRawRing(ring, fixture));
    const rawArea = regionArea(rawRings);
    const transformedArea = regionArea(transformed.rings);
    const areaError = rawArea > EPSILON ? Math.abs(transformedArea - rawArea) / rawArea * 100 : 0;
    const hausdorff = Math.max(0, ...rawRings.map((ring, index) => bidirectionalHausdorff(ring, transformed.rings[index])));
    errors.push({regionId: region.id, kind: regionKind(region), areaError, hausdorff});
  }
  const grouped = errors.reduce((result, item) => {
    (result[item.kind] ||= []).push(item);
    return result;
  }, {});
  return {
    regions: errors,
    areaP95: Object.fromEntries(Object.entries(grouped).map(([kind, items]) => [kind, percentile(items.map(item => item.areaError), 0.95)])),
    maxAreaError: Math.max(0, ...errors.map(item => item.areaError)),
    hausdorff: Math.max(0, ...errors.map(item => item.hausdorff))
  };
}

export function bidirectionalHausdorff(first, second) {
  return Math.max(directedHausdorff(first, second), directedHausdorff(second, first));
}

function directedHausdorff(points, line) {
  return Math.max(0, ...points.map(point => pointDistance(point, closestPointOnPolyline(point, line))));
}

export function regionArea(rings) {
  if (!rings.length) return 0;
  return Math.max(0, Math.abs(signedArea(rings[0])) - rings.slice(1).reduce((sum, ring) => sum + Math.abs(signedArea(ring)), 0));
}

function regionKind(region) {
  const ids = region.rings.flat().map(ref => ref.arcId);
  if (ids.some(id => id.includes("province"))) return "province";
  if (ids.some(id => id.includes("state") || id.includes("border") || id === "shared")) return "state";
  return "coast";
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)];
}

export function evaluateCaseConstraints(fixture, snapshot) {
  const constraints = [];
  const add = (id, label, pass, value) => constraints.push({id, label, pass: Boolean(pass), value});
  const arc = id => snapshot.arcs.get(id);
  if (fixture.id === "single-island") {
    add("island-ring", "单岛闭环有效", arc("coast")?.closed && isClosed(arc("coast").points), arc("coast")?.points.length || 0);
  } else if (fixture.id === "island-with-hole") {
    const [outer, hole] = snapshot.regions[0].rings;
    const directionOpposite = Math.sign(signedArea(outer)) !== Math.sign(signedArea(hole));
    const contained = pointInPolygon(hole[0], outer);
    add("hole-direction", "洞环方向与外环相反", directionOpposite, directionOpposite ? 1 : 0);
    add("hole-contained", "洞环保持在外环内部", contained, contained ? 1 : 0);
  } else if (fixture.id === "narrow-strait") {
    const clearance = minimumPolylineDistance(arc("west-coast").points, arc("east-coast").points);
    add("strait-open", "狭窄海峡仍开放", clearance >= 6, clearance);
  } else if (fixture.id === "lake-sea-connection") {
    const mouth = arc("locked-mouth");
    const opening = pointDistance(mouth.points[0], mouth.points.at(-1));
    const raw = fixture.arcs.find(item => item.id === "locked-mouth");
    const locked = samePoint(mouth.points[0], raw.points[0]) && samePoint(mouth.points.at(-1), raw.points.at(-1));
    const mouthChord = [mouth.points[0], mouth.points.at(-1)];
    const depth = Math.max(0, ...mouth.points.map(point => pointDistance(point, closestPointOnPolyline(point, mouthChord))));
    const length = polylineLength(mouth.points);
    const requirements = fixture.requirements;
    const basinPoints = mouth.points.filter(point => pointDistance(point, closestPointOnPolyline(point, mouthChord)) >= requirements.basinDepth).length;
    add("mouth-open", "湖海口仍开放", opening >= 20, opening);
    add("mouth-locked", "湖海口两端锁定", locked, locked ? 0 : 1);
    add("channel-depth", "湖海通道深度保留", depth >= requirements.minimumChannelDepth, depth);
    add("channel-length", "湖海通道长度保留", length >= requirements.minimumChannelLength, length);
    add("lake-basin", "湖盆分类仍可识别", basinPoints >= requirements.minimumBasinPoints, basinPoints);
  } else if (fixture.id === "tri-state-junction") {
    const nodes = [arc("north-border").points.at(-1), arc("southwest-border").points.at(-1), arc("southeast-border").points[0]];
    const spread = Math.max(pointDistance(nodes[0], nodes[1]), pointDistance(nodes[0], nodes[2]), pointDistance(nodes[1], nodes[2]));
    add("tri-node", "三国边界节点共点", spread <= EPSILON, spread);
  } else if (fixture.id === "cross-state-province") {
    const stateNode = arc("state-north").points.at(-1);
    const spread = Math.max(pointDistance(stateNode, arc("state-south").points[0]), pointDistance(stateNode, arc("province-west").points.at(-1)), pointDistance(stateNode, arc("province-east").points[0]));
    add("province-state-lock", "跨国省界锁定国界节点", spread <= EPSILON, spread);
  } else if (fixture.id === "map-boundary") {
    const framePoints = [...snapshot.arcs.values()].filter(item => item.kind === "frame").flatMap(item => item.points);
    const drift = Math.max(0, ...framePoints.map(point => distanceToFrame(point, 320, 220)));
    add("frame-lock", "地图边界点不漂移", drift <= EPSILON, drift);
  } else if (fixture.id === "closed-loop") {
    const loop = arc("stable-loop");
    const raw = fixture.arcs.find(item => item.id === "stable-loop");
    const stable = loop.syntheticAnchor && isClosed(loop.points) && samePoint(loop.points[0], raw.points[0]);
    add("synthetic-anchor", "闭环 syntheticAnchor 稳定", stable, stable ? 0 : 1);
  }
  return constraints;
}

export function runAllFixtures(fixtures, algorithmId = "recommended", options = {}) {
  const results = fixtures.map(fixture => validateFixture(fixture, algorithmId, options));
  return {
    ok: results.every(result => result.ok),
    results,
    summary: {
      fixtures: results.length,
      passed: results.filter(result => result.ok).length,
      failed: results.filter(result => !result.ok).length,
      sharedArcs: results.reduce((sum, result) => sum + result.metrics.sharedArcCount, 0),
      selfIntersections: results.reduce((sum, result) => sum + result.metrics.selfIntersections, 0),
      maxIndependentError: Math.max(0, ...results.map(result => result.metrics.independentError))
    }
  };
}

function validateDefinition(fixture, issues) {
  if (!fixture.id || !fixture.name || !fixture.category) issues.push("夹具缺少 id、名称或案例分类");
  const arcIds = new Set(fixture.arcs.map(arc => arc.id));
  if (arcIds.size !== fixture.arcs.length) issues.push("夹具含重复 arc id");
  for (const region of fixture.regions) {
    for (const ring of region.rings) {
      for (const arcRef of ring) {
        if (!arcIds.has(arcRef.arcId)) issues.push(`区域 ${region.id} 引用了不存在的 arc ${arcRef.arcId}`);
      }
    }
  }
}

function validateEndpointLocks(fixture, snapshot, issues) {
  for (const rawArc of fixture.arcs) {
    const transformed = snapshot.arcs.get(rawArc.id).points;
    if (!samePoint(rawArc.points[0], transformed[0])) issues.push(`arc ${rawArc.id} 起点漂移`);
    if (rawArc.closed) {
      if (!isClosed(transformed)) issues.push(`闭环 arc ${rawArc.id} 未闭合`);
    } else if (!samePoint(rawArc.points.at(-1), transformed.at(-1))) {
      issues.push(`arc ${rawArc.id} 终点漂移`);
    }
  }
}

function validateRings(snapshot, issues) {
  for (const region of snapshot.regions) {
    for (const [index, ring] of region.rings.entries()) {
      if (ring.length < 4) issues.push(`区域环 ${region.id}/${index} 点数不足`);
      if (!isClosed(ring)) issues.push(`区域环 ${region.id}/${index} 未闭合`);
      if (Math.abs(signedArea(ring)) < EPSILON) issues.push(`区域环 ${region.id}/${index} 面积为零`);
      const topology = inspectRingGeometry(ring);
      if (topology.zeroLengthEdges) issues.push(`区域环 ${region.id}/${index} 存在零长边`);
      if (topology.selfTouches) issues.push(`区域环 ${region.id}/${index} 存在非相邻顶点自接触`);
      if (topology.backtracks) issues.push(`区域环 ${region.id}/${index} 存在共线折返`);
      if (topology.collinearOverlaps) issues.push(`区域环 ${region.id}/${index} 存在共线重叠`);
    }
  }
}

function validateRawRings(fixture, issues) {
  for (const region of fixture.regions) for (const [index, refs] of region.rings.entries()) {
    const topology = inspectRingGeometry(composeRawRing(refs, fixture));
    if (topology.zeroLengthEdges) issues.push(`原始区域环 ${region.id}/${index} 存在零长边`);
    if (topology.selfTouches) issues.push(`原始区域环 ${region.id}/${index} 存在非相邻顶点自接触`);
    if (topology.backtracks) issues.push(`原始区域环 ${region.id}/${index} 存在共线折返`);
    if (topology.collinearOverlaps) issues.push(`原始区域环 ${region.id}/${index} 存在共线重叠`);
  }
}

function validateArcRefs(fixture, snapshot, issues) {
  for (const region of fixture.regions) {
    for (const ring of region.rings) {
      for (const arcRef of ring) {
        const arc = snapshot.arcs.get(arcRef.arcId);
        if (!arc) continue;
        const referenced = arcRef.reversed ? arc.points.toReversed() : arc.points;
        if (!referenced.length) issues.push(`ArcRef ${arcRef.arcId} 没有坐标`);
      }
    }
  }
}

export function countSnapshotSelfIntersections(snapshot) {
  let count = 0;
  for (const region of snapshot.regions) {
    for (const ring of region.rings) count += countSelfIntersections(ring);
  }
  return count;
}

export function countSelfIntersections(ring) {
  let count = 0;
  const lastSegment = ring.length - 2;
  for (let first = 0; first < ring.length - 1; first++) {
    for (let second = first + 1; second < ring.length - 1; second++) {
      if (Math.abs(first - second) <= 1) continue;
      if (first === 0 && second === lastSegment) continue;
      if (segmentsProperlyIntersect(ring[first], ring[first + 1], ring[second], ring[second + 1])) count++;
    }
  }
  return count;
}

export function inspectRingGeometry(ring) {
  const unique = isClosed(ring) ? ring.slice(0, -1) : ring;
  let zeroLengthEdges = 0;
  let selfTouches = 0;
  let backtracks = 0;
  let collinearOverlaps = 0;
  for (let index = 0; index < ring.length - 1; index++) if (samePoint(ring[index], ring[index + 1])) zeroLengthEdges++;
  for (let first = 0; first < unique.length; first++) for (let second = first + 1; second < unique.length; second++) {
    const adjacent = second === first + 1 || (first === 0 && second === unique.length - 1);
    if (!adjacent && samePoint(unique[first], unique[second])) selfTouches++;
  }
  for (let index = 0; index < unique.length; index++) {
    const previous = unique[(index - 1 + unique.length) % unique.length];
    const current = unique[index];
    const next = unique[(index + 1) % unique.length];
    const firstVector = [current[0] - previous[0], current[1] - previous[1]];
    const secondVector = [next[0] - current[0], next[1] - current[1]];
    if (Math.abs(firstVector[0] * secondVector[1] - firstVector[1] * secondVector[0]) <= EPSILON
      && firstVector[0] * secondVector[0] + firstVector[1] * secondVector[1] < -EPSILON) backtracks++;
  }
  const segmentCount = ring.length - 1;
  for (let first = 0; first < segmentCount; first++) for (let second = first + 1; second < segmentCount; second++) {
    const adjacent = second === first + 1 || (first === 0 && second === segmentCount - 1);
    if (!adjacent && collinearOverlapLength(ring[first], ring[first + 1], ring[second], ring[second + 1]) > EPSILON) collinearOverlaps++;
  }
  return {zeroLengthEdges, selfTouches, backtracks, collinearOverlaps};
}

function collinearOverlapLength(a, b, c, d) {
  if (Math.abs(cross(a, b, c)) > EPSILON || Math.abs(cross(a, b, d)) > EPSILON) return 0;
  const useX = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]);
  const first = [useX ? a[0] : a[1], useX ? b[0] : b[1]].sort((x, y) => x - y);
  const second = [useX ? c[0] : c[1], useX ? d[0] : d[1]].sort((x, y) => x - y);
  return Math.max(0, Math.min(first[1], second[1]) - Math.max(first[0], second[0]));
}

export function countRegionCrossings(snapshot) {
  let count = 0;
  for (let first = 0; first < snapshot.regions.length; first++) {
    for (let second = first + 1; second < snapshot.regions.length; second++) {
      for (const firstRing of snapshot.regions[first].rings) for (const secondRing of snapshot.regions[second].rings) {
        for (let a = 0; a < firstRing.length - 1; a++) for (let b = 0; b < secondRing.length - 1; b++) {
          if (segmentsProperlyIntersect(firstRing[a], firstRing[a + 1], secondRing[b], secondRing[b + 1])) count++;
        }
      }
    }
  }
  return count;
}

export function countCoverageOverlaps(snapshot) {
  let overlaps = 0;
  for (let first = 0; first < snapshot.regions.length; first++) for (let second = first + 1; second < snapshot.regions.length; second++) {
    const a = snapshot.regions[first];
    const b = snapshot.regions[second];
    const crosses = regionsProperlyCross(a, b);
    const aProbe = polygonCentroid(a.rings[0]);
    const bProbe = polygonCentroid(b.rings[0]);
    const contained = pointInRegion(aProbe, b.rings) || pointInRegion(bProbe, a.rings);
    if (crosses || contained) overlaps++;
  }
  return overlaps;
}

function regionsProperlyCross(first, second) {
  for (const firstRing of first.rings) for (const secondRing of second.rings) {
    for (let a = 0; a < firstRing.length - 1; a++) for (let b = 0; b < secondRing.length - 1; b++) {
      if (segmentsProperlyIntersect(firstRing[a], firstRing[a + 1], secondRing[b], secondRing[b + 1])) return true;
    }
  }
  return false;
}

function pointInRegion(point, rings) {
  if (!rings.length || pointOnRing(point, rings[0]) || !pointInPolygon(point, rings[0])) return false;
  for (const hole of rings.slice(1)) if (pointOnRing(point, hole) || pointInPolygon(point, hole)) return false;
  return true;
}

function pointOnRing(point, ring) {
  return pointDistance(point, closestPointOnPolyline(point, ring)) <= EPSILON;
}

function polygonCentroid(ring) {
  let areaFactor = 0;
  let x = 0;
  let y = 0;
  for (let index = 0; index < ring.length - 1; index++) {
    const factor = ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
    areaFactor += factor;
    x += (ring[index][0] + ring[index + 1][0]) * factor;
    y += (ring[index][1] + ring[index + 1][1]) * factor;
  }
  if (Math.abs(areaFactor) <= EPSILON) return ring[0];
  return [x / (3 * areaFactor), y / (3 * areaFactor)];
}

function pointInPolygon(point, ring) {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const a = ring[current];
    const b = ring[previous];
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / ((b[1] - a[1]) || EPSILON) + a[0]) inside = !inside;
  }
  return inside;
}

function minimumPolylineDistance(first, second) {
  return Math.min(
    ...first.map(point => pointDistance(point, closestPointOnPolyline(point, second))),
    ...second.map(point => pointDistance(point, closestPointOnPolyline(point, first)))
  );
}

function distanceToFrame(point, width, height) {
  return Math.min(Math.abs(point[0]), Math.abs(point[0] - width), Math.abs(point[1]), Math.abs(point[1] - height));
}

function polylineLength(points) {
  let length = 0;
  for (let index = 0; index < points.length - 1; index++) length += pointDistance(points[index], points[index + 1]);
  return length;
}

function segmentsProperlyIntersect(a, b, c, d) {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  return abC * abD < -EPSILON && cdA * cdB < -EPSILON;
}

function cross(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function signedArea(ring) {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index++) {
    area += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
  }
  return area / 2;
}

function uniqueNodeCount(snapshot) {
  const keys = new Set();
  for (const arc of snapshot.arcs.values()) {
    keys.add(pointKey(arc.points[0]));
    keys.add(pointKey(arc.points.at(-1)));
  }
  return keys.size;
}

function pointKey(point) {
  return `${point[0].toFixed(6)},${point[1].toFixed(6)}`;
}
