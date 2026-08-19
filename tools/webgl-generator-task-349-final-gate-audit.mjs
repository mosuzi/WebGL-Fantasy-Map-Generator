import assert from "node:assert/strict";
import {existsSync, readFileSync} from "node:fs";
import {dirname, extname, resolve} from "node:path";
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

const scannedToolSources = new Set();
for (const entrypoint of entrypoints) {
  const findings = findBrowserLaunchers(resolve(root, entrypoint), scannedToolSources);
  assert.deepEqual(findings, [], `终验工具入口或本地工具导入链包含浏览器启动原语：${findings.join(", ")}`);
}
const rejectedCounterexample = "regress:measurement";
assert.doesNotMatch(rejectedCounterexample, forbidden, "反例 package script 名应保持命名不可见性");
assert.doesNotMatch(scripts[rejectedCounterexample], forbidden, "反例命令应保持命名不可见性");
const counterexampleEntrypoint = resolve(root, "tools/webgl-generator-measurement-import-regression.mjs");
assert.ok(findBrowserLaunchers(counterexampleEntrypoint, new Set()).length > 0, "防误触审计必须拒绝命名不可见但实际启动 Chromium 的已知反例");

console.log(JSON.stringify({
  status: "pass",
  gates: finalGateScripts.length,
  scripts: [...checkedScripts],
  entrypoints: [...entrypoints].sort(),
  sourceFilesScanned: scannedToolSources.size,
  rejectedCounterexample,
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

function findBrowserLaunchers(entrypoint, scanned) {
  const findings = [];
  scan(entrypoint);
  return findings;

  function scan(file) {
    const path = resolveToolModule(file);
    if (!path || scanned.has(path)) return;
    scanned.add(path);
    const source = readFileSync(path, "utf8");
    for (const [label, pattern] of [
      ["browser-driver-package", /["'](?:playwright(?:-core)?|puppeteer(?:-core)?|selenium-webdriver)["']/giu],
      ["browser-launch", /\b(?:chromium|firefox|webkit|puppeteer)\s*\.\s*launch(?:PersistentContext)?\s*\(/giu],
      ["cdp-session", /\b(?:connectOverCDP|createCDPSession)\s*\(/gu],
      ["webdriver", /\b(?:WebDriver|webdriver)\b/gu],
      ["browser-process", /\b(?:spawn|execFile)\s*\([^\n]*(?:chrome|chromium|msedge)/giu]
    ]) {
      if (pattern.test(source)) findings.push(`${label}:${path.slice(root.length + 1).replaceAll("\\", "/")}`);
    }
    for (const match of source.matchAll(/(?:from\s*|import\s*\(\s*|require\s*\(\s*)["'](\.{1,2}\/[^"']+)["']/gu)) {
      const imported = resolve(dirname(path), match[1]);
      if (isToolPath(imported)) scan(imported);
    }
  }
}

function resolveToolModule(path) {
  for (const candidate of extname(path) ? [path] : [path, `${path}.mjs`, `${path}.js`, `${path}.ts`, resolve(path, "index.mjs"), resolve(path, "index.js")]) {
    if (existsSync(candidate) && isToolPath(candidate)) return resolve(candidate);
  }
  return null;
}

function isToolPath(path) {
  const toolsRoot = resolve(root, "tools");
  const normalized = resolve(path);
  return normalized === toolsRoot || normalized.startsWith(`${toolsRoot}\\`) || normalized.startsWith(`${toolsRoot}/`);
}
