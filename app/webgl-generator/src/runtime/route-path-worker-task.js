import {
  createAddRouteCommand,
  createEditRouteCommand,
  inspectRouteCreation,
  inspectRouteEdit,
  planRouteRelocationAsync
} from "./route-edit-commands.js";
import {executeRenderPreparationTask} from "../renderer/render-preparation.js";
import {createDomainPatch, createDomainPatchCommand} from "./domain-patch.js";
import {collectWorkerTransferables} from "./worker-snapshot.js";
import {
  createMoveCityCommand,
  exportCityMovePreflight,
  inspectCityMoveAsync
} from "./city-relocation.js";

export const ROUTE_PATH_WORKER_TASK = "route-path.compute";
export const ROUTE_PATH_WORKER_PLAN_VERSION = 1;

const ROUTE_PATH_HISTORY_ROOTS = Object.freeze([
  "settlements.routes",
  "settlements.metadata",
  "pack.routes",
  "pack.cells.routes",
  "metadata.derivedStale"
]);
const CITY_MOVE_HISTORY_ROOTS = Object.freeze([
  "settlements.cities",
  "settlements.routes",
  "settlements.metadata",
  "pack.burgs",
  "pack.routes",
  "pack.states",
  "pack.provinces",
  "pack.markets",
  "pack.cells.burg",
  "pack.cells.routes",
  "pack.cells.market",
  "grid.cells.burg",
  "politics.states",
  "politics.provinces",
  "economy.markets",
  "economy.metadata",
  "diplomacy.metadata",
  "military.metadata",
  "zones.metadata",
  "metadata.derivedStale",
  "notes"
]);

export async function runRoutePathWorkerTask(payload = {}, context = {}) {
  const map = payload.map;
  if (!map?.pack?.cells || !Array.isArray(map?.settlements?.routes)) {
    throw taskError("route-path-worker-map-missing", "路线规划 Worker 缺少完整地图快照");
  }
  const binding = normalizeBinding(payload.binding);
  assertEnvelopeBinding(binding, context.binding);
  if (payload.historyTransition) return runRoutePathHistoryTransition(map, binding, payload, context);
  const request = normalizeRequest(payload.request);
  await taskCheckpoint(context, "validate");

  const sourceFingerprint = fingerprintRoutePathSource(map, request);
  if (payload.sourceFingerprint !== undefined && String(payload.sourceFingerprint) !== sourceFingerprint) {
    throw taskError("route-path-worker-source-stale", "路线规划 Worker 的来源快照已过期");
  }
  failAt(payload.faultAt, "before-compute");
  report(context, "compute", "正在规划路线", 0.35);
  const inspection = await computeInspection(map, request, context);
  failAt(payload.faultAt, "after-compute");
  await taskCheckpoint(context, "after-compute");

  const plan = deepFreeze({
    version: ROUTE_PATH_WORKER_PLAN_VERSION,
    binding: structuredClone(binding),
    request: publicRequest(request),
    sourceFingerprint,
    valid: request.kind === "relocation" ? inspection.action !== "failed" : inspection.valid === true,
    inspection: structuredClone(inspection)
  });
  failAt(payload.faultAt, "after-plan");
  await taskCheckpoint(context, "plan");
  if (request.kind === "relocation" || payload.planOnly === true) {
    report(context, "complete", "路线规划计划已冻结", 1);
    return planOnlyResult(binding, request, sourceFingerprint, plan, inspection);
  }

  const cityPreflight = request.kind === "city-relocation" ? exportCityMovePreflight(inspection) : null;
  const command = request.kind === "create"
    ? createAddRouteCommand(request.options, {preflight: inspection})
    : request.kind === "edit"
      ? createEditRouteCommand(request.routeId, request.patch, {label: "Worker 编辑路线", preflight: inspection})
      : createMoveCityCommand(request.cityId, request.target, {label: "Worker 移动城市", preflight: inspection});
  if (command.isNoop?.({map})) {
    return {
      kind: "route-path",
      binding,
      plan,
      inspection: structuredClone(inspection),
      result: {executed: false, operation: request.kind, valid: true, sourceFingerprint, cells: Number(inspection.cells || inspection.path?.length || 0)},
      preparedRender: null,
      history: null,
      refresh: {derived: [], picking: "none"}
    };
  }

  const historyRoots = request.kind === "city-relocation" ? CITY_MOVE_HISTORY_ROOTS : ROUTE_PATH_HISTORY_ROOTS;
  const before = captureRootSnapshot(map, historyRoots);
  let applied = false;
  try {
    failAt(payload.faultAt, "before-apply");
    command.apply({map});
    applied = true;
    failAt(payload.faultAt, "after-apply");
    await taskCheckpoint(context, "after-apply");
    const changedPaths = changedRoots(map, before, historyRoots);
    const history = {
      beforePatch: structuredClone(createDomainPatch("route-path-history", changedPaths, before)),
      afterPatch: structuredClone(createDomainPatch("route-path-history", changedPaths, map))
    };
    const preparedRender = payload.render
      ? await executeRenderPreparationTask({...payload.render, map}, context)
      : null;
    report(context, "complete", "路线结果已准备", 1);
    return {
      kind: "route-path",
      binding,
      plan,
      inspection: structuredClone(inspection),
      cityPreflight,
      result: {
        ...(command.getResult?.() || {}),
        executed: true,
        operation: request.kind,
        valid: true,
        sourceFingerprint,
        cells: Number(inspection.cells || inspection.path?.length || 0)
      },
      preparedRender,
      history,
      refresh: routePathRefresh()
    };
  } catch (error) {
    if (applied) {
      try {
        command.revert({map});
      } catch {
        restoreRootSnapshot(map, before, historyRoots);
      }
    }
    throw error;
  }
}

async function runRoutePathHistoryTransition(map, binding, payload, context) {
  const transition = payload.historyTransition;
  const action = transition?.action === "redo" ? "redo" : transition?.action === "undo" ? "undo" : "";
  if (!action) throw taskError("route-path-worker-history-action-invalid", "路线历史动作无效");
  const request = normalizeRequest(transition.request);
  const patch = transition.patch;
  const command = createDomainPatchCommand({
    patch,
    policy: routePathHistoryPatchPolicy(patch, request.kind),
    label: `路线${action === "undo" ? "撤销" : "重做"}`,
    historyDomain: "route-path-history",
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
    report(context, "complete", `路线${action === "undo" ? "撤销" : "重做"}画面已准备`, 1);
    return {
      kind: "route-path-history",
      binding,
      history: {action, kind: request.kind},
      result: {executed: true, action, operation: request.kind, label: String(transition.label || "路线")},
      preparedRender,
      refresh: routePathRefresh()
    };
  } catch (error) {
    if (applied) command.revert({map});
    throw error;
  }
}

function planOnlyResult(binding, request, sourceFingerprint, plan, inspection) {
  return {
    kind: "route-path",
    binding,
    plan,
    inspection: structuredClone(inspection),
    cityPreflight: request.kind === "city-relocation" && inspection?.phase === "full"
      ? exportCityMovePreflight(inspection)
      : null,
    result: {
      executed: true,
      operation: request.kind,
      valid: plan.valid,
      sourceFingerprint,
      cells: Number(inspection.cells || inspection.path?.length || inspection.route?.packCells?.length || inspection.routes?.items?.reduce((sum, item) => sum + Number(item.cells || 0), 0) || 0)
    }
  };
}

function routePathRefresh() {
  return {
    derived: ["route-mesh", "object-panels", "object-index", "economy-stale"],
    picking: "objects"
  };
}

function routePathHistoryPatchPolicy(patch, kind) {
  if (!patch || patch.domain !== "route-path-history" || !Array.isArray(patch.writeSet)) {
    throw taskError("route-path-worker-history-patch-invalid", "路线历史补丁无效");
  }
  const allowed = new Set(kind === "city-relocation" ? CITY_MOVE_HISTORY_ROOTS : ROUTE_PATH_HISTORY_ROOTS);
  for (const path of patch.writeSet) {
    if (!allowed.has(String(path))) {
      throw taskError("route-path-worker-history-path-invalid", `路线历史补丁越过写集：${path}`);
    }
  }
  return {
    domain: "route-path-history",
    allowedPaths: [...patch.writeSet],
    forbiddenPaths: kind === "city-relocation"
      ? ["features", "rivers", "society"]
      : ["grid", "features", "rivers", "society", "politics", "economy", "diplomacy", "military", "zones"]
  };
}

function captureRootSnapshot(map, roots) {
  const snapshot = {};
  for (const path of roots) {
    const parts = path.split(".");
    const captured = readPath(map, parts);
    writeSnapshotPath(snapshot, parts, captured.exists, captured.value);
  }
  return structuredClone(snapshot);
}

function changedRoots(map, before, roots) {
  return roots.filter(path => {
    const parts = path.split(".");
    const left = readPath(before, parts);
    const right = readPath(map, parts);
    return left.exists !== right.exists || !sameData(left.value, right.value);
  });
}

function restoreRootSnapshot(map, snapshot, roots) {
  for (const path of roots) {
    const parts = path.split(".");
    const captured = readPath(snapshot, parts);
    writeSnapshotPath(map, parts, captured.exists, captured.value);
  }
}

function readPath(root, parts) {
  let owner = root;
  for (let index = 0; index < parts.length - 1; index++) {
    if (!owner || !Object.prototype.hasOwnProperty.call(owner, parts[index])) return {exists: false, value: undefined};
    owner = owner[parts[index]];
  }
  const key = parts.at(-1);
  return {exists: Boolean(owner && Object.prototype.hasOwnProperty.call(owner, key)), value: owner?.[key]};
}

function writeSnapshotPath(root, parts, exists, value) {
  let owner = root;
  for (let index = 0; index < parts.length - 1; index++) {
    const key = parts[index];
    if (!owner[key] || typeof owner[key] !== "object") owner[key] = {};
    owner = owner[key];
  }
  const key = parts.at(-1);
  if (exists) owner[key] = structuredClone(value);
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

export function assertRoutePathWorkerPlan(plan, map, binding) {
  if (!plan || plan.version !== ROUTE_PATH_WORKER_PLAN_VERSION || !plan.request || !plan.binding) {
    throw taskError("route-path-worker-plan-invalid", "路线规划 Worker plan 无效");
  }
  const expectedBinding = normalizeBinding(binding);
  assertEnvelopeBinding(normalizeBinding(plan.binding), expectedBinding);
  const currentFingerprint = fingerprintRoutePathSource(map, plan.request);
  if (currentFingerprint !== String(plan.sourceFingerprint || "")) {
    throw taskError("route-path-worker-plan-stale", "路线规划 Worker plan 已过期");
  }
  return true;
}

export function fingerprintRoutePathSource(map, request = {}) {
  const normalized = normalizeRequest(request);
  return stableFingerprint({
    request: publicRequest(normalized),
    packCells: map?.pack?.cells,
    routes: map?.settlements?.routes,
    cities: map?.settlements?.cities,
    burgs: map?.pack?.burgs,
    locks: map?.regenerationLocks
  });
}

export function collectRoutePathWorkerTransferables(result) {
  return collectWorkerTransferables(result);
}

async function computeInspection(map, request, context) {
  if (request.kind === "create") return inspectRouteCreation(map, request.options);
  if (request.kind === "edit") return inspectRouteEdit(map, request.routeId, request.patch);
  if (request.kind === "city-relocation") {
    return inspectCityMoveAsync(map, request.cityId, request.target, {
      signal: context.signal,
      shouldContinue: () => context.shouldContinue?.() !== false,
      yieldToBrowser: context.yieldToBrowser,
      sliceMs: context.sliceMs
    });
  }
  const route = map.settlements.routes.find(item => Number(item?.id) === request.routeId);
  if (!route) throw taskError("route-path-worker-route-missing", `找不到路线 #${request.routeId}`);
  return planRouteRelocationAsync(map, route, request.cityId, request.target, {
    signal: context.signal,
    shouldContinue: () => context.shouldContinue?.() !== false,
    yieldToBrowser: context.yieldToBrowser,
    sliceMs: context.sliceMs
  });
}

function normalizeRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw taskError("route-path-worker-request-invalid", "路线规划 Worker request 必须是对象");
  }
  const kind = String(value.kind || "").trim().toLowerCase();
  if (!new Set(["create", "edit", "relocation", "city-relocation"]).has(kind)) {
    throw taskError("route-path-worker-kind-invalid", "路线规划 Worker kind 必须是 create、edit、relocation 或 city-relocation");
  }
  if (kind === "create") {
    const options = structuredClone(value.options || value);
    delete options.kind;
    delete options.faultAt;
    return {kind, options};
  }
  if (kind === "city-relocation") {
    const cityId = Number(value.cityId ?? value.id);
    if (!Number.isSafeInteger(cityId) || cityId < 0 || !value.target || typeof value.target !== "object" || Array.isArray(value.target)) {
      throw taskError("route-path-worker-city-relocation-invalid", "城市移动需要有效 cityId 和 target");
    }
    return {kind, cityId, target: structuredClone(value.target)};
  }
  const routeId = Number(value.routeId ?? value.id);
  if (!Number.isSafeInteger(routeId) || routeId < 0) {
    throw taskError("route-path-worker-route-invalid", "路线规划 Worker routeId 必须是非负整数");
  }
  if (kind === "edit") return {kind, routeId, patch: structuredClone(value.patch || {})};
  const cityId = Number(value.cityId);
  if (!Number.isSafeInteger(cityId) || cityId < 0 || !value.target || typeof value.target !== "object" || Array.isArray(value.target)) {
    throw taskError("route-path-worker-relocation-invalid", "关联路线重寻需要有效 cityId 和 target");
  }
  return {kind, routeId, cityId, target: structuredClone(value.target)};
}

function publicRequest(request) {
  const result = structuredClone(request);
  delete result.faultAt;
  return result;
}

function normalizeBinding(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw taskError("route-path-worker-binding-missing", "路线规划 Worker 缺少任务绑定");
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
    throw taskError("route-path-worker-binding-invalid", "路线规划 Worker 绑定缺少完整 identity / revision / token / operation / lock 指纹");
  }
  return result;
}

function assertEnvelopeBinding(binding, envelope) {
  if (!envelope) return;
  for (const key of ["mapIdentity", "mapRevision", "generationToken", "lockFingerprint", "operationId", "operationName"]) {
    if (!Object.prototype.hasOwnProperty.call(envelope, key)) continue;
    if (String(envelope[key] ?? "") !== String(binding[key] ?? "")) {
      throw taskError("route-path-worker-binding-stale", `路线规划 Worker 绑定的 ${key} 已过期`);
    }
  }
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

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

async function taskCheckpoint(context, stage) {
  if (context.signal?.aborted) throw abortError(context.signal.reason || `路线规划 Worker 已在 ${stage} 取消`);
  const result = await context.checkpoint?.({phase: "route-path-worker", stage});
  if (result === false || context.signal?.aborted) throw abortError(context.signal?.reason || `路线规划 Worker 已在 ${stage} 取消`);
}

function report(context, stage, message, progress) {
  context.report?.("route-path", {stage, message, progress});
}

function failAt(requested, stage) {
  if (String(requested || "") === stage) throw taskError("route-path-worker-fault", `路线规划 Worker 故障注入：${stage}`);
}

function abortError(message) {
  return new DOMException(String(message), "AbortError");
}

function taskError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
