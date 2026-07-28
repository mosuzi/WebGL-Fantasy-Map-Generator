import {canAssignInheritanceParent} from "../generator/inheritance.js";
import {normalizeDiplomacyRelation} from "../generator/diplomacy.js";
import {MILITARY_STATUSES, MILITARY_UNITS, normalizeUnitRatios} from "../generator/military.js";
import {createNamebaseImportPreview} from "../generator/namebase-store.js";
import {createSyncCityOwnerToCellCommand} from "./city-edit-commands.js";
import {inspectDeleteImpact} from "./delete-impact.js";
import {createSetDiplomacyRelationCommand} from "./diplomacy-edit-commands.js";
import {
  createImportMilitaryBattleEventsCommand,
  createMoveMilitaryStationCommand,
  createSetMilitaryBaseCommand,
  createSetMilitaryRatiosCommand,
  createSetMilitaryStatusBatchCommand,
  createSetMilitaryStatusCommand
} from "./military-edit-commands.js";
import {createImportMeasurementsCommand} from "./measurement-edit-commands.js";
import {createImportNotesCommand, inspectNotesImport} from "./note-import.js";
import {OBJECT_KIND} from "./object-kinds.js";
import {createSetStateCapitalCommand} from "./object-edit-commands.js";
import {inspectSocialExpansion} from "./social-expansion-edit-commands.js";
import {createApplySocialAssignmentCommand} from "./social-ownership-edit-commands.js";

export const REMAINING_RULE_ACTION = Object.freeze({
  CAPITAL_CHANGE: "politics.relocate-capital",
  CITY_OWNER_SYNC: "settlement.sync-city-owner",
  CULTURE_LIFECYCLE: "society.culture.lifecycle",
  RELIGION_LIFECYCLE: "society.religion.lifecycle",
  DIPLOMACY_RELATION: "diplomacy.set-bilateral-relation",
  MILITARY_RATIOS: "military.reconfigure-force",
  MILITARY_MOVE: "military.move-station",
  MILITARY_BASE: "military.set-base",
  MILITARY_STATUS: "military.issue-status",
  COLLECTION_IMPORT: "editor.import-collection"
});

export const REMAINING_RULE_ACTIONS = Object.freeze(Object.values(REMAINING_RULE_ACTION));

const INSPECTORS = Object.freeze({
  [REMAINING_RULE_ACTION.CAPITAL_CHANGE]: inspectCapitalRelocation,
  [REMAINING_RULE_ACTION.CITY_OWNER_SYNC]: inspectCityOwnerSync,
  [REMAINING_RULE_ACTION.CULTURE_LIFECYCLE]: (map, input) => inspectSocialLifecycle(map, "culture", input),
  [REMAINING_RULE_ACTION.RELIGION_LIFECYCLE]: (map, input) => inspectSocialLifecycle(map, "religion", input),
  [REMAINING_RULE_ACTION.DIPLOMACY_RELATION]: inspectDiplomacyRelation,
  [REMAINING_RULE_ACTION.MILITARY_RATIOS]: inspectMilitaryRatios,
  [REMAINING_RULE_ACTION.MILITARY_MOVE]: inspectMilitaryMove,
  [REMAINING_RULE_ACTION.MILITARY_BASE]: inspectMilitaryBase,
  [REMAINING_RULE_ACTION.MILITARY_STATUS]: inspectMilitaryStatus,
  [REMAINING_RULE_ACTION.COLLECTION_IMPORT]: inspectCollectionImport
});

export function inspectRemainingRuleAction(map, actionId, input = {}) {
  const inspect = INSPECTORS[String(actionId || "")];
  if (!inspect) return reject("unknown-action", "未知的领域规则动作");
  if (!map || typeof map !== "object") return reject("missing-map", "当前没有可预检的地图");
  try {
    return normalizeResult(inspect(map, input && typeof input === "object" ? input : {}));
  } catch (error) {
    return reject(error?.code || "invalid-input", error?.message || "领域规则输入无效");
  }
}

function inspectCapitalRelocation(map, input) {
  const stateId = integer(input.stateId);
  const cityId = integer(input.cityId);
  if (stateId === null || stateId <= 0) return reject("invalid-state", "国家 ID 必须是正整数");
  if (cityId === null || cityId <= 0) return reject("invalid-city", "城市 ID 必须是正整数");
  const state = readStates(map)?.[stateId];
  if (!state || state.removed) return reject("state-not-found", `找不到国家 #${stateId}`);
  const city = map?.settlements?.cities?.[cityId];
  if (!city || city.removed) return reject("city-not-found", `找不到城市 #${cityId}`);
  if (Number(city.state) !== stateId) return reject("city-state-mismatch", `城市 #${cityId} 不属于国家 #${stateId}`);
  const burg = findBurgForCity(map, city);
  const burgId = integer(input.burgId ?? burg?.i ?? burg?.id ?? city.burgId);
  if (burgId === null || burgId <= 0 || !burg) return reject("burg-not-found", `城市 #${cityId} 缺少对应城镇`);
  const command = createSetStateCapitalCommand(stateId, burgId);
  if (command.isNoop({map})) return reject("capital-unchanged", `城市 #${cityId} 已是国家 #${stateId} 首都`);
  return allow(`可把城市 #${cityId} 设为国家 #${stateId} 首都`, [
    {kind: OBJECT_KIND.STATE, id: stateId},
    {kind: OBJECT_KIND.CITY, id: cityId}
  ]);
}

function inspectCityOwnerSync(map, input) {
  const cityId = integer(input.cityId);
  if (cityId === null || cityId < 0) return reject("invalid-city", "城市 ID 必须是非负整数");
  const city = map?.settlements?.cities?.[cityId];
  if (!city || city.removed) return reject("city-not-found", `找不到城市 #${cityId}`);
  const owner = readCityCellOwner(map, city);
  if (!owner) return reject("city-cell-missing", `城市 #${cityId} 缺少可同步的 cell 归属`);
  const burg = findBurgForCity(map, city);
  const stateChanged = Number(city.state) !== owner.state;
  const provinceChanged = Number(city.province) !== owner.province;
  if (stateChanged && (city.capital || burg?.capital)) {
    return reject("capital-owner-conflict", `城市 #${cityId} 是首都，不能直接同步到其它国家`);
  }
  if (provinceChanged && (city.provincial || burg?.provincial)) {
    return reject("provincial-owner-conflict", `城市 #${cityId} 是省会，不能直接同步到其它省份`);
  }
  const command = createSyncCityOwnerToCellCommand(cityId);
  if (command.isNoop({map})) return reject("owner-unchanged", `城市 #${cityId} 的归属已经与落点一致`);
  return allow(`可把城市 #${cityId} 归属同步为国家 #${owner.state}、省份 #${owner.province}`, [
    {kind: OBJECT_KIND.CITY, id: cityId},
    {kind: OBJECT_KIND.STATE, id: owner.state},
    {kind: OBJECT_KIND.PROVINCE, id: owner.province}
  ], stateChanged);
}

function inspectSocialLifecycle(map, kind, input) {
  const label = kind === "culture" ? "文化" : "宗教";
  const plural = kind === "culture" ? "cultures" : "religions";
  const operation = String(input.operation || "").trim();
  const store = map?.society?.[plural] || map?.pack?.[plural];
  if (!Array.isArray(store)) return reject(`${kind}-store-missing`, `当前地图没有${label}数据`);

  if (operation === "create") {
    return allow(`可创建${label}${String(input.name || "").trim() ? `“${String(input.name).trim()}”` : ""}`, [{kind, id: "new"}]);
  }

  const id = integer(input.id ?? input.objectId);
  if (id === null || id <= 0) return reject(`invalid-${kind}`, `${label} ID 必须是正整数`);
  const item = store[id];
  if (!item || item.removed) return reject(`${kind}-not-found`, `找不到${label} #${id}`);

  if (operation === "assign") {
    const assignmentError = validateSocialAssignmentInput(map, input);
    if (assignmentError) return assignmentError;
    const changes = socialAssignmentChanges(map, kind, id, input);
    if (!changes.length) return reject("empty-assignment", `${label}归属没有有效 grid cells`);
    const command = createApplySocialAssignmentCommand(kind, changes);
    if (command.isNoop({map})) return reject("assignment-unchanged", `${label}归属没有变化或包含无效目标`);
    return allow(`可更新${label} #${id} 的 ${changes.length} 个 grid cells`, [
      {kind, id},
      ...changes.map(change => ({kind: "grid-cell", id: change.gridCell}))
    ]);
  }

  if (operation === "expand") {
    const inspection = inspectSocialExpansion(map, {
      ...(input.options && typeof input.options === "object" ? input.options : {}),
      kind,
      id
    });
    if (!inspection.valid) return reject(inspection.code || "expansion-invalid", inspection.reason || `${label}扩张预检未通过`);
    if (!inspection.changed) return reject(inspection.code === "regeneration_locked_noop" ? inspection.code : "expansion-unchanged", `${label}扩张没有变化`);
    return allow(
      `可更新${label} #${id} 的中心、参数或覆盖范围`,
      [{kind, id}],
      inspection.requiresConfirm || input.options?.mode === "reexpand"
    );
  }

  if (operation === "reparent") {
    const parentId = integer(input.parentId ?? 0);
    if (parentId === null || parentId < 0) return reject("invalid-parent", `${label}父级 ID 必须是非负整数`);
    if ((Number(item.parent) || 0) === parentId) return reject("parent-unchanged", `${label}继承父级没有变化`);
    if (parentId === id || (parentId > 0 && (!store[parentId] || store[parentId].removed))) {
      return reject("parent-cycle-or-missing", `${label}父级不存在或会形成继承循环`);
    }
    if (!canAssignInheritanceParent(store, id, parentId)) return reject("parent-cycle-or-missing", `${label}父级不存在或会形成继承循环`);
    return allow(`可把${label} #${id} 的父级设为 #${parentId}`, [
      {kind, id},
      ...(parentId ? [{kind, id: parentId}] : [])
    ]);
  }

  if (operation === "delete") {
    const preview = inspectDeleteImpact(map, kind, [id]);
    if (!preview.valid) return reject(preview.skipped?.[0]?.code || `${kind}-not-found`, preview.summary);
    return allow(preview.summary, preview.deleteIds.map(targetId => ({kind, id: targetId})), preview.requiresConfirm);
  }

  return reject("invalid-operation", `${label}生命周期 operation 必须是 create、assign、expand、reparent 或 delete`);
}

function inspectDiplomacyRelation(map, input) {
  const subjectId = integer(input.subjectId);
  const objectId = integer(input.objectId);
  if (subjectId === null || subjectId <= 0 || objectId === null || objectId <= 0) {
    return reject("invalid-state-pair", "外交双方必须是正整数国家 ID");
  }
  if (subjectId === objectId) return reject("same-state", "不能设置国家与自身的外交关系");
  const states = readStates(map);
  const subject = states?.[subjectId];
  const object = states?.[objectId];
  if (!subject || subject.removed) return reject("subject-not-found", `找不到外交主体国家 #${subjectId}`);
  if (!object || object.removed) return reject("object-not-found", `找不到外交对象国家 #${objectId}`);
  const relation = normalizeDiplomacyRelation(input.relation);
  if (!relation) return reject("invalid-relation", `不支持的外交关系：${input.relation ?? ""}`);
  const command = createSetDiplomacyRelationCommand(subjectId, objectId, relation);
  if (command.isNoop({map})) return reject("relation-unchanged", "双方外交关系没有变化");
  const current = normalizeDiplomacyRelation(subject.diplomacy?.[objectId]);
  const requiresConfirm = [current, relation].some(value => ["Enemy", "Vassal", "Suzerain"].includes(value));
  return allow(`可把国家 #${subjectId} 与 #${objectId} 的关系设为 ${relation}`, [
    {kind: OBJECT_KIND.STATE, id: subjectId},
    {kind: OBJECT_KIND.STATE, id: objectId}
  ], requiresConfirm);
}

function inspectMilitaryRatios(map, input) {
  const stateId = integer(input.stateId);
  if (stateId === null || stateId <= 0) return reject("invalid-state", "国家 ID 必须是正整数");
  const state = readStates(map)?.[stateId];
  if (!state || state.removed) return reject("state-not-found", `找不到国家 #${stateId}`);
  if (!input.ratios || typeof input.ratios !== "object" || Array.isArray(input.ratios)) return reject("invalid-ratios", "兵种比例必须是对象");
  const provided = MILITARY_UNITS.filter(unit => Object.hasOwn(input.ratios, unit.name));
  if (!provided.length) return reject("empty-ratios", "兵种比例至少要包含一个已知兵种");
  if (provided.some(unit => !Number.isFinite(Number(input.ratios[unit.name])) || Number(input.ratios[unit.name]) < 0)) {
    return reject("invalid-ratios", "兵种比例必须是非负有限数");
  }
  if (provided.every(unit => Number(input.ratios[unit.name]) === 0)) return reject("zero-ratios", "兵种比例总和必须大于零");
  const next = normalizeUnitRatios(input.ratios);
  const command = createSetMilitaryRatiosCommand(stateId, next);
  if (command.isNoop({map})) return reject("ratios-unchanged", "国家兵种比例没有变化");
  return allow(`可调整国家 #${stateId} 的兵种比例并重配军队`, [
    {kind: OBJECT_KIND.STATE, id: stateId},
    {kind: OBJECT_KIND.MILITARY, id: stateId}
  ], true);
}

function inspectMilitaryMove(map, input) {
  const target = normalizeRegimentTarget(input.target);
  const found = findRegiment(map, target);
  if (!found.regiment) return reject("regiment-not-found", "找不到要移动的军团");
  const destination = normalizeDestination(input.destination);
  if (!destination || !map?.pack?.cells?.p?.[destination.cell]) return reject("destination-not-found", "找不到可移动的驻地目标");
  const owner = Number(map?.pack?.cells?.state?.[destination.cell]) || 0;
  if (owner !== target.stateId) return reject("foreign-territory", `目标 pack cell #${destination.cell} 不属于军团国家`);
  const isWater = Number(map?.pack?.cells?.h?.[destination.cell]) < 20;
  const isNaval = Boolean(found.regiment.n || found.regiment.type === "fleet");
  if (isWater !== isNaval) return reject("terrain-mismatch", isNaval ? "舰队基地必须位于水域" : "陆军驻地必须位于陆地");
  const command = createMoveMilitaryStationCommand(target, destination);
  if (command.isNoop({map})) return reject("station-unchanged", "军团已在目标驻地并处于驻防状态");
  return allow(`可把军团 ${target.id} 移至 pack cell #${destination.cell}`, [
    {kind: OBJECT_KIND.MILITARY, id: target.id},
    {kind: "pack-cell", id: destination.cell}
  ]);
}

function inspectMilitaryBase(map, input) {
  const target = normalizeRegimentTarget(input.target);
  const {regiment} = findRegiment(map, target);
  if (!regiment) return reject("regiment-not-found", "找不到要设置基地的军团");
  if (!Number.isFinite(Number(regiment.x)) || !Number.isFinite(Number(regiment.y))) {
    return reject("station-coordinates-missing", "军团没有可用驻地坐标");
  }
  const command = createSetMilitaryBaseCommand(target);
  if (command.isNoop({map})) return reject("base-unchanged", "军团当前位置已经是基地");
  return allow(`可把军团 ${target.id} 的当前位置设为基地`, [{kind: OBJECT_KIND.MILITARY, id: target.id}]);
}

function inspectMilitaryStatus(map, input) {
  const status = String(input.status || "");
  if (!Object.hasOwn(MILITARY_STATUSES, status)) return reject("invalid-status", `未知军团态势：${status}`);
  const batch = Array.isArray(input.targets);
  const sources = batch ? input.targets : [input.target];
  if (sources.some(source => {
    const target = normalizeRegimentTarget(source);
    return target.stateId <= 0 || target.regimentId < 0 || !target.id;
  })) {
    return reject("invalid-target", "军团目标必须包含有效的国家和军团 ID");
  }
  const targets = uniqueTargets(sources);
  if (!targets.length) return reject("empty-targets", "至少需要一个军团目标");
  const missing = targets.filter(target => !findRegiment(map, target).regiment);
  if (missing.length) return reject("regiment-not-found", `有 ${missing.length} 个军团不存在`);
  const command = batch
    ? createSetMilitaryStatusBatchCommand(targets, status)
    : createSetMilitaryStatusCommand(targets[0], status);
  if (command.isNoop({map})) return reject("status-unchanged", "所选军团态势没有变化");
  return allow(`可把 ${targets.length} 支军团态势设为 ${MILITARY_STATUSES[status].label}`, targets.map(target => ({
    kind: OBJECT_KIND.MILITARY,
    id: target.id
  })));
}

function inspectCollectionImport(map, input) {
  const kind = String(input.kind || "").trim();
  const options = input.options && typeof input.options === "object" ? input.options : {};
  if (kind === "notes") {
    const preview = inspectNotesImport(input.document, map, {mode: options.mode});
    if (!preview.validDocument || !preview.canImport) return reject(preview.diagnostics?.[0]?.code || "notes-not-importable", "备注集合没有可导入记录");
    try {
      if (createImportNotesCommand(input.document, {mode: options.mode}).isNoop({map})) return reject("import-unchanged", "备注集合与当前地图一致");
    } catch (error) {
      return reject(error?.code || "notes-not-importable", error?.message || "备注集合无法导入");
    }
    return allow(
      `可导入 ${preview.valid} 条备注`,
      preview.notes.map(note => ({kind: OBJECT_KIND.NOTE, id: note.id})),
      options.mode === "replace"
    );
  }

  if (kind === "measurements") {
    const items = input.items ?? input.document;
    if (!Array.isArray(items)) return reject("invalid-measurements", "测量集合必须是数组");
    const valid = items.filter(item => Array.isArray(item?.points) && item.points.some(validPoint));
    if (!valid.length) return reject("empty-measurements", "测量集合没有包含有效点的对象");
    if (createImportMeasurementsCommand(valid).isNoop({map})) return reject("import-unchanged", "测量集合没有可导入记录");
    return allow(`可导入 ${valid.length} 个测量对象`, [{kind: OBJECT_KIND.MEASUREMENT, id: "new"}]);
  }

  if (kind === "namebases") {
    const document = input.document;
    if (!document || typeof document !== "object" || !Array.isArray(document.bases)) return reject("invalid-namebase-document", "名称库文档缺少 bases 数组");
    const preview = createNamebaseImportPreview(map, document, {filename: options.filename, mode: options.mode});
    if (!preview.valid && !preview.replaceCount) return reject("empty-namebases", "名称库文档没有可导入记录");
    return allow(
      `可导入 ${preview.valid} 个名称库${preview.replaceCount ? `并替换 ${preview.replaceCount} 个` : ""}`,
      [{kind: "namebase", id: "import"}],
      options.mode === "replace" || preview.replaceCount > 0
    );
  }

  if (kind === "military-events") {
    const document = input.document;
    if (!document || typeof document !== "object") return reject("invalid-military-events", "战斗事件文档必须是对象或数组");
    const command = createImportMilitaryBattleEventsCommand(document);
    if (command.isNoop({map})) return reject("empty-military-events", "战斗事件集合没有可匹配当前军团的记录");
    return allow("可导入军团战斗事件", [{kind: OBJECT_KIND.MILITARY, id: "events"}]);
  }

  return reject("invalid-collection-kind", "集合类型必须是 notes、measurements、namebases 或 military-events");
}

function socialAssignmentChanges(map, kind, id, input) {
  if (Array.isArray(input.changes)) return input.changes;
  const cells = [...new Set((input.gridCellIds || []).map(Number).filter(Number.isInteger))].sort((a, b) => a - b);
  const values = map?.grid?.cells?.[kind];
  return cells.map(gridCell => ({
    gridCell,
    before: Number(values?.[gridCell]) || 0,
    after: id
  })).filter(change => change.gridCell >= 0 && change.gridCell < (values?.length || 0) && change.before !== change.after);
}

function validateSocialAssignmentInput(map, input) {
  if (!Array.isArray(input.gridCellIds) && !Array.isArray(input.changes)) {
    return reject("invalid-assignment", "社会归属必须提供 gridCellIds 或 changes 数组");
  }
  const count = map?.grid?.cells?.h?.length || 0;
  const ids = Array.isArray(input.changes)
    ? input.changes.map(change => Number(change?.gridCell))
    : input.gridCellIds.map(Number);
  if (!ids.length) return reject("empty-assignment", "社会归属至少需要一个 grid cell");
  if (ids.some(id => !Number.isInteger(id) || id < 0 || id >= count)) {
    return reject("invalid-grid-cell", "社会归属包含无效 grid cell");
  }
  if (ids.some(id => Number(map.grid.cells.h[id]) < 20)) {
    return reject("water-grid-cell", "文化或宗教只能分配到陆地 grid cell");
  }
  return null;
}

function readStates(map) {
  return map?.pack?.states || map?.politics?.states || [];
}

function findBurgForCity(map, city) {
  const byId = map?.pack?.burgs?.[Number(city?.burgId)];
  if (byId && !byId.removed) return byId;
  return (map?.pack?.burgs || []).find(burg => burg && !burg.removed && Number(burg.cityId) === Number(city?.id)) || null;
}

function readCityCellOwner(map, city) {
  const burg = findBurgForCity(map, city);
  const packCell = integer(city.packCell ?? burg?.cell);
  const gridCell = integer(city.cell);
  if (packCell === null && gridCell === null) return null;
  const state = Number(packCell !== null ? map?.pack?.cells?.state?.[packCell] : map?.grid?.cells?.state?.[gridCell]) || 0;
  const province = Number(packCell !== null ? map?.pack?.cells?.province?.[packCell] : map?.grid?.cells?.province?.[gridCell]) || 0;
  return {state, province};
}

function normalizeRegimentTarget(target = {}) {
  const parts = String(target?.id || "").split(":");
  const stateId = integer(target?.stateId ?? target?.state ?? parts[0]);
  const regimentId = integer(target?.regimentId ?? target?.i ?? parts[1]);
  return {
    stateId: stateId ?? -1,
    regimentId: regimentId ?? -1,
    id: stateId !== null && regimentId !== null ? `${stateId}:${regimentId}` : ""
  };
}

function uniqueTargets(targets) {
  const result = [];
  const seen = new Set();
  for (const source of targets || []) {
    const target = normalizeRegimentTarget(source);
    if (target.stateId <= 0 || target.regimentId < 0 || seen.has(target.id)) continue;
    seen.add(target.id);
    result.push(target);
  }
  return result;
}

function findRegiment(map, target) {
  const state = readStates(map)?.[target.stateId];
  const regiment = (state?.military || []).find(item =>
    Number(item?.i) === target.regimentId
    || String(item?.id || "") === target.id
  ) || null;
  return {state, regiment};
}

function normalizeDestination(value = {}) {
  const cell = integer(value?.cell ?? value?.packCell);
  if (cell === null || cell < 0) return null;
  const x = value?.x === undefined ? undefined : Number(value.x);
  const y = value?.y === undefined ? undefined : Number(value.y);
  if ((x !== undefined && !Number.isFinite(x)) || (y !== undefined && !Number.isFinite(y))) return null;
  return {cell, ...(x === undefined ? {} : {x}), ...(y === undefined ? {} : {y}), name: String(value?.name || "")};
}

function validPoint(point) {
  if (Array.isArray(point)) return Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]));
  return Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.y));
}

function integer(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function allow(summary, affected = [], requiresConfirm = false) {
  return {allowed: true, code: "ok", summary, affected, requiresConfirm: Boolean(requiresConfirm)};
}

function reject(code, summary, affected = [], requiresConfirm = false) {
  return {allowed: false, code, summary, affected, requiresConfirm: Boolean(requiresConfirm)};
}

function normalizeResult(result) {
  return {
    allowed: result?.allowed === true,
    code: String(result?.code || (result?.allowed ? "ok" : "rule-rejected")),
    summary: String(result?.summary || "领域规则预检未提供摘要"),
    affected: Array.isArray(result?.affected) ? result.affected.map(item => ({...item})) : [],
    requiresConfirm: result?.requiresConfirm === true
  };
}
