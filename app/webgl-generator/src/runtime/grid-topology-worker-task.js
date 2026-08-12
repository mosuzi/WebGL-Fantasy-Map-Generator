import {fingerprintGridStructure} from "../generator/grid-refinement.js";
import {
  prepareGridRefinement,
  prepareGridStructureWrite
} from "./grid-topology-api.js";
import {executeRenderPreparationTask} from "../renderer/render-preparation.js";
import {collectWorkerTransferables} from "./worker-snapshot.js";

export const GRID_TOPOLOGY_WORKER_TASK = "grid-topology.prepare";
export const GRID_TOPOLOGY_WORKER_ACTION = Object.freeze({
  REFINE: "grid.refine",
  APPLY_WRITE: "grid.applyWrite"
});

export async function runGridTopologyWorkerTask(payload = {}, context = {}) {
  const map = payload.map;
  if (!map?.grid?.points || !map?.pack?.cells) throw taskError("grid-worker-map-missing", "Grid Worker 缺少完整地图快照");
  const action = normalizeAction(payload.action);
  const binding = normalizeBinding(payload.binding);
  assertEnvelopeBinding(binding, context.binding);
  assertSnapshotBinding(map, binding);
  await taskCheckpoint(context, "validate", {action, sourceCells: map.grid.points.length});

  const sourceFingerprint = fingerprintGridStructure(map.grid);
  const sourceLockFingerprint = fingerprintGridTopologyLocks(map);
  const revisionTracker = {
    getSnapshot: () => ({mapIdentity: binding.mapIdentity, mapRevision: binding.mapRevision})
  };
  const options = clonePlainObject(payload.options);
  const taskContext = createPrepareContext(context);
  context.report?.("grid-topology", {stage: "prepare", action, sourceCells: map.grid.points.length});
  const prepared = action === GRID_TOPOLOGY_WORKER_ACTION.REFINE
    ? prepareGridRefinement(map, revisionTracker, options, taskContext)
    : prepareGridStructureWrite(map, revisionTracker, payload.document, options, taskContext);

  await taskCheckpoint(context, "verify", {action, targetCells: prepared.map.grid.points.length});
  if (fingerprintGridStructure(map.grid) !== sourceFingerprint || fingerprintGridTopologyLocks(map) !== sourceLockFingerprint) {
    throw taskError("grid-worker-input-mutated", "Grid Worker prepare 改写了输入快照");
  }
  if (!prepared?.result?.executed) {
    return {
      kind: "grid-topology-worker-result",
      action,
      binding,
      executed: false,
      reason: prepared?.result?.reason || "no-op",
      replacementMap: null,
      preparedRender: null,
      result: prepared?.result || null
    };
  }
  const preparedRender = payload.render
    ? await executeRenderPreparationTask({...payload.render, map: prepared.map}, context)
    : null;
  context.report?.("grid-topology", {stage: "complete", action, targetCells: prepared.map.grid.points.length, progress: 1});
  return {
    kind: "grid-topology-worker-result",
    action,
    binding,
    executed: true,
    replacementMap: prepared.map,
    preparedRender,
    result: prepared.result
  };
}

export function collectGridTopologyWorkerTransferables(result) {
  return collectWorkerTransferables({
    replacementMap: result?.replacementMap || null,
    preparedRender: result?.preparedRender || null
  });
}

export function fingerprintGridTopologyLocks(map) {
  const entries = (map?.regenerationLocks?.entries || [])
    .map(entry => `${String(entry?.kind || "")}:${String(entry?.id ?? "")}`)
    .sort();
  let hash = 0x811c9dc5;
  for (const character of `${Number(map?.regenerationLocks?.version) || 0}|${entries.join("|")}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalizeAction(value) {
  const action = String(value || "").trim();
  if ([GRID_TOPOLOGY_WORKER_ACTION.REFINE, "refine"].includes(action)) return GRID_TOPOLOGY_WORKER_ACTION.REFINE;
  if ([GRID_TOPOLOGY_WORKER_ACTION.APPLY_WRITE, "apply-write", "applyWrite"].includes(action)) return GRID_TOPOLOGY_WORKER_ACTION.APPLY_WRITE;
  throw taskError("grid-worker-action-invalid", `Grid Worker 不支持操作：${action || "未知"}`);
}

function normalizeBinding(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw taskError("grid-worker-binding-missing", "Grid Worker 缺少绑定");
  const mapRevision = Number(value.mapRevision);
  const sourceFingerprint = String(value.sourceFingerprint || "");
  const lockFingerprint = String(value.lockFingerprint || "");
  if (!Number.isSafeInteger(mapRevision) || mapRevision < 0 || !sourceFingerprint || !lockFingerprint) {
    throw taskError("grid-worker-binding-invalid", "Grid Worker 绑定缺少有效 revision、网格指纹或锁指纹");
  }
  return {
    ...structuredClone(value),
    mapIdentity: value.mapIdentity === undefined ? null : value.mapIdentity,
    mapRevision,
    sourceFingerprint,
    lockFingerprint
  };
}

function assertEnvelopeBinding(binding, envelope) {
  if (envelope === null || envelope === undefined) return;
  for (const key of ["mapIdentity", "mapRevision", "sourceFingerprint", "lockFingerprint"]) {
    if (!Object.prototype.hasOwnProperty.call(envelope, key)) continue;
    if (String(envelope[key] ?? "") !== String(binding[key] ?? "")) {
      throw taskError("grid-worker-binding-stale", `Grid Worker 请求绑定与任务信封的 ${key} 不一致`, {key});
    }
  }
}

function assertSnapshotBinding(map, binding) {
  const actualSourceFingerprint = fingerprintGridStructure(map.grid);
  if (actualSourceFingerprint !== binding.sourceFingerprint) {
    throw taskError("grid-worker-binding-stale", "Grid Worker 地图快照的来源网格指纹已过期", {
      expected: binding.sourceFingerprint,
      actual: actualSourceFingerprint
    });
  }
  const actualLockFingerprint = fingerprintGridTopologyLocks(map);
  if (actualLockFingerprint !== binding.lockFingerprint) {
    throw taskError("grid-worker-binding-stale", "Grid Worker 地图快照的锁指纹已过期", {
      expected: binding.lockFingerprint,
      actual: actualLockFingerprint
    });
  }
}

function createPrepareContext(context) {
  return {
    signal: context.signal || null,
    checkpoint(detail) {
      assertNotAborted(context.signal, detail?.stage || "prepare");
      context.checkpoint?.(detail);
      assertNotAborted(context.signal, detail?.stage || "prepare");
    },
    report(stage, detail) {
      context.report?.(stage, detail);
    }
  };
}

async function taskCheckpoint(context, stage, detail = {}) {
  assertNotAborted(context.signal, stage);
  await context.checkpoint?.({phase: "grid-topology-worker", stage, ...detail});
  assertNotAborted(context.signal, stage);
}

function assertNotAborted(signal, stage) {
  if (!signal?.aborted) return;
  const error = taskError("grid-preparation-aborted", String(signal.reason || `Grid Worker 已在 ${stage} 阶段取消`), {stage});
  error.name = "AbortError";
  throw error;
}

function clonePlainObject(value) {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw taskError("grid-worker-options-invalid", "Grid Worker options 必须是对象");
  return structuredClone(value);
}

function taskError(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  if (details) error.details = details;
  return error;
}
