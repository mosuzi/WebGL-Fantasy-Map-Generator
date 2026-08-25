#!/usr/bin/env node
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createServer as createViteServer} from "vite";

import {closeTask350BrowserResource, createTask350BrowserArtifact} from "./task-350-browser-artifact.mjs";
import {collectTask350LongTaskWindow, prepareTask350LongTaskObserver, resetTask350LongTaskWindow, summarizeTask350LongTasks} from "./task-350-browser-long-task.mjs";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const host = "127.0.0.1";
const timeoutMs = 180000;
const evidence = createTask350BrowserArtifact("browser-save-feedback", {mode: "browser-feedback"});
let vite;
let browser;
let context;
let thrownError = null;

try {
  const playwrightRoot = process.env.FMG_PLAYWRIGHT_ROOT ? resolve(process.env.FMG_PLAYWRIGHT_ROOT) : sourceDir;
  const playwright = createRequire(join(playwrightRoot, "package.json"))("playwright");
  evidence.mark("server-start", {active: "browser-save-feedback"});
  vite = await createViteServer({configFile: join(rootDir, "vite.config.mjs"), server: {host, port: 0}, logLevel: "error"});
  await vite.listen();
  const port = vite.httpServer.address().port;
  evidence.mark("browser-start", {active: "browser-save-feedback", complete: "server-start"});
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  context = await browser.newContext({viewport: {width: 1280, height: 820}, deviceScaleFactor: 1});
  await context.addInitScript(() => localStorage.clear());
  const page = await context.newPage();
  await prepareTask350LongTaskObserver(page);
  page.setDefaultTimeout(timeoutMs);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => {
    if (message.type() === "error" && !message.text().startsWith("[FMG health]")) consoleErrors.push(message.text());
  });
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(`http://${host}:${port}/?debug=1&healthClear=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, timeoutMs);
  await page.waitForFunction(() => window.__webglGeneratorApp?.runtimeOperationSnapshot?.busy === false);
  await page.evaluate(async () => {
    const result = await window.webglGeneratorApi.generate.newMap({confirm: true, seed: "browser-save-feedback", cellsTarget: 3000, heightmapTemplate: "continents"});
    if (!result?.ok) throw new Error(`固定地图生成失败：${JSON.stringify(result?.error || result)}`);
  });
  await page.waitForFunction(() => window.__webglGeneratorApp?.runtimeOperationSnapshot?.busy === false);
  await page.locator("#open-generation-panel").click();
  await page.locator('[data-control-tab="about"]').locator("..").click();
  await page.locator(".project-save-dropdown button").waitFor({state: "visible"});
  evidence.mark("browser-evaluation", {active: "browser-save-feedback", complete: "browser-start"});
  await resetTask350LongTaskWindow(page);

  await page.evaluate(() => {
    const status = document.getElementById("file-operation-status");
    status.textContent = "地图已保存到浏览器 IndexedDB 降级存储：原始 53.53MB，压缩后 13.26MB。下次打开会优先恢复此地图。";
    status.dataset.state = "success";
  });
  await triggerBrowserSave(page);
  await page.waitForFunction(() => window.__webglGeneratorApp?.runtimeOperationSnapshot?.busy === false && document.getElementById("map-toast")?.hidden === false && document.getElementById("map-toast")?.textContent === "保存成功");
  const success = await readFeedback(page);
  assert.equal(success.status.text, "", "成功保存仍在控制面板留下文本");
  assert.equal(success.status.state, null, "成功保存遗留控制面板状态色");
  assert.equal(success.toast.text, "保存成功", "成功保存没有改用页面下方提示");
  assert.equal(success.toast.tone, "success", "成功 toast 色调错误");

  await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    window.__browserSaveFeedbackOriginal = app.runtimeActions.data.saveBrowserMap;
    app.runtimeActions.data.saveBrowserMap = async () => {
      throw new Error("浏览器存储故障注入");
    };
  });
  await triggerBrowserSave(page);
  await page.waitForFunction(() => document.getElementById("map-toast")?.dataset.tone === "error");
  const failure = await readFeedback(page);
  assert.equal(failure.status.text, "", "保存失败仍在控制面板留下文本");
  assert.equal(failure.status.state, null, "保存失败遗留控制面板状态色");
  assert.match(failure.toast.text, /保存到浏览器失败：浏览器存储故障注入/);
  assert.equal(failure.toast.tone, "error", "失败 toast 色调错误");
  await page.waitForTimeout(5500);
  const failureAt5500 = await readFeedback(page);
  assert.equal(failureAt5500.toast.hidden, false, "失败提示未持续至少 6 秒");
  await page.waitForTimeout(800);
  const failureAt6300 = await readFeedback(page);
  assert.equal(failureAt6300.toast.hidden, true, "失败提示超过约 6 秒仍未关闭");
  await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    app.runtimeActions.data.saveBrowserMap = window.__browserSaveFeedbackOriginal;
    delete window.__browserSaveFeedbackOriginal;
  });
  assert.deepEqual(consoleErrors, [], "浏览器保存反馈产生 application console error");
  assert.deepEqual(pageErrors, [], "浏览器保存反馈产生 page error");
  const longTasks = await collectTask350LongTaskWindow(page, "save-feedback");
  const performance = summarizeTask350LongTasks(longTasks, 200);
  const overBudget = performance.overBudget;
  assert.deepEqual(overBudget, [], `浏览器保存反馈目标窗口出现 >200ms LongTask：${JSON.stringify(overBudget)}`);
  const finalReport = {ok: true, success, failure, consoleErrors, pageErrors, longTasks, performance};
  const compactReport = {...finalReport, failureAt5500, failureAt6300, performance};
  evidence.setResult(finalReport, compactReport);
  evidence.succeed();
  console.log(JSON.stringify(finalReport, null, 2));
} catch (error) {
  evidence.fail(error);
  thrownError = error;
} finally {
  for (const [label, close] of [
    ["browser-save-feedback-context", context ? () => context.close() : null],
    ["browser-save-feedback-browser", browser ? () => browser.close() : null],
    ["browser-save-feedback-vite", vite ? () => vite.close() : null]
  ]) {
    if (!close) continue;
    try {
      await closeTask350BrowserResource(label, close);
    } catch (error) {
      evidence.failTeardown(error);
      if (!thrownError) thrownError = error;
    }
  }
  evidence.persist();
}
if (thrownError) throw thrownError;

async function triggerBrowserSave(page) {
  await page.locator(".project-save-dropdown button").click();
  const item = page.locator("#save-browser-storage");
  await item.waitFor({state: "visible"});
  await item.click();
}

function readFeedback(page) {
  return page.evaluate(() => {
    const status = document.getElementById("file-operation-status");
    const toast = document.getElementById("map-toast");
    return {
      status: {text: status?.textContent || "", state: status?.dataset.state || null},
      toast: {hidden: Boolean(toast?.hidden), text: toast?.textContent || "", tone: toast?.dataset.tone || null}
    };
  });
}
