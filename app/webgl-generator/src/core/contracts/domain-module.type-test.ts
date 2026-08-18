import type {DomainModuleManifest} from "./domain-module.js";

const valid = {
  id: "type-test",
  version: 1,
  status: "shadow",
  canonicalSections: ["notes"],
  derivedSystems: [],
  commands: [],
  persistence: {schemaVersion: 2, migration: "v1-v2", backfill: "notes", oldSample: "fixture"},
  regression: {gates: ["regress:type-test"], coverage: ["save", "failure"]},
  capabilities: {worker: "not-required", regeneration: "unsupported", view: "not-required", renderLayer: "not-required"},
  capabilityReasons: {worker: "同步领域", regeneration: "没有重生成", view: "没有视图", renderLayer: "没有图层"}
} as const satisfies DomainModuleManifest;

void valid;

// @ts-expect-error persistence 是所有领域的必填接入面
const missingPersistence: DomainModuleManifest = {
  id: "invalid",
  version: 1,
  status: "shadow",
  canonicalSections: ["notes"],
  derivedSystems: [],
  commands: [],
  regression: {gates: ["regress:type-test"], coverage: ["save", "failure"]},
  capabilities: {worker: "not-required", regeneration: "unsupported", view: "not-required", renderLayer: "not-required"},
  capabilityReasons: {}
};

void missingPersistence;
