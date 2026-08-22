import type {DomainModuleManifest} from "../../core/contracts/domain-module.js";
import {API_DOCUMENTATION, API_SCHEMA_VERSION, DEFAULT_API_BUSINESS_CODES} from "../api-manifest-evidence.js";

const markerCommands = ["markers.add", "markers.delete", "markers.move", "markers.setNote", "markers.setVisual"] as const;

export const MARKERS_WORKER_WRITE_SET = Object.freeze([
  "markers", "economy", "politics", "pack.markers", "pack.goods", "pack.markets", "pack.deals", "pack.states", "pack.provinces", "pack.burgs",
  "pack.metadata.markerResourceEconomy", "pack.metadata.resourceGoods", "pack.cells.good", "pack.cells.goodSupply", "pack.cells.goodSource", "pack.cells.market",
  "pack.cells.pop", "pack.cells.s", "pack.cells.suitabilityBase", "pack.cells.suitabilityOverride",
  "military.metadata.stale", "zones.metadata.stale", "markers.metadata.stale", "economy.metadata.stale", "diplomacy.metadata.stale",
  "metadata.regeneration.markers", "metadata.derivedStale", "generationLog"
] as const);

export const markersManifest = {
  id: "markers",
  version: 1,
  status: "shadow",
  canonicalSections: ["markers", "notes", "pack", "economy", "politics", "military", "zones", "diplomacy", "metadata", "generationLog"],
  derivedSystems: [
    {id: "markers.point-layer", reads: ["markers"], writes: [], invalidatedBy: ["markers"], invalidates: ["point-layers", "picking"], scope: "affected-objects", rebuild: "gpu-patch", reuseAcrossPresentation: true, verify: "regress:markers-core"},
    {id: "markers.resource-economy", reads: ["markers", "pack", "economy", "politics"], writes: ["pack", "economy", "politics"], invalidatedBy: ["markers", "pack", "economy"], invalidates: ["economy-demand", "object-index"], scope: "full-map", rebuild: "main-thread", reuseAcrossPresentation: true, verify: "regress:markers-resource-economy-core"}
  ],
  commands: markerCommands.map(id => ({id, writeSet: id === "markers.setNote" ? ["notes"] : id === "markers.setVisual" ? ["markers"] : id === "markers.delete" ? ["markers", "notes", "pack", "economy", "politics"] : ["markers", "pack", "economy", "politics"], undoPolicy: "required", profiles: ["interactive"]})),
  regeneration: {id: "markers.regenerateResources", writeSet: MARKERS_WORKER_WRITE_SET, sourceRevision: "required", binding: "required", lockPolicy: "regeneration-lock-protection", replacementPolicy: "mixed"},
  workerTasks: [{id: "markers.regeneration-worker", task: "regeneration.compute", resultKinds: ["markers"], writeSet: MARKERS_WORKER_WRITE_SET, bindingPolicy: "pre-commit", patchPolicy: "domain-policy-required"}],
  queries: [
    {id: "markers.list", reads: ["markers"], profiles: ["interactive"]},
    {id: "markers.get", reads: ["markers", "notes"], profiles: ["interactive"]}
  ],
  views: [{id: "markers.visibility", reads: ["markers"], presentationOnly: true}],
  layers: [{id: "markers.point-layer", reads: ["markers"], geometrySource: "canonical", picking: true, export: true}],
  panels: [{id: "markers.panel", commands: [...markerCommands], queries: ["markers.list", "markers.get"], selectionKind: "marker"}],
  persistence: {schemaVersion: 2, migration: "map-document-v1-v2", backfill: "markers-generator-default", oldSample: "tools/fixtures/webgl-map-v1-minimal.json"},
  api: {methods: [
    ...markerCommands.map(id => ({id: `edit.${id}`, method: `edit.${id}`, target: id, schemaVersion: API_SCHEMA_VERSION, capability: "command" as const, capabilityGroup: "map.edit", mutates: "markers", undoable: true, requiresConfirm: false, errorCodes: DEFAULT_API_BUSINESS_CODES, documentation: API_DOCUMENTATION})),
    {id: "markers.regenerationApi", method: "generate.regenerate", target: "markers.regenerateResources", schemaVersion: API_SCHEMA_VERSION, capability: "regeneration", capabilityGroup: "map.generate", mutates: "map-derived-data", undoable: true, requiresConfirm: true, errorCodes: DEFAULT_API_BUSINESS_CODES, documentation: API_DOCUMENTATION}
  ]},
  locks: {kinds: ["marker", "feature", "economy-market", "trade-flow"], policy: "regeneration-lock-protection"},
  regression: {gates: ["regress:features-networks-resources-core-protocol", "regress:markers-core", "regress:markers-resource-economy-core", "regress:auxiliary-object-creation", "regress:object-details-edit", "regress:api-data-compatibility"], coverage: ["save", "undo", "worker", "regeneration", "view", "layer", "failure"]},
  capabilities: {worker: "required", regeneration: "required", view: "optional", renderLayer: "required"},
  capabilityReasons: {}
} as const satisfies DomainModuleManifest;
