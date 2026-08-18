import type {CommitEnvelope, CommitKind, CommitLifecycleState, CommitSource, ProjectionStatus} from "./commit.js";
import type {CommitId, OperationId} from "./identity.js";
import type {PreCommitOperationBinding} from "./operation.js";
import type {CanonicalRevisionVector} from "./revision.js";

export interface CanonicalOwnerAccessor<TMap> {
  readonly getMap: () => TMap;
  readonly getRevision: () => unknown;
  readonly getHistoryFingerprint: () => string;
}

export interface ShadowOperationStart {
  readonly binding: PreCommitOperationBinding;
  readonly kind: CommitKind;
  readonly source: CommitSource;
  readonly projections: readonly ProjectionStatus["projection"][];
}

export interface ShadowCommitFacts {
  readonly after: CanonicalRevisionVector;
  readonly writeSet: readonly string[];
  readonly affected: Readonly<Record<string, readonly string[]>>;
  readonly invalidated: readonly string[];
  readonly rebuilt: readonly string[];
  readonly timings: Readonly<Record<string, number>>;
}

export interface ShadowRollback {
  readonly stage: CommitLifecycleState;
  readonly reason: string;
}

export interface ShadowOperationRecord {
  readonly operationId: OperationId;
  readonly binding: PreCommitOperationBinding;
  readonly kind: CommitKind;
  readonly source: CommitSource;
  readonly lifecycle: CommitLifecycleState;
  readonly lifecycleTrace: readonly CommitLifecycleState[];
  readonly historyBefore: string;
  readonly historyAfter?: string;
  readonly outcome: "observing" | "rolled-back" | "published" | "settled";
  readonly rollback?: ShadowRollback;
  readonly commit?: CommitEnvelope;
}

export interface ShadowCommitUpdate {
  readonly commitId: CommitId;
  readonly lifecycle: "published" | "projections-settled";
  readonly projections: readonly ProjectionStatus[];
}
