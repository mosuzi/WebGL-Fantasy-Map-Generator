import type {DomainModuleManifest} from "../../core/contracts/domain-module.js";

export const FEATURES_WORKER_WRITE_SET = Object.freeze([
  "features", "grid.features", "grid.cells.f", "grid.cells.t", "pack.features", "pack.metadata", "pack.cells.f", "pack.cells.t",
  "pack.cells.haven", "pack.cells.harbor", "pack.cells.type", "pack.burgs", "pack.routes", "pack.markers", "pack.portDiagnostics.features",
  "settlements", "markers.markers", "military.metadata.stale", "zones.metadata.stale", "markers.metadata.stale", "economy.metadata.stale",
  "diplomacy.metadata.stale", "metadata.regeneration.features", "metadata.derivedStale", "generationLog"
] as const);

const VERIFY = "regress:features-networks-resources-core-protocol";
const commands = ["applyPatch", "applyTopology"] as const;

export const featuresManifest = {
  id: "features",
  version: 1,
  status: "shadow",
  canonicalSections: ["features", "grid", "pack", "settlements", "markers", "metadata", "military", "zones", "economy", "diplomacy", "generationLog"],
  derivedSystems: [{id: "features.topology-projection", reads: ["features", "grid.features", "grid.cells.f", "pack.features", "pack.cells.f", "pack.cells.haven", "pack.cells.harbor"], writes: [], invalidatedBy: ["features", "grid.features", "grid.cells.f", "pack.features", "pack.cells.f", "pack.cells.haven", "pack.cells.harbor"], invalidates: ["terrain-caches", "height-field", "render-mesh", "line-layers", "point-layers", "labels", "picking", "object-panels", "object-index"], scope: "full-map", rebuild: "worker", reuseAcrossPresentation: true, verify: VERIFY}],
  commands: commands.map(id => ({id: `features.${id}`, writeSet: ["features", "grid", "pack", "settlements", "markers", "metadata.derivedStale"], undoPolicy: "required" as const, profiles: ["interactive" as const]})),
  regeneration: {id: "features.regenerate", writeSet: FEATURES_WORKER_WRITE_SET, sourceRevision: "required", binding: "required", lockPolicy: "regeneration-lock-protection", replacementPolicy: "mixed"},
  workerTasks: [{id: "features.regeneration-worker", task: "regeneration.compute", resultKinds: ["features"], writeSet: FEATURES_WORKER_WRITE_SET, bindingPolicy: "pre-commit", patchPolicy: "domain-policy-required"}],
  queries: [
    {id: "features.inspectPatch", reads: ["features", "grid", "pack"], profiles: ["interactive", "headless"]},
    {id: "features.inspectTopology", reads: ["features", "grid", "pack"], profiles: ["interactive", "headless"]},
    {id: "features.list", reads: ["features", "pack.features"], profiles: ["interactive", "headless"]}
  ],
  views: [{id: "features.visibility", reads: ["features", "pack.features"], presentationOnly: true}],
  layers: [{id: "features.surface-layer", reads: ["features", "grid", "pack"], geometrySource: "derived", picking: true, export: true}],
  persistence: {schemaVersion: 2, migration: "map-document-v1-v2", backfill: "feature-grid-pack-mirror", oldSample: "tools/fixtures/webgl-map-v1-minimal.json"},
  locks: {kinds: ["feature", "city", "route", "marker"], policy: "regeneration-lock-protection"},
  regression: {gates: [VERIFY, "regress:feature-topology", "regress:feature-patch", "regress:regeneration-lock-feature"], coverage: ["save", "undo", "worker", "regeneration", "view", "layer", "failure"]},
  capabilities: {worker: "required", regeneration: "required", view: "required", renderLayer: "required"},
  capabilityReasons: {}
} as const satisfies DomainModuleManifest;
