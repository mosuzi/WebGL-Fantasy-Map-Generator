#!/usr/bin/env node
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {dirname, extname, join, normalize, resolve, sep} from "node:path";
import {fileURLToPath} from "node:url";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const distDir = join(rootDir, "dist", "webgl-generator");
const wikiDir = join(rootDir, "docs", "wiki");
const assetsDir = join(wikiDir, "assets");
const manifestPath = join(wikiDir, "screenshot-manifest.json");
const reportPath = join(rootDir, "docs", "generated", "reports", "wiki-screenshot-capture-results.json");
const profileBaseDir = resolve(
  process.env.FMG_WIKI_SCREENSHOT_TEMP_DIR || process.env.TEMP || join(rootDir, "tmp"),
);
const host = "127.0.0.1";
const timeoutMs = 180000;
const layerIds = Object.freeze([
  "routes", "tradeFlows", "rivers", "oceanCurrents", "cities", "labels", "stateLabels", "provinceLabels", "population",
  "markers", "resources", "military", "warFronts", "zones", "zoneEvents", "zoneNatural", "zoneWilderness", "zoneLabels",
  "measurements", "scaleBar", "mapBadge", "coastline", "lakeShore", "stateBorders", "provinceBorders", "gridCells"
]);
const performanceHealthTypes = new Set(["main-thread-long-task", "render-frame-gap"]);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
validateManifest(manifest);
const viewport = Object.freeze({
  width: manifest.capture.viewport.width,
  height: manifest.capture.viewport.height,
  deviceScaleFactor: manifest.capture.viewport.deviceScaleFactor
});
const scenes = manifest.scenes.map(scene => Object.freeze({...scene, layers: layerMatrix(scene.visibleLayers)}));

assert.ok(existsSync(distDir), `构建产物不存在：${distDir}；请先执行 pnpm run build:app`);
mkdirSync(assetsDir, {recursive: true});
mkdirSync(dirname(reportPath), {recursive: true});
mkdirSync(profileBaseDir, {recursive: true});

const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const chromePath = resolveChromePath();
const profileDir = mkdtempSync(join(profileBaseDir, "fmg-wiki-screenshots-"));
let server = null;
let browserContext = null;
let browser = null;
let browserCdp = null;
let report = null;
let outputSummary = null;
let primaryError = null;

try {
  server = await startStaticServer();
  const port = server.address().port;
  logProgress(`临时生产服务已启动：${port}`);
  browserContext = await playwright.chromium.launchPersistentContext(profileDir, {
    executablePath: chromePath,
    headless: true,
    viewport: null,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    args: [
      `--window-size=${viewport.width},${viewport.height}`,
      `--force-device-scale-factor=${viewport.deviceScaleFactor}`,
      "--lang=zh-CN",
      "--no-first-run",
      "--disable-default-apps",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-sync"
    ]
  });
  browser = browserContext.browser();
  await browserContext.addInitScript(() => {
    const sentinel = "__fmg_wiki_screenshot_storage_initialized__";
    if (sessionStorage.getItem(sentinel)) return;
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem(sentinel, "1");
  });
  const page = browserContext.pages()[0] || await browserContext.newPage();
  page.setDefaultTimeout(timeoutMs);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", error => pageErrors.push(error.message));
  browserCdp = await browserContext.newCDPSession(page);
  await browserCdp.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: viewport.deviceScaleFactor,
    mobile: false,
    screenWidth: viewport.width,
    screenHeight: viewport.height
  });

  await page.goto(`http://${host}:${port}/?healthClear=1`, {waitUntil: "domcontentloaded", timeout: timeoutMs});
  await waitForApiReady(page, timeoutMs);
  await page.addStyleTag({content: `
    *, *::before, *::after {
      animation-delay: 0s !important;
      animation-duration: 0s !important;
      caret-color: transparent !important;
      scroll-behavior: auto !important;
      transition-delay: 0s !important;
      transition-duration: 0s !important;
    }
    #map-toast, #shortcut-toast, #hover-overlay, .el-tooltip__popper {
      display: none !important;
    }
  `});
  logProgress("隔离系统 Chrome 与公开 API 已就绪");

  const generation = await generateFixture(page, manifest.capture);
  await waitForStableFrame(page);
  const initialRuntime = await inspectRuntime(page);
  assert.equal(initialRuntime.glError, 0, "固定地图生成后出现 WebGL error");
  assert.deepEqual(applicationHealthErrors(initialRuntime.healthEvents), [], "固定地图生成后出现 active health error");
  assert.deepEqual(applicationConsoleErrors(consoleErrors), [], "固定地图生成后出现 console error");
  assert.deepEqual(pageErrors, [], "固定地图生成后出现 page error");
  logProgress("固定 mountains-and-seas 10k 地图已生成");

  const outputs = [];
  let consoleCheckpoint = consoleErrors.length;
  let pageCheckpoint = pageErrors.length;
  for (const scene of scenes) {
    logProgress(`开始场景：${scene.id} ${scene.title}`);
    await prepareScene(page, scene);
    await waitForStableFrame(page);
    await clearTransientUi(page);
    const before = await inspectScene(page, scene);
    assertSceneState(before, scene, generation.summary);

    const screenshotOptions = {
      type: "png",
      animations: "disabled",
      caret: "hide",
      scale: "css"
    };
    if (scene.clip) screenshotOptions.clip = scene.clip;
    else screenshotOptions.fullPage = false;
    const png = await page.screenshot(screenshotOptions);
    const memoryFile = inspectPng(png, `${scene.id} 内存截图`);
    const expectedPng = scene.clip ? {width: scene.clip.width, height: scene.clip.height} : {width: viewport.width, height: viewport.height};
    assert.deepEqual({width: memoryFile.width, height: memoryFile.height}, expectedPng, `${scene.id} PNG 尺寸错误`);
    assert.ok(memoryFile.bytes > 10000, `${scene.id} PNG 内容过小`);

    const outputPath = resolveWikiAsset(scene.file);
    writeFileSync(outputPath, png);
    const diskBytes = readFileSync(outputPath);
    const diskFile = inspectPng(diskBytes, scene.file);
    assert.deepEqual(diskFile, memoryFile, `${scene.id} 写盘后 PNG 信息漂移`);
    assert.equal(createHash("sha256").update(diskBytes).digest("hex"), memoryFile.sha256, `${scene.id} 写盘后 SHA-256 漂移`);

    const after = await inspectScene(page, scene);
    assertSceneState(after, scene, generation.summary);
    const sceneConsoleErrors = consoleErrors.slice(consoleCheckpoint);
    const scenePageErrors = pageErrors.slice(pageCheckpoint);
    assert.deepEqual(applicationConsoleErrors(sceneConsoleErrors), [], `${scene.id} 出现 console error`);
    assert.deepEqual(scenePageErrors, [], `${scene.id} 出现 page error`);
    consoleCheckpoint = consoleErrors.length;
    pageCheckpoint = pageErrors.length;
    outputs.push({
      id: scene.id,
      title: scene.title,
      file: scene.file,
      theme: scene.theme,
      viewMode: scene.viewMode,
      clip: scene.clip || null,
      panelId: scene.ui.panelId || (scene.ui.type === "control" || scene.ui.type === "export" ? "generation-panel" : null),
      layers: scene.layers,
      ...diskFile
    });
    logProgress(`场景已写入：${scene.file}`);
    await cleanupScene(page, scene);
  }

  const finalRuntime = await inspectRuntime(page);
  assert.equal(finalRuntime.glError, 0, "截图完成后出现 WebGL error");
  assert.deepEqual(applicationHealthErrors(finalRuntime.healthEvents), [], "截图完成后出现 active health error");
  assert.deepEqual(applicationConsoleErrors(consoleErrors), [], "截图完成后出现 console error");
  assert.deepEqual(pageErrors, [], "截图完成后出现 page error");
  const deterministicDigest = createHash("sha256")
    .update(outputs.map(item => `${item.id}:${item.sha256}`).join("\n"))
    .digest("hex");
  report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    browser: {chromePath, transport: "playwright-cdp-session", isolatedProfile: true, viewport},
    fixture: {...manifest.capture, summary: generation.summary},
    outputs,
    deterministicDigest,
    diagnostics: {
      consoleErrors: applicationConsoleErrors(consoleErrors),
      performanceConsoleErrors: consoleErrors.filter(isPerformanceHealthConsole),
      pageErrors,
      healthErrors: applicationHealthErrors(finalRuntime.healthEvents),
      performanceHealthEvents: finalRuntime.healthEvents.filter(event => performanceHealthTypes.has(event.type)),
      glError: finalRuntime.glError
    },
    passed: true
  };
  outputSummary = {ok: true, scenes: outputs.length, deterministicDigest, outputs: outputs.map(({id, file, sha256}) => ({id, file, sha256})), reportPath};
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
    primaryError = new AggregateError([...(primaryError ? [primaryError] : []), ...cleanupErrors], "Wiki 截图或隔离资源清理失败");
  }
}

if (primaryError) throw primaryError;
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(outputSummary, null, 2));

async function generateFixture(page, capture) {
  return page.evaluate(async fixture => {
    const unwrap = (response, label) => {
      if (!response?.ok) throw new Error(`${label}：${response?.error?.message || "失败"}`);
      return response.data;
    };
    unwrap(await window.webglGeneratorApi.generate.newMap({
      confirm: true,
      seed: fixture.seed,
      randomSeed: false,
      cellsTarget: fixture.cellsTarget,
      graphWidth: fixture.viewport.width,
      graphHeight: fixture.viewport.height,
      heightmapTemplate: fixture.heightmapTemplate,
      statesNumber: fixture.statesNumber,
      provincesRatio: fixture.provincesRatio,
      mapName: "山海志"
    }), "生成 Wiki 固定地图");
    unwrap(window.webglGeneratorApi.layers.setShowHoverInfo(false), "关闭悬停信息");
    unwrap(window.webglGeneratorApi.layers.setMaxCityLabels(128), "设置城市标签上限");
    unwrap(window.webglGeneratorApi.selection.clear(), "清除选择");
    unwrap(window.webglGeneratorApi.layers.fitView(), "适配视图");

    const mapName = document.getElementById("map-name-input");
    if (!mapName) throw new Error("缺少地图名称输入框");
    mapName.value = "山海志";
    mapName.dispatchEvent(new Event("input", {bubbles: true}));
    const filenameTemplate = document.getElementById("map-filename-template-input");
    if (!filenameTemplate) throw new Error("缺少存档名称格式输入框");
    filenameTemplate.value = "{name}.{ext}";
    filenameTemplate.dispatchEvent(new Event("input", {bubbles: true}));
    filenameTemplate.dispatchEvent(new Event("change", {bubbles: true}));
    document.getElementById("map-toast")?.setAttribute("hidden", "");
    document.getElementById("shortcut-toast")?.setAttribute("hidden", "");
    document.getElementById("hover-overlay")?.setAttribute("hidden", "");
    await document.fonts.ready;
    return {
      summary: unwrap(window.webglGeneratorApi.info.mapSummary(), "读取 Wiki 地图摘要"),
      layers: unwrap(window.webglGeneratorApi.layers.get(), "读取 Wiki 图层状态")
    };
  }, capture);
}

async function prepareScene(page, scene) {
  await closeVisibleUi(page);
  await page.evaluate(({theme, viewMode, layers}) => {
    const unwrap = (response, label) => {
      if (!response?.ok) throw new Error(`${label}：${response?.error?.message || "失败"}`);
      return response.data;
    };
    unwrap(window.webglGeneratorApi.selection.clear(), "清除场景选择");
    unwrap(window.webglGeneratorApi.layers.setShowHoverInfo(false), "关闭场景悬停信息");
    unwrap(window.webglGeneratorApi.layers.setTheme(theme), `设置主题 ${theme}`);
    unwrap(window.webglGeneratorApi.layers.setViewMode(viewMode), `设置视图 ${viewMode}`);
    for (const [layer, visible] of Object.entries(layers)) {
      unwrap(window.webglGeneratorApi.layers.setVisible(layer, visible), `设置图层 ${layer}`);
    }
    unwrap(window.webglGeneratorApi.layers.fitView(), "适配场景视图");
  }, scene);
  await waitForSceneLayers(page, scene);

  if (scene.ui.type === "overview") {
    await waitForVisibleSelector(page, scene.ui.targetSelector);
    return;
  }
  if (scene.ui.type === "control") {
    await openControlTab(page, scene.ui.tab);
    if (scene.ui.openFilenameSettings) {
      const expanded = await page.locator("#toggle-map-filename-template").getAttribute("aria-expanded");
      if (expanded !== "true") await page.locator("#toggle-map-filename-template").click();
      await waitForVisibleSelector(page, "#map-filename-template-settings");
    }
    await waitForVisibleSelector(page, scene.ui.targetSelector);
    return;
  }
  if (scene.ui.type === "panel") {
    await openControlTab(page, "management");
    const opener = page.locator(`#${scene.ui.openerId}`);
    assert.equal(await opener.count(), 1, `${scene.id} 缺少入口 #${scene.ui.openerId}`);
    await opener.click();
    const panelSelector = `.floating-panel[data-panel-id="${scene.ui.panelId}"]:not(.hidden)`;
    await page.waitForSelector(panelSelector, {state: "visible", timeout: timeoutMs});
    await page.waitForFunction(({panelSelector, readyText, readySelector}) => {
      const body = document.querySelector(`${panelSelector} .floating-panel-body`);
      const ready = !readySelector || document.querySelector(readySelector);
      return body && ready && !body.textContent.includes("正在加载") && (!readyText || body.textContent.includes(readyText));
    }, {
      panelSelector,
      readyText: scene.ui.readyText || scene.ui.requiredText || "",
      readySelector: scene.ui.readySelector || ""
    }, {timeout: timeoutMs});
    if (scene.ui.scrollSelector) {
      await page.evaluate(selector => {
        const target = document.querySelector(selector);
        if (!target) throw new Error(`缺少场景滚动目标：${selector}`);
        const body = target.closest(".floating-panel-body");
        if (!body) throw new Error(`场景滚动目标不在面板正文内：${selector}`);
        const targetRect = target.getBoundingClientRect();
        const bodyRect = body.getBoundingClientRect();
        body.scrollTop = Math.max(0, body.scrollTop + targetRect.top - bodyRect.top - 150);
      }, scene.ui.scrollSelector);
    } else {
      await page.evaluate(panelId => {
        const body = document.querySelector(`.floating-panel[data-panel-id="${panelId}"] .floating-panel-body`);
        if (body) body.scrollTop = 0;
      }, scene.ui.panelId);
    }
    if (scene.ui.heightSelection) await prepareHeightSelection(page, scene);
    for (const selector of scene.ui.requiredVisibleSelectors || []) await waitForVisibleSelector(page, selector);
    return;
  }
  if (scene.ui.type === "export") {
    await openControlTab(page, scene.ui.tab);
    await page.locator("#open-export-panel").click();
    await waitForVisibleSelector(page, scene.ui.targetSelector);
    return;
  }
  throw new Error(`${scene.id} 使用了未知 UI 场景类型：${scene.ui.type}`);
}

async function prepareHeightSelection(page, scene) {
  const panel = page.locator('.floating-panel[data-panel-id="height-panel"]');
  await panel.getByRole("button", {name: "启用高度编辑", exact: true}).click();
  await panel.getByRole("button", {name: "涂选平滑范围", exact: true}).click();
  const {start, end} = scene.ui.heightSelection;
  await page.mouse.move(start[0], start[1]);
  await page.mouse.down();
  await page.mouse.move(end[0], end[1], {steps: 8});
  await page.mouse.up();
  await page.waitForFunction(() => {
    const body = document.querySelector('.floating-panel[data-panel-id="height-panel"] .floating-panel-body');
    return body?.textContent.includes("已选 ") && !body.textContent.includes("尚未选择范围");
  }, null, {timeout: timeoutMs});
  await page.waitForFunction(() => {
    const cache = window.__webglGeneratorApp?.renderer?.getStats?.()?.dynamicMeshCache;
    return cache && !cache.selectionDirty;
  }, null, {timeout: timeoutMs});
}

async function cleanupScene(page, scene) {
  if (!scene.ui.heightSelection) return;
  const panel = page.locator('.floating-panel[data-panel-id="height-panel"]');
  const clear = panel.getByRole("button", {name: "清除平滑范围", exact: true});
  if (await clear.isEnabled()) await clear.click();
  await panel.getByRole("button", {name: "停止高度编辑", exact: true}).click();
  await page.waitForFunction(() => {
    const body = document.querySelector('.floating-panel[data-panel-id="height-panel"] .floating-panel-body');
    const cache = window.__webglGeneratorApp?.renderer?.getStats?.()?.dynamicMeshCache;
    return body?.textContent.includes("启用高度编辑")
      && body.textContent.includes("尚未选择范围")
      && cache
      && !cache.selectionDirty;
  }, null, {timeout: Math.min(timeoutMs, 30000)});
  await waitForStableFrame(page);
}

async function openControlTab(page, tab) {
  await page.locator("#open-generation-panel").click();
  await page.waitForSelector('.floating-panel[data-panel-id="generation-panel"]:not(.hidden)', {state: "visible", timeout: timeoutMs});
  const tabSelector = `[data-control-tab="${tab}"]`;
  await page.locator(tabSelector).click();
  await waitForVisibleSelector(page, `[data-control-panel="${tab}"]`);
  await page.evaluate(() => {
    const body = document.querySelector('.floating-panel[data-panel-id="generation-panel"] .floating-panel-body');
    if (body) body.scrollTop = 0;
  });
}

async function closeVisibleUi(page) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const count = await page.evaluate(() => {
      const visible = element => {
        if (!element || element.hidden || element.classList.contains("hidden")) return false;
        const style = getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) !== 0;
      };
      const panels = [...document.querySelectorAll(".floating-panel")].filter(visible);
      const overlays = [...document.querySelectorAll("[data-overlay-id]")].filter(element => visible(element) && element.getAttribute("aria-hidden") !== "true");
      return panels.length + overlays.length;
    });
    if (!count) return;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(40);
  }
  throw new Error("无法关闭上一 Wiki 截图场景的面板或浮层");
}

async function waitForSceneLayers(page, scene) {
  try {
    await page.waitForFunction(({viewMode, layers}) => {
      const api = window.webglGeneratorApi;
      const snapshot = api?.layers?.get?.();
      const stats = window.__webglGeneratorApp?.renderer?.getStats?.();
      const cache = stats?.dynamicMeshCache;
      if (!snapshot?.ok || !stats || !cache || snapshot.data.colorMode !== viewMode) return false;
      if (Object.entries(layers).some(([layer, visible]) => snapshot.data.layers[layer] !== visible)) return false;
      return (!layers.routes || !cache.routesDirty)
        && (!layers.tradeFlows || !cache.tradeFlowsDirty)
        && (!layers.rivers || !cache.riversDirty)
        && !cache.selectionDirty
        && api.info.runtimeStats().data.operation.busy === false;
    }, {viewMode: scene.viewMode, layers: scene.layers}, {timeout: Math.min(timeoutMs, 30000)});
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      layers: window.webglGeneratorApi?.layers?.get?.(),
      runtime: window.webglGeneratorApi?.info?.runtimeStats?.(),
      dynamicMeshCache: window.__webglGeneratorApp?.renderer?.getStats?.()?.dynamicMeshCache || null
    }));
    throw new Error(`${scene.id} 图层未在 30 秒内稳定：${JSON.stringify(diagnostic)}`, {cause: error});
  }
}

async function clearTransientUi(page) {
  await page.evaluate(() => {
    for (const id of ["map-toast", "shortcut-toast", "hover-overlay"]) {
      const element = document.getElementById(id);
      if (!element) continue;
      element.hidden = true;
      if (id !== "hover-overlay") element.textContent = "";
    }
    document.activeElement?.blur?.();
    window.scrollTo(0, 0);
  });
  await page.mouse.move(viewport.width - 2, viewport.height - 2);
  await waitForStableFrame(page);
}

async function inspectScene(page, scene) {
  return page.evaluate(({scene, viewport}) => {
    const unwrap = (response, label) => {
      if (!response?.ok) throw new Error(`${label}：${response?.error?.message || "失败"}`);
      return response.data;
    };
    const visible = element => {
      if (!element || element.hidden || element.classList.contains("hidden")) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) !== 0 && rect.width > 0 && rect.height > 0;
    };
    const health = unwrap(window.webglGeneratorApi.info.healthEvents({severity: "error", limit: 500}), "读取 health error");
    const summary = unwrap(window.webglGeneratorApi.info.mapSummary(), "读取地图摘要");
    const layerState = unwrap(window.webglGeneratorApi.layers.get(), "读取图层状态");
    const target = document.querySelector(scene.ui.targetSelector || `.floating-panel[data-panel-id="${scene.ui.panelId}"]`);
    const targetPanel = scene.ui.panelId ? document.querySelector(`.floating-panel[data-panel-id="${scene.ui.panelId}"]`) : null;
    const visibleText = document.body.innerText;
    const sensitiveSelectors = [
      '[aria-label*="令牌"]', '[id*="token" i]', '[name*="token" i]', '[id*="oauth" i]', '[name*="oauth" i]', '[id*="client-secret" i]'
    ];
    const generatedAt = String(summary.generatedAt || "");
    const generatedDate = generatedAt ? new Date(generatedAt) : null;
    const dynamicValues = [summary.checksum, summary.mapIdentity, generatedAt, generatedAt.slice(0, 10)];
    if (generatedDate && !Number.isNaN(generatedDate.valueOf())) {
      dynamicValues.push(
        `${generatedDate.getFullYear()}年${generatedDate.getMonth() + 1}月${generatedDate.getDate()}日`,
        `${generatedDate.getFullYear()}/${generatedDate.getMonth() + 1}/${generatedDate.getDate()}`
      );
    }
    return {
      summary,
      layerState,
      healthEvents: health.events.map(event => ({
        type: event.type || "",
        severity: event.severity || event.level || "",
        message: event.detail?.message || event.message || ""
      })),
      glError: window.__webglGeneratorApp.renderer.getStats().draw?.glError ?? 0,
      viewport: {width: innerWidth, height: innerHeight, deviceScaleFactor: devicePixelRatio},
      targetVisible: visible(target),
      targetRect: target ? (() => {
        const rect = target.getBoundingClientRect();
        return {x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height};
      })() : null,
      visibleMainPanels: [...document.querySelectorAll('.floating-panel[data-panel-role="main"]')].filter(visible).map(panel => panel.dataset.panelId),
      requiredVisible: (scene.ui.requiredVisibleSelectors || []).map(selector => ({selector, visible: visible(document.querySelector(selector))})),
      panelText: targetPanel?.querySelector(".floating-panel-body")?.textContent || "",
      filenameSettingsVisible: visible(document.getElementById("map-filename-template-settings")),
      filenamePreview: document.getElementById("map-filename-template-preview")?.textContent?.trim() || "",
      exportOverlayVisible: visible(document.querySelector('[data-overlay-id="project-export"]')),
      transientVisible: ["map-toast", "shortcut-toast", "hover-overlay"].filter(id => visible(document.getElementById(id))),
      sensitiveVisible: sensitiveSelectors.flatMap(selector => [...document.querySelectorAll(selector)].filter(visible).map(element => element.id || element.getAttribute("aria-label") || selector)),
      visibleDynamicValues: [...new Set(dynamicValues.filter(value => value && visibleText.includes(String(value))))],
      visibleChecksum: /\b[0-9a-f]{64}\b/i.test(visibleText),
      visibleDate: /\b20\d{2}-\d{2}-\d{2}\b/.test(visibleText),
      expectedViewport: viewport
    };
  }, {scene, viewport});
}

function assertSceneState(actual, scene, baselineSummary) {
  assert.deepEqual(actual.viewport, {width: viewport.width, height: viewport.height, deviceScaleFactor: viewport.deviceScaleFactor}, `${scene.id} viewport 或 DPR 漂移`);
  assert.equal(actual.targetVisible, true, `${scene.id} 目标 UI 不可见`);
  if (scene.clip) {
    assert.ok(actual.targetRect, `${scene.id} 聚焦截图缺少目标矩形`);
    assert.ok(actual.targetRect.x >= scene.clip.x && actual.targetRect.y >= scene.clip.y
      && actual.targetRect.right <= scene.clip.x + scene.clip.width
      && actual.targetRect.bottom <= scene.clip.y + scene.clip.height, `${scene.id} 聚焦截图没有完整包含目标 UI`);
  }
  assert.equal(actual.layerState.colorMode, scene.viewMode, `${scene.id} 专题视图漂移`);
  assert.equal(actual.layerState.visualTheme, scene.theme, `${scene.id} 视觉主题漂移`);
  assert.deepEqual(pickLayers(actual.layerState.layers), scene.layers, `${scene.id} 图层矩阵漂移`);
  assert.equal(actual.summary.checksum, baselineSummary.checksum, `${scene.id} 改变了地图 checksum`);
  assert.equal(actual.summary.mapRevision, baselineSummary.mapRevision, `${scene.id} 改变了地图 revision`);
  assert.deepEqual(actual.transientVisible, [], `${scene.id} 仍显示 toast、快捷提示或悬停卡片`);
  assert.deepEqual(actual.sensitiveVisible, [], `${scene.id} 暴露令牌或 OAuth 敏感输入`);
  assert.deepEqual(actual.visibleDynamicValues, [], `${scene.id} 显示了当前地图 identity、checksum 或生成时间`);
  assert.equal(actual.visibleChecksum, false, `${scene.id} 显示了动态 checksum`);
  assert.equal(actual.visibleDate, false, `${scene.id} 显示了动态日期`);
  assert.equal(actual.glError, 0, `${scene.id} 出现 WebGL error`);
  assert.deepEqual(applicationHealthErrors(actual.healthEvents), [], `${scene.id} 出现 active health error`);

  const expectedPanels = scene.ui.type === "overview" ? [] : [scene.ui.panelId || "generation-panel"];
  assert.deepEqual(actual.visibleMainPanels, expectedPanels, `${scene.id} 可见主面板不唯一`);
  assert.deepEqual(actual.requiredVisible.filter(item => !item.visible), [], `${scene.id} 必需 UI 没有同时可见`);
  if (scene.ui.requiredText) assert.ok(actual.panelText.includes(scene.ui.requiredText), `${scene.id} 面板缺少目标内容：${scene.ui.requiredText}`);
  if (scene.ui.openFilenameSettings) {
    assert.equal(actual.filenameSettingsVisible, true, `${scene.id} 未展开存档名称格式`);
    assert.equal(actual.filenamePreview, "山海志.webfmg", `${scene.id} 文件名预览不是稳定值`);
  }
  if (scene.ui.type === "export") assert.equal(actual.exportOverlayVisible, true, `${scene.id} 导出浮层未打开`);
}

async function inspectRuntime(page) {
  return page.evaluate(() => {
    const health = window.webglGeneratorApi.info.healthEvents({severity: "error", limit: 500});
    if (!health?.ok) throw new Error(health?.error?.message || "无法读取 health error");
    return {
      healthEvents: health.data.events.map(event => ({
        type: event.type || "",
        severity: event.severity || event.level || "",
        message: event.detail?.message || event.message || ""
      })),
      glError: window.__webglGeneratorApp.renderer.getStats().draw?.glError ?? 0
    };
  });
}

async function waitForVisibleSelector(page, selector) {
  await page.waitForFunction(targetSelector => {
    const element = document.querySelector(targetSelector);
    if (!element || element.hidden || element.classList.contains("hidden")) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }, selector, {timeout: timeoutMs});
}

async function waitForStableFrame(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));
  });
  await page.waitForTimeout(450);
}

function layerMatrix(visibleLayers) {
  const visible = new Set(visibleLayers);
  return Object.freeze(Object.fromEntries(layerIds.map(layer => [layer, visible.has(layer)])));
}

function pickLayers(layers) {
  return Object.fromEntries(layerIds.map(layer => [layer, Boolean(layers[layer])]));
}

function applicationHealthErrors(events) {
  return events.filter(event => !performanceHealthTypes.has(event.type));
}

function applicationConsoleErrors(errors) {
  return errors.filter(message => !isPerformanceHealthConsole(message));
}

function isPerformanceHealthConsole(message) {
  return [...performanceHealthTypes].some(type => String(message).includes(`[FMG health] ${type}`));
}

function inspectPng(bytes, label) {
  if (bytes.length < 24 || bytes.toString("hex", 0, 8) !== "89504e470d0a1a0a") throw new Error(`${label} 不是有效 PNG`);
  return {
    bytes: bytes.length,
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    sha256: createHash("sha256").update(bytes).digest("hex")
  };
}

function resolveWikiAsset(relativePath) {
  const output = resolve(wikiDir, ...relativePath.split("/"));
  const prefix = `${resolve(assetsDir)}${sep}`;
  if (!output.startsWith(prefix)) throw new Error(`拒绝写入 Wiki 资产目录以外：${relativePath}`);
  mkdirSync(dirname(output), {recursive: true});
  return output;
}

function validateManifest(document) {
  assert.equal(document.schemaVersion, 1, "Wiki 截图 manifest schemaVersion 必须为 1");
  assert.equal(document.capture?.seed, "mountains-and-seas", "Wiki 截图 seed 漂移");
  assert.equal(document.capture?.cellsTarget, 10000, "Wiki 截图 cellsTarget 漂移");
  assert.deepEqual(document.capture?.viewport, {width: 1440, height: 960, deviceScaleFactor: 1}, "Wiki 截图 viewport 漂移");
  assert.equal(document.capture?.source, "production-dist", "Wiki 截图必须来自 production dist");
  assert.equal(document.capture?.browser, "isolated-system-chrome", "Wiki 截图必须使用隔离系统 Chrome");
  assert.ok(Array.isArray(document.scenes) && document.scenes.length >= 10, "Wiki 截图场景少于 10 个");
  const ids = new Set();
  const files = new Set();
  const knownLayers = new Set(layerIds);
  for (const scene of document.scenes) {
    assert.match(scene.id || "", /^wiki-\d{2}$/, "Wiki 截图场景 id 不稳定");
    assert.ok(!ids.has(scene.id), `Wiki 截图场景 id 重复：${scene.id}`);
    ids.add(scene.id);
    assert.match(scene.file || "", /^assets\/[^/]+\.png$/u, `${scene.id} 文件必须位于 assets/`);
    assert.ok(!files.has(scene.file), `Wiki 截图文件重复：${scene.file}`);
    files.add(scene.file);
    assert.ok(String(scene.title || "").trim().length >= 4, `${scene.id} 缺少标题`);
    assert.ok(String(scene.alt || "").trim().length >= 8, `${scene.id} 缺少描述性 alt`);
    assert.match(String(scene.caption || ""), /^图：\S/u, `${scene.id} 缺少图注`);
    assert.ok(Array.isArray(scene.visibleLayers), `${scene.id} 缺少可见图层清单`);
    const unknown = scene.visibleLayers.filter(layer => !knownLayers.has(layer));
    assert.deepEqual(unknown, [], `${scene.id} 包含未知图层`);
    assert.ok(["overview", "control", "panel", "export"].includes(scene.ui?.type), `${scene.id} UI 类型无效`);
    if (scene.clip) {
      for (const key of ["x", "y", "width", "height"]) assert.ok(Number.isInteger(scene.clip[key]) && scene.clip[key] >= (key === "width" || key === "height" ? 1 : 0), `${scene.id} clip.${key} 无效`);
      assert.ok(scene.clip.x + scene.clip.width <= document.capture.viewport.width, `${scene.id} clip 超出 viewport 宽度`);
      assert.ok(scene.clip.y + scene.clip.height <= document.capture.viewport.height, `${scene.id} clip 超出 viewport 高度`);
    }
  }
}

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
  const ownedPrefix = `${resolve(profileBaseDir, "fmg-wiki-screenshots-")}`;
  if (!resolve(path).startsWith(ownedPrefix)) throw new Error(`拒绝清理非本工具 profile：${path}`);
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
  process.stderr.write(`[Wiki screenshots] ${message}\n`);
}
