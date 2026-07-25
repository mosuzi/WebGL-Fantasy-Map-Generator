import {closestPointOnPolyline, isClosed, maxDistanceFromPolyline, pointDistance, samePoint} from "./algorithms.js";
import {arcUsageCounts, buildIndependentComparison, buildSharedSnapshot, composeRawRing, sharedArcRefs} from "./topology.js";
import {buildExactSurfaceCorrectionTriangles, triangulateSimplePolygon} from "./surface-correction.js";
import {
  analyzeEarcutSafeFailureStress,
  analyzeFallbackSpliceStress,
  analyzeFloat32DrawPacketPhaseMatrix,
  analyzeMultiRingXorStress,
  buildStressPacketWithBoundaryCovers,
  mutateDrawPacket
} from "./stress-analysis.js";

const EPSILON = 1e-6;
const STRESS_ANALYSIS_CACHE = new WeakMap();
export const HAUSDORFF_LIMITS = Object.freeze({coast: 6, state: 4, province: 3});
export const AREA_P95_LIMITS = Object.freeze({coast: 0.5, state: 0.5, province: 1});

export function validateFixture(fixture, algorithmId = "recommended", options = {}) {
  const definitionIssues = [];
  validateDefinition(fixture, definitionIssues);
  if (definitionIssues.length) return invalidDefinitionResult(fixture, algorithmId, definitionIssues);

  const snapshot = buildSharedSnapshot(fixture, algorithmId, options);
  const comparison = buildIndependentComparison(fixture, algorithmId, options);
  const issues = [];

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
    if (regionError.kind !== "coast" && regionError.hausdorff > limit + EPSILON) {
      issues.push(`${regionError.regionId} 双向 Hausdorff ${regionError.hausdorff.toFixed(3)} 超过 ${limit}`);
    }
  }
  if (algorithmId === "recommended") {
    for (const [kind, p95] of Object.entries(shapeMetrics.areaP95)) {
      const limit = AREA_P95_LIMITS[kind];
      if (kind !== "coast" && p95 > limit + EPSILON) issues.push(`${kind} 面积 P95 ${p95.toFixed(3)}% 超过 ${limit}%`);
    }
  }
  const shapeDiagnostics = buildShapeDiagnostics(shapeMetrics, algorithmId);
  const surfaceClassification = analyzeSurfaceClassification(fixture, snapshot);
  const bandTriangleGeometry = analyzeBandTriangleGeometry(fixture);
  const cellFanGeometry = analyzeCellFanGeometry(fixture);
  const vertexCollapseGeometry = analyzeVertexCollapseGeometry(fixture);
  const pixelParityGeometry = analyzePixelParityGeometry(fixture);
  const stressAnalysis = analyzeStressComparison(fixture);
  if (stressAnalysis && !stressAnalysis.passed) issues.push(`高风险计算门禁失败：${stressAnalysis.kind}`);
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
      shapeDiagnostics,
      shapePolicy: shapeMetrics.regions.every(item => item.kind === "coast") ? "notice" : "acceptance",
      caseConstraints,
      surfaceClassification,
      bandTriangleGeometry,
      cellFanGeometry,
      vertexCollapseGeometry,
      pixelParityGeometry,
      stressAnalysis
    },
    snapshot,
    comparison
  };
}

export function analyzeStressComparison(fixture) {
  const model = fixture?.stressComparison;
  if (!model) return null;
  if (STRESS_ANALYSIS_CACHE.has(fixture)) return STRESS_ANALYSIS_CACHE.get(fixture);
  const analysis = computeStressComparison(model);
  STRESS_ANALYSIS_CACHE.set(fixture, analysis);
  return analysis;
}

function computeStressComparison(model) {
  if (model.kind === "phase-matrix" || model.kind === "multi-ring") {
    const correctionTriangles = buildExactSurfaceCorrectionTriangles(model.sourceRings, model.renderRings);
    const packet = buildStressPacketWithBoundaryCovers(
      correctionTriangles,
      [...model.sourceRings, ...model.renderRings],
      model.renderRings
    );
    const final = model.kind === "multi-ring"
      ? analyzeMultiRingXorStress({...model, correctionTriangles, packet})
      : analyzeFloat32DrawPacketPhaseMatrix({...model, packet});
    const deleteCover = model.kind === "multi-ring"
      ? analyzeMultiRingXorStress({...model, correctionTriangles, packet: mutateDrawPacket(packet, "delete-cover")})
      : analyzeFloat32DrawPacketPhaseMatrix({...model, packet: mutateDrawPacket(packet, "delete-cover")});
    const wrongDirection = model.kind === "multi-ring"
      ? analyzeMultiRingXorStress({...model, correctionTriangles, packet: mutateDrawPacket(packet, "wrong-direction")})
      : analyzeFloat32DrawPacketPhaseMatrix({...model, packet: mutateDrawPacket(packet, "wrong-direction")});
    const endpointQuantization = model.kind === "multi-ring"
      ? analyzeMultiRingXorStress({...model, correctionTriangles, packet: mutateDrawPacket(packet, "endpoint-quantization")})
      : analyzeFloat32DrawPacketPhaseMatrix({...model, packet: mutateDrawPacket(packet, "endpoint-quantization")});
    const finalPassed = final.wrongSidePixels === 0
      && final.longestNeedlePixels === 0
      && final.conflictingPixels === 0
      && final.duplicatePixels === 0
      && final.seamPixels === 0
      && (model.kind !== "multi-ring" || final.holePreserved && final.channelPreserved && final.landConnected);
    return {
      kind: model.kind,
      final,
      destructive: {deleteCover, wrongDirection, endpointQuantization},
      correctionTriangleCount: correctionTriangles.length,
      passed: finalPassed
        && (deleteCover.wrongSidePixels > final.wrongSidePixels || deleteCover.seamPixels > final.seamPixels)
        && wrongDirection.wrongSidePixels > final.wrongSidePixels
        && endpointQuantization.wrongSidePixels > final.wrongSidePixels
    };
  }
  if (model.kind === "fallback-splice") {
    const final = analyzeFallbackSpliceStress(model);
    const broken = analyzeFallbackSpliceStress({
      ...structuredClone(model),
      rawFallbackSegment: [[6, 2], [12, 2], [16, 0]]
    });
    return {kind: model.kind, final, destructive: {broken}, passed: final.passed && !broken.passed};
  }
  if (model.kind === "earcut-safe-failure") {
    const final = analyzeEarcutSafeFailureStress(model);
    return {kind: model.kind, final, destructive: {legacyLeakCount: final.legacyLeakCount}, passed: final.passed};
  }
  return {kind: model.kind, passed: false, final: {}, destructive: {}};
}

function invalidDefinitionResult(fixture, algorithmId, issues) {
  return {
    ok: false,
    fixtureId: fixture?.id || "invalid-fixture",
    fixtureName: fixture?.name || "无效夹具",
    category: fixture?.category || "invalid",
    algorithmId,
    issues,
    metrics: {
      arcCount: 0,
      sharedArcCount: 0,
      nodeCount: 0,
      seamGap: 0,
      seamOverlap: 0,
      coverageOverlap: 0,
      regionCrossings: 0,
      independentError: 0,
      maxDisplacement: 0,
      selfIntersections: 0,
      validRings: false,
      reverseArcRefs: 0,
      renderModelSameSnapshot: false,
      areaP95: {},
      maxAreaError: 0,
      hausdorff: 0,
      hausdorffLimit: 0,
      regionShapeErrors: [],
      shapeDiagnostics: [],
      shapePolicy: "acceptance",
      caseConstraints: [],
      bandTriangleGeometry: null,
      cellFanGeometry: null,
      pixelParityGeometry: null
    },
    snapshot: null,
    comparison: {regions: [], usages: new Map(), seamError: 0, maximumDeviation: null, expectedFailure: false}
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
    errors.push({regionId: region.id, kind: regionKind(region, fixture), areaError, hausdorff});
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

function buildShapeDiagnostics(shapeMetrics, algorithmId) {
  const diagnostics = shapeMetrics.regions.map(region => {
    const limit = HAUSDORFF_LIMITS[region.kind];
    return {
      id: `hausdorff:${region.regionId}`,
      metric: "hausdorff",
      kind: region.kind,
      regionId: region.regionId,
      value: region.hausdorff,
      limit,
      exceeded: region.hausdorff > limit + EPSILON,
      policy: region.kind === "coast" ? "notice" : "acceptance"
    };
  });
  for (const [kind, value] of Object.entries(shapeMetrics.areaP95)) {
    const limit = AREA_P95_LIMITS[kind];
    diagnostics.push({
      id: `area-p95:${kind}`,
      metric: "area-p95",
      kind,
      value,
      limit,
      exceeded: value > limit + EPSILON,
      policy: kind === "coast" || algorithmId !== "recommended" ? "notice" : "acceptance"
    });
  }
  return diagnostics;
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

function regionKind(region, fixture) {
  const kinds = region.rings.flat().map(ref => fixture.arcs.find(arc => arc?.id === ref.arcId)?.kind).filter(Boolean);
  if (kinds.includes("province")) return "province";
  if (kinds.includes("state")) return "state";
  if (kinds.includes("coast")) return "coast";
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
  } else if (fixture.id === "single-cell-seam-spike") {
    const coast = arc("single-cell-coast");
    const raw = fixture.arcs.find(item => item?.id === "single-cell-coast");
    add("single-cell-ring", "单 cell 海岸闭环有效", coast?.closed && isClosed(coast.points), coast?.points.length || 0);
    if (snapshot.algorithmId === "recommended") {
      const released = !samePoint(coast.points[0], raw.points[0]);
      add("closed-seam-released", "闭环不再硬锁任意原始首点", released, released ? 0 : 1);
    }
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
    const raw = fixture.arcs.find(item => item?.id === "locked-mouth");
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
    const raw = fixture.arcs.find(item => item?.id === "stable-loop");
    const stable = loop.syntheticAnchor && isClosed(loop.points) && samePoint(loop.points[0], raw.points[0]);
    add("synthetic-anchor", "闭环 syntheticAnchor 稳定", stable, stable ? 0 : 1);
  } else if (fixture.id === "coast-fill-stroke-separation") {
    const comparison = analyzeSurfaceClassification(fixture, snapshot);
    if (snapshot.algorithmId === "recommended") {
      add(
        "legacy-surface-exposes-wedge",
        "旧策略必须暴露可定位楔形",
        comparison.legacyMismatchSamples >= fixture.surfaceComparison.minimumLegacyMismatchSamples,
        comparison.legacyMismatchSamples
      );
    }
    add(
      "shared-surface-classification",
      "XOR 修补填色与描边二维分类一致",
      comparison.sharedMismatchSamples === 0,
      comparison.sharedMismatchSamples
    );
  } else if (fixture.id === "coast-band-triangle-flip") {
    const geometry = analyzeBandTriangleGeometry(fixture);
    add(
      "legacy-band-opposite-winding",
      "旧四三角过渡带稳定复现翻面",
      geometry.legacyOppositeWindingCount > 0,
      geometry.legacyOppositeWindingCount
    );
    add(
      "exact-surface-retires-band",
      "最终 XOR 填色不再提交冗余过渡带",
      geometry.finalTriangleCount === 0,
      geometry.finalTriangleCount
    );
  } else if (fixture.id === "coast-xor-subpixel-needle") {
    const geometry = analyzeCellFanGeometry(fixture);
    add(
      "formal-cell-fan-leaks-reproduced",
      "正式地图两处凹单元的中心扇越界均被复刻",
      geometry.legacyLeakCount === 5 && geometry.cases.every(item => item.legacyLeakCount === item.expectedLegacyLeaks),
      geometry.legacyLeakCount
    );
    add(
      "earcut-boundary-contained",
      "边界 Earcut 三角面全部留在各自单元内",
      geometry.finalLeakCount === 0 && geometry.finalRasterLeakSamples === 0,
      geometry.finalRasterLeakSamples
    );
  } else if (fixture.id === "coast-voronoi-vertex-collapse") {
    const geometry = analyzeVertexCollapseGeometry(fixture);
    add(
      "stored-voronoi-edge-collapsed",
      "正式旧数据稳定复现零长度共享边",
      geometry.storedEdgeLength === 0,
      geometry.storedEdgeLength
    );
    add(
      "precise-voronoi-edge-restored",
      "vertices.c 精确回算恢复当前现场的连续水面",
      geometry.resolvedEdgeLength > 0.1 && geometry.resolvedEdgeLength < 0.2 && geometry.projectedCssLength >= 0.9,
      geometry.projectedCssLength
    );
  } else if (fixture.id === "coast-pixel-parity-residuals") {
    const geometry = analyzePixelParityGeometry(fixture);
    add(
      "formal-lake-needle-reproduced",
      "正式湖岸修补面边缘无覆盖时稳定复现陆色像素针",
      geometry.legacyUncoveredBoundaryEdges === 1
        && geometry.finalUncoveredBoundaryEdges === 0
        && geometry.finalBoundaryCoverWorld > 0,
      geometry.legacyUncoveredBoundaryEdges
    );
    add(
      "formal-coast-stroke-pixel-capped",
      "正式海岸描边在截图投影下收敛到 1.5 CSS px 内",
      geometry.finalProjectedStrokeCss <= geometry.maximumFinalCssWidth
        && geometry.finalProjectedStrokeCss < geometry.legacyProjectedStrokeCss,
      geometry.finalProjectedStrokeCss
    );
  }
  for (const constraint of evaluateProtectedObjectConstraints(fixture, snapshot)) constraints.push(constraint);
  return constraints;
}

export function analyzeBandTriangleGeometry(fixture) {
  const model = fixture?.bandTriangleComparison;
  if (!model) return null;
  const legacyTriangles = bandTriangles(model);
  const legacySignedAreas = legacyTriangles.map(points => signedArea(points));
  const nonZeroAreas = legacySignedAreas.filter(area => Math.abs(area) > EPSILON);
  const winding = Math.sign(nonZeroAreas[0] || 0);
  const legacyOppositeWindingCount = nonZeroAreas.filter(area => Math.sign(area) !== winding).length;
  return {
    legacyTriangles,
    legacySignedAreas,
    legacyOppositeWindingCount,
    legacyDegenerateCount: legacySignedAreas.length - nonZeroAreas.length,
    finalTriangleCount: model.finalTriangles?.length || 0
  };
}

export function analyzeCellFanGeometry(fixture) {
  const model = fixture?.cellFanComparison;
  if (!model) return null;
  const cases = (model.cases || []).map(item => {
    const legacyTriangles = item.points.map((point, index) => [
      item.center,
      point,
      item.points[(index + 1) % item.points.length]
    ]);
    const legacyLeakIndices = legacyTriangles
      .map((triangle, index) => pointInPolygon(triangleCentroid(triangle), item.points) ? -1 : index)
      .filter(index => index >= 0);
    const indices = triangulateSimplePolygon(item.points);
    const finalTriangles = [];
    for (let index = 0; index < indices.length; index += 3) {
      finalTriangles.push([indices[index], indices[index + 1], indices[index + 2]].map(vertex => item.points[vertex]));
    }
    const finalLeakIndices = finalTriangles
      .map((triangle, index) => pointInPolygon(triangleCentroid(triangle), item.points) ? -1 : index)
      .filter(index => index >= 0);
    const legacyRasterLeakSamples = countRasterLeakSamples(item.points, legacyTriangles);
    const finalRasterLeakSamples = countRasterLeakSamples(item.points, finalTriangles);
    return {
      ...item,
      legacyTriangles,
      legacyLeakIndices,
      legacyLeakCount: legacyLeakIndices.length,
      legacyRasterLeakSamples,
      finalTriangles,
      finalLeakIndices,
      finalLeakCount: finalLeakIndices.length,
      finalRasterLeakSamples
    };
  });
  return {
    source: model.source,
    cases,
    legacyLeakCount: cases.reduce((sum, item) => sum + item.legacyLeakCount, 0),
    finalLeakCount: cases.reduce((sum, item) => sum + item.finalLeakCount, 0),
    legacyRasterLeakSamples: cases.reduce((sum, item) => sum + item.legacyRasterLeakSamples, 0),
    finalRasterLeakSamples: cases.reduce((sum, item) => sum + item.finalRasterLeakSamples, 0),
    sides: [...new Set(cases.map(item => item.side))]
  };
}

export function analyzeVertexCollapseGeometry(fixture) {
  const model = fixture?.vertexCollapseComparison;
  if (!model) return null;
  const storedEdgeLength = pointDistance(model.storedEdge[0], model.storedEdge[1]);
  const resolvedEdgeLength = pointDistance(model.resolvedEdge[0], model.resolvedEdge[1]);
  const projectedCssLength = Math.hypot(
    (model.resolvedEdge[1][0] - model.resolvedEdge[0][0]) * model.projection.xCssPerWorld,
    (model.resolvedEdge[1][1] - model.resolvedEdge[0][1]) * model.projection.yCssPerWorld
  );
  return {
    source: model.source,
    storedEdge: model.storedEdge,
    resolvedEdge: model.resolvedEdge,
    cells: model.cells,
    storedEdgeLength,
    resolvedEdgeLength,
    projectedCssLength
  };
}

export function analyzePixelParityGeometry(fixture) {
  const model = fixture?.pixelParityComparison;
  if (!model) return null;
  const [start, end] = model.coastStroke.segment;
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);
  const normal = length > EPSILON ? [-dy / length, dx / length] : [0, 0];
  const projectedWorldNormal = Math.hypot(
    normal[0] * model.projection.xCssPerWorld,
    normal[1] * model.projection.yCssPerWorld
  );
  return {
    source: model.source,
    projection: model.projection,
    lakeNeedle: model.lakeNeedle,
    coastStroke: model.coastStroke,
    legacyUncoveredBoundaryEdges: model.lakeNeedle.legacyBoundaryCoverWorld > 0 ? 0 : 1,
    finalUncoveredBoundaryEdges: model.lakeNeedle.finalBoundaryCoverWorld > 0 ? 0 : 1,
    finalBoundaryCoverWorld: model.lakeNeedle.finalBoundaryCoverWorld,
    legacyProjectedStrokeCss: model.coastStroke.legacyWidthWorld * projectedWorldNormal,
    finalProjectedStrokeCss: model.coastStroke.finalWidthWorld * projectedWorldNormal,
    maximumFinalCssWidth: model.coastStroke.maximumFinalCssWidth
  };
}

function triangleCentroid(points) {
  return [
    (points[0][0] + points[1][0] + points[2][0]) / 3,
    (points[0][1] + points[1][1] + points[2][1]) / 3
  ];
}

function countRasterLeakSamples(boundary, triangles, step = 0.1) {
  const xs = boundary.map(point => point[0]);
  const ys = boundary.map(point => point[1]);
  let leaks = 0;
  for (let y = Math.min(...ys) + step / 2; y < Math.max(...ys); y += step) {
    for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step) {
      const sample = [x, y];
      if (pointInPolygon(sample, boundary)) continue;
      if (triangles.some(triangle => pointInTriangle(sample, triangle, false))) leaks++;
    }
  }
  return leaks;
}

function bandTriangles(segment) {
  return [
    [segment.centerA, segment.waterA, segment.waterB],
    [segment.centerA, segment.waterB, segment.centerB],
    [segment.centerA, segment.centerB, segment.landB],
    [segment.centerA, segment.landB, segment.landA]
  ];
}

export function analyzeSurfaceClassification(fixture, snapshot) {
  if (!fixture?.surfaceComparison || !snapshot?.regions?.length) return null;
  const settings = fixture.surfaceComparison;
  const rawRings = fixture.regions[0].rings.map(ring => composeRawRing(ring, fixture));
  const processedRings = snapshot.regions[0].rings;
  const processedBoundary = processedRings.flat();
  const bounds = settings.bounds;
  const step = Math.max(0.5, Number(settings.sampleStep) || 2);
  const repairRadius = Math.max(0, Number(settings.legacyRepairRadius) || 0);
  const legacyMismatchPoints = [];
  const sharedMismatchPoints = [];
  const correctionTriangles = settings.correctionMode === "exact-polygon-xor"
    ? buildExactSurfaceCorrectionTriangles(rawRings, processedRings)
    : [];
  let correctionMultiCoveredSamples = 0;
  let correctionConflictingSamples = 0;
  let xorSamples = 0;
  let totalSamples = 0;

  for (let y = bounds.minY + step / 2; y < bounds.maxY; y += step) {
    for (let x = bounds.minX + step / 2; x < bounds.maxX; x += step) {
      const point = [x, y];
      const rawInside = pointInRegion(point, rawRings);
      const processedInside = pointInRegion(point, processedRings);
      if (rawInside !== processedInside) xorSamples++;
      const nearProcessedBoundary = pointDistance(point, closestPointOnPolyline(point, processedBoundary)) <= repairRadius;
      const legacyInside = nearProcessedBoundary ? processedInside : rawInside;
      if (legacyInside !== processedInside) legacyMismatchPoints.push(point);
      totalSamples++;
    }
  }

  const verificationStep = step / 2;
  for (let y = bounds.minY + verificationStep / 2; y < bounds.maxY; y += verificationStep) {
    for (let x = bounds.minX + verificationStep / 2; x < bounds.maxX; x += verificationStep) {
      const point = [x, y];
      const rawInside = pointInRegion(point, rawRings);
      const processedInside = pointInRegion(point, processedRings);
      if (rawInside === processedInside) continue;
      const correctionHits = correctionTriangles.filter(triangle => pointInTriangle(point, triangle.points));
      const strictHits = correctionHits.filter(triangle => pointInTriangle(point, triangle.points, false));
      const correctionSides = new Set(strictHits.map(triangle => triangle.side));
      let correctedInside = rawInside;
      for (const triangle of correctionHits) correctedInside = triangle.side === "land";
      if (correctedInside !== processedInside) sharedMismatchPoints.push(point);
      if (strictHits.length > 1) correctionMultiCoveredSamples++;
      if (correctionSides.size > 1) correctionConflictingSamples++;
    }
  }

  return {
    sampleStep: step,
    sampleArea: step * step,
    totalSamples,
    xorSamples,
    xorArea: xorSamples * step * step,
    legacyRepairRadius: repairRadius,
    legacyMismatchSamples: legacyMismatchPoints.length,
    legacyMismatchArea: legacyMismatchPoints.length * step * step,
    legacyMismatchPoints,
    sharedMismatchSamples: sharedMismatchPoints.length,
    sharedMismatchArea: sharedMismatchPoints.length * step * step,
    sharedMismatchPoints,
    correctionVerificationStep: verificationStep,
    correctionTriangleCount: correctionTriangles.length,
    correctionDegenerateTriangles: correctionTriangles.filter(triangle => Math.abs(triangleArea(triangle.points)) <= EPSILON).length,
    correctionMultiCoveredSamples,
    correctionConflictingSamples
  };
}

function pointInTriangle(point, triangle, includeBoundary = true) {
  const cross = (a, b) => (a[0] - point[0]) * (b[1] - point[1]) - (a[1] - point[1]) * (b[0] - point[0]);
  const values = [
    cross(triangle[0], triangle[1]),
    cross(triangle[1], triangle[2]),
    cross(triangle[2], triangle[0])
  ];
  const hasNegative = values.some(value => value < -EPSILON);
  const hasPositive = values.some(value => value > EPSILON);
  if (hasNegative && hasPositive) return false;
  return includeBoundary || values.every(value => Math.abs(value) > EPSILON);
}

function triangleArea(triangle) {
  return (
    triangle[0][0] * (triangle[1][1] - triangle[2][1])
    + triangle[1][0] * (triangle[2][1] - triangle[0][1])
    + triangle[2][0] * (triangle[0][1] - triangle[1][1])
  ) / 2;
}

export function evaluateProtectedObjectConstraints(fixture, snapshot) {
  const constraints = [];
  const protectedObjects = fixture.protectedObjects || {};
  const rawRegions = new Map(fixture.regions.map(region => [region.id, region.rings.map(ring => composeRawRing(ring, fixture))]));
  const transformedRegions = new Map(snapshot.regions.map(region => [region.id, region.rings]));
  const add = (id, label, pass, value) => constraints.push({id, label, pass: Boolean(pass), value});

  for (const town of protectedObjects.towns || []) {
    const rawRings = rawRegions.get(town.regionId);
    const transformedRings = transformedRegions.get(town.regionId);
    const pass = pointInRegion(town.point, rawRings) && pointInRegion(town.point, transformedRings);
    add(`town:${town.id}:land-region`, `城镇“${town.name}”保持在同一陆区`, pass, pass ? 1 : 0);
  }

  for (const road of protectedObjects.roads || []) {
    const rawRings = rawRegions.get(road.regionId);
    const transformedRings = transformedRegions.get(road.regionId);
    const pass = polylineStrictlyInsideRegion(road.points, rawRings) && polylineStrictlyInsideRegion(road.points, transformedRings);
    add(`road:${road.id}:land`, `道路“${road.name}”全线留在陆地且不穿岸`, pass, pass ? 1 : 0);
  }

  for (const river of protectedObjects.rivers || []) {
    const rawRings = rawRegions.get(river.regionId);
    const transformedRings = transformedRegions.get(river.regionId);
    const rawArc = fixture.arcs.find(item => item?.id === river.mouth.arcId);
    const transformedArc = snapshot.arcs.get(river.mouth.arcId);
    const rawMouth = river.mouth.endpoint === "start" ? rawArc.points[0] : rawArc.points.at(-1);
    const transformedMouth = river.mouth.endpoint === "start" ? transformedArc.points[0] : transformedArc.points.at(-1);
    const actualMouth = river.points.at(-1);
    const mouthLocked = samePoint(actualMouth, rawMouth) && samePoint(actualMouth, transformedMouth);
    add(`river:${river.id}:mouth-lock`, `河流“${river.name}”河口严格锚定海岸端点`, mouthLocked, mouthLocked ? 0 : pointDistance(actualMouth, transformedMouth));
    if (mouthLocked) {
      const landSide = riverStaysLandSideUntilMouth(river.points, rawRings, rawMouth)
        && riverStaysLandSideUntilMouth(river.points, transformedRings, transformedMouth);
      add(`river:${river.id}:land-side`, `河流“${river.name}”仅在末端入海`, landSide, landSide ? 1 : 0);
    }
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
  if (!fixture || typeof fixture !== "object") {
    issues.push("夹具定义不是对象");
    return;
  }
  if (!fixture.id || !fixture.name || !fixture.category) issues.push("夹具缺少 id、名称或案例分类");
  if (!Array.isArray(fixture.arcs) || !Array.isArray(fixture.regions)) {
    issues.push("夹具缺少 arcs 或 regions 数组");
    return;
  }
  const arcIds = new Set(fixture.arcs.map(arc => arc?.id));
  if (arcIds.size !== fixture.arcs.length || arcIds.has(undefined) || arcIds.has("")) issues.push("夹具含缺失或重复 arc id");
  for (const boundaryArc of fixture.arcs) {
    if (!Array.isArray(boundaryArc?.points) || boundaryArc.points.length < 2) {
      issues.push(`arc ${boundaryArc?.id || "?"} 坐标不足`);
      continue;
    }
    validateFinitePoints(boundaryArc.points, `arc ${boundaryArc.id}`, issues);
  }

  const regionIds = new Set(fixture.regions.map(region => region?.id));
  if (regionIds.size !== fixture.regions.length || regionIds.has(undefined) || regionIds.has("")) issues.push("夹具含缺失或重复 region id");
  for (const region of fixture.regions) {
    if (!Array.isArray(region?.rings) || !region.rings.length) {
      issues.push(`区域 ${region?.id || "?"} 缺少 rings`);
      continue;
    }
    for (const ring of region.rings) {
      if (!Array.isArray(ring) || !ring.length) {
        issues.push(`区域 ${region.id} 含空 ring`);
        continue;
      }
      for (const arcRef of ring) {
        if (!arcIds.has(arcRef?.arcId)) issues.push(`区域 ${region.id} 引用了不存在的 arc ${arcRef?.arcId || "?"}`);
      }
    }
  }

  const protectedObjects = fixture.protectedObjects;
  if (protectedObjects === undefined) return;
  if (!protectedObjects || typeof protectedObjects !== "object") {
    issues.push("protectedObjects 必须是对象");
    return;
  }
  for (const type of ["towns", "roads", "rivers"]) {
    if (protectedObjects[type] !== undefined && !Array.isArray(protectedObjects[type])) issues.push(`protectedObjects.${type} 必须是数组`);
  }
  const towns = Array.isArray(protectedObjects.towns) ? protectedObjects.towns : [];
  const roads = Array.isArray(protectedObjects.roads) ? protectedObjects.roads : [];
  const rivers = Array.isArray(protectedObjects.rivers) ? protectedObjects.rivers : [];
  for (const town of towns) {
    validateProtectedIdentity(town, "城镇", regionIds, issues);
    validateFinitePoints([town?.point], `城镇 ${town?.id || "?"}`, issues);
  }
  for (const road of roads) {
    validateProtectedIdentity(road, "道路", regionIds, issues);
    if (!Array.isArray(road?.points) || road.points.length < 2) issues.push(`道路 ${road?.id || "?"} 坐标不足`);
    else validateFinitePoints(road.points, `道路 ${road.id}`, issues);
  }
  for (const river of rivers) {
    validateProtectedIdentity(river, "河流", regionIds, issues);
    if (!Array.isArray(river?.points) || river.points.length < 2) issues.push(`河流 ${river?.id || "?"} 坐标不足`);
    else validateFinitePoints(river.points, `河流 ${river.id}`, issues);
    const mouthArc = fixture.arcs.find(item => item?.id === river?.mouth?.arcId);
    if (!mouthArc) issues.push(`河流 ${river?.id || "?"} 河口引用不存在的 arc ${river?.mouth?.arcId || "?"}`);
    else if (mouthArc.kind !== "coast") issues.push(`河流 ${river.id} 河口 arc ${mouthArc.id} 不是海岸`);
    if (!river?.mouth || !["start", "end"].includes(river.mouth.endpoint)) issues.push(`河流 ${river?.id || "?"} 河口端点必须是 start 或 end`);
    const region = fixture.regions.find(item => item.id === river?.regionId);
    if (region && mouthArc && !region.rings.flat().some(arcRef => arcRef.arcId === mouthArc.id)) {
      issues.push(`河流 ${river.id} 河口 arc ${mouthArc.id} 不属于陆区 ${region.id}`);
    }
  }
}

function validateProtectedIdentity(object, label, regionIds, issues) {
  if (!object?.id || !object?.name) issues.push(`${label}缺少 id 或名称`);
  if (!regionIds.has(object?.regionId)) issues.push(`${label} ${object?.id || "?"} 引用了不存在的 region ${object?.regionId || "?"}`);
}

function validateFinitePoints(points, label, issues) {
  for (const [index, point] of points.entries()) {
    if (!Array.isArray(point) || point.length < 2 || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
      issues.push(`${label} 第 ${index + 1} 个坐标不是有限二维点`);
    }
  }
}

function validateEndpointLocks(fixture, snapshot, issues) {
  const protectedClosedArcs = new Set(
    (fixture.protectedObjects?.rivers || []).map(river => river?.mouth?.arcId).filter(Boolean)
  );
  for (const rawArc of fixture.arcs) {
    const transformed = snapshot.arcs.get(rawArc.id).points;
    if (rawArc.closed) {
      if (!isClosed(transformed)) issues.push(`闭环 arc ${rawArc.id} 未闭合`);
      if ((rawArc.syntheticAnchor || protectedClosedArcs.has(rawArc.id)) && !samePoint(rawArc.points[0], transformed[0])) {
        issues.push(`闭环 arc ${rawArc.id} 受保护锚点漂移`);
      }
    } else {
      if (!samePoint(rawArc.points[0], transformed[0])) issues.push(`arc ${rawArc.id} 起点漂移`);
      if (!samePoint(rawArc.points.at(-1), transformed.at(-1))) issues.push(`arc ${rawArc.id} 终点漂移`);
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

function polylineStrictlyInsideRegion(points, rings) {
  if (!points.every(point => pointInRegion(point, rings))) return false;
  for (let index = 0; index < points.length - 1; index++) {
    if (segmentTouchesRegionBoundary(points[index], points[index + 1], rings)) return false;
  }
  return true;
}

function riverStaysLandSideUntilMouth(points, rings, mouth) {
  if (!samePoint(points.at(-1), mouth)) return false;
  if (!points.slice(0, -1).every(point => pointInRegion(point, rings))) return false;
  for (let index = 0; index < points.length - 2; index++) {
    if (segmentTouchesRegionBoundary(points[index], points[index + 1], rings)) return false;
  }
  const beforeMouth = points.at(-2);
  for (const ring of rings) for (let index = 0; index < ring.length - 1; index++) {
    const a = ring[index];
    const b = ring[index + 1];
    if (!segmentsIntersectOrTouch(beforeMouth, mouth, a, b)) continue;
    const boundaryEndsAtMouth = samePoint(a, mouth) || samePoint(b, mouth);
    if (!boundaryEndsAtMouth || segmentsProperlyIntersect(beforeMouth, mouth, a, b) || collinearOverlapLength(beforeMouth, mouth, a, b) > EPSILON) return false;
  }
  return midpointSamplesInside(beforeMouth, mouth, rings);
}

function midpointSamplesInside(start, end, rings) {
  const steps = Math.max(2, Math.ceil(pointDistance(start, end)));
  for (let step = 0; step < steps; step++) {
    const ratio = step / steps;
    const point = [start[0] + (end[0] - start[0]) * ratio, start[1] + (end[1] - start[1]) * ratio];
    if (!pointInRegion(point, rings)) return false;
  }
  return true;
}

function segmentTouchesRegionBoundary(start, end, rings) {
  for (const ring of rings) for (let index = 0; index < ring.length - 1; index++) {
    if (segmentsIntersectOrTouch(start, end, ring[index], ring[index + 1])) return true;
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

function segmentsIntersectOrTouch(a, b, c, d) {
  if (segmentsProperlyIntersect(a, b, c, d)) return true;
  return pointOnSegment(a, c, d) || pointOnSegment(b, c, d) || pointOnSegment(c, a, b) || pointOnSegment(d, a, b);
}

function pointOnSegment(point, start, end) {
  if (Math.abs(cross(start, end, point)) > EPSILON) return false;
  return point[0] >= Math.min(start[0], end[0]) - EPSILON
    && point[0] <= Math.max(start[0], end[0]) + EPSILON
    && point[1] >= Math.min(start[1], end[1]) - EPSILON
    && point[1] <= Math.max(start[1], end[1]) + EPSILON;
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
