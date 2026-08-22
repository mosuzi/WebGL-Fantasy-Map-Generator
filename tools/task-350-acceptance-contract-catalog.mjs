import assert from "node:assert/strict";
import {existsSync, readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {findBrowserLaunchers, PACKAGE_BROWSER_FORBIDDEN} from "./tool-source-browser-launch-audit.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const PLAN_PATH = "docs/plans/task-350-engine-integration-rebaseline.md";
const LEGACY_EVIDENCE_PATH = "docs/task-notes/task-350-map-core-engine-cdp-acceptance.md";

const scenarios = [
  ["S-01", "冷启动 generation", "R2a"],
  ["S-02", "import / restore / headless adoption", "R2a/R5a"],
  ["S-03", "单领域 command", "R2a/R2b"],
  ["S-04", "单领域 regeneration", "R2a/R2b"],
  ["S-05", "正式十一领域连续依赖链", "R2a/R2b"],
  ["S-06", "history roundtrip", "R2a/R2b"],
  ["S-07", "no-op / locked operation", "R3a/R3b"],
  ["S-08", "fault / cancel / obsolete", "R2a/R3a/R5b"],
  ["S-09", "concurrency / map replace", "R3a/R5b"],
  ["S-10", "100k 分包与性能", "R2b/R3a/R3b"],
  ["S-11", "topology commit", "R3b/R4a"],
  ["S-12", "presentation-only", "R4a"],
  ["S-13", "picking / overlay", "R2b/R3b/R4a"],
  ["S-14", "visual / archive export", "R4b/R5a"],
  ["S-15", "persistence fallback", "R5a"],
  ["S-16", "Loading / feedback", "R5b"],
  ["S-17", "WebGL context restore", "R3b/R4b"]
].map(([id, title, ownerStage]) => ({id, title, ownerStage}));

const scenarioOwnerStages = new Map([
  ["S-01", "R2a"],
  ["S-02", "R2a/R5a"],
  ["S-03", "R2a/R2b"],
  ["S-04", "R2a/R2b"],
  ["S-05", "R2a/R2b"],
  ["S-06", "R2a/R2b"],
  ["S-07", "R3a/R3b"],
  ["S-08", "R2a/R3a/R5b"],
  ["S-09", "R3a/R5b"],
  ["S-10", "R2b/R3a/R3b"],
  ["S-11", "R3b/R4a"],
  ["S-12", "R4a"],
  ["S-13", "R2b/R3b/R4a"],
  ["S-14", "R4b/R5a"],
  ["S-15", "R5a"],
  ["S-16", "R5b"],
  ["S-17", "R3b/R4b"]
]);

const invariants = [
  ["I-01", "canonical owner 唯一"],
  ["I-02", "binding profile 明确"],
  ["I-03", "revision 单调且分域"],
  ["I-04", "commit 原子"],
  ["I-05", "写集真实"],
  ["I-06", "来源不可变"],
  ["I-07", "双镜像显式"],
  ["I-08", "derived 新鲜度由来源授权"],
  ["I-09", "prepared render 同源"],
  ["I-10", "history 精确"],
  ["I-11", "presentation 不改图"],
  ["I-12", "cache / resource owner 可恢复"],
  ["I-13", "持久化 canonical"],
  ["I-14", "异步竞态拒绝"],
  ["I-15", "性能证据分层"],
  ["I-16", "错误与证据完整"]
].map(([id, title]) => ({id, title}));

const common = Object.freeze({
  artifactPolicy: "full-compact-finally",
  errorPolicy: "no-unexplained-application-page-health-gl-loading",
  fixtureStatus: "frozen"
});

const fixedEntryDimensions = new Map([
  [1, ["R2a", "transaction-core", "10k"]],
  [2, ["R2a/R2b", "domain-regeneration-chain", "10k"]],
  [3, ["R2b", "population-domain", "10k"]],
  [4, ["R2b", "society-domain", "10k"]],
  [5, ["R2b", "economy-domain", "10k-100k"]],
  [6, ["R3a/R3b", "session-concurrency-10k", "10k"]],
  [7, ["R3a/R3b", "session-concurrency-100k", "100k"]],
  [8, ["R3b", "topology", "10k-100k"]],
  [9, ["R3b", "direct-lock", "10k"]],
  [10, ["R3b", "compound-lock", "10k-100k"]],
  [11, ["R4a", "picking", "10k"]],
  [12, ["R4a", "overlay", "fixture"]],
  [13, ["R4a", "viewport-preview", "fixture"]],
  [14, ["R4b", "heightmap-export", "10k"]],
  [15, ["R4b", "png-crop-export", "10k"]],
  [16, ["R5a", "storage-compatibility", "legacy-fixtures"]],
  [17, ["R5a", "storage-fallback", "legacy-fixtures"]],
  [18, ["R5a/R5b", "save-feedback", "10k"]],
  [19, ["R5b", "loading-state", "fixture"]],
  [20, ["R5b", "delayed-feedback", "fixture"]]
]);
const profileOwnerDimensions = new Map([
  ["generation", ["R2a", "whole-map-profile"]],
  ["persistence-import", ["R2a/R5a", "whole-map-profile"]],
  ["archive-export", ["R2a/R5a", "whole-map-profile"]],
  ["headless-write", ["R2a/R5a", "whole-map-profile"]]
]);

const allowedPolicies = Object.freeze({
  setupPolicy: new Set(["isolated-generated-map", "isolated-generated-map-explicit-view", "isolated-imported-fixture-explicit-view", "isolated-storage-fixtures", "isolated-imported-fixture"]),
  cleanupPolicy: new Set(["restore-map-history-preferences-and-close", "restore-map-and-close", "restore-storage-and-close", "restore-ui-and-close"]),
  artifactPolicy: new Set(["full-compact-finally"]),
  errorPolicy: new Set(["no-unexplained-application-page-health-gl-loading"]),
  performancePolicy: new Set(["transaction-10k-200ms", "worker-10k-200ms", "worker-100k-paired-and-200ms", "presentation-zero-product-work", "export-200ms", "persistence-200ms", "feedback-200ms"]),
  fixtureStatus: new Set(["frozen"])
});

const fixedEntries = [
  entry(1, "regress:map-transaction-browser", "tools/webgl-generator-map-transaction-browser-regression.mjs", "R2a", "transaction-core", "10k", ["S-01", "S-03", "S-04", "S-06", "S-08", "S-15", "S-16"], ["I-01", "I-02", "I-03", "I-04", "I-05", "I-06", "I-07", "I-09", "I-10", "I-13", "I-14", "I-15", "I-16"], ["regress:core-contracts", "regress:core-manifests", "regress:core-facade", "regress:foundation-core-protocol", "regress:worker-task", "regress:map-replica-command-patch", "regress:history-async-boundary", "regress:prepared-render-installer"], "accepted-baseline-recheck-required", "isolated-generated-map", "restore-map-history-preferences-and-close", "transaction-10k-200ms"),
  entry(2, "regress:worker-regeneration-browser", "tools/webgl-generator-worker-regeneration-browser-regression.mjs", "R2a/R2b", "domain-regeneration-chain", "10k", ["S-04", "S-05", "S-06", "S-07", "S-08"], ["I-02", "I-03", "I-04", "I-05", "I-06", "I-07", "I-08", "I-09", "I-10", "I-14", "I-15", "I-16"], ["regress:core-contracts", "regress:core-manifests", "regress:core-facade", "regress:core-dependencies", "regress:whole-map-domain-chain", "regress:worker-task", "regress:features-networks-resources-core-protocol", "regress:economy-diplomacy-military-core-protocol", "regress:history-async-boundary", "regress:prepared-render-installer"], "accepted-baseline-recheck-required", "isolated-generated-map", "restore-map-history-preferences-and-close", "worker-10k-200ms"),
  entry(3, "regress:population-worker-browser", "tools/webgl-generator-population-worker-browser-regression.mjs", "R2b", "population-domain", "10k", ["S-03", "S-06", "S-08", "S-10", "S-13"], ["I-02", "I-04", "I-05", "I-06", "I-08", "I-09", "I-10", "I-13", "I-15", "I-16"], ["regress:core-contracts", "regress:core-manifests", "regress:core-facade", "regress:core-dependencies", "regress:population-worker-task", "regress:population-core-protocol", "regress:whole-map-domain-chain", "regress:whole-map-profile-core-protocol", "regress:render-preparation", "regress:worker-task", "regress:history-async-boundary", "regress:prepared-render-installer"], "accepted-baseline-recheck-required", "isolated-generated-map", "restore-map-history-preferences-and-close", "worker-10k-200ms"),
  entry(4, "regress:social-expansion-worker-browser", "tools/webgl-generator-social-expansion-worker-browser-regression.mjs", "R2b", "society-domain", "10k", ["S-03", "S-05", "S-06", "S-08", "S-13"], ["I-02", "I-04", "I-05", "I-06", "I-07", "I-08", "I-09", "I-10", "I-15", "I-16"], ["regress:core-contracts", "regress:core-manifests", "regress:core-facade", "regress:core-dependencies", "regress:social-expansion-worker-task", "regress:social-expansion-ui-api", "regress:society-politics-core-protocol", "regress:whole-map-domain-chain", "regress:render-preparation", "regress:worker-task", "regress:history-async-boundary", "regress:prepared-render-installer"], "accepted-baseline-recheck-required", "isolated-generated-map", "restore-map-history-preferences-and-close", "worker-10k-200ms"),
  entry(5, "regress:economy-worker-browser", "tools/webgl-generator-economy-worker-browser-regression.mjs", "R2b", "economy-domain", "10k-100k", ["S-03", "S-05", "S-06", "S-08", "S-10", "S-13"], ["I-02", "I-04", "I-05", "I-06", "I-07", "I-08", "I-09", "I-10", "I-15", "I-16"], ["regress:core-contracts", "regress:core-manifests", "regress:core-facade", "regress:core-dependencies", "regress:economy-worker-task", "regress:economy-diplomacy-military-core-protocol", "regress:whole-map-domain-chain", "regress:render-preparation", "regress:history-async-boundary", "regress:prepared-render-installer"], "accepted-baseline-recheck-required", "isolated-generated-map", "restore-map-history-preferences-and-close", "worker-10k-200ms"),
  entry(6, "regress:worker-session-browser", "tools/webgl-generator-worker-session-browser-regression.mjs", "R3a/R3b", "session-concurrency-10k", "10k", ["S-01", "S-04", "S-05", "S-06", "S-07", "S-08", "S-09", "S-11", "S-12", "S-13"], ["I-01", "I-02", "I-03", "I-04", "I-05", "I-06", "I-08", "I-09", "I-10", "I-11", "I-12", "I-14", "I-15", "I-16"], ["regress:worker-session-contract", "regress:map-adoption-binding-owner", "regress:worker-task", "regress:map-replica-command-patch", "regress:worker-graph-stream", "regress:foundation-core-protocol"], "pending", "isolated-generated-map-explicit-view", "restore-map-history-preferences-and-close", "worker-10k-200ms"),
  entry(7, "regress:worker-session-100k-browser", "tools/webgl-generator-worker-session-browser-regression.mjs", "R3a/R3b", "session-concurrency-100k", "100k", ["S-05", "S-06", "S-07", "S-08", "S-09", "S-10", "S-11", "S-13"], ["I-01", "I-02", "I-03", "I-04", "I-05", "I-06", "I-08", "I-09", "I-10", "I-12", "I-14", "I-15", "I-16"], ["regress:worker-session-contract", "regress:map-adoption-binding-owner", "regress:worker-task", "regress:whole-map-profile-core-protocol", "regress:map-replica-command-patch", "regress:worker-graph-stream-100k"], "pending", "isolated-generated-map-explicit-view", "restore-map-history-preferences-and-close", "worker-100k-paired-and-200ms"),
  entry(8, "regress:grid-topology-browser", "tools/webgl-generator-grid-topology-browser-regression.mjs", "R3b", "topology", "10k-100k", ["S-06", "S-08", "S-10", "S-11"], ["I-01", "I-03", "I-04", "I-05", "I-09", "I-10", "I-12", "I-14", "I-15", "I-16"], ["regress:grid-topology-refinement", "regress:foundation-core-protocol"], "pending", "isolated-generated-map", "restore-map-history-preferences-and-close", "worker-100k-paired-and-200ms"),
  entry(9, "regress:regeneration-lock-direct-domains-browser", "tools/webgl-generator-regeneration-lock-direct-domains-browser-regression.mjs", "R3b", "direct-lock", "10k", ["S-04", "S-07", "S-08"], ["I-03", "I-04", "I-05", "I-06", "I-07", "I-08", "I-10", "I-14", "I-15", "I-16"], ["regress:regeneration-lock-feature", "regress:regeneration-lock-society", "regress:regeneration-lock-economy"], "pending", "isolated-generated-map", "restore-map-history-preferences-and-close", "worker-10k-200ms"),
  entry(10, "regress:regeneration-lock-compound-browser", "tools/webgl-generator-regeneration-lock-compound-browser-regression.mjs", "R3b", "compound-lock", "10k-100k", ["S-05", "S-07", "S-08", "S-11"], ["I-03", "I-04", "I-05", "I-06", "I-07", "I-08", "I-09", "I-10", "I-12", "I-14", "I-15", "I-16"], ["regress:regeneration-lock-height-state", "regress:regeneration-lock-river-generator", "regress:regeneration-lock-matrix"], "pending", "isolated-generated-map", "restore-map-history-preferences-and-close", "worker-100k-paired-and-200ms"),
  entry(11, "regress:city-picking-browser", "tools/webgl-generator-city-picking-browser-regression.mjs", "R4a", "picking", "10k", ["S-03", "S-12", "S-13"], ["I-03", "I-09", "I-10", "I-11", "I-12", "I-15", "I-16"], ["regress:presentation-contract", "regress:visual-theme-boundary", "regress:visual-theme-registry-boundary", "regress:gpu-display-mutation", "regress:render-cache-resource-binding", "regress:render-preparation", "regress:prepared-render-installer", "regress:markers-core", "regress:city-picking", "regress:river-picking", "regress:line-width-projection", "regress:hover-overlay-layer"], "pending", "isolated-generated-map-explicit-view", "restore-map-and-close", "presentation-zero-product-work"),
  entry(12, "regress:overlay-pan-stability-browser", "tools/webgl-generator-overlay-pan-stability-browser-regression.mjs", "R4a", "overlay", "fixture", ["S-12", "S-13"], ["I-03", "I-11", "I-12", "I-14", "I-15", "I-16"], ["regress:presentation-contract", "regress:worker-task", "regress:prepared-render-installer", "regress:render-cache-resource-binding", "regress:viewport-line-preview", "regress:hover-overlay-layer", "regress:panel-overlay-policy"], "pending", "isolated-imported-fixture-explicit-view", "restore-map-and-close", "presentation-zero-product-work"),
  entry(13, "regress:viewport-line-preview-browser", "tools/webgl-generator-viewport-line-preview-browser-regression.mjs", "R4a", "viewport-preview", "fixture", ["S-12", "S-13"], ["I-03", "I-11", "I-12", "I-14", "I-15", "I-16"], ["regress:presentation-contract", "regress:worker-task", "regress:render-cache-resource-binding", "regress:viewport-line-preview", "regress:line-width-projection"], "pending", "isolated-imported-fixture-explicit-view", "restore-map-and-close", "presentation-zero-product-work"),
  entry(14, "regress:heightmap-export-browser", "tools/webgl-generator-heightmap-export-browser-regression.mjs", "R4b", "heightmap-export", "10k", ["S-12", "S-14"], ["I-03", "I-06", "I-11", "I-13", "I-14", "I-15", "I-16"], ["regress:r4b-fixture-contract", "regress:r4b-artifact-helper", "regress:heightmap-export", "regress:png-options", "regress:presentation-contract"], "pending", "isolated-generated-map-explicit-view", "restore-map-and-close", "export-200ms"),
  entry(15, "regress:png-crop-browser", "tools/webgl-generator-png-crop-browser-regression.mjs", "R4b", "png-crop-export", "10k", ["S-12", "S-14"], ["I-03", "I-06", "I-11", "I-13", "I-14", "I-15", "I-16"], ["regress:r4b-fixture-contract", "regress:r4b-artifact-helper", "regress:png-options", "regress:exports", "regress:presentation-contract", "regress:render-cache-resource-binding"], "pending", "isolated-generated-map-explicit-view", "restore-map-and-close", "export-200ms"),
  entry(16, "regress:browser-storage-compatibility", "tools/webgl-generator-browser-storage-backward-compatibility-regression.mjs", "R5a", "storage-compatibility", "legacy-fixtures", ["S-02", "S-15"], ["I-01", "I-02", "I-03", "I-04", "I-06", "I-13", "I-14", "I-15", "I-16"], ["regress:api-data-compatibility", "regress:map-file-io-worker", "regress:persistence-boundary"], "pending", "isolated-storage-fixtures", "restore-storage-and-close", "persistence-200ms"),
  entry(17, "regress:browser-storage-fallback", "tools/webgl-generator-browser-storage-fallback-regression.mjs", "R5a", "storage-fallback", "legacy-fixtures", ["S-02", "S-08", "S-15"], ["I-01", "I-02", "I-03", "I-04", "I-06", "I-13", "I-14", "I-15", "I-16"], ["regress:api-data-compatibility", "regress:cloud-storage", "regress:persistence-boundary"], "pending", "isolated-storage-fixtures", "restore-storage-and-close", "persistence-200ms"),
  entry(18, "regress:browser-save-feedback", "tools/webgl-generator-browser-save-feedback-browser-regression.mjs", "R5a/R5b", "save-feedback", "10k", ["S-14", "S-15", "S-16"], ["I-03", "I-04", "I-06", "I-13", "I-14", "I-15", "I-16"], ["regress:map-save-naming", "regress:api-operation", "regress:map-storage-user-copy"], "pending", "isolated-generated-map", "restore-ui-and-close", "feedback-200ms"),
  entry(19, "regress:loading-single-source-browser", "tools/webgl-generator-loading-single-source-browser-regression.mjs", "R5b", "loading-state", "fixture", ["S-08", "S-09", "S-16"], ["I-03", "I-04", "I-14", "I-15", "I-16"], ["regress:api-operation", "regress:delayed-operation-feedback", "regress:global-shell", "audit:ui-copy", "regress:height-panel-storage-copy"], "pending", "isolated-imported-fixture", "restore-ui-and-close", "feedback-200ms"),
  entry(20, "regress:delayed-operation-feedback-browser", "tools/webgl-generator-delayed-operation-feedback-browser-regression.mjs", "R5b", "delayed-feedback", "fixture", ["S-08", "S-16"], ["I-03", "I-04", "I-14", "I-15", "I-16"], ["regress:delayed-operation-feedback", "regress:api-operation", "regress:global-shell", "audit:ui-copy", "regress:height-panel-storage-copy"], "pending", "isolated-imported-fixture", "restore-ui-and-close", "feedback-200ms")
];

const supplementalEntries = [{
  id: "direct-context-restore",
  entry: "regress:context-restore-browser",
  script: "tools/webgl-generator-context-restore-browser-regression.mjs",
  ownerStage: "R4b/R6b",
  riskGroup: "context-restore",
  scale: "10k",
  scenarios: ["S-17"],
  invariants: ["I-01", "I-03", "I-11", "I-12", "I-14", "I-15", "I-16"],
  nodePrerequisites: ["regress:r4b-fixture-contract", "regress:context-loss-debug", "regress:foundation-core-protocol", "regress:worker-task", "regress:render-cache-resource-binding", "regress:prepared-render-installer", "regress:visual-themes", "regress:city-picking"],
  setupPolicy: "isolated-generated-map-explicit-view",
  cleanupPolicy: "restore-map-and-close",
  performancePolicy: "presentation-zero-product-work",
  ...common
}];

const profileOwners = [
  {id: "generation", ownerStage: "R2a", riskGroup: "whole-map-profile", scenarios: ["S-01"], invariants: ["I-01", "I-02", "I-03", "I-04", "I-06", "I-09", "I-13", "I-14"], nodePrerequisites: ["regress:foundation-core-protocol", "regress:whole-map-profile-core-protocol", "regress:prepared-render-installer"]},
  {id: "persistence-import", ownerStage: "R2a/R5a", riskGroup: "whole-map-profile", scenarios: ["S-02"], invariants: ["I-01", "I-02", "I-03", "I-04", "I-06", "I-09", "I-13", "I-14"], nodePrerequisites: ["regress:map-file-io-worker", "regress:whole-map-profile-core-protocol", "regress:prepared-render-installer", "regress:persistence-boundary"]},
  {id: "archive-export", ownerStage: "R2a/R5a", riskGroup: "whole-map-profile", scenarios: ["S-14"], invariants: ["I-01", "I-02", "I-03", "I-04", "I-06", "I-13", "I-14"], nodePrerequisites: ["regress:map-file-io-worker", "regress:whole-map-profile-core-protocol", "regress:persistence-boundary"]},
  {id: "headless-write", ownerStage: "R2a/R5a", riskGroup: "whole-map-profile", scenarios: ["S-02"], invariants: ["I-01", "I-02", "I-03", "I-04", "I-05", "I-06", "I-13", "I-14"], nodePrerequisites: ["regress:headless-api", "regress:headless-write"]}
];

const r2bPrerequisiteRequirements = new Map([
  [2, ["regress:core-dependencies", "regress:whole-map-domain-chain"]],
  [3, ["regress:population-worker-task", "regress:population-core-protocol", "regress:render-preparation"]],
  [4, ["regress:core-manifests", "regress:social-expansion-worker-task", "regress:social-expansion-ui-api", "regress:society-politics-core-protocol", "regress:render-preparation"]],
  [5, ["regress:economy-worker-task", "regress:economy-diplomacy-military-core-protocol", "regress:render-preparation"]]
]);

const r3aPrerequisiteRequirements = new Map([
  [6, ["regress:worker-session-contract", "regress:map-adoption-binding-owner", "regress:worker-task", "regress:map-replica-command-patch", "regress:worker-graph-stream"]],
  [7, ["regress:worker-session-contract", "regress:map-adoption-binding-owner", "regress:worker-task", "regress:map-replica-command-patch", "regress:worker-graph-stream-100k"]]
]);

const r4aPrerequisiteRequirements = new Map([
  [11, ["regress:presentation-contract", "regress:visual-theme-boundary", "regress:visual-theme-registry-boundary", "regress:gpu-display-mutation", "regress:render-cache-resource-binding", "regress:render-preparation", "regress:prepared-render-installer", "regress:markers-core", "regress:city-picking", "regress:river-picking", "regress:line-width-projection", "regress:hover-overlay-layer"]],
  [12, ["regress:presentation-contract", "regress:worker-task", "regress:prepared-render-installer", "regress:render-cache-resource-binding", "regress:viewport-line-preview", "regress:hover-overlay-layer", "regress:panel-overlay-policy"]],
  [13, ["regress:presentation-contract", "regress:worker-task", "regress:render-cache-resource-binding", "regress:viewport-line-preview", "regress:line-width-projection"]]
]);

const r4bPrerequisiteRequirements = new Map([
  [14, ["regress:r4b-fixture-contract", "regress:r4b-artifact-helper", "regress:heightmap-export", "regress:png-options", "regress:presentation-contract"]],
  [15, ["regress:r4b-fixture-contract", "regress:r4b-artifact-helper", "regress:png-options", "regress:exports", "regress:presentation-contract", "regress:render-cache-resource-binding"]]
]);

const r5aPrerequisiteRequirements = new Map([
  [16, ["regress:persistence-boundary"]],
  [17, ["regress:persistence-boundary"]]
]);

const r5bPrerequisiteRequirements = new Map([
  [18, ["regress:map-save-naming", "regress:api-operation", "regress:map-storage-user-copy"]],
  [19, ["regress:api-operation", "regress:delayed-operation-feedback", "regress:global-shell", "audit:ui-copy", "regress:height-panel-storage-copy"]],
  [20, ["regress:delayed-operation-feedback", "regress:api-operation", "regress:global-shell", "audit:ui-copy", "regress:height-panel-storage-copy"]]
]);

export const TASK_350_STAGE_AGGREGATE_REQUIREMENTS = Object.freeze({
  "regress:task-350-r4a": Object.freeze(["regress:map-file-io-worker"]),
  "regress:task-350-r4b": Object.freeze(["regress:r4b-artifact-helper", "regress:r4b-fixture-contract", "regress:context-loss-debug", "regress:heightmap-export", "regress:png-options", "regress:exports", "regress:worker-task", "regress:render-cache-resource-binding", "regress:prepared-render-installer", "regress:visual-themes", "regress:city-picking", "typecheck:core"]),
  "regress:task-350-r5a": Object.freeze(["regress:task-350-acceptance-contract", "regress:whole-map-profile-core-protocol", "regress:map-file-io-worker", "regress:persistence-boundary", "regress:api-data-compatibility", "regress:map-migration", "regress:cloud-storage", "regress:map-storage-user-copy", "regress:map-save-naming", "regress:headless-api", "regress:headless-write", "typecheck:core"]),
  "regress:task-350-r5b": Object.freeze(["regress:task-350-acceptance-contract", "regress:api-operation", "regress:delayed-operation-feedback", "regress:global-shell", "audit:ui-copy", "regress:height-panel-storage-copy", "regress:map-storage-user-copy", "typecheck:core"]),
  "regress:task-350-r6a": Object.freeze(["regress:task-350-acceptance-contract", "regress:task-350-browser-artifact", "regress:r4b-artifact-helper", "regress:r4b-fixture-contract", "regress:task-350-r6a-fixture-artifact-contract", "regress:task-350-r6a-fixture-freeze", "typecheck:core", "build:app"])
});

export const TASK_350_ACCEPTANCE_CATALOG = deepFreeze({
  schemaVersion: 3,
  authority: PLAN_PATH,
  invariants,
  scenarios,
  fixedEntries,
  supplementalEntries,
  profileOwners
});

export function validateTask350AcceptanceCatalog(catalog = TASK_350_ACCEPTANCE_CATALOG) {
  assert.equal(catalog?.schemaVersion, 3, "Task 350 catalog schemaVersion 无效");
  assert.equal(catalog?.authority, PLAN_PATH, "Task 350 catalog 权威计划路径漂移");
  assertUniqueIds(catalog.invariants, 16, "invariant");
  assertUniqueIds(catalog.scenarios, 17, "scenario");
  assertUniqueIds(catalog.fixedEntries, 20, "fixed entry", "number");
  assertUniqueIds(catalog.supplementalEntries, 1, "supplemental entry");
  assertUniqueIds(catalog.profileOwners, 4, "profile owner");
  assert.deepEqual(catalog.fixedEntries.map(item => item.number), Array.from({length: 20}, (_, index) => index + 1), "固定入口编号必须为 1～20");
  assert.deepEqual(catalog.profileOwners.map(item => item.id).sort(), ["archive-export", "generation", "headless-write", "persistence-import"], "四个 profile owner 不完整");
  for (const item of catalog.scenarios) {
    assert.equal(item.ownerStage, scenarioOwnerStages.get(item.id), `${item.id} 的 scenario ownerStage 与权威矩阵不一致`);
  }

  const scenarioIds = new Set(catalog.scenarios.map(item => item.id));
  const invariantIds = new Set(catalog.invariants.map(item => item.id));
  const allConsumers = [...catalog.fixedEntries, ...catalog.supplementalEntries, ...catalog.profileOwners];
  for (const item of allConsumers) {
    assert.equal(typeof item.ownerStage, "string", `${item.id || item.entry} 缺少 ownerStage`);
    assert.ok(item.ownerStage.length > 0, `${item.id || item.entry} 的 ownerStage 为空`);
    assert.equal(typeof item.riskGroup, "string", `${item.id || item.entry} 缺少 riskGroup`);
    assert.ok(item.riskGroup.length > 0, `${item.id || item.entry} 的 riskGroup 为空`);
    assertNonEmptyStrings(item.scenarios, `${item.id || item.entry} scenarios`);
    assertNonEmptyStrings(item.invariants, `${item.id || item.entry} invariants`);
    assertNonEmptyStrings(item.nodePrerequisites, `${item.id || item.entry} nodePrerequisites`);
    for (const id of item.scenarios) assert.ok(scenarioIds.has(id), `${item.id || item.entry} 引用未知场景 ${id}`);
    for (const id of item.invariants) assert.ok(invariantIds.has(id), `${item.id || item.entry} 引用未知不变量 ${id}`);
  }
  for (const item of [...catalog.fixedEntries, ...catalog.supplementalEntries]) {
    for (const field of ["setupPolicy", "cleanupPolicy", "artifactPolicy", "errorPolicy", "performancePolicy", "fixtureStatus"]) {
      assert.ok(allowedPolicies[field].has(item[field]), `${item.id || item.entry} 的 ${field} 未登记：${String(item[field])}`);
    }
  }
  for (const item of catalog.fixedEntries) {
    const expected = fixedEntryDimensions.get(item.number);
    assert.deepEqual([item.ownerStage, item.riskGroup, item.scale], expected, `${item.id} 的 ownerStage / riskGroup / scale 与权威矩阵不一致`);
    for (const prerequisite of r2bPrerequisiteRequirements.get(item.number) || []) {
      assert.ok(item.nodePrerequisites.includes(prerequisite), `${item.id} 缺少 R2b Node 前置 ${prerequisite}`);
    }
    for (const prerequisite of r3aPrerequisiteRequirements.get(item.number) || []) {
      assert.ok(item.nodePrerequisites.includes(prerequisite), `${item.id} 缺少 R3a Node 前置 ${prerequisite}`);
    }
    for (const prerequisite of r4aPrerequisiteRequirements.get(item.number) || []) {
      assert.ok(item.nodePrerequisites.includes(prerequisite), `${item.id} 缺少 R4a Node 前置 ${prerequisite}`);
    }
    for (const prerequisite of r4bPrerequisiteRequirements.get(item.number) || []) {
      assert.ok(item.nodePrerequisites.includes(prerequisite), `${item.id} 缺少 R4b Node 前置 ${prerequisite}`);
    }
    for (const prerequisite of r5aPrerequisiteRequirements.get(item.number) || []) {
      assert.ok(item.nodePrerequisites.includes(prerequisite), `${item.id} 缺少 R5a Node 前置 ${prerequisite}`);
    }
    for (const prerequisite of r5bPrerequisiteRequirements.get(item.number) || []) {
      assert.ok(item.nodePrerequisites.includes(prerequisite), `${item.id} 缺少 R5b Node 前置 ${prerequisite}`);
    }
  }
  const directContext = catalog.supplementalEntries.find(item => item.id === "direct-context-restore");
  for (const prerequisite of ["regress:r4b-fixture-contract", "regress:context-loss-debug", "regress:worker-task", "regress:render-cache-resource-binding", "regress:prepared-render-installer"]) {
    assert.ok(directContext.nodePrerequisites.includes(prerequisite), `direct context restore 缺少 Node 前置 ${prerequisite}`);
  }
  assert.deepEqual(
    [catalog.supplementalEntries[0].ownerStage, catalog.supplementalEntries[0].riskGroup, catalog.supplementalEntries[0].scale],
    ["R4b/R6b", "context-restore", "10k"],
    "direct context restore 的 ownerStage / riskGroup / scale 与权威矩阵不一致"
  );
  for (const item of catalog.profileOwners) {
    assert.deepEqual([item.ownerStage, item.riskGroup], profileOwnerDimensions.get(item.id), `${item.id} profile owner 矩阵漂移`);
  }
  for (const id of ["persistence-import", "archive-export"]) {
    const owner = catalog.profileOwners.find(item => item.id === id);
    assert.ok(owner.nodePrerequisites.includes("regress:persistence-boundary"), `${id} 缺少 R5a persistence boundary 前置`);
  }
  assert.deepEqual(catalog.fixedEntries.slice(0, 5).map(item => item.browserStatus), Array(5).fill("accepted-baseline-recheck-required"), "前五项不得因旧通过免除重验");
  assert.ok(catalog.fixedEntries.slice(5).every(item => item.browserStatus === "pending"), "后十五项必须保持 pending");
  assert.ok(catalog.fixedEntries.every(item => item.fixtureStatus === "frozen"), "R6a 固定入口夹具必须保持 frozen");
  assert.deepEqual(new Set(allConsumers.flatMap(item => item.scenarios)), scenarioIds, "场景必须全部有 owner");
  assert.deepEqual(new Set(allConsumers.flatMap(item => item.invariants)), invariantIds, "不变量必须全部有 consumer");
  return catalog;
}

export function validateTask350StageAggregates(scripts) {
  assert.ok(scripts && typeof scripts === "object", "package scripts 无效");
  for (const [aggregate, requirements] of Object.entries(TASK_350_STAGE_AGGREGATE_REQUIREMENTS)) {
    const command = scripts[aggregate];
    assert.equal(typeof command, "string", `package.json 缺少阶段聚合 ${aggregate}`);
    const referencedScriptList = command.split(/\s*&&\s*/u).map(segment => {
      const match = segment.match(/^pnpm(?:\.cmd)?\s+(?:run\s+)?([\w:-]+)$/u);
      assert.ok(match, `${aggregate} 只能由 && 分隔的直接 pnpm run <script> 段组成：${segment}`);
      return match[1];
    });
    const referencedScripts = new Set(referencedScriptList);
    for (const requirement of requirements) {
      assert.ok(referencedScripts.has(requirement), `${aggregate} 缺少阶段前置 ${requirement}`);
    }
    if (aggregate === "regress:task-350-r6a") {
      assert.deepEqual(referencedScriptList, requirements, `${aggregate} 只能且必须按冻结顺序执行八项非浏览器门`);
    }
  }
  return scripts;
}

export function auditTask350AcceptanceCatalog({root = REPO_ROOT, catalog = TASK_350_ACCEPTANCE_CATALOG} = {}) {
  validateTask350AcceptanceCatalog(catalog);
  const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const scripts = packageJson.scripts || {};
  validateTask350StageAggregates(scripts);
  const plan = readFileSync(resolve(root, PLAN_PATH), "utf8");
  const legacyEvidence = readFileSync(resolve(root, LEGACY_EVIDENCE_PATH), "utf8");
  const legacyEntries = [...legacyEvidence.matchAll(/^\d+\. `(regress:[^`]+)`/gmu)].map(match => match[1]);
  assert.deepEqual(legacyEntries, catalog.fixedEntries.map(item => item.entry), "旧执行证据中的 20 个固定入口与 catalog 不一致");

  const sourceProfiles = [];
  for (const item of catalog.fixedEntries) {
    const command = scripts[item.entry];
    assert.equal(typeof command, "string", `package.json 缺少 ${item.entry}`);
    const entrypoints = [...command.matchAll(/\.\/(tools\/[^\s"']+\.mjs)/gu)].map(match => match[1]);
    assert.ok(entrypoints.includes(item.script), `${item.entry} 未绑定 catalog 脚本 ${item.script}`);
    const sourcePath = resolve(root, item.script);
    assert.ok(existsSync(sourcePath), `${item.entry} 脚本不存在：${item.script}`);
    const source = readFileSync(sourcePath, "utf8");
    sourceProfiles.push({
      number: item.number,
      entry: item.entry,
      script: item.script,
      fixtureStatus: item.fixtureStatus,
      performancePolicy: item.performancePolicy,
      lines: source.split(/\r?\n/u).length,
      observed: {
        newMap: /\bnewMap\b/u.test(source),
        history: /\b(?:history|undo|redo)\b/u.test(source),
        longTask: /LongTask|longTasks|PerformanceObserver/u.test(source),
        artifact: /createTask350BrowserArtifact|writeFileSync/u.test(source),
        cleanup: /\bfinally\s*\{/u.test(source)
      }
    });
    const observed = sourceProfiles.at(-1).observed;
    assert.equal(observed.artifact, true, `${item.entry} 缺少 full/compact artifact 实现`);
    assert.equal(observed.cleanup, true, `${item.entry} 缺少 finally cleanup`);
    if (item.performancePolicy !== "presentation-zero-product-work") {
      assert.equal(observed.longTask, true, `${item.entry} 缺少 LongTask 性能观测`);
    }
  }
  const contextEntry = catalog.supplementalEntries.find(item => item.id === "direct-context-restore");
  assert.equal(typeof scripts[contextEntry.entry], "string", `package.json 缺少 ${contextEntry.entry}`);
  assert.match(scripts[contextEntry.entry], new RegExp(escapeRegExp(`./${contextEntry.script}`), "u"), `${contextEntry.entry} 未绑定 ${contextEntry.script}`);
  assert.ok(existsSync(resolve(root, contextEntry.script)), `context restore 脚本不存在：${contextEntry.script}`);
  const nodePrerequisiteScripts = new Set([
    ...catalog.fixedEntries.flatMap(item => item.nodePrerequisites),
    ...catalog.supplementalEntries.flatMap(item => item.nodePrerequisites),
    ...catalog.profileOwners.flatMap(item => item.nodePrerequisites)
  ]);
  const checkedNodeScripts = new Set();
  const scannedNodeSources = new Set();
  for (const scriptName of nodePrerequisiteScripts) auditNodeScript({root, scripts, scriptName, checkedNodeScripts, scannedNodeSources, stack: []});
  for (const item of [...catalog.invariants, ...catalog.scenarios]) assert.match(plan, new RegExp(`\\| ${item.id} `, "u"), `权威方案缺少 ${item.id}`);
  for (const item of catalog.fixedEntries) {
    assert.match(plan, new RegExp(escapeRegExp(`| ${item.number} | \`${item.entry}\` | ${item.riskGroup} / ${item.scale} |`), "u"), `权威方案缺少 ${item.entry} 的风险组 / 规模矩阵`);
    assert.match(plan, new RegExp(`\\| ${item.number} \\|[^\\n]+\\| ${escapeRegExp(item.ownerStage)}(?:；[^|]+)? \\|`, "u"), `权威方案缺少 ${item.entry} 的精确 owner stage`);
  }
  assert.match(plan, /350-R0 → R1 → R2a → R2b → R3a → R3b → R4a → R4b → R5a → R5b → R6a → R6b → R7/u, "权威方案阶段顺序漂移");
  assert.match(plan, /features → states → provinces → cities → routes → rivers → markers → diplomacy → religions → military → zones/u, "正式十一领域链漂移");
  return {
    status: "pass",
    counts: {invariants: catalog.invariants.length, scenarios: catalog.scenarios.length, fixedEntries: catalog.fixedEntries.length, supplementalEntries: catalog.supplementalEntries.length, profileOwners: catalog.profileOwners.length},
    browserStatus: {acceptedBaselineRecheckRequired: 5, pending: 15, executedByAudit: 0},
    sourceProfiles,
    nodeAudit: {declaredPrerequisites: nodePrerequisiteScripts.size, scriptsChecked: checkedNodeScripts.size, sourceFilesScanned: scannedNodeSources.size}
  };
}

function entry(number, scriptName, script, ownerStage, riskGroup, scale, scenarioIds, invariantIds, nodePrerequisites, browserStatus, setupPolicy, cleanupPolicy, performancePolicy) {
  return {number, id: `fixed-${String(number).padStart(2, "0")}`, entry: scriptName, script, ownerStage, riskGroup, scale, scenarios: scenarioIds, invariants: invariantIds, nodePrerequisites, browserStatus, setupPolicy, cleanupPolicy, performancePolicy, ...common};
}

function auditNodeScript({root, scripts, scriptName, checkedNodeScripts, scannedNodeSources, stack}) {
  assert.ok(!stack.includes(scriptName), `Node 前置 package script 循环引用：${[...stack, scriptName].join(" -> ")}`);
  if (checkedNodeScripts.has(scriptName)) return;
  assert.equal(typeof scripts[scriptName], "string", `缺少 Node 前置 package script：${scriptName}`);
  assert.doesNotMatch(scriptName, PACKAGE_BROWSER_FORBIDDEN, `Node 前置不得是浏览器入口：${scriptName}`);
  assert.doesNotMatch(scripts[scriptName], PACKAGE_BROWSER_FORBIDDEN, `Node 前置命令包含浏览器启动原语：${scriptName}`);
  checkedNodeScripts.add(scriptName);
  for (const match of scripts[scriptName].matchAll(/\.\/(tools\/[^\s"']+\.(?:mjs|js|ts))/gu)) {
    const findings = findBrowserLaunchers({root, entrypoint: resolve(root, match[1]), scanned: scannedNodeSources});
    assert.deepEqual(findings, [], `Node 前置工具入口或本地导入链包含浏览器启动原语：${findings.join(", ")}`);
  }
  for (const match of scripts[scriptName].matchAll(/pnpm(?:\.cmd)?\s+(?:run\s+)?([\w:-]+)/gu)) {
    auditNodeScript({root, scripts, scriptName: match[1], checkedNodeScripts, scannedNodeSources, stack: [...stack, scriptName]});
  }
}

function assertUniqueIds(items, count, label, field = "id") {
  assert.ok(Array.isArray(items), `${label} 必须是数组`);
  assert.equal(items.length, count, `${label} 数量应为 ${count}`);
  const ids = items.map(item => item?.[field]);
  assert.ok(ids.every(value => typeof value === "string" || Number.isInteger(value)), `${label} 存在无效 ${field}`);
  assert.equal(new Set(ids).size, count, `${label} ${field} 重复`);
}

function assertNonEmptyStrings(values, label) {
  assert.ok(Array.isArray(values) && values.length > 0, `${label} 必须是非空数组`);
  assert.ok(values.every(value => typeof value === "string" && value.length > 0), `${label} 存在空值`);
  assert.equal(new Set(values).size, values.length, `${label} 存在重复值`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(auditTask350AcceptanceCatalog(), null, 2));
}
