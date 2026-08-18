import type {PersistedDocumentId, RenderPreparationId, RuntimeMapSessionId} from "./identity.js";
import type {CanonicalRevision, PresentationRevision, RenderGeneration, TopologyRevision} from "./revision.js";

export interface PresentationBinding {
  readonly runtimeMapSessionId: RuntimeMapSessionId;
  readonly presentationRevision: PresentationRevision;
}

export interface PersistedDocumentBinding {
  readonly documentId: PersistedDocumentId;
  readonly identityVersion: 1;
}

export interface RenderResourceBinding {
  readonly runtimeMapSessionId: RuntimeMapSessionId;
  readonly sourceRevision: CanonicalRevision;
  readonly topologyRevision: TopologyRevision;
  readonly renderPreparationId: RenderPreparationId;
  readonly renderGeneration: RenderGeneration;
}
