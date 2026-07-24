import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {apiCall} from "../app/webgl-generator/src/runtime/api-result.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {createRuntimeOperationError, createRuntimeOperationManager} from "../app/webgl-generator/src/runtime/runtime-operation.js";

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

const success = await manager.run("success", context => {
  context.report("work", {message: "处理中"});
  return {value: 1};
});
assert.equal(success.value, 1);
assert.equal(success.operation.status, "success");
assert.equal(success.operation.stage, "work");
assert.equal(loading.at(-1).visible, false);

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
assert.equal(invalidHealth?.severity, "info");
assert.equal(obsoleteHealth?.severity, "info");
assert.equal(busyHealth?.severity, "info");
assert.equal(runtimeHealth?.severity, "error");

const history = new EditHistory();
const value = {count: 0};
history.execute({label: "事务前编辑", apply: context => context.count++, revert: context => context.count--}, value);
const historySnapshot = history.createSnapshot();
history.clear();
history.restoreSnapshot(historySnapshot);
assert.equal(history.getStats().undo, 1);
assert.equal(history.getStats().lastLabel, "事务前编辑");

const appSource = await readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8");
for (const operationName of [
  "generate.newMap",
  "generate.rerollSeed",
  "generate.regenerate",
  "climate.applyDownstreamRebuild",
  "data.importMap",
  "data.importGEO",
  "data.importHeightmap",
  "data.exportPNG",
  "data.exportCompressedAll",
  "data.saveBrowserMap",
  "data.restoreBrowserMap",
  "oceanCurrents.rebuildWorld",
  "edit.height.rebuildBaseDerived",
  "edit.height.rebuildDownstreamDerived",
  "edit.height.rebuildAllDerived"
]) {
  assert.match(appSource, new RegExp(`operation\\.run(?:Sync)?\\(\\s*\"${operationName.replaceAll(".", "\\.")}\"`));
}
assert.match(appSource, /snapshot: \(\) => captureMapReplaceSnapshot/);
assert.match(appSource, /rollback: \(snapshot, error, context\) => restoreMapReplaceSnapshot/);
assert.match(appSource, /state\.editHistory\.restoreSnapshot\(snapshot\.history\)/);

console.log(JSON.stringify({
  scenarios: ["success", "noop", "invalid-input", "obsolete", "busy-conflict", "cancelled", "runtime-failure", "retry", "non-loading-health"],
  loadingClosed: loading.at(-1).visible === false,
  stableErrorCodes: [invalid.error.code, obsolete.error.code, busy.error.code, cancelled.error.code, failed.error.code],
  healthRule: {expected: "info", unexpected: "error"},
  integratedOperations: 15,
  mapReplaceRollback: true
}, null, 2));
