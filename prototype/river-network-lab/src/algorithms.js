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
  const settings = {snapTolerance: 12, ...options};
  const graph = analyzeParentGraph(snapshot);
  const rivers = graph.rivers;
  const byId = new Map(rivers.map(river => [river.id, river]));
  const issues = [];
  const anchors = [];
  let protectedOutlets = 0;
  let changedPoints = 0;
  let maxDistance = 0;
  for (const child of rivers) {
    if (!child.parent) continue;
    const parent = byId.get(child.parent);
    const childEnd = child.points.at(-1);
    if (!parent || !childEnd || parent.points.length < 2) continue;
    const attachment = closestPointOnPolyline(childEnd, parent.points);
    maxDistance = Math.max(maxDistance, attachment.distance);
    if (isProtectedOutlet(child.outletKind)) {
      protectedOutlets += 1;
      issues.push({id: "protected-outlet", severity: "info", riverIds: [child.id, parent.id], distance: attachment.distance, message: "保留湖泊、河口或边界出口，不执行几何吸附。"});
      continue;
    }
    if (attachment.distance > settings.snapTolerance) {
      issues.push({id: "confluence-unattached", severity: "warn", riverIds: [child.id, parent.id], distance: attachment.distance, message: "支流末端超出汇流锚点容差，候选拒绝整体吸附。"});
      continue;
    }
    anchors.push({childId: child.id, parentId: parent.id, from: childEnd, to: attachment.point, distance: attachment.distance});
    if (attachment.distance > 1e-7) changedPoints += 1;
  }
  const rejected = !graph.ok || issues.some(issue => issue.severity === "warn");
  return {
    ok: !rejected,
    issues,
    anchors,
    protectedOutlets,
    metrics: {
      relations: rivers.filter(river => river.parent).length,
      attached: anchors.length,
      unattached: issues.filter(issue => issue.id === "confluence-unattached").length,
      protectedOutlets,
      changedPoints,
      maxDistance: Number(maxDistance.toFixed(3)),
      snapTolerance: settings.snapTolerance,
      graphRejected: !graph.ok
    }
  };
}

export function runConfluenceCandidate(snapshot, options = {}) {
  const graphCandidate = runDAGCandidate(snapshot);
  const geometry = analyzeConfluences(snapshot, options);
  if (!graphCandidate.accepted || !geometry.ok) {
    return {accepted: false, rejection: {reason: !graphCandidate.accepted ? "parent-graph-rejected" : "confluence-anchor-rejected", graph: graphCandidate.rejection, issues: geometry.issues}, metrics: geometry.metrics, candidateRivers: null};
  }
  const anchorsByChild = new Map(geometry.anchors.map(anchor => [anchor.childId, anchor.to]));
  const candidateRivers = graphCandidate.candidateRivers.map(river => {
    const anchor = anchorsByChild.get(river.id);
    if (!anchor || isProtectedOutlet(river.outletKind)) return cloneRiver(river);
    return {...cloneRiver(river), points: [...river.points.slice(0, -1), [...anchor]]};
  });
  return {accepted: true, rejection: null, metrics: geometry.metrics, candidateRivers};
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
  return {...river, cells: [...river.cells], points: river.points.map(point => [...point])};
}

function closestPointOnPolyline(point, points) {
  let best = null;
  for (let index = 1; index < points.length; index += 1) {
    const candidate = closestPointOnSegment(point, points[index - 1], points[index]);
    if (!best || candidate.distance < best.distance) best = candidate;
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

function isProtectedOutlet(outletKind) {
  const value = String(outletKind || "");
  return value.includes("lake") || value === "ocean" || value === "border";
}

function sameSet(left, right) {
  return left.length === right.length && left.every(id => right.includes(id));
}
