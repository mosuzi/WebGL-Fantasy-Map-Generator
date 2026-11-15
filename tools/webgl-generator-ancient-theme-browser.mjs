#!/usr/bin/env node
import assert from "node:assert/strict";
import {existsSync, mkdirSync, writeFileSync} from "node:fs";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";
import {preview} from "vite";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const root = resolve(import.meta.dirname, "..");
const legacy = process.argv.includes("--legacy");
const diagnosePng = process.argv.includes("--diagnose-png");
const diagnoseExport = process.argv.includes("--diagnose-export");
const cellsTarget = process.argv.includes("--100k") ? 100_000 : 10_000;
const archivePath = process.env.FMG_REAL_ARCHIVE || "C:\\Users\\mosuzi\\Downloads\\krichars (3).webfmg";
if (legacy) assert.ok(existsSync(archivePath), `旧地图不存在：${archivePath}`);
const {chromium} = createRequire(join(root, "source/Fantasy-Map-Generator/package.json"))("playwright");
const outputDir = join(root, "docs", "generated", `task-415-ancient-${legacy ? "legacy" : cellsTarget}`);
mkdirSync(outputDir, {recursive: true});
const server = await preview({configFile: join(root, "vite.config.mjs"), preview: {host: "127.0.0.1", port: 5597, strictPort: true}, logLevel: "error"});
const browser = await chromium.launch({channel: "chrome", headless: true});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
page.setDefaultTimeout(180_000);
const errors = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "error" && !message.text().startsWith("[FMG health]")) errors.push(message.text()); });

try {
  await page.goto("http://127.0.0.1:5597/?healthClear=1&debug=1", {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 120_000);
  if (legacy) {
    await page.evaluate(() => { window.__ancientPreviousMap = window.__webglGeneratorApp?.map; });
    await page.locator("#import-map-file").setInputFiles(archivePath);
    await page.waitForFunction(() => {
      const app = window.__webglGeneratorApp;
      return app?.map && app.map !== window.__ancientPreviousMap && app.map.grid?.cells?.i?.length === 100_000
        && !app.runtimeOperationSnapshot?.busy;
    });
  } else {
    const response = await page.evaluate(target => window.webglGeneratorApi.generate.newMap({confirm: true, seed: `task-415-ancient-${target}`, cellsTarget: target, heightmapTemplate: "continents"}), cellsTarget);
    assert.equal(response?.ok, true, JSON.stringify(response?.error));
  }
  await waitForApiReady(page, 180_000);
  const report = await page.evaluate(async ({diagnosePng, diagnoseExport}) => {
    const api = window.webglGeneratorApi, app = window.__webglGeneratorApp, renderer = app.renderer;
    const unwrap = (result, label) => {
      if (!result?.ok) throw new Error(`${label}: ${result?.error?.code || "operation_failed"} ${result?.error?.message || ""}`);
      return result.data;
    };
    const settle = () => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 80))));
    const pixels = () => {
      const gl = renderer.gl, data = new Uint8Array(renderer.canvas.width * renderer.canvas.height * 4);
      renderer.draw({updateDynamicBuffers: false, updateOverlay: false});
      gl.readPixels(0, 0, renderer.canvas.width, renderer.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
      return data;
    };
    const colorAudit = (data, width) => {
      let nonWarm = 0, vivid = 0, redHue = 0, opaque = 0;
      const colors = new Set();
      const samples = [];
      const redHueSamples = [];
      for (let index = 0; index < data.length; index += 4) {
        if (data[index + 3] < 240) continue;
        opaque++;
        const r = data[index], g = data[index + 1], b = data[index + 2];
        if (r + 3 < g || g + 3 < b) {
          nonWarm++;
          if (samples.length < 24) samples.push({x: (index / 4) % width, y: Math.floor(index / 4 / width), rgb: [r, g, b]});
        }
        if (r + 16 < g || g + 16 < b) vivid++;
        if (r - g > g - b + 6) {
          redHue++;
          if (redHueSamples.length < 24) redHueSamples.push({x: (index / 4) % width, y: Math.floor(index / 4 / width), rgb: [r, g, b]});
        }
        if (index % 64 === 0) colors.add(`${r >> 4}:${g >> 4}:${b >> 4}`);
      }
      return {opaque, nonWarm, vivid, redHue, colors: colors.size, samples, redHueSamples};
    };
    const same = (first, second) => {
      if (first.length !== second.length) return false;
      for (let index = 0; index < first.length; index++) if (first[index] !== second[index]) return false;
      return true;
    };
    const overlays = () => ({
      labels: renderer.labelItems.length,
      labelColors: [...new Set(renderer.labelItems.map(item => item.resolvedStyle?.color))].slice(0, 30),
      markers: renderer.markerIconItems.length,
      markerFills: [...new Set(renderer.markerIconItems.map(item => item.node.style.getPropertyValue("--marker-fill")))].slice(0, 30),
      military: renderer.militaryIconItems.length,
      militaryBorders: [...new Set(renderer.militaryIconItems.map(item => item.node.style.getPropertyValue("--military-label-border")))].slice(0, 30),
      legendSwatches: [...document.querySelectorAll("#map-legend .legend-swatch-item i")].map(node => node.style.background),
      legendGradient: document.querySelector("#map-legend .legend-bar")?.style.background || ""
    });
    const originalColors = app.map.politics.states.filter(state => state?.i && !state.removed).slice(0, 30).map(state => state.color);
    unwrap(await api.layers.setTheme("default"), "default");
    unwrap(await api.layers.setSmoothCellBorders(true), "smooth");
    app.runtimeActions.layers.setStateBorderBlend({enabled: true, widthWorld: 14, strength: 0.65});
    for (const layer of ["populationColumns", "precipitationDots", "oceanCurrents", "markers", "military", "routes", "rivers"]) {
      unwrap(await api.layers.setVisible(layer, true), layer);
    }
    unwrap(await api.layers.setViewMode("states"), "states baseline");
    await settle();
    const before = pixels();
    const phaseMarks = [];
    const mark = phase => phaseMarks.push({phase, time: performance.now()});
    const longTasks = [], observer = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(entry => ({startTime: entry.startTime, duration: Math.round(entry.duration), attribution: entry.attribution?.map(item => ({name: item.name, containerType: item.containerType})) || []}))));
    observer.observe({type: "longtask", buffered: false});
    const operations = [];
    try {
      const startedAt = performance.now();
      mark("ancient-start");
      unwrap(await api.layers.setTheme("ancient"), "ancient");
      await settle();
      operations.push({action: "theme", ms: Math.round(performance.now() - startedAt)});
      for (const mode of diagnosePng ? ["states"] : ["height", "temperature", "precipitation", "biomes", "states", "provinces", "cultures", "religions", "regions", "population", "governments", "diplomacy"]) {
        const modeStart = performance.now();
        mark(`${mode}-start`);
        unwrap(await api.layers.setViewMode(mode), mode);
        await settle();
        const color = colorAudit(pixels(), renderer.canvas.width);
        let legendPng;
        if (mode === "temperature" || mode === "precipitation") {
          const legendExport = unwrap(await api.data.exportPNG({download: false, includeDataUrl: true, outputWidth: 640, crop: {mode: "viewport"}}), `${mode} legend png`);
          const legendImage = new Image(); legendImage.src = legendExport.dataUrl; await legendImage.decode();
          const legendCanvas = document.createElement("canvas"); legendCanvas.width = legendImage.width; legendCanvas.height = legendImage.height;
          const legendContext = legendCanvas.getContext("2d", {willReadFrequently: true}); legendContext.drawImage(legendImage, 0, 0);
          legendPng = colorAudit(legendContext.getImageData(0, 0, legendImage.width, legendImage.height).data, legendImage.width);
        }
        operations.push({action: mode, ms: Math.round(performance.now() - modeStart), ...color, legendPng, overlay: ["temperature", "precipitation", "biomes", "diplomacy", "governments"].includes(mode) ? overlays() : undefined});
        mark(`${mode}-end`);
      }
      mark("export-states-start");
      unwrap(await api.layers.setViewMode("states"), "states before export");
      await settle();
      const ancientStates = pixels();
      const ancientOverlay = overlays();
      const canvasFilter = getComputedStyle(renderer.canvas).filter;
      if (diagnoseExport) {
        mark("base-png-start");
        unwrap(await api.data.exportPNG({download: false, includeDataUrl: false, includeMapOverlays: false, outputWidth: 640, crop: {mode: "viewport"}}), "base png");
        mark("base-png-end");
      }
      mark("png-start");
      const png = unwrap(await api.data.exportPNG({download: false, includeDataUrl: true, outputWidth: 640, crop: {mode: "viewport"}}), "png");
      mark("png-end");
      window.__ancientThemePngDataUrl = png.dataUrl;
      const image = new Image(); image.src = png.dataUrl; await image.decode();
      const exported = document.createElement("canvas"); exported.width = image.width; exported.height = image.height;
      const context = exported.getContext("2d", {willReadFrequently: true}); context.drawImage(image, 0, 0);
      const pngAudit = colorAudit(context.getImageData(0, 0, image.width, image.height).data, image.width);
      mark("png-audit-end");
      const rect = renderer.canvas.getBoundingClientRect();
      const sample = pngAudit.samples[0];
      const elementsAtPngSample = sample ? document.elementsFromPoint(rect.left + sample.x * rect.width / image.width, rect.top + sample.y * rect.height / image.height)
        .slice(0, 12).map(node => ({tag: node.tagName, className: typeof node.className === "string" ? node.className : "", text: node.textContent?.slice(0, 32) || ""})) : [];
      const overlayNodesAtPngSample = sample ? [...renderer.overlay.children].filter(node => {
        const bounds = node.getBoundingClientRect();
        const x = rect.left + sample.x * rect.width / image.width;
        const y = rect.top + sample.y * rect.height / image.height;
        return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
      }).slice(0, 12).map(node => ({className: node.className, text: node.textContent?.slice(0, 40) || "", html: node.outerHTML?.slice(0, 300) || ""})) : [];
      mark("restore-start");
      unwrap(await api.layers.setTheme("default"), "restore default");
      await settle();
      const restored = pixels();
      mark("restore-end");
      const restoredOverlay = overlays();
      longTasks.push(...observer.takeRecords().map(entry => ({startTime: entry.startTime, duration: Math.round(entry.duration), attribution: entry.attribution?.map(item => ({name: item.name, containerType: item.containerType})) || []})));
      const rawColorsUnchanged = JSON.stringify(originalColors) === JSON.stringify(app.map.politics.states.filter(state => state?.i && !state.removed).slice(0, 30).map(state => state.color));
      const health = unwrap(api.info.healthEvents({severity: "error", limit: 100}), "health").events || [];
      return {cells: app.map.grid.cells.i.length, operations, ancientStates: colorAudit(ancientStates, renderer.canvas.width), ancientOverlay, png: {width: image.width, height: image.height, ...pngAudit, elementsAtPngSample, overlayNodesAtPngSample}, canvasFilter, restoredPixelsExact: same(before, restored), restoredOverlay, rawColorsUnchanged, longTasks, phaseMarks, health, glError: renderer.gl.getError(), loading: unwrap(api.info.runtimeStats(), "stats").loading.visible};
    } finally { observer.disconnect(); }
  }, {diagnosePng, diagnoseExport});
  report.errors = errors;
  writeFileSync(join(outputDir, "result.json"), `${JSON.stringify(report, null, 2)}\n`);
  const pngDataUrl = await page.evaluate(() => window.__ancientThemePngDataUrl);
  if (pngDataUrl?.startsWith("data:image/png;base64,")) writeFileSync(join(outputDir, "ancient.png"), Buffer.from(pngDataUrl.slice("data:image/png;base64,".length), "base64"));
  if (diagnosePng) {
    console.log(JSON.stringify({diagnostic: true, artifact: join(outputDir, "result.json"), png: {nonWarm: report.png.nonWarm, vivid: report.png.vivid, redHue: report.png.redHue}, longTasks: report.longTasks, phaseMarks: report.phaseMarks}, null, 2));
    process.exitCode = 0;
  } else {
  assert.ok(report.cells >= (legacy || cellsTarget === 100_000 ? 99_000 : 9_000));
  assert.equal(report.operations.length, 13);
  for (const item of report.operations.slice(1)) {
    assert.equal(item.vivid, 0, `${item.action} 有明显非黄赭色像素`);
    assert.ok(item.redHue < item.opaque * 0.00005, `${item.action} 偏红色面积过大`);
    assert.ok(item.nonWarm < item.opaque * 0.002, `${item.action} 非黄赭色像素过多`);
    assert.ok(item.colors >= 8, `${item.action} 色面层级不足`);
    if (item.legendPng) {
      assert.equal(item.legendPng.vivid, 0, `${item.action} PNG 图例出现鲜艳色`);
      assert.equal(item.legendPng.nonWarm, 0, `${item.action} PNG 图例出现非暖色`);
      assert.ok(item.legendPng.redHue < item.legendPng.opaque * 0.00005, `${item.action} PNG 图例偏红面积过大`);
    }
  }
  assert.equal(report.png.vivid, 0, "PNG 有明显非黄赭色像素");
  assert.ok(report.png.redHue < report.png.opaque * 0.00005, "PNG 偏红色面积过大");
  assert.ok(report.png.nonWarm < report.png.opaque * 0.002, "PNG 非黄赭色像素过多");
  assert.equal(report.canvasFilter, "none");
  assert.equal(report.restoredPixelsExact, true);
  assert.equal(report.rawColorsUnchanged, true);
  assert.deepEqual(report.longTasks.filter(item => item.duration > 200), []);
  assert.deepEqual(report.health, []);
  assert.equal(report.glError, 0);
  assert.equal(report.loading, false);
  assert.deepEqual(report.errors, []);
  console.log(JSON.stringify({ok: true, artifact: join(outputDir, "result.json"), cells: report.cells, modes: report.operations.slice(1).map(({action, nonWarm, vivid, redHue, colors}) => ({action, nonWarm, vivid, redHue, colors})), png: report.png, themeMs: report.operations[0].ms, longTaskMax: Math.max(0, ...report.longTasks.map(item => item.duration))}, null, 2));
  }
} finally {
  await browser.close();
  await server.httpServer.close();
}
