import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {apiCall} from "../app/webgl-generator/src/runtime/api-result.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {createRuntimeOperationError, createRuntimeOperationManager} from "../app/webgl-generator/src/runtime/runtime-operation.js";
import {maybeInjectMapReplaceDebugFault} from "../app/webgl-generator/src/runtime/map-replace-debug-fault.js";

const loading = [];
const health = [];
let clock = 0;
let transactionValue = "before";
const manager = createRuntimeOperationManager({
  now: () => (clock += 5),
  setLoading: (visible, message, operation) => loading.push({visible, message, status: operation?.status || ""}),
  beginHealthOperation: name => ({end: result => health.push({type: "health-end", name, result})}),
  recordHealth: (type, detail, severity) => health.push({type, detail, severity})
});

let successContext;
const success = await manager.run("success", context => {
  successContext = context;
  context.report("work", {message: "处理中", progress: 0.4, completed: 4, total: 10, layer: "labels", privateObject: {ignored: true}});
  return {value: 1};
});
assert.equal(success.value, 1);
assert.equal(success.operation.status, "success");
assert.equal(success.operation.stage, "work");
assert.deepEqual(success.operation.stages.at(-1), {
  stage: "work",
  message: "处理中",
  atMs: 5,
  progress: 0.4,
  completed: 4,
  total: 10,
  layer: "labels"
});
assert.equal("privateObject" in success.operation.stages.at(-1), false, "operation 阶段不得保留任意对象");
assert.equal(loading.at(-1).visible, false);
const loadingEventsAfterSuccess = loading.length;
assert.equal(successContext.report("late", {message: "迟到阶段不得重开提示"}), false);
assert.equal(loading.length, loadingEventsAfterSuccess, "已完成 operation 的迟到 report 重新触发 Loading");

const noop = manager.runSync("noop", () => ({executed: false}), {isNoop: result => !result.executed});
assert.equal(noop.operation.status, "noop");
assert.equal(loading.at(-1).visible, false);

const invalid = await apiCall(() => manager.run("invalid", () => {
  throw createRuntimeOperationError("operation_invalid_input", "参数无效", {stage: "validate", expected: true});
}));
assert.equal(invalid.ok, false);
assert.deepEqual(invalid.error, {
  code: "operation_invalid_input",
  name: "RuntimeOperationError",
  message: "参数无效",
  stage: "validate",
  suggestion: "检查参数或导入内容后重试。"
});
assert.equal(loading.at(-1).visible, false);

const obsolete = await apiCall(() => manager.run("obsolete", () => {
  throw createRuntimeOperationError("operation_obsolete", "地图已被替换", {stage: "identity", expected: true});
}));
assert.equal(obsolete.ok, false);
assert.deepEqual(obsolete.error, {
  code: "operation_obsolete",
  name: "RuntimeOperationError",
  message: "地图已被替换",
  stage: "identity",
  suggestion: "地图已被替换，请在当前地图上重新发起请求。"
});

let releaseBusy;
const active = manager.run("active", async context => {
  context.report("wait", {message: "等待释放"});
  await new Promise(resolve => {
    releaseBusy = resolve;
  });
  return {released: true};
});
await Promise.resolve();
const busy = await apiCall(() => manager.run("conflict", () => ({unreachable: true})));
assert.equal(busy.ok, false);
assert.equal(busy.error.code, "operation_busy");
assert.equal(manager.getSnapshot().current.name, "active");
releaseBusy();
await active;
assert.equal(loading.at(-1).visible, false);

let cancelContext;
const cancelling = apiCall(() => manager.run("cancelled", context => {
  cancelContext = context;
  return new Promise((resolve, reject) => {
    context.signal.addEventListener("abort", () => reject(new DOMException(context.signal.reason || "已取消", "AbortError")), {once: true});
  });
}));
await Promise.resolve();
assert.equal(manager.cancelCurrent("测试取消"), true);
const cancelled = await cancelling;
assert.equal(cancelled.ok, false);
assert.equal(cancelled.error.code, "operation_cancelled");
assert.equal(cancelContext.isCurrent(), false);
assert.equal(manager.getSnapshot().busy, false);

transactionValue = "before";
const failed = await apiCall(() => manager.run("runtime-failure", () => {
  transactionValue = "partial";
  throw new Error("renderer exploded");
}, {
  snapshot: () => transactionValue,
  rollback: snapshot => {
    transactionValue = snapshot;
  }
}));
assert.equal(failed.ok, false);
assert.equal(failed.error.code, "operation_failed");
assert.equal(transactionValue, "before");
assert.equal(loading.at(-1).visible, false);

let snapshotTaskRan = false;
const snapshotFailed = await apiCall(() => manager.run("snapshot-failure", () => {
  snapshotTaskRan = true;
}, {
  snapshot: () => {
    throw new Error("snapshot exploded");
  }
}));
assert.equal(snapshotFailed.ok, false);
assert.equal(snapshotFailed.error.code, "operation_failed");
assert.equal(snapshotTaskRan, false, "snapshot 失败后仍执行任务主体");
assert.equal(manager.getSnapshot().busy, false);
assert.equal(loading.at(-1).visible, false);

transactionValue = "before-rollback-fault";
const rollbackFailed = await apiCall(() => manager.run("rollback-failure", () => {
  transactionValue = "partial-rollback-fault";
  throw new Error("task exploded before rollback");
}, {
  snapshot: () => transactionValue,
  rollback: () => {
    throw new Error("rollback exploded");
  }
}));
assert.equal(rollbackFailed.ok, false);
assert.equal(rollbackFailed.error.code, "operation_rollback_failed");
assert.equal(rollbackFailed.error.stage, "rollback");
assert.equal(manager.getSnapshot().busy, false);
assert.equal(loading.at(-1).visible, false);

const retry = await manager.run("retry", () => ({retried: true}));
assert.equal(retry.retried, true);
assert.equal(retry.operation.status, "success");
assert.equal(manager.getSnapshot().busy, false);
assert.equal(manager.getSnapshot().last.name, "retry");
assert.equal(loading.at(-1).visible, false);

const nonLoading = manager.runSync("non-loading", () => ({done: true}), {loading: false});
assert.equal(nonLoading.done, true);
assert(health.some(item => item.type === "health-end" && item.name === "non-loading"), "非 loading 操作没有保留普通 operation stall 监测");
assert(!health.some(item => item.type === "health-end" && item.name === "success"), "允许 loading 的长任务仍套用普通 250ms operation stall 阈值");

const invalidHealth = health.find(item => item.type === "operation-rejected" && item.detail?.name === "invalid");
const obsoleteHealth = health.find(item => item.type === "operation-rejected" && item.detail?.name === "obsolete");
const busyHealth = health.find(item => item.type === "operation-rejected" && item.detail?.name === "conflict");
const runtimeHealth = health.find(item => item.type === "operation-failed" && item.detail?.name === "runtime-failure");
const rollbackHealth = health.find(item => item.type === "operation-failed" && item.detail?.name === "rollback-failure");
assert.equal(invalidHealth?.severity, "info");
assert.equal(obsoleteHealth?.severity, "info");
assert.equal(busyHealth?.severity, "info");
assert.equal(runtimeHealth?.severity, "error");
assert.equal(rollbackHealth?.detail?.code, "operation_rollback_failed");
assert.equal(rollbackHealth?.severity, "error");

const mapReplaceFault = {stage: "after-renderer-load", operationName: "data.importMap", mode: "once", hits: 0};
const mapReplaceFaultView = {location: {search: ""}, __webglGeneratorMapReplaceFault: mapReplaceFault};
assert.equal(maybeInjectMapReplaceDebugFault({defaultView: mapReplaceFaultView}, {stage: "after-renderer-load", operationName: "data.importMap"}), false, "非 debug 页面不得执行地图替换故障钩子");
mapReplaceFaultView.location.search = "?debug=1";
assert.equal(maybeInjectMapReplaceDebugFault({defaultView: mapReplaceFaultView}, {stage: "before-renderer-load", operationName: "data.importMap"}), false, "错误语义阶段不得执行地图替换故障钩子");
assert.equal(maybeInjectMapReplaceDebugFault({defaultView: mapReplaceFaultView}, {stage: "after-renderer-load", operationName: "data.restoreBrowserMap"}), false, "错误 operation 不得执行地图替换故障钩子");
assert.throws(
  () => maybeInjectMapReplaceDebugFault({defaultView: mapReplaceFaultView}, {stage: "after-renderer-load", operationName: "data.importMap"}),
  error => error?.code === "map_replace_debug_fault"
    && error?.stage === "after-renderer-load"
    && error?.details?.operationName === "data.importMap"
    && error?.details?.mode === "once"
    && error?.details?.hits === 1,
  "debug 地图替换故障钩子的错误结构漂移"
);
assert.equal(maybeInjectMapReplaceDebugFault({defaultView: mapReplaceFaultView}, {stage: "after-renderer-load", operationName: "data.importMap"}), false, "once 地图替换故障钩子重复触发");
assert.equal(mapReplaceFault.hits, 2, "once 地图替换故障钩子没有记录匹配尝试");

const history = new EditHistory();
const value = {count: 0};
history.execute({label: "事务前编辑", apply: context => context.count++, revert: context => context.count--}, value);
const historySnapshot = history.createSnapshot();
history.clear();
history.restoreSnapshot(historySnapshot);
assert.equal(history.getStats().undo, 1);
assert.equal(history.getStats().lastLabel, "事务前编辑");

const appSource = await readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8");
const mapReplaceOperations = new Set(["generate.newMap", "generate.rerollSeed", "data.importMap", "data.importHeightmap", "data.restoreBrowserMap"]);
for (const operationName of [
  "generate.newMap",
  "generate.rerollSeed",
  "generate.regenerate",
  "climate.applyDownstreamRebuild",
  "data.importMap",
  "data.importGEO",
  "data.importHeightmap",
  "data.exportPNG",
  "data.exportHeightmapPNG",
  "data.exportCompressedAll",
  "data.saveBrowserMap",
  "data.restoreBrowserMap",
  "oceanCurrents.rebuildWorld",
  "edit.height.rebuildBaseDerived",
  "edit.height.rebuildDownstreamDerived",
  "edit.height.rebuildAllDerived"
]) {
  const runner = mapReplaceOperations.has(operationName) ? "runMapReplace" : "operation\\.run(?:Sync)?";
  assert.match(appSource, new RegExp(`${runner}\\(\\s*\"${operationName.replaceAll(".", "\\.")}\"`));
}
assert.match(appSource, /snapshot: async context =>/);
assert.match(appSource, /loadingOwner = `map-replace:\$\{context\.id\}`/);
assert.match(appSource, /operation\.run\(name, task, config\)\.finally/);
assert.match(appSource, /rollback: \(snapshot, error, context\) => restoreMapReplaceSnapshot/);
assert.match(appSource, /state\.editHistory\.restoreSnapshot\(snapshot\.history\)/);
const mapLoadStart = appSource.indexOf("async function loadMapIntoRuntime");
const mapLoadEnd = appSource.indexOf("\nfunction refreshRuntimeAfterMapLoad", mapLoadStart);
const mapLoadSource = appSource.slice(mapLoadStart, mapLoadEnd);
const preparedLoadIndex = mapLoadSource.indexOf("completePreparedMapLoadAsync(state.map, rendererLoadOptions)");
const mapReplaceFaultIndex = mapLoadSource.indexOf('maybeInjectMapReplaceDebugFault(documentRef, {stage: "after-renderer-load"');
const panelRefreshIndex = mapLoadSource.indexOf('emitLoadTrace(documentRef, {phase: "start", id: "panel-refresh"');
assert.ok(preparedLoadIndex >= 0 && preparedLoadIndex < mapReplaceFaultIndex && mapReplaceFaultIndex < panelRefreshIndex, "地图替换故障钩子必须位于 renderer 分支汇合后、panel refresh 前");
const restoreStart = appSource.indexOf("async function restoreMapReplaceSnapshot");
const restoreEnd = appSource.indexOf("\nfunction restoreCanvasToolMode", restoreStart);
const restoreSource = appSource.slice(restoreStart, restoreEnd);
const rollbackReloadIndex = restoreSource.indexOf("restoreMapReplaceRendererAsync(state, documentRef, snapshot.map, operation)");
const rollbackPreparedThemeIndex = restoreSource.indexOf("preparedPresentation: true");
const rollbackPreparedUnitsIndex = restoreSource.indexOf("setPreparedPresentation({unitPreferences: snapshot.unitPreferences})");
assert.ok(rollbackPreparedThemeIndex >= 0 && rollbackPreparedThemeIndex < rollbackPreparedUnitsIndex && rollbackPreparedUnitsIndex < rollbackReloadIndex, "地图替换回滚必须在旧地图 reload 前无重建恢复主题与单位");
assert.match(restoreSource, /const canPreparePresentation = typeof state\.renderer\?\.setPreparedPresentation === "function"/u, "地图替换回滚缺少 prepared presentation 能力判定");
assert.match(restoreSource, /if \(!mapChanged \|\| !snapshot\.map \|\| !canPreparePresentation\) \{\s*state\.renderer\?\.setUnitPreferences\?\.\(snapshot\.unitPreferences\);\s*applyRuntimeVisualThemeState\(state, documentRef, snapshot\.visualTheme, \{force: true\}\);\s*\}/u, "地图替换回滚缺少未换图、无旧地图或旧 renderer 的 presentation 兼容路径");
const rollbackRendererStart = appSource.indexOf("async function restoreMapReplaceRendererAsync");
const rollbackRendererEnd = appSource.indexOf("\nasync function restoreMapReplaceSnapshot", rollbackRendererStart);
const rollbackRendererSource = appSource.slice(rollbackRendererStart, rollbackRendererEnd);
assert.ok(rollbackRendererStart >= 0 && rollbackRendererEnd > rollbackRendererStart, "地图替换回滚缺少独立 Worker prepared renderer 恢复路径");
assert.match(rollbackRendererSource, /createStagedWorkerSnapshot\(map, \{[\s\S]*?budgetMs: 6,[\s\S]*?sliceBytes: 256 \* 1024/u, "地图替换回滚未以 6ms 分片准备 Worker snapshot");
assert.match(rollbackRendererSource, /workerTaskCoordinator\.run\("render\.prepare"[\s\S]*?payloadIsolated: true/u, "地图替换回滚未使用独立 Worker render.prepare");
assert.match(rollbackRendererSource, /prepareRendererWorkerInstall\([\s\S]*?retainUnpreparedResources: false,[\s\S]*?deferOverlayLayout: true/u, "地图替换回滚未禁止继承故障替换遗留的未准备动态缓存");
assert.match(rollbackRendererSource, /completePreparedMapLoadAsync\(map,[\s\S]*?revealPreparedOverlay: true/u, "地图替换回滚未通过 prepared completion 分段呈现");
assert.doesNotMatch(restoreSource, /state\.renderer\.loadMapAsync\(snapshot\.map/u, "现代地图替换回滚仍直接在主线程重建旧地图");

console.log(JSON.stringify({
  scenarios: ["success", "noop", "invalid-input", "obsolete", "busy-conflict", "cancelled", "runtime-failure", "snapshot-failure", "rollback-failure", "retry", "non-loading-health", "late-report", "map-replace-debug-fault"],
  loadingClosed: loading.at(-1).visible === false,
  stableErrorCodes: [invalid.error.code, obsolete.error.code, busy.error.code, cancelled.error.code, failed.error.code, snapshotFailed.error.code, rollbackFailed.error.code],
  healthRule: {expected: "info", unexpected: "error"},
  integratedOperations: 15,
  mapReplaceRollback: true
}, null, 2));
