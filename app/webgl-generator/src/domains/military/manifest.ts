import type {DomainModuleManifest} from "../../core/contracts/domain-module.js";

export const MILITARY_REGENERATION_WORKER_WRITE_SET = Object.freeze([
  "military", "pack.military", "pack.states", "politics.states", "military.metadata.stale", "zones.metadata.stale",
  "markers.metadata.stale", "economy.metadata.stale", "diplomacy.metadata.stale", "metadata.regeneration.military", "metadata.derivedStale", "generationLog"
] as const);

export const MILITARY_POLICY_WORKER_WRITE_SET = Object.freeze(["military", "pack.military", "pack.states", "politics.states"] as const);

const VERIFY = "regress:economy-diplomacy-military-core-protocol";
const commands = ["setRatios", "setStatus", "setStatusBatch", "moveStation", "setBase", "resolveBattle", "recordBattleEvent", "importBattleEvents", "clearBattleEvents", "rename"] as const;

export const militaryManifest = {
  id: "military",
  version: 1,
  status: "shadow",
  canonicalSections: ["military", "politics", "pack", "zones", "markers", "economy", "diplomacy", "metadata", "generationLog"],
  derivedSystems: [{id: "military.force-projection", reads: ["military", "pack.military", "politics.states", "pack.states"], writes: [], invalidatedBy: ["military", "pack.military", "politics.states", "pack.states"], invalidates: ["point-layers", "line-layers", "labels", "picking", "object-panels", "object-index"], scope: "full-map", rebuild: "worker", reuseAcrossPresentation: true, verify: VERIFY}],
  commands: commands.map(id => ({id: `military.${id}`, writeSet: ["military", "pack.military", "politics.states", "pack.states"], undoPolicy: "required" as const, profiles: ["interactive" as const]})),
  regeneration: {id: "military.regenerate", writeSet: MILITARY_REGENERATION_WORKER_WRITE_SET, sourceRevision: "required", binding: "required", lockPolicy: "regeneration-lock-protection", replacementPolicy: "from-empty"},
  workerTasks: [
    {id: "military.regeneration-worker", task: "regeneration.compute", resultKinds: ["military"], writeSet: MILITARY_REGENERATION_WORKER_WRITE_SET, bindingPolicy: "pre-commit", patchPolicy: "domain-policy-required"},
    {id: "military.policy-worker", task: "military-policy.compute", resultKinds: ["military-policy"], writeSet: MILITARY_POLICY_WORKER_WRITE_SET, bindingPolicy: "pre-commit", patchPolicy: "domain-policy-required"}
  ],
  queries: [{id: "military.inspect", reads: ["military", "politics.states", "pack.states"], profiles: ["interactive", "headless"]}],
  views: [{id: "military.visibility", reads: ["military", "politics.states", "pack.states"], presentationOnly: true}],
  layers: [
    {id: "military.point-layer", reads: ["military", "politics.states", "pack.states"], geometrySource: "canonical", picking: true, export: true},
    {id: "military.front-layer", reads: ["military.fronts", "pack.military"], geometrySource: "canonical", picking: true, export: true}
  ],
  panels: [{id: "military.panel", commands: commands.map(id => `military.${id}`), queries: ["military.inspect"], selectionKind: "military"}],
  persistence: {schemaVersion: 2, migration: "map-document-v1-v2", backfill: "military-state-pack-mirror", oldSample: "tools/fixtures/webgl-map-v1-minimal.json"},
  locks: {kinds: ["military", "state", "diplomacy-relation", "zone"], policy: "regeneration-lock-protection"},
  regression: {gates: [VERIFY, "regress:military-policy-worker-task", "regress:military-regeneration", "regress:military-front-battle-point", "regress:regeneration-lock-military", "regress:warzone-consistency"], coverage: ["save", "undo", "worker", "regeneration", "view", "layer", "failure"]},
  capabilities: {worker: "required", regeneration: "required", view: "required", renderLayer: "required"},
  capabilityReasons: {}
} as const satisfies DomainModuleManifest;
