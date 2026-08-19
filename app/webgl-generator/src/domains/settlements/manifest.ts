import type {DomainModuleManifest} from "../../core/contracts/domain-module.js";

export const SETTLEMENTS_WORKER_WRITE_SET = Object.freeze([
  "settlements", "politics", "grid.cells.burg", "pack.burgs", "pack.routes", "pack.states", "pack.provinces",
  "pack.cells.burg", "pack.cells.routes", "pack.cells.state", "pack.cells.province", "pack.portDiagnostics", "labels",
  "military.metadata.stale", "zones.metadata.stale", "markers.metadata.stale", "economy.metadata.stale", "diplomacy.metadata.stale",
  "metadata.regeneration.cities", "metadata.derivedStale", "generationLog"
] as const);

const VERIFY = "regress:settlements-zones-annotations-core-protocol";
const commands = ["add", "createAtCell", "delete", "move", "rename", "setPopulation", "syncOwner", "setVisual", "resetVisual", "setNote", "renameFromNamebase"] as const;

export const settlementsManifest = {
  id: "settlements",
  version: 1,
  status: "shadow",
  canonicalSections: ["settlements", "politics", "grid", "pack", "labels", "notes", "metadata", "military", "zones", "markers", "economy", "diplomacy", "generationLog"],
  derivedSystems: [{
    id: "settlements.city-projection",
    reads: ["settlements.cities", "pack.burgs", "politics", "labels"],
    writes: [],
    invalidatedBy: ["settlements.cities", "pack.burgs", "politics", "labels"],
    invalidates: ["point-layers", "labels", "picking", "object-panels", "object-index"],
    scope: "full-map",
    rebuild: "worker",
    reuseAcrossPresentation: true,
    verify: VERIFY
  }],
  commands: commands.map(id => ({
    id: `settlements.${id}`,
    writeSet: id === "setNote" ? ["notes"]
      : id === "move" ? ["settlements", "politics", "grid.cells.burg", "pack.burgs", "pack.routes", "pack.states", "pack.provinces", "pack.cells.burg", "pack.cells.routes"]
      : id === "delete" ? ["settlements", "politics.states", "politics.provinces", "pack.burgs", "pack.states", "pack.provinces", "pack.cells.burg"]
      : id === "add" || id === "createAtCell" ? ["settlements", "politics.states", "pack.burgs", "pack.states", "pack.cells.burg"]
      : id === "setPopulation" ? ["settlements", "politics.states", "pack.burgs", "pack.states"]
      : ["settlements", "pack.burgs"],
    undoPolicy: "required" as const,
    profiles: ["interactive" as const]
  })),
  regeneration: {id: "settlements.regenerate", writeSet: SETTLEMENTS_WORKER_WRITE_SET, sourceRevision: "required", binding: "required", lockPolicy: "regeneration-lock-protection", replacementPolicy: "mixed"},
  workerTasks: [{id: "settlements.regeneration-worker", task: "regeneration.compute", resultKinds: ["cities"], writeSet: SETTLEMENTS_WORKER_WRITE_SET, bindingPolicy: "pre-commit", patchPolicy: "domain-policy-required"}],
  queries: [
    {id: "settlements.inspectCreate", reads: ["grid", "pack", "settlements"], profiles: ["interactive", "headless"]},
    {id: "settlements.inspectMove", reads: ["grid", "pack", "settlements", "politics"], profiles: ["interactive", "headless"]},
    {id: "settlements.list", reads: ["settlements", "pack.burgs"], profiles: ["interactive", "headless"]}
  ],
  views: [{id: "settlements.city-view", reads: ["settlements.cities", "pack.burgs", "labels"], presentationOnly: true}],
  layers: [{id: "settlements.point-layer", reads: ["settlements.cities", "pack.burgs"], geometrySource: "canonical", picking: true, export: true}],
  persistence: {schemaVersion: 2, migration: "map-document-v1-v2", backfill: "settlements-pack-burg-mirror", oldSample: "tools/fixtures/webgl-map-v1-minimal.json"},
  locks: {kinds: ["city", "route", "state", "province", "feature"], policy: "regeneration-lock-protection"},
  regression: {gates: [VERIFY, "regress:city-relocation", "regress:settlement-route-identity", "regress:regeneration-lock-city-route", "regress:settlement-port-topology", "regress:city-picking"], coverage: ["save", "undo", "worker", "regeneration", "view", "layer", "failure"]},
  capabilities: {worker: "required", regeneration: "required", view: "required", renderLayer: "required"},
  capabilityReasons: {}
} as const satisfies DomainModuleManifest;
