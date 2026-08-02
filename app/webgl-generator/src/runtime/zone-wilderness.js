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
    const inheritedName = shouldPreserveWildernessName(old) && old.name && !usedNames.has(old.name) ? old.name : "";
    const name = inheritedName || uniqueWildernessName(wildernessSemanticName(pack, cells), usedNames);
    usedNames.add(name);
    return {
      i: id,
      id,
      name,
      nameMode: inheritedName ? "manual" : "auto",
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

function shouldPreserveWildernessName(zone) {
  if (zone?.nameMode === "manual") return true;
  if (zone?.nameMode === "auto") return false;
  const name = String(zone?.name || "").trim();
  return Boolean(name) && !/^荒(?:野|原)\s*\d+$/u.test(name);
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

export function wildernessSemanticName(pack, component) {
  const cells = [...new Set((component || []).filter(Number.isInteger))].sort((left, right) => left - right);
  if (!cells.length) return "无名荒原";
  const selected = new Set(cells);
  const border = [];
  for (const cell of cells) {
    for (const neighbor of pack?.cells?.c?.[cell] || []) {
      if (!selected.has(neighbor)) border.push(neighbor);
    }
  }

  const burg = dominantNamedRecord(pack?.burgs, border.map(cell => pack?.cells?.burg?.[cell]));
  if (burg) return `${nameRoot(burg.name)}外野`;
  const province = dominantNamedRecord(pack?.provinces, border.map(cell => pack?.cells?.province?.[cell]));
  if (province) return `${nameRoot(province.fullName || province.name)}荒原`;
  const culture = dominantNamedRecord(pack?.cultures, [...cells, ...border].map(cell => pack?.cells?.culture?.[cell]));
  if (culture) return `${nameRoot(culture.name)}原野`;

  const borderStates = border.map(cell => Number(pack?.cells?.state?.[cell] || 0)).filter(id => id > 0);
  const state = clearlyDominantRecord(pack?.states, borderStates, border.length);
  if (state) return `${nameRoot(state.fullName || state.name)}边荒`;
  return fallbackWildernessName(pack, cells);
}

function dominantNamedRecord(records, ids) {
  const ranked = rankIds(ids);
  for (const {id} of ranked) {
    const record = recordById(records, id);
    if (record && !record.removed && String(record.name || record.fullName || "").trim()) return record;
  }
  return null;
}

function clearlyDominantRecord(records, ids, borderSize) {
  const ranked = rankIds(ids);
  const first = ranked[0];
  if (!first || first.count < Math.max(2, Math.ceil(borderSize * 0.4))) return null;
  if (first.count / ids.length < 0.6 || (ranked[1] && first.count < ranked[1].count * 1.5)) return null;
  return dominantNamedRecord(records, [first.id]);
}

function rankIds(ids) {
  const counts = new Map();
  for (const raw of ids || []) {
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return [...counts].map(([id, count]) => ({id, count})).sort((left, right) => right.count - left.count || left.id - right.id);
}

function recordById(records, id) {
  const direct = records?.[id];
  if (direct && Number(direct.i ?? direct.id ?? id) === id) return direct;
  return (records || []).find(record => Number(record?.i ?? record?.id) === id) || null;
}

function nameRoot(value) {
  return String(value || "").trim().replace(/(?:共和国|联合王国|帝国|王国|公国|省|州|郡|府|道|领|盟|旗)$/u, "") || "无名";
}

function fallbackWildernessName(pack, cells) {
  const points = (pack?.cells?.p || []).filter(point => Array.isArray(point) && point.length >= 2);
  const selected = cells.map(cell => pack?.cells?.p?.[cell]).filter(point => Array.isArray(point) && point.length >= 2);
  if (!points.length || !selected.length) return "无名荒原";
  const bounds = points.reduce((result, point) => ({
    minX: Math.min(result.minX, Number(point[0])),
    maxX: Math.max(result.maxX, Number(point[0])),
    minY: Math.min(result.minY, Number(point[1])),
    maxY: Math.max(result.maxY, Number(point[1]))
  }), {minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity});
  const x = selected.reduce((sum, point) => sum + Number(point[0]), 0) / selected.length;
  const y = selected.reduce((sum, point) => sum + Number(point[1]), 0) / selected.length;
  const xRatio = ratioInRange(x, bounds.minX, bounds.maxX);
  const yRatio = ratioInRange(y, bounds.minY, bounds.maxY);
  const vertical = yRatio < 0.3 ? "北境" : yRatio > 0.7 ? "南境" : "";
  const horizontal = xRatio < 0.3 ? "西境" : xRatio > 0.7 ? "东境" : "";
  const direction = `${vertical}${horizontal}` || "腹地";
  const landforms = ["荒原", "旷野", "荒甸", "野地"];
  const fingerprint = cells.reduce((sum, cell, index) => sum + (cell + 1) * (index + 3), 0);
  return `${direction}${landforms[Math.abs(fingerprint) % landforms.length]}`;
}

function ratioInRange(value, min, max) {
  return max > min ? (value - min) / (max - min) : 0.5;
}

function uniqueWildernessName(baseName, used) {
  let suffix = 1;
  let name = baseName;
  while (used.has(name)) name = `${baseName} ${++suffix}`;
  return name;
}

function pointDistance(left, right) {
  return Math.hypot(left[0] - right[0], left[1] - right[1]);
}
