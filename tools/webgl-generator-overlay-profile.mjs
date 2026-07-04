#!/usr/bin/env node
import {createReadStream, existsSync, mkdirSync, statSync, writeFileSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {dirname, extname, join, normalize, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
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
const outPath = resolve(args.out || join(rootDir, "docs", "generated", "reports", "overlay-profile-results.json"));
const markdownPath = resolve(args.markdown || join(rootDir, "docs", "generated", "reports", "overlay-profile-results.md"));
const viewport = parseViewport(args.viewport || "1280x820");
const maxFrameP95Ms = Number(args["max-frame-p95-ms"] || 80);
const maxOverlayP95Ms = Number(args["max-overlay-p95-ms"] || 35);
const maxIdleCommitMs = Number(args["max-idle-commit-ms"] || 10000);
const maxIdleFrameP95Ms = Number(args["max-idle-frame-p95-ms"] || maxFrameP95Ms);
const measurementFixtureCount = Number(args["measurement-fixture-count"] || 180);
const variants = parseVariants(args.variants || args.variant || "full");

if (!existsSync(distDir)) fail(`构建产物不存在：${distDir}`);
mkdirSync(dirname(outPath), {recursive: true});
mkdirSync(dirname(markdownPath), {recursive: true});

const playwright = await loadPlaywright(sourceDir);
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
  page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", error => consoleErrors.push(error.message));

  const baseUrl = `http://${host}:${port}`;
  await page.goto(baseUrl, {waitUntil: "domcontentloaded", timeout: timeoutMs});
  await page.waitForFunction(() => window.__webglGeneratorApp?.renderer?.getStats?.()?.webgl2, null, {timeout: timeoutMs});
  await page.waitForFunction(() => window.__webglGeneratorApp?.map?.metadata?.generationTiming?.totalMs, null, {timeout: timeoutMs});
  await generateCase(page, {cells, seed, template, graphWidth, graphHeight});

  const failures = [];
  const variantReports = [];
  for (const variant of variants) {
    await resetProfileScenario(page);
    await applyVariant(page, variant);
    const fixture = await prepareVariantFixture(page, variant);
    const initialStats = await readStats(page);
    const zoom = await profileZoom(page);
    zoom.idleCommit = await waitForOverlayIdle(page);
    const pan = await profilePan(page);
    pan.idleCommit = await waitForOverlayIdle(page);
    const finalStats = await readStats(page);
    const interactions = [zoom, pan];
    variantReports.push({id: variant.id, label: variant.label, fixture, initialStats, finalStats, interactions});
    for (const item of interactions) {
      if (item.frames.p95Ms > maxFrameP95Ms) failures.push(`${variant.label} / ${item.label} 帧 p95 ${item.frames.p95Ms}ms 超过 ${maxFrameP95Ms}ms`);
      if (item.overlay.totalP95Ms > maxOverlayP95Ms) failures.push(`${variant.label} / ${item.label} overlay p95 ${item.overlay.totalP95Ms}ms 超过 ${maxOverlayP95Ms}ms`);
      if (!item.idleCommit?.completed) failures.push(`${variant.label} / ${item.label} idle commit 未在 ${Math.min(timeoutMs, 10000)}ms 内完成`);
      if ((item.idleCommit?.elapsedMs || 0) > maxIdleCommitMs) failures.push(`${variant.label} / ${item.label} idle commit 耗时 ${item.idleCommit.elapsedMs}ms 超过 ${maxIdleCommitMs}ms`);
      if ((item.idleCommit?.frames?.p95Ms || 0) > maxIdleFrameP95Ms) failures.push(`${variant.label} / ${item.label} idle commit 帧 p95 ${item.idleCommit.frames.p95Ms}ms 超过 ${maxIdleFrameP95Ms}ms`);
      if (item.glErrors.some(value => value !== 0)) failures.push(`${variant.label} / ${item.label} WebGL error 不为 0`);
    }
  }
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
      variants: variants.map(variant => variant.id),
      maxFrameP95Ms,
      maxOverlayP95Ms,
      maxIdleCommitMs,
      maxIdleFrameP95Ms,
      consoleErrors
    },
    initialStats: variantReports[0]?.initialStats || null,
    finalStats: variantReports.at(-1)?.finalStats || null,
    variants: variantReports,
    interactions,
    failures,
    passed: !consoleErrors.length && failures.length === 0
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
    await page.mouse.wheel(0, index < 9 ? -220 : 170);
    await delay(34);
  }
  const frames = await stopFrameRecorder(page);
  const samples = frames.samples?.length ? frames.samples : [await readStats(page)];
  return summarizeInteraction("zoom", "连续滚轮缩放", samples, frames);
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
    await page.mouse.move(x, y, {steps: 2});
    await delay(24);
  }
  await page.mouse.up({button: "middle"});
  const frames = await stopFrameRecorder(page);
  const samples = frames.samples?.length ? frames.samples : [await readStats(page)];
  return summarizeInteraction("pan", "中键拖动画布", samples, frames);
}

async function applyVariant(page, variant) {
  await page.evaluate(variant => {
    const renderer = window.__webglGeneratorApp?.renderer;
    if (!renderer) return;
    const baseLayers = {
      routes: true,
      rivers: true,
      cities: true,
      labels: true,
      stateLabels: true,
      markers: true,
      resources: true,
      military: true
    };
    for (const [layer, visible] of Object.entries({...baseLayers, ...(variant.layers || {})})) {
      renderer.setLayerVisible(layer, visible);
    }
  }, variant);
  await page.waitForTimeout(150);
}

async function resetProfileScenario(page) {
  await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    if (!app?.map || !app.renderer) return;
    app.measurement.active = false;
    app.measurement.points = [];
    app.measurement.pointer = null;
    app.measurement.drag = null;
    app.measurement.editingMeasurementId = null;
    app.map.measurements = {
      version: 1,
      items: [],
      metadata: {measurements: 0, nextId: 1}
    };
    app.selectionStore?.clear?.();
    app.renderer.setSelection?.(null);
    app.renderer.setLayerVisible?.("measurements", true);
    app.renderer.fitToView?.();
  });
  await page.waitForTimeout(120);
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
    app.renderer.setLayerVisible?.("measurements", true);
    app.renderer.fitToView?.();

    function roundBrowserMeasurement(value) {
      return Math.round(Number(value || 0) * 1000) / 1000;
    }
  }, {count: Math.max(1, Math.round(Number(variant.fixtureCount || measurementFixtureCount) || measurementFixtureCount))});
  await page.waitForTimeout(160);
  return page.evaluate(() => ({
    type: "measurement-heavy",
    measurementCount: window.__webglGeneratorApp?.map?.measurements?.items?.length || 0,
    objectPathCount: document.querySelectorAll(".measurement-object-path").length,
    objectAreaCount: document.querySelectorAll(".measurement-object-area").length,
    overlayHidden: Boolean(document.getElementById("measurement-overlay")?.hidden)
  }));
}

async function createSelectionHeavyFixture(page, variant) {
  await page.evaluate(({kind}) => {
    const app = window.__webglGeneratorApp;
    if (!app?.map || !app.renderer) return;
    const field = kind || "state";
    const values = app.map.grid?.cells?.[field] || [];
    const counts = new Map();
    for (const value of values) {
      const id = Number(value);
      if (!Number.isInteger(id) || id <= 0) continue;
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    const [id] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] || [];
    if (!Number.isInteger(id)) return;
    const object = {kind, id};
    app.selection = {object};
    app.editingObject = null;
    app.renderer.setSelection?.(object);
    app.renderer.fitToView?.();
    app.renderer.draw?.();
  }, {kind: variant.selectionKind || "state"});
  await page.waitForTimeout(160);
  return page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const stats = app?.renderer?.getStats?.() || {};
    const selection = app?.selection?.object || null;
    const field = selection?.kind || "";
    const values = field ? app?.map?.grid?.cells?.[field] || [] : [];
    const selectedCells = values.filter(value => Number(value) === Number(selection?.id)).length;
    return {
      type: "selection-heavy",
      selection,
      selectedCells,
      selectionVertexCount: stats.selectionVertexCount || 0,
      selectionBuildMs: stats.selectionBuildMs || 0,
      selectionHighlightMode: stats.selectionHighlightMode || "none"
    };
  });
}

async function waitForOverlayIdle(page) {
  await page.evaluate(() => {
    const previous = window.__webglGeneratorOverlayIdleProfile;
    if (previous) {
      previous.running = false;
      previous.observer?.disconnect?.();
    }
    const profile = {
      startedAt: performance.now(),
      frames: [],
      longTasks: [],
      running: true,
      lastFrameAt: 0,
      observer: null
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
      if (profile.running) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    window.__webglGeneratorOverlayIdleProfile = profile;
  });
  const completed = await page.waitForFunction(() => {
    const stats = window.__webglGeneratorApp?.renderer?.getStats?.();
    if (!stats || stats.overlay?.interactionSuspended !== false) return false;
    const routesClean = stats.layerVisibility?.routes === false || stats.dynamicMeshCache?.routesDirty === false;
    const riversClean = stats.layerVisibility?.rivers === false || stats.dynamicMeshCache?.riversDirty === false;
    return routesClean && riversClean;
  }, null, {timeout: Math.min(timeoutMs, 10000)}).then(() => true).catch(() => false);
  await page.waitForTimeout(40);
  return page.evaluate(completed => {
    const profile = window.__webglGeneratorOverlayIdleProfile;
    const stats = window.__webglGeneratorApp?.renderer?.getStats?.() || {};
    if (!profile) return emptyOverlayIdleProfile(completed, stats);
    profile.running = false;
    profile.observer?.disconnect?.();
    return {
      completed,
      elapsedMs: Math.round((performance.now() - profile.startedAt) * 100) / 100,
      frames: summarizeIdleFrames(profile.frames),
      longTasks: profile.longTasks.map(item => ({
        startTime: Math.round(item.startTime * 10) / 10,
        duration: Math.round(item.duration * 10) / 10
      })),
      overlaySuspended: Boolean(stats.overlay?.interactionSuspended),
      routesDirty: Boolean(stats.dynamicMeshCache?.routesDirty),
      riversDirty: Boolean(stats.dynamicMeshCache?.riversDirty),
      routeBuildMs: stats.layerVisibility?.routes === false || stats.dynamicMeshCache?.routesDirty ? 0 : stats.routeBuildMs || 0,
      riverBuildMs: stats.layerVisibility?.rivers === false || stats.dynamicMeshCache?.riversDirty ? 0 : stats.riverBuildMs || 0,
      overlayMs: stats.overlay?.update?.totalMs || 0
    };

    function summarizeIdleFrames(values) {
      if (!values.length) return {count: 0, averageMs: 0, p95Ms: 0, maxMs: 0};
      const sorted = [...values].sort((a, b) => a - b);
      const sum = values.reduce((total, value) => total + value, 0);
      const p95Index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * 0.95) - 1));
      return {
        count: values.length,
        averageMs: Math.round((sum / values.length) * 100) / 100,
        p95Ms: Math.round(sorted[p95Index] * 100) / 100,
        maxMs: Math.round(sorted[sorted.length - 1] * 100) / 100
      };
    }

    function emptyOverlayIdleProfile(done, currentStats) {
      return {
        completed: done,
        elapsedMs: 0,
        frames: {count: 0, averageMs: 0, p95Ms: 0, maxMs: 0},
        longTasks: [],
        overlaySuspended: Boolean(currentStats.overlay?.interactionSuspended),
        routesDirty: Boolean(currentStats.dynamicMeshCache?.routesDirty),
        riversDirty: Boolean(currentStats.dynamicMeshCache?.riversDirty),
        routeBuildMs: 0,
        riverBuildMs: 0,
        overlayMs: 0
      };
    }
  }, completed);
}

async function startFrameRecorder(page) {
  await page.evaluate(() => {
    function snapshotInteractionStats() {
      const app = window.__webglGeneratorApp;
      const renderer = app?.renderer;
      if (!renderer) return {};
      const dirty = renderer.dynamicBuffersDirty || {};
      return {
        drawMs: renderer.lastDraw?.drawMs || 0,
        glError: renderer.lastDraw?.glError ?? null,
        camera: renderer.camera ? {...renderer.camera} : null,
        layerVisibility: renderer.layerVisibility ? {...renderer.layerVisibility} : {},
        overlay: renderer.lastOverlayUpdate ? {...renderer.lastOverlayUpdate} : {},
        overlayInteractionSuspended: Boolean(renderer.overlayInteractionSuspended),
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
        measurementPathCount: renderer.measurementOverlay?.querySelectorAll?.(".measurement-object-path").length || 0,
        measurementAreaCount: renderer.measurementOverlay?.querySelectorAll?.(".measurement-object-area").length || 0,
        measurementOverlayHidden: Boolean(renderer.measurementOverlay?.hidden),
        routeBuildMs: renderer.routeBuildMs || 0,
        routeVertexCount: renderer.routeVertexCount || 0,
        routeRenderStats: renderer.routeRenderStats ? {...renderer.routeRenderStats} : {},
        riverBuildMs: renderer.riverBuildMs || 0,
        riverVertexCount: renderer.riverVertexCount || 0,
        riverWidthStats: renderer.riverWidthStats ? {...renderer.riverWidthStats} : {},
        selectionBuildMs: renderer.selectionBuildMs || 0,
        selectionVertexCount: renderer.selectionVertexCount || 0,
        dynamicMeshCache: {
          routesDirty: Boolean(dirty.routes),
          tradeFlowsDirty: Boolean(dirty.tradeFlows),
          riversDirty: Boolean(dirty.rivers),
          selectionDirty: Boolean(dirty.selection)
        }
      };
    }

    const profile = {
      frames: [],
      longTasks: [],
      samples: [],
      running: true,
      lastFrameAt: 0,
      observer: null
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
    profile.observer?.disconnect?.();
    return {
      frames: profile.frames,
      longTasks: profile.longTasks,
      samples: profile.samples
    };
  });
}

async function readStats(page) {
  return page.evaluate(() => {
    const stats = window.__webglGeneratorApp?.renderer?.getStats?.() || {};
    return {
      drawMs: stats.draw?.drawMs || 0,
      glError: stats.draw?.glError ?? null,
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

function summarizeInteraction(id, label, samples, frameData) {
  const overlayTotals = samples.map(sample => sample.overlayInteractionSuspended ? 0 : sample.overlay?.totalMs || 0);
  const draws = samples.map(sample => sample.drawMs || 0);
  const routeBuilds = changedBuildSamples(samples, {layer: "routes", dirty: "routesDirty", value: "routeBuildMs"});
  const riverBuilds = changedBuildSamples(samples, {layer: "rivers", dirty: "riversDirty", value: "riverBuildMs"});
  const selectionBuilds = changedBuildSamples(samples, {dirty: "selectionDirty", value: "selectionBuildMs"});
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
      averageMs: averageMs(draws),
      p95Ms: percentileMs(draws, 0.95),
      maxMs: maxMs(draws)
    },
    overlay: {
      averageMs: averageMs(overlayTotals),
      totalP95Ms: percentileMs(overlayTotals, 0.95),
      maxMs: maxMs(overlayTotals),
      suspendedSamples: samples.filter(sample => sample.overlayInteractionSuspended).length,
      labelsAverageMs: averageMs(samples.map(sample => sample.overlayInteractionSuspended ? 0 : sample.overlay?.labelsMs || 0)),
      cityIconsAverageMs: averageMs(samples.map(sample => sample.overlayInteractionSuspended ? 0 : sample.overlay?.cityIconsMs || 0)),
      markerIconsAverageMs: averageMs(samples.map(sample => sample.overlayInteractionSuspended ? 0 : sample.overlay?.markerIconsMs || 0)),
      militaryIconsAverageMs: averageMs(samples.map(sample => sample.overlayInteractionSuspended ? 0 : sample.overlay?.militaryIconsMs || 0)),
      selectionAverageMs: averageMs(samples.map(sample => sample.overlayInteractionSuspended ? 0 : sample.overlay?.selectionMs || 0))
    },
    dynamic: {
      routeBuildAverageMs: averageMs(routeBuilds),
      routeBuildP95Ms: percentileMs(routeBuilds, 0.95),
      riverBuildAverageMs: averageMs(riverBuilds),
      riverBuildP95Ms: percentileMs(riverBuilds, 0.95),
      selectionBuildAverageMs: averageMs(selectionBuilds),
      selectionBuildP95Ms: percentileMs(selectionBuilds, 0.95)
    },
    counts: summarizeCounts(samples),
    glErrors: [...new Set(samples.map(sample => sample.glError))]
  };
}

function changedBuildSamples(samples, {layer = null, dirty, value}) {
  let previous = null;
  let initialized = false;
  return samples.map(sample => {
    if (layer && sample.layerVisibility?.[layer] === false) return 0;
    if (sample.dynamicMeshCache?.[dirty]) return 0;
    const current = Number(sample[value] || 0);
    if (!initialized) {
      previous = current;
      initialized = true;
      return 0;
    }
    if (current === previous) return 0;
    previous = current;
    return current;
  });
}

function summarizeCounts(samples) {
  const last = samples.at(-1) || {};
  const routesVisible = last.layerVisibility?.routes !== false && !last.dynamicMeshCache?.routesDirty;
  const riversVisible = last.layerVisibility?.rivers !== false && !last.dynamicMeshCache?.riversDirty;
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
    lines.push("");
  }
  lines.push("");
  lines.push("## 交互摘要", "");
  lines.push("| 变体 | 场景 | 样本 | 帧均值 | 帧 p95 | 帧最大 | draw 均值 | overlay 均值 | overlay p95 | overlay 最大 | overlay 暂停 | 长任务 |");
  lines.push("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const item of report.interactions) {
    lines.push(`| ${item.variantLabel} | ${item.label} | ${item.sampleCount} | ${item.frames.averageMs}ms | ${item.frames.p95Ms}ms | ${item.frames.maxMs}ms | ${item.draw.averageMs}ms | ${item.overlay.averageMs}ms | ${item.overlay.totalP95Ms}ms | ${item.overlay.maxMs}ms | ${item.overlay.suspendedSamples} | ${item.longTasks.length} |`);
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
  lines.push("| 变体 | 场景 | route 均值 | route p95 | route 渲染/筛掉 | river 均值 | river p95 | river 渲染/筛掉 | selection 均值 | selection p95 |");
  lines.push("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const item of report.interactions) {
    lines.push(`| ${item.variantLabel} | ${item.label} | ${item.dynamic.routeBuildAverageMs}ms | ${item.dynamic.routeBuildP95Ms}ms | ${item.counts.routeRendered}/${item.counts.routeCull} | ${item.dynamic.riverBuildAverageMs}ms | ${item.dynamic.riverBuildP95Ms}ms | ${item.counts.riverRendered}/${item.counts.riverCull} | ${item.dynamic.selectionBuildAverageMs}ms | ${item.dynamic.selectionBuildP95Ms}ms |`);
  }
  lines.push("");
  lines.push("## idle commit", "");
  lines.push("| 变体 | 场景 | 完成 | 耗时 | 帧 p95 | 帧最大 | route build | river build | overlay | 长任务 | dirty |");
  lines.push("|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|");
  for (const item of report.interactions) {
    const idle = item.idleCommit || {};
    const dirty = [idle.overlaySuspended ? "overlay" : "", idle.routesDirty ? "routes" : "", idle.riversDirty ? "rivers" : ""].filter(Boolean).join(",") || "clean";
    lines.push(`| ${item.variantLabel} | ${item.label} | ${idle.completed ? "是" : "否"} | ${idle.elapsedMs || 0}ms | ${idle.frames?.p95Ms || 0}ms | ${idle.frames?.maxMs || 0}ms | ${roundMs(idle.routeBuildMs || 0)}ms | ${roundMs(idle.riverBuildMs || 0)}ms | ${roundMs(idle.overlayMs || 0)}ms | ${idle.longTasks?.length || 0} | ${dirty} |`);
  }
  if (report.failures.length) {
    lines.push("", "## 失败项", "");
    for (const failure of report.failures) lines.push(`- ${failure}`);
  }
  if (report.metadata.consoleErrors.length) {
    lines.push("", "## Console Errors", "");
    for (const error of report.metadata.consoleErrors) lines.push(`- ${error}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function renderFailureSummary(report) {
  const lines = ["Overlay 交互性能守门失败："];
  for (const failure of report.failures) lines.push(`- ${failure}`);
  for (const error of report.metadata.consoleErrors) lines.push(`- console error: ${error}`);
  return lines.join("\n");
}

async function startStaticServer({host, port, publicDir}) {
  const server = createServer((request, response) => {
    const url = new URL(request.url || "/", `http://${host}:${port}`);
    const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const target = resolve(publicDir, `.${normalize(pathname)}`);

    if (!target.startsWith(publicDir)) {
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

async function loadPlaywright(packageDir) {
  const requireFromSource = createRequire(join(packageDir, "package.json"));
  return requireFromSource("playwright");
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
    noLabels: {id, label: "关闭文字标签", layers: {labels: false, stateLabels: false}},
    noCities: {id, label: "关闭城市图标", layers: {cities: false}},
    noMarkersResources: {id, label: "关闭资源和标记图标", layers: {markers: false, resources: false}},
    noMilitary: {id, label: "关闭军事图标", layers: {military: false}},
    noDomOverlays: {
      id,
      label: "关闭地图 DOM 图标和标签",
      layers: {cities: false, labels: false, stateLabels: false, markers: false, resources: false, military: false}
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
