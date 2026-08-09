#!/usr/bin/env node
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createServer as createViteServer} from "vite";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const host = "127.0.0.1";
const port = 5529;
const timeoutMs = 120000;
const vite = await createViteServer({
  configFile: join(rootDir, "vite.config.mjs"),
  server: {host, port, strictPort: true},
  logLevel: "error"
});
let browser;

try {
  await vite.listen();
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  const context = await browser.newContext({viewport: {width: 1280, height: 800}, deviceScaleFactor: 1});
  await context.addInitScript(() => localStorage.clear());
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  const consoleErrors = [];
  const healthConsoleErrors = [];
  const pageErrors = [];
  page.on("console", message => {
    if (message.type() !== "error") return;
    if (message.text().startsWith("[FMG health]")) healthConsoleErrors.push(message.text());
    else consoleErrors.push(message.text());
  });
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto(`http://${host}:${port}/?healthClear=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, timeoutMs);
  await waitForMapReady(page);
  await page.evaluate(() => {
    window.__webglGeneratorApp.healthMonitor?.clear?.();
    window.__webglGeneratorHealth?.clear?.();
    window.__webglGeneratorDebug?.clearHealthEvents?.();
  });
  healthConsoleErrors.length = 0;
  const fixture = await page.evaluate(() => {
    const map = window.__webglGeneratorApp.map;
    const city = (map.settlements?.cities || []).find(item => item && item.id !== undefined && !item.removed);
    const river = (map.rivers?.rivers || map.pack?.rivers || []).find(item => item && item.id !== undefined && !item.removed);
    if (!city || !river) throw new Error("对象详情城市回归缺少城市或河流夹具");
    return {city: {id: city.id, name: city.name}, riverId: river.id};
  });

  await selectObject(page, {kind: "city", id: fixture.city.id});
  const layouts = [];
  for (const viewport of [
    {width: 1280, height: 800, label: "desktop"},
    {width: 390, height: 844, label: "390px"},
    {width: 320, height: 800, label: "320px"}
  ]) {
    await page.setViewportSize({width: viewport.width, height: viewport.height});
    await page.waitForTimeout(80);
    const layout = await inspectCityActions(page);
    assert.deepEqual(layout.labels, ["定位", "打开城市管理", "名称库改名", "编辑名称"], `${viewport.label} 城市详情动作不完整或顺序错误`);
    assert.deepEqual(layout.rowCounts, [2, 2], `${viewport.label} 城市详情动作没有形成两列两行`);
    assert.equal(layout.gridColumns, 2, `${viewport.label} 城市详情没有固定为两列`);
    assert.equal(layout.horizontalOverflow, 0, `${viewport.label} 城市详情动作发生横向溢出`);
    assert.equal(layout.clippedButtons.length, 0, `${viewport.label} 城市详情按钮文字被裁切：${layout.clippedButtons.join("、")}`);
    layouts.push({...viewport, ...layout});
  }

  await selectObject(page, {kind: "river", id: fixture.riverId});
  assert.equal(await page.getByRole("button", {name: "打开城市管理", exact: true}).count(), 0, "非城市对象不应显示打开城市管理入口");

  await page.setViewportSize({width: 1280, height: 800});
  await selectObject(page, {kind: "city", id: fixture.city.id});
  await page.getByRole("button", {name: "打开城市管理", exact: true}).click();
  const cityPanel = page.locator('.floating-panel[data-panel-id="city-panel"]:not(.hidden)');
  await cityPanel.waitFor({state: "visible"});
  await cityPanel.locator(".object-table-row.selected-row").waitFor({state: "visible"});
  const opened = await page.evaluate(cityId => ({
    selection: window.webglGeneratorApi.selection.get().data.selection,
    panelOpen: window.__webglGeneratorApp.panels.city.isOpen(),
    selectedRowText: document.querySelector('.floating-panel[data-panel-id="city-panel"]:not(.hidden) .object-table-row.selected-row')?.textContent?.trim() || "",
    cityId
  }), fixture.city.id);
  assert.equal(opened.selection?.object?.kind, "city", "打开城市管理后丢失城市 selection");
  assert.equal(Number(opened.selection?.object?.id), Number(fixture.city.id), "打开城市管理后 selection 变成了其它城市");
  assert.equal(opened.panelOpen, true, "城市管理面板没有打开");
  assert.match(opened.selectedRowText, new RegExp(escapeRegExp(fixture.city.name || String(fixture.city.id))), "城市管理没有保持当前城市为选中项");

  const healthErrors = await page.evaluate(() => (window.__webglGeneratorHealth?.getEvents?.(200) || []).filter(event => event?.severity === "error" || event?.level === "error"));
  const glError = await page.evaluate(() => window.__webglGeneratorApp.renderer.canvas.getContext("webgl2")?.getError?.() ?? null);
  assert.deepEqual(healthErrors, [], "城市详情打开链产生 health error");
  assert.equal(glError, 0, "城市详情打开链产生 WebGL error");
  assert.deepEqual(healthConsoleErrors, [], "城市详情打开链产生 console health error");
  assert.deepEqual(consoleErrors, [], "城市详情打开链产生 console error");
  assert.deepEqual(pageErrors, [], "城市详情打开链产生 page error");

  console.log(JSON.stringify({ok: true, fixture, layouts, opened, healthErrors, glError, healthConsoleErrors, consoleErrors, pageErrors}, null, 2));
} finally {
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await vite.close();
}

async function waitForMapReady(page) {
  await page.waitForFunction(() => window.webglGeneratorApi?.info?.mapSummary?.()?.data?.ready === true);
  await page.waitForFunction(() => document.getElementById("app-loading-screen")?.hidden === true);
}

async function selectObject(page, object) {
  await page.evaluate(target => {
    const result = window.webglGeneratorApi.selection.select(target);
    if (!result?.ok) throw new Error(result?.error?.message || `无法选择 ${target.kind}#${target.id}`);
  }, object);
  await page.waitForSelector('.floating-panel[data-panel-id="object-details"]:not(.hidden)');
}

async function inspectCityActions(page) {
  return page.evaluate(() => {
    const actions = document.querySelector('.floating-panel[data-panel-id="object-details"]:not(.hidden) .object-details-actions-city');
    if (!actions) throw new Error("城市对象详情缺少专属动作容器");
    const buttons = [...actions.querySelectorAll("button")];
    const rects = buttons.map(button => ({
      label: button.textContent?.trim() || "",
      top: button.getBoundingClientRect().top,
      left: button.getBoundingClientRect().left,
      width: button.getBoundingClientRect().width
    }));
    const rows = [];
    for (const rect of rects) {
      const row = rows.find(item => Math.abs(item.top - rect.top) <= 1);
      if (row) row.items.push(rect);
      else rows.push({top: rect.top, items: [rect]});
    }
    const computed = getComputedStyle(actions);
    const clippedButtons = buttons
      .filter(button => button.scrollWidth > button.clientWidth + 1)
      .map(button => button.textContent?.trim() || "");
    return {
      labels: rects.map(rect => rect.label),
      rowCounts: rows.sort((a, b) => a.top - b.top).map(row => row.items.length),
      gridColumns: computed.gridTemplateColumns.split(" ").filter(Boolean).length,
      horizontalOverflow: Math.max(0, actions.scrollWidth - actions.clientWidth),
      clippedButtons,
      width: actions.getBoundingClientRect().width,
      buttonWidths: rects.map(rect => Math.round(rect.width * 10) / 10)
    };
  });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
