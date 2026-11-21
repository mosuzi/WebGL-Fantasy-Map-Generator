#!/usr/bin/env node
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {mkdtemp} from "node:fs/promises";
import {join, resolve} from "node:path";
import {tmpdir} from "node:os";
import {preview} from "vite";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const root = resolve(import.meta.dirname, "..");
const {chromium} = createRequire(join(root, "source/Fantasy-Map-Generator/package.json"))("playwright");
const cellsTarget = process.argv.includes("--100k") ? 100000 : 3000;
const server = await preview({configFile: join(root, "vite.config.mjs"), preview: {host: "127.0.0.1", port: 5594, strictPort: true}, logLevel: "error"});
const profile = await mkdtemp(join(process.env.TEMP || tmpdir(), "fmg-natural-view-"));
const context = await chromium.launchPersistentContext(profile, {channel: "chrome", headless: true, viewport: {width: 1360, height: 900}});
const page = await context.newPage();
page.setDefaultTimeout(60000);
const errors = [];
const dialogs = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => {if (message.type() === "error") errors.push(message.text());});
page.on("dialog", dialog => { dialogs.push(dialog.message()); void dialog.dismiss(); });

try {
  await page.goto("http://127.0.0.1:5594/?healthClear=1&debug=1", {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 120000);
  const generated = await page.evaluate(target => window.webglGeneratorApi.generate.newMap({confirm: true, seed: `natural-view-${target}`, cellsTarget: target}), cellsTarget);
  assert.equal(generated.ok, true, JSON.stringify(generated.error));
  await waitForApiReady(page, 120000);
  errors.length = 0;
  await page.evaluate(() => {
    window.__naturalViewLongTasks = [];
    window.__naturalViewPhases = [];
    new PerformanceObserver(list => window.__naturalViewLongTasks.push(...list.getEntries().map(entry => ({startTime: entry.startTime, duration: entry.duration})))).observe({type: "longtask", buffered: false});
  });
  const markPhase = label => page.evaluate(name => window.__naturalViewPhases.push({name, time: performance.now()}), label);

  const modes = await page.locator("[data-mode]").evaluateAll(items => items.map(item => item.dataset.mode));
  assert.equal(modes.length, 13, "正式视图分母已变化，应重新核对操作范围");
  await page.locator("#open-generation-panel").click();
  await page.locator('[data-control-tab="themes"]').click();
  for (const [index, mode] of modes.entries()) {
    await markPhase(`view:${mode}`);
    await page.locator(".view-mode-segmented .el-segmented__item").nth(index).click();
    await page.waitForFunction(expected => window.__webglGeneratorApp.renderer.colorMode === expected
      && !window.__webglGeneratorApp.runtimeOperationSnapshot?.busy, mode);
    assert.equal(await page.locator(`[data-mode="${mode}"]`).evaluate(button => button.classList.contains("active")), true, `视图 ${mode} 的选中态未随画面同步`);
  }

  await page.locator('[data-control-tab="layers"]').click();
  const layers = await page.locator('[data-control-panel="layers"] button[data-layer]').evaluateAll(items => items.map(item => item.dataset.layer));
  assert.ok(layers.length >= 20, `正式图层入口不足：${layers.length}`);
  const testedLayers = cellsTarget === 100000 ? layers.slice(0, 4) : layers;
  for (const layer of testedLayers) {
    await markPhase(`layer:${layer}`);
    const control = page.locator(`[data-control-panel="layers"] button[data-layer="${layer}"]`);
    const visible = await control.getAttribute("aria-pressed") !== "true";
    await control.click();
    await page.waitForFunction(([id, expected]) => window.__webglGeneratorApp.renderer.layerVisibility[id] === expected
      && !window.__webglGeneratorApp.runtimeOperationSnapshot?.busy, [layer, visible]);
    assert.equal(await control.getAttribute("aria-pressed"), String(visible), `图层 ${layer} 的按钮未随画面同步`);
  }
  const groups = await page.locator('[data-control-panel="layers"] button[data-layer-group]').evaluateAll(items => items.map(item => item.dataset.layerGroup));
  for (const group of groups) {
    await markPhase(`group:${group}`);
    const control = page.locator(`[data-control-panel="layers"] button[data-layer-group="${group}"]`);
    const visible = await control.getAttribute("aria-pressed") !== "true";
    await control.click();
    await page.waitForFunction(([members, expected]) => members.every(layer => window.__webglGeneratorApp.renderer.layerVisibility[layer] === expected)
      && !window.__webglGeneratorApp.runtimeOperationSnapshot?.busy, [group.split(","), visible]);
    assert.equal(await control.getAttribute("aria-pressed"), String(visible), `图层组 ${group} 的按钮未随画面同步`);
  }

  await page.locator('[data-control-tab="themes"]').click();
  for (const [label, key] of [["显示海底", "showOceanHeight"], ["海岸与格边平滑", "smoothCellBorders"], ["整图外框柔化", "mapEdgeFade"]]) {
    await markPhase(`switch:${key}`);
    const control = page.getByRole("switch", {name: label});
    const visible = (await control.getAttribute("aria-checked")) !== "true";
    await page.locator('[data-control-panel="themes"] .ui-switch-label').filter({hasText: label}).click();
    await page.waitForFunction(([name, expected]) => window.__webglGeneratorApp.renderer.viewOptions[name] === expected
      && !window.__webglGeneratorApp.runtimeOperationSnapshot?.busy, [key, visible]);
    assert.equal(await control.getAttribute("aria-checked"), String(visible), `${label} 未同步到按钮`);
  }

  await markPhase("concurrent:view-layer");
  const concurrent = await page.evaluate(async ({modes, layer}) => {
    const app = window.__webglGeneratorApp;
    const nonGpu = modes.find(mode => !app.renderer.canPresentGpuResidentColorMode(mode)) || modes[0];
    const other = modes.find(mode => mode !== nonGpu);
    await window.webglGeneratorApi.layers.setViewMode(other);
    const visible = !app.renderer.layerVisibility[layer];
    const [view, toggle] = await Promise.all([
      window.webglGeneratorApi.layers.setViewMode(nonGpu),
      window.webglGeneratorApi.layers.setVisible(layer, visible)
    ]);
    return {nonGpu, layer, visible, view, toggle};
  }, {modes, layer: layers[0]});
  assert.equal(concurrent.view.ok, true, JSON.stringify(concurrent.view.error));
  assert.equal(concurrent.toggle.ok, true, JSON.stringify(concurrent.toggle.error));
  await page.waitForFunction(({nonGpu, layer, visible}) => {
    const app = window.__webglGeneratorApp;
    return app.renderer.colorMode === nonGpu && app.renderer.layerVisibility[layer] === visible
      && document.querySelector(`[data-mode="${nonGpu}"]`)?.classList.contains("active")
      && document.querySelector(`[data-control-panel="layers"] button[data-layer="${layer}"]`)?.getAttribute("aria-pressed") === String(visible);
  }, concurrent);

  await markPhase("concurrent:view-invalid");
  const invalidAfterView = await page.evaluate(async modes => {
    const current = window.__webglGeneratorApp.renderer.colorMode;
    const next = modes.find(mode => mode !== current);
    const [view, invalid] = await Promise.all([
      window.webglGeneratorApi.layers.setViewMode(next),
      window.webglGeneratorApi.layers.setVisible("invalid-layer", true)
    ]);
    return {next, view, invalid};
  }, modes);
  assert.equal(invalidAfterView.view.ok, true, JSON.stringify(invalidAfterView.view.error));
  assert.equal(invalidAfterView.invalid.ok, false, "无效图层应被拒绝");
  assert.equal(await page.locator(`[data-mode="${invalidAfterView.next}"]`).evaluate(button => button.classList.contains("active")), true, "后续请求失败不应让已提交视图的选中态回退");

  await markPhase("concurrent:border-patches");
  await page.evaluate(() => {
    document.dispatchEvent(new CustomEvent("webgl-generator-state-border-blend", {detail: {patch: {widthWorld: 8}}}));
    document.dispatchEvent(new CustomEvent("webgl-generator-state-border-blend", {detail: {patch: {strength: 0.6}}}));
  });
  await page.waitForFunction(() => {
    const style = window.__webglGeneratorApp.renderer.viewOptions.stateBorderBlend;
    return style.widthWorld === 8 && style.strength === 0.6 && !window.__webglGeneratorApp.runtimeOperationSnapshot?.busy;
  });
  const border = await page.evaluate(() => window.__webglGeneratorApp.renderer.viewOptions.stateBorderBlend);
  assert.equal(border.widthWorld, 8);
  assert.equal(border.strength, 0.6);

  const preferences = await page.evaluate(() => JSON.parse(localStorage.getItem("webgl-generator-control-preferences") || "{}"));
  assert.equal(preferences.colorMode, invalidAfterView.next, "视图未写入显示偏好");
  assert.equal(preferences.stateBorderBlend.widthWorld, 8, "国界宽度未写入显示偏好");
  assert.equal(preferences.stateBorderBlend.strength, 0.6, "国界强度未写入显示偏好");

  if (cellsTarget === 3000) {
    await page.locator('[data-control-tab="management"]').click();
    await page.locator("#regeneration-kind").selectOption("markers");
    const historyBefore = await page.evaluate(() => window.__webglGeneratorApp.editHistory.getStats().undo);
    await markPhase("regenerate:markers");
    await page.locator('[data-regenerate-kind="markers"]').click();
    await page.waitForFunction(before => {
      const app = window.__webglGeneratorApp;
      return !app.runtimeOperationSnapshot?.busy && app.editHistory.getStats().undo === before + 1;
    }, historyBefore);
    assert.deepEqual(dialogs, [], "可撤销的领域重新生成不应弹出确认");

    await page.locator('[data-control-tab="generation"]').click();
    const previousSeed = await page.evaluate(() => window.__webglGeneratorApp.map.metadata.seed);
    await page.locator("#random-seed").click();
    await markPhase("replace:new-map");
    await page.locator("#generate-map").click();
    await page.waitForFunction(seed => {
      const app = window.__webglGeneratorApp;
      return app.map?.metadata?.seed !== seed && !app.runtimeOperationSnapshot?.busy;
    }, previousSeed, {timeout: 120000});
    assert.equal(await page.evaluate(() => window.__webglGeneratorApp.editHistory.getStats().undo), 0, "完整换图后编辑历史未重置");
    assert.deepEqual(dialogs, [], "明确的生成按钮不应再附加弹框");
  }

  const health = await page.evaluate(() => {
    const values = window.__naturalViewLongTasks;
    const longTasks = values.filter(value => value.duration > 150).map(value => ({duration: Math.round(value.duration),
      phase: window.__naturalViewPhases.filter(item => item.time <= value.startTime).at(-1)?.name || "unmarked"}));
    return {count: values.length, maxMs: Math.max(0, ...values.map(value => value.duration)), over200: values.filter(value => value.duration > 200).length, longTasks,
      webglError: window.__webglGeneratorApp.renderer.gl.getError()};
  });
  assert.equal(health.over200, 0, JSON.stringify(health));
  assert.equal(health.webglError, 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ok: true, cellsTarget, modes: modes.length, layers: testedLayers.length, groups: groups.length, concurrent: {mode: concurrent.nonGpu, layer: concurrent.layer}, health}));
} finally {
  await context.close();
  await server.httpServer.close();
}
