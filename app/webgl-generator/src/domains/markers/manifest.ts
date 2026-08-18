import type {DomainModuleManifest} from "../../core/contracts/domain-module.js";
import {API_DOCUMENTATION, API_SCHEMA_VERSION, DEFAULT_API_BUSINESS_CODES} from "../api-manifest-evidence.js";

const markerCommands = ["markers.add", "markers.delete", "markers.move", "markers.setNote", "markers.setVisual"] as const;

export const markersManifest = {
  id: "markers",
  version: 1,
  status: "shadow",
  canonicalSections: ["markers", "notes", "pack", "economy"],
  derivedSystems: [
    {id: "markers.point-layer", reads: ["markers"], writes: [], invalidates: ["point-layers", "picking"]},
    {id: "markers.resource-economy", reads: ["markers", "pack", "economy"], writes: ["pack", "economy"], invalidates: ["economy-demand", "object-index"]}
  ],
  commands: markerCommands.map(id => ({id, writeSet: id === "markers.setNote" ? ["notes"] : id === "markers.setVisual" ? ["markers"] : id === "markers.delete" ? ["markers", "notes", "pack", "economy"] : ["markers", "pack", "economy"], undoPolicy: "required", profiles: ["interactive"]})),
  regeneration: {id: "markers.regenerateResources", writeSet: ["markers", "pack", "economy"], sourceRevision: "required", binding: "required", lockPolicy: "regeneration-lock-protection", replacementPolicy: "mixed"},
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
  regression: {gates: ["regress:auxiliary-object-creation", "regress:object-details-edit", "regress:api-data-compatibility"], coverage: ["save", "undo", "regeneration", "view", "layer", "failure"]},
  capabilities: {worker: "not-required", regeneration: "optional", view: "optional", renderLayer: "required"},
  capabilityReasons: {worker: "marker CRUD 当前由同步 command 提交；资源重生成继续沿用既有外层 Worker 编排"}
} as const satisfies DomainModuleManifest;
