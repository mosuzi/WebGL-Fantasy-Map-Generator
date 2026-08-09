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
const timeoutMs = 240000;
const vite = await createViteServer({configFile: join(rootDir, "vite.config.mjs"), server: {host, port: 0}, logLevel: "error"});
let browser;
let context;

try {
  await vite.listen();
  const port = vite.httpServer.address().port;
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  context = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1});
  await context.addInitScript(() => localStorage.clear());
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  const applicationErrors = [];
  const pageErrors = [];
  page.on("console", message => {
    if (message.type() === "error" && !message.text().startsWith("[FMG health]")) applicationErrors.push(message.text());
  });
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(`http://${host}:${port}/?debug=1&healthClear=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, timeoutMs);

  const report = await page.evaluate(async () => {
    const api = window.webglGeneratorApi;
    const app = window.__webglGeneratorApp;
    const command = {confirm: true, seed: "searoute-locality-browser", cellsTarget: 6000, heightmapTemplate: "continents"};
    const stages = {};
    const create = await api.generate.newMap(command);
    if (!create?.ok) throw new Error(`生成固定地图失败：${JSON.stringify(create?.error || create)}`);
    await nextFrames();
    stages.initial = audit();

    const cities = await api.generate.regenerate("cities", {confirm: true});
    if (!cities?.ok || !cities.data?.executed) throw new Error(`重生成城镇失败：${JSON.stringify(cities?.error || cities)}`);
    await nextFrames();
    stages.afterCities = audit();

    const rivers = await api.generate.regenerate("rivers", {confirm: true});
    if (!rivers?.ok || !rivers.data?.executed) throw new Error(`重生成河流失败：${JSON.stringify(rivers?.error || rivers)}`);
    await nextFrames();
    stages.afterRivers = audit();
    const renderer = app.renderer.getStats();
    const glError = app.renderer.gl?.getError?.() ?? 0;
    if ((renderer.draw?.glError || 0) !== 0 || glError !== 0) throw new Error(`WebGL error：${renderer.draw?.glError || glError}`);
    return {stages, renderer: {routeVertexCount: renderer.routeVertexCount, glError: renderer.draw?.glError || glError}};

    function audit() {
      const routes = (app.map.settlements?.routes || []).filter(route => route?.type === "searoute");
      const spans = routes.map(route => {
        const start = route.points?.[0];
        const end = route.points?.at(-1);
        return Math.hypot((end?.[0] ?? 0) - (start?.[0] ?? 0), (end?.[1] ?? 0) - (start?.[1] ?? 0));
      });
      const diagonal = Math.hypot(Number(app.map.options?.graphWidth) || 0, Number(app.map.options?.graphHeight) || 0);
      return {
        routes: routes.length,
        maxEndpointSpan: Number(Math.max(...spans).toFixed(3)),
        maxEndpointSpanRatio: Number((Math.max(...spans) / diagonal).toFixed(4))
      };
    }

    function nextFrames() {
      return new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));
    }
  });

  for (const [stage, audit] of Object.entries(report.stages)) {
    assert(audit.routes > 0, `${stage} 未生成海路`);
    assert(audit.maxEndpointSpanRatio <= 0.15, `${stage} 出现跨世界海路：${JSON.stringify(audit)}`);
  }
  assert.deepEqual(applicationErrors, [], "海路重生成不得产生应用 console error");
  assert.deepEqual(pageErrors, [], "海路重生成不得产生 page error");
  console.log(JSON.stringify({ok: true, ...report, applicationErrors, pageErrors}, null, 2));
} finally {
  if (context) await Promise.race([context.close(), delay(5000)]);
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await vite.close();
}

function delay(milliseconds) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds));
}
