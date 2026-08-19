import type {DomainModuleManifest} from "../../core/contracts/domain-module.js";
import {API_DOCUMENTATION, API_SCHEMA_VERSION, DEFAULT_API_BUSINESS_CODES} from "../api-manifest-evidence.js";

const populationWriteSet = [
  "pack.cells.pop",
  "grid.cells.pop",
  "pack.burgs",
  "settlements.cities",
  "pack.states",
  "pack.provinces",
  "politics.states",
  "politics.provinces",
  "pack.cultures",
  "pack.religions",
  "society.cultures",
  "society.religions",
  "settlements.populationPoints",
  "settlements.metadata",
  "pack.markets",
  "economy.markets",
  "economy.metadata",
  "metadata.derivedStale",
  "military.metadata.stale",
  "diplomacy.metadata.stale",
  "zones.metadata.stale"
] as const;

export const populationManifest = {
  id: "population",
  version: 1,
  status: "shadow",
  canonicalSections: ["grid", "pack", "settlements", "politics", "society", "economy", "metadata", "military", "diplomacy", "zones"],
  derivedSystems: [{id: "population.downstream", reads: ["grid.cells.pop", "pack.cells.pop", "settlements.cities"], writes: ["metadata.derivedStale", "economy.metadata", "military.metadata.stale", "diplomacy.metadata.stale", "zones.metadata.stale"], invalidatedBy: ["grid.cells.pop", "pack.cells.pop", "settlements.cities"], invalidates: ["population-stats", "point-layers", "labels", "economy-demand", "object-index"], scope: "full-map", rebuild: "worker", reuseAcrossPresentation: true, verify: "verifyPopulationDownstream"}],
  commands: [
    {id: "population.applyAdjustment", writeSet: [...populationWriteSet], undoPolicy: "required", profiles: ["interactive", "headless"]},
    {id: "population.transfer", writeSet: [...populationWriteSet], undoPolicy: "required", profiles: ["interactive"]}
  ],
  workerTasks: [{id: "population.compute", resultKinds: ["population", "population-history"], writeSet: [...populationWriteSet], bindingPolicy: "pre-commit", patchPolicy: "domain-policy-required"}],
  queries: [
    {id: "population.inspectAdjustment", reads: ["grid.cells.pop", "pack.cells.pop", "settlements.cities"], profiles: ["interactive", "headless"]},
    {id: "population.inspectTransfer", reads: ["grid.cells.pop", "pack.cells.pop", "settlements.cities"], profiles: ["interactive"]}
  ],
  views: [{id: "population.density", reads: ["grid.cells.pop", "pack.cells.pop"], presentationOnly: true}],
  panels: [{id: "population.panel", commands: ["population.applyAdjustment", "population.transfer"], queries: ["population.inspectAdjustment", "population.inspectTransfer"], selectionKind: "population-target"}],
  persistence: {schemaVersion: 2, migration: "map-document-v1-v2", backfill: "population-columns-default", oldSample: "tools/fixtures/webgl-map-v1-minimal.json"},
  api: {methods: [
    {id: "edit.population.inspectAdjustment", method: "edit.population.inspectAdjustment", target: "population.inspectAdjustment", schemaVersion: API_SCHEMA_VERSION, capability: "query", capabilityGroup: "map.edit", mutates: "none", undoable: false, requiresConfirm: false, errorCodes: DEFAULT_API_BUSINESS_CODES, documentation: API_DOCUMENTATION},
    {id: "edit.population.applyAdjustment", method: "edit.population.applyAdjustment", target: "population.applyAdjustment", schemaVersion: API_SCHEMA_VERSION, capability: "command", capabilityGroup: "map.edit", mutates: "population-and-economy-demand", undoable: true, requiresConfirm: false, errorCodes: DEFAULT_API_BUSINESS_CODES, documentation: API_DOCUMENTATION},
    {id: "edit.population.inspectTransfer", method: "edit.population.inspectTransfer", target: "population.inspectTransfer", schemaVersion: API_SCHEMA_VERSION, capability: "query", capabilityGroup: "map.edit", mutates: "none", undoable: false, requiresConfirm: false, errorCodes: DEFAULT_API_BUSINESS_CODES, documentation: API_DOCUMENTATION},
    {id: "edit.population.transfer", method: "edit.population.transfer", target: "population.transfer", schemaVersion: API_SCHEMA_VERSION, capability: "command", capabilityGroup: "map.edit", mutates: "population-and-economy-demand", undoable: true, requiresConfirm: true, errorCodes: DEFAULT_API_BUSINESS_CODES, documentation: API_DOCUMENTATION}
  ]},
  regression: {gates: ["regress:population-adjustment", "regress:population-transfer", "regress:api-data-compatibility"], coverage: ["save", "undo", "worker", "view", "failure"]},
  capabilities: {worker: "required", regeneration: "unsupported", view: "required", renderLayer: "not-required"},
  capabilityReasons: {
    regeneration: "人口调整是显式增减和转移，不是从上游重生成",
    renderLayer: "人口使用共享 cell surface 颜色视图，不拥有独立几何图层"
  }
} as const satisfies DomainModuleManifest;
