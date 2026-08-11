import {
  inspectRouteCreation,
  inspectRouteEdit,
  planRouteRelocationAsync
} from "./route-edit-commands.js";
import {collectWorkerTransferables} from "./worker-snapshot.js";

export const ROUTE_PATH_WORKER_TASK = "route-path.compute";
export const ROUTE_PATH_WORKER_PLAN_VERSION = 1;

export async function runRoutePathWorkerTask(payload = {}, context = {}) {
  const map = payload.map;
  if (!map?.pack?.cells || !Array.isArray(map?.settlements?.routes)) {
    throw taskError("route-path-worker-map-missing", "路线规划 Worker 缺少完整地图快照");
  }
  const request = normalizeRequest(payload.request);
  const binding = normalizeBinding(payload.binding);
  assertEnvelopeBinding(binding, context.binding);
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
  report(context, "complete", "路线规划计划已冻结", 1);
  return {
    kind: "route-path",
    binding,
    plan,
    result: {
      executed: true,
      operation: request.kind,
      valid: plan.valid,
      sourceFingerprint,
      cells: Number(inspection.cells || inspection.path?.length || inspection.route?.packCells?.length || 0)
    }
  };
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
  if (!new Set(["create", "edit", "relocation"]).has(kind)) {
    throw taskError("route-path-worker-kind-invalid", "路线规划 Worker kind 必须是 create、edit 或 relocation");
  }
  if (kind === "create") {
    const options = structuredClone(value.options || value);
    delete options.kind;
    delete options.faultAt;
    return {kind, options};
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
