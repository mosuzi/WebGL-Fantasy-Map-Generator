#!/usr/bin/env node
import assert from "node:assert/strict";
import {mkdirSync, writeFileSync} from "node:fs";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";
import {preview} from "vite";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const root = resolve(import.meta.dirname, "..");
const {chromium} = createRequire(join(root, "source/Fantasy-Map-Generator/package.json"))("playwright");
const artifactDir = join(root, "docs", "generated", "screenshots");
const server = await preview({configFile: join(root, "vite.config.mjs"), preview: {host: "127.0.0.1", port: 5597, strictPort: true}, logLevel: "error"});
const browser = await chromium.launch({channel: "chrome", headless: true});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
page.setDefaultTimeout(300_000);
const consoleErrors = [];
const pageErrors = [];
page.on("console", message => {if (message.type() === "error" && !message.text().startsWith("[FMG health]")) consoleErrors.push(message.text());});
page.on("pageerror", error => pageErrors.push(error.message));

try {
  await page.goto("http://127.0.0.1:5597/?healthClear=1", {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 180_000);
  const results = [];
  mkdirSync(artifactDir, {recursive: true});
  for (const cellsTarget of (process.argv.includes("--10k") ? [10_000] : [10_000, 100_000])) {
    const generated = await page.evaluate(target => window.webglGeneratorApi.generate.newMap({
      confirm: true, seed: `metric-projection-${target}`, cellsTarget: target, heightmapTemplate: "continents"
    }), cellsTarget);
    assert.equal(generated.ok, true, `生成 ${cellsTarget} 格失败：${JSON.stringify(generated.error)}`);
    await waitForApiReady(page, 180_000);
    await page.waitForFunction(() => window.__webglGeneratorApp?.viewPrewarmScheduler?.getSnapshot?.().status === "ready");
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const result = await page.evaluate(async target => {
      const app = window.__webglGeneratorApp;
      const renderer = app.renderer;
      const cells = app.map.grid.cells;
      const grid = app.map.grid;
      const gl = renderer.gl;
      let strongest = -1;
      let largestPopulation = 0;
      for (let cell = 0; cell < cells.i.length; cell++) {
        const population = Number(cells.pop?.[cell]);
        if (cells.h[cell] >= 20 && population > largestPopulation) {
          strongest = cell;
          largestPopulation = population;
        }
      }
      if (strongest < 0) throw new Error("未找到有人口的陆地 cell");
      const [x, y] = grid.points[cells.p[strongest]];
      renderer.setLayersVisible([["cities", false], ["population", false], ["markers", false], ["resources", false], ["military", false]]);
      const closeScale = target === 10_000 ? 12 : 32;
      const centerAtScale = scale => {
        renderer.camera.scale = scale;
        renderer.camera.offsetX = -(x / app.map.metadata.graphWidth * 2 - 1) * scale;
        renderer.camera.offsetY = -(1 - y / app.map.metadata.graphHeight * 2) * scale;
      };
      centerAtScale(closeScale);
      renderer.draw({updateOverlay: false});
      const longTasks = [];
      const phases = [];
      const drawSpans = [];
      const originalDraw = renderer.draw;
      renderer.draw = function (...args) {
        const startedAt = performance.now();
        try {return originalDraw.apply(this, args);}
        finally {drawSpans.push({startTime: Math.round(startedAt), duration: Math.round((performance.now() - startedAt) * 10) / 10});}
      };
      const mark = phase => phases.push({phase, startTime: performance.now()});
      const record = entry => longTasks.push({startTime: Math.round(entry.startTime), duration: Math.round(entry.duration * 10) / 10});
      const observer = new PerformanceObserver(list => list.getEntries().forEach(record));
      observer.observe({type: "longtask", buffered: false});
      window.__webglGeneratorHealth?.clear?.();
      mark("rain-toggle-and-build");
      renderer.setLayersVisible([["precipitationDots", true], ["populationColumns", false]]);
      await renderer.waitForCellMetricLayer();
      mark("rain-draw");
      renderer.draw({updateOverlay: false});
      mark("rain-snapshot");
      const rainBefore = renderer.canvas.toDataURL("image/png");
      mark("population-toggle-and-draw");
      renderer.setLayerVisible("populationColumns", true);
      renderer.draw({updateOverlay: false});
      mark("population-snapshot");
      const populationAndRain = renderer.canvas.toDataURL("image/png");
      const ready = renderer.cellMetricLayer.ready;
      const populationCount = renderer.cellMetricLayer.populationCount;
      const precipitationCount = renderer.cellMetricLayer.precipitationCount;
      const glError = gl.getError();
      mark("png-export");
      const exportResult = await window.webglGeneratorApi.data.exportPNG({
        download: false, includeDataUrl: false, crop: {mode: "viewport"},
        overlays: {labels: false, cityIcons: false, markers: false, military: false, measurements: false, legend: false, scaleBar: false}
      });
      mark("rain-restore");
      renderer.setLayerVisible("populationColumns", false);
      renderer.draw({updateOverlay: false});
      mark("rain-restored-snapshot");
      const rainAfter = renderer.canvas.toDataURL("image/png");
      mark("rain-off");
      renderer.setLayerVisible("precipitationDots", false);
      mark("second-zoom");
      centerAtScale(closeScale * 0.5);
      renderer.draw({updateOverlay: false});
      const zoomBefore = renderer.canvas.toDataURL("image/png");
      renderer.setLayerVisible("populationColumns", true);
      renderer.draw({updateOverlay: false});
      const zoomPopulationChangesPixels = renderer.canvas.toDataURL("image/png") !== zoomBefore;
      renderer.setLayerVisible("populationColumns", false);
      centerAtScale(closeScale);
      renderer.draw({updateOverlay: false});
      observer.takeRecords().forEach(record);
      observer.disconnect();
      renderer.draw = originalDraw;
      for (const task of longTasks) task.phase = phases.findLast(phase => phase.startTime <= task.startTime)?.phase || "unknown";
      return {
        cellsTarget: target, gridCells: cells.i.length, strongest, strongestPopulation: cells.pop[strongest],
        ready, populationCount, precipitationCount, rainRestored: rainBefore === rainAfter,
        populationChangesPixels: populationAndRain !== rainBefore,
        zoomPopulationChangesPixels,
        exportOk: exportResult.ok, exportSize: exportResult.data && [exportResult.data.width, exportResult.data.height],
        glError, longTasks, maxDrawMs: Math.max(...drawSpans.map(span => span.duration)),
        healthErrors: window.__webglGeneratorHealth?.getEvents?.(200)?.filter(event => event.level === "error") || []
      };
    }, cellsTarget);
    assert.equal(result.gridCells >= cellsTarget * 0.99, true, "地图格数不足");
    assert.equal(result.ready, true, "cell 数值图层未完成构建");
    assert.ok(result.populationCount > 0 && result.precipitationCount > 0, "人口柱或降雨圆点为空");
    assert.equal(result.populationChangesPixels, true, "人口柱未改变正式 canvas 像素");
    assert.equal(result.zoomPopulationChangesPixels, true, "第二缩放级别没有显示人口柱");
    assert.equal(result.rainRestored, true, "关闭人口柱后降雨圆点像素未恢复");
    assert.equal(result.exportOk, true, "正式 PNG 导出失败");
    assert.equal(result.glError, 0, "WebGL 绘制出错");
    assert.deepEqual(result.healthErrors, [], "正式页面出现 health error");
    assert.equal(result.longTasks.some(task => task.duration > 200), false, "图层操作出现超过 200ms LongTask");
    await page.evaluate(() => {
      const renderer = window.__webglGeneratorApp.renderer;
      renderer.setLayerVisible("populationColumns", true);
      renderer.draw({updateOverlay: false});
    });
    await page.locator("#map-canvas").screenshot({path: join(artifactDir, `task-411-population-columns-${cellsTarget}.png`)});
    results.push(result);
  }
  assert.deepEqual(consoleErrors, [], "正式页面出现 console error");
  assert.deepEqual(pageErrors, [], "正式页面出现 page error");
  writeFileSync(join(artifactDir, "task-411-browser-result.json"), `${JSON.stringify({results, consoleErrors, pageErrors}, null, 2)}\n`);
  console.log(JSON.stringify({ok: true, results}, null, 2));
} finally {
  await browser.close();
  await server.close();
}
