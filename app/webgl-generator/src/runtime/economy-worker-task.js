import {createDomainPatch} from "./domain-patch.js";
import {
  createApplyMarketAssignmentCommand,
  createRebuildEconomyCommand,
  inspectMarketAssignment
} from "./economy-edit-commands.js";
import {collectWorkerTransferables} from "./worker-snapshot.js";

export const ECONOMY_WORKER_TASK = "economy.compute";
export const ECONOMY_WORKER_PLAN_VERSION = 1;

const ECONOMY_ROOTS = Object.freeze([
  "pack.cells.market",
  "pack.goods",
  "pack.markets",
  "pack.deals",
  "pack.burgs",
  "pack.states",
  "pack.provinces",
  "politics.states",
  "politics.provinces",
  "settlements.cities",
  "economy.goods",
  "economy.markets",
  "economy.deals",
  "economy.metadata"
]);
const ECONOMY_INDEXED_ROOTS = new Set([
  "pack.cells.market",
  "pack.goods",
  "pack.markets",
  "pack.burgs",
  "pack.states",
  "pack.provinces",
  "politics.states",
  "politics.provinces",
  "settlements.cities",
  "economy.goods",
  "economy.markets"
]);
const ECONOMY_FIXED_PATCH_PATHS = new Set(["pack.deals", "economy.deals", "economy.metadata"]);

export async function runEconomyWorkerTask(payload = {}, context = {}) {
  const map = payload.map;
  if (!map?.pack?.cells || !Array.isArray(map?.pack?.markets)) {
    throw taskError("economy-worker-map-missing", "经济 Worker 缺少完整地图快照");
  }
  const request = normalizeRequest(payload.request);
  const binding = normalizeBinding(payload.binding);
  assertEnvelopeBinding(binding, context.binding);
  await taskCheckpoint(context, "validate");

  const sourceFingerprint = fingerprintEconomySource(map, request);
  if (payload.sourceFingerprint !== undefined && String(payload.sourceFingerprint) !== sourceFingerprint) {
    throw taskError("economy-worker-source-stale", "经济 Worker 的来源快照已过期");
  }
  if (request.confirm !== true) {
    throw taskError("confirmation_required", request.kind === "market-assignment"
      ? "市场归属会重算经济链，需要 confirm: true"
      : "经济链重算会改写生产、交易、价格压力和财政，需要 confirm: true");
  }

  const prepared = prepareCommand(map, request);
  const plan = createPlan(binding, request, sourceFingerprint, prepared.inspection);
  if (prepared.command.isNoop?.({map})) {
    return emptyResult(binding, plan, prepared.inspection, prepared.reason || "no-op");
  }

  const before = captureRoots(map, ECONOMY_ROOTS);
  let applied = false;
  try {
    failAt(payload.faultAt, "before-apply");
    report(context, "apply", request.kind === "market-assignment" ? "正在应用市场归属并重算经济链" : "正在重算经济链", 0.35);
    prepared.command.apply({map});
    applied = true;
    failAt(payload.faultAt, "after-apply");
    await taskCheckpoint(context, "after-apply");

    const changedPaths = changedRoots(map, before);
    const patch = structuredClone(createDomainPatch("economy-mutation", changedPaths, map));
    failAt(payload.faultAt, "after-patch");
    await taskCheckpoint(context, "patch");
    report(context, "complete", "经济 Worker 补丁已准备", 1);
    return {
      kind: "economy",
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
      refresh: {
        derived: ["market-ownership", "burg-markets", "market-production", "market-trades", "market-prices", "state-finance", "economy-summary", "point-layers", "labels", "object-panels", "object-index"],
        picking: "objects"
      }
    };
  } catch (error) {
    if (applied) {
      try {
        prepared.command.revert({map});
      } catch {
        // Worker shadow 仍由领域快照做最终回滚。
      }
    }
    restoreRoots(map, before);
    throw error;
  }
}

export function getEconomyWorkerPatchPolicy(map, patch) {
  if (!patch || !Array.isArray(patch.writeSet)) {
    throw taskError("economy-worker-policy-patch-missing", "经济 Worker 主线程写集策略缺少待验证补丁");
  }
  for (const path of patch.writeSet) assertEconomyPatchPath(map, path);
  return {
    domain: "economy-mutation",
    allowedPaths: [...patch.writeSet],
    forbiddenPaths: ["summary", "options", "metadata.regeneration", "grid", "routes", "rivers", "features", "society"]
  };
}

export function fingerprintEconomySource(map, request = {}) {
  return stableFingerprint({
    request: publicRequest(normalizeRequest(request)),
    options: map?.options,
    generation: map?.metadata?.generation,
    pack: map?.pack,
    economy: map?.economy,
    locks: map?.regenerationLocks
  });
}

export function collectEconomyWorkerTransferables(result) {
  return collectWorkerTransferables(result?.patch || result);
}

function prepareCommand(map, request) {
  if (request.kind === "rebuild") {
    return {command: createRebuildEconomyCommand({label: request.label || "Worker 重算经济链"}), inspection: null};
  }
  const changes = normalizeAssignmentChanges(map, request.changes);
  const inspection = inspectMarketAssignment(map, changes);
  if (!inspection.valid && changes.length) {
    throw taskError("economy-worker-assignment-invalid", `市场归属预检失败：无效市场 ${inspection.invalidMarketCells}，水域 ${inspection.waterCells}`);
  }
  return {
    command: createApplyMarketAssignmentCommand(changes, {label: request.label || "Worker 应用市场归属"}),
    inspection,
    reason: changes.length ? null : "no-op"
  };
}

function normalizeAssignmentChanges(map, changes) {
  if (!Array.isArray(changes)) throw taskError("economy-worker-changes-invalid", "市场归属 changes 必须是数组");
  const byCell = new Map();
  for (const item of changes) {
    const packCell = Number(item?.packCell ?? item?.cell);
    const after = Number(item?.after ?? item?.marketId);
    if (!Number.isSafeInteger(packCell) || packCell < 0 || packCell >= (map.pack.cells.i?.length || 0)) {
      throw taskError("economy-worker-cell-invalid", `市场归属 pack cell 越界：${item?.packCell ?? item?.cell}`);
    }
    if (!Number.isSafeInteger(after) || after <= 0 || !map.pack.markets?.[after]) {
      throw taskError("economy-worker-market-invalid", `市场归属目标市场无效：${item?.after ?? item?.marketId}`);
    }
    const before = Number(map.pack.cells.market?.[packCell] || 0);
    byCell.set(packCell, {packCell, before, after});
  }
  return [...byCell.values()].filter(item => item.before !== item.after).sort((left, right) => left.packCell - right.packCell);
}

function emptyResult(binding, plan, inspection, reason) {
  return {
    kind: "economy",
    binding,
    plan,
    inspection,
    result: {executed: false, operation: plan.request.kind, reason, sourceFingerprint: plan.sourceFingerprint, changedPaths: []},
    patch: createDomainPatch("economy-mutation", [], {}),
    refresh: {derived: [], picking: "none"}
  };
}

function createPlan(binding, request, sourceFingerprint, inspection) {
  return {
    version: ECONOMY_WORKER_PLAN_VERSION,
    binding: structuredClone(binding),
    request: publicRequest(request),
    sourceFingerprint,
    inspection: inspection ? structuredClone(inspection) : null
  };
}

function normalizeRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw taskError("economy-worker-request-invalid", "经济 Worker request 必须是对象");
  }
  const kind = String(value.kind || "").trim().toLowerCase();
  if (kind !== "rebuild" && kind !== "market-assignment") {
    throw taskError("economy-worker-kind-invalid", "经济 Worker kind 必须是 rebuild 或 market-assignment");
  }
  return {...structuredClone(value), kind, confirm: value.confirm === true};
}

function publicRequest(request) {
  const result = structuredClone(request);
  delete result.faultAt;
  return result;
}

function normalizeBinding(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw taskError("economy-worker-binding-missing", "经济 Worker 缺少任务绑定");
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
    throw taskError("economy-worker-binding-invalid", "经济 Worker 绑定缺少完整 identity / revision / token / operation / lock 指纹");
  }
  return result;
}

function assertEnvelopeBinding(binding, envelope) {
  if (!envelope) return;
  for (const key of ["mapIdentity", "mapRevision", "generationToken", "lockFingerprint", "operationId", "operationName"]) {
    if (!Object.prototype.hasOwnProperty.call(envelope, key)) continue;
    if (String(envelope[key] ?? "") !== String(binding[key] ?? "")) {
      throw taskError("economy-worker-binding-stale", `经济 Worker 绑定的 ${key} 已过期`);
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
    if (!ECONOMY_INDEXED_ROOTS.has(entry.path)) {
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
      if (!isSafePathPart(key)) throw taskError("economy-worker-patch-key-invalid", `经济对象字段无法安全写入补丁：${key}`);
      const leftExists = Object.prototype.hasOwnProperty.call(left, key);
      const rightExists = Object.prototype.hasOwnProperty.call(right, key);
      if (leftExists !== rightExists || !sameData(left[key], right[key])) output.push(`${root}.${index}.${key}`);
    }
  }
}

function assertEconomyPatchPath(map, path) {
  const value = String(path || "");
  if (ECONOMY_FIXED_PATCH_PATHS.has(value) || ECONOMY_INDEXED_ROOTS.has(value)) return;
  const cellMatch = /^pack\.cells\.market\.(\d+)$/.exec(value);
  if (cellMatch) {
    assertIndexInRange(map?.pack?.cells?.market, Number(cellMatch[1]), value);
    return;
  }
  const match = /^(pack\.(?:goods|markets|burgs|states|provinces)|politics\.(?:states|provinces)|settlements\.cities|economy\.(?:goods|markets))\.(\d+)(?:\.([^.]+))?$/.exec(value);
  if (!match || match[3] && !isSafePathPart(match[3])) {
    throw taskError("economy-worker-policy-path-invalid", `经济 Worker 补丁越过领域写集：${value}`);
  }
  assertIndexInRange(readPath(map, match[1].split(".")).value, Number(match[2]), value);
}

function assertIndexInRange(collection, index, path) {
  if (!isIndexedCollection(collection) || !Number.isSafeInteger(index) || index < 0 || index >= collection.length) {
    throw taskError("economy-worker-policy-index-invalid", `经济 Worker 补丁索引越界：${path}`);
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
  if (context.signal?.aborted) throw abortError(context.signal.reason || `经济 Worker 已在 ${stage} 取消`);
  const result = await context.checkpoint?.({phase: "economy-worker", stage});
  if (result === false || context.signal?.aborted) throw abortError(context.signal?.reason || `经济 Worker 已在 ${stage} 取消`);
}

function report(context, stage, message, progress) {
  context.report?.("economy", {stage, message, progress});
}

function failAt(requested, stage) {
  if (String(requested || "") === stage) throw taskError("economy-worker-fault", `经济 Worker 故障注入：${stage}`);
}

function abortError(message) {
  return new DOMException(String(message), "AbortError");
}

function taskError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
