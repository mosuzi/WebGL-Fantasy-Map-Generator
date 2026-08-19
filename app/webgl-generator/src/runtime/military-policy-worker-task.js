import {normalizeUnitRatios} from "../generator/military.js";
import {executeRenderPreparationTask} from "../renderer/render-preparation.js";
import {createDomainPatch, createDomainPatchCommand} from "./domain-patch.js";
import {createSetMilitaryRatiosCommand} from "./military-edit-commands.js";
import {collectWorkerTransferables} from "./worker-snapshot.js";

export const MILITARY_POLICY_WORKER_TASK = "military-policy.compute";
export const MILITARY_POLICY_WORKER_PLAN_VERSION = 1;

const STATE_FIELDS = Object.freeze(["alert", "military", "militaryPolicy", "militaryDiagnostics"]);
const MILITARY_ROOTS = Object.freeze(["military", "pack.military"]);

export async function runMilitaryPolicyWorkerTask(payload = {}, context = {}) {
  const map = payload.map;
  if (!map?.pack?.cells || !Array.isArray(map?.pack?.states)) {
    throw taskError("military-policy-worker-map-missing", "军事策略计算缺少完整地图资料");
  }
  const binding = normalizeBinding(payload.binding);
  assertEnvelopeBinding(binding, context.binding);
  if (payload.historyTransition) return runMilitaryPolicyHistoryTransition(map, binding, payload, context);
  const request = normalizeRequest(payload.request);
  await taskCheckpoint(context, "validate");

  const state = map.pack.states[request.stateId] || map.politics?.states?.[request.stateId];
  if (!state?.i || state.removed) throw taskError("military-policy-worker-state-missing", `找不到国家 #${request.stateId}`);
  const sourceFingerprint = fingerprintMilitaryPolicySource(map, request);
  if (payload.sourceFingerprint !== undefined && String(payload.sourceFingerprint) !== sourceFingerprint) {
    throw taskError("military-policy-worker-source-stale", "军事策略来源已过期");
  }
  if (request.confirm !== true) {
    throw taskError("confirmation_required", "兵种比例会按正式保锁语义重建军事部署，需要 confirm: true");
  }

  const command = createSetMilitaryRatiosCommand(request.stateId, request.ratios, {label: request.label || "调整兵种比例"});
  const plan = deepFreeze({
    version: MILITARY_POLICY_WORKER_PLAN_VERSION,
    binding: structuredClone(binding),
    request: publicRequest(request),
    sourceFingerprint,
    lockedRegiments: lockedRegimentIds(map)
  });
  if (command.isNoop?.({map})) return emptyResult(binding, plan, sourceFingerprint);

  const before = captureMilitaryRoots(map);
  let applied = false;
  try {
    failAt(payload.faultAt, "before-apply");
    report(context, "apply", "正在按保锁策略调整兵种比例", 0.35);
    command.apply({map});
    applied = true;
    failAt(payload.faultAt, "after-apply");
    await taskCheckpoint(context, "after-apply");

    const changedPaths = changedMilitaryPaths(map, before);
    const patch = structuredClone(createDomainPatch("military-policy", changedPaths, map));
    failAt(payload.faultAt, "after-patch");
    await taskCheckpoint(context, "patch");
    const preparedRender = payload.render
      ? await executeRenderPreparationTask({...payload.render, map}, context)
      : null;
    report(context, "complete", "军事策略结果已准备", 1);
    return {
      kind: "military-policy",
      binding,
      plan,
      result: {
        executed: true,
        stateId: request.stateId,
        ratios: structuredClone(request.ratios),
        sourceFingerprint,
        lockedRegiments: plan.lockedRegiments.length,
        changedPaths: [...patch.writeSet]
      },
      patch,
      preparedRender,
      refresh: {
        derived: ["point-layers", "line-layers", "object-index", "labels", "object-panels"],
        picking: "objects"
      }
    };
  } catch (error) {
    if (applied) {
      try {
        command.revert({map});
      } catch {
        restoreMilitaryRoots(map, before);
      }
    }
    throw error;
  }
}

async function runMilitaryPolicyHistoryTransition(map, binding, payload, context) {
  const transition = payload.historyTransition;
  const action = transition?.action === "redo" ? "redo" : transition?.action === "undo" ? "undo" : "";
  if (!action) throw taskError("military-policy-worker-history-action-invalid", "军事策略历史动作无效");
  const request = normalizeRequest(transition.request);
  const command = createDomainPatchCommand({
    patch: transition.patch,
    policy: getMilitaryPolicyWorkerPatchPolicy(map, transition.patch, request.stateId),
    label: `军事策略${action === "undo" ? "撤销" : "重做"}`,
    historyDomain: "military-policy",
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
    report(context, "complete", `军事策略${action === "undo" ? "撤销" : "重做"}画面已准备`, 1);
    return {
      kind: "military-policy-history",
      binding,
      history: {action, stateId: request.stateId},
      result: {executed: true, action, label: String(transition.label || "调整兵种比例")},
      preparedRender,
      refresh: militaryPolicyRefresh()
    };
  } catch (error) {
    if (applied) command.revert({map});
    throw error;
  }
}

function militaryPolicyRefresh() {
  return {
    derived: ["point-layers", "line-layers", "object-index", "labels", "object-panels"],
    picking: "objects"
  };
}

export function getMilitaryPolicyWorkerPatchPolicy(map, patch, expectedStateId) {
  if (!patch || !Array.isArray(patch.writeSet)) {
    throw taskError("military-policy-worker-policy-patch-missing", "军事策略结果缺少待验证变更");
  }
  if (!Number.isSafeInteger(Number(expectedStateId)) || Number(expectedStateId) <= 0) {
    throw taskError("military-policy-worker-policy-state-missing", "军事策略主线程策略缺少目标国家");
  }
  for (const path of patch.writeSet) assertMilitaryPolicyPatchPath(map, path, expectedStateId);
  return {
    domain: "military-policy",
    allowedPaths: [...patch.writeSet],
    forbiddenPaths: ["summary", "options", "metadata", "grid", "routes", "rivers", "features", "settlements", "society", "economy"]
  };
}

export function fingerprintMilitaryPolicySource(map, request = {}) {
  return stableFingerprint({
    request: publicRequest(normalizeRequest(request)),
    options: map?.options,
    generation: map?.metadata?.generation,
    pack: map?.pack,
    politicsStates: map?.politics?.states,
    military: map?.military,
    locks: map?.regenerationLocks
  });
}

export function collectMilitaryPolicyWorkerTransferables(result) {
  return collectWorkerTransferables({
    patch: result?.patch || null,
    preparedRender: result?.preparedRender || null
  });
}

function emptyResult(binding, plan, sourceFingerprint) {
  return {
    kind: "military-policy",
    binding,
    plan,
    result: {
      executed: false,
      stateId: plan.request.stateId,
      ratios: structuredClone(plan.request.ratios),
      reason: "no-op",
      sourceFingerprint,
      lockedRegiments: plan.lockedRegiments.length,
      changedPaths: []
    },
    patch: createDomainPatch("military-policy", [], {}),
    preparedRender: null,
    refresh: {derived: [], picking: "none"}
  };
}

function captureMilitaryRoots(map) {
  return structuredClone({
    military: captureOwn(map, "military"),
    packMilitary: captureOwn(map.pack, "military"),
    packStates: captureStateFields(map.pack.states),
    politicsStates: map.politics?.states === map.pack.states ? null : captureStateFields(map.politics?.states || [])
  });
}

function captureStateFields(states) {
  return (states || []).map(state => {
    if (!state) return null;
    return Object.fromEntries(STATE_FIELDS.map(field => [field, captureOwn(state, field)]));
  });
}

function captureOwn(owner, key) {
  return {exists: Boolean(owner && Object.prototype.hasOwnProperty.call(owner, key)), value: owner?.[key]};
}

function changedMilitaryPaths(map, before) {
  const paths = [];
  collectRootChange(paths, "military", before.military, captureOwn(map, "military"));
  collectRootChange(paths, "pack.military", before.packMilitary, captureOwn(map.pack, "military"));
  collectStateChanges(paths, "pack.states", map.pack.states, before.packStates);
  if (before.politicsStates) collectStateChanges(paths, "politics.states", map.politics?.states || [], before.politicsStates);
  return paths;
}

function collectStateChanges(paths, root, states, before) {
  const length = Math.max(states?.length || 0, before?.length || 0);
  for (let index = 0; index < length; index++) {
    const state = states?.[index];
    const previous = before?.[index];
    if (!state && !previous) continue;
    for (const field of STATE_FIELDS) {
      collectRootChange(paths, `${root}.${index}.${field}`, previous?.[field] || {exists: false}, captureOwn(state, field));
    }
  }
}

function collectRootChange(paths, path, before, after) {
  if (before.exists !== after.exists || !sameData(before.value, after.value)) paths.push(path);
}

function restoreMilitaryRoots(map, snapshot) {
  restoreOwn(map, "military", snapshot.military);
  restoreOwn(map.pack, "military", snapshot.packMilitary);
  restoreStateFields(map.pack.states, snapshot.packStates);
  if (snapshot.politicsStates) restoreStateFields(map.politics?.states || [], snapshot.politicsStates);
}

function restoreStateFields(states, snapshots) {
  for (let index = 0; index < (snapshots?.length || 0); index++) {
    const state = states?.[index];
    const snapshot = snapshots[index];
    if (!state || !snapshot) continue;
    for (const field of STATE_FIELDS) restoreOwn(state, field, snapshot[field]);
  }
}

function restoreOwn(owner, key, snapshot) {
  if (!owner) return;
  if (snapshot.exists) owner[key] = structuredClone(snapshot.value);
  else delete owner[key];
}

function lockedRegimentIds(map) {
  return [...new Set((map?.regenerationLocks?.entries || [])
    .filter(entry => entry?.kind === "military")
    .map(entry => String(entry.id || `${entry.stateId}:${entry.regimentId}`))
    .filter(Boolean))].sort((left, right) => left.localeCompare(right, "en", {numeric: true}));
}

function assertMilitaryPolicyPatchPath(map, path, expectedStateId) {
  const value = String(path || "");
  if (MILITARY_ROOTS.includes(value)) return;
  const match = /^(pack|politics)\.states\.(\d+)\.(alert|military|militaryPolicy|militaryDiagnostics)$/.exec(value);
  if (!match) throw taskError("military-policy-worker-policy-path-invalid", `军事策略结果越过允许范围：${value}`);
  const states = match[1] === "pack" ? map?.pack?.states : map?.politics?.states;
  const index = Number(match[2]);
  if (Number.isSafeInteger(Number(expectedStateId)) && index !== Number(expectedStateId)) {
    throw taskError("military-policy-worker-policy-state-invalid", `军事策略结果越过目标国家 #${expectedStateId}：${value}`);
  }
  if (!Array.isArray(states) || index < 0 || index >= states.length || !states[index]) {
    throw taskError("military-policy-worker-policy-index-invalid", `军事策略结果索引越界：${value}`);
  }
}

function normalizeRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw taskError("military-policy-worker-request-invalid", "军事策略请求必须是对象");
  }
  const stateId = Number(value.stateId ?? value.id);
  if (!Number.isSafeInteger(stateId) || stateId <= 0) {
    throw taskError("military-policy-worker-state-invalid", "军事策略国家 ID 必须是正整数");
  }
  return {
    stateId,
    ratios: normalizeUnitRatios(value.ratios || value.unitRatios || {}),
    confirm: value.confirm === true,
    label: value.label ? String(value.label) : ""
  };
}

function publicRequest(request) {
  const result = structuredClone(request);
  delete result.faultAt;
  return result;
}

function normalizeBinding(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw taskError("military-policy-worker-binding-missing", "军事策略请求缺少地图绑定");
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
    throw taskError("military-policy-worker-binding-invalid", "军事策略请求的地图绑定不完整");
  }
  return result;
}

function assertEnvelopeBinding(binding, envelope) {
  if (!envelope) return;
  for (const key of ["mapIdentity", "mapRevision", "generationToken", "lockFingerprint", "operationId", "operationName"]) {
    if (!Object.prototype.hasOwnProperty.call(envelope, key)) continue;
    if (String(envelope[key] ?? "") !== String(binding[key] ?? "")) {
      throw taskError("military-policy-worker-binding-stale", `军事策略请求的 ${key} 已过期`);
    }
  }
}

function sameData(left, right, seen = new WeakMap()) {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
  if (left.constructor !== right.constructor) return false;
  if (ArrayBuffer.isView(left)) {
    if (left.byteLength !== right.byteLength) return false;
    const a = new Uint8Array(left.buffer, left.byteOffset, left.byteLength);
    const b = new Uint8Array(right.buffer, right.byteOffset, right.byteLength);
    return a.every((value, index) => value === b[index]);
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

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

async function taskCheckpoint(context, stage) {
  if (context.signal?.aborted) throw abortError(context.signal.reason || `军事策略计算已在 ${stage} 取消`);
  const result = await context.checkpoint?.({phase: "military-policy-worker", stage});
  if (result === false || context.signal?.aborted) throw abortError(context.signal?.reason || `军事策略计算已在 ${stage} 取消`);
}

function report(context, stage, message, progress) {
  context.report?.("military-policy", {stage, message, progress});
}

function failAt(requested, stage) {
  if (String(requested || "") === stage) throw taskError("military-policy-worker-fault", `军事策略故障注入：${stage}`);
}

function abortError(message) {
  return new DOMException(String(message), "AbortError");
}

function taskError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
