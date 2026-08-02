#!/usr/bin/env node
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

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

  await page.goto(`${baseUrl}/?healthClear=1&cloudStorageBrowser=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 60000);
  await openCloudStoragePanel(page);
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
    const metrics = await measureCloudStoragePanel(page);
    assert.deepEqual(metrics.cardBackgrounds, ["rgb(16, 23, 27)", "rgb(16, 23, 27)", "rgb(16, 23, 27)"], `${viewport.label} 云存储卡片没有统一深色背景`);
    assert.deepEqual(metrics.cardBorders, ["rgb(51, 68, 79)", "rgb(51, 68, 79)", "rgb(51, 68, 79)"], `${viewport.label} 云存储卡片没有统一深色边框`);
    assert.equal(metrics.titleColor, "rgb(237, 244, 246)", `${viewport.label} 云存储标题颜色错误`);
    assert.equal(metrics.mutedColor, "rgb(159, 176, 186)", `${viewport.label} 云存储说明文字颜色错误`);
    assert.equal(metrics.codeBackground, "rgb(23, 33, 39)", `${viewport.label} 环境变量代码标签没有使用深色背景`);
    assert.equal(metrics.linkColor, "rgb(215, 168, 79)", `${viewport.label} 配置说明链接颜色错误`);
    assert.equal(metrics.documentOverflow, 0, `${viewport.label} document 出现横向溢出`);
    assert.equal(metrics.contentOverflow, 0, `${viewport.label} 云存储正文出现横向溢出`);
    assert.ok(metrics.panel.left >= 0 && metrics.panel.right <= viewport.width + 1, `${viewport.label} 云存储面板横向越界`);
    assert.ok(metrics.panel.top >= 0 && metrics.panel.bottom <= viewport.height + 1, `${viewport.label} 云存储面板纵向越界`);
    layouts.push({label: viewport.label, ...metrics});
  }

  const healthErrors = await page.evaluate(() => (window.__webglGeneratorHealth?.getEvents?.(200) || []).filter(event => event?.severity === "error"));
  assert.deepEqual(healthErrors, [], "云存储浏览器回归出现应用 health error");
  assert.deepEqual(consoleErrors, [], "云存储浏览器回归出现控制台错误");
  assert.deepEqual(pageErrors, [], "云存储浏览器回归出现页面错误");
  assert.equal(await page.evaluate(() => window.__webglGeneratorApp?.renderer?.getStats?.()?.draw?.glError ?? null), 0, "云存储浏览器回归出现 WebGL error");

  console.log(JSON.stringify({ok: true, baseUrl, layouts}, null, 2));
  await context.close();
} finally {
  if (browser) await browser.close();
}

async function openCloudStoragePanel(page) {
  const heading = page.getByRole("heading", {name: "控制面板", exact: true});
  if (!await heading.isVisible().catch(() => false)) await page.getByRole("button", {name: "控制面板", exact: true}).click();
  await heading.waitFor();
  await page.getByRole("tab", {name: "简介", exact: true}).click();
  await page.getByRole("button", {name: "保存", exact: true}).click();
  await page.getByRole("menuitem", {name: "云端存储…", exact: true}).click();
  await page.waitForSelector('.floating-panel[data-panel-id="cloud-storage-panel"]:not(.hidden) .cloud-storage-panel');
}

async function measureCloudStoragePanel(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('.floating-panel[data-panel-id="cloud-storage-panel"]');
    const content = panel.querySelector(".cloud-storage-panel");
    const notice = content.querySelector(".cloud-storage-notice");
    const configuration = content.querySelector(".cloud-storage-configuration");
    const boundary = content.querySelector(".cloud-storage-live-boundary");
    const panelRect = panel.getBoundingClientRect();
    const style = element => getComputedStyle(element);
    return {
      panel: {left: panelRect.left, top: panelRect.top, right: panelRect.right, bottom: panelRect.bottom},
      cardBackgrounds: [notice, configuration, boundary].map(element => style(element).backgroundColor),
      cardBorders: [notice, configuration, boundary].map(element => style(element).borderColor),
      titleColor: style(notice.querySelector("strong")).color,
      mutedColor: style(notice.querySelector("span")).color,
      codeBackground: style(configuration.querySelector("code")).backgroundColor,
      linkColor: style(configuration.querySelector("a")).color,
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      contentOverflow: content.scrollWidth - content.clientWidth
    };
  });
}
