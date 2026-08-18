import type {HeadlessDocumentId, RuntimeMapSessionId} from "./identity.js";

declare const canonicalRevisionBrand: unique symbol;
declare const headlessDocumentRevisionBrand: unique symbol;
declare const topologyRevisionBrand: unique symbol;
declare const presentationRevisionBrand: unique symbol;
declare const renderGenerationBrand: unique symbol;
declare const generationTokenBrand: unique symbol;

export type CanonicalRevision = number & {readonly [canonicalRevisionBrand]: true};
export type HeadlessDocumentRevision = number & {readonly [headlessDocumentRevisionBrand]: true};
export type TopologyRevision = number & {readonly [topologyRevisionBrand]: true};
export type PresentationRevision = number & {readonly [presentationRevisionBrand]: true};
export type RenderGeneration = number & {readonly [renderGenerationBrand]: true};
export type GenerationToken = number & {readonly [generationTokenBrand]: true};
export type DomainRevisionMap = Readonly<Record<string, number>>;

export interface InteractiveRevisionVector {
  readonly profile: "interactive";
  readonly runtimeMapSessionId: RuntimeMapSessionId;
  readonly canonicalRevision: CanonicalRevision;
  readonly topologyRevision: TopologyRevision;
  readonly domainRevisions: DomainRevisionMap;
}

export interface HeadlessRevisionVector {
  readonly profile: "headless";
  readonly headlessDocumentId: HeadlessDocumentId;
  readonly headlessDocumentRevision: HeadlessDocumentRevision;
  readonly domainRevisions: DomainRevisionMap;
}

export type CanonicalRevisionVector = InteractiveRevisionVector | HeadlessRevisionVector;
