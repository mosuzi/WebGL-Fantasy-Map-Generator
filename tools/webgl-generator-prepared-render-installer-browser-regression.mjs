#!/usr/bin/env node
import assert from "node:assert/strict";

import {createReadStream, existsSync, readFileSync, statSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {dirname, extname, join, normalize, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const applicationSourceDir = join(rootDir, "app", "webgl-generator", "src");
const earcutModule = createRequire(import.meta.url).resolve("earcut");
const polygonClippingUmd = join(rootDir, "prototype", "boundary-topology-lab", "vendor", "polygon-clipping.umd.min.mjs");
const distDir = join(rootDir, "dist", "webgl-generator");
const host = "127.0.0.1";
const port = 5532;
const timeoutMs = 240000;

assert.ok(existsSync(distDir), `构建产物不存在：${distDir}`);
const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const server = await startStaticServer();
let browser;
let context;

try {
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  context = await browser.newContext({viewport: {width: 1280, height: 820}, deviceScaleFactor: 1});
  await context.addInitScript(() => {
    localStorage.clear();
    window.__task322InstallerLongTasks = [];
    window.__task322InstallerRecordingWindow = {start: Infinity, end: Infinity};
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        const windowRange = window.__task322InstallerRecordingWindow;
        if (entry.startTime < windowRange.start || entry.startTime > windowRange.end) continue;
        window.__task322InstallerLongTasks.push({startTime: entry.startTime, duration: entry.duration, name: entry.name});
      }
    }).observe({entryTypes: ["longtask"]});
  });
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  const consoleErrors = [];
  const pageErrors = [];
  const requestFailures = [];
  page.on("console", message => {
    if (message.type() !== "error") return;
    consoleErrors.push(message.text());
    process.stderr.write(`[console] ${message.text()}\n`);
  });
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("requestfailed", request => {
    const item = {url: request.url(), error: request.failure()?.errorText || "failed"};
    requestFailures.push(item);
    process.stderr.write(`[requestfailed] ${JSON.stringify(item)}\n`);
  });
  page.on("response", response => {
    if ((response.url().includes("/__src__/") || response.url().endsWith(".js")) && String(response.headers()["content-type"] || "").includes("text/html")) {
      process.stderr.write(`[module-html] ${response.url()}\n`);
    }
    if (response.status() >= 400) {
      const item = {url: response.url(), error: `HTTP ${response.status()}`};
      requestFailures.push(item);
      process.stderr.write(`[response] ${JSON.stringify(item)}\n`);
    }
  });
  await page.goto(`http://${host}:${port}?healthClear=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, timeoutMs);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");

  const generated = await page.evaluate(async () => window.webglGeneratorApi.generate.newMap({
    confirm: true,
    seed: "task322-prepared-render-installer",
    cellsTarget: 10000,
    heightmapTemplate: "continents"
  }));
  assert.equal(generated?.ok, true, `正式 10k 地图生成失败：${generated?.error?.message || "unknown"}`);
  await page.evaluate(() => new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
  const metricsBefore = indexMetrics(await cdp.send("Performance.getMetrics"));

  const result = await page.evaluate(async () => {
    const [{executeRenderPreparationTask, RENDER_PREPARATION_LAYERS, renderPreparationLayersForRegeneration}, {prepareRendererWorkerInstall}, picking] = await Promise.all([
      import("/__src__/renderer/render-preparation.js"),
      import("/__src__/renderer/prepared-render-installer.js"),
      import("/__src__/renderer/picking.js")
    ]);
    const app = window.__webglGeneratorApp;
    const renderer = app.renderer;
    const map = app.map;
    const binding = app.mapRevision.getSnapshot();
    const city = (map.settlements?.cities || []).find(item => item && !item.removed);
    const route = (map.settlements?.routes || []).find(item => item && !item.removed && item.points?.length > 1);
    const river = (map.rivers?.rivers || []).find(item => item && !item.removed && (item.displayPoints || item.points)?.length > 1);
    if (!city || !route || !river) throw new Error("10k 固定图缺少 city / route / river picking 正例");

    renderer.setSelection({kind: "city", id: city.id, x: city.x, y: city.y}, {draw: false});
    renderer.setObjectHighlights([{kind: "route", id: route.id}], {draw: false});
    renderer.setPoliticalMeshDebugMode("states");
    renderer.draw();
    const ownerGuard = verifySurfaceOwnerGuard(renderer);

    const request = () => ({
      map,
      binding,
      camera: {...renderer.camera},
      canvas: {
        width: renderer.canvas.width,
        height: renderer.canvas.height,
        clientWidth: renderer.canvas.clientWidth,
        clientHeight: renderer.canvas.clientHeight
      },
      selection: renderer.selection,
      objectHighlights: renderer.objectHighlights,
      visualTheme: renderer.visualTheme,
      unitPreferences: renderer.unitPreferences,
      politicalMeshDebugMode: renderer.politicalMeshDebugMode,
      visibility: renderer.layerVisibility,
      colorMode: renderer.colorMode,
      viewOptions: renderer.viewOptions,
      labelOptions: renderer.labelOptions,
      oceanCurrentHighlightIds: [...renderer.oceanCurrentHighlights]
    });
    const prepared = await executeRenderPreparationTask({...request(), layers: RENDER_PREPARATION_LAYERS});
    const old = captureRendererState(renderer);
    const equivalence = comparePreparedToRenderer(renderer, prepared, old);
    const presentation = presentationFingerprint(renderer);
    const progress = new Map();
    const timing = {prepareInstallMs: 0, commitMs: 0, drawMs: 0, rollbackMs: 0, finalizeMs: 0, activeCpuMs: 0, maxActiveSliceMs: 0, maxActiveSliceStage: "", maxProgressWallGapMs: 0, yieldCount: 0, yieldWaitMs: 0, maxYieldWaitMs: 0, progressStages: []};
    let lastProgressAt = performance.now();
    let activeSliceStartedAt = performance.now();
    let lastProgressStage = "installer:start";
    let measureProgressGap = true;
    const onProgress = stage => {
      const now = performance.now();
      lastProgressStage = stage;
      if (measureProgressGap) timing.maxProgressWallGapMs = Math.max(timing.maxProgressWallGapMs, now - lastProgressAt);
      lastProgressAt = now;
      progress.set(stage, (progress.get(stage) || 0) + 1);
    };
    window.__task322InstallerLongTasks.length = 0;
    await new Promise(resolveFrame => requestAnimationFrame(resolveFrame));
    window.__task322InstallerRecordingWindow = {start: performance.now(), end: Infinity};
    lastProgressAt = performance.now();
    activeSliceStartedAt = performance.now();

    const installStartedAt = performance.now();
    const transaction = await prepareRendererWorkerInstall(renderer, map, prepared, {
      binding,
      budgetMs: 4,
      uploadSliceBytes: 128 * 1024,
      onProgress,
      yieldToMain: async () => {
        const activeMs = performance.now() - activeSliceStartedAt;
        timing.activeCpuMs += activeMs;
        if (activeMs > timing.maxActiveSliceMs) {
          timing.maxActiveSliceMs = activeMs;
          timing.maxActiveSliceStage = lastProgressStage;
        }
        const yieldStartedAt = performance.now();
        if (typeof scheduler?.yield === "function") await scheduler.yield();
        else await new Promise(resolveYield => setTimeout(resolveYield, 0));
        const yieldWaitMs = performance.now() - yieldStartedAt;
        timing.yieldCount++;
        timing.yieldWaitMs += yieldWaitMs;
        timing.maxYieldWaitMs = Math.max(timing.maxYieldWaitMs, yieldWaitMs);
        activeSliceStartedAt = performance.now();
      }
    });
    timing.prepareInstallMs = performance.now() - installStartedAt;
    const commitStartedAt = performance.now();
    transaction.commit();
    timing.commitMs = performance.now() - commitStartedAt;
    const drawStartedAt = performance.now();
    renderer.draw({updateDynamicBuffers: false});
    timing.drawMs = performance.now() - drawStartedAt;
    const finalActiveMs = performance.now() - activeSliceStartedAt;
    timing.activeCpuMs += finalActiveMs;
    if (finalActiveMs > timing.maxActiveSliceMs) {
      timing.maxActiveSliceMs = finalActiveMs;
      timing.maxActiveSliceStage = "commit+draw";
    }
    window.__task322InstallerRecordingWindow.end = performance.now();
    await new Promise(resolveYield => setTimeout(resolveYield, 0));
    measureProgressGap = false;
    timing.progressStages = [...progress.entries()].map(([stage, count]) => ({stage, count}));
    assertPresentation(renderer, presentation, "全层 commit");
    const committed = captureRendererState(renderer);
    assertCommittedEquivalence(renderer, prepared, committed, old);
    const pickingResult = verifyPicking(picking, map, renderer.objectPickingIndex, {city, route, river});
    const finalizeStartedAt = performance.now();
    const finalized = transaction.finalize();
    timing.finalizeMs = performance.now() - finalizeStartedAt;
    if (!finalized || transaction.rollback() !== false) throw new Error("finalize 后 rollback 状态机无效");
    assertSurfaceBaseBuffersDeleted(renderer.gl, old.surfaceBase, "全层 finalize old surface base");
    assertSurfaceBaseBuffersLive(renderer.gl, committed.surfaceBase, "全层 finalize current surface base");

    const rollbackPrepared = await executeRenderPreparationTask({...request(), layers: RENDER_PREPARATION_LAYERS});
    timing.rollbackBaselineStability = await waitForStableCityIconStats(renderer);
    const rollbackBaseline = captureRendererState(renderer, {captureNodes: true});
    const rollbackTransaction = await prepareRendererWorkerInstall(renderer, map, rollbackPrepared, {
      binding,
      budgetMs: 4,
      uploadSliceBytes: 128 * 1024,
      onProgress
    });
    rollbackTransaction.commit();
    const rollbackInstalledSurfaceBase = captureSurfaceBaseState(renderer);
    const rollbackStartedAt = performance.now();
    const rolledBack = rollbackTransaction.rollback();
    timing.rollbackMs = performance.now() - rollbackStartedAt;
    if (!rolledBack) throw new Error("已提交安装无法 rollback");
    assertExactRollback(renderer, rollbackBaseline);
    assertSurfaceBaseBuffersDeleted(renderer.gl, rollbackInstalledSurfaceBase, "全层 rollback prepared surface base");
    assertPresentation(renderer, presentation, "全层 rollback");

    const cancelBaseline = captureRendererState(renderer, {captureNodes: true});
    const cancelled = new AbortController();
    cancelled.abort();
    const cancelCode = await captureRejectionCode(() => prepareRendererWorkerInstall(renderer, map, rollbackPrepared, {
      binding,
      signal: cancelled.signal,
      budgetMs: 1,
      uploadSliceBytes: 16 * 1024
    }));
    if (!/aborted/u.test(cancelCode)) throw new Error(`取消门未拒绝：${cancelCode}`);
    assertExactRollback(renderer, cancelBaseline);

    let current = true;
    let obsoleteYields = 0;
    const obsoleteCode = await captureRejectionCode(() => prepareRendererWorkerInstall(renderer, map, rollbackPrepared, {
      binding,
      budgetMs: 1,
      uploadSliceBytes: 16 * 1024,
      isCurrent: () => current,
      yieldToMain: async () => {
        obsoleteYields++;
        current = false;
        await new Promise(resolveYield => setTimeout(resolveYield, 0));
      }
    }));
    if (!/obsolete|stale/u.test(obsoleteCode) || obsoleteYields < 1) throw new Error(`过期门未在分片后拒绝：${obsoleteCode}/${obsoleteYields}`);
    assertExactRollback(renderer, cancelBaseline);

    const riverLayers = renderPreparationLayersForRegeneration("rivers");
    const riverPrepared = await executeRenderPreparationTask({...request(), layers: riverLayers});
    const routeInvariant = captureRouteInvariant(renderer, map);
    const riverTransaction = await prepareRendererWorkerInstall(renderer, map, riverPrepared, {
      binding,
      preserveRoutePicking: true,
      budgetMs: 4,
      uploadSliceBytes: 128 * 1024,
      onProgress
    });
    riverTransaction.commit();
    renderer.draw({updateDynamicBuffers: false});
    assertRouteInvariant(renderer, map, routeInvariant, "river commit");
    riverTransaction.rollback();
    assertRouteInvariant(renderer, map, routeInvariant, "river rollback");
    assertPresentation(renderer, presentation, "river rollback");

    await new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));
    const healthErrors = (window.__webglGeneratorHealth?.getEvents?.(240) || []).filter(event => event.severity === "error");
    return {
      actualCells: map.grid?.cells?.h?.length || 0,
      ownerGuard,
      equivalence,
      committed: {
        labelCount: committed.labelCount,
        overlayChildren: committed.overlayChildren,
        shorePathKeys: renderer.shoreLinePathVertices.size,
        shoreWeakBindings: countShoreWeakBindings(renderer),
        surfaceBaseSegmentCount: committed.surfaceBase.segments.length,
        glError: renderer.gl.getError()
      },
      pickingResult,
      timing: roundDeep(timing),
      longTasks: window.__task322InstallerLongTasks.slice(),
      cancelCode,
      obsoleteCode,
      obsoleteYields,
      routeInvariant: summarizeRouteInvariant(routeInvariant),
      healthErrors: healthErrors.filter(event => !["main-thread-long-task", "operation-stall", "render-frame-gap", "input-handler-stall"].includes(event.type))
    };

    function captureRendererState(target, {captureNodes = false} = {}) {
      const bufferNames = ["landCorrectionBuffer", "waterCorrectionBuffer", "landCoverBuffer", "waterCoverBuffer", "surfacePatchBuffer", "lineBuffer", "shoreLineBuffer", "oceanCurrentBuffer", "pointBuffer", "routeBuffer", "riverBuffer", "politicalMeshDebugBuffer"];
      return {
        buffers: Object.fromEntries(bufferNames.map(name => [name, {ref: target[name], fingerprint: gpuBufferFingerprint(target.gl, target[name])}])),
        surfaceBase: captureSurfaceBaseState(target),
        surfaceOwner: captureSurfaceOwnerState(target),
        cellVisual: target.cellVisualMesh,
        shore: target.shoreVisualPaths,
        statePaths: target.stateVisualPaths,
        provincePaths: target.provinceVisualPaths,
        political: target.politicalVisualMeshes,
        picking: target.objectPickingIndex,
        shorePathVertices: target.shoreLinePathVertices,
        shorePathObjects: target.shoreLinePathObjectVertices,
        surfaceCellRanges: target.surfaceCellRanges,
        shoreSurfaceCellRanges: target.shoreSurfaceCellRanges,
        labelItems: target.labelItems,
        cityIconItems: target.cityIconItems,
        markerIconItems: target.markerIconItems,
        militaryIconItems: target.militaryIconItems,
        politicalMeshDebugVertexCount: target.politicalMeshDebugVertexCount,
        selectionMarker: target.selectionMarker,
        gridCellIdLayer: target.gridCellIdLayer,
        labelCount: target.labelCount,
        overlayChildren: target.overlay?.childElementCount || 0,
        overlayNodes: captureNodes ? [...(target.overlay?.childNodes || [])] : null,
        cityInstanceCount: target.cityIconLayer?.snapshot?.().instanceCount ?? null,
        cityLayer: target.cityIconLayer ? {
          instances: target.cityIconLayer.instances,
          index: target.cityIconLayer.instanceIndexById,
          data: target.cityIconLayer.instanceData,
          fingerprint: typedFingerprint(target.cityIconLayer.instanceData),
          buffer: target.cityIconLayer.instanceBuffer,
          bufferFingerprint: gpuBufferFingerprint(target.gl, target.cityIconLayer.instanceBuffer),
          statsRef: target.cityIconLayer.stats,
          stats: {...target.cityIconLayer.stats}
        } : null,
        stats: stableStats(target.getStats())
      };
    }

    function comparePreparedToRenderer(target, candidate, baseline) {
      const mapping = {
        landCorrectionBuffer: candidate.layers.surface.landCorrections,
        waterCorrectionBuffer: candidate.layers.surface.waterCorrections,
        landCoverBuffer: candidate.layers.surface.landCovers,
        waterCoverBuffer: candidate.layers.surface.waterCovers,
        surfacePatchBuffer: new Float32Array(),
        lineBuffer: candidate.layers.line.vertices,
        shoreLineBuffer: candidate.layers.line.shoreVertices,
        oceanCurrentBuffer: candidate.layers.line.oceanCurrentVertices,
        pointBuffer: candidate.layers.point.vertices,
        routeBuffer: candidate.layers.route.vertices,
        riverBuffer: candidate.layers.river.vertices,
        politicalMeshDebugBuffer: candidate.layers.politicalDebug.vertices
      };
      const buffers = {};
      const preparedSurfaceBase = typedFingerprint(candidate.layers.surface.base);
      if (preparedSurfaceBase.bytes !== baseline.surfaceBase.fingerprint.bytes || preparedSurfaceBase.hash !== baseline.surfaceBase.fingerprint.hash) {
        throw new Error(`surfaceBase prepared 与正式 renderer 不等价：${JSON.stringify({preparedSurfaceBase, rendererFingerprint: baseline.surfaceBase.fingerprint})}`);
      }
      buffers.surfaceBase = preparedSurfaceBase;
      for (const [name, values] of Object.entries(mapping)) {
        const preparedFingerprint = typedFingerprint(values);
        const rendererFingerprint = baseline.buffers[name].fingerprint;
        if (preparedFingerprint.bytes !== rendererFingerprint.bytes || preparedFingerprint.hash !== rendererFingerprint.hash) {
          throw new Error(`${name} prepared 与正式 renderer 不等价：${JSON.stringify({preparedFingerprint, rendererFingerprint})}`);
        }
        buffers[name] = preparedFingerprint;
      }
      const preparedLabelCount = Number(candidate.layers.labels.count) || 0;
      if (preparedLabelCount !== baseline.labelCount) throw new Error(`标签 descriptor 数量不等价：${preparedLabelCount}/${baseline.labelCount}`);
      return {buffers, preparedLabelCount, oldRendererStats: baseline.stats};
    }

    function assertCommittedEquivalence(target, candidate, after, before) {
      assertCommittedSurfaceBase(target, candidate.layers.surface.base, after.surfaceBase, before.surfaceBase);
      assertSurfaceOwnerGroup(target, after.surfaceOwner);
      if (after.surfaceOwner.ownerRef === before.surfaceOwner.ownerRef) throw new Error("surface owner commit 未切换 owner token");
      for (const [name, item] of Object.entries(after.buffers)) {
        const layerValues = ({
          landCorrectionBuffer: candidate.layers.surface.landCorrections,
          waterCorrectionBuffer: candidate.layers.surface.waterCorrections,
          landCoverBuffer: candidate.layers.surface.landCovers,
          waterCoverBuffer: candidate.layers.surface.waterCovers,
          surfacePatchBuffer: new Float32Array(),
          lineBuffer: candidate.layers.line.vertices,
          shoreLineBuffer: candidate.layers.line.shoreVertices,
          oceanCurrentBuffer: candidate.layers.line.oceanCurrentVertices,
          pointBuffer: candidate.layers.point.vertices,
          routeBuffer: candidate.layers.route.vertices,
          riverBuffer: candidate.layers.river.vertices,
          politicalMeshDebugBuffer: candidate.layers.politicalDebug.vertices
        })[name];
        const expected = typedFingerprint(layerValues);
        if (item.ref === before.buffers[name].ref) throw new Error(`${name} commit 未切换临时 buffer`);
        if (item.fingerprint.bytes !== expected.bytes || item.fingerprint.hash !== expected.hash) throw new Error(`${name} commit GPU 指纹错误`);
      }
      if (after.cellVisual === before.cellVisual || after.shore === before.shore || after.picking === before.picking) throw new Error("packed cache / picking 未切换为回绑对象");
      if (!(target.shoreLinePathVertices instanceof Map) || !(target.shoreLinePathObjectVertices instanceof WeakMap)) throw new Error("岸线 Map / WeakMap 未安装");
      if (countShoreWeakBindings(target) === 0) throw new Error("岸线 WeakMap 没有正式 path object 绑定");
      if (after.overlayChildren < 1 || after.labelCount < 1 || after.cityInstanceCount < 1) throw new Error("标签或城市 overlay bundle 未安装");
      if (after.politicalMeshDebugVertexCount !== candidate.layers.politicalDebug.vertices.length / 6) throw new Error("政治调试网格 vertex count 未原子安装");
    }

    function assertExactRollback(target, baseline) {
      const after = captureRendererState(target, {captureNodes: true});
      assertExactSurfaceBaseRollback(target.gl, after.surfaceBase, baseline.surfaceBase);
      if (after.surfaceOwner.ownerRef !== baseline.surfaceOwner.ownerRef || after.surfaceOwner.bindingRef !== baseline.surfaceOwner.bindingRef) throw new Error("surface owner rollback 未恢复 owner / binding identity");
      assertSurfaceOwnerGroup(target, after.surfaceOwner);
      for (const [name, item] of Object.entries(baseline.buffers)) {
        if (after.buffers[name].ref !== item.ref) throw new Error(`${name} rollback 未恢复 buffer identity`);
        if (after.buffers[name].fingerprint.hash !== item.fingerprint.hash || after.buffers[name].fingerprint.bytes !== item.fingerprint.bytes) throw new Error(`${name} rollback 改写旧 GPU bytes`);
      }
      for (const key of ["cellVisual", "shore", "statePaths", "provincePaths", "political", "picking", "shorePathVertices", "shorePathObjects", "surfaceCellRanges", "shoreSurfaceCellRanges", "labelItems", "cityIconItems", "markerIconItems", "militaryIconItems", "selectionMarker", "gridCellIdLayer"]) {
        if (after[key] !== baseline[key]) throw new Error(`${key} rollback 未恢复 identity`);
      }
      if (baseline.overlayNodes && (after.overlayNodes.length !== baseline.overlayNodes.length || after.overlayNodes.some((node, index) => node !== baseline.overlayNodes[index]))) throw new Error("overlay rollback 未恢复 DOM node identity/order");
      if (after.cityInstanceCount !== baseline.cityInstanceCount) throw new Error("city icon WebGL rollback 数量不一致");
      if (baseline.cityLayer) {
        if (after.cityLayer.instances !== baseline.cityLayer.instances || after.cityLayer.index !== baseline.cityLayer.index || after.cityLayer.data !== baseline.cityLayer.data) {
          throw new Error(`city icon WebGL rollback 未恢复 CPU refs：${JSON.stringify({instances: after.cityLayer.instances === baseline.cityLayer.instances, byId: after.cityLayer.index === baseline.cityLayer.index, data: after.cityLayer.data === baseline.cityLayer.data})}`);
        }
        if (after.cityLayer.fingerprint.hash !== baseline.cityLayer.fingerprint.hash || after.cityLayer.fingerprint.bytes !== baseline.cityLayer.fingerprint.bytes) {
          throw new Error(`city icon WebGL rollback 未恢复 CPU bytes：${JSON.stringify({before: baseline.cityLayer.fingerprint, after: after.cityLayer.fingerprint})}`);
        }
        if (after.cityLayer.buffer !== baseline.cityLayer.buffer || after.cityLayer.bufferFingerprint.hash !== baseline.cityLayer.bufferFingerprint.hash || after.cityLayer.bufferFingerprint.bytes !== baseline.cityLayer.bufferFingerprint.bytes) {
          throw new Error(`city icon WebGL rollback 未恢复 GPU buffer：${JSON.stringify({sameRef: after.cityLayer.buffer === baseline.cityLayer.buffer, before: baseline.cityLayer.bufferFingerprint, after: after.cityLayer.bufferFingerprint})}`);
        }
        const statsKeys = new Set([...Object.keys(baseline.cityLayer.stats), ...Object.keys(after.cityLayer.stats)]);
        const statsDiff = [...statsKeys].filter(key => after.cityLayer.stats[key] !== baseline.cityLayer.stats[key]).map(key => ({key, before: baseline.cityLayer.stats[key], after: after.cityLayer.stats[key]}));
        if (after.cityLayer.statsRef !== baseline.cityLayer.statsRef || statsDiff.length) {
          throw new Error(`city icon WebGL rollback 未恢复 stats：${JSON.stringify({sameRef: after.cityLayer.statsRef === baseline.cityLayer.statsRef, diff: statsDiff})}`);
        }
      }
      if (after.politicalMeshDebugVertexCount !== baseline.politicalMeshDebugVertexCount) throw new Error("政治调试网格 rollback 未恢复 vertex count");
    }

    async function waitForStableCityIconStats(target, requiredFrames = 12, maxFrames = 600) {
      let previous = JSON.stringify(target.cityIconLayer?.stats || {});
      let stableFrames = 0;
      for (let frame = 1; frame <= maxFrames; frame++) {
        await new Promise(resolveFrame => requestAnimationFrame(resolveFrame));
        const current = JSON.stringify(target.cityIconLayer?.stats || {});
        if (!target.cityIconAnimationFrame && current === previous) stableFrames++;
        else stableFrames = 0;
        if (stableFrames >= requiredFrames) return {frames: frame, stableFrames, stats: JSON.parse(current)};
        previous = current;
      }
      throw new Error(`city icon stats 未在 ${maxFrames} 帧内稳定`);
    }

    function presentationFingerprint(target) {
      return {
        camera: JSON.stringify(target.camera),
        selection: target.selection,
        highlights: target.objectHighlights,
        theme: target.visualTheme,
        visibility: target.layerVisibility,
        colorMode: target.colorMode,
        viewOptions: target.viewOptions,
        labelOptions: target.labelOptions,
        unitPreferences: JSON.stringify(target.unitPreferences),
        politicalMeshDebugMode: target.politicalMeshDebugMode
      };
    }

    function assertPresentation(target, expected, label) {
      if (JSON.stringify(target.camera) !== expected.camera || target.selection !== expected.selection || target.objectHighlights !== expected.highlights || target.visualTheme !== expected.theme || target.layerVisibility !== expected.visibility || target.colorMode !== expected.colorMode || target.viewOptions !== expected.viewOptions || target.labelOptions !== expected.labelOptions || JSON.stringify(target.unitPreferences) !== expected.unitPreferences || target.politicalMeshDebugMode !== expected.politicalMeshDebugMode) {
        throw new Error(`${label} 未保持 camera / selection / theme / layers`);
      }
    }

    function captureRouteInvariant(target, formalMap) {
      const routeBuckets = [];
      for (const [key, bucket] of target.objectPickingIndex?.buckets || []) {
        routeBuckets.push({key, bucket, routeSegments: bucket.routeSegments, items: [...bucket.routeSegments]});
      }
      return {
        settlementRoutes: formalMap.settlements?.routes,
        packRoutes: formalMap.pack?.routes,
        packCellRoutes: formalMap.pack?.cells?.routes,
        routeObjects: [...(formalMap.settlements?.routes || [])],
        buffer: target.routeBuffer,
        bufferFingerprint: gpuBufferFingerprint(target.gl, target.routeBuffer),
        routeVertexCount: target.routeVertexCount,
        routeDrawRanges: target.routeDrawRanges,
        routeBufferCamera: target.routeBufferCamera,
        picking: target.objectPickingIndex,
        routeBuckets
      };
    }

    function assertRouteInvariant(target, formalMap, expected, label) {
      if (formalMap.settlements?.routes !== expected.settlementRoutes || formalMap.pack?.routes !== expected.packRoutes || formalMap.pack?.cells?.routes !== expected.packCellRoutes) throw new Error(`${label} 改写道路三镜像 identity`);
      if ((formalMap.settlements?.routes || []).some((item, index) => item !== expected.routeObjects[index])) throw new Error(`${label} 改写 route object identity`);
      if (target.routeBuffer !== expected.buffer || target.routeVertexCount !== expected.routeVertexCount || target.routeDrawRanges !== expected.routeDrawRanges || target.routeBufferCamera !== expected.routeBufferCamera) throw new Error(`${label} 改写 route renderer identity`);
      const fingerprint = gpuBufferFingerprint(target.gl, target.routeBuffer);
      if (fingerprint.bytes !== expected.bufferFingerprint.bytes || fingerprint.hash !== expected.bufferFingerprint.hash) throw new Error(`${label} 改写 route GPU bytes`);
      if (target.objectPickingIndex !== expected.picking) throw new Error(`${label} 改写 route picking index identity`);
      for (const item of expected.routeBuckets) {
        const bucket = target.objectPickingIndex.buckets.get(item.key);
        if (bucket !== item.bucket || bucket.routeSegments !== item.routeSegments || bucket.routeSegments.length !== item.items.length || bucket.routeSegments.some((segment, index) => segment !== item.items[index])) throw new Error(`${label} 改写 route picking bucket/ref`);
      }
    }

    function verifyPicking(module, formalMap, index, objects) {
      const cityHit = module.pickCity(formalMap, index, objects.city.x, objects.city.y, 1e-3, {maxPickDistance: Infinity, distanceToCity: () => 0});
      const routePoints = objects.route.points;
      const routeMidpoint = midpoint(routePoints[0], routePoints[1]);
      const routeHit = module.pickRoute(formalMap, index, routeMidpoint[0], routeMidpoint[1], 1e-2);
      const riverPoints = objects.river.displayPoints || objects.river.points;
      const riverMidpoint = midpoint(riverPoints[0], riverPoints[1]);
      const riverHit = module.pickRiver(formalMap, index, riverMidpoint[0], riverMidpoint[1], 1e-2);
      if (Number(cityHit?.id) !== Number(objects.city.id)) throw new Error(`city picking 未命中 #${objects.city.id}`);
      if (Number(routeHit?.id) !== Number(objects.route.id)) throw new Error(`route picking 未命中 #${objects.route.id}`);
      if (Number(riverHit?.id ?? riverHit?.i) !== Number(objects.river.id ?? objects.river.i)) throw new Error(`river picking 未命中 #${objects.river.id ?? objects.river.i}`);
      return {city: cityHit.id, route: routeHit.id, river: riverHit.id ?? riverHit.i};
    }

    function captureSurfaceBaseState(target) {
      const bufferSet = target.surfaceBaseBufferSet;
      if (!bufferSet || !Array.isArray(bufferSet.segments) || !bufferSet.segments.length) throw new Error("renderer surface base buffer set 缺失");
      const segments = bufferSet.segments.map(segment => ({
        segmentRef: segment,
        bufferRef: segment.geometryBuffer,
        colorBufferRef: segment.colorBuffer,
        floatStart: segment.floatStart,
        floatEnd: segment.floatEnd,
        floatLength: segment.floatLength,
        byteLength: segment.byteLength,
        vertexCount: segment.vertexCount,
        triangleCount: segment.triangleCount,
        fingerprint: surfaceSegmentSourceFingerprint(target.gl, segment),
        geometryFingerprint: gpuBufferFingerprint(target.gl, segment.geometryBuffer),
        colorFingerprint: gpuBufferFingerprint(target.gl, segment.colorBuffer)
      }));
      return {
        setRef: bufferSet,
        segmentsRef: bufferSet.segments,
        alias: target.vertexBuffer,
        floatLength: bufferSet.floatLength,
        byteLength: bufferSet.byteLength,
        vertexCount: bufferSet.vertexCount,
        triangleCount: bufferSet.triangleCount,
        segments,
        ownerRef: bufferSet.owner,
        fingerprint: surfaceBufferSetSourceFingerprint(target.gl, bufferSet)
      };
    }

    function captureSurfaceOwnerState(target) {
      return {
        ownerRef: target.surfaceResourceOwner,
        bindingRef: target.surfaceResourceBinding,
        verticesOwner: target.surfaceVerticesOwner,
        rangesOwner: target.surfaceCellRangesOwner,
        correctionOwner: target.cellVisualCorrectionGeometryOwner,
        attributesOwner: target.cellAttributeStoreOwner
      };
    }

    function assertSurfaceOwnerGroup(target, state) {
      const owner = state.ownerRef;
      const resourceBinding = state.bindingRef;
      if (!owner || target.surfaceBaseBufferSet.owner !== owner || target.cellVisualCorrectionBufferSet.owner !== owner
        || state.verticesOwner !== owner || state.rangesOwner !== owner || state.correctionOwner !== owner || state.attributesOwner !== owner
        || resourceBinding?.owner !== owner || resourceBinding.surfaceVertices !== target.surfaceVertices
        || resourceBinding.surfaceCellRanges !== target.surfaceCellRanges
        || resourceBinding.cellVisualCorrectionGeometry !== target.cellVisualCorrectionGeometry
        || resourceBinding.cellAttributeStore !== target.cellAttributeStore) {
        throw new Error("surface owner 资源组未成组绑定");
      }
    }

    function verifySurfaceOwnerGuard(target) {
      const beforeVertices = target.surfaceVertices;
      const beforeFrame = canvasFingerprint(target);
      target.surfaceVertices = new Float32Array(beforeVertices);
      let code = "";
      try {
        target.draw({updateDynamicBuffers: false});
      } catch (error) {
        code = String(error?.code || error?.message || error);
      } finally {
        target.surfaceVertices = beforeVertices;
      }
      const afterFrame = canvasFingerprint(target);
      if (code !== "surface-resource-owner-mismatch") throw new Error(`同长度跨 owner geometry 未 fail-closed：${code}`);
      if (beforeFrame.bytes !== afterFrame.bytes || beforeFrame.hash !== afterFrame.hash) throw new Error("owner mismatch 在拒绝前改写了上一帧");
      target.draw({updateDynamicBuffers: false});
      return {sameLengthRejected: true, previousFramePreserved: true};
    }

    function canvasFingerprint(target) {
      const gl = target.gl;
      const bytes = new Uint8Array(target.canvas.width * target.canvas.height * 4);
      gl.readPixels(0, 0, target.canvas.width, target.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
      return {bytes: bytes.byteLength, hash: hashBytes(bytes)};
    }

    function assertCommittedSurfaceBase(target, values, after, before) {
      const expected = typedFingerprint(values);
      if (after.setRef === before.setRef || after.segmentsRef === before.segmentsRef) throw new Error("surface base commit 未切换 set / segments identity");
      if (after.alias !== after.segments[0]?.bufferRef || target.vertexBuffer !== after.alias) throw new Error("surface base commit legacy alias 未指向首段");
      if (after.fingerprint.bytes !== expected.bytes || after.fingerprint.hash !== expected.hash) throw new Error("surface base commit 聚合 GPU 指纹错误");
      const maxFloats = Math.floor((8 * 1024 * 1024) / Float32Array.BYTES_PER_ELEMENT / 18) * 18;
      const expectedSegments = Math.max(1, Math.ceil(values.length / maxFloats));
      if (after.segments.length !== expectedSegments) throw new Error(`surface base segment 数量错误：${after.segments.length}/${expectedSegments}`);
      let cursor = 0;
      for (const segment of after.segments) {
        if (segment.floatStart !== cursor || segment.floatEnd < segment.floatStart || segment.floatEnd > values.length
          || segment.floatStart % 18 !== 0 || segment.floatEnd % 18 !== 0
          || segment.floatLength !== segment.floatEnd - segment.floatStart
          || segment.byteLength !== segment.floatLength / 2 * Float32Array.BYTES_PER_ELEMENT
          || segment.byteLength > 8 * 1024 * 1024
          || segment.fingerprint.bytes !== segment.floatLength * Float32Array.BYTES_PER_ELEMENT
          || segment.geometryFingerprint.bytes !== segment.byteLength
          || segment.colorFingerprint.bytes !== segment.byteLength
          || segment.vertexCount !== segment.floatLength / 6
          || segment.triangleCount !== segment.floatLength / 18) {
          throw new Error(`surface base segment descriptor 无效：${JSON.stringify(segment)}`);
        }
        if (before.segments.some(item => item.bufferRef === segment.bufferRef || item.colorBufferRef === segment.colorBufferRef)) throw new Error("surface base commit 复用了旧 segment buffer");
        cursor = segment.floatEnd;
      }
      if (cursor !== values.length) throw new Error(`surface base segments 未覆盖完整顶点：${cursor}/${values.length}`);
      assertSurfaceBaseBuffersLive(target.gl, before, "surface base commit rollback snapshot");
      assertSurfaceBaseBuffersLive(target.gl, after, "surface base commit current");
    }

    function assertExactSurfaceBaseRollback(gl, after, before) {
      if (after.setRef !== before.setRef || after.segmentsRef !== before.segmentsRef || after.alias !== before.alias) {
        throw new Error("surface base rollback 未恢复 set / segments / alias identity");
      }
      if (after.segments.length !== before.segments.length || after.fingerprint.bytes !== before.fingerprint.bytes || after.fingerprint.hash !== before.fingerprint.hash) {
        throw new Error("surface base rollback 未恢复聚合 GPU bytes");
      }
      for (let index = 0; index < before.segments.length; index++) {
        const actual = after.segments[index];
        const expected = before.segments[index];
        if (actual.segmentRef !== expected.segmentRef || actual.bufferRef !== expected.bufferRef || actual.colorBufferRef !== expected.colorBufferRef
          || actual.floatStart !== expected.floatStart || actual.floatEnd !== expected.floatEnd
          || actual.floatLength !== expected.floatLength || actual.byteLength !== expected.byteLength
          || actual.vertexCount !== expected.vertexCount || actual.triangleCount !== expected.triangleCount
          || actual.fingerprint.bytes !== expected.fingerprint.bytes || actual.fingerprint.hash !== expected.fingerprint.hash
          || actual.geometryFingerprint.hash !== expected.geometryFingerprint.hash || actual.colorFingerprint.hash !== expected.colorFingerprint.hash) {
          throw new Error(`surface base rollback segment #${index} 不精确`);
        }
      }
      assertSurfaceBaseBuffersLive(gl, after, "surface base rollback restored");
    }

    function assertSurfaceBaseBuffersLive(gl, state, label) {
      for (const segment of state.segments) if (!gl.isBuffer(segment.bufferRef) || !gl.isBuffer(segment.colorBufferRef)) throw new Error(`${label} segment GPU buffer 已失效`);
    }

    function assertSurfaceBaseBuffersDeleted(gl, state, label) {
      for (const segment of state.segments) if (gl.isBuffer(segment.bufferRef) || gl.isBuffer(segment.colorBufferRef)) throw new Error(`${label} segment GPU buffer 未释放`);
    }

    function surfaceBufferSetSourceFingerprint(gl, bufferSet) {
      const chunks = bufferSet.segments.map(segment => surfaceSegmentSourceBytes(gl, segment));
      let bytes = 0;
      let hash = 2166136261;
      for (const chunk of chunks) {
        bytes += chunk.byteLength;
        hash = hashBytes(chunk, hash);
      }
      return {bytes, hash};
    }

    function surfaceSegmentSourceFingerprint(gl, segment) {
      const values = surfaceSegmentSourceBytes(gl, segment);
      return {bytes: values.byteLength, hash: hashBytes(values)};
    }

    function surfaceSegmentSourceBytes(gl, segment) {
      const geometryBytes = readGpuBufferBytes(gl, segment.geometryBuffer);
      const colorBytes = readGpuBufferBytes(gl, segment.colorBuffer);
      const geometry = new Float32Array(geometryBytes.buffer, geometryBytes.byteOffset, geometryBytes.byteLength / 4);
      const identities = new Uint32Array(geometryBytes.buffer, geometryBytes.byteOffset, geometryBytes.byteLength / 4);
      const colors = new Float32Array(colorBytes.buffer, colorBytes.byteOffset, colorBytes.byteLength / 4);
      const source = new Float32Array(segment.vertexCount * 6);
      for (let vertex = 0; vertex < segment.vertexCount; vertex++) {
        const geometryOffset = vertex * 3;
        const sourceOffset = vertex * 6;
        source[sourceOffset] = geometry[geometryOffset];
        source[sourceOffset + 1] = geometry[geometryOffset + 1];
        source[sourceOffset + 2] = colors[geometryOffset];
        source[sourceOffset + 3] = colors[geometryOffset + 1];
        source[sourceOffset + 4] = colors[geometryOffset + 2];
        source[sourceOffset + 5] = identities[geometryOffset + 2] & 1 ? 0.75 : 0.25;
      }
      return new Uint8Array(source.buffer);
    }

    function gpuBufferFingerprint(gl, buffer) {
      if (!buffer) return {bytes: 0, hash: hashBytes(new Uint8Array())};
      const values = readGpuBufferBytes(gl, buffer);
      return {bytes: values.byteLength, hash: hashBytes(values)};
    }

    function gpuBufferSequenceFingerprint(gl, buffers) {
      let bytes = 0;
      let hash = 2166136261;
      for (const buffer of buffers) {
        const values = readGpuBufferBytes(gl, buffer);
        bytes += values.byteLength;
        hash = hashBytes(values, hash);
      }
      return {bytes, hash};
    }

    function readGpuBufferBytes(gl, buffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      const bytes = Number(gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE)) || 0;
      const values = new Uint8Array(bytes);
      if (bytes) gl.getBufferSubData(gl.ARRAY_BUFFER, 0, values);
      return values;
    }

    function typedFingerprint(view) {
      const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
      return {bytes: bytes.byteLength, hash: hashBytes(bytes)};
    }

    function hashBytes(bytes, initial = 2166136261) {
      let hash = initial;
      for (const byte of bytes) {
        hash ^= byte;
        hash = Math.imul(hash, 16777619);
      }
      return hash >>> 0;
    }

    function countShoreWeakBindings(target) {
      let count = 0;
      for (const path of [...(target.shoreVisualPaths?.coastline || []), ...(target.shoreVisualPaths?.lakeShore || [])]) {
        if (target.shoreLinePathObjectVertices.get(path) instanceof Float32Array) count++;
      }
      return count;
    }

    function stableStats(stats) {
      return {
        vertexCount: stats.vertexCount,
        surfaceBaseBuffers: stats.surfaceBaseBuffers,
        lineVertexCount: stats.lineVertexCount,
        routeVertexCount: stats.routeVertexCount,
        riverVertexCount: stats.riverVertexCount,
        pointVertexCount: stats.pointVertexCount,
        labelCount: stats.labelCount,
        cellVisualMesh: stats.cellVisualMesh,
        shoreVisual: stats.shoreVisual,
        stateVisual: stats.stateVisual,
        provinceVisual: stats.provinceVisual,
        politicalVisualMeshes: stats.politicalVisualMeshes
      };
    }

    function summarizeRouteInvariant(value) {
      return {
        routes: value.routeObjects.length,
        routeBufferBytes: value.bufferFingerprint.bytes,
        routePickingBuckets: value.routeBuckets.filter(item => item.items.length).length,
        routeVertexCount: value.routeVertexCount
      };
    }

    async function captureRejectionCode(action) {
      try {
        await action();
        return "resolved";
      } catch (error) {
        return String(error?.code || error?.name || error?.message || "error");
      }
    }

    function midpoint(left, right) {
      return [(Number(left?.[0]) + Number(right?.[0])) / 2, (Number(left?.[1]) + Number(right?.[1])) / 2];
    }

    function roundDeep(value) {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, typeof item === "number" ? Math.round(item * 1000) / 1000 : item]));
    }
  });

  const metricsAfter = indexMetrics(await cdp.send("Performance.getMetrics"));
  process.stderr.write(`[installer-result] ${JSON.stringify({timing: result.timing, longTasks: result.longTasks, committed: result.committed, cancelCode: result.cancelCode, obsoleteCode: result.obsoleteCode})}\n`);
  assert.equal(result.actualCells, 10004, "正式 10k 固定图 cells 数量漂移");
  assert.equal(result.committed.glError, 0, "prepared install 后存在 WebGL error");
  assert.ok(result.committed.shorePathKeys > 0 && result.committed.shoreWeakBindings > 0, "岸线 Map / WeakMap 未回绑");
  assert.deepEqual(result.healthErrors, [], "prepared install 出现非性能 health error");
  assert.deepEqual(pageErrors, [], "prepared install 出现 page error");
  assert.deepEqual(consoleErrors.filter(message => !/^\[FMG health\] (?:main-thread-long-task|operation-stall|render-frame-gap|input-handler-stall)\b/.test(message)), [], "prepared install 出现应用 console error");
  assert.ok(result.timing.commitMs < 50, `commit 同步阶段超预算：${result.timing.commitMs}ms`);
  assert.ok(result.timing.drawMs < 50, `draw 同步阶段超预算：${result.timing.drawMs}ms`);
  assert.ok(result.timing.maxActiveSliceMs < 50, `installer 单个活跃分片超预算：${result.timing.maxActiveSliceMs}ms`);
  assert.equal(result.timing.progressStages.some(item => item.stage === "shore-surface-ranges"), false, "installer 不得在主线程重建岸线 surface ranges");
  assert.ok(result.longTasks.every(item => item.duration < 50), `installer 窗口出现 LongTask：${JSON.stringify(result.longTasks)}`);

  console.log(JSON.stringify({
    ok: true,
    ...result,
    cdp: {
      taskDurationDeltaMs: roundMs((metricsAfter.TaskDuration - metricsBefore.TaskDuration) * 1000),
      scriptDurationDeltaMs: roundMs((metricsAfter.ScriptDuration - metricsBefore.ScriptDuration) * 1000)
    },
    consoleErrors,
    pageErrors
  }, null, 2));
} finally {
  if (context) await Promise.race([context.close(), delay(5000)]);
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await new Promise(done => server.close(done));
}

function indexMetrics(response) {
  return Object.fromEntries((response.metrics || []).map(item => [item.name, item.value]));
}

function roundMs(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

async function startStaticServer() {
  const serverInstance = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, `http://${host}:${port}`).pathname);
    if (pathname === "/__vendor__/earcut.js") {
      response.writeHead(200, {"Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store"});
      createReadStream(earcutModule).pipe(response);
      return;
    }
    if (pathname === "/__vendor__/polygon-clipping.js") {
      response.writeHead(200, {"Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store"});
      response.end('import "/__vendor__/polygon-clipping-umd.js";\nexport default globalThis.polygonClipping;\n');
      return;
    }
    if (pathname === "/__vendor__/polygon-clipping-umd.js") {
      response.writeHead(200, {"Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store"});
      createReadStream(polygonClippingUmd).pipe(response);
      return;
    }
    const sourceRequest = pathname.startsWith("/__src__/");
    const repositoryRequest = pathname.startsWith("/prototype/");
    const baseDir = sourceRequest ? applicationSourceDir : repositoryRequest ? rootDir : distDir;
    const relative = sourceRequest ? pathname.slice("/__src__/".length) : pathname;
    let target = resolve(baseDir, "." + normalize("/" + relative));
    if (!sourceRequest && !repositoryRequest && (pathname === "/" || !existsSync(target) || statSync(target).isDirectory())) {
      if (pathname !== "/") process.stderr.write(`[spa-fallback] ${pathname}\n`);
      target = join(distDir, "index.html");
    }
    if (!target.startsWith(baseDir) || !existsSync(target) || statSync(target).isDirectory()) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, {"Content-Type": mimeType(target), "Cache-Control": "no-store"});
    if (sourceRequest && extname(target).toLowerCase() === ".js") {
      response.end(readFileSync(target, "utf8")
        .replaceAll('from "earcut"', 'from "/__vendor__/earcut.js"')
        .replaceAll('from "polygon-clipping"', 'from "/__vendor__/polygon-clipping.js"'));
      return;
    }
    createReadStream(target).pipe(response);
  });
  await new Promise((resolveListen, rejectListen) => {
    serverInstance.once("error", rejectListen);
    serverInstance.listen(port, host, resolveListen);
  });
  return serverInstance;
}

function mimeType(filePath) {
  return ({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml"
  })[extname(filePath).toLowerCase()] || "application/octet-stream";
}

function delay(milliseconds) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds));
}
