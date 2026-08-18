import assert from "node:assert/strict";

const contractsUrl = new URL("../.cache/core-contract-test/contracts/runtime-validators.js", import.meta.url).href;
const adaptersUrl = new URL("../.cache/core-contract-test/adapters/identity-adapters.js", import.meta.url).href;
const {
  CoreContractError,
  validateCanonicalRevisionVector,
  validateCommitEnvelope,
  validateCommitLifecycleTransition,
  validateCommittedDomainPatch,
  validateComputedDomainPatch,
  validateMapSnapshot,
  validateOperationBinding,
  validatePresentationBinding,
  validateRenderResourceBinding
} = await import(contractsUrl);
const {
  adaptHeadlessDocumentRevision,
  adaptLegacyInteractiveRevision,
  adaptLegacyPresentationBinding,
  adaptLegacyRenderResourceBinding,
  adaptPersistedDocumentBinding
} = await import(adaptersUrl);

function expectContractError(callback, code, path) {
  assert.throws(callback, error => {
    assert.ok(error instanceof CoreContractError);
    assert.equal(error.code, code);
    assert.equal(error.path, path);
    return true;
  });
}

const revision0 = Object.freeze({
  profile: "interactive",
  runtimeMapSessionId: "runtime-map:test",
  canonicalRevision: 0,
  topologyRevision: 3,
  domainRevisions: Object.freeze({notes: 0})
});
const revision1 = Object.freeze({...revision0, canonicalRevision: 1, domainRevisions: Object.freeze({notes: 1})});
const nextSession = Object.freeze({...revision0, runtimeMapSessionId: "runtime-map:next"});
const headless0 = Object.freeze({
  profile: "headless",
  headlessDocumentId: "headless-document:test",
  headlessDocumentRevision: 0,
  domainRevisions: Object.freeze({notes: 0})
});
const headless1 = Object.freeze({...headless0, headlessDocumentRevision: 1, domainRevisions: Object.freeze({notes: 1})});

assert.deepEqual(validateCanonicalRevisionVector(revision0), revision0);
assert.deepEqual(validateCanonicalRevisionVector(headless0), headless0);
expectContractError(
  () => validateCanonicalRevisionVector({...revision0, headlessDocumentId: "headless:wrong"}),
  "UNEXPECTED_FIELD",
  "revision.headlessDocumentId"
);

assert.equal(adaptLegacyInteractiveRevision({mapIdentity: "runtime-map:test", mapRevision: 0}).profile, "interactive");
assert.equal(adaptHeadlessDocumentRevision({documentId: "headless-document:test", revision: 0}).profile, "headless");
assert.equal(
  adaptLegacyPresentationBinding({mapIdentity: "runtime-map:test", presentationRevision: 8}).presentationRevision,
  8
);
assert.equal(
  adaptLegacyRenderResourceBinding({
    mapIdentity: "runtime-map:test",
    mapRevision: 0,
    topologyRevision: 3,
    renderPreparationId: "render-preparation:test",
    renderGeneration: 2
  }).renderPreparationId,
  "render-preparation:test"
);
const persistedDocument = {
  metadata: {documentId: "fmg-doc-v1-0123456789abcdef", documentIdentityVersion: 1},
  map: {metadata: {documentId: "fmg-doc-v1-0123456789abcdef", documentIdentityVersion: 1}}
};
assert.equal(adaptPersistedDocumentBinding(persistedDocument).documentId, "fmg-doc-v1-0123456789abcdef");
expectContractError(
  () => adaptPersistedDocumentBinding({
    metadata: {documentId: " invalid identity ", documentIdentityVersion: 1},
    map: {metadata: {documentId: " invalid identity ", documentIdentityVersion: 1}}
  }),
  "EXPECTED_NON_EMPTY_STRING",
  "document.metadata.documentId"
);
expectContractError(
  () => adaptPersistedDocumentBinding({
    ...persistedDocument,
    map: {metadata: {...persistedDocument.map.metadata, documentId: "fmg-doc-v1-fedcba9876543210"}}
  }),
  "IDENTITY_MISMATCH",
  "document.map.metadata.documentId"
);
expectContractError(
  () => validateCanonicalRevisionVector({...headless0, runtimeMapSessionId: "runtime-map:wrong"}),
  "UNEXPECTED_FIELD",
  "revision.runtimeMapSessionId"
);

const preCommitBinding = Object.freeze({
  bindingPhase: "pre-commit",
  bindingKind: "compute",
  operationId: "operation:test",
  transactionId: "transaction:test",
  operationName: "notes.compute",
  sourceRevision: revision0,
  generationToken: 4,
  lockFingerprint: "locks:none"
});
assert.equal(validateOperationBinding(preCommitBinding).bindingPhase, "pre-commit");
expectContractError(
  () => validateOperationBinding({...preCommitBinding, commitId: "commit:too-early"}),
  "UNEXPECTED_FIELD",
  "binding.commitId"
);
expectContractError(
  () => validateOperationBinding({...preCommitBinding, bindingKind: "render-prepare"}),
  "MISSING_FIELD",
  "binding.renderPreparationId"
);
assert.equal(
  validateOperationBinding({...preCommitBinding, bindingKind: "render-prepare", renderPreparationId: "render-preparation:test"})
    .renderPreparationId,
  "render-preparation:test"
);

assert.equal(
  validatePresentationBinding({runtimeMapSessionId: "runtime-map:test", presentationRevision: 8}).presentationRevision,
  8
);
expectContractError(
  () => validatePresentationBinding({
    runtimeMapSessionId: "runtime-map:test",
    presentationRevision: 8,
    renderPreparationId: "render-preparation:wrong"
  }),
  "UNEXPECTED_FIELD",
  "presentationBinding.renderPreparationId"
);
assert.equal(
  validateRenderResourceBinding({
    runtimeMapSessionId: "runtime-map:test",
    sourceRevision: 0,
    topologyRevision: 3,
    renderPreparationId: "render-preparation:test",
    renderGeneration: 2
  }).renderGeneration,
  2
);
expectContractError(
  () => validateRenderResourceBinding({
    runtimeMapSessionId: "runtime-map:test",
    sourceRevision: 0,
    topologyRevision: 3,
    renderPreparationId: "render-preparation:test",
    renderGeneration: 2,
    operationId: "operation:must-not-own-resource"
  }),
  "UNEXPECTED_FIELD",
  "renderResourceBinding.operationId"
);
expectContractError(
  () => validateRenderResourceBinding({
    runtimeMapSessionId: "runtime-map:test",
    sourceRevision: 0,
    topologyRevision: 3,
    renderPreparationId: "render-preparation:test",
    renderGeneration: 2,
    presentationRevision: 8
  }),
  "UNEXPECTED_FIELD",
  "renderResourceBinding.presentationRevision"
);

const computedPatch = Object.freeze({
  patchKind: "computed",
  patchId: "patch:computed",
  domain: "notes",
  writeSet: Object.freeze(["notes"]),
  mode: "replace",
  forward: Object.freeze({notes: []}),
  baseChecksum: "checksum:before",
  targetChecksum: "checksum:after",
  binding: preCommitBinding,
  baseRevision: revision0
});
assert.equal(validateComputedDomainPatch(computedPatch).patchKind, "computed");
expectContractError(
  () => validateComputedDomainPatch({
    ...computedPatch,
    binding: {...preCommitBinding, bindingKind: "render-prepare", renderPreparationId: "render-preparation:test"}
  }),
  "EXPECTED_ENUM_VALUE",
  "patch.binding.bindingKind"
);
expectContractError(
  () => validateComputedDomainPatch({...computedPatch, targetRevision: revision1}),
  "UNEXPECTED_FIELD",
  "patch.targetRevision"
);
expectContractError(
  () => validateComputedDomainPatch({...computedPatch, baseRevision: revision1}),
  "REVISION_MISMATCH",
  "patch.baseRevision"
);

const projectionBinding = Object.freeze({
  ...preCommitBinding,
  bindingPhase: "committed-projection",
  bindingKind: "worker-replica",
  targetRevision: revision1,
  commitId: "commit:notes-1"
});
const committedPatch = Object.freeze({
  ...computedPatch,
  patchKind: "committed",
  binding: projectionBinding,
  commitId: "commit:notes-1",
  targetRevision: revision1
});
assert.equal(validateCommittedDomainPatch(committedPatch).commitId, "commit:notes-1");
expectContractError(
  () => validateCommittedDomainPatch({...committedPatch, commitId: "commit:wrong"}),
  "IDENTITY_MISMATCH",
  "patch.commitId"
);
const revision2 = Object.freeze({...revision1, canonicalRevision: 2, domainRevisions: Object.freeze({notes: 2})});
expectContractError(
  () => validateCommittedDomainPatch({
    ...committedPatch,
    binding: {...projectionBinding, targetRevision: revision2},
    targetRevision: revision2
  }),
  "REVISION_MISMATCH",
  "patch.targetRevision"
);

assert.equal(validateCommitLifecycleTransition("planned", "computed"), "computed");
assert.equal(validateCommitLifecycleTransition("published", "projections-settled"), "projections-settled");
expectContractError(
  () => validateCommitLifecycleTransition("published", "validated"),
  "INVALID_LIFECYCLE_TRANSITION",
  "lifecycle"
);

const workerSnapshot = Object.freeze({
  snapshotId: "snapshot:worker",
  purpose: "worker",
  ownership: Object.freeze({kind: "cloned-transferable", transferPolicy: "owner-transfer", ownerState: "owned"}),
  revision: revision0,
  checksum: "checksum:snapshot",
  sections: Object.freeze({notes: Object.freeze([])})
});
assert.equal(validateMapSnapshot(workerSnapshot).ownership.kind, "cloned-transferable");
expectContractError(
  () => validateMapSnapshot({...workerSnapshot, ownership: {kind: "borrowed-readonly", transferPolicy: "owner-transfer", ownerState: "owned"}}),
  "INVALID_OWNERSHIP",
  "snapshot.ownership.transferPolicy"
);

const envelope = Object.freeze({
  commitId: "commit:notes-1",
  kind: "edit",
  source: "api",
  before: revision0,
  after: revision1,
  writeSet: Object.freeze(["notes"]),
  affected: Object.freeze({notes: Object.freeze(["note:1"])}),
  invalidated: Object.freeze([]),
  rebuilt: Object.freeze([]),
  timings: Object.freeze({total: 1.25}),
  lifecycle: "published",
  projections: Object.freeze([
    Object.freeze({projection: "worker", state: "degraded", detail: "等待 resync"}),
    Object.freeze({projection: "persistence", state: "ready"})
  ])
});
assert.equal(validateCommitEnvelope(envelope).after.canonicalRevision, 1);
assert.equal(
  validateCommitEnvelope({...envelope, source: "headless", before: headless0, after: headless1}).after.headlessDocumentRevision,
  1
);
assert.equal(
  validateCommitEnvelope({...envelope, kind: "adoption", before: revision1, after: nextSession, writeSet: ["*"]}).after.runtimeMapSessionId,
  "runtime-map:next"
);
expectContractError(
  () => validateCommitEnvelope({...envelope, kind: "import", source: "storage", before: headless1, after: nextSession, writeSet: ["*"]}),
  "REVISION_MISMATCH",
  "commit.after"
);
assert.equal(
  validateCommitEnvelope({...envelope, kind: "import", source: "storage", before: revision1, after: nextSession, writeSet: ["*"]}).after
    .runtimeMapSessionId,
  "runtime-map:next"
);
expectContractError(
  () => validateCommitEnvelope({...envelope, after: {...revision1, canonicalRevision: 2}}),
  "REVISION_MISMATCH",
  "commit.after"
);

console.log(
  JSON.stringify({
    revisionProfiles: ["interactive", "headless"],
    bindingPhases: ["pre-commit", "committed-projection"],
    renderPreparationIdentityValidated: true,
    explicitIdentityAdaptersValidated: true,
    computedPatchRejectsCommitFields: true,
    ownershipValidated: true,
    lifecycleValidated: true,
    commitEnvelopeValidated: true
  })
);
