import {OBJECT_KIND, OBJECT_KIND_LABEL} from "./object-kinds.js";
import {readObjectNote} from "./object-notes.js";
import {resolveObject} from "./object-resolver.js";
import {applyNestedEditCommand, revertNestedEditCommand} from "./edit-history.js";
import {restoreMapSnapshot} from "./climate-downstream-rebuild.js";

const PROTECTED_NEUTRAL_KINDS = new Set([OBJECT_KIND.STATE, OBJECT_KIND.PROVINCE, OBJECT_KIND.CULTURE, OBJECT_KIND.RELIGION]);
const ALWAYS_CONFIRM_KINDS = new Set([OBJECT_KIND.STATE, OBJECT_KIND.PROVINCE, OBJECT_KIND.CITY, OBJECT_KIND.CULTURE, OBJECT_KIND.RELIGION, OBJECT_KIND.RIVER, OBJECT_KIND.LAKE]);

export function inspectDeleteImpact(map, kind, ids) {
  const requested = Array.isArray(ids) ? ids : [ids];
  const normalized = [];
  const skipped = [];
  const seen = new Set();
  for (const rawId of requested) {
    const id = Number(rawId);
    if (!Number.isInteger(id) || id < 0) {
      skipped.push({id: rawId, code: "invalid-id", reason: "id 不是有效整数"});
      continue;
    }
    if (seen.has(id)) {
      skipped.push({id, code: "duplicate-id", reason: "id 重复"});
      continue;
    }
    seen.add(id);
    if (PROTECTED_NEUTRAL_KINDS.has(kind) && id === 0) {
      skipped.push({id, code: "protected-neutral", reason: "中立对象不能删除"});
      continue;
    }
    if (!deleteTargetExists(map, kind, id)) {
      skipped.push({id, code: "not-found", reason: "对象不存在"});
      continue;
    }
    normalized.push(id);
  }

  const details = inspectKindDependencies(map, kind, normalized);
  const deleteIds = details.deleteIds || normalized;
  const cascadeIds = deleteIds.filter(id => !normalized.includes(id));
  const dependencyCount = Object.values(details.dependencies || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const requiresConfirm = Boolean(normalized.length && (ALWAYS_CONFIRM_KINDS.has(kind) || deleteIds.length > 1 || cascadeIds.length || dependencyCount));
  const preview = {
    kind,
    kindLabel: OBJECT_KIND_LABEL[kind] || kind,
    requestedCount: requested.length,
    validIds: normalized,
    skipped,
    deleteIds,
    objectCount: deleteIds.length,
    cascadeIds,
    cascadeCount: cascadeIds.length,
    dependencies: details.dependencies || {},
    requiresConfirm,
    impactLevel: requiresConfirm ? "high" : "low",
    valid: normalized.length > 0
  };
  preview.summary = formatDeleteImpactSummary(preview);
  preview.confirmationMessage = formatDeleteConfirmation(preview);
  return preview;
}

export function formatDeleteImpactSummary(preview) {
  const dependencyText = Object.entries(preview.dependencies || {})
    .filter(([, value]) => Number(value) > 0)
    .map(([key, value]) => `${dependencyLabel(key)} ${value}`)
    .join("、");
  const parts = [`删除 ${preview.objectCount} 个${preview.kindLabel}`];
  if (preview.cascadeCount) parts.push(`其中级联 ${preview.cascadeCount} 个`);
  if (dependencyText) parts.push(`关联：${dependencyText}`);
  if (preview.skipped?.length) parts.push(`跳过 ${preview.skipped.length} 项`);
  return `${parts.join("；")}。`;
}

export function formatDeleteConfirmation(preview) {
  const ids = preview.deleteIds.slice(0, 12).map(id => `#${id}`).join("、");
  const suffix = preview.deleteIds.length > 12 ? ` 等 ${preview.deleteIds.length} 项` : "";
  return `确认执行破坏性操作？\n\n${preview.summary}\n对象：${ids}${suffix}\n\n确认后可通过一次撤销恢复。`;
}

export function requestDeleteConfirmation(preview, confirmFn) {
  if (!preview?.valid) return false;
  if (!preview.requiresConfirm) return true;
  return typeof confirmFn === "function" && confirmFn(preview.confirmationMessage) === true;
}

export function createDeleteConfirmationRequiredError(preview) {
  const error = new Error(preview?.confirmationMessage || "该删除操作需要显式确认");
  error.name = "ConfirmationRequiredError";
  error.code = "confirmation_required";
  error.suggestion = "先使用 {inspectOnly: true} 读取影响摘要，再传入 {confirm: true} 执行。";
  error.preview = clonePlain(preview);
  error.details = {
    operation: "delete",
    requiresConfirm: true,
    preview: clonePlain(preview)
  };
  return error;
}

export function createDeleteBatchCommand({kind, ids, createCommand, label = `批量删除${OBJECT_KIND_LABEL[kind] || kind}`} = {}) {
  if (typeof createCommand !== "function") throw new Error("批量删除缺少领域命令工厂");
  const requested = Array.isArray(ids) ? [...ids] : [ids];
  const entries = [];
  const initialSkipped = [];
  const seen = new Set();
  for (const rawId of requested) {
    const id = Number(rawId);
    if (!Number.isInteger(id) || id < 0) {
      initialSkipped.push({id: rawId, code: "invalid-id", reason: "id 不是有效整数"});
      continue;
    }
    if (seen.has(id)) {
      initialSkipped.push({id, code: "duplicate-id", reason: "id 重复"});
      continue;
    }
    seen.add(id);
    entries.push({id, command: createCommand(id)});
  }
  const baseEffects = entries[0]?.command?.effects || {render: "draw", selection: "refresh", runtimeStats: true, pickPanel: true, derived: ["object-panels", "object-index"]};
  let appliedEntries = [];
  let result = emptyBatchResult(requested, initialSkipped);
  const command = {
    label: `${label} ${entries.length} 项`,
    domain: kind,
    effects: {
      ...baseEffects,
      derived: Array.isArray(baseEffects.derived) ? [...baseEffects.derived] : baseEffects.derived,
      affected: entries.map(entry => ({kind, id: entry.id}))
    },
    apply(context) {
      const beforeMap = structuredClone(context.map);
      const optionsReference = context.map?.options;
      appliedEntries = [];
      const skipped = [...initialSkipped];
      const subresults = [];
      let currentEntry = null;
      try {
        for (const entry of entries) {
          currentEntry = entry;
          if (entry.command.isNoop?.(context)) {
            skipped.push({id: entry.id, code: "not-found", reason: "对象不存在或已被同批级联删除"});
            continue;
          }
          applyNestedEditCommand(entry.command, context);
          appliedEntries.push(entry);
          subresults.push({id: entry.id, result: clonePlain(entry.command.getResult?.() ?? null)});
        }
      } catch (error) {
        restoreMapSnapshot(context.map, beforeMap);
        preserveOptionsReference(context.map, optionsReference);
        appliedEntries = [];
        result = {
          ...emptyBatchResult(requested, skipped),
          failed: [{id: currentEntry?.id ?? null, code: "delete-failed", reason: error.message}]
        };
        throw error;
      }
      if (!appliedEntries.length) throw new Error("批量删除没有可执行的对象");
      const affected = collectAppliedAffected(kind, appliedEntries);
      command.effects.affected = affected;
      result = {
        requested: requested.length,
        succeeded: appliedEntries.length,
        deleted: affected.length,
        deletedIds: affected.filter(item => item.kind === kind).map(item => item.id),
        skipped,
        failed: [],
        subresults
      };
    },
    revert(context) {
      for (const entry of [...appliedEntries].reverse()) revertNestedEditCommand(entry.command, context);
    },
    isNoop(context) {
      return !entries.some(entry => !entry.command.isNoop?.(context));
    },
    getResult() {
      return clonePlain(result);
    }
  };
  return command;
}

function inspectKindDependencies(map, kind, ids) {
  if (kind === OBJECT_KIND.STATE) return inspectStateDependencies(map, ids);
  if (kind === OBJECT_KIND.PROVINCE) return inspectProvinceDependencies(map, ids);
  if (kind === OBJECT_KIND.CITY) return inspectCityDependencies(map, ids);
  if (kind === OBJECT_KIND.CULTURE || kind === OBJECT_KIND.RELIGION) return inspectSocialDependencies(map, kind, ids);
  if (kind === OBJECT_KIND.RIVER) return inspectRiverDependencies(map, ids);
  if (kind === OBJECT_KIND.ROUTE) return inspectRouteDependencies(map, ids);
  if (kind === OBJECT_KIND.LAKE) return inspectLakeDependencies(map, ids);
  const notes = ids.filter(id => readObjectNote(map, {kind, id})).length;
  return {deleteIds: ids, dependencies: {notes}};
}

function inspectStateDependencies(map, ids) {
  const states = new Set(ids);
  return {
    deleteIds: ids,
    dependencies: {
      packCells: countValues(map?.pack?.cells?.state, states),
      gridCells: countValues(map?.grid?.cells?.state, states),
      provinces: (map?.politics?.provinces || []).filter(item => item && !item.removed && states.has(Number(item.state))).length,
      cities: (map?.settlements?.cities || []).filter(item => item && !item.removed && states.has(Number(item.state))).length,
      regiments: ids.reduce((sum, id) => sum + (map?.politics?.states?.[id]?.military?.length || 0), 0),
      notes: ids.filter(id => readObjectNote(map, {kind: OBJECT_KIND.STATE, id})).length
    }
  };
}

function inspectProvinceDependencies(map, ids) {
  const provinces = new Set(ids);
  return {
    deleteIds: ids,
    dependencies: {
      packCells: countValues(map?.pack?.cells?.province, provinces),
      gridCells: countValues(map?.grid?.cells?.province, provinces),
      cities: (map?.settlements?.cities || []).filter(item => item && !item.removed && provinces.has(Number(item.province))).length,
      notes: ids.filter(id => readObjectNote(map, {kind: OBJECT_KIND.PROVINCE, id})).length
    }
  };
}

function inspectCityDependencies(map, ids) {
  const cities = new Set(ids);
  return {
    deleteIds: ids,
    dependencies: {
      burgs: (map?.settlements?.cities || []).filter(item => item && !item.removed && cities.has(Number(item.id)) && Number.isInteger(Number(item.burgId))).length,
      routeEndpoints: (map?.settlements?.routes || []).reduce((sum, route) => sum + Number(cities.has(Number(route?.from))) + Number(cities.has(Number(route?.to))), 0),
      notes: ids.filter(id => readObjectNote(map, {kind: OBJECT_KIND.CITY, id})).length
    }
  };
}

function inspectSocialDependencies(map, kind, ids) {
  const targets = new Set(ids);
  const field = kind === OBJECT_KIND.CULTURE ? "culture" : "religion";
  const store = kind === OBJECT_KIND.CULTURE ? map?.society?.cultures : map?.society?.religions;
  const politicalReferences = [
    ...(map?.politics?.states || []),
    ...(map?.politics?.provinces || []),
    ...(map?.settlements?.cities || []),
    ...(map?.pack?.burgs || [])
  ].filter(item => item && !item.removed && targets.has(Number(item[field]))).length;
  return {
    deleteIds: ids,
    dependencies: {
      packCells: countValues(map?.pack?.cells?.[field], targets),
      gridCells: countValues(map?.grid?.cells?.[field], targets),
      references: politicalReferences,
      children: (store || []).filter(item => item && !item.removed && targets.has(Number(item.parent))).length,
      notes: ids.filter(id => readObjectNote(map, {kind, id})).length
    }
  };
}

function inspectRiverDependencies(map, ids) {
  const rivers = map?.rivers?.rivers || [];
  const removed = new Set(ids);
  let changed = true;
  while (changed) {
    changed = false;
    for (const river of rivers) {
      const id = Number(river?.id ?? river?.i);
      if (!Number.isInteger(id) || removed.has(id)) continue;
      if (removed.has(Number(river.parent)) || ids.includes(Number(river.basin))) {
        removed.add(id);
        changed = true;
      }
    }
  }
  const deleteIds = rivers.map(river => Number(river?.id ?? river?.i)).filter(id => removed.has(id));
  const riverCells = new Set(rivers.filter(river => removed.has(Number(river?.id ?? river?.i))).flatMap(river => river.cells || []));
  let lakeReferences = 0;
  for (const feature of map?.pack?.features || []) {
    if (!feature || feature.type !== "lake") continue;
    lakeReferences += (feature.inlets || []).filter(id => removed.has(Number(id))).length;
    if (removed.has(Number(feature.outlet))) lakeReferences += 1;
    if (removed.has(Number(feature.river))) lakeReferences += 1;
  }
  return {
    deleteIds,
    dependencies: {
      tributaries: Math.max(0, deleteIds.length - ids.length),
      riverCells: riverCells.size,
      lakeReferences,
      notes: deleteIds.filter(id => readObjectNote(map, {kind: OBJECT_KIND.RIVER, id})).length
    }
  };
}

function inspectRouteDependencies(map, ids) {
  const routes = (map?.settlements?.routes || []).filter(route => ids.includes(Number(route.id)));
  return {
    deleteIds: routes.map(route => Number(route.id)),
    dependencies: {
      routeSegments: routes.reduce((sum, route) => sum + Math.max(0, (route.points || []).length - 1), 0),
      routeCells: new Set(routes.flatMap(route => route.packCells || [])).size,
      notes: ids.filter(id => readObjectNote(map, {kind: OBJECT_KIND.ROUTE, id})).length
    }
  };
}

function inspectLakeDependencies(map, ids) {
  let packCells = 0;
  let gridCells = 0;
  let shoreline = 0;
  for (const id of ids) {
    const feature = map?.pack?.features?.[id];
    if (!feature) continue;
    shoreline += feature.shoreline?.length || 0;
    packCells += countValue(map?.pack?.cells?.f, id);
    const firstPackCell = findValue(map?.pack?.cells?.f, id);
    const gridCell = firstPackCell >= 0 ? map?.pack?.cells?.g?.[firstPackCell] : null;
    const gridFeatureId = Number.isInteger(gridCell) ? Number(map?.grid?.cells?.f?.[gridCell]) : null;
    if (Number.isInteger(gridFeatureId)) gridCells += countValue(map?.grid?.cells?.f, gridFeatureId);
  }
  return {
    deleteIds: ids,
    dependencies: {
      packCells,
      gridCells,
      shoreline,
      notes: ids.filter(id => readObjectNote(map, {kind: OBJECT_KIND.LAKE, id})).length
    }
  };
}

function deleteTargetExists(map, kind, id) {
  if (kind === OBJECT_KIND.RIVER) return (map?.rivers?.rivers || []).some(river => Number(river?.id ?? river?.i) === id);
  if (kind === OBJECT_KIND.ROUTE) return (map?.settlements?.routes || []).some(route => Number(route?.id) === id);
  if (kind === OBJECT_KIND.LAKE) return map?.pack?.features?.[id]?.type === "lake";
  return Boolean(resolveObject(map, {kind, id}));
}

function collectAppliedAffected(kind, entries) {
  const result = [];
  const seen = new Set();
  for (const entry of entries) {
    const affected = entry.command.effects?.affected?.length ? entry.command.effects.affected : [{kind, id: entry.id}];
    for (const item of affected) {
      const key = `${item.kind}:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({...item});
    }
  }
  return result;
}

function dependencyLabel(key) {
  return {
    tributaries: "支流",
    riverCells: "河道 cells",
    lakeReferences: "湖泊引用",
    routeSegments: "路线段",
    routeCells: "路线 cells",
    packCells: "pack cells",
    gridCells: "grid cells",
    shoreline: "岸线点",
    provinces: "省份",
    cities: "城市",
    regiments: "军团",
    burgs: "城镇记录",
    routeEndpoints: "路线端点",
    references: "对象引用",
    children: "继承子级",
    notes: "备注"
  }[key] || key;
}

function countValues(values, targets) {
  let count = 0;
  for (const value of values || []) if (targets.has(Number(value))) count += 1;
  return count;
}

function countValue(values, target) {
  let count = 0;
  for (const value of values || []) if (Number(value) === target) count += 1;
  return count;
}

function findValue(values, target) {
  for (let index = 0; index < (values?.length || 0); index++) if (Number(values[index]) === target) return index;
  return -1;
}

function emptyBatchResult(requested, skipped) {
  return {requested: requested.length, succeeded: 0, deleted: 0, deletedIds: [], skipped: [...skipped], failed: [], subresults: []};
}

function clonePlain(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function preserveOptionsReference(map, optionsReference) {
  if (!map || !optionsReference || typeof optionsReference !== "object" || map.options === optionsReference) return;
  const replacement = map.options && typeof map.options === "object" ? map.options : {};
  for (const key of Object.keys(optionsReference)) delete optionsReference[key];
  Object.assign(optionsReference, replacement);
  map.options = optionsReference;
}
