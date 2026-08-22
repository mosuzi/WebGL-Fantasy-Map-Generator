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
const port = 5571;
const evidence = createTask350BrowserArtifact("png-crop-browser");
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
  context = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1, acceptDownloads: true});
  const page = await context.newPage();
  page.setDefaultTimeout(180_000);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));
  evidence.mark("page", {active: "ready", complete: "browser-launched"});
  await page.goto(`http://127.0.0.1:${port}?debug=1&healthClear=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 180_000);
  const before = await page.evaluate(async () => {
    const api = window.webglGeneratorApi;
    const app = window.__webglGeneratorApp;
    const unwrap = (value, label) => {
      if (!value?.ok) throw new Error(`${label}: ${value?.error?.code || "api_error"} ${value?.error?.message || ""}`);
      return value.data;
    };
    unwrap(await api.generate.newMap({confirm: true, seed: "png-crop-browser-r4b", cellsTarget: 10_000, heightmapTemplate: "continents"}), "newMap");
    unwrap(await api.layers.setTheme("ancient"), "theme");
    unwrap(await api.layers.setViewMode("provinces"), "view mode");
    unwrap(await api.layers.setVisible("measurements", true), "measurements layer");
    unwrap(await api.edit.measurements.save([{x: 360, y: 240}, {x: 720, y: 480}, {x: 960, y: 280}], {name: "PNG 测量叠层"}), "measurement");
    await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
    const snapshot = {
      map: unwrap(api.info.mapSummary(), "summary"),
      history: unwrap(api.history.get(), "history"),
      layers: unwrap(api.layers.get(), "layers"),
      camera: {...app.renderer.camera}
    };
    window.__task350R4bLongTasks = [];
    window.__task350R4bLongTaskObserver?.disconnect?.();
    window.__task350R4bLongTaskObserver = new PerformanceObserver(list => {
      window.__task350R4bLongTasks.push(...list.getEntries().map(({startTime, duration}) => ({startTime, duration, phase: "png-export"})));
    });
    window.__task350R4bLongTaskObserver.observe({type: "longtask", buffered: false});
    window.__webglGeneratorHealth?.clear?.();
    return snapshot;
  });
  assert(before.map.gridCells >= 9_000, "PNG crop fixture 未使用代表性 10k 地图");
  mkdirSync(artifactRoot, {recursive: true});

  evidence.mark("exports", {active: "default", complete: "page-ready"});
  const exports = {};
  for (const [name, options] of [
    ["default", {}],
    ["pixel", {pixelScale: 2, includeMapOverlays: false, crop: {mode: "pixel", rect: {x: 20, y: 30, width: 320, height: 180}}}],
    ["world", {includeMapOverlays: false, crop: {mode: "world", rect: {x: 360, y: 240, width: 720, height: 480}}}],
    ["no-overlays", {crop: {mode: "pixel", rect: {x: 0, y: 0, width: 640, height: 420}}, overlays: {labels: false, cityIcons: false, markers: false, military: false, measurements: false, legend: false, scaleBar: false}}],
    ["labels-only", {crop: {mode: "pixel", rect: {x: 0, y: 0, width: 640, height: 420}}, overlays: {labels: true, cityIcons: false, markers: false, military: false, measurements: false, legend: false, scaleBar: false}}],
    ["measurements-only", {crop: {mode: "pixel", rect: {x: 0, y: 0, width: 640, height: 420}}, overlays: {labels: false, cityIcons: false, markers: false, military: false, measurements: true, legend: false, scaleBar: false}}]
  ]) {
    evidence.mark("exports", {active: name});
    exports[name] = await exportPng(page, join(artifactRoot, `png-crop-${name}.png`), options);
  }

  const rejection = await page.evaluate(async () => window.webglGeneratorApi.data.exportPNG({
    download: false,
    includeDataUrl: false,
    crop: {mode: "pixel", rect: {x: -1, y: 0, width: 20, height: 20}}
  }));
  evidence.mark("assertions", {active: "state-and-performance", complete: "exports"});
  const final = await page.evaluate(async () => {
    await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
    await new Promise(done => setTimeout(done, 100));
    const api = window.webglGeneratorApi;
    const app = window.__webglGeneratorApp;
    const unwrap = value => value?.ok ? value.data : value;
    const observer = window.__task350R4bLongTaskObserver;
    window.__task350R4bLongTasks.push(...(observer?.takeRecords?.() || []).map(({startTime, duration}) => ({startTime, duration, phase: "png-export"})));
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
  const stateExact = JSON.stringify(final.state) === JSON.stringify(before);
  const compact = {
    cells: before.map.gridCells,
    exportCount: Object.keys(exports).length,
    pixelSize: [exports.pixel.file.width, exports.pixel.file.height],
    worldRectExact: JSON.stringify(exports.world.api.crop.rect) === JSON.stringify({x: 360, y: 240, width: 720, height: 480}),
    labelsDiffer: exports["no-overlays"].file.bytes !== exports["labels-only"].file.bytes,
    measurementsDiffer: exports["no-overlays"].file.bytes !== exports["measurements-only"].file.bytes,
    rejectionCode: rejection?.error?.code || "",
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
  evidence.setResult({before, exports, rejection, final, performanceSignals, applicationErrors, pageErrors}, compact);
  assert.deepEqual([exports.pixel.file.width, exports.pixel.file.height], [640, 360]);
  assert.equal(compact.worldRectExact, true);
  assert.equal(compact.labelsDiffer, true);
  assert.equal(compact.measurementsDiffer, true);
  assert.equal(rejection?.ok, false);
  assert.match(rejection?.error?.message || "", /超出有效范围/u);
  for (const item of Object.values(exports)) assert.deepEqual([item.file.width, item.file.height], [item.api.width, item.api.height]);
  assert.equal(stateExact, true, "PNG export 改变了 map/revision/history/camera/layers/theme");
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
if (!evidence.artifact.ok) throw Object.assign(new Error(evidence.artifact.failure?.message || "PNG crop teardown failed"), {code: evidence.artifact.failure?.code || "png_crop_teardown_failed"});

async function exportPng(page, path, options) {
  const [download, result] = await Promise.all([
    page.waitForEvent("download", {timeout: 180_000}),
    page.evaluate(value => window.webglGeneratorApi.data.exportPNG({...value, download: true}), options)
  ]);
  if (!result?.ok) throw new Error(result?.error?.message || "PNG 导出失败");
  await download.saveAs(path);
  return {path, api: result.data, file: inspectPng(path)};
}

function inspectPng(path) {
  const bytes = readFileSync(path);
  assert(bytes.length >= 24 && bytes.toString("hex", 0, 8) === "89504e470d0a1a0a", `${path} 不是有效 PNG`);
  return {bytes: statSync(path).size, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20)};
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
