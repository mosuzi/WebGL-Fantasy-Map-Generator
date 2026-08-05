#!/usr/bin/env node
import {createReadStream, existsSync, mkdirSync, statSync, writeFileSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {dirname, extname, isAbsolute, join, normalize, relative, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const host = String(args.host || "127.0.0.1");
const port = Number(args.port || 5448);
const timeoutMs = Number(args.timeout || 240000);
const cells = Number(args.cells || 10000);
const seed = String(args.seed || "overlay-profile-smoke");
const template = String(args.template || "continents");
const graphWidth = Number(args.width || 1440);
const graphHeight = Number(args.height || 960);
const browserChannel = args["browser-channel"] || args.channel || "chrome";
const distDir = resolve(args.dir || join(rootDir, "dist", "webgl-generator"));
const playwrightDir = resolve(args["playwright-dir"] || rootDir);
const outPath = resolve(args.out || join(rootDir, "docs", "generated", "reports", "overlay-profile-results.json"));
const markdownPath = resolve(args.markdown || join(rootDir, "docs", "generated", "reports", "overlay-profile-results.md"));
const viewport = parseViewport(args.viewport || "1280x820");
const maxFrameP95Ms = Number(args["max-frame-p95-ms"] || 80);
const maxOverlayP95Ms = Number(args["max-overlay-p95-ms"] || 35);
const maxIdleCommitMs = Number(args["max-idle-commit-ms"] || 10000);
const maxIdleFrameP95Ms = Number(args["max-idle-frame-p95-ms"] || maxFrameP95Ms);
const measurementFixtureCount = Number(args["measurement-fixture-count"] || 180);
const warmupRuns = parseWarmupRuns(args.warmup, 0);
const enforceThresholds = parseBoolean(args["enforce-thresholds"], true);
const variants = parseVariants(args.variants || args.variant || "full");
const PROFILE_BASE_LAYERS = Object.freeze({
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
  measurements: true
});

if (!existsSync(distDir)) fail(`构建产物不存在：${distDir}`);
if (!existsSync(join(playwrightDir, "package.json"))) fail(`Playwright 依赖目录缺少 package.json：${playwrightDir}`);
mkdirSync(dirname(outPath), {recursive: true});
mkdirSync(dirname(markdownPath), {recursive: true});

const playwright = loadPlaywright(playwrightDir);
const server = await startStaticServer({host, port, publicDir: distDir});
let browser = null;

try {
  browser = await launchBrowser(playwright, {headless: !args.headful, browserChannel});
  const context = await browser.newContext({viewport, deviceScaleFactor: 1});
  await context.addInitScript(() => {
    localStorage.setItem("webgl-generator-control-preferences", JSON.stringify({
      colorMode: "height",
      showOceanHeight: false,
      smoothCellBorders: true,
      showHoverInfo: true,
      maxCityLabels: 5000,
      layers: {
        cities: true,
        labels: true,
        stateLabels: true,
        markers: true,
        resources: true,
        military: true,
        coastline: true,
        lakeShore: true,
        stateBorders: true,
        provinceBorders: true
      }
    }));
  });

  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  const consoleErrors = [];
  const pageErrors = [];
  const healthConsoleEvents = [];
  const renderFrameGapEvents = [];
  const healthErrors = [];
  page.on("console", message => {
    if (message.type() !== "error") return;
    const value = message.text();
    if (!value.startsWith("[FMG health]")) {
      consoleErrors.push(value);
      return;
    }
    if (/^\[FMG health\] main-thread-long-task\b/.test(value)) healthConsoleEvents.push(value);
    else if (/^\[FMG health\] render-frame-gap\b/.test(value)) renderFrameGapEvents.push(value);
    else healthErrors.push(value);
  });
  page.on("pageerror", error => pageErrors.push(error.message));

  const baseUrl = `http://${host}:${port}`;
  await page.goto(baseUrl, {waitUntil: "domcontentloaded", timeout: timeoutMs});
  await page.waitForFunction(() => window.__webglGeneratorApp?.renderer?.getStats?.()?.webgl2, null, {timeout: timeoutMs});
  await page.waitForFunction(() => window.__webglGeneratorApp?.map?.metadata?.generationTiming?.totalMs, null, {timeout: timeoutMs});
  await page.waitForFunction(() => {
    const app = window.__webglGeneratorApp;
    const loading = document.getElementById("generation-loading");
    const generate = document.getElementById("generate-map");
    return app?.map && app.renderer?.map === app.map && loading?.hidden === true && generate?.disabled !== true;
  }, null, {timeout: timeoutMs});
  await generateCase(page, {cells, seed, template, graphWidth, graphHeight});

  const failures = [];
  const thresholdObservations = [];
  const variantReports = [];
  const viewportCoalescing = await verifyViewportCoalescing(page);
  failures.push(...viewportCoalescing.failures.map(message => `viewport rAF 合并：${message}`));
  const runBaselineState = await captureVariantState(page);
  for (const [key, event] of Object.entries(runBaselineState.events)) {
    if (event.failed !== 0) failures.push(`正式调查开始前 renderer ${key} failed 计数不是 0：${event.failed}`);
  }
  for (const variant of variants) {
    const setupAttempts = [];
    const establishScenario = async () => {
      const nextScenario = await setupVariantScenario(page, variant);
      const attemptFailures = [
        ...validateIdleEvidence(nextScenario.setupIdle.canonical, "canonical reset"),
        ...validateIdleEvidence(nextScenario.setupIdle.fixture, "fixture ready")
      ];
      setupAttempts.push({idle: nextScenario.setupIdle, failures: attemptFailures});
      failures.push(...attemptFailures.map(message => `${variant.label} / 场景准备 #${setupAttempts.length}：${message}`));
      return nextScenario;
    };
    let scenario = await establishScenario();
    for (let run = 0; run < warmupRuns; run += 1) {
      await profileZoom(page);
      await waitForOverlayIdle(page);
      await profilePan(page);
      await waitForOverlayIdle(page);
      if (run + 1 < warmupRuns) scenario = await establishScenario();
    }
    if (warmupRuns) scenario = await establishScenario();
    const {fixture, canonicalState, fixtureState, setupIdle} = scenario;
    const fixtureFailures = validateFixtureEvidence(variant, fixture, fixtureState, canonicalState);
    failures.push(...fixtureFailures.map(message => `${variant.label} / 夹具：${message}`));
    const initialStats = await readStats(page);
    const zoom = await profileZoom(page);
    zoom.idleCommit = await waitForOverlayIdle(page);
    const pan = await profilePan(page);
    pan.idleCommit = await waitForOverlayIdle(page);
    await clearProfileHover(page);
    const finalStats = await readStats(page);
    const interactionState = await captureVariantState(page);
    const interactions = [zoom, pan];
    const interactionFailures = validateInteractionEvidence(fixtureState, interactionState);
    failures.push(...interactionFailures.map(message => `${variant.label} / 正式交互：${message}`));
    for (const item of interactions) {
      const budgetFailures = validateContinuousViewportBudget(item);
      failures.push(...budgetFailures.map(message => `${variant.label} / ${item.label}：${message}`));
      if (item.frames.p95Ms > maxFrameP95Ms) thresholdObservations.push(`${variant.label} / ${item.label} 帧 p95 ${item.frames.p95Ms}ms 超过 ${maxFrameP95Ms}ms`);
      if (item.overlay.totalP95Ms > maxOverlayP95Ms) thresholdObservations.push(`${variant.label} / ${item.label} overlay p95 ${item.overlay.totalP95Ms}ms 超过 ${maxOverlayP95Ms}ms`);
      if (!item.idleCommit?.completed) failures.push(`${variant.label} / ${item.label} idle commit 未在 ${Math.min(timeoutMs, 10000)}ms 内完成`);
      if (!item.idleCommit?.recorderReused || !item.idleCommit?.timing?.input?.type) failures.push(`${variant.label} / ${item.label} idle recorder 未从最后一次输入前武装的基线复用`);
      if (item.idleCommit?.viewportCommit?.lastStatus !== "completed") failures.push(`${variant.label} / ${item.label} viewport commit 末事件不是 completed`);
      if ((item.idleCommit?.elapsedMs || 0) > maxIdleCommitMs) thresholdObservations.push(`${variant.label} / ${item.label} idle commit 耗时 ${item.idleCommit.elapsedMs}ms 超过 ${maxIdleCommitMs}ms`);
      if ((item.idleCommit?.frames?.p95Ms || 0) > maxIdleFrameP95Ms) thresholdObservations.push(`${variant.label} / ${item.label} idle commit 帧 p95 ${item.idleCommit.frames.p95Ms}ms 超过 ${maxIdleFrameP95Ms}ms`);
      if (item.glErrors.some(value => value !== 0)) failures.push(`${variant.label} / ${item.label} WebGL error 不为 0`);
      if (item.idleCommit?.glError !== 0) failures.push(`${variant.label} / ${item.label} idle commit WebGL error 不为 0`);
      for (const event of item.workEvents?.draw || []) {
        if (Number(event?.glError ?? 0) !== 0) failures.push(`${variant.label} / ${item.label} draw #${event.sequence || "?"} WebGL error 为 ${event.glError}`);
      }
      for (const event of item.failedRendererEvents || []) failures.push(`${variant.label} / ${item.label} renderer ${event.channel} #${event.sequence} failed：${event.error || "未知错误"}`);
      for (const event of item.idleCommit?.failedRendererEvents || []) failures.push(`${variant.label} / ${item.label} idle renderer ${event.channel} #${event.sequence} failed：${event.error || "未知错误"}`);
    }
    await resetProfileScenario(page);
    const restorationIdle = await waitForOverlayIdle(page);
    const restoredStats = await readStats(page);
    const restoredState = await captureVariantState(page);
    const restorationFailures = validateCanonicalRestoration(canonicalState, restoredState, restorationIdle);
    failures.push(...restorationFailures.map(message => `${variant.label} / 场景恢复：${message}`));
    variantReports.push({
      id: variant.id,
      label: variant.label,
      fixture,
      fixtureExpectation: fixtureExpectation(variant),
      setup: {
        attempts: setupAttempts,
        finalIdle: setupIdle,
        passed: setupAttempts.every(attempt => attempt.failures.length === 0)
      },
      canonicalState,
      fixtureState,
      initialStats,
      finalStats,
      interactionState,
      interactions,
      invariants: {
        fixtureFailures,
        interactionFailures,
        viewportBudgetFailures: interactions.flatMap(item => validateContinuousViewportBudget(item).map(message => `${item.id}: ${message}`)),
        checksumUnchanged: fixtureState.checksum === interactionState.checksum,
        mapRevisionUnchanged: fixtureState.mapRevision === interactionState.mapRevision
      },
      restoration: {
        idle: restorationIdle,
        state: restoredState,
        stats: restoredStats,
        failures: restorationFailures,
        passed: restorationFailures.length === 0
      }
    });
  }
  const runFinalState = await captureVariantState(page);
  failures.push(...failedEventDelta(runBaselineState.events, runFinalState.events).map(key => `全轮 renderer ${key} 事件出现 failed`));
  thresholdObservations.push(...renderFrameGapEvents.map(event => `health render-frame-gap：${event}`));
  failures.push(...healthErrors.map(event => `未豁免 health error：${event}`));
  if (enforceThresholds) failures.push(...thresholdObservations);
  const interactions = variantReports.flatMap(variant => variant.interactions.map(item => ({...item, variant: variant.id, variantLabel: variant.label})));

  const report = {
    metadata: {
      generatedAt: new Date().toISOString(),
      url: baseUrl,
      distDir,
      seed,
      cells,
      template,
      graphWidth,
      graphHeight,
      viewport,
      browserChannel,
      playwrightDir,
      variants: variants.map(variant => variant.id),
      warmupRuns,
      warmupSequence: ["zoom", "idle-commit", "pan", "idle-commit"],
      warmupIncludedInResults: false,
      enforceThresholds,
      maxFrameP95Ms,
      maxOverlayP95Ms,
      maxIdleCommitMs,
      maxIdleFrameP95Ms,
      eventSampleCounts: aggregateEventSampleCounts(interactions),
      rendererFailureCounts: {
        before: Object.fromEntries(Object.entries(runBaselineState.events).map(([key, value]) => [key, value.failed])),
        after: Object.fromEntries(Object.entries(runFinalState.events).map(([key, value]) => [key, value.failed]))
      },
      healthConsoleEvents,
      renderFrameGapEvents,
      healthErrors,
      consoleErrors,
      pageErrors,
      timingBoundaries: {
        frames: "requestAnimationFrame 相邻回调间隔",
        draw: "renderer.draw 的现有 CPU 计时边界；包含同步动态 mesh，截止于 gl.getError 与 overlay 之前",
        overlay: "renderer.updateLabels 的 CPU 墙钟时间",
        mesh: "route / river / selection 顶点构建与对应 WebGL buffer 调用的 CPU 墙钟时间",
        bufferUpload: "performance.now 包围已插桩既有动作内 WebGL bufferData 调用的 CPU 提交边界，不代表 GPU 执行时间",
        idleCommit: "缩放从最后一次 wheel capture 开始；平移从唯一的最后一次、会影响 viewport 的 pointermove capture 开始，随后 mouseup 纳入同一 idle 窗口；直到 viewport commit 无 pending / running、overlay 恢复且相关 dirty 清零，commit pending 与 running 墙钟分开报告",
        idleComponents: "route / river / overlay 是可能嵌套或重叠的事件分项，只分别报告，不相加推导 idle 总耗时",
        instrumentation: "递增序号、事件对象与 PerformanceObserver 的观测开销保留在样本中，没有从结果扣除"
      }
    },
    initialStats: variantReports[0]?.initialStats || null,
    viewportCoalescing,
    lastInteractionStats: variantReports.at(-1)?.finalStats || null,
    finalStats: variantReports.at(-1)?.restoration?.stats || null,
    variants: variantReports,
    interactions,
    thresholdObservations,
    failures,
    passed: !consoleErrors.length && !pageErrors.length && failures.length === 0
  };

  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(markdownPath, renderMarkdown(report), "utf8");
  console.log(`Wrote ${outPath}`);
  console.log(`Wrote ${markdownPath}`);
  if (!report.passed) {
    console.error(renderFailureSummary(report));
    process.exitCode = 1;
  }
} finally {
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await new Promise(resolveClose => server.close(resolveClose));
}

async function generateCase(page, {cells, seed, template, graphWidth, graphHeight}) {
  await page.waitForSelector("#cells-input", {state: "attached", timeout: timeoutMs});
  await page.evaluate(({cells, seed, template, graphWidth, graphHeight}) => {
    window.__overlayProfilePreviousMap = window.__webglGeneratorApp?.map || null;
    document.getElementById("auto-random-seed").checked = false;
    document.getElementById("seed-input").value = seed;
    document.getElementById("cells-input").value = String(cells);
    document.getElementById("width-input").value = String(graphWidth);
    document.getElementById("height-input").value = String(graphHeight);
    document.getElementById("heightmap-template").value = template;
    document.getElementById("generate-map").click();
  }, {cells, seed, template, graphWidth, graphHeight});

  await page.waitForFunction(
    expected => {
      const app = window.__webglGeneratorApp;
      const loading = document.getElementById("generation-loading");
      return app?.map &&
        app.map !== window.__overlayProfilePreviousMap &&
        app.map.metadata?.seed === expected.seed &&
        app.map.metadata?.cellsTarget === expected.cells &&
        app.renderer?.getStats?.()?.draw?.glError === 0 &&
        loading?.hidden === true;
    },
    {cells, seed},
    {timeout: timeoutMs}
  );
}

async function profileZoom(page) {
  const canvasBox = await page.locator("#map-canvas").boundingBox();
  const center = canvasCenter(canvasBox);
  await page.mouse.move(center.x, center.y);
  await startFrameRecorder(page);
  for (let index = 0; index < 18; index++) {
    if (index === 17) await armOverlayIdleRecorder(page, {eventType: "wheel", inputLabel: "last-wheel"});
    await page.mouse.wheel(0, index < 9 ? -220 : 170);
    await delay(34);
  }
  const frames = await stopFrameRecorder(page);
  const samples = frames.samples?.length ? frames.samples : [await readStats(page)];
  return summarizeInteraction("zoom", "连续滚轮缩放", samples, frames);
}

async function verifyViewportCoalescing(page) {
  const evidence = await page.evaluate(async () => {
    const renderer = window.__webglGeneratorApp?.renderer;
    const canvas = renderer?.canvas;
    if (!renderer || !canvas) return {available: false};
    const before = renderer.getPerformanceEvents();
    const rect = canvas.getBoundingClientRect();
    for (let index = 0; index < 12; index++) {
      canvas.dispatchEvent(new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        deltaY: -12
      }));
    }
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const after = renderer.getPerformanceEvents();
    const stats = renderer.getStats();
    return {
      available: true,
      inputCount: 12,
      viewportPreviewCount: Number(after.viewportPreview?.sequence || 0) - Number(before.viewportPreview?.sequence || 0),
      drawCount: Number(after.draw?.sequence || 0) - Number(before.draw?.sequence || 0),
      overlayCount: Number(after.overlay?.sequence || 0) - Number(before.overlay?.sequence || 0),
      suspended: stats.overlay?.interactionSuspended === true,
      transform: stats.overlay?.previewTransform || null,
      camera: stats.camera || null
    };
  });
  const failures = [];
  if (!evidence.available) failures.push("renderer / canvas 不可用");
  if (evidence.viewportPreviewCount !== 1) failures.push(`12 个同帧输入产生 ${evidence.viewportPreviewCount} 次 preview`);
  if (evidence.drawCount !== 1) failures.push(`12 个同帧输入产生 ${evidence.drawCount} 次 draw`);
  if (evidence.overlayCount !== 0) failures.push(`同帧输入产生 ${evidence.overlayCount} 次完整 overlay`);
  if (!evidence.suspended) failures.push("preview 后未保持 overlay 交互快路径");
  if (!evidence.transform || evidence.transform.scale === 1) failures.push("preview 后没有非单位相机 transform");
  const commit = await waitForOverlayIdle(page);
  if (!commit.completed) failures.push("同帧输入后的 commit 未完成");
  await page.evaluate(() => {
    const result = window.webglGeneratorApi?.layers?.fitView?.();
    if (!result?.ok) throw new Error(result?.error?.message || "rAF 合并探针恢复相机失败");
  });
  const restoration = await waitForOverlayIdle(page);
  if (!restoration.completed || restoration.overlaySuspended) failures.push("rAF 合并探针后相机 / overlay 未恢复");
  return {...evidence, commit, restoration, failures, passed: failures.length === 0};
}

async function profilePan(page) {
  const canvasBox = await page.locator("#map-canvas").boundingBox();
  const center = canvasCenter(canvasBox);
  await page.mouse.move(center.x - 150, center.y - 60);
  await startFrameRecorder(page);
  await page.mouse.down({button: "middle"});
  for (let index = 0; index < 24; index++) {
    const t = index / 23;
    const x = center.x - 150 + Math.sin(t * Math.PI * 2) * 180;
    const y = center.y - 60 + Math.cos(t * Math.PI * 2) * 90;
    const isLastMove = index === 23;
    if (isLastMove) await armOverlayIdleRecorder(page, {eventType: "pointermove", inputLabel: "last-viewport-pointermove; mouseup-included"});
    await page.mouse.move(x, y, {steps: isLastMove ? 1 : 2});
    await delay(24);
  }
  await page.mouse.up({button: "middle"});
  const frames = await stopFrameRecorder(page);
  const samples = frames.samples?.length ? frames.samples : [await readStats(page)];
  return summarizeInteraction("pan", "中键拖动画布", samples, frames);
}

async function applyVariant(page, variant) {
  await page.evaluate(({variant, baseLayers}) => {
    const renderer = window.__webglGeneratorApp?.renderer;
    const api = window.webglGeneratorApi;
    if (!renderer || !api) return;
    for (const [layer, visible] of Object.entries({...baseLayers, ...(variant.layers || {})})) {
      const result = api.layers.setVisible(layer, visible);
      if (!result?.ok) throw new Error(result?.error?.message || `图层 ${layer} 场景设置失败`);
    }
  }, {variant, baseLayers: PROFILE_BASE_LAYERS});
  await page.waitForTimeout(150);
}

async function resetProfileScenario(page) {
  await page.evaluate(baseLayers => {
    const app = window.__webglGeneratorApp;
    if (!app?.map || !app.renderer) return;
    app.measurement.active = false;
    app.measurement.points = [];
    app.measurement.pointer = null;
    app.measurement.drag = null;
    app.measurement.editingMeasurementId = null;
    app.renderer.onHover?.(null);
    if (app.pick !== null) throw new Error("Overlay 场景复位后 hover 未清空");
    app.map.measurements = {
      version: 1,
      items: [],
      metadata: {measurements: 0, nextId: 1}
    };
    const selectionResult = window.webglGeneratorApi.selection.clear();
    if (!selectionResult?.ok) throw new Error(selectionResult?.error?.message || "selection 场景清理失败");
    for (const [layer, visible] of Object.entries(baseLayers)) {
      const result = window.webglGeneratorApi.layers.setVisible(layer, visible);
      if (!result?.ok) throw new Error(result?.error?.message || `图层 ${layer} 场景恢复失败`);
    }
    const fitResult = window.webglGeneratorApi.layers.fitView();
    if (!fitResult?.ok) throw new Error(fitResult?.error?.message || "场景相机恢复失败");
  }, PROFILE_BASE_LAYERS);
  await page.waitForTimeout(120);
}

async function setupVariantScenario(page, variant) {
  await resetProfileScenario(page);
  const canonicalIdle = await waitForOverlayIdle(page);
  const canonicalState = await captureVariantState(page);
  await applyVariant(page, variant);
  const fixture = await prepareVariantFixture(page, variant);
  const fixtureIdle = await waitForOverlayIdle(page);
  const fixtureState = await captureVariantState(page);
  return {
    fixture,
    canonicalState,
    fixtureState,
    setupIdle: {canonical: canonicalIdle, fixture: fixtureIdle}
  };
}

async function prepareVariantFixture(page, variant) {
  if (variant.fixture === "measurement-heavy") return createMeasurementHeavyFixture(page, variant);
  if (variant.fixture === "selection-heavy") return createSelectionHeavyFixture(page, variant);
  return null;
}

async function createMeasurementHeavyFixture(page, variant) {
  await page.evaluate(({count}) => {
    const app = window.__webglGeneratorApp;
    if (!app?.map || !app.renderer) return;
    const width = Number(app.map.metadata?.graphWidth) || 1440;
    const height = Number(app.map.metadata?.graphHeight) || 960;
    const columns = Math.max(4, Math.ceil(Math.sqrt(count * (width / Math.max(1, height)))));
    const rows = Math.max(3, Math.ceil(count / columns));
    const now = new Date().toISOString();
    const items = [];
    for (let index = 0; index < count; index += 1) {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const cx = ((col + 0.5) / columns) * width;
      const cy = ((row + 0.5) / rows) * height;
      const radiusX = Math.max(14, width / columns * 0.18);
      const radiusY = Math.max(10, height / rows * 0.18);
      const pointCount = index % 3 === 0 ? 6 : 5;
      const points = Array.from({length: pointCount}, (_, pointIndex) => {
        const angle = (Math.PI * 2 * pointIndex) / pointCount + (index % 5) * 0.18;
        const wave = 0.8 + ((index + pointIndex) % 4) * 0.08;
        return {
          x: roundBrowserMeasurement(Math.max(0, Math.min(width, cx + Math.cos(angle) * radiusX * wave))),
          y: roundBrowserMeasurement(Math.max(0, Math.min(height, cy + Math.sin(angle) * radiusY * wave)))
        };
      });
      const polygon = index % 3 === 0;
      items.push({
        id: `profile-measurement-${index + 1}`,
        type: polygon ? "polygon" : "polyline",
        name: `profile measurement ${index + 1}`,
        points,
        closed: polygon,
        routeFit: "none",
        cellStops: [],
        createdAt: now,
        updatedAt: now,
        summary: {
          pointCount: points.length,
          displayPointCount: points.length,
          routeStopCount: 0,
          distanceMapUnits: 0,
          areaMapUnits: 0
        }
      });
    }
    app.map.measurements = {
      version: 1,
      items,
      metadata: {measurements: items.length, nextId: items.length + 1}
    };
    const measurementResult = window.webglGeneratorApi.layers.setVisible("measurements", true);
    if (!measurementResult?.ok) throw new Error(measurementResult?.error?.message || "测量重场景图层设置失败");
    const fitResult = window.webglGeneratorApi.layers.fitView();
    if (!fitResult?.ok) throw new Error(fitResult?.error?.message || "测量重场景相机恢复失败");

    function roundBrowserMeasurement(value) {
      return Math.round(Number(value || 0) * 1000) / 1000;
    }
  }, {count: Math.max(1, Math.round(Number(variant.fixtureCount || measurementFixtureCount) || measurementFixtureCount))});
  await page.waitForTimeout(160);
  return page.evaluate(() => {
    const items = window.__webglGeneratorApp?.map?.measurements?.items || [];
    const pathNodes = [...document.querySelectorAll(".measurement-object-path")];
    const areaNodes = [...document.querySelectorAll(".measurement-object-area")];
    const renderedObjectIds = new Set([...pathNodes, ...areaNodes]
      .map(node => node.dataset.measurementObject)
      .filter(Boolean));
    return {
      type: "measurement-heavy",
      measurementCount: items.length,
      expectedAreaCount: items.filter(item => item.closed || item.type === "polygon").length,
      objectPathCount: pathNodes.length,
      objectAreaCount: areaNodes.length,
      renderedObjectCount: renderedObjectIds.size,
      overlayHidden: Boolean(document.getElementById("measurement-overlay")?.hidden)
    };
  });
}

async function createSelectionHeavyFixture(page, variant) {
  await page.evaluate(({kind}) => {
    const app = window.__webglGeneratorApp;
    if (!app?.map || !app.renderer) return;
    const field = kind || "state";
    const values = app.map.grid?.cells?.[field] || [];
    const heights = app.map.grid?.cells?.h || [];
    const counts = new Map();
    for (let index = 0; index < values.length; index += 1) {
      if (Number(heights[index]) < 20) continue;
      const value = values[index];
      const id = Number(value);
      if (!Number.isInteger(id) || id <= 0) continue;
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    const [id] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0] || [];
    if (!Number.isInteger(id)) return;
    const object = {kind, id};
    const selectionResult = window.webglGeneratorApi.selection.select(object);
    if (!selectionResult?.ok) throw new Error(selectionResult?.error?.message || "选中态重场景设置失败");
    const fitResult = window.webglGeneratorApi.layers.fitView();
    if (!fitResult?.ok) throw new Error(fitResult?.error?.message || "选中态重场景相机恢复失败");
  }, {kind: variant.selectionKind || "state"});
  await page.waitForTimeout(160);
  return page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const stats = app?.renderer?.getStats?.() || {};
    const selection = app?.selection?.object || null;
    const field = selection?.kind || "";
    const values = field ? app?.map?.grid?.cells?.[field] || [] : [];
    const heights = app?.map?.grid?.cells?.h || [];
    const selectedCells = values.reduce((count, value, index) => count + (Number(heights[index]) >= 20 && Number(value) === Number(selection?.id) ? 1 : 0), 0);
    return {
      type: "selection-heavy",
      selection: selection ? {kind: selection.kind, id: selection.id} : null,
      selectedCells,
      selectionVertexCount: stats.selectionVertexCount || 0,
      selectionBuildMs: stats.selectionBuildMs || 0,
      selectionHighlightMode: stats.selectionHighlightMode || "none"
    };
  });
}

async function clearProfileHover(page) {
  await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    if (!app?.renderer) return;
    app.renderer.onHover?.(null);
    if (app.pick !== null) throw new Error("正式交互结束后 hover 未清空");
  });
}

async function armOverlayIdleRecorder(page, {eventType = null, occurrence = 1, inputLabel = "idle-wait"} = {}) {
  await page.evaluate(({eventType, occurrence, inputLabel}) => {
    const previous = window.__webglGeneratorOverlayIdleProfile;
    if (previous) {
      previous.stop?.();
    }
    const initialEvents = window.__webglGeneratorApp?.renderer?.getStats?.()?.performanceEvents || {};
    const profile = {
      armed: true,
      armedAt: performance.now(),
      baselineCapturedAt: performance.now(),
      startedAt: null,
      cleanAt: null,
      frames: [],
      longTasks: [],
      running: false,
      lastFrameAt: 0,
      eventType,
      occurrence: Math.max(1, Number(occurrence) || 1),
      observedInputs: 0,
      input: null,
      baselineSequences: Object.fromEntries(Object.entries(initialEvents).map(([key, value]) => [key, Number(value?.sequence || 0)])),
      observer: null,
      armListener: null,
      stop: null
    };
    profile.stop = () => {
      profile.armed = false;
      profile.running = false;
      profile.observer?.disconnect?.();
      if (profile.armListener && profile.eventType) window.removeEventListener(profile.eventType, profile.armListener, true);
      profile.armListener = null;
    };
    function tick(now) {
      if (!profile.running) return;
      if (profile.lastFrameAt) profile.frames.push({at: now, intervalMs: now - profile.lastFrameAt});
      profile.lastFrameAt = now;
      requestAnimationFrame(tick);
    }
    function activate(event) {
      if (Number.isFinite(profile.startedAt)) return;
      profile.startedAt = performance.now();
      profile.input = {
        label: inputLabel,
        type: event?.type || null,
        eventTimeStamp: Number.isFinite(event?.timeStamp) ? event.timeStamp : null,
        occurrence: profile.observedInputs || 0
      };
      profile.running = true;
      if ("PerformanceObserver" in window) {
        try {
          profile.observer = new PerformanceObserver(list => {
            for (const entry of list.getEntries()) profile.longTasks.push({startTime: entry.startTime, duration: entry.duration});
          });
          profile.observer.observe({entryTypes: ["longtask"]});
        } catch {
          profile.observer = null;
        }
      }
      requestAnimationFrame(tick);
    }
    if (eventType) {
      profile.armListener = event => {
        profile.observedInputs += 1;
        if (profile.observedInputs < profile.occurrence) return;
        window.removeEventListener(eventType, profile.armListener, true);
        profile.armListener = null;
        activate(event);
      };
      window.addEventListener(eventType, profile.armListener, {capture: true, passive: true});
    } else {
      activate(null);
    }
    window.__webglGeneratorOverlayIdleProfile = profile;
  }, {eventType, occurrence, inputLabel});
}

async function waitForOverlayIdle(page) {
  const hasArmedRecorder = await page.evaluate(() => Boolean(window.__webglGeneratorOverlayIdleProfile?.armed));
  if (!hasArmedRecorder) await armOverlayIdleRecorder(page);
  await page.waitForFunction(() => Number.isFinite(window.__webglGeneratorOverlayIdleProfile?.startedAt), null, {timeout: Math.min(timeoutMs, 10000)});
  const completed = await page.waitForFunction(() => {
    const profile = window.__webglGeneratorOverlayIdleProfile;
    const stats = window.__webglGeneratorApp?.renderer?.getStats?.();
    if (!profile || !stats || stats.overlay?.interactionSuspended !== false) return false;
    const viewportCommit = stats.performanceEvents?.viewportCommit || {};
    if (viewportCommit.pending || viewportCommit.running) return false;
    const routesClean = stats.layerVisibility?.routes === false || stats.dynamicMeshCache?.routesDirty === false;
    const riversClean = stats.layerVisibility?.rivers === false || stats.dynamicMeshCache?.riversDirty === false;
    const selectionClean = stats.dynamicMeshCache?.selectionDirty === false;
    if (!routesClean || !riversClean || !selectionClean) return false;
    profile.cleanAt = performance.now();
    profile.running = false;
    return true;
  }, null, {timeout: Math.min(timeoutMs, 10000)}).then(() => true).catch(() => false);
  await page.waitForTimeout(40);
  return page.evaluate(completed => {
    const profile = window.__webglGeneratorOverlayIdleProfile;
    const renderer = window.__webglGeneratorApp?.renderer;
    const stats = renderer?.getStats?.() || {};
    if (!profile) return emptyOverlayIdleProfile(completed, stats);
    const completedAt = profile.cleanAt ?? performance.now();
    profile.stop?.();
    const events = renderer?.getPerformanceEvents?.({includeRecent: true}) || stats.performanceEvents || {};
    const eventsAfterBaseline = Object.fromEntries(Object.entries(events).map(([key, channel]) => [key, channelEventsAfter(channel, profile.baselineSequences[key])]));
    const routeEvents = completedEvents(eventsAfterBaseline.routeMesh);
    const riverEvents = completedEvents(eventsAfterBaseline.riverMesh);
    const overlayEvents = completedEvents(eventsAfterBaseline.overlay);
    const uploadEvents = completedEvents(eventsAfterBaseline.bufferUpload);
    const failedRendererEvents = Object.entries(eventsAfterBaseline).flatMap(([channel, channelEvents]) => channelEvents
      .filter(event => event.status === "failed")
      .map(event => ({channel, ...event})));
    const viewportCommit = events.viewportCommit || {};
    const viewportCommitLast = eventsAfterBaseline.viewportCommit?.at(-1) || null;
    const startedAt = Number.isFinite(profile.startedAt) ? profile.startedAt : completedAt;
    const frameValues = profile.frames.filter(item => item.at <= completedAt).map(item => item.intervalMs);
    const longTasks = profile.longTasks.filter(item => Number(item.startTime || 0) < completedAt && Number(item.startTime || 0) + Number(item.duration || 0) > startedAt);
    return {
      completed,
      elapsedMs: Math.round((completedAt - startedAt) * 100) / 100,
      elapsedBoundary: "last-input-start-to-clean",
      recorderReused: Boolean(profile.eventType),
      timing: {
        armedAt: roundIdleMs(profile.armedAt),
        baselineCapturedAt: roundIdleMs(profile.baselineCapturedAt),
        startedAt: roundIdleMs(startedAt),
        completedAt: roundIdleMs(completedAt),
        input: profile.input ? {...profile.input, eventTimeStamp: profile.input.eventTimeStamp === null ? null : roundIdleMs(profile.input.eventTimeStamp)} : null
      },
      frames: summarizeIdleFrames(frameValues),
      longTasks: longTasks.map(item => ({
        startTime: Math.round(item.startTime * 10) / 10,
        duration: Math.round(item.duration * 10) / 10
      })),
      glError: stats.draw?.glError ?? null,
      overlaySuspended: Boolean(stats.overlay?.interactionSuspended),
      routesDirty: Boolean(stats.dynamicMeshCache?.routesDirty),
      riversDirty: Boolean(stats.dynamicMeshCache?.riversDirty),
      selectionDirty: Boolean(stats.dynamicMeshCache?.selectionDirty),
      viewportCommit: {
        sequence: Number(viewportCommit.sequence || 0),
        pending: Boolean(viewportCommit.pending),
        running: Boolean(viewportCommit.running),
        completed: Number(viewportCommit.completed || 0),
        canceled: Number(viewportCommit.canceled || 0),
        lastStatus: viewportCommitLast?.status || null,
        lastPendingMs: roundIdleMs(viewportCommitLast?.pendingMs || 0),
        lastMs: roundIdleMs(viewportCommitLast?.ms || 0),
        last: viewportCommitLast
      },
      routeBuildMs: sumEventMs(routeEvents),
      riverBuildMs: sumEventMs(riverEvents),
      overlayMs: sumEventMs(overlayEvents),
      componentTimingsAreNonAdditive: true,
      eventSampleCounts: {
        routeMesh: eventsAfterBaseline.routeMesh?.length || 0,
        riverMesh: eventsAfterBaseline.riverMesh?.length || 0,
        overlay: eventsAfterBaseline.overlay?.length || 0,
        bufferUpload: eventsAfterBaseline.bufferUpload?.length || 0
      },
      rendererFailureCounts: Object.fromEntries(Object.entries(events).map(([key, channel]) => [key, Number(channel?.failed || 0)])),
      failedRendererEvents,
      bufferUploads: uploadEvents
    };

    function channelEventsAfter(channel, baseline) {
      return (channel?.recent || [])
        .filter(event => Number(event.sequence || 0) > Number(baseline || 0))
        .map(event => ({...event}));
    }

    function completedEvents(items = []) {
      return items.filter(event => event.status === "completed");
    }

    function sumEventMs(items) {
      return Math.round(items.reduce((total, item) => total + Number(item.ms || 0), 0) * 100) / 100;
    }

    function summarizeIdleFrames(values) {
      if (!values.length) return {count: 0, averageMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0};
      const sorted = [...values].sort((a, b) => a - b);
      const sum = values.reduce((total, value) => total + value, 0);
      const p50Index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * 0.5) - 1));
      const p95Index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * 0.95) - 1));
      return {
        count: values.length,
        averageMs: Math.round((sum / values.length) * 100) / 100,
        p50Ms: Math.round(sorted[p50Index] * 100) / 100,
        p95Ms: Math.round(sorted[p95Index] * 100) / 100,
        maxMs: Math.round(sorted[sorted.length - 1] * 100) / 100
      };
    }

    function roundIdleMs(value) {
      return Math.round(Number(value || 0) * 100) / 100;
    }

    function emptyOverlayIdleProfile(done, currentStats) {
      return {
        completed: done,
        elapsedMs: 0,
        elapsedBoundary: "last-input-start-to-clean",
        recorderReused: false,
        timing: null,
        frames: {count: 0, averageMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0},
        longTasks: [],
        glError: currentStats.draw?.glError ?? null,
        overlaySuspended: Boolean(currentStats.overlay?.interactionSuspended),
        routesDirty: Boolean(currentStats.dynamicMeshCache?.routesDirty),
        riversDirty: Boolean(currentStats.dynamicMeshCache?.riversDirty),
        selectionDirty: Boolean(currentStats.dynamicMeshCache?.selectionDirty),
        viewportCommit: {
          sequence: Number(currentStats.performanceEvents?.viewportCommit?.sequence || 0),
          pending: Boolean(currentStats.performanceEvents?.viewportCommit?.pending),
          running: Boolean(currentStats.performanceEvents?.viewportCommit?.running),
          completed: Number(currentStats.performanceEvents?.viewportCommit?.completed || 0),
          canceled: Number(currentStats.performanceEvents?.viewportCommit?.canceled || 0),
          lastStatus: currentStats.performanceEvents?.viewportCommit?.last?.status || null,
          lastPendingMs: roundIdleMs(currentStats.performanceEvents?.viewportCommit?.last?.pendingMs || 0),
          lastMs: roundIdleMs(currentStats.performanceEvents?.viewportCommit?.last?.ms || 0),
          last: currentStats.performanceEvents?.viewportCommit?.last || null
        },
        routeBuildMs: 0,
        riverBuildMs: 0,
        overlayMs: 0,
        componentTimingsAreNonAdditive: true,
        eventSampleCounts: {routeMesh: 0, riverMesh: 0, overlay: 0, bufferUpload: 0},
        rendererFailureCounts: Object.fromEntries(Object.entries(currentStats.performanceEvents || {}).map(([key, channel]) => [key, Number(channel?.failed || 0)])),
        failedRendererEvents: [],
        bufferUploads: []
      };
    }
  }, completed);
}

async function startFrameRecorder(page) {
  await page.evaluate(() => {
    window.__webglGeneratorOverlayEventProbe?.stop?.();

    function snapshotInteractionStats() {
      const app = window.__webglGeneratorApp;
      const renderer = app?.renderer;
      if (!renderer) return {};
      const dirty = renderer.dynamicBuffersDirty || {};
      const measurementOverlay = document.getElementById("measurement-overlay");
      const measurementSvg = document.getElementById("measurement-svg");
      return {
        glError: renderer.lastDraw?.glError ?? null,
        layerOrder: [...(renderer.lastDraw?.layerOrder || [])],
        camera: renderer.camera ? {...renderer.camera} : null,
        layerVisibility: renderer.layerVisibility ? {...renderer.layerVisibility} : {},
        overlayInteractionSuspended: Boolean(renderer.overlayInteractionSuspended),
        overlayTransform: renderer.overlay ? getComputedStyle(renderer.overlay).transform : "none",
        measurementTransform: measurementSvg ? getComputedStyle(measurementSvg).transform : "none",
        overlayChildCount: renderer.overlay?.childElementCount || 0,
        labelCount: renderer.labelCount || 0,
        visibleLabelCount: renderer.visibleLabelCount || 0,
        cityIconCount: renderer.cityIconCount || 0,
        visibleCityIconCount: renderer.visibleCityIconCount || 0,
        markerIconCount: renderer.markerIconCount || 0,
        visibleMarkerIconCount: renderer.visibleMarkerIconCount || 0,
        militaryIconCount: renderer.militaryIconCount || 0,
        visibleMilitaryIconCount: renderer.visibleMilitaryIconCount || 0,
        measurementCount: app?.map?.measurements?.items?.length || 0,
        measurementPathCount: measurementOverlay?.querySelectorAll?.(".measurement-object-path").length || 0,
        measurementAreaCount: measurementOverlay?.querySelectorAll?.(".measurement-object-area").length || 0,
        measurementOverlayHidden: Boolean(measurementOverlay?.hidden),
        routeVertexCount: renderer.routeVertexCount || 0,
        routeRenderStats: renderer.routeRenderStats ? {...renderer.routeRenderStats} : {},
        riverVertexCount: renderer.riverVertexCount || 0,
        riverWidthStats: renderer.riverWidthStats ? {...renderer.riverWidthStats} : {},
        selectionVertexCount: renderer.selectionVertexCount || 0,
        dynamicMeshCache: {
          routesDirty: Boolean(dirty.routes),
          tradeFlowsDirty: Boolean(dirty.tradeFlows),
          riversDirty: Boolean(dirty.rivers),
          selectionDirty: Boolean(dirty.selection)
        }
      };
    }

    const rendererEventKeys = [
      "draw",
      "overlay",
      "routeMesh",
      "riverMesh",
      "selectionMesh",
      "surfaceRefresh",
      "lineRefresh",
      "pointRefresh",
      "bufferUpload",
      "viewportPreview",
      "viewportCommit"
    ];

    function rendererEventChannels() {
      return window.__webglGeneratorApp?.renderer?.performanceEvents || {};
    }

    function installEventProbe() {
      const eventTypes = ["wheel", "mousedown", "mousemove", "mouseup", "pointerdown", "pointermove", "pointerup"];
      const eventStartedAt = new WeakMap();
      const finishedEvents = new WeakSet();
      const items = [];
      const captureListeners = [];
      const bubbleListeners = [];

      function capture(event) {
        const startedAt = performance.now();
        const item = {
          type: event.type,
          button: Number.isFinite(event.button) ? event.button : null,
          defaultPrevented: Boolean(event.defaultPrevented),
          timestampLagMs: roundProbeMs(startedAt - event.timeStamp),
          dispatchMs: 0,
          nextFrameMs: 0,
          completion: "pending"
        };
        eventStartedAt.set(event, {startedAt, item});
        items.push(item);
        queueMicrotask(() => finish(event, "microtask"));
        requestAnimationFrame(() => {
          item.nextFrameMs = roundProbeMs(performance.now() - startedAt);
        });
      }

      function bubble(event) {
        finish(event, "bubble");
      }

      function finish(event, completion) {
        if (finishedEvents.has(event)) return;
        const entry = eventStartedAt.get(event);
        if (!entry) return;
        finishedEvents.add(event);
        entry.item.dispatchMs = roundProbeMs(performance.now() - entry.startedAt);
        entry.item.defaultPrevented = Boolean(event.defaultPrevented);
        entry.item.completion = completion;
      }

      function roundProbeMs(value) {
        return Math.round((Number(value) || 0) * 100) / 100;
      }

      for (const type of eventTypes) {
        const captureListener = event => capture(event);
        const bubbleListener = event => bubble(event);
        window.addEventListener(type, captureListener, {capture: true, passive: true});
        window.addEventListener(type, bubbleListener, {capture: false, passive: true});
        captureListeners.push([type, captureListener]);
        bubbleListeners.push([type, bubbleListener]);
      }

      return {
        items,
        stop() {
          for (const [type, listener] of captureListeners) window.removeEventListener(type, listener, {capture: true});
          for (const [type, listener] of bubbleListeners) window.removeEventListener(type, listener, {capture: false});
        }
      };
    }

    const eventProbe = installEventProbe();
    window.__webglGeneratorOverlayEventProbe = eventProbe;

    const initialEventChannels = rendererEventChannels();
    const profile = {
      frames: [],
      longTasks: [],
      samples: [],
      workEvents: Object.fromEntries(rendererEventKeys.map(key => [key, []])),
      baselineSequences: Object.fromEntries(rendererEventKeys.map(key => [key, Number(initialEventChannels[key]?.sequence || 0)])),
      eventProbe,
      running: true,
      lastFrameAt: 0,
      observer: null
    };
    profile.collectWorkEvents = () => {
      const renderer = window.__webglGeneratorApp?.renderer;
      const channels = renderer?.getPerformanceEvents?.({includeRecent: true}) || rendererEventChannels();
      for (const key of rendererEventKeys) {
        const baseline = profile.baselineSequences[key] || 0;
        profile.workEvents[key] = (channels[key]?.recent || [])
          .filter(event => Number(event.sequence || 0) > baseline)
          .map(event => ({...event}));
      }
    };
    if ("PerformanceObserver" in window) {
      try {
        profile.observer = new PerformanceObserver(list => {
          for (const entry of list.getEntries()) profile.longTasks.push({startTime: entry.startTime, duration: entry.duration});
        });
        profile.observer.observe({entryTypes: ["longtask"]});
      } catch {
        profile.observer = null;
      }
    }
    function tick(now) {
      if (profile.lastFrameAt) profile.frames.push(now - profile.lastFrameAt);
      profile.lastFrameAt = now;
      profile.samples.push(snapshotInteractionStats());
      if (profile.running) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    window.__webglGeneratorOverlayProfile = profile;
  });
}

async function stopFrameRecorder(page) {
  return page.evaluate(() => {
    const profile = window.__webglGeneratorOverlayProfile;
    if (!profile) return {frames: [], longTasks: []};
    profile.running = false;
    profile.collectWorkEvents?.();
    profile.observer?.disconnect?.();
    profile.eventProbe?.stop?.();
    if (window.__webglGeneratorOverlayEventProbe === profile.eventProbe) window.__webglGeneratorOverlayEventProbe = null;
    return {
      frames: profile.frames,
      longTasks: profile.longTasks,
      samples: profile.samples,
      workEvents: profile.workEvents,
      eventTimings: profile.eventProbe?.items || []
    };
  });
}

async function readStats(page) {
  return page.evaluate(() => {
    const stats = window.__webglGeneratorApp?.renderer?.getStats?.() || {};
    return {
      drawMs: stats.draw?.drawMs || 0,
      glError: stats.draw?.glError ?? null,
      layerOrder: [...(stats.draw?.layerOrder || [])],
      camera: stats.camera || null,
      layerVisibility: stats.layerVisibility || {},
      overlay: stats.overlay?.update || {},
      overlayInteractionSuspended: Boolean(stats.overlay?.interactionSuspended),
      overlayChildCount: stats.overlay?.childCount || 0,
      labelCount: stats.labelCount || 0,
      visibleLabelCount: stats.visibleLabelCount || 0,
      cityIconCount: stats.cityIconCount || 0,
      visibleCityIconCount: stats.visibleCityIconCount || 0,
      markerIconCount: stats.markerIconCount || 0,
      visibleMarkerIconCount: stats.visibleMarkerIconCount || 0,
      militaryIconCount: stats.militaryIconCount || 0,
      visibleMilitaryIconCount: stats.visibleMilitaryIconCount || 0,
      measurementCount: window.__webglGeneratorApp?.map?.measurements?.items?.length || 0,
      measurementPathCount: document.querySelectorAll(".measurement-object-path").length,
      measurementAreaCount: document.querySelectorAll(".measurement-object-area").length,
      measurementOverlayHidden: Boolean(document.getElementById("measurement-overlay")?.hidden),
      routeBuildMs: stats.routeBuildMs || 0,
      routeVertexCount: stats.routeVertexCount || 0,
      routeRenderStats: stats.routeRenderStats || {},
      riverBuildMs: stats.riverBuildMs || 0,
      riverVertexCount: stats.riverVertexCount || 0,
      riverWidthStats: stats.riverWidthStats || {},
      selectionBuildMs: stats.selectionBuildMs || 0,
      selectionVertexCount: stats.selectionVertexCount || 0,
      dynamicMeshCache: stats.dynamicMeshCache || {}
    };
  });
}

async function captureVariantState(page) {
  return page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const renderer = app?.renderer;
    const stats = renderer?.getStats?.() || {};
    const revision = app?.mapRevision?.getSnapshot?.() || {};
    const metadata = app?.map?.metadata || {};
    return {
      map: {
        seed: metadata.seed || null,
        cellsTarget: Number(metadata.cellsTarget || 0),
        gridCells: Number(metadata.gridCells || 0),
        packCells: Number(metadata.packCells || 0)
      },
      checksum: app?.map?.summary?.checksum || null,
      mapRevision: revision.mapRevision ?? null,
      camera: stats.camera ? {...stats.camera} : null,
      layers: stats.layerVisibility ? {...stats.layerVisibility} : {},
      colorMode: stats.colorMode || null,
      selection: summarizeObject(app?.selection?.object),
      rendererSelection: summarizeObject(renderer?.selection),
      hover: summarizePick(app?.pick),
      measurementCount: app?.map?.measurements?.items?.length || 0,
      glError: stats.draw?.glError ?? null,
      events: Object.fromEntries(Object.entries(stats.performanceEvents || {}).map(([key, channel]) => [key, {
        sequence: Number(channel?.sequence || 0),
        failed: Number(channel?.failed || 0)
      }]))
    };

    function summarizeObject(object) {
      return object ? {kind: object.kind, id: object.id} : null;
    }

    function summarizePick(pick) {
      if (!pick) return null;
      return {
        gridCell: Number.isInteger(pick.gridCell) ? pick.gridCell : null,
        object: pick.object ? {kind: pick.object.kind, id: pick.object.id} : null
      };
    }
  });
}

function validateIdleEvidence(idle, label) {
  const failures = [];
  if (!idle?.completed) failures.push(`${label} idle 未完成`);
  if (idle?.glError !== 0) failures.push(`${label} WebGL error 为 ${idle?.glError}`);
  if (idle?.overlaySuspended !== false) failures.push(`${label} overlay 仍处于 suspended`);
  if (idle?.routesDirty !== false || idle?.riversDirty !== false || idle?.selectionDirty !== false) failures.push(`${label} dynamic mesh dirty 未清零`);
  if (idle?.viewportCommit?.pending || idle?.viewportCommit?.running) failures.push(`${label} viewport commit 仍处于 pending / running`);
  if ((idle?.failedRendererEvents || []).length) failures.push(`${label} 出现 failed renderer event`);
  if (!idle?.rendererFailureCounts || typeof idle.rendererFailureCounts !== "object") {
    failures.push(`${label} 缺少 renderer failed 绝对计数`);
  } else {
    for (const [channel, failed] of Object.entries(idle.rendererFailureCounts)) {
      if (Number(failed) !== 0) failures.push(`${label} renderer ${channel} failed 绝对计数为 ${failed}`);
    }
  }
  return failures;
}

function validateFixtureEvidence(variant, fixture, state, canonical) {
  const failures = [];
  if (!sameValue(canonical.map, state.map)) failures.push("地图 metadata 身份改变");
  if (variant.fixture !== "measurement-heavy" && canonical.checksum !== state.checksum) failures.push("夹具建立意外改变地图 checksum");
  if (variant.fixture !== "measurement-heavy" && canonical.mapRevision !== state.mapRevision) failures.push("夹具建立意外改变地图 revision");
  failures.push(...failedEventDelta(canonical.events, state.events).map(key => `夹具建立时 renderer ${key} 事件出现 failed`));
  if (!state.map.gridCells || !state.map.packCells) failures.push("没有记录实际 grid / pack cells");
  if (!state.checksum) failures.push("地图 checksum 缺失");
  if (state.mapRevision === null) failures.push("地图 revision 缺失");
  if (!state.camera) failures.push("夹具相机快照缺失");
  if (!state.colorMode) failures.push("夹具 colorMode 缺失");
  if (state.glError !== 0) failures.push(`夹具 WebGL error 为 ${state.glError}`);
  if (state.hover !== null) failures.push("夹具建立后 hover 不是 null");
  const expectedLayers = {...PROFILE_BASE_LAYERS, ...(variant.layers || {})};
  for (const [layer, expected] of Object.entries(expectedLayers)) {
    if (state.layers?.[layer] !== expected) failures.push(`夹具图层 ${layer} 不是 ${expected}`);
  }
  if (variant.fixture === "measurement-heavy") {
    const expectedCount = Math.max(1, Math.round(Number(variant.fixtureCount || measurementFixtureCount) || measurementFixtureCount));
    if (fixture?.measurementCount !== expectedCount || state.measurementCount !== expectedCount) failures.push(`测量重夹具不是 ${expectedCount} 个对象`);
    if (fixture?.objectPathCount !== expectedCount) failures.push(`测量重夹具 SVG path 不是 ${expectedCount} 个`);
    if (fixture?.renderedObjectCount !== expectedCount) failures.push(`测量重夹具 SVG 覆盖对象不是 ${expectedCount} 个`);
    if (!Number.isInteger(fixture?.expectedAreaCount) || !Number.isInteger(fixture?.objectAreaCount)) failures.push("测量重夹具缺少 SVG area / polygon 计数");
    if (fixture?.objectAreaCount !== fixture?.expectedAreaCount) failures.push(`测量重夹具 SVG area 数 ${fixture?.objectAreaCount} 与 polygon 数 ${fixture?.expectedAreaCount} 不一致`);
    if (Number(fixture?.objectPathCount || 0) + Number(fixture?.objectAreaCount || 0) !== expectedCount + Number(fixture?.expectedAreaCount || 0)) failures.push("测量重夹具 SVG path / area 节点合计与对象类型不一致");
    if (fixture?.overlayHidden !== false) failures.push("测量重夹具 overlay 不可见");
    if (state.selection !== null || state.rendererSelection !== null) failures.push("测量重夹具意外保留 selection");
  } else if (variant.fixture === "selection-heavy") {
    if (!fixture?.selection || !sameValue(state.selection, fixture.selection) || !sameValue(state.rendererSelection, fixture.selection)) failures.push("选中态重夹具 selection 未同步");
    if (!(Number(fixture?.selectedCells) > 0)) failures.push("选中态重夹具 selectedCells 不是正数");
    if (!(Number(fixture?.selectionVertexCount) > 0)) failures.push("选中态重夹具 selectionVertexCount 不是正数");
    if (!String(fixture?.selectionHighlightMode || "").trim() || String(fixture?.selectionHighlightMode).trim().toLowerCase() === "none") failures.push("选中态重夹具 highlightMode 无效");
    if (state.measurementCount !== 0) failures.push("选中态重夹具意外保留测量对象");
  } else {
    if (state.measurementCount !== 0) failures.push("普通变体意外保留测量对象");
    if (state.selection !== null || state.rendererSelection !== null) failures.push("普通变体意外保留 selection");
  }
  return failures;
}

function fixtureExpectation(variant) {
  if (variant.fixture === "measurement-heavy") {
    return {
      type: "measurement-heavy",
      measurementCount: Math.max(1, Math.round(Number(variant.fixtureCount || measurementFixtureCount) || measurementFixtureCount)),
      selection: null,
      restorationMeasurementCount: 0
    };
  }
  if (variant.fixture === "selection-heavy") {
    return {type: "selection-heavy", selectionKind: variant.selectionKind || "state", measurementCount: 0, restorationSelection: null};
  }
  return {type: "none", measurementCount: 0, selection: null};
}

function validateInteractionEvidence(before, after) {
  const failures = validateWorldIdentity(before, after);
  failures.push(...failedEventDelta(before.events, after.events).map(key => `renderer ${key} 事件出现 failed`));
  if (!sameValue(before.layers, after.layers)) failures.push("完整 layers 快照在正式交互后改变");
  if (before.colorMode !== after.colorMode) failures.push("colorMode 在正式交互后改变");
  if (!sameValue(before.selection, after.selection)) failures.push("runtime selection 在正式交互后改变");
  if (!sameValue(before.rendererSelection, after.rendererSelection)) failures.push("renderer selection 在正式交互后改变");
  if (before.measurementCount !== after.measurementCount) failures.push("measurementCount 在正式交互后改变");
  if (!sameValue(before.hover, after.hover)) failures.push("hover 在正式交互后改变");
  if (after.glError !== 0) failures.push(`最终 WebGL error 为 ${after.glError}`);
  return failures;
}

function validateContinuousViewportBudget(interaction) {
  const failures = [];
  const inputType = interaction.id === "zoom" ? "wheel" : "pointermove";
  const inputCount = Number(interaction.events?.byType?.[inputType]?.count || 0);
  const previewCount = Number(interaction.eventSampleCounts?.viewportPreview || 0);
  const drawCount = Number(interaction.eventSampleCounts?.draw || 0);
  const overlayCount = Number(interaction.eventSampleCounts?.overlay || 0);
  if (!inputCount) failures.push(`缺少 ${inputType} 输入证据`);
  if (previewCount > inputCount) failures.push(`viewport preview ${previewCount} 超过输入 ${inputCount}`);
  if (drawCount > previewCount) failures.push(`draw ${drawCount} 超过 viewport preview ${previewCount}`);
  if (overlayCount !== 0) failures.push(`交互期完整 overlay 次数为 ${overlayCount}，预期 0`);
  if (!interaction.continuity?.suspendedSamples) failures.push("没有观察到 overlay 交互快路径");
  if (!interaction.continuity?.transformedSamples) failures.push("没有观察到 overlay 相机 transform");
  if (interaction.continuity?.measurementSamples > 0 && !interaction.continuity?.measurementTransformedSamples) failures.push("没有观察到 measurement overlay 相机 transform");
  return failures;
}

function validateCanonicalRestoration(expected, actual, idle) {
  const failures = validateWorldIdentity(expected, actual);
  failures.push(...failedEventDelta(expected.events, actual.events).map(key => `恢复期间 renderer ${key} 事件出现 failed`));
  if (!idle?.completed) failures.push("恢复后 renderer 未稳定");
  if (idle?.glError !== 0 || actual.glError !== 0) failures.push("恢复后 WebGL error 不为 0");
  if ((idle?.failedRendererEvents || []).length) failures.push("恢复 idle 出现 failed renderer event");
  if (!sameValue(expected.camera, actual.camera)) failures.push("相机未恢复 canonical 状态");
  if (!sameValue(expected.layers, actual.layers)) failures.push("完整 layers 快照未恢复 canonical 状态");
  for (const [layer, visible] of Object.entries(PROFILE_BASE_LAYERS)) {
    if (actual.layers?.[layer] !== visible) failures.push(`base layer ${layer} 未恢复为 ${visible}`);
  }
  if (!sameValue(expected.selection, actual.selection) || !sameValue(expected.rendererSelection, actual.rendererSelection)) failures.push("selection 未恢复 canonical 状态");
  if (!sameValue(expected.hover, actual.hover)) failures.push("hover 未恢复 canonical 状态");
  if (actual.measurementCount !== expected.measurementCount) failures.push("测量夹具未清理");
  if (actual.colorMode !== expected.colorMode) failures.push("colorMode 未恢复 canonical 状态");
  return failures;
}

function validateWorldIdentity(expected, actual) {
  const failures = [];
  if (!sameValue(expected.map, actual.map)) failures.push("地图 metadata 身份改变");
  if (expected.checksum !== actual.checksum) failures.push("地图 checksum 改变");
  if (expected.mapRevision !== actual.mapRevision) failures.push("地图 revision 改变");
  return failures;
}

function failedEventDelta(before = {}, after = {}) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter(key => Number(after[key]?.failed || 0) > Number(before[key]?.failed || 0));
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function summarizeInteraction(id, label, samples, frameData) {
  const workEvents = frameData.workEvents || {};
  const drawEvents = completedWorkEvents(workEvents.draw);
  const overlayEvents = completedWorkEvents(workEvents.overlay);
  const routeEvents = completedWorkEvents(workEvents.routeMesh);
  const riverEvents = completedWorkEvents(workEvents.riverMesh);
  const selectionEvents = completedWorkEvents(workEvents.selectionMesh);
  const uploadEvents = completedWorkEvents(workEvents.bufferUpload);
  const overlayTotals = overlayEvents.map(event => event.ms || 0);
  const draws = drawEvents.map(event => event.ms || 0);
  const routeBuilds = routeEvents.map(event => event.ms || 0);
  const riverBuilds = riverEvents.map(event => event.ms || 0);
  const selectionBuilds = selectionEvents.map(event => event.ms || 0);
  const eventSampleCounts = Object.fromEntries(Object.entries(workEvents).map(([key, events]) => [key, events.length]));
  const failedRendererEvents = Object.entries(workEvents).flatMap(([channel, events]) => events
    .filter(event => event?.status === "failed")
    .map(event => ({channel, ...event})));
  return {
    id,
    label,
    sampleCount: samples.length,
    frames: summarizeMs(frameData.frames || []),
    longTasks: (frameData.longTasks || []).map(item => ({
      startTime: roundMs(item.startTime),
      duration: roundMs(item.duration)
    })),
    draw: {
      count: drawEvents.length,
      averageMs: averageMs(draws),
      p95Ms: percentileMs(draws, 0.95),
      maxMs: maxMs(draws)
    },
    overlay: {
      count: overlayEvents.length,
      averageMs: averageMs(overlayTotals),
      totalP95Ms: percentileMs(overlayTotals, 0.95),
      maxMs: maxMs(overlayTotals),
      suspendedSamples: overlayEvents.filter(event => event.interactionSuspended).length,
      labelsAverageMs: averageMs(overlayEvents.map(event => event.labelsMs || 0)),
      cityIconsAverageMs: averageMs(overlayEvents.map(event => event.cityIconsMs || 0)),
      markerIconsAverageMs: averageMs(overlayEvents.map(event => event.markerIconsMs || 0)),
      militaryIconsAverageMs: averageMs(overlayEvents.map(event => event.militaryIconsMs || 0)),
      selectionAverageMs: averageMs(overlayEvents.map(event => event.selectionMs || 0))
    },
    continuity: {
      suspendedSamples: samples.filter(sample => sample.overlayInteractionSuspended).length,
      transformedSamples: samples.filter(sample => sample.overlayInteractionSuspended && sample.overlayTransform && sample.overlayTransform !== "none" && sample.overlayTransform !== "matrix(1, 0, 0, 1, 0, 0)").length,
      measurementSamples: samples.filter(sample => Number(sample.measurementCount || 0) > 0 && sample.measurementOverlayHidden === false).length,
      measurementTransformedSamples: samples.filter(sample => sample.overlayInteractionSuspended && sample.measurementTransform && sample.measurementTransform !== "none" && sample.measurementTransform !== "matrix(1, 0, 0, 1, 0, 0)").length
    },
    dynamic: {
      routeBuildCount: routeEvents.length,
      routeBuildAverageMs: averageMs(routeBuilds),
      routeBuildP95Ms: percentileMs(routeBuilds, 0.95),
      riverBuildCount: riverEvents.length,
      riverBuildAverageMs: averageMs(riverBuilds),
      riverBuildP95Ms: percentileMs(riverBuilds, 0.95),
      selectionBuildCount: selectionEvents.length,
      selectionBuildAverageMs: averageMs(selectionBuilds),
      selectionBuildP95Ms: percentileMs(selectionBuilds, 0.95)
    },
    bufferUpload: {
      count: uploadEvents.length,
      averageMs: averageMs(uploadEvents.map(event => event.ms || 0)),
      p95Ms: percentileMs(uploadEvents.map(event => event.ms || 0), 0.95),
      maxMs: maxMs(uploadEvents.map(event => event.ms || 0)),
      byAction: summarizeWorkEventsByAction(uploadEvents)
    },
    eventSampleCounts,
    failedRendererEvents,
    workEvents: Object.fromEntries(Object.entries(workEvents).map(([key, events]) => [key, events.map(event => ({...event}))])),
    events: summarizeEventTimings(frameData.eventTimings || []),
    counts: summarizeCounts(samples),
    glErrors: [...new Set(samples.map(sample => sample.glError))]
  };
}

function completedWorkEvents(events = []) {
  return events.filter(event => event?.status === "completed");
}

function aggregateEventSampleCounts(interactions) {
  const totals = {};
  for (const interaction of interactions) {
    for (const [key, count] of Object.entries(interaction.eventSampleCounts || {})) totals[key] = (totals[key] || 0) + Number(count || 0);
  }
  return totals;
}

function summarizeWorkEventsByAction(events) {
  const groups = {};
  for (const event of events) {
    const action = String(event.action || "unknown");
    if (!groups[action]) groups[action] = [];
    groups[action].push(event.ms || 0);
  }
  return Object.fromEntries(Object.entries(groups).map(([action, values]) => [action, summarizeMs(values)]));
}

function summarizeEventTimings(items) {
  const byType = {};
  for (const item of items) {
    if (!byType[item.type]) byType[item.type] = [];
    byType[item.type].push(item);
  }
  return {
    total: summarizeEventTimingBucket(items),
    byType: Object.fromEntries(Object.entries(byType).map(([type, values]) => [type, summarizeEventTimingBucket(values)]))
  };
}

function summarizeEventTimingBucket(items) {
  const dispatch = items.map(item => item.dispatchMs || 0);
  const nextFrame = items.map(item => item.nextFrameMs || 0);
  const timestampLag = items.map(item => item.timestampLagMs || 0);
  return {
    count: items.length,
    dispatchAverageMs: averageMs(dispatch),
    dispatchP95Ms: percentileMs(dispatch, 0.95),
    dispatchMaxMs: maxMs(dispatch),
    nextFrameAverageMs: averageMs(nextFrame),
    nextFrameP95Ms: percentileMs(nextFrame, 0.95),
    nextFrameMaxMs: maxMs(nextFrame),
    timestampLagP95Ms: percentileMs(timestampLag, 0.95),
    defaultPrevented: items.filter(item => item.defaultPrevented).length,
    completedInBubble: items.filter(item => item.completion === "bubble").length,
    completedInMicrotask: items.filter(item => item.completion === "microtask").length
  };
}

function summarizeCounts(samples) {
  const last = samples.at(-1) || {};
  const routesVisible = last.layerVisibility?.routes !== false && last.layerOrder?.includes("routes");
  const riversVisible = last.layerVisibility?.rivers !== false && last.layerOrder?.includes("rivers");
  return {
    overlayChildCount: last.overlayChildCount || 0,
    routeVertices: routesVisible ? last.routeVertexCount || 0 : 0,
    routeCull: routesVisible ? last.routeRenderStats?.culledRoutes || 0 : 0,
    routeRendered: routesVisible ? last.routeRenderStats?.renderedRoutes || 0 : 0,
    riverVertices: riversVisible ? last.riverVertexCount || 0 : 0,
    riverCull: riversVisible ? last.riverWidthStats?.culledRivers || 0 : 0,
    riverRendered: riversVisible ? last.riverWidthStats?.rivers || 0 : 0,
    selectionVertices: last.selectionVertexCount || 0,
    labels: {total: last.labelCount || 0, visible: last.visibleLabelCount || 0},
    cityIcons: {total: last.cityIconCount || 0, visible: last.visibleCityIconCount || 0},
    markerIcons: {total: last.markerIconCount || 0, visible: last.visibleMarkerIconCount || 0},
    militaryIcons: {total: last.militaryIconCount || 0, visible: last.visibleMilitaryIconCount || 0},
    measurements: {
      total: last.measurementCount || 0,
      paths: last.measurementPathCount || 0,
      areas: last.measurementAreaCount || 0,
      hidden: Boolean(last.measurementOverlayHidden)
    }
  };
}

function summarizeMs(values) {
  return {
    count: values.length,
    averageMs: averageMs(values),
    p50Ms: percentileMs(values, 0.5),
    p95Ms: percentileMs(values, 0.95),
    maxMs: maxMs(values)
  };
}

function averageMs(values) {
  if (!values.length) return 0;
  return roundMs(values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length);
}

function percentileMs(values, percentile) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentile) - 1));
  return roundMs(sorted[index]);
}

function maxMs(values) {
  return values.length ? roundMs(Math.max(...values)) : 0;
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# WebGL Overlay 交互性能报告", "");
  lines.push(`- 生成时间：${report.metadata.generatedAt}`);
  lines.push(`- seed：\`${report.metadata.seed}\``);
  lines.push(`- 地形模板：\`${report.metadata.template}\``);
  lines.push(`- cells：\`${report.metadata.cells}\``);
  lines.push(`- 预热：每个变体执行 ${report.metadata.warmupRuns} 次相同的“缩放 → idle commit → 平移 → idle commit”序列；预热结果不进入正式样本`);
  lines.push(`- 阈值守门：${report.metadata.enforceThresholds ? "启用" : "关闭（超限仍记录为调查观察，idle 未完成、renderer failed、WebGL / console / page 错误仍失败）"}`);
  lines.push(`- 工作事件采样：只收录 renderer 递增序号变化后的完成事件；rAF 采样只用于帧间隔与状态，不重复计入 last 值`);
  lines.push(`- 正式事件样本数：\`${JSON.stringify(report.metadata.eventSampleCounts)}\``);
  lines.push(`- draw CPU 边界：${report.metadata.timingBoundaries.draw}`);
  lines.push(`- overlay CPU 边界：${report.metadata.timingBoundaries.overlay}`);
  lines.push(`- mesh CPU 边界：${report.metadata.timingBoundaries.mesh}`);
  lines.push(`- buffer upload CPU 边界：${report.metadata.timingBoundaries.bufferUpload}`);
  lines.push(`- idle commit 边界：${report.metadata.timingBoundaries.idleCommit}`);
  lines.push(`- idle 分项：${report.metadata.timingBoundaries.idleComponents}`);
  lines.push(`- 观测开销：${report.metadata.timingBoundaries.instrumentation}`);
  lines.push(`- 帧 p95 上限：\`${report.metadata.maxFrameP95Ms}ms\``);
  lines.push(`- overlay p95 上限：\`${report.metadata.maxOverlayP95Ms}ms\``);
  lines.push(`- idle commit 上限：\`${report.metadata.maxIdleCommitMs}ms\``);
  lines.push(`- idle commit 帧 p95 上限：\`${report.metadata.maxIdleFrameP95Ms}ms\``);
  lines.push(`- 结论：${report.passed ? "通过" : "失败"}`);
  lines.push("");
  lines.push("## 初始 overlay", "");
  for (const variant of report.variants) {
    lines.push(`### ${variant.label}`, "");
    lines.push(`- overlay 节点：${variant.initialStats.overlayChildCount}`);
    lines.push(`- 标签：${variant.initialStats.visibleLabelCount} / ${variant.initialStats.labelCount}`);
    lines.push(`- 城市图标：${variant.initialStats.visibleCityIconCount} / ${variant.initialStats.cityIconCount}`);
    lines.push(`- marker 图标：${variant.initialStats.visibleMarkerIconCount} / ${variant.initialStats.markerIconCount}`);
    lines.push(`- 军事图标：${variant.initialStats.visibleMilitaryIconCount} / ${variant.initialStats.militaryIconCount}`);
    lines.push(`- 测量对象：${variant.initialStats.measurementCount}，SVG path ${variant.initialStats.measurementPathCount}，area ${variant.initialStats.measurementAreaCount}`);
    lines.push(`- selection vertices：${variant.initialStats.selectionVertexCount}，selection build ${variant.initialStats.selectionBuildMs}ms`);
    lines.push(`- route vertices：${variant.initialStats.routeVertexCount}`);
    lines.push(`- river vertices：${variant.initialStats.riverVertexCount}`);
    if (variant.fixture) lines.push(`- 夹具：\`${JSON.stringify(variant.fixture)}\``);
    lines.push(`- 夹具预期：\`${JSON.stringify(variant.fixtureExpectation)}\``);
    lines.push(`- 地图身份：\`${JSON.stringify({...variant.fixtureState.map, checksum: variant.fixtureState.checksum, mapRevision: variant.fixtureState.mapRevision})}\``);
    lines.push(`- 夹具状态：camera=\`${JSON.stringify(variant.fixtureState.camera)}\`，layers=\`${JSON.stringify(variant.fixtureState.layers)}\`，colorMode=\`${variant.fixtureState.colorMode}\`，selection=\`${JSON.stringify(variant.fixtureState.selection)}\`，hover=\`${JSON.stringify(variant.fixtureState.hover)}\``);
    lines.push(`- 交互不变量：checksum ${variant.invariants.checksumUnchanged ? "不变" : "改变"}，revision ${variant.invariants.mapRevisionUnchanged ? "不变" : "改变"}`);
    lines.push(`- canonical 恢复：${variant.restoration.passed ? "通过" : "失败"}；camera=\`${JSON.stringify(variant.restoration.state.camera)}\`，selection=\`${JSON.stringify(variant.restoration.state.selection)}\`，hover=\`${JSON.stringify(variant.restoration.state.hover)}\``);
    lines.push("");
  }
  lines.push("");
  lines.push("## 交互摘要", "");
  lines.push("| 变体 | 场景 | rAF 样本 | draw 事件 | overlay 事件 | mesh 事件 | 帧均值 | 帧 p50 | 帧 p95 | 帧最大 | draw 均值 | overlay 均值 | overlay p95 | overlay 最大 | 长任务 |");
  lines.push("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const item of report.interactions) {
    const meshEvents = (item.eventSampleCounts.routeMesh || 0) + (item.eventSampleCounts.riverMesh || 0) + (item.eventSampleCounts.selectionMesh || 0);
    lines.push(`| ${item.variantLabel} | ${item.label} | ${item.sampleCount} | ${item.draw.count} | ${item.overlay.count} | ${meshEvents} | ${item.frames.averageMs}ms | ${item.frames.p50Ms}ms | ${item.frames.p95Ms}ms | ${item.frames.maxMs}ms | ${item.draw.averageMs}ms | ${item.overlay.averageMs}ms | ${item.overlay.totalP95Ms}ms | ${item.overlay.maxMs}ms | ${item.longTasks.length} |`);
  }
  lines.push("");
  lines.push("## 事件处理探针", "");
  lines.push("| 变体 | 场景 | 事件 | dispatch 均值 | dispatch p95 | dispatch 最大 | 到下一帧 p95 | 默认阻止 | bubble/microtask |");
  lines.push("|---|---|---:|---:|---:|---:|---:|---:|---|");
  for (const item of report.interactions) {
    const total = item.events?.total || {};
    lines.push(`| ${item.variantLabel} | ${item.label} | ${total.count || 0} | ${total.dispatchAverageMs || 0}ms | ${total.dispatchP95Ms || 0}ms | ${total.dispatchMaxMs || 0}ms | ${total.nextFrameP95Ms || 0}ms | ${total.defaultPrevented || 0} | ${total.completedInBubble || 0}/${total.completedInMicrotask || 0} |`);
  }
  lines.push("");
  lines.push("### 事件类型分项", "");
  lines.push("| 变体 | 场景 | 类型 | 事件 | dispatch p95 | 到下一帧 p95 |");
  lines.push("|---|---|---|---:|---:|---:|");
  for (const item of report.interactions) {
    for (const [type, summary] of Object.entries(item.events?.byType || {})) {
      lines.push(`| ${item.variantLabel} | ${item.label} | ${type} | ${summary.count || 0} | ${summary.dispatchP95Ms || 0}ms | ${summary.nextFrameP95Ms || 0}ms |`);
    }
  }
  lines.push("");
  lines.push("## overlay 分项均值", "");
  lines.push("| 变体 | 场景 | labels | city icons | marker icons | military icons | selection |");
  lines.push("|---|---|---:|---:|---:|---:|---:|");
  for (const item of report.interactions) {
    lines.push(`| ${item.variantLabel} | ${item.label} | ${item.overlay.labelsAverageMs}ms | ${item.overlay.cityIconsAverageMs}ms | ${item.overlay.markerIconsAverageMs}ms | ${item.overlay.militaryIconsAverageMs}ms | ${item.overlay.selectionAverageMs}ms |`);
  }
  lines.push("");
  lines.push("## 动态线层分项", "");
  lines.push("| 变体 | 场景 | route 事件 | route 均值 | route p95 | route 渲染/筛掉 | river 事件 | river 均值 | river p95 | river 渲染/筛掉 | selection 事件 | selection 均值 | selection p95 |");
  lines.push("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const item of report.interactions) {
    lines.push(`| ${item.variantLabel} | ${item.label} | ${item.dynamic.routeBuildCount} | ${item.dynamic.routeBuildAverageMs}ms | ${item.dynamic.routeBuildP95Ms}ms | ${item.counts.routeRendered}/${item.counts.routeCull} | ${item.dynamic.riverBuildCount} | ${item.dynamic.riverBuildAverageMs}ms | ${item.dynamic.riverBuildP95Ms}ms | ${item.counts.riverRendered}/${item.counts.riverCull} | ${item.dynamic.selectionBuildCount} | ${item.dynamic.selectionBuildAverageMs}ms | ${item.dynamic.selectionBuildP95Ms}ms |`);
  }
  lines.push("");
  lines.push("## Buffer upload CPU 提交", "");
  lines.push("> 下表只测量既有动作中 JavaScript 发起 WebGL buffer 调用的 CPU 墙钟时间，不是 GPU 执行时间。", "");
  lines.push("| 变体 | 场景 | 事件 | 均值 | p95 | 最大 | 动作分组 |");
  lines.push("|---|---|---:|---:|---:|---:|---|");
  for (const item of report.interactions) {
    const actions = Object.entries(item.bufferUpload.byAction || {}).map(([action, summary]) => `${action}:${summary.count}`).join("、") || "无";
    lines.push(`| ${item.variantLabel} | ${item.label} | ${item.bufferUpload.count} | ${item.bufferUpload.averageMs}ms | ${item.bufferUpload.p95Ms}ms | ${item.bufferUpload.maxMs}ms | ${actions} |`);
  }
  lines.push("");
  lines.push("## idle commit", "");
  lines.push("> `耗时`：缩放从最后一次 wheel capture 开始；平移从唯一的最后一次、会影响 viewport 的 pointermove capture 开始，随后的 mouseup 也纳入窗口；直到 commit、overlay 与 dirty 状态全部 clean。route、river、overlay 分项可能嵌套或重叠，不相加推导总耗时。", "");
  lines.push("| 变体 | 场景 | 完成 | 耗时 | 帧 p50 | 帧 p95 | 帧最大 | commit pending | commit running | commit 状态 | route build | river build | overlay | 事件 route/river/overlay/upload | 长任务 | dirty |");
  lines.push("|---|---|---|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---|---:|---|");
  for (const item of report.interactions) {
    const idle = item.idleCommit || {};
    const dirty = [idle.overlaySuspended ? "overlay" : "", idle.routesDirty ? "routes" : "", idle.riversDirty ? "rivers" : "", idle.selectionDirty ? "selection" : ""].filter(Boolean).join(",") || "clean";
    const eventCounts = idle.eventSampleCounts || {};
    lines.push(`| ${item.variantLabel} | ${item.label} | ${idle.completed ? "是" : "否"} | ${idle.elapsedMs || 0}ms | ${idle.frames?.p50Ms || 0}ms | ${idle.frames?.p95Ms || 0}ms | ${idle.frames?.maxMs || 0}ms | ${idle.viewportCommit?.lastPendingMs || 0}ms | ${idle.viewportCommit?.lastMs || 0}ms | ${idle.viewportCommit?.lastStatus || "-"} | ${roundMs(idle.routeBuildMs || 0)}ms | ${roundMs(idle.riverBuildMs || 0)}ms | ${roundMs(idle.overlayMs || 0)}ms | ${eventCounts.routeMesh || 0}/${eventCounts.riverMesh || 0}/${eventCounts.overlay || 0}/${eventCounts.bufferUpload || 0} | ${idle.longTasks?.length || 0} | ${dirty} |`);
  }
  if (report.failures.length) {
    lines.push("", "## 失败项", "");
    for (const failure of report.failures) lines.push(`- ${failure}`);
  }
  if (report.thresholdObservations?.length) {
    lines.push("", "## 阈值观察", "");
    for (const observation of report.thresholdObservations) lines.push(`- ${observation}`);
  }
  if (report.metadata.consoleErrors.length) {
    lines.push("", "## Console Errors", "");
    for (const error of report.metadata.consoleErrors) lines.push(`- ${error}`);
  }
  if (report.metadata.pageErrors.length) {
    lines.push("", "## Page Errors", "");
    for (const error of report.metadata.pageErrors) lines.push(`- ${error}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function renderFailureSummary(report) {
  const lines = ["Overlay 交互性能守门失败："];
  for (const failure of report.failures) lines.push(`- ${failure}`);
  for (const error of report.metadata.consoleErrors) lines.push(`- console error: ${error}`);
  for (const error of report.metadata.pageErrors) lines.push(`- page error: ${error}`);
  return lines.join("\n");
}

async function startStaticServer({host, port, publicDir}) {
  const server = createServer((request, response) => {
    const url = new URL(request.url || "/", `http://${host}:${port}`);
    const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const target = resolve(publicDir, `.${normalize(pathname)}`);
    const relativeTarget = relative(publicDir, target);

    if (relativeTarget.startsWith("..") || isAbsolute(relativeTarget)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }
    if (!existsSync(target) || !statSync(target).isFile()) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "content-type": getContentType(target),
      "cache-control": "no-store, max-age=0"
    });
    createReadStream(target).pipe(response);
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

function getContentType(file) {
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png"
  };
  return types[extname(file).toLowerCase()] || "application/octet-stream";
}

function loadPlaywright(packageDir) {
  try {
    const requireFromDirectory = createRequire(join(packageDir, "package.json"));
    return requireFromDirectory("playwright");
  } catch (error) {
    fail(`无法从 ${packageDir} 加载 Playwright；请用 --playwright-dir 指向含 package.json 与 Playwright 依赖的目录：${error.message}`);
  }
}

async function launchBrowser(playwright, {headless, browserChannel}) {
  return playwright.chromium.launch({
    headless,
    channel: browserChannel || undefined
  });
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (!arg.startsWith("--")) continue;
    const [key, inlineValue] = arg.slice(2).split("=");
    parsed[key] = inlineValue ?? argv[++index] ?? true;
  }
  return parsed;
}

function parseViewport(value) {
  const match = /^(\d+)x(\d+)$/i.exec(String(value || ""));
  if (!match) return {width: 1280, height: 820};
  return {width: Number(match[1]), height: Number(match[2])};
}

function parseWarmupRuns(value, fallback) {
  if (value === undefined) return fallback;
  if (value === true || value === "true") return 1;
  if (value === false || value === "false") return 0;
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : fallback;
}

function parseBoolean(value, fallback) {
  if (value === undefined) return fallback;
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0") return false;
  return fallback;
}

function parseVariants(value) {
  const ids = String(value || "full")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
  const expanded = ids.flatMap(id => id === "overlayMatrix" ? ["full", "noLabels", "noCities", "noMarkersResources", "noMilitary", "noRoutesRivers"] : [id]);
  return expanded.map(overlayVariant);
}

function overlayVariant(id) {
  const variants = {
    full: {id, label: "完整图层", layers: {}},
    "measurement-heavy": {id, label: "测量对象重场景", layers: {measurements: true}, fixture: "measurement-heavy", fixtureCount: measurementFixtureCount},
    measurementHeavy: {id, label: "测量对象重场景", layers: {measurements: true}, fixture: "measurement-heavy", fixtureCount: measurementFixtureCount},
    "selection-heavy": {id, label: "选中态重场景", layers: {}, fixture: "selection-heavy", selectionKind: "state"},
    selectionHeavy: {id, label: "选中态重场景", layers: {}, fixture: "selection-heavy", selectionKind: "state"},
    noLabels: {id, label: "关闭文字标签", layers: {labels: false, stateLabels: false, provinceLabels: false, zoneLabels: false}},
    noCities: {id, label: "关闭城市图标", layers: {cities: false}},
    noMarkersResources: {id, label: "关闭资源和标记图标", layers: {markers: false, resources: false}},
    noMilitary: {id, label: "关闭军事图标", layers: {military: false}},
    noDomOverlays: {
      id,
      label: "关闭地图 DOM 图标和标签",
      layers: {
        labels: false,
        stateLabels: false,
        provinceLabels: false,
        zoneLabels: false,
        cities: false,
        markers: false,
        resources: false,
        military: false,
        measurements: false
      }
    },
    noRoutesRivers: {id, label: "关闭路线和河流", layers: {routes: false, rivers: false}}
  };
  return variants[id] || {id, label: id, layers: {}};
}

function canvasCenter(box) {
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2
  };
}

function roundMs(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function delay(ms) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
