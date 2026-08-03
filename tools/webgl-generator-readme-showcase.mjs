#!/usr/bin/env node
import assert from "node:assert/strict";
import {createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {dirname, extname, join, normalize, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {DEFAULT_LAYER_VISIBILITY, DEFAULT_MAX_CITY_LABELS} from "../app/webgl-generator/src/runtime/display-defaults.js";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const distDir = join(rootDir, "dist", "webgl-generator");
const outputDir = join(rootDir, "docs", "assets", "readme");
const reportPath = join(rootDir, "docs", "generated", "reports", "readme-showcase-capture-results.json");
const profileBaseDir = join(rootDir, "tmp");
const host = "127.0.0.1";
const timeoutMs = 180000;
const viewport = Object.freeze({width: 1440, height: 960});
const seed = "mountains-and-seas";
const maxCityLabels = 128;
const controlPreferencesKey = "webgl-generator-control-preferences";
const injectFailure = process.env.FMG_README_SHOWCASE_FAIL_AFTER_BROWSER === "1";
const baseShowcaseLayers = Object.freeze({
  routes: false,
  tradeFlows: false,
  rivers: false,
  oceanCurrents: false,
  cities: false,
  labels: false,
  stateLabels: false,
  provinceLabels: false,
  population: false,
  markers: false,
  resources: false,
  military: false,
  warFronts: false,
  zones: false,
  zoneEvents: false,
  zoneNatural: false,
  zoneWilderness: false,
  zoneLabels: false,
  measurements: false,
  scaleBar: false,
  mapBadge: false,
  coastline: false,
  lakeShore: false,
  stateBorders: false,
  provinceBorders: false,
  gridCells: false
});
const scenes = Object.freeze([
  Object.freeze({
    id: "relief",
    theme: "default",
    viewMode: "height",
    filename: "showcase-relief-overview.png",
    layers: Object.freeze({...baseShowcaseLayers, rivers: true, scaleBar: true, coastline: true, lakeShore: true}),
    overlays: Object.freeze({labels: false, cityIcons: false})
  }),
  Object.freeze({
    id: "states",
    theme: "atlas",
    viewMode: "states",
    filename: "showcase-atlas-overview.png",
    layers: Object.freeze({...baseShowcaseLayers, routes: true, rivers: true, cities: true, labels: true, stateLabels: true, scaleBar: true, coastline: true, lakeShore: true, stateBorders: true}),
    overlays: Object.freeze({labels: true, cityIcons: true})
  })
]);

assert.ok(existsSync(distDir), `构建产物不存在：${distDir}；请先执行 pnpm run build:app`);
assert.equal(maxCityLabels, DEFAULT_MAX_CITY_LABELS, "README 与产品默认城市标签上限必须同源");
mkdirSync(outputDir, {recursive: true});
mkdirSync(dirname(reportPath), {recursive: true});

const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const chromePath = resolveChromePath();
mkdirSync(profileBaseDir, {recursive: true});
const profileDir = mkdtempSync(join(profileBaseDir, "fmg-readme-showcase-"));
let server = null;
let appPort = null;
let browserContext = null;
let browser = null;
let browserCdp = null;
let report = null;
let outputSummary = null;
let primaryError = null;

try {
  server = await startStaticServer();
  appPort = server.address().port;
  logProgress(`临时服务已启动：${appPort}`);
  browserContext = await playwright.chromium.launchPersistentContext(profileDir, {
    executablePath: chromePath,
    headless: true,
    viewport: null,
    args: [
      `--window-size=${viewport.width},${viewport.height}`,
      "--force-device-scale-factor=1",
      "--no-first-run",
      "--disable-default-apps",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-sync"
    ]
  });
  logProgress("隔离系统 Chrome 已启动");
  browser = browserContext.browser();
  const context = browserContext;
  await context.addInitScript(() => {
    const sentinel = "__fmg_readme_showcase_storage_initialized__";
    if (sessionStorage.getItem(sentinel)) return;
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem(sentinel, "1");
  });
  const page = context.pages()[0] || await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  const consoleErrors = [];
  const performanceConsoleErrors = [];
  const pageErrors = [];
  page.on("console", message => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/\[FMG health\] (?:main-thread-long-task|render-frame-gap)/.test(text)) performanceConsoleErrors.push(text);
    else consoleErrors.push(text);
  });
  page.on("pageerror", error => pageErrors.push(error.message));
  browserCdp = await context.newCDPSession(page);
  await browserCdp.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: viewport.width,
    screenHeight: viewport.height
  });

  await page.goto(`http://${host}:${appPort}/?healthClear=1`, {waitUntil: "domcontentloaded", timeout: timeoutMs});
  await waitForApiReady(page, timeoutMs);
  logProgress("应用 API 已就绪");
  if (injectFailure) throw new Error("README showcase injected failure after browser startup");
  const generation = await page.evaluate(async ({seed, viewport, maxCityLabels}) => {
    const unwrap = (response, label) => {
      if (!response?.ok) throw new Error(`${label}：${response?.error?.message || "失败"}`);
      return response.data;
    };
    unwrap(await window.webglGeneratorApi.generate.newMap({
      confirm: true,
      seed,
      randomSeed: false,
      cellsTarget: 10000,
      graphWidth: viewport.width,
      graphHeight: viewport.height,
      heightmapTemplate: "continents",
      statesNumber: 12,
      provincesRatio: 30
    }), "生成 README 地图");
    const renderer = window.__webglGeneratorApp.renderer;
    const defaults = {
      layers: {...renderer.getStats().layerVisibility},
      maxCityLabels: renderer.getStats().labelOptions.maxCityLabels,
      labelStyleOverrides: structuredClone(window.__webglGeneratorApp.map.labels?.styles?.overrides || {})
    };
    unwrap(window.webglGeneratorApi.layers.setMaxCityLabels(maxCityLabels), "设置城市标签上限");
    unwrap(window.webglGeneratorApi.selection.clear(), "清除选择");
    unwrap(window.webglGeneratorApi.layers.fitView(), "适配视图");
    await document.fonts.ready;
    return {summary: unwrap(window.webglGeneratorApi.info.mapSummary(), "读取地图摘要"), defaults};
  }, {seed, viewport, maxCityLabels});
  assert.deepEqual(generation.defaults.layers, DEFAULT_LAYER_VISIBILITY, "fresh 浏览器的默认图层矩阵漂移");
  assert.equal(generation.defaults.maxCityLabels, DEFAULT_MAX_CITY_LABELS, "fresh 浏览器的默认城市标签上限漂移");
  assert.deepEqual(generation.defaults.labelStyleOverrides, {}, "截图地图写入了地图级标签样式覆盖");
  logProgress("固定地图已生成");

  await waitForStableFrame(page);
  const outputs = [];
  for (const scene of scenes) {
    logProgress(`开始场景：${scene.id}`);
    await page.evaluate(async scene => {
      const unwrap = (response, label) => {
        if (!response?.ok) throw new Error(`${label}：${response?.error?.message || "失败"}`);
        return response.data;
      };
      unwrap(window.webglGeneratorApi.layers.setTheme(scene.theme), `设置主题 ${scene.theme}`);
      unwrap(window.webglGeneratorApi.layers.setViewMode(scene.viewMode), `设置视图 ${scene.viewMode}`);
      for (const [layer, visible] of Object.entries(scene.layers)) {
        unwrap(window.webglGeneratorApi.layers.setVisible(layer, visible), `设置 ${scene.id} 图层 ${layer}`);
      }
      unwrap(window.webglGeneratorApi.layers.fitView(), "适配视图");
      await document.fonts.ready;
    }, scene);
    await page.waitForFunction(layers => {
      const cache = window.__webglGeneratorApp?.renderer?.getStats?.().dynamicMeshCache;
      return cache
        && (!layers.routes || !cache.routesDirty)
        && (!layers.tradeFlows || !cache.tradeFlowsDirty)
        && (!layers.rivers || !cache.riversDirty)
        && !cache.selectionDirty;
    }, scene.layers, {timeout: timeoutMs});
    await waitForStableFrame(page);

    const capture = await page.evaluate(async ({scene, viewport}) => {
      const unwrap = (response, label) => {
        if (!response?.ok) throw new Error(`${label}：${response?.error?.message || "失败"}`);
        return response.data;
      };
      const before = unwrap(window.webglGeneratorApi.info.mapSummary(), "读取导出前摘要");
      const exported = unwrap(await window.webglGeneratorApi.data.exportPNG({
        download: false,
        includeDataUrl: true,
        pixelScale: 1,
        crop: {mode: "viewport", rect: {x: 0, y: 0, width: viewport.width, height: viewport.height}},
        overlays: {
          labels: scene.overlays.labels,
          cityIcons: scene.overlays.cityIcons,
          markers: false,
          military: false,
          measurements: false,
          legend: false,
          scaleBar: true
        }
      }), `导出 ${scene.theme} PNG`);
      const after = unwrap(window.webglGeneratorApi.info.mapSummary(), "读取导出后摘要");
      const renderer = window.__webglGeneratorApp.renderer;
      return {
        before,
        after,
        exported,
        visible: {
          states: document.querySelectorAll(".state-label.visible").length,
          provinces: document.querySelectorAll(".province-label.visible").length,
          cities: document.querySelectorAll(".city-label.visible").length
        },
        layers: {...renderer.getStats().layerVisibility},
        colorMode: renderer.getStats().colorMode
      };
    }, {scene, viewport});
    assert.equal(capture.before.checksum, capture.after.checksum, `${scene.theme} 导出改变了地图 checksum`);
    assert.equal(capture.before.mapRevision, capture.after.mapRevision, `${scene.theme} 导出改变了地图 revision`);
    assert.equal(capture.exported.width, viewport.width, `${scene.theme} PNG 宽度错误`);
    assert.equal(capture.exported.height, viewport.height, `${scene.theme} PNG 高度错误`);
    assert.match(capture.exported.dataUrl, /^data:image\/png;base64,/, `${scene.theme} 未返回 PNG data URL`);
    assert.equal(capture.colorMode, scene.viewMode, `${scene.id} 没有使用冻结视图`);
    assert.deepEqual(capture.layers, scene.layers, `${scene.id} 没有使用完整场景图层矩阵`);
    assert.equal(capture.visible.provinces, 0, `${scene.theme} 仍显示省份标签`);
    if (scene.id === "relief") {
      assert.deepEqual(capture.visible, {states: 0, provinces: 0, cities: 0}, "自然地貌图仍显示政治或城市标签");
      assert.equal(scene.layers.stateBorders, false, "自然地貌图仍显示国界");
    } else {
      assert.ok(capture.visible.states > 0, "国家视角没有显示国家标签");
      assert.ok(capture.visible.cities > 0 && capture.visible.cities <= maxCityLabels, "国家视角城市标签数量失控");
      assert.equal(scene.layers.stateBorders, true, "国家视角没有显示国界");
    }
    const outputPath = join(outputDir, scene.filename);
    writeFileSync(outputPath, Buffer.from(capture.exported.dataUrl.split(",")[1], "base64"));
    const file = inspectPng(outputPath);
    assert.deepEqual({width: file.width, height: file.height}, viewport, `${scene.theme} 文件尺寸错误`);
    outputs.push({id: scene.id, theme: scene.theme, viewMode: scene.viewMode, path: outputPath, ...file, visible: capture.visible});
    logProgress(`场景已导出：${scene.id}`);
  }

  const runtime = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const healthEvents = window.__webglGeneratorHealth?.getEvents?.(500) || app.health?.getEvents?.() || [];
    const isPerformanceEvent = event => /main-thread-long-task|render-frame-gap/.test(`${event.type || ""} ${event.name || ""} ${event.message || ""}`);
    const style = getComputedStyle(document.querySelector(".state-label"));
    return {
      summary: window.webglGeneratorApi.info.mapSummary().data,
      maxCityLabels: app.renderer.getStats().labelOptions.maxCityLabels,
      stateFontFamily: style.fontFamily,
      labelStyleOverrides: structuredClone(app.map.labels?.styles?.overrides || {}),
      performanceEvents: healthEvents.filter(isPerformanceEvent).map(event => ({type: event.type || event.name || "performance", level: event.level || event.severity || "info"})),
      healthErrors: healthEvents.filter(event => !isPerformanceEvent(event) && (event.level === "error" || event.severity === "error")).map(event => event.type || event.message || "error"),
      glError: app.renderer.getStats().draw?.glError ?? document.getElementById("map-canvas")?.getContext?.("webgl2")?.getError?.() ?? 0
    };
  });
  assert.equal(runtime.summary.checksum, generation.summary.checksum, "展示主题切换改变了地图 checksum");
  assert.equal(runtime.summary.mapRevision, generation.summary.mapRevision, "展示主题切换改变了地图 revision");
  assert.equal(runtime.maxCityLabels, maxCityLabels, "展示城市标签上限未生效");
  assert.deepEqual(runtime.labelStyleOverrides, {}, "README 成品写入了地图级标签样式覆盖");
  assert.match(runtime.stateFontFamily, /Noto Sans SC|Source Han Sans SC|Noto Sans CJK SC|Microsoft YaHei/, "国家标签未使用目标中文字体栈");
  assert.deepEqual(runtime.healthErrors, [], "生成过程出现 health error");
  assert.equal(runtime.glError, 0, "生成过程出现 WebGL error");
  const preferenceCompatibility = await verifySavedPreferenceCompatibility(page, controlPreferencesKey);
  logProgress("旧偏好兼容验证已完成");
  assert.deepEqual(consoleErrors, [], "生成过程出现 console error");
  assert.deepEqual(pageErrors, [], "生成过程出现 page error");

  report = {
    generatedAt: new Date().toISOString(),
    browser: {chromePath, transport: "playwright-cdp-session", isolatedProfile: true, viewport},
    fixture: {seed, cellsTarget: 10000, heightmapTemplate: "continents", statesNumber: 12, provincesRatio: 30},
    generation,
    runtime,
    preferenceCompatibility,
    outputs,
    consoleErrors,
    performanceConsoleErrors,
    pageErrors,
    passed: true
  };
  outputSummary = {ok: true, outputs, runtime, reportPath};
} catch (error) {
  primaryError = error;
} finally {
  const cleanupErrors = [];
  try {
    await browserCdp?.detach().catch(() => {});
    if (browserContext) await browserContext.close();
    else if (browser) await browser.close();
  } catch (error) {
    cleanupErrors.push(error);
  }
  if (server) {
    try {
      await new Promise((resolveClose, rejectClose) => server.close(error => error ? rejectClose(error) : resolveClose()));
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  try {
    await removeOwnedProfile(profileDir);
  } catch (error) {
    cleanupErrors.push(error);
  }
  if (cleanupErrors.length) {
    primaryError = new AggregateError([...(primaryError ? [primaryError] : []), ...cleanupErrors], "README 截图或隔离资源清理失败");
  }
}

if (primaryError) throw primaryError;
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(outputSummary, null, 2));

function resolveChromePath() {
  const candidates = process.platform === "win32"
    ? [
        process.env.FMG_CHROME_PATH,
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
      ]
    : [process.env.FMG_CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
  const found = candidates.find(candidate => candidate && existsSync(candidate));
  if (!found) throw new Error("未找到系统 Chrome；可通过 FMG_CHROME_PATH 指定路径");
  return found;
}

async function startStaticServer() {
  const serverInstance = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url || "/", `http://${host}`).pathname);
    let target = resolve(distDir, `.${normalize(pathname)}`);
    if (pathname === "/" || !target.startsWith(distDir) || !existsSync(target) || statSync(target).isDirectory()) target = join(distDir, "index.html");
    if (!target.startsWith(distDir) || !existsSync(target)) return void response.writeHead(404).end("Not found");
    response.writeHead(200, {"content-type": contentType(target), "cache-control": "no-store"});
    createReadStream(target).pipe(response);
  });
  await new Promise((resolveListen, rejectListen) => {
    serverInstance.once("error", rejectListen);
    serverInstance.listen(0, host, resolveListen);
  });
  return serverInstance;
}

async function waitForStableFrame(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.waitForTimeout(400);
}

async function verifySavedPreferenceCompatibility(page, storageKey) {
  await page.evaluate(({storageKey}) => {
    localStorage.setItem(storageKey, JSON.stringify({
      maxCityLabels: 5000,
      layers: {
        oceanCurrents: true,
        provinceBorders: true,
        provinceLabels: true,
        military: true,
        warFronts: true,
        zones: true,
        zoneEvents: true,
        zoneNatural: true,
        zoneWilderness: true,
        zoneLabels: true,
        measurements: true,
        population: false,
        coastline: false,
        tradeFlows: true
      }
    }));
  }, {storageKey});
  await page.reload({waitUntil: "domcontentloaded", timeout: timeoutMs});
  await waitForApiReady(page, timeoutMs);
  await page.waitForFunction(() => window.webglGeneratorApi.layers.get().data.display.maxCityLabels === 5000, undefined, {timeout: timeoutMs});

  const legacy = await page.evaluate(() => {
    const api = window.webglGeneratorApi.layers.get().data;
    const renderer = window.__webglGeneratorApp.renderer.getStats();
    const controls = Object.fromEntries(["coastline", "oceanCurrents", "provinceBorders", "provinceLabels", "military", "warFronts", "zoneEvents", "zoneLabels", "measurements"]
      .map(layer => [layer, document.querySelector(`[data-layer="${layer}"]`)?.getAttribute("aria-pressed") ?? null]));
    return {api, renderer: {layers: renderer.layerVisibility, maxCityLabels: renderer.labelOptions.maxCityLabels}, controls};
  });
  assert.equal(legacy.api.display.maxCityLabels, 5000, "已有城市标签上限被新默认覆盖");
  assert.equal(legacy.renderer.maxCityLabels, 5000, "已有城市标签上限没有进入 renderer");
  for (const layer of ["oceanCurrents", "provinceBorders", "provinceLabels", "military", "warFronts", "zones", "zoneEvents", "zoneNatural", "zoneWilderness", "zoneLabels", "measurements"]) {
    assert.equal(legacy.api.layers[layer], true, `已有 ${layer} 显式偏好被新默认覆盖`);
    assert.equal(legacy.renderer.layers[layer], true, `已有 ${layer} 显式偏好没有进入 renderer`);
  }
  assert.equal(legacy.api.layers.population, false, "已有 population 显式偏好被新默认覆盖");
  assert.equal(legacy.api.layers.coastline, false, "已有 coastline 显式偏好被新默认覆盖");
  assert.equal(legacy.api.layers.lakeShore, false, "coastline 旧偏好没有保持湖岸联动");
  assert.equal(legacy.api.layers.tradeFlows, false, "tradeFlows 的不持久化语义发生漂移");
  assert.equal(legacy.api.layers.markers, false, "缺失键没有采用新的 fresh 默认");
  for (const [layer, pressed] of Object.entries(legacy.controls)) {
    assert.notEqual(pressed, null, `${layer} 图层控件不存在`);
    assert.equal(pressed, String(legacy.api.layers[layer]), `${layer} 控件与 API 状态不一致`);
  }

  await page.evaluate(() => {
    const province = window.webglGeneratorApi.layers.setVisible("provinceLabels", false);
    if (!province?.ok) throw new Error(province?.error?.message || "省份标签偏好写入失败");
    const coastline = window.webglGeneratorApi.layers.setVisible("coastline", true);
    if (!coastline?.ok) throw new Error(coastline?.error?.message || "岸线偏好写入失败");
    const labels = window.webglGeneratorApi.layers.setMaxCityLabels(173);
    if (!labels?.ok) throw new Error(labels?.error?.message || "城市标签上限写入失败");
  });
  await page.reload({waitUntil: "domcontentloaded", timeout: timeoutMs});
  await waitForApiReady(page, timeoutMs);
  await page.waitForFunction(() => window.webglGeneratorApi.layers.get().data.display.maxCityLabels === 173, undefined, {timeout: timeoutMs});
  const persisted = await page.evaluate(() => {
    const snapshot = window.webglGeneratorApi.layers.get().data;
    const healthEvents = window.__webglGeneratorHealth?.getEvents?.(500) || [];
    const isPerformanceEvent = event => /main-thread-long-task|render-frame-gap/.test(`${event.type || ""} ${event.name || ""} ${event.message || ""}`);
    return {
      maxCityLabels: snapshot.display.maxCityLabels,
      provinceLabels: snapshot.layers.provinceLabels,
      coastline: snapshot.layers.coastline,
      lakeShore: snapshot.layers.lakeShore,
      tradeFlows: snapshot.layers.tradeFlows,
      healthErrors: healthEvents.filter(event => !isPerformanceEvent(event) && (event.level === "error" || event.severity === "error")).map(event => event.type || event.message || "error"),
      glError: window.__webglGeneratorApp.renderer.getStats().draw?.glError ?? 0
    };
  });
  assert.deepEqual(persisted, {
    maxCityLabels: 173,
    provinceLabels: false,
    coastline: true,
    lakeShore: true,
    tradeFlows: false,
    healthErrors: [],
    glError: 0
  }, "显式偏好刷新后的持久化或错误面不正确");
  return {legacy, persisted};
}

function inspectPng(path) {
  const bytes = readFileSync(path);
  if (bytes.length < 24 || bytes.toString("hex", 0, 8) !== "89504e470d0a1a0a") throw new Error(`${path} 不是有效 PNG`);
  return {bytes: bytes.length, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20)};
}

function contentType(file) {
  return ({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webmanifest": "application/manifest+json"
  })[extname(file).toLowerCase()] || "application/octet-stream";
}

async function removeOwnedProfile(path) {
  const ownedPrefix = join(profileBaseDir, "fmg-readme-showcase-");
  if (!resolve(path).startsWith(resolve(ownedPrefix))) throw new Error(`拒绝清理非本工具 profile：${path}`);
  let lastError;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      rmSync(path, {recursive: true, force: true, maxRetries: 3, retryDelay: 100});
      return;
    } catch (error) {
      lastError = error;
      await delay(250);
    }
  }
  throw lastError;
}

function delay(ms) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms));
}

function logProgress(message) {
  process.stderr.write(`[README showcase] ${message}\n`);
}
