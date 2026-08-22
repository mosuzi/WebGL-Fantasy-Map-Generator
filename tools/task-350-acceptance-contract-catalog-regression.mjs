import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  auditTask350AcceptanceCatalog,
  TASK_350_ACCEPTANCE_CATALOG,
  validateTask350AcceptanceCatalog,
  validateTask350StageAggregates
} from "./task-350-acceptance-contract-catalog.mjs";

const report = auditTask350AcceptanceCatalog();
assert.deepEqual(report.counts, {invariants: 16, scenarios: 17, fixedEntries: 20, supplementalEntries: 1, profileOwners: 4});
assert.deepEqual(report.browserStatus, {acceptedBaselineRecheckRequired: 5, pending: 15, executedByAudit: 0});
assert.equal(report.sourceProfiles.length, 20);
assert.equal(report.sourceProfiles.filter(item => item.entry === "regress:worker-session-browser").length, 1);
assert.equal(report.sourceProfiles.filter(item => item.entry === "regress:worker-session-100k-browser").length, 1);
assert.ok(report.sourceProfiles.every(item => item.lines > 50 && item.script.startsWith("tools/") && item.script.endsWith(".mjs")));
assert.ok(report.sourceProfiles.every(item => item.fixtureStatus === "frozen" && item.observed.artifact && item.observed.cleanup));
assert.ok(report.sourceProfiles.filter(item => item.performancePolicy !== "presentation-zero-product-work").every(item => item.observed.longTask));
assert.ok(report.nodeAudit.declaredPrerequisites > 20);
assert.ok(report.nodeAudit.scriptsChecked >= report.nodeAudit.declaredPrerequisites);
assert.ok(report.nodeAudit.sourceFilesScanned >= report.nodeAudit.declaredPrerequisites);

const clone = () => structuredClone(TASK_350_ACCEPTANCE_CATALOG);
const packageScripts = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).scripts;

validateTask350StageAggregates(packageScripts);
assert.throws(() => {
  const candidate = structuredClone(packageScripts);
  candidate["regress:task-350-r4a"] = candidate["regress:task-350-r4a"].replace(" && pnpm run regress:map-file-io-worker", "");
  validateTask350StageAggregates(candidate);
}, /regress:task-350-r4a 缺少阶段前置 regress:map-file-io-worker/u, "删除 f2 map-file Worker 前置后 R4a 聚合仍通过");
for (const impostor of ["echo pnpm run regress:map-file-io-worker", "echo ok # pnpm run regress:map-file-io-worker"]) {
  assert.throws(() => {
    const candidate = structuredClone(packageScripts);
    candidate["regress:task-350-r4a"] = candidate["regress:task-350-r4a"].replace("pnpm run regress:map-file-io-worker", impostor);
    validateTask350StageAggregates(candidate);
  }, /只能由 && 分隔的直接 pnpm run <script> 段组成/u, `${impostor} 冒充可执行 map-file Worker 前置后仍通过`);
}
for (const prerequisite of [
  "regress:r4b-artifact-helper",
  "regress:r4b-fixture-contract",
  "regress:context-loss-debug",
  "regress:heightmap-export",
  "regress:png-options",
  "regress:exports",
  "regress:worker-task",
  "regress:render-cache-resource-binding",
  "regress:prepared-render-installer",
  "regress:visual-themes",
  "regress:city-picking",
  "typecheck:core"
]) {
  assert.throws(() => {
    const candidate = structuredClone(packageScripts);
    candidate["regress:task-350-r4b"] = candidate["regress:task-350-r4b"].replace(` && pnpm run ${prerequisite}`, "");
    validateTask350StageAggregates(candidate);
  }, /regress:task-350-r4b 缺少阶段前置/u, `删除 R4b aggregate 前置 ${prerequisite} 后仍通过`);
}
for (const prerequisite of [
  "regress:task-350-acceptance-contract",
  "regress:whole-map-profile-core-protocol",
  "regress:map-file-io-worker",
  "regress:persistence-boundary",
  "regress:api-data-compatibility",
  "regress:map-migration",
  "regress:cloud-storage",
  "regress:map-storage-user-copy",
  "regress:map-save-naming",
  "regress:headless-api",
  "regress:headless-write",
  "typecheck:core"
]) {
  assert.throws(() => {
    const candidate = structuredClone(packageScripts);
    candidate["regress:task-350-r5a"] = candidate["regress:task-350-r5a"].split(" && ")
      .filter(segment => segment !== `pnpm run ${prerequisite}`)
      .join(" && ");
    validateTask350StageAggregates(candidate);
  }, /regress:task-350-r5a 缺少阶段前置/u, `删除 R5a aggregate 前置 ${prerequisite} 后仍通过`);
}
for (const prerequisite of [
  "regress:task-350-acceptance-contract",
  "regress:api-operation",
  "regress:delayed-operation-feedback",
  "regress:global-shell",
  "audit:ui-copy",
  "regress:height-panel-storage-copy",
  "regress:map-storage-user-copy",
  "typecheck:core"
]) {
  assert.throws(() => {
    const candidate = structuredClone(packageScripts);
    candidate["regress:task-350-r5b"] = candidate["regress:task-350-r5b"].split(" && ")
      .filter(segment => segment !== `pnpm run ${prerequisite}`)
      .join(" && ");
    validateTask350StageAggregates(candidate);
  }, /regress:task-350-r5b 缺少阶段前置/u, `删除 R5b aggregate 前置 ${prerequisite} 后仍通过`);
}
for (const prerequisite of [
  "regress:task-350-acceptance-contract",
  "regress:task-350-browser-artifact",
  "regress:r4b-artifact-helper",
  "regress:r4b-fixture-contract",
  "regress:task-350-r6a-fixture-artifact-contract",
  "regress:task-350-r6a-fixture-freeze",
  "typecheck:core",
  "build:app"
]) {
  assert.throws(() => {
    const candidate = structuredClone(packageScripts);
    candidate["regress:task-350-r6a"] = candidate["regress:task-350-r6a"].split(" && ")
      .filter(segment => segment !== `pnpm run ${prerequisite}`)
      .join(" && ");
    validateTask350StageAggregates(candidate);
  }, /regress:task-350-r6a 缺少阶段前置/u, `删除 R6a aggregate 前置 ${prerequisite} 后仍通过`);
}
for (const browserEntry of ["regress:map-transaction-browser", "regress:worker-session-browser", "regress:browser-save-feedback"]) {
  assert.throws(() => {
    const candidate = structuredClone(packageScripts);
    candidate["regress:task-350-r6a"] += ` && pnpm run ${browserEntry}`;
    validateTask350StageAggregates(candidate);
  }, /只能且必须按冻结顺序执行八项非浏览器门/u, `R6a aggregate 追加 ${browserEntry} 后仍通过`);
}

assert.throws(() => {
  const candidate = clone();
  candidate.fixedEntries.pop();
  validateTask350AcceptanceCatalog(candidate);
}, /fixed entry 数量应为 20/u, "删除固定入口后 catalog 仍通过");

assert.throws(() => {
  const candidate = clone();
  candidate.fixedEntries[1].number = 1;
  validateTask350AcceptanceCatalog(candidate);
}, /fixed entry number 重复/u, "重复固定入口编号后 catalog 仍通过");

assert.throws(() => {
  const candidate = clone();
  candidate.fixedEntries[0].scenarios = ["S-99"];
  validateTask350AcceptanceCatalog(candidate);
}, /引用未知场景 S-99/u, "引用未知场景后 catalog 仍通过");

assert.throws(() => {
  const candidate = clone();
  candidate.fixedEntries[0].invariants = ["I-99"];
  validateTask350AcceptanceCatalog(candidate);
}, /引用未知不变量 I-99/u, "引用未知不变量后 catalog 仍通过");

for (const invalidOwner of [undefined, "R7"]) {
  assert.throws(() => {
    const candidate = clone();
    candidate.scenarios[0].ownerStage = invalidOwner;
    validateTask350AcceptanceCatalog(candidate);
  }, /S-01 的 scenario ownerStage 与权威矩阵不一致/u, `S-01 ownerStage 漂移为 ${String(invalidOwner)} 后仍通过`);
}

for (const [field, invalid] of [
  ["ownerStage", ""],
  ["riskGroup", "dynamic-product-output"],
  ["scale", "current-product-size"],
  ["setupPolicy", "dynamic-product-output"],
  ["cleanupPolicy", "best-effort"],
  ["artifactPolicy", "success-only"],
  ["errorPolicy", "ignore-health"],
  ["performancePolicy", "report-only"],
  ["fixtureStatus", "unfrozen"]
]) {
  assert.throws(() => {
    const candidate = clone();
    candidate.fixedEntries[0][field] = invalid;
    validateTask350AcceptanceCatalog(candidate);
  }, /未登记|权威矩阵|为空/u, `破坏 ${field} 后 catalog 仍通过`);
}

assert.throws(() => {
  const candidate = clone();
  candidate.fixedEntries[0].browserStatus = "accepted";
  validateTask350AcceptanceCatalog(candidate);
}, /前五项不得因旧通过免除重验/u, "把旧通过冒充重新验收后 catalog 仍通过");

assert.throws(() => {
  const candidate = clone();
  candidate.fixedEntries[5].fixtureStatus = "unfrozen";
  validateTask350AcceptanceCatalog(candidate);
}, /fixtureStatus 未登记/u, "解冻夹具后 catalog 仍通过");

assert.throws(() => {
  const candidate = clone();
  candidate.profileOwners = candidate.profileOwners.filter(item => item.id !== "archive-export");
  validateTask350AcceptanceCatalog(candidate);
}, /profile owner 数量应为 4/u, "删除 archive export owner 后 catalog 仍通过");

for (const id of ["persistence-import", "archive-export"]) {
  assert.throws(() => {
    const candidate = clone();
    const owner = candidate.profileOwners.find(item => item.id === id);
    owner.nodePrerequisites = owner.nodePrerequisites.filter(item => item !== "regress:persistence-boundary");
    validateTask350AcceptanceCatalog(candidate);
  }, /缺少 R5a persistence boundary 前置/u, `删除 ${id} persistence boundary 前置后 catalog 仍通过`);
}

assert.throws(() => {
  const candidate = clone();
  candidate.supplementalEntries[0].scenarios = ["S-01"];
  validateTask350AcceptanceCatalog(candidate);
}, /场景必须全部有 owner/u, "删除 context restore 场景 owner 后 catalog 仍通过");

assert.throws(() => {
  const candidate = clone();
  candidate.fixedEntries[0].nodePrerequisites = ["regress:measurement"];
  auditTask350AcceptanceCatalog({catalog: candidate});
}, /浏览器启动原语/u, "Node 前置使用命名不可见但实际启动 Chromium 的入口后仍通过");

for (const [entryIndex, prerequisite] of [
  [1, "regress:whole-map-domain-chain"],
  [2, "regress:population-worker-task"],
  [2, "regress:render-preparation"],
  [3, "regress:social-expansion-worker-task"],
  [3, "regress:core-manifests"],
  [3, "regress:social-expansion-ui-api"],
  [3, "regress:render-preparation"],
  [4, "regress:economy-worker-task"],
  [4, "regress:render-preparation"]
]) {
  assert.throws(() => {
    const candidate = clone();
    candidate.fixedEntries[entryIndex].nodePrerequisites = candidate.fixedEntries[entryIndex].nodePrerequisites.filter(item => item !== prerequisite);
    validateTask350AcceptanceCatalog(candidate);
  }, /缺少 R2b Node 前置/u, `删除 ${prerequisite} 后 catalog 仍通过`);
}

for (const [entryIndex, prerequisite] of [
  [15, "regress:persistence-boundary"],
  [16, "regress:persistence-boundary"]
]) {
  assert.throws(() => {
    const candidate = clone();
    candidate.fixedEntries[entryIndex].nodePrerequisites = candidate.fixedEntries[entryIndex].nodePrerequisites.filter(item => item !== prerequisite);
    validateTask350AcceptanceCatalog(candidate);
  }, /缺少 R5a Node 前置/u, `删除 ${prerequisite} 后 catalog 仍通过`);
}

for (const [entryIndex, prerequisite] of [
  [17, "regress:map-save-naming"],
  [17, "regress:api-operation"],
  [17, "regress:map-storage-user-copy"],
  [18, "regress:api-operation"],
  [18, "regress:delayed-operation-feedback"],
  [18, "regress:global-shell"],
  [18, "audit:ui-copy"],
  [18, "regress:height-panel-storage-copy"],
  [19, "regress:delayed-operation-feedback"],
  [19, "regress:api-operation"],
  [19, "regress:global-shell"],
  [19, "audit:ui-copy"],
  [19, "regress:height-panel-storage-copy"]
]) {
  assert.throws(() => {
    const candidate = clone();
    candidate.fixedEntries[entryIndex].nodePrerequisites = candidate.fixedEntries[entryIndex].nodePrerequisites.filter(item => item !== prerequisite);
    validateTask350AcceptanceCatalog(candidate);
  }, /缺少 R5b Node 前置/u, `删除 ${prerequisite} 后 catalog 仍通过`);
}

for (const [entryIndex, prerequisite] of [
  [10, "regress:presentation-contract"],
  [10, "regress:visual-theme-boundary"],
  [10, "regress:visual-theme-registry-boundary"],
  [10, "regress:gpu-display-mutation"],
  [10, "regress:render-cache-resource-binding"],
  [10, "regress:render-preparation"],
  [10, "regress:prepared-render-installer"],
  [10, "regress:markers-core"],
  [10, "regress:city-picking"],
  [10, "regress:river-picking"],
  [10, "regress:line-width-projection"],
  [10, "regress:hover-overlay-layer"],
  [11, "regress:presentation-contract"],
  [11, "regress:worker-task"],
  [11, "regress:prepared-render-installer"],
  [11, "regress:render-cache-resource-binding"],
  [11, "regress:viewport-line-preview"],
  [11, "regress:hover-overlay-layer"],
  [11, "regress:panel-overlay-policy"],
  [12, "regress:presentation-contract"],
  [12, "regress:worker-task"],
  [12, "regress:render-cache-resource-binding"],
  [12, "regress:viewport-line-preview"],
  [12, "regress:line-width-projection"]
]) {
  assert.throws(() => {
    const candidate = clone();
    candidate.fixedEntries[entryIndex].nodePrerequisites = candidate.fixedEntries[entryIndex].nodePrerequisites.filter(item => item !== prerequisite);
    validateTask350AcceptanceCatalog(candidate);
  }, /缺少 R4a Node 前置/u, `删除 ${prerequisite} 后 catalog 仍通过`);
}

for (const [entryIndex, prerequisite] of [
  [13, "regress:r4b-fixture-contract"],
  [13, "regress:r4b-artifact-helper"],
  [13, "regress:presentation-contract"],
  [14, "regress:r4b-fixture-contract"],
  [14, "regress:r4b-artifact-helper"],
  [14, "regress:render-cache-resource-binding"]
]) {
  assert.throws(() => {
    const candidate = clone();
    candidate.fixedEntries[entryIndex].nodePrerequisites = candidate.fixedEntries[entryIndex].nodePrerequisites.filter(item => item !== prerequisite);
    validateTask350AcceptanceCatalog(candidate);
  }, /缺少 R4b Node 前置/u, `删除 ${prerequisite} 后 catalog 仍通过`);
}

for (const prerequisite of ["regress:r4b-fixture-contract", "regress:context-loss-debug", "regress:worker-task", "regress:render-cache-resource-binding", "regress:prepared-render-installer"]) {
  assert.throws(() => {
    const candidate = clone();
    candidate.supplementalEntries[0].nodePrerequisites = candidate.supplementalEntries[0].nodePrerequisites.filter(item => item !== prerequisite);
    validateTask350AcceptanceCatalog(candidate);
  }, /direct context restore 缺少 Node 前置/u, `删除 context restore 前置 ${prerequisite} 后 catalog 仍通过`);
}

for (const [entryIndex, prerequisite] of [
  [5, "regress:worker-session-contract"],
  [5, "regress:map-adoption-binding-owner"],
  [5, "regress:worker-task"],
  [5, "regress:map-replica-command-patch"],
  [5, "regress:worker-graph-stream"],
  [6, "regress:worker-session-contract"],
  [6, "regress:map-adoption-binding-owner"],
  [6, "regress:worker-task"],
  [6, "regress:map-replica-command-patch"],
  [6, "regress:worker-graph-stream-100k"]
]) {
  assert.throws(() => {
    const candidate = clone();
    candidate.fixedEntries[entryIndex].nodePrerequisites = candidate.fixedEntries[entryIndex].nodePrerequisites.filter(item => item !== prerequisite);
    validateTask350AcceptanceCatalog(candidate);
  }, /缺少 R3a Node 前置/u, `删除 ${prerequisite} 后 catalog 仍通过`);
}

console.log(JSON.stringify(report, null, 2));
