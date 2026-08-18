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
import {isProjectionSetTerminal, isProjectionTransitionAllowed} from "./projection-state.js";

type MutableRecord = {
  start: ShadowOperationStart;
  lifecycle: CommitLifecycleState;
  trace: CommitLifecycleState[];
  historyBefore: string;
  historyAfter?: string;
  outcome: ShadowOperationRecord["outcome"];
  rollback?: {stage: CommitLifecycleState; reason: string};
  commit?: CommitEnvelope;
  claimKey?: string;
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
  const transitionClaims = new Map<string, OperationId>();
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
    const borrow = createReadOnlyBorrow(map);
    try {
      const result = reader(borrow.value);
      if (isPromiseLike(result)) throw new CoreFacadeError("FACADE_ASYNC_BORROW", "borrowed canonical reference 不得跨异步边界");
      if (borrow.contains(result)) throw new CoreFacadeError("FACADE_OWNER_ESCAPE", "reader 不得返回 canonical owner 的直接或嵌套借用引用");
      if (owner.getMap() !== map) throw new CoreFacadeError("FACADE_OWNER_DRIFT", "同步读取期间 canonical owner 已替换");
      return result;
    } finally {
      borrow.revoke();
    }
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
    if (record.outcome !== "observing" || record.lifecycle !== "projections-prepared" || record.commit) throw new CoreFacadeError("FACADE_LIFECYCLE_INVALID", "只有未回滚且完成 projections-prepared 的观察可以记录 canonical commit");
    const after = validateCanonicalRevisionVector(facts?.after, "shadow.commit.after");
    const current = validateCanonicalRevisionVector(owner.getRevision(), "owner.revision");
    if (!sameRevision(current, after)) throw new CoreFacadeError("FACADE_OWNER_DRIFT", "只允许记录 owner 已经完成的 legacy commit");
    const lifecycle = validateCommitLifecycleTransition(record.lifecycle, "canonical-committed");
    const projections = record.start.projections.map(projection => ({projection, state: "prepared" as const}));
    const historyAfter = readHistory();
    const claimKey = transitionClaimKey(record.start.binding.sourceRevision, after, record.historyBefore, historyAfter);
    const claimedBy = transitionClaims.get(claimKey);
    if (claimedBy && claimedBy !== operationId) throw new CoreFacadeError("FACADE_LIFECYCLE_INVALID", `owner transition 已由 operation ${claimedBy} 认领`);
    const preflight = {
      commitId: "shadow-preflight",
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
    };
    validateCommitEnvelope(preflight, "shadow.commit");
    const commitId = options.createCommitId();
    if (typeof commitId !== "string" || !commitId.trim() || commits.has(commitId)) throw new CoreFacadeError("FACADE_LIFECYCLE_INVALID", "commit id 必须非空且唯一");
    const envelope = validateCommitEnvelope({...preflight, commitId}, "shadow.commit");
    record.lifecycle = lifecycle;
    record.trace.push(lifecycle);
    record.historyAfter = historyAfter;
    record.commit = envelope;
    record.claimKey = claimKey;
    transitionClaims.set(claimKey, operationId);
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
    assertProjectionUpdate(record.commit.projections, update.projections);
    if (record.lifecycle === "published" && isProjectionSetTerminal(update.projections)) {
      record.lifecycle = validateCommitLifecycleTransition(record.lifecycle, "projections-settled");
      record.trace.push(record.lifecycle);
      record.outcome = "settled";
    }
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
    if (record.claimKey && transitionClaims.get(record.claimKey) === operationId) transitionClaims.delete(record.claimKey);
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

function assertProjectionUpdate(current: readonly ProjectionStatus[], next: readonly ProjectionStatus[]): void {
  const currentNames = current.map(item => item.projection).sort();
  const nextNames = next.map(item => item.projection).sort();
  if (new Set(nextNames).size !== nextNames.length || currentNames.length !== nextNames.length || currentNames.some((name, index) => name !== nextNames[index])) {
    throw new CoreFacadeError("FACADE_LIFECYCLE_INVALID", "projection update 必须保持原计划集合且不得重复");
  }
  for (const currentStatus of current) {
    const nextStatus = next.find(item => item.projection === currentStatus.projection);
    if (!nextStatus || !isProjectionTransitionAllowed(currentStatus.state, nextStatus.state)) {
      throw new CoreFacadeError("FACADE_LIFECYCLE_INVALID", `${currentStatus.projection} 不能从 ${currentStatus.state} 迁移到 ${nextStatus?.state}`);
    }
    if (nextStatus.state === "degraded" && !nextStatus.detail?.trim()) {
      throw new CoreFacadeError("FACADE_LIFECYCLE_INVALID", "degraded projection 必须记录原因");
    }
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

function transitionClaimKey(before: unknown, after: unknown, historyBefore: string, historyAfter: string): string {
  return JSON.stringify([revisionClaimPart(before), revisionClaimPart(after), historyBefore, historyAfter]);
}

function revisionClaimPart(value: unknown): readonly unknown[] {
  const revision = validateCanonicalRevisionVector(value, "claim.revision");
  const domains = Object.entries(revision.domainRevisions).sort(([left], [right]) => left.localeCompare(right));
  return revision.profile === "interactive"
    ? [revision.profile, revision.runtimeMapSessionId, revision.canonicalRevision, revision.topologyRevision, domains]
    : [revision.profile, revision.headlessDocumentId, revision.headlessDocumentRevision, domains];
}

function createReadOnlyBorrow<T>(value: T): {readonly value: Readonly<T>; readonly contains: (candidate: unknown) => boolean; readonly revoke: () => void} {
  const wrapped = new WeakMap<object, object>();
  const targets = new WeakMap<object, object>();
  const borrowed = new WeakSet<object>();
  const revokers: (() => void)[] = [];

  const wrap = (candidate: unknown): unknown => {
    if ((typeof candidate !== "object" && typeof candidate !== "function") || candidate === null) return candidate;
    const existing = wrapped.get(candidate);
    if (existing) return existing;
    const {proxy, revoke} = Proxy.revocable(candidate, {
      get(target, property) {
        if (isBorrowMutation(target, property)) return () => mutationRejected(property);
        if (ArrayBuffer.isView(target) && property === "buffer") return target.buffer.slice(0);
        return wrap(Reflect.get(target, property, requiresNativeReceiver(target) ? target : proxy));
      },
      getOwnPropertyDescriptor(target, property) {
        const descriptor = Reflect.getOwnPropertyDescriptor(target, property);
        if (!descriptor || !("value" in descriptor) || (typeof descriptor.value !== "object" && typeof descriptor.value !== "function") || descriptor.value === null) return descriptor;
        if (!descriptor.configurable && !descriptor.writable) throw new CoreFacadeError("FACADE_OWNER_ESCAPE", `不可安全借用 ${String(property)} descriptor`);
        return {...descriptor, value: wrap(descriptor.value)};
      },
      getPrototypeOf: () => {
        throw new CoreFacadeError("FACADE_OWNER_ESCAPE", "borrowed canonical owner 不暴露可变 prototype");
      },
      set: (_target, property) => mutationRejected(property),
      defineProperty: (_target, property) => mutationRejected(property),
      deleteProperty: (_target, property) => mutationRejected(property),
      setPrototypeOf: () => mutationRejected("[[Prototype]]"),
      preventExtensions: () => mutationRejected("[[Extensible]]"),
      apply(target, thisArgument, argumentsList) {
        const receiver = targets.get(thisArgument as object) || thisArgument;
        const result = Reflect.apply(target as (...args: unknown[]) => unknown, requiresNativeReceiver(receiver) ? receiver : thisArgument, argumentsList.map(argument => targets.get(argument as object) || argument));
        return wrap(result);
      }
    });
    wrapped.set(candidate, proxy);
    targets.set(proxy, candidate);
    borrowed.add(proxy);
    revokers.push(revoke);
    return proxy;
  };

  return {
    value: wrap(value) as Readonly<T>,
    contains: candidate => containsBorrowedReference(candidate, borrowed),
    revoke: () => {
      for (let index = revokers.length - 1; index >= 0; index--) revokers[index]();
    }
  };
}

function mutationRejected(property: PropertyKey): never {
  throw new CoreFacadeError("FACADE_OWNER_ESCAPE", `borrowed canonical owner 不得写入 ${String(property)}`);
}

function isBorrowMutation(target: object, property: PropertyKey): boolean {
  if (typeof property !== "string") return false;
  if (Array.isArray(target)) return ["copyWithin", "fill", "pop", "push", "reverse", "shift", "sort", "splice", "unshift"].includes(property);
  if (target instanceof Map) return ["clear", "delete", "set"].includes(property);
  if (target instanceof Set) return ["add", "clear", "delete"].includes(property);
  if (ArrayBuffer.isView(target)) return ["copyWithin", "fill", "reverse", "set", "sort"].includes(property) || (target instanceof DataView && property.startsWith("set"));
  if (target instanceof Date) return property.startsWith("set");
  return false;
}

function requiresNativeReceiver(value: unknown): value is object {
  if (value instanceof Map || value instanceof Set || value instanceof Date || value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return true;
  const tag = value && typeof value === "object" ? Object.prototype.toString.call(value) : "";
  return tag === "[object Map Iterator]" || tag === "[object Set Iterator]" || tag === "[object Array Iterator]" || tag === "[object String Iterator]";
}

function containsBorrowedReference(value: unknown, borrowed: WeakSet<object>, seen = new WeakSet<object>()): boolean {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) return false;
  if (borrowed.has(value)) return true;
  if (seen.has(value)) return false;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor && "value" in descriptor && containsBorrowedReference(descriptor.value, borrowed, seen)) return true;
  }
  return false;
}
