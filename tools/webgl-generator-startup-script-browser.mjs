#!/usr/bin/env node
import assert from "node:assert/strict";
import {mkdirSync, writeFileSync} from "node:fs";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";
import {setTimeout as delay} from "node:timers/promises";
import {preview} from "vite";

const root = resolve(import.meta.dirname, "..");
const {chromium} = createRequire(join(root, "source/Fantasy-Map-Generator/package.json"))("playwright");
const outputDir = join(root, "docs", "generated", "task-416-startup");
mkdirSync(outputDir, {recursive: true});
const server = process.env.FMG_STARTUP_BASE_URL ? null : await preview({
  configFile: join(root, "vite.config.mjs"),
  preview: {host: "127.0.0.1", port: 5608, strictPort: true},
  logLevel: "error"
});
const baseUrl = process.env.FMG_STARTUP_BASE_URL || "http://127.0.0.1:5608/";
const browser = await chromium.launch({channel: "chrome", headless: true});
const mainScript = /\/assets\/index-[^/]+\.js(?:\?.*)?$/;
const appScript = /\/assets\/app-[^/]+\.js(?:\?.*)?$/;

function scenarioUrl(name) {
  const url = new URL(baseUrl);
  url.searchParams.set("task416startup", name);
  return url.href;
}

async function snapshot(page) {
  return page.evaluate(() => {
    const loading = document.getElementById("app-loading-screen");
    const events = JSON.parse(localStorage.getItem("webgl-generator-health-events-v1") || "[]");
    return {
      state: loading?.dataset.state || null,
      hidden: loading?.hidden === true,
      text: document.getElementById("app-loading-status")?.textContent || "",
      hasApp: Boolean(window.__webglGeneratorApp),
      hasMap: Boolean(window.__webglGeneratorApp?.map),
      events: events.map(({type, severity, detail}) => ({type, severity, detail})),
      longTasks: window.__startupLongTasks || []
    };
  });
}

async function ready(page) {
  await page.waitForFunction(() => window.__webglGeneratorApp?.map
    && document.getElementById("app-loading-screen")?.hidden === true, null, {timeout: 180_000});
  return snapshot(page);
}

async function preparePage() {
  const page = await browser.newPage({viewport: {width: 1280, height: 800}});
  page.setDefaultTimeout(180_000);
  await page.addInitScript(() => {
    window.__startupLongTasks = [];
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) window.__startupLongTasks.push({
        startMs: Math.round(entry.startTime),
        durationMs: entry.duration,
        attribution: entry.attribution?.map(item => ({name: item.name, containerType: item.containerType})) || []
      });
    }).observe({entryTypes: ["longtask"]});
  });
  return page;
}

try {
  const normalPage = await preparePage();
  const normalErrors = [];
  normalPage.on("pageerror", error => normalErrors.push(error.message));
  await normalPage.goto(scenarioUrl("normal"), {waitUntil: "commit"});
  const normal = await ready(normalPage);
  assert.equal(normal.state, "ready");
  assert.deepEqual(normalErrors, []);
  assert.equal(normal.events.some(event => event.type === "script-not-started" || event.type === "module-load-failed"), false);
  await normalPage.reload({waitUntil: "commit"});
  const warm = await ready(normalPage);
  assert.equal(warm.state, "ready");
  assert.deepEqual(normalErrors, []);
  assert.equal(warm.events.some(event => event.type === "script-not-started" || event.type === "module-load-failed"), false);
  await normalPage.close();

  const delayedPage = await preparePage();
  const delayedErrors = [];
  delayedPage.on("pageerror", error => delayedErrors.push(error.message));
  let delayedRequests = 0;
  await delayedPage.route(mainScript, async route => {
    delayedRequests++;
    await delay(5_500);
    await route.continue();
  });
  await delayedPage.goto(scenarioUrl("delayed"), {waitUntil: "commit"});
  await delayedPage.waitForFunction(() => Number.isFinite(window.__webglGeneratorStartupLoadingStartedAt)
    && performance.now() - window.__webglGeneratorStartupLoadingStartedAt >= 3_300, null, {timeout: 15_000});
  const delayedAtThreeSeconds = await snapshot(delayedPage);
  assert.equal(delayedRequests, 1, "未延迟正式入口脚本");
  assert.equal(delayedAtThreeSeconds.state, "loading", "慢网络被提前判为启动失败");
  assert.equal(delayedAtThreeSeconds.hasApp, false);
  assert.equal(delayedAtThreeSeconds.events.some(event => event.type === "script-not-started" || event.type === "module-load-failed"), false);
  const delayedReady = await ready(delayedPage);
  assert.equal(delayedReady.state, "ready");
  assert.equal(delayedReady.events.some(event => event.type === "module-load-delayed"), true);
  assert.equal(delayedReady.events.some(event => event.severity === "error"), false);
  assert.deepEqual(delayedErrors, []);
  await delayedPage.close();

  const failedPage = await preparePage();
  let abortedRequests = 0;
  await failedPage.route(mainScript, route => {
    abortedRequests++;
    return route.abort("failed");
  });
  await failedPage.goto(scenarioUrl("blocked"), {waitUntil: "commit"});
  await failedPage.waitForFunction(() => document.getElementById("app-loading-screen")?.dataset.state === "error", null, {timeout: 15_000});
  const failed = await snapshot(failedPage);
  assert.equal(abortedRequests, 1, "未阻断正式入口脚本");
  assert.equal(failed.hasApp, false);
  assert.match(failed.text, /检查网络后刷新页面/);
  assert.equal(failed.events.some(event => event.type === "module-load-failed" && event.severity === "error"), true);
  await failedPage.unroute(mainScript);
  await failedPage.reload({waitUntil: "commit"});
  const afterReload = await ready(failedPage);
  assert.equal(afterReload.state, "ready", "网络恢复并刷新后仍停在错误页");
  await failedPage.close();

  const executionPage = await preparePage();
  await executionPage.route(mainScript, route => route.fulfill({
    status: 200,
    contentType: "application/javascript",
    body: "throw new Error('startup-fixture-module-execution')"
  }));
  await executionPage.goto(scenarioUrl("execution-error"), {waitUntil: "commit"});
  await executionPage.waitForFunction(() => document.getElementById("app-loading-screen")?.dataset.state === "error", null, {timeout: 15_000});
  const executionFailed = await snapshot(executionPage);
  assert.equal(executionFailed.hasApp, false);
  assert.equal(executionFailed.events.some(event => event.type === "module-load-failed" && event.detail?.reason === "module-execution"), true);
  assert.doesNotMatch(executionFailed.text, /检查网络/);
  await executionPage.close();

  const appFailurePage = await preparePage();
  const blockedAppRequests = [];
  await appFailurePage.route(appScript, route => {
    blockedAppRequests.push(route.request().url());
    return route.abort("failed");
  });
  await appFailurePage.goto(scenarioUrl("app-module-blocked"), {waitUntil: "commit"});
  await appFailurePage.waitForFunction(() => document.getElementById("app-loading-screen")?.dataset.state === "error", null, {timeout: 15_000});
  const appModuleFailed = await snapshot(appFailurePage);
  assert.ok(blockedAppRequests.length >= 1 && blockedAppRequests.every(url => appScript.test(url)), "未阻断异步应用模块");
  assert.equal(appModuleFailed.hasApp, false);
  assert.match(appModuleFailed.text, /检查网络后刷新页面/);
  assert.equal(appModuleFailed.events.some(event => event.type === "module-load-failed" && event.detail?.reason === "module-load"), true);
  await appFailurePage.unroute(appScript);
  await appFailurePage.reload({waitUntil: "commit"});
  const afterAppModuleReload = await ready(appFailurePage);
  assert.equal(afterAppModuleReload.state, "ready");
  await appFailurePage.close();

  const appExecutionPage = await preparePage();
  await appExecutionPage.route(appScript, route => route.fulfill({
    status: 200,
    contentType: "application/javascript",
    body: "throw new Error('startup-fixture-app-execution')"
  }));
  await appExecutionPage.goto(scenarioUrl("app-module-execution"), {waitUntil: "commit"});
  await appExecutionPage.waitForFunction(() => document.getElementById("app-loading-screen")?.dataset.state === "error", null, {timeout: 15_000});
  const appModuleExecutionFailed = await snapshot(appExecutionPage);
  assert.equal(appModuleExecutionFailed.hasApp, false);
  assert.doesNotMatch(appModuleExecutionFailed.text, /检查网络/);
  assert.equal(appModuleExecutionFailed.events.some(event => event.type === "module-load-failed" && event.detail?.reason === "module-execution"), true);
  await appExecutionPage.close();

  const contextPage = await preparePage();
  const contextErrors = [];
  contextPage.on("pageerror", error => contextErrors.push(error.message));
  await contextPage.addInitScript(() => {
    window.__startupContextEvents = [];
    const nativeGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      const gl = nativeGetContext.call(this, kind, ...args);
      if (kind === "webgl2" && this.id === "map-canvas" && !window.__startupContextArmed) {
        window.__startupContextArmed = true;
        const extension = gl?.getExtension("WEBGL_lose_context");
        window.__startupContextExtensionAvailable = Boolean(extension);
        this.addEventListener("webglcontextlost", () => window.__startupContextEvents.push("lost"));
        this.addEventListener("webglcontextrestored", () => window.__startupContextEvents.push("restored"));
        if (extension) {
          const nativeCreateProgram = gl.createProgram.bind(gl);
          gl.createProgram = (...programArgs) => {
            const program = nativeCreateProgram(...programArgs);
            if (!window.__startupContextTriggered) {
              window.__startupContextTriggered = true;
              window.__startupContextAppAtTrigger = Boolean(window.__webglGeneratorApp);
              window.__startupContextEvents.push("trigger-in-program");
              extension.loseContext();
              setTimeout(() => extension.restoreContext(), 80);
            }
            return program;
          };
        }
      }
      return gl;
    };
  });
  await contextPage.goto(scenarioUrl("startup-context-restored"), {waitUntil: "commit"});
  const contextRestored = await ready(contextPage);
  const contextState = await contextPage.evaluate(() => ({
    extensionAvailable: window.__startupContextExtensionAvailable,
    appAtTrigger: window.__startupContextAppAtTrigger,
    events: window.__startupContextEvents,
    contextLost: window.__webglGeneratorApp?.renderer?.webGlContextLost,
    resourceState: window.__webglGeneratorApp?.renderer?.webGlContextResourceState
  }));
  assert.equal(contextState.extensionAvailable, true);
  assert.equal(contextState.appAtTrigger, false);
  assert.deepEqual(contextState.events, ["trigger-in-program", "lost", "restored"]);
  assert.equal(contextState.contextLost, false);
  assert.equal(contextState.resourceState, "ready");
  assert.deepEqual(contextErrors, []);
  await contextPage.close();

  const startupLongTaskMax = Math.max(0, ...[normal, warm, delayedReady, afterReload, afterAppModuleReload, contextRestored]
    .flatMap(item => item.longTasks.map(task => task.durationMs)));
  const report = {ok: startupLongTaskMax < 200, functionalOk: true, startupLongTaskMax, baseUrl,
    normal, warm, delayedAtThreeSeconds, delayedReady, failed, afterReload, executionFailed,
    blockedAppRequests, appModuleFailed, afterAppModuleReload, appModuleExecutionFailed, contextRestored, contextState};
  writeFileSync(join(outputDir, "result.json"), `${JSON.stringify(report, null, 2)}\n`);
  assert.ok(report.ok, `正式启动出现 ${startupLongTaskMax}ms 长任务，超过 200ms 门槛`);
  console.log(JSON.stringify({ok: true, baseUrl, normal: {ready: normal.hidden, longTaskMax: Math.max(0, ...normal.longTasks.map(task => task.durationMs))}, warm: {ready: warm.hidden, longTaskMax: Math.max(0, ...warm.longTasks.map(task => task.durationMs))}, delayed: {atThreeSeconds: delayedAtThreeSeconds.state, ready: delayedReady.hidden, longTaskMax: Math.max(0, ...delayedReady.longTasks.map(task => task.durationMs))}, failed: {state: failed.state, recovered: afterReload.hidden}}, null, 2));
} finally {
  await browser.close();
  if (server) await server.httpServer.close();
}
