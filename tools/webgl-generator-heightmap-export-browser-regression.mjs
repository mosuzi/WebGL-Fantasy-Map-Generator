#!/usr/bin/env node
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdirSync, readFileSync, statSync} from "node:fs";
import {createRequire} from "node:module";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {closeTask350BrowserResource, createTask350BrowserArtifact} from "./task-350-browser-artifact.mjs";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "source", "Fantasy-Map-Generator");
const artifactRoot = resolve(process.env.TASK_350_CDP_ARTIFACT_DIR || join(root, "work", "task-350-cdp-artifacts"));
const port = 5570;
const evidence = createTask350BrowserArtifact("heightmap-export-browser");
const server = spawn(process.execPath, [join(root, "tools", "serve-prototype.mjs"), "--host", "127.0.0.1", "--port", String(port), "--dir", join(root, "dist", "webgl-generator")], {stdio: "ignore"});
const playwright = createRequire(join(source, "package.json"))("playwright");
let browser = null;
let context = null;
let primaryError = null;

try {
  evidence.mark("server", {active: "wait-server"});
  await waitServer();
  evidence.mark("browser", {active: "launch", complete: "server-ready"});
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  context = await browser.newContext({viewport: {width: 1280, height: 820}, deviceScaleFactor: 1, acceptDownloads: true});
  const page = await context.newPage();
  page.setDefaultTimeout(180_000);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));

  evidence.mark("page", {active: "ready", complete: "browser-launched"});
  await page.goto(`http://127.0.0.1:${port}?debug=1&healthClear=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 180_000);
  evidence.mark("api-export", {active: "heightmap", complete: "page-ready"});
  const apiRun = await page.evaluate(async () => {
    const api = window.webglGeneratorApi;
    const app = window.__webglGeneratorApp;
    const unwrap = (value, label) => {
      if (!value?.ok) throw new Error(`${label}: ${value?.error?.code || "api_error"} ${value?.error?.message || ""}`);
      return value.data;
    };
    const snapshot = () => ({
      map: unwrap(api.info.mapSummary(), "map summary"),
      history: unwrap(api.history.get(), "history"),
      layers: unwrap(api.layers.get(), "layers"),
      camera: {...app.renderer.camera}
    });
    unwrap(await api.generate.newMap({confirm: true, seed: "heightmap-export-browser-r4b", cellsTarget: 10_000, heightmapTemplate: "continents"}), "newMap");
    unwrap(await api.layers.setTheme("ancient"), "theme");
    unwrap(await api.layers.setViewMode("states"), "view mode");
    unwrap(await api.layers.setVisible("routes", false), "routes visibility");
    await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
    const before = snapshot();
    const heights = app.map.grid.cells.h;
    const targets = [0, 20, 50, 100].map(target => {
      let cell = 0;
      for (let index = 1; index < heights.length; index++) if (Math.abs(Number(heights[index]) - target) < Math.abs(Number(heights[cell]) - target)) cell = index;
      return {target, cell, height: Number(heights[cell]), point: app.map.grid.points[cell]};
    });
    window.__task350R4bLongTasks = [];
    window.__task350R4bLongTaskObserver?.disconnect?.();
    window.__task350R4bLongTaskObserver = new PerformanceObserver(list => {
      window.__task350R4bLongTasks.push(...list.getEntries().map(({startTime, duration}) => ({startTime, duration, phase: "heightmap-export"})));
    });
    window.__task350R4bLongTaskObserver.observe({type: "longtask", buffered: false});
    window.__webglGeneratorHealth?.clear?.();
    const response = unwrap(await api.data.exportHeightmapPNG({download: false, pixelScale: 1, includeDataUrl: true}), "heightmap API export");
    const image = new Image();
    image.src = response.dataUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context2d = canvas.getContext("2d", {willReadFrequently: true});
    context2d.drawImage(image, 0, 0);
    const samples = targets.map(item => {
      const x = Math.max(0, Math.min(canvas.width - 1, Math.round(item.point[0])));
      const y = Math.max(0, Math.min(canvas.height - 1, Math.round(item.point[1])));
      return {...item, pixel: Array.from(context2d.getImageData(x, y, 1, 1).data)};
    });
    return {before, response, samples};
  });

  evidence.mark("ui-export", {active: "heightmap-download", complete: "api-export"});
  await page.locator("#open-generation-panel").click();
  await page.getByRole("tab", {name: "简介", exact: true}).click();
  await page.locator("#open-export-panel").click();
  const exportPanel = page.locator(".project-export-panel");
  await exportPanel.waitFor({state: "visible"});
  await exportPanel.locator("details.project-export-advanced-section > summary").click();
  await exportPanel.locator("#export-png-scale").selectOption("2");
  mkdirSync(artifactRoot, {recursive: true});
  const uiPath = join(artifactRoot, "heightmap-export-ui-2x.png");
  const [download] = await Promise.all([page.waitForEvent("download"), exportPanel.locator("#export-heightmap-image").click()]);
  await download.saveAs(uiPath);
  const uiFile = inspectPng(uiPath);
  const uiStatus = await page.locator("#file-operation-status").textContent();

  evidence.mark("assertions", {active: "state-and-performance", complete: "ui-export"});
  const final = await page.evaluate(async () => {
    await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
    await new Promise(done => setTimeout(done, 100));
    const api = window.webglGeneratorApi;
    const app = window.__webglGeneratorApp;
    const unwrap = value => value?.ok ? value.data : value;
    const observer = window.__task350R4bLongTaskObserver;
    window.__task350R4bLongTasks.push(...(observer?.takeRecords?.() || []).map(({startTime, duration}) => ({startTime, duration, phase: "heightmap-export"})));
    observer?.disconnect?.();
    return {
      state: {map: unwrap(api.info.mapSummary()), history: unwrap(api.history.get()), layers: unwrap(api.layers.get()), camera: {...app.renderer.camera}},
      longTasks: window.__task350R4bLongTasks,
      health: unwrap(api.info.healthEvents({severity: "error", limit: 100})),
      loading: unwrap(api.info.runtimeStats()).loading,
      glError: app.renderer.getStats().draw?.glError ?? 0
    };
  });
  const performanceSignals = consoleErrors.filter(text => /\[FMG health\] (operation-stall|main-thread-long-task|render-frame-gap|input-handler-stall)/u.test(text));
  const applicationErrors = consoleErrors.filter(text => !performanceSignals.includes(text));
  const overBudget = final.longTasks.filter(task => task.duration > 200);
  const stateExact = JSON.stringify(final.state) === JSON.stringify(apiRun.before);
  const compact = {
    cells: apiRun.before.map.gridCells,
    apiSize: [apiRun.response.width, apiRun.response.height],
    uiSize: [uiFile.width, uiFile.height],
    sampleCount: apiRun.samples.length,
    stateExact,
    longTaskCount: final.longTasks.length,
    maxLongTaskMs: Math.max(0, ...final.longTasks.map(task => task.duration)),
    overBudget,
    applicationErrors: applicationErrors.length,
    pageErrors: pageErrors.length,
    healthErrors: final.health?.events?.length || 0,
    glError: final.glError,
    loadingVisible: final.loading?.visible === true
  };
  evidence.setResult({apiRun, ui: {...uiFile, status: uiStatus}, final, performanceSignals, applicationErrors, pageErrors}, compact);
  assert(apiRun.before.map.gridCells >= 9_000, "heightmap fixture 未使用代表性 10k 地图");
  assert.equal(apiRun.response.cellCount, apiRun.before.map.gridCells);
  assert.match(apiRun.response.filename, /\.heightmap\.png$/u);
  for (const sample of apiRun.samples) {
    const expected = Math.round(Math.max(0, Math.min(100, sample.height)) * 255 / 100);
    assert.deepEqual(sample.pixel, [expected, expected, expected, 255], `cell #${sample.cell} 灰度像素错误`);
  }
  assert.deepEqual([uiFile.width, uiFile.height], [apiRun.response.width * 2, apiRun.response.height * 2]);
  assert.match(uiStatus || "", /高度灰度图已导出/u);
  assert.equal(stateExact, true, "heightmap API/UI 导出改变了 map/revision/history/camera/layers/theme");
  assert.deepEqual(overBudget, []);
  assert.deepEqual(applicationErrors, []);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(final.health?.events || [], []);
  assert.equal(final.loading?.visible, false);
  assert.equal(final.glError, 0);
  evidence.succeed();
  console.log(JSON.stringify({ok: true, ...compact, performanceSignals}, null, 2));
} catch (error) {
  primaryError = error;
  evidence.fail(error);
} finally {
  for (const [label, close] of [
    ["context", () => context?.close()],
    ["browser", () => browser?.close()],
    ["server", async () => {
      if (server.exitCode !== null) return;
      server.kill();
      await new Promise((resolve, reject) => {
        server.once("exit", resolve);
        server.once("error", reject);
      });
    }]
  ]) {
    try {
      await closeTask350BrowserResource(label, close);
    } catch (error) {
      if (label === "server") server.unref();
      evidence.failTeardown(error);
    }
  }
  evidence.persist();
}

if (primaryError) throw primaryError;
if (!evidence.artifact.ok) throw Object.assign(new Error(evidence.artifact.failure?.message || "heightmap export teardown failed"), {code: evidence.artifact.failure?.code || "heightmap_export_teardown_failed"});

function inspectPng(path) {
  const bytes = readFileSync(path);
  assert(bytes.length >= 24 && bytes.toString("hex", 0, 8) === "89504e470d0a1a0a", `${path} 不是有效 PNG`);
  return {path, bytes: statSync(path).size, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20)};
}

async function waitServer() {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null) throw new Error(`静态服务提前退出：${server.exitCode}`);
    try {
      if ((await fetch(`http://127.0.0.1:${port}`)).ok) return;
    } catch {}
    await new Promise(done => setTimeout(done, 50));
  }
  throw new Error("等待静态服务超时");
}
