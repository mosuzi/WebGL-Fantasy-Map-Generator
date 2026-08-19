import type {DomainModuleManifest} from "../../core/contracts/domain-module.js";

const VERIFY = "regress:settlements-zones-annotations-core-protocol";
const commands = ["save", "rename", "updatePoints", "delete", "import"] as const;

export const measurementsManifest = {
  id: "measurements",
  version: 1,
  status: "shadow",
  canonicalSections: ["measurements", "pack", "settlements"],
  derivedSystems: [{id: "measurements.overlay-projection", reads: ["measurements", "pack.routes", "settlements.routes"], writes: [], invalidatedBy: ["measurements", "pack.routes", "settlements.routes"], invalidates: ["measurement-overlay"], scope: "full-map", rebuild: "main-thread", reuseAcrossPresentation: true, verify: VERIFY}],
  commands: commands.map(id => ({id: `measurements.${id}`, writeSet: ["measurements"], undoPolicy: "required" as const, profiles: ["interactive" as const]})),
  queries: [{id: "measurements.list", reads: ["measurements"], profiles: ["interactive", "headless"]}],
  views: [{id: "measurements.visibility", reads: ["measurements"], presentationOnly: true}],
  layers: [{id: "measurements.overlay-layer", reads: ["measurements", "pack.routes", "settlements.routes"], geometrySource: "canonical", picking: true, export: true}],
  persistence: {schemaVersion: 2, migration: "map-document-v1-v2", backfill: "measurements-v2-default", oldSample: "tools/fixtures/webgl-map-v1-minimal.json"},
  regression: {gates: [VERIFY, "regress:measurement-curve", "regress:measurement-highlight"], coverage: ["save", "undo", "view", "layer", "failure"]},
  capabilities: {worker: "not-required", regeneration: "unsupported", view: "required", renderLayer: "required"},
  capabilityReasons: {worker: "测量对象为小型同步文档和 HTML/SVG overlay。", regeneration: "测量对象是用户文档，不从地图上游重生成。"}
} as const satisfies DomainModuleManifest;
