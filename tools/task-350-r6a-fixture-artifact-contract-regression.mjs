#!/usr/bin/env node
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {parse} from "@babel/parser";
import {partitionTask350StartupLongTasks} from "./task-350-browser-long-task.mjs";

const profiles = [
  {
    name: "map-transaction",
    file: new URL("./webgl-generator-map-transaction-browser-regression.mjs", import.meta.url),
    artifactName: "map-transaction",
    assertionCount: 18,
    hardCheckDigest: "205a7cc140eacef0b6f7d56ed289c4aab01f2097b23eb389fdfd4000f364710d",
    compactDigest: "43271a845acb5c315d36628fa6bf43fa0e73e09c30db791adcb301fc8e32232f",
    compactVariable: "compactReport",
    compactBindings: ["finalReport", "compactReport"],
    compactFunctions: ["verifyStateRegenerationUi"],
    compactKeys: ["mode", "regenerationCount", "regeneration", "heightCount", "height", "geo", "climate", "metadataUndoable", "uiTransaction", "glError", "performance", "healthPerformanceSignals", "applicationConsoleErrors", "pageErrors"],
    startupCalls: ["createRequire", "startStaticServer", "playwright.chromium.launch"]
  },
  {
    name: "city-picking",
    file: new URL("./webgl-generator-city-picking-browser-regression.mjs", import.meta.url),
    artifactName: "city-picking",
    assertionCount: 15,
    hardCheckDigest: "3f217acbc9309589ee59cd05c6991a8795534abae98565268a856d86ef35ad73",
    compactDigest: "e3fe36ce15c074dd8795e0fedeb0a27868d6880846715bf5106a421c6579654d",
    compactVariable: "compactReport",
    compactBindings: ["finalReport", "compactReport"],
    compactFunctions: [],
    compactKeys: ["reports", "consoleErrors", "pageErrors", "navigationEvents"],
    startupCalls: ["createRequire", "createViteServer", "vite.listen", "playwright.chromium.launch"]
  },
  {
    name: "overlay-pan-stability",
    file: new URL("./webgl-generator-overlay-pan-stability-browser-regression.mjs", import.meta.url),
    artifactName: "overlay-pan-stability",
    assertionCount: 26,
      hardCheckDigest: "4dccea550e9af4e3fdb1ba917bb877bc3cb933fc40cd8c296139e78a1ea3f5ee",
      compactDigest: "d775ddd650a959c47fab94a085680e713ed2045307295644ef8c50d9ec748e2b",
    compactVariable: "compactReport",
    compactBindings: ["finalReport", "enteringPoliticalChecks", "exitingChecks", "compactReport"],
    compactFunctions: [],
    compactKeys: ["pan", "politicalCandidateFound", "enteringPoliticalCount", "enteringPoliticalChecks", "exitingCount", "exitingKinds", "exitingChecks", "previewFrames", "measurementPaths", "performance", "previewEvents", "forcedExitKeys", "forcedExitPrepared", "setupPerformanceSignals", "modelUploadsBefore", "modelUploadsAfter", "glError", "healthErrors", "consoleErrors", "pageErrors"],
    startupCalls: ["createRequire", "startStaticServer", "playwright.chromium.launch"]
  },
  {
    name: "viewport-line-preview",
    file: new URL("./webgl-generator-viewport-line-preview-browser-regression.mjs", import.meta.url),
    artifactName: "viewport-line-preview",
    assertionCount: 22,
    hardCheckDigest: "31a37f8505bf9c99e4fb97f9f16a4b6b4511433f3c765d8ef7c4fa69c2134a26",
    compactDigest: "3574def2ffd8c0a1042afe0f05b177fcc68af1384bc401b0fd1c20b02a6a2a59",
    compactVariable: "compactReport",
    compactBindings: ["finalReport", "compactReport"],
    compactFunctions: [],
    compactKeys: ["initial", "zoom", "pan", "setupPerformanceSignals", "consoleErrors", "pageErrors"],
    startupCalls: ["createRequire", "startStaticServer", "playwright.chromium.launch"]
  },
  {
    name: "browser-storage-compatibility",
    file: new URL("./webgl-generator-browser-storage-backward-compatibility-regression.mjs", import.meta.url),
    artifactName: "browser-storage-compatibility",
    assertionCount: 27,
    hardCheckDigest: "528c0289b4391b3afe9cc339a421d4d9b4b100b921747c1c58253db4524ee122",
    compactDigest: "b754773acaa0f80fdfd0198430c08142b3cb4910aed15393699a2630e3fa1577",
    compactVariable: "compactReport",
    compactBindings: ["finalReport", "compactReport"],
    compactFunctions: [],
    compactKeys: ["screenshot", "setupLongTasks", "startupBaselineLongTasks", "reloadLongTasks", "sharedStartupLongTasks", "longTasks", "performance"],
    startupCalls: ["createRequire", "startStaticServer", "playwright.chromium.launch"],
    longTaskPolicy: {prepare: 1, reset: 1, collect: 5}
  },
  {
    name: "browser-storage-fallback",
    file: new URL("./webgl-generator-browser-storage-fallback-regression.mjs", import.meta.url),
    artifactName: "browser-storage-fallback",
    assertionCount: 40,
    hardCheckDigest: "9533b3bfcd30612324d0d5a732a6d8d3c117ac7c359b54c629bcb05dee5ed55e",
    compactDigest: "ca96b10269fe364f847091a2cfa564dcd9492dbb36b1d5e245d891217b27d192",
    compactVariable: "compactReport",
    compactBindings: ["finalReport", "compactReport"],
    compactFunctions: [],
    compactKeys: ["fallbackLocalStorage", "indexedDbRecord", "normal", "setupLongTasks", "longTasks", "performance"],
    startupCalls: ["createRequire", "startStaticServer", "playwright.chromium.launch"],
    longTaskPolicy: {prepare: 2, reset: 2, collect: 4}
  },
  {
    name: "browser-save-feedback",
    file: new URL("./webgl-generator-browser-save-feedback-browser-regression.mjs", import.meta.url),
    artifactName: "browser-save-feedback",
    assertionCount: 13,
    hardCheckDigest: "0dfc53bec9a098ced10589508b7cd14130d1d2c9f1f1c15ada22ff3e23be6ef8",
    compactDigest: "3f0b18b367393aa351447026233850fb8c1ad01c274647fe36ec9f55a3a146a0",
    compactVariable: "compactReport",
    compactBindings: ["finalReport", "compactReport"],
    compactFunctions: [],
    compactKeys: ["failureAt5500", "failureAt6300", "performance"],
    startupCalls: ["createRequire", "createViteServer", "vite.listen", "playwright.chromium.launch"],
    longTaskPolicy: {prepare: 1, reset: 1, collect: 1}
  },
  {
    name: "loading-single-source",
    file: new URL("./webgl-generator-loading-single-source-browser-regression.mjs", import.meta.url),
    artifactName: "loading-single-source",
    assertionCount: 33,
    hardCheckDigest: "e8469ff10019983bb5c4725adc5290afa0ebc1f50448b763252010793052af2f",
    compactDigest: "35e84e29fcad0abc83812f87f3c1161eff5270a3752465690bd1dd2f5e359d5b",
    compactVariable: "compactReport",
    compactBindings: ["finalReport", "compactReport"],
    compactFunctions: [],
    compactKeys: ["expectedFailureHealth"],
    startupCalls: ["createRequire", "createViteServer", "vite.listen", "playwright.chromium.launch"],
    longTaskPolicy: {prepare: 1, reset: 1, collect: 1}
  },
  {
    name: "delayed-operation-feedback",
    file: new URL("./webgl-generator-delayed-operation-feedback-browser-regression.mjs", import.meta.url),
    artifactName: "delayed-operation-feedback",
    assertionCount: 28,
    hardCheckDigest: "a3dbd9d0246861178027bc527a37400e0c47dc4228ed8fc8cdc6237f89f71d9a",
    compactDigest: "5937e58cf3d837b53fdaf3af0f715a6cf3e2e1d2189862fd9962c7bd34363cc1",
    compactVariable: "compactReport",
    compactBindings: ["finalReport", "compactReport"],
    compactFunctions: ["verifyPanelChunkRecovery"],
    compactKeys: ["asyncFinished", "cancelledFinished", "failureFinished"],
    startupCalls: ["createRequire", "createViteServer", "vite.listen", "playwright.chromium.launch"],
    longTaskPolicy: {prepare: 2, reset: 3, collect: 3}
  }
];

const longTaskHelper = {
  file: new URL("./task-350-browser-long-task.mjs", import.meta.url),
  digest: "c67b1b146f94425c9c45edea384c4252672c859b6a0089c2453065871d31675e"
};

if (process.argv.includes("--print-signatures")) {
  const signatures = Object.fromEntries(profiles.map(profile => {
    const ast = parse(readFileSync(profile.file, "utf8"), {sourceType: "module", plugins: ["topLevelAwait"]});
    return [profile.name, {hardCheckDigest: hardCheckDigest(ast.program), compactDigest: compactEvidenceDigest(ast.program, profile)}];
  }));
  const longTaskAst = parse(readFileSync(longTaskHelper.file, "utf8"), {sourceType: "module", plugins: ["topLevelAwait"]});
  signatures["long-task-helper"] = {digest: digestNodes([longTaskAst.program])};
  console.log(JSON.stringify(signatures, null, 2));
  process.exit(0);
}

let mutationCases = 0;
let partitionCases = 0;
const startupBaselineProbe = [{label: "clean", startTime: 116, duration: 257}];
const sharedProbe = {label: "legacy", startTime: 130, duration: 278};
const duplicateProbe = {label: "corrupt", startTime: 132, duration: 276};
const partitionProbe = partitionTask350StartupLongTasks(startupBaselineProbe, [sharedProbe, duplicateProbe], 50);
assert.deepEqual(partitionProbe.sharedStartup.map(item => item.target), [sharedProbe], "共同启动任务未一对一匹配最近 baseline");
assert.deepEqual(partitionProbe.active, [duplicateProbe], "同一 baseline 被重复消费");
partitionCases += 2;
assert.deepEqual(partitionTask350StartupLongTasks(startupBaselineProbe, [{startTime: 167, duration: 257}], 50).active.length, 1, "startTime 超过容差的任务被错误吞掉");
assert.deepEqual(partitionTask350StartupLongTasks(startupBaselineProbe, [{startTime: 116, duration: 308}], 50).active.length, 1, "duration 超过容差的任务被错误吞掉");
assert.throws(() => partitionTask350StartupLongTasks(startupBaselineProbe, [sharedProbe], -1), /非负有限数/u, "非法共同启动容差未拒绝");
partitionCases += 3;
assertLongTaskHelper(readFileSync(longTaskHelper.file, "utf8"));
assertMutationFails(
  () => assertLongTaskHelper(replaceOnce(readFileSync(longTaskHelper.file, "utf8"), "Number(task.duration) > budgetMs", "Number(task.duration) > 500")),
  /LongTask helper 规范 AST 漂移/u,
  "LongTask helper 放宽预算"
);
mutationCases += 1;
for (const profile of profiles) {
  const source = readFileSync(profile.file, "utf8");
  assertFixture(source, profile);
  const mutations = [
    [replaceOnce(source, "evidence.persist();", "if (false) evidence.persist();"), /finally 必须直接持久化/u, "persist 不可达"],
    [replaceOnce(source, "evidence.fail(error);", "void error;"), /catch 必须直接记录功能首败/u, "吞掉功能首败"],
    [replaceOnce(source, "evidence.failTeardown(error);", "void error;"), /teardown 失败必须单列/u, "吞掉 teardown 首败"],
    [replaceOnce(source, "await closeTask350BrowserResource(label, close);", "await close();"), /共享限时关闭/u, "绕过共享关闭"],
    [replaceOnce(source, `evidence.setResult(finalReport, ${profile.compactVariable});`, "evidence.setResult(finalReport, null);"), /compact result/u, "丢失 compact result"],
    [replaceOnce(source, "if (thrownError) throw thrownError;", "if (false) throw thrownError;"), /失败退出/u, "吞掉失败退出"],
    [removeFirstAssertion(source), /硬断言数量漂移/u, "删除旧硬断言"],
    [mutateCompactValue(source, profile.compactVariable, "null"), /compact 规范 AST 漂移/u, "compact 值改 null"],
    [mutateCompactValue(source, profile.compactVariable, "thrownError"), /compact 规范 AST 漂移/u, "compact 值改错源"],
    [replaceOnce(source, "try {", "try {\n  process.exit(0);"), /owner try 不得提前退出/u, "owner 提前退出"]
  ];
  for (let index = 0; index < profile.assertionCount; index += 1) {
    const hardMutationPattern = profile.name === "browser-storage-fallback"
      ? /硬门规范 AST 漂移|overBudget|(normal )?direct-binary (record|restore) 契约漂移/u
      : profile.name === "loading-single-source"
        ? /硬门规范 AST 漂移|overBudget|未硬证/u
        : /硬门规范 AST 漂移|overBudget/u;
    mutations.push([replaceAssertionWithNoop(source, index), hardMutationPattern, `第 ${index + 1} 个硬断言替换为空断言`]);
  }
  for (const startupCall of profile.startupCalls) {
    mutations.push([moveStartupOutsideOwner(source, startupCall), /启动必须位于 owner try/u, `${startupCall} 启动逃逸 owner`]);
  }
  if (profile.name === "map-transaction") {
    mutations.push([
      replaceOnce(source, "historyDelta: historyAfter.undo - historyBefore.undo", "historyDelta: 999"),
      /compact 规范 AST 漂移/u,
      "report historyDelta 伪造"
    ]);
  }
  if (profile.name === "browser-storage-compatibility") {
    mutations.push([
      replaceOnce(source, "  evidence.setResult(finalReport, compactReport);\n", ""),
      /未在任何硬断言前保存 report|缺少直接 full\/compact result/u,
      "删除首断言前 artifact"
    ]);
    mutations.push([
      replaceOnce(source, "partitionTask350StartupLongTasks(startupBaselineLongTasks, legacyReloadLongTasks, 50)", "partitionTask350StartupLongTasks(startupBaselineLongTasks, legacyReloadLongTasks, 200)"),
      /共同启动匹配容差漂移|legacy reload 未按 50ms/u,
      "放宽共同启动匹配容差"
    ]);
    mutations.push([
      replaceOnce(source, "setupLongTasks.push(...await collectTask350LongTaskWindow(page, \"legacy-preparation\"));", "longTasks.push(...await collectTask350LongTaskWindow(page, \"legacy-preparation\"));"),
      /legacy preparation 未保持 setup-only/u,
      "把夹具准备计入产品窗口"
    ]);
    mutations.push([
      replaceOnce(source, "longTasks.push(...partition.active);", "void partition.active;"),
      /未匹配 reload 任务未进入活动硬门/u,
      "丢弃未匹配 reload 任务"
    ]);
  }
  if (profile.name === "browser-storage-fallback") {
    mutations.push([
      replaceOnce(source, "  evidence.setResult(finalReport, compactReport);\n", ""),
      /未在任何硬断言前保存 report|缺少直接 full\/compact result/u,
      "删除首断言前 artifact"
    ]);
    mutations.push([
      replaceOnce(source, 'assert.equal(indexedDbRecord.rawType, "object"', 'assert.equal(indexedDbRecord.rawType, "string"'),
      /direct-binary record 契约漂移/u,
      "恢复 10k string envelope"
    ]);
    mutations.push([
      replaceOnce(source, 'assert.ok(restored.data.effects.includes("browser-storage-binary-read"));', 'assert.ok(restored.data.effects.includes("browser-storage-fallback-read"));'),
      /direct-binary restore 契约漂移/u,
      "恢复 10k fallback-read"
    ]);
    mutations.push([
      replaceOnce(source, 'setupLongTasks.push(...await collectTask350LongTaskWindow(page, `fallback-setup-${requestedCells}`));', 'void await collectTask350LongTaskWindow(page, `fallback-setup-${requestedCells}`);'),
      /主上下文生成未保持 raw setup/u,
      "丢弃主上下文 setup"
    ]);
    mutations.push([
      replaceOnce(source, 'setupLongTasks.push(...await collectTask350LongTaskWindow(normalPage, "direct-binary-setup-10000"));', 'void await collectTask350LongTaskWindow(normalPage, "direct-binary-setup-10000");'),
      /normal 上下文生成未保持 raw setup/u,
      "丢弃 normal setup"
    ]);
    mutations.push([
      replaceOnce(source, 'assert.equal(normalIndexedDbRecord.rawType, "object");', 'assert.equal(normalIndexedDbRecord.rawType, "string");'),
      /normal direct-binary record 契约漂移/u,
      "normal 恢复 string envelope"
    ]);
    mutations.push([
      replaceOnce(source, 'assert.ok(normalRestored.data.effects.includes("browser-storage-binary-read"));', 'assert.ok(normalRestored.data.effects.includes("browser-storage-fallback-read"));'),
      /normal direct-binary restore 契约漂移/u,
      "normal 恢复 fallback-read"
    ]);
  }
  if (profile.name === "loading-single-source") {
    mutations.push([
      replaceOnce(source, "  evidence.setResult(finalReport, compactReport);\n", ""),
      /未在任何硬断言前保存 report|缺少直接 full\/compact result/u,
      "删除首断言前 artifact"
    ]);
    mutations.push([
      replaceOnce(source, 'Object.defineProperty(delayedFile, "arrayBuffer"', 'Object.defineProperty(delayedFile, "text"'),
      /未探测真实 arrayBuffer 读取路径/u,
      "恢复过时 text probe"
    ]);
    mutations.push([
      replaceOnce(
        source,
        'results.fixtureSetupWindow = {kind: "fixture-export-map", startTime: performance.now(), endTime: null};\n    const exported = app.runtimeActions.data.exportMap({download: false, includeText: true});',
        'const exported = app.runtimeActions.data.exportMap({download: false, includeText: true});\n    results.fixtureSetupWindow = {kind: "fixture-export-map", startTime: performance.now(), endTime: null};'
      ),
      /未精确包围夹具同步导出/u,
      "导出后才启动 fixture window"
    ]);
    mutations.push([
      replaceOnce(source, "const target = overlapsWindow(task, report.fixtureSetupWindow) ? fixtureSetupLongTasks : longTasks;", "const target = longTasks;"),
      /未把夹具导出 LongTask 单列/u,
      "删除 fixture LongTask 分区"
    ]);
    mutations.push([
      replaceOnce(source, "healthErrors, fixtureSetupLongTasks, longTasks, performance", "healthErrors, longTasks, performance"),
      /artifact 缺少夹具导出 LongTask/u,
      "artifact 丢失 fixture LongTask"
    ]);
    mutations.push([
      replaceOnce(source, "return originalArrayBuffer();", "return exported.text;"),
      /未返回原始文件 bytes/u,
      "返回字符串而非原始 bytes"
    ]);
    mutations.push([
      replaceOnce(source, 'stage: "after-renderer-load", operationName: "data.importMap"', 'stage: "prepared-install", operationName: "data.importMap"'),
      /未使用稳定 after-renderer-load 故障阶段/u,
      "恢复 renderer 私有阶段"
    ]);
    mutations.push([
      replaceOnce(source, "delete window.__webglGeneratorMapReplaceFault;", "void window.__webglGeneratorMapReplaceFault;"),
      /未在 finally 清理稳定故障钩子/u,
      "删除稳定故障钩子 cleanup"
    ]);
    mutations.push([
      replaceOnce(source, "const rollbackMap = app.map;", "app.renderer.loadMapAsync = async () => {};\n    const rollbackMap = app.map;"),
      /仍覆写 renderer 私有装载方法/u,
      "恢复 renderer monkey-patch"
    ]);
    mutations.push([
      replaceOnce(source, "cause: depth < 4 ? serializeError(error.cause, depth + 1) : null", "cause: null"),
      /未递归保存 nested error cause/u,
      "丢失 nested error cause"
    ]);
    mutations.push([
      replaceOnce(source, 'app.workerTaskCoordinator.invalidateSession("fixture-loading-river-conflict-direct-map-mutation");', "void app.workerTaskCoordinator;"),
      /未在河流直接篡改后失效 Worker mirror/u,
      "删除河流 Worker mirror 失效"
    ]);
    mutations.push([
      replaceOnce(
        source,
        'river.cells[1] = invalid;\n      app.workerTaskCoordinator.invalidateSession("fixture-loading-river-conflict-direct-map-mutation");',
        'app.workerTaskCoordinator.invalidateSession("fixture-loading-river-conflict-direct-map-mutation");\n      river.cells[1] = invalid;'
      ),
      /未在河流直接篡改后失效 Worker mirror/u,
      "河流 Worker mirror 过早失效"
    ]);
  }
  if (profile.name === "delayed-operation-feedback") {
    mutations.push([
      replaceOnce(source, 'const longTasks = await collectTask350LongTaskWindow(page, "feedback-chunk-failure");', "const longTasks = [];"),
      /重载前分包失败窗口未单独收集/u,
      "丢失重载前分包失败窗口"
    ]);
    mutations.push([
      replaceOnce(
        source,
        '  ]);\n  await waitForApiReady(page, timeoutMs);\n  await resetTask350LongTaskWindow(page);',
        '  ]);\n  await waitForApiReady(page, timeoutMs);'
      ),
      /重载 ready 后未重置启动 LongTask/u,
      "丢失重载后 ready reset"
    ]);
    mutations.push([
      replaceOnce(source, 'longTasks.push(...await collectTask350LongTaskWindow(page, "feedback-chunk-recovery"));', "void longTasks;"),
      /重载后恢复窗口未进入目标 LongTask/u,
      "丢失重载后恢复窗口"
    ]);
  }
  if (profile.longTaskPolicy) {
    mutations.push([
      replaceOnce(source, "summarizeTask350LongTasks(longTasks, 200)", "summarizeTask350LongTasks(longTasks, 500)"),
      /LongTask 硬线必须是 200ms/u,
      "放宽 LongTask 硬线"
    ]);
    mutations.push([
      replaceOnce(source, "const overBudget = performance.overBudget;", "const overBudget = [];"),
      /overBudget 必须读取性能汇总/u,
      "伪造 overBudget 空集"
    ]);
  }
  for (const [mutated, pattern, label] of mutations) {
    assertMutationFails(() => assertFixture(mutated, profile), pattern, `${profile.name} ${label}`);
    mutationCases += 1;
  }
}

console.log(JSON.stringify({
  ok: true,
  fixtures: profiles.map(profile => profile.name),
  artifact: "failure-safe-full-compact-finally",
  hardAssertions: profiles.reduce((sum, profile) => sum + profile.assertionCount, 0),
  mutationCases,
  partitionCases,
  browserRuns: 0
}, null, 2));

function assertFixture(source, profile) {
  const ast = parse(source, {sourceType: "module", plugins: ["topLevelAwait"]});
  const ownerTry = ast.program.body.find(node => node.type === "TryStatement" && node.handler && node.finalizer);
  assert.ok(ownerTry, `${profile.name} 缺少顶层 owner try/catch/finally`);
  const tryStatements = ownerTry.block.body;
  const catchStatements = ownerTry.handler.body.body;
  const finallyStatements = ownerTry.finalizer.body;

  const artifactCall = collect(ast.program, node => node.type === "CallExpression" && callName(node.callee) === "createTask350BrowserArtifact");
  assert.equal(artifactCall.length, 1, `${profile.name} 必须且只能建立一个共享 artifact`);
  assert.equal(literalValue(artifactCall[0].arguments[0]), profile.artifactName, `${profile.name} artifact 名称漂移`);
  const diagnosticCatch = profile.name === "city-picking";
  assert.equal(catchStatements.length, diagnosticCatch ? 3 : 2, `${profile.name} catch 只能记录并保留原始首败`);
  if (diagnosticCatch) {
    assert.equal(callName(catchStatements[0]?.expression?.callee), "evidence.setResult", `${profile.name} catch 必须先保存导航诊断`);
    assert.equal(catchStatements[0]?.expression?.arguments?.[0]?.type, "ObjectExpression", `${profile.name} catch full 导航诊断必须直接传入`);
    assert.equal(catchStatements[0]?.expression?.arguments?.[1]?.type, "ObjectExpression", `${profile.name} catch compact 导航诊断必须直接传入`);
  }
  assert.ok(hasDirectCall(catchStatements, "evidence.fail"), `${profile.name} catch 必须直接记录功能首败`);
  assert.ok(hasDirectAssignment(catchStatements, "thrownError", "error"), `${profile.name} catch 必须保留原始失败`);
  assert.ok(hasDirectCall(tryStatements, "evidence.setResult"), `${profile.name} 缺少直接 full/compact result`);
  assert.ok(hasDirectCall(tryStatements, "evidence.succeed"), `${profile.name} 缺少直接成功终态`);
  assert.equal(collectWithoutNestedFunctions(ownerTry.block, node => node.type === "CallExpression" && callName(node.callee) === "process.exit").length, 0, `${profile.name} owner try 不得提前退出`);
  assert.equal(finallyStatements.length, 2, `${profile.name} finally 只能执行 teardown 与 persist`);
  assert.ok(hasDirectCall(finallyStatements, "evidence.persist"), `${profile.name} finally 必须直接持久化 artifact`);
  assertTeardownLoop(ownerTry.finalizer, profile.name);
  assertFailureRethrow(ast.program.body, ownerTry, profile.name);

  const compact = findVariable(ast.program, profile.compactVariable);
  assert.ok(compact?.init?.type === "ObjectExpression", `${profile.name} compact result 必须是直接对象`);
  const compactKeys = new Set(compact.init.properties.filter(property => property.type === "ObjectProperty").map(property => propertyName(property.key)));
  for (const key of profile.compactKeys) assert.ok(compactKeys.has(key), `${profile.name} compact result 缺少 ${key}`);
  const setResult = directStatementCalls(tryStatements).find(call => callName(call.callee) === "evidence.setResult");
  assert.equal(setResult?.arguments[0]?.type, "Identifier", `${profile.name} full result 未直接传入`);
  assert.equal(setResult?.arguments[0]?.name, "finalReport", `${profile.name} full result 必须使用原 stdout report`);
  assert.equal(setResult?.arguments[1]?.type, "Identifier", `${profile.name} compact result 未直接传入`);
  assert.equal(setResult?.arguments[1]?.name, profile.compactVariable, `${profile.name} compact result 数据流漂移`);

  const assertionCount = collect(ast.program, node => node.type === "CallExpression" && isAssertion(node)).length;
  assert.equal(assertionCount, profile.assertionCount, `${profile.name} 硬断言数量漂移`);
  if (profile.name === "browser-storage-compatibility") assertStorageCompatibilityPartition(source, ownerTry);
  if (profile.name === "browser-storage-fallback") assertStorageFallbackDirectBinary(source, ownerTry);
  if (profile.name === "loading-single-source") assertLoadingSingleSourceFileProbe(source, ownerTry);
  if (profile.name === "delayed-operation-feedback") assertDelayedOperationFeedbackRecoveryPartition(source);
  if (profile.longTaskPolicy) assertLongTaskPolicy(ast.program, profile);
  assert.equal(hardCheckDigest(ast.program), profile.hardCheckDigest, `${profile.name} 硬门规范 AST 漂移`);
  for (const startupCall of profile.startupCalls) {
    const owned = collect(ownerTry.block, node => node.type === "CallExpression" && callName(node.callee) === startupCall);
    assert.equal(owned.length, 1, `${profile.name} ${startupCall} 启动必须位于 owner try`);
    const total = collect(ast.program, node => node.type === "CallExpression" && callName(node.callee) === startupCall);
    assert.equal(total.length, 1, `${profile.name} ${startupCall} 不得在 owner 外另行启动`);
  }
  assert.equal(compactEvidenceDigest(ast.program, profile), profile.compactDigest, `${profile.name} compact 规范 AST 漂移`);
}

function assertLoadingSingleSourceFileProbe(source, ownerTry) {
  const artifactResult = collect(ownerTry.block, node => node.type === "CallExpression" && callName(node.callee) === "evidence.setResult")[0];
  const firstHardAssertion = collect(ownerTry.block, node => node.type === "CallExpression" && isAssertion(node))[0];
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
  assert.match(source, /const longTasks = await collectTask350LongTaskWindow\(page, "feedback-chunk-failure"\);/u, "delayed feedback 重载前分包失败窗口未单独收集");
  assert.match(source, /page\.waitForNavigation\(\{waitUntil: "domcontentloaded"\}\)[\s\S]*?await waitForApiReady\(page, timeoutMs\);\s*await resetTask350LongTaskWindow\(page\);\s*await page\.evaluate\(\(\) => document\.getElementById\("open-state-panel"\)\?\.click\(\)\);/u, "delayed feedback 重载 ready 后未重置启动 LongTask");
  assert.match(source, /longTasks\.push\(\.\.\.await collectTask350LongTaskWindow\(page, "feedback-chunk-recovery"\)\);/u, "delayed feedback 重载后恢复窗口未进入目标 LongTask");
}

function assertStorageFallbackDirectBinary(source, ownerTry) {
  const artifactResult = collect(ownerTry.block, node => node.type === "CallExpression" && callName(node.callee) === "evidence.setResult")[0];
  const firstHardAssertion = collect(ownerTry.block, node => node.type === "CallExpression" && isAssertion(node))[0];
  assert.ok(artifactResult && firstHardAssertion && artifactResult.start < firstHardAssertion.start, "browser storage fallback 未在任何硬断言前保存 report");
  assert.match(source, /assert\.equal\(indexedDbRecord\.rawType, "object"/u, "browser storage fallback direct-binary record 契约漂移");
  assert.match(source, /assert\.equal\(indexedDbRecord\.type, "webgl-generator-browser-map-gzip"\)/u, "browser storage fallback direct-binary record 契约漂移");
  assert.match(source, /assert\.ok\(restored\.data\.effects\.includes\("browser-storage-binary-read"\)\)/u, "browser storage fallback direct-binary restore 契约漂移");
  assert.match(source, /assert\.equal\(restored\.data\.effects\.includes\("browser-storage-fallback-read"\), false\)/u, "browser storage fallback direct-binary restore 契约漂移");
  assert.match(source, /assert\.equal\(normalIndexedDbRecord\.rawType, "object"\)/u, "browser storage fallback normal direct-binary record 契约漂移");
  assert.match(source, /assert\.equal\(normalIndexedDbRecord\.type, "webgl-generator-browser-map-gzip"\)/u, "browser storage fallback normal direct-binary record 契约漂移");
  assert.match(source, /assert\.ok\(normalRestored\.data\.effects\.includes\("browser-storage-binary-read"\)\)/u, "browser storage fallback normal direct-binary restore 契约漂移");
  assert.match(source, /assert\.equal\(normalRestored\.data\.effects\.includes\("browser-storage-fallback-read"\), false\)/u, "browser storage fallback normal direct-binary restore 契约漂移");
  assert.match(source, /setupLongTasks\.push\(\.\.\.await collectTask350LongTaskWindow\(page, `fallback-setup-\$\{requestedCells\}`\)\);\s*await resetTask350LongTaskWindow\(page\);/u, "browser storage fallback 主上下文生成未保持 raw setup");
  assert.match(source, /setupLongTasks\.push\(\.\.\.await collectTask350LongTaskWindow\(normalPage, "direct-binary-setup-10000"\)\);\s*await resetTask350LongTaskWindow\(normalPage\);/u, "browser storage fallback normal 上下文生成未保持 raw setup");
}

function assertStorageCompatibilityPartition(source, ownerTry) {
  const artifactResult = collect(ownerTry.block, node => node.type === "CallExpression" && callName(node.callee) === "evidence.setResult")[0];
  const firstHardAssertion = collect(ownerTry.block, node => node.type === "CallExpression" && isAssertion(node))[0];
  assert.ok(artifactResult && firstHardAssertion && artifactResult.start < firstHardAssertion.start, "browser storage 未在任何硬断言前保存 report");
  assert.match(source, /collectTask350LongTaskWindow\(page, "cold-startup-control"\)/u, "browser storage 缺少 cold startup raw 证据");
  assert.match(source, /startupBaselineLongTasks\.push\(\.\.\.await collectTask350LongTaskWindow\(page, "clean-reload-control"\)\)/u, "browser storage 缺少 clean reload 基线");
  assert.match(source, /setupLongTasks\.push\(\.\.\.await collectTask350LongTaskWindow\(page, "legacy-preparation"\)\)/u, "browser storage legacy preparation 未保持 setup-only");
  assert.match(source, /partitionTask350StartupLongTasks\(startupBaselineLongTasks, legacyReloadLongTasks, 50\)/u, "browser storage legacy reload 未按 50ms 与 clean baseline 分区");
  assert.match(source, /partitionTask350StartupLongTasks\(startupBaselineLongTasks, corruptReloadLongTasks, 50\)/u, "browser storage corrupt reload 未按 50ms 与 clean baseline 分区");
  assert.match(source, /sharedStartupLongTasks\.push\(\.\.\.partition\.sharedStartup\);\s*longTasks\.push\(\.\.\.partition\.active\);/u, "browser storage 未匹配 reload 任务未进入活动硬门");
  const setResultCalls = directStatementCalls(ownerTry.block.body).filter(call => callName(call.callee) === "evidence.setResult");
  assert.equal(setResultCalls.length, 1, "browser storage result 必须只登记一次并渐进填充");
}

function assertLongTaskPolicy(root, profile) {
  const expected = profile.longTaskPolicy;
  for (const [name, count] of [
    ["prepareTask350LongTaskObserver", expected.prepare],
    ["resetTask350LongTaskWindow", expected.reset],
    ["collectTask350LongTaskWindow", expected.collect]
  ]) {
    const calls = collect(root, node => node.type === "CallExpression" && callName(node.callee) === name);
    assert.equal(calls.length, count, `${profile.name} ${name} 调用数漂移`);
  }
  const summaryCalls = collect(root, node => node.type === "CallExpression" && callName(node.callee) === "summarizeTask350LongTasks");
  assert.equal(summaryCalls.length, 1, `${profile.name} 必须且只能汇总一次 LongTask`);
  assert.equal(literalValue(summaryCalls[0].arguments[1]), 200, `${profile.name} LongTask 硬线必须是 200ms`);
  const overBudgetBinding = findVariable(root, "overBudget");
  assert.equal(callName(overBudgetBinding?.init), "performance.overBudget", `${profile.name} overBudget 必须读取性能汇总`);
  const overBudgetAssertions = collect(root, node => node.type === "CallExpression"
    && callName(node.callee) === "assert.deepEqual"
    && node.arguments[0]?.type === "Identifier"
    && node.arguments[0].name === "overBudget");
  assert.equal(overBudgetAssertions.length, 1, `${profile.name} 必须且只能硬拒绝一次 overBudget`);
  assert.equal(overBudgetAssertions[0].arguments[1]?.type, "ArrayExpression", `${profile.name} overBudget 必须与空数组比较`);
  assert.equal(overBudgetAssertions[0].arguments[1]?.elements?.length, 0, `${profile.name} overBudget 预算白名单必须为空`);
  const finalReport = findVariable(root, "finalReport");
  assert.equal(finalReport?.init?.type, "ObjectExpression", `${profile.name} full result 必须是直接对象`);
  const finalKeys = new Set(finalReport.init.properties.filter(property => property.type === "ObjectProperty").map(property => propertyName(property.key)));
  assert.ok(finalKeys.has("longTasks"), `${profile.name} full result 缺少原始 LongTask`);
  assert.ok(finalKeys.has("performance"), `${profile.name} full result 缺少 LongTask 汇总`);
}

function assertLongTaskHelper(source) {
  const ast = parse(source, {sourceType: "module", plugins: ["topLevelAwait"]});
  assert.equal(digestNodes([ast.program]), longTaskHelper.digest, "LongTask helper 规范 AST 漂移");
}

function assertTeardownLoop(finalizer, name) {
  const loop = finalizer.body.find(node => node.type === "ForOfStatement");
  assert.ok(loop?.body?.type === "BlockStatement", `${name} finally 缺少 teardown loop`);
  assert.equal(loop.body.body.length, 2, `${name} teardown loop 控制流漂移`);
  const closeTry = loop.body.body.find(node => node.type === "TryStatement" && node.handler);
  assert.ok(closeTry, `${name} teardown loop 缺少失败捕获`);
  assert.equal(closeTry.block.body.length, 1, `${name} teardown success 路径不得夹带其它动作`);
  assert.equal(closeTry.handler.body.body.length, 2, `${name} teardown catch 只能登记失败并保留首败`);
  assert.ok(hasDirectCall(closeTry.block.body, "closeTask350BrowserResource"), `${name} teardown 必须使用共享限时关闭`);
  assert.ok(hasDirectCall(closeTry.handler.body.body, "evidence.failTeardown"), `${name} teardown 失败必须单列`);
  assert.ok(hasDirectAssignment(closeTry.handler.body.body, "thrownError", "error", {nested: true}), `${name} teardown 失败必须保留非零退出`);
}

function assertFailureRethrow(statements, ownerTry, name) {
  const ownerIndex = statements.indexOf(ownerTry);
  const statement = statements[ownerIndex + 1];
  assert.equal(statement?.type, "IfStatement", `${name} 功能或 teardown 失败必须保持非零退出`);
  assert.equal(statement.test?.type, "Identifier", `${name} 失败退出必须直接读取 thrownError`);
  assert.equal(statement.test?.name, "thrownError", `${name} 失败退出条件漂移`);
  assert.equal(statement.consequent?.type, "ThrowStatement", `${name} 失败退出必须直接 throw`);
  assert.equal(statement.consequent.argument?.type, "Identifier", `${name} 失败退出未抛原始错误`);
  assert.equal(statement.consequent.argument?.name, "thrownError", `${name} 失败退出未抛 thrownError`);
}

function hasDirectCall(statements, name) {
  return directStatementCalls(statements).some(call => callName(call.callee) === name);
}

function directStatementCalls(statements) {
  return statements.map(statement => {
    if (statement?.type !== "ExpressionStatement") return null;
    let expression = statement.expression;
    while (["AwaitExpression", "TSAsExpression", "ParenthesizedExpression"].includes(expression?.type)) expression = expression.argument || expression.expression;
    return expression?.type === "CallExpression" ? expression : null;
  }).filter(Boolean);
}

function hasDirectAssignment(statements, leftName, rightName, {nested = false} = {}) {
  const candidates = nested ? collect({type: "BlockStatement", body: statements}, node => node.type === "AssignmentExpression") : statements.map(statement => statement.type === "ExpressionStatement" ? statement.expression : null).filter(node => node?.type === "AssignmentExpression");
  return candidates.some(node => node.operator === "=" && node.left?.type === "Identifier" && node.left.name === leftName && node.right?.type === "Identifier" && node.right.name === rightName);
}

function findVariable(root, name) {
  return collect(root, node => node.type === "VariableDeclarator" && node.id?.type === "Identifier" && node.id.name === name)[0] || null;
}

function findFunction(root, name) {
  return collect(root, node => node.type === "FunctionDeclaration" && node.id?.name === name)[0] || null;
}

function hardCheckDigest(root) {
  const nodes = collect(root, node => (node.type === "CallExpression" && isAssertion(node)) || (node.type === "IfStatement" && containsThrow(node.consequent)));
  return digestNodes(nodes);
}

function compactEvidenceDigest(root, profile) {
  const declaredEvidence = [];
  for (const name of profile.compactBindings) {
    const binding = findVariable(root, name);
    assert.ok(binding?.init, `${profile.name} compact 数据流缺少 ${name}`);
    declaredEvidence.push(binding.init);
  }
  for (const name of profile.compactFunctions) {
    const declaration = findFunction(root, name);
    assert.ok(declaration, `${profile.name} compact 数据流缺少函数 ${name}`);
    declaredEvidence.push(declaration);
  }
  assert.ok(declaredEvidence.length > 0, `${profile.name} compact 数据流声明为空`);
  return digestNodes([root]);
}

function digestNodes(nodes) {
  const canonical = JSON.stringify(nodes.map(node => stripAstMetadata(node)));
  return createHash("sha256").update(canonical).digest("hex");
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

function containsThrow(root) {
  let found = false;
  const visit = value => {
    if (found || !value || typeof value !== "object") return;
    if (value !== root && isFunctionNode(value)) return;
    if (value.type === "ThrowStatement") {
      found = true;
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (["loc", "start", "end", "extra", "comments", "tokens"].includes(key)) continue;
      if (Array.isArray(child)) child.forEach(visit);
      else visit(child);
    }
  };
  visit(root);
  return found;
}

function collectWithoutNestedFunctions(root, predicate) {
  const matches = [];
  const visit = value => {
    if (!value || typeof value !== "object") return;
    if (value !== root && isFunctionNode(value)) return;
    if (typeof value.type === "string" && predicate(value)) matches.push(value);
    for (const [key, child] of Object.entries(value)) {
      if (["loc", "start", "end", "extra", "comments", "tokens"].includes(key)) continue;
      if (Array.isArray(child)) child.forEach(visit);
      else visit(child);
    }
  };
  visit(root);
  return matches;
}

function isFunctionNode(node) {
  return ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression", "ObjectMethod", "ClassMethod"].includes(node?.type);
}

function isAssertion(call) {
  const name = callName(call.callee);
  return name === "assert" || name.startsWith("assert.");
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

function callName(callee) {
  if (!callee) return "";
  if (callee.type === "Identifier") return callee.name;
  if (!["MemberExpression", "OptionalMemberExpression"].includes(callee.type)) return "";
  const object = callName(callee.object);
  const property = callee.computed ? literalValue(callee.property) : callee.property?.name;
  return [object, property].filter(Boolean).join(".");
}

function literalValue(node) {
  if (["StringLiteral", "NumericLiteral", "BooleanLiteral"].includes(node?.type)) return node.value;
  return undefined;
}

function propertyName(node) {
  return node?.name ?? node?.value ?? "";
}

function replaceOnce(source, before, after) {
  assert.ok(source.includes(before), `mutation 缺少目标：${before}`);
  return source.replace(before, after);
}

function removeFirstAssertion(source) {
  const ast = parse(source, {sourceType: "module", plugins: ["topLevelAwait"]});
  const statement = collect(ast.program, node => node.type === "ExpressionStatement" && node.expression?.type === "CallExpression" && isAssertion(node.expression))[0];
  assert.ok(statement, "mutation 缺少硬断言");
  return `${source.slice(0, statement.start)}void 0;${source.slice(statement.end)}`;
}

function replaceAssertionWithNoop(source, index) {
  const ast = parse(source, {sourceType: "module", plugins: ["topLevelAwait"]});
  const call = collect(ast.program, node => node.type === "CallExpression" && isAssertion(node))[index];
  assert.ok(call, `mutation 缺少第 ${index + 1} 个硬断言`);
  return `${source.slice(0, call.start)}assert.ok(true)${source.slice(call.end)}`;
}

function mutateCompactValue(source, compactVariable, replacement) {
  const ast = parse(source, {sourceType: "module", plugins: ["topLevelAwait"]});
  const compact = findVariable(ast.program, compactVariable);
  const property = compact?.init?.type === "ObjectExpression" ? compact.init.properties.find(node => node.type === "ObjectProperty") : null;
  assert.ok(property?.value, `mutation 缺少 ${compactVariable} 值`);
  if (property.shorthand) {
    const key = propertyName(property.key);
    return `${source.slice(0, property.start)}${key}: ${replacement}${source.slice(property.end)}`;
  }
  return `${source.slice(0, property.value.start)}${replacement}${source.slice(property.value.end)}`;
}

function moveStartupOutsideOwner(source, startupCall) {
  const ast = parse(source, {sourceType: "module", plugins: ["topLevelAwait"]});
  const ownerTry = ast.program.body.find(node => node.type === "TryStatement" && node.handler && node.finalizer);
  const statement = ownerTry?.block?.body.find(node => collect(node, child => child.type === "CallExpression" && callName(child.callee) === startupCall).length > 0);
  assert.ok(statement, `mutation 缺少 owner 内启动调用：${startupCall}`);
  const moved = source.slice(statement.start, statement.end).trimStart();
  const without = `${source.slice(0, statement.start)}${source.slice(statement.end)}`;
  return `${without.slice(0, ownerTry.start)}${moved}\n${without.slice(ownerTry.start)}`;
}

function assertMutationFails(run, pattern, label) {
  assert.throws(run, pattern, `${label} 后契约仍通过`);
}
