#!/usr/bin/env node
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createRequire} from "node:module";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createHeadlessMapApi, loadHeadlessMapDocument} from "../app/webgl-generator/src/runtime/headless-map-api.js";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const distDir = join(rootDir, "dist", "webgl-generator");
const host = "127.0.0.1";
const port = 5566;
const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const server = spawn(process.execPath, [join(rootDir, "tools", "serve-prototype.mjs"), "--host", host, "--port", String(port), "--dir", distDir], {stdio: "ignore"});
let browser;
let context;

try {
  await waitForServer(server);
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  context = await browser.newContext({viewport: {width: 1280, height: 820}, deviceScaleFactor: 2});
  const page = await context.newPage();
  page.setDefaultTimeout(300_000);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(`http://${host}:${port}?healthClear=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 300_000);
  const consoleStart = consoleErrors.length;
  const report = await page.evaluate(async () => {
    const api = window.webglGeneratorApi;
    const app = window.__webglGeneratorApp;
    const units = {distanceUnit: "mi-cn", mapScaleKmPerCm: 75, numberAbbreviation: "none"};
    const observerEntries = [];
    const observer = new PerformanceObserver(list => observerEntries.push(...list.getEntries().map(({startTime, duration}) => ({startTime, duration}))));
    observer.observe({entryTypes: ["longtask"]});
    const settle = async () => {
      await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
      await new Promise(done => setTimeout(done, 100));
      observerEntries.push(...observer.takeRecords().map(({startTime, duration}) => ({startTime, duration})));
    };
    const stateSnapshot = () => ({
      map: app.map,
      checksum: app.map.metadata.checksum,
      revision: JSON.stringify(app.mapRevision.getSnapshot()),
      history: JSON.stringify(app.editHistory.getStats()),
      selection: JSON.stringify(api.selection.get().data),
      layers: JSON.stringify(api.layers.get().data),
      units: JSON.stringify(api.units.get().data),
      camera: JSON.stringify(app.renderer.camera),
      rendererMap: app.renderer.map
    });
    const sameSnapshot = (before, after) => before.map === after.map
      && before.rendererMap === after.rendererMap
      && before.checksum === after.checksum
      && before.revision === after.revision
      && before.history === after.history
      && before.selection === after.selection
      && before.layers === after.layers
      && before.units === after.units
      && before.camera === after.camera;
    const choosePlaces = () => {
      const states = (app.map.politics?.states || []).filter(item => item && !item.removed && Number(item.id ?? item.i) > 0);
      const provinces = (app.map.politics?.provinces || []).filter(item => item && !item.removed && Number(item.id ?? item.i) > 0);
      const cities = (app.map.settlements?.cities || []).filter(item => item && !item.removed && Number(item.id ?? item.i) > 0 && Number.isFinite(item.x) && Number.isFinite(item.y));
      const all = [...states, ...provinces, ...cities];
      const counts = new Map(all.map(item => [String(item.name || ""), all.filter(other => String(other.name || "") === String(item.name || "")).length]));
      const unique = cities.filter(item => counts.get(String(item.name || "")) === 1);
      if (unique.length < 2 || !states.length || !provinces.length) throw new Error("正式地图缺少可验收的国家、省份或唯一名称城镇");
      const from = unique[0];
      const to = unique.slice(1).sort((left, right) => Math.hypot(right.x - from.x, right.y - from.y) - Math.hypot(left.x - from.x, left.y - from.y))[0];
      return {
        from: {kind: "city", id: Number(from.id ?? from.i)},
        to: {kind: "city", id: Number(to.id ?? to.i)},
        fromName: from.name,
        state: {kind: "state", id: Number(states[0].id ?? states[0].i)},
        province: {kind: "province", id: Number(provinces[0].id ?? provinces[0].i)}
      };
    };
    const analyze = async places => {
      await settle();
      observerEntries.length = 0;
      const before = stateSnapshot();
      const startedAt = performance.now();
      const resolvedName = api.analysis.resolvePlace(places.fromName);
      const resolvedExact = api.analysis.resolvePlace(places.from);
      const distance = api.analysis.measureDistance(places.from, places.to);
      const direction = api.analysis.getDirection(places.from, places.to);
      const stateDistance = api.analysis.measureDistance(places.state, places.from);
      const provinceDistance = api.analysis.measureDistance(places.province, places.to);
      const camera = {...app.renderer.camera};
      const screen = [];
      for (const scale of [0.75, 1.5, 3]) {
        app.renderer.camera.scale = scale;
        screen.push(api.analysis.measureDistance(places.from, places.to, {includeScreenDistance: true}).data);
      }
      Object.assign(app.renderer.camera, camera);
      const endedAt = performance.now();
      await settle();
      const after = stateSnapshot();
      return {
        resolvedName,
        resolvedExact,
        distance,
        direction,
        stateAnchor: stateDistance.data?.from.anchorSource,
        provinceAnchor: provinceDistance.data?.from.anchorSource,
        screen: screen.map(item => ({screenDistancePx: item.screenDistancePx, distanceWorld: item.distanceWorld, space: item.screenDistanceSpace, dpr: item.devicePixelRatio})),
        sideEffects: !sameSnapshot(before, after),
        longTasks: observerEntries.filter(entry => entry.startTime >= startedAt && entry.startTime < endedAt)
      };
    };
    try {
      const created = await api.generate.newMap({confirm: true, seed: "task326-place-analysis", cellsTarget: 10_000, heightmapTemplate: "continents"});
      if (!created.ok) throw new Error(created.error?.message || "10k 地图生成失败");
      api.units.apply(units);
      window.__webglGeneratorHealth.clear();
      const places = choosePlaces();
      const tenK = await analyze(places);
      const exported = api.data.exportMap({includeText: true});
      const savedText = exported.data.text;
      await api.generate.newMap({confirm: true, seed: "task326-place-analysis-replacement", cellsTarget: 1_000, heightmapTemplate: "continents"});
      const imported = await api.data.importMap(JSON.parse(savedText), {confirm: true});
      if (!imported.ok) throw new Error(imported.error?.message || "存档往返失败");
      const roundtrip = await analyze(places);
      const inspection = api.grid.inspectRefinement({targetCells: 100_000});
      const refined = await api.grid.refine({targetCells: 100_000, confirm: true, inspectionToken: inspection.data.inspectionToken});
      if (!refined.ok) throw new Error(refined.error?.message || "100k 细分失败");
      window.__webglGeneratorHealth.clear();
      const hundredK = await analyze(places);
      const schemas = ["analysis.resolvePlace", "analysis.measureDistance", "analysis.getDirection"].map(method => api.info.describe(method).data);
      const health = window.__webglGeneratorHealth.getEvents(300);
      return {
        savedText,
        units,
        places,
        tenK,
        roundtrip,
        hundredK,
        cells: app.map.grid.points.length,
        schemas,
        methodCount: Object.values(api.info.capabilities().data.methods).flat().length,
        loading: api.info.runtimeStats().data.loading,
        glError: app.renderer.getStats().draw.glError,
        healthErrors: health.filter(event => event.severity === "error" && !["operation-stall", "main-thread-long-task", "render-frame-gap", "input-handler-stall"].includes(event.type))
      };
    } finally {
      observer.disconnect();
    }
  });

  const headless = createHeadlessMapApi(loadHeadlessMapDocument(report.savedText));
  const headlessDistance = headless.analysis.measureDistance(report.places.from, report.places.to);
  const headlessDirection = headless.analysis.getDirection(report.places.from, report.places.to);
  const applicationConsoleErrors = consoleErrors.slice(consoleStart).filter(message => !["operation-stall", "main-thread-long-task", "render-frame-gap", "input-handler-stall"].some(type => message.includes(`[FMG health] ${type}`)));

  assert.equal(report.methodCount, 329);
  assert.equal(report.cells, 100_000);
  for (const entry of [report.tenK, report.roundtrip, report.hundredK]) {
    assert.equal(entry.resolvedName.ok && entry.resolvedExact.ok && entry.distance.ok && entry.direction.ok, true);
    assert.equal(entry.sideEffects, false);
    assert.deepEqual(entry.longTasks, []);
    assert.ok(["state-capital", "state-center-cell"].includes(entry.stateAnchor));
    assert.ok(["province-capital", "province-pole", "province-center-cell"].includes(entry.provinceAnchor));
    assert.deepEqual(entry.screen.map(item => item.space), ["canvas-device-pixel", "canvas-device-pixel", "canvas-device-pixel"]);
    assert.deepEqual(entry.screen.map(item => item.dpr), [2, 2, 2]);
    assert.ok(entry.screen[0].screenDistancePx < entry.screen[1].screenDistancePx && entry.screen[1].screenDistancePx < entry.screen[2].screenDistancePx);
    assert.equal(new Set(entry.screen.map(item => item.distanceWorld)).size, 1);
  }
  assert.equal(report.tenK.distance.data.distanceWorld, report.roundtrip.distance.data.distanceWorld);
  assert.equal(report.tenK.direction.data.bearingDegrees, report.roundtrip.direction.data.bearingDegrees);
  assert.equal(headlessDistance.ok && headlessDirection.ok, true);
  assert.ok(Math.abs(headlessDistance.data.distanceWorld - report.tenK.distance.data.distanceWorld) < 1e-9);
  assert.ok(Math.abs(headlessDistance.data.distanceValue - report.tenK.distance.data.distanceValue) < 1e-9);
  assert.ok(Math.abs(headlessDirection.data.bearingDegrees - report.tenK.direction.data.bearingDegrees) < 1e-9);
  assert.equal(headlessDistance.data.unitSource, "saved");
  assert.equal(report.schemas.every(schema => schema.metadata.mutates === "none" && schema.metadata.requiresConfirm === false), true);
  assert.equal(report.loading.visible, false);
  assert.equal(report.glError, 0);
  assert.deepEqual(report.healthErrors, []);
  assert.deepEqual(applicationConsoleErrors, []);
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({
    ok: true,
    cells: {tenK: 10_000, refined: report.cells},
    distanceWorld: report.tenK.distance.data.distanceWorld,
    direction: report.tenK.direction.data.direction,
    anchors: {state: report.tenK.stateAnchor, province: report.tenK.provinceAnchor},
    screenDistances: report.tenK.screen.map(item => item.screenDistancePx),
    headlessUnitSource: headlessDistance.data.unitSource,
    methodCount: report.methodCount
  }, null, 2));
} finally {
  if (context) await Promise.race([context.close(), delay(5_000)]);
  if (browser) await Promise.race([browser.close(), delay(5_000)]);
  server.kill();
  await Promise.race([new Promise(done => server.once("exit", done)), delay(5_000)]);
}

async function waitForServer(child) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`静态服务提前退出：${child.exitCode}`);
    try { if ((await fetch(`http://${host}:${port}`)).ok) return; } catch {}
    await delay(50);
  }
  throw new Error("等待静态服务超时");
}

function delay(ms) {
  return new Promise(done => setTimeout(done, ms));
}
