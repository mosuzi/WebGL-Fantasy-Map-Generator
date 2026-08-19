import type {ProjectionState, ProjectionStatus} from "./contracts/commit.js";
import type {ShadowCommitUpdate} from "./contracts/facade.js";
import type {CommitId} from "./contracts/identity.js";
import {CoreFacadeError} from "./map-core-engine.js";
import {isProjectionTransitionAllowed} from "./projection-state.js";

type CoreProjectionObserver = {
  readonly getCommit: (id: CommitId) => {readonly projections: readonly ProjectionStatus[]; readonly lifecycle: string} | null;
  readonly observeProjectionUpdate: (update: ShadowCommitUpdate) => unknown;
};

export function createMapRuntimeCoordinator(options: {readonly core: CoreProjectionObserver}) {
  if (!options?.core || typeof options.core.getCommit !== "function" || typeof options.core.observeProjectionUpdate !== "function") {
    throw new CoreFacadeError("FACADE_OWNER_INVALID", "coordinator 必须接收 core projection observer");
  }
  const states = new Map<CommitId, Map<ProjectionStatus["projection"], ProjectionStatus>>();
  const recoveries = new Set<string>();
  return Object.freeze({attach, transition, recover, getStatus, snapshot});

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
    if (!isProjectionTransitionAllowed(current.state, state)) throw new CoreFacadeError("FACADE_LIFECYCLE_INVALID", `${projection} 不能从 ${current.state} 迁移到 ${state}`);
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

  async function recover(
    commitId: CommitId,
    projection: ProjectionStatus["projection"],
    mode: "retrying" | "resyncing",
    attempt: () => unknown | Promise<unknown>
  ): Promise<readonly ProjectionStatus[]> {
    if (typeof attempt !== "function") throw new CoreFacadeError("FACADE_LIFECYCLE_INVALID", "projection recovery 缺少执行函数");
    if (mode !== "retrying" && mode !== "resyncing") throw new CoreFacadeError("FACADE_LIFECYCLE_INVALID", `未知 projection recovery mode ${String(mode)}`);
    const current = states.get(commitId)?.get(projection);
    if (current?.state !== "degraded") throw new CoreFacadeError("FACADE_LIFECYCLE_INVALID", `${projection} 只有 degraded 状态可以恢复`);
    const key = `${commitId}:${projection}`;
    if (recoveries.has(key)) throw new CoreFacadeError("FACADE_LIFECYCLE_INVALID", `${projection} 已有恢复任务运行中`);
    recoveries.add(key);
    try {
      transition(commitId, projection, mode);
      await attempt();
      return transition(commitId, projection, "ready");
    } catch (error) {
      const reason = String(error instanceof Error ? error.message || error.name : error || "projection recovery failed").trim() || "projection recovery failed";
      const failedState = states.get(commitId)?.get(projection)?.state;
      if (failedState === "retrying" || failedState === "resyncing" || failedState === "degraded") {
        transition(commitId, projection, "degraded", reason);
      }
      throw error;
    } finally {
      recoveries.delete(key);
    }
  }

  function snapshot() {
    return Object.freeze({commits: states.size, commitIds: Object.freeze([...states.keys()]), recoveries: recoveries.size});
  }

  function settleIfTerminal(commitId: CommitId): void {
    const projections = getStatus(commitId);
    options.core.observeProjectionUpdate({commitId, projections});
  }
}
