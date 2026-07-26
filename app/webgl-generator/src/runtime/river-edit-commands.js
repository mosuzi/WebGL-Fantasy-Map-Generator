import {EDIT_REFRESH_PRESETS} from "./edit-refresh-scheduler.js";
import {namebaseRenameAffected, objectAffected} from "./edit-command-effects.js";
import {cloneObjectNote, deleteObjectNote, objectNoteId, readObjectNote, restoreObjectNote} from "./object-notes.js";
import {OBJECT_KIND} from "./object-kinds.js";
import {createChineseNameGenerator} from "../generator/names.js";
import {normalizeRiverNetwork} from "../generator/river-network.js";

const RIVER_NOTE_EFFECTS = Object.freeze({
  render: "none",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["object-panels"])
});

const RIVER_NAME_BATCH_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["object-name", "labels", "object-panels"])
});

const RIVER_DELETE_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["river-mesh", "river-width-stats", "object-index", "object-panels"])
});

const RIVER_CREATE_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["river-mesh", "river-width-stats", "object-index", "object-panels"])
});

const RIVER_DELETE_STALE_SYSTEMS = Object.freeze([
  "rivers",
  "routes",
  "biomes",
  "cities",
  "states",
  "provinces",
  "religions",
  "markers",
  "zones",
  "military",
  "economy",
  "diplomacy"
]);

export function inspectRiverCreation(map, options = {}) {
  const sourcePackCell = Number(options.sourcePackCell);
  const cells = map?.pack?.cells;
  const count = cells?.i?.length || cells?.h?.length || 0;
  if (!Number.isInteger(sourcePackCell) || sourcePackCell < 0 || sourcePackCell >= count) return invalidRiverCreation("invalid-source", "河源必须是有效 pack cell");
  if (Number(cells.h?.[sourcePackCell]) < 20) return invalidRiverCreation("source-water", "河源必须位于陆地");
  if (Number(cells.r?.[sourcePackCell]) > 0) return invalidRiverCreation("source-occupied", "河源 cell 已存在河流");
  const traced = traceDownhillRiver(map, sourcePackCell);
  if (!traced.valid) return traced;
  if (traced.path.length < 3) return invalidRiverCreation("path-too-short", "河流至少需要 3 个连续 cells");
  return {...traced, sourcePackCell};
}

export function createAddRiverCommand(options = {}) {
  let snapshot = null;
  let created = null;
  const command = {
    label: String(options.label || "新增河流"),
    domain: OBJECT_KIND.RIVER,
    effects: {...RIVER_CREATE_EFFECTS, affected: objectAffected(OBJECT_KIND.RIVER, "new")},
    apply(context) {
      const preview = inspectRiverCreation(context.map, options);
      if (!preview.valid) throw riverCreationError(preview);
      snapshot ??= captureRiverDeleteSnapshot(context.map);
      created ??= buildCreatedRiver(context.map, preview);
      readRivers(context.map).push(clonePlain(created));
      if (context.map.pack) context.map.pack.rivers = context.map.rivers.rivers;
      updateCreatedRiverFlux(context.map, created);
      normalizeRiverNetwork(context.map.rivers.rivers, context.map.pack, {dropIncomplete: false});
      rebuildAllRiverCellState(context.map);
      attachCreatedRiverToLake(context.map, created);
      refreshRiverMetadata(context.map);
      markRiverDependentDerivedStale(context.map);
      command.effects.affected = objectAffected(OBJECT_KIND.RIVER, created.id);
    },
    revert(context) {
      if (!snapshot) throw new Error("缺少可撤销的河流创建快照");
      restoreRiverDeleteSnapshot(context.map, snapshot);
    },
    isNoop(context) {
      const preview = inspectRiverCreation(context.map, options);
      if (!preview.valid) throw riverCreationError(preview);
      return false;
    },
    getResult() {
      return created ? {
        riverId: created.id,
        cells: created.cells.length,
        source: created.source,
        mouth: created.mouth,
        parent: created.parent,
        confluence: Boolean(created.parent)
      } : null;
    }
  };
  return command;
}

export function createSetRiverWidthFactorCommand(riverId, nextValue) {
  const nextWidthFactor = normalizeWidthFactor(nextValue);
  let previousWidthFactor = null;
  let hadPreviousWidthFactor = false;
  let capturedPrevious = false;

  return {
    label: `调整河流 #${riverId} 宽度因子`,
    domain: OBJECT_KIND.RIVER,
    effects: {
      ...EDIT_REFRESH_PRESETS.RIVER_WIDTH_ONLY,
      affected: objectAffected(OBJECT_KIND.RIVER, riverId)
    },
    apply(context) {
      const river = findRiver(context.map, riverId);
      if (!river) throw new Error(`找不到河流 #${riverId}`);
      if (!capturedPrevious) {
        hadPreviousWidthFactor = Object.prototype.hasOwnProperty.call(river, "widthFactor");
        previousWidthFactor = river.widthFactor;
        capturedPrevious = true;
      }
      river.widthFactor = nextWidthFactor;
    },
    revert(context) {
      const river = findRiver(context.map, riverId);
      if (!river) throw new Error(`找不到河流 #${riverId}`);
      if (hadPreviousWidthFactor) {
        river.widthFactor = previousWidthFactor;
      } else {
        delete river.widthFactor;
      }
    },
    isNoop(context) {
      const river = findRiver(context.map, riverId);
      return river ? normalizeWidthFactor(river.widthFactor) === nextWidthFactor : true;
    }
  };
}

export function createSetRiverNoteCommand(riverId, body, {name = ""} = {}) {
  const normalizedRiverId = Number(riverId);
  const target = {kind: OBJECT_KIND.RIVER, id: normalizedRiverId};
  const normalizedBody = normalizeNoteBody(body);
  let previous = null;
  let next = null;

  return {
    label: normalizedBody ? `编辑河流备注 #${normalizedRiverId}` : `清空河流备注 #${normalizedRiverId}`,
    domain: OBJECT_KIND.RIVER,
    effects: {
      ...RIVER_NOTE_EFFECTS,
      affected: objectAffected(OBJECT_KIND.RIVER, normalizedRiverId)
    },
    apply(context) {
      const river = findRiver(context.map, normalizedRiverId);
      if (!river) throw new Error(`找不到河流 #${normalizedRiverId}`);
      previous ??= cloneObjectNote(readObjectNote(context.map, target));
      if (!normalizedBody) {
        deleteObjectNote(context.map, target);
        return;
      }
      next ??= createRiverNoteSnapshot(target, normalizedBody, {
        name: name || river.name || `河流 #${normalizedRiverId}`,
        previous
      });
      restoreObjectNote(context.map, next);
    },
    revert(context) {
      if (previous) restoreObjectNote(context.map, previous);
      else deleteObjectNote(context.map, target);
    },
    isNoop(context) {
      const river = findRiver(context.map, normalizedRiverId);
      if (!river) return true;
      const current = readObjectNote(context.map, target)?.body || "";
      return current === normalizedBody;
    }
  };
}

export function createRenameRiversFromNamebaseCommand(riverIds, {label = "按名称库重命名河流"} = {}) {
  const targets = uniqueRiverIds(riverIds);
  let changes = null;

  return {
    label: `${label} ${targets.length} 条`,
    domain: OBJECT_KIND.RIVER,
    effects: {
      ...RIVER_NAME_BATCH_EFFECTS,
      affected: namebaseRenameAffected(OBJECT_KIND.RIVER, targets)
    },
    apply(context) {
      changes ??= buildRiverRenameChanges(context.map, targets);
      if (!changes.length) throw new Error("没有可重命名的河流");
      for (const change of changes) writeRiverName(context.map, change.id, change.afterName);
    },
    revert(context) {
      if (!changes) throw new Error("缺少可撤销的河流名称快照");
      for (const change of changes) writeRiverName(context.map, change.id, change.beforeName);
    },
    isNoop(context) {
      return !targets.length || !buildRiverRenameChanges(context.map, targets).length;
    },
    getResult() {
      return {renamed: changes?.length || 0, total: targets.length};
    }
  };
}

export function createDeleteRiverCommand(riverId, {label = "删除河流"} = {}) {
  const normalizedRiverId = Number(riverId);
  let snapshot = null;
  let removedIds = [];

  const command = {
    label: `${label} #${normalizedRiverId}`,
    domain: OBJECT_KIND.RIVER,
    effects: {
      ...RIVER_DELETE_EFFECTS,
      affected: objectAffected(OBJECT_KIND.RIVER, normalizedRiverId)
    },
    apply(context) {
      const rivers = readRivers(context.map);
      if (!rivers.some(river => riverIdOf(river) === normalizedRiverId)) {
        throw new Error(`找不到河流 #${normalizedRiverId}`);
      }
      snapshot ??= captureRiverDeleteSnapshot(context.map);
      removedIds = collectRiverDeleteIds(rivers, normalizedRiverId);
      deleteRiverClosure(context.map, removedIds);
      command.effects.affected = removedIds.map(id => ({kind: OBJECT_KIND.RIVER, id}));
    },
    revert(context) {
      if (!snapshot) throw new Error("缺少可撤销的河流删除快照");
      restoreRiverDeleteSnapshot(context.map, snapshot);
    },
    isNoop(context) {
      return !Number.isInteger(normalizedRiverId) || normalizedRiverId <= 0 || !findRiver(context.map, normalizedRiverId);
    },
    getResult() {
      return {
        riverId: normalizedRiverId,
        removedIds: [...removedIds],
        removed: removedIds.length,
        tributaries: Math.max(0, removedIds.length - 1)
      };
    }
  };
  return command;
}

function findRiver(map, riverId) {
  return map?.rivers?.rivers?.find(river => riverIdOf(river) === riverId) || null;
}

function readRivers(map) {
  if (!Array.isArray(map?.rivers?.rivers)) throw new Error("当前地图没有河流列表");
  return map.rivers.rivers;
}

function collectRiverDeleteIds(rivers, targetId) {
  const removed = new Set([targetId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const river of rivers) {
      const id = riverIdOf(river);
      if (!Number.isInteger(id) || removed.has(id)) continue;
      if (removed.has(Number(river.parent)) || Number(river.basin) === targetId) {
        removed.add(id);
        changed = true;
      }
    }
  }
  return rivers.map(riverIdOf).filter(id => removed.has(id));
}

function deleteRiverClosure(map, removedIds) {
  const removed = new Set(removedIds);
  const previousRiverCells = map.pack?.cells?.r ? Array.from(map.pack.cells.r) : [];
  const survivors = readRivers(map).filter(river => !removed.has(riverIdOf(river)));
  map.rivers.rivers = survivors;
  if (map.pack) map.pack.rivers = survivors;

  rebuildRiverCellState(map, survivors, removed, previousRiverCells);
  cleanupLakeRiverReferences(map, removed);
  for (const id of removedIds) deleteObjectNote(map, {kind: OBJECT_KIND.RIVER, id});
  refreshRiverMetadata(map);
  markRiverDependentDerivedStale(map);
}

function rebuildRiverCellState(map, rivers, removed, previousRiverCells) {
  const cells = map.pack?.cells;
  if (!cells?.r || !cells?.conf) return;
  for (let cell = 0; cell < cells.r.length; cell += 1) {
    if (removed.has(previousRiverCells[cell])) {
      const gridCell = cells.g?.[cell];
      const precipitation = map.grid?.cells?.prec?.[gridCell];
      if (cells.fl && Number.isFinite(Number(precipitation))) cells.fl[cell] = Math.max(0, Number(precipitation));
    }
    cells.r[cell] = 0;
    cells.conf[cell] = 0;
  }

  for (const river of rivers) {
    const id = riverIdOf(river);
    for (const cell of river.cells || []) {
      if (!Number.isInteger(cell) || cell < 0 || cell >= cells.r.length || Number(cells.h?.[cell]) < 20) continue;
      if (cells.r[cell]) cells.conf[cell] = Math.max(Number(cells.conf[cell]) || 0, 1);
      else cells.r[cell] = id;
    }
  }

  for (let cell = 0; cell < cells.conf.length; cell += 1) {
    if (!cells.conf[cell]) continue;
    const influx = (cells.c?.[cell] || [])
      .filter(neighbor => cells.r[neighbor] && Number(cells.h?.[neighbor]) > Number(cells.h?.[cell]))
      .map(neighbor => Number(cells.fl?.[neighbor]) || 0)
      .sort((a, b) => b - a);
    cells.conf[cell] = influx.reduce((sum, flux, index) => index ? sum + flux : sum, 0);
  }
}

function rebuildAllRiverCellState(map) {
  const cells = map.pack?.cells;
  if (!cells?.r || !cells?.conf) return;
  cells.r.fill(0);
  cells.conf.fill(0);
  const rivers = [...readRivers(map)].sort((a, b) => Number(Boolean(a.parent)) - Number(Boolean(b.parent)) || riverIdOf(a) - riverIdOf(b));
  for (const river of rivers) {
    const id = riverIdOf(river);
    for (const cell of river.cells || []) {
      if (!Number.isInteger(cell) || cell < 0 || cell >= cells.r.length || Number(cells.h?.[cell]) < 20) continue;
      if (cells.r[cell]) cells.conf[cell] = Math.max(Number(cells.conf[cell]) || 0, Number(river.discharge || river.flux) || 1);
      else cells.r[cell] = id;
    }
  }
}

function traceDownhillRiver(map, sourcePackCell) {
  const cells = map.pack.cells;
  const path = [sourcePackCell];
  const visited = new Set(path);
  let current = sourcePackCell;
  let parent = 0;
  let termination = "";
  for (let step = 0; step < 2048; step += 1) {
    const currentHeight = Number(cells.h?.[current]);
    const candidates = (cells.c?.[current] || [])
      .filter(cell => !visited.has(cell) && Number(cells.h?.[cell]) < currentHeight)
      .sort((a, b) => Number(Boolean(cells.r?.[b])) - Number(Boolean(cells.r?.[a])) || Number(cells.h?.[a]) - Number(cells.h?.[b]) || a - b);
    const next = candidates[0];
    if (!Number.isInteger(next)) return invalidRiverCreation("downhill-blocked", `河流在 pack cell #${current} 没有严格下坡出口`);
    path.push(next);
    visited.add(next);
    if (Number(cells.h?.[next]) < 20) {
      termination = "water";
      break;
    }
    if (Number(cells.r?.[next]) > 0) {
      parent = Number(cells.r[next]);
      termination = "confluence";
      break;
    }
    current = next;
  }
  if (!termination) return invalidRiverCreation("path-limit", "河流下坡追踪超过安全长度限制");
  return {valid: true, code: "ok", reason: "", path, parent, termination, mouth: path.at(-1)};
}

function buildCreatedRiver(map, preview) {
  const id = nextRiverId(map);
  const cells = map.pack.cells;
  const source = preview.path[0];
  const mouth = preview.path.at(-1);
  const parentRiver = preview.parent ? findRiver(map, preview.parent) : null;
  const discharge = Math.max(1, Number(cells.fl?.[source]) || Number(map.grid?.cells?.prec?.[cells.g?.[source]]) || 1);
  const points = preview.path.map(cell => [...(cells.p?.[cell] || [0, 0])]);
  const length = polylineLength(points);
  const widthFactor = preview.parent ? 1 : 1.2;
  const cultureId = Number(cells.culture?.[source]) || 0;
  const culture = map.pack?.cultures?.[cultureId] || map.society?.cultures?.[cultureId];
  const nameGenerator = createChineseNameGenerator(`${map.metadata?.seed || map.options?.seed || "map"}|manual-river|${id}`, {namebases: map.namebases});
  return {
    id,
    i: id,
    source,
    sourceGrid: Number(cells.g?.[source]) || 0,
    mouth,
    mouthGrid: Number.isInteger(Number(cells.g?.[mouth])) ? Number(cells.g[mouth]) : -1,
    parent: preview.parent,
    basin: parentRiver?.basin || preview.parent || id,
    discharge,
    flux: discharge,
    length,
    width: Math.max(1, Math.sqrt(discharge) * widthFactor),
    widthFactor,
    sourceWidth: Math.max(0.1, Math.sqrt(discharge) / 10),
    hydrology: approximateCreatedHydrology(map, preview.path),
    cells: [...preview.path],
    gridCells: preview.path.filter(cell => cell >= 0).map(cell => Number(cells.g?.[cell]) || 0),
    points,
    type: preview.parent ? "Branch" : "River",
    name: nameGenerator.makeRiverName({id, cell: source, culture: cultureId, cultureType: culture?.nameStyle || culture?.type, flux: discharge, type: preview.parent ? "branch" : "river"})
  };
}

function approximateCreatedHydrology(map, path) {
  let area = 0;
  let precipitationArea = 0;
  for (const packCell of path) {
    if (Number(map.pack?.cells?.h?.[packCell]) < 20) continue;
    const cellArea = Number(map.pack?.cells?.area?.[packCell]) || 1;
    const precipitation = Number(map.grid?.cells?.prec?.[map.pack?.cells?.g?.[packCell]]) || 0;
    area += cellArea;
    precipitationArea += precipitation * cellArea;
  }
  return {
    catchmentArea: area,
    catchmentCells: path.filter(cell => Number(map.pack?.cells?.h?.[cell]) >= 20).length,
    averagePrecipitation: area ? precipitationArea / area : 0,
    method: "manual-downhill"
  };
}

function updateCreatedRiverFlux(map, river) {
  const cells = map.pack?.cells;
  if (!cells?.fl) return;
  for (const cell of river.cells || []) {
    if (!Number.isInteger(cell) || Number(cells.h?.[cell]) < 20) continue;
    cells.fl[cell] = Math.max(Number(cells.fl[cell]) || 0, Number(river.discharge) || 1);
  }
}

function attachCreatedRiverToLake(map, river) {
  const mouth = river.cells?.at(-1);
  if (!Number.isInteger(mouth) || Number(map.pack?.cells?.h?.[mouth]) >= 20) return;
  const feature = map.pack?.features?.[map.pack.cells.f?.[mouth]];
  if (!feature || feature.type !== "lake") return;
  feature.inlets = [...new Set([...(feature.inlets || []), river.id])];
  feature.flux = (Number(feature.flux) || 0) + (Number(river.discharge) || 0);
  if (!feature.river || Number(river.discharge) > Number(feature.enteringFlux || 0)) {
    feature.river = river.id;
    feature.enteringFlux = river.discharge;
  }
}

function nextRiverId(map) {
  return readRivers(map).reduce((max, river) => Math.max(max, riverIdOf(river) || 0), 0) + 1;
}

function polylineLength(points) {
  let length = 0;
  for (let index = 0; index < points.length - 1; index += 1) length += Math.hypot(points[index + 1][0] - points[index][0], points[index + 1][1] - points[index][1]);
  return length;
}

function invalidRiverCreation(code, reason) {
  return {valid: false, code, reason, path: [], parent: 0, termination: ""};
}

function riverCreationError(preview) {
  const error = new Error(preview.reason);
  error.code = preview.code;
  return error;
}

function cleanupLakeRiverReferences(map, removed) {
  for (const feature of map.pack?.features || []) {
    if (!feature || feature.type !== "lake") continue;
    if (Array.isArray(feature.inlets)) {
      feature.inlets = feature.inlets.filter(id => !removed.has(Number(id)));
      if (!feature.inlets.length) delete feature.inlets;
    }
    if (removed.has(Number(feature.outlet))) delete feature.outlet;
    if (removed.has(Number(feature.river))) {
      delete feature.river;
      delete feature.enteringFlux;
    }
  }
}

function refreshRiverMetadata(map) {
  const rivers = readRivers(map);
  const cells = map.pack?.cells || {};
  map.rivers.metadata = {
    ...(map.rivers.metadata || {}),
    rivers: rivers.length,
    segments: rivers.reduce((sum, river) => sum + Math.max(0, (river.points || []).length - 1), 0),
    sources: rivers.length,
    longest: rivers.reduce((max, river) => Math.max(max, (river.cells || []).length), 0),
    maxFlux: maxArrayValue(cells.fl),
    confluences: countPositive(cells.conf),
    cellsWithRiver: countPositive(cells.r)
  };
}

function markRiverDependentDerivedStale(map) {
  if (!map?.metadata) return;
  map.metadata.derivedStale = {
    ...(map.metadata.derivedStale || {}),
    systems: [...new Set([...(map.metadata.derivedStale?.systems || []), ...RIVER_DELETE_STALE_SYSTEMS])],
    updatedAt: new Date().toISOString()
  };
  for (const kind of ["markers", "zones", "military", "economy", "diplomacy"]) {
    if (map[kind]?.metadata) map[kind].metadata.stale = true;
  }
}

function captureRiverDeleteSnapshot(map) {
  const rivers = readRivers(map);
  return {
    sharedRiverList: map.pack?.rivers === rivers,
    rivers: clonePlain(rivers),
    packRivers: clonePlain(map.pack?.rivers || []),
    riverMetadata: clonePlain(map.rivers.metadata || {}),
    cellR: cloneArrayLike(map.pack?.cells?.r),
    cellFl: cloneArrayLike(map.pack?.cells?.fl),
    cellConf: cloneArrayLike(map.pack?.cells?.conf),
    lakeReferences: captureLakeRiverReferences(map),
    notes: clonePlain(map.notes || null),
    stale: captureStaleState(map)
  };
}

function restoreRiverDeleteSnapshot(map, snapshot) {
  const rivers = clonePlain(snapshot.rivers);
  map.rivers.rivers = rivers;
  map.rivers.metadata = clonePlain(snapshot.riverMetadata);
  if (map.pack) map.pack.rivers = snapshot.sharedRiverList ? rivers : clonePlain(snapshot.packRivers);
  restoreArrayLike(map.pack?.cells, "r", snapshot.cellR);
  restoreArrayLike(map.pack?.cells, "fl", snapshot.cellFl);
  restoreArrayLike(map.pack?.cells, "conf", snapshot.cellConf);
  restoreLakeRiverReferences(map, snapshot.lakeReferences);
  if (snapshot.notes) map.notes = clonePlain(snapshot.notes);
  else delete map.notes;
  restoreStaleState(map, snapshot.stale);
}

function captureLakeRiverReferences(map) {
  return (map.pack?.features || []).map(feature => {
    if (!feature || feature.type !== "lake") return null;
    const snapshot = {};
    for (const key of ["inlets", "outlet", "river", "enteringFlux"]) {
      snapshot[key] = {
        present: Object.prototype.hasOwnProperty.call(feature, key),
        value: clonePlain(feature[key])
      };
    }
    return snapshot;
  });
}

function restoreLakeRiverReferences(map, snapshots) {
  for (let index = 0; index < (snapshots || []).length; index += 1) {
    const snapshot = snapshots[index];
    const feature = map.pack?.features?.[index];
    if (!snapshot || !feature) continue;
    for (const [key, entry] of Object.entries(snapshot)) {
      if (entry.present) feature[key] = clonePlain(entry.value);
      else delete feature[key];
    }
  }
}

function captureStaleState(map) {
  return {
    metadata: clonePlain(map.metadata?.derivedStale || null),
    flags: Object.fromEntries(["markers", "zones", "military", "economy", "diplomacy"].map(kind => [kind, {
      present: Object.prototype.hasOwnProperty.call(map[kind]?.metadata || {}, "stale"),
      value: map[kind]?.metadata?.stale
    }]))
  };
}

function restoreStaleState(map, snapshot) {
  if (snapshot.metadata) map.metadata.derivedStale = clonePlain(snapshot.metadata);
  else delete map.metadata.derivedStale;
  for (const [kind, entry] of Object.entries(snapshot.flags || {})) {
    if (!map[kind]?.metadata) continue;
    if (entry.present) map[kind].metadata.stale = entry.value;
    else delete map[kind].metadata.stale;
  }
}

function cloneArrayLike(value) {
  return value?.slice ? value.slice() : null;
}

function restoreArrayLike(target, key, snapshot) {
  if (!target || !snapshot) return;
  target[key] = snapshot.slice ? snapshot.slice() : [...snapshot];
}

function clonePlain(value) {
  if (value === undefined) return undefined;
  return value === null ? null : JSON.parse(JSON.stringify(value));
}

function riverIdOf(river) {
  return Number(river?.id ?? river?.i);
}

function maxArrayValue(values) {
  let max = 0;
  for (const value of values || []) max = Math.max(max, Number(value) || 0);
  return max;
}

function countPositive(values) {
  let count = 0;
  for (const value of values || []) if (Number(value) > 0) count++;
  return count;
}

function buildRiverRenameChanges(map, riverIds) {
  const rivers = map?.rivers?.rivers || [];
  if (!rivers.length) return [];
  const generator = createChineseNameGenerator(`${map.metadata?.seed || map.options?.seed || "map"}|explicit-river-rename|${map.metadata?.checksum || ""}`, {namebases: map.namebases});
  const changes = [];
  for (const id of riverIds) {
    const river = findRiver(map, id);
    if (!river) continue;
    const afterName = generator.makeRiverName(riverNameOptions(map, river));
    const beforeName = river.name || "";
    if (!afterName || afterName === beforeName) continue;
    changes.push({id, beforeName, afterName});
  }
  return changes;
}

function riverNameOptions(map, river) {
  const source = Number.isInteger(river.source) ? river.source : river.cells?.[0];
  const cultureId = Number.isInteger(source) ? map?.pack?.cells?.culture?.[source] || 0 : 0;
  const culture = map?.pack?.cultures?.[cultureId] || map?.society?.cultures?.[cultureId];
  return {
    id: river.id,
    cell: source,
    culture: cultureId,
    cultureType: culture?.nameStyle || culture?.type,
    flux: river.discharge || river.flux,
    type: river.parent ? "branch" : "river"
  };
}

function writeRiverName(map, riverId, name) {
  const river = findRiver(map, riverId);
  if (!river) throw new Error(`找不到河流 #${riverId}`);
  river.name = name;
}

function uniqueRiverIds(riverIds) {
  return [...new Set((riverIds || []).map(id => Number(id)).filter(id => Number.isInteger(id) && id >= 0))];
}

function normalizeWidthFactor(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.max(0.2, Math.min(3, numeric));
}

function createRiverNoteSnapshot(target, body, {name, previous = null} = {}) {
  const now = new Date().toISOString();
  return {
    id: objectNoteId(target),
    kind: target.kind,
    objectId: target.id,
    name,
    body,
    format: "plain",
    pinned: previous?.pinned || false,
    createdAt: previous?.createdAt || now,
    updatedAt: now
  };
}

function normalizeNoteBody(body) {
  return typeof body === "string" ? body.trim() : "";
}
