import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {extractLocalImports, findBrowserLaunchers, PACKAGE_BROWSER_FORBIDDEN} from "./tool-source-browser-launch-audit.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const packageJson = JSON.parse(readFileSync(`${root}/package.json`, "utf8"));
const scripts = packageJson.scripts || {};

const finalGateScripts = Object.freeze([
  "audit:canonical-map-fields",
  "audit:legacy-core-paths",
  "regress:registry-document-identity",
  "regress:core-contracts",
  "regress:core-manifests",
  "regress:core-facade",
  "regress:core-dependencies",
  "regress:notes-core",
  "regress:markers-core",
  "regress:markers-resource-economy-core",
  "regress:population-core-protocol",
  "regress:foundation-core-protocol",
  "regress:society-politics-core-protocol",
  "regress:settlements-zones-annotations-core-protocol",
  "regress:features-networks-resources-core-protocol",
  "regress:economy-diplomacy-military-core-protocol",
  "regress:economy-worker-task",
  "regress:military-policy-worker-task",
  "regress:whole-map-profile-core-protocol",
  "regress:map-file-io-worker",
  "regress:worker-task",
  "regress:headless-api",
  "regress:headless-write",
  "regress:map-migration",
  "regress:api-data-compatibility",
  "typecheck:core",
  "build:app"
]);
const allowedDependencyScripts = Object.freeze([
  "regress:map-adoption-binding-owner"
]);

const forbidden = PACKAGE_BROWSER_FORBIDDEN;
const checkedScripts = new Set();
const entrypoints = new Set();

assert.equal(new Set(finalGateScripts).size, finalGateScripts.length, "终验顶层 package gate 不得重复");
for (const name of finalGateScripts) inspectScript(name, []);
assert.ok(finalGateScripts.every(name => checkedScripts.has(name)), "27 个终验顶层 package gate 必须全部进入递归审计");
const dependencyScripts = [...checkedScripts]
  .filter(name => !finalGateScripts.includes(name))
  .sort();
assert.deepEqual(dependencyScripts, [...allowedDependencyScripts].sort(), "终验递归依赖必须显式登记且保持精确");
assert.match(scripts["regress:foundation-core-protocol"], /pnpm(?:\.cmd)?\s+(?:run\s+)?regress:map-adoption-binding-owner(?:\s|$)/u, "foundation 顶层门必须包含 adoption binding owner 子门");

const scannedToolSources = new Set();
for (const entrypoint of entrypoints) {
  const findings = findBrowserLaunchers({root, entrypoint: resolve(root, entrypoint), scanned: scannedToolSources});
  assert.deepEqual(findings, [], `终验工具入口或本地工具导入链包含浏览器启动原语：${findings.join(", ")}`);
}
const rejectedCounterexample = "regress:measurement";
assert.doesNotMatch(rejectedCounterexample, forbidden, "反例 package script 名应保持命名不可见性");
assert.doesNotMatch(scripts[rejectedCounterexample], forbidden, "反例命令应保持命名不可见性");
const counterexampleEntrypoint = resolve(root, "tools/webgl-generator-measurement-import-regression.mjs");
assert.ok(findBrowserLaunchers({root, entrypoint: counterexampleEntrypoint, scanned: new Set()}).length > 0, "防误触审计必须拒绝命名不可见但实际启动 Chromium 的已知反例");
assert.deepEqual(extractLocalImports('import "./hidden-browser-launcher.mjs";'), ["./hidden-browser-launcher.mjs"], "防误触审计必须解析 side-effect import");
const sideEffectCounterexampleEntrypoint = resolve(root, "tools/fixtures/task-350-side-effect-browser-entry.mjs");
assert.ok(findBrowserLaunchers({root, entrypoint: sideEffectCounterexampleEntrypoint, scanned: new Set()}).length > 0, "防误触审计必须拒绝通过 side-effect import 隐藏的浏览器启动原语");

console.log(JSON.stringify({
  status: "pass",
  gates: finalGateScripts.length,
  scriptsChecked: checkedScripts.size,
  scripts: [...checkedScripts],
  dependencyScripts,
  entrypoints: [...entrypoints].sort(),
  sourceFilesScanned: scannedToolSources.size,
  rejectedCounterexample,
  rejectedSideEffectCounterexample: "tools/fixtures/task-350-side-effect-browser-entry.mjs",
  forbiddenTerms: ["browser", "browser drivers", "Chrome/CDP", "Vite dev/preview"],
  browserRuns: 0
}, null, 2));

function inspectScript(name, stack) {
  assert.ok(!stack.includes(name), `package script 循环引用：${[...stack, name].join(" -> ")}`);
  assert.equal(typeof scripts[name], "string", `缺少终验 package script：${name}`);
  assert.doesNotMatch(name, forbidden, `终验脚本名包含浏览器入口：${name}`);
  assert.doesNotMatch(scripts[name], forbidden, `终验命令包含浏览器入口：${name}`);
  checkedScripts.add(name);

  for (const match of scripts[name].matchAll(/\.\/tools\/[^\s"']+\.(?:mjs|js)/gu)) {
    assert.doesNotMatch(match[0], forbidden, `终验工具入口包含浏览器入口：${match[0]}`);
    entrypoints.add(match[0]);
  }
  for (const match of scripts[name].matchAll(/pnpm(?:\.cmd)?\s+(?:run\s+)?([\w:-]+)/gu)) {
    inspectScript(match[1], [...stack, name]);
  }
}
