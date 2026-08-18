import type {ProjectionState, ProjectionStatus} from "./contracts/commit.js";
import type {ShadowCommitUpdate} from "./contracts/facade.js";
import type {CommitId} from "./contracts/identity.js";
import {CoreFacadeError} from "./map-core-engine.js";

type CoreProjectionObserver = {
  readonly getCommit: (id: CommitId) => {readonly projections: readonly ProjectionStatus[]; readonly lifecycle: string} | null;
  readonly observeProjectionUpdate: (update: ShadowCommitUpdate) => unknown;
};

const TRANSITIONS = Object.freeze({
  pending: ["prepared", "ready", "degraded"],
  prepared: ["ready", "degraded"],
  ready: ["degraded"],
  degraded: ["retrying", "resyncing"],
  retrying: ["ready", "degraded", "resyncing"],
  resyncing: ["ready", "degraded"]
} as const satisfies Readonly<Record<ProjectionState, readonly ProjectionState[]>>);

export function createMapRuntimeCoordinator(options: {readonly core: CoreProjectionObserver}) {
  if (!options?.core || typeof options.core.getCommit !== "function" || typeof options.core.observeProjectionUpdate !== "function") {
    throw new CoreFacadeError("FACADE_OWNER_INVALID", "coordinator 必须接收 core projection observer");
  }
  const states = new Map<CommitId, Map<ProjectionStatus["projection"], ProjectionStatus>>();
  return Object.freeze({attach, transition, getStatus, snapshot});

  function attach(commitId: CommitId): readonly ProjectionStatus[] {
    if (states.has(commitId)) throw new CoreFacadeError("FACADE_LIFECYCLE_INVALID", `commit ${commitId} 已接入 coordinator`);
    const commit = options.core.getCommit(commitId);
    if (!commit || commit.lifecycle !== "published") throw new CoreFacadeError("FACADE_LIFECYCLE_INVALID", "coordinator 只能接入 published commit");
    states.set(commitId, new Map(commit.projections.map(status => [status.projection, status])));
    settleIfTerminal(commitId);
    return getStatus(commitId);
  }

  function transition(commitId: CommitId, projection: ProjectionStatus["projection"], state: ProjectionState, detail?: string): readonly ProjectionStatus[] {
    const commitStates = states.get(commitId);
    if (!commitStates) throw new CoreFacadeError("FACADE_COMMIT_UNKNOWN", `commit ${commitId} 尚未接入 coordinator`);
    const current = commitStates.get(projection);
    if (!current) throw new CoreFacadeError("FACADE_LIFECYCLE_INVALID", `commit ${commitId} 未声明 ${projection} projection`);
    const allowed = TRANSITIONS[current.state] as readonly ProjectionState[];
    if (!allowed.includes(state)) throw new CoreFacadeError("FACADE_LIFECYCLE_INVALID", `${projection} 不能从 ${current.state} 迁移到 ${state}`);
    const normalizedDetail = detail === undefined ? undefined : String(detail).trim();
    if (state === "degraded" && !normalizedDetail) throw new CoreFacadeError("FACADE_LIFECYCLE_INVALID", "degraded projection 必须记录原因");
    commitStates.set(projection, Object.freeze({projection, state, ...(normalizedDetail ? {detail: normalizedDetail} : {})}));
    settleIfTerminal(commitId);
    return getStatus(commitId);
  }

  function getStatus(commitId: CommitId): readonly ProjectionStatus[] {
    const commitStates = states.get(commitId);
    if (!commitStates) return Object.freeze([]);
    return Object.freeze([...commitStates.values()].map(status => Object.freeze({...status})));
  }

  function snapshot() {
    return Object.freeze({commits: states.size, commitIds: Object.freeze([...states.keys()])});
  }

  function settleIfTerminal(commitId: CommitId): void {
    const projections = getStatus(commitId);
    const terminal = projections.every(status => status.state === "ready" || status.state === "degraded");
    options.core.observeProjectionUpdate({commitId, lifecycle: terminal ? "projections-settled" : "published", projections});
  }
}
