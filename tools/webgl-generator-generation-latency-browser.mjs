import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {preview} from "vite";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const {chromium} = createRequire(new URL("../source/Fantasy-Map-Generator/package.json", import.meta.url))("playwright");
const server = await preview({configFile: false, root, build: {outDir: "dist/webgl-generator"}, preview: {host: "127.0.0.1", port: 0}, logLevel: "error"});
const cases = process.argv.slice(2);
try {
  for (const entry of cases.length ? cases : ["stage-2-1", "regen-465-fresh", "regen-465-states@states"]) {
    const [seed, view = "height"] = entry.split("@");
    const browser = await chromium.launch({channel: "chrome"});
    try {
      const page = await browser.newPage({viewport: {width: 1460, height: 900}, deviceScaleFactor: 1});
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(server.resolvedUrls.local[0], {waitUntil: "domcontentloaded"});
      await waitForApiReady(page, 120000);
      if (view !== "height") assert.equal((await page.evaluate(mode => window.webglGeneratorApi.layers.setViewMode(mode), view)).ok, true);
      await page.locator("#open-generation-panel").click();
      await page.locator('[data-control-tab="generation"]').click();
      await page.locator("#cells-input").fill("100000");
      await page.locator("#seed-input").fill(seed);
      await page.evaluate(() => {
        const app = window.__webglGeneratorApp, original = app.map;
        const run = window.generationProbe = {long: []};
        new PerformanceObserver(list => run.long.push(...list.getEntries().map(e => [e.startTime, e.duration]))).observe({type: "longtask"});
        document.querySelector("#generate-map").addEventListener("click", () => {
          run.start = performance.now();
          const check = () => {
            if (original !== app.map && !app.runtimeOperation.getSnapshot().busy) run.end = performance.now();
            else requestAnimationFrame(check);
          };
          requestAnimationFrame(check);
        }, {capture: true, once: true});
      });
      await page.locator("#generate-map").click();
      await page.waitForFunction(() => window.generationProbe.end, null, {timeout: 60000});
      const report = await page.evaluate(async () => {
        const app = window.__webglGeneratorApp, {map, renderer} = app, probe = window.generationProbe;
        const canvas = document.getElementById("map-canvas"), box = canvas.getBoundingClientRect();
        const pick = renderer.pickClientPoint(box.x + box.width / 2, box.y + box.height / 2);
        renderer.draw({updateDynamicBuffers: false, updateOverlay: false});
        const gl = renderer.gl, pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
        gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", pixels)));
        return {seed: map.metadata.seed, view: renderer.colorMode, cells: map.grid.cells.i.length,
          width: map.metadata.graphWidth, height: map.metadata.graphHeight, template: map.options.heightmapTemplate,
          cities: map.settlements.cities.length, routes: map.settlements.routes.length, rivers: map.rivers.rivers.length,
          checksum: map.summary.checksum, picked: pick?.gridCell, pixels: digest.join(","), gl: gl.getError(),
          wallMs: Math.round(probe.end - probe.start), longMs: probe.long.filter(([t]) => t >= probe.start && t < probe.end).map(([, d]) => d)};
      });
      console.log(JSON.stringify(report));
      assert.equal(report.seed, seed);
      assert.equal(report.view, view);
      assert.deepEqual([report.cells, report.width, report.height, report.template], [99846, 1440, 960, "continents"]);
      assert.ok(Number.isInteger(report.picked) && report.picked >= 0 && report.picked < report.cells);
      assert.equal(report.gl, 0);
      const restored = await page.evaluate(async () => {
        const app = window.__webglGeneratorApp, api = window.webglGeneratorApi;
        const saved = await app.runtimeActions.data.exportCompressedAll({download: false, includeBlob: true, includeBase64: false});
        const imported = await app.runtimeActions.data.importMap(saved.blob, {confirm: true, toast: false});
        if (imported?.ok === false) throw new Error(imported.error?.message);
        const changed = await api.layers.setViewMode(app.renderer.colorMode === "states" ? "height" : "states");
        return {checksum: app.map.summary.checksum, cells: app.map.grid.cells.i.length, viewChanged: changed.ok};
      });
      assert.deepEqual(restored, {checksum: report.checksum, cells: report.cells, viewChanged: true});
      assert.deepEqual(errors, []);
      assert.ok(report.wallMs < 7000, `${entry} 点击到可操作 ${report.wallMs}ms`);
      assert.ok(report.longMs.every(ms => ms <= 200), `${entry} 主线程长任务 ${report.longMs}`);
      if (seed === "stage-2-1") {
        const rollback = await page.evaluate(async () => {
          const app = window.__webglGeneratorApp, before = app.map;
          const coordinator = app.workerTaskCoordinator;
          const history = app.editHistory.getStats();
          let corrupted = false;
          app.workerTaskCoordinator = {...coordinator, run(task, payload, options) {
            return coordinator.run(task, payload, {...options, onGeneratedHandoff(handoff) {
              handoff.geometry[0].values[0] += 1;
              corrupted = true;
              options.onGeneratedHandoff(handoff);
            }});
          }};
          try {
            const failed = await window.webglGeneratorApi.generate.newMap({confirm: true, cellsTarget: 3000, seed: "broken-generation-handoff"});
            const after = app.editHistory.getStats();
            return {rejected: !failed.ok, corrupted, original: app.map === before && app.renderer.map === before,
              history: after.undo === history.undo && after.redo === history.redo, busy: app.runtimeOperation.getSnapshot().busy};
          } finally {
            app.workerTaskCoordinator = coordinator;
          }
        });
        assert.deepEqual(rollback, {rejected: true, corrupted: true, original: true, history: true, busy: false});
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise(resolve => server.httpServer.close(resolve));
}
