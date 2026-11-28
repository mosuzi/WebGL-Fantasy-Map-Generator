import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {preview} from "vite";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const file = resolve(process.argv.slice(2).find(arg => !arg.startsWith("--")) || join(root, "tools/fixtures/webgl-map-v4-coastal-cities-0.5.173.webfmg"));
const {chromium} = createRequire(new URL("../source/Fantasy-Map-Generator/package.json", import.meta.url))("playwright");
const profile = await mkdtemp(join(tmpdir(), "fmg-load-"));
const server = await preview({configFile: false, root, build: {outDir: "dist/webgl-generator"}, preview: {host: "127.0.0.1", port: 0}, logLevel: "error"});
let context;
try {
  const importedPage = await openPage("data.importMap");
  await waitForApiReady(importedPage, 60000);
  await importedPage.locator("#import-map-file").setInputFiles(file);
  const imported = await result(importedPage);
  const local = process.argv.includes("--local-edits") ? await exerciseLocalEdits(importedPage) : null;
  if (local) await exerciseMeasurementImport(importedPage, local);
  const saved = await importedPage.evaluate(() => window.webglGeneratorApi.data.saveBrowserMap());
  assert.ok(saved.ok, saved.error?.message);
  await context.close();

  const restoredPage = await openPage("data.restoreBrowserMap");
  const restored = await result(restoredPage);
  if (local) {
    const fields = await restoredPage.evaluate(({cell, id, measurement, packCell}) => {
      const {map} = window.__webglGeneratorApp;
      return [map.grid.cells.h[cell], map.politics.states[id].name, Array.isArray(map.pack.cells.h), map.measurements.items.some(item => item.id === measurement), map.pack.cells.suitabilityOverride[packCell]];
    }, local);
    assert.deepEqual(fields, [local.height, local.name, true, true, local.suitability]);
  }
  assert.deepEqual(restored.identity, imported.identity);
  assert.equal(restored.cell, imported.cell);
  for (const entry of [imported, restored]) {
    assert.ok(entry.ms < 7000, JSON.stringify(entry));
    assert.ok(entry.maxLongTaskMs <= 200, JSON.stringify(entry));
  }
  console.log(JSON.stringify({imported, restored, local}, null, 2));
} finally {
  await context?.close();
  await new Promise(resolveClose => server.httpServer.close(resolveClose));
  await rm(profile, {recursive: true, force: true, maxRetries: 3});
}

async function exerciseLocalEdits(page) {
  return page.evaluate(async () => {
    const app = window.__webglGeneratorApp;
    const api = window.webglGeneratorApi;
    const {map, renderer} = app;
    const {states} = map.politics;
    const populations = map.pack.cells.pop, gridPopulation = map.grid.cells.pop;
    const gridHeights = map.grid.cells.h, packHeights = map.pack.cells.h;
    if (![gridHeights, packHeights, map.pack.cells.g, map.pack.cells.pop, map.pack.cells.suitabilityBase].every(Array.isArray)) throw Error("编辑列仍使用传输格式");
    const cell = map.pack.cells.g.find(gridCell => gridHeights[gridCell] > 24 && gridHeights[gridCell] < 90);
    const state = states.find(row => row?.i && !row.removed);
    const id = state.i, oldName = state.name, name = oldName + "·局部核对";
    const oldHeight = gridHeights[cell], height = oldHeight + 1;
    const session = () => app.mapWorkerCoordinator?.getSessionSnapshot?.()?.id;
    const owner = session();
    const refreshes = () => renderer.getStats().performanceEvents?.surfaceRefresh?.completed || 0;
    const startingRefreshes = refreshes();
    const check = response => { if (!response?.ok) throw Error(response?.error?.message || "编辑失败"); };
    check(await api.edit.height.applyChanges([{gridCell: cell, after: height}]));
    check(await api.edit.states.rename(id, name));
    check(await api.history.undo());
    if (states[id].name !== oldName || gridHeights[cell] !== height) throw Error("撤销越过本次写集");
    check(await api.history.undo());
    if (gridHeights[cell] !== oldHeight) throw Error("高度撤销失败");
    check(await api.history.redo());
    check(await api.history.redo());
    const packCell = map.pack.cells.g.indexOf(cell);
    const originalOverride = map.pack.cells.suitabilityOverride[packCell];
    const suitability = originalOverride === 63 ? 64 : 63;
    const other = map.pack.cells.g.findIndex(gridCell => gridCell !== cell);
    const otherPopulation = populations[other];
    check(await api.edit.biomes.applySuitability([cell], {mode: "set", scope: "all", value: suitability}));
    check(await api.history.undo());
    if (map.pack.cells.suitabilityOverride[packCell] !== originalOverride) throw Error("适居度撤销失败");
    check(await api.history.redo());
    if (map.pack.cells.pop !== populations || map.grid.cells.pop !== gridPopulation || otherPopulation !== populations[other]
      || map.pack.cells.suitabilityOverride[packCell] !== suitability) throw Error("适居度改写了范围外的人口");
    await app.mapReplicaPatchQueue;
    if (app.map !== map || states[id] !== state || map.grid.cells.h !== gridHeights || map.pack.cells.h !== packHeights
      || state.name !== name || gridHeights[cell] !== height || refreshes() !== startingRefreshes) throw Error("局部编辑替换了地图、对象表或底图");
    if (!owner || session() !== owner) throw Error("局部连续修改丢失了后台地图副本");
    return {cell, id, height, name, packCell, suitability, fullSurfaceRefreshes: refreshes() - startingRefreshes};
  });
}

async function exerciseMeasurementImport(page, local) {
  const before = await page.evaluate(() => {
    const {map, renderer, mapWorkerCoordinator} = window.__webglGeneratorApp;
    window.measurementProbe = {items: map.measurements.items, grid: map.grid, states: map.politics.states, first: map.measurements.items[0]};
    return {count: map.measurements.items.length, owner: mapWorkerCoordinator.getSessionSnapshot().id,
      draws: renderer.getStats().performanceEvents?.surfaceRefresh?.completed || 0};
  });
  const data = {type: "FeatureCollection", features: [{type: "Feature", properties: {name: "测量局部核对"},
    geometry: {type: "LineString", coordinates: [[0, 0], [1, 1], [2, 1]]}}]};
  await page.locator("#import-geo-file").setInputFiles({name: "local.geojson", mimeType: "application/geo+json", buffer: Buffer.from(JSON.stringify(data))});
  await page.waitForFunction(count => window.__webglGeneratorApp.map.measurements.items.length === count + 1, before.count);
  local.measurement = await page.evaluate(async ({count, owner, draws}) => {
    const app = window.__webglGeneratorApp;
    const {map, renderer} = app;
    const {items, first, grid, states} = window.measurementProbe;
    const imported = structuredClone(map.measurements.items.at(-1));
    const api = window.webglGeneratorApi;
    if (!(await api.history.undo()).ok || map.measurements.items.length !== count) throw Error("GEO 撤销失败");
    if (!(await api.history.redo()).ok || JSON.stringify(map.measurements.items.at(-1)) !== JSON.stringify(imported)) throw Error("GEO 重做失败");
    await app.mapReplicaPatchQueue;
    if (map.grid !== grid || map.politics.states !== states || map.measurements.items !== items || (count && items[0] !== first)) throw Error("导入一条测量重建了既有数据");
    if ((renderer.getStats().performanceEvents?.surfaceRefresh?.completed || 0) !== draws || app.mapWorkerCoordinator.getSessionSnapshot()?.id !== owner) throw Error("测量导入触发全图重建");
    return imported.id;
  }, before);
}

async function openPage(operation) {
  context = await chromium.launchPersistentContext(profile, {channel: "chrome", viewport: {width: 1460, height: 900}});
  await context.addInitScript(name => {
    let start = name === "data.restoreBrowserMap" ? 0 : null;
    const tasks = [];
    const observer = new PerformanceObserver(list => tasks.push(...list.getEntries()));
    observer.observe({type: "longtask"});
    document.addEventListener("change", event => {
      if (event.target.id === "import-map-file") start = performance.now();
    }, true);
    function frame() {
      const app = window.__webglGeneratorApp;
      const state = app?.runtimeOperation?.getSnapshot();
      if (start !== null && app?.map && app.renderer?.map === app.map && !state?.busy
        && state?.last?.name === name && state.last.status === "success"
        && window.webglGeneratorApi?.info.runtimeStats().data.loading.visible === false) {
        const {map, renderer} = app;
        const box = renderer.canvas.getBoundingClientRect();
        const cell = renderer.pickClientPoint(box.x + box.width / 2, box.y + box.height / 2)?.gridCell;
        const end = performance.now();
        tasks.push(...observer.takeRecords());
        observer.disconnect();
        const durations = tasks.filter(task => task.startTime >= start && task.startTime < end).map(task => task.duration);
        window.loadResult = {ms: Math.round(end - start), maxLongTaskMs: Math.max(0, ...durations), cell, identity: {
          seed: map.metadata.seed, checksum: map.summary.checksum, grid: map.grid.cells.i.length,
          pack: map.pack.cells.i.length, cities: map.settlements.cities.length, routes: map.settlements.routes.length
        }};
        return;
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }, operation);
  const page = await context.newPage();
  await page.goto(server.resolvedUrls.local[0], {waitUntil: "commit"});
  return page;
}

async function result(page) {
  await page.waitForFunction(() => window.loadResult, null, {timeout: 60000});
  const value = await page.evaluate(() => window.loadResult);
  assert.ok(Number.isInteger(value.cell));
  return value;
}
