#!/usr/bin/env node
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createServer as createViteServer} from "vite";
import {normalizeOptions} from "../app/webgl-generator/src/generator/options.js";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const host = "127.0.0.1";
const timeoutMs = 240000;

const vite = await createViteServer({configFile: join(rootDir, "vite.config.mjs"), server: {host, port: 0}, logLevel: "error"});
let browser;
try {
  await vite.listen();
  const port = vite.httpServer.address().port;
  const baseUrl = `http://${host}:${port}`;
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  const context = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1});
  await context.addInitScript(() => localStorage.clear());
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  const applicationErrors = [];
  const healthConsole = [];
  const pageErrors = [];
  page.on("console", message => {
    if (message.type() !== "error") return;
    if (message.text().startsWith("[FMG health]")) healthConsole.push(message.text());
    else applicationErrors.push(message.text());
  });
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(`${baseUrl}/?debug=1&healthClear=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, timeoutMs);
  await waitForMapReady(page);

  const reports = [];
  const scenarios = [
    {cellsTarget: 10000, seed: "304-river-network-lab-10000", generationOptions: formalGenerationOptions("304-river-network-lab-10000", 10000)},
    {cellsTarget: 50000, seed: "314-residual-50000-0", generationOptions: normalizeOptions({seed: "314-residual-50000-0", cellsTarget: 50000, heightmapTemplate: "continents"})},
    {cellsTarget: 100000, seed: "304-river-network-lab-100000", generationOptions: formalGenerationOptions("304-river-network-lab-100000", 100000)}
  ];
  for (const {cellsTarget, seed, generationOptions} of scenarios) {
    await clearHealth(page);
    healthConsole.length = 0;
    const generated = await page.evaluate(async generationOptions => {
      const response = await window.webglGeneratorApi.generate.newMap({
        confirm: true,
        ...generationOptions
      });
      if (!response?.ok) throw new Error(`正式生成失败：${JSON.stringify(response?.error || response)}`);
      return response.data;
    }, generationOptions);
    assert.ok(generated, `${cellsTarget} 正式生成没有返回结果`);
    await waitForMapReady(page);
    await delay(1000);
    const generationHealth = await readHealthErrors(page);
    const unexpectedGenerationHealth = generationHealth.filter(event => !["main-thread-long-task", "operation-stall", "render-frame-gap"].includes(event.type));
    assert.deepEqual(unexpectedGenerationHealth, [], `${cellsTarget} 正式生成出现非已登记性能 health error`);

    await clearHealth(page);
    healthConsole.length = 0;
    const report = await inspectFormalMap(page, cellsTarget);
    await delay(500);
    const activeHealth = await readHealthErrors(page);
    assert.deepEqual(activeHealth, [], `${cellsTarget} 正式候选渲染 / 导出产生 active health error`);
    assert.deepEqual(healthConsole, [], `${cellsTarget} 正式候选产生迟到 health console error`);
    reports.push({...report, generationHealth: summarizeHealth(generationHealth), activeHealth});
  }

  assert.deepEqual(applicationErrors, [], "正式河网候选不得产生 application console error");
  assert.deepEqual(pageErrors, [], "正式河网候选不得产生 page error");
  console.log(JSON.stringify({ok: true, reports, applicationErrors, pageErrors}, null, 2));
  await context.close();
} finally {
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await vite.close();
}

async function inspectFormalMap(page, cellsTarget) {
  return page.evaluate(async target => {
    const pointSegmentDistance = (point, start, end) => {
      const dx = end[0] - start[0];
      const dy = end[1] - start[1];
      const lengthSquared = dx * dx + dy * dy;
      const ratio = lengthSquared ? Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared)) : 0;
      return Math.hypot(point[0] - (start[0] + ratio * dx), point[1] - (start[1] + ratio * dy));
    };
    const closestPolylineDistance = (point, points) => Math.min(...points.slice(1).map((end, index) => pointSegmentDistance(point, points[index], end)));
    const auditTopology = (rivers, cells) => {
      const byId = new Map(rivers.map(river => [Number(river.id ?? river.i), river]));
      let missingParents = 0;
      let selfParents = 0;
      let disconnectedParents = 0;
      let disconnectedPaths = 0;
      let cycles = 0;
      for (const river of rivers) {
        const id = Number(river.id ?? river.i);
        for (let index = 0; index < (river.cells?.length || 0) - 1; index++) {
          const from = river.cells[index];
          const to = river.cells[index + 1];
          if (to === -1 && index === river.cells.length - 2 && Number(cells.b?.[from])) continue;
          if (!(cells.c?.[from] || []).includes(to)) disconnectedPaths += 1;
        }
        if (!river.parent) continue;
        if (Number(river.parent) === id) selfParents += 1;
        const parent = byId.get(Number(river.parent));
        if (!parent) {
          missingParents += 1;
          continue;
        }
        const confluence = parent.cells.lastIndexOf(river.mouth);
        if (confluence < 0 || confluence >= parent.cells.length - 1) disconnectedParents += 1;
        const seen = new Set([id]);
        let current = parent;
        while (current?.parent) {
          if (seen.has(Number(current.id ?? current.i))) {
            cycles += 1;
            break;
          }
          seen.add(Number(current.id ?? current.i));
          current = byId.get(Number(current.parent));
        }
      }
      return {missingParents, selfParents, disconnectedParents, disconnectedPaths, cycles};
    };
    const app = window.__webglGeneratorApp;
    const api = window.webglGeneratorApi;
    const rivers = app.map.rivers.rivers;
    const metadata = structuredClone(app.map.rivers.metadata.networkCandidate);
    if (metadata?.status !== "accepted" || metadata?.accepted !== true) throw new Error(`正式候选未接受：${JSON.stringify(metadata)}`);
    if (metadata.rejectedRelations !== 0 || metadata.dischargeViolations !== 0 || metadata.widthViolations !== 0) {
      throw new Error(`正式候选仍有拒绝或越级：${JSON.stringify(metadata)}`);
    }
    const topology = auditTopology(rivers, app.map.pack.cells);
    if (Object.values(topology).some(Boolean)) throw new Error(`正式候选改坏 canonical 河网：${JSON.stringify(topology)}`);

    const confluenceGaps = rivers
      .filter(river => Number(river.parent) > 0)
      .map(child => {
        const parent = rivers.find(river => Number(river.id ?? river.i) === Number(child.parent));
        return {
          childId: Number(child.id ?? child.i),
          parentId: Number(child.parent),
          distance: parent && child.points?.length ? closestPolylineDistance(child.points.at(-1), parent.points || []) : Number.POSITIVE_INFINITY
        };
      });
    const maxConfluenceGap = Math.max(0, ...confluenceGaps.map(relation => relation.distance));
    if (maxConfluenceGap > 1e-6) {
      const relation = confluenceGaps.find(item => item.distance === maxConfluenceGap);
      throw new Error(`正式候选仍有声明支流未接入干流：${JSON.stringify(relation)}`);
    }

    let known = null;
    let pick = null;
    if (target === 100000) {
      const child = rivers.find(river => Number(river.id) === 760);
      const parent = rivers.find(river => Number(river.id) === Number(child?.parent));
      if (!child || child.parent !== 5 || !parent) throw new Error("100k 已知正式汇流关系缺失");
      const distance = closestPolylineDistance(child.points.at(-1), parent.points);
      if (distance > 1e-6 || metadata.appliedCurves < 1) throw new Error(`100k 正式汇流仍未接入：${distance}`);
      const probePoint = child.points.at(-2);
      const rect = app.renderer.canvas.getBoundingClientRect();
      const screen = app.renderer.worldToScreen(probePoint[0], probePoint[1], rect);
      const previousVisibility = {...app.renderer.layerVisibility};
      for (const layer of ["cities", "population", "labels", "stateLabels", "provinceLabels", "zoneLabels", "markers", "resources", "military", "routes", "tradeFlows"]) {
        if (layer in app.renderer.layerVisibility) app.renderer.layerVisibility[layer] = false;
      }
      pick = app.renderer.pickClientPoint(rect.left + screen.x, rect.top + screen.y)?.object || null;
      Object.assign(app.renderer.layerVisibility, previousVisibility);
      if (pick?.kind !== "river") throw new Error(`100k 新汇流曲线无法拾取：${JSON.stringify(pick)}`);
      known = {childId: child.id, parentId: child.parent, points: child.points.length, distance, pick};
    } else if (target === 50000) {
      const child = rivers.find(river => Number(river.id ?? river.i) === 279);
      const parent = rivers.find(river => Number(river.id ?? river.i) === Number(child?.parent));
      if (!child || Number(child.parent) !== 283 || !parent) throw new Error("50k 真实残余汇流关系缺失");
      const distance = closestPolylineDistance(child.points.at(-1), parent.points);
      if (distance > 1e-6) throw new Error(`50k 真实残余汇流仍未接入：${distance}`);
      known = {childId: Number(child.id ?? child.i), parentId: Number(child.parent), points: child.points.length, distance};
    }

    const png = await api.data.exportPNG({download: false, pixelScale: 1, includeDataUrl: false});
    if (!png?.ok || png.data?.mimeType !== "image/png" || !(png.data?.bytes > 0)) throw new Error(`PNG 导出失败：${JSON.stringify(png?.error || png?.data)}`);
    const geojson = api.data.exportFeatureGEO({download: false, includeText: true, layers: {river: true}});
    if (!geojson?.ok || !(geojson.data?.bytes > 0) || !(geojson.data?.metadata?.features > 0)) throw new Error(`GeoJSON 导出失败：${JSON.stringify(geojson?.error || geojson?.data)}`);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const renderer = app.renderer.getStats();
    const directGlError = app.renderer.gl?.getError?.() ?? 0;
    if ((renderer.draw?.glError || 0) !== 0 || directGlError !== 0) throw new Error(`WebGL error：${renderer.draw?.glError || directGlError}`);
    return {
      cellsTarget: target,
      rivers: rivers.length,
      metadata,
      topology,
      confluenceRelations: confluenceGaps.length,
      maxConfluenceGap,
      known,
      png: {bytes: png.data.bytes, mimeType: png.data.mimeType},
      geojson: {bytes: geojson.data.bytes, features: geojson.data.metadata.features},
      renderer: {riverVertexCount: renderer.riverVertexCount, riverTriangles: renderer.riverTriangleCount, glError: renderer.draw?.glError || directGlError}
    };
  }, cellsTarget);
}

async function waitForMapReady(page) {
  await page.waitForFunction(() => window.webglGeneratorApi?.info?.mapSummary?.()?.data?.ready === true);
  await page.waitForFunction(() => document.getElementById("app-loading-screen")?.hidden === true);
}

async function clearHealth(page) {
  await page.evaluate(() => {
    window.__webglGeneratorApp?.healthMonitor?.clear?.();
    window.__webglGeneratorHealth?.clear?.();
    window.__webglGeneratorDebug?.clearHealthEvents?.();
  });
}

async function readHealthErrors(page) {
  return page.evaluate(() => (window.__webglGeneratorHealth?.getEvents?.(240) || [])
    .filter(event => event.severity === "error")
    .map(event => ({type: event.type, severity: event.severity, durationMs: event.detail?.durationMs || null, operation: event.detail?.operation || null})));
}

function summarizeHealth(events) {
  return events.map(event => ({type: event.type, durationMs: event.durationMs, operation: event.operation}));
}

function formalGenerationOptions(seed, cellsTarget) {
  return {
    seed,
    randomSeed: false,
    cellsTarget,
    heightmapTemplate: "continents",
    graphWidth: 1440,
    graphHeight: 960,
    statesNumber: 25,
    provincesRatio: 20,
    religionsNumber: 6,
    culturesNumber: 13,
    culturesSet: "highFantasy",
    culturesSetMax: 17,
    sizeVariety: 7.5,
    growthRate: 1.4,
    cultureInheritanceMode: "branching",
    religionInheritanceMode: "branching",
    climateLatitudeMode: "auto",
    climateLatitudeCenter: 0,
    climateLatitudeSpan: 45,
    climateMapSizePercent: 25,
    climateLatitudeRangePercent: 25,
    climateLongitudeRangePercent: 25,
    atmosphereDirection: "auto",
    winds: [225, 45, 225, 315, 135, 315],
    temperatureEquator: 27,
    temperatureNorthPole: -18,
    temperatureSouthPole: -13,
    heightExponent: 2,
    precipitation: 74
  };
}

function delay(ms) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms));
}
