import {executeRenderPreparationTask} from "../renderer/render-preparation.js";
import {createDomainPatch, createDomainPatchCommand} from "./domain-patch.js";
import {
  buildPopulationAdjustmentPlan,
  buildPopulationTransferPlan,
  createApplyPopulationAdjustmentCommand,
  createApplyPopulationTransferCommand,
  inspectPopulationAdjustment,
  inspectPopulationTransfer
} from "./population-adjustment-commands.js";
import {collectWorkerTransferables} from "./worker-snapshot.js";

export const POPULATION_WORKER_TASK = "population.compute";
export const POPULATION_WORKER_PLAN_VERSION = 1;

const POPULATION_ROOTS = Object.freeze([
  "pack.cells.pop",
  "grid.cells.pop",
  "pack.burgs",
  "settlements.cities",
  "pack.states",
  "pack.provinces",
  "politics.states",
  "politics.provinces",
  "pack.cultures",
  "pack.religions",
  "society.cultures",
  "society.religions",
  "settlements.populationPoints",
  "settlements.metadata",
  "pack.markets",
  "economy.markets",
  "economy.metadata",
  "metadata.derivedStale",
  "military.metadata.stale",
  "diplomacy.metadata.stale",
  "zones.metadata.stale"
]);
const POPULATION_INDEXED_ROOTS = new Set([
  "pack.cells.pop",
  "grid.cells.pop",
  "pack.burgs",
  "settlements.cities",
  "pack.states",
  "pack.provinces",
  "politics.states",
  "politics.provinces",
  "pack.cultures",
  "pack.religions",
  "society.cultures",
  "society.religions",
  "pack.markets",
  "economy.markets"
]);
const POPULATION_FIXED_PATCH_PATHS = new Set(POPULATION_ROOTS.filter(path => !POPULATION_INDEXED_ROOTS.has(path)));

export async function runPopulationWorkerTask(payload = {}, context = {}) {
  const map = payload.map;
  if (!map?.grid?.cells || !map?.pack?.cells || !map?.settlements) {
    throw taskError("population-worker-map-missing", "人口 Worker 缺少完整地图快照");
  }
  const binding = normalizeBinding(payload.binding);
  assertEnvelopeBinding(binding, context.binding);
  if (payload.historyTransition) {
    return runPopulationHistoryTransition(map, binding, payload, context);
  }
  const request = normalizeRequest(payload.request);
  await taskCheckpoint(context, "validate");

  const sourceFingerprint = fingerprintPopulationSource(map, request);
  if (payload.sourceFingerprint !== undefined && String(payload.sourceFingerprint) !== sourceFingerprint) {
    throw taskError("population-worker-source-stale", "人口 Worker 的来源快照已过期");
  }
  if (request.kind === "transfer" && request.confirm !== true) {
    throw taskError("confirmation_required", "区域人口转移会同时改写两个区域，需要 confirm: true");
  }

  const prepared = prepareCommand(map, request);
  const plan = createPlan(binding, request, sourceFingerprint, prepared.inspection, prepared.executionPlan);
  if (prepared.command.isNoop?.({map})) {
    return emptyResult(binding, plan, prepared.inspection, "no-op");
  }

  const rollback = captureRoots(map, [...POPULATION_ROOTS, "summary"]);
  const before = rollback.filter(entry => entry.path !== "summary");
  let applied = false;
  try {
    failAt(payload.faultAt, "before-apply");
    report(context, "apply", request.kind === "transfer" ? "正在转移区域人口" : "正在调整区域人口", 0.35);
    prepared.command.apply({map});
    applied = true;
    failAt(payload.faultAt, "after-apply");
    await taskCheckpoint(context, "after-apply");
    restoreRoots(map, rollback.filter(entry => entry.path === "summary"));

    const changedPaths = changedRoots(map, before);
    const patch = structuredClone(createDomainPatch("population-mutation", changedPaths, map));
    failAt(payload.faultAt, "after-patch");
    await taskCheckpoint(context, "patch");
    const preparedRender = payload.render
      ? await executeRenderPreparationTask({...payload.render, map}, context)
      : null;
    report(context, "complete", "人口结果已准备", 1);
    return {
      kind: "population",
      binding,
      plan,
      inspection: prepared.inspection,
      result: {
        ...(prepared.command.getResult?.() || {}),
        executed: true,
        operation: request.kind,
        sourceFingerprint,
        changedPaths: [...patch.writeSet]
      },
      patch,
      preparedRender,
      refresh: populationRefresh()
    };
  } catch (error) {
    if (applied) {
      try {
        prepared.command.revert({map});
      } catch {
        // Worker shadow 仍由领域快照做最终回滚。
      }
    }
    restoreRoots(map, rollback);
    throw error;
  }
}

async function runPopulationHistoryTransition(map, binding, payload, context) {
  const transition = payload.historyTransition;
  const action = transition?.action === "redo" ? "redo" : transition?.action === "undo" ? "undo" : "";
  if (!action) throw taskError("population-worker-history-action-invalid", "人口历史动作无效");
  const request = normalizeRequest(transition.request);
  const command = createDomainPatchCommand({
    patch: transition.patch,
    policy: getPopulationWorkerPatchPolicy(map, transition.patch),
    label: `人口${action === "undo" ? "撤销" : "重做"}`,
    historyDomain: "population",
    effects: {},
    result: null
  });
  let applied = false;
  try {
    command.apply({map});
    applied = true;
    await taskCheckpoint(context, `history-${action}`);
    const preparedRender = payload.render
      ? await executeRenderPreparationTask({...payload.render, map}, context)
      : null;
    report(context, "complete", `人口${action === "undo" ? "撤销" : "重做"}画面已准备`, 1);
    return {
      kind: "population-history",
      binding,
      history: {action, kind: request.kind},
      result: {executed: true, action, label: String(transition.label || "人口调整")},
      preparedRender,
      refresh: populationRefresh()
    };
  } catch (error) {
    if (applied) command.revert({map});
    throw error;
  }
}

function populationRefresh() {
  return {
    derived: ["population-carrying", "population-stats", "point-layers", "labels", "object-panels", "economy-demand", "derived-stale", "object-index"],
    picking: "objects"
  };
}

export function getPopulationWorkerPatchPolicy(map, patch) {
  if (!patch || !Array.isArray(patch.writeSet)) {
    throw taskError("population-worker-policy-patch-missing", "人口 Worker 主线程写集策略缺少待验证补丁");
  }
  for (const path of patch.writeSet) assertPopulationPatchPath(map, path);
  return {
    domain: "population-mutation",
    allowedPaths: [...patch.writeSet],
    forbiddenPaths: ["summary", "options", "metadata.regeneration", "routes", "rivers", "features", "pack.routes", "pack.cells.routes"]
  };
}

export function fingerprintPopulationSource(map, request = {}) {
  return stableFingerprint({
    request: publicRequest(normalizeRequest(request)),
    writableRoots: Object.fromEntries(POPULATION_ROOTS.map(path => {
      const captured = readPath(map, path.split("."));
      return [path, {exists: captured.exists, value: captured.value}];
    })),
    readDependencies: {
      gridPoints: map?.grid?.points,
      gridCellHeight: map?.grid?.cells?.h,
      gridCellBurg: map?.grid?.cells?.burg,
      gridCellFeature: map?.grid?.cells?.f,
      features: map?.features,
      settlementRoutes: map?.settlements?.routes,
      packCellIndex: map?.pack?.cells?.i,
      packCellHeight: map?.pack?.cells?.h,
      packCellGrid: map?.pack?.cells?.g,
      packCellState: map?.pack?.cells?.state,
      packCellProvince: map?.pack?.cells?.province,
      packCellCulture: map?.pack?.cells?.culture,
      packCellReligion: map?.pack?.cells?.religion,
      packCellBurg: map?.pack?.cells?.burg,
      packCellMarket: map?.pack?.cells?.market,
      packGoods: map?.pack?.goods,
      economyGoods: map?.economy?.goods,
      effectiveGoods: map?.pack?.goods || map?.economy?.goods
    },
    locks: map?.regenerationLocks
  });
}

export function collectPopulationWorkerTransferables(result) {
  return collectWorkerTransferables({
    patch: result?.patch || null,
    preparedRender: result?.preparedRender || null
  });
}

function prepareCommand(map, request) {
  if (request.kind === "adjustment") {
    const inspection = inspectPopulationAdjustment(map, request.target, {delta: request.delta});
    if (!inspection.valid) throw inspectionError(inspection);
    const executionPlan = buildPopulationAdjustmentPlan(map, request.target, {delta: request.delta});
    return {
      command: createApplyPopulationAdjustmentCommand(executionPlan, {label: request.label || "Worker 区域人口增减"}),
      inspection,
      executionPlan
    };
  }
  const inspection = inspectPopulationTransfer(map, request.source, request.target, {amount: request.amount});
  if (!inspection.valid) throw inspectionError(inspection);
  const executionPlan = buildPopulationTransferPlan(map, request.source, request.target, {amount: request.amount});
  return {
    command: createApplyPopulationTransferCommand(executionPlan, {label: request.label || "Worker 区域人口转移"}),
    inspection,
    executionPlan
  };
}

function emptyResult(binding, plan, inspection, reason) {
  return {
    kind: "population",
    binding,
    plan,
    inspection,
    result: {executed: false, operation: plan.request.kind, reason, sourceFingerprint: plan.sourceFingerprint, changedPaths: []},
    patch: createDomainPatch("population-mutation", [], {}),
    preparedRender: null,
    refresh: {derived: [], picking: "none"}
  };
}

function createPlan(binding, request, sourceFingerprint, inspection, executionPlan) {
  return {
    version: POPULATION_WORKER_PLAN_VERSION,
    binding: structuredClone(binding),
    request: publicRequest(request),
    sourceFingerprint,
    inspection: structuredClone(inspection),
    executionPlan: structuredClone(executionPlan)
  };
}

function normalizeRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw taskError("population-worker-request-invalid", "人口 Worker request 必须是对象");
  }
  const kind = String(value.kind || "").trim().toLowerCase();
  if (kind !== "adjustment" && kind !== "transfer") {
    throw taskError("population-worker-kind-invalid", "人口 Worker kind 必须是 adjustment 或 transfer");
  }
  return {...structuredClone(value), kind, confirm: value.confirm === true};
}

function publicRequest(request) {
  const result = structuredClone(request);
  delete result.faultAt;
  return result;
}

function inspectionError(inspection) {
  return taskError(`population-worker-${inspection?.code || "inspection-invalid"}`, inspection?.reason || "人口 Worker 预检失败");
}

function normalizeBinding(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw taskError("population-worker-binding-missing", "人口 Worker 缺少任务绑定");
  }
  const result = {...structuredClone(value)};
  result.mapRevision = Number(value.mapRevision);
  result.generationToken = Number(value.generationToken);
  result.operationId = Number(value.operationId);
  result.lockFingerprint = String(value.lockFingerprint || "");
  result.operationName = String(value.operationName || "");
  if (!Number.isSafeInteger(result.mapRevision) || result.mapRevision < 0
    || !Number.isSafeInteger(result.generationToken) || result.generationToken < 0
    || !Number.isSafeInteger(result.operationId) || result.operationId < 0
    || value.mapIdentity === undefined || value.mapIdentity === null
    || !result.lockFingerprint || !result.operationName) {
    throw taskError("population-worker-binding-invalid", "人口 Worker 绑定缺少完整 identity / revision / token / operation / lock 指纹");
  }
  return result;
}

function assertEnvelopeBinding(binding, envelope) {
  if (!envelope) return;
  for (const key of ["mapIdentity", "mapRevision", "generationToken", "lockFingerprint", "operationId", "operationName"]) {
    if (!Object.prototype.hasOwnProperty.call(envelope, key)) continue;
    if (String(envelope[key] ?? "") !== String(binding[key] ?? "")) {
      throw taskError("population-worker-binding-stale", `人口 Worker 绑定的 ${key} 已过期`);
    }
  }
}

function captureRoots(map, roots) {
  const entries = roots.map(path => {
    const captured = readPath(map, path.split("."));
    return {path, exists: captured.exists, value: captured.value};
  });
  return structuredClone(entries);
}

function changedRoots(map, before) {
  const changed = [];
  for (const entry of before) {
    const current = readPath(map, entry.path.split("."));
    if (!POPULATION_INDEXED_ROOTS.has(entry.path)) {
      if (current.exists !== entry.exists || !sameData(current.value, entry.value)) changed.push(entry.path);
      continue;
    }
    collectIndexedChanges(entry.path, entry, current, changed);
  }
  return changed;
}

function collectIndexedChanges(root, before, after, output) {
  if (before.exists !== after.exists || !isIndexedCollection(before.value) || !isIndexedCollection(after.value)
    || before.value.constructor !== after.value.constructor || before.value.length !== after.value.length) {
    if (before.exists !== after.exists || !sameData(before.value, after.value)) output.push(root);
    return;
  }
  for (let index = 0; index < after.value.length; index++) {
    const beforeExists = Object.prototype.hasOwnProperty.call(before.value, index);
    const afterExists = Object.prototype.hasOwnProperty.call(after.value, index);
    const left = before.value[index];
    const right = after.value[index];
    if (beforeExists !== afterExists || !isRecord(left) || !isRecord(right)) {
      if (beforeExists !== afterExists || !sameData(left, right)) output.push(`${root}.${index}`);
      continue;
    }
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const key of [...keys].sort()) {
      if (!isSafePathPart(key)) throw taskError("population-worker-patch-key-invalid", `人口对象字段无法安全写入补丁：${key}`);
      const leftExists = Object.prototype.hasOwnProperty.call(left, key);
      const rightExists = Object.prototype.hasOwnProperty.call(right, key);
      if (leftExists !== rightExists || !sameData(left[key], right[key])) output.push(`${root}.${index}.${key}`);
    }
  }
}

function assertPopulationPatchPath(map, path) {
  const value = String(path || "");
  if (POPULATION_FIXED_PATCH_PATHS.has(value) || POPULATION_INDEXED_ROOTS.has(value)) return;
  const cellMatch = /^(pack|grid)\.cells\.pop\.(\d+)$/.exec(value);
  if (cellMatch) {
    assertIndexInRange(map?.[cellMatch[1]]?.cells?.pop, Number(cellMatch[2]), value);
    return;
  }
  const match = /^(pack\.(?:burgs|states|provinces|cultures|religions|markets)|settlements\.cities|politics\.(?:states|provinces)|society\.(?:cultures|religions)|economy\.markets)\.(\d+)(?:\.([^.]+))?$/.exec(value);
  if (!match || match[3] && !isSafePathPart(match[3])) {
    throw taskError("population-worker-policy-path-invalid", `人口 Worker 补丁越过领域写集：${value}`);
  }
  assertIndexInRange(readPath(map, match[1].split(".")).value, Number(match[2]), value);
}

function assertIndexInRange(collection, index, path) {
  if (!isIndexedCollection(collection) || !Number.isSafeInteger(index) || index < 0 || index >= collection.length) {
    throw taskError("population-worker-policy-index-invalid", `人口 Worker 补丁索引越界：${path}`);
  }
}

function isIndexedCollection(value) {
  return Array.isArray(value) || ArrayBuffer.isView(value);
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && !ArrayBuffer.isView(value));
}

function isSafePathPart(value) {
  return typeof value === "string" && value.length > 0 && !value.includes(".") && !["__proto__", "prototype", "constructor"].includes(value);
}

function restoreRoots(map, snapshot) {
  for (const entry of snapshot) writePath(map, entry.path.split("."), entry.exists, entry.value);
}

function readPath(root, path) {
  let owner = root;
  for (let index = 0; index < path.length - 1; index++) {
    if (!owner || !Object.prototype.hasOwnProperty.call(owner, path[index])) return {exists: false, value: undefined};
    owner = owner[path[index]];
  }
  const key = path.at(-1);
  return {exists: Boolean(owner && Object.prototype.hasOwnProperty.call(owner, key)), value: owner?.[key]};
}

function writePath(root, path, exists, value) {
  let owner = root;
  for (let index = 0; index < path.length - 1; index++) {
    const key = path[index];
    if (!owner[key] || typeof owner[key] !== "object") owner[key] = {};
    owner = owner[key];
  }
  const key = path.at(-1);
  if (exists) owner[key] = value;
  else delete owner[key];
}

function sameData(left, right, seen = new WeakMap()) {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
  if (left.constructor !== right.constructor) return false;
  if (ArrayBuffer.isView(left)) {
    if (left.byteLength !== right.byteLength) return false;
    const leftBytes = new Uint8Array(left.buffer, left.byteOffset, left.byteLength);
    const rightBytes = new Uint8Array(right.buffer, right.byteOffset, right.byteLength);
    return leftBytes.every((value, index) => value === rightBytes[index]);
  }
  if (seen.get(left) === right) return true;
  seen.set(left, right);
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && sameData(left[key], right[key], seen));
}

function stableFingerprint(value) {
  let hash = 0x811c9dc5;
  const seen = new WeakMap();
  let nextId = 1;
  const update = item => {
    const text = String(item ?? "");
    for (let index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
  };
  const visit = item => {
    if (item === null || typeof item !== "object") {
      update(`${typeof item}:${String(item)}`);
      return;
    }
    if (seen.has(item)) {
      update(`ref:${seen.get(item)}`);
      return;
    }
    seen.set(item, nextId++);
    update(item.constructor?.name || "Object");
    if (ArrayBuffer.isView(item)) {
      update(item.length);
      for (let index = 0; index < item.length; index++) update(item[index]);
      return;
    }
    for (const key of Object.keys(item).sort()) {
      update(key);
      visit(item[key]);
    }
  };
  visit(value);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

async function taskCheckpoint(context, stage) {
  if (context.signal?.aborted) throw abortError(context.signal.reason || `人口 Worker 已在 ${stage} 取消`);
  const result = await context.checkpoint?.({phase: "population-worker", stage});
  if (result === false || context.signal?.aborted) throw abortError(context.signal?.reason || `人口 Worker 已在 ${stage} 取消`);
}

function report(context, stage, message, progress) {
  context.report?.("population", {stage, message, progress});
}

function failAt(requested, stage) {
  if (String(requested || "") === stage) throw taskError("population-worker-fault", `人口 Worker 故障注入：${stage}`);
}

function abortError(message) {
  return new DOMException(String(message), "AbortError");
}

function taskError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
