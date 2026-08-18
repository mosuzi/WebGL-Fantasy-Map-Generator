import type {Checksum, CommitId} from "./identity.js";
import type {CommittedProjectionBinding, ComputeOperationBinding} from "./operation.js";
import type {CanonicalRevisionVector} from "./revision.js";

export type PatchMode = "replace" | "ranges" | "sparse-values" | "table-rows";

export interface DomainPatchPayload<WriteSet extends string = string> {
  readonly patchId: string;
  readonly domain: string;
  readonly writeSet: readonly WriteSet[];
  readonly mode: PatchMode;
  readonly forward: unknown;
  readonly inverse?: unknown;
  readonly baseChecksum: Checksum;
  readonly targetChecksum: Checksum;
}

export interface ComputedDomainPatch<WriteSet extends string = string> extends DomainPatchPayload<WriteSet> {
  readonly patchKind: "computed";
  readonly binding: ComputeOperationBinding;
  readonly baseRevision: CanonicalRevisionVector;
}

export interface CommittedDomainPatch<WriteSet extends string = string> extends DomainPatchPayload<WriteSet> {
  readonly patchKind: "committed";
  readonly binding: CommittedProjectionBinding;
  readonly baseRevision: CanonicalRevisionVector;
  readonly commitId: CommitId;
  readonly targetRevision: CanonicalRevisionVector;
}
