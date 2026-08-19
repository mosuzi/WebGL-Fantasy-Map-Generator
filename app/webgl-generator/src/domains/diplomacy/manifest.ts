import type {DomainModuleManifest} from "../../core/contracts/domain-module.js";

export const DIPLOMACY_WORKER_WRITE_SET = Object.freeze([
  "options.diplomacyRegenerationSalt", "diplomacy", "military", "zones", "pack.diplomacy", "pack.states", "pack.military", "pack.zones", "politics.states",
  "military.metadata.stale", "zones.metadata.stale", "markers.metadata.stale", "economy.metadata.stale", "diplomacy.metadata.stale",
  "metadata.regeneration.diplomacy", "metadata.derivedStale", "generationLog"
] as const);

const VERIFY = "regress:economy-diplomacy-military-core-protocol";
const commands = ["setRelation", "declareWar", "makePeace", "changeOverlord"] as const;

export const diplomacyManifest = {
  id: "diplomacy",
  version: 1,
  status: "shadow",
  canonicalSections: ["diplomacy", "politics", "pack", "military", "zones", "economy", "markers", "options", "metadata", "generationLog"],
  derivedSystems: [{id: "diplomacy.relation-projection", reads: ["diplomacy", "pack.diplomacy", "politics.states", "pack.states"], writes: [], invalidatedBy: ["diplomacy", "pack.diplomacy", "politics.states", "pack.states"], invalidates: ["cell-colors", "line-layers", "picking", "object-panels", "object-index"], scope: "full-map", rebuild: "worker", reuseAcrossPresentation: true, verify: VERIFY}],
  commands: commands.map(id => ({id: `diplomacy.${id}`, writeSet: ["diplomacy", "politics.states", "pack.states", "military", "zones"], undoPolicy: "required" as const, profiles: ["interactive" as const]})),
  regeneration: {id: "diplomacy.regenerate", writeSet: DIPLOMACY_WORKER_WRITE_SET, sourceRevision: "required", binding: "required", lockPolicy: "regeneration-lock-protection", replacementPolicy: "from-empty"},
  workerTasks: [{id: "diplomacy.regeneration-worker", task: "regeneration.compute", resultKinds: ["diplomacy"], writeSet: DIPLOMACY_WORKER_WRITE_SET, bindingPolicy: "pre-commit", patchPolicy: "domain-policy-required"}],
  queries: [{id: "diplomacy.inspectRelation", reads: ["diplomacy", "politics.states", "pack.states"], profiles: ["interactive", "headless"]}],
  views: [{id: "diplomacy.relation-view", reads: ["diplomacy", "politics.states", "pack.states"], presentationOnly: true}],
  layers: [{id: "diplomacy.relation-layer", reads: ["diplomacy", "politics.states", "pack.states"], geometrySource: "derived", picking: true, export: true}],
  panels: [{id: "diplomacy.panel", commands: commands.map(id => `diplomacy.${id}`), queries: ["diplomacy.inspectRelation"], selectionKind: "diplomacy-relation"}],
  persistence: {schemaVersion: 2, migration: "map-document-v1-v2", backfill: "diplomacy-state-pack-mirror", oldSample: "tools/fixtures/webgl-map-v1-minimal.json"},
  locks: {kinds: ["diplomacy-relation", "state", "military", "zone"], policy: "regeneration-lock-protection"},
  regression: {gates: [VERIFY, "regress:diplomacy-rules", "regress:diplomacy-export", "regress:regeneration-lock-diplomacy", "regress:warzone-consistency"], coverage: ["save", "undo", "worker", "regeneration", "view", "layer", "failure"]},
  capabilities: {worker: "required", regeneration: "required", view: "required", renderLayer: "required"},
  capabilityReasons: {}
} as const satisfies DomainModuleManifest;
