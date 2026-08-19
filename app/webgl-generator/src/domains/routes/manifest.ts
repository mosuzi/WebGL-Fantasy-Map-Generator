import type {DomainModuleManifest} from "../../core/contracts/domain-module.js";

export const ROUTES_WORKER_WRITE_SET = Object.freeze([
  "settlements", "politics", "economy.markets", "grid.cells.burg", "pack.burgs", "pack.routes", "pack.states", "pack.provinces", "pack.markets",
  "pack.cells.burg", "pack.cells.routes", "pack.cells.market", "military.metadata.stale", "zones.metadata.stale", "markers.metadata.stale",
  "economy.metadata.stale", "diplomacy.metadata.stale", "metadata.regeneration.routes", "metadata.derivedStale",
  "metadata.compatibility.settlementPortTopology", "generationLog"
] as const);

export const ROUTE_PATH_WORKER_WRITE_SET = Object.freeze([
  "settlements.routes", "settlements.metadata", "settlements.cities", "grid.cells.burg",
  "pack.burgs", "pack.routes", "pack.states", "pack.provinces", "pack.markets",
  "pack.cells.burg", "pack.cells.routes", "pack.cells.market",
  "politics.states", "politics.provinces", "economy.markets", "economy.metadata",
  "diplomacy.metadata", "military.metadata", "zones.metadata", "metadata.derivedStale", "notes"
] as const);

const VERIFY = "regress:features-networks-resources-core-protocol";
const commands = ["create", "update", "delete", "setNote"] as const;

export const routesManifest = {
  id: "routes",
  version: 1,
  status: "shadow",
  canonicalSections: ["settlements", "politics", "economy", "grid", "pack", "notes", "metadata", "military", "zones", "markers", "diplomacy", "generationLog"],
  derivedSystems: [{id: "routes.line-projection", reads: ["settlements.routes", "pack.routes", "pack.cells.routes", "settlements.cities"], writes: [], invalidatedBy: ["settlements.routes", "pack.routes", "pack.cells.routes", "settlements.cities"], invalidates: ["line-layers", "picking", "object-panels", "object-index", "measurement-overlay"], scope: "full-map", rebuild: "worker", reuseAcrossPresentation: true, verify: VERIFY}],
  commands: commands.map(id => ({id: `routes.${id}`, writeSet: id === "setNote" ? ["notes"] : id === "delete" ? ["settlements.routes", "pack.routes", "pack.cells.routes", "notes", "metadata.derivedStale"] : ["settlements.routes", "pack.routes", "pack.cells.routes", "metadata.derivedStale"], undoPolicy: "required" as const, profiles: ["interactive" as const]})),
  regeneration: {id: "routes.regenerate", writeSet: ROUTES_WORKER_WRITE_SET, sourceRevision: "required", binding: "required", lockPolicy: "regeneration-lock-protection", replacementPolicy: "from-empty"},
  workerTasks: [
    {id: "routes.regeneration-worker", task: "regeneration.compute", resultKinds: ["routes"], writeSet: ROUTES_WORKER_WRITE_SET, bindingPolicy: "pre-commit", patchPolicy: "domain-policy-required"},
    {id: "routes.path-worker", task: "route-path.compute", resultKinds: ["route-path"], writeSet: ROUTE_PATH_WORKER_WRITE_SET, bindingPolicy: "pre-commit", patchPolicy: "domain-policy-required"}
  ],
  queries: [
    {id: "routes.inspectEdit", reads: ["settlements.routes", "pack.routes", "pack.cells.i"], profiles: ["interactive", "headless"]},
    {id: "routes.inspectDelete", reads: ["settlements.routes", "pack.routes", "notes"], profiles: ["interactive", "headless"]},
    {id: "routes.list", reads: ["settlements.routes", "pack.routes"], profiles: ["interactive", "headless"]}
  ],
  views: [{id: "routes.visibility", reads: ["settlements.routes", "pack.routes"], presentationOnly: true}],
  layers: [{id: "routes.line-layer", reads: ["settlements.routes", "pack.routes"], geometrySource: "canonical", picking: true, export: true}],
  panels: [{id: "routes.panel", commands: commands.map(id => `routes.${id}`), queries: ["routes.inspectEdit", "routes.inspectDelete", "routes.list"], selectionKind: "route"}],
  persistence: {schemaVersion: 2, migration: "map-document-v1-v2", backfill: "settlement-pack-route-mirror", oldSample: "tools/fixtures/webgl-map-v1-minimal.json"},
  locks: {kinds: ["route", "city", "feature"], policy: "regeneration-lock-protection"},
  regression: {gates: [VERIFY, "regress:route-edit", "regress:route-connectivity", "regress:route-network-quality", "regress:regeneration-lock-route-generator"], coverage: ["save", "undo", "worker", "regeneration", "view", "layer", "failure"]},
  capabilities: {worker: "required", regeneration: "required", view: "required", renderLayer: "required"},
  capabilityReasons: {}
} as const satisfies DomainModuleManifest;
