#!/usr/bin/env node
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {partitionApiBrowserDiagnostics, waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const baseUrl = process.env.FMG_BASE_URL || "http://127.0.0.1:5411";
const viewports = [
  {width: 1440, height: 900, label: "desktop"},
  {width: 390, height: 760, label: "390px"},
  {width: 320, height: 700, label: "320px"}
];

let browser;
try {
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  const context = await browser.newContext({viewport: viewports[0], deviceScaleFactor: 1});
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto(`${baseUrl}/?healthClear=1&zoneUiBrowser=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 60000);
  await openControlPanel(page);
  await page.getByRole("tab", {name: "管理", exact: true}).click();
  await page.getByRole("button", {name: "地区管理", exact: true}).click();
  await page.waitForSelector('.floating-panel[data-panel-id="zone-panel"]:not(.hidden)');
  consoleErrors.length = 0;
  pageErrors.length = 0;
  await page.evaluate(() => {
    window.__webglGeneratorHealth?.clear?.();
    window.__webglGeneratorDebug?.clearHealthEvents?.();
  });

  const layouts = [];
  for (const viewport of viewports) {
    await page.setViewportSize({width: viewport.width, height: viewport.height});
    await page.waitForTimeout(120);
    const metrics = await measureZonePanel(page);
    assert.ok(metrics.gaps.every(gap => gap >= 8), `${viewport.label} 地区批量图标间距不足 8px`);
    if (viewport === viewports[0]) assert.equal(new Set(metrics.buttonTops).size, 1, "桌面地区批量动作没有保持一行");
    assert.equal(metrics.documentOverflow, 0, `${viewport.label} document 出现横向溢出`);
    assert.ok(metrics.panel.left >= 0 && metrics.panel.right <= viewport.width + 1, `${viewport.label} 地区面板横向越界`);
    assert.ok(metrics.panel.top >= 0 && metrics.panel.bottom <= viewport.height + 1, `${viewport.label} 地区面板纵向越界`);
    layouts.push({label: viewport.label, ...metrics});
  }

  await page.setViewportSize({width: viewports[0].width, height: viewports[0].height});
  const headerText = await page.locator('.floating-panel[data-panel-id="zone-panel"] thead').innerText();
  assert.ok(headerText.indexOf("名称") < headerText.indexOf("编号"), "地区列表没有把名称置于编号之前");

  const before = await zoneNames(page);
  await page.getByRole("button", {name: "重新生成地区", exact: true}).click();
  await page.waitForFunction(previous => {
    const text = document.querySelector(".zone-panel-regeneration > span")?.textContent || "";
    return /扰动 #\d+/.test(text) && text !== previous;
  }, before.status);
  const after = await zoneNames(page);
  assert.deepEqual(after.canvas.slice().sort(), after.table.slice().sort(), "地区重生成后列表与画布名称不一致");
  assert.equal(after.canvas.some(name => /^荒(?:野|原)\s*\d+$/u.test(name)), false, "地区重生成后画布仍有自动编号名称");

  await page.getByRole("button", {name: "撤销", exact: true}).click();
  await page.waitForTimeout(180);
  assert.deepEqual((await zoneNames(page)).canvas.slice().sort(), before.canvas.slice().sort(), "撤销没有恢复地区标签");
  await page.getByRole("button", {name: "重做", exact: true}).click();
  await page.waitForTimeout(180);
  assert.deepEqual((await zoneNames(page)).canvas.slice().sort(), after.canvas.slice().sort(), "重做没有恢复地区标签");

  await page.getByRole("button", {name: "关闭面板", exact: true}).click();
  await page.getByRole("tab", {name: "图层", exact: true}).click();
  const layerButtons = await page.locator('[data-layer-control-group="zones"] button').evaluateAll(buttons => buttons.map(button => ({
    label: button.textContent.trim(),
    layer: button.dataset.layer,
    group: button.dataset.layerGroup,
    pressed: button.getAttribute("aria-pressed")
  })));
  assert.deepEqual(layerButtons.map(item => [item.label, item.layer || null, item.group || null]), [
    ["全部地区", null, "zones,zoneEvents,zoneNatural,zoneWilderness,zoneLabels"],
    ["事件地区", "zoneEvents", null],
    ["自然地区", "zoneNatural", null],
    ["自动无人区", "zoneWilderness", null],
    ["地区名称", "zoneLabels", null]
  ], "地区图层没有提供完整的总开关和四个子开关");
  for (const label of ["地区名称", "自动无人区"]) {
    const button = page.getByRole("button", {name: label, exact: true});
    await button.click();
    assert.equal(await button.getAttribute("aria-pressed"), "false", `${label} 无法独立关闭`);
    await button.click();
    assert.equal(await button.getAttribute("aria-pressed"), "true", `${label} 无法恢复开启`);
  }
  const allZonesButton = page.getByRole("button", {name: "全部地区", exact: true});
  const eventZonesButton = page.getByRole("button", {name: "事件地区", exact: true});
  await eventZonesButton.click();
  assert.equal(await eventZonesButton.getAttribute("aria-pressed"), "false", "事件地区无法独立关闭");
  assert.equal(await allZonesButton.getAttribute("aria-pressed"), "mixed", "关闭子层后全部地区没有进入半选状态");
  await allZonesButton.click();
  assert.equal(await allZonesButton.getAttribute("aria-pressed"), "true", "半选状态点击全部地区没有恢复全开");
  await assertZoneButtons(page, "true");
  await allZonesButton.click();
  assert.equal(await allZonesButton.getAttribute("aria-pressed"), "false", "全部地区无法一键全关");
  await assertZoneButtons(page, "false");
  await allZonesButton.click();
  assert.equal(await allZonesButton.getAttribute("aria-pressed"), "true", "全部地区无法一键恢复");
  await assertZoneButtons(page, "true");

  const health = await page.evaluate(() => ({events: (window.__webglGeneratorHealth?.getEvents?.(200) || []).filter(event => event?.severity === "error")}));
  const inputStalls = health.events.filter(event => event?.type === "input-handler-stall");
  const applicationConsoleErrors = consoleErrors.filter(message => !message.includes("[FMG health] input-handler-stall"));
  const diagnostics = partitionApiBrowserDiagnostics({events: health.events.filter(event => event?.type !== "input-handler-stall")}, applicationConsoleErrors);
  assert.deepEqual(diagnostics.healthErrors.events, [], "地区浏览器回归出现应用 health error");
  assert.deepEqual(diagnostics.consoleErrors, [], "地区浏览器回归出现控制台错误");
  assert.deepEqual(pageErrors, [], "地区浏览器回归出现页面错误");
  assert.equal(await page.evaluate(() => window.__webglGeneratorApp?.renderer?.getStats?.()?.draw?.glError ?? null), 0, "地区浏览器回归出现 WebGL error");

  console.log(JSON.stringify({ok: true, baseUrl, layouts, names: {before: before.canvas, after: after.canvas}, layerButtons, performanceTelemetry: {inputHandlerStalls: inputStalls.length}}, null, 2));
  await context.close();
} finally {
  if (browser) await browser.close();
}

async function openControlPanel(page) {
  const panel = page.getByRole("heading", {name: "控制面板", exact: true});
  if (!await panel.isVisible().catch(() => false)) await page.getByRole("button", {name: "控制面板", exact: true}).click();
  await panel.waitFor();
}

async function measureZonePanel(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('.floating-panel[data-panel-id="zone-panel"]');
    const labels = ["列表多选", "在地图多选", "锁定选中", "解锁选中", "清空选择"];
    const rects = labels.map(label => {
      const button = panel.querySelector(`button[aria-label="${label}"]`);
      const rect = button.getBoundingClientRect();
      return {label, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom};
    });
    const gaps = [];
    for (let index = 1; index < rects.length; index += 1) {
      const previous = rects[index - 1];
      const current = rects[index];
      const sameRow = Math.abs(current.top - previous.top) < 1;
      gaps.push(Math.round((sameRow ? current.left - previous.right : current.top - previous.bottom) * 100) / 100);
    }
    const panelRect = panel.getBoundingClientRect();
    return {
      gaps,
      buttonTops: rects.map(rect => Math.round(rect.top)),
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      panel: {left: panelRect.left, top: panelRect.top, right: panelRect.right, bottom: panelRect.bottom}
    };
  });
}

async function zoneNames(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('.floating-panel[data-panel-id="zone-panel"]');
    return {
      status: panel.querySelector(".zone-panel-regeneration > span")?.textContent.trim() || "",
      table: [...panel.querySelectorAll("tbody tr")].filter(row => !row.classList.contains("object-table-spacer-row")).map(row => row.querySelectorAll("td")[2]?.textContent.trim()).filter(Boolean),
      canvas: [...document.querySelectorAll(".zone-label")].map(label => label.textContent.trim()).filter(Boolean)
    };
  });
}

async function assertZoneButtons(page, expected) {
  for (const label of ["事件地区", "自然地区", "自动无人区", "地区名称"]) {
    assert.equal(await page.getByRole("button", {name: label, exact: true}).getAttribute("aria-pressed"), expected, `全部地区没有同步${label}`);
  }
}
