import type {DomainModuleManifest} from "../../core/contracts/domain-module.js";

export const FOUNDATION_DOCUMENT_WRITE_SET = Object.freeze([
  "metadata", "options", "layers", "heightmap", "grid", "climate", "oceanCurrents", "mapCoordinates",
  "society", "politics", "settlements", "economy", "diplomacy", "military", "markers", "zones", "pack",
  "features", "rivers", "regenerationLocks", "namebases", "summary", "generationLog", "status", "notes",
  "measurements", "labels", "visualTheme", "display"
] as const);

const FOUNDATION_VERIFY = "regress:foundation-core-protocol";

export const foundationManifest = {
  id: "foundation",
  version: 1,
  status: "shadow",
  canonicalSections: FOUNDATION_DOCUMENT_WRITE_SET,
  derivedSystems: [
    {
      id: "foundation.height-topology",
      reads: ["heightmap", "grid", "features", "rivers", "pack.cells.h", "pack.cells.f", "pack.cells.v", "pack.cells.c", "pack.features"],
      writes: [],
      invalidatedBy: ["heightmap", "grid", "features", "rivers", "pack.cells.h", "pack.cells.f", "pack.cells.v", "pack.cells.c", "pack.features"],
      invalidates: ["terrain-caches", "height-field", "render-mesh", "picking"],
      scope: "full-map",
      rebuild: "worker",
      reuseAcrossPresentation: true,
      verify: FOUNDATION_VERIFY
    },
    {
      id: "foundation.climate",
      reads: ["options", "heightmap", "grid", "climate", "oceanCurrents", "mapCoordinates"],
      writes: [],
      invalidatedBy: ["options", "heightmap", "grid", "climate", "oceanCurrents", "mapCoordinates"],
      invalidates: ["cell-colors", "climate-statistics"],
      scope: "full-map",
      rebuild: "worker",
      reuseAcrossPresentation: true,
      verify: FOUNDATION_VERIFY
    },
    {
      id: "foundation.ocean-current-layer",
      reads: ["oceanCurrents", "grid", "mapCoordinates"],
      writes: [],
      invalidatedBy: ["oceanCurrents", "grid", "mapCoordinates"],
      invalidates: ["line-layers", "picking"],
      scope: "full-map",
      rebuild: "gpu-patch",
      reuseAcrossPresentation: true,
      verify: FOUNDATION_VERIFY
    }
  ],
  commands: [
    {id: "height.applyBrush", writeSet: ["grid", "pack", "metadata", "military", "zones", "markers", "economy", "diplomacy"], undoPolicy: "required", profiles: ["interactive"]},
    {id: "ocean.rename", writeSet: ["oceanCurrents"], undoPolicy: "required", profiles: ["interactive"]},
    {id: "ocean.regenerate", writeSet: ["oceanCurrents"], undoPolicy: "required", profiles: ["interactive"]},
    {id: "grid.refine", writeSet: FOUNDATION_DOCUMENT_WRITE_SET, undoPolicy: "required", profiles: ["interactive", "headless"]},
    {id: "grid.applyWrite", writeSet: FOUNDATION_DOCUMENT_WRITE_SET, undoPolicy: "required", profiles: ["interactive", "headless"]}
  ],
  workerTasks: [
    {id: "height-derived.compute", resultKinds: ["height-derived"], writeSet: FOUNDATION_DOCUMENT_WRITE_SET, bindingPolicy: "pre-commit", patchPolicy: "domain-policy-required"},
    {id: "climate-downstream.compute", resultKinds: ["climate-downstream"], writeSet: FOUNDATION_DOCUMENT_WRITE_SET, bindingPolicy: "pre-commit", patchPolicy: "domain-policy-required"},
    {id: "ocean-current-world.compute", resultKinds: ["ocean-current-world"], writeSet: FOUNDATION_DOCUMENT_WRITE_SET, bindingPolicy: "pre-commit", patchPolicy: "replace-only"},
    {id: "grid-topology.prepare", resultKinds: ["grid-topology-worker-result"], writeSet: FOUNDATION_DOCUMENT_WRITE_SET, bindingPolicy: "pre-commit", patchPolicy: "replace-only"}
  ],
  queries: [
    {id: "foundation.height", reads: ["heightmap", "grid", "pack"], profiles: ["interactive", "headless"]},
    {id: "foundation.climate", reads: ["climate", "mapCoordinates", "options"], profiles: ["interactive", "headless"]},
    {id: "foundation.oceanCurrents", reads: ["oceanCurrents", "grid", "mapCoordinates"], profiles: ["interactive", "headless"]}
  ],
  views: [
    {id: "foundation.height-view", reads: ["heightmap", "grid", "pack"], presentationOnly: true},
    {id: "foundation.temperature-view", reads: ["climate", "grid", "pack"], presentationOnly: true},
    {id: "foundation.precipitation-view", reads: ["climate", "grid", "pack"], presentationOnly: true},
    {id: "foundation.ocean-current-view", reads: ["oceanCurrents", "grid"], presentationOnly: true}
  ],
  layers: [
    {id: "foundation.surface-layer", reads: ["heightmap", "grid", "features", "pack"], geometrySource: "derived", picking: true, export: true},
    {id: "foundation.climate-color-layer", reads: ["climate", "grid", "pack"], geometrySource: "derived", picking: false, export: true},
    {id: "foundation.ocean-current-layer", reads: ["oceanCurrents", "grid", "mapCoordinates"], geometrySource: "derived", picking: true, export: true}
  ],
  persistence: {schemaVersion: 2, migration: "map-document-v1-v2", backfill: "foundation-map-normalization", oldSample: "tools/fixtures/webgl-map-v1-minimal.json"},
  locks: {kinds: ["feature", "river", "ocean-current"], policy: "regeneration-lock-protection"},
  regression: {
    gates: [FOUNDATION_VERIFY, "regress:height-derived-rebuild", "regress:climate-downstream-rebuild", "regress:ocean-currents", "regress:grid-topology-refinement"],
    coverage: ["save", "undo", "worker", "view", "layer", "failure"]
  },
  capabilities: {worker: "required", regeneration: "unsupported", view: "required", renderLayer: "required"},
  capabilityReasons: {regeneration: "基础域没有单一重生成入口；四个既有 Worker task 分别处理高度派生、气候下游、洋流世界与网格拓扑。"}
} as const satisfies DomainModuleManifest;
