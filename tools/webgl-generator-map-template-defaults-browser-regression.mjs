#!/usr/bin/env node
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createHash} from "node:crypto";
import {createRequire} from "node:module";
import {mkdirSync, statSync, writeFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "source", "Fantasy-Map-Generator");
const dist = join(root, "dist", "webgl-generator");
const artifactDir = join(root, "work", "task324-map-template-defaults");
const screenshotDir = join(artifactDir, "screenshots");
const host = "127.0.0.1";
const port = 5565;
const performanceTypes = new Set(["operation-stall", "main-thread-long-task", "render-frame-gap", "input-handler-stall"]);
const playwright = createRequire(join(source, "package.json"))("playwright");
const server = spawn(process.execPath, [join(root, "tools", "serve-prototype.mjs"), "--host", host, "--port", String(port), "--dir", dist], {stdio: "ignore"});
let browser;
let context;

mkdirSync(screenshotDir, {recursive: true});

try {
  await waitForServer(server);
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  context = await browser.newContext({viewport: {width: 1280, height: 820}, deviceScaleFactor: 1});
  const page = await context.newPage();
  page.setDefaultTimeout(300_000);
  const resourceRequests = [];
  const consoleErrors = [];
  const pageErrors = [];
  page.on("request", request => /\/assets\/map-templates\/.*\.(?:json|bin)$/u.test(request.url()) && resourceRequests.push(request.url().split("/").pop()));
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(`http://${host}:${port}?healthClear=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 300_000);

  const catalog = await page.evaluate(() => window.webglGeneratorApi.generate.listMapTemplates());
  assert.equal(catalog.ok, true);
  assert.equal(catalog.data.length, 16);
  assert.deepEqual(catalog.data.map(item => item.order), Array.from({length: 16}, (_, index) => index));

  const selectedTemplateId = String(process.env.TASK324_TEMPLATE || "").trim();
  const manifests = selectedTemplateId ? catalog.data.filter(item => item.id === selectedTemplateId) : catalog.data;
  assert(manifests.length > 0, `没有匹配的模板：${selectedTemplateId}`);
  const reports = [];
  for (const manifest of manifests) {
    await page.evaluate(() => window.__webglGeneratorHealth.clear());
    const response = await page.evaluate(async ({templateId, cellsTarget}) => window.webglGeneratorApi.generate.createFromTemplate({
      templateId,
      cellsTarget,
      seed: `task324-default-${templateId}`,
      confirm: true
    }), {templateId: manifest.id, cellsTarget: manifest.recommendedCells[0]});
    assert.equal(response.ok, true, `${manifest.id} 默认规模创建失败：${response.error?.message || "未知错误"}`);
    await page.waitForFunction(templateId => {
      const app = window.__webglGeneratorApp;
      return app?.map?.metadata?.mapTemplate?.id === templateId
        && app.renderer?.map === app.map
        && window.webglGeneratorApi.info.runtimeStats().data.loading.visible === false;
    }, manifest.id);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 100)))));

    const audit = await page.evaluate(expected => {
      const app = window.__webglGeneratorApp;
      if (!app?.map || !app?.renderer) return {probeError: {app: Boolean(app), map: Boolean(app?.map), renderer: Boolean(app?.renderer)}};
      const map = app.map;
      const grid = map.grid;
      const metadata = map.metadata.mapTemplate;
      const summary = window.webglGeneratorApi.info.mapSummary().data;
      const rendererStats = app.renderer.getStats();
      const heights = grid.cells.h;
      const hydrology = grid.cells.templateHydrology;
      const region = grid.cells.templateRegion;
      const political = grid.cells.templatePolitical;
      const evidenceOnlyKinds = new Set(["continuity", "extent", "sea", "historical-region", "historical-capital"]);
      const requiredAnchorIds = expected.protectedAnchors.filter(item => !evidenceOnlyKinds.has(item.kind)).map(item => item.id);
      return {
        id: metadata.id,
        version: metadata.version,
        requestedCells: metadata.requestedCells,
        actualCells: metadata.actualCells,
        checksum: map.metadata.checksum,
        semanticChecksum: metadata.semanticChecksum,
        snapshotYear: metadata.snapshotYear ?? null,
        humanPreset: metadata.humanPreset ?? null,
        protectedAnchors: metadata.protectedAnchors || [],
        degradedAnchors: metadata.degradedAnchors || [],
        requiredAnchorIds,
        lengths: {
          points: grid.points.length,
          heights: heights.length,
          hydrology: hydrology?.length || 0,
          region: region?.length || 0,
          political: political?.length || 0
        },
        finiteHeights: Array.from(heights).every(Number.isFinite),
        land: Array.from(heights).filter(value => value >= 20).length,
        water: Array.from(heights).filter(value => value < 20).length,
        hydrologyCells: Array.from(hydrology || []).filter(Boolean).length,
        declaredHydrologyCells: grid.metadata.mapTemplate?.hydrologyCells,
        regionCells: Array.from(region || []).filter(Boolean).length,
        politicalCells: Array.from(political || []).filter(Boolean).length,
        summary,
        rendererCurrent: app.renderer.map === map,
        glError: rendererStats.draw.glError,
        overlayConnected: [...app.renderer.labelItems, ...app.renderer.markerIconItems, ...app.renderer.militaryIconItems]
          .every(item => item.node?.isConnected),
        visibleTechnicalCopy: ["generation-loading", "operation-loading", "map-toast", "file-operation-status"]
          .map(id => document.getElementById(id)).filter(node => node && !node.hidden && node.getClientRects().length)
          .map(node => node.textContent || "").filter(text => /Worker|线程|消息包|buffer|session|浏览器概念/i.test(text))
      };
    }, manifest);
    assert.equal(audit.probeError, undefined, `${manifest.id} 页面 app 状态不完整：${JSON.stringify(audit.probeError)}`);
    assertTemplateAudit(manifest, audit);

    const screenshotPath = join(screenshotDir, `${String(manifest.order + 1).padStart(2, "0")}-${manifest.id}.png`);
    await page.locator(".map-stage").screenshot({path: screenshotPath, animations: "disabled"});
    const screenshotSize = statSync(screenshotPath).size;
    assert(screenshotSize > 10_000, `${manifest.id} 固定视口截图异常为空`);
    const screenshotChecksum = createHash("sha256").update(await import("node:fs/promises").then(module => module.readFile(screenshotPath))).digest("hex");

    const health = await page.evaluate(() => window.__webglGeneratorHealth.getEvents(500));
    const longTasks = health.filter(event => event.type === "main-thread-long-task")
      .map(event => event.detail?.durationMs).filter(Number.isFinite);
    const healthErrors = health.filter(event => event.severity === "error" && !performanceTypes.has(event.type));
    assert(longTasks.every(duration => duration <= 200), `${manifest.id} 出现超过登记上限的 LongTask：${longTasks.join(", ")}`);
    assert.deepEqual(healthErrors, [], `${manifest.id} 出现非性能 health 错误`);
    reports.push({
      id: manifest.id,
      name: manifest.name,
      requestedCells: audit.requestedCells,
      actualCells: audit.actualCells,
      checksum: audit.checksum,
      semanticChecksum: audit.semanticChecksum,
      snapshotYear: audit.snapshotYear,
      protectedAnchors: audit.protectedAnchors,
      summary: audit.summary,
      screenshot: {path: screenshotPath, bytes: screenshotSize, sha256: screenshotChecksum},
      longTasks
    });
  }

  const expectedResourceRequests = [...new Set(manifests.flatMap(manifest => Object.values(manifest.resourceKeys)
    .filter(Boolean)
    .flatMap(resourceId => [`${resourceId}.bin`, `${resourceId}.json`])))].sort();
  assert.deepEqual(resourceRequests.sort(), expectedResourceRequests);
  assert.deepEqual(pageErrors, []);
  const unexpectedConsole = consoleErrors.filter(message => ![...performanceTypes].some(type => message.includes(`[FMG health] ${type}`)));
  assert.deepEqual(unexpectedConsole, []);

  const result = {ok: true, viewport: {width: 1280, height: 820, deviceScaleFactor: 1}, resourceRequests, reports};
  writeFileSync(join(artifactDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ok: true, templates: reports.length, screenshots: reports.length, resourceRequests, maxLongTaskMs: Math.max(0, ...reports.flatMap(item => item.longTasks))}, null, 2));
} finally {
  if (context) await Promise.race([context.close(), delay(5000)]);
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  server.kill();
  await Promise.race([new Promise(done => server.once("exit", done)), delay(5000)]);
}

function assertTemplateAudit(manifest, audit) {
  assert.equal(audit.id, manifest.id);
  assert.equal(audit.version, manifest.version);
  assert.equal(audit.requestedCells, manifest.recommendedCells[0]);
  assert(audit.actualCells > 0 && audit.actualCells <= 100_000);
  assert.equal(audit.lengths.points, audit.actualCells);
  for (const [key, length] of Object.entries(audit.lengths)) assert.equal(length, audit.actualCells, `${manifest.id} ${key} 长度不一致`);
  assert.equal(audit.finiteHeights, true);
  assert(audit.land > 0, `${manifest.id} 缺少陆地`);
  assert(audit.water > 0, `${manifest.id} 缺少水域`);
  assert.equal(audit.hydrologyCells, audit.declaredHydrologyCells, `${manifest.id} canonical 水文统计不同源`);
  assert(audit.regionCells > 0, `${manifest.id} 缺少区域掩膜`);
  assert.deepEqual([...audit.protectedAnchors].sort(), [...audit.requiredAnchorIds].sort(), `${manifest.id} 默认规模未保护全部锚点`);
  assert.deepEqual(audit.degradedAnchors, []);
  assert.equal(audit.snapshotYear, manifest.snapshotYear);
  assert.equal(Boolean(audit.humanPreset), manifest.category === "historical");
  if (manifest.category === "historical") assert(audit.politicalCells > 0, `${manifest.id} 缺少历史政治掩膜`);
  else assert.equal(audit.politicalCells, 0, `${manifest.id} 普通地理模板意外写入历史政治掩膜`);
  assert.equal(audit.summary.gridCells, audit.actualCells);
  assert(audit.summary.packCells > 0 && audit.summary.features > 0 && audit.summary.states > 0);
  assert.equal(audit.rendererCurrent, true);
  assert.equal(audit.glError, 0);
  assert.equal(audit.overlayConnected, true);
  assert.deepEqual(audit.visibleTechnicalCopy, []);
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
  return new Promise(resolve => setTimeout(resolve, ms));
}
