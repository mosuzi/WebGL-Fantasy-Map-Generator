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
const timeoutMs = 180000;
const vite = await createViteServer({configFile: join(rootDir, "vite.config.mjs"), server: {host, port: 0}, logLevel: "error"});
let browser;

try {
  await vite.listen();
  const port = vite.httpServer.address().port;
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  const context = await browser.newContext({viewport: {width: 1280, height: 800}, deviceScaleFactor: 1});
  await context.addInitScript(() => localStorage.clear());
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => {
    if (message.type() === "error" && !message.text().startsWith("[FMG health]")) consoleErrors.push(message.text());
  });
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(`http://${host}:${port}/?debug=1&feedback=315`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, timeoutMs);
  await page.waitForFunction(() => {
    const app = window.__webglGeneratorApp;
    return app?.map?.metadata?.generationTiming?.totalMs
      && !app.runtimeOperation?.getSnapshot?.().current
      && document.getElementById("generation-loading")?.hidden === true
      && document.getElementById("operation-loading")?.hidden === true;
  }, null, {timeout: timeoutMs});
  await page.evaluate(() => {
    window.__webglGeneratorApp?.healthMonitor?.clear?.();
    window.__webglGeneratorHealth?.clear?.();
  });
  const fast = await page.evaluate(async () => {
    let animationStarts = 0;
    const bubble = document.getElementById("operation-loading");
    const onStart = () => animationStarts++;
    bubble.addEventListener("animationstart", onStart);
    const result = await window.__webglGeneratorApp.runtimeOperation.run("feedback.fast", () => ({done: true}), {message: "正在快速校验"});
    await new Promise(resolve => setTimeout(resolve, 500));
    bubble.removeEventListener("animationstart", onStart);
    return {result, animationStarts, hidden: bubble.hidden};
  });
  assert.equal(fast.result.done, true, "快速 operation 没有完成");
  assert.equal(fast.hidden, true, "快速 operation 完成后提示未清理");
  assert.equal(fast.animationStarts, 0, "快速 operation 产生了 loading 闪烁");

  await page.evaluate(() => {
    const manager = window.__webglGeneratorApp.runtimeOperation;
    window.__operationFeedbackAsyncPromise = manager.run("feedback.browser", async context => {
      context.report("wait", {message: "正在誊清诸域"});
      await new Promise(resolve => setTimeout(resolve, 680));
      return {done: true};
    }, {message: "正在誊清诸域"});
  });
  await page.waitForTimeout(600);
  const asyncVisible = await readFeedback(page);
  assert.equal(asyncVisible.hidden, false, "慢异步 operation 到门槛后仍未显示");
  assert.ok(asyncVisible.opacity >= 0.99, "慢异步 operation 提示仍不可见");
  assert.equal(asyncVisible.ariaHidden, "false", "慢异步 operation 没有进入可播报状态");
  assert.match(asyncVisible.text, /誊清诸域/);
  await page.evaluate(() => window.__operationFeedbackAsyncPromise);
  assert.equal((await readFeedback(page)).hidden, true, "慢异步 operation 完成后没有清理");

  await page.evaluate(() => {
    const manager = window.__webglGeneratorApp.runtimeOperation;
    window.__operationFeedbackCancelPromise = manager.run("feedback.cancel", context => new Promise((resolve, reject) => {
      context.signal.addEventListener("abort", () => reject(new DOMException("已取消", "AbortError")), {once: true});
    }), {message: "正在校准山河"}).catch(error => error.code);
  });
  await page.waitForTimeout(500);
  assert.equal((await readFeedback(page)).hidden, false, "可取消慢任务没有显示提示");
  await page.evaluate(() => window.__webglGeneratorApp.runtimeOperation.cancelCurrent("浏览器门取消"));
  const cancelledCode = await page.evaluate(() => window.__operationFeedbackCancelPromise);
  assert.equal(cancelledCode, "operation_cancelled", "取消任务错误码漂移");
  assert.equal((await readFeedback(page)).hidden, true, "取消任务后提示没有清理");

  await page.evaluate(() => {
    const manager = window.__webglGeneratorApp.runtimeOperation;
    window.__operationFeedbackFailurePromise = manager.run("feedback.failure", async () => {
      await new Promise(resolve => setTimeout(resolve, 500));
      throw new Error("浏览器故障注入");
    }, {message: "正在检点图卷"}).catch(error => error.code);
  });
  await page.waitForTimeout(450);
  assert.equal((await readFeedback(page)).hidden, false, "失败前的慢任务没有显示提示");
  const failureCode = await page.evaluate(() => window.__operationFeedbackFailurePromise);
  assert.equal(failureCode, "operation_failed", "失败任务错误码漂移");
  assert.equal((await readFeedback(page)).hidden, true, "失败任务后提示没有清理");

  const coexist = await page.evaluate(async () => {
    const generation = document.getElementById("generation-loading");
    generation.hidden = false;
    const token = window.__webglGeneratorApp.operationFeedback.begin("山河正徐徐推演，请稍候片刻。");
    await new Promise(resolve => setTimeout(resolve, 500));
    const operation = document.getElementById("operation-loading");
    const top = getComputedStyle(operation).top;
    window.__webglGeneratorApp.operationFeedback.finish(token);
    const generationStayed = !generation.hidden;
    generation.hidden = true;
    return {top, generationStayed, operationHidden: operation.hidden};
  });
  assert.equal(coexist.top, "66px", "操作提示与生成 loading 重叠");
  assert.equal(coexist.generationStayed, true, "操作提示清理时误关生成 loading");
  assert.equal(coexist.operationHidden, true, "共存操作结束后提示未清理");

  await page.setViewportSize({width: 320, height: 700});
  const narrow = await page.evaluate(async () => {
    const token = window.__webglGeneratorApp.operationFeedback.begin();
    await new Promise(resolve => setTimeout(resolve, 500));
    const bubble = document.getElementById("operation-loading");
    const rect = bubble.getBoundingClientRect();
    const result = {left: rect.left, right: rect.right, viewport: innerWidth, documentOverflow: document.documentElement.scrollWidth - innerWidth};
    window.__webglGeneratorApp.operationFeedback.finish(token);
    return result;
  });
  assert.ok(narrow.left >= 0 && narrow.right <= narrow.viewport, `窄屏提示越界：${JSON.stringify(narrow)}`);
  assert.ok(narrow.documentOverflow <= 0, `窄屏 document 横向溢出：${JSON.stringify(narrow)}`);

  await page.evaluate(() => {
    window.__webglGeneratorApp?.healthMonitor?.clear?.();
    window.__webglGeneratorHealth?.clear?.();
  });
  await page.waitForTimeout(80);
  const healthErrors = await page.evaluate(() => (window.__webglGeneratorHealth?.getEvents?.(240) || []).filter(event => event.severity === "error"));
  const glError = await page.evaluate(() => window.__webglGeneratorApp.renderer?.gl?.getError?.() ?? 0);
  assert.deepEqual(healthErrors, [], "延迟操作提示产生 health error");
  assert.deepEqual(consoleErrors, [], "延迟操作提示产生 console error");
  assert.deepEqual(pageErrors, [], "延迟操作提示产生 page error");
  assert.equal(glError, 0, "延迟操作提示产生 WebGL error");
  const chunkRecovery = await verifyPanelChunkRecovery(browser, port);

  console.log(JSON.stringify({ok: true, fast, asyncVisible, cancelledCode, failureCode, coexist, narrow, chunkRecovery, healthErrors, consoleErrors, pageErrors, glError}, null, 2));
  await context.close();
} finally {
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await vite.close();
}

async function readFeedback(page) {
  return page.evaluate(() => {
    const bubble = document.getElementById("operation-loading");
    return {
      hidden: bubble.hidden,
      opacity: Number(getComputedStyle(bubble).opacity),
      ariaHidden: bubble.getAttribute("aria-hidden"),
      text: document.getElementById("operation-loading-text")?.textContent || ""
    };
  });
}

async function verifyPanelChunkRecovery(browser, port) {
  const context = await browser.newContext({viewport: {width: 1280, height: 800}, deviceScaleFactor: 1});
  await context.addInitScript(() => localStorage.clear());
  const page = await context.newPage();
  let intercepted = 0;
  const pattern = "**/StatePanel.vue*";
  await page.route(pattern, route => {
    intercepted += 1;
    return route.abort("failed");
  });
  await page.goto(`http://127.0.0.1:${port}/`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, timeoutMs);
  await page.evaluate(() => document.getElementById("open-state-panel")?.click());
  const recovery = page.locator('.floating-panel[data-panel-id="state-panel"] .lazy-panel-recovery[data-error-kind="module-fetch"]');
  await recovery.waitFor({state: "visible"});
  const text = await recovery.innerText();
  assert.match(text, /页面版本可能已经更新/);
  assert.match(text, /先保存尚未保存的地图/);
  assert.deepEqual(await recovery.locator("button").allTextContents(), ["刷新页面"]);
  await page.unroute(pattern);
  await Promise.all([
    page.waitForNavigation({waitUntil: "domcontentloaded"}),
    recovery.getByRole("button", {name: "刷新页面"}).click()
  ]);
  await waitForApiReady(page, timeoutMs);
  await page.evaluate(() => document.getElementById("open-state-panel")?.click());
  await page.locator('.floating-panel[data-panel-id="state-panel"] .state-panel-controls').waitFor({state: "visible"});
  assert.ok(intercepted >= 1, "没有命中国家面板分包故障注入");
  await context.close();
  return {intercepted, recovered: true};
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
