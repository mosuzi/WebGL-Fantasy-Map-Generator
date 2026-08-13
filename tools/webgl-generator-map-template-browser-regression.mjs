#!/usr/bin/env node
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createRequire} from "node:module";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "source", "Fantasy-Map-Generator");
const dist = join(root, "dist", "webgl-generator");
const host = "127.0.0.1";
const port = 5564;
const playwright = createRequire(join(source, "package.json"))("playwright");
const server = spawn(process.execPath, [join(root, "tools", "serve-prototype.mjs"), "--host", host, "--port", String(port), "--dir", dist], {stdio: "ignore"});
let browser;
let context;

try {
  await waitForServer(server);
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  context = await browser.newContext({viewport: {width: 1280, height: 820}, deviceScaleFactor: 1});
  const page = await context.newPage();
  page.setDefaultTimeout(300_000);
  const resourceRequests = [];
  const injectedResourceFailures = [];
  const consoleErrors = [];
  const pageErrors = [];
  page.on("request", request => /\/assets\/map-templates\/.*\.(?:json|bin)$/u.test(request.url()) && resourceRequests.push(request.url().split("/").pop()));
  page.on("requestfailed", request => /\/holy-roman-empire-1789-political-v1\.(?:json|bin)$/u.test(request.url())
    && injectedResourceFailures.push({name: request.url().split("/").pop(), error: request.failure()?.errorText}));
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(`http://${host}:${port}?healthClear=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 300_000);

  const catalog = await page.evaluate(async () => {
    const api = window.webglGeneratorApi;
    const list = api.generate.listMapTemplates();
    const china = api.generate.getMapTemplate("china");
    const missingConfirm = await api.generate.createFromTemplate({templateId: "china", cellsTarget: 1000});
    window.__task324OrdinaryMapDocument = api.data.exportAll({includeText: true}).data.text;
    return {list, china, missingConfirm};
  });
  assert.equal(catalog.list.ok, true);
  assert.equal(catalog.list.data.length, 16);
  assert.equal(catalog.china.data.id, "china");
  assert.equal(catalog.missingConfirm.ok, false);
  assert.equal(resourceRequests.length, 0, "模板只读 API 不得提前加载资源");

  await page.evaluate(() => {
    const select = document.getElementById("map-template-select");
    select.value = "china";
    select.dispatchEvent(new Event("change", {bubbles: true}));
    document.getElementById("cells-input").value = "1000";
    document.getElementById("seed-input").value = "task324-browser-china";
  });
  await page.waitForFunction(() => document.getElementById("generate-map-template")?.disabled === false);
  await page.evaluate(() => document.getElementById("generate-map-template").click());
  await page.waitForFunction(() => window.__webglGeneratorApp?.map?.metadata?.mapTemplate?.id === "china"
    && window.webglGeneratorApi.info.runtimeStats().data.loading.visible === false);
  const created = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const api = window.webglGeneratorApi;
    window.__task324TemplateMapDocument = api.data.exportAll({includeText: true}).data.text;
    return {
      metadata: app.map.metadata.mapTemplate,
      rendererCurrent: app.renderer.map === app.map,
      history: app.editHistory.getStats(),
      buttonText: document.getElementById("generate-map-template")?.textContent?.trim(),
      description: document.getElementById("map-template-description")?.textContent?.trim(),
      technicalCopy: visibleTechnicalCopy()
    };
    function visibleTechnicalCopy() {
      return ["generation-loading", "operation-loading", "map-toast", "file-operation-status"]
        .map(id => document.getElementById(id)).filter(node => node && !node.hidden && node.getClientRects().length)
        .map(node => node.textContent || "").filter(text => /Worker|浏览器概念|线程|消息包|buffer|session/i.test(text));
    }
  });
  assert.equal(created.metadata.id, "china");
  assert.equal(created.metadata.requestedCells, 1000);
  assert.equal(created.rendererCurrent, true);
  assert.equal(created.history.undo, 0);
  assert.equal(created.buttonText, "按模板创建");
  assert.match(created.description, /中国地图/u);
  assert.deepEqual(created.technicalCopy, []);
  assert.deepEqual(resourceRequests.sort(), ["world-physical-2026-v1.bin", "world-physical-2026-v1.json"]);

  await page.route("**/holy-roman-empire-1789-political-v1.*", route => route.abort("failed"));
  const failed = await page.evaluate(async () => {
    const app = window.__webglGeneratorApp;
    const before = {map: app.map, checksum: app.map.metadata.checksum, revision: JSON.stringify(app.mapRevision.getSnapshot()), history: JSON.stringify(app.editHistory.getStats())};
    const response = await window.webglGeneratorApi.generate.createFromTemplate({templateId: "holy-roman-empire-1789", cellsTarget: 1000, seed: "task324-resource-fault", confirm: true});
    return {response, same: app.map === before.map && app.map.metadata.checksum === before.checksum && JSON.stringify(app.mapRevision.getSnapshot()) === before.revision && JSON.stringify(app.editHistory.getStats()) === before.history};
  });
  await page.unroute("**/holy-roman-empire-1789-political-v1.*");
  assert.equal(failed.response.error.code, "map-template-resource-load-failed");
  assert.equal(failed.same, true);
  assert.deepEqual(injectedResourceFailures.map(item => item.name).sort(), ["holy-roman-empire-1789-political-v1.bin", "holy-roman-empire-1789-political-v1.json"]);
  assert(injectedResourceFailures.every(item => item.error === "net::ERR_FAILED"));

  const roundtrip = await page.evaluate(async () => {
    const api = window.webglGeneratorApi;
    const app = window.__webglGeneratorApp;
    const ordinary = await api.data.importMap(window.__task324OrdinaryMapDocument, {confirm: true});
    const ordinaryState = {ok: ordinary.ok, template: app.map.metadata.mapTemplate ?? null, renderer: app.renderer.map === app.map};
    const restored = await api.data.importMap(window.__task324TemplateMapDocument, {confirm: true});
    return {ordinary: ordinaryState, restored: {ok: restored.ok, template: app.map.metadata.mapTemplate, renderer: app.renderer.map === app.map}, loading: api.info.runtimeStats().data.loading, glError: app.renderer.getStats().draw.glError};
  });
  assert.deepEqual(roundtrip.ordinary, {ok: true, template: null, renderer: true});
  assert.equal(roundtrip.restored.ok, true);
  assert.equal(roundtrip.restored.template.id, "china");
  assert.equal(roundtrip.restored.renderer, true);
  assert.equal(roundtrip.loading.visible, false);
  assert.equal(roundtrip.glError, 0);

  const health = await page.evaluate(() => window.__webglGeneratorHealth.getEvents(500));
  const performanceTypes = new Set(["operation-stall", "main-thread-long-task", "render-frame-gap", "input-handler-stall"]);
  const registeredLongTasks = health.filter(event => event.type === "main-thread-long-task").map(event => event.detail?.durationMs).filter(Number.isFinite);
  const healthErrors = health.filter(event => event.severity === "error" && !performanceTypes.has(event.type));
  const nonPerformanceConsole = consoleErrors.filter(message => ![...performanceTypes].some(type => message.includes(`[FMG health] ${type}`)));
  const injectedNetworkConsole = nonPerformanceConsole.filter(message => message === "Failed to load resource: net::ERR_FAILED");
  const unexpectedConsole = nonPerformanceConsole.filter(message => message !== "Failed to load resource: net::ERR_FAILED");
  assert.equal(injectedNetworkConsole.length, injectedResourceFailures.length, "故障注入请求与浏览器网络错误必须一一对应");
  assert(registeredLongTasks.every(duration => duration <= 200), `模板浏览器门出现超过登记上限的 LongTask：${registeredLongTasks.join(", ")}`);
  assert.deepEqual(healthErrors, []);
  assert.deepEqual(unexpectedConsole, []);
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ok: true, templates: 16, created: created.metadata, resourceRequests, injectedResourceFailures, rollback: failed.same, roundtrip, registeredLongTasks}, null, 2));
} finally {
  if (context) await Promise.race([context.close(), delay(5000)]);
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  server.kill();
  await Promise.race([new Promise(done => server.once("exit", done)), delay(5000)]);
}

async function waitForServer(child) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`静态服务提前退出：${child.exitCode}`);
    try { if ((await fetch(`http://${host}:${port}`)).ok) return; } catch {}
    await delay(50);
  }
  throw new Error("等待静态服务超时");
}

function delay(ms) { return new Promise(done => setTimeout(done, ms)); }
