#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {runGateSequence} from "./regression-gate-runner.mjs";

const calls = [];
const synthetic = runGateSequence([
  {id: "one", label: "第一步", kind: "code"},
  {id: "two", label: "第二步", kind: "browser"},
  {id: "three", label: "第三步", kind: "code"}
], gate => {
  calls.push(gate.id);
  return {status: gate.id === "two" ? 17 : 0};
});
assert.equal(synthetic.failureCode, 17, "失败退出码没有原样传播");
assert.deepEqual(calls, ["one", "two"], "失败后仍执行了后续门禁");
assert.deepEqual(synthetic.steps.map(step => step.status), ["passed", "failed", "skipped"], "失败后的 skipped 状态错误");
assert.equal(synthetic.steps[2].exitCode, null, "跳过步骤不应伪造退出码");

const browserScripts = [
  "webgl-generator-api-capabilities-regression.mjs",
  "webgl-generator-api-roundtrip-regression.mjs",
  "webgl-generator-api-geo-regression.mjs",
  "webgl-generator-api-export-records-regression.mjs",
  "webgl-generator-api-namebase-docs-regression.mjs",
  "webgl-generator-api-namebase-renames-regression.mjs"
];
const [suiteSource, packageSource, ...browserSources] = await Promise.all([
  readFile(new URL("./webgl-generator-api-regression-suite.mjs", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8"),
  ...browserScripts.map(filename => readFile(new URL(`./${filename}`, import.meta.url), "utf8"))
]);
for (const gate of ["api-capabilities", "api-edit-coverage", "api-roundtrip", "api-geo", "api-exports", "api-namebases", "api-operation", "api-data-compatibility", "api-stability"]) {
  assert(suiteSource.includes(`id: "${gate}"`), `聚合门禁缺少 ${gate}`);
}
assert.match(suiteSource, /spawnSync\(process\.execPath/, "聚合门禁没有使用独立子进程");
assert.match(suiteSource, /CI: "true"/, "聚合门禁没有固定 CI 环境");
assert.match(packageSource, /"regress:api-suite": "node --no-warnings \.\/tools\/webgl-generator-api-regression-suite\.mjs"/, "package.json 缺少聚合命令");
for (let index = 0; index < browserScripts.length; index += 1) {
  assert.match(browserSources[index], /import \{waitForApiReady\}/, `${browserScripts[index]} 没有导入统一就绪等待`);
  assert.match(browserSources[index], /await waitForApiReady\(page, timeoutMs\)/, `${browserScripts[index]} 没有等待 operation 空闲`);
}
assert.match(browserSources[0], /inspectUiApiConvergence/, "capabilities 浏览器门禁缺少 UI / API 共路径验收");
assert.match(browserSources[1], /data\.importMap\.recovery/, "roundtrip 浏览器门禁缺少失败后重试");

console.log(JSON.stringify({
  ok: true,
  failureCode: synthetic.failureCode,
  statuses: synthetic.steps.map(step => step.status),
  executed: calls,
  skipped: synthetic.steps.filter(step => step.status === "skipped").map(step => step.id)
}, null, 2));
