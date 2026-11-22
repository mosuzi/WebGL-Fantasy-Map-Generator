import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {preview} from "vite";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const file = resolve(process.argv[2] || join(root, "tools/fixtures/webgl-map-v4-coastal-cities-0.5.173.webfmg"));
const {chromium} = createRequire(new URL("../source/Fantasy-Map-Generator/package.json", import.meta.url))("playwright");
const profile = await mkdtemp(join(tmpdir(), "fmg-load-"));
const server = await preview({configFile: false, root, build: {outDir: "dist/webgl-generator"}, preview: {host: "127.0.0.1", port: 0}, logLevel: "error"});
let context;
try {
  const importedPage = await openPage("data.importMap");
  await waitForApiReady(importedPage, 60000);
  await importedPage.locator("#import-map-file").setInputFiles(file);
  const imported = await result(importedPage);
  const saved = await importedPage.evaluate(() => window.webglGeneratorApi.data.saveBrowserMap());
  assert.ok(saved.ok, saved.error?.message);
  await context.close();

  const restored = await result(await openPage("data.restoreBrowserMap"));
  assert.deepEqual(restored.identity, imported.identity);
  assert.equal(restored.cell, imported.cell);
  for (const entry of [imported, restored]) {
    assert.ok(entry.ms < 7000, JSON.stringify(entry));
    assert.ok(entry.maxLongTaskMs <= 200, JSON.stringify(entry));
  }
  console.log(JSON.stringify({imported, restored}, null, 2));
} finally {
  await context?.close();
  await new Promise(resolveClose => server.httpServer.close(resolveClose));
  await rm(profile, {recursive: true, force: true, maxRetries: 3});
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
