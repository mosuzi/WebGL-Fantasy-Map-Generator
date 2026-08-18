import type {CommitId} from "./identity.js";
import type {CanonicalRevisionVector} from "./revision.js";

export const COMMIT_LIFECYCLE = Object.freeze([
  "planned",
  "computed",
  "validated",
  "projections-prepared",
  "canonical-committed",
  "published",
  "projections-settled"
] as const);

export type CommitLifecycleState = (typeof COMMIT_LIFECYCLE)[number];
export type CommitKind = "edit" | "regenerate" | "import" | "undo" | "redo" | "adoption";
export type CommitSource = "ui" | "api" | "worker" | "storage" | "headless";
export type ProjectionState = "pending" | "prepared" | "ready" | "degraded" | "retrying" | "resyncing";

export interface ProjectionStatus {
  readonly projection: "worker" | "renderer" | "persistence" | "ui";
  readonly state: ProjectionState;
  readonly detail?: string;
}

export interface CommitEnvelope {
  readonly commitId: CommitId;
  readonly kind: CommitKind;
  readonly source: CommitSource;
  readonly before: CanonicalRevisionVector;
  readonly after: CanonicalRevisionVector;
  readonly writeSet: readonly string[];
  readonly affected: Readonly<Record<string, readonly string[]>>;
  readonly invalidated: readonly string[];
  readonly rebuilt: readonly string[];
  readonly timings: Readonly<Record<string, number>>;
  readonly lifecycle: CommitLifecycleState;
  readonly projections: readonly ProjectionStatus[];
}
