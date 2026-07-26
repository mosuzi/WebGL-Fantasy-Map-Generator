const WATER_LEVEL = 20;

export function normalizeRiverNetwork(rivers, pack, {dropIncomplete = false} = {}) {
  const source = Array.isArray(rivers) ? rivers.filter(Boolean) : [];
  const cells = pack?.cells || {};
  const byId = new Map(source.map(river => [riverIdOf(river), river]));
  const diagnostics = {
    total: source.length,
    repaired: 0,
    dropped: 0,
    missingParents: 0,
    selfParents: 0,
    disconnectedParents: 0,
    disconnectedPaths: 0,
    invalidWaterOutlets: 0,
    invalidBorderOutlets: 0,
    invalidBasins: 0,
    issueExamples: [],
    cycles: 0,
    lakeInlets: 0,
    orphaned: 0
  };

  for (const river of source) {
    const id = riverIdOf(river);
    const declaredParent = Number(river.parent || 0);
    const outlet = classifyRiverOutlet(river, pack);
    const receiver = outlet.kind === "inland"
      ? findDirectReceiver(river, source, cells, declaredParent)
      : null;

    if (declaredParent === id) diagnostics.selfParents++;
    else if (declaredParent && !byId.has(declaredParent)) diagnostics.missingParents++;
    else if (declaredParent && !isDirectReceiver(river, byId.get(declaredParent), cells)) diagnostics.disconnectedParents++;
    if (outlet.issue === "disconnected-path") diagnostics.disconnectedPaths++;
    if (outlet.issue === "invalid-water-outlet") diagnostics.invalidWaterOutlets++;
    if (outlet.issue === "invalid-border-outlet") diagnostics.invalidBorderOutlets++;
    if (outlet.issue && diagnostics.issueExamples.length < 12) diagnostics.issueExamples.push({riverId: id, issue: outlet.issue});

    if (receiver) {
      writeRiverRelation(river, {
        parent: riverIdOf(receiver),
        confluence: outlet.cell,
        outletKind: "confluence",
        outletFeatureId: 0,
        networkStatus: "valid",
        networkIssue: ""
      });
    } else if (outlet.kind !== "inland") {
      writeRiverRelation(river, {
        parent: 0,
        confluence: -1,
        outletKind: outlet.kind,
        outletFeatureId: outlet.featureId,
        networkStatus: outlet.status,
        networkIssue: ""
      });
      if (outlet.kind === "lake") diagnostics.lakeInlets++;
    } else {
      writeRiverRelation(river, {
        parent: 0,
        confluence: -1,
        outletKind: "inland",
        outletFeatureId: 0,
        networkStatus: "orphaned",
        networkIssue: outlet.issue || "missing-outlet"
      });
      diagnostics.orphaned++;
    }

    if (declaredParent !== Number(river.parent || 0)) {
      river.legacyParent = declaredParent || undefined;
      diagnostics.repaired++;
    } else {
      delete river.legacyParent;
    }
  }

  breakParentCycles(source, diagnostics);
  markInvalidBasins(source, diagnostics);

  let normalized = source;
  if (dropIncomplete) {
    const droppedIds = collectIncompleteRiverIds(source);
    if (droppedIds.size) {
      normalized = source.filter(river => !droppedIds.has(riverIdOf(river)));
      diagnostics.dropped = droppedIds.size;
      for (const river of normalized) {
        if (!droppedIds.has(Number(river.parent || 0))) continue;
        writeRiverRelation(river, {
          parent: 0,
          confluence: -1,
          outletKind: "inland",
          outletFeatureId: 0,
          networkStatus: "orphaned",
          networkIssue: "invalid-downstream-basin"
        });
      }
      const cascading = collectIncompleteRiverIds(normalized);
      if (cascading.size) {
        normalized = normalized.filter(river => !cascading.has(riverIdOf(river)));
        diagnostics.dropped += cascading.size;
      }
    }
  }

  resolveRiverBasins(normalized);
  return {rivers: normalized, diagnostics};
}

export function describeRiverRelation(river, rivers) {
  const source = Array.isArray(rivers) ? rivers : [];
  const byId = new Map(source.filter(Boolean).map(item => [riverIdOf(item), item]));
  const parentId = Number(river?.parent || 0);
  const basinId = Number(river?.basin || riverIdOf(river) || 0);
  const parent = byId.get(parentId) || null;
  const basin = byId.get(basinId) || null;
  return {
    parentId,
    parentName: parent?.name || "",
    parentExists: !parentId || Boolean(parent),
    basinId,
    basinName: basin?.name || "",
    confluence: Number.isInteger(Number(river?.confluence)) ? Number(river.confluence) : -1,
    outletKind: river?.outletKind || (parentId ? "confluence" : "unknown"),
    outletFeatureId: Number(river?.outletFeatureId || 0),
    networkStatus: river?.networkStatus || (parentId && !parent ? "orphaned" : "valid"),
    networkIssue: river?.networkIssue || ""
  };
}

function findDirectReceiver(river, rivers, cells, declaredParent) {
  const declared = rivers.find(candidate => riverIdOf(candidate) === declaredParent);
  if (isDirectReceiver(river, declared, cells)) return declared;

  return rivers
    .filter(candidate => isDirectReceiver(river, candidate, cells))
    .sort((a, b) => receiverScore(b) - receiverScore(a) || riverIdOf(a) - riverIdOf(b))[0] || null;
}

function isDirectReceiver(river, candidate, cells) {
  if (!river || !candidate || riverIdOf(river) === riverIdOf(candidate)) return false;
  const mouth = riverMouthCell(river);
  if (!Number.isInteger(mouth) || mouth < 0 || Number(cells.h?.[mouth]) < WATER_LEVEL) return false;
  const path = Array.isArray(candidate.cells) ? candidate.cells : [];
  const index = path.lastIndexOf(mouth);
  if (index < 0 || index >= path.length - 1) return false;
  return path.slice(index + 1).some(cell => cell === -1 || (Number.isInteger(cell) && cell !== mouth));
}

function receiverScore(river) {
  return Number(river?.discharge || river?.flux || 0) * 1000 + (river?.cells?.length || 0);
}

function classifyRiverOutlet(river, pack) {
  const path = Array.isArray(river?.cells) ? river.cells : [];
  const pathIssue = findRiverPathIssue(path, pack?.cells);
  if (pathIssue) return {kind: "inland", status: "orphaned", featureId: 0, cell: riverMouthCell(river), issue: pathIssue};
  if (path.at(-1) === -1) {
    const cell = riverMouthCell(river);
    if (Number(pack?.cells?.b?.[cell])) return {kind: "border", status: "border-outlet", featureId: 0, cell};
    return {kind: "inland", status: "orphaned", featureId: 0, cell, issue: "invalid-border-outlet"};
  }
  const cell = riverMouthCell(river);
  const height = Number(pack?.cells?.h?.[cell]);
  if (Number.isFinite(height) && height < WATER_LEVEL) {
    const landCell = path.at(-2);
    if (!isValidRiverWaterOutlet(river, pack, landCell, cell)) {
      return {kind: "inland", status: "orphaned", featureId: 0, cell, issue: "invalid-water-outlet"};
    }
    const feature = pack?.features?.[pack.cells?.f?.[cell]];
    if (feature?.type === "lake") return {kind: "lake", status: "lake-inlet", featureId: Number(feature.i ?? feature.id ?? 0), cell};
    if (feature?.type === "ocean" && feature.border === true) return {kind: "ocean", status: "ocean-mouth", featureId: Number(feature.i ?? feature.id ?? 0), cell};
    return {kind: "inland", status: "orphaned", featureId: Number(feature?.i ?? feature?.id ?? 0), cell, issue: "invalid-water-outlet"};
  }
  return {kind: "inland", status: "orphaned", featureId: 0, cell, issue: "missing-outlet"};
}

function isValidRiverWaterOutlet(river, pack, landCell, waterCell) {
  const cells = pack?.cells;
  if (!Number.isInteger(landCell) || landCell < 0 || Number(cells?.h?.[landCell]) < WATER_LEVEL) return false;
  if (!(cells.c?.[landCell] || []).includes(waterCell)) return false;
  const cellVertices = cells.v;
  const vertices = pack?.vertices?.p;
  const points = river?.points;
  if (!cellVertices || !vertices || !Array.isArray(points) || !points.length) return true;
  const waterVertices = new Set(cellVertices[waterCell] || []);
  const shared = (cellVertices[landCell] || []).filter(vertex => waterVertices.has(vertex));
  if (shared.length < 2) return false;
  const edgeStart = vertices[shared[0]];
  const edgeEnd = vertices[shared[1]];
  const endpoint = points.at(-1);
  if (!isPoint(edgeStart) || !isPoint(edgeEnd) || !isPoint(endpoint)) return false;
  const tolerance = Math.max(0.1, Math.hypot(edgeEnd[0] - edgeStart[0], edgeEnd[1] - edgeStart[1]) * 0.02);
  return distanceToSegment(endpoint, edgeStart, edgeEnd) <= tolerance;
}

function distanceToSegment(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= Number.EPSILON) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const amount = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared));
  return Math.hypot(point[0] - (start[0] + dx * amount), point[1] - (start[1] + dy * amount));
}

function isPoint(point) {
  return Number.isFinite(point?.[0]) && Number.isFinite(point?.[1]);
}

function riverMouthCell(river) {
  const path = Array.isArray(river?.cells) ? river.cells : [];
  for (let index = path.length - 1; index >= 0; index--) {
    if (Number.isInteger(path[index]) && path[index] >= 0) return path[index];
  }
  const mouth = Number(river?.mouth);
  if (Number.isInteger(mouth) && mouth >= 0) return mouth;
  return -1;
}

function writeRiverRelation(river, relation) {
  river.parent = relation.parent;
  river.basin = relation.parent || riverIdOf(river);
  river.confluence = relation.confluence;
  river.outletKind = relation.outletKind;
  river.networkStatus = relation.networkStatus;
  if (relation.networkIssue) river.networkIssue = relation.networkIssue;
  else delete river.networkIssue;
  if (relation.outletFeatureId) river.outletFeatureId = relation.outletFeatureId;
  else delete river.outletFeatureId;
  river.type = relation.parent ? "Branch" : "River";
}

function breakParentCycles(rivers, diagnostics) {
  const byId = new Map(rivers.map(river => [riverIdOf(river), river]));
  for (const river of rivers) {
    const seen = new Set();
    let current = river;
    while (Number(current?.parent || 0)) {
      const id = riverIdOf(current);
      if (seen.has(id)) {
        writeRiverRelation(current, {
          parent: 0,
          confluence: -1,
          outletKind: "inland",
          outletFeatureId: 0,
          networkStatus: "orphaned",
          networkIssue: "parent-cycle"
        });
        diagnostics.cycles++;
        diagnostics.orphaned++;
        break;
      }
      seen.add(id);
      current = byId.get(Number(current.parent));
      if (!current) break;
    }
  }
}

function markInvalidBasins(rivers, diagnostics) {
  const byId = new Map(rivers.map(river => [riverIdOf(river), river]));
  for (const river of rivers) {
    const chain = [];
    const seen = new Set();
    let current = river;
    while (current) {
      const id = riverIdOf(current);
      if (seen.has(id)) break;
      seen.add(id);
      chain.push(current);
      current = Number(current.parent || 0) ? byId.get(Number(current.parent)) : null;
    }
    const root = chain.at(-1);
    if (root?.networkStatus !== "orphaned") continue;
    for (const member of chain) {
      if (member.networkStatus === "orphaned") continue;
      member.networkStatus = "orphaned";
      member.networkIssue = "invalid-downstream-basin";
      diagnostics.invalidBasins++;
      diagnostics.orphaned++;
    }
  }
}

function findRiverPathIssue(path, cells) {
  if (!Array.isArray(path) || path.length < 2) return "disconnected-path";
  const adjacency = cells?.c;
  if (!adjacency) return "";
  for (let index = 0; index < path.length - 1; index++) {
    const from = path[index];
    const to = path[index + 1];
    if (to === -1) {
      if (index !== path.length - 2) return "disconnected-path";
      continue;
    }
    if (!Number.isInteger(from) || from < 0 || !Number.isInteger(to) || to < 0) return "disconnected-path";
    if (!(adjacency[from] || []).includes(to)) return "disconnected-path";
  }
  return "";
}

function collectIncompleteRiverIds(rivers) {
  const dropped = new Set(rivers
    .filter(river => river.networkStatus === "orphaned")
    .map(riverIdOf));
  let changed = true;
  while (changed) {
    changed = false;
    for (const river of rivers) {
      const id = riverIdOf(river);
      if (dropped.has(id) || !dropped.has(Number(river.parent || 0))) continue;
      dropped.add(id);
      changed = true;
    }
  }
  return dropped;
}

function resolveRiverBasins(rivers) {
  const byId = new Map(rivers.map(river => [riverIdOf(river), river]));
  for (const river of rivers) {
    let root = river;
    const seen = new Set([riverIdOf(river)]);
    while (Number(root.parent || 0) && byId.has(Number(root.parent))) {
      const next = byId.get(Number(root.parent));
      const id = riverIdOf(next);
      if (seen.has(id)) break;
      seen.add(id);
      root = next;
    }
    river.basin = riverIdOf(root);
  }
}

function riverIdOf(river) {
  return Number(river?.id ?? river?.i ?? 0);
}
