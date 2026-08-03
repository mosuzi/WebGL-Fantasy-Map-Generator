#!/usr/bin/env node
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {mkdtemp, readFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {gunzipSync} from "node:zlib";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const baseUrl = process.env.FMG_BASE_URL || "http://127.0.0.1:5423";
const templateStorageKey = "webgl-generator-cloud-filename-template";
const filenameTemplate = "{name}-{seed}.{ext}";
const mapName = "本地云端同名验收";
const expectedFilename = `${mapName}-stage-2-1.webfmg`;
const downloadDir = await mkdtemp(join(tmpdir(), "fmg-map-save-template-"));

let browser;
try {
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  const context = await browser.newContext({viewport: {width: 1280, height: 820}, acceptDownloads: true});
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto(`${baseUrl}/?healthClear=1&mapSaveTemplateBrowser=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 60000);
  await openControlPanel(page);
  await page.getByRole("tab", {name: "生成", exact: true}).click();
  await page.locator("#map-name-input").fill(mapName);
  await page.locator("#map-name-input").dispatchEvent("input");
  await assertTemplateSettingsCollapsed(page);
  await page.locator("#toggle-map-filename-template").click();
  assert.equal(await page.locator("#toggle-map-filename-template").getAttribute("aria-expanded"), "true");
  await page.locator("#map-filename-template-input").fill(filenameTemplate);
  await assertTemplatePreview(page, expectedFilename);

  const localSave = await captureDownload(page, "local-save", async () => {
    await page.getByRole("tab", {name: "简介", exact: true}).click();
    await page.getByRole("button", {name: "保存", exact: true}).click();
    await page.getByRole("menuitem", {name: "保存到本地", exact: true}).click();
  });
  await page.locator("#file-operation-status").filter({hasText: "地图已保存到本地文件。"}).waitFor();
  const compressedExport = await captureDownload(page, "compressed-export", async () => {
    await page.getByRole("button", {name: "导出", exact: true}).click();
    await page.locator(".project-export-advanced-section > summary").click();
    await page.locator("#export-map-data-compressed").click();
  });

  for (const result of [localSave, compressedExport]) {
    assert.equal(result.filename, expectedFilename, `${result.kind} 未使用共享模板`);
    const document = JSON.parse(gunzipSync(await readFile(result.path)).toString("utf8"));
    assert.equal(document.options.mapName, mapName, `${result.kind} 文档选项名称错误`);
    assert.equal(document.map.options.mapName, mapName, `${result.kind} 地图选项名称错误`);
    assert.equal(document.map.metadata.name, mapName, `${result.kind} 地图 metadata 名称错误`);
  }

  await page.reload({waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 60000);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), templateStorageKey), filenameTemplate, "刷新后共享模板未保留");
  await openControlPanel(page);
  await page.getByRole("tab", {name: "生成", exact: true}).click();
  await assertTemplateSettingsCollapsed(page);
  await page.locator("#toggle-map-filename-template").click();
  const layouts = [];
  for (const viewport of [{width: 1440, height: 900}, {width: 390, height: 760}, {width: 320, height: 700}]) {
    await page.setViewportSize(viewport);
    const metrics = await page.evaluate(() => {
      const input = document.getElementById("map-filename-template-input").getBoundingClientRect();
      const preview = document.getElementById("map-filename-template-preview").getBoundingClientRect();
      return {
        documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        input: {left: input.left, right: input.right},
        preview: {left: preview.left, right: preview.right}
      };
    });
    assert.equal(metrics.documentOverflow, 0, `${viewport.width}px 页面出现横向溢出`);
    assert.ok(metrics.input.left >= 0 && metrics.input.right <= viewport.width + 1, `${viewport.width}px 模板输入越界`);
    assert.ok(metrics.preview.left >= 0 && metrics.preview.right <= viewport.width + 1, `${viewport.width}px 模板预览越界`);
    layouts.push({viewport: `${viewport.width}x${viewport.height}`, ...metrics});
  }

  const healthErrors = await page.evaluate(() => (window.__webglGeneratorHealth?.getEvents?.(200) || []).filter(event => event?.severity === "error"));
  assert.deepEqual(consoleErrors, [], "共享保存模板浏览器回归出现 console error");
  assert.deepEqual(pageErrors, [], "共享保存模板浏览器回归出现 page error");
  assert.deepEqual(healthErrors, [], "共享保存模板浏览器回归出现 health error");
  assert.equal(await page.evaluate(() => window.__webglGeneratorApp?.renderer?.getStats?.()?.draw?.glError ?? null), 0, "共享保存模板浏览器回归出现 WebGL error");

  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    template: filenameTemplate,
    downloads: [localSave.filename, compressedExport.filename],
    refreshPersisted: true,
    layouts,
    consoleErrors: 0,
    pageErrors: 0,
    healthErrors: 0,
    glError: 0
  }, null, 2));
  await context.close();
} finally {
  if (browser) await browser.close();
  await rm(downloadDir, {recursive: true, force: true});
}

async function openControlPanel(page) {
  const heading = page.getByRole("heading", {name: "控制面板", exact: true});
  if (!await heading.isVisible().catch(() => false)) await page.getByRole("button", {name: "控制面板", exact: true}).click();
  await heading.waitFor();
}

async function captureDownload(page, kind, action) {
  const downloadPromise = page.waitForEvent("download");
  await action();
  const download = await downloadPromise;
  const filename = download.suggestedFilename();
  const path = join(downloadDir, `${kind}.webfmg`);
  await download.saveAs(path);
  return {kind, filename, path};
}

async function assertTemplatePreview(page, expected) {
  await page.locator("#map-filename-template-preview", {hasText: expected}).waitFor();
  assert.equal(await page.locator("#map-filename-template-preview").getAttribute("data-state"), "ready");
}

async function assertTemplateSettingsCollapsed(page) {
  assert.equal(await page.locator("#toggle-map-filename-template").getAttribute("aria-expanded"), "false");
  assert.equal(await page.locator("#map-filename-template-settings").isVisible(), false);
  const style = await page.evaluate(() => {
    const input = document.getElementById("map-name-input").getBoundingClientRect();
    const toggle = document.getElementById("toggle-map-filename-template").getBoundingClientRect();
    const computed = getComputedStyle(document.getElementById("toggle-map-filename-template"));
    return {
      centerDelta: Math.abs((input.top + input.bottom) / 2 - (toggle.top + toggle.bottom) / 2),
      borderTopWidth: computed.borderTopWidth,
      backgroundColor: computed.backgroundColor,
      backgroundImage: computed.backgroundImage,
      boxShadow: computed.boxShadow
    };
  });
  assert.ok(style.centerDelta <= 0.5, `模板设置图标未垂直居中：${style.centerDelta}px`);
  assert.equal(style.borderTopWidth, "0px", "模板设置图标不应绘制边框");
  assert.equal(style.backgroundColor, "rgba(0, 0, 0, 0)", "模板设置图标不应绘制底色");
  assert.equal(style.backgroundImage, "none", "模板设置图标不应绘制渐变底色");
  assert.equal(style.boxShadow, "none", "模板设置图标不应绘制阴影");
}
