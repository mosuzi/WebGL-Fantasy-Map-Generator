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
  const {__preparedDisplaySafety, ...publicOptions} = options;
  const settings = {snapTolerance: 12, maxSnapTolerance: 24, maxSegmentLength: 2, ...publicOptions};
  const frozenIds = normalizeFrozenIds(publicOptions.frozenIds);
  const prepared = __preparedDisplaySafety || prepareSafeBaseRiverDisplays(normalizeRivers(snapshot), {frozenIds});
  const effectiveSnapshot = {...snapshot, rivers: prepared.rivers};
  const graph = analyzeParentGraph(effectiveSnapshot);
  const rivers = graph.rivers;
  const byId = new Map(rivers.map(river => [river.id, river]));
  const workingById = new Map(rivers.map(river => [river.id, cloneRiver(river)]));
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
    if (!attachment) {
      relations.push({
        childId: child.id,
        parentId: parent.id,
        attachmentSource: "none",
        attachmentMode: "none",
        hydrologyCell: null,
        hydrologyDistance: null,
        parentHydrologyIndex: null,
        parentSegmentIndex: null,
        localSegmentStart: null,
        localSegmentEnd: null,
        anchorKey: null,
        from: [...childEnd],
        to: null,
        distance: null,
        tolerance: null,
        status: "rejected",
        reason: "confluence-shared-cell-missing",
        curve: null,
        safety: null
      });
      issues.push({id: "confluence-shared-cell-missing", severity: "warn", riverIds: [child.id, parent.id], message: "声明父子河流没有共享 canonical 水文 cell，拒绝生成显示汇流锚点。"});
      continue;
    }
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
    if (frozenIds.has(child.id)) {
      const alreadyAttached = linkDistance <= 1e-7;
      const relation = relationEvidence(child, parent, attachment, tolerance, {
        status: alreadyAttached ? "protected" : "frozen",
        reason: alreadyAttached ? "frozen-child-already-attached" : "frozen-child-preserved",
        linkDistance
      });
      relations.push(relation);
      if (!alreadyAttached) issues.push({id: "frozen-child-preserved", severity: "info", riverIds: [child.id, parent.id], distance: linkDistance, message: "冻结支流保持实际显示几何，不生成应用阶段会被丢弃的汇流曲线。"});
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
    let safety = validateConfluenceCurve(effectiveSnapshot, [...workingById.values()], child, parent, curve, tolerance, attachment);
    if (!safety.accepted && attachment.sharedTerminalCell) {
      const fallbackStart = now();
      const fallbacks = buildConfluenceFallbackCurves(child, attachment, tolerance, settings);
      samplingMs += now() - fallbackStart;
      for (const fallback of fallbacks) {
        sampledPoints += fallback.sampledPoints.length;
        const fallbackSafety = validateConfluenceCurve(effectiveSnapshot, [...workingById.values()], child, parent, fallback, tolerance, attachment);
        if (!fallbackSafety.accepted) continue;
        curve = fallback;
        safety = fallbackSafety;
        break;
      }
    }
    if (!safety.accepted) {
      const frozenParentLimited = frozenIds.has(parent.id);
      const relation = relationEvidence(child, parent, attachment, tolerance, {
        status: frozenParentLimited ? "frozen" : "rejected",
        reason: frozenParentLimited ? "frozen-quality-limited" : safety.reason,
        linkDistance,
        curve,
        safety
      });
      relations.push(relation);
      issues.push({id: frozenParentLimited ? "frozen-quality-limited" : safety.reason, severity: frozenParentLimited ? "info" : "warn", riverIds: [child.id, parent.id], from: [...childEnd], to: [...attachment.point], distance: linkDistance, tolerance: tolerance.total, message: frozenParentLimited ? `冻结父河的实际几何使汇流段未通过 ${safety.reason} 门禁，保持双方原几何。` : `三次汇流段未通过 ${safety.reason} 门禁，仅拒绝此关系。`});
      continue;
    }
    const anchor = {
      childId: child.id,
      parentId: parent.id,
      from: [...childEnd],
      to: [...attachment.point],
      distance: linkDistance,
      curve,
      safety,
      tolerance,
      hydrologyCell: attachment.hydrologyCell,
      parentHydrologyIndex: attachment.parentHydrologyIndex ?? null,
      parentSegmentIndex: attachment.segmentIndex ?? null,
      localSegmentStart: attachment.localSegmentStart ?? null,
      localSegmentEnd: attachment.localSegmentEnd ?? null,
      anchorKey: attachment.anchorKey || null
    };
    anchors.push(anchor);
    relations.push(relationEvidence(child, parent, attachment, tolerance, {status: "accepted", reason: null, linkDistance, curve, safety}));
    const workingChild = workingById.get(child.id);
    if (workingChild) workingChild.points = applyConfluenceCurveToPoints(workingChild.points, curve);
    if (curve.kind !== "already-attached") changedPoints += 1;
  }
  const rejectedRelations = relations.filter(relation => relation.status === "rejected").length;
  const acceptedRelations = relations.filter(relation => relation.status === "accepted").length;
  const frozenRelations = relations.filter(relation => relation.status === "frozen").length;
  const rejected = !graph.ok || rejectedRelations > 0;
  const residualQuality = displayQualityResidualEvidence(prepared.metrics);
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
      frozenRelations,
      unattached: relations.filter(relation => relation.reason === "confluence-unattached").length,
      protectedOutlets,
      changedPoints,
      maxDistance: Number(maxDistance.toFixed(3)),
      snapTolerance: settings.snapTolerance,
      maxLocalTolerance: roundNumber(maxTolerance),
      cubicRelations: anchors.filter(anchor => anchor.curve.kind === "cubic-hermite-bezier").length,
      sampledPoints,
      graphRejected: !graph.ok,
      baseRepairs: prepared.metrics.repairs,
      baseSelfIntersections: prepared.metrics.selfIntersections,
      baseSelfRetraces: prepared.metrics.selfRetraces,
      baseBacktracks: prepared.metrics.backtracks,
      baseExtraCrossings: prepared.metrics.extraCrossings,
      baseNonFrozenSelfIntersections: prepared.metrics.nonFrozenSelfIntersections,
      baseNonFrozenSelfRetraces: prepared.metrics.nonFrozenSelfRetraces,
      baseNonFrozenBacktracks: prepared.metrics.nonFrozenBacktracks,
      baseNonFrozenExtraCrossings: prepared.metrics.nonFrozenExtraCrossings,
      baseFrozenSelfIntersections: prepared.metrics.frozenSelfIntersections,
      baseFrozenSelfRetraces: prepared.metrics.frozenSelfRetraces,
      baseFrozenBacktracks: prepared.metrics.frozenBacktracks,
      baseFrozenExtraCrossings: prepared.metrics.frozenExtraCrossings,
      residualQuality
    }
  };
}

export function runConfluenceCandidate(snapshot, options = {}) {
  const started = now();
  const frozenIds = normalizeFrozenIds(options.frozenIds);
  const prepared = prepareSafeBaseRiverDisplays(normalizeRivers(snapshot), {frozenIds});
  const effectiveSnapshot = {...snapshot, rivers: prepared.rivers};
  const graphCandidate = runDAGCandidate(effectiveSnapshot);
  const geometry = analyzeConfluences(effectiveSnapshot, {...options, __preparedDisplaySafety: prepared});
  if (!graphCandidate.accepted) {
    return {status: "rejected", accepted: false, rejection: {reason: "parent-graph-rejected", graph: graphCandidate.rejection, issues: geometry.issues}, relations: geometry.relations, anchors: geometry.anchors, metrics: geometry.metrics, performance: {...geometry.performance, algorithmMs: roundNumber(now() - started)}, candidateRivers: null};
  }
  const anchorsByChild = new Map(geometry.anchors.map(anchor => [anchor.childId, anchor]));
  const candidateRivers = graphCandidate.candidateRivers.map(river => {
    const anchor = anchorsByChild.get(river.id);
    if (!anchor || isProtectedOutlet(river.outletKind)) return cloneRiver(river);
    return {...cloneRiver(river), points: applyConfluenceCurveToPoints(river.points, anchor.curve)};
  });
  const rejectedRelations = geometry.relations.filter(relation => relation.status === "rejected").length;
  const acceptedRelations = geometry.relations.filter(relation => relation.status === "accepted").length;
  const frozenRelations = geometry.relations.filter(relation => relation.status === "frozen").length;
  const residualQuality = geometry.metrics.residualQuality || displayQualityResidualEvidence(prepared.metrics);
  let status = rejectedRelations === 0 ? "accepted" : acceptedRelations > 0 ? "partial" : "rejected";
  let rejectionReason = rejectedRelations ? "confluence-anchor-rejected" : null;
  if (residualQuality.nonFrozenTotal > 0) {
    status = "rejected";
    rejectionReason = "display-quality-residual";
  } else if (residualQuality.frozenTotal > 0 || frozenRelations > 0) {
    if (status === "accepted") status = "partial";
    rejectionReason ||= "frozen-quality-limited";
  }
  const mouthDrift = protectedMouthDrift(graphCandidate.candidateRivers, candidateRivers);
  const accepted = status === "accepted" && mouthDrift === 0;
  return {
    status: mouthDrift ? "rejected" : status,
    accepted,
    rejection: accepted ? null : {reason: mouthDrift ? "protected-mouth-drift" : rejectionReason || "confluence-anchor-rejected", issues: geometry.issues, rejectedRelations, frozenRelations, residualQuality},
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
        ...confluence.metrics,
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
      ...confluence.metrics,
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
      points: Array.isArray(river?.points) ? river.points.map(normalizeRiverDisplayPoint) : [],
      outletKind: river?.outletKind || "",
      lakeId: river?.lakeId ?? river?.outletFeatureId ?? null
    }))
  };
}

export function applyRiverNetworkCandidate(rivers, pack, grid, options = {}) {
  const source = Array.isArray(rivers) ? rivers : [];
  const frozenIds = new Set([...(options.frozenIds || [])].map(Number));
  const snapshot = createRiverNetworkCandidateSnapshot(source, pack, grid, options.metadata);
  const candidate = runHydrologyCandidate(snapshot, {...options.candidateOptions, frozenIds});
  const candidateById = new Map((candidate.candidateRivers || []).map(river => [Number(river.id), river]));
  const fragmentPolicyById = new Map((candidate.fragmentPolicies || []).map(item => [Number(item.riverId), item.policy]));
  const beforeById = new Map(snapshot.rivers.map(river => [Number(river.id), river]));
  let appliedRivers = 0;
  let appliedCurves = 0;
  let hydrologyUpdates = 0;
  let frozenSkipped = 0;
  let displayPolicyUpdates = 0;
  let restoredPointFluxes = 0;

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
      river.points = restoreRiverPointFlux(before?.points || river.points, next.points, Number(river.flux || river.discharge || 0));
      restoredPointFluxes += river.points.filter(point => Number.isFinite(Number(point[2]))).length;
      river.length = Number(polylineLength(river.points).toFixed(2));
      appliedCurves += 1;
    }
    if (hydrologyChanged) {
      river.discharge = Number(next.discharge || 0);
      river.flux = Number(next.flux || 0);
      river.width = Number(next.width || 0);
      hydrologyUpdates += 1;
    }
    const fragmentPolicy = candidate.status !== "rejected" ? fragmentPolicyById.get(id) : null;
    if (fragmentPolicy && river.displayPolicy?.fragment !== fragmentPolicy) {
      river.displayPolicy = {...(river.displayPolicy && typeof river.displayPolicy === "object" ? river.displayPolicy : {}), fragment: fragmentPolicy};
      displayPolicyUpdates += 1;
    }
    if (pointsChanged || hydrologyChanged) appliedRivers += 1;
  }

  const actualById = new Map(source.map((river, index) => [Number(river?.id ?? river?.i ?? index + 1), river]));
  let finalGapViolations = 0;
  for (const relation of candidate.relations || []) {
    const child = actualById.get(Number(relation.childId));
    const parent = actualById.get(Number(relation.parentId));
    if (!child?.points?.length || !parent?.points?.length) continue;
    const finalGap = roundNumber(closestPointOnPolyline(child.points.at(-1), parent.points).distance);
    relation.initialDistance ??= relation.distance;
    relation.distance = finalGap;
    relation.finalGap = finalGap;
    if (relation.status !== "accepted" || finalGap <= 1e-7) continue;
    relation.status = "rejected";
    relation.reason = "confluence-apply-gap";
    finalGapViolations += 1;
  }
  if (finalGapViolations > 0) {
    candidate.status = "rejected";
    candidate.accepted = false;
    candidate.rejection = {reason: "confluence-apply-gap", finalGapViolations, upstream: candidate.rejection};
  }
  if (candidate.metrics) {
    candidate.metrics.acceptedRelations = (candidate.relations || []).filter(relation => relation.status === "accepted").length;
    candidate.metrics.rejectedRelations = (candidate.relations || []).filter(relation => relation.status === "rejected").length;
    candidate.metrics.finalGapViolations = finalGapViolations;
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
      displayPolicyUpdates,
      restoredPointFluxes,
      finalGapViolations,
      dischargeViolations: monotonicity.discharge,
      widthViolations: monotonicity.width,
      hiddenFragmentSuggestions: Number(candidate.metrics?.hiddenFragments || 0),
      residualQuality: candidate.metrics?.residualQuality || null,
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
    points: Array.isArray(river.points) ? river.points.map(normalizeRiverDisplayPoint) : []
  })).sort((left, right) => left.id - right.id);
}

function normalizeRiverDisplayPoint(point) {
  const normalized = [Number(point?.[0]), Number(point?.[1])];
  if (Number.isFinite(Number(point?.[2]))) normalized.push(Number(point[2]));
  return normalized;
}

function restoreRiverPointFlux(originalPoints, candidatePoints, fallbackFlux) {
  const source = (originalPoints || []).map(normalizeRiverDisplayPoint);
  const candidate = (candidatePoints || []).map(normalizeRiverDisplayPoint);
  if (!source.some(point => Number.isFinite(Number(point[2])))) return candidate;
  const sourceFluxes = source.map(point => Number.isFinite(Number(point[2])) ? Number(point[2]) : NaN);
  let carried = Number.isFinite(fallbackFlux) ? fallbackFlux : 0;
  for (let index = 0; index < sourceFluxes.length; index += 1) {
    if (Number.isFinite(sourceFluxes[index])) carried = sourceFluxes[index];
    else sourceFluxes[index] = carried;
  }
  for (let index = sourceFluxes.length - 2; index >= 0; index -= 1) {
    if (!Number.isFinite(sourceFluxes[index])) sourceFluxes[index] = sourceFluxes[index + 1];
  }

  const originalEnd = source.at(-1);
  let prefixEnd = candidate.length - 1;
  for (let index = candidate.length - 1; index >= 0; index -= 1) {
    if (distance(candidate[index], originalEnd) > 1e-7) continue;
    prefixEnd = index;
    break;
  }
  const sourceLengths = cumulativePolylineLengths(source);
  const prefixLengths = cumulativePolylineLengths(candidate.slice(0, prefixEnd + 1));
  const prefixTotal = prefixLengths.at(-1) || 0;
  const terminalFlux = sourceFluxes.at(-1);
  return candidate.map((point, index) => {
    const flux = index > prefixEnd
      ? terminalFlux
      : interpolatePolylineValue(sourceFluxes, sourceLengths, prefixTotal > 1e-9 ? prefixLengths[index] / prefixTotal : index / Math.max(1, prefixEnd));
    return [point[0], point[1], flux];
  });
}

function interpolatePolylineValue(values, lengths, progress) {
  if (values.length <= 1) return Number(values[0] || 0);
  const target = Math.max(0, Math.min(1, progress)) * (lengths.at(-1) || 0);
  const segmentIndex = segmentIndexAtPolylineLength(lengths, target);
  const startLength = lengths[segmentIndex];
  const endLength = lengths[segmentIndex + 1];
  const amount = endLength > startLength ? (target - startLength) / (endLength - startLength) : 0;
  return values[segmentIndex] + (values[segmentIndex + 1] - values[segmentIndex]) * amount;
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

export function inspectRiverDisplayQuality(snapshot) {
  const rivers = normalizeRivers(snapshot);
  return inspectRiverDisplayQualityForRivers(rivers);
}

function prepareSafeBaseRiverDisplays(rivers, options = {}) {
  const context = createDisplayQualityContext(rivers, options);
  let repairs = 0;
  for (let index = 0; index < context.entries.length; index += 1) {
    if (context.frozenIds.has(context.entries[index].river.id)) continue;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const issueLimit = entryIssueTotal(context.entries[index]);
      if (!issueLimit) break;
      const replacement = chooseSaferRiverDisplay(context, index, issueLimit);
      if (!replacement) break;
      commitDisplayQualityEvaluation(context, replacement);
      repairs += 1;
    }
  }

  const maxCrossingRepairs = Math.min(64, context.entries.length * 2);
  for (let pass = 0; pass < maxCrossingRepairs; pass += 1) {
    const pair = firstDisplayQualityCrossingPair(context);
    if (!pair) break;
    const before = context.totalExtraCrossings;
    const order = repairOrderForCrossing(pair.left.river, pair.right.river)
      .map(river => context.indexById.get(river.id))
      .filter(index => Number.isInteger(index) && !context.frozenIds.has(context.entries[index].river.id));
    let replacement = null;
    for (const index of order) {
      replacement = chooseSaferRiverDisplay(context, index, Infinity, before, true);
      if (replacement) break;
    }
    if (!replacement && !context.frozenIds.has(pair.left.river.id) && !context.frozenIds.has(pair.right.river.id)) {
      replacement = chooseSaferRiverDisplayPair(context, pair.left.index, pair.right.index, before);
    }
    if (!replacement) break;
    commitDisplayQualityEvaluation(context, replacement);
    repairs += replacement.indexes.length;
  }

  const metrics = displayQualityMetrics(context);
  return {rivers: context.rivers, metrics: {...metrics, repairs}};
}

function createDisplayQualityContext(rivers, options = {}) {
  const working = rivers.map(cloneRiver);
  const entries = working.map((river, index) => createDisplayQualityEntry(river, index));
  const context = {
    rivers: working,
    entries,
    pairExtra: new Map(),
    canonicalPairEvidence: new Map(),
    totalExtraCrossings: 0,
    frozenIds: normalizeFrozenIds(options.frozenIds),
    indexById: new Map(entries.map(entry => [entry.river.id, entry.index]))
  };
  for (let left = 0; left < entries.length; left += 1) {
    for (let right = left + 1; right < entries.length; right += 1) {
      const key = displayQualityPairKey(left, right, entries.length);
      const extra = displayQualityPairExtra(context, entries[left], entries[right], key);
      if (!extra) continue;
      context.pairExtra.set(key, extra);
      context.totalExtraCrossings += extra;
    }
  }
  return context;
}

function createDisplayQualityEntry(river, index, canonicalSource = null) {
  const displayPoints = river.points;
  const canonicalPoints = canonicalSource?.canonicalPoints || dedupePoints(river.hydrologyPath.filter(item => item.point).map(item => item.point));
  const displayLengths = cumulativePolylineLengths(displayPoints);
  const canonicalLengths = canonicalSource?.canonicalLengths || cumulativePolylineLengths(canonicalPoints);
  return {
    index,
    river,
    displayPoints,
    canonicalPoints,
    displayBounds: polylineBounds(displayPoints),
    canonicalBounds: canonicalSource?.canonicalBounds || polylineBounds(canonicalPoints),
    displayLengths,
    canonicalLengths,
    issues: {
      selfIntersections: polylineSelfIntersections(displayPoints),
      selfRetraces: polylineSelfRetracesAndTouches(displayPoints),
      backtracks: hydrologyProgressBacktracks(displayPoints, canonicalPoints, canonicalLengths, {ignoreTerminal: isProtectedOutlet(river.outletKind)})
    }
  };
}

function chooseSaferRiverDisplay(context, index, issueLimit = Infinity, crossingLimit = Infinity, requireCrossingReduction = false) {
  const currentCrossings = Math.min(crossingLimit, context.totalExtraCrossings);
  const candidates = weakenedRiverDisplayCandidates(context.entries[index]);
  if (requireCrossingReduction) candidates.reverse();
  for (const points of candidates) {
    const river = {...cloneRiver(context.entries[index].river), points};
    const entry = createDisplayQualityEntry(river, index, context.entries[index]);
    if (entryIssueTotal(entry) >= issueLimit) continue;
    const evaluation = evaluateDisplayQualityReplacement(context, [[index, entry]]);
    if (requireCrossingReduction && evaluation.totalExtraCrossings >= currentCrossings) continue;
    if (evaluation.totalExtraCrossings > currentCrossings) continue;
    return evaluation;
  }
  return null;
}

function chooseSaferRiverDisplayPair(context, leftIndex, rightIndex, crossingLimit) {
  const leftEntry = context.entries[leftIndex];
  const rightEntry = context.entries[rightIndex];
  const leftIssueLimit = entryIssueTotal(leftEntry);
  const rightIssueLimit = entryIssueTotal(rightEntry);
  let best = null;
  const leftCandidates = weakenedRiverDisplayCandidates(leftEntry);
  const rightCandidates = weakenedRiverDisplayCandidates(rightEntry);
  for (let leftCandidateIndex = 0; leftCandidateIndex < leftCandidates.length; leftCandidateIndex += 1) {
    const leftRiver = {...cloneRiver(leftEntry.river), points: leftCandidates[leftCandidateIndex]};
    const leftCandidate = createDisplayQualityEntry(leftRiver, leftIndex, leftEntry);
    if (entryIssueTotal(leftCandidate) > leftIssueLimit) continue;
    for (let rightCandidateIndex = 0; rightCandidateIndex < rightCandidates.length; rightCandidateIndex += 1) {
      const rightRiver = {...cloneRiver(rightEntry.river), points: rightCandidates[rightCandidateIndex]};
      const rightCandidate = createDisplayQualityEntry(rightRiver, rightIndex, rightEntry);
      const issues = entryIssueTotal(leftCandidate) + entryIssueTotal(rightCandidate);
      if (entryIssueTotal(rightCandidate) > rightIssueLimit) continue;
      const evaluation = evaluateDisplayQualityReplacement(context, [[leftIndex, leftCandidate], [rightIndex, rightCandidate]]);
      if (evaluation.totalExtraCrossings >= crossingLimit) continue;
      const score = [evaluation.totalExtraCrossings, issues, leftCandidateIndex + rightCandidateIndex, leftCandidateIndex, rightCandidateIndex];
      if (!best || compareNumberTuples(score, best.score) < 0) best = {score, evaluation};
    }
  }
  return best?.evaluation || null;
}

function evaluateDisplayQualityReplacement(context, replacements) {
  const replacementByIndex = new Map(replacements);
  const affectedKeys = new Set();
  for (const [index] of replacements) {
    for (let other = 0; other < context.entries.length; other += 1) {
      if (other === index) continue;
      affectedKeys.add(displayQualityPairKey(index, other, context.entries.length));
    }
  }
  const updates = [];
  let totalExtraCrossings = context.totalExtraCrossings;
  for (const key of affectedKeys) {
    const [left, right] = displayQualityPairIndexes(key, context.entries.length);
    const leftEntry = replacementByIndex.get(left) || context.entries[left];
    const rightEntry = replacementByIndex.get(right) || context.entries[right];
    const previous = context.pairExtra.get(key) || 0;
    const next = displayQualityPairExtra(context, leftEntry, rightEntry, key);
    totalExtraCrossings += next - previous;
    updates.push({key, next});
  }
  return {indexes: [...replacementByIndex.keys()].sort((left, right) => left - right), entries: replacementByIndex, updates, totalExtraCrossings};
}

function commitDisplayQualityEvaluation(context, evaluation) {
  for (const index of evaluation.indexes) {
    const entry = evaluation.entries.get(index);
    context.entries[index] = entry;
    context.rivers[index] = entry.river;
  }
  for (const {key, next} of evaluation.updates) {
    if (next) context.pairExtra.set(key, next);
    else context.pairExtra.delete(key);
  }
  context.totalExtraCrossings = evaluation.totalExtraCrossings;
}

function displayQualityPairExtra(context, left, right, key) {
  if (!boundsOverlap(left.displayBounds, right.displayBounds)) return 0;
  const displayEvents = polylineIntersectionEvents(left.displayPoints, right.displayPoints, left.displayLengths, right.displayLengths, left.displayBounds, right.displayBounds);
  if (!displayEvents.length) return 0;
  let evidence = context.canonicalPairEvidence.get(key);
  if (!context.canonicalPairEvidence.has(key)) {
    evidence = canonicalPairIntersectionEvidence(left, right);
    context.canonicalPairEvidence.set(key, evidence);
  }
  return unmatchedIntersectionEvents(displayEvents, evidence).length;
}

function canonicalPairIntersectionEvidence(left, right) {
  const evidence = left.canonicalPoints.length > 1 && right.canonicalPoints.length > 1
    ? polylineIntersectionEvents(left.canonicalPoints, right.canonicalPoints, left.canonicalLengths, right.canonicalLengths, left.canonicalBounds, right.canonicalBounds)
      .map(event => ({...event, kind: "canonical-intersection"}))
    : [];
  const childOnLeft = Number(left.river.parent) === Number(right.river.id);
  const childOnRight = Number(right.river.parent) === Number(left.river.id);
  if (!childOnLeft && !childOnRight) return evidence;
  const childEntry = childOnLeft ? left : right;
  const parentEntry = childOnLeft ? right : left;
  const shared = sharedCanonicalHydrologyItem(childEntry.river, parentEntry.river);
  if (!shared) return evidence;
  for (const item of evidence) {
    const childProgress = childOnLeft ? item.leftProgress : item.rightProgress;
    if (item.type === "touch" && childProgress >= 1 - 1e-7) item.strictTolerance = 1e-7;
  }
  const endpoint = childEntry.displayPoints.at(-1);
  const anchor = resolveSharedCellParentAnchor(shared, parentEntry.river, endpoint, {maxSnapTolerance: 24});
  if (!anchor || distance(endpoint, anchor.point) > 1e-7) return evidence;
  evidence.push({point: [...endpoint], kind: "shared-cell-final-endpoint", ignoreProgress: true, strictTolerance: 1e-7, tolerance: 0});
  return dedupeIntersectionEvidence(evidence);
}

function sharedCanonicalHydrologyItem(child, parent) {
  const parentCells = new Set(parent.cells);
  return [...child.hydrologyPath].reverse().find(item => item.point && parentCells.has(item.cell)) || null;
}

function dedupeIntersectionEvidence(evidence) {
  const result = [];
  for (const item of evidence) {
    const duplicate = result.find(existing => distance(existing.point, item.point) <= 1e-7
      && (existing.ignoreProgress || item.ignoreProgress || (Math.abs(Number(existing.leftProgress || 0) - Number(item.leftProgress || 0)) <= 1e-7 && Math.abs(Number(existing.rightProgress || 0) - Number(item.rightProgress || 0)) <= 1e-7)));
    if (!duplicate) result.push(item);
    else {
      if (item.ignoreProgress) duplicate.ignoreProgress = true;
      if (Number.isFinite(item.strictTolerance)) duplicate.strictTolerance = Math.min(Number(duplicate.strictTolerance ?? Infinity), item.strictTolerance);
    }
  }
  return result;
}

function unmatchedIntersectionEvents(events, evidence) {
  const used = new Set();
  const unmatched = [];
  for (const event of events) {
    let best = null;
    for (let index = 0; index < evidence.length; index += 1) {
      if (used.has(index)) continue;
      const legal = evidence[index];
      const spatialDistance = distance(event.point, legal.point);
      const tolerance = Number.isFinite(legal.strictTolerance) ? legal.strictTolerance : Math.max(0.25, Number(event.tolerance || 0), Number(legal.tolerance || 0));
      if (spatialDistance > tolerance + 1e-7) continue;
      const leftDelta = Math.abs(Number(event.leftProgress || 0) - Number(legal.leftProgress || 0));
      const rightDelta = Math.abs(Number(event.rightProgress || 0) - Number(legal.rightProgress || 0));
      const progressTolerance = Math.min(0.35, Math.max(0.12, tolerance / Math.max(1, Math.min(Number(event.leftTotal || Infinity), Number(event.rightTotal || Infinity)))));
      if (!legal.ignoreProgress && (leftDelta > progressTolerance || rightDelta > progressTolerance)) continue;
      const score = [spatialDistance, leftDelta + rightDelta, index];
      if (!best || compareNumberTuples(score, best.score) < 0) best = {index, score};
    }
    if (!best) unmatched.push(event);
    else used.add(best.index);
  }
  return unmatched;
}

function displayQualityPairKey(left, right, size) {
  const min = Math.min(left, right);
  const max = Math.max(left, right);
  return min * size + max;
}

function displayQualityPairIndexes(key, size) {
  return [Math.floor(key / size), key % size];
}

function firstDisplayQualityCrossingPair(context) {
  let firstKey = Infinity;
  for (const key of context.pairExtra.keys()) if (key < firstKey) firstKey = key;
  if (!Number.isFinite(firstKey)) return null;
  const [left, right] = displayQualityPairIndexes(firstKey, context.entries.length);
  return {left: context.entries[left], right: context.entries[right]};
}

function entryIssueTotal(entry) {
  return entry.issues.selfIntersections + entry.issues.selfRetraces + entry.issues.backtracks;
}

function compareNumberTuples(left, right) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = Number(left[index] || 0) - Number(right[index] || 0);
    if (difference) return difference;
  }
  return 0;
}

function weakenedRiverDisplayCandidates(entry) {
  const {displayPoints: original, canonicalPoints: canonical, displayLengths: originalLengths, canonicalLengths} = entry;
  if (original.length < 2 || canonical.length < 2) return [];
  const originalTotal = originalLengths.at(-1) || 0;
  const candidates = [];
  for (const originalWeight of [0.5, 0.25, 0]) {
    const points = original.map((point, index) => {
      if (index === 0 || index === original.length - 1) return [...point];
      const progress = originalTotal > 1e-9 ? originalLengths[index] / originalTotal : index / Math.max(1, original.length - 1);
      const target = pointAtPolylineProgress(canonical, canonicalLengths, progress);
      return [
        point[0] * originalWeight + target[0] * (1 - originalWeight),
        point[1] * originalWeight + target[1] * (1 - originalWeight)
      ];
    });
    candidates.push(dedupePoints(points));
  }
  const canonicalFallback = dedupePoints([
    [...original[0]],
    ...canonical.slice(1, -1).map(point => [...point]),
    [...original.at(-1)]
  ]);
  candidates.push(canonicalFallback);
  return candidates.filter(points => points.length >= 2 && !samePoints(points, original));
}

function pointAtPolylineProgress(points, lengths, progress) {
  const target = Math.max(0, Math.min(1, progress)) * (lengths.at(-1) || 0);
  const segmentIndex = segmentIndexAtPolylineLength(lengths, target);
  const startLength = lengths[segmentIndex];
  const endLength = lengths[segmentIndex + 1];
  const amount = endLength > startLength ? (target - startLength) / (endLength - startLength) : 0;
  return [
    points[segmentIndex][0] + (points[segmentIndex + 1][0] - points[segmentIndex][0]) * amount,
    points[segmentIndex][1] + (points[segmentIndex + 1][1] - points[segmentIndex][1]) * amount
  ];
}

function dedupePoints(points) {
  const result = [];
  for (const point of points) if (!result.length || distance(result.at(-1), point) > 1e-7) result.push([...point]);
  return result;
}

function inspectRiverDisplayQualityForRivers(rivers) {
  return displayQualityMetrics(createDisplayQualityContext(rivers));
}

function displayQualityMetrics(context) {
  let selfIntersections = 0;
  let selfRetraces = 0;
  let backtracks = 0;
  let nonFrozenSelfIntersections = 0;
  let nonFrozenSelfRetraces = 0;
  let nonFrozenBacktracks = 0;
  let frozenSelfIntersections = 0;
  let frozenSelfRetraces = 0;
  let frozenBacktracks = 0;
  for (const entry of context.entries) {
    selfIntersections += entry.issues.selfIntersections;
    selfRetraces += entry.issues.selfRetraces;
    backtracks += entry.issues.backtracks;
    if (context.frozenIds.has(entry.river.id)) {
      frozenSelfIntersections += entry.issues.selfIntersections;
      frozenSelfRetraces += entry.issues.selfRetraces;
      frozenBacktracks += entry.issues.backtracks;
    } else {
      nonFrozenSelfIntersections += entry.issues.selfIntersections;
      nonFrozenSelfRetraces += entry.issues.selfRetraces;
      nonFrozenBacktracks += entry.issues.backtracks;
    }
  }
  let nonFrozenExtraCrossings = 0;
  let frozenExtraCrossings = 0;
  for (const [key, extra] of context.pairExtra) {
    const [left, right] = displayQualityPairIndexes(key, context.entries.length);
    if (context.frozenIds.has(context.entries[left].river.id) || context.frozenIds.has(context.entries[right].river.id)) frozenExtraCrossings += extra;
    else nonFrozenExtraCrossings += extra;
  }
  return {
    rivers: context.entries.length,
    selfIntersections,
    selfRetraces,
    backtracks,
    extraCrossings: context.totalExtraCrossings,
    nonFrozenSelfIntersections,
    nonFrozenSelfRetraces,
    nonFrozenBacktracks,
    nonFrozenExtraCrossings,
    frozenSelfIntersections,
    frozenSelfRetraces,
    frozenBacktracks,
    frozenExtraCrossings
  };
}

function displayQualityResidualEvidence(metrics) {
  const evidence = {
    nonFrozenSelfIntersections: Number(metrics?.nonFrozenSelfIntersections || 0),
    nonFrozenSelfRetraces: Number(metrics?.nonFrozenSelfRetraces || 0),
    nonFrozenBacktracks: Number(metrics?.nonFrozenBacktracks || 0),
    nonFrozenExtraCrossings: Number(metrics?.nonFrozenExtraCrossings || 0),
    frozenSelfIntersections: Number(metrics?.frozenSelfIntersections || 0),
    frozenSelfRetraces: Number(metrics?.frozenSelfRetraces || 0),
    frozenBacktracks: Number(metrics?.frozenBacktracks || 0),
    frozenExtraCrossings: Number(metrics?.frozenExtraCrossings || 0)
  };
  evidence.nonFrozenTotal = evidence.nonFrozenSelfIntersections + evidence.nonFrozenSelfRetraces + evidence.nonFrozenBacktracks + evidence.nonFrozenExtraCrossings;
  evidence.frozenTotal = evidence.frozenSelfIntersections + evidence.frozenSelfRetraces + evidence.frozenBacktracks + evidence.frozenExtraCrossings;
  evidence.total = evidence.nonFrozenTotal + evidence.frozenTotal;
  return evidence;
}

function hydrologyProgressBacktracks(points, hydrologyPoints, hydrologyLengths, {ignoreTerminal = false} = {}) {
  if (points.length < 2 || hydrologyPoints.length < 2) return 0;
  let previous = -Infinity;
  let count = 0;
  const inspectedPoints = ignoreTerminal && points.length > 2 ? points.slice(0, -1) : points;
  for (const point of inspectedPoints) {
    const projection = closestPointOnPolylineWithProgress(point, hydrologyPoints, hydrologyLengths);
    if (projection.progress + 0.03 < previous) count += 1;
    previous = Math.max(previous, projection.progress);
  }
  return count;
}

function closestPointOnPolylineWithProgress(point, points, lengths) {
  const total = lengths.at(-1) || 0;
  let best = null;
  for (let index = 1; index < points.length; index += 1) {
    const candidate = closestPointOnSegment(point, points[index - 1], points[index]);
    const segmentLength = lengths[index] - lengths[index - 1];
    const projectedLength = lengths[index - 1] + (segmentLength ? distance(points[index - 1], candidate.point) : 0);
    const progress = total > 1e-9 ? projectedLength / total : (index - 1) / Math.max(1, points.length - 1);
    if (!best || candidate.distance < best.distance - 1e-9 || (Math.abs(candidate.distance - best.distance) <= 1e-9 && progress < best.progress)) best = {...candidate, progress};
  }
  return best || {point: [...point], distance: 0, progress: 0};
}

function repairOrderForCrossing(left, right) {
  return [left, right].sort((a, b) => {
    const protectedDelta = Number(isProtectedOutlet(a.outletKind)) - Number(isProtectedOutlet(b.outletKind));
    if (protectedDelta) return protectedDelta;
    const rootDelta = Number(!a.parent) - Number(!b.parent);
    if (rootDelta) return rootDelta;
    const widthDelta = Number(a.width || 0) - Number(b.width || 0);
    return widthDelta || b.id - a.id;
  });
}

function normalizeFrozenIds(values) {
  return values instanceof Set ? new Set([...values].map(Number)) : new Set([...(values || [])].map(Number));
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

function resolveHydrologyAttachment(snapshot, child, parent, settings = {}) {
  const parentCells = new Set(parent.cells);
  const shared = [...child.hydrologyPath].reverse().find(item => parentCells.has(item.cell) && item.point);
  if (!shared) return null;
  const childTerminalCell = Number(child.cells.at(-1));
  const hydrologyPoint = shared.point;
  const localAnchor = resolveSharedCellParentAnchor(shared, parent, child.points.at(-1), settings);
  if (!localAnchor) return null;
  return {
    ...localAnchor,
    hydrologyPoint: [...hydrologyPoint],
    hydrologyCell: shared.cell,
    hydrologyDistance: localAnchor.hydrologyDistance,
    source: "shared-hydrology-cell",
    attachmentMode: "canonical-shared-cell-local-segment",
    sharedTerminalCell: Number(shared.cell) === childTerminalCell,
    gridSpacing: Number(snapshot?.metadata?.gridSpacing || 0)
  };
}

function resolveSharedCellParentAnchor(shared, parent, displayEndpoint, settings) {
  const hydrology = parent.hydrologyPath.filter(item => item.point);
  const matchingIndexes = hydrology
    .map((item, index) => Number(item.cell) === Number(shared.cell) ? index : -1)
    .filter(index => index >= 0);
  if (!matchingIndexes.length || parent.points.length < 2) return null;

  const hydrologyIndex = matchingIndexes
    .map(index => ({index, distance: distance(shared.point, hydrology[index].point)}))
    .sort((left, right) => left.distance - right.distance || left.index - right.index)[0].index;
  const maxReach = Math.max(12, Number(settings?.maxSnapTolerance || 24));
  const localProjection = projectHydrologyPointToLocalParentSegments(shared.point, displayEndpoint, parent.points, hydrologyIndex, hydrology.length, maxReach);
  const canonicalSegmentIndex = localProjection.segmentIndex;
  const anchorPoint = localProjection.point;
  const localIndexes = new Set([canonicalSegmentIndex]);
  let traversed = 0;
  for (let index = canonicalSegmentIndex - 1; index >= 0; index -= 1) {
    traversed += distance(parent.points[index], parent.points[index + 1]);
    if (traversed > maxReach + 1e-7) break;
    localIndexes.add(index);
  }
  traversed = 0;
  for (let index = canonicalSegmentIndex + 1; index < parent.points.length - 1; index += 1) {
    traversed += distance(parent.points[index], parent.points[index + 1]);
    if (traversed > maxReach + 1e-7) break;
    localIndexes.add(index);
  }

  return {
    point: [...anchorPoint],
    distance: distance(displayEndpoint, anchorPoint),
    hydrologyDistance: localProjection.hydrologyDistance,
    segmentIndex: canonicalSegmentIndex,
    segmentStart: [...parent.points[canonicalSegmentIndex]],
    segmentEnd: [...parent.points[canonicalSegmentIndex + 1]],
    parentHydrologyIndex: hydrologyIndex,
    localSegmentStart: Math.min(...localIndexes),
    localSegmentEnd: Math.max(...localIndexes),
    anchorKey: `${Number(shared.cell)}:${hydrologyIndex}:${canonicalSegmentIndex}`
  };
}

function projectHydrologyPointToLocalParentSegments(point, displayEndpoint, points, hydrologyIndex, hydrologyLength, maxLinkDistance) {
  const segmentCount = points.length - 1;
  const hydrologySegments = Math.max(1, hydrologyLength - 1);
  const expectedVertex = hydrologyIndex / hydrologySegments * segmentCount;
  const expectedSegment = Math.max(0, Math.min(segmentCount - 1, Math.ceil(expectedVertex) - 1));
  const radius = Math.max(2, Math.ceil(segmentCount / hydrologySegments) * 2);
  const start = Math.max(0, expectedSegment - radius);
  const end = Math.min(segmentCount - 1, expectedSegment + radius);
  const endpointCandidates = [];
  const hydrologyCandidates = [];
  for (let segmentIndex = start; segmentIndex <= end; segmentIndex += 1) {
    const endpointProjection = closestPointOnSegment(displayEndpoint, points[segmentIndex], points[segmentIndex + 1]);
    const hydrologyProjection = closestPointOnSegment(point, points[segmentIndex], points[segmentIndex + 1]);
    const progressDistance = Math.abs(segmentIndex + 0.5 - expectedVertex);
    endpointCandidates.push({...endpointProjection, hydrologyDistance: distance(point, endpointProjection.point), progressDistance, segmentIndex});
    hydrologyCandidates.push({...hydrologyProjection, hydrologyDistance: hydrologyProjection.distance, progressDistance, segmentIndex, distance: distance(displayEndpoint, hydrologyProjection.point)});
  }
  const linkable = endpointCandidates.filter(candidate => candidate.distance <= maxLinkDistance + 1e-7);
  const candidates = linkable.length ? linkable : hydrologyCandidates;
  candidates.sort((left, right) => left.hydrologyDistance - right.hydrologyDistance || left.distance - right.distance || left.progressDistance - right.progressDistance || left.segmentIndex - right.segmentIndex);
  return candidates[0];
}

function cumulativePolylineLengths(points) {
  const lengths = [0];
  for (let index = 1; index < points.length; index += 1) lengths.push(lengths[index - 1] + distance(points[index - 1], points[index]));
  return lengths;
}

function segmentIndexAtPolylineLength(lengths, target) {
  for (let index = 1; index < lengths.length; index += 1) if (target <= lengths[index] + 1e-9) return index - 1;
  return Math.max(0, lengths.length - 2);
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
  const terminalSnapTolerance = Math.min(0.25, Math.max(0.05, Number(tolerance.localScale || 0) * 0.02));
  if (attachment.sharedTerminalCell && chord <= terminalSnapTolerance + 1e-7) {
    return {kind: "terminal-snap", variant: "canonical-local-endpoint-replacement", application: "replace-terminal", segment: null, sampledPoints: [start, end], curvature: 0, linear: true};
  }
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
  const scale = Math.min(Math.max(0.05, tolerance.localScale || chord * 0.2), Math.max(0.05, chord * 0.25));
  const maxSegmentLength = Math.max(0.5, Math.min(Number(settings.maxSegmentLength || 2), tolerance.localScale ? tolerance.localScale * 0.5 : 2, chord / 4));
  return [0, 0.5, -0.5, 1, -1].map(factor => {
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

function validateConfluenceCurve(snapshot, rivers, child, parent, curve, tolerance, attachment = null) {
  if (curve.sampledPoints.length <= 1) return safetyEvidence(true, null, {overshoot: 0, selfIntersections: 0, selfRetraces: 0, backtracks: 0, waterExcursions: 0, newWaterExcursions: 0, extraCrossings: 0});
  const start = curve.sampledPoints[0];
  const end = curve.sampledPoints.at(-1);
  const chord = distance(start, end);
  const expansion = Math.max(tolerance.localScale || 0, chord * 0.35, 0.5);
  const overshoot = curve.sampledPoints.filter(point => point[0] < Math.min(start[0], end[0]) - expansion || point[0] > Math.max(start[0], end[0]) + expansion || point[1] < Math.min(start[1], end[1]) - expansion || point[1] > Math.max(start[1], end[1]) + expansion).length;
  const candidatePoints = applyConfluenceCurveToPoints(child.points, curve);
  const selfIntersections = Math.max(0, polylineSelfIntersections(candidatePoints) - polylineSelfIntersections(child.points));
  const selfRetraces = Math.max(0, polylineSelfRetracesAndTouches(candidatePoints) - polylineSelfRetracesAndTouches(child.points));
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
  const comparedRivers = rivers.filter(river => river.id !== child.id);
  const childLengths = cumulativePolylineLengths(child.points);
  const candidateLengths = cumulativePolylineLengths(candidatePoints);
  const childBounds = polylineBounds(child.points);
  const candidateBounds = polylineBounds(candidatePoints);
  let baselineCrossings = 0;
  let candidateCrossings = 0;
  let extraCrossings = 0;
  for (const river of comparedRivers) {
    const riverLengths = cumulativePolylineLengths(river.points);
    const riverBounds = polylineBounds(river.points);
    const baselineEvents = polylineIntersectionEvents(child.points, river.points, childLengths, riverLengths, childBounds, riverBounds);
    const candidateEvents = polylineIntersectionEvents(candidatePoints, river.points, candidateLengths, riverLengths, candidateBounds, riverBounds);
    baselineCrossings += baselineEvents.length;
    candidateCrossings += candidateEvents.length;
    const evidence = baselineEvents.map(event => ({
      ...event,
      kind: "existing-display-intersection",
      ignoreProgress: true,
      ...(river.id === parent.id && event.type === "touch" && event.leftProgress >= 1 - 1e-7 ? {strictTolerance: 1e-7} : {})
    }));
    if (river.id === parent.id) {
      const shared = sharedCanonicalHydrologyItem(child, parent);
      const anchor = shared && Number(attachment?.hydrologyCell) === Number(shared.cell) ? attachment?.point : null;
      if (anchor && distance(end, anchor) <= 1e-7) evidence.push({point: [...anchor], kind: "allowed-confluence-endpoint", ignoreProgress: true, strictTolerance: 1e-7, tolerance: 0});
    } else if (Number(river.parent) === Number(parent.id) && Number(child.parent) === Number(parent.id)) {
      const siblingShared = sharedCanonicalHydrologyItem(child, river);
      const anchor = Number(siblingShared?.cell) === Number(attachment?.hydrologyCell) ? attachment?.point : null;
      if (anchor && distance(end, anchor) <= 1e-7 && distance(river.points.at(-1), anchor) <= 1e-7) {
        evidence.push({point: [...anchor], kind: "shared-cell-sibling-final-endpoint", ignoreProgress: true, strictTolerance: 1e-7, tolerance: 0});
      }
    }
    extraCrossings += unmatchedIntersectionEvents(candidateEvents, dedupeIntersectionEvidence(evidence)).length;
  }
  const metrics = {overshoot, selfIntersections, selfRetraces, backtracks, waterExcursions, newWaterExcursions, baselineCrossings, candidateCrossings, extraCrossings};
  const reason = overshoot ? "curve-overshoot" : selfIntersections || selfRetraces ? "curve-self-intersection" : backtracks ? "curve-backtracking" : newWaterExcursions ? "curve-water-excursion" : extraCrossings ? "curve-non-confluence-crossing" : null;
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
    parentHydrologyIndex: attachment.parentHydrologyIndex ?? null,
    parentSegmentIndex: attachment.segmentIndex ?? null,
    localSegmentStart: attachment.localSegmentStart ?? null,
    localSegmentEnd: attachment.localSegmentEnd ?? null,
    anchorKey: attachment.anchorKey || null,
    from: [...child.points.at(-1)],
    to: [...attachment.point],
    distance: roundNumber(extra.linkDistance),
    tolerance,
    status: extra.status,
    reason: extra.reason,
    curve: extra.curve ? {kind: extra.curve.kind, variant: extra.curve.variant || null, application: extra.curve.application || "append", segment: extra.curve.segment, sampledPoints: extra.curve.sampledPoints, curvature: extra.curve.curvature, linear: extra.curve.linear} : null,
    safety: extra.safety || null
  };
}

function applyConfluenceCurveToPoints(points, curve) {
  if (curve.application === "replace-terminal") return [...points.slice(0, -1).map(point => [...point]), [...curve.sampledPoints.at(-1)]];
  return [...points.map(point => [...point]), ...curve.sampledPoints.slice(1).map(point => [...point])];
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

function polylineSelfRetracesAndTouches(points) {
  let count = 0;
  for (let left = 1; left < points.length; left += 1) {
    for (let right = left + 1; right < points.length; right += 1) {
      const interaction = segmentIntersectionDetails(points[left - 1], points[left], points[right - 1], points[right], {includeEndpoints: true, includeCollinear: true});
      if (!interaction) continue;
      if (right === left + 1) {
        if (interaction.type === "overlap") count += 1;
        continue;
      }
      if (left === 1 && right === points.length - 1 && distance(points[0], points.at(-1)) <= 1e-7 && interaction.type === "touch") continue;
      if (interaction.type !== "proper") count += 1;
    }
  }
  return count;
}

function polylineCrossings(left, right, leftBounds = polylineBounds(left), rightBounds = polylineBounds(right)) {
  if (!boundsOverlap(leftBounds, rightBounds)) return 0;
  let count = 0;
  for (let leftIndex = 1; leftIndex < left.length; leftIndex += 1) {
    for (let rightIndex = 1; rightIndex < right.length; rightIndex += 1) if (segmentsIntersect(left[leftIndex - 1], left[leftIndex], right[rightIndex - 1], right[rightIndex])) count += 1;
  }
  return count;
}

function polylineIntersectionEvents(left, right, leftLengths = cumulativePolylineLengths(left), rightLengths = cumulativePolylineLengths(right), leftBounds = polylineBounds(left), rightBounds = polylineBounds(right)) {
  if (!boundsOverlap(leftBounds, rightBounds)) return [];
  const events = [];
  const leftTotal = leftLengths.at(-1) || 0;
  const rightTotal = rightLengths.at(-1) || 0;
  for (let leftIndex = 1; leftIndex < left.length; leftIndex += 1) {
    const leftSegmentLength = leftLengths[leftIndex] - leftLengths[leftIndex - 1];
    for (let rightIndex = 1; rightIndex < right.length; rightIndex += 1) {
      const intersection = segmentIntersectionDetails(left[leftIndex - 1], left[leftIndex], right[rightIndex - 1], right[rightIndex], {includeEndpoints: true, includeCollinear: true});
      if (!intersection) continue;
      const rightSegmentLength = rightLengths[rightIndex] - rightLengths[rightIndex - 1];
      const leftDistance = leftLengths[leftIndex - 1] + leftSegmentLength * intersection.t;
      const rightDistance = rightLengths[rightIndex - 1] + rightSegmentLength * intersection.u;
      events.push({
        point: intersection.point,
        leftSegmentIndex: leftIndex - 1,
        rightSegmentIndex: rightIndex - 1,
        leftProgress: leftTotal > 1e-9 ? leftDistance / leftTotal : 0,
        rightProgress: rightTotal > 1e-9 ? rightDistance / rightTotal : 0,
        leftTotal,
        rightTotal,
        tolerance: Math.min(8, Math.max(0.25, Math.min(leftSegmentLength, rightSegmentLength) * 0.35)),
        type: intersection.type
      });
    }
  }
  return dedupePolylineIntersectionEvents(events);
}

function segmentsIntersect(a, b, c, d) {
  return Boolean(segmentIntersectionDetails(a, b, c, d));
}

function dedupePolylineIntersectionEvents(events) {
  const result = [];
  for (const event of events) {
    const duplicate = result.some(existing => distance(existing.point, event.point) <= 1e-7
      && Math.abs(existing.leftProgress - event.leftProgress) <= 1e-7
      && Math.abs(existing.rightProgress - event.rightProgress) <= 1e-7);
    if (!duplicate) result.push(event);
  }
  return result;
}

function segmentIntersectionDetails(a, b, c, d, {includeEndpoints = false, includeCollinear = false} = {}) {
  const rx = b[0] - a[0];
  const ry = b[1] - a[1];
  const sx = d[0] - c[0];
  const sy = d[1] - c[1];
  const rLengthSquared = rx * rx + ry * ry;
  const sLengthSquared = sx * sx + sy * sy;
  if (rLengthSquared <= 1e-14 || sLengthSquared <= 1e-14) return null;
  const qx = c[0] - a[0];
  const qy = c[1] - a[1];
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < 1e-9) {
    if (!includeCollinear || Math.abs(qx * ry - qy * rx) > 1e-7 * Math.max(1, Math.sqrt(rLengthSquared))) return null;
    const first = (qx * rx + qy * ry) / rLengthSquared;
    const second = first + (sx * rx + sy * ry) / rLengthSquared;
    const overlapStart = Math.max(0, Math.min(first, second));
    const overlapEnd = Math.min(1, Math.max(first, second));
    if (overlapEnd < overlapStart - 1e-7) return null;
    const t = Math.max(0, Math.min(1, (overlapStart + overlapEnd) / 2));
    const point = [a[0] + rx * t, a[1] + ry * t];
    const u = Math.max(0, Math.min(1, ((point[0] - c[0]) * sx + (point[1] - c[1]) * sy) / sLengthSquared));
    if (overlapEnd - overlapStart > 1e-7) return {t, u, point, type: "overlap", leftRange: [overlapStart, overlapEnd]};
    return includeEndpoints ? {t, u, point, type: "touch"} : null;
  }
  const rawT = (qx * sy - qy * sx) / denominator;
  const rawU = (qx * ry - qy * rx) / denominator;
  const interior = rawT > 1e-7 && rawT < 1 - 1e-7 && rawU > 1e-7 && rawU < 1 - 1e-7;
  if (!interior && (!includeEndpoints || rawT < -1e-7 || rawT > 1 + 1e-7 || rawU < -1e-7 || rawU > 1 + 1e-7)) return null;
  const t = Math.max(0, Math.min(1, rawT));
  const u = Math.max(0, Math.min(1, rawU));
  return {t, u, point: [a[0] + rx * t, a[1] + ry * t], type: interior ? "proper" : "touch"};
}

function polylineBounds(points) {
  if (!points.length) return null;
  return {minX: Math.min(...points.map(point => point[0])), minY: Math.min(...points.map(point => point[1])), maxX: Math.max(...points.map(point => point[0])), maxY: Math.max(...points.map(point => point[1]))};
}

function boundsOverlap(left, right) {
  return left && right && left.minX <= right.maxX && left.maxX >= right.minX && left.minY <= right.maxY && left.maxY >= right.minY;
}

function safetyEvidence(accepted, reason, metrics) {
  return {accepted, reason, gates: {overshoot: metrics.overshoot === 0, selfIntersection: metrics.selfIntersections === 0 && Number(metrics.selfRetraces || 0) === 0, backtracking: metrics.backtracks === 0, water: metrics.newWaterExcursions === 0, nonConfluenceCrossing: metrics.extraCrossings === 0}, metrics};
}

export function inspectConfluenceCurveSafety(snapshot, childId, parentId, sampledPoints) {
  const rivers = normalizeRivers(snapshot);
  const child = rivers.find(river => river.id === Number(childId));
  const parent = rivers.find(river => river.id === Number(parentId));
  if (!child || !parent || !Array.isArray(sampledPoints) || sampledPoints.length < 2) throw new Error("曲线安全夹具缺少有效关系或采样点");
  const attachment = resolveHydrologyAttachment(snapshot, child, parent) || {
    ...closestPointOnPolyline(sampledPoints.at(-1), parent.points),
    sharedTerminalCell: false,
    gridSpacing: Number(snapshot?.metadata?.gridSpacing || 0)
  };
  const tolerance = localConfluenceTolerance(snapshot, child, parent, attachment, {snapTolerance: 12, maxSnapTolerance: 24, maxSegmentLength: 2});
  return validateConfluenceCurve(snapshot, rivers, child, parent, {sampledPoints: sampledPoints.map(point => [...point])}, tolerance, attachment);
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

export function classifyRiverVisualFragment(river, options = {}) {
  const settings = {minLength: 24, minWidth: 0.035, ...options};
  const length = polylineLength(river.points);
  const width = Number(river.width || 0);
  const fragment = river.points.length < 3 || length < settings.minLength || width < settings.minWidth;
  if (!fragment) return {riverId: river.id, policy: "preserve", length: roundNumber(length), width};
  if (isProtectedOutlet(river.outletKind)) return {riverId: river.id, policy: "preserve-protected-outlet", length: roundNumber(length), width};
  if (river.parent && options.hasConfluenceAnchor) return {riverId: river.id, policy: "extend-to-confluence", length: roundNumber(length), width};
  if (length < settings.minLength * 0.5 || width < settings.minWidth * 0.5) return {riverId: river.id, policy: "hide-visual-only", length: roundNumber(length), width};
  return {riverId: river.id, policy: "preserve", length: roundNumber(length), width};
}

export function shouldHideRiverVisualFragment(river, options = {}) {
  return classifyRiverVisualFragment(river, options).policy === "hide-visual-only";
}

function classifyFragment(river, settings, confluence) {
  const hasConfluenceAnchor = (confluence.anchors || []).some(anchor => anchor.childId === river.id);
  return classifyRiverVisualFragment(river, {...settings, hasConfluenceAnchor});
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
