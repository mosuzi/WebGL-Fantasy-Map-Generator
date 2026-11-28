import {getSharedSegment} from "../generator/features.js";
import {createPackFeature, defineFeatureGroups, defineHaven} from "../generator/pack.js";

// When the remaining neighbours around a removed cell still connect around
// its rim, removing it cannot split that component. The new side must touch
// exactly one component. Test the whole stroke before changing either table.
function ordinaryCoastPlan(cells, features, changed) {
  const assignments = new Map(), transfers = [];
  const idAt = cell => assignments.get(cell) ?? cells.f[cell];
  for (const cell of changed) {
    const old = idAt(cell), land = cells.h[cell] >= 20;
    if (features[old]?.land === land) continue;
    if (cells.b[cell] || features[old]?.type === "lake") return null;
    const adjacent = cells.c[cell];
    const targets = new Set(adjacent.map(idAt).filter(id => features[id]?.land === land));
    const rim = new Set(adjacent.filter(n => idAt(n) === old));
    if (targets.size !== 1 || !rim.size) return null;
    const [target] = targets;
    if (features[target]?.type === "lake") return null;
    const queue = [rim.values().next().value];
    rim.delete(queue[0]);
    for (let i = 0; i < queue.length; i++) for (const n of cells.c[queue[i]]) if (rim.delete(n)) queue.push(n);
    if (rim.size) return null;
    transfers.push({cell, old, target});
    assignments.set(cell, target);
  }
  return transfers;
}

function applyOrdinaryCoast(mesh, features, transfers, packed, write) {
  const cells = mesh.cells, touched = new Map();
  for (const {cell, old, target} of transfers) {
    write("f", cell, target);
    if (cells.type) write("type", cell, features[target].type);
    for (const id of [old, target]) {
      if (!touched.has(id)) touched.set(id, {incoming: [], outgoing: []});
      touched.get(id)[id === old ? "outgoing" : "incoming"].push(cell);
    }
  }
  for (const [id, {incoming, outgoing}] of touched) {
    const f = features[id], removed = new Set(outgoing);
    if (!packed) {
      const members = [...f.cells.filter(i => !removed.has(i)), ...incoming].sort((a, b) => a - b);
      features[id] = {...f, cells: members, firstCell: members[0]};
      continue;
    }
    const next = {...f, cells: f.cells + incoming.length - outgoing.length,
      area: Math.round(f.area + incoming.reduce((sum, i) => sum + cells.area[i], 0) - outgoing.reduce((sum, i) => sum + cells.area[i], 0))};
    if (removed.has(f.firstCell)) next.firstCell = [...incoming, ...outgoing.flatMap(i => cells.c[i])].find(i => cells.f[i] === id);
    if (f.land) {
      const affected = new Set([...incoming, ...outgoing].flatMap(i => cells.v[i]));
      const vertices = (f.vertices || []).filter(v => !affected.has(v));
      for (const v of affected) {
        const members = mesh.vertices.c[v].filter(i => i >= 0 && i < cells.f.length);
        if (members.some(i => cells.f[i] === id) && members.some(i => cells.f[i] !== id)) vertices.push(v);
      }
      next.vertices = vertices;
    }
    features[id] = next;
  }
  return {waterChanged: new Set(transfers.map(({cell}) => cell)), components: [...touched.keys()].map(id => ({id, land: features[id].land, border: features[id].border}))};
}

// A changed edge can only split or join components touching one of its ends.
// Keep the largest surviving overlap's id, including on maps with retired ids.
function updateComponents(mesh, features, changed, packed, write, buildFeature) {
  const cells = mesh.cells;
  const ordinary = ordinaryCoastPlan(cells, features, changed);
  if (ordinary) return applyOrdinaryCoast(mesh, features, ordinary, packed, write);
  const impacted = new Set();
  for (const cell of changed) {
    impacted.add(cells.f[cell]);
    for (const n of cells.c[cell]) if ((cells.h[n] >= 20) === (cells.h[cell] >= 20)) impacted.add(cells.f[n]);
  }
  const members = new Set();
  if (packed) {
    for (let i = 0; i < cells.f.length; i++) if (impacted.has(cells.f[i])) members.add(i);
  } else {
    for (const id of impacted) for (const cell of features[id]?.cells || []) members.add(cell);
  }
  const components = [];
  for (const seed of members) {
    const land = cells.h[seed] >= 20;
    const list = [seed], votes = new Map();
    members.delete(seed);
    let border = false;
    for (let i = 0; i < list.length; i++) {
      const cell = list[i], old = cells.f[cell];
      if (features[old]?.land === land) votes.set(old, (votes.get(old) || 0) + 1);
      if (cells.b[cell]) border = true;
      for (const n of cells.c[cell]) if ((cells.h[n] >= 20) === land && members.delete(n)) list.push(n);
    }
    components.push({list, votes, land, border});
  }
  const candidates = components.flatMap(part => Array.from(part.votes, ([id, count]) => ({part, id, count})));
  const used = new Set();
  for (const {part, id} of candidates.sort((a, b) => b.count - a.count || a.id - b.id)) {
    if (part.id || used.has(id)) continue;
    part.id = id;
    used.add(id);
  }
  const waterChanged = new Set(changed);
  let nextId = features.length;
  for (const part of components) {
    part.id ??= nextId++;
    part.list.sort((a, b) => a - b);
    const type = part.land ? "island" : part.border ? "ocean" : "lake";
    for (const cell of part.list) {
      if (features[cells.f[cell]]?.type !== type) waterChanged.add(cell);
      write("f", cell, part.id);
      if (cells.type) write("type", cell, type);
    }
  }
  for (const part of components) features[part.id] = {...features[part.id], ...buildFeature(part)};
  for (const id of impacted) if (!used.has(id) && features[id]) {
    features[id] = {...features[id], removed: true, tombstone: true, cells: packed ? 0 : []};
  }
  return {waterChanged, components};
}

function updateDistances(cells, changed, pack, write) {
  const queue = [], queued = new Set();
  const enqueue = cell => { if (!queued.has(cell)) { queued.add(cell); queue.push(cell); } };
  for (const cell of changed) { enqueue(cell); for (const n of cells.c[cell]) enqueue(n); }
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i], land = cells.h[cell] >= 20, adjacent = cells.c[cell];
    queued.delete(cell);
    const coast = adjacent.some(n => (cells.h[n] >= 20) !== land);
    const max = land ? 126 : 9;
    const nearest = Math.min(max, ...adjacent.map(n => (land ? cells.t[n] : -cells.t[n]) > 0 ? Math.abs(cells.t[n]) : max));
    const depth = coast ? 1 : land && !pack ? 0 : nearest < max ? nearest + 1 : 0;
    const next = depth && !land ? -depth : depth;
    if (pack) {
      const haven = {}, harbor = {};
      if (land && coast) defineHaven(cells, cell, haven, harbor);
      write("haven", cell, haven[cell] || 0);
      write("harbor", cell, harbor[cell] || 0);
    }
    if (next === cells.t[cell]) continue;
    write("t", cell, next);
    for (const n of adjacent) enqueue(n);
  }
}

function updateShore(grid, features, shore, changed) {
  const edges = new Set(), append = {coastline: [], lakeShore: []};
  const key = segment => segment.map(point => point.join(",")).sort().join("|");
  for (const cell of changed) for (const n of grid.cells.c[cell]) {
    if (n < cell && changed.has(n)) continue;
    const seg = getSharedSegment(grid, Math.min(cell, n), Math.max(cell, n));
    if (!seg) continue;
    edges.add(key(seg));
    if ((grid.cells.h[cell] >= 20) === (grid.cells.h[n] >= 20)) continue;
    const water = grid.cells.h[cell] < 20 ? cell : n;
    append[features[grid.cells.f[water]].type === "ocean" ? "coastline" : "lakeShore"].push(seg);
  }
  return Object.fromEntries(Object.keys(append).map(k => [k, [...shore[k].filter(seg => !edges.has(key(seg))), ...append[k]]]));
}

export function updateHeightFeatures(map, changedGrid, byGrid, writeCell) {
  const {grid, pack, features} = map;
  const writeGrid = (field, cell, value) => writeCell("grid", field, cell, value);
  const writePack = (field, cell, value) => writeCell("pack", field, cell, value);
  const changedPack = new Set([...changedGrid].flatMap(cell => byGrid.get(cell) || []));
  const previousFeatures = features.features.slice();
  const result = updateComponents(grid, features.features, changedGrid, false, writeGrid, ({list, id, land, border}) =>
    ({id, i: id, land, border, type: land ? "island" : border ? "ocean" : "lake", cells: list, firstCell: list[0]}));
  if (!grid.features) grid.features = features.features;
  else if (grid.features !== features.features) features.features.forEach((feature, id) => {
    if (feature !== previousFeatures[id]) grid.features[id] = {...grid.features[id], ...feature};
  });
  updateDistances(grid.cells, changedGrid, false, writeGrid);
  features.shore = updateShore(grid, features.features, features.shore, result.waterChanged);
  const active = features.features.filter(f => f && !f.removed);
  Object.assign(features.metadata, {featureCount: active.length, oceanFeatures: active.filter(f => f.type === "ocean").length,
    landFeatures: active.filter(f => f.land).length, lakeFeatures: active.filter(f => f.type === "lake").length,
    coastlineSegments: features.shore.coastline.length, lakeShoreSegments: features.shore.lakeShore.length});
  const reclassified = result.waterChanged.size > changedGrid.size || result.components.some(part => !part.land && !part.border);
  if (!changedPack.size) return reclassified;
  const updated = updateComponents(pack, pack.features, changedPack, true, writePack, ({list, id, land, border}) =>
    createPackFeature({pack, grid, featureIds: pack.cells.f, featureCells: list, firstCell: list[0], featureId: id, land, border, totalCells: list.length}));
  updateDistances(pack.cells, changedPack, true, writePack);
  defineFeatureGroups(pack, grid, updated.components.map(part => pack.features[part.id]));
  const packed = pack.features.filter(f => f && !f.removed);
  const groups = {};
  for (const f of packed) groups[f.group] = (groups[f.group] || 0) + 1;
  Object.assign(pack.metadata, {packFeatureCount: packed.length, featureGroups: groups,
    havenCells: pack.cells.haven.reduce((n, v) => n + Number(v > 0), 0), harborCells: pack.cells.harbor.reduce((n, v) => n + Number(v > 0), 0)});
  return reclassified;
}
