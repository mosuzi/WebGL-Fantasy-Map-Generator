import {rebuildInheritanceTree, summarizeInheritanceTree} from "../generator/inheritance.js";
import {deleteObjectNote} from "./object-notes.js";
import {objectAffected, systemAffected} from "./edit-command-effects.js";
import {selectDeterministicOwnedCenter} from "./social-expansion-edit-commands.js";

const SOCIAL_ASSIGNMENT_STALE = Object.freeze({
  culture: ["states", "provinces", "religions", "markers", "zones", "military", "economy", "diplomacy"],
  religion: ["markers", "zones", "military", "economy", "diplomacy"]
});

export const SOCIAL_ASSIGNMENT_PREVIEW_EFFECTS = Object.freeze({
  render: "draw",
  selection: "none",
  runtimeStats: false,
  pickPanel: false,
  derived: Object.freeze(["culture-cells", "religion-cells", "cell-colors"])
});

export function createApplySocialAssignmentCommand(kind, changes, {label = null} = {}) {
  const config = socialConfig(kind);
  const normalized = normalizeGridChanges(changes);
  const affectedIds = [...new Set(normalized.flatMap(change => [change.before, change.after]).filter(id => id > 0))];
  let snapshot = null;
  let result = null;

  return {
    label: `${label || `${config.label}归属`} ${normalized.length} cells`,
    domain: config.kind,
    effects: {
      render: "draw",
      selection: "refresh",
      runtimeStats: true,
      pickPanel: true,
      affected: systemAffected(`${config.kind}-assignment`, affectedIds.length
        ? affectedIds.map(id => ({kind: config.kind, id}))
        : [{kind: "grid-cells", id: normalized.length}]),
      derived: [config.cellsEffect, "cell-colors", "object-index", "object-panels", "derived-stale"]
    },
    apply(context) {
      validateAssignmentTarget(context.map, config, normalized);
      snapshot ??= captureAssignmentSnapshot(context.map, config, normalized);
      applyGridChanges(context.map, config, normalized, "after");
      syncAssignmentReferences(context.map, config, normalized);
      refreshSocialCoverage(context.map, config);
      markSocialStale(context.map, config.kind);
      result = {
        kind: config.kind,
        cells: normalized.length,
        targetIds: [...new Set(normalized.map(change => change.after))]
      };
    },
    revert(context) {
      if (!snapshot) throw new Error(`缺少可撤销的${config.label}归属快照`);
      restoreAssignmentSnapshot(context.map, config, snapshot);
    },
    isNoop(context) {
      return !normalized.length || normalized.every(change => change.before === change.after) || !hasValidTargets(context.map, config, normalized);
    },
    getChanges() {
      return normalized.map(change => ({...change}));
    },
    getResult() {
      return result ? {...result, targetIds: [...result.targetIds]} : null;
    }
  };
}

export function createDeleteSocialObjectCommand(kind, objectId, {label = null} = {}) {
  const config = socialConfig(kind);
  const id = Number(objectId);
  let snapshot = null;
  let result = null;

  return {
    label: `${label || `删除${config.label}`} #${id}`,
    domain: config.kind,
    effects: {
      render: "draw",
      selection: "refresh",
      runtimeStats: true,
      pickPanel: true,
      affected: objectAffected(config.kind, id),
      derived: [config.structureEffect, config.cellsEffect, "cell-colors", "object-index", "object-panels", "derived-stale"]
    },
    apply(context) {
      const item = getPrimaryStore(context.map, config)?.[id];
      if (!item || item.removed || id <= 0) throw new Error(`找不到${config.label} #${id}`);
      snapshot ??= captureDeleteSnapshot(context.map, config);
      result = deleteSocialObject(context.map, config, id);
    },
    revert(context) {
      if (!snapshot) throw new Error(`缺少可撤销的${config.label}删除快照`);
      restoreDeleteSnapshot(context.map, config, snapshot);
    },
    isNoop(context) {
      const item = getPrimaryStore(context.map, config)?.[id];
      return !Number.isInteger(id) || id <= 0 || !item || item.removed;
    },
    getResult() {
      return result ? {...result} : null;
    }
  };
}

export function applySocialAssignmentPreview(map, kind, changes) {
  const config = socialConfig(kind);
  const normalized = normalizeGridChanges(changes);
  if (!normalized.length) return;
  applyGridChanges(map, config, normalized, "after");
}

function deleteSocialObject(map, config, id) {
  const packCells = replaceValue(map.pack?.cells?.[config.field], id, 0);
  const gridCells = replaceValue(map.grid?.cells?.[config.field], id, 0);
  const references = clearSocialReferences(map, config, id);
  for (const store of getStores(map, config)) {
    const item = store[id];
    if (item) {
      item.removed = true;
      item.cells = 0;
      item.area = 0;
      item.rural = 0;
      if (Object.prototype.hasOwnProperty.call(item, "urban")) item.urban = 0;
      item.center = -1;
      item.gridCenter = -1;
    }
    for (const other of store) {
      if (!other || other.removed) continue;
      if (Number(other.parent) === id) other.parent = 0;
      if (Array.isArray(other.origins)) {
        other.origins = other.origins.filter(origin => Number(origin) !== id);
        if (!other.origins.length) other.origins = [0];
      }
    }
    rebuildInheritanceTree(store);
  }
  deleteCultureBinding(map, config, id);
  deleteObjectNote(map, {kind: config.kind, id});
  refreshSocialCoverage(map, config);
  markSocialStale(map, config.kind);
  return {id, packCells, gridCells, references};
}

function clearSocialReferences(map, config, id) {
  let changed = 0;
  for (const {items, key} of socialReferenceCollections(map, config)) {
    for (const item of items || []) {
      if (!item || Number(item[key]) !== id) continue;
      item[key] = 0;
      changed++;
    }
  }
  return changed;
}

function syncAssignmentReferences(map, config, changes) {
  const packCells = packCellsForGridChanges(map, changes);
  for (const burg of map.pack?.burgs || []) {
    if (!burg || burg.removed || !packCells.has(Number(burg.cell))) continue;
    burg[config.field] = Number(map.pack.cells[config.field]?.[burg.cell]) || 0;
  }
  for (const city of map.settlements?.cities || []) {
    const cell = Number.isInteger(city?.packCell) ? city.packCell : city?.cell;
    if (!city || !packCells.has(Number(cell))) continue;
    city[config.field] = Number(map.pack.cells[config.field]?.[cell]) || 0;
  }
  for (const collection of politicalCollections(map)) {
    for (const item of collection) {
      if (!item || item.removed || !Object.prototype.hasOwnProperty.call(item, config.field) || !packCells.has(Number(item.center))) continue;
      item[config.field] = Number(map.pack.cells[config.field]?.[item.center]) || 0;
    }
  }
}

function refreshSocialCoverage(map, config) {
  const stores = getStores(map, config);
  const packCells = map.pack?.cells;
  for (const store of stores) {
    for (const item of store) {
      if (!item || item.removed || !(Number(item.i ?? item.id) > 0)) continue;
      item.cells = 0;
      item.area = 0;
      item.rural = 0;
      if (Object.prototype.hasOwnProperty.call(item, "urban")) item.urban = 0;
    }
  }
  for (const burg of map.pack?.burgs || []) {
    if (!burg?.i || burg.removed) continue;
    const id = Number(packCells?.[config.field]?.[burg.cell]) || 0;
    for (const store of stores) {
      const item = store[id];
      if (!item || item.removed || !Object.prototype.hasOwnProperty.call(item, "urban")) continue;
      item.urban = round(Number(item.urban) + (Number(burg.population) || 0));
    }
  }
  const primary = getPrimaryStore(map, config);
  for (let cell = 0; cell < (packCells?.[config.field]?.length || 0); cell++) {
    const id = Number(packCells[config.field][cell]) || 0;
    if (!id || !primary?.[id] || primary[id].removed) continue;
    for (const store of stores) {
      const item = store[id];
      if (!item || item.removed) continue;
      item.cells++;
      item.area = round(Number(item.area) + (Number(packCells.area?.[cell]) || 0));
      item.rural = round(Number(item.rural) + (Number(packCells.pop?.[cell]) || 0));
    }
  }
  for (const store of stores) {
    const used = new Set();
    const items = store
      .filter(item => item && !item.removed && Number(item.i ?? item.id) > 0)
      .sort((left, right) => Number(left.i ?? left.id) - Number(right.i ?? right.id));
    for (const item of items) {
      const id = Number(item.i ?? item.id);
      let center = Number(item.center);
      const centerOwned = Number.isInteger(center)
        && Number(packCells?.h?.[center]) >= 20
        && Number(packCells?.[config.field]?.[center]) === id;
      if (!centerOwned || used.has(center)) center = selectDeterministicOwnedCenter(packCells, config.field, id, used);
      item.center = center;
      item.gridCenter = center >= 0 && Number.isInteger(Number(packCells?.g?.[center])) ? Number(packCells.g[center]) : -1;
      if (center >= 0) used.add(center);
    }
    rebuildInheritanceTree(store);
  }
  refreshSocietyMetadata(map, config);
}

function refreshSocietyMetadata(map, config) {
  const metadata = map.society?.metadata;
  if (!metadata) return;
  const items = getPrimaryStore(map, config) || [];
  const active = items.filter(item => item && !item.removed && Number(item.i ?? item.id) > 0);
  metadata[config.plural] = active.length;
  metadata[config.namesKey] = active.map(item => item.name || `${config.label} #${item.i ?? item.id}`);
  metadata[config.centersKey] = active.map(item => Number(item.gridCenter) || 0);
  metadata[config.packCountKey] = countPositive(map.pack?.cells?.[config.field]);
  metadata[config.gridCountKey] = countPositive(map.grid?.cells?.[config.field]);
  metadata[config.treeKey] = summarizeInheritanceTree(items);
}

function markSocialStale(map, kind) {
  const systems = SOCIAL_ASSIGNMENT_STALE[kind] || [];
  map.metadata.derivedStale = {
    ...(map.metadata.derivedStale || {}),
    systems: [...new Set([...(map.metadata.derivedStale?.systems || []), ...systems])],
    updatedAt: new Date().toISOString()
  };
  for (const section of ["markers", "zones", "military", "economy", "diplomacy"]) {
    if (map[section]?.metadata && systems.includes(section)) map[section].metadata.stale = true;
  }
}

function applyGridChanges(map, config, changes, key) {
  const gridValues = map.grid?.cells?.[config.field];
  const packValues = map.pack?.cells?.[config.field];
  for (const change of changes) {
    const value = Number(change[key]) || 0;
    gridValues[change.gridCell] = value;
    for (let packCell = 0; packCell < (map.pack?.cells?.g?.length || 0); packCell++) {
      if (Number(map.pack.cells.g[packCell]) !== change.gridCell || Number(map.pack.cells.h?.[packCell]) < 20) continue;
      packValues[packCell] = value;
    }
  }
}

function captureAssignmentSnapshot(map, config, changes) {
  const packValues = cloneArrayLike(map.pack?.cells?.[config.field]);
  const gridValues = cloneArrayLike(map.grid?.cells?.[config.field]);
  for (const change of changes) {
    gridValues[change.gridCell] = change.before;
    if (change.packBefore?.length) {
      for (const entry of change.packBefore) packValues[entry.packCell] = entry.before;
    }
  }
  return {
    packValues,
    gridValues,
    references: captureReferenceValues(map, config),
    stores: captureStores(map, config),
    societyMetadata: clonePlain(map.society?.metadata || null),
    stale: captureStale(map)
  };
}

function restoreAssignmentSnapshot(map, config, snapshot) {
  map.pack.cells[config.field] = cloneArrayLike(snapshot.packValues);
  map.grid.cells[config.field] = cloneArrayLike(snapshot.gridValues);
  restoreReferenceValues(snapshot.references);
  restoreStores(map, config, snapshot.stores);
  if (snapshot.societyMetadata) map.society.metadata = clonePlain(snapshot.societyMetadata);
  restoreStale(map, snapshot.stale);
}

function captureDeleteSnapshot(map, config) {
  return {
    packValues: cloneArrayLike(map.pack?.cells?.[config.field]),
    gridValues: cloneArrayLike(map.grid?.cells?.[config.field]),
    references: captureReferenceValues(map, config),
    stores: captureStores(map, config),
    notes: clonePlain(map.notes || null),
    bindings: captureCultureBindings(map),
    societyMetadata: clonePlain(map.society?.metadata || null),
    stale: captureStale(map)
  };
}

function restoreDeleteSnapshot(map, config, snapshot) {
  map.pack.cells[config.field] = cloneArrayLike(snapshot.packValues);
  map.grid.cells[config.field] = cloneArrayLike(snapshot.gridValues);
  restoreReferenceValues(snapshot.references);
  restoreStores(map, config, snapshot.stores);
  if (snapshot.notes) map.notes = clonePlain(snapshot.notes);
  else delete map.notes;
  restoreCultureBindings(snapshot.bindings);
  if (snapshot.societyMetadata) map.society.metadata = clonePlain(snapshot.societyMetadata);
  restoreStale(map, snapshot.stale);
}

function captureStores(map, config) {
  const societyStore = map.society?.[config.plural];
  const packStore = map.pack?.[config.plural];
  return {
    shared: societyStore === packStore,
    society: clonePlain(societyStore || []),
    pack: clonePlain(packStore || [])
  };
}

function restoreStores(map, config, snapshot) {
  map.society[config.plural] = clonePlain(snapshot.society);
  map.pack[config.plural] = snapshot.shared ? map.society[config.plural] : clonePlain(snapshot.pack);
}

function captureReferenceValues(map, config) {
  const entries = [];
  for (const {items, key} of socialReferenceCollections(map, config)) {
    for (const item of items || []) {
      if (item && Object.prototype.hasOwnProperty.call(item, key)) entries.push({target: item, key, value: item[key]});
    }
  }
  return entries;
}

function restoreReferenceValues(entries) {
  for (const entry of entries || []) entry.target[entry.key] = entry.value;
}

function socialReferenceCollections(map, config) {
  const common = [
    {items: map.pack?.burgs, key: config.field},
    {items: map.settlements?.cities, key: config.field},
    ...politicalCollections(map).map(items => ({items, key: config.field}))
  ];
  if (config.kind === "culture") {
    common.push(
      {items: map.society?.religions, key: "culture"},
      {items: map.pack?.religions, key: "culture"},
      {items: map.rivers?.rivers, key: "culture"},
      {items: map.pack?.rivers, key: "culture"},
      {items: map.pack?.features, key: "culture"}
    );
  }
  return uniqueCollections(common);
}

function politicalCollections(map) {
  return uniqueArrays([
    map.politics?.states,
    map.pack?.states,
    map.politics?.provinces,
    map.pack?.provinces
  ]);
}

function uniqueCollections(collections) {
  const seen = new Set();
  return collections.filter(collection => {
    if (!Array.isArray(collection.items)) return false;
    const key = `${collection.key}:${objectIdentity(collection.items)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const identityMap = new WeakMap();
let nextIdentity = 1;
function objectIdentity(value) {
  if (!identityMap.has(value)) identityMap.set(value, nextIdentity++);
  return identityMap.get(value);
}

function uniqueArrays(arrays) {
  return arrays.filter((items, index) => Array.isArray(items) && arrays.indexOf(items) === index);
}

function captureCultureBindings(map) {
  return [
    map.namebases?.bindings?.cultures,
    map.options?.namebaseBindings?.cultures,
    map.metadata?.namebaseBindings?.cultures
  ].filter(value => value && typeof value === "object").map(target => ({target, value: clonePlain(target)}));
}

function restoreCultureBindings(entries) {
  for (const entry of entries || []) {
    for (const key of Object.keys(entry.target)) delete entry.target[key];
    Object.assign(entry.target, clonePlain(entry.value));
  }
}

function deleteCultureBinding(map, config, id) {
  if (config.kind !== "culture") return;
  for (const entry of captureCultureBindings(map)) delete entry.target[String(id)];
}

function captureStale(map) {
  return {
    derived: clonePlain(map.metadata?.derivedStale || null),
    flags: Object.fromEntries(["markers", "zones", "military", "economy", "diplomacy"].map(section => [section, {
      present: Object.prototype.hasOwnProperty.call(map[section]?.metadata || {}, "stale"),
      value: map[section]?.metadata?.stale
    }]))
  };
}

function restoreStale(map, snapshot) {
  if (snapshot.derived) map.metadata.derivedStale = clonePlain(snapshot.derived);
  else delete map.metadata.derivedStale;
  for (const [section, entry] of Object.entries(snapshot.flags || {})) {
    if (!map[section]?.metadata) continue;
    if (entry.present) map[section].metadata.stale = entry.value;
    else delete map[section].metadata.stale;
  }
}

function validateAssignmentTarget(map, config, changes) {
  if (!hasValidTargets(map, config, changes)) throw new Error(`${config.label}归属目标不存在`);
}

function hasValidTargets(map, config, changes) {
  const store = getPrimaryStore(map, config);
  return changes.every(change => change.after === 0 || (store?.[change.after] && !store[change.after].removed));
}

function getStores(map, config) {
  return uniqueArrays([map.society?.[config.plural], map.pack?.[config.plural]]);
}

function getPrimaryStore(map, config) {
  return map.society?.[config.plural] || map.pack?.[config.plural] || [];
}

function normalizeGridChanges(changes) {
  const byCell = new Map();
  for (const change of changes || []) {
    const gridCell = Number(change?.gridCell);
    const before = Number(change?.before) || 0;
    const after = Number(change?.after) || 0;
    if (!Number.isInteger(gridCell) || gridCell < 0 || before === after) continue;
    const packBefore = Array.isArray(change?.packBefore)
      ? change.packBefore
        .map(entry => ({packCell: Number(entry?.packCell), before: Number(entry?.before) || 0}))
        .filter(entry => Number.isInteger(entry.packCell) && entry.packCell >= 0)
      : [];
    byCell.set(gridCell, {gridCell, before, after, packBefore});
  }
  return [...byCell.values()].sort((a, b) => a.gridCell - b.gridCell);
}

function packCellsForGridChanges(map, changes) {
  const gridCells = new Set(changes.map(change => change.gridCell));
  const result = new Set();
  for (let packCell = 0; packCell < (map.pack?.cells?.g?.length || 0); packCell++) {
    if (gridCells.has(Number(map.pack.cells.g[packCell])) && Number(map.pack.cells.h?.[packCell]) >= 20) result.add(packCell);
  }
  return result;
}

function replaceValue(values, target, replacement) {
  let changed = 0;
  for (let index = 0; index < (values?.length || 0); index++) {
    if (Number(values[index]) !== target) continue;
    values[index] = replacement;
    changed++;
  }
  return changed;
}

function countPositive(values) {
  let count = 0;
  for (const value of values || []) if (Number(value) > 0) count++;
  return count;
}

function cloneArrayLike(value) {
  if (value === undefined || value === null) return value;
  return value.slice ? value.slice() : [...value];
}

function clonePlain(value) {
  if (value === undefined) return undefined;
  return value === null ? null : JSON.parse(JSON.stringify(value));
}

function round(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function socialConfig(kind) {
  if (kind === "culture") return {
    kind,
    label: "文化",
    field: "culture",
    plural: "cultures",
    namesKey: "cultureNames",
    centersKey: "cultureCenters",
    packCountKey: "culturedPackCells",
    gridCountKey: "culturedGridCells",
    treeKey: "cultureTree",
    cellsEffect: "culture-cells",
    structureEffect: "culture-structure"
  };
  if (kind === "religion") return {
    kind,
    label: "宗教",
    field: "religion",
    plural: "religions",
    namesKey: "religionNames",
    centersKey: "religionCenters",
    packCountKey: "religionPackCells",
    gridCountKey: "religionGridCells",
    treeKey: "religionTree",
    cellsEffect: "religion-cells",
    structureEffect: "religion-structure"
  };
  throw new Error(`不支持的社会归属类型：${kind}`);
}
