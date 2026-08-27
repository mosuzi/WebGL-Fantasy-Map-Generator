import {createDomainPatch, createDomainPatchCommand} from "./domain-patch.js";
import {executeRenderPreparationTask} from "../renderer/render-preparation.js";
import {
  createApplyCultureExpansionCommand,
  createApplyReligionExpansionCommand,
  inspectSocialExpansion
} from "./social-expansion-edit-commands.js";
import {collectWorkerTransferables} from "./worker-snapshot.js";
import {captureRegenerationConstraintBundle} from "./regeneration-constraint-bundle.js";
import {hideRegenerationLocks} from "./regeneration-lock-protection.js";

export const SOCIAL_EXPANSION_WORKER_TASK = "social-expansion.compute";
export const SOCIAL_EXPANSION_WORKER_PLAN_VERSION = 1;

const STORE_FIELDS = Object.freeze({
  culture: Object.freeze(["center", "gridCenter", "type", "expansionism", "cells", "area", "rural", "urban", "parent", "children", "depth", "lineage"]),
  religion: Object.freeze(["center", "gridCenter", "expansion", "expansionism", "cells", "area", "rural", "urban", "parent", "children", "depth", "lineage"])
});
const DOWNSTREAM_STALE = Object.freeze(["markers", "zones", "military", "economy", "diplomacy"]);

export async function runSocialExpansionWorkerTask(payload = {}, context = {}) {
  const map = payload.map;
  if (!map?.grid?.cells || !map?.pack?.cells || !map?.society) {
    throw taskError("social-expansion-worker-map-missing", "文化 / 宗教扩张 Worker 缺少完整地图快照");
  }
  const binding = normalizeBinding(payload.binding);
  assertEnvelopeBinding(binding, context.binding);
  if (payload.historyTransition) {
    return runSocialExpansionHistoryTransition(map, binding, payload, context);
  }
  const request = normalizeTaskRequest(payload.request);
  await taskCheckpoint(context, "validate");

  const sourceFingerprint = fingerprintSocialExpansionSource(map, request);
  if (payload.sourceFingerprint !== undefined && String(payload.sourceFingerprint) !== sourceFingerprint) {
    throw taskError("social-expansion-worker-source-stale", "文化 / 宗教扩张 Worker 的来源快照已过期");
  }
  const plan = createPlan(binding, request, sourceFingerprint);
  const preserved = captureRegenerationConstraintBundle(map, {closure: ["world"]});
  if (preserved.ids(request.kind).includes(String(request.id))) {
    return emptyResult(binding, plan, lockedTargetInspection(request), "regeneration-locked-noop");
  }
  const restoreLockStore = hideRegenerationLocks(map);
  try {
    preserved.hide(map);
    const inspection = inspectSocialExpansion(map, request);
    if (!inspection.valid) return emptyResult(binding, plan, inspection, "inspection-rejected");
    if (!inspection.changed) {
      const reason = inspection.code === "regeneration_locked_noop" ? "regeneration-locked-noop" : "no-op";
      return emptyResult(binding, plan, inspection, reason);
    }
    if (inspection.requiresConfirm && request.confirm !== true) {
      throw taskError("confirmation_required", `${request.kind === "culture" ? "文化" : "宗教"}重新扩张需要 confirm: true`);
    }

    const policy = getSocialExpansionPatchPolicy(map, request);
    const before = capturePathValues(map, policy.allowedPaths);
    const coverageBefore = captureCoverage(map, request);
    await taskCheckpoint(context, "inspect");
    report(context, "apply", `正在${request.mode === "reexpand" ? "重新扩张" : "保存"}${request.kind === "culture" ? "文化" : "宗教"}`, 0.35);

    const command = request.kind === "culture"
      ? createApplyCultureExpansionCommand(request.id, request)
      : createApplyReligionExpansionCommand(request.id, request);
    let applied = false;
    try {
      command.apply({map});
      applied = true;
      failAt(payload.faultAt, "after-apply");
      await taskCheckpoint(context, "patch");
      preserved.restore(map);
      preserved.assertDomain(map, "world", "after");

      const changedPaths = changedPathValues(map, before);
      const patch = createDomainPatch("social-expansion", changedPaths, map);
      const affected = buildAffected(map, request, coverageBefore, patch);
      const result = command.getResult?.() || null;
      const preparedRender = payload.render
        ? await executeRenderPreparationTask({...payload.render, map}, context)
        : null;
      report(context, "complete", "文化 / 宗教扩张结果已准备", 1);
      return {
        kind: "social-expansion",
        binding,
        plan,
        inspection: publicInspection(inspection),
        result: {
          ...(result || {}),
          executed: true,
          sourceFingerprint,
          affected
        },
        patch,
        preparedRender,
        refresh: socialExpansionRefresh(request)
      };
    } catch (error) {
      if (applied) command.revert({map});
      throw error;
    }
  } finally {
    preserved.restore(map);
    restoreLockStore();
  }
}

async function runSocialExpansionHistoryTransition(map, binding, payload, context) {
  const transition = payload.historyTransition;
  const action = transition?.action === "redo" ? "redo" : transition?.action === "undo" ? "undo" : "";
  if (!action) throw taskError("social-expansion-worker-history-action-invalid", "文化 / 宗教扩张历史动作无效");
  const request = normalizeTaskRequest(transition.request);
  const command = createDomainPatchCommand({
    patch: transition.patch,
    policy: getSocialExpansionPatchPolicy(map, request),
    label: `${request.kind === "culture" ? "文化" : "宗教"}${action === "undo" ? "撤销" : "重做"}`,
    historyDomain: `${request.kind}-expansion`,
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
    report(context, "complete", `${request.kind === "culture" ? "文化" : "宗教"}${action === "undo" ? "撤销" : "重做"}画面已准备`, 1);
    return {
      kind: "social-expansion-history",
      binding,
      history: {action, kind: request.kind, id: request.id},
      result: {executed: true, action, label: String(transition.label || `${request.kind === "culture" ? "文化" : "宗教"}扩张`)},
      preparedRender,
      refresh: socialExpansionRefresh(request)
    };
  } catch (error) {
    if (applied) command.revert({map});
    throw error;
  }
}

function socialExpansionRefresh(request) {
  return {
    derived: request.mode === "reexpand"
      ? ["cell-colors", "political-boundaries", "point-layers", "labels", "object-panels", "object-index"]
      : ["point-layers", "labels", "object-panels", "object-index"],
    picking: "objects"
  };
}

export function getSocialExpansionPatchPolicy(map, request = {}) {
  const normalized = normalizeTaskRequest(request);
  const paths = [];
  const affectedKinds = normalized.kind === "culture" && normalized.includeReligions
    ? ["culture", "religion"]
    : [normalized.kind];

  if (normalized.mode === "reexpand") {
    for (const kind of affectedKinds) {
      paths.push(`pack.cells.${kind}`, `grid.cells.${kind}`);
    }
  }
  for (const kind of affectedKinds) {
    addStorePaths(paths, map, kind);
    addReferencePaths(paths, map, kind);
    addSocietyMetadataPaths(paths, kind);
  }
  if (normalized.mode === "reexpand") {
    paths.push("metadata.derivedStale");
    for (const section of DOWNSTREAM_STALE) paths.push(`${section}.metadata.stale`);
    if (normalized.kind === "culture") paths.push("society.metadata.religionsStale");
  }
  return {
    domain: "social-expansion",
    allowedPaths: [...new Set(paths)].sort(),
    forbiddenPaths: ["summary", "options", "metadata.regeneration", "routes", "rivers", "features"]
  };
}

export function fingerprintSocialExpansionSource(map, request = {}) {
  const normalized = normalizeTaskRequest(request);
  let hash = 0x811c9dc5;
  const update = value => {
    const text = String(value ?? "");
    for (let index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
  };
  update(JSON.stringify(publicRequest(normalized)));
  update(map?.grid?.cells?.culture?.length || 0);
  update(map?.pack?.cells?.culture?.length || 0);
  for (const kind of normalized.kind === "culture" && normalized.includeReligions ? ["culture", "religion"] : [normalized.kind]) {
    for (const values of [map?.pack?.cells?.[kind] || [], map?.grid?.cells?.[kind] || []]) {
      for (let index = 0; index < values.length; index++) update(Number(values[index]) || 0);
    }
    const store = map?.society?.[`${kind}s`] || map?.pack?.[`${kind}s`] || [];
    for (const item of store) {
      if (!item) continue;
      update(JSON.stringify(STORE_FIELDS[kind].map(field => item[field])));
    }
  }
  const locks = (map?.regenerationLocks?.entries || [])
    .filter(entry => entry?.kind === "culture" || entry?.kind === "religion")
    .map(entry => `${entry.kind}:${entry.id}`)
    .sort();
  update(`${Number(map?.regenerationLocks?.version) || 0}|${locks.join("|")}`);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function collectSocialExpansionWorkerTransferables(result) {
  return collectWorkerTransferables({
    patch: result?.patch || null,
    preparedRender: result?.preparedRender || null
  });
}

function emptyResult(binding, plan, inspection, reason) {
  return {
    kind: "social-expansion",
    binding,
    plan,
    inspection: publicInspection(inspection),
    result: {
      executed: false,
      reason,
      sourceFingerprint: plan.sourceFingerprint,
      affected: emptyAffected()
    },
    patch: createDomainPatch("social-expansion", [], {}),
    preparedRender: null,
    refresh: {derived: [], picking: "none"}
  };
}

function lockedTargetInspection(request) {
  return {
    valid: true,
    code: "regeneration_locked_noop",
    reason: "目标对象已锁定，本次扩张忽略该对象",
    kind: request.kind,
    id: request.id,
    mode: request.mode,
    includeReligions: request.includeReligions,
    requiresConfirm: false,
    current: null,
    next: null,
    parameterChanges: [],
    centerChanged: false,
    changedPackCells: 0,
    changedGridCells: 0,
    linkedReligionPackCells: 0,
    changed: false,
    request: {...request}
  };
}

function createPlan(binding, request, sourceFingerprint) {
  return {
    version: SOCIAL_EXPANSION_WORKER_PLAN_VERSION,
    binding: structuredClone(binding),
    request: publicRequest(request),
    sourceFingerprint
  };
}

function normalizeTaskRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw taskError("social-expansion-worker-request-invalid", "文化 / 宗教扩张 Worker request 必须是对象");
  }
  const kind = String(value.kind || "");
  if (kind !== "culture" && kind !== "religion") {
    throw taskError("social-expansion-worker-kind-invalid", "文化 / 宗教扩张 Worker kind 必须是 culture 或 religion");
  }
  const id = Number(value.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw taskError("social-expansion-worker-id-invalid", "文化 / 宗教扩张 Worker 对象 ID 必须是正整数");
  }
  const request = {...structuredClone(value), kind, id};
  if (request.mode === undefined) request.mode = "save";
  return request;
}

function normalizeBinding(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw taskError("social-expansion-worker-binding-missing", "文化 / 宗教扩张 Worker 缺少任务绑定");
  }
  const mapRevision = Number(value.mapRevision);
  const generationToken = Number(value.generationToken);
  const operationId = Number(value.operationId);
  const lockFingerprint = String(value.lockFingerprint || "");
  const operationName = String(value.operationName || "");
  if (!Number.isSafeInteger(mapRevision) || mapRevision < 0
    || !Number.isSafeInteger(generationToken) || generationToken < 0
    || !Number.isSafeInteger(operationId) || operationId < 0
    || value.mapIdentity === undefined || value.mapIdentity === null
    || !lockFingerprint || !operationName) {
    throw taskError("social-expansion-worker-binding-invalid", "文化 / 宗教扩张 Worker 绑定缺少完整 identity / revision / token / operation / lock 指纹");
  }
  return {...structuredClone(value), mapRevision, generationToken, operationId, lockFingerprint, operationName};
}

function assertEnvelopeBinding(binding, envelope) {
  if (!envelope) return;
  for (const key of ["mapIdentity", "mapRevision", "generationToken", "lockFingerprint", "operationId", "operationName"]) {
    if (!Object.prototype.hasOwnProperty.call(envelope, key) || !Object.prototype.hasOwnProperty.call(binding, key)) continue;
    if (String(envelope[key] ?? "") !== String(binding[key] ?? "")) {
      throw taskError("social-expansion-worker-binding-stale", `文化 / 宗教扩张 Worker 绑定的 ${key} 已过期`);
    }
  }
}

function addStorePaths(paths, map, kind) {
  const plural = `${kind}s`;
  const stores = [
    {path: `society.${plural}`, value: map?.society?.[plural]},
    {path: `pack.${plural}`, value: map?.pack?.[plural]}
  ];
  const seen = new Set();
  for (const store of stores) {
    if (!Array.isArray(store.value) || seen.has(store.value)) continue;
    seen.add(store.value);
    for (let index = 0; index < store.value.length; index++) {
      if (!store.value[index]) continue;
      for (const field of STORE_FIELDS[kind]) paths.push(`${store.path}.${index}.${field}`);
    }
  }
}

function addReferencePaths(paths, map, kind) {
  const collections = [
    {path: "pack.burgs", value: map?.pack?.burgs},
    {path: "settlements.cities", value: map?.settlements?.cities},
    {path: "pack.states", value: map?.pack?.states},
    {path: "politics.states", value: map?.politics?.states},
    {path: "pack.provinces", value: map?.pack?.provinces},
    {path: "politics.provinces", value: map?.politics?.provinces}
  ];
  const seen = new Set();
  for (const collection of collections) {
    if (!Array.isArray(collection.value) || seen.has(collection.value)) continue;
    seen.add(collection.value);
    for (let index = 0; index < collection.value.length; index++) {
      if (collection.value[index]) paths.push(`${collection.path}.${index}.${kind}`);
    }
  }
}

function addSocietyMetadataPaths(paths, kind) {
  if (kind === "culture") {
    paths.push(
      "society.metadata.cultures",
      "society.metadata.cultureNames",
      "society.metadata.cultureCenters",
      "society.metadata.culturedPackCells",
      "society.metadata.culturedGridCells",
      "society.metadata.cultureTree"
    );
    return;
  }
  paths.push(
    "society.metadata.religions",
    "society.metadata.religionNames",
    "society.metadata.religionCenters",
    "society.metadata.religionPackCells",
    "society.metadata.religionGridCells",
    "society.metadata.religionTree"
  );
}

function capturePathValues(map, paths) {
  return paths.map(path => {
    const parts = path.split(".");
    const captured = readPath(map, parts);
    return {path: parts, exists: captured.exists, value: cloneValue(captured.value)};
  });
}

function changedPathValues(map, before) {
  return before
    .filter(entry => {
      const current = readPath(map, entry.path);
      return current.exists !== entry.exists || !sameData(current.value, entry.value);
    })
    .map(entry => entry.path);
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

function cloneValue(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function sameData(left, right) {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
  if (ArrayBuffer.isView(left) || ArrayBuffer.isView(right)) {
    if (!ArrayBuffer.isView(left) || !ArrayBuffer.isView(right) || left.constructor !== right.constructor || left.length !== right.length) return false;
    for (let index = 0; index < left.length; index++) if (!Object.is(left[index], right[index])) return false;
    return true;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    for (let index = 0; index < left.length; index++) if (!sameData(left[index], right[index])) return false;
    return true;
  }
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length || leftKeys.some((key, index) => key !== rightKeys[index])) return false;
  return leftKeys.every(key => sameData(left[key], right[key]));
}

function captureCoverage(map, request) {
  const kinds = request.kind === "culture" && request.includeReligions ? ["culture", "religion"] : [request.kind];
  return Object.fromEntries(kinds.map(kind => [kind, {
    pack: cloneValue(map.pack.cells[kind]),
    grid: cloneValue(map.grid.cells[kind])
  }]));
}

function buildAffected(map, request, before, patch) {
  const objects = new Map([[`${request.kind}:${request.id}`, {kind: request.kind, id: request.id}]]);
  for (const path of patch.writeSet) {
    const match = /^(?:society|pack)\.(cultures|religions)\.(\d+)\./.exec(path);
    if (!match) continue;
    const kind = match[1] === "cultures" ? "culture" : "religion";
    const id = Number(match[2]);
    if (id > 0) objects.set(`${kind}:${id}`, {kind, id});
  }
  const packCells = {};
  const gridCells = {};
  for (const [kind, coverage] of Object.entries(before)) {
    packCells[kind] = changedRanges(coverage.pack, map.pack.cells[kind]);
    gridCells[kind] = changedRanges(coverage.grid, map.grid.cells[kind]);
  }
  return {
    objects: [...objects.values()].sort((left, right) => left.kind.localeCompare(right.kind) || left.id - right.id),
    packCells,
    gridCells,
    changedPaths: [...patch.writeSet]
  };
}

function changedRanges(before, after) {
  const ranges = [];
  const length = Math.max(before?.length || 0, after?.length || 0);
  let start = -1;
  for (let index = 0; index <= length; index++) {
    const changed = index < length && Number(before?.[index] || 0) !== Number(after?.[index] || 0);
    if (changed && start < 0) start = index;
    if (!changed && start >= 0) {
      ranges.push([start, index - 1]);
      start = -1;
    }
  }
  return ranges;
}

function emptyAffected() {
  return {objects: [], packCells: {}, gridCells: {}, changedPaths: []};
}

function publicInspection(inspection) {
  const result = structuredClone(inspection);
  if (result?.request) delete result.request.faultAt;
  return result;
}

function publicRequest(request) {
  const result = {...structuredClone(request)};
  delete result.faultAt;
  return result;
}

async function taskCheckpoint(context, stage) {
  if (context.signal?.aborted) throw abortError(context.signal.reason || `文化 / 宗教扩张 Worker 已在 ${stage} 取消`);
  const result = await context.checkpoint?.({phase: "social-expansion-worker", stage});
  if (result === false || context.signal?.aborted) throw abortError(context.signal?.reason || `文化 / 宗教扩张 Worker 已在 ${stage} 取消`);
}

function report(context, stage, message, progress) {
  context.report?.("social-expansion", {stage, message, progress});
}

function failAt(requested, stage) {
  if (String(requested || "") === stage) throw taskError("social-expansion-worker-fault", `文化 / 宗教扩张 Worker 故障注入：${stage}`);
}

function abortError(message) {
  return new DOMException(String(message), "AbortError");
}

function taskError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
