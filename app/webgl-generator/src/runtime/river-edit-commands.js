import {EDIT_REFRESH_PRESETS} from "./edit-refresh-scheduler.js";
import {namebaseRenameAffected, objectAffected} from "./edit-command-effects.js";
import {cloneObjectNote, deleteObjectNote, objectNoteId, readObjectNote, restoreObjectNote} from "./object-notes.js";
import {OBJECT_KIND} from "./object-kinds.js";
import {createChineseNameGenerator} from "../generator/names.js";
import {normalizeRiverNetwork} from "../generator/river-network.js";
import {createRiverVisualCurveDescriptor, isSharedCubicCurve, normalizeRiverVisualCurve, sampleCentripetalCatmullRom, sampledPathLength} from "../geometry/cubic-path.js";
import {createRiverControlPoint, normalizeRiverControlPoints, updateRiverControlPointIndexes} from "./river-control-points.js";

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

const RIVER_VISUAL_PATH_EFFECTS = Object.freeze({
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

export function inspectRiverVisualWaypoint(map, riverId, packCell) {
  const id = Number(riverId);
  const cell = Number(packCell);
  const river = findRiver(map, id);
  if (!river) return invalidRiverVisualWaypoint("river-missing", `找不到河流 #${id}`);
  const point = map?.pack?.cells?.p?.[cell];
  if (!Number.isInteger(cell) || !isPoint(point)) return invalidRiverVisualWaypoint("invalid-cell", "河道控制点必须位于有效 pack cell");
  return inspectRiverControlPointAction(map, id, {type: "add", point, packCell: cell});
}

export function inspectRiverControlPointAction(map, riverId, action = {}, base = null) {
  const id = Number(riverId);
  const river = findRiver(map, id);
  if (!river) return invalidRiverControlPoint("river-missing", `找不到河流 #${id}`);
  const points = (base?.points || river.points || []).filter(isPoint).map(point => [...point]);
  if (points.length < 2) return invalidRiverControlPoint("path-too-short", "河流缺少可编辑的成品折线");
  const controls = normalizeRiverControlPoints({...river, points, controlPoints: base?.controlPoints ?? river.controlPoints}, map?.pack?.cells) || [];
  const type = String(action.type || "").trim().toLowerCase();
  if (!["add", "move", "delete"].includes(type)) return invalidRiverControlPoint("invalid-action", "不支持的河流控制点操作");
  if (type === "delete") return inspectDeleteRiverControlPoint(id, points, controls, action.controlPointId);

  const point = normalizeWorldPoint(action.point || action.candidatePoint);
  if (!point) return invalidRiverControlPoint("invalid-point", "控制点必须包含有效的地图坐标");
  if (!isWorldPointInsideMap(map, point)) return invalidRiverControlPoint("point-out-of-bounds", "控制点必须位于地图边界内", {candidatePoint: point});
  const packCell = validPackCell(map?.pack?.cells, action.packCell);

  if (type === "add") {
    const visualCurve = base?.visualCurve ?? river.visualCurve;
    const nearest = isSharedCubicCurve(visualCurve) ? nearestSharedCurveSegment(points, point) : nearestRiverSegment(points, point);
    const nextPoint = [point[0], point[1], interpolatePointFlux(points[nearest.index], points[nearest.index + 1], nearest.amount)];
    const insertIndex = nearest.index + 1;
    const nextPoints = [...points.slice(0, insertIndex), nextPoint, ...points.slice(insertIndex)];
    const shiftedControls = updateRiverControlPointIndexes(controls, null, insertIndex);
    const nextControl = createRiverControlPoint({...river, points, controlPoints: controls}, insertIndex, nextPoint, map?.pack?.cells, null, packCell);
    return {
      valid: true,
      changed: true,
      code: "ok",
      action: "add",
      riverId: id,
      packCell,
      insertIndex,
      candidatePoint: nextPoint,
      distance: nearest.distance,
      nearestPoint: [...nearest.point],
      originalSegment: [points[nearest.index].slice(0, 2), points[nearest.index + 1].slice(0, 2)],
      points: nextPoints,
      controlPoints: [...shiftedControls, nextControl].filter(Boolean).sort((a, b) => a.pointIndex - b.pointIndex),
      length: sharedCurveLength(nextPoints),
      visualCurve: createRiverVisualCurveDescriptor()
    };
  }

  const controlPointId = String(action.controlPointId || "");
  const control = controls.find(item => item.id === controlPointId);
  if (!control) return invalidRiverControlPoint("control-point-missing", "找不到要移动的河道控制点", {controlPointId});
  const pointIndex = Number(control.pointIndex);
  if (!Number.isInteger(pointIndex) || pointIndex <= 0 || pointIndex >= points.length - 1) return invalidRiverControlPoint("protected-endpoint", "河源和河口控制点不可直接移动", {controlPointId, pointIndex});
  const nextPoint = [point[0], point[1], Number.isFinite(Number(control.flux)) ? Number(control.flux) : Number(points[pointIndex]?.[2]) || 0];
  const nextPoints = points.map((item, index) => index === pointIndex ? nextPoint : [...item]);
  const nextControls = controls.map(item => item.id === controlPointId
    ? {...item, x: nextPoint[0], y: nextPoint[1], packCell, flux: nextPoint[2]}
    : {...item});
  return {
    valid: true,
    changed: nextPoint[0] !== points[pointIndex][0] || nextPoint[1] !== points[pointIndex][1],
    code: "ok",
    action: "move",
    riverId: id,
    packCell,
    controlPointId,
    pointIndex,
    candidatePoint: nextPoint,
    points: nextPoints,
    controlPoints: nextControls,
    length: sharedCurveLength(nextPoints),
    visualCurve: createRiverVisualCurveDescriptor()
  };
}

function inspectDeleteRiverControlPoint(riverId, points, controls, controlPointId) {
  const id = String(controlPointId || "");
  const control = controls.find(item => item.id === id);
  if (!control) return invalidRiverControlPoint("control-point-missing", "找不到要删除的河道控制点", {controlPointId: id});
  const pointIndex = Number(control.pointIndex);
  if (!Number.isInteger(pointIndex) || pointIndex <= 0 || pointIndex >= points.length - 1) return invalidRiverControlPoint("protected-endpoint", "河源和河口控制点不可删除", {controlPointId: id, pointIndex});
  const nextPoints = points.filter((_, index) => index !== pointIndex);
  const nextControls = updateRiverControlPointIndexes(controls, pointIndex, null);
  return {
    valid: true,
    changed: true,
    code: "ok",
    action: "delete",
    riverId,
    controlPointId: id,
    pointIndex,
    points: nextPoints,
    controlPoints: nextControls,
    length: sharedCurveLength(nextPoints),
    visualCurve: createRiverVisualCurveDescriptor()
  };
}

function interpolatePointFlux(start, end, amount) {
  return Math.max(0, Math.round((Number(start?.[2]) || 0) + ((Number(end?.[2]) || 0) - (Number(start?.[2]) || 0)) * amount));
}

function normalizeWorldPoint(point) {
  if (!isPoint(point)) return null;
  return [Number(point[0]), Number(point[1])];
}

function invalidRiverControlPoint(code, reason, detail = {}) {
  return {valid: false, changed: false, code, reason, points: [], controlPoints: [], ...detail};
}

export function createAddRiverVisualWaypointCommand(riverId, packCell, {label = "添加河道控制点"} = {}) {
  const id = Number(riverId);
  let delegated = null;
  let preview = null;
  return {
    label: `${label} #${id}`,
    domain: OBJECT_KIND.RIVER,
    effects: {...RIVER_VISUAL_PATH_EFFECTS, affected: objectAffected(OBJECT_KIND.RIVER, id)},
    apply(context) {
      ensureDelegate(context);
      delegated.apply(context);
    },
    revert(context) {
      if (!delegated) throw new Error("缺少可撤销的河道控制点命令");
      delegated.revert(context);
    },
    isNoop(context) {
      ensureDelegate(context);
      return delegated.isNoop(context);
    },
    getResult() {
      const result = delegated?.getResult?.();
      return result ? {...result, packCell: Number(packCell)} : null;
    }
  };

  function ensureDelegate(context) {
    if (delegated) return;
    preview = inspectRiverVisualWaypoint(context.map, id, packCell);
    if (!preview.valid) throw riverVisualWaypointError(preview);
    delegated = createEditRiverControlPointsCommand(id, preview, {label});
  }
}

export function createEditRiverControlPointsCommand(riverId, nextState, {label = "编辑河道控制点"} = {}) {
  const id = Number(riverId);
  let before = null;
  let after = null;
  return {
    label: `${label} #${id}`,
    domain: OBJECT_KIND.RIVER,
    effects: {...RIVER_VISUAL_PATH_EFFECTS, affected: objectAffected(OBJECT_KIND.RIVER, id)},
    apply(context) {
      const river = findRiver(context.map, id);
      if (!river) throw new Error(`找不到河流 #${id}`);
      if (!before) {
        before = captureRiverControlPointState(river);
        after = normalizeRiverControlPointState(context.map, river, nextState);
      }
      river.points = clonePlain(after.points);
      river.length = after.length;
      river.controlPoints = clonePlain(after.controlPoints);
      river.visualCurve = clonePlain(after.visualCurve);
    },
    revert(context) {
      const river = findRiver(context.map, id);
      if (!river || !before) throw new Error("缺少可撤销的河流控制点快照");
      restoreRiverControlPointState(river, before);
    },
    isNoop(context) {
      const river = findRiver(context.map, id);
      if (!river) return true;
      const preview = normalizeRiverControlPointState(context.map, river, nextState);
      return riverControlPointStateFingerprint(captureRiverControlPointState(river)) === riverControlPointStateFingerprint(preview);
    },
    getResult() {
      return after ? {riverId: id, controlPoints: after.controlPoints.length, points: after.points.length, length: after.length} : null;
    }
  };
}

function normalizeRiverControlPointState(map, river, state = {}) {
  const points = (state.points || river.points || []).map(point => [...point]);
  const controls = normalizeRiverControlPoints({...river, points, controlPoints: state.controlPoints || []}, map?.pack?.cells) || [];
  const visualCurve = normalizeRiverVisualCurve(state.visualCurve) || createRiverVisualCurveDescriptor();
  return {points, controlPoints: controls, visualCurve, length: sharedCurveLength(points)};
}

function captureRiverControlPointState(river) {
  return {
    points: clonePlain(river.points || []),
    controlPoints: Object.prototype.hasOwnProperty.call(river, "controlPoints") ? clonePlain(river.controlPoints || []) : undefined,
    visualCurve: Object.prototype.hasOwnProperty.call(river, "visualCurve") ? clonePlain(river.visualCurve) : undefined,
    length: Object.prototype.hasOwnProperty.call(river, "length") ? river.length : undefined,
    hadLength: Object.prototype.hasOwnProperty.call(river, "length"),
    hadControlPoints: Object.prototype.hasOwnProperty.call(river, "controlPoints"),
    hadVisualCurve: Object.prototype.hasOwnProperty.call(river, "visualCurve")
  };
}

function restoreRiverControlPointState(river, snapshot) {
  river.points = clonePlain(snapshot.points);
  if (snapshot.hadControlPoints) river.controlPoints = clonePlain(snapshot.controlPoints || []);
  else delete river.controlPoints;
  if (snapshot.hadVisualCurve) river.visualCurve = clonePlain(snapshot.visualCurve);
  else delete river.visualCurve;
  if (snapshot.hadLength) river.length = snapshot.length;
  else delete river.length;
}

function riverControlPointStateFingerprint(state) {
  return JSON.stringify({
    points: state.points || [],
    controlPoints: state.controlPoints === undefined ? null : state.controlPoints || [],
    visualCurve: state.visualCurve === undefined ? null : state.visualCurve,
    length: Number.isFinite(Number(state.length)) ? Number(state.length) : null
  });
}

function validPackCell(packCells, value) {
  if (value === null || value === undefined) return null;
  const cell = Number(value);
  const count = packCells?.p?.length || packCells?.i?.length || 0;
  return Number.isInteger(cell) && cell >= 0 && cell < count ? cell : null;
}

function isWorldPointInsideMap(map, point) {
  const width = Number(map?.metadata?.graphWidth ?? map?.grid?.metadata?.graphWidth);
  const height = Number(map?.metadata?.graphHeight ?? map?.grid?.metadata?.graphHeight);
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
    && point[0] >= 0 && point[0] <= width && point[1] >= 0 && point[1] <= height;
}

function sharedCurveLength(points) {
  return sampledPathLength(sampleCentripetalCatmullRom(points).points);
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

function invalidRiverVisualWaypoint(code, reason) {
  return {valid: false, changed: false, code, reason, points: [], length: 0};
}

function riverCreationError(preview) {
  const error = new Error(preview.reason);
  error.code = preview.code;
  return error;
}

function riverVisualWaypointError(preview) {
  const error = new Error(preview.reason);
  error.code = preview.code;
  return error;
}

function nearestRiverSegment(points, point) {
  let nearest = {index: 0, amount: 0, distance: Infinity, point: [Number(points[0]?.[0]) || 0, Number(points[0]?.[1]) || 0]};
  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index];
    const end = points[index + 1];
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const lengthSquared = dx * dx + dy * dy;
    const amount = lengthSquared > Number.EPSILON
      ? Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared))
      : 0;
    const nearestPoint = [start[0] + dx * amount, start[1] + dy * amount];
    const distance = Math.hypot(point[0] - nearestPoint[0], point[1] - nearestPoint[1]);
    if (distance < nearest.distance) nearest = {index, amount, distance, point: nearestPoint};
  }
  return nearest;
}

function nearestSharedCurveSegment(points, point) {
  const sampled = sampleCentripetalCatmullRom(points);
  const nearest = nearestRiverSegment(sampled.points, point);
  const span = sampled.spans[nearest.index];
  if (!span) return nearestRiverSegment(points, point);
  const amount = span.startAmount + (span.endAmount - span.startAmount) * nearest.amount;
  return {...nearest, index: span.sourceSegmentIndex, amount};
}

function roundCoordinate(value) {
  return Math.round(Number(value) * 100) / 100;
}

function isPoint(point) {
  return Number.isFinite(Number(point?.[0])) && Number.isFinite(Number(point?.[1]));
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
