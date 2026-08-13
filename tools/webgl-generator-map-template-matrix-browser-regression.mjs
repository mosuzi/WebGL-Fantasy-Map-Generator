#!/usr/bin/env node
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createRequire} from "node:module";
import {mkdirSync, writeFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "source", "Fantasy-Map-Generator");
const dist = join(root, "dist", "webgl-generator");
const artifactDir = join(root, "work", "task324-map-template-matrix");
const host = "127.0.0.1";
const port = 5566;
const baseUrl = `http://${host}:${port}`;
const templateIds = ["world", "china", "east-asia", "australia-oceania", "holy-roman-empire-1789", "roman-empire-117"];
const targets = [10_000, 100_000];
const selectedTemplateId = String(process.env.TASK324_MATRIX_TEMPLATE || "").trim();
const selectedCellsTarget = Number(process.env.TASK324_MATRIX_CELLS || 0);
const selectedTemplateIds = selectedTemplateId ? templateIds.filter(id => id === selectedTemplateId) : templateIds;
const selectedTargets = selectedCellsTarget ? targets.filter(target => target === selectedCellsTarget) : targets;
const performanceTypes = new Set(["operation-stall", "main-thread-long-task", "render-frame-gap", "input-handler-stall"]);
const playwright = createRequire(join(source, "package.json"))("playwright");
const server = spawn(process.execPath, [join(root, "tools", "serve-prototype.mjs"), "--host", host, "--port", String(port), "--dir", dist], {stdio: "ignore"});
let browser;
let context;

mkdirSync(artifactDir, {recursive: true});

try {
  await waitForServer(server);
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  context = await browser.newContext({viewport: {width: 1280, height: 820}, deviceScaleFactor: 1});
  const reports = [];

  assert(selectedTemplateIds.length && selectedTargets.length, "E2 筛选没有匹配案例");
  for (const templateId of selectedTemplateIds) {
    for (const cellsTarget of selectedTargets) {
      const report = await runCase(context, {templateId, cellsTarget});
      reports.push(report);
      writeFileSync(join(artifactDir, "result.partial.json"), `${JSON.stringify({reports}, null, 2)}\n`);
    }
  }

  assert.equal(reports.length, selectedTemplateIds.length * selectedTargets.length);
  assert.deepEqual(reports.map(item => `${item.templateId}:${item.requestedCells}`), selectedTemplateIds.flatMap(id => selectedTargets.map(target => `${id}:${target}`)));
  const result = {
    ok: true,
    viewport: {width: 1280, height: 820, deviceScaleFactor: 1},
    reports,
    registeredLongTasks: reports.flatMap(item => item.longTasks.map(durationMs => ({templateId: item.templateId, cellsTarget: item.requestedCells, durationMs})))
  };
  writeFileSync(join(artifactDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({
    ok: true,
    cases: reports.length,
    pngExports: reports.filter(item => item.png).length,
    geoJsonExports: reports.filter(item => item.geoJson).length,
    roundtrips: reports.filter(item => item.roundtrip).length,
    registeredLongTasks: result.registeredLongTasks
  }, null, 2));
} finally {
  if (context) await Promise.race([context.close(), delay(5000)]);
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  server.kill();
  await Promise.race([new Promise(done => server.once("exit", done)), delay(5000)]);
}

async function runCase(browserContext, {templateId, cellsTarget}) {
  const page = await browserContext.newPage();
  page.setDefaultTimeout(420_000);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));

  try {
    await page.goto(`${baseUrl}?healthClear=1`, {waitUntil: "domcontentloaded"});
    await waitForApiReady(page, 300_000);
    await page.evaluate(() => window.__webglGeneratorHealth.clear());
    const consoleStart = consoleErrors.length;
    const operationStartedAt = await page.evaluate(() => performance.now());
    const response = await page.evaluate(async input => window.webglGeneratorApi.generate.createFromTemplate({...input, confirm: true}), {
      templateId,
      cellsTarget,
      seed: `task324-matrix-${templateId}-${cellsTarget}`
    });
    assert.equal(response.ok, true, `${templateId}/${cellsTarget} 创建失败：${response.error?.message || "未知错误"}`);
    await page.waitForFunction(expected => {
      const app = window.__webglGeneratorApp;
      return app?.map?.metadata?.mapTemplate?.id === expected.templateId
        && app.map.metadata.mapTemplate.requestedCells === expected.cellsTarget
        && app.renderer?.map === app.map
        && window.webglGeneratorApi.info.runtimeStats().data.loading.visible === false;
    }, {templateId, cellsTarget});
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 100)))));
    const operationSettledAt = await page.evaluate(() => performance.now());

    const audit = await page.evaluate(async ({templateId: expectedId, cellsTarget: expectedCells}) => {
      const app = window.__webglGeneratorApp;
      const api = window.webglGeneratorApi;
      const map = app.map;
      const renderer = app.renderer;
      const metadata = map.metadata.mapTemplate;
      const rect = renderer.canvas.getBoundingClientRect();
      let picking = null;
      for (const city of map.settlements.cities || []) {
        if (!city || city.removed) continue;
        const point = renderer.worldToScreen(city.x, city.y, rect);
        const hit = renderer.pickClientPoint(rect.left + point.x, rect.top + point.y)?.cityObject;
        if (Number(hit?.id) !== Number(city.id)) continue;
        picking = {expectedId: city.id, actualId: hit.id};
        break;
      }

      let png = null;
      let geoJson = null;
      const phases = {auditStartedAt: performance.now()};
      if (expectedCells === 100_000) {
        phases.pngStartedAt = performance.now();
        const pngResponse = await api.data.exportPNG({includeDataUrl: false, pixelScale: 1});
        phases.pngEndedAt = performance.now();
        phases.geoJsonStartedAt = performance.now();
        const geoResponse = await api.data.exportGEO({includeText: false});
        phases.geoJsonEndedAt = performance.now();
        png = pngResponse.ok ? pngResponse.data : {error: pngResponse.error};
        geoJson = geoResponse.ok ? geoResponse.data : {error: geoResponse.error};
      }

      let roundtrip = null;
      if (expectedId === "china" && expectedCells === 100_000) {
        phases.roundtripStartedAt = performance.now();
        const exported = api.data.exportMap({includeText: true});
        const beforeChecksum = map.metadata.checksum;
        const imported = await api.data.importMap(exported.data.text, {confirm: true});
        roundtrip = {
          exportedOk: exported.ok,
          importedOk: imported.ok,
          checksumSame: app.map.metadata.checksum === beforeChecksum,
          templateId: app.map.metadata.mapTemplate?.id,
          requestedCells: app.map.metadata.mapTemplate?.requestedCells,
          rendererCurrent: app.renderer.map === app.map
        };
        phases.roundtripEndedAt = performance.now();
      }

      const currentMap = app.map;
      const currentMetadata = currentMap.metadata.mapTemplate;
      const stats = app.renderer.getStats();
      return {
        templateId: currentMetadata.id,
        version: currentMetadata.version,
        snapshotYear: currentMetadata.snapshotYear ?? null,
        requestedCells: currentMetadata.requestedCells,
        actualCells: currentMap.grid.points.length,
        metadataActualCells: currentMetadata.actualCells,
        sourceChecksum: currentMetadata.sourceChecksum,
        protectedAnchors: currentMetadata.protectedAnchors || [],
        degradedAnchors: currentMetadata.degradedAnchors || [],
        land: Array.from(currentMap.grid.cells.h).filter(value => value >= 20).length,
        water: Array.from(currentMap.grid.cells.h).filter(value => value < 20).length,
        rendererCurrent: app.renderer.map === currentMap,
        glError: stats.draw.glError,
        picking,
        png,
        geoJson,
        roundtrip,
        phases: {...phases, auditEndedAt: performance.now()},
        rendererPerformance: app.renderer.getPerformanceEvents({includeRecent: true}),
        loading: api.info.runtimeStats().data.loading,
        visibleTechnicalCopy: ["generation-loading", "operation-loading", "map-toast", "file-operation-status"]
          .map(id => document.getElementById(id)).filter(node => node && !node.hidden && node.getClientRects().length)
          .map(node => node.textContent || "").filter(text => /Worker|线程|消息包|buffer|session|浏览器概念/i.test(text))
      };
    }, {templateId, cellsTarget});

    assert.equal(audit.templateId, templateId);
    assert.equal(audit.requestedCells, cellsTarget);
    assert.equal(audit.actualCells, audit.metadataActualCells);
    assert(audit.actualCells > 0 && audit.actualCells <= 100_000);
    assert(audit.land > 0 && audit.water > 0);
    assert.match(audit.sourceChecksum, /^[0-9a-f]{64}$/u);
    assert.deepEqual(audit.degradedAnchors, []);
    assert.equal(audit.rendererCurrent, true);
    assert.equal(audit.glError, 0);
    assert(audit.picking && Number(audit.picking.actualId) === Number(audit.picking.expectedId), `${templateId}/${cellsTarget} 缺少真实城镇 picking 命中`);
    assert.deepEqual(audit.visibleTechnicalCopy, []);
    assert.equal(audit.loading.visible, false);
    if (templateId === "holy-roman-empire-1789") assert.equal(audit.snapshotYear, 1789);
    else if (templateId === "roman-empire-117") assert.equal(audit.snapshotYear, 117);
    else assert.equal(audit.snapshotYear, null);
    if (cellsTarget === 100_000) {
      assert(audit.png?.bytes > 10_000 && audit.png.width > 0 && audit.png.height > 0, `${templateId} PNG 导出异常`);
      assert(audit.geoJson?.bytes > 1000 && audit.geoJson.metadata?.features > 0, `${templateId} GeoJSON 导出异常`);
    }
    if (audit.roundtrip) assert.deepEqual(audit.roundtrip, {
      exportedOk: true,
      importedOk: true,
      checksumSame: true,
      templateId: "china",
      requestedCells: 100_000,
      rendererCurrent: true
    });

    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 100)))));
    const health = await page.evaluate(() => window.__webglGeneratorHealth.getEvents(1000));
    const longTasks = health.filter(event => event.type === "main-thread-long-task").map(event => event.detail?.durationMs).filter(Number.isFinite);
    const healthErrors = health.filter(event => event.severity === "error" && !performanceTypes.has(event.type));
    const unexpectedConsole = consoleErrors.slice(consoleStart).filter(message => ![...performanceTypes].some(type => message.includes(`[FMG health] ${type}`)));
    writeFileSync(join(artifactDir, "case-last.json"), `${JSON.stringify({
      templateId,
      cellsTarget,
      operationStartedAt,
      operationSettledAt,
      workerTelemetry: response.data?.worker?.telemetry || null,
      audit,
      health,
      unexpectedConsole,
      pageErrors
    }, null, 2)}\n`);
    assert(longTasks.every(duration => duration <= 200), `${templateId}/${cellsTarget} 出现超过登记上限的 LongTask：${longTasks.join(", ")}`);
    assert.deepEqual(healthErrors, [], `${templateId}/${cellsTarget} 出现非性能 health 错误`);
    assert.deepEqual(unexpectedConsole, [], `${templateId}/${cellsTarget} 出现 console error`);
    assert.deepEqual(pageErrors, [], `${templateId}/${cellsTarget} 出现 page error`);
    return {...audit, longTasks};
  } finally {
    await Promise.race([page.close(), delay(5000)]);
  }
}

async function waitForServer(child) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`静态服务提前退出：${child.exitCode}`);
    try { if ((await fetch(baseUrl)).ok) return; } catch {}
    await delay(50);
  }
  throw new Error("等待静态服务超时");
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
