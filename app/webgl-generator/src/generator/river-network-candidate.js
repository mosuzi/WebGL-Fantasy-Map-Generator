import {sampleCubicBezierPath} from "../geometry/cubic-path.js";

export function analyzeParentGraph(snapshot) {
  const rivers = normalizeRivers(snapshot);
  const byId = new Map(rivers.map(river => [river.id, river]));
  const missingParents = [];
  const selfParents = [];
  const childrenByParent = new Map(rivers.map(river => [river.id, []]));

  for (const river of rivers) {
    if (!river.parent) continue;
    if (river.parent === river.id) {
      selfParents.push(river.id);
      continue;
    }
    if (!byId.has(river.parent)) {
      missingParents.push({riverId: river.id, parentId: river.parent});
      continue;
    }
    childrenByParent.get(river.parent).push(river.id);
  }
  for (const children of childrenByParent.values()) children.sort((left, right) => left - right);

  const cycles = findCycles(rivers, byId);
  const topologicalOrder = topologicalOrderOf(rivers, childrenByParent, selfParents, missingParents);
  const rejected = selfParents.length > 0 || missingParents.length > 0 || cycles.length > 0;
  return {
    ok: !rejected,
    rivers,
    topologicalOrder,
    cycles,
    missingParents,
    selfParents,
    visitedCount: topologicalOrder.length,
    metrics: {
      rivers: rivers.length,
      visited: topologicalOrder.length,
      missingParents: missingParents.length,
      selfParents: selfParents.length,
      cycles: cycles.length,
      rejected
    }
  };
}

export function runDAGCandidate(snapshot) {
  const graph = analyzeParentGraph(snapshot);
  return {
    status: graph.ok ? "accepted" : "rejected",
    accepted: graph.ok,
    rejection: graph.ok ? null : {
      reason: "parent-graph-rejected",
      cycles: graph.cycles,
      missingParents: graph.missingParents,
      selfParents: graph.selfParents
    },
    metrics: graph.metrics,
    topologicalOrder: graph.topologicalOrder,
    candidateRivers: graph.ok
      ? graph.topologicalOrder.map(id => cloneRiver(graph.rivers.find(river => river.id === id)))
      : null
  };
}

export function analyzeConfluences(snapshot, options = {}) {
  const settings = {snapTolerance: 12, maxSnapTolerance: 24, maxSegmentLength: 2, ...options};
  const graph = analyzeParentGraph(snapshot);
  const rivers = graph.rivers;
  const byId = new Map(rivers.map(river => [river.id, river]));
  const issues = [];
  const anchors = [];
  const relations = [];
  let protectedOutlets = 0;
  let changedPoints = 0;
  let maxDistance = 0;
  let maxTolerance = settings.snapTolerance;
  let sampledPoints = 0;
  let samplingMs = 0;
  for (const child of rivers) {
    if (!child.parent) continue;
    const parent = byId.get(child.parent);
    const childEnd = child.points.at(-1);
    if (!parent || !childEnd || parent.points.length < 2) {
      relations.push({childId: child.id, parentId: child.parent, status: "rejected", reason: "relation-geometry-missing"});
      continue;
    }
    const attachment = resolveHydrologyAttachment(snapshot, child, parent, settings);
    const tolerance = localConfluenceTolerance(snapshot, child, parent, attachment, settings);
    const linkDistance = distance(childEnd, attachment.point);
    maxDistance = Math.max(maxDistance, linkDistance);
    maxTolerance = Math.max(maxTolerance, tolerance.total);
    if (isProtectedOutlet(child.outletKind)) {
      protectedOutlets += 1;
      const relation = relationEvidence(child, parent, attachment, tolerance, {status: "protected", reason: "protected-outlet", linkDistance});
      relations.push(relation);
      issues.push({id: "protected-outlet", severity: "info", riverIds: [child.id, parent.id], distance: linkDistance, message: "保留湖泊、河口或边界出口，不执行几何吸附。"});
      continue;
    }
    if (attachment.hydrologyDistance > tolerance.total || linkDistance > tolerance.total) {
      const reason = attachment.hydrologyDistance > tolerance.total ? "confluence-unattached" : "confluence-display-gap";
      const relation = relationEvidence(child, parent, attachment, tolerance, {status: "rejected", reason, linkDistance});
      relations.push(relation);
      issues.push({id: reason, severity: "warn", riverIds: [child.id, parent.id], from: [...childEnd], to: [...attachment.point], distance: linkDistance, tolerance: tolerance.total, message: reason === "confluence-unattached" ? "该支流的水文端点超出局部汇流容差，仅拒绝此关系并保留原几何。" : "该支流的显示末端超出局部汇流容差，即使存在共享水文 cell 也拒绝生成长桥。"});
      continue;
    }
    const sampleStart = now();
    let curve = buildConfluenceCurve(snapshot, child, parent, attachment, tolerance, settings);
    samplingMs += now() - sampleStart;
    sampledPoints += curve.sampledPoints.length;
    let safety = validateConfluenceCurve(snapshot, rivers, child, parent, curve, tolerance);
    if (!safety.accepted && attachment.sharedTerminalCell) {
      const fallbackStart = now();
      const fallbacks = buildConfluenceFallbackCurves(child, attachment, tolerance, settings);
      samplingMs += now() - fallbackStart;
      for (const fallback of fallbacks) {
        sampledPoints += fallback.sampledPoints.length;
        const fallbackSafety = validateConfluenceCurve(snapshot, rivers, child, parent, fallback, tolerance);
        if (!fallbackSafety.accepted) continue;
        curve = fallback;
        safety = fallbackSafety;
        break;
      }
    }
    if (!safety.accepted) {
      const relation = relationEvidence(child, parent, attachment, tolerance, {status: "rejected", reason: safety.reason, linkDistance, curve, safety});
      relations.push(relation);
      issues.push({id: safety.reason, severity: "warn", riverIds: [child.id, parent.id], from: [...childEnd], to: [...attachment.point], distance: linkDistance, tolerance: tolerance.total, message: `三次汇流段未通过 ${safety.reason} 门禁，仅拒绝此关系。`});
      continue;
    }
    const anchor = {childId: child.id, parentId: parent.id, from: [...childEnd], to: [...attachment.point], distance: linkDistance, curve, safety, tolerance};
    anchors.push(anchor);
    relations.push(relationEvidence(child, parent, attachment, tolerance, {status: "accepted", reason: null, linkDistance, curve, safety}));
    if (curve.kind === "cubic-hermite-bezier") changedPoints += 1;
  }
  const rejectedRelations = relations.filter(relation => relation.status === "rejected").length;
  const acceptedRelations = relations.filter(relation => relation.status === "accepted").length;
  const rejected = !graph.ok || rejectedRelations > 0;
  return {
    ok: !rejected,
    issues,
    anchors,
    relations,
    protectedOutlets,
    performance: {samplingMs: roundNumber(samplingMs), sampledPoints},
    metrics: {
      relations: rivers.filter(river => river.parent).length,
      attached: acceptedRelations,
      acceptedRelations,
      rejectedRelations,
      unattached: relations.filter(relation => relation.reason === "confluence-unattached").length,
      protectedOutlets,
      changedPoints,
      maxDistance: Number(maxDistance.toFixed(3)),
      snapTolerance: settings.snapTolerance,
      maxLocalTolerance: roundNumber(maxTolerance),
      cubicRelations: anchors.filter(anchor => anchor.curve.kind === "cubic-hermite-bezier").length,
      sampledPoints,
      graphRejected: !graph.ok
    }
  };
}

export function runConfluenceCandidate(snapshot, options = {}) {
  const started = now();
  const graphCandidate = runDAGCandidate(snapshot);
  const geometry = analyzeConfluences(snapshot, options);
  if (!graphCandidate.accepted) {
    return {status: "rejected", accepted: false, rejection: {reason: "parent-graph-rejected", graph: graphCandidate.rejection, issues: geometry.issues}, relations: geometry.relations, anchors: geometry.anchors, metrics: geometry.metrics, performance: {...geometry.performance, algorithmMs: roundNumber(now() - started)}, candidateRivers: null};
  }
  const anchorsByChild = new Map(geometry.anchors.map(anchor => [anchor.childId, anchor]));
  const candidateRivers = graphCandidate.candidateRivers.map(river => {
    const anchor = anchorsByChild.get(river.id);
    if (!anchor || isProtectedOutlet(river.outletKind)) return cloneRiver(river);
    return {...cloneRiver(river), points: [...river.points, ...anchor.curve.sampledPoints.slice(1).map(point => [...point])]};
  });
  const rejectedRelations = geometry.relations.filter(relation => relation.status === "rejected").length;
  const acceptedRelations = geometry.relations.filter(relation => relation.status === "accepted").length;
  const status = rejectedRelations === 0 ? "accepted" : acceptedRelations > 0 ? "partial" : "rejected";
  const mouthDrift = protectedMouthDrift(graphCandidate.candidateRivers, candidateRivers);
  const accepted = status === "accepted" && mouthDrift === 0;
  return {
    status: mouthDrift ? "rejected" : status,
    accepted,
    rejection: accepted ? null : {reason: mouthDrift ? "protected-mouth-drift" : "confluence-anchor-rejected", issues: geometry.issues, rejectedRelations},
    relations: geometry.relations,
    anchors: geometry.anchors,
    metrics: {...geometry.metrics, protectedMouthDrift: mouthDrift},
    performance: {...geometry.performance, algorithmMs: roundNumber(now() - started)},
    candidateRivers
  };
}

export function compareConfluenceCandidate(snapshot, options = {}) {
  const baselineStart = now();
  const baselineRivers = normalizeRivers(snapshot).map(cloneRiver);
  const baselineAnalysis = analyzeDisplayEndpointBaseline(baselineRivers, options);
  const baselineMs = now() - baselineStart;
  const confluenceStarted = now();
  const candidate = runConfluenceCandidate(snapshot, options);
  const confluenceAlgorithmMs = now() - confluenceStarted;
  const hydrologyStarted = now();
  const hydrologyCandidate = runHydrologyCandidate(snapshot, options);
  const hydrologyAlgorithmMs = now() - hydrologyStarted;
  const candidateAlgorithmMs = hydrologyAlgorithmMs;
  const candidateRivers = hydrologyCandidate.candidateRivers || candidate.candidateRivers || baselineRivers.map(cloneRiver);
  return {
    baselineRivers,
    candidateRivers,
    candidate,
    hydrologyCandidate,
    evidence: {
      sameSnapshot: true,
      curveKind: "cubic-hermite-bezier",
      baselineAlgorithmMs: roundNumber(baselineMs),
      candidateAlgorithmMs: roundNumber(candidateAlgorithmMs),
      confluenceAlgorithmMs: roundNumber(confluenceAlgorithmMs),
      hydrologyAlgorithmMs: roundNumber(hydrologyAlgorithmMs),
      algorithmMs: roundNumber(candidateAlgorithmMs),
      samplingMs: candidate.performance.samplingMs,
      gpuUpload: {applicable: false, reason: "standalone-svg-lab", baselineMs: 0, candidateMs: 0, deltaMs: 0},
      baselineDecision: baselineAnalysis,
      baselineSegments: segmentCount(baselineRivers),
      candidateSegments: segmentCount(candidateRivers),
      sampledPoints: candidate.performance.sampledPoints,
      changedRelations: candidate.metrics.changedPoints
    }
  };
}

function analyzeDisplayEndpointBaseline(rivers, options = {}) {
  const tolerance = Number(options.snapTolerance || 12);
  const byId = new Map(rivers.map(river => [river.id, river]));
  let acceptedRelations = 0;
  let rejectedRelations = 0;
  let protectedRelations = 0;
  let maxDistance = 0;
  for (const child of rivers) {
    const parent = byId.get(child.parent);
    if (!parent || !child.parent || !child.points.length || parent.points.length < 2) continue;
    const attachment = closestPointOnPolyline(child.points.at(-1), parent.points);
    maxDistance = Math.max(maxDistance, attachment.distance);
    if (isProtectedOutlet(child.outletKind)) protectedRelations += 1;
    else if (attachment.distance <= tolerance) acceptedRelations += 1;
    else rejectedRelations += 1;
  }
  return {status: rejectedRelations ? "blocked" : "accepted", acceptedRelations, rejectedRelations, protectedRelations, maxDistance: roundNumber(maxDistance), tolerance};
}

export function analyzeHydrology(snapshot, options = {}) {
  const settings = {minLength: 24, minWidth: 0.035, ...options};
  const graph = analyzeParentGraph(snapshot);
  const confluence = runConfluenceCandidate(snapshot, options);
  const sourceRivers = graph.rivers.map(cloneRiver);
  const before = monotonicityViolations(sourceRivers);
  if (!confluence.candidateRivers) {
    const fragmentPolicies = sourceRivers.map(river => classifyFragment(river, settings, confluence));
    return {
      status: "rejected",
      accepted: false,
      rejection: {reason: confluence.rejection?.reason || "confluence-anchor-rejected", upstream: confluence.rejection},
      candidateRivers: null,
      relations: confluence.relations,
      anchors: confluence.anchors || [],
      performance: confluence.performance,
      fragmentPolicies,
      metrics: {
        rivers: sourceRivers.length,
        dischargeBefore: before.discharge,
        dischargeAfter: before.discharge,
        widthBefore: before.width,
        widthAfter: before.width,
        hiddenFragments: fragmentPolicies.filter(item => item.policy === "hide-visual-only").length,
        preservedProtected: fragmentPolicies.filter(item => item.policy === "preserve-protected-outlet").length,
        extendedToConfluence: fragmentPolicies.filter(item => item.policy === "extend-to-confluence").length,
        confluenceAccepted: false
      }
    };
  }
  const candidateRivers = confluence.candidateRivers.map(cloneRiver);
  const byId = new Map(candidateRivers.map(river => [river.id, river]));
  const childrenByParent = new Map(candidateRivers.map(river => [river.id, []]));
  for (const river of candidateRivers) {
    if (childrenByParent.has(river.parent)) childrenByParent.get(river.parent).push(river.id);
  }
  const order = graph.topologicalOrder.length ? graph.topologicalOrder : candidateRivers.map(river => river.id).sort((left, right) => left - right);
  for (const id of [...order].reverse()) {
    const river = byId.get(id);
    if (!river) continue;
    const children = (childrenByParent.get(id) || []).map(childId => byId.get(childId)).filter(Boolean);
    if (!children.length) continue;
    const incoming = children.reduce((total, child) => total + Number(child.discharge || child.flux || 0), 0);
    const maximumChildWidth = Math.max(...children.map(child => Number(child.width || 0)), 0);
    river.discharge = roundNumber(Math.max(Number(river.discharge || river.flux || 0), incoming));
    river.flux = roundNumber(Math.max(Number(river.flux || 0), river.discharge));
    river.width = roundNumber(Math.max(Number(river.width || 0), maximumChildWidth));
  }

  const after = monotonicityViolations(candidateRivers);
  const fragmentPolicies = candidateRivers.map(river => classifyFragment(river, settings, confluence));
  const accepted = graph.ok && confluence.accepted && after.discharge === 0 && after.width === 0;
  const status = accepted ? "accepted" : confluence.status === "partial" ? "partial" : "rejected";
  return {
    status,
    accepted,
    rejection: accepted ? null : {reason: !graph.ok ? "parent-graph-rejected" : !confluence.accepted ? confluence.rejection?.reason || "confluence-anchor-rejected" : "monotonicity-not-proven", graph: graph.metrics, upstream: confluence.rejection},
    candidateRivers,
    relations: confluence.relations,
    anchors: confluence.anchors || [],
    performance: confluence.performance,
    fragmentPolicies,
    metrics: {
      rivers: candidateRivers.length,
      dischargeBefore: before.discharge,
      dischargeAfter: after.discharge,
      widthBefore: before.width,
      widthAfter: after.width,
      hiddenFragments: fragmentPolicies.filter(item => item.policy === "hide-visual-only").length,
      preservedProtected: fragmentPolicies.filter(item => item.policy === "preserve-protected-outlet").length,
      extendedToConfluence: fragmentPolicies.filter(item => item.policy === "extend-to-confluence").length,
      confluenceAccepted: confluence.accepted,
      confluenceRejectedRelations: confluence.metrics.rejectedRelations
    }
  };
}

export function runHydrologyCandidate(snapshot, options = {}) {
  return analyzeHydrology(snapshot, options);
}

export function createRiverNetworkCandidateSnapshot(rivers, pack, grid, metadata = {}) {
  const packCells = pack?.cells || {};
  return {
    evidence: "formal-generator",
    metadata: {
      ...metadata,
      gridSpacing: Number(grid?.metadata?.spacing || 0)
    },
    rivers: (Array.isArray(rivers) ? rivers : []).map((river, index) => ({
      ...river,
      id: Number(river?.id ?? river?.i ?? index + 1),
      parent: Number(river?.parent || 0),
      cells: Array.isArray(river?.cells) ? [...river.cells] : [],
      hydrologyPath: (Array.isArray(river?.cells) ? river.cells : []).map(cell => ({
        cell: Number(cell),
        point: Array.isArray(packCells.p?.[cell]) ? packCells.p[cell].slice(0, 2) : null,
        height: Number(packCells.h?.[cell])
      })).filter(item => item.cell >= 0 && item.point && Number.isFinite(item.height)),
      points: Array.isArray(river?.points) ? river.points.map(point => point.slice(0, 2)) : [],
      outletKind: river?.outletKind || "",
      lakeId: river?.lakeId ?? river?.outletFeatureId ?? null
    }))
  };
}

export function applyRiverNetworkCandidate(rivers, pack, grid, options = {}) {
  const source = Array.isArray(rivers) ? rivers : [];
  const frozenIds = new Set([...(options.frozenIds || [])].map(Number));
  const snapshot = createRiverNetworkCandidateSnapshot(source, pack, grid, options.metadata);
  const candidate = runHydrologyCandidate(snapshot, options.candidateOptions);
  const candidateById = new Map((candidate.candidateRivers || []).map(river => [Number(river.id), river]));
  const beforeById = new Map(snapshot.rivers.map(river => [Number(river.id), river]));
  let appliedRivers = 0;
  let appliedCurves = 0;
  let hydrologyUpdates = 0;
  let frozenSkipped = 0;

  for (const river of source) {
    const id = Number(river?.id ?? river?.i);
    const next = candidateById.get(id);
    if (!next) continue;
    if (frozenIds.has(id)) {
      frozenSkipped += 1;
      continue;
    }
    const before = beforeById.get(id);
    const pointsChanged = !samePoints(before?.points, next.points);
    const hydrologyChanged = Number(river.discharge || 0) !== Number(next.discharge || 0)
      || Number(river.flux || 0) !== Number(next.flux || 0)
      || Number(river.width || 0) !== Number(next.width || 0);
    if (pointsChanged) {
      river.points = next.points.map(point => [...point]);
      river.length = Number(polylineLength(river.points).toFixed(2));
      appliedCurves += 1;
    }
    if (hydrologyChanged) {
      river.discharge = Number(next.discharge || 0);
      river.flux = Number(next.flux || 0);
      river.width = Number(next.width || 0);
      hydrologyUpdates += 1;
    }
    if (pointsChanged || hydrologyChanged) appliedRivers += 1;
  }

  const monotonicity = monotonicityViolations(source.map((river, index) => ({
    id: Number(river?.id ?? river?.i ?? index + 1),
    parent: Number(river?.parent || 0),
    discharge: Number(river?.discharge || river?.flux || 0),
    flux: Number(river?.flux || 0),
    width: Number(river?.width || 0)
  })));
  const frozenLimited = frozenIds.size > 0 && (monotonicity.discharge > 0 || monotonicity.width > 0);
  const status = frozenLimited && candidate.status === "accepted" ? "partial" : candidate.status;
  const rejected = (candidate.relations || []).filter(relation => relation.status === "rejected");
  return {
    rivers: source,
    candidate,
    metadata: {
      algorithm: "river-network-candidate-v1",
      status,
      accepted: status === "accepted",
      rivers: source.length,
      relations: (candidate.relations || []).length,
      acceptedRelations: (candidate.relations || []).filter(relation => relation.status === "accepted").length,
      rejectedRelations: rejected.length,
      protectedRelations: (candidate.relations || []).filter(relation => relation.status === "protected").length,
      appliedRivers,
      appliedCurves,
      hydrologyUpdates,
      frozenSkipped,
      dischargeViolations: monotonicity.discharge,
      widthViolations: monotonicity.width,
      hiddenFragmentSuggestions: Number(candidate.metrics?.hiddenFragments || 0),
      rejectionExamples: rejected.slice(0, 12).map(relation => ({
        childId: relation.childId,
        parentId: relation.parentId,
        reason: relation.reason,
        distance: relation.distance,
        tolerance: relation.tolerance?.total
      })),
      performance: candidate.performance || null
    }
  };
}

function normalizeRivers(snapshot) {
  const source = Array.isArray(snapshot?.rivers) ? snapshot.rivers : [];
  return source.map((river, index) => ({
    ...river,
    id: Number(river.id ?? index + 1),
    parent: Number(river.parent || 0),
    outletKind: river.outletKind || "",
    lakeId: river.lakeId ?? null,
    cells: Array.isArray(river.cells) ? [...river.cells] : [],
    hydrologyPath: Array.isArray(river.hydrologyPath) ? river.hydrologyPath.map(item => ({cell: Number(item.cell), point: item.point?.slice(0, 2), height: Number(item.height)})) : [],
    points: Array.isArray(river.points) ? river.points.map(point => point.slice(0, 2)) : []
  })).sort((left, right) => left.id - right.id);
}

function findCycles(rivers, byId) {
  const cycles = [];
  const completed = new Set();
  for (const river of rivers) {
    const path = [];
    const pathIndex = new Map();
    let current = river.id;
    while (current && byId.has(current)) {
      if (pathIndex.has(current)) {
        const cycle = path.slice(pathIndex.get(current));
        if (!cycles.some(existing => sameSet(existing, cycle))) cycles.push(cycle);
        break;
      }
      if (completed.has(current)) break;
      pathIndex.set(current, path.length);
      path.push(current);
      current = Number(byId.get(current).parent || 0);
    }
    path.forEach(id => completed.add(id));
  }
  return cycles;
}

function topologicalOrderOf(rivers, childrenByParent, selfParents, missingParents) {
  const blocked = new Set([...selfParents, ...missingParents.map(item => item.riverId)]);
  const indegree = new Map(rivers.map(river => [river.id, blocked.has(river.id) ? -1 : 0]));
  for (const [parentId, children] of childrenByParent) {
    if (indegree.get(parentId) === -1) continue;
    for (const childId of children) {
      if (indegree.get(childId) !== -1) indegree.set(childId, indegree.get(childId) + 1);
    }
  }
  const ready = [...indegree].filter(([, degree]) => degree === 0).map(([id]) => id).sort((left, right) => left - right);
  const order = [];
  const visited = new Set();
  while (ready.length) {
    const current = ready.shift();
    if (visited.has(current)) continue;
    visited.add(current);
    order.push(current);
    for (const childId of childrenByParent.get(current) || []) {
      if (indegree.get(childId) === -1) continue;
      indegree.set(childId, indegree.get(childId) - 1);
      if (indegree.get(childId) === 0) {
        ready.push(childId);
        ready.sort((left, right) => left - right);
      }
    }
  }
  return order;
}

function cloneRiver(river) {
  return {...river, cells: [...river.cells], hydrologyPath: river.hydrologyPath.map(item => ({...item, point: item.point ? [...item.point] : null})), points: river.points.map(point => [...point])};
}

function closestPointOnPolyline(point, points) {
  let best = null;
  for (let index = 1; index < points.length; index += 1) {
    const candidate = closestPointOnSegment(point, points[index - 1], points[index]);
    if (!best || candidate.distance < best.distance) best = {...candidate, segmentIndex: index - 1, segmentStart: [...points[index - 1]], segmentEnd: [...points[index]]};
  }
  return best || {point: [...point], distance: 0};
}

function closestPointOnSegment(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  const ratio = lengthSquared ? Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared)) : 0;
  const projected = [start[0] + ratio * dx, start[1] + ratio * dy];
  return {point: projected, distance: Math.hypot(point[0] - projected[0], point[1] - projected[1])};
}

function resolveHydrologyAttachment(snapshot, child, parent) {
  const parentCells = new Set(parent.cells);
  const shared = [...child.hydrologyPath].reverse().find(item => parentCells.has(item.cell) && item.point);
  const childTerminalCell = Number(child.cells.at(-1));
  const hydrologyPoint = shared?.point || child.points.at(-1);
  const hydrologyProjection = closestPointOnPolyline(hydrologyPoint, parent.points);
  const displayProjection = closestPointOnPolyline(child.points.at(-1), parent.points);
  const projected = shared ? displayProjection : hydrologyProjection;
  return {
    ...projected,
    hydrologyPoint: [...hydrologyPoint],
    hydrologyCell: shared?.cell ?? null,
    hydrologyDistance: hydrologyProjection.distance,
    source: shared ? "shared-hydrology-cell" : "display-endpoint",
    attachmentMode: shared ? "nearest-display-backed-by-shared-cell" : "display-endpoint",
    sharedTerminalCell: Boolean(shared && Number(shared.cell) === childTerminalCell),
    gridSpacing: Number(snapshot?.metadata?.gridSpacing || 0)
  };
}

function localConfluenceTolerance(snapshot, child, parent, attachment, settings) {
  const localScale = Math.max(0, Number(snapshot?.metadata?.gridSpacing || attachment.gridSpacing || 0));
  const parentSegmentLength = distance(attachment.segmentStart, attachment.segmentEnd);
  const childSegmentLength = terminalSegmentLength(child);
  const width = Math.max(0, Number(child.width || 0), Number(parent.width || 0));
  const cellTerm = localScale ? Math.min(settings.maxSnapTolerance, localScale * 4.25, Math.max(settings.snapTolerance, parentSegmentLength * 4)) : settings.snapTolerance;
  const segmentTerm = localScale ? Math.min(2.5, parentSegmentLength * 0.2) : 0;
  const widthTerm = localScale ? Math.min(1.5, localScale * Math.sqrt(width) * 0.5) : 0;
  const localTotal = Math.min(settings.maxSnapTolerance, Math.max(settings.snapTolerance, cellTerm + segmentTerm + widthTerm));
  const total = attachment.sharedTerminalCell ? settings.maxSnapTolerance : localTotal;
  return {
    total: roundNumber(total),
    recovery: attachment.sharedTerminalCell ? "shared-terminal-cell" : "local-geometry",
    localScale: roundNumber(localScale),
    childSegmentLength: roundNumber(childSegmentLength),
    parentSegmentLength: roundNumber(parentSegmentLength),
    width: roundNumber(width),
    components: {cell: roundNumber(cellTerm), segment: roundNumber(segmentTerm), width: roundNumber(widthTerm)}
  };
}

function buildConfluenceCurve(snapshot, child, parent, attachment, tolerance, settings) {
  const start = [...child.points.at(-1)];
  const end = [...attachment.point];
  const chord = distance(start, end);
  if (chord <= 1e-7) return {kind: "already-attached", segment: null, sampledPoints: [start], curvature: 0, linear: false};
  const chordDirection = normalizeVector([end[0] - start[0], end[1] - start[1]]);
  const startDirection = downstreamTangent(hydrologyDirection(child, start), chordDirection);
  const rawEndDirection = normalizeVector([attachment.segmentEnd[0] - attachment.segmentStart[0], attachment.segmentEnd[1] - attachment.segmentStart[1]]);
  const endDirection = downstreamTangent(rawEndDirection, chordDirection);
  const handle = Math.min(chord * 0.34, Math.max(tolerance.localScale * 0.75, Math.min(tolerance.childSegmentLength || chord, tolerance.parentSegmentLength || chord) * 0.65, chord * 0.18));
  const segment = {
    startIndex: 0,
    p0: start,
    p1: [start[0] + startDirection[0] * handle, start[1] + startDirection[1] * handle],
    p2: [end[0] - endDirection[0] * handle, end[1] - endDirection[1] * handle],
    p3: end
  };
  const maxSegmentLength = Math.max(0.5, Math.min(Number(settings.maxSegmentLength || 2), tolerance.localScale ? tolerance.localScale * 0.5 : 2, chord / 4));
  const sampledPoints = sampleCubicBezierPath([segment], {maxSegmentLength, minSamples: 6, maxSamples: 64}).points;
  const curvature = Math.max(...sampledPoints.map(point => closestPointOnSegment(point, start, end).distance), 0);
  return {kind: "cubic-hermite-bezier", segment, sampledPoints, curvature: roundNumber(curvature), linear: false, maxSegmentLength: roundNumber(maxSegmentLength)};
}

function buildConfluenceFallbackCurves(child, attachment, tolerance, settings) {
  const start = [...child.points.at(-1)];
  const end = [...attachment.point];
  const chord = distance(start, end);
  if (chord <= 1e-7) return [];
  const direction = normalizeVector([end[0] - start[0], end[1] - start[1]]);
  const normal = [-direction[1], direction[0]];
  const scale = Math.max(0.5, tolerance.localScale || chord * 0.2);
  const maxSegmentLength = Math.max(0.5, Math.min(Number(settings.maxSegmentLength || 2), tolerance.localScale ? tolerance.localScale * 0.5 : 2, chord / 4));
  return [0.75, -0.75, 1.25, -1.25].map(factor => {
    const offset = scale * factor;
    const segment = {
      startIndex: 0,
      p0: start,
      p1: [start[0] + direction[0] * chord / 3 + normal[0] * offset, start[1] + direction[1] * chord / 3 + normal[1] * offset],
      p2: [start[0] + direction[0] * chord * 2 / 3 + normal[0] * offset, start[1] + direction[1] * chord * 2 / 3 + normal[1] * offset],
      p3: end
    };
    const sampledPoints = sampleCubicBezierPath([segment], {maxSegmentLength, minSamples: 6, maxSamples: 64}).points;
    const curvature = Math.max(...sampledPoints.map(point => closestPointOnSegment(point, start, end).distance), 0);
    return {kind: "cubic-hermite-bezier", variant: "shared-terminal-cell-fallback", segment, sampledPoints, curvature: roundNumber(curvature), linear: false, maxSegmentLength: roundNumber(maxSegmentLength)};
  });
}

function validateConfluenceCurve(snapshot, rivers, child, parent, curve, tolerance) {
  if (curve.sampledPoints.length <= 1) return safetyEvidence(true, null, {overshoot: 0, selfIntersections: 0, backtracks: 0, waterExcursions: 0, newWaterExcursions: 0, extraCrossings: 0});
  const start = curve.sampledPoints[0];
  const end = curve.sampledPoints.at(-1);
  const chord = distance(start, end);
  const expansion = Math.max(tolerance.localScale || 0, chord * 0.35, 0.5);
  const overshoot = curve.sampledPoints.filter(point => point[0] < Math.min(start[0], end[0]) - expansion || point[0] > Math.max(start[0], end[0]) + expansion || point[1] < Math.min(start[1], end[1]) - expansion || point[1] > Math.max(start[1], end[1]) + expansion).length;
  const candidatePoints = [...child.points, ...curve.sampledPoints.slice(1)];
  const selfIntersections = Math.max(0, polylineSelfIntersections(candidatePoints) - polylineSelfIntersections(child.points));
  const backtracks = projectionBacktracks(curve.sampledPoints, start, end);
  const terrain = [...child.hydrologyPath, ...parent.hydrologyPath].filter(item => item.point && Number.isFinite(item.height));
  let waterExcursions = 0;
  let newWaterExcursions = 0;
  for (const point of curve.sampledPoints) {
    const nearest = closestTerrainSample(point, terrain);
    if (!nearest || nearest.sample.height >= 20) continue;
    waterExcursions += 1;
    if (nearest.distance > Math.max(1, (tolerance.localScale || settingsScale(snapshot)) * 1.25)) newWaterExcursions += 1;
  }
  const unrelated = rivers.filter(river => river.id !== child.id && river.id !== parent.id && river.parent !== child.id && child.parent !== river.id);
  const baselineCrossings = unrelated.reduce((count, river) => count + polylineCrossings(child.points, river.points), 0);
  const candidateCrossings = unrelated.reduce((count, river) => count + polylineCrossings(candidatePoints, river.points), 0);
  const extraCrossings = Math.max(0, candidateCrossings - baselineCrossings);
  const metrics = {overshoot, selfIntersections, backtracks, waterExcursions, newWaterExcursions, baselineCrossings, candidateCrossings, extraCrossings};
  const reason = overshoot ? "curve-overshoot" : selfIntersections ? "curve-self-intersection" : backtracks ? "curve-backtracking" : newWaterExcursions ? "curve-water-excursion" : extraCrossings ? "curve-non-confluence-crossing" : null;
  return safetyEvidence(!reason, reason, metrics);
}

function relationEvidence(child, parent, attachment, tolerance, extra) {
  return {
    childId: child.id,
    parentId: parent.id,
    attachmentSource: attachment.source,
    attachmentMode: attachment.attachmentMode,
    hydrologyCell: attachment.hydrologyCell,
    hydrologyDistance: roundNumber(attachment.hydrologyDistance),
    from: [...child.points.at(-1)],
    to: [...attachment.point],
    distance: roundNumber(extra.linkDistance),
    tolerance,
    status: extra.status,
    reason: extra.reason,
    curve: extra.curve ? {kind: extra.curve.kind, segment: extra.curve.segment, sampledPoints: extra.curve.sampledPoints, curvature: extra.curve.curvature, linear: extra.curve.linear} : null,
    safety: extra.safety || null
  };
}

function hydrologyDirection(river, renderedEnd) {
  const path = river.hydrologyPath.filter(item => item.point).map(item => item.point);
  if (path.length >= 2) {
    let nearestIndex = 0;
    for (let index = 1; index < path.length; index += 1) if (distance(path[index], renderedEnd) < distance(path[nearestIndex], renderedEnd)) nearestIndex = index;
    const nextIndex = nearestIndex < path.length - 1 ? nearestIndex + 1 : nearestIndex;
    const previousIndex = nextIndex === nearestIndex ? Math.max(0, nearestIndex - 1) : nearestIndex;
    const direction = normalizeVector([path[nextIndex][0] - path[previousIndex][0], path[nextIndex][1] - path[previousIndex][1]]);
    if (direction[0] || direction[1]) return direction;
  }
  const previous = river.points.at(-2) || renderedEnd;
  return normalizeVector([renderedEnd[0] - previous[0], renderedEnd[1] - previous[1]]);
}

function terminalSegmentLength(river) {
  const end = river.points.at(-1);
  const previous = river.points.at(-2);
  return end && previous ? distance(previous, end) : 0;
}

function normalizeVector(vector) {
  const length = Math.hypot(vector[0], vector[1]);
  return length > 1e-9 ? [vector[0] / length, vector[1] / length] : [0, 0];
}

function downstreamTangent(tangent, chordDirection) {
  const dot = tangent[0] * chordDirection[0] + tangent[1] * chordDirection[1];
  if (dot >= 0.15) return tangent;
  return normalizeVector([tangent[0] + chordDirection[0] * (0.8 - dot), tangent[1] + chordDirection[1] * (0.8 - dot)]);
}

function settingsScale(snapshot) {
  return Math.max(0, Number(snapshot?.metadata?.gridSpacing || 0));
}

function closestTerrainSample(point, samples) {
  let best = null;
  for (const sample of samples) {
    const candidateDistance = distance(point, sample.point);
    if (!best || candidateDistance < best.distance) best = {sample, distance: candidateDistance};
  }
  return best;
}

function projectionBacktracks(points, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return 0;
  let previous = -Infinity;
  let count = 0;
  for (const point of points) {
    const projection = ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared;
    if (projection + 0.02 < previous) count += 1;
    previous = Math.max(previous, projection);
  }
  return count;
}

function polylineSelfIntersections(points) {
  let count = 0;
  for (let left = 1; left < points.length; left += 1) {
    for (let right = left + 2; right < points.length; right += 1) {
      if (left === 1 && right === points.length - 1 && distance(points[0], points.at(-1)) <= 1e-7) continue;
      if (segmentsIntersect(points[left - 1], points[left], points[right - 1], points[right])) count += 1;
    }
  }
  return count;
}

function polylineCrossings(left, right) {
  if (!boundsOverlap(polylineBounds(left), polylineBounds(right))) return 0;
  let count = 0;
  for (let leftIndex = 1; leftIndex < left.length; leftIndex += 1) {
    for (let rightIndex = 1; rightIndex < right.length; rightIndex += 1) if (segmentsIntersect(left[leftIndex - 1], left[leftIndex], right[rightIndex - 1], right[rightIndex])) count += 1;
  }
  return count;
}

function segmentsIntersect(a, b, c, d) {
  const denominator = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
  if (Math.abs(denominator) < 1e-9) return false;
  const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / denominator;
  const u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / denominator;
  return t > 1e-7 && t < 1 - 1e-7 && u > 1e-7 && u < 1 - 1e-7;
}

function polylineBounds(points) {
  if (!points.length) return null;
  return {minX: Math.min(...points.map(point => point[0])), minY: Math.min(...points.map(point => point[1])), maxX: Math.max(...points.map(point => point[0])), maxY: Math.max(...points.map(point => point[1]))};
}

function boundsOverlap(left, right) {
  return left && right && left.minX <= right.maxX && left.maxX >= right.minX && left.minY <= right.maxY && left.maxY >= right.minY;
}

function safetyEvidence(accepted, reason, metrics) {
  return {accepted, reason, gates: {overshoot: metrics.overshoot === 0, selfIntersection: metrics.selfIntersections === 0, backtracking: metrics.backtracks === 0, water: metrics.newWaterExcursions === 0, nonConfluenceCrossing: metrics.extraCrossings === 0}, metrics};
}

export function inspectConfluenceCurveSafety(snapshot, childId, parentId, sampledPoints) {
  const rivers = normalizeRivers(snapshot);
  const child = rivers.find(river => river.id === Number(childId));
  const parent = rivers.find(river => river.id === Number(parentId));
  if (!child || !parent || !Array.isArray(sampledPoints) || sampledPoints.length < 2) throw new Error("曲线安全夹具缺少有效关系或采样点");
  const attachment = resolveHydrologyAttachment(snapshot, child, parent);
  const tolerance = localConfluenceTolerance(snapshot, child, parent, attachment, {snapTolerance: 12, maxSnapTolerance: 24, maxSegmentLength: 2});
  return validateConfluenceCurve(snapshot, rivers, child, parent, {sampledPoints: sampledPoints.map(point => [...point])}, tolerance);
}

export function inspectProtectedMouthSafety(before, after) {
  const drift = protectedMouthDrift(normalizeRivers(before), normalizeRivers(after));
  return {accepted: drift === 0, reason: drift ? "protected-mouth-drift" : null, drift};
}

function protectedMouthDrift(before, after) {
  const afterById = new Map(after.map(river => [river.id, river]));
  return before.filter(river => isProtectedOutlet(river.outletKind)).filter(river => {
    const candidate = afterById.get(river.id);
    return !candidate || distance(river.points.at(-1), candidate.points.at(-1)) > 1e-7;
  }).length;
}

function segmentCount(rivers) {
  return rivers.reduce((total, river) => total + Math.max(0, river.points.length - 1), 0);
}

function distance(a, b) {
  return a && b ? Math.hypot(b[0] - a[0], b[1] - a[1]) : 0;
}

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function isProtectedOutlet(outletKind) {
  const value = String(outletKind || "");
  return value.includes("lake") || value === "ocean" || value === "border";
}

function monotonicityViolations(rivers) {
  const byId = new Map(rivers.map(river => [river.id, river]));
  let discharge = 0;
  let width = 0;
  for (const river of rivers) {
    const parent = byId.get(river.parent);
    if (!parent) continue;
    if (Number(river.discharge || 0) > Number(parent.discharge || 0) + 1e-7) discharge += 1;
    if (Number(river.width || 0) > Number(parent.width || 0) + 1e-7) width += 1;
  }
  return {discharge, width};
}

function classifyFragment(river, settings, confluence) {
  const length = polylineLength(river.points);
  const width = Number(river.width || 0);
  const fragment = river.points.length < 3 || length < settings.minLength || width < settings.minWidth;
  if (!fragment) return {riverId: river.id, policy: "preserve", length: roundNumber(length), width};
  if (isProtectedOutlet(river.outletKind)) return {riverId: river.id, policy: "preserve-protected-outlet", length: roundNumber(length), width};
  const hasAnchor = (confluence.anchors || []).some(anchor => anchor.childId === river.id);
  if (river.parent && hasAnchor) return {riverId: river.id, policy: "extend-to-confluence", length: roundNumber(length), width};
  if (length < settings.minLength * 0.5 || width < settings.minWidth * 0.5) return {riverId: river.id, policy: "hide-visual-only", length: roundNumber(length), width};
  return {riverId: river.id, policy: "preserve", length: roundNumber(length), width};
}

function polylineLength(points) {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) length += Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1]);
  return length;
}

function roundNumber(value) {
  return Number(Number(value || 0).toFixed(6));
}

function samePoints(left, right) {
  if ((left?.length || 0) !== (right?.length || 0)) return false;
  return (left || []).every((point, index) => distance(point, right[index]) <= 1e-7);
}

function sameSet(left, right) {
  return left.length === right.length && left.every(id => right.includes(id));
}
