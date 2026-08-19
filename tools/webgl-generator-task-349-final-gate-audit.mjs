import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

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

const forbidden = /browser|playwright|puppeteer|selenium|chrom(?:e|ium)|\bcdp\b|devtools|web-driver|webdriver|vite\s+(?:dev|preview)|--host\b/iu;
const checkedScripts = new Set();
const entrypoints = new Set();

for (const name of finalGateScripts) inspectScript(name, []);
assert.equal(checkedScripts.size, finalGateScripts.length, "终验脚本不得隐式扩展为未登记的 package script");

console.log(JSON.stringify({
  status: "pass",
  gates: finalGateScripts.length,
  scripts: [...checkedScripts],
  entrypoints: [...entrypoints].sort(),
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
