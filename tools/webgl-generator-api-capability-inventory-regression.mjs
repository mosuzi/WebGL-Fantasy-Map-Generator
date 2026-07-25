#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {buildApiMethodCoverage, collectRuntimeApiMethods} from "../app/webgl-generator/src/runtime/api-capability-coverage.js";

const methods = {
  info: ["read"],
  edit: ["states.rename"]
};
const metadata = {
  info: {read: {mutates: "none"}},
  edit: {"states.rename": {mutates: "states"}}
};
const runtimeApi = {
  version: "test",
  info: {read() {}},
  edit: {states: {rename() {}}}
};

const complete = buildApiMethodCoverage(methods, metadata, runtimeApi);
assert.equal(complete.complete, true, "一致样本应通过三方覆盖门禁");
assert.equal(complete.methods, 2, "声明方法计数错误");
assert.equal(complete.metadata, 2, "元数据方法计数错误");
assert.equal(complete.runtime, 2, "真实 API 方法计数错误");
assert.deepEqual(collectRuntimeApiMethods(runtimeApi), {info: ["read"], edit: ["states.rename"]}, "嵌套真实 API 方法展开错误");

const missingRuntime = buildApiMethodCoverage(methods, metadata, {info: {read() {}}, edit: {states: {}}});
assert.equal(missingRuntime.complete, false, "缺少真实方法时不得通过");
assert.deepEqual(missingRuntime.runtimeMissing, ["edit.states.rename"], "没有报告声明存在但真实 API 缺失的方法");

const extraRuntime = buildApiMethodCoverage(methods, metadata, {...runtimeApi, extra: {ping() {}}});
assert.equal(extraRuntime.complete, false, "真实 API 多出命名空间时不得通过");
assert.deepEqual(extraRuntime.runtimeExtra, ["extra.ping"], "没有报告真实 API 多余方法");

const brokenMetadata = buildApiMethodCoverage(methods, {info: {}, edit: metadata.edit, extra: {ghost: {}}}, runtimeApi);
assert.equal(brokenMetadata.complete, false, "元数据缺失或多余时不得通过");
assert.deepEqual(brokenMetadata.missing, ["info.read"], "没有报告缺失元数据");
assert.deepEqual(brokenMetadata.extra, ["extra.ghost"], "没有报告额外元数据命名空间");

const [consoleApiSource, inventory] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/runtime/console-api.js", import.meta.url), "utf8"),
  readFile(new URL("../docs/task-notes/console-api-capability-inventory.md", import.meta.url), "utf8")
]);
assert.match(consoleApiSource, /capabilities: \(\) => apiCall\(\(\) => buildCapabilities\(api\)\)/, "capabilities 没有读取真实 API 对象");
assert.match(consoleApiSource, /buildApiMethodCoverage\(methods, methodMetadata, api\)/, "capabilities 没有执行三方覆盖门禁");
assert.match(inventory, /当前公开基线：13 个命名空间、237 个方法，其中 129 个为编辑方法/, "能力清单基线数量不完整");
for (const classification of ["已暴露且共路径", "明确暂缓"]) {
  assert(inventory.includes(`| ${classification} |`), `能力清单缺少分类：${classification}`);
}
for (const owner of ["第 29 项", "第 30 项", "第 31 项", "第 32 项", "第 33 项"]) {
  assert(inventory.includes(owner), `能力清单缺少后续归属：${owner}`);
}
const inventoryRows = inventory.split("\n").filter(line => /^\| \d+ \|/.test(line));
assert(inventoryRows.length >= 24, `能力清单行数不足：${inventoryRows.length}`);
assert(inventoryRows.every(line => /\| (已暴露且共路径|已暴露但仍有分叉|未暴露|明确暂缓) \|/.test(line)), "能力清单存在未分类行");
assert(inventoryRows.every(line => !/\|\s*\|\s*$/.test(line)), "能力清单存在缺少后续归属的行");

console.log(JSON.stringify({
  ok: true,
  syntheticCoverage: {
    methods: complete.methods,
    metadata: complete.metadata,
    runtime: complete.runtime
  },
  negativeCases: {
    runtimeMissing: missingRuntime.runtimeMissing,
    runtimeExtra: extraRuntime.runtimeExtra,
    metadataMissing: brokenMetadata.missing,
    metadataExtra: brokenMetadata.extra
  },
  inventoryRows: inventoryRows.length
}, null, 2));
