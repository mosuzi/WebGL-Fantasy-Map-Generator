import type {DomainModuleManifest} from "../../core/contracts/domain-module.js";
import {API_DOCUMENTATION, API_SCHEMA_VERSION, COLLECTION_IMPORT_API_BUSINESS_CODES, DEFAULT_API_BUSINESS_CODES} from "../api-manifest-evidence.js";

const noteCommands = ["notes.createStandalone", "notes.set", "notes.delete", "notes.import", "notes.deleteBatch"] as const;

export const notesManifest = {
  id: "notes",
  version: 1,
  status: "active",
  canonicalSections: ["notes"],
  derivedSystems: [{id: "notes.object-panels", reads: ["notes"], writes: [], invalidatedBy: ["notes"], invalidates: ["object-panels"], scope: "affected-objects", rebuild: "main-thread", reuseAcrossPresentation: true, verify: "verifyNotesObjectPanels"}],
  commands: noteCommands.map(id => ({id, writeSet: ["notes"], undoPolicy: "required", profiles: ["interactive"]})),
  queries: [
    {id: "notes.list", reads: ["notes"], profiles: ["interactive"]},
    {id: "notes.get", reads: ["notes"], profiles: ["interactive"]}
  ],
  panels: [{id: "notes.panel", commands: [...noteCommands], queries: ["notes.list", "notes.get"], selectionKind: "note"}],
  persistence: {schemaVersion: 2, migration: "map-document-v1-v2", backfill: "notes-v2-default", oldSample: "tools/fixtures/webgl-map-v1-minimal.json"},
  api: {methods: noteCommands.map(id => ({
    id: `edit.${id}`,
    method: `edit.${id}`,
    target: id,
    schemaVersion: API_SCHEMA_VERSION,
    capability: "command",
    capabilityGroup: "map.edit",
    mutates: "notes",
    undoable: true,
    requiresConfirm: id === "notes.deleteBatch",
    errorCodes: id === "notes.import" ? COLLECTION_IMPORT_API_BUSINESS_CODES : DEFAULT_API_BUSINESS_CODES,
    documentation: API_DOCUMENTATION
  }))},
  regression: {gates: ["regress:notes-core", "regress:object-creation", "regress:object-details-edit", "regress:api-data-compatibility"], coverage: ["save", "undo", "failure"]},
  capabilities: {worker: "not-required", regeneration: "unsupported", view: "not-required", renderLayer: "not-required"},
  capabilityReasons: {
    worker: "备注为小型同步文档，不需要业务 Worker",
    regeneration: "备注没有从上游重生成语义",
    view: "备注通过对象和面板查询，不定义地图颜色视图",
    renderLayer: "独立备注在 349-6 不拥有几何或 picking 图层"
  }
} as const satisfies DomainModuleManifest;
