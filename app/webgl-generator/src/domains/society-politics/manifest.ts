import type {DomainModuleManifest} from "../../core/contracts/domain-module.js";
import {API_DOCUMENTATION, API_SCHEMA_VERSION, DEFAULT_API_BUSINESS_CODES} from "../api-manifest-evidence.js";

export const SOCIETY_POLITICS_WRITE_SETS = Object.freeze({
  religions: Object.freeze([
    "society.religions", "society.metadata", "grid.cells.religion", "pack.religions", "pack.cells.religion", "pack.burgs",
    "settlements", "politics", "pack.states", "pack.provinces", "military.metadata.stale", "zones.metadata.stale",
    "markers.metadata.stale", "economy.metadata.stale", "diplomacy.metadata.stale", "metadata.regeneration.religions",
    "metadata.derivedStale", "generationLog"
  ]),
  states: Object.freeze([
    "politics", "settlements", "grid.cells.burg", "grid.cells.state", "grid.cells.province", "pack.states", "pack.provinces",
    "pack.burgs", "pack.routes", "pack.cells.state", "pack.cells.province", "pack.cells.burg", "pack.cells.routes",
    "military.metadata.stale", "zones.metadata.stale", "markers.metadata.stale", "economy.metadata.stale", "diplomacy.metadata.stale",
    "metadata.regeneration.states", "metadata.derivedStale", "generationLog"
  ]),
  provinces: Object.freeze([
    "politics", "settlements", "grid.cells.burg", "grid.cells.province", "pack.states", "pack.provinces", "pack.burgs",
    "pack.routes", "pack.cells.state", "pack.cells.province", "pack.cells.burg", "pack.cells.routes", "military.metadata.stale",
    "zones.metadata.stale", "markers.metadata.stale", "economy.metadata.stale", "diplomacy.metadata.stale",
    "metadata.regeneration.provinces", "metadata.derivedStale", "generationLog"
  ])
} as const);

export const SOCIETY_POLITICS_WORKER_WRITE_SET = Object.freeze([
  ...new Set(Object.values(SOCIETY_POLITICS_WRITE_SETS).flat())
]);

export const SOCIAL_EXPANSION_WORKER_WRITE_SET = Object.freeze([
  "grid.cells.culture", "grid.cells.religion", "pack.cells.culture", "pack.cells.religion",
  "society.cultures", "society.religions", "pack.cultures", "pack.religions", "society.metadata",
  "settlements.cities", "pack.burgs", "politics.states", "pack.states", "politics.provinces", "pack.provinces",
  "metadata.derivedStale", "markers.metadata.stale", "zones.metadata.stale", "military.metadata.stale",
  "economy.metadata.stale", "diplomacy.metadata.stale"
] as const);

const VERIFY = "regress:society-politics-core-protocol";
const SOCIAL_EXPANSION_API_BUSINESS_CODES = Object.freeze([
  "ok", "culture-store-missing", "religion-store-missing", "invalid-culture", "invalid-religion",
  "culture-not-found", "religion-not-found", "invalid-operation", "empty-assignment", "invalid-assignment",
  "invalid-grid-cell", "water-grid-cell", "assignment-unchanged", "expansion-invalid", "expansion-unchanged",
  "invalid-parent", "parent-unchanged", "parent-cycle-or-missing", "delete-not-found", "invalid-mode",
  "missing-object", "invalid-center", "invalid-type", "invalid-expansion", "invalid-expansionism",
  "center-out-of-range", "center-water", "center-not-owned", "center-collision", "regeneration_locked_noop",
  "inspection-required", "inspection-stale", "inspection-token-invalid", "inspection-action-mismatch",
  "inspection-input-mismatch", "inspection-schema-mismatch", "confirmation_required", "invalid-argument", "invalid_argument"
] as const);

export const societyPoliticsManifest = {
  id: "society-politics",
  version: 1,
  status: "shadow",
  canonicalSections: [
    "society", "politics", "settlements", "grid", "pack", "metadata", "military", "zones", "markers", "economy",
    "diplomacy", "generationLog", "regenerationLocks"
  ],
  derivedSystems: [
    {
      id: "society-politics.social-assignment",
      reads: ["society", "pack.cultures", "pack.religions", "pack.cells.culture", "pack.cells.religion", "settlements.cities"],
      writes: [],
      invalidatedBy: ["society", "pack.cultures", "pack.religions", "pack.cells.culture", "pack.cells.religion", "settlements.cities"],
      invalidates: ["cell-colors", "labels", "object-index"],
      scope: "full-map",
      rebuild: "worker",
      reuseAcrossPresentation: true,
      verify: VERIFY
    },
    {
      id: "society-politics.administrative-mirror",
      reads: ["politics", "pack.states", "pack.provinces", "pack.cells.state", "pack.cells.province", "settlements.cities", "pack.burgs"],
      writes: [],
      invalidatedBy: ["politics", "pack.states", "pack.provinces", "pack.cells.state", "pack.cells.province", "settlements.cities", "pack.burgs"],
      invalidates: ["cell-colors", "political-boundaries", "labels", "object-index", "picking"],
      scope: "full-map",
      rebuild: "worker",
      reuseAcrossPresentation: true,
      verify: VERIFY
    }
  ],
  commands: [
    {
      id: "society-politics.reassess-provincial-capitals",
      writeSet: ["politics.provinces", "pack.provinces", "settlements.cities", "pack.burgs", "settlements.routes", "pack.routes", "metadata.derivedStale"],
      undoPolicy: "required",
      profiles: ["interactive"]
    },
    {id: "society-politics.applyCultureExpansion", writeSet: SOCIAL_EXPANSION_WORKER_WRITE_SET, undoPolicy: "required", profiles: ["interactive"]},
    {id: "society-politics.applyReligionExpansion", writeSet: SOCIAL_EXPANSION_WORKER_WRITE_SET, undoPolicy: "required", profiles: ["interactive"]}
  ],
  regeneration: {
    id: "society-politics.regenerate",
    writeSet: SOCIETY_POLITICS_WORKER_WRITE_SET,
    sourceRevision: "required",
    binding: "required",
    lockPolicy: "regeneration-lock-protection",
    replacementPolicy: "mixed"
  },
  workerTasks: [
    {
      id: "society-politics.regeneration-worker",
      task: "regeneration.compute",
      resultKinds: ["religions", "states", "provinces"],
      writeSet: SOCIETY_POLITICS_WORKER_WRITE_SET,
      bindingPolicy: "pre-commit",
      patchPolicy: "domain-policy-required"
    },
    {
      id: "society-politics.social-expansion-worker",
      task: "social-expansion.compute",
      resultKinds: ["social-expansion", "social-expansion-history"],
      writeSet: SOCIAL_EXPANSION_WORKER_WRITE_SET,
      bindingPolicy: "pre-commit",
      patchPolicy: "domain-policy-required"
    }
  ],
  queries: [
    {id: "society-politics.social-assignment", reads: ["society", "pack.cultures", "pack.religions", "pack.cells.culture", "pack.cells.religion"], profiles: ["interactive", "headless"]},
    {id: "society-politics.administrative-mirror", reads: ["politics", "pack.states", "pack.provinces", "settlements.cities", "pack.burgs"], profiles: ["interactive", "headless"]},
    {id: "society-politics.inspectCultureExpansion", reads: ["society.cultures", "pack.cultures", "pack.cells.culture", "grid.cells.culture", "regenerationLocks"], profiles: ["interactive"]},
    {id: "society-politics.inspectReligionExpansion", reads: ["society.religions", "pack.religions", "pack.cells.religion", "grid.cells.religion", "regenerationLocks"], profiles: ["interactive"]}
  ],
  views: [
    {id: "society-politics.culture-view", reads: ["society.cultures", "pack.cells.culture"], presentationOnly: true},
    {id: "society-politics.religion-view", reads: ["society.religions", "pack.cells.religion"], presentationOnly: true},
    {id: "society-politics.state-view", reads: ["politics.states", "pack.cells.state"], presentationOnly: true},
    {id: "society-politics.province-view", reads: ["politics.provinces", "pack.cells.province"], presentationOnly: true}
  ],
  persistence: {schemaVersion: 2, migration: "map-document-v1-v2", backfill: "society-politics-pack-mirror", oldSample: "tools/fixtures/webgl-map-v1-minimal.json"},
  api: {methods: [
    {id: "edit.cultures.inspectExpansion", method: "edit.cultures.inspectExpansion", target: "society-politics.inspectCultureExpansion", schemaVersion: API_SCHEMA_VERSION, capability: "query", capabilityGroup: "map.edit", mutates: "none", undoable: false, requiresConfirm: false, errorCodes: DEFAULT_API_BUSINESS_CODES, documentation: API_DOCUMENTATION},
    {id: "edit.cultures.applyExpansion", method: "edit.cultures.applyExpansion", target: "society-politics.applyCultureExpansion", schemaVersion: API_SCHEMA_VERSION, capability: "command", capabilityGroup: "map.edit", mutates: "cultures-and-derived-stale", undoable: true, requiresConfirm: false, errorCodes: SOCIAL_EXPANSION_API_BUSINESS_CODES, documentation: API_DOCUMENTATION},
    {id: "edit.religions.inspectExpansion", method: "edit.religions.inspectExpansion", target: "society-politics.inspectReligionExpansion", schemaVersion: API_SCHEMA_VERSION, capability: "query", capabilityGroup: "map.edit", mutates: "none", undoable: false, requiresConfirm: false, errorCodes: DEFAULT_API_BUSINESS_CODES, documentation: API_DOCUMENTATION},
    {id: "edit.religions.applyExpansion", method: "edit.religions.applyExpansion", target: "society-politics.applyReligionExpansion", schemaVersion: API_SCHEMA_VERSION, capability: "command", capabilityGroup: "map.edit", mutates: "religions-and-derived-stale", undoable: true, requiresConfirm: false, errorCodes: SOCIAL_EXPANSION_API_BUSINESS_CODES, documentation: API_DOCUMENTATION}
  ]},
  locks: {kinds: ["culture", "religion", "state", "province", "city", "route"], policy: "regeneration-lock-protection"},
  regression: {
    gates: [VERIFY, "regress:social-expansion-worker-task", "regress:social-expansion-ui-api", "regress:regeneration-lock-society", "regress:provincial-capitals", "regress:regeneration-preflight", "regress:ocean-current-world"],
    coverage: ["save", "undo", "worker", "regeneration", "view", "failure"]
  },
  capabilities: {worker: "required", regeneration: "required", view: "required", renderLayer: "not-required"},
  capabilityReasons: {renderLayer: "社会与行政视图复用共享 cell surface、政治边界和标签投影，不拥有独立几何 layer。"}
} as const satisfies DomainModuleManifest;
