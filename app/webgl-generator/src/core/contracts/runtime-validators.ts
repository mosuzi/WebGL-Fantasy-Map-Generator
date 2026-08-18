import {COMMIT_LIFECYCLE} from "./commit.js";
import type {CommitEnvelope, CommitKind, CommitLifecycleState, CommitSource, ProjectionState, ProjectionStatus} from "./commit.js";
import type {
  Checksum,
  CommitId,
  HeadlessDocumentId,
  LockFingerprint,
  OperationId,
  RenderPreparationId,
  RuntimeMapSessionId,
  TransactionId
} from "./identity.js";
import type {CommittedProjectionBinding, OperationBinding, PreCommitOperationBinding} from "./operation.js";
import type {CommittedDomainPatch, ComputedDomainPatch, DomainPatchPayload, PatchMode} from "./patch.js";
import type {
  CanonicalRevision,
  CanonicalRevisionVector,
  DomainRevisionMap,
  GenerationToken,
  HeadlessDocumentRevision,
  PresentationRevision,
  RenderGeneration,
  TopologyRevision
} from "./revision.js";
import type {PresentationBinding, RenderResourceBinding} from "./projection.js";
import type {
  MapSnapshot,
  SnapshotOwnerState,
  SnapshotOwnership,
  SnapshotOwnershipDescriptor,
  SnapshotPurpose,
  SnapshotTransferPolicy
} from "./snapshot.js";

export type CoreContractErrorCode =
  | "EXPECTED_RECORD"
  | "EXPECTED_NON_EMPTY_STRING"
  | "EXPECTED_NON_NEGATIVE_INTEGER"
  | "EXPECTED_ARRAY"
  | "EXPECTED_ENUM_VALUE"
  | "UNEXPECTED_FIELD"
  | "MISSING_FIELD"
  | "IDENTITY_MISMATCH"
  | "REVISION_MISMATCH"
  | "INVALID_OWNERSHIP"
  | "INVALID_LIFECYCLE_TRANSITION";

export class CoreContractError extends Error {
  readonly code: CoreContractErrorCode;
  readonly path: string;

  constructor(code: CoreContractErrorCode, path: string, message: string) {
    super(message);
    this.name = "CoreContractError";
    this.code = code;
    this.path = path;
  }
}

type UnknownRecord = Record<string, unknown>;

const PRE_COMMIT_KINDS = Object.freeze(["compute", "render-prepare", "persistence-prepare", "query"] as const);
const PROJECTION_KINDS = Object.freeze(["worker-replica", "renderer", "persistence", "ui"] as const);
const PATCH_MODES = Object.freeze(["replace", "ranges", "sparse-values", "table-rows"] as const);
const SNAPSHOT_PURPOSES = Object.freeze(["rollback", "worker", "query", "render", "persistence"] as const);
const SNAPSHOT_OWNERSHIP = Object.freeze([
  "borrowed-readonly",
  "exclusive-clone",
  "cloned-transferable",
  "prepared-exclusive",
  "projection-retained"
] as const);
const TRANSFER_POLICIES = Object.freeze(["forbidden", "owner-transfer"] as const);
const OWNER_STATES = Object.freeze(["owned", "transferred"] as const);
const COMMIT_KINDS = Object.freeze(["edit", "regenerate", "import", "undo", "redo", "adoption"] as const);
const COMMIT_SOURCES = Object.freeze(["ui", "api", "worker", "storage", "headless"] as const);
const PROJECTION_NAMES = Object.freeze(["worker", "renderer", "persistence", "ui"] as const);
const PROJECTION_STATES = Object.freeze(["pending", "prepared", "ready", "degraded", "retrying", "resyncing"] as const);

function record(value: unknown, path: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("EXPECTED_RECORD", path, "必须是对象");
  return value as UnknownRecord;
}

function nonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) fail("EXPECTED_NON_EMPTY_STRING", path, "必须是非空字符串");
  return value;
}

function nonNegativeInteger(value: unknown, path: string): number {
  if (!Number.isInteger(value) || Number(value) < 0) fail("EXPECTED_NON_NEGATIVE_INTEGER", path, "必须是非负整数");
  return Number(value);
}

function array(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) fail("EXPECTED_ARRAY", path, "必须是数组");
  return value;
}

function enumValue<const Values extends readonly string[]>(value: unknown, values: Values, path: string): Values[number] {
  if (typeof value !== "string" || !values.includes(value)) fail("EXPECTED_ENUM_VALUE", path, `必须是 ${values.join(" / ")} 之一`);
  return value as Values[number];
}

function forbid(source: UnknownRecord, field: string, path: string): void {
  if (Object.prototype.hasOwnProperty.call(source, field)) fail("UNEXPECTED_FIELD", `${path}.${field}`, "该阶段不得携带此字段");
}

function requireField(source: UnknownRecord, field: string, path: string): unknown {
  if (!Object.prototype.hasOwnProperty.call(source, field)) fail("MISSING_FIELD", `${path}.${field}`, "缺少必需字段");
  return source[field];
}

function fail(code: CoreContractErrorCode, path: string, message: string): never {
  throw new CoreContractError(code, path, `${path}: ${message}`);
}

function checksum(value: unknown, path: string): Checksum {
  return nonEmptyString(value, path) as Checksum;
}

function stringArray(value: unknown, path: string): readonly string[] {
  return array(value, path).map((item, index) => nonEmptyString(item, `${path}[${index}]`));
}

function domainRevisions(value: unknown, path: string): DomainRevisionMap {
  const source = record(value, path);
  return Object.freeze(Object.fromEntries(Object.entries(source).map(([key, revision]) => [nonEmptyString(key, `${path}.key`), nonNegativeInteger(revision, `${path}.${key}`)])));
}

function revisionsEqual(left: CanonicalRevisionVector, right: CanonicalRevisionVector): boolean {
  if (left.profile !== right.profile) return false;
  if (left.profile === "interactive" && right.profile === "interactive") {
    if (
      left.runtimeMapSessionId !== right.runtimeMapSessionId ||
      left.canonicalRevision !== right.canonicalRevision ||
      left.topologyRevision !== right.topologyRevision
    ) {
      return false;
    }
  } else if (left.profile === "headless" && right.profile === "headless") {
    if (left.headlessDocumentId !== right.headlessDocumentId || left.headlessDocumentRevision !== right.headlessDocumentRevision) {
      return false;
    }
  } else {
    return false;
  }
  const leftEntries = Object.entries(left.domainRevisions).sort(([a], [b]) => a.localeCompare(b));
  const rightEntries = Object.entries(right.domainRevisions).sort(([a], [b]) => a.localeCompare(b));
  return leftEntries.length === rightEntries.length && leftEntries.every(([key, revision], index) => {
    const other = rightEntries[index];
    return other?.[0] === key && other[1] === revision;
  });
}

export function validateCanonicalRevisionVector(value: unknown, path = "revision"): CanonicalRevisionVector {
  const source = record(value, path);
  const profile = enumValue(source.profile, ["interactive", "headless"] as const, `${path}.profile`);
  if (profile === "interactive") {
    forbid(source, "headlessDocumentId", path);
    forbid(source, "headlessDocumentRevision", path);
    return Object.freeze({
      profile,
      runtimeMapSessionId: nonEmptyString(requireField(source, "runtimeMapSessionId", path), `${path}.runtimeMapSessionId`) as RuntimeMapSessionId,
      canonicalRevision: nonNegativeInteger(requireField(source, "canonicalRevision", path), `${path}.canonicalRevision`) as CanonicalRevision,
      topologyRevision: nonNegativeInteger(requireField(source, "topologyRevision", path), `${path}.topologyRevision`) as TopologyRevision,
      domainRevisions: domainRevisions(requireField(source, "domainRevisions", path), `${path}.domainRevisions`)
    });
  }
  forbid(source, "runtimeMapSessionId", path);
  forbid(source, "canonicalRevision", path);
  forbid(source, "topologyRevision", path);
  return Object.freeze({
    profile,
    headlessDocumentId: nonEmptyString(requireField(source, "headlessDocumentId", path), `${path}.headlessDocumentId`) as HeadlessDocumentId,
    headlessDocumentRevision: nonNegativeInteger(
      requireField(source, "headlessDocumentRevision", path),
      `${path}.headlessDocumentRevision`
    ) as HeadlessDocumentRevision,
    domainRevisions: domainRevisions(requireField(source, "domainRevisions", path), `${path}.domainRevisions`)
  });
}

function operationBase(source: UnknownRecord, path: string) {
  return {
    operationId: nonEmptyString(requireField(source, "operationId", path), `${path}.operationId`) as OperationId,
    transactionId: nonEmptyString(requireField(source, "transactionId", path), `${path}.transactionId`) as TransactionId,
    operationName: nonEmptyString(requireField(source, "operationName", path), `${path}.operationName`),
    sourceRevision: validateCanonicalRevisionVector(requireField(source, "sourceRevision", path), `${path}.sourceRevision`),
    generationToken: nonNegativeInteger(requireField(source, "generationToken", path), `${path}.generationToken`) as GenerationToken,
    lockFingerprint: nonEmptyString(requireField(source, "lockFingerprint", path), `${path}.lockFingerprint`) as LockFingerprint
  };
}

export function validateOperationBinding(value: unknown, path = "binding"): OperationBinding {
  const source = record(value, path);
  const phase = enumValue(source.bindingPhase, ["pre-commit", "committed-projection"] as const, `${path}.bindingPhase`);
  const base = operationBase(source, path);
  if (phase === "pre-commit") {
    forbid(source, "commitId", path);
    forbid(source, "targetRevision", path);
    const bindingKind = enumValue(source.bindingKind, PRE_COMMIT_KINDS, `${path}.bindingKind`);
    const renderIdentity = bindingKind === "render-prepare"
      ? {renderPreparationId: nonEmptyString(requireField(source, "renderPreparationId", path), `${path}.renderPreparationId`) as RenderPreparationId}
      : {};
    if (bindingKind !== "render-prepare") forbid(source, "renderPreparationId", path);
    return Object.freeze({
      bindingPhase: phase,
      bindingKind,
      ...base,
      ...renderIdentity
    }) as PreCommitOperationBinding;
  }
  const bindingKind = enumValue(source.bindingKind, PROJECTION_KINDS, `${path}.bindingKind`);
  const renderIdentity = bindingKind === "renderer"
    ? {renderPreparationId: nonEmptyString(requireField(source, "renderPreparationId", path), `${path}.renderPreparationId`) as RenderPreparationId}
    : {};
  if (bindingKind !== "renderer") forbid(source, "renderPreparationId", path);
  return Object.freeze({
    bindingPhase: phase,
    bindingKind,
    ...base,
    targetRevision: validateCanonicalRevisionVector(requireField(source, "targetRevision", path), `${path}.targetRevision`),
    commitId: nonEmptyString(requireField(source, "commitId", path), `${path}.commitId`) as CommitId,
    ...renderIdentity
  }) as CommittedProjectionBinding;
}

export function validatePresentationBinding(value: unknown, path = "presentationBinding"): PresentationBinding {
  const source = record(value, path);
  forbid(source, "renderPreparationId", path);
  forbid(source, "sourceRevision", path);
  forbid(source, "topologyRevision", path);
  forbid(source, "renderGeneration", path);
  return Object.freeze({
    runtimeMapSessionId: nonEmptyString(
      requireField(source, "runtimeMapSessionId", path),
      `${path}.runtimeMapSessionId`
    ) as RuntimeMapSessionId,
    presentationRevision: nonNegativeInteger(
      requireField(source, "presentationRevision", path),
      `${path}.presentationRevision`
    ) as PresentationRevision
  });
}

export function validateRenderResourceBinding(value: unknown, path = "renderResourceBinding"): RenderResourceBinding {
  const source = record(value, path);
  forbid(source, "operationId", path);
  forbid(source, "lockFingerprint", path);
  forbid(source, "presentationRevision", path);
  return Object.freeze({
    runtimeMapSessionId: nonEmptyString(
      requireField(source, "runtimeMapSessionId", path),
      `${path}.runtimeMapSessionId`
    ) as RuntimeMapSessionId,
    sourceRevision: nonNegativeInteger(requireField(source, "sourceRevision", path), `${path}.sourceRevision`) as CanonicalRevision,
    topologyRevision: nonNegativeInteger(
      requireField(source, "topologyRevision", path),
      `${path}.topologyRevision`
    ) as TopologyRevision,
    renderPreparationId: nonEmptyString(
      requireField(source, "renderPreparationId", path),
      `${path}.renderPreparationId`
    ) as RenderPreparationId,
    renderGeneration: nonNegativeInteger(
      requireField(source, "renderGeneration", path),
      `${path}.renderGeneration`
    ) as RenderGeneration
  });
}

function patchPayload(source: UnknownRecord, path: string): DomainPatchPayload {
  return {
    patchId: nonEmptyString(requireField(source, "patchId", path), `${path}.patchId`),
    domain: nonEmptyString(requireField(source, "domain", path), `${path}.domain`),
    writeSet: stringArray(requireField(source, "writeSet", path), `${path}.writeSet`),
    mode: enumValue(source.mode, PATCH_MODES, `${path}.mode`) as PatchMode,
    forward: requireField(source, "forward", path),
    ...(Object.prototype.hasOwnProperty.call(source, "inverse") ? {inverse: source.inverse} : {}),
    baseChecksum: checksum(requireField(source, "baseChecksum", path), `${path}.baseChecksum`),
    targetChecksum: checksum(requireField(source, "targetChecksum", path), `${path}.targetChecksum`)
  };
}

export function validateComputedDomainPatch(value: unknown, path = "patch"): ComputedDomainPatch {
  const source = record(value, path);
  if (source.patchKind !== "computed") fail("EXPECTED_ENUM_VALUE", `${path}.patchKind`, "必须是 computed");
  forbid(source, "commitId", path);
  forbid(source, "targetRevision", path);
  const binding = validateOperationBinding(requireField(source, "binding", path), `${path}.binding`);
  if (binding.bindingPhase !== "pre-commit") fail("EXPECTED_ENUM_VALUE", `${path}.binding.bindingPhase`, "computed patch 必须使用 pre-commit binding");
  if (binding.bindingKind !== "compute") fail("EXPECTED_ENUM_VALUE", `${path}.binding.bindingKind`, "computed patch 必须使用 compute binding");
  const baseRevision = validateCanonicalRevisionVector(requireField(source, "baseRevision", path), `${path}.baseRevision`);
  if (!revisionsEqual(baseRevision, binding.sourceRevision)) {
    fail("REVISION_MISMATCH", `${path}.baseRevision`, "必须与 binding.sourceRevision 相同");
  }
  return Object.freeze({
    patchKind: "computed",
    ...patchPayload(source, path),
    binding,
    baseRevision
  });
}

export function validateCommittedDomainPatch(value: unknown, path = "patch"): CommittedDomainPatch {
  const source = record(value, path);
  if (source.patchKind !== "committed") fail("EXPECTED_ENUM_VALUE", `${path}.patchKind`, "必须是 committed");
  const binding = validateOperationBinding(requireField(source, "binding", path), `${path}.binding`);
  if (binding.bindingPhase !== "committed-projection") {
    fail("EXPECTED_ENUM_VALUE", `${path}.binding.bindingPhase`, "committed patch 必须使用 committed-projection binding");
  }
  const commitId = nonEmptyString(requireField(source, "commitId", path), `${path}.commitId`) as CommitId;
  if (commitId !== binding.commitId) fail("IDENTITY_MISMATCH", `${path}.commitId`, "必须与 binding.commitId 相同");
  const baseRevision = validateCanonicalRevisionVector(requireField(source, "baseRevision", path), `${path}.baseRevision`);
  const targetRevision = validateCanonicalRevisionVector(requireField(source, "targetRevision", path), `${path}.targetRevision`);
  if (!revisionsEqual(baseRevision, binding.sourceRevision)) {
    fail("REVISION_MISMATCH", `${path}.baseRevision`, "必须与 binding.sourceRevision 相同");
  }
  if (!revisionsEqual(targetRevision, binding.targetRevision)) {
    fail("REVISION_MISMATCH", `${path}.targetRevision`, "必须与 binding.targetRevision 相同");
  }
  validateRevisionAdvance("edit", baseRevision, targetRevision, `${path}.targetRevision`);
  return Object.freeze({
    patchKind: "committed",
    ...patchPayload(source, path),
    binding,
    baseRevision,
    commitId,
    targetRevision
  });
}

function validateOwnership(value: unknown, path: string): SnapshotOwnershipDescriptor {
  const source = record(value, path);
  const kind = enumValue(source.kind, SNAPSHOT_OWNERSHIP, `${path}.kind`) as SnapshotOwnership;
  const transferPolicy = enumValue(source.transferPolicy, TRANSFER_POLICIES, `${path}.transferPolicy`) as SnapshotTransferPolicy;
  const ownerState = enumValue(source.ownerState, OWNER_STATES, `${path}.ownerState`) as SnapshotOwnerState;
  const transferable = kind === "cloned-transferable" || kind === "prepared-exclusive";
  if (transferable !== (transferPolicy === "owner-transfer")) {
    fail("INVALID_OWNERSHIP", `${path}.transferPolicy`, `${kind} 与 ${transferPolicy} 不匹配`);
  }
  if (!transferable && ownerState === "transferred") fail("INVALID_OWNERSHIP", `${path}.ownerState`, `${kind} 不能进入 transferred`);
  return Object.freeze({kind, transferPolicy, ownerState});
}

export function validateMapSnapshot(value: unknown, path = "snapshot"): MapSnapshot {
  const source = record(value, path);
  return Object.freeze({
    snapshotId: nonEmptyString(requireField(source, "snapshotId", path), `${path}.snapshotId`),
    purpose: enumValue(source.purpose, SNAPSHOT_PURPOSES, `${path}.purpose`) as SnapshotPurpose,
    ownership: validateOwnership(requireField(source, "ownership", path), `${path}.ownership`),
    revision: validateCanonicalRevisionVector(requireField(source, "revision", path), `${path}.revision`),
    checksum: checksum(requireField(source, "checksum", path), `${path}.checksum`),
    sections: requireField(source, "sections", path) as Readonly<unknown>
  });
}

export function validateCommitLifecycleTransition(from: unknown, to: unknown): CommitLifecycleState {
  const current = enumValue(from, COMMIT_LIFECYCLE, "lifecycle.from") as CommitLifecycleState;
  const next = enumValue(to, COMMIT_LIFECYCLE, "lifecycle.to") as CommitLifecycleState;
  if (COMMIT_LIFECYCLE.indexOf(next) !== COMMIT_LIFECYCLE.indexOf(current) + 1) {
    fail("INVALID_LIFECYCLE_TRANSITION", "lifecycle", `${current} 不能直接迁移到 ${next}`);
  }
  return next;
}

function sameOwner(before: CanonicalRevisionVector, after: CanonicalRevisionVector, path: string): void {
  if (before.profile !== after.profile) fail("IDENTITY_MISMATCH", path, "revision profile 必须相同");
  if (before.profile === "interactive" && after.profile === "interactive" && before.runtimeMapSessionId !== after.runtimeMapSessionId) {
    fail("IDENTITY_MISMATCH", path, "runtime map session 必须相同");
  }
  if (before.profile === "headless" && after.profile === "headless" && before.headlessDocumentId !== after.headlessDocumentId) {
    fail("IDENTITY_MISMATCH", path, "headless document 必须相同");
  }
}

function validateRevisionAdvance(kind: CommitKind, before: CanonicalRevisionVector, after: CanonicalRevisionVector, path: string): void {
  if (kind === "adoption" || kind === "import") {
    if (before.profile !== "interactive" || after.profile !== "interactive" || after.canonicalRevision !== 0) {
      fail("REVISION_MISMATCH", path, `${kind} 必须从 interactive owner 建立 revision 0 的新 interactive session`);
    }
    if (before.runtimeMapSessionId === after.runtimeMapSessionId) {
      fail("IDENTITY_MISMATCH", `${path}.runtimeMapSessionId`, `${kind} 必须建立新 session identity`);
    }
    return;
  }
  sameOwner(before, after, path);
  const beforeRevision = before.profile === "interactive" ? before.canonicalRevision : before.headlessDocumentRevision;
  const afterRevision = after.profile === "interactive" ? after.canonicalRevision : after.headlessDocumentRevision;
  if (afterRevision !== beforeRevision + 1) fail("REVISION_MISMATCH", path, "普通 commit 必须精确推进一个 revision");
}

function validateProjection(value: unknown, path: string): ProjectionStatus {
  const source = record(value, path);
  return Object.freeze({
    projection: enumValue(source.projection, PROJECTION_NAMES, `${path}.projection`),
    state: enumValue(source.state, PROJECTION_STATES, `${path}.state`) as ProjectionState,
    ...(source.detail === undefined ? {} : {detail: nonEmptyString(source.detail, `${path}.detail`)})
  });
}

function stringArrayRecord(value: unknown, path: string): Readonly<Record<string, readonly string[]>> {
  const source = record(value, path);
  return Object.freeze(Object.fromEntries(Object.entries(source).map(([key, items]) => [nonEmptyString(key, `${path}.key`), stringArray(items, `${path}.${key}`)])));
}

function timingRecord(value: unknown, path: string): Readonly<Record<string, number>> {
  const source = record(value, path);
  return Object.freeze(Object.fromEntries(Object.entries(source).map(([key, duration]) => {
    if (typeof duration !== "number" || !Number.isFinite(duration) || duration < 0) fail("EXPECTED_NON_NEGATIVE_INTEGER", `${path}.${key}`, "耗时必须是非负有限数");
    return [nonEmptyString(key, `${path}.key`), duration];
  })));
}

export function validateCommitEnvelope(value: unknown, path = "commit"): CommitEnvelope {
  const source = record(value, path);
  const kind = enumValue(source.kind, COMMIT_KINDS, `${path}.kind`) as CommitKind;
  const before = validateCanonicalRevisionVector(requireField(source, "before", path), `${path}.before`);
  const after = validateCanonicalRevisionVector(requireField(source, "after", path), `${path}.after`);
  validateRevisionAdvance(kind, before, after, `${path}.after`);
  const projections = array(requireField(source, "projections", path), `${path}.projections`).map((item, index) =>
    validateProjection(item, `${path}.projections[${index}]`)
  );
  return Object.freeze({
    commitId: nonEmptyString(requireField(source, "commitId", path), `${path}.commitId`) as CommitId,
    kind,
    source: enumValue(source.source, COMMIT_SOURCES, `${path}.source`) as CommitSource,
    before,
    after,
    writeSet: stringArray(requireField(source, "writeSet", path), `${path}.writeSet`),
    affected: stringArrayRecord(requireField(source, "affected", path), `${path}.affected`),
    invalidated: stringArray(requireField(source, "invalidated", path), `${path}.invalidated`),
    rebuilt: stringArray(requireField(source, "rebuilt", path), `${path}.rebuilt`),
    timings: timingRecord(requireField(source, "timings", path), `${path}.timings`),
    lifecycle: enumValue(source.lifecycle, COMMIT_LIFECYCLE, `${path}.lifecycle`) as CommitLifecycleState,
    projections: Object.freeze(projections)
  });
}
