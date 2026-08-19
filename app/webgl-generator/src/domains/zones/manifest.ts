import type {DomainModuleManifest} from "../../core/contracts/domain-module.js";

export const ZONES_WORKER_WRITE_SET = Object.freeze([
  "zones", "pack.zones", "military.metadata.stale", "zones.metadata.stale", "markers.metadata.stale",
  "economy.metadata.stale", "diplomacy.metadata.stale", "metadata.regeneration.zones", "metadata.derivedStale", "generationLog"
] as const);

const VERIFY = "regress:settlements-zones-annotations-core-protocol";
const commands = ["create", "delete", "setStyle", "setContext", "setProperties"] as const;

export const zonesManifest = {
  id: "zones",
  version: 1,
  status: "shadow",
  canonicalSections: ["zones", "pack", "notes", "military", "markers", "economy", "diplomacy", "metadata", "generationLog"],
  derivedSystems: [{id: "zones.region-projection", reads: ["zones", "pack.zones", "pack.cells.i"], writes: [], invalidatedBy: ["zones", "pack.zones", "pack.cells.i"], invalidates: ["cell-colors", "line-layers", "labels", "picking", "object-panels", "object-index"], scope: "full-map", rebuild: "worker", reuseAcrossPresentation: true, verify: VERIFY}],
  commands: commands.map(id => ({id: `zones.${id}`, writeSet: id === "delete" ? ["zones", "pack.zones", "notes"] : ["zones", "pack.zones"], undoPolicy: "required" as const, profiles: ["interactive" as const]})),
  regeneration: {id: "zones.regenerate", writeSet: ZONES_WORKER_WRITE_SET, sourceRevision: "required", binding: "required", lockPolicy: "regeneration-lock-protection", replacementPolicy: "from-empty"},
  workerTasks: [{id: "zones.regeneration-worker", task: "regeneration.compute", resultKinds: ["zones"], writeSet: ZONES_WORKER_WRITE_SET, bindingPolicy: "pre-commit", patchPolicy: "domain-policy-required"}],
  queries: [
    {id: "zones.inspectCreate", reads: ["zones", "pack.cells.i"], profiles: ["interactive", "headless"]},
    {id: "zones.effectsAtCell", reads: ["zones", "pack.zones"], profiles: ["interactive", "headless"]},
    {id: "zones.list", reads: ["zones", "pack.zones"], profiles: ["interactive", "headless"]}
  ],
  views: [{id: "zones.region-view", reads: ["zones", "pack.zones"], presentationOnly: true}],
  layers: [{id: "zones.region-layer", reads: ["zones", "pack.zones", "pack.cells.i"], geometrySource: "derived", picking: true, export: true}],
  persistence: {schemaVersion: 2, migration: "map-document-v1-v2", backfill: "zones-pack-mirror", oldSample: "tools/fixtures/webgl-map-v1-minimal.json"},
  locks: {kinds: ["zone", "state", "religion", "military", "diplomacy-relation"], policy: "regeneration-lock-protection"},
  regression: {gates: [VERIFY, "regress:zone-regeneration", "regress:warzone-consistency", "regress:zone-context", "regress:zone-wilderness"], coverage: ["save", "undo", "worker", "regeneration", "view", "layer", "failure"]},
  capabilities: {worker: "required", regeneration: "required", view: "required", renderLayer: "required"},
  capabilityReasons: {}
} as const satisfies DomainModuleManifest;
