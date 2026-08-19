import type {DomainModuleManifest} from "../../core/contracts/domain-module.js";

const VERIFY = "regress:settlements-zones-annotations-core-protocol";
const commands = ["setStyle", "resetStyle", "resetStyles", "setLayout", "setPositionLock", "addCustom", "delete", "moveCustom", "renameCustom", "setNote", "restore"] as const;

export const labelsManifest = {
  id: "labels",
  version: 1,
  status: "shadow",
  canonicalSections: ["labels", "notes", "settlements", "politics", "zones", "pack"],
  derivedSystems: [{id: "labels.layout-projection", reads: ["labels", "settlements", "politics", "zones", "pack.cells.i"], writes: [], invalidatedBy: ["labels", "settlements", "politics", "zones", "pack.cells.i"], invalidates: ["labels", "picking", "object-panels"], scope: "full-map", rebuild: "worker", reuseAcrossPresentation: true, verify: VERIFY}],
  commands: commands.map(id => ({id: `labels.${id}`, writeSet: id === "setNote" ? ["notes"] : ["labels"], undoPolicy: "required" as const, profiles: ["interactive" as const]})),
  queries: [
    {id: "labels.styles", reads: ["labels.styles"], profiles: ["interactive", "headless"]},
    {id: "labels.list", reads: ["labels", "settlements", "politics", "zones"], profiles: ["interactive", "headless"]}
  ],
  views: [{id: "labels.visibility", reads: ["labels"], presentationOnly: true}],
  layers: [{id: "labels.text-layer", reads: ["labels", "settlements", "politics", "zones", "pack.cells.i"], geometrySource: "derived", picking: true, export: true}],
  persistence: {schemaVersion: 2, migration: "map-document-v1-v2", backfill: "labels-v2-default", oldSample: "tools/fixtures/webgl-map-v1-minimal.json"},
  regression: {gates: [VERIFY, "regress:label-styles", "regress:label-layout", "regress:political-label-collision", "regress:city-label-icon-clearance", "regress:state-label-territory"], coverage: ["save", "undo", "view", "layer", "failure"]},
  capabilities: {worker: "not-required", regeneration: "unsupported", view: "required", renderLayer: "required"},
  capabilityReasons: {worker: "标签编辑为同步 command；几何投影复用统一 render preparation。", regeneration: "标签由上游对象与用户覆盖共同派生，没有独立全图重生成入口。"}
} as const satisfies DomainModuleManifest;
