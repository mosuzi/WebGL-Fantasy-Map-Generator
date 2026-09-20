import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {createRequire} from "node:module";
import {preview} from "vite";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";
import {inspectUiLayout} from "./ui-layout-inspector.mjs";
import {assertPlayerListIdentifiers, inspectListDebugToggle} from "./ui-layout-list-identifiers.mjs";
import {inspectListInteraction} from "./ui-layout-list-interaction.mjs";
import {layoutFingerprint, saveLayoutReceipt} from "./ui-layout-commit-gate.mjs";
import {OBJECT_KIND} from "../app/webgl-generator/src/runtime/object-kinds.js";

const args = process.argv.slice(2), survey = args.includes("--survey");
const out = path.resolve(process.env.UI_LAYOUT_OUT || path.join(os.tmpdir(), "fmg-ui-layout"));
const filter = args.find(a => a.startsWith("--panel="))?.slice(8);
const skip = args.find(a => a.startsWith("--skip="))?.slice(7);
const panels = "generation climate biome population emblem feature objectDetails height state government province city culture religion diplomacy economy military route marker labelNaming namebase notes measurement river oceanCurrent lake zone cloudStorage".split(" ");
if (filter) assert.ok(filter.split(",").every(name => panels.includes(name)), "未知面板筛选");
const layouts = filter ? [{name: "desktop", width: 1440, zoom: "100%"}, {name: "narrow", width: 690, zoom: "100%"}] : [
  {name: "desktop", width: 1440, zoom: "100%"}, {name: "narrow", width: 690, zoom: "100%"},
  ...[125, 150, 200].map(zoom => ({name: `zoom-${zoom}`, width: 1440, zoom: `${zoom}%`}))
];
const fingerprint = layoutFingerprint();
const buildProof = JSON.parse(await fs.readFile("dist/webgl-generator/ui-layout-build.json", "utf8"));
assert.equal(buildProof.fingerprint, fingerprint, "构建与当前界面源码不一致，请先运行 pnpm run build:app");
await fs.mkdir(out, {recursive: true});
const {chromium} = createRequire(new URL("../source/Fantasy-Map-Generator/package.json", import.meta.url))("playwright");
const server = await preview({configFile: "vite.config.mjs", preview: {host: "127.0.0.1", port: 5594, strictPort: true}});
const profile = await fs.mkdtemp(path.join(os.tmpdir(), "fmg-layout-chrome-"));
const context = await chromium.launchPersistentContext(profile, {channel: "chrome", headless: true, viewport: {width: 1440, height: 1000}});
const page = await context.newPage(), settings = await context.newPage();
const report = {mode: survey ? "调查" : filter ? "目标复验" : "完整验收", cases: [], listDebugToggles: [], listInteractions: [], unavailable: [], errors: [], startupHealth: [], accepted: false};
let measuring = false;
page.setDefaultTimeout(10000);
page.on("pageerror", e => report.errors.push(e.message));
page.on("console", m => {if (m.type() === "error") {if (!measuring && m.text().startsWith("[FMG health]")) report.startupHealth.push(m.text());else report.errors.push(m.text());}});
const surface = '.floating-panel:not(.hidden),.ui-secondary-action-panel:not([hidden]),dialog[open],.el-popper:not([aria-hidden="true"]),.map-toolbar';
let currentLayout;
async function settle() {await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));}
async function capture(state) {
  await settle();
  await assertPlayerListIdentifiers(page);
  const row = await page.evaluate(inspectUiLayout, surface);
  assert.ok(row.checked > 0, `状态没有可见控件：${state}`);
  if (state.includes("-菜单")) assert.ok(row.menuItems > 0, `菜单项未实际检查：${state}`);
  const id = `${currentLayout.name}-${state}`.replace(/[^\w\u4e00-\u9fff-]/g, "_");
  report.cases.push({layout: currentLayout.name, state, ...row});
  if (row.issues.length || ["generation-generation", "economy-页签2", "object-state", "object-city", "组件压力-忙碌"].includes(state)) {
    await page.screenshot({path: path.join(out, `${id}.png`)});
    if (!survey && row.issues.length) throw Error(`${state}：${row.issues[0].type} ${row.issues[0].text}`);
  }
}
async function closePanels() {
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    window.__webglGeneratorApp.stopObjectEditing();
    document.querySelectorAll('.floating-panel:not(.hidden) .floating-panel-close').forEach(b => b.click());
  });
}
async function openPanel(name) {
  await closePanels();
  await page.evaluate(async name => {
    const a = window.__webglGeneratorApp, h = a.editHistory.getStats(), p = a.panels[name];
    if (name === "generation" || name === "cloudStorage") await p.open();
    else if (name === "height") await p.open(h);
    else if (["biome", "climate", "emblem", "feature", "measurement", "oceanCurrent", "population", "state"].includes(name)) await p.open(a.map, h);
    else await p.open(a.map, a.selection, h);
  }, name);
  await page.locator('.floating-panel:not(.hidden)').first().waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('.floating-panel:not(.hidden)')].every(p => p.querySelector('.floating-panel-body')?.textContent.trim() && !p.querySelector('[data-lazy-panel-loading],.lazy-panel-recovery')));
  await settle();
}
async function inspectDisclosure(name) {
  const details = page.locator('.floating-panel:not(.hidden) details:visible');
  for (let i = 0; i < await details.count(); i++) {
    await details.nth(i).evaluate(el => {el.open = true;});
    await capture(`${name}-展开${i + 1}`);
  }
}
async function inspectMenus(name) {
  const triggers = page.locator('.floating-panel:not(.hidden) button[aria-haspopup="menu"]:visible');
  const count = await triggers.count();
  for (let i = 0; i < count; i++) {
    if (!await triggers.nth(i).isEnabled()) continue;
    await triggers.nth(i).click();
    await page.locator('[role="menu"]:visible').first().waitFor();
    await capture(`${name}-菜单${i + 1}`);
    await page.keyboard.press("Escape");
    // 某些菜单不响应 Escape，点回触发器关闭；不点菜单项执行操作。
    if (await page.locator('[role="menu"]:visible').count()) await triggers.nth(i).click();
  }
}
async function inspectSelection(name) {
  const row = page.locator('.floating-panel:not(.hidden) .object-table-row').first();
  if (await row.count()) {
    await row.locator('td:not(.object-table-selection-column):not(.object-table-lock-column)').first().click();
    await capture(`${name}-选中`);
  } else report.unavailable.push({layout: currentLayout.name, state: `${name}-列表选中`, reason: "当前面板无对象行，未宣称覆盖选中态"});
  const input = page.locator('.floating-panel:not(.hidden) .ui-filter-input input,.floating-panel:not(.hidden) input.ui-filter-input').first();
  if (await input.count()) {
    const previous = await input.inputValue();await input.fill("不存在的对象_排版校验");await capture(`${name}-空筛选`);await input.fill(previous);
  }
}
async function inspectControl() {
  const tabs = page.locator('[data-control-tab]');
  const ids = await tabs.evaluateAll(nodes => nodes.map(n => n.dataset.controlTab));
  assert.ok(ids.length >= 7, "控制面板页签缺失");
  for (const id of ids) {
    await page.locator(`[data-control-tab="${id}"]`).click();
    await capture(`generation-${id}`);await inspectDisclosure(`generation-${id}`);
    if (id === "styles") {
      const options = page.locator('.floating-panel:not(.hidden) .el-segmented__item:visible');
      for (let i = 0; i < await options.count(); i++) {await options.nth(i).click();await capture(`generation-style-${i}`);}
    }
  }
  await page.locator('.map-search-open').click();
  const input = page.getByRole("textbox", {name: "地图搜索关键词"});await input.fill("0");
  await page.locator('.map-search-results button').first().waitFor();await capture("搜索-结果");
  await input.fill("不存在的对象_排版校验");await page.waitForFunction(() => !document.querySelector('.map-search-results button'));await capture("搜索-空态");await input.press("Escape");
}
async function inspectObjects() {
  const kinds = Object.values(OBJECT_KIND);
  for (const kind of kinds) {
    await closePanels();
    const result = await page.evaluate(async kind => {
      const a = window.__webglGeneratorApp;
      const read = await window.webglGeneratorApi.objects.list(kind);
      if (!read.ok) throw Error(JSON.stringify(read));
      const rows = read.data?.items;
      const object = rows?.find(o => o && !o.removed && o.id != null && (!["state", "province", "culture", "religion"].includes(kind) || Number(o.id) > 0));
      if (!object) return {available: false, read};
      const selected = await window.webglGeneratorApi.selection.select({kind, id: object.id ?? object.i});
      if (!selected.ok) throw Error(JSON.stringify(selected));
      document.querySelectorAll('.floating-panel:not(.hidden) .floating-panel-close').forEach(b => b.click());
      a.panels.objectDetails.show(a.selection);return {available: true};
    }, kind);
    if (!result.available) {report.unavailable.push({layout: currentLayout.name, state: `object-${kind}`, reason: "夹具无该类对象"});continue;}
    await capture(`object-${kind}`);
    if (kind === "city" || kind === "lake") {
      await page.getByRole("button", {name: "编辑名称", exact: true}).click();
      await page.getByRole("button", {name: "退出名称编辑", exact: true}).waitFor();await capture(`object-${kind}-编辑`);
    }
  }
}
async function inspectPressure() {
  // 只检验真实按钮 DOM 的排版状态；不冒充云端连接或错误恢复业务验收。
  await openPanel("city");
  const html = await page.locator('.ui-button:visible').first().evaluate(el => el.outerHTML);
  await closePanels();
  for (const state of ["长中文", "忙碌", "错误"]) {
    await page.evaluate(({html, state}) => {
      document.querySelector('[data-ui-layout-fixture]')?.remove();
      const panel = document.createElement("section");panel.className = "floating-panel";panel.dataset.uiLayoutFixture = state;
      panel.style.cssText = "position:fixed;left:8px;top:80px;width:320px;max-width:calc(100vw - 16px)";
      panel.innerHTML = '<div class="floating-panel-body"><p role="status"></p><div class="object-details-actions"></div></div>';
      panel.querySelector('p').textContent = state === "错误" ? "操作失败，请检查输入后重试。" : "检查长中文、较大数值 123,456,789 和状态切换后的排版";
      const row = panel.querySelector('.object-details-actions');row.innerHTML = html + html;
      [...row.children].forEach((button, i) => {
        button.removeAttribute('id');button.querySelector('span').textContent = i ? "取消" : state === "忙碌" ? "正在处理，请稍候" : state === "错误" ? "重新尝试此项操作" : "按名称库重命名筛选";
        if (state === "忙碌") {button.disabled = true;button.classList.add('is-disabled');}
      });document.body.append(panel);
    }, {html, state});
    await capture(`组件压力-${state}`);
  }
  await page.locator('[data-ui-layout-fixture]').evaluate(el => el.remove());
}
try {
  await settings.goto("chrome://settings/appearance");
  await page.goto("http://127.0.0.1:5594/");await waitForApiReady(page, 180000);
  const generated = await page.evaluate(() => window.webglGeneratorApi.generate.newMap({confirm: true, seed: "ui-layout-contract", cellsTarget: 3000}));assert.ok(generated.ok);
  const fixtures = await page.evaluate(async () => {
    const api = window.webglGeneratorApi, packCell = window.__webglGeneratorApp.map.pack.cells.h.findIndex(h => h >= 20);
    return [await api.edit.notes.createStandalone({id: "layout-note", name: "很长的中文名称用于检查列表与详情的排版边界", body: "排版验收正文".repeat(12), packCell}), await api.edit.measurements.save([{x: 100, y: 100}, {x: 240, y: 180}], {name: "长中文测量名称与多位数值检查"})];
  });assert.ok(fixtures.every(r => r.ok), JSON.stringify(fixtures));
  measuring = true;
  const actual = await page.evaluate(() => Object.keys(window.__webglGeneratorApp.panels).filter(k => k !== "development").sort());
  assert.deepEqual(actual, [...panels].sort(), "面板清单变化：必须更新覆盖清单");
  for (currentLayout of layouts) {
    await settings.locator("#zoomLevel").selectOption({label: currentLayout.zoom});await page.setViewportSize({width: currentLayout.width, height: 1000});await page.bringToFront();
    await page.waitForFunction(expected => Math.abs(innerWidth - expected) <= 1, currentLayout.width / (parseInt(currentLayout.zoom) / 100));
    for (const name of panels.filter(n => (!filter || filter.split(",").includes(n)) && n !== skip)) {
      if (name === "objectDetails") {await inspectObjects();continue;}
      await openPanel(name);await capture(`${name}-初始`);
      if (currentLayout.name === "desktop") {
        const toggle = await inspectListDebugToggle(page);
        if (toggle) report.listDebugToggles.push({panel: name, ...toggle});
      }
      if (["city", "state", "notes"].includes(name)) {
        const interaction = await inspectListInteraction(page);
        if (interaction) report.listInteractions.push({layout: currentLayout.name, panel: name, ...interaction});
      }
      if (name === "generation") await inspectControl();
      else {
        await inspectSelection(name);await inspectDisclosure(name);
        if (["economy", "marker"].includes(name)) {
          const options = page.locator('.floating-panel:not(.hidden) .el-segmented__item:visible');
          for (let i = 0; i < await options.count(); i++) {await options.nth(i).click();await capture(`${name}-页签${i}`);await inspectSelection(`${name}-页签${i}`);}
        }
      }
      await inspectMenus(name);
    }
    if (!filter && !skip) await inspectPressure();
    console.log(`${currentLayout.name}：已观察 ${report.cases.length} 个状态，问题 ${report.cases.reduce((n, r) => n + r.issues.length, 0)}`);
  }
  assert.equal(report.errors.length, 0, "浏览器错误");
  if (!filter && !skip) assert.ok(report.listInteractions.filter(item => item.lock && item.horizontalScroll > 0).length >= 5, "各布局必须覆盖锁列横滚与 Ctrl 多选");
  if (!filter && !skip) assert.ok(report.listDebugToggles.filter(item => item.restored).length >= 15, "必须验证至少 15 类正式列表的 ID 恢复");
  if (!survey && !filter && !skip) for (const layout of layouts) {
    const covered = new Set(report.cases.filter(c => c.layout === layout.name).map(c => c.state));
    for (const name of panels.filter(n => n !== "objectDetails")) assert.ok(covered.has(`${name}-初始`), `${layout.name}/${name} 未执行`);
    for (const kind of ["state", "city", "label", "note", "measurement", "river", "lake"]) assert.ok(covered.has(`object-${kind}`), `${layout.name}/${kind} 未覆盖`);
    for (const state of ["object-city-编辑", "搜索-结果", "搜索-空态", "组件压力-长中文", "组件压力-忙碌", "组件压力-错误"]) assert.ok(covered.has(state), `${layout.name}/${state} 未执行`);
  }
  report.accepted = !survey && !filter && !skip && report.cases.every(row => row.issues.length === 0);
  if (report.accepted) saveLayoutReceipt(report, fingerprint);
} catch (error) {report.failure = error.stack;throw error;}
finally {
  await fs.writeFile(path.join(out, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({accepted: report.accepted, states: report.cases.length, unavailable: report.unavailable.length, issues: report.cases.reduce((n, r) => n + r.issues.length, 0), out}));
  await context.close();await new Promise(resolve => server.httpServer.close(resolve));
}
