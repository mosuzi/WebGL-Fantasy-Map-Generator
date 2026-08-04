#!/usr/bin/env node
import {createReadStream, createWriteStream, existsSync, mkdirSync, statSync, writeFileSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {dirname, extname, isAbsolute, join, normalize, relative, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const scenario = String(args.scenario || "transitions");
const host = String(args.host || "127.0.0.1");
const port = Number(args.port || 5488);
const timeoutMs = Number(args.timeout || 300000);
const stableTimeoutMs = Number(args["stable-timeout"] || 10000);
const cells = Number(args.cells || 100000);
const seed = String(args.seed || "canvas-perf-266");
const template = String(args.template || "continents");
const graphWidth = Number(args.width || 1440);
const graphHeight = Number(args.height || 960);
const browserChannel = String(args["browser-channel"] || args.channel || "chrome");
const distDir = resolve(args.dir || join(rootDir, "dist", "webgl-generator"));
const playwrightDir = resolve(args["playwright-dir"] || rootDir);
const outPath = resolve(args.out || join(rootDir, "docs", "generated", "reports", `canvas-performance-${scenario}.json`));
const markdownPath = args.markdown ? resolve(args.markdown) : outPath.replace(/\.json$/i, ".md");
const viewport = parseViewport(args.viewport || "1280x820");
const warmup = parseBoolean(args.warmup, scenario !== "startup");
const headful = parseBoolean(args.headful, false);
const traceAction = String(args.action || "locate-largest-state");

mkdirSync(dirname(outPath), {recursive: true});
if (markdownPath) mkdirSync(dirname(markdownPath), {recursive: true});

let server = null;
let browser = null;
let cacheSession = null;
const consoleErrors = [];
const healthConsoleEvents = [];

try {
  if (!existsSync(distDir)) fail(`构建产物不存在：${distDir}`);
  if (!existsSync(join(playwrightDir, "package.json"))) fail(`Playwright 依赖目录缺少 package.json：${playwrightDir}`);
  const playwright = loadPlaywright(playwrightDir);
  server = await startStaticServer({host, port, publicDir: distDir});
  browser = await playwright.chromium.launch({headless: !headful, channel: browserChannel || undefined});
  const context = await browser.newContext({viewport, deviceScaleFactor: 1});
  await installInitialState(context);
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  if (scenario === "startup") {
    cacheSession = await context.newCDPSession(page);
    await cacheSession.send("Network.enable");
    await cacheSession.send("Network.clearBrowserCache");
    await cacheSession.send("Network.setCacheDisabled", {cacheDisabled: true});
  }
  page.on("console", message => {
    if (message.type() !== "error") return;
    const value = message.text();
    if (value.startsWith("[FMG health]")) healthConsoleEvents.push(value);
    else consoleErrors.push(value);
  });
  page.on("pageerror", error => consoleErrors.push(error.message));
  const baseUrl = `http://${host}:${port}`;

  if (scenario === "startup") {
    const report = await profileStartup(page, baseUrl, consoleErrors);
    writeReport(report);
  } else {
    await openReadyPage(page, baseUrl);
    await generateCase(page, {cells, seed, template, graphWidth, graphHeight});
    await requireRendererStable(page, {includeLocateFlash: false}, "生成后");
    const target = await findLargestStateTarget(page);
    if (!target) fail("没有找到可用于状态切换调查的国家目标");

    if (scenario === "trace") {
      if (warmup) await runActionCase(page, traceAction, target, {record: false});
      await restoreNeutralState(page);
      const report = await profileTrace(context, page, traceAction, target, consoleErrors);
      const summaryPath = outPath.replace(/\.json$/i, "-summary.json");
      writeFileSync(summaryPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
      if (markdownPath) writeFileSync(markdownPath, renderMarkdown(report), "utf8");
      console.log(`Wrote ${outPath}`);
      console.log(`Wrote ${summaryPath}`);
      if (!report.passed) process.exitCode = 1;
    } else if (scenario === "transitions") {
      if (warmup) {
        await runTransitionSuite(page, target, {record: false});
        await restoreNeutralState(page);
      }
      const before = await captureState(page);
      const actions = await runTransitionSuite(page, target, {record: true});
      await restoreNeutralState(page);
      const after = await captureState(page);
      const environment = await readPageEnvironment(page);
      const failures = validateSuite({before, after, actions, consoleErrors});
      const report = {
        metadata: metadata({baseUrl, consoleErrors}),
        environment,
        target,
        before: compactState(before),
        after: compactState(after),
        actions,
        failures,
        passed: failures.length === 0
      };
      writeReport(report);
    } else {
      fail(`未知 scenario：${scenario}`);
    }
  }
} catch (error) {
  const failureReport = {
    metadata: metadata({baseUrl: `http://${host}:${port}`, failedAt: new Date().toISOString()}),
    failures: [error?.message || String(error)],
    error: {name: error?.name || "Error", message: error?.message || String(error), stack: error?.stack || ""},
    passed: false
  };
  const failurePath = scenario === "trace" ? outPath.replace(/\.json$/i, "-failure.json") : outPath;
  writeFileSync(failurePath, `${JSON.stringify(failureReport, null, 2)}\n`, "utf8");
  if (markdownPath) writeFileSync(markdownPath, renderMarkdown(failureReport), "utf8");
  console.error(error?.stack || error);
  console.error(`Wrote ${failurePath}`);
  process.exitCode = 1;
} finally {
  if (cacheSession) await cacheSession.detach().catch(() => {});
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  if (server) await new Promise(resolveClose => server.close(resolveClose));
}

async function installInitialState(context) {
  await context.addInitScript(() => {
    localStorage.setItem("webgl-generator-control-preferences", JSON.stringify({
      colorMode: "height",
      showOceanHeight: false,
      smoothCellBorders: true,
      showHoverInfo: true,
      maxCityLabels: 5000,
      layers: {
        routes: true,
        rivers: true,
        cities: true,
        labels: true,
        stateLabels: true,
        provinceLabels: true,
        zoneLabels: true,
        markers: true,
        resources: true,
        military: true,
        measurements: true,
        coastline: true,
        lakeShore: true,
        stateBorders: true,
        provinceBorders: true
      }
    }));
    const probe = {longTasks: []};
    if ("PerformanceObserver" in window) {
      try {
        probe.observer = new PerformanceObserver(list => {
          for (const entry of list.getEntries()) probe.longTasks.push({startTime: entry.startTime, duration: entry.duration});
        });
        probe.observer.observe({entryTypes: ["longtask"]});
      } catch {
        probe.observer = null;
      }
    }
    window.__canvasStateProfileProbe = probe;
    window.__canvasStateCancelLocateFlash = renderer => {
      const view = renderer?.canvas?.ownerDocument?.defaultView || window;
      if (renderer?.locateFlashFrame && typeof view.cancelAnimationFrame === "function") view.cancelAnimationFrame(renderer.locateFlashFrame);
      if (!renderer) return;
      renderer.locateFlash = null;
      renderer.locateFlashFrame = 0;
      renderer.dynamicBuffersDirty.selection = true;
      if (renderer.map) renderer.draw();
    };
  });
}

async function profileStartup(page, baseUrl, consoleErrors) {
  const startedAt = Date.now();
  await page.goto(`${baseUrl}?healthClear=1`, {waitUntil: "domcontentloaded", timeout: timeoutMs});
  await page.waitForFunction(() => window.__webglGeneratorApp?.renderer?.getStats?.()?.webgl2, null, {timeout: timeoutMs});
  await page.waitForFunction(() => window.__webglGeneratorApp?.map?.metadata?.generationTiming?.totalMs, null, {timeout: timeoutMs});
  await assertPerformanceChannels(page);
  const stable = await waitForRendererStable(page, {includeLocateFlash: false});
  const state = await captureState(page);
  const environment = await readPageEnvironment(page);
  const browserTiming = await page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    const probe = window.__canvasStateProfileProbe || {longTasks: []};
    return {
      navigationToStableMs: roundBrowser(performance.now()),
      domContentLoadedMs: roundBrowser(navigation?.domContentLoadedEventEnd || 0),
      loadEventMs: roundBrowser(navigation?.loadEventEnd || 0),
      transferSize: Number(navigation?.transferSize || 0),
      encodedBodySize: Number(navigation?.encodedBodySize || 0),
      decodedBodySize: Number(navigation?.decodedBodySize || 0),
      resourceCount: performance.getEntriesByType("resource").length,
      longTasks: probe.longTasks.map(item => ({startTime: roundBrowser(item.startTime), duration: roundBrowser(item.duration)}))
    };

    function roundBrowser(value) {
      return Math.round(Number(value || 0) * 100) / 100;
    }
  });
  const failures = [];
  if (!stable.completed) failures.push("冷启动后 renderer 未在期限内稳定");
  if (state.stats?.draw?.glError !== 0) failures.push(`WebGL error expected 0, got ${state.stats?.draw?.glError}`);
  for (const [key, channel] of Object.entries(state.events || {})) {
    if (Number(channel.failed || 0) > 0) failures.push(`冷启动 ${key} 事件出现 ${channel.failed} 次 failed`);
  }
  for (const event of state.events?.draw?.recent || []) {
    if (event.status === "completed" && Number(event.glError || 0) !== 0) failures.push(`冷启动 draw #${event.sequence} WebGL error ${event.glError}`);
  }
  if (consoleErrors.length) failures.push(`console/page error ${consoleErrors.length} 条`);
  return {
    metadata: metadata({baseUrl, consoleErrors, startupWallMs: Date.now() - startedAt, cells: state.cellsTarget, seed: state.seed, startupSeed: state.seed}),
    stable,
    browserTiming,
    environment,
    state,
    failures,
    passed: failures.length === 0
  };
}

async function openReadyPage(page, baseUrl) {
  await page.goto(baseUrl, {waitUntil: "domcontentloaded", timeout: timeoutMs});
  await page.waitForFunction(() => window.__webglGeneratorApp?.renderer?.getStats?.()?.webgl2, null, {timeout: timeoutMs});
  await page.waitForFunction(() => window.__webglGeneratorApp?.map?.metadata?.generationTiming?.totalMs, null, {timeout: timeoutMs});
  await assertPerformanceChannels(page);
  await requireRendererStable(page, {includeLocateFlash: false}, "默认地图加载后");
}

async function assertPerformanceChannels(page) {
  await page.evaluate(() => {
    const required = ["draw", "overlay", "surfaceRefresh", "lineRefresh", "pointRefresh", "routeMesh", "riverMesh", "selectionMesh", "bufferUpload", "viewportCommit"];
    const events = window.__webglGeneratorApp?.renderer?.getStats?.()?.performanceEvents || {};
    const missing = required.filter(key => !events[key] || !Number.isFinite(Number(events[key].sequence)));
    if (missing.length) throw new Error(`dist 缺少性能事件通道：${missing.join(", ")}；请先重建生产包`);
  });
}

async function generateCase(page, options) {
  await page.waitForSelector("#cells-input", {state: "attached", timeout: timeoutMs});
  await page.evaluate(({cells, seed, template, graphWidth, graphHeight}) => {
    window.__canvasStatePreviousMap = window.__webglGeneratorApp?.map || null;
    document.getElementById("auto-random-seed").checked = false;
    document.getElementById("seed-input").value = seed;
    document.getElementById("cells-input").value = String(cells);
    document.getElementById("width-input").value = String(graphWidth);
    document.getElementById("height-input").value = String(graphHeight);
    document.getElementById("heightmap-template").value = template;
    document.getElementById("generate-map").click();
  }, options);
  await page.waitForFunction(expected => {
    const app = window.__webglGeneratorApp;
    const loading = document.getElementById("generation-loading");
    return app?.map && app.map !== window.__canvasStatePreviousMap &&
      app.map.metadata?.seed === expected.seed &&
      app.map.metadata?.cellsTarget === expected.cells &&
      app.renderer?.getStats?.()?.draw?.glError === 0 && loading?.hidden === true;
  }, {cells: options.cells, seed: options.seed}, {timeout: timeoutMs});
}

async function runTransitionSuite(page, target, {record}) {
  const actionIds = [
    "color-states",
    "color-height",
    "layer-routes-off",
    "layer-routes-on",
    "layer-rivers-off",
    "layer-rivers-on",
    "layer-labels-off",
    "layer-labels-on",
    "layer-cities-off",
    "layer-cities-on",
    "layer-markers-off",
    "layer-markers-on",
    "layer-zones-off",
    "layer-zones-on",
    "layer-military-off",
    "layer-military-on",
    "fit-to-view",
    "select-largest-state",
    "hover-largest-state",
    "locate-largest-state"
  ];
  const results = [];
  for (const id of actionIds) {
    const result = await runActionCase(page, id, target, {record});
    if (record) results.push(result);
  }
  return results;
}

async function runActionCase(page, id, target, {
  record,
  prepared = false,
  cleanup = true,
  restore = true,
  markPrefix = `canvas-perf-${id}`
}) {
  const entry = await captureState(page);
  let result = null;
  let failure = null;
  try {
    if (!prepared) {
      await prepareAction(page, id, target);
      await requireRendererStable(page, {includeLocateFlash: false}, `${id} 前置状态`);
    }
    const before = await captureState(page);
    const startedAt = await performAction(page, id, target, markPrefix);
    const dirtyClean = id === "locate-largest-state"
      ? await waitForRendererStable(page, {includeLocateFlash: true, requireEventQuiet: false})
      : null;
    const stable = await waitForRendererStable(page, {includeLocateFlash: false, endMarkPrefix: markPrefix});
    const measured = await page.evaluate(({startedAt, completedAt}) => {
      const probe = window.__canvasStateProfileProbe || {longTasks: []};
      return {
        elapsedMs: roundBrowser(Math.max(0, completedAt - startedAt)),
        longTasks: probe.longTasks
          .filter(item => Number(item.startTime || 0) < completedAt && Number(item.startTime || 0) + Number(item.duration || 0) > startedAt)
          .map(item => ({startTime: roundBrowser(item.startTime), duration: roundBrowser(item.duration)}))
      };

      function roundBrowser(value) {
        return Math.round(Number(value || 0) * 100) / 100;
      }
    }, {startedAt, completedAt: stable.completedAt});
    const after = await captureState(page);
    const deltas = eventDelta(before.events, after.events);
    const failures = validateAction(id, before, after, stable, dirtyClean, target, deltas);
    result = {
      id,
      elapsedMs: measured.elapsedMs,
      timingBoundary: "browser-action-dispatch-to-three-consecutive-stable-frame-intervals",
      dirtyClean,
      stable,
      longTasks: measured.longTasks,
      eventDelta: deltas,
      before: compactState(before),
      after: compactState(after),
      failures,
      passed: failures.length === 0
    };
  } catch (error) {
    failure = error;
  } finally {
    if (cleanup || restore) {
      const recoveryErrors = [];
      if (cleanup) {
        try {
          await cleanupAction(page, id);
        } catch (error) {
          recoveryErrors.push(error);
        }
      }
      if (restore) {
        try {
          await restoreCapturedState(page, entry);
        } catch (error) {
          recoveryErrors.push(error);
        }
      }
      try {
        await requireRendererStable(page, {includeLocateFlash: false}, `${id} 恢复后`);
        const restored = await captureState(page);
        const restorationFailures = restore ? validateRestoredState(entry, restored) : [];
        if (result) {
          result.restoration = {after: compactState(restored), failures: restorationFailures, passed: restorationFailures.length === 0};
          result.failures.push(...restorationFailures.map(message => `恢复失败：${message}`));
          result.passed = result.failures.length === 0;
        } else if (restorationFailures.length) {
          throw new Error(restorationFailures.join("；"));
        }
      } catch (restoreError) {
        recoveryErrors.push(restoreError);
      }
      if (recoveryErrors.length) {
        const restoreFailure = recoveryErrors.length === 1 ? recoveryErrors[0] : new AggregateError(recoveryErrors, `${id} 恢复流程失败`);
        failure = failure ? new AggregateError([failure, restoreFailure], `${id} 动作与恢复均失败`) : restoreFailure;
      }
    }
  }
  if (failure) throw failure;
  if (!record) return null;
  return result;
}

async function prepareAction(page, id, target) {
  if (id === "color-height") {
    await page.evaluate(() => {
      const result = window.webglGeneratorApi.layers.setViewMode("states");
      if (!result?.ok) throw new Error(result?.error?.message || "国家专题预置失败");
    });
  }
  if (id.endsWith("-on")) {
    const layers = layersForAction(id);
    await page.evaluate(layers => {
      for (const layer of layers) {
        const result = window.webglGeneratorApi.layers.setVisible(layer, false);
        if (!result?.ok) throw new Error(result?.error?.message || `图层 ${layer} 预置失败`);
      }
    }, layers);
  }
  if (id === "layer-zones-off") {
    const layers = layersForAction(id);
    await page.evaluate(layers => {
      for (const layer of layers) {
        const result = window.webglGeneratorApi.layers.setVisible(layer, true);
        if (!result?.ok) throw new Error(result?.error?.message || `图层 ${layer} 预置失败`);
      }
    }, layers);
  }
  if (id === "fit-to-view") await prepareOffCenterCamera(page);
  if (id === "select-largest-state" || id === "hover-largest-state" || id === "locate-largest-state") {
    await page.evaluate(() => {
      const renderer = window.__webglGeneratorApp.renderer;
      const result = window.webglGeneratorApi.selection.clear();
      if (!result?.ok) throw new Error(result?.error?.message || "selection 预置清理失败");
      renderer.onHover?.(null);
    });
  }
  if (id === "hover-largest-state") {
    await movePointerOutsideCanvas(page);
    await page.evaluate(() => {
      window.__webglGeneratorApp.renderer.onHover?.(null);
      if (window.__webglGeneratorApp.pick !== null) throw new Error("hover 前置清理后 app.pick 仍非空");
    });
  }
  if (id === "locate-largest-state") await page.evaluate(() => window.__canvasStateCancelLocateFlash?.(window.__webglGeneratorApp.renderer));
  void target;
}

async function performAction(page, id, target, markPrefix) {
  if (id === "color-states" || id === "color-height") {
    const expected = id === "color-states" ? "states" : "height";
    return page.evaluate(({expected, markPrefix}) => {
      const renderer = window.__webglGeneratorApp.renderer;
      const startedAt = markActionStart(markPrefix);
      const result = window.webglGeneratorApi.layers.setViewMode(expected);
      if (!result?.ok) throw new Error(result?.error?.message || `colorMode 切换到 ${expected} 失败`);
      if (renderer.getStats().colorMode !== expected) throw new Error(`colorMode 未切换到 ${expected}`);
      return startedAt;

      function markActionStart(prefix) {
        performance.clearMarks(`${prefix}-start`);
        performance.mark(`${prefix}-start`);
        return performance.now();
      }
    }, {expected, markPrefix});
  }
  if (id.startsWith("layer-")) {
    const visible = id.endsWith("-on");
    const layers = layersForAction(id);
    if (id.includes("labels")) {
      return page.evaluate(({layers, visible, markPrefix}) => {
        const renderer = window.__webglGeneratorApp.renderer;
        const startedAt = markActionStart(markPrefix);
        renderer.setLayersVisible(layers.map(layer => [layer, visible]));
        for (const layer of layers) {
          if (renderer.getStats().layerVisibility?.[layer] !== visible) throw new Error(`图层 ${layer} 状态不符`);
        }
        return startedAt;

        function markActionStart(prefix) {
          performance.clearMarks(`${prefix}-start`);
          performance.mark(`${prefix}-start`);
          return performance.now();
        }
      }, {layers, visible, markPrefix});
    }
    if (id.includes("markers") || id.includes("zones")) {
      return page.evaluate(({layers, visible, markPrefix}) => {
        const renderer = window.__webglGeneratorApp.renderer;
        const control = [...document.querySelectorAll("[data-layer-group]")].find(item => {
          const members = String(item.dataset.layerGroup || "").split(",").map(value => value.trim()).filter(Boolean);
          return members.length === layers.length && layers.every(layer => members.includes(layer));
        });
        if (!control) throw new Error("没有找到目标组合图层按钮");
        if ((control.getAttribute("aria-pressed") === "true") === visible) throw new Error("组合图层动作前已是目标状态");
        const startedAt = markActionStart(markPrefix);
        control.click();
        for (const layer of layers) {
          if (renderer.getStats().layerVisibility?.[layer] !== visible) throw new Error(`图层 ${layer} 状态不符`);
        }
        return startedAt;

        function markActionStart(prefix) {
          performance.clearMarks(`${prefix}-start`);
          performance.mark(`${prefix}-start`);
          return performance.now();
        }
      }, {layers, visible, markPrefix});
    }
    return page.evaluate(({layers, visible, markPrefix}) => {
      const renderer = window.__webglGeneratorApp.renderer;
      const startedAt = markActionStart(markPrefix);
      for (const layer of layers) {
        const result = window.webglGeneratorApi.layers.setVisible(layer, visible);
        if (!result?.ok) throw new Error(result?.error?.message || `图层 ${layer} 切换失败`);
      }
      for (const layer of layers) {
        if (renderer.getStats().layerVisibility?.[layer] !== visible) throw new Error(`图层 ${layer} 状态不符`);
      }
      return startedAt;

      function markActionStart(prefix) {
        performance.clearMarks(`${prefix}-start`);
        performance.mark(`${prefix}-start`);
        return performance.now();
      }
    }, {layers, visible, markPrefix});
  }
  if (id === "fit-to-view") {
    return page.evaluate(markPrefix => {
      const startedAt = markActionStart(markPrefix);
      const result = window.webglGeneratorApi.layers.fitView();
      if (!result?.ok) throw new Error(result?.error?.message || "适配视图失败");
      return startedAt;

      function markActionStart(prefix) {
        performance.clearMarks(`${prefix}-start`);
        performance.mark(`${prefix}-start`);
        return performance.now();
      }
    }, markPrefix);
  }
  if (id === "select-largest-state") {
    return page.evaluate(({target, markPrefix}) => {
      const startedAt = markActionStart(markPrefix);
      const result = window.webglGeneratorApi.selection.select({kind: "state", id: target.id});
      if (!result?.ok) throw new Error(result?.error?.message || "最大国家选择失败");
      return startedAt;

      function markActionStart(prefix) {
        performance.clearMarks(`${prefix}-start`);
        performance.mark(`${prefix}-start`);
        return performance.now();
      }
    }, {target, markPrefix});
  }
  if (id === "hover-largest-state") {
    await page.evaluate(markPrefix => {
      const canvas = document.getElementById("map-canvas");
      window.__canvasStateActionStartedAt = null;
      canvas.addEventListener("pointermove", () => {
        performance.clearMarks(`${markPrefix}-start`);
        performance.mark(`${markPrefix}-start`);
        window.__canvasStateActionStartedAt = performance.now();
      }, {capture: true, once: true});
    }, markPrefix);
    const point = await targetClientPoint(page, target);
    await page.mouse.move(point.x, point.y);
    await page.waitForFunction(() => Number.isFinite(window.__canvasStateActionStartedAt), null, {timeout: stableTimeoutMs});
    return page.evaluate(() => window.__canvasStateActionStartedAt);
  }
  if (id === "locate-largest-state") {
    return page.evaluate(({target, markPrefix}) => {
      const startedAt = markActionStart(markPrefix);
      const result = window.webglGeneratorApi.selection.locate({kind: "state", id: target.id});
      if (!result?.ok) throw new Error(result?.error?.message || "最大国家定位失败");
      if (!result.data?.located) throw new Error("最大国家定位返回 located=false");
      return startedAt;

      function markActionStart(prefix) {
        performance.clearMarks(`${prefix}-start`);
        performance.mark(`${prefix}-start`);
        return performance.now();
      }
    }, {target, markPrefix});
  }
  throw new Error(`未知状态动作：${id}`);
}

async function cleanupAction(page, id) {
  if (id === "hover-largest-state") {
    await movePointerOutsideCanvas(page);
    await page.evaluate(() => {
      window.__webglGeneratorApp.renderer.onHover?.(null);
      if (window.__webglGeneratorApp?.pick !== null) throw new Error("hover 清理后 app.pick 仍非空");
    });
  }
  if (id === "locate-largest-state") {
    await page.evaluate(() => window.__canvasStateCancelLocateFlash?.(window.__webglGeneratorApp.renderer));
  }
  if (id === "select-largest-state" || id === "locate-largest-state") {
    await page.evaluate(() => {
      const result = window.webglGeneratorApi.selection.clear();
      if (!result?.ok) throw new Error(result?.error?.message || "selection 清理失败");
    });
  }
}

function layersForAction(id) {
  if (id.includes("routes")) return ["routes"];
  if (id.includes("rivers")) return ["rivers"];
  if (id.includes("labels")) return ["labels", "stateLabels", "provinceLabels", "zoneLabels"];
  if (id.includes("cities")) return ["cities"];
  if (id.includes("markers")) return ["markers", "resources"];
  if (id.includes("zones")) return ["zones", "zoneEvents", "zoneNatural", "zoneWilderness", "zoneLabels"];
  if (id.includes("military")) return ["military"];
  return [];
}

async function prepareOffCenterCamera(page) {
  const box = await page.locator("#map-canvas").boundingBox();
  const center = {x: box.x + box.width * 0.55, y: box.y + box.height * 0.48};
  await page.mouse.move(center.x, center.y);
  await page.mouse.wheel(0, -420);
  await delay(80);
  await page.mouse.move(center.x - 90, center.y - 45);
  await page.mouse.down({button: "middle"});
  await page.mouse.move(center.x + 75, center.y + 55, {steps: 6});
  await page.mouse.up({button: "middle"});
  await requireRendererStable(page, {includeLocateFlash: false}, "fit-to-view 相机预置后");
}

async function movePointerOutsideCanvas(page) {
  await page.mouse.move(4, 4);
}

async function targetClientPoint(page, target) {
  return page.evaluate(target => {
    const renderer = window.__webglGeneratorApp.renderer;
    const rect = renderer.canvas.getBoundingClientRect();
    const local = renderer.worldToScreen(target.x, target.y, rect);
    return {x: rect.left + local.x, y: rect.top + local.y};
  }, target);
}

async function restoreNeutralState(page) {
  await page.evaluate(() => {
    const renderer = window.__webglGeneratorApp.renderer;
    window.__canvasStateCancelLocateFlash?.(renderer);
    renderer.onHover?.(null);
    if (window.__webglGeneratorApp.pick !== null) throw new Error("中性状态恢复时 hover 未清空");
    const selectionResult = window.webglGeneratorApi.selection.clear();
    if (!selectionResult?.ok) throw new Error(selectionResult?.error?.message || "selection 恢复失败");
    const modeResult = window.webglGeneratorApi.layers.setViewMode("height");
    if (!modeResult?.ok) throw new Error(modeResult?.error?.message || "height mode 恢复失败");
    const layers = ["routes", "rivers", "labels", "stateLabels", "provinceLabels", "zoneLabels", "cities", "markers", "resources", "military", "measurements"];
    for (const layer of layers) {
      const result = window.webglGeneratorApi.layers.setVisible(layer, true);
      if (!result?.ok) throw new Error(result?.error?.message || `图层 ${layer} 恢复失败`);
    }
    const fitResult = window.webglGeneratorApi.layers.fitView();
    if (!fitResult?.ok) throw new Error(fitResult?.error?.message || "相机恢复失败");
  });
  await requireRendererStable(page, {includeLocateFlash: false}, "中性状态恢复后");
}

async function restoreCapturedState(page, snapshot) {
  await page.evaluate(snapshot => {
    const app = window.__webglGeneratorApp;
    const renderer = app?.renderer;
    const api = window.webglGeneratorApi;
    if (!app?.map || !renderer || !api) throw new Error("无法恢复动作入口状态：runtime 未就绪");
    window.__canvasStateCancelLocateFlash?.(renderer);
    const current = renderer.getStats();
    if (snapshot.colorMode && current.colorMode !== snapshot.colorMode) {
      const modeResult = api.layers.setViewMode(snapshot.colorMode);
      if (!modeResult?.ok) throw new Error(modeResult?.error?.message || "动作入口 colorMode 恢复失败");
    }
    for (const [layer, visible] of Object.entries(snapshot.layers || {})) {
      if (renderer.getStats().layerVisibility?.[layer] === visible) continue;
      const layerResult = api.layers.setVisible(layer, visible);
      if (!layerResult?.ok) throw new Error(layerResult?.error?.message || `动作入口图层 ${layer} 恢复失败`);
    }
    const selectionResult = snapshot.selection
      ? api.selection.select(snapshot.selection)
      : api.selection.clear();
    if (!selectionResult?.ok) throw new Error(selectionResult?.error?.message || "动作入口 selection 恢复失败");
    if (snapshot.camera) {
      renderer.camera.scale = Number(snapshot.camera.scale);
      renderer.camera.offsetX = Number(snapshot.camera.offsetX);
      renderer.camera.offsetY = Number(snapshot.camera.offsetY);
      renderer.drawViewportPreview();
    }
    if (snapshot.hover?.gridCell !== null && Number.isInteger(snapshot.hover?.gridCell)) {
      const point = app.map.grid?.points?.[snapshot.hover.gridCell];
      const rect = renderer.canvas.getBoundingClientRect();
      if (point) {
        const screen = renderer.worldToScreen(point[0], point[1], rect);
        renderer.onHover?.(renderer.pickClientPoint(rect.left + screen.x, rect.top + screen.y));
      } else {
        renderer.onHover?.(null);
      }
    } else {
      renderer.onHover?.(null);
    }
  }, snapshot);
}

function validateRestoredState(expected, actual) {
  const failures = [];
  if (expected.checksum !== actual.checksum) failures.push("checksum 不一致");
  if (expected.mapRevision !== actual.mapRevision) failures.push("revision 不一致");
  if (expected.colorMode !== actual.colorMode) failures.push("colorMode 不一致");
  if (!sameValue(expected.camera, actual.camera)) failures.push("camera 不一致");
  if (!sameValue(expected.layers, actual.layers)) failures.push("layers 不一致");
  if (!sameValue(expected.selection, actual.selection)) failures.push("runtime selection 不一致");
  if (!sameValue(expected.rendererSelection, actual.rendererSelection)) failures.push("renderer selection 不一致");
  if (!sameValue(expected.hover, actual.hover)) failures.push("hover 不一致");
  return failures;
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function findLargestStateTarget(page) {
  return page.evaluate(() => {
    const map = window.__webglGeneratorApp?.map;
    const ids = map?.grid?.cells?.state || [];
    const heights = map?.grid?.cells?.h || [];
    const points = map?.grid?.points || [];
    const counts = new Map();
    const cells = new Map();
    for (let cell = 0; cell < ids.length; cell++) {
      const id = Number(ids[cell]);
      if (!Number.isInteger(id) || id <= 0 || Number(heights[cell]) < 20) continue;
      counts.set(id, (counts.get(id) || 0) + 1);
      if (!cells.has(id)) cells.set(id, []);
      cells.get(id).push(cell);
    }
    const [id, count] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0] || [];
    if (!Number.isInteger(id)) return null;
    const stateCells = cells.get(id) || [];
    const centroid = stateCells.reduce((sum, cell) => {
      const point = points[cell] || [0, 0];
      sum.x += Number(point[0] || 0);
      sum.y += Number(point[1] || 0);
      return sum;
    }, {x: 0, y: 0});
    centroid.x /= Math.max(1, stateCells.length);
    centroid.y /= Math.max(1, stateCells.length);
    let centerCell = stateCells[0];
    let bestDistance = Infinity;
    for (const cell of stateCells) {
      const point = points[cell] || [0, 0];
      const distance = Math.hypot(Number(point[0] || 0) - centroid.x, Number(point[1] || 0) - centroid.y);
      if (distance < bestDistance || (distance === bestDistance && cell < centerCell)) {
        bestDistance = distance;
        centerCell = cell;
      }
    }
    const point = points[centerCell] || [centroid.x, centroid.y];
    return {kind: "state", id, landCells: count, centerCell, x: Number(point[0]), y: Number(point[1])};
  });
}

async function waitForRendererStable(page, {includeLocateFlash, requireEventQuiet = true, endMarkPrefix = ""}) {
  return page.evaluate(({stableTimeoutMs, includeLocateFlash, requireEventQuiet, endMarkPrefix}) => new Promise(resolveStable => {
    const startedAt = performance.now();
    let previousKey = "";
    let stableFrames = 0;
    let last = null;
    const tick = () => {
      const renderer = window.__webglGeneratorApp?.renderer;
      const stats = renderer?.getStats?.();
      if (!renderer || !stats) {
        if (performance.now() - startedAt >= stableTimeoutMs) {
          const completedAt = performance.now();
          return resolveStable({completed: false, completedAt: roundBrowser(completedAt), quietConfirmationMs: roundBrowser(completedAt - startedAt), reason: "renderer-missing"});
        }
        return requestAnimationFrame(tick);
      }
      const dynamic = stats.dynamicMeshCache || {};
      const events = stats.performanceEvents || {};
      const viewport = events.viewportCommit || {};
      const app = window.__webglGeneratorApp;
      const loading = document.getElementById("generation-loading");
      const routesClean = stats.layerVisibility?.routes === false || dynamic.routesDirty === false;
      const riversClean = stats.layerVisibility?.rivers === false || dynamic.riversDirty === false;
      const selectionClean = dynamic.selectionDirty === false;
      const locateReady = includeLocateFlash || !renderer.locateFlash;
      const runtimeReady = Boolean(app?.map) && renderer.map === app.map && loading?.hidden === true;
      const clean = runtimeReady && routesClean && riversClean && selectionClean && stats.overlay?.interactionSuspended === false && !viewport.pending && !viewport.running && !renderer.viewportCommitTimer && locateReady;
      const sequences = eventSequences(stats);
      const key = JSON.stringify(sequences);
      stableFrames = clean && (!requireEventQuiet || key === previousKey) ? stableFrames + 1 : 0;
      previousKey = key;
      last = {clean, runtimeReady, sequences, locateActive: Boolean(renderer.locateFlash), viewport};
      if (stableFrames >= 3) {
        const completedAt = performance.now();
        if (endMarkPrefix) {
          performance.clearMarks(`${endMarkPrefix}-end`);
          performance.mark(`${endMarkPrefix}-end`);
        }
        return resolveStable({completed: true, completedAt: roundBrowser(completedAt), quietConfirmationMs: roundBrowser(completedAt - startedAt), frames: stableFrames, ...last});
      }
      if (performance.now() - startedAt >= stableTimeoutMs) {
        const completedAt = performance.now();
        return resolveStable({completed: false, completedAt: roundBrowser(completedAt), quietConfirmationMs: roundBrowser(completedAt - startedAt), frames: stableFrames, ...last});
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    function eventSequences(stats) {
      const events = stats.performanceEvents || {};
      return Object.fromEntries(Object.entries(events).map(([key, value]) => [key, Number(value?.sequence || 0)]));
    }

    function roundBrowser(value) {
      return Math.round(Number(value || 0) * 100) / 100;
    }
  }), {stableTimeoutMs, includeLocateFlash, requireEventQuiet, endMarkPrefix});
}

async function requireRendererStable(page, options, label) {
  const result = await waitForRendererStable(page, options);
  if (!result.completed) throw new Error(`${label}未在 ${stableTimeoutMs}ms 内稳定：${JSON.stringify(result)}`);
  return result;
}

async function captureState(page) {
  return page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const renderer = app?.renderer;
    const stats = renderer?.getStats?.() || {};
    const revision = app?.mapRevision?.getSnapshot?.() || {};
    return {
      seed: app?.map?.metadata?.seed || null,
      cellsTarget: app?.map?.metadata?.cellsTarget || 0,
      gridCells: app?.map?.metadata?.gridCells || 0,
      packCells: app?.map?.metadata?.packCells || 0,
      checksum: app?.map?.summary?.checksum || null,
      mapRevision: revision.mapRevision ?? null,
      camera: stats.camera || null,
      colorMode: stats.colorMode || null,
      layers: stats.layerVisibility || {},
      selection: summarizeObject(app?.selection?.object),
      rendererSelection: summarizeObject(renderer?.selection),
      hover: summarizePick(app?.pick),
      events: renderer?.getPerformanceEvents?.({includeRecent: true}) || stats.performanceEvents || {},
      stats: {
        draw: stats.draw || null,
        overlay: stats.overlay || null,
        loadMap: stats.loadMap || null,
        dynamicMeshCache: stats.dynamicMeshCache || null,
        routeBuildMs: stats.routeBuildMs || 0,
        riverBuildMs: stats.riverBuildMs || 0,
        selectionBuildMs: stats.selectionBuildMs || 0,
        vertexCount: stats.vertexCount || 0,
        lineVertexCount: stats.lineVertexCount || 0,
        pointVertexCount: stats.pointVertexCount || 0
      }
    };

    function summarizePick(pick) {
      if (!pick) return null;
      return {
        gridCell: Number.isInteger(pick.gridCell) ? pick.gridCell : null,
        object: pick.object ? {kind: pick.object.kind, id: pick.object.id} : null
      };
    }

    function summarizeObject(object) {
      return object ? {kind: object.kind, id: object.id} : null;
    }
  });
}

async function readPageEnvironment(page) {
  return page.evaluate(() => {
    const renderer = window.__webglGeneratorApp?.renderer;
    const gl = renderer?.gl;
    const debugInfo = gl?.getExtension?.("WEBGL_debug_renderer_info");
    return {
      userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency || null,
      deviceMemoryGiB: navigator.deviceMemory || null,
      devicePixelRatio: window.devicePixelRatio,
      webglVendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : gl?.getParameter?.(gl.VENDOR) || null,
      webglRenderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl?.getParameter?.(gl.RENDERER) || null
    };
  });
}

function validateAction(id, before, after, stable, dirtyClean, target, deltas) {
  const failures = [];
  if (!stable.completed) failures.push(`${id} 未在 ${stableTimeoutMs}ms 内稳定`);
  if (before.checksum !== after.checksum) failures.push(`${id} 改变地图 checksum`);
  if (before.mapRevision !== after.mapRevision) failures.push(`${id} 改变地图 revision`);
  if (after.stats?.draw?.glError !== 0) failures.push(`${id} WebGL error ${after.stats?.draw?.glError}`);
  if (id === "color-states" && after.colorMode !== "states") failures.push("国家专题没有保持 states mode");
  if (id === "color-height" && after.colorMode !== "height") failures.push("高度专题没有恢复 height mode");
  if ((id === "color-states" || id === "color-height") && deltas?.surfaceRefresh?.recent?.some(event => event.status === "completed" && event.geometryReused !== true)) {
    failures.push(`${id} 没有复用 surface geometry`);
  }
  if (id.startsWith("layer-")) {
    const expected = id.endsWith("-on");
    for (const layer of layersForAction(id)) {
      if (after.layers?.[layer] !== expected) failures.push(`${id} 后图层 ${layer} 不是 ${expected}`);
    }
  }
  if (id === "fit-to-view") {
    if (before.camera?.scale === 1 && before.camera?.offsetX === 0 && before.camera?.offsetY === 0) failures.push("fit-to-view 前相机仍是全图，动作退化为 no-op");
    if (after.camera?.scale !== 1 || after.camera?.offsetX !== 0 || after.camera?.offsetY !== 0) failures.push("fit-to-view 后相机未回到全图");
  }
  if (id === "select-largest-state" || id === "locate-largest-state") {
    if (after.selection?.kind !== "state" || Number(after.selection?.id) !== Number(target.id)) failures.push(`${id} 没有选中目标国家 #${target.id}`);
    if (after.rendererSelection?.kind !== "state" || Number(after.rendererSelection?.id) !== Number(target.id)) failures.push(`${id} 的 renderer selection 未同步目标国家 #${target.id}`);
  }
  if (id === "hover-largest-state" && Number(after.hover?.gridCell) !== Number(target.centerCell)) failures.push(`${id} 没有命中目标中心 cell #${target.centerCell}`);
  if (id === "locate-largest-state" && !dirtyClean?.completed) failures.push(`${id} 的 dirty-clean 时点未在期限内到达`);
  if (id === "locate-largest-state" && dirtyClean?.locateActive !== true) failures.push(`${id} 的 dirty-clean 时点没有保留产品闪烁`);
  if (id === "locate-largest-state" && stable?.locateActive) failures.push(`${id} 最终稳定时产品闪烁仍在运行`);
  if (id.includes("labels") || id.includes("markers") || id.includes("zones")) {
    for (const key of ["draw", "overlay", "lineRefresh", "pointRefresh"]) {
      if (Number(deltas?.[key]?.count || 0) > 1) failures.push(`${id} 的 ${key} 事件 ${deltas[key].count} 次，超过批事务预算 1`);
    }
  }
  if (id === "locate-largest-state") {
    if (Number(deltas?.overlay?.count || 0) > 2) failures.push(`locate overlay 事件 ${deltas.overlay.count} 次，超过预算 2`);
    if (Number(deltas?.selectionMesh?.count || 0) > 18) failures.push(`locate selection mesh ${deltas.selectionMesh.count} 次，超过 180ms 相位预算 18`);
  }
  for (const [key, delta] of Object.entries(deltas || {})) {
    if (delta.failed > 0) failures.push(`${id} 的 ${key} 事件出现 ${delta.failed} 次 failed`);
  }
  for (const event of deltas?.draw?.recent || []) {
    if (event.status === "completed" && Number(event.glError || 0) !== 0) failures.push(`${id} draw #${event.sequence} WebGL error ${event.glError}`);
  }
  return failures;
}

function validateSuite({before, after, actions, consoleErrors}) {
  const failures = actions.flatMap(action => action.failures.map(message => `${action.id}: ${message}`));
  if (before.checksum !== after.checksum) failures.push("状态调查前后 checksum 不一致");
  if (before.mapRevision !== after.mapRevision) failures.push("状态调查前后 revision 不一致");
  if (after.colorMode !== "height") failures.push("状态调查后未恢复 height mode");
  if (!sameValue(before.camera, after.camera)) failures.push("状态调查后相机未恢复");
  if (!sameValue(before.layers, after.layers)) failures.push("状态调查后完整 layers 未恢复");
  if (!sameValue(before.selection, after.selection)) failures.push("状态调查后 runtime selection 未恢复");
  if (!sameValue(before.rendererSelection, after.rendererSelection)) failures.push("状态调查后 renderer selection 未恢复");
  if (!sameValue(before.hover, after.hover)) failures.push("状态调查后 hover 未恢复");
  if (consoleErrors.length) failures.push(`console/page error ${consoleErrors.length} 条`);
  return failures;
}

function eventDelta(before = {}, after = {}) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return Object.fromEntries([...keys].map(key => {
    const first = before[key] || {};
    const last = after[key] || {};
    const firstSequence = Number(first.sequence || 0);
    const lastSequence = Number(last.sequence || 0);
    const recent = (last.recent || []).filter(event => Number(event.sequence || 0) > firstSequence && Number(event.sequence || 0) <= lastSequence);
    const completedMs = recent.filter(event => event.status === "completed").map(event => Number(event.ms || 0));
    return [key, {
      count: Math.max(0, lastSequence - firstSequence),
      completed: Math.max(0, Number(last.completed || 0) - Number(first.completed || 0)),
      canceled: Math.max(0, Number(last.canceled || 0) - Number(first.canceled || 0)),
      failed: Math.max(0, Number(last.failed || 0) - Number(first.failed || 0)),
      captured: recent.length,
      historyTruncated: Math.max(0, lastSequence - firstSequence) > recent.length,
      completedMs: summarizeNumbers(completedMs),
      lastMs: Number(last.ms ?? last.drawMs ?? last.totalMs ?? 0),
      recent,
      last: Object.fromEntries(Object.entries(last).filter(([field]) => field !== "recent"))
    }];
  }));
}

function summarizeNumbers(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return {count: 0, averageMs: 0, p95Ms: 0, maxMs: 0};
  const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return {
    count: sorted.length,
    averageMs: roundMs(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
    p95Ms: roundMs(sorted[p95Index]),
    maxMs: roundMs(sorted.at(-1))
  };
}

function compactState(state) {
  return {
    checksum: state.checksum,
    mapRevision: state.mapRevision,
    camera: state.camera,
    colorMode: state.colorMode,
    layers: state.layers,
    selection: state.selection,
    rendererSelection: state.rendererSelection,
    hover: state.hover,
    events: Object.fromEntries(Object.entries(state.events || {}).map(([key, value]) => [key, Object.fromEntries(Object.entries(value || {}).filter(([field]) => field !== "recent"))])),
    draw: state.stats?.draw,
    dynamicMeshCache: state.stats?.dynamicMeshCache
  };
}

async function profileTrace(context, page, actionId, target, consoleErrors) {
  const entry = await captureState(page);
  const requestedCategories = [
    "devtools.timeline",
    "blink.user_timing",
    "v8.execute",
    "disabled-by-default-devtools.timeline",
    "disabled-by-default-devtools.timeline.frame",
    "disabled-by-default-gpu.service"
  ];
  let client = null;
  let tracingStarted = false;
  let tracingEnded = false;
  let tracingComplete = null;
  let completedPayload = null;
  let openStreamHandle = null;
  try {
    await prepareAction(page, actionId, target);
    await requireRendererStable(page, {includeLocateFlash: false}, `${actionId} trace 前置状态`);
    client = await context.newCDPSession(page);
    const availableCategories = await client.send("Tracing.getCategories").then(result => result.categories || []).catch(() => []);
    await client.send("Tracing.start", {categories: requestedCategories.join(","), transferMode: "ReturnAsStream"});
    tracingStarted = true;
    tracingComplete = waitForCdpEvent(client, "Tracing.tracingComplete", 30000);
    const action = await runActionCase(page, actionId, target, {
      record: true,
      prepared: true,
      cleanup: false,
      restore: false,
      markPrefix: "canvas-perf-trace"
    });
    await client.send("Tracing.end");
    tracingEnded = true;
    completedPayload = await tracingComplete;
    openStreamHandle = completedPayload?.stream || null;
    if (!openStreamHandle) throw new Error("Tracing.tracingComplete 未返回 stream handle");
    const traceFile = await writeProtocolStreamToFile(client, openStreamHandle, outPath);
    openStreamHandle = null;
    const failures = [...action.failures];
    if (consoleErrors.length) failures.push(`console/page error ${consoleErrors.length} 条`);
    return {
      metadata: metadata({baseUrl: `http://${host}:${port}`, consoleErrors, traceAction: actionId}),
      environment: await readPageEnvironment(page),
      trace: {
        requestedCategories,
        availableCategories,
        gpuCategoryAvailable: availableCategories.some(category => /gpu/i.test(category)),
        gpuTrackAvailable: traceFile.gpuTrackAvailable,
        bytes: traceFile.bytes,
        output: outPath
      },
      action,
      failures,
      passed: failures.length === 0
    };
  } finally {
    if (client && tracingStarted && !tracingEnded) {
      try {
        await client.send("Tracing.end");
        tracingEnded = true;
        completedPayload = await tracingComplete;
        openStreamHandle = completedPayload?.stream || null;
      } catch {
        // The outer failure report retains the primary trace error.
      }
    }
    if (client && openStreamHandle) await client.send("IO.close", {handle: openStreamHandle}).catch(() => {});
    if (client) await client.detach().catch(() => {});
    await cleanupAction(page, actionId);
    await restoreCapturedState(page, entry);
    await requireRendererStable(page, {includeLocateFlash: false}, `${actionId} trace 清理后`);
  }
}

function waitForCdpEvent(client, eventName, eventTimeoutMs) {
  return new Promise((resolveEvent, rejectEvent) => {
    const timer = setTimeout(() => {
      client.off?.(eventName, onEvent);
      rejectEvent(new Error(`${eventName} 在 ${eventTimeoutMs}ms 内未返回`));
    }, eventTimeoutMs);
    const onEvent = payload => {
      clearTimeout(timer);
      resolveEvent(payload);
    };
    client.once(eventName, onEvent);
  });
}

async function writeProtocolStreamToFile(client, handle, file) {
  const output = createWriteStream(file);
  let bytes = 0;
  let gpuTrackAvailable = false;
  let scanTail = "";
  try {
    while (true) {
      const chunk = await client.send("IO.read", {handle});
      const buffer = chunk.base64Encoded ? Buffer.from(chunk.data || "", "base64") : Buffer.from(chunk.data || "", "utf8");
      bytes += buffer.length;
      const scanText = `${scanTail}${buffer.toString("utf8")}`;
      if (/"(?:cat|name)":"[^"]*gpu[^"]*"/i.test(scanText)) gpuTrackAvailable = true;
      scanTail = scanText.slice(-256);
      await new Promise((resolveWrite, rejectWrite) => output.write(buffer, error => error ? rejectWrite(error) : resolveWrite()));
      if (chunk.eof) break;
    }
    await new Promise((resolveEnd, rejectEnd) => output.end(error => error ? rejectEnd(error) : resolveEnd()));
  } catch (error) {
    output.destroy();
    throw error;
  } finally {
    await client.send("IO.close", {handle}).catch(() => {});
  }
  return {bytes, gpuTrackAvailable};
}

function metadata(extra = {}) {
  return {
    generatedAt: new Date().toISOString(),
    scenario,
    distDir,
    playwrightDir,
    browserChannel,
    browserVersion: browser?.version?.() || null,
    headless: !headful,
    nodeVersion: process.version,
    platform: process.platform,
    architecture: process.arch,
    viewport,
    deviceScaleFactor: 1,
    cells,
    seed: scenario === "startup" ? "stage-2-1" : seed,
    template,
    graphWidth,
    graphHeight,
    warmup,
    stableTimeoutMs,
    cpuTimingOnly: true,
    healthConsoleEvents: [...healthConsoleEvents],
    ...extra
  };
}

function writeReport(report) {
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (markdownPath) writeFileSync(markdownPath, renderMarkdown(report), "utf8");
  console.log(`Wrote ${outPath}`);
  if (markdownPath) console.log(`Wrote ${markdownPath}`);
  if (!report.passed) process.exitCode = 1;
}

function renderMarkdown(report) {
  const lines = ["# 画布状态性能调查报告", ""];
  lines.push(`- 场景：\`${report.metadata.scenario}\``);
  lines.push(`- 生成时间：${report.metadata.generatedAt}`);
  lines.push(`- Chrome channel：\`${report.metadata.browserChannel}\``);
  lines.push(`- 视口：\`${report.metadata.viewport.width}×${report.metadata.viewport.height} @ DPR 1\``);
  lines.push(`- seed：\`${report.metadata.seed}\``);
  lines.push(`- 计时边界：CPU / 主线程；不把 WebGL 提交耗时解释为 GPU 执行耗时`);
  lines.push(`- 结论：${report.passed ? "通过" : "失败"}`, "");
  if (report.browserTiming) {
    lines.push("## 冷启动", "");
    lines.push(`- navigation 到稳定：${report.browserTiming.navigationToStableMs}ms`);
    lines.push(`- DOMContentLoaded：${report.browserTiming.domContentLoadedMs}ms`);
    lines.push(`- load event：${report.browserTiming.loadEventMs}ms`);
    lines.push(`- 长任务：${report.browserTiming.longTasks.length}`, "");
  }
  if (report.actions) {
    lines.push("## 状态动作", "");
    lines.push("| 动作 | 动作到稳定 | dirty-clean 静默确认 | 最终静默确认 | draw | overlay | surface | line | point | route | river | selection | 长任务 |", "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
    for (const action of report.actions) {
      const event = key => action.eventDelta?.[key]?.count || 0;
      lines.push(`| ${action.id} | ${action.elapsedMs}ms | ${action.dirtyClean?.quietConfirmationMs ?? "-"} | ${action.stable?.quietConfirmationMs ?? "-"} | ${event("draw")} | ${event("overlay")} | ${event("surfaceRefresh")} | ${event("lineRefresh")} | ${event("pointRefresh")} | ${event("routeMesh")} | ${event("riverMesh")} | ${event("selectionMesh")} | ${action.longTasks.length} |`);
    }
    lines.push("");
  }
  if (report.action) {
    lines.push("## Trace 动作", "", `- 动作：\`${report.action.id}\``, `- 总耗时：${report.action.elapsedMs}ms`, `- 长任务：${report.action.longTasks.length}`, "");
  }
  lines.push("## 失败", "");
  if (report.failures?.length) for (const failure of report.failures) lines.push(`- ${failure}`);
  else lines.push("- 无");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function loadPlaywright(directory) {
  try {
    const requireFromDirectory = createRequire(join(directory, "package.json"));
    return requireFromDirectory("playwright");
  } catch (error) {
    fail(`无法从 ${directory} 加载 Playwright：${error.message}`);
  }
}

async function startStaticServer({host, port, publicDir}) {
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url || "/", `http://${request.headers.host || `${host}:${port}`}`);
    const relativePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, "");
    const normalizedPath = normalize(relativePath || "index.html");
    const target = resolve(publicDir, normalizedPath);
    const relativeTarget = relative(publicDir, target);
    if (relativeTarget.startsWith("..") || isAbsolute(relativeTarget)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }
    let file = target;
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file) || !statSync(file).isFile()) {
      const fallback = join(publicDir, "index.html");
      if (existsSync(fallback) && !extname(target)) file = fallback;
      else {
        response.writeHead(404);
        response.end("Not found");
        return;
      }
    }
    response.writeHead(200, {"content-type": contentType(file), "cache-control": "no-store, max-age=0"});
    createReadStream(file).pipe(response);
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, host, () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
  return server;
}

function contentType(file) {
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".woff2": "font/woff2"
  };
  return types[extname(file).toLowerCase()] || "application/octet-stream";
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--" || !arg.startsWith("--")) continue;
    const [key, inlineValue] = arg.slice(2).split("=");
    parsed[key] = inlineValue ?? argv[++index] ?? true;
  }
  return parsed;
}

function parseViewport(value) {
  const match = /^(\d+)x(\d+)$/i.exec(String(value || ""));
  return match ? {width: Number(match[1]), height: Number(match[2])} : {width: 1280, height: 820};
}

function parseBoolean(value, fallback) {
  if (value === undefined) return fallback;
  if (value === true) return true;
  return !["0", "false", "no", "off"].includes(String(value).toLowerCase());
}

function delay(ms) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms));
}

function roundMs(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function fail(message) {
  throw new Error(message);
}
