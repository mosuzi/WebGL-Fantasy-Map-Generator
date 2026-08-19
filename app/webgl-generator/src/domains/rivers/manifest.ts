import type {DomainModuleManifest} from "../../core/contracts/domain-module.js";

export const RIVERS_WORKER_WRITE_SET = Object.freeze([
  "rivers", "pack.rivers", "pack.features", "pack.goods", "economy.goods", "pack.metadata.rankCellsInputs", "pack.metadata.resourceGoods",
  "pack.cells.fl", "pack.cells.r", "pack.cells.conf", "pack.cells.biome", "pack.cells.s", "pack.cells.pop", "pack.cells.good",
  "pack.cells.goodSupply", "pack.cells.goodSource", "pack.cells.suitabilityBase", "pack.cells.suitabilityOverride",
  "grid.cells.biome", "grid.cells.s", "grid.cells.pop", "climate.biomes", "climate.metadata.biomeCounts",
  "military.metadata.stale", "zones.metadata.stale", "markers.metadata.stale", "economy.metadata.stale", "diplomacy.metadata.stale",
  "metadata.regeneration.rivers", "metadata.derivedStale", "generationLog"
] as const);

const VERIFY = "regress:features-networks-resources-core-protocol";
const commands = ["create", "delete", "rename", "setWidthFactor", "setNote", "editControlPoints"] as const;

export const riversManifest = {
  id: "rivers",
  version: 1,
  status: "shadow",
  canonicalSections: ["rivers", "pack", "grid", "features", "climate", "economy", "notes", "metadata", "military", "zones", "markers", "diplomacy", "generationLog"],
  derivedSystems: [{id: "rivers.hydrology-projection", reads: ["rivers", "pack.rivers", "pack.cells.r", "pack.cells.fl", "pack.features"], writes: [], invalidatedBy: ["rivers", "pack.rivers", "pack.cells.r", "pack.cells.fl", "pack.features"], invalidates: ["line-layers", "cell-colors", "point-layers", "picking", "object-panels"], scope: "full-map", rebuild: "worker", reuseAcrossPresentation: true, verify: VERIFY}],
  commands: commands.map(id => ({id: `rivers.${id}`, writeSet: id === "setNote" ? ["notes"] : id === "delete" ? ["rivers", "pack.rivers", "pack.features", "pack.cells.r", "notes", "metadata.derivedStale"] : ["rivers", "pack.rivers", "pack.features", "pack.cells.r", "metadata.derivedStale"], undoPolicy: "required" as const, profiles: ["interactive" as const]})),
  regeneration: {id: "rivers.regenerate", writeSet: RIVERS_WORKER_WRITE_SET, sourceRevision: "required", binding: "required", lockPolicy: "regeneration-lock-protection", replacementPolicy: "mixed"},
  workerTasks: [{id: "rivers.regeneration-worker", task: "regeneration.compute", resultKinds: ["rivers"], writeSet: RIVERS_WORKER_WRITE_SET, bindingPolicy: "pre-commit", patchPolicy: "domain-policy-required"}],
  queries: [
    {id: "rivers.inspectCreate", reads: ["rivers", "pack.rivers", "pack.cells.i"], profiles: ["interactive", "headless"]},
    {id: "rivers.inspectDelete", reads: ["rivers", "pack.rivers", "pack.features"], profiles: ["interactive", "headless"]},
    {id: "rivers.list", reads: ["rivers", "pack.rivers"], profiles: ["interactive", "headless"]}
  ],
  views: [{id: "rivers.visibility", reads: ["rivers", "pack.rivers"], presentationOnly: true}],
  layers: [{id: "rivers.line-layer", reads: ["rivers", "pack.rivers", "pack.cells.fl"], geometrySource: "canonical", picking: true, export: true}],
  panels: [{id: "rivers.panel", commands: commands.map(id => `rivers.${id}`), queries: ["rivers.inspectCreate", "rivers.inspectDelete", "rivers.list"], selectionKind: "river"}],
  persistence: {schemaVersion: 2, migration: "map-document-v1-v2", backfill: "river-pack-network-mirror", oldSample: "tools/fixtures/webgl-map-v1-minimal.json"},
  locks: {kinds: ["river", "feature"], policy: "regeneration-lock-protection"},
  regression: {gates: [VERIFY, "regress:river-network", "regress:river-delete", "regress:regeneration-lock-river-generator", "regress:river-control-points"], coverage: ["save", "undo", "worker", "regeneration", "view", "layer", "failure"]},
  capabilities: {worker: "required", regeneration: "required", view: "required", renderLayer: "required"},
  capabilityReasons: {}
} as const satisfies DomainModuleManifest;
