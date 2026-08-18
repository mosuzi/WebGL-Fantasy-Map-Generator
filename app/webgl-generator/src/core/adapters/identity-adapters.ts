import type {PersistedDocumentBinding, PresentationBinding, RenderResourceBinding} from "../contracts/projection.js";
import type {CanonicalRevisionVector, HeadlessRevisionVector, InteractiveRevisionVector} from "../contracts/revision.js";
import {
  CoreContractError,
  validateCanonicalRevisionVector,
  validatePersistedDocumentBinding,
  validatePresentationBinding,
  validateRenderResourceBinding
} from "../contracts/runtime-validators.js";

type UnknownRecord = Record<string, unknown>;

export function adaptLegacyInteractiveRevision(value: unknown): InteractiveRevisionVector {
  const source = record(value, "legacyRuntimeRevision");
  const revision = validateCanonicalRevisionVector({
    profile: "interactive",
    runtimeMapSessionId: source.mapIdentity,
    canonicalRevision: source.mapRevision,
    topologyRevision: source.topologyRevision ?? 0,
    domainRevisions: source.domainRevisions ?? {}
  }, "legacyRuntimeRevision");
  if (revision.profile !== "interactive") throw new CoreContractError("EXPECTED_ENUM_VALUE", "legacyRuntimeRevision.profile", "必须是 interactive");
  return revision;
}

export function adaptHeadlessDocumentRevision(value: unknown): HeadlessRevisionVector {
  const source = record(value, "legacyHeadlessRevision");
  const revision = validateCanonicalRevisionVector({
    profile: "headless",
    headlessDocumentId: source.documentId,
    headlessDocumentRevision: source.revision,
    domainRevisions: source.domainRevisions ?? {}
  }, "legacyHeadlessRevision");
  if (revision.profile !== "headless") throw new CoreContractError("EXPECTED_ENUM_VALUE", "legacyHeadlessRevision.profile", "必须是 headless");
  return revision;
}

export function adaptPersistedDocumentBinding(value: unknown): PersistedDocumentBinding {
  const document = record(value, "document");
  const metadata = record(document.metadata, "document.metadata");
  const map = record(document.map, "document.map");
  const mapMetadata = record(map.metadata, "document.map.metadata");
  const documentBinding = validatePersistedDocumentBinding({
    documentId: metadata.documentId,
    identityVersion: metadata.documentIdentityVersion
  }, "document.metadata");
  const mapBinding = validatePersistedDocumentBinding({
    documentId: mapMetadata.documentId,
    identityVersion: mapMetadata.documentIdentityVersion
  }, "document.map.metadata");
  if (documentBinding.documentId !== mapBinding.documentId) {
    throw new CoreContractError("IDENTITY_MISMATCH", "document.map.metadata.documentId", "必须与 document.metadata.documentId 相同");
  }
  if (documentBinding.identityVersion !== mapBinding.identityVersion) {
    throw new CoreContractError(
      "IDENTITY_MISMATCH",
      "document.map.metadata.documentIdentityVersion",
      "必须与 document.metadata.documentIdentityVersion 相同"
    );
  }
  return documentBinding;
}

export function adaptLegacyPresentationBinding(value: unknown): PresentationBinding {
  const source = record(value, "legacyPresentationBinding");
  return validatePresentationBinding({
    runtimeMapSessionId: source.mapIdentity,
    presentationRevision: source.presentationRevision
  }, "legacyPresentationBinding");
}

export function adaptLegacyRenderResourceBinding(value: unknown): RenderResourceBinding {
  const source = record(value, "legacyRenderResourceBinding");
  return validateRenderResourceBinding({
    runtimeMapSessionId: source.mapIdentity,
    sourceRevision: source.mapRevision,
    topologyRevision: source.topologyRevision,
    renderPreparationId: source.renderPreparationId,
    renderGeneration: source.renderGeneration
  }, "legacyRenderResourceBinding");
}

export function revisionProfile(value: CanonicalRevisionVector): "interactive" | "headless" {
  return value.profile;
}

function record(value: unknown, path: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CoreContractError("EXPECTED_RECORD", path, `${path}: 必须是对象`);
  }
  return value as UnknownRecord;
}
