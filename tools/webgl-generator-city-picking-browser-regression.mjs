#!/usr/bin/env node
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createServer as createViteServer} from "vite";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const host = "127.0.0.1";
const port = 5526;
const baseUrl = `http://${host}:${port}`;
const timeoutMs = 180000;
const targets = [10000, 100000];
const vite = await createViteServer({
  configFile: join(rootDir, "vite.config.mjs"),
  server: {host, port, strictPort: true},
  logLevel: "error"
});
let browser;

try {
  await vite.listen();
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  const context = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1});
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  const consoleErrors = [];
  const healthErrors = [];
  const pageErrors = [];
  page.on("console", message => {
    if (message.type() !== "error") return;
    if (message.text().startsWith("[FMG health]")) healthErrors.push(message.text());
    else consoleErrors.push(message.text());
  });
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto(`${baseUrl}/?debug=1&healthClear=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, timeoutMs);
  await waitForMapReady(page);
  const reports = [];

  for (const cellsTarget of targets) {
    if (cellsTarget !== 10000) {
      await page.evaluate(async target => window.webglGeneratorApi.generate.newMap({
        confirm: true,
        seed: `city-picking-browser-${target}`,
        cellsTarget: target,
        heightmapTemplate: "continents"
      }), cellsTarget);
      await page.waitForFunction(target => window.__webglGeneratorApp?.map?.metadata?.cellsTarget === target, cellsTarget);
      await waitForMapReady(page);
    }
    await page.waitForFunction(() => window.__webglGeneratorApp?.renderer?.getStats?.().routeRefreshPending === false);
    const picking = await verifyFixedScreenPicking(page, cellsTarget);
    const activationFixture = await findExpandedMoveFixture(page);
    await prepareExpandedMoveMode(page, activationFixture);
    await page.evaluate(async () => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const app = window.__webglGeneratorApp;
      app.healthMonitor?.clear?.();
      app.cityEdit.movePerformanceSamples = [];
      window.__webglGeneratorHealth?.clear?.();
      window.__webglGeneratorDebug?.clearHealthEvents?.();
      window.__cityPickingLongTaskObserver?.disconnect?.();
      window.__cityPickingLongTasks = [];
      window.__cityPickingPhaseMarks = [{label: "start", time: performance.now()}];
      window.__cityPickingLongTaskObserver = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) window.__cityPickingLongTasks.push({duration: entry.duration, startTime: entry.startTime});
      });
      window.__cityPickingLongTaskObserver.observe({type: "longtask", buffered: false});
    });
    healthErrors.length = 0;
    const activation = await verifyExpandedMoveActivation(page, cellsTarget, activationFixture);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const diagnostics = await page.evaluate(() => {
      const app = window.__webglGeneratorApp;
      const samples = app.cityEdit.movePerformanceSamples || [];
      const handlers = samples.filter(sample => sample.phase === "pointermove-handler").map(sample => Number(sample.totalMs));
      return {
        longTasks: (window.__cityPickingLongTasks || []).map(task => ({
          ...task,
          phase: [...(window.__cityPickingPhaseMarks || [])].reverse().find(mark => mark.time <= task.startTime)?.label || "start"
        })),
        phaseMarks: [...(window.__cityPickingPhaseMarks || [])],
        handlerSamples: handlers.length,
        handlerP95Ms: percentile(handlers, 0.95),
        handlerMaxMs: Math.max(0, ...handlers),
        healthErrors: (window.__webglGeneratorHealth?.getEvents?.(200) || []).filter(event => event?.severity === "error" || event?.level === "error"),
        glError: app.renderer.canvas.getContext("webgl2")?.getError?.() ?? null
      };

      function percentile(values, ratio) {
        if (!values.length) return 0;
        const sorted = [...values].sort((a, b) => a - b);
        return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
      }
    });
    assert.equal(diagnostics.longTasks.length, 0, `${cellsTarget} 城镇热区交互不得产生 >=50ms longtask：${JSON.stringify(diagnostics.longTasks)}`);
    assert(diagnostics.handlerSamples >= 60, `${cellsTarget} 城镇热区 pointermove 样本不足`);
    assert(diagnostics.handlerP95Ms <= 8, `${cellsTarget} 城镇热区 pointermove P95 超过 8ms`);
    assert(diagnostics.handlerMaxMs <= 16.7, `${cellsTarget} 城镇热区 pointermove max 超过 16.7ms`);
    assert.deepEqual(diagnostics.healthErrors, [], `${cellsTarget} 城镇热区不得产生 active health error`);
    assert.equal(diagnostics.glError, 0, `${cellsTarget} 城镇热区出现 WebGL error`);
    assert.deepEqual(healthErrors, [], `${cellsTarget} 城镇热区不得产生 console health error`);
    reports.push({cellsTarget, picking, activation, diagnostics});
  }

  assert.deepEqual(consoleErrors, [], `城镇热区浏览器回归出现 console error：${consoleErrors.join(" | ")}`);
  assert.deepEqual(pageErrors, [], `城镇热区浏览器回归出现 page error：${pageErrors.join(" | ")}`);
  console.log(JSON.stringify({ok: true, reports, consoleErrors, pageErrors}, null, 2));
  await context.close();
} finally {
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await vite.close();
}

async function waitForMapReady(page) {
  await page.waitForFunction(() => window.webglGeneratorApi?.info?.mapSummary?.()?.data?.ready === true);
  await page.waitForFunction(() => document.getElementById("app-loading-screen")?.hidden === true);
}

async function verifyFixedScreenPicking(page, cellsTarget) {
  const result = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const map = app.map;
    const renderer = app.renderer;
    const cities = (map.settlements?.cities || []).filter(city => city && !city.removed && Number(city.id) > 0).sort((left, right) => Number(left.id) - Number(right.id));
    if (cities.length < 2) throw new Error("固定屏幕热区缺少双城样本");
    const [first, second] = cities;
    const savedPositions = cities.map(city => ({city, x: city.x, y: city.y}));
    const savedCamera = {...renderer.camera};
    const graphWidth = Number(map.metadata.graphWidth);
    const graphHeight = Number(map.metadata.graphHeight);
    const center = {x: graphWidth / 2, y: graphHeight / 2};
    const rect = renderer.canvas.getBoundingClientRect();
    const clientCenter = {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
    const scales = [0.35, 1, 4, 9];
    const boundary = [];
    const centerCamera = scale => {
      renderer.camera.scale = scale;
      renderer.camera.offsetX = -((center.x / graphWidth * 2 - 1) * scale);
      renderer.camera.offsetY = -((1 - center.y / graphHeight * 2) * scale);
    };

    try {
      for (const city of cities) {
        city.x = -graphWidth * 10;
        city.y = -graphHeight * 10;
      }
      first.x = center.x;
      first.y = center.y;
      renderer.refreshObjectPickingIndex();
      for (const scale of scales) {
        centerCamera(scale);
        const hit = renderer.pickClientPoint(clientCenter.x + 17.5, clientCenter.y)?.cityObject || null;
        const miss = renderer.pickClientPoint(clientCenter.x + 18.5, clientCenter.y)?.cityObject || null;
        boundary.push({scale, hitId: hit?.id ?? null, missId: miss?.id ?? null, hitDistance: hit?.distance ?? null});
      }
      centerCamera(0.35);
      second.x = center.x + 24 * graphWidth / (rect.width * renderer.camera.scale);
      second.y = center.y;
      renderer.refreshObjectPickingIndex();
      const nearest = renderer.pickClientPoint(clientCenter.x + 14, clientCenter.y)?.cityObject || null;
      const tied = renderer.pickClientPoint(clientCenter.x + 12, clientCenter.y)?.cityObject || null;
      second.x = first.x;
      second.y = first.y;
      renderer.refreshObjectPickingIndex();
      renderer.cityPickCycle = {key: "", index: -1};
      const overlap = [
        renderer.pickClientPoint(clientCenter.x, clientCenter.y, {cycleCities: true})?.cityObject?.id ?? null,
        renderer.pickClientPoint(clientCenter.x, clientCenter.y, {cycleCities: true})?.cityObject?.id ?? null
      ];
      return {radiusCssPx: 18, boundary, denseScale: 0.35, denseDistanceCssPx: 24, nearestId: nearest?.id ?? null, tieId: tied?.id ?? null, firstId: first.id, secondId: second.id, overlap};
    } finally {
      for (const saved of savedPositions) {
        saved.city.x = saved.x;
        saved.city.y = saved.y;
      }
      Object.assign(renderer.camera, savedCamera);
      renderer.refreshObjectPickingIndex();
      renderer.cityPickCycle = {key: "", index: -1};
    }
  });

  for (const sample of result.boundary) {
    assert.equal(sample.hitId, result.firstId, `${cellsTarget} / ${sample.scale}x 的 17.5px 热区未命中目标城镇`);
    assert.notEqual(sample.missId, result.firstId, `${cellsTarget} / ${sample.scale}x 的 18.5px 仍命中目标城镇`);
    assert(Math.abs(Number(sample.hitDistance) - 17.5) < 0.01, `${cellsTarget} / ${sample.scale}x 的屏幕距离计算漂移`);
  }
  assert.equal(result.nearestId, result.secondId, `${cellsTarget} 远景密集热区未选择离鼠标最近的城镇`);
  assert.equal(result.tieId, Math.min(result.firstId, result.secondId), `${cellsTarget} 等距城镇未按稳定 ID 选择`);
  assert.deepEqual(result.overlap, [result.firstId, result.secondId], `${cellsTarget} 完全重合城镇未保留循环选择`);
  return result;
}

async function findExpandedMoveFixture(page) {
  return page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const map = app.map;
    const renderer = app.renderer;
    const rect = renderer.canvas.getBoundingClientRect();
    const cities = (map.settlements?.cities || []).filter(city => city && !city.removed && Number(city.id) > 0);
    for (const city of cities) {
      const center = renderer.worldToScreen(city.x, city.y, rect);
      const clientCenter = {x: rect.left + center.x, y: rect.top + center.y};
      for (let index = 0; index < 32; index++) {
        const angle = index / 32 * Math.PI * 2;
        const start = {x: clientCenter.x + Math.cos(angle) * 17.5, y: clientCenter.y + Math.sin(angle) * 17.5};
        if (Number(renderer.pickClientPoint(start.x, start.y)?.cityObject?.id) !== Number(city.id)) continue;
        return {cityId: city.id, center: clientCenter, start};
      }
    }
    throw new Error("找不到可从 17.5px 热区边缘起手的城镇");
  });
}

async function verifyExpandedMoveActivation(page, cellsTarget, fixture) {
  await dispatchCityPointer(page, "pointerdown", fixture.start, {buttons: 1});
  await page.evaluate(() => window.__cityPickingPhaseMarks.push({label: "pointerdown", time: performance.now()}));
  await page.waitForFunction(cityId => Number(window.__webglGeneratorApp.cityEdit.activeDrag?.cityId) === Number(cityId), fixture.cityId);
  await page.evaluate(async ({start}) => {
    const canvas = window.__webglGeneratorApp.renderer.canvas;
    for (let index = 1; index <= 60; index++) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      canvas.dispatchEvent(new PointerEvent("pointermove", {
        bubbles: true,
        cancelable: true,
        pointerId: 307,
        pointerType: "mouse",
        isPrimary: true,
        button: -1,
        buttons: 1,
        clientX: start.x + Math.cos(index / 8) * 4,
        clientY: start.y + Math.sin(index / 8) * 4
      }));
    }
  }, fixture);
  await page.evaluate(() => window.__cityPickingPhaseMarks.push({label: "pointermoves", time: performance.now()}));
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.__cityPickingPhaseMarks.push({label: "canceled", time: performance.now()}));
  await dispatchCityPointer(page, "pointerup", fixture.start, {buttons: 0});
  await page.waitForFunction(() => {
    const app = window.__webglGeneratorApp;
    return !app.cityEdit.activeDrag && !app.cityEdit.movePending && !app.renderer.getStats().cityMoveGhost.active && app.canvasToolModes.getSnapshot().active === null;
  });
  return {cityId: fixture.cityId, startOffsetCssPx: 17.5, pointerMoves: 60, canceled: true, cellsTarget};
}

async function prepareExpandedMoveMode(page, fixture) {
  await page.evaluate(cityId => {
    const app = window.__webglGeneratorApp;
    app.selectionStore.setSelection({object: {kind: "city", id: cityId}});
    app.panels.city.open(app.map, {object: {kind: "city", id: cityId}}, app.editHistory.getStats());
    app.panels.city.setSelectedCityId(cityId);
  }, fixture.cityId);
  const moveButton = page.locator('.floating-panel[data-panel-id="city-panel"]:not(.hidden) [data-action-id="CityPanel:move"]');
  await moveButton.waitFor({state: "visible"});
  await moveButton.click();
  await page.waitForFunction(cityId => {
    const app = window.__webglGeneratorApp;
    return app.canvasToolModes.getSnapshot().active?.id === "city:move" && Number(app.cityEdit.moveCityId) === Number(cityId);
  }, fixture.cityId);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function dispatchCityPointer(page, type, point, {buttons}) {
  await page.evaluate(({type, point, buttons}) => {
    const canvas = window.__webglGeneratorApp.renderer.canvas;
    const capture = canvas.setPointerCapture;
    canvas.setPointerCapture = () => {};
    try {
      canvas.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 307,
        pointerType: "mouse",
        isPrimary: true,
        button: type === "pointerdown" ? 0 : -1,
        buttons,
        clientX: point.x,
        clientY: point.y
      }));
    } finally {
      canvas.setPointerCapture = capture;
    }
  }, {type, point, buttons});
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
