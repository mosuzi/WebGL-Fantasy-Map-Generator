import type {Checksum} from "./identity.js";
import type {CanonicalRevisionVector} from "./revision.js";

export type SnapshotPurpose = "rollback" | "worker" | "query" | "render" | "persistence";
export type SnapshotOwnership =
  | "borrowed-readonly"
  | "exclusive-clone"
  | "cloned-transferable"
  | "prepared-exclusive"
  | "projection-retained";
export type SnapshotTransferPolicy = "forbidden" | "owner-transfer";
export type SnapshotOwnerState = "owned" | "transferred";

export interface SnapshotOwnershipDescriptor {
  readonly kind: SnapshotOwnership;
  readonly transferPolicy: SnapshotTransferPolicy;
  readonly ownerState: SnapshotOwnerState;
}

export interface MapSnapshot<Sections = unknown> {
  readonly snapshotId: string;
  readonly purpose: SnapshotPurpose;
  readonly ownership: SnapshotOwnershipDescriptor;
  readonly revision: CanonicalRevisionVector;
  readonly checksum: Checksum;
  readonly sections: Readonly<Sections>;
}
