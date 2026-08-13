import assert from "node:assert/strict";
import {readdir, readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const matrixPath = path.join(root, "docs/audits/ui-copy-audit-matrix.json");
const matrix = JSON.parse(await readFile(matrixPath, "utf8"));
const componentsDir = path.join(root, "app/webgl-generator/src/ui/vue/components");
const adaptersDir = path.join(root, "app/webgl-generator/src/ui/panels");

assert.equal(matrix.schema, "ui-copy-audit@1");
assert.equal(matrix.task, 330);
assert.equal(matrix.policy.operationDelayMs, 420);
assert.equal(matrix.policy.panelDelayMs, 180);
assert.equal(matrix.policy.debugKeepsTechnicalTerms, true);

const actualPanels = (await readdir(componentsDir)).filter(name => name.endsWith("Panel.vue")).sort();
const matrixPanels = matrix.panels.map(item => item.component).sort();
assert.deepEqual(matrixPanels, actualPanels, "Vue 面板文案矩阵未精确覆盖正式组件");
assert.equal(actualPanels.length, 28, "正式 Vue 面板数量漂移");
for (const panel of matrix.panels) {
  assert.equal(panel.reviewed, true, `${panel.component} 尚未完成文案审阅`);
  assert.ok(panel.focus.length >= 3, `${panel.component} 缺少空态、操作或结果审阅面`);
}

const actualAdapters = (await readdir(adaptersDir)).filter(name => name.endsWith("-panel.js")).sort();
assert.deepEqual([...matrix.adapters].sort(), actualAdapters, "面板适配层矩阵未精确覆盖正式文件");
assert.equal(actualAdapters.length, 30, "正式面板适配文件数量漂移");

const loadingFiles = new Set();
for (const source of matrix.loadingSources) {
  assert.ok(source.context && source.policy, `${source.id} 缺少用户情境或反馈策略`);
  for (const file of source.files) {
    await readFile(path.join(root, file), "utf8");
    loadingFiles.add(file);
  }
}
assert.equal(matrix.loadingSources.length, 6, "Loading 来源分组漂移");
assert.ok(loadingFiles.has("app/webgl-generator/src/runtime/delayed-operation-feedback.js"));
assert.ok(loadingFiles.has("app/webgl-generator/src/ui/panels/lazy-vue-panel.js"));

for (const item of matrix.transformations) {
  assert.equal(item.visibility, "ordinary", `${item.file} 的改写没有限定普通界面`);
  const source = await readFile(path.join(root, item.file), "utf8");
  assert.ok(source.includes(item.recommended), `${item.file} 缺少权威文案：${item.recommended}`);
  assert.ok(!source.includes(item.current), `${item.file} 仍残留旧普通文案：${item.current}`);
}

const lazySource = await readFile(path.join(adaptersDir, "lazy-vue-panel.js"), "utf8");
assert.match(lazySource, /DEFAULT_LAZY_PANEL_LOADING_DELAY_MS\s*=\s*180/);
assert.match(lazySource, /dataset\.lazyPanelLoading\s*=\s*"pending"/);
assert.match(lazySource, /正在打开\$\{subject\}，请稍候片刻。/);
const delayedSource = await readFile(path.join(root, "app/webgl-generator/src/runtime/delayed-operation-feedback.js"), "utf8");
assert.match(delayedSource, /DEFAULT_DELAYED_OPERATION_MS\s*=\s*420/);

let lazyAdapterCount = 0;
for (const name of actualAdapters) {
  const source = await readFile(path.join(adaptersDir, name), "utf8");
  if (!source.includes("loading:")) continue;
  lazyAdapterCount++;
  assert.ok(!source.includes("正在加载"), `${name} 仍使用旧加载句式`);
  assert.match(source, /loading:\s*"正在打开.+，请稍候片刻。"/u, `${name} 未使用统一慢打开句式`);
}
assert.equal(lazyAdapterCount, 26, "按需加载适配器数量漂移");

const loadingLegacyPhrases = [
  "正在装配地图引擎", "正在写入受控网格结构", "正在重算气候下游内容", "正在接入地图运行时",
  "正在准备地图显示", "正在应用市场归属并重算经济链", "正在重新扩张文化", "正在规划路线改线"
];
const panelLegacyPhrases = [
  "连续拖动城市到目标 cell", "只读预检", "路线编辑预检", "备注导入预检", "河道 cell 不连续"
];
for (const file of ["app/webgl-generator/src/main.js", "app/webgl-generator/src/runtime/app.js"]) {
  const source = await readFile(path.join(root, file), "utf8");
  for (const phrase of loadingLegacyPhrases) assert.ok(!source.includes(phrase), `${file} 回流旧 Loading 文案：${phrase}`);
}
const ordinaryPanelFiles = [
  ...actualPanels.map(name => `app/webgl-generator/src/ui/vue/components/${name}`),
  ...actualAdapters.map(name => `app/webgl-generator/src/ui/panels/${name}`)
];
for (const file of ordinaryPanelFiles) {
  const source = await readFile(path.join(root, file), "utf8");
  for (const phrase of panelLegacyPhrases) assert.ok(!source.includes(phrase), `${file} 回流旧普通文案：${phrase}`);
}

console.log(JSON.stringify({
  ok: true,
  panels: actualPanels.length,
  adapters: actualAdapters.length,
  lazyAdapters: lazyAdapterCount,
  loadingSources: matrix.loadingSources.length,
  transformations: matrix.transformations.length
}, null, 2));
