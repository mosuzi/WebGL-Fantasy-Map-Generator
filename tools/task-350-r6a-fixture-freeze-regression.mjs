#!/usr/bin/env node
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {parse} from "@babel/parser";

import {TASK_350_ACCEPTANCE_CATALOG, validateTask350AcceptanceCatalog} from "./task-350-acceptance-contract-catalog.mjs";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const expectedFixtureDigests = new Map([
  ["tools/webgl-generator-map-transaction-browser-regression.mjs", "b3f62e7977c8f2dd0d4d3dd6066765a1dab61228fbbc6ad88e16d8c307712a3c"],
  ["tools/webgl-generator-worker-regeneration-browser-regression.mjs", "1ce841070e632872ce6395a934e9c6699185aa470e609b377fa370dcfb2ae596"],
  ["tools/webgl-generator-population-worker-browser-regression.mjs", "52868fa1eb34b1bf5cb5ad2926fa0cd2f3181ba0ee37f9f9e2da9e319fa936ec"],
  ["tools/webgl-generator-social-expansion-worker-browser-regression.mjs", "67253c8985322de64dd87576d543847017096cbd6f092ffe68ca1811a0c24ed8"],
  ["tools/webgl-generator-economy-worker-browser-regression.mjs", "8ecc744245a1463f5db4827654c45277ad1b7cf9fc67c92c30c115d6fa89e050"],
  ["tools/webgl-generator-worker-session-browser-regression.mjs", "1a270b1ff8f24e7d34571f16dff5a0dbc04090bbdf1e8b499cc34e49a2050351"],
  ["tools/webgl-generator-grid-topology-browser-regression.mjs", "2db053784c358bc3e6a33b79a9bb733dcb4f143d8fd5b84bd47fe6f559194d8d"],
  ["tools/webgl-generator-regeneration-lock-direct-domains-browser-regression.mjs", "cae341db459d71de87f6dbc441d77d9db2460808d0c2bd474641487bc3dd75d6"],
  ["tools/webgl-generator-regeneration-lock-compound-browser-regression.mjs", "d486d361a4cfbcab2705314b81efdeee86c4fed7bf6c5b3c9d72f574be7354bb"],
  ["tools/webgl-generator-city-picking-browser-regression.mjs", "9886a64f485653f30c59c96757ec337ebf613e4612f02c547ad5786fa1655371"],
  ["tools/webgl-generator-overlay-pan-stability-browser-regression.mjs", "00cb6b49094b050bf4e4e3af78c0714fd050cdb68cb18a462956940b82b2f420"],
  ["tools/webgl-generator-viewport-line-preview-browser-regression.mjs", "ded695d4e2bcbbc0030d3d725469f724ba16fa2d26851670604ab114fc5a9742"],
  ["tools/webgl-generator-heightmap-export-browser-regression.mjs", "68055492faa442dc23ea8174c7265b831ff5602ad09d9eaac2326464fd548668"],
  ["tools/webgl-generator-png-crop-browser-regression.mjs", "d6b824d9dfe1751615d02b028303be1a754c2f7826e32a1979a7119d0bf8f35d"],
  ["tools/webgl-generator-browser-storage-backward-compatibility-regression.mjs", "17dfab843a8a2e06364ffca94b943c2ef76ed333e8393bdd9ab23c55db7965e1"],
  ["tools/webgl-generator-browser-storage-fallback-regression.mjs", "5a7bc4d1409345c0a6a014108f444f2ab4030be0b68da7715ef695f55f940b08"],
  ["tools/webgl-generator-browser-save-feedback-browser-regression.mjs", "96de360d2b254f0e141eaf79f4465d82f98d8c7e3fa51fad7d5b1cbd1872ed77"],
  ["tools/webgl-generator-loading-single-source-browser-regression.mjs", "6a2cbc06ae623d733258cc5115544b9cbbfd6c56ca1586139e0963e1a87f1533"],
  ["tools/webgl-generator-delayed-operation-feedback-browser-regression.mjs", "f8da95ee6678c0c298a808fbf603c529ae816076b168a68400e641a687b54f84"]
]);

if (process.argv.includes("--print-signatures")) {
  console.log(JSON.stringify(Object.fromEntries([...expectedFixtureDigests.keys()].map(script => [script, fixtureDigest(readFileSync(resolve(rootDir, script), "utf8"))])), null, 2));
  process.exit(0);
}

validateTask350AcceptanceCatalog();
const entries = TASK_350_ACCEPTANCE_CATALOG.fixedEntries;
assert.equal(entries.length, 20, "R6a 必须冻结 20 个 catalog 入口");
assert.equal(new Set(entries.map(item => item.script)).size, 19, "R6a 必须冻结 19 个唯一浏览器脚本");
assert.ok(entries.every(item => item.fixtureStatus === "frozen"), "R6a 固定入口仍有未冻结 fixture");
assert.deepEqual(new Set(entries.map(item => item.script)), new Set(expectedFixtureDigests.keys()), "R6a fixture digest 清单与 catalog 漂移");

let syntaxChecks = 0;
let mutationCases = 0;
let pointBufferContractMutationCases = 0;
let gridTopologyContractMutationCases = 0;
let directLockContractMutationCases = 0;
let compoundLockContractMutationCases = 0;
let cityPickingDiagnosticMutationCases = 0;
let overlayPanServerMutationCases = 0;
let viewportLinePreviewMutationCases = 0;
let storageCompatibilityPartitionMutationCases = 0;
let storageFallbackDirectBinaryMutationCases = 0;
let loadingSingleSourceProbeMutationCases = 0;
let delayedOperationFeedbackPartitionMutationCases = 0;
for (const [script, expectedDigest] of expectedFixtureDigests) {
  const source = readFileSync(resolve(rootDir, script), "utf8");
  assertFrozenFixtureSource(source, script, expectedDigest);
  const syntax = spawnSync(process.execPath, ["--check", resolve(rootDir, script)], {encoding: "utf8", windowsHide: true});
  assert.equal(syntax.status, 0, `${script} node --check 失败：${syntax.stderr || syntax.stdout}`);
  syntaxChecks += 1;

  const mutated = mutateFirstExecutableNode(source);
  const genericMutationFailure = ["tools/webgl-generator-viewport-line-preview-browser-regression.mjs", "tools/webgl-generator-browser-storage-backward-compatibility-regression.mjs", "tools/webgl-generator-browser-storage-fallback-regression.mjs"].includes(script)
    ? /规范 AST digest 漂移|未在任何硬断言前保存 report/u
    : /规范 AST digest 漂移/u;
  assert.throws(() => assertFrozenFixtureSource(mutated, script, expectedDigest), genericMutationFailure, `${script} 可执行 AST 破坏后仍通过冻结门`);
  mutationCases += 1;

  if (script === "tools/webgl-generator-worker-session-browser-regression.mjs") {
    for (const functionName of ["runCommittedDisplayReplayGate", "runCommittedLateContextGate"]) {
      const pointContractMutation = mutatePointBufferContract(source, functionName);
      assert.throws(
        () => assertFrozenFixtureSource(pointContractMutation, script, expectedDigest),
        /point 物理计数契约漂移/u,
        `${script} ${functionName} 恢复 point ← pointVertexCount 后仍通过结构门`
      );
      pointBufferContractMutationCases += 1;
    }
  }
  if (script === "tools/webgl-generator-grid-topology-browser-regression.mjs") {
    const staleHealthTotalMutation = source.replace("report.healthErrors.total === 0", "diagnostics.healthErrors.total === 0");
    assert.notEqual(staleHealthTotalMutation, source, "grid topology health total mutation 未命中");
    assert.throws(
      () => assertFrozenFixtureSource(staleHealthTotalMutation, script, expectedDigest),
      /passed 未读取重分类后的 application health total|passed 仍读取重分类前的 health total/u,
      `${script} 恢复 pre-partition health total 后仍通过结构门`
    );
    gridTopologyContractMutationCases += 1;
  }
  if (script === "tools/webgl-generator-regeneration-lock-direct-domains-browser-regression.mjs") {
    const executedMutation = source.replace("if (rebuild.executed !== false)", "if (rebuild.executed === false)");
    assert.notEqual(executedMutation, source, "direct lock deterministic rebuild mutation 未命中");
    assert.throws(
      () => assertFrozenFixtureSource(executedMutation, script, expectedDigest),
      /未硬拒绝非空 patch/u,
      `${script} 放宽 deterministic rebuild no-op 后仍通过结构门`
    );
    const publicReceiptMutation = source.replace('rebuild.operation?.name !== "edit.economy.rebuild"', 'rebuild.operation !== "rebuild"');
    assert.notEqual(publicReceiptMutation, source, "direct lock public receipt mutation 未命中");
    assert.throws(
      () => assertFrozenFixtureSource(publicReceiptMutation, script, expectedDigest),
      /未冻结公开 rebuild 空 patch receipt/u,
      `${script} 恢复 Worker 内部 operation 字符串后仍通过结构门`
    );
    const operationStallMutation = source.replace("main-thread-long-task|render-frame-gap|operation-stall|input-handler-stall", "main-thread-long-task|render-frame-gap|input-handler-stall");
    assert.notEqual(operationStallMutation, source, "direct lock operation-stall mutation 未命中");
    assert.throws(
      () => assertFrozenFixtureSource(operationStallMutation, script, expectedDigest),
      /丢失 operation-stall 性能分类/u,
      `${script} 删除 operation-stall 性能分类后仍通过结构门`
    );
    const checksumBudgetMutation = source.replace("budgetMs: 4", "budgetMs: 400");
    assert.notEqual(checksumBudgetMutation, source, "direct lock checksum budget mutation 未命中");
    assert.throws(
      () => assertFrozenFixtureSource(checksumBudgetMutation, script, expectedDigest),
      /checksum 可让出预算漂移/u,
      `${script} 放宽 canonical checksum 单段预算后仍通过结构门`
    );
    const checksumCacheMutation = source.replace("revision: ++snapshotAuditRevision", "revision: app.mapRevision.getSnapshot().mapRevision");
    assert.notEqual(checksumCacheMutation, source, "direct lock checksum cache mutation 未命中");
    assert.throws(
      () => assertFrozenFixtureSource(checksumCacheMutation, script, expectedDigest),
      /checksum 未使用唯一 audit revision/u,
      `${script} 恢复正式 revision cache key 后仍通过结构门`
    );
    const synchronousMapMutation = source.replace(
      "const transaction = transactionSnapshot(kind);",
      "const transaction = {...transactionSnapshot(kind), map: JSON.stringify(app.map)};"
    );
    assert.notEqual(synchronousMapMutation, source, "direct lock synchronous map mutation 未命中");
    assert.throws(
      () => assertFrozenFixtureSource(synchronousMapMutation, script, expectedDigest),
      /仍同步序列化完整地图/u,
      `${script} 恢复同步完整地图 stringify 后仍通过结构门`
    );
    const idleOnlyMutation = source.replace(
      'report.final.session === null || (report.final.session?.status === "idle" && report.final.session?.pending !== true)',
      'report.final.session?.status === "idle"'
    );
    assert.notEqual(idleOnlyMutation, source, "direct lock idle-only mutation 未命中");
    assert.throws(
      () => assertFrozenFixtureSource(idleOnlyMutation, script, expectedDigest),
      /最终协调器未按 null-or-idle\/non-pending 验收/u,
      `${script} 恢复 idle-only 最终协调器门后仍通过结构门`
    );
    directLockContractMutationCases += 7;
  }
  if (script === "tools/webgl-generator-regeneration-lock-compound-browser-regression.mjs") {
    const incompatibleClimateMutation = source.replace(
      'systems: ["religions", "markers"]',
      'systems: ["religions", "markers", "diplomacy", "military", "zones"]'
    );
    assert.notEqual(incompatibleClimateMutation, source, "compound lock incompatible climate mutation 未命中");
    assert.throws(
      () => assertFrozenFixtureSource(incompatibleClimateMutation, script, expectedDigest),
      /气候成功场景仍选择会引入 states 的系统/u,
      `${script} 恢复 diplomacy/states 冲突组合后仍通过结构门`
    );
    const operationStallMutation = source.replace("main-thread-long-task|render-frame-gap|operation-stall|input-handler-stall", "main-thread-long-task|render-frame-gap|input-handler-stall");
    assert.notEqual(operationStallMutation, source, "compound lock operation-stall mutation 未命中");
    assert.throws(
      () => assertFrozenFixtureSource(operationStallMutation, script, expectedDigest),
      /丢失 operation-stall 性能分类/u,
      `${script} 删除 operation-stall 性能分类后仍通过结构门`
    );
    const idleOnlyMutation = source.replace(
      'report.final.session === null || (report.final.session?.status === "idle" && report.final.session?.pending !== true)',
      'report.final.session?.status === "idle"'
    );
    assert.notEqual(idleOnlyMutation, source, "compound lock idle-only mutation 未命中");
    assert.throws(
      () => assertFrozenFixtureSource(idleOnlyMutation, script, expectedDigest),
      /最终协调器未按 null-or-idle\/non-pending 验收/u,
      `${script} 恢复 idle-only 最终协调器门后仍通过结构门`
    );
    const wrongFaultTaskMutation = source.replace(
      'task !== "ocean-current-world.compute"',
      'task !== "regeneration.compute"'
    );
    assert.notEqual(wrongFaultTaskMutation, source, "compound lock wrong fault task mutation 未命中");
    assert.throws(
      () => assertFrozenFixtureSource(wrongFaultTaskMutation, script, expectedDigest),
      /故障注入未限定 ocean-current-world\.compute/u,
      `${script} 把故障注入移到其它 Worker task 后仍通过结构门`
    );
    const missingFaultRestoreMutation = source.replace("app.workerTaskCoordinator = coordinator;", "void coordinator;");
    assert.notEqual(missingFaultRestoreMutation, source, "compound lock missing fault restore mutation 未命中");
    assert.throws(
      () => assertFrozenFixtureSource(missingFaultRestoreMutation, script, expectedDigest),
      /故障注入未在 finally 恢复 coordinator/u,
      `${script} 删除 coordinator 恢复后仍通过结构门`
    );
    const looseFaultCountMutation = source.replace("faultInjectionCalls !== 1", "faultInjectionCalls < 1");
    assert.notEqual(looseFaultCountMutation, source, "compound lock loose fault count mutation 未命中");
    assert.throws(
      () => assertFrozenFixtureSource(looseFaultCountMutation, script, expectedDigest),
      /故障注入调用次数未锁定为一次/u,
      `${script} 放宽故障注入调用次数后仍通过结构门`
    );
    const publicFaultAtMutation = source.replace(
      'seed: "lock-compound-fault"',
      'seed: "lock-compound-fault",\n        faultAt: "after:rivers"'
    );
    assert.notEqual(publicFaultAtMutation, source, "compound lock public faultAt mutation 未命中");
    assert.throws(
      () => assertFrozenFixtureSource(publicFaultAtMutation, script, expectedDigest),
      /仍把 faultAt 作为 runtime action 参数/u,
      `${script} 恢复 runtime action faultAt 后仍通过结构门`
    );
    const frozenCoordinatorWriteMutation = source.replace(
      "app.workerTaskCoordinator = faultCoordinator;",
      "coordinator.run = faultCoordinator.run;"
    );
    assert.notEqual(frozenCoordinatorWriteMutation, source, "compound lock frozen coordinator write mutation 未命中");
    assert.throws(
      () => assertFrozenFixtureSource(frozenCoordinatorWriteMutation, script, expectedDigest),
      /仍直接写入冻结 coordinator\.run/u,
      `${script} 恢复冻结 coordinator.run 写入后仍通过结构门`
    );
    const incompleteFacadeMutation = source.replace("      ...coordinator,\n", "");
    assert.notEqual(incompleteFacadeMutation, source, "compound lock incomplete facade mutation 未命中");
    assert.throws(
      () => assertFrozenFixtureSource(incompleteFacadeMutation, script, expectedDigest),
      /故障 facade 未完整转发 coordinator/u,
      `${script} 删除 facade 原方法转发后仍通过结构门`
    );
    const missingSessionFaultMutation = source.replace(
      'sessionPayload: {...runOptions.sessionPayload, faultAt: "after:rivers"}',
      "sessionPayload: runOptions.sessionPayload"
    );
    assert.notEqual(missingSessionFaultMutation, source, "compound lock missing session fault mutation 未命中");
    assert.throws(
      () => assertFrozenFixtureSource(missingSessionFaultMutation, script, expectedDigest),
      /故障注入未覆盖复用 session payload/u,
      `${script} 删除复用 session payload 故障注入后仍通过结构门`
    );
    const missingFailureTimelineMutation = source.replace("    timeline: report.timeline,\n", "");
    assert.notEqual(missingFailureTimelineMutation, source, "compound lock missing failure timeline mutation 未命中");
    assert.throws(
      () => assertFrozenFixtureSource(missingFailureTimelineMutation, script, expectedDigest),
      /失败摘要缺少阶段时间线/u,
      `${script} 删除失败摘要时间线后仍通过结构门`
    );
    const lateArtifactResultMutation = source.replace("  evidence.setResult(fullResult, compactResult);\n", "");
    assert.notEqual(lateArtifactResultMutation, source, "compound lock late artifact result mutation 未命中");
    assert.throws(
      () => assertFrozenFixtureSource(lateArtifactResultMutation, script, expectedDigest),
      /未在 LongTask 硬断言前保存 report/u,
      `${script} 删除硬断言前 report 落盘后仍通过结构门`
    );
    compoundLockContractMutationCases += 12;
  }
  if (script === "tools/webgl-generator-city-picking-browser-regression.mjs") {
    const navigationMutation = source.replace('page.on("framenavigated"', 'page.on("frameattached"');
    assert.notEqual(navigationMutation, source, "city picking navigation mutation 未命中");
    assert.throws(
      () => assertFrozenFixtureSource(navigationMutation, script, expectedDigest),
      /缺少 main-frame navigation 诊断/u,
      `${script} 删除 main-frame navigation 诊断后仍通过结构门`
    );
    const failureArtifactMutation = source.replace("evidence.setResult({ok: false", "evidence.setResult({ok: true");
    assert.notEqual(failureArtifactMutation, source, "city picking failure artifact mutation 未命中");
    assert.throws(
      () => assertFrozenFixtureSource(failureArtifactMutation, script, expectedDigest),
      /失败前未保存 navigation artifact/u,
      `${script} 把失败 artifact 标为成功后仍通过结构门`
    );
    const hmrMutation = source.replace("strictPort: true, hmr: false", "strictPort: true");
    assert.notEqual(hmrMutation, source, "city picking hmr mutation 未命中");
    assert.throws(
      () => assertFrozenFixtureSource(hmrMutation, script, expectedDigest),
      /未关闭 Vite HMR/u,
      `${script} 恢复 Vite HMR 后仍通过结构门`
    );
    cityPickingDiagnosticMutationCases += 3;
  }
  if (script === "tools/webgl-generator-overlay-pan-stability-browser-regression.mjs") {
    const missingServerStartMutation = source.replace("  server = await startStaticServer();\n", "");
    assert.notEqual(missingServerStartMutation, source, "overlay pan server start mutation 未命中");
    assert.throws(
      () => assertFrozenFixtureSource(missingServerStartMutation, script, expectedDigest),
      /未等待自托管 server 监听/u,
      `${script} 删除自托管 server 启动后仍通过结构门`
    );
    const missingServerCleanupMutation = source.replace('["overlay-pan-server", server ? () => new Promise((resolveClose, rejectClose) => server.close(error => error ? rejectClose(error) : resolveClose())) : null]', '["overlay-pan-server", null]');
    assert.notEqual(missingServerCleanupMutation, source, "overlay pan server cleanup mutation 未命中");
    assert.throws(
      () => assertFrozenFixtureSource(missingServerCleanupMutation, script, expectedDigest),
      /自托管 server 未纳入 finally/u,
      `${script} 删除自托管 server cleanup 后仍通过结构门`
    );
    const containmentMutation = source.replace('requested === distDir || requested.startsWith(`${distDir}${sep}`)', "requested.startsWith(distDir)");
    assert.notEqual(containmentMutation, source, "overlay pan containment mutation 未命中");
    assert.throws(
      () => assertFrozenFixtureSource(containmentMutation, script, expectedDigest),
      /静态文件目录边界可被同前缀 sibling 绕过/u,
      `${script} 恢复裸 startsWith containment 后仍通过结构门`
    );
    const lateArtifactMutation = source.replace("  evidence.setResult(finalReport, compactReport);\n", "");
    assert.notEqual(lateArtifactMutation, source, "overlay pan late artifact mutation 未命中");
    assert.throws(
      () => assertFrozenFixtureSource(lateArtifactMutation, script, expectedDigest),
      /未在离场样本硬断言前保存 report/u,
      `${script} 删除离场断言前 artifact 后仍通过结构门`
    );
    const resourceSampleMutation = source.replace('item.category === "resource"', 'item.category !== "resource"');
    assert.notEqual(resourceSampleMutation, source, "overlay pan resource sample mutation 未命中");
    assert.throws(() => assertFrozenFixtureSource(resourceSampleMutation, script, expectedDigest), /四类确定性离场样本不完整/u, `${script} 删除 resource 样本后仍通过结构门`);
    const sampleRefreshMutation = source.replace("    renderer.updateLabels();\n", "");
    assert.notEqual(sampleRefreshMutation, source, "overlay pan sample refresh mutation 未命中");
    assert.throws(() => assertFrozenFixtureSource(sampleRefreshMutation, script, expectedDigest), /确定性离场样本未刷新 overlay/u, `${script} 删除样本刷新后仍通过结构门`);
    const prewarmBoundaryMutation = source.replace("rect.width + prewarm - 64", "rect.width - 64");
    assert.notEqual(prewarmBoundaryMutation, source, "overlay pan prewarm boundary mutation 未命中");
    assert.throws(() => assertFrozenFixtureSource(prewarmBoundaryMutation, script, expectedDigest), /确定性样本未贴近预热外沿/u, `${script} 恢复 viewport 内沿样本后仍通过结构门`);
    const preparedSampleMutation = source.replace('  assert(before.forcedExitPrepared, "确定性离场样本在平移前未进入 visible/buffered 集");\n', "");
    assert.notEqual(preparedSampleMutation, source, "overlay pan prepared sample mutation 未命中");
    assert.throws(() => assertFrozenFixtureSource(preparedSampleMutation, script, expectedDigest), /未硬证平移前样本已渲染/u, `${script} 删除平移前样本门后仍通过结构门`);
    const setupSignalMutation = source.replace("operation-stall|main-thread-long-task|render-frame-gap|input-handler-stall", "main-thread-long-task|render-frame-gap|input-handler-stall");
    assert.notEqual(setupSignalMutation, source, "overlay pan setup signal mutation 未命中");
    assert.throws(() => assertFrozenFixtureSource(setupSignalMutation, script, expectedDigest), /启动性能信号分类不完整/u, `${script} 删除 setup operation-stall 分类后仍通过结构门`);
    const previewEvidenceMutation = source.replace("    previewEvents,\n", "");
    assert.notEqual(previewEvidenceMutation, source, "overlay pan preview evidence mutation 未命中");
    assert.throws(() => assertFrozenFixtureSource(previewEvidenceMutation, script, expectedDigest), /raw preview events 证据不完整/u, `${script} 删除 raw preview events 后仍通过结构门`);
    overlayPanServerMutationCases += 10;
  }
  if (script === "tools/webgl-generator-viewport-line-preview-browser-regression.mjs") {
    const setupSignalMutation = source.replace("operation-stall|main-thread-long-task|render-frame-gap|input-handler-stall", "main-thread-long-task|render-frame-gap|input-handler-stall");
    assert.notEqual(setupSignalMutation, source, "viewport line setup signal mutation 未命中");
    assert.throws(() => assertFrozenFixtureSource(setupSignalMutation, script, expectedDigest), /启动性能信号分类不完整/u, `${script} 删除 setup operation-stall 分类后仍通过结构门`);
    const earlyArtifactMutation = source.replace("  evidence.setResult(finalReport, compactReport);\n", "");
    assert.notEqual(earlyArtifactMutation, source, "viewport line early artifact mutation 未命中");
    assert.throws(() => assertFrozenFixtureSource(earlyArtifactMutation, script, expectedDigest), /未在任何硬断言前保存 report/u, `${script} 删除硬断言前 artifact 后仍通过结构门`);
    viewportLinePreviewMutationCases += 2;
  }
  if (script === "tools/webgl-generator-browser-storage-backward-compatibility-regression.mjs") {
    const earlyArtifactMutation = source.replace("  evidence.setResult(finalReport, compactReport);\n", "");
    assert.notEqual(earlyArtifactMutation, source, "storage compatibility early artifact mutation 未命中");
    assert.throws(() => assertFrozenFixtureSource(earlyArtifactMutation, script, expectedDigest), /未在任何硬断言前保存 report/u, `${script} 删除硬断言前 artifact 后仍通过结构门`);
    const toleranceMutation = source.replace("partitionTask350StartupLongTasks(startupBaselineLongTasks, legacyReloadLongTasks, 50)", "partitionTask350StartupLongTasks(startupBaselineLongTasks, legacyReloadLongTasks, 200)");
    assert.notEqual(toleranceMutation, source, "storage compatibility tolerance mutation 未命中");
    assert.throws(() => assertFrozenFixtureSource(toleranceMutation, script, expectedDigest), /共同启动匹配容差漂移|legacy reload 未按 50ms/u, `${script} 放宽共同启动匹配容差后仍通过结构门`);
    const setupMutation = source.replace('setupLongTasks.push(...await collectTask350LongTaskWindow(page, "legacy-preparation"));', 'longTasks.push(...await collectTask350LongTaskWindow(page, "legacy-preparation"));');
    assert.notEqual(setupMutation, source, "storage compatibility setup mutation 未命中");
    assert.throws(() => assertFrozenFixtureSource(setupMutation, script, expectedDigest), /legacy preparation 未保持 setup-only/u, `${script} 把夹具准备计入产品窗口后仍通过结构门`);
    const activeMutation = source.replace("longTasks.push(...partition.active);", "void partition.active;");
    assert.notEqual(activeMutation, source, "storage compatibility active mutation 未命中");
    assert.throws(() => assertFrozenFixtureSource(activeMutation, script, expectedDigest), /未匹配 reload 任务未进入活动硬门/u, `${script} 丢弃未匹配 reload 任务后仍通过结构门`);
    storageCompatibilityPartitionMutationCases += 4;
  }
  if (script === "tools/webgl-generator-browser-storage-fallback-regression.mjs") {
    const earlyArtifactMutation = source.replace("  evidence.setResult(finalReport, compactReport);\n", "");
    assert.notEqual(earlyArtifactMutation, source, "storage fallback early artifact mutation 未命中");
    assert.throws(() => assertFrozenFixtureSource(earlyArtifactMutation, script, expectedDigest), /未在任何硬断言前保存 report/u, `${script} 删除硬断言前 artifact 后仍通过结构门`);
    const recordMutation = source.replace('assert.equal(indexedDbRecord.rawType, "object"', 'assert.equal(indexedDbRecord.rawType, "string"');
    assert.notEqual(recordMutation, source, "storage fallback record mutation 未命中");
    assert.throws(() => assertFrozenFixtureSource(recordMutation, script, expectedDigest), /direct-binary record 契约漂移/u, `${script} 恢复 10k string envelope 后仍通过结构门`);
    const restoreMutation = source.replace('assert.ok(restored.data.effects.includes("browser-storage-binary-read"));', 'assert.ok(restored.data.effects.includes("browser-storage-fallback-read"));');
    assert.notEqual(restoreMutation, source, "storage fallback restore mutation 未命中");
    assert.throws(() => assertFrozenFixtureSource(restoreMutation, script, expectedDigest), /direct-binary restore 契约漂移/u, `${script} 恢复 10k fallback-read 后仍通过结构门`);
    const mainSetupMutation = source.replace('setupLongTasks.push(...await collectTask350LongTaskWindow(page, `fallback-setup-${requestedCells}`));', 'void await collectTask350LongTaskWindow(page, `fallback-setup-${requestedCells}`);');
    assert.notEqual(mainSetupMutation, source, "storage fallback main setup mutation 未命中");
    assert.throws(() => assertFrozenFixtureSource(mainSetupMutation, script, expectedDigest), /主上下文生成未保持 raw setup/u, `${script} 丢弃主上下文 setup 后仍通过结构门`);
    const normalSetupMutation = source.replace('setupLongTasks.push(...await collectTask350LongTaskWindow(normalPage, "direct-binary-setup-10000"));', 'void await collectTask350LongTaskWindow(normalPage, "direct-binary-setup-10000");');
    assert.notEqual(normalSetupMutation, source, "storage fallback normal setup mutation 未命中");
    assert.throws(() => assertFrozenFixtureSource(normalSetupMutation, script, expectedDigest), /normal 上下文生成未保持 raw setup/u, `${script} 丢弃 normal setup 后仍通过结构门`);
    const normalRecordMutation = source.replace('assert.equal(normalIndexedDbRecord.rawType, "object");', 'assert.equal(normalIndexedDbRecord.rawType, "string");');
    assert.notEqual(normalRecordMutation, source, "storage fallback normal record mutation 未命中");
    assert.throws(() => assertFrozenFixtureSource(normalRecordMutation, script, expectedDigest), /normal direct-binary record 契约漂移/u, `${script} normal 恢复 string envelope 后仍通过结构门`);
    const normalRestoreMutation = source.replace('assert.ok(normalRestored.data.effects.includes("browser-storage-binary-read"));', 'assert.ok(normalRestored.data.effects.includes("browser-storage-fallback-read"));');
    assert.notEqual(normalRestoreMutation, source, "storage fallback normal restore mutation 未命中");
    assert.throws(() => assertFrozenFixtureSource(normalRestoreMutation, script, expectedDigest), /normal direct-binary restore 契约漂移/u, `${script} normal 恢复 fallback-read 后仍通过结构门`);
    storageFallbackDirectBinaryMutationCases += 7;
  }
  if (script === "tools/webgl-generator-loading-single-source-browser-regression.mjs") {
    const earlyArtifactMutation = source.replace("  evidence.setResult(finalReport, compactReport);\n", "");
    assert.notEqual(earlyArtifactMutation, source, "loading single source early artifact mutation 未命中");
    assert.throws(() => assertFrozenFixtureSource(earlyArtifactMutation, script, expectedDigest), /未在任何硬断言前保存 report/u, `${script} 删除首断言前 artifact 后仍通过结构门`);
    const staleTextProbeMutation = source.replace('Object.defineProperty(delayedFile, "arrayBuffer"', 'Object.defineProperty(delayedFile, "text"');
    assert.notEqual(staleTextProbeMutation, source, "loading single source stale text probe mutation 未命中");
    assert.throws(() => assertFrozenFixtureSource(staleTextProbeMutation, script, expectedDigest), /未探测真实 arrayBuffer 读取路径/u, `${script} 恢复过时 text probe 后仍通过结构门`);
    const fakeBytesMutation = source.replace("return originalArrayBuffer();", "return exported.text;");
    assert.notEqual(fakeBytesMutation, source, "loading single source fake bytes mutation 未命中");
    assert.throws(() => assertFrozenFixtureSource(fakeBytesMutation, script, expectedDigest), /未返回原始文件 bytes/u, `${script} 返回字符串而非原始 bytes 后仍通过结构门`);
    const wrongStableStageMutation = source.replace('stage: "after-renderer-load", operationName: "data.importMap"', 'stage: "prepared-install", operationName: "data.importMap"');
    assert.notEqual(wrongStableStageMutation, source, "loading single source stable stage mutation 未命中");
    assert.throws(() => assertFrozenFixtureSource(wrongStableStageMutation, script, expectedDigest), /未使用稳定 after-renderer-load 故障阶段/u, `${script} 恢复 renderer 私有阶段后仍通过结构门`);
    const missingStableCleanupMutation = source.replace("delete window.__webglGeneratorMapReplaceFault;", "void window.__webglGeneratorMapReplaceFault;");
    assert.notEqual(missingStableCleanupMutation, source, "loading single source stable cleanup mutation 未命中");
    assert.throws(() => assertFrozenFixtureSource(missingStableCleanupMutation, script, expectedDigest), /未在 finally 清理稳定故障钩子/u, `${script} 删除稳定故障钩子 cleanup 后仍通过结构门`);
    const privateRendererMutation = source.replace("const rollbackMap = app.map;", "app.renderer.loadMapAsync = async () => {};\n    const rollbackMap = app.map;");
    assert.notEqual(privateRendererMutation, source, "loading single source private renderer mutation 未命中");
    assert.throws(() => assertFrozenFixtureSource(privateRendererMutation, script, expectedDigest), /仍覆写 renderer 私有装载方法/u, `${script} 恢复 renderer monkey-patch 后仍通过结构门`);
    const missingCauseMutation = source.replace("cause: depth < 4 ? serializeError(error.cause, depth + 1) : null", "cause: null");
    assert.notEqual(missingCauseMutation, source, "loading single source nested cause mutation 未命中");
    assert.throws(() => assertFrozenFixtureSource(missingCauseMutation, script, expectedDigest), /未递归保存 nested error cause/u, `${script} 丢失 nested error cause 后仍通过结构门`);
    const missingRiverMirrorInvalidation = source.replace('app.workerTaskCoordinator.invalidateSession("fixture-loading-river-conflict-direct-map-mutation");', 'void app.workerTaskCoordinator;');
    assert.notEqual(missingRiverMirrorInvalidation, source, "loading single source river mirror invalidation mutation 未命中");
    assert.throws(() => assertFrozenFixtureSource(missingRiverMirrorInvalidation, script, expectedDigest), /未在河流直接篡改后失效 Worker mirror/u, `${script} 删除河流 Worker mirror 失效后仍通过结构门`);
    const earlyRiverMirrorInvalidation = source.replace(
      'river.cells[1] = invalid;\n      app.workerTaskCoordinator.invalidateSession("fixture-loading-river-conflict-direct-map-mutation");',
      'app.workerTaskCoordinator.invalidateSession("fixture-loading-river-conflict-direct-map-mutation");\n      river.cells[1] = invalid;'
    );
    assert.notEqual(earlyRiverMirrorInvalidation, source, "loading single source river mirror order mutation 未命中");
    assert.throws(() => assertFrozenFixtureSource(earlyRiverMirrorInvalidation, script, expectedDigest), /未在河流直接篡改后失效 Worker mirror/u, `${script} 河流 Worker mirror 过早失效后仍通过结构门`);
    const lateFixtureWindowStart = source.replace(
      'results.fixtureSetupWindow = {kind: "fixture-export-map", startTime: performance.now(), endTime: null};\n    const exported = app.runtimeActions.data.exportMap({download: false, includeText: true});',
      'const exported = app.runtimeActions.data.exportMap({download: false, includeText: true});\n    results.fixtureSetupWindow = {kind: "fixture-export-map", startTime: performance.now(), endTime: null};'
    );
    assert.notEqual(lateFixtureWindowStart, source, "loading single source fixture window start mutation 未命中");
    assert.throws(() => assertFrozenFixtureSource(lateFixtureWindowStart, script, expectedDigest), /未精确包围夹具同步导出/u, `${script} 导出后才启动 fixture window 后仍通过结构门`);
    const missingFixturePartition = source.replace("const target = overlapsWindow(task, report.fixtureSetupWindow) ? fixtureSetupLongTasks : longTasks;", "const target = longTasks;");
    assert.notEqual(missingFixturePartition, source, "loading single source fixture partition mutation 未命中");
    assert.throws(() => assertFrozenFixtureSource(missingFixturePartition, script, expectedDigest), /未把夹具导出 LongTask 单列/u, `${script} 删除 fixture LongTask 分区后仍通过结构门`);
    const missingFixtureArtifact = source.replace("healthErrors, fixtureSetupLongTasks, longTasks, performance", "healthErrors, longTasks, performance");
    assert.notEqual(missingFixtureArtifact, source, "loading single source fixture artifact mutation 未命中");
    assert.throws(() => assertFrozenFixtureSource(missingFixtureArtifact, script, expectedDigest), /artifact 缺少夹具导出 LongTask/u, `${script} artifact 丢失 fixture LongTask 后仍通过结构门`);
    loadingSingleSourceProbeMutationCases += 12;
  }
  if (script === "tools/webgl-generator-delayed-operation-feedback-browser-regression.mjs") {
    const missingFailureCollection = source.replace('const longTasks = await collectTask350LongTaskWindow(page, "feedback-chunk-failure");', "const longTasks = [];");
    assert.notEqual(missingFailureCollection, source, "delayed feedback pre-reload collection mutation 未命中");
    assert.throws(() => assertFrozenFixtureSource(missingFailureCollection, script, expectedDigest), /重载前分包失败窗口未单独收集/u, `${script} 丢失重载前窗口后仍通过结构门`);
    const missingPostReloadReset = source.replace(
      '  ]);\n  await waitForApiReady(page, timeoutMs);\n  await resetTask350LongTaskWindow(page);',
      '  ]);\n  await waitForApiReady(page, timeoutMs);'
    );
    assert.notEqual(missingPostReloadReset, source, "delayed feedback post-reload reset mutation 未命中");
    assert.throws(() => assertFrozenFixtureSource(missingPostReloadReset, script, expectedDigest), /重载 ready 后未重置启动 LongTask/u, `${script} 丢失重载后 reset 后仍通过结构门`);
    const missingRecoveryCollection = source.replace('longTasks.push(...await collectTask350LongTaskWindow(page, "feedback-chunk-recovery"));', "void longTasks;");
    assert.notEqual(missingRecoveryCollection, source, "delayed feedback recovery collection mutation 未命中");
    assert.throws(() => assertFrozenFixtureSource(missingRecoveryCollection, script, expectedDigest), /重载后恢复窗口未进入目标 LongTask/u, `${script} 丢失恢复窗口后仍通过结构门`);
    delayedOperationFeedbackPartitionMutationCases += 3;
  }
}

console.log(JSON.stringify({
  ok: true,
  fixedEntries: entries.length,
  uniqueFixtures: expectedFixtureDigests.size,
  fixtureStatus: "frozen",
  syntaxChecks,
  mutationCases,
  pointBufferContractMutationCases,
  gridTopologyContractMutationCases,
  directLockContractMutationCases,
  compoundLockContractMutationCases,
  cityPickingDiagnosticMutationCases,
  overlayPanServerMutationCases,
  viewportLinePreviewMutationCases,
  storageCompatibilityPartitionMutationCases,
  storageFallbackDirectBinaryMutationCases,
  loadingSingleSourceProbeMutationCases,
  delayedOperationFeedbackPartitionMutationCases,
  browserRuns: 0
}, null, 2));

function assertFrozenFixtureSource(source, script, expectedDigest) {
  const owners = entries.filter(item => item.script === script);
  assert.ok(owners.length > 0, `${script} 缺少 catalog owner`);
  assert.ok(owners.every(item => item.artifactPolicy === "full-compact-finally"), `${script} artifact policy 漂移`);
  const ast = parse(source, {sourceType: "module", plugins: ["topLevelAwait"]});
  assert.ok(collect(ast.program, node => node.type === "TryStatement" && node.finalizer?.type === "BlockStatement").length > 0, `${script} 缺少 executable finally cleanup`);
  if (script === "tools/webgl-generator-worker-session-browser-regression.mjs") assertWorkerSessionPointBufferContracts(ast.program);
  if (script === "tools/webgl-generator-grid-topology-browser-regression.mjs") assertGridTopologyTask350Contracts(source);
  if (script === "tools/webgl-generator-regeneration-lock-direct-domains-browser-regression.mjs") assertDirectDomainLockTask350Contracts(source);
  if (script === "tools/webgl-generator-regeneration-lock-compound-browser-regression.mjs") assertCompoundLockTask350Contracts(source);
  if (script === "tools/webgl-generator-city-picking-browser-regression.mjs") assertCityPickingNavigationDiagnostics(source);
  if (script === "tools/webgl-generator-overlay-pan-stability-browser-regression.mjs") assertOverlayPanSelfHostedServer(source);
  if (script === "tools/webgl-generator-viewport-line-preview-browser-regression.mjs") assertViewportLinePreviewDiagnostics(source);
  if (script === "tools/webgl-generator-browser-storage-backward-compatibility-regression.mjs") assertStorageCompatibilityPartition(source, ast.program);
  if (script === "tools/webgl-generator-browser-storage-fallback-regression.mjs") assertStorageFallbackDirectBinary(source, ast.program);
  if (script === "tools/webgl-generator-loading-single-source-browser-regression.mjs") assertLoadingSingleSourceFileProbe(source, ast.program);
  if (script === "tools/webgl-generator-delayed-operation-feedback-browser-regression.mjs") assertDelayedOperationFeedbackRecoveryPartition(source);
  const usesSharedArtifact = collect(ast.program, node => node.type === "CallExpression" && callName(node.callee) === "createTask350BrowserArtifact").length > 0;
  const writeCalls = collect(ast.program, node => node.type === "CallExpression" && callName(node.callee) === "writeFileSync");
  const artifactNames = collect(ast.program, node => node.type === "StringLiteral").map(node => node.value);
  const usesExplicitArtifactPair = writeCalls.length >= 2
    && artifactNames.some(value => value.endsWith("full.json"))
    && artifactNames.some(value => value.endsWith("summary.json"));
  assert.ok(usesSharedArtifact || usesExplicitArtifactPair, `${script} 缺少 full/compact artifact pair`);
  if (owners.some(item => item.performancePolicy !== "presentation-zero-product-work")) {
    const observerCalls = collect(ast.program, node => (node.type === "NewExpression" && callName(node.callee) === "PerformanceObserver")
      || (node.type === "CallExpression" && callName(node.callee) === "prepareTask350LongTaskObserver"));
    assert.ok(observerCalls.length > 0, `${script} 缺少 executable LongTask observer`);
    const directBudgets = collect(ast.program, node => node.type === "BinaryExpression"
      && node.operator === ">"
      && ((node.right?.type === "NumericLiteral" && node.right.value === 200)
        || (node.right?.type === "Identifier" && ["longTaskBudgetMs", "budgetMs"].includes(node.right.name))));
    const helperBudgets = collect(ast.program, node => node.type === "CallExpression"
      && callName(node.callee) === "summarizeTask350LongTasks"
      && node.arguments[1]?.type === "NumericLiteral"
      && node.arguments[1].value === 200);
    assert.ok(directBudgets.length > 0 || helperBudgets.length > 0, `${script} 缺少 executable >200ms 硬线`);
  }
  assert.equal(programDigest(ast.program), expectedDigest, `${script} 规范 AST digest 漂移`);
}

function assertLoadingSingleSourceFileProbe(source, program) {
  const artifactResult = collect(program, node => node.type === "CallExpression" && callName(node.callee) === "evidence.setResult")[0];
  const firstHardAssertion = collect(program, node => node.type === "CallExpression" && isAssertion(node))[0];
  assert.ok(artifactResult && firstHardAssertion && artifactResult.start < firstHardAssertion.start, "loading single source 未在任何硬断言前保存 report");
  assert.match(source, /const originalArrayBuffer = delayedFile\.arrayBuffer\.bind\(delayedFile\);/u, "loading single source 未绑定原始 arrayBuffer");
  assert.match(source, /Object\.defineProperty\(delayedFile, "arrayBuffer"/u, "loading single source 未探测真实 arrayBuffer 读取路径");
  assert.match(source, /return originalArrayBuffer\(\);/u, "loading single source 未返回原始文件 bytes");
  assert.doesNotMatch(source, /Object\.defineProperty\(delayedFile, "text"/u, "loading single source 仍探测过时 text 路径");
  assert.match(source, /window\.__webglGeneratorMapReplaceFault = \{stage: "after-renderer-load", operationName: "data\.importMap", mode: "once", hits: 0\}/u, "loading single source 未使用稳定 after-renderer-load 故障阶段");
  assert.match(source, /finally \{\s*delete window\.__webglGeneratorMapReplaceFault;\s*\}/u, "loading single source 未在 finally 清理稳定故障钩子");
  assert.doesNotMatch(source, /app\.renderer\.(?:completePreparedMapLoadAsync|loadMapAsync)\s*=/u, "loading single source 仍覆写 renderer 私有装载方法");
  assert.match(source, /cause: depth < 4 \? serializeError\(error\.cause, depth \+ 1\) : null/u, "loading single source 未递归保存 nested error cause");
  assert.match(source, /report\.importRollbackFailure\.error\?\.code, "operation_failed"/u, "loading single source 未硬证统一 operation failure");
  assert.match(source, /report\.importRollbackFailure\.error\?\.cause\?\.code, "map_replace_debug_fault"/u, "loading single source 未硬证稳定故障原始错误码");
  assert.match(source, /report\.importRollbackFailure\.error\?\.cause\?\.stage, "after-renderer-load"/u, "loading single source 未硬证稳定故障原始阶段");
  assert.match(source, /report\.importRollbackState\?\.mapRestored, true/u, "loading single source 未硬证 canonical map 回滚");
  assert.match(source, /report\.importRollbackState\?\.rendererMapMatches, true/u, "loading single source 未硬证 renderer map 回滚");
  assert.match(source, /results\.fixtureSetupWindow = \{kind: "fixture-export-map", startTime: performance\.now\(\), endTime: null\};\s*const exported = app\.runtimeActions\.data\.exportMap\(\{download: false, includeText: true\}\);\s*results\.fixtureSetupWindow\.endTime = performance\.now\(\);/u, "loading single source 未精确包围夹具同步导出");
  assert.match(source, /const target = overlapsWindow\(task, report\.fixtureSetupWindow\) \? fixtureSetupLongTasks : longTasks;/u, "loading single source 未把夹具导出 LongTask 单列");
  assert.match(source, /const finalReport = \{ok: false, report, consoleErrors, pageErrors, healthErrors, fixtureSetupLongTasks, longTasks, performance\};/u, "loading single source artifact 缺少夹具导出 LongTask");
  const riverMutationIndex = source.indexOf("river.cells[1] = invalid;");
  const riverMirrorInvalidationIndex = source.indexOf('app.workerTaskCoordinator.invalidateSession("fixture-loading-river-conflict-direct-map-mutation");');
  const riverRegenerationIndex = source.indexOf('return app.runtimeActions.generate.regenerate("rivers", {confirm: true});');
  assert.ok(riverMutationIndex >= 0 && riverMutationIndex < riverMirrorInvalidationIndex && riverMirrorInvalidationIndex < riverRegenerationIndex, "loading single source 未在河流直接篡改后失效 Worker mirror");
}

function assertDelayedOperationFeedbackRecoveryPartition(source) {
  assert.match(source, /const longTasks = await collectTask350LongTaskWindow\(page, "feedback-chunk-failure"\);[\s\S]*?page\.waitForNavigation\(\{waitUntil: "domcontentloaded"\}\)[\s\S]*?await waitForApiReady\(page, timeoutMs\);\s*await resetTask350LongTaskWindow\(page\);\s*await page\.evaluate\(\(\) => document\.getElementById\("open-state-panel"\)\?\.click\(\)\);/u, "delayed feedback 重载前分包失败窗口未单独收集或重载 ready 后未重置启动 LongTask");
  assert.match(source, /longTasks\.push\(\.\.\.await collectTask350LongTaskWindow\(page, "feedback-chunk-recovery"\)\);/u, "delayed feedback 重载后恢复窗口未进入目标 LongTask");
}

function assertStorageFallbackDirectBinary(source, program) {
  const artifactResult = collect(program, node => node.type === "CallExpression" && callName(node.callee) === "evidence.setResult")[0];
  const firstHardAssertion = collect(program, node => node.type === "CallExpression" && isAssertion(node))[0];
  assert.ok(artifactResult && firstHardAssertion && artifactResult.start < firstHardAssertion.start, "storage fallback 未在任何硬断言前保存 report");
  assert.match(source, /assert\.equal\(indexedDbRecord\.rawType, "object"/u, "storage fallback direct-binary record 契约漂移");
  assert.match(source, /assert\.equal\(indexedDbRecord\.type, "webgl-generator-browser-map-gzip"\)/u, "storage fallback direct-binary record 契约漂移");
  assert.match(source, /assert\.ok\(restored\.data\.effects\.includes\("browser-storage-binary-read"\)\)/u, "storage fallback direct-binary restore 契约漂移");
  assert.match(source, /assert\.equal\(restored\.data\.effects\.includes\("browser-storage-fallback-read"\), false\)/u, "storage fallback direct-binary restore 契约漂移");
  assert.match(source, /assert\.equal\(normalIndexedDbRecord\.rawType, "object"\)/u, "storage fallback normal direct-binary record 契约漂移");
  assert.match(source, /assert\.equal\(normalIndexedDbRecord\.type, "webgl-generator-browser-map-gzip"\)/u, "storage fallback normal direct-binary record 契约漂移");
  assert.match(source, /assert\.ok\(normalRestored\.data\.effects\.includes\("browser-storage-binary-read"\)\)/u, "storage fallback normal direct-binary restore 契约漂移");
  assert.match(source, /assert\.equal\(normalRestored\.data\.effects\.includes\("browser-storage-fallback-read"\), false\)/u, "storage fallback normal direct-binary restore 契约漂移");
  assert.match(source, /setupLongTasks\.push\(\.\.\.await collectTask350LongTaskWindow\(page, `fallback-setup-\$\{requestedCells\}`\)\);\s*await resetTask350LongTaskWindow\(page\);/u, "storage fallback 主上下文生成未保持 raw setup");
  assert.match(source, /setupLongTasks\.push\(\.\.\.await collectTask350LongTaskWindow\(normalPage, "direct-binary-setup-10000"\)\);\s*await resetTask350LongTaskWindow\(normalPage\);/u, "storage fallback normal 上下文生成未保持 raw setup");
}

function assertStorageCompatibilityPartition(source, program) {
  const artifactResult = collect(program, node => node.type === "CallExpression" && callName(node.callee) === "evidence.setResult")[0];
  const firstHardAssertion = collect(program, node => node.type === "CallExpression" && isAssertion(node))[0];
  assert.ok(artifactResult && firstHardAssertion && artifactResult.start < firstHardAssertion.start, "storage compatibility 未在任何硬断言前保存 report");
  assert.match(source, /collectTask350LongTaskWindow\(page, "cold-startup-control"\)/u, "storage compatibility 缺少 cold startup raw 证据");
  assert.match(source, /startupBaselineLongTasks\.push\(\.\.\.await collectTask350LongTaskWindow\(page, "clean-reload-control"\)\)/u, "storage compatibility 缺少 clean reload 基线");
  assert.match(source, /setupLongTasks\.push\(\.\.\.await collectTask350LongTaskWindow\(page, "legacy-preparation"\)\)/u, "storage compatibility legacy preparation 未保持 setup-only");
  assert.match(source, /partitionTask350StartupLongTasks\(startupBaselineLongTasks, legacyReloadLongTasks, 50\)/u, "storage compatibility legacy reload 未按 50ms 与 clean baseline 分区");
  assert.match(source, /partitionTask350StartupLongTasks\(startupBaselineLongTasks, corruptReloadLongTasks, 50\)/u, "storage compatibility corrupt reload 未按 50ms 与 clean baseline 分区");
  assert.match(source, /sharedStartupLongTasks\.push\(\.\.\.partition\.sharedStartup\);\s*longTasks\.push\(\.\.\.partition\.active\);/u, "storage compatibility 未匹配 reload 任务未进入活动硬门");
}

function assertCityPickingNavigationDiagnostics(source) {
  assert.match(source, /server: \{host, port, strictPort: true, hmr: false\}/u, "city picking 未关闭 Vite HMR");
  assert.match(source, /page\.on\("framenavigated"/u, "city picking 缺少 main-frame navigation 诊断");
  assert.match(source, /evidence\.setResult\(\{ok: false, reports, consoleErrors, healthErrors, pageErrors, navigationEvents, browserLifecycle, activeTarget, activePhase\}/u, "city picking 失败前未保存 navigation artifact");
  assert.match(source, /const finalReport = \{ok: true, reports, consoleErrors, pageErrors, navigationEvents\}/u, "city picking 成功 artifact 缺少 navigation 诊断");
}

function assertOverlayPanSelfHostedServer(source) {
  assert.match(source, /server = await startStaticServer\(\);/u, "overlay pan 未等待自托管 server 监听");
  assert.match(source, /\["overlay-pan-server", server \? \(\) => new Promise\(\(resolveClose, rejectClose\) => server\.close/u, "overlay pan 自托管 server 未纳入 finally");
  assert.match(source, /requested === distDir \|\| requested\.startsWith\(`\$\{distDir\}\$\{sep\}`\)/u, "overlay pan 静态文件目录边界可被同前缀 sibling 绕过");
  assert.doesNotMatch(source, /process\.argv\.find\(value => value\.startsWith\("http"\)\)/u, "overlay pan 仍依赖外部常驻 server");
  const artifactResultIndex = source.indexOf("evidence.setResult(finalReport, compactReport);");
  const exitingAssertionIndex = source.indexOf('assert(enteringPolitical.length > 0, "平移没有产生政治标签缓冲移入样本")');
  assert.ok(artifactResultIndex >= 0 && artifactResultIndex < exitingAssertionIndex, "overlay pan 未在离场样本硬断言前保存 report");
  assert.match(source, /renderer\.markerIconItems\.find\(item => item\.category === "resource"\)/u, "overlay pan 四类确定性离场样本不完整");
  assert.match(source, /renderer\.markerIconItems\.find\(item => item\.category !== "resource"\)/u, "overlay pan 四类确定性离场样本不完整");
  assert.match(source, /renderer\.updateLabels\(\);/u, "overlay pan 确定性离场样本未刷新 overlay");
  assert.match(source, /const prewarm = Math\.min\(720, Math\.max\(192, Math\.max\(rect\.width, rect\.height\) \* 0\.5\)\);[\s\S]*rect\.width \+ prewarm - 64[\s\S]*-prewarm \+ 64/u, "overlay pan 确定性样本未贴近预热外沿");
  assert.match(source, /operation-stall\|main-thread-long-task\|render-frame-gap\|input-handler-stall/u, "overlay pan 启动性能信号分类不完整");
  assert.ok((source.match(/\bpreviewEvents,\r?\n/gu) || []).length >= 2, "overlay pan raw preview events 证据不完整");
  assert.match(source, /for \(const key of before\.forcedExitKeys\) assert\(exiting\.some\(item => item\.key === key\)/u, "overlay pan 未硬证确定性样本真实离场");
  assert.match(source, /assert\(before\.forcedExitPrepared, "确定性离场样本在平移前未进入 visible\/buffered 集"\)/u, "overlay pan 未硬证平移前样本已渲染");
}

function assertViewportLinePreviewDiagnostics(source) {
  assert.match(source, /operation-stall\|main-thread-long-task\|render-frame-gap\|input-handler-stall/u, "viewport line 启动性能信号分类不完整");
  assert.ok((source.match(/\bsetupPerformanceSignals\b/gu) || []).length >= 4, "viewport line setup 性能信号 artifact 不完整");
  const setupBoundaryIndex = source.indexOf("  await waitForViewportIdle(page);");
  const partitionIndex = source.indexOf("  const activeConsoleErrors = consoleErrors.filter");
  const interactionIndex = source.indexOf("  await page.mouse.move(center.x, center.y);");
  assert.ok(setupBoundaryIndex >= 0 && setupBoundaryIndex < partitionIndex && partitionIndex < interactionIndex, "viewport line setup 性能分区边界漂移");
  const artifactResultIndex = source.indexOf("  evidence.setResult(finalReport, compactReport);");
  const firstHardAssertionIndex = source.indexOf("  assert.ok(existsSync(distDir)");
  assert.ok(artifactResultIndex >= 0 && artifactResultIndex < firstHardAssertionIndex, "viewport line 未在任何硬断言前保存 report");
}

function assertDirectDomainLockTask350Contracts(source) {
  assert.match(source, /if \(rebuild\.executed !== false\) throw new Error\("紧邻市场归属的确定性经济重算没有返回空 patch no-op"\)/u, "direct lock 未硬拒绝非空 patch");
  assert.match(source, /rebuild\.operation\?\.name !== "edit\.economy\.rebuild" \|\| rebuild\.operation\?\.status !== "success" \|\| rebuild\.changedPaths\?\.length !== 0/u, "direct lock 未冻结公开 rebuild 空 patch receipt");
  assert.match(source, /rebuild\.worker\?\.session\?\.committed !== true \|\| rebuild\.worker\?\.session\?\.pending !== false/u, "direct lock 未冻结空 patch Worker session commit");
  assert.match(source, /main-thread-long-task\|render-frame-gap\|operation-stall\|input-handler-stall/u, "direct lock 丢失 operation-stall 性能分类");
  assert.match(source, /const \{computeCanonicalMapReplicaChecksum\} = await import\("\/__task350-source\/runtime\/map-replica-checksum\.js"\)/u, "direct lock 未接入 canonical 全图 checksum");
  assert.match(source, /revision: \+\+snapshotAuditRevision/u, "direct lock checksum 未使用唯一 audit revision");
  assert.match(source, /budgetMs: 4\r?\n\s+\}\)/u, "direct lock checksum 可让出预算漂移");
  assert.equal(source.match(/await noWriteTransactionSnapshot\(/gu)?.length, 12, "direct lock no-write 前后快照未全部等待 canonical checksum");
  assert.doesNotMatch(source, /map:\s*JSON\.stringify\(app\.map\)/u, "direct lock 仍同步序列化完整地图");
  assert.match(source, /assertSameTransaction\(rebuildTxBefore, await noWriteTransactionSnapshot\("economy"\), "经济重算空 patch no-op"\)/u, "direct lock 未冻结 rebuild canonical 空 patch history");
  assert.match(source, /report\.final\.session === null \|\| \(report\.final\.session\?\.status === "idle" && report\.final\.session\?\.pending !== true\)/u, "direct lock 最终协调器未按 null-or-idle/non-pending 验收");
  assert.doesNotMatch(source, /assertSingleTransaction\(rebuildTxBefore/u, "direct lock 仍为 deterministic 空 patch 强求新事务");
  assert.match(source, /if \(!assignment\.executed\) throw new Error\("未锁市场归属没有执行"\)/u, "direct lock 丢失 assignment 真实执行门");
  assert.match(source, /if \(economyNoop\.executed !== false\) throw new Error\("经济双域全锁没有返回 no-op"\)/u, "direct lock 丢失双域全锁 no-op 门");
}

function assertCompoundLockTask350Contracts(source) {
  assert.match(source, /systems: \["religions", "markers"\]/u, "compound lock 气候成功场景仍选择会引入 states 的系统");
  assert.doesNotMatch(source, /systems: \["religions", "markers", "diplomacy", "military", "zones"\]/u, "compound lock 气候成功场景仍选择会引入 states 的系统");
  assert.match(source, /main-thread-long-task\|render-frame-gap\|operation-stall\|input-handler-stall/u, "compound lock 丢失 operation-stall 性能分类");
  assert.match(source, /report\.final\.session === null \|\| \(report\.final\.session\?\.status === "idle" && report\.final\.session\?\.pending !== true\)/u, "compound lock 最终协调器未按 null-or-idle/non-pending 验收");
  assert.doesNotMatch(source, /coordinator\.run\s*=/u, "compound lock 仍直接写入冻结 coordinator.run");
  assert.match(source, /const faultCoordinator = Object\.freeze\(\{\s*\.\.\.coordinator,/u, "compound lock 故障 facade 未完整转发 coordinator");
  assert.match(source, /app\.workerTaskCoordinator = faultCoordinator;/u, "compound lock 未安装局部 fault coordinator facade");
  assert.match(source, /task !== "ocean-current-world\.compute"/u, "compound lock 故障注入未限定 ocean-current-world.compute");
  assert.match(source, /\{\.\.\.payload, faultAt: "after:rivers"\}/u, "compound lock 未在 coordinator payload 注入 after:rivers");
  assert.match(source, /sessionPayload: \{\.\.\.runOptions\.sessionPayload, faultAt: "after:rivers"\}/u, "compound lock 故障注入未覆盖复用 session payload");
  assert.match(source, /finally\s*\{\s*app\.workerTaskCoordinator = coordinator;\s*\}/u, "compound lock 故障注入未在 finally 恢复 coordinator");
  assert.match(source, /faultInjectionCalls !== 1/u, "compound lock 故障注入调用次数未锁定为一次");
  assert.doesNotMatch(source, /seed: "lock-compound-fault",\s*faultAt:/u, "compound lock 仍把 faultAt 作为 runtime action 参数");
  assert.match(source, /timeline: report\.timeline,/u, "compound lock 失败摘要缺少阶段时间线");
  const artifactResultIndex = source.indexOf("evidence.setResult(fullResult, compactResult);");
  const longTaskAssertionIndex = source.indexOf('assert.deepEqual(overBudgetLongTasks, [], "复合锁门出现 >200ms LongTask")');
  assert.ok(artifactResultIndex >= 0 && artifactResultIndex < longTaskAssertionIndex, "compound lock 未在 LongTask 硬断言前保存 report");
}

function assertGridTopologyTask350Contracts(source) {
  assert.match(source, /session: execution\?\.worker\?\.session \|\| null/u, "grid topology 未使用最终 execution session receipt");
  assert.match(source, /report\.workerRun\.session\?\.committed === true && report\.workerRun\.session\?\.pending === false/u, "grid topology 未硬证最终 committed / non-pending session");
  assert.match(source, /report\.finalSession === null \|\| \(report\.finalSession\?\.status === "idle" && report\.finalSession\?\.pending !== true\)/u, "grid topology 未按 invalidated-or-idle 验 final coordinator");
  assert.match(source, /operation-stall\|input-handler-stall/u, "grid topology 未保留 operation/input stall 性能信号");
  assert.match(source, /additionalPerformanceHealthTypes = new Set\(\["operation-stall", "input-handler-stall"\]\)/u, "grid topology 未在 health events 保留 operation/input stall 性能信号");
  assert.match(source, /report\.healthErrors\.total === 0/u, "grid topology passed 未读取重分类后的 application health total");
  assert.doesNotMatch(source, /diagnostics\.healthErrors\.total === 0/u, "grid topology passed 仍读取重分类前的 health total");
  assert.doesNotMatch(source, /report\.elapsedMs\s*<\s*20_000/u, "grid topology 仍把旧 C1 墙钟冒充 Task 350 响应硬门");
  assert.doesNotMatch(source, /afterRedoImmediateBytes\s*<\s*1536\s*\*\s*1024\s*\*\s*1024/u, "grid topology 仍把 GC 前瞬时堆冒充保留量硬门");
  assert.match(source, /afterRedoBytes\s*<\s*900\s*\*\s*1024\s*\*\s*1024/u, "grid topology 丢失 GC 后 900MiB 保留量硬门");
}

function assertWorkerSessionPointBufferContracts(program) {
  const expectedFunctions = new Map([
    ["runCommittedDisplayReplayGate", "after.buffers.point.size"],
    ["runCommittedLateContextGate", "after.buffers.point.byteLength"]
  ]);
  const functions = collect(program, node => node.type === "FunctionDeclaration" && expectedFunctions.has(node.id?.name));
  assert.deepEqual(
    functions.map(node => node.id.name).sort(),
    [...expectedFunctions.keys()].sort(),
    "worker session point 物理计数契约漂移：目标 gate 不唯一"
  );
  const stalePointCounts = collect(program, node => node.type === "ObjectProperty"
    && objectPropertyName(node) === "point"
    && callName(node.value) === "renderer.pointVertexCount");
  assert.equal(stalePointCounts.length, 0, "worker session point 物理计数契约漂移：仍存在 point ← renderer.pointVertexCount");

  for (const functionNode of functions) {
    const functionName = functionNode.id.name;
    const properties = collect(functionNode, node => node.type === "ObjectProperty");
    const propertySources = properties.map(node => [objectPropertyName(node), callName(node.value?.type === "CallExpression" ? node.value.callee : node.value)]);
    assert.equal(
      propertySources.filter(([key, value]) => key === "pointBuffer" && value === "renderer.pointBufferVertexCount").length,
      1,
      `${functionName} point 物理计数契约漂移：pointBuffer 必须唯一读取 renderer.pointBufferVertexCount`
    );
    assert.equal(
      propertySources.filter(([key, value]) => key === "pointVisible" && value === "renderer.pointVertexCount").length,
      1,
      `${functionName} point 物理计数契约漂移：pointVisible 必须唯一读取 renderer.pointVertexCount`
    );
    assert.equal(
      propertySources.filter(([key, value]) => key === "pointBufferExpected" && value === "renderer.pointDrawRanges.reduce").length,
      1,
      `${functionName} point 物理计数契约漂移：缺少完整 drawRanges 汇总`
    );
    assert.equal(
      propertySources.filter(([key, value]) => key === "pointVisibleExpected" && value === "renderer.pointDrawRanges.reduce").length,
      1,
      `${functionName} point 物理计数契约漂移：缺少可见 drawRanges 汇总`
    );
    const bytePath = expectedFunctions.get(functionName);
    const physicalByteAssertions = collect(functionNode, node => node.type === "CallExpression"
      && callName(node.callee) === "assert.equal"
      && callName(node.arguments[0]) === bytePath
      && node.arguments[1]?.type === "BinaryExpression"
      && node.arguments[1].operator === "*"
      && callName(node.arguments[1].left) === "after.counts.pointBuffer"
      && node.arguments[1].right?.type === "NumericLiteral"
      && node.arguments[1].right.value === 24);
    assert.equal(physicalByteAssertions.length, 1, `${functionName} point 物理计数契约漂移：GPU bytes 必须唯一绑定 pointBuffer × 24`);
  }
}

function fixtureDigest(source) {
  const ast = parse(source, {sourceType: "module", plugins: ["topLevelAwait"]});
  return programDigest(ast.program);
}

function programDigest(program) {
  return createHash("sha256").update(JSON.stringify(stripAstMetadata(program))).digest("hex");
}

function mutateFirstExecutableNode(source) {
  const ast = parse(source, {sourceType: "module", plugins: ["topLevelAwait"]});
  const assertion = collect(ast.program, node => node.type === "CallExpression" && isAssertion(node))[0];
  if (assertion) return `${source.slice(0, assertion.start)}assert.ok(true)${source.slice(assertion.end)}`;
  const call = collect(ast.program, node => node.type === "CallExpression")[0];
  assert.ok(call, "mutation 缺少可执行调用");
  return `${source.slice(0, call.start)}void 0${source.slice(call.end)}`;
}

function mutatePointBufferContract(source, functionName) {
  const ast = parse(source, {sourceType: "module", plugins: ["topLevelAwait"]});
  const functionNode = collect(ast.program, node => node.type === "FunctionDeclaration" && node.id?.name === functionName)[0];
  assert.ok(functionNode, `${functionName} mutation 缺少目标函数`);
  const property = collect(functionNode, node => node.type === "ObjectProperty"
    && objectPropertyName(node) === "pointBuffer"
    && callName(node.value) === "renderer.pointBufferVertexCount")[0];
  assert.ok(property, `${functionName} mutation 缺少 pointBuffer 计数属性`);
  return `${source.slice(0, property.start)}point: renderer.pointVertexCount${source.slice(property.end)}`;
}

function isAssertion(node) {
  const name = callName(node.callee);
  return name === "assert" || name.startsWith("assert.");
}

function callName(callee) {
  if (!callee) return "";
  if (callee.type === "Identifier") return callee.name;
  if (!["MemberExpression", "OptionalMemberExpression"].includes(callee.type)) return "";
  const object = callName(callee.object);
  const property = callee.computed ? callee.property?.value : callee.property?.name;
  return [object, property].filter(Boolean).join(".");
}

function objectPropertyName(property) {
  if (!property || property.type !== "ObjectProperty") return "";
  if (property.computed) return property.key?.value ?? "";
  if (property.key?.type === "Identifier") return property.key.name;
  if (["StringLiteral", "NumericLiteral"].includes(property.key?.type)) return String(property.key.value);
  return "";
}

function collect(root, predicate) {
  const matches = [];
  walk(root, node => predicate(node) && matches.push(node));
  return matches;
}

function walk(value, visit) {
  if (!value || typeof value !== "object") return;
  if (typeof value.type === "string") visit(value);
  for (const [key, child] of Object.entries(value)) {
    if (["loc", "start", "end", "extra", "comments", "tokens"].includes(key)) continue;
    if (Array.isArray(child)) child.forEach(item => walk(item, visit));
    else walk(child, visit);
  }
}

function stripAstMetadata(value) {
  if (Array.isArray(value)) return value.map(stripAstMetadata);
  if (!value || typeof value !== "object") return value;
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (["loc", "start", "end", "extra", "comments", "tokens", "leadingComments", "trailingComments", "innerComments"].includes(key)) continue;
    result[key] = stripAstMetadata(child);
  }
  return result;
}
