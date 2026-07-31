export const WILDERNESS_POPULATION_THRESHOLD = 0.5;

export function rebuildWildernessZones(pack, zones = [], options = {}) {
  const protectedIds = new Set((options.preservedZones || []).filter(zone => zone?.source === "auto-wilderness").map(zone => Number(zone?.i ?? zone?.id)));
  const retained = (zones || []).filter(zone => zone?.source !== "auto-wilderness" || protectedIds.has(Number(zone?.i ?? zone?.id)));
  const previous = (zones || []).filter(zone => zone?.source === "auto-wilderness" && !protectedIds.has(Number(zone?.i ?? zone?.id)));
  const occupiedBase = new Set(retained.filter(zone => zone?.coverage === "base" || zone?.source === "auto-wilderness").flatMap(zone => zone?.cells || []));
  const components = collectWildernessComponents(pack, occupiedBase);
  const assignments = matchComponents(previous, components);
  const reservedIds = new Set(retained.map(zone => Number(zone?.i ?? zone?.id)).filter(Number.isInteger));
  const usedNames = new Set(retained.map(zone => String(zone?.name || "")).filter(Boolean));
  const wilderness = components.map((cells, index) => {
    const old = assignments.get(index);
    const id = old ? Number(old.i ?? old.id) : nextId(reservedIds);
    reservedIds.add(id);
    const inheritedName = old?.name && !usedNames.has(old.name) ? old.name : "";
    const name = inheritedName || uniqueWildernessName(id, usedNames);
    usedNames.add(name);
    return {
      i: id,
      id,
      name,
      nameMode: old?.nameMode === "manual" ? "manual" : "auto",
      type: "Wilderness",
      category: "natural",
      source: "auto-wilderness",
      customTypeName: "",
      description: "无国家归属、无城市且人口稀少的连通陆地区域",
      coverage: "base",
      effects: {habitability: 0, movementCost: 1, economy: 1, defense: 0},
      cells,
      color: old?.color || "#777064",
      pattern: old?.pattern || "diagonal",
      hexColor: old?.hexColor || "#777064",
      hidden: Boolean(old?.hidden),
      context: old?.context || {status: "active", participants: []}
    };
  });
  return [...retained, ...wilderness];
}

export function collectWildernessComponents(pack, excluded = new Set()) {
  const cells = pack?.cells;
  const candidates = new Set((cells?.i || []).filter(cell => !excluded.has(cell) && isWildernessCell(cells, cell)));
  const components = [];
  while (candidates.size) {
    const start = candidates.values().next().value;
    candidates.delete(start);
    const component = [];
    const queue = [start];
    while (queue.length) {
      const cell = queue.shift();
      component.push(cell);
      for (const neighbor of cells.c?.[cell] || []) {
        if (!candidates.has(neighbor)) continue;
        candidates.delete(neighbor);
        queue.push(neighbor);
      }
    }
    components.push(component.sort((left, right) => left - right));
  }
  return components.sort((left, right) => left[0] - right[0]);
}

export function wildernessLabelAnchor(pack, zone) {
  const cells = (zone?.cells || []).filter(cell => Number.isInteger(cell) && Array.isArray(pack?.cells?.p?.[cell]));
  if (!cells.length) return null;
  const centroid = cells.reduce((sum, cell) => [sum[0] + pack.cells.p[cell][0], sum[1] + pack.cells.p[cell][1]], [0, 0]).map(value => value / cells.length);
  const anchorCell = cells.slice().sort((left, right) => pointDistance(pack.cells.p[left], centroid) - pointDistance(pack.cells.p[right], centroid) || left - right)[0];
  return {cell: anchorCell, x: pack.cells.p[anchorCell][0], y: pack.cells.p[anchorCell][1]};
}

function isWildernessCell(cells, cell) {
  return Number(cells.h?.[cell]) >= 20
    && Number(cells.state?.[cell] || 0) === 0
    && Number(cells.burg?.[cell] || 0) === 0
    && Number(cells.pop?.[cell] || 0) <= WILDERNESS_POPULATION_THRESHOLD;
}

function matchComponents(previous, components) {
  const pairs = [];
  for (let componentIndex = 0; componentIndex < components.length; componentIndex++) {
    const selected = new Set(components[componentIndex]);
    for (const zone of previous) {
      const overlap = (zone.cells || []).reduce((count, cell) => count + (selected.has(cell) ? 1 : 0), 0);
      if (overlap) pairs.push({componentIndex, zone, overlap, zoneId: Number(zone.i ?? zone.id)});
    }
  }
  pairs.sort((left, right) => right.overlap - left.overlap || left.componentIndex - right.componentIndex || left.zoneId - right.zoneId);
  const assignedComponents = new Set();
  const assignedZones = new Set();
  const result = new Map();
  for (const pair of pairs) {
    if (assignedComponents.has(pair.componentIndex) || assignedZones.has(pair.zoneId)) continue;
    assignedComponents.add(pair.componentIndex);
    assignedZones.add(pair.zoneId);
    result.set(pair.componentIndex, pair.zone);
  }
  return result;
}

function nextId(reserved) {
  let id = 0;
  while (reserved.has(id)) id += 1;
  return id;
}

function uniqueWildernessName(id, used) {
  let suffix = id + 1;
  let name = `荒野 ${suffix}`;
  while (used.has(name)) name = `荒野 ${++suffix}`;
  return name;
}

function pointDistance(left, right) {
  return Math.hypot(left[0] - right[0], left[1] - right[1]);
}
