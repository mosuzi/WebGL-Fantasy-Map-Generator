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
const server = await preview({configFile: join(root, "vite.config.mjs"), preview: {host: "127.0.0.1", port: 5594, strictPort: true}, logLevel: "error"});
const profile = await mkdtemp(join(process.env.TEMP || tmpdir(), "fmg-overlay-order-chrome-"));
const context = await chromium.launchPersistentContext(profile, {channel: "chrome", headless: true, viewport: {width: 1360, height: 900}});
const page = await context.newPage();
page.setDefaultTimeout(30000);
const errors = [];
const target = process.argv.includes("--large") ? 100000 : 3000;
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });

try {
  await page.goto("http://127.0.0.1:5594/?healthClear=1", {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 120000);
  const generated = await page.evaluate(cellsTarget => window.webglGeneratorApi.generate.newMap({confirm: true, seed: "secondary-overlay-layer", cellsTarget}), target);
  assert.equal(generated.ok, true, JSON.stringify(generated.error));
  await waitForApiReady(page, 120000);
  errors.length = 0;
  await page.evaluate(() => {
    window.__overlayLayerLongTasks = [];
    window.__overlayLayerPhases = [{label: "ready", time: performance.now()}];
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) window.__overlayLayerLongTasks.push({startTime: entry.startTime, duration: entry.duration});
    }).observe({type: "longtask", buffered: false});
  });
  const markPhase = label => page.evaluate(value => window.__overlayLayerPhases.push({label: value, time: performance.now()}), label);
  await markPhase("state-opening");
  await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const stateId = app.map.politics.states.find(item => item?.id > 0 && !item.removed && app.map.politics.provinces.filter(p => p?.i > 0 && !p.removed && p.state === item.id).length >= 2)?.id;
    if (!stateId) throw new Error("夹具缺少国家");
    app.panels.state.setTargetStateId(stateId);
    app.panels.state.open(app.map, app.editHistory.getStats());
  });

  const main = page.locator('.floating-panel[data-panel-id="state-panel"]:not(.hidden)');
  const split = main.getByRole("button", {name: "按完整省份拆分国家", exact: true});
  const government = main.getByRole("button", {name: "调整辖下省份后缀", exact: true});
  await split.waitFor({state: "visible"});
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await markPhase("state-ready");
  await markPhase("color-opening");
  await split.click();
  await page.getByRole("dialog", {name: "按完整省份拆分国家"}).waitFor({state: "visible"});
  await markPhase("government-switch");
  await government.click();
  const dialog = page.getByRole("dialog", {name: "调整辖下省份后缀"});
  await dialog.waitFor({state: "visible"});
  await page.waitForTimeout(80);
  const switched = await inspectLayers(page);
  console.log(JSON.stringify({phase: "split-to-province-suffix", ...switched}));
  assert.equal(switched.dialogAboveMain, true, "连续切换二级弹框后，省份后缀弹框被国家面板盖住");
  assert.equal(switched.hitDialog, true, "重叠位置无法点击省份后缀弹框");

  await markPhase("outside-close");
  await main.locator(".floating-panel-header").click({position: {x: 20, y: 20}});
  await dialog.waitFor({state: "hidden"});
  assert.equal(await main.isVisible(), true, "关闭二级弹框误关国家面板");

  await markPhase("filter-focus");
  await government.click();
  await dialog.waitFor({state: "visible"});
  const filter = main.locator(".state-panel-controls input");
  await filter.click();
  await dialog.waitFor({state: "hidden"});
  await page.waitForTimeout(80);
  assert.equal(await filter.evaluate(input => document.activeElement === input), true, "点击父面板输入框时，二级框关闭后夺走了输入焦点");

  await markPhase("dropdown-opening");
  await government.click();
  await dialog.waitFor({state: "visible"});
  await dialog.locator(".state-province-suffix-select .el-select__wrapper").click();
  const options = page.locator(".ui-select-popper.el-popper:visible");
  await options.waitFor({state: "visible"});
  const dropdown = await inspectDropdown(page);
  assert.ok(dropdown.popperZ > dropdown.dialogZ && dropdown.popperZ > dropdown.mainZ, `省份后缀选项被编辑面板盖住：${JSON.stringify(dropdown)}`);
  if (process.env.FMG_TASK_ARTIFACT_DIR && target === 3000) {
    await page.screenshot({path: join(process.env.FMG_TASK_ARTIFACT_DIR, "task-425-government-popup.png")});
  }
  await options.locator(".el-select-dropdown__item").first().click();
  await dialog.locator(".ui-secondary-action-close").click();
  await dialog.waitFor({state: "hidden"});
  await markPhase("stress-activations");
  await main.evaluate(async panel => {
    for (let index = 0; index < 700; index += 10) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      for (let offset = 0; offset < 10; offset++) panel.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true}));
    }
  });
  await markPhase("long-session-government");
  await government.click();
  await dialog.waitFor({state: "visible"});
  const longSession = await inspectLayers(page);
  assert.ok(longSession.dialogAboveMain && longSession.dialogZ < 1500, `长会话二级弹框层级失效：${JSON.stringify(longSession)}`);
  await dialog.locator(".state-province-suffix-select .el-select__wrapper").click();
  await options.waitFor({state: "visible"});
  const longSessionDropdown = await inspectDropdown(page);
  assert.ok(longSessionDropdown.popperZ > longSessionDropdown.dialogZ, `长会话省份后缀选项被弹框遮挡：${JSON.stringify(longSessionDropdown)}`);
  await page.keyboard.press("Escape");
  await options.waitFor({state: "hidden"});
  assert.equal(await dialog.isVisible(), true, "第一次 Esc 应只收起省份后缀候选");
  await page.keyboard.press("Escape");
  await dialog.waitFor({state: "hidden"});
  assert.equal(await government.evaluate(button => document.activeElement === button), true, "Esc 关闭省份后缀弹框后没有返回触发按钮");
  const longTasks = await page.evaluate(() => window.__overlayLayerLongTasks.map(task => ({
    ...task,
    phase: window.__overlayLayerPhases.filter(phase => phase.time <= task.startTime).at(-1)?.label || "unknown"
  })));
  const longestTaskMs = Math.max(0, ...longTasks.map(task => task.duration));
  assert.ok(longestTaskMs <= 200, `交互出现超过 200ms 的 LongTask：${longestTaskMs}ms`);
  assert.deepEqual(errors, [], "正式页面出现错误");
  console.log(JSON.stringify({ok: true, target, switched, dropdown, longSession, longSessionDropdown, longestTaskMs, longTasks: longTasks.filter(task => task.duration >= 50), errors}));
} finally {
  await context.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}

async function inspectDropdown(page) {
  return page.evaluate(() => {
    const main = document.querySelector('.floating-panel[data-panel-id="state-panel"]:not(.hidden)');
    const dialog = document.querySelector('.ui-secondary-action-panel[aria-label="调整辖下省份后缀"]');
    const popper = document.querySelector('.ui-select-popper.el-popper:not([aria-hidden="true"])');
    return {mainZ: Number(getComputedStyle(main).zIndex), dialogZ: Number(getComputedStyle(dialog).zIndex), popperZ: Number(getComputedStyle(popper).zIndex)};
  });
}

async function inspectLayers(page) {
  return page.evaluate(() => {
    const main = document.querySelector('.floating-panel[data-panel-id="state-panel"]:not(.hidden)');
    const dialog = document.querySelector('.ui-secondary-action-panel[aria-label="调整辖下省份后缀"]');
    const mainRect = main.getBoundingClientRect();
    const dialogRect = dialog.getBoundingClientRect();
    const overlap = {
      left: Math.max(mainRect.left, dialogRect.left),
      top: Math.max(mainRect.top, dialogRect.top),
      right: Math.min(mainRect.right, dialogRect.right),
      bottom: Math.min(mainRect.bottom, dialogRect.bottom)
    };
    const point = {x: (overlap.left + overlap.right) / 2, y: (overlap.top + overlap.bottom) / 2};
    const hit = overlap.right > overlap.left && overlap.bottom > overlap.top ? document.elementFromPoint(point.x, point.y) : null;
    const mainZ = Number(getComputedStyle(main).zIndex);
    const dialogZ = Number(getComputedStyle(dialog).zIndex);
    return {mainZ, dialogZ, dialogAboveMain: dialogZ > mainZ, hitDialog: dialog.contains(hit), overlap, point, overlayOpen: dialog.dataset.overlayOpen};
  });
}
