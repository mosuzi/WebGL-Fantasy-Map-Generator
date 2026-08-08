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

function normalizeRivers(snapshot) {
  const source = Array.isArray(snapshot?.rivers) ? snapshot.rivers : [];
  return source.map((river, index) => ({
    id: Number(river.id ?? index + 1),
    parent: Number(river.parent || 0),
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

function sameSet(left, right) {
  return left.length === right.length && left.every(id => right.includes(id));
}
