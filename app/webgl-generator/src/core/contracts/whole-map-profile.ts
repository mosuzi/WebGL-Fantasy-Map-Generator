import type {Checksum, HeadlessDocumentId, PersistedDocumentId, RuntimeMapSessionId} from "./identity.js";
import type {PersistedDocumentBinding} from "./projection.js";
import type {CanonicalRevision, HeadlessDocumentRevision, TopologyRevision} from "./revision.js";

export type WholeMapProfileId = "generation-adoption" | "persistence-import" | "persistence-export" | "headless-write";
export type WholeMapResultOwner = "generation" | "persistence" | "headless";
export type WholeMapTransactionEffect = "new-session" | "read-only" | "revision-commit";

export interface WholeMapProfileDescriptor {
  readonly id: WholeMapProfileId;
  readonly task: string;
  readonly resultKind: string;
  readonly owner: WholeMapResultOwner;
  readonly effect: WholeMapTransactionEffect;
}

export interface WholeMapInteractiveSourceBinding {
  readonly runtimeMapSessionId: RuntimeMapSessionId;
  readonly canonicalRevision: CanonicalRevision;
  readonly topologyRevision: TopologyRevision;
}

export interface WholeMapDocumentReceipt {
  readonly binding: PersistedDocumentBinding;
  readonly checksum: Checksum;
  readonly gridCells: number;
  readonly packCells: number;
}

export interface WholeMapAdoptionReceipt extends WholeMapDocumentReceipt {
  readonly profile: "generation-adoption" | "persistence-import";
  readonly source: WholeMapInteractiveSourceBinding;
  readonly effect: "new-session";
}

export interface WholeMapExportReceipt extends WholeMapDocumentReceipt {
  readonly profile: "persistence-export";
  readonly source: WholeMapInteractiveSourceBinding;
  readonly effect: "read-only";
  readonly bytes: number;
}

export interface WholeMapHeadlessCommitReceipt {
  readonly profile: "headless-write";
  readonly effect: "revision-commit";
  readonly persisted: Readonly<{before: PersistedDocumentId; after: PersistedDocumentId}>;
  readonly headlessDocumentId: HeadlessDocumentId;
  readonly revisionBefore: HeadlessDocumentRevision;
  readonly revisionAfter: HeadlessDocumentRevision;
}
