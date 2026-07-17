import {rebuildInheritanceTree, summarizeInheritanceTree} from "../generator/inheritance.js";
import {reexpandSocietyCultures, reexpandSocietyReligions} from "../generator/society.js";
import {objectAffected, systemAffected} from "./edit-command-effects.js";

export const CULTURE_EXPANSION_TYPES = Object.freeze(["Generic", "Hunting", "Highland", "River", "Lake", "Naval", "Nomadic"]);
export const RELIGION_EXPANSION_SCOPES = Object.freeze(["culture", "state", "global"]);
export const SOCIAL_EXPANSION_RANGE = Object.freeze({min: 0.1, max: 10, step: 0.1, defaultValue: 1});
export const SOCIAL_EXPANSION_MODE = Object.freeze({SAVE: "save", REEXPAND: "reexpand"});

const CULTURE_TYPE_SET = new Set(CULTURE_EXPANSION_TYPES);
const RELIGION_SCOPE_SET = new Set(RELIGION_EXPANSION_SCOPES);
const DOWNSTREAM_STALE = Object.freeze(["markers", "zones", "military", "economy", "diplomacy"]);

export function inspectSocialExpansion(map, request = {}) {
  if (request?.mode !== undefined && request.mode !== SOCIAL_EXPANSION_MODE.SAVE && request.mode !== SOCIAL_EXPANSION_MODE.REEXPAND) {
    const normalized = normalizeRequest(request);
    return invalidInspection(normalized, "执行方式必须是 save 或 reexpand", "invalid-mode");
  }
  const normalized = normalizeRequest(request);
  const config = socialConfig(normalized.kind);
  const store = getPrimaryStore(map, config);
  const item = store?.[normalized.id];
  if (!item || item.removed || normalized.id <= 0) return invalidInspection(normalized, `${config.label}不存在或已删除`, "missing-object");

  const patchResult = normalizePatch(item, normalized, config, {strict: true});
  if (!patchResult.valid) return invalidInspection(normalized, patchResult.reason, patchResult.code);
  const centerResult = inspectCenter(map, config, normalized.id, patchResult.patch.center);
  if (!centerResult.valid) return invalidInspection(normalized, centerResult.reason, centerResult.code);

  const parameterChanges = changedParameterNames(item, patchResult.patch, config);
  const centerChanged = Number(item.center) !== patchResult.patch.center;
  let changedPackCells = 0;
  let changedGridCells = 0;
  let linkedReligionPackCells = 0;
  if (normalized.mode === SOCIAL_EXPANSION_MODE.REEXPAND) {
    const preview = simulateReexpansion(map, normalized, patchResult.patch);
    changedPackCells = preview.changedPackCells;
    changedGridCells = preview.changedGridCells;
    linkedReligionPackCells = preview.linkedReligionPackCells;
  }
  const changed = centerChanged || parameterChanges.length > 0 || changedPackCells > 0 || changedGridCells > 0 || linkedReligionPackCells > 0;
  return {
    valid: true,
    code: "ok",
    reason: "",
    kind: normalized.kind,
    id: normalized.id,
    mode: normalized.mode,
    includeReligions: normalized.includeReligions,
    requiresConfirm: normalized.mode === SOCIAL_EXPANSION_MODE.REEXPAND,
    current: currentEditableValues(item, config),
    next: {...patchResult.patch},
    parameterChanges,
    centerChanged,
    changedPackCells,
    changedGridCells,
    linkedReligionPackCells,
    changed,
    request: {...normalized}
  };
}

export function inspectCultureExpansion(map, cultureId, options = {}) {
  return inspectSocialExpansion(map, {...options, kind: "culture", id: cultureId});
}

export function inspectReligionExpansion(map, religionId, options = {}) {
  return inspectSocialExpansion(map, {...options, kind: "religion", id: religionId});
}

export function createApplySocialExpansionCommand(request, {label = null} = {}) {
  const initialRequest = normalizeRequest(request?.request || request);
  const config = socialConfig(initialRequest.kind);
  let snapshot = null;
  let result = null;
  let appliedAt = null;

  return {
    label: label || `${config.label}${initialRequest.mode === SOCIAL_EXPANSION_MODE.REEXPAND ? "重新扩张" : "中心与参数"} #${initialRequest.id}`,
    domain: `${config.kind}-expansion`,
    effects: {
      render: "draw",
      selection: "refresh",
      runtimeStats: true,
      pickPanel: true,
      affected: initialRequest.mode === SOCIAL_EXPANSION_MODE.REEXPAND
        ? systemAffected(`${config.kind}-expansion`, [{kind: config.kind, id: initialRequest.id}])
        : objectAffected(config.kind, initialRequest.id),
      derived: [config.cellsEffect, `${config.kind}-structure`, "cell-colors", "object-index", "object-panels", "derived-stale"]
    },
    apply(context) {
      const inspection = inspectSocialExpansion(context.map, initialRequest);
      if (!inspection.valid) throw new Error(inspection.reason);
      if (inspection.requiresConfirm && initialRequest.confirm !== true) throw new Error(`${config.label}重新扩张需要 confirm: true`);
      snapshot ??= captureSnapshot(context.map);
      try {
        applyPatchToStores(context.map, config, inspection.id, inspection.next);
        failAt(initialRequest, "after-parameters");
        const expansion = inspection.mode === SOCIAL_EXPANSION_MODE.REEXPAND
          ? applyReexpansion(context.map, inspection)
          : {changedPackCells: 0, changedGridCells: 0, linkedReligionPackCells: 0};
        failAt(initialRequest, "after-ownership");
        appliedAt ??= new Date().toISOString();
        repairSocialState(context.map, config.kind, inspection.mode, inspection.includeReligions, appliedAt);
        failAt(initialRequest, "after-references");
        result = {
          kind: inspection.kind,
          id: inspection.id,
          mode: inspection.mode,
          includeReligions: inspection.includeReligions,
          parameterChanges: [...inspection.parameterChanges],
          centerChanged: inspection.centerChanged,
          ...expansion
        };
      } catch (error) {
        restoreSnapshot(context.map, snapshot);
        throw error;
      }
    },
    revert(context) {
      if (!snapshot) throw new Error(`缺少可撤销的${config.label}扩张快照`);
      restoreSnapshot(context.map, snapshot);
    },
    isNoop(context) {
      const inspection = inspectSocialExpansion(context.map, initialRequest);
      return !inspection.valid || !inspection.changed;
    },
    getInspection(context) {
      return inspectSocialExpansion(context.map, initialRequest);
    },
    getResult() {
      return result ? {...result, parameterChanges: [...result.parameterChanges]} : null;
    }
  };
}

export function createApplyCultureExpansionCommand(cultureId, options = {}) {
  return createApplySocialExpansionCommand({...options, kind: "culture", id: cultureId});
}

export function createApplyReligionExpansionCommand(religionId, options = {}) {
  return createApplySocialExpansionCommand({...options, kind: "religion", id: religionId});
}

export function normalizeSocialExpansionMap(map) {
  ensureSocialExpansionStores(map);
  for (const kind of ["culture", "religion"]) {
    const config = socialConfig(kind);
    const primary = getPrimaryStore(map, config);
    if (!Array.isArray(primary)) continue;
    for (const item of primary) {
      const id = Number(item?.i ?? item?.id);
      if (!item || item.removed || !Number.isInteger(id) || id <= 0) continue;
      const normalized = normalizePatch(item, {kind, id}, config, {strict: false}).patch;
      Object.assign(item, normalized);
    }
    repairCenters(map, config);
    repairTreePreservingOrigins(primary);
    syncStoreMirrors(map, config);
    refreshMetadata(map, config);
  }
  return map;
}

function ensureSocialExpansionStores(map) {
  const hasSociety = map?.society && typeof map.society === "object";
  const hasPackStore = Array.isArray(map?.pack?.cultures) || Array.isArray(map?.pack?.religions);
  if (!hasSociety && !hasPackStore) return;
  map.society = hasSociety ? map.society : {};
  map.society.metadata ||= {};
  for (const kind of ["culture", "religion"]) {
    const config = socialConfig(kind);
    const societyStore = map.society[config.plural];
    const packStore = map.pack?.[config.plural];
    const source = Array.isArray(societyStore) && societyStore.length
      ? societyStore
      : Array.isArray(packStore)
        ? packStore
        : societyStore;
    if (!Array.isArray(source)) continue;
    if (source !== societyStore) map.society[config.plural] = clonePlain(source);
    if (map.pack && !Array.isArray(packStore)) map.pack[config.plural] = clonePlain(map.society[config.plural]);
  }
}

function normalizeRequest(request) {
  const kind = request?.kind === "religion" ? "religion" : "culture";
  const mode = request?.mode === SOCIAL_EXPANSION_MODE.REEXPAND ? SOCIAL_EXPANSION_MODE.REEXPAND : SOCIAL_EXPANSION_MODE.SAVE;
  const normalized = {
    kind,
    id: Number(request?.id),
    mode,
    includeReligions: kind === "culture" && mode === SOCIAL_EXPANSION_MODE.REEXPAND && request?.includeReligions === true,
    confirm: request?.confirm === true
  };
  for (const key of ["center", "type", "expansion", "expansionism", "faultAt"]) {
    if (Object.prototype.hasOwnProperty.call(request || {}, key)) normalized[key] = request[key];
  }
  return normalized;
}

function normalizePatch(item, request, config, {strict}) {
  let center = Object.prototype.hasOwnProperty.call(request, "center") ? Number(request.center) : Number(item.center);
  if (!Number.isInteger(center) || center < 0) {
    if (strict) return {valid: false, code: "invalid-center", reason: `${config.label}中心必须是非负 pack cell ID`};
    center = -1;
  }

  if (config.kind === "culture") {
    const type = Object.prototype.hasOwnProperty.call(request, "type") ? String(request.type) : CULTURE_TYPE_SET.has(item.type) ? item.type : "Generic";
    if (!CULTURE_TYPE_SET.has(type)) return {valid: false, code: "invalid-type", reason: "文化类型不在冻结的七类范围内"};
    const expansionism = normalizeExpansionism(request.expansionism, item.expansionism, {strict});
    if (!expansionism.valid) return expansionism;
    return {valid: true, patch: {center, gridCenter: Number(item.gridCenter), type, expansionism: expansionism.value}};
  }

  const folk = item.type === "Folk";
  if (folk) return {valid: true, patch: {center, gridCenter: Number(item.gridCenter), expansion: "culture", expansionism: 0}};
  const expansion = Object.prototype.hasOwnProperty.call(request, "expansion") ? String(request.expansion) : RELIGION_SCOPE_SET.has(item.expansion) ? item.expansion : "culture";
  if (!RELIGION_SCOPE_SET.has(expansion)) return {valid: false, code: "invalid-expansion", reason: "宗教扩张范围必须是 culture、state 或 global"};
  const expansionism = normalizeExpansionism(request.expansionism, item.expansionism, {strict});
  if (!expansionism.valid) return expansionism;
  return {valid: true, patch: {center, gridCenter: Number(item.gridCenter), expansion, expansionism: expansionism.value}};
}

function normalizeExpansionism(input, fallback, {strict}) {
  const explicit = input !== undefined;
  let value = Number(explicit ? input : fallback);
  if (strict && explicit && !Number.isFinite(value)) {
    return {valid: false, code: "invalid-expansionism", reason: `扩张系数必须是 ${SOCIAL_EXPANSION_RANGE.min}～${SOCIAL_EXPANSION_RANGE.max} 之间的有限数值`};
  }
  if (!Number.isFinite(value)) value = SOCIAL_EXPANSION_RANGE.defaultValue;
  if (strict && explicit && (value < SOCIAL_EXPANSION_RANGE.min || value > SOCIAL_EXPANSION_RANGE.max)) {
    return {valid: false, code: "invalid-expansionism", reason: `扩张系数必须在 ${SOCIAL_EXPANSION_RANGE.min}～${SOCIAL_EXPANSION_RANGE.max} 之间`};
  }
  value = Math.max(SOCIAL_EXPANSION_RANGE.min, Math.min(SOCIAL_EXPANSION_RANGE.max, value));
  return {valid: true, value: Math.round(value * 10) / 10};
}

function inspectCenter(map, config, id, center) {
  const cells = map?.pack?.cells;
  if (!cells || center >= (cells.i?.length || cells.h?.length || 0)) return {valid: false, code: "center-out-of-range", reason: "中心 pack cell 越界"};
  if (Number(cells.h?.[center]) < 20) return {valid: false, code: "center-water", reason: "中心只能迁往陆地 cell"};
  if (Number(cells[config.field]?.[center]) !== id) return {valid: false, code: "center-not-owned", reason: `中心只能迁往该${config.label}当前拥有的 cell`};
  const collision = (getPrimaryStore(map, config) || []).find(item => item && !item.removed && Number(item.i ?? item.id) !== id && Number(item.center) === center);
  if (collision) return {valid: false, code: "center-collision", reason: `中心与同领域 #${collision.i ?? collision.id} 重叠`};
  return {valid: true};
}

function currentEditableValues(item, config) {
  const result = {center: Number(item.center), gridCenter: Number(item.gridCenter), expansionism: Number(item.expansionism)};
  if (config.kind === "culture") result.type = item.type;
  else result.expansion = item.expansion;
  return result;
}

function changedParameterNames(item, patch, config) {
  const keys = config.kind === "culture" ? ["type", "expansionism"] : ["expansion", "expansionism"];
  return keys.filter(key => item[key] !== patch[key]);
}

function simulateReexpansion(map, request, patch) {
  const shadow = createExpansionShadow(map);
  const config = socialConfig(request.kind);
  applyPatchToStores(shadow, config, request.id, patch);
  const beforePack = Array.from(map.pack.cells[config.field] || []);
  const beforeGrid = Array.from(map.grid.cells[config.field] || []);
  let linkedReligionPackCells = 0;
  if (request.kind === "culture") {
    reexpandSocietyCultures(shadow.grid, shadow.pack, shadow.society.cultures);
    repairCenters(shadow, config);
    if (request.includeReligions) {
      const beforeReligion = Array.from(map.pack.cells.religion || []);
      reexpandSocietyReligions(shadow.grid, shadow.pack, shadow.society.religions, shadow.settlements);
      repairCenters(shadow, socialConfig("religion"));
      linkedReligionPackCells = countChanged(beforeReligion, shadow.pack.cells.religion);
    }
  } else {
    reexpandSocietyReligions(shadow.grid, shadow.pack, shadow.society.religions, shadow.settlements);
    repairCenters(shadow, config);
  }
  return {
    changedPackCells: countChanged(beforePack, shadow.pack.cells[config.field]),
    changedGridCells: countChanged(beforeGrid, shadow.grid.cells[config.field]),
    linkedReligionPackCells
  };
}

function createExpansionShadow(map) {
  const cultures = clonePlain(map.society?.cultures || map.pack?.cultures || []);
  const religions = clonePlain(map.society?.religions || map.pack?.religions || []);
  const pack = {
    ...map.pack,
    cells: {
      ...map.pack.cells,
      culture: cloneArrayLike(map.pack.cells.culture),
      religion: cloneArrayLike(map.pack.cells.religion)
    },
    cultures,
    religions,
    burgs: clonePlain(map.pack?.burgs || []),
    states: clonePlain(map.pack?.states || []),
    provinces: clonePlain(map.pack?.provinces || [])
  };
  const grid = {...map.grid, cells: {...map.grid.cells, culture: cloneArrayLike(map.grid.cells.culture), religion: cloneArrayLike(map.grid.cells.religion)}};
  return {
    ...map,
    grid,
    pack,
    society: {...map.society, cultures, religions, metadata: clonePlain(map.society?.metadata || {})},
    settlements: {...map.settlements, cities: clonePlain(map.settlements?.cities || [])},
    politics: {...map.politics, states: clonePlain(map.politics?.states || []), provinces: clonePlain(map.politics?.provinces || [])}
  };
}

function applyPatchToStores(map, config, id, patch) {
  const gridCenter = Number(map.pack?.cells?.g?.[patch.center]);
  for (const store of getStores(map, config)) {
    const item = store[id];
    if (!item || item.removed) throw new Error(`找不到${config.label} #${id}`);
    Object.assign(item, patch, {center: patch.center, gridCenter: Number.isInteger(gridCenter) ? gridCenter : -1});
  }
}

function applyReexpansion(map, inspection) {
  if (inspection.kind === "culture") {
    const cultureResult = reexpandSocietyCultures(map.grid, map.pack, getPrimaryStore(map, socialConfig("culture")));
    let linkedReligionPackCells = 0;
    if (inspection.includeReligions) {
      const religionResult = reexpandSocietyReligions(map.grid, map.pack, getPrimaryStore(map, socialConfig("religion")), map.settlements);
      linkedReligionPackCells = religionResult.changedPackCells;
    }
    return {...cultureResult, linkedReligionPackCells};
  }
  return {...reexpandSocietyReligions(map.grid, map.pack, getPrimaryStore(map, socialConfig("religion")), map.settlements), linkedReligionPackCells: 0};
}

function repairSocialState(map, kind, mode, includeReligions, updatedAt) {
  const reexpanded = mode === SOCIAL_EXPANSION_MODE.REEXPAND;
  const kinds = kind === "culture" && includeReligions ? ["culture", "religion"] : [kind];
  for (const currentKind of kinds) {
    const config = socialConfig(currentKind);
    repairCenters(map, config);
    repairTreePreservingOrigins(getPrimaryStore(map, config));
    syncStoreMirrors(map, config);
    syncReferences(map, config);
    refreshMetadata(map, config);
    if (reexpanded) markStale(map, currentKind, {religionsCurrent: kind === "culture" && includeReligions, updatedAt});
  }
  if (reexpanded && kind === "culture" && !includeReligions) {
    map.society.metadata.religionsStale = true;
    markStale(map, "culture", {religionsCurrent: false, updatedAt});
  } else if (reexpanded && kind === "culture" && includeReligions) {
    map.society.metadata.religionsStale = false;
  }
}

function repairCenters(map, config) {
  const store = getPrimaryStore(map, config);
  const cells = map.pack?.cells;
  if (!Array.isArray(store) || !cells) return;
  const used = new Set();
  const items = store.filter(item => item && !item.removed && Number(item.i ?? item.id) > 0).sort((a, b) => Number(a.i ?? a.id) - Number(b.i ?? b.id));
  for (const item of items) {
    const id = Number(item.i ?? item.id);
    let center = Number(item.center);
    if (!isOwnedLandCenter(cells, config.field, id, center) || used.has(center)) center = selectDeterministicOwnedCenter(cells, config.field, id, used);
    item.center = center;
    item.gridCenter = center >= 0 && Number.isInteger(Number(cells.g?.[center])) ? Number(cells.g[center]) : -1;
    if (center >= 0) used.add(center);
    if (config.kind === "religion" && item.type === "Folk") {
      item.expansion = "culture";
      item.expansionism = 0;
    }
  }
}

function isOwnedLandCenter(cells, field, id, center) {
  return Number.isInteger(center) && center >= 0 && center < (cells.i?.length || cells.h?.length || 0) && Number(cells.h?.[center]) >= 20 && Number(cells[field]?.[center]) === id;
}

export function selectDeterministicOwnedCenter(cells, field, id, used = new Set()) {
  let best = -1;
  for (const cell of cells.i || []) {
    if (used.has(cell) || Number(cells.h?.[cell]) < 20 || Number(cells[field]?.[cell]) !== id) continue;
    if (best < 0 || compareCenterCandidates(cells, cell, best) < 0) best = cell;
  }
  return best;
}

function compareCenterCandidates(cells, left, right) {
  return (Number(cells.pop?.[right]) || 0) - (Number(cells.pop?.[left]) || 0)
    || (Number(cells.s?.[right]) || 0) - (Number(cells.s?.[left]) || 0)
    || left - right;
}

function repairTreePreservingOrigins(store) {
  const origins = new Map((store || []).filter(Boolean).map(item => [Number(item.i ?? item.id), clonePlain(item.origins)]));
  rebuildInheritanceTree(store || []);
  for (const item of store || []) {
    if (!item) continue;
    const saved = origins.get(Number(item.i ?? item.id));
    if (saved !== undefined) item.origins = saved;
  }
}

function syncStoreMirrors(map, config) {
  const primary = getPrimaryStore(map, config);
  for (const store of getStores(map, config)) {
    if (store === primary) continue;
    store.length = primary.length;
    for (let index = 0; index < primary.length; index++) store[index] = clonePlain(primary[index]);
  }
}

function syncReferences(map, config) {
  const cells = map.pack?.cells;
  for (const burg of map.pack?.burgs || []) {
    if (!burg || burg.removed || !Number.isInteger(Number(burg.cell))) continue;
    burg[config.field] = Number(cells?.[config.field]?.[burg.cell]) || 0;
  }
  for (const city of map.settlements?.cities || []) {
    const cell = Number.isInteger(Number(city?.packCell)) ? Number(city.packCell) : Number(city?.cell);
    if (!city || !Number.isInteger(cell)) continue;
    city[config.field] = Number(cells?.[config.field]?.[cell]) || 0;
  }
  for (const collection of uniqueArrays([map.politics?.states, map.pack?.states])) {
    for (const state of collection) {
      if (!state?.i || state.removed) continue;
      const capitalCell = map.pack?.burgs?.[state.capital]?.cell;
      const cell = Number.isInteger(Number(capitalCell)) ? Number(capitalCell) : Number(state.center);
      state[config.field] = Number(cells?.[config.field]?.[cell]) || 0;
    }
  }
  for (const collection of uniqueArrays([map.politics?.provinces, map.pack?.provinces])) {
    for (const province of collection) {
      if (!province?.i || province.removed) continue;
      province[config.field] = Number(cells?.[config.field]?.[province.center]) || 0;
    }
  }
}

function refreshMetadata(map, config) {
  const metadata = map.society?.metadata;
  if (!metadata) return;
  const items = getPrimaryStore(map, config) || [];
  const active = items.filter(item => item && !item.removed && Number(item.i ?? item.id) > 0);
  metadata[config.plural] = active.length;
  metadata[config.namesKey] = active.map(item => item.name || `${config.label} #${item.i ?? item.id}`);
  metadata[config.centersKey] = active.map(item => Number(item.center));
  metadata[config.packCountKey] = countPositive(map.pack?.cells?.[config.field]);
  metadata[config.gridCountKey] = countPositive(map.grid?.cells?.[config.field]);
  metadata[config.treeKey] = summarizeInheritanceTree(items);
}

function markStale(map, kind, {religionsCurrent = false, updatedAt = null} = {}) {
  const systems = [...DOWNSTREAM_STALE];
  if (kind === "culture" && !religionsCurrent) systems.unshift("religions");
  map.metadata ||= {};
  map.metadata.derivedStale = {
    ...(map.metadata.derivedStale || {}),
    systems: [...new Set([...(map.metadata.derivedStale?.systems || []), ...systems])],
    updatedAt: updatedAt || new Date().toISOString()
  };
  for (const section of DOWNSTREAM_STALE) if (map[section]?.metadata) map[section].metadata.stale = true;
}

function captureSnapshot(map) {
  return {
    packCulture: cloneArrayLike(map.pack?.cells?.culture),
    packReligion: cloneArrayLike(map.pack?.cells?.religion),
    gridCulture: cloneArrayLike(map.grid?.cells?.culture),
    gridReligion: cloneArrayLike(map.grid?.cells?.religion),
    stores: {
      culture: captureStores(map, socialConfig("culture")),
      religion: captureStores(map, socialConfig("religion"))
    },
    references: captureReferences(map),
    societyMetadata: clonePlain(map.society?.metadata || null),
    stale: captureStale(map)
  };
}

function restoreSnapshot(map, snapshot) {
  map.pack.cells.culture = cloneArrayLike(snapshot.packCulture);
  map.pack.cells.religion = cloneArrayLike(snapshot.packReligion);
  map.grid.cells.culture = cloneArrayLike(snapshot.gridCulture);
  map.grid.cells.religion = cloneArrayLike(snapshot.gridReligion);
  restoreStores(map, socialConfig("culture"), snapshot.stores.culture);
  restoreStores(map, socialConfig("religion"), snapshot.stores.religion);
  for (const entry of snapshot.references) {
    if (entry.present) entry.target[entry.key] = entry.value;
    else delete entry.target[entry.key];
  }
  if (snapshot.societyMetadata) map.society.metadata = clonePlain(snapshot.societyMetadata);
  restoreStale(map, snapshot.stale);
}

function captureStores(map, config) {
  const society = map.society?.[config.plural];
  const pack = map.pack?.[config.plural];
  return {shared: society === pack, society: clonePlain(society || []), pack: clonePlain(pack || [])};
}

function restoreStores(map, config, snapshot) {
  map.society[config.plural] = clonePlain(snapshot.society);
  map.pack[config.plural] = snapshot.shared ? map.society[config.plural] : clonePlain(snapshot.pack);
}

function captureReferences(map) {
  const entries = [];
  for (const collection of uniqueArrays([
    map.pack?.burgs,
    map.settlements?.cities,
    map.politics?.states,
    map.pack?.states,
    map.politics?.provinces,
    map.pack?.provinces
  ])) {
    for (const target of collection) {
      if (!target) continue;
      for (const key of ["culture", "religion"]) entries.push({target, key, present: Object.prototype.hasOwnProperty.call(target, key), value: target[key]});
    }
  }
  return entries;
}

function captureStale(map) {
  return {
    derived: clonePlain(map.metadata?.derivedStale || null),
    flags: Object.fromEntries(DOWNSTREAM_STALE.map(section => [section, {
      present: Object.prototype.hasOwnProperty.call(map[section]?.metadata || {}, "stale"),
      value: map[section]?.metadata?.stale
    }]))
  };
}

function restoreStale(map, snapshot) {
  map.metadata ||= {};
  if (snapshot.derived) map.metadata.derivedStale = clonePlain(snapshot.derived);
  else delete map.metadata.derivedStale;
  for (const [section, entry] of Object.entries(snapshot.flags || {})) {
    if (!map[section]?.metadata) continue;
    if (entry.present) map[section].metadata.stale = entry.value;
    else delete map[section].metadata.stale;
  }
}

function invalidInspection(request, reason, code) {
  return {valid: false, code, reason, kind: request.kind, id: request.id, mode: request.mode, includeReligions: request.includeReligions, requiresConfirm: request.mode === SOCIAL_EXPANSION_MODE.REEXPAND, changed: false, request: {...request}};
}

function failAt(request, stage) {
  if (request.faultAt === stage) throw new Error(`social-expansion fault: ${stage}`);
}

function getStores(map, config) {
  return uniqueArrays([map.society?.[config.plural], map.pack?.[config.plural]]);
}

function getPrimaryStore(map, config) {
  return map.society?.[config.plural] || map.pack?.[config.plural] || [];
}

function uniqueArrays(arrays) {
  return arrays.filter((value, index) => Array.isArray(value) && arrays.indexOf(value) === index);
}

function countChanged(before, after) {
  let changed = 0;
  const length = Math.max(before?.length || 0, after?.length || 0);
  for (let index = 0; index < length; index++) if (Number(before?.[index] || 0) !== Number(after?.[index] || 0)) changed++;
  return changed;
}

function countPositive(values) {
  let count = 0;
  for (const value of values || []) if (Number(value) > 0) count++;
  return count;
}

function cloneArrayLike(value) {
  if (value === undefined || value === null) return value;
  return value.slice ? value.slice() : Array.from(value);
}

function clonePlain(value) {
  if (value === undefined) return undefined;
  return value === null ? null : JSON.parse(JSON.stringify(value));
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
    cellsEffect: "culture-cells"
  };
  return {
    kind: "religion",
    label: "宗教",
    field: "religion",
    plural: "religions",
    namesKey: "religionNames",
    centersKey: "religionCenters",
    packCountKey: "religionPackCells",
    gridCountKey: "religionGridCells",
    treeKey: "religionTree",
    cellsEffect: "religion-cells"
  };
}
