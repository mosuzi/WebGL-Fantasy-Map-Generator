import type {CommitEnvelope, CommitLifecycleState, ProjectionStatus} from "./contracts/commit.js";
import type {
  CanonicalOwnerAccessor,
  ShadowCommitFacts,
  ShadowCommitUpdate,
  ShadowOperationRecord,
  ShadowOperationStart
} from "./contracts/facade.js";
import type {CommitId, OperationId} from "./contracts/identity.js";
import {validateCanonicalRevisionVector, validateCommitEnvelope, validateCommitLifecycleTransition, validateOperationBinding} from "./contracts/runtime-validators.js";

type MutableRecord = {
  start: ShadowOperationStart;
  lifecycle: CommitLifecycleState;
  trace: CommitLifecycleState[];
  historyBefore: string;
  historyAfter?: string;
  outcome: ShadowOperationRecord["outcome"];
  rollback?: {stage: CommitLifecycleState; reason: string};
  commit?: CommitEnvelope;
};

export type CoreFacadeErrorCode =
  | "FACADE_OWNER_INVALID"
  | "FACADE_OPERATION_DUPLICATE"
  | "FACADE_OPERATION_UNKNOWN"
  | "FACADE_COMMIT_UNKNOWN"
  | "FACADE_OWNER_DRIFT"
  | "FACADE_HISTORY_INVALID"
  | "FACADE_LIFECYCLE_INVALID"
  | "FACADE_ROLLBACK_AFTER_PUBLISH"
  | "FACADE_ASYNC_BORROW"
  | "FACADE_OWNER_ESCAPE";

export class CoreFacadeError extends Error {
  readonly code: CoreFacadeErrorCode;

  constructor(code: CoreFacadeErrorCode, message: string) {
    super(message);
    this.name = "CoreFacadeError";
    this.code = code;
  }
}

export function createMapCoreEngine<TMap>(options: {
  readonly owner: CanonicalOwnerAccessor<TMap>;
  readonly createCommitId: () => CommitId;
}) {
  const owner = validateOwner(options?.owner);
  if (typeof options?.createCommitId !== "function") throw new CoreFacadeError("FACADE_OWNER_INVALID", "createCommitId 必须是函数");
  const operations = new Map<OperationId, MutableRecord>();
  const commits = new Map<CommitId, MutableRecord>();
  let lastCommitId: CommitId | null = null;

  return Object.freeze({
    readCanonical,
    beginShadowOperation,
    observeComputed: (id: OperationId) => advance(id, "computed"),
    observeValidated: (id: OperationId) => advance(id, "validated"),
    observeProjectionsPrepared: (id: OperationId) => advance(id, "projections-prepared"),
    observeCanonicalCommit,
    observePublished,
    observeProjectionUpdate,
    observeRollback,
    getOperation,
    getCommit,
    getLastCommit: () => lastCommitId ? getCommit(lastCommitId) : null,
    snapshot: () => Object.freeze({operations: operations.size, commits: commits.size, lastCommitId})
  });

  function readCanonical<TResult>(reader: (map: Readonly<TMap>) => TResult): TResult {
    if (typeof reader !== "function") throw new CoreFacadeError("FACADE_OWNER_INVALID", "canonical reader 必须是函数");
    const map = owner.getMap();
    const result = reader(map as Readonly<TMap>);
    if (isPromiseLike(result)) throw new CoreFacadeError("FACADE_ASYNC_BORROW", "borrowed canonical reference 不得跨异步边界");
    if ((result as unknown) === map) throw new CoreFacadeError("FACADE_OWNER_ESCAPE", "reader 不得返回 canonical owner 引用");
    if (owner.getMap() !== map) throw new CoreFacadeError("FACADE_OWNER_DRIFT", "同步读取期间 canonical owner 已替换");
    return result;
  }

  function beginShadowOperation(input: ShadowOperationStart): ShadowOperationRecord {
    const binding = validateOperationBinding(input?.binding, "shadow.binding");
    if (binding.bindingPhase !== "pre-commit") throw new CoreFacadeError("FACADE_LIFECYCLE_INVALID", "影子操作必须从 pre-commit binding 开始");
    if (operations.has(binding.operationId)) throw new CoreFacadeError("FACADE_OPERATION_DUPLICATE", `operation ${binding.operationId} 已存在`);
    const current = validateCanonicalRevisionVector(owner.getRevision(), "owner.revision");
    if (!sameRevision(current, binding.sourceRevision)) throw new CoreFacadeError("FACADE_OWNER_DRIFT", "开始观察时 owner revision 与 source revision 不一致");
    const projections = uniqueProjectionNames(input.projections);
    const start = Object.freeze({...input, binding, projections});
    const record: MutableRecord = {
      start,
      lifecycle: "planned",
      trace: ["planned"],
      historyBefore: readHistory(),
      outcome: "observing"
    };
    operations.set(binding.operationId, record);
    return freezeRecord(record);
  }

  function advance(operationId: OperationId, lifecycle: CommitLifecycleState): ShadowOperationRecord {
    const record = requireOperation(operationId);
    if (record.outcome !== "observing" || record.commit) throw new CoreFacadeError("FACADE_LIFECYCLE_INVALID", "只有未提交观察可以推进 pre-commit lifecycle");
    record.lifecycle = validateCommitLifecycleTransition(record.lifecycle, lifecycle);
    record.trace.push(lifecycle);
    return freezeRecord(record);
  }

  function observeCanonicalCommit(operationId: OperationId, facts: ShadowCommitFacts): CommitEnvelope {
    const record = requireOperation(operationId);
    if (record.lifecycle !== "projections-prepared" || record.commit) throw new CoreFacadeError("FACADE_LIFECYCLE_INVALID", "canonical commit 前必须完成 projections-prepared");
    const after = validateCanonicalRevisionVector(facts?.after, "shadow.commit.after");
    const current = validateCanonicalRevisionVector(owner.getRevision(), "owner.revision");
    if (!sameRevision(current, after)) throw new CoreFacadeError("FACADE_OWNER_DRIFT", "只允许记录 owner 已经完成的 legacy commit");
    const commitId = options.createCommitId();
    if (typeof commitId !== "string" || !commitId.trim() || commits.has(commitId)) throw new CoreFacadeError("FACADE_LIFECYCLE_INVALID", "commit id 必须非空且唯一");
    const lifecycle = validateCommitLifecycleTransition(record.lifecycle, "canonical-committed");
    const projections = record.start.projections.map(projection => ({projection, state: "prepared" as const}));
    const envelope = validateCommitEnvelope({
      commitId,
      kind: record.start.kind,
      source: record.start.source,
      before: record.start.binding.sourceRevision,
      after,
      writeSet: facts.writeSet,
      affected: facts.affected,
      invalidated: facts.invalidated,
      rebuilt: facts.rebuilt,
      timings: facts.timings,
      lifecycle,
      projections
    }, "shadow.commit");
    record.lifecycle = lifecycle;
    record.trace.push(lifecycle);
    record.historyAfter = readHistory();
    record.commit = envelope;
    commits.set(commitId, record);
    return envelope;
  }

  function observePublished(commitId: CommitId): CommitEnvelope {
    const record = requireCommit(commitId);
    if (record.lifecycle !== "canonical-committed" || !record.commit || record.outcome !== "observing") throw new CoreFacadeError("FACADE_LIFECYCLE_INVALID", "只有未回滚的 canonical-committed 可以发布");
    const current = validateCanonicalRevisionVector(owner.getRevision(), "owner.revision");
    if (!sameRevision(current, record.commit.after) || readHistory() !== record.historyAfter) {
      throw new CoreFacadeError("FACADE_OWNER_DRIFT", "发布观察点必须仍对应已提交的 owner revision 与 history");
    }
    const lifecycle = validateCommitLifecycleTransition(record.lifecycle, "published");
    record.lifecycle = lifecycle;
    record.trace.push(lifecycle);
    record.outcome = "published";
    record.commit = validateCommitEnvelope({...record.commit, lifecycle}, "shadow.commit");
    lastCommitId = commitId;
    return record.commit;
  }

  function observeProjectionUpdate(update: ShadowCommitUpdate): CommitEnvelope {
    const record = requireCommit(update.commitId);
    if (!record.commit || (record.lifecycle !== "published" && record.lifecycle !== "projections-settled")) throw new CoreFacadeError("FACADE_LIFECYCLE_INVALID", "投影更新只能发生在 published 之后");
    assertProjectionUpdate(record.commit.projections, update.projections, update.lifecycle);
    if (update.lifecycle === "published") {
      record.commit = validateCommitEnvelope({...record.commit, lifecycle: record.lifecycle, projections: update.projections}, "shadow.commit");
      return record.commit;
    }
    if (record.lifecycle === "published") {
      record.lifecycle = validateCommitLifecycleTransition(record.lifecycle, "projections-settled");
      record.trace.push(record.lifecycle);
    }
    record.outcome = "settled";
    record.commit = validateCommitEnvelope({...record.commit, lifecycle: record.lifecycle, projections: update.projections}, "shadow.commit");
    return record.commit;
  }

  function observeRollback(operationId: OperationId, reason: string): ShadowOperationRecord {
    const record = requireOperation(operationId);
    if (record.lifecycle === "published" || record.lifecycle === "projections-settled" || record.outcome === "published" || record.outcome === "settled") {
      throw new CoreFacadeError("FACADE_ROLLBACK_AFTER_PUBLISH", "published commit 不得由投影失败反向回滚");
    }
    const normalizedReason = String(reason || "").trim();
    if (!normalizedReason) throw new CoreFacadeError("FACADE_LIFECYCLE_INVALID", "rollback 必须说明原因");
    const current = validateCanonicalRevisionVector(owner.getRevision(), "owner.revision");
    if (!sameRevision(current, record.start.binding.sourceRevision) || readHistory() !== record.historyBefore) {
      throw new CoreFacadeError("FACADE_OWNER_DRIFT", "rollback 记录要求 owner revision 与 history 已由 legacy 路径恢复");
    }
    record.outcome = "rolled-back";
    record.rollback = {stage: record.lifecycle, reason: normalizedReason};
    return freezeRecord(record);
  }

  function getOperation(id: OperationId): ShadowOperationRecord | null {
    const record = operations.get(id);
    return record ? freezeRecord(record) : null;
  }

  function getCommit(id: CommitId): CommitEnvelope | null {
    return commits.get(id)?.commit || null;
  }

  function requireOperation(id: OperationId): MutableRecord {
    const record = operations.get(id);
    if (!record) throw new CoreFacadeError("FACADE_OPERATION_UNKNOWN", `未知 operation ${id}`);
    return record;
  }

  function requireCommit(id: CommitId): MutableRecord {
    const record = commits.get(id);
    if (!record) throw new CoreFacadeError("FACADE_COMMIT_UNKNOWN", `未知 commit ${id}`);
    return record;
  }

  function readHistory(): string {
    const fingerprint = owner.getHistoryFingerprint();
    if (typeof fingerprint !== "string" || !fingerprint.trim()) throw new CoreFacadeError("FACADE_HISTORY_INVALID", "history fingerprint 必须是非空字符串");
    return fingerprint;
  }
}

function validateOwner<TMap>(value: CanonicalOwnerAccessor<TMap>): CanonicalOwnerAccessor<TMap> {
  if (!value || typeof value !== "object" || typeof value.getMap !== "function" || typeof value.getRevision !== "function" || typeof value.getHistoryFingerprint !== "function") {
    throw new CoreFacadeError("FACADE_OWNER_INVALID", "facade 必须接收现有 owner 的三个 getter");
  }
  return value;
}

function uniqueProjectionNames(value: readonly ProjectionStatus["projection"][]): readonly ProjectionStatus["projection"][] {
  if (!Array.isArray(value)) throw new CoreFacadeError("FACADE_LIFECYCLE_INVALID", "projection plan 必须是数组");
  const allowed = new Set(["worker", "renderer", "persistence", "ui"]);
  const result = value.map(item => {
    if (!allowed.has(item)) throw new CoreFacadeError("FACADE_LIFECYCLE_INVALID", `未知 projection ${item}`);
    return item;
  });
  if (new Set(result).size !== result.length) throw new CoreFacadeError("FACADE_LIFECYCLE_INVALID", "projection plan 不得重复");
  return Object.freeze(result);
}

function assertProjectionUpdate(current: readonly ProjectionStatus[], next: readonly ProjectionStatus[], lifecycle: ShadowCommitUpdate["lifecycle"]): void {
  const currentNames = current.map(item => item.projection).sort();
  const nextNames = next.map(item => item.projection).sort();
  if (new Set(nextNames).size !== nextNames.length || currentNames.length !== nextNames.length || currentNames.some((name, index) => name !== nextNames[index])) {
    throw new CoreFacadeError("FACADE_LIFECYCLE_INVALID", "projection update 必须保持原计划集合且不得重复");
  }
  if (lifecycle === "projections-settled" && next.some(item => item.state !== "ready" && item.state !== "degraded")) {
    throw new CoreFacadeError("FACADE_LIFECYCLE_INVALID", "projections-settled 只能包含 ready / degraded 终态");
  }
}

function freezeRecord(record: MutableRecord): ShadowOperationRecord {
  return Object.freeze({
    operationId: record.start.binding.operationId,
    binding: record.start.binding,
    kind: record.start.kind,
    source: record.start.source,
    lifecycle: record.lifecycle,
    lifecycleTrace: Object.freeze([...record.trace]),
    historyBefore: record.historyBefore,
    ...(record.historyAfter ? {historyAfter: record.historyAfter} : {}),
    outcome: record.outcome,
    ...(record.rollback ? {rollback: Object.freeze({...record.rollback})} : {}),
    ...(record.commit ? {commit: record.commit} : {})
  });
}

function sameRevision(left: unknown, right: unknown): boolean {
  const a = validateCanonicalRevisionVector(left, "revision.left");
  const b = validateCanonicalRevisionVector(right, "revision.right");
  if (a.profile !== b.profile) return false;
  if (a.profile === "interactive" && b.profile === "interactive") {
    if (a.runtimeMapSessionId !== b.runtimeMapSessionId || a.canonicalRevision !== b.canonicalRevision || a.topologyRevision !== b.topologyRevision) return false;
  } else if (a.profile === "headless" && b.profile === "headless") {
    if (a.headlessDocumentId !== b.headlessDocumentId || a.headlessDocumentRevision !== b.headlessDocumentRevision) return false;
  } else {
    return false;
  }
  const aEntries = Object.entries(a.domainRevisions).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
  const bEntries = Object.entries(b.domainRevisions).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
  return aEntries.length === bEntries.length && aEntries.every(([key, revision], index) => bEntries[index]?.[0] === key && bEntries[index]?.[1] === revision);
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return Boolean(value && (typeof value === "object" || typeof value === "function") && typeof (value as PromiseLike<unknown>).then === "function");
}
