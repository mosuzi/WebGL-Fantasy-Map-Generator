#!/usr/bin/env node
import assert from "node:assert/strict";
import {createReadStream, existsSync, statSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {dirname, extname, join, normalize, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {closeTask350BrowserResource, createTask350BrowserArtifact} from "./task-350-browser-artifact.mjs";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const appSourceDir = join(rootDir, "app", "webgl-generator", "src");
const distDir = join(rootDir, "dist", "webgl-generator");
const host = "127.0.0.1";
const port = 5498;
const timeoutMs = 240000;
const uiOnly = process.argv.includes("--ui-only");
const profileUi = process.argv.includes("--profile-ui");
const evidence = createTask350BrowserArtifact("map-transaction", {mode: uiOnly ? "browser-ui-only" : "browser-full"});
let server;
let browser;
let context;
let thrownError = null;

try {
  assert.ok(existsSync(distDir), `构建产物不存在：${distDir}`);
  evidence.mark("server-start", {active: "map-transaction"});
  const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
  server = await startStaticServer();
  evidence.mark("browser-start", {active: "map-transaction", complete: "server-start"});
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  context = await browser.newContext({viewport: {width: 1280, height: 820}, deviceScaleFactor: 1});
  await context.addInitScript(() => localStorage.clear());
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto(`http://${host}:${port}?healthClear=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, timeoutMs);
  evidence.mark("browser-evaluation", {active: "map-transaction", complete: "browser-start"});
  const report = await page.evaluate(async ({uiOnly}) => {
    const api = window.webglGeneratorApi;
    const app = window.__webglGeneratorApp;
    unwrap(await api.generate.newMap({
      confirm: true,
      seed: "map-transaction-browser",
      cellsTarget: 1000,
      heightmapTemplate: "continents"
    }), "generate.newMap");
    const {computeCanonicalMapReplicaChecksum} = await import("/__task350-source/runtime/map-replica-checksum.js");
    window.__task350Fingerprint = () => computeCanonicalMapReplicaChecksum(app.map, {
      revision: app.mapRevision.getSnapshot().mapRevision,
      budgetMs: 4
    });
    window.__webglGeneratorHealth?.clear?.();
    window.__task350LongTasks = [];
    window.__task350PhaseMarks = [];
    window.__task350SubphaseMarks = [];
    window.__task350SubphaseSequence = 0;
    window.__task350BeginSubphase = label => {
      const mark = {id: ++window.__task350SubphaseSequence, label, startTime: performance.now(), endTime: null};
      window.__task350SubphaseMarks.push(mark);
      return mark.id;
    };
    window.__task350EndSubphase = id => {
      const mark = window.__task350SubphaseMarks.find(item => item.id === id);
      if (mark) mark.endTime = performance.now();
    };
    window.__task350LongTaskObserver = new PerformanceObserver(list => {
      window.__task350LongTasks.push(...list.getEntries().map(entry => ({
        startTime: entry.startTime,
        duration: entry.duration,
        name: entry.name
      })));
    });
    window.__task350LongTaskObserver.observe({type: "longtask", buffered: false});
    const targetStartedAt = performance.now();

    if (uiOnly) {
      const stats = app.renderer?.getStats?.() || {};
      return {
        targetStartedAt,
        regeneration: [],
        height: [],
        geo: null,
        climate: null,
        metadataUndoable: [],
        glError: stats.draw?.glError ?? document.querySelector("canvas")?.getContext?.("webgl2")?.getError?.() ?? 0
      };
    }

    const regenerationKinds = ["features", "routes", "rivers", "cities", "states", "provinces", "markers", "diplomacy", "religions", "military", "zones"];
    const regeneration = [];
    for (const kind of regenerationKinds) {
      regeneration.push(await verifyRoundTrip(
        `generate.regenerate.${kind}`,
        () => api.generate.regenerate(kind, {confirm: true}),
        result => unwrap(result, `generate.regenerate.${kind}`)
      ));
    }

    const height = [];
    height.push(await verifyRoundTrip(
      "edit.height.rebuildBaseDerived",
      () => api.edit.height.rebuildBaseDerived({confirm: true}),
      result => unwrap(result, "edit.height.rebuildBaseDerived")
    ));
    height.push(await verifyRoundTrip(
      "edit.height.rebuildDownstreamDerived",
      () => api.edit.height.rebuildDownstreamDerived({confirm: true}),
      result => unwrap(result, "edit.height.rebuildDownstreamDerived")
    ));
    height.push(await verifyRoundTrip(
      "edit.height.rebuildAllDerived",
      () => app.runtimeActions.edit.height.rebuildAllDerived({confirm: true}),
      result => {
        if (!result?.executed) throw new Error("edit.height.rebuildAllDerived 未执行");
        return result;
      }
    ));

    const geoJson = createFmgCellsGeoJson();
    const geo = await verifyRoundTrip(
      "data.importGEO.fmg-cells",
      () => api.data.importGEO(geoJson, {confirm: true}),
      result => {
        const data = unwrap(result, "data.importGEO.fmg-cells");
        if (data.mode !== "fmg-cells-terrain" || data.imported !== true) {
          throw new Error(`FMG Cells GEO 结果异常：${data.mode}/${data.imported}`);
        }
        return data;
      }
    );

    const climateBefore = await traceStep("climate.applyDownstreamRebuild:fingerprint-before", () => fingerprint(app.map));
    const climatePhase = {label: "climate.applyDownstreamRebuild", startTime: performance.now(), endTime: null};
    window.__task350PhaseMarks.push(climatePhase);
    const climateOptionsReference = app.map.options;
    const historyBeforeClimate = app.editHistory.getStats();
    const pendingClimate = traceStep("climate.applyDownstreamRebuild:execute", () => api.climate.applyDownstreamRebuild({systems: ["cities"], confirm: true, seed: 202}));
    const busy = await api.generate.regenerate("cities", {confirm: true});
    if (busy?.ok !== false || busy?.error?.code !== "operation_busy") {
      throw new Error(`并发请求没有稳定返回 operation_busy：${JSON.stringify(busy)}`);
    }
    const climateData = unwrap(await pendingClimate, "climate.applyDownstreamRebuild");
    if (!climateData.executed) throw new Error("气候下游重算未执行");
    const climateAfter = await traceStep("climate.applyDownstreamRebuild:fingerprint-after", () => fingerprint(app.map));
    const historyAfterClimate = app.editHistory.getStats();
    assertSingleHistory(historyBeforeClimate, historyAfterClimate, "climate.applyDownstreamRebuild");
    await traceStep("climate.applyDownstreamRebuild:undo", async () => unwrap(await api.history.undo(), "history.undo.climate"));
    if (await traceStep("climate.applyDownstreamRebuild:fingerprint-undo", () => fingerprint(app.map)) !== climateBefore) throw new Error("气候下游重算撤销没有恢复完整地图");
    if (app.map.options !== climateOptionsReference) throw new Error("气候下游重算撤销替换了 map.options 引用");
    await traceStep("climate.applyDownstreamRebuild:redo", async () => unwrap(await api.history.redo(), "history.redo.climate"));
    if (await traceStep("climate.applyDownstreamRebuild:fingerprint-redo", () => fingerprint(app.map)) !== climateAfter) throw new Error("气候下游重算重做没有恢复完整地图");
    if (app.map.options !== climateOptionsReference) throw new Error("气候下游重算重做替换了 map.options 引用");
    await traceStep("climate.applyDownstreamRebuild:undo-baseline", async () => unwrap(await api.history.undo(), "history.undo.climate-baseline"));
    if (await traceStep("climate.applyDownstreamRebuild:fingerprint-baseline", () => fingerprint(app.map)) !== climateBefore) throw new Error("气候下游重算最终撤销没有恢复基线地图");
    if (app.map.options !== climateOptionsReference) throw new Error("气候下游重算最终撤销替换了 map.options 引用");
    climatePhase.endTime = performance.now();

    const capabilities = unwrap(api.info.capabilities(), "info.capabilities");
    const expectedUndoable = [
      "generate.regenerate",
      "edit.height.rebuildBaseDerived",
      "edit.height.rebuildDownstreamDerived",
      "data.importGEO",
      "climate.applyDownstreamRebuild"
    ];
    for (const method of expectedUndoable) {
      if (readMethodMetadata(capabilities.methodMetadata, method)?.undoable !== true) {
        throw new Error(`${method} 能力元数据没有声明完整可撤销`);
      }
    }

    const stats = app.renderer?.getStats?.() || {};
    return {
      targetStartedAt,
      regeneration,
      height,
      geo,
      climate: {
        historyDelta: historyAfterClimate.undo - historyBeforeClimate.undo,
        busyCode: busy.error.code,
        requestedSystems: climateData.requestedSystems,
        executionOrder: climateData.executionOrder
      },
      metadataUndoable: expectedUndoable,
      glError: stats.draw?.glError ?? document.querySelector("canvas")?.getContext?.("webgl2")?.getError?.() ?? 0
    };

    async function verifyRoundTrip(label, execute, readResult) {
      const phase = {label, startTime: performance.now(), endTime: null};
      window.__task350PhaseMarks.push(phase);
      const mapReference = app.map;
      const optionsReference = app.map.options;
      const before = await traceStep(`${label}:fingerprint-before`, () => fingerprint(app.map));
      const historyBefore = app.editHistory.getStats();
      const publicResult = await traceStep(`${label}:execute`, execute);
      const result = readResult(publicResult);
      const after = await traceStep(`${label}:fingerprint-after`, () => fingerprint(app.map));
      const historyAfter = app.editHistory.getStats();
      assertSingleHistory(historyBefore, historyAfter, label);
      if (after === before) throw new Error(`${label} 没有形成可观察地图变化`);
      if (app.map !== mapReference || app.map.options !== optionsReference) throw new Error(`${label} 替换了地图或 options 引用`);
      await traceStep(`${label}:undo`, async () => unwrap(await api.history.undo(), `history.undo.${label}`));
      if (await traceStep(`${label}:fingerprint-undo`, () => fingerprint(app.map)) !== before) throw new Error(`${label} 单条撤销没有恢复完整地图`);
      if (app.map !== mapReference || app.map.options !== optionsReference) throw new Error(`${label} 撤销替换了地图或 options 引用`);
      await traceStep(`${label}:redo`, async () => unwrap(await api.history.redo(), `history.redo.${label}`));
      const redone = await traceStep(`${label}:fingerprint-redo`, () => fingerprint(app.map));
      if (redone !== after) throw new Error(`${label} 单条重做没有恢复完整地图：${describeFingerprintDifference(after, redone)}`);
      if (app.map !== mapReference || app.map.options !== optionsReference) throw new Error(`${label} 重做替换了地图或 options 引用`);
      await traceStep(`${label}:undo-baseline`, async () => unwrap(await api.history.undo(), `history.undo.${label}.baseline`));
      if (await traceStep(`${label}:fingerprint-baseline`, () => fingerprint(app.map)) !== before) throw new Error(`${label} 最终撤销没有恢复基线地图`);
      if (app.map !== mapReference || app.map.options !== optionsReference) throw new Error(`${label} 最终撤销替换了地图或 options 引用`);
      phase.endTime = performance.now();
      return {
        label,
        historyDelta: historyAfter.undo - historyBefore.undo,
        status: result.status || result.mode || "executed"
      };
    }

    function assertSingleHistory(before, after, label) {
      if (after.undo !== before.undo + 1 || after.redo !== 0) {
        throw new Error(`${label} 没有恰好形成一条历史：${before.undo}/${before.redo} -> ${after.undo}/${after.redo}`);
      }
    }

    function createFmgCellsGeoJson() {
      const map = app.map;
      const width = Number(map.metadata?.graphWidth) || Number(map.options?.graphWidth) || 1;
      const height = Number(map.metadata?.graphHeight) || Number(map.options?.graphHeight) || 1;
      const coordinates = map.mapCoordinates || {};
      const lonW = finite(coordinates.lonW, 0);
      const lonE = finite(coordinates.lonE, width);
      const latN = finite(coordinates.latN, 0);
      const latS = finite(coordinates.latS, height);
      const cells = map.grid.cells;
      const vertices = map.grid.vertices;
      const selected = Array.from(cells.i || []).slice(0, 900);
      const features = selected.map((cell, index) => {
        const ring = (cells.v[cell] || []).map(vertex => vertices.p?.[vertex]).filter(Boolean).map(project);
        if (ring.length && (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1])) ring.push([...ring[0]]);
        return {
          type: "Feature",
          id: cell,
          properties: {
            id: cell,
            height: index % 7 === 0 ? -120 : (34 + index % 5 * 7 - 18) ** 2,
            biome: Number(cells.biome?.[cell] ?? 0),
            neighbors: (cells.c?.[cell] || []).filter(Number.isInteger)
          },
          geometry: {type: "Polygon", coordinates: [ring]}
        };
      }).filter(feature => feature.geometry.coordinates[0].length >= 4);
      return {type: "FeatureCollection", name: "map-transaction-browser", features};

      function project(point) {
        return [
          round(lonW + point[0] / width * (lonE - lonW)),
          round(latN + point[1] / height * (latS - latN))
        ];
      }
    }

    function fingerprint() {
      return window.__task350Fingerprint();
    }

    async function traceStep(label, task) {
      const id = window.__task350BeginSubphase(label);
      try {
        return await task();
      } finally {
        window.__task350EndSubphase(id);
      }
    }

    function describeFingerprintDifference(expected, actual) {
      const limit = Math.min(expected.length, actual.length);
      let index = 0;
      while (index < limit && expected[index] === actual[index]) index++;
      const start = Math.max(0, index - 120);
      const end = index + 220;
      return `index=${index}, expected=${expected.slice(start, end)}, actual=${actual.slice(start, end)}`;
    }

    function readMethodMetadata(metadata, qualifiedName) {
      const [namespace, ...method] = qualifiedName.split(".");
      return metadata?.[namespace]?.[method.join(".")] || null;
    }

    function unwrap(result, label) {
      if (!result?.ok) throw new Error(`${label} 调用失败：${result?.error?.code || "unknown"} ${result?.error?.message || ""}`);
      return result.data;
    }

    function finite(value, fallback) {
      return Number.isFinite(Number(value)) ? Number(value) : fallback;
    }

    function round(value) {
      return Math.round(Number(value || 0) * 1e6) / 1e6;
    }
  }, {uiOnly});
  const cdp = profileUi ? await context.newCDPSession(page) : null;
  if (cdp) {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", {interval: 500});
    await cdp.send("Profiler.start");
    await installUiTimingProbes(page);
  }
  const uiStartedAt = await page.evaluate(() => performance.now());
  const uiTransaction = await verifyStateRegenerationUi(page);
  const uiEndedAt = await page.evaluate(() => performance.now());
  const cpuProfile = cdp ? (await cdp.send("Profiler.stop")).profile : null;
  if (cdp) await cdp.send("Profiler.disable");
  const productMethodTimings = profileUi ? await page.evaluate(() => window.__task350ProductMethodTimings || []) : [];
  const cpuTop = summarizeCpuProfile(cpuProfile);
  const performanceTrace = await page.evaluate(async ({uiStartedAt, uiEndedAt}) => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const observer = window.__task350LongTaskObserver;
    window.__task350LongTasks.push(...(observer?.takeRecords?.() || []).map(entry => ({
      startTime: entry.startTime,
      duration: entry.duration,
      name: entry.name
    })));
    observer?.disconnect?.();
    const phases = [...window.__task350PhaseMarks, {
      label: "ui.generate.regenerate.states",
      startTime: uiStartedAt,
      endTime: uiEndedAt
    }];
    const subphases = window.__task350SubphaseMarks.map(mark => ({...mark}));
    const longTasks = window.__task350LongTasks
      .filter(entry => entry.startTime >= phases[0]?.startTime)
      .map(entry => ({
        ...entry,
        phase: subphases.find(phase => entry.startTime < phase.endTime && entry.startTime + entry.duration > phase.startTime)?.label
          || phases.find(phase => entry.startTime < phase.endTime && entry.startTime + entry.duration > phase.startTime)?.label
          || "between-phases"
      }));
    const healthLongTasks = (window.__webglGeneratorHealth?.getEvents?.(240) || [])
      .filter(event => event.type === "main-thread-long-task" && event.pageTimeMs >= phases[0]?.startTime);
    return {phases, subphases, longTasks, healthLongTasks};
  }, {uiStartedAt, uiEndedAt});

  if (!uiOnly) {
    assert.equal(report.regeneration.length, 11);
    assert.equal(report.height.length, 3);
    assert.equal(report.geo.historyDelta, 1);
    assert.equal(report.climate.historyDelta, 1);
    assert.equal(report.climate.busyCode, "operation_busy");
  }
  assert.equal(uiTransaction.historyDelta, 1);
  assert.equal(uiTransaction.undoRestored, true);
  assert.equal(uiTransaction.redoRestored, true);
  assert.equal(uiTransaction.baselineRestored, true);
  assert.equal(report.glError, 0);
  const hardLongTasks = performanceTrace.longTasks.filter(entry => entry.duration > 200);
  const harnessLongTasks = hardLongTasks.filter(entry => entry.phase.includes(":fingerprint"));
  const productLongTasks = hardLongTasks.filter(entry => !entry.phase.includes(":fingerprint"));
  assert.deepEqual(productLongTasks, [], `目标时间窗出现产品 >200ms LongTask：${JSON.stringify({productLongTasks, harnessLongTasks, healthLongTasks: performanceTrace.healthLongTasks, productMethodTimings, cpuTop})}`);
  const healthPerformanceSignals = consoleErrors.filter(message => {
    if (/^\[FMG health\] (main-thread-long-task|render-frame-gap|input-handler-stall)\b/.test(message)) return true;
    if (!/^\[FMG health\] operation-stall\b/.test(message)) return false;
    const pageTimeMs = Number(message.match(/pageTimeMs:\s*([\d.]+)/)?.[1]);
    return Number.isFinite(pageTimeMs) && pageTimeMs < report.targetStartedAt;
  });
  const applicationConsoleErrors = consoleErrors.filter(message => !healthPerformanceSignals.includes(message));
  assert.deepEqual(applicationConsoleErrors, []);
  assert.deepEqual(pageErrors, []);
  const finalReport = {ok: true, mode: uiOnly ? "ui-only" : "full", ...report, uiTransaction, performanceTrace, harnessLongTasks, productLongTasks, productMethodTimings, cpuTop, healthPerformanceSignals, applicationConsoleErrors, pageErrors};
  const compactReport = {
    mode: finalReport.mode,
    regenerationCount: report.regeneration?.length ?? 0,
    regeneration: report.regeneration?.map(({label, historyDelta, status}) => ({label, historyDelta, status})) ?? [],
    heightCount: report.height?.length ?? 0,
    height: report.height?.map(({label, historyDelta, status}) => ({label, historyDelta, status})) ?? [],
    geo: report.geo ? {label: report.geo.label, historyDelta: report.geo.historyDelta, status: report.geo.status} : null,
    climate: report.climate ? {
      historyDelta: report.climate.historyDelta,
      busyCode: report.climate.busyCode,
      requestedSystems: report.climate.requestedSystems,
      executionOrder: report.climate.executionOrder
    } : null,
    metadataUndoable: report.metadataUndoable,
    uiTransaction,
    glError: report.glError,
    performance: {
      longTaskCount: performanceTrace.longTasks.length,
      healthLongTaskCount: performanceTrace.healthLongTasks.length,
      harnessLongTasks,
      productLongTasks
    },
    healthPerformanceSignals,
    applicationConsoleErrors,
    pageErrors
  };
  evidence.setResult(finalReport, compactReport);
  evidence.succeed();
  console.log(JSON.stringify(finalReport, null, 2));
} catch (error) {
  evidence.fail(error);
  thrownError = error;
} finally {
  for (const [label, close] of [
    ["map-transaction-context", context ? () => context.close() : null],
    ["map-transaction-browser", browser ? () => browser.close() : null],
    ["map-transaction-server", server ? () => new Promise((resolveClose, rejectClose) => server.close(error => error ? rejectClose(error) : resolveClose())) : null]
  ]) {
    if (!close) continue;
    try {
      await closeTask350BrowserResource(label, close);
    } catch (error) {
      evidence.failTeardown(error);
      if (!thrownError) thrownError = error;
    }
  }
  evidence.persist();
}
if (thrownError) throw thrownError;

async function installUiTimingProbes(page) {
  await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    window.__task350ProductMethodTimings = [];
    const wrap = (owner, name, label) => {
      if (!owner || typeof owner[name] !== "function") return;
      const original = owner[name];
      owner[name] = function (...args) {
        const startedAt = performance.now();
        try {
          return original.apply(this, args);
        } finally {
          window.__task350ProductMethodTimings.push({label, startTime: startedAt, duration: performance.now() - startedAt});
        }
      };
    };
    wrap(app.editHistory, "undo", "editHistory.undo");
    wrap(app.editHistory, "redo", "editHistory.redo");
    wrap(app.selectionStore, "batch", "selectionStore.batch");
    wrap(app.selectionStore, "refresh", "selectionStore.refresh");
    wrap(app.panels?.state, "update", "statePanel.update");
    for (const name of [
      "refreshPoliticalVisualCaches",
      "refreshTerrainCaches",
      "refreshLineLayers",
      "refreshPointLayers",
      "refreshObjectPickingIndex",
      "refreshCellSurface",
      "draw",
      "refreshLabels",
      "pickClientPoint"
    ]) wrap(app.renderer, name, `renderer.${name}`);
  });
}

function summarizeCpuProfile(profile) {
  if (!profile?.samples?.length || !profile?.timeDeltas?.length) return [];
  const nodes = new Map((profile.nodes || []).map(node => [node.id, node]));
  const totals = new Map();
  for (let index = 0; index < profile.samples.length; index += 1) {
    const node = nodes.get(profile.samples[index]);
    if (!node) continue;
    const frame = node.callFrame || {};
    const key = `${frame.functionName || "(anonymous)"}|${frame.url || ""}|${Number(frame.lineNumber) + 1}`;
    totals.set(key, (totals.get(key) || 0) + Number(profile.timeDeltas[index] || 0) / 1000);
  }
  return [...totals.entries()]
    .map(([key, selfMs]) => {
      const [functionName, url, line] = key.split("|");
      return {functionName, url, line: Number(line), selfMs: Number(selfMs.toFixed(3))};
    })
    .sort((left, right) => right.selfMs - left.selfMs)
    .slice(0, 30);
}

async function verifyStateRegenerationUi(page) {
  const before = await evaluateUiFingerprint(page, "ui.generate.regenerate.states:fingerprint-before");
  await page.keyboard.press("Shift+S");
  const panel = page.locator('.floating-panel[data-panel-id="state-panel"]:not(.hidden)');
  await panel.waitFor({state: "visible"});
  const regenerate = panel.getByRole("button", {name: "重新生成国家"});
  const undo = panel.getByRole("button", {name: "撤销"});
  const redo = panel.getByRole("button", {name: "重做"});
  const regenerateCount = await regenerate.count();
  const initialUndoDisabled = await undo.isDisabled();
  assert.equal(regenerateCount, 1, "国家面板缺少唯一重生成入口");
  assert.equal(initialUndoDisabled, true, "UI 事务夹具开始前不应有撤销历史");
  await traceUiStep(page, "ui.generate.regenerate.states:execute", async () => {
    await regenerate.click();
    await page.waitForFunction(() => document.querySelector('.floating-panel[data-panel-id="state-panel"]:not(.hidden) button[aria-label="撤销"]')?.disabled === false);
  });
  const after = await evaluateUiFingerprint(page, "ui.generate.regenerate.states:fingerprint-after");
  const changed = after.map !== before.map;
  assert.notEqual(after.map, before.map, "国家面板重生成没有形成可观察地图变化");
  await traceUiStep(page, "ui.generate.regenerate.states:undo", async () => {
    await undo.click();
    await page.waitForFunction(() => document.querySelector('.floating-panel[data-panel-id="state-panel"]:not(.hidden) button[aria-label="重做"]')?.disabled === false);
  });
  const afterUndo = (await evaluateUiFingerprint(page, "ui.generate.regenerate.states:fingerprint-undo")).map;
  await traceUiStep(page, "ui.generate.regenerate.states:redo", async () => {
    await redo.click();
    await page.waitForFunction(() => document.querySelector('.floating-panel[data-panel-id="state-panel"]:not(.hidden) button[aria-label="撤销"]')?.disabled === false);
  });
  const afterRedo = (await evaluateUiFingerprint(page, "ui.generate.regenerate.states:fingerprint-redo")).map;
  await traceUiStep(page, "ui.generate.regenerate.states:undo-baseline", async () => {
    await undo.click();
    await page.waitForFunction(() => document.querySelector('.floating-panel[data-panel-id="state-panel"]:not(.hidden) button[aria-label="重做"]')?.disabled === false);
  });
  const afterBaseline = await evaluateUiFingerprint(page, "ui.generate.regenerate.states:fingerprint-baseline");
  const baselineRestored = afterBaseline.map === before.map && afterBaseline.history.undo === before.history.undo;
  assert.equal(baselineRestored, true, "国家面板最终撤销没有恢复基线地图与 history");
  return {
    regenerateCount,
    initialUndoDisabled,
    changed,
    historyDelta: after.history.undo - before.history.undo,
    undoRestored: afterUndo === before.map,
    redoRestored: afterRedo === after.map,
    baselineRestored
  };
}

function evaluateUiFingerprint(page, label) {
  return page.evaluate(async labelValue => {
    const id = window.__task350BeginSubphase(labelValue);
    try {
      return {
        map: await window.__task350Fingerprint(),
        history: window.__webglGeneratorApp.editHistory.getStats()
      };
    } finally {
      window.__task350EndSubphase(id);
    }
  }, label);
}

async function traceUiStep(page, label, task) {
  const id = await page.evaluate(labelValue => window.__task350BeginSubphase(labelValue), label);
  try {
    return await task();
  } finally {
    await page.evaluate(idValue => window.__task350EndSubphase(idValue), id);
  }
}

async function startStaticServer() {
  const serverInstance = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, `http://${host}:${port}`).pathname);
    const sourceRequest = pathname.startsWith("/__task350-source/");
    const root = sourceRequest ? appSourceDir : distDir;
    const relativePath = sourceRequest ? pathname.slice("/__task350-source".length) : pathname;
    let target = resolve(root, "." + normalize(relativePath));
    if (!sourceRequest && (pathname === "/" || !existsSync(target) || statSync(target).isDirectory())) target = join(distDir, "index.html");
    if (!target.startsWith(root) || !existsSync(target) || statSync(target).isDirectory()) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, {"content-type": contentType(target), "cache-control": "no-store"});
    createReadStream(target).pipe(response);
  });
  await new Promise((done, fail) => {
    serverInstance.once("error", fail);
    serverInstance.listen(port, host, done);
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
    ".png": "image/png"
  })[extname(file).toLowerCase()] || "application/octet-stream";
}
