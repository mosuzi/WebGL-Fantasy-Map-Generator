import type {CommitId, LockFingerprint, OperationId, RenderPreparationId, TransactionId} from "./identity.js";
import type {CanonicalRevisionVector, GenerationToken} from "./revision.js";

interface OperationBindingBase {
  readonly operationId: OperationId;
  readonly transactionId: TransactionId;
  readonly operationName: string;
  readonly sourceRevision: CanonicalRevisionVector;
  readonly generationToken: GenerationToken;
  readonly lockFingerprint: LockFingerprint;
}

export interface ComputeOperationBinding extends OperationBindingBase {
  readonly bindingPhase: "pre-commit";
  readonly bindingKind: "compute";
}

export interface RenderPreparationOperationBinding extends OperationBindingBase {
  readonly bindingPhase: "pre-commit";
  readonly bindingKind: "render-prepare";
  readonly renderPreparationId: RenderPreparationId;
}

export interface PersistencePreparationOperationBinding extends OperationBindingBase {
  readonly bindingPhase: "pre-commit";
  readonly bindingKind: "persistence-prepare";
}

export interface QueryOperationBinding extends OperationBindingBase {
  readonly bindingPhase: "pre-commit";
  readonly bindingKind: "query";
}

export type PreCommitBindingKind = PreCommitOperationBinding["bindingKind"];
export type PreCommitOperationBinding =
  | ComputeOperationBinding
  | RenderPreparationOperationBinding
  | PersistencePreparationOperationBinding
  | QueryOperationBinding;

interface CommittedProjectionBindingBase extends OperationBindingBase {
  readonly bindingPhase: "committed-projection";
  readonly targetRevision: CanonicalRevisionVector;
  readonly commitId: CommitId;
}

export interface WorkerReplicaProjectionBinding extends CommittedProjectionBindingBase {
  readonly bindingKind: "worker-replica";
}

export interface RendererProjectionBinding extends CommittedProjectionBindingBase {
  readonly bindingKind: "renderer";
  readonly renderPreparationId: RenderPreparationId;
}

export interface PersistenceProjectionBinding extends CommittedProjectionBindingBase {
  readonly bindingKind: "persistence";
}

export interface UiProjectionBinding extends CommittedProjectionBindingBase {
  readonly bindingKind: "ui";
}

export type CommittedProjectionBinding =
  | WorkerReplicaProjectionBinding
  | RendererProjectionBinding
  | PersistenceProjectionBinding
  | UiProjectionBinding;

export type OperationBinding = PreCommitOperationBinding | CommittedProjectionBinding;
