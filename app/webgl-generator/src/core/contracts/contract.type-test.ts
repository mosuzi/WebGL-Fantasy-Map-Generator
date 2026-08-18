import type {CommitId, OperationId, RenderPreparationId, RuntimeMapSessionId} from "./identity.js";
import type {ComputedDomainPatch} from "./patch.js";
import type {RenderPreparationOperationBinding} from "./operation.js";
import type {CanonicalRevision, PresentationRevision} from "./revision.js";

declare const runtimeMapSessionId: RuntimeMapSessionId;
declare const operationId: OperationId;
declare const commitId: CommitId;
declare const renderPreparationId: RenderPreparationId;
declare const canonicalRevision: CanonicalRevision;
declare const presentationRevision: PresentationRevision;
declare const computedPatch: ComputedDomainPatch;
declare const renderPreparationBinding: RenderPreparationOperationBinding;

const acceptsRuntimeMapSession = (_value: RuntimeMapSessionId) => undefined;
const acceptsOperation = (_value: OperationId) => undefined;
const acceptsCanonicalRevision = (_value: CanonicalRevision) => undefined;

// @ts-expect-error Operation identity cannot masquerade as a runtime map session identity.
acceptsRuntimeMapSession(operationId);
// @ts-expect-error Commit identity cannot masquerade as an operation identity.
acceptsOperation(commitId);
// @ts-expect-error Render preparation identity cannot masquerade as a runtime map session identity.
acceptsRuntimeMapSession(renderPreparationId);
// @ts-expect-error Presentation revision cannot advance canonical history.
acceptsCanonicalRevision(presentationRevision);
// @ts-expect-error A computed patch has no canonical commit identity before acceptance.
computedPatch.commitId;
// @ts-expect-error A computed patch has no target canonical revision before acceptance.
computedPatch.targetRevision;
// @ts-expect-error A computed patch can only carry a compute binding.
const invalidComputedBinding: ComputedDomainPatch["binding"] = renderPreparationBinding;

void runtimeMapSessionId;
void canonicalRevision;
void invalidComputedBinding;
