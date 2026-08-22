import assert from "node:assert/strict";
import {createReadStream, existsSync, mkdirSync, statSync, writeFileSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {dirname, extname, join, normalize, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const distDir = join(rootDir, "dist", "webgl-generator");
const host = "127.0.0.1";
const port = 5527;
const timeoutMs = 240000;
const longTaskBudgetMs = 200;
const kinds = ["features", "routes", "rivers", "cities", "states", "provinces", "markers", "diplomacy", "religions", "military", "zones"];
const dependencyOrder = ["features", "states", "provinces", "cities", "routes", "rivers", "markers", "diplomacy", "religions", "military", "zones"];
const loadingOnlyKind = String(process.argv.find(argument => argument.startsWith("--loading-kind="))?.split("=")[1] || "");
const loadingOnlyCells = Number(process.argv.find(argument => argument.startsWith("--cells="))?.split("=")[1] || 10000);
const rejectionSessionOnly = process.argv.includes("--rejection-session");
if (loadingOnlyKind) assert.ok(kinds.includes(loadingOnlyKind), `未知 Loading 诊断类型：${loadingOnlyKind}`);
if (loadingOnlyKind) assert.ok([10000, 100000].includes(loadingOnlyCells), `Loading 诊断不支持 ${loadingOnlyCells} cells`);

assert.ok(existsSync(distDir), `构建产物不存在：${distDir}`);
const artifactDir = resolve(process.env.TASK_350_CDP_ARTIFACT_DIR || process.env.TEMP || join(rootDir, "docs", "generated"));
const fullArtifact = join(artifactDir, "worker-regeneration-browser-full.json");
const summaryArtifact = join(artifactDir, "worker-regeneration-browser-summary.json");
const runResult = {ok: false, independent: {}, chain: [], rejectionSession: null, active: null, failure: null};
const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const server = await startStaticServer();
let browser;
let context;
let terminalError = null;

try {
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  context = await browser.newContext({viewport: {width: 1280, height: 820}, deviceScaleFactor: 1});
  await context.addInitScript(() => {
    localStorage.clear();
    window.__task322LongTasks = [];
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        window.__task322LongTasks.push({startTime: entry.startTime, duration: entry.duration, name: entry.name});
      }
    }).observe({entryTypes: ["longtask"]});
  });
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(`http://${host}:${port}?healthClear=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, timeoutMs);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");

  runResult.rejectionSession = rejectionSessionOnly
    ? await runRepairableRegenerationSessionGate(page, consoleErrors, pageErrors)
    : null;
  if (!rejectionSessionOnly) {
    for (const kind of loadingOnlyKind ? [loadingOnlyKind] : kinds) {
      await createFrozenBaseline(page, "worker-regeneration-browser-baseline", loadingOnlyKind ? loadingOnlyCells : 1000);
      await clearWindowSignals(page, consoleErrors, pageErrors);
      runResult.active = createActiveProgress("independent", kind);
      runResult.independent[kind] = await runFormalRegeneration(page, cdp, kind, consoleErrors, pageErrors, {undoRedo: true, progress: runResult.active});
      runResult.active = null;
    }
    assert.ok(Object.values(runResult.independent).every(item => item.worker.session.reused === true), "新图 adoption 后的首次重生成没有复用 MapWorker");
  }

  if (!loadingOnlyKind && !rejectionSessionOnly) {
    await createFrozenBaseline(page, "worker-regeneration-browser-chain", 10000);
    await clearWindowSignals(page, consoleErrors, pageErrors);
    for (const [index, kind] of dependencyOrder.entries()) {
      runResult.active = createActiveProgress("chain", kind, index);
      runResult.chain.push(await runFormalRegeneration(page, cdp, kind, consoleErrors, pageErrors, {undoRedo: false, progress: runResult.active}));
      runResult.active = null;
      await clearWindowSignals(page, consoleErrors, pageErrors);
    }
    assert.equal(runResult.chain[0].worker.session.reused, true, "连续链首项没有复用新图 adoption MapWorker");
    assert.ok(runResult.chain.every(item => item.worker.session.reused === true), "连续链存在未复用 MapWorker 的重生成");
    assert.ok(runResult.chain.every(item => item.worker.session.id === runResult.chain[0].worker.session.id), "连续链必须复用同一个 Worker session");
    assert.ok(runResult.chain.every(item => Number(item.telemetry.inputPackets) <= 4), "新图 adoption 后的重生成仍在传输完整地图");
  }
  runResult.ok = true;
} catch (error) {
  terminalError = error;
  runResult.failure = serializeFailure(error, runResult.active);
} finally {
  try {
    const compactSummary = persistArtifacts(runResult);
    const output = {ok: runResult.ok, summary: compactSummary, artifacts: {full: fullArtifact, summary: summaryArtifact}};
    (runResult.ok ? console.log : console.error)(JSON.stringify(output, null, 2));
  } catch (error) {
    terminalError ||= error;
  }
  if (context) await Promise.race([context.close(), delay(5000)]);
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await new Promise(done => server.close(done));
}
if (terminalError) throw terminalError;

async function runRepairableRegenerationSessionGate(page, consoleErrors, pageErrors) {
  const results = [];
  for (const kind of ["provinces", "cities"]) {
    await createFrozenBaseline(page, `worker-regeneration-repair-${kind}`, 10000);
    await clearWindowSignals(page, consoleErrors, pageErrors);
    const before = await page.evaluate(targetKind => {
      const app = window.__webglGeneratorApp;
      const active = app.map.politics.provinces.filter(item => item?.i && !item.removed);
      const invalidBurg = 1000000 + app.map.pack.burgs.length;
      for (const province of active) {
        province.burg = invalidBurg + province.i;
        const packProvince = app.map.pack.provinces[province.i];
        if (packProvince && packProvince !== province) packProvince.burg = invalidBurg + province.i;
      }
      const orphanProvinceId = targetKind === "cities" ? Number(active.at(-1)?.i || 0) : 0;
      if (orphanProvinceId) {
        for (const cell of app.map.pack.cells.i || []) {
          if (Number(app.map.pack.cells.province[cell]) === orphanProvinceId) app.map.pack.cells.province[cell] = 0;
        }
        for (const city of app.map.settlements.cities || []) {
          if (!city || city.removed || Number(city.province) !== orphanProvinceId) continue;
          city.province = 0;
          city.provincial = false;
          const burg = app.map.pack.burgs?.[city.burgId];
          if (burg) {
            burg.province = 0;
            burg.provincial = false;
          }
        }
      }
      return {
        provinces: active.length,
        invalidBurg,
        orphanProvinceId,
        history: app.editHistory.getStats(),
        revision: app.mapRevision.getSnapshot()
      };
    }, kind);
    const response = await page.evaluate(targetKind => window.webglGeneratorApi.generate.regenerate(targetKind, {confirm: true}), kind);
    assert.equal(response?.ok, true, `${kind} 被旧省会状态阻断：${response?.error?.message || "unknown"}`);
    const worker = response.data?.worker;
    assert.equal(worker?.session?.committed, true, `${kind} 修复结果没有提交 session`);
    assert.equal(worker?.session?.pending, false, `${kind} 修复结果留下 pending session`);
    const after = await page.evaluate(() => {
      const app = window.__webglGeneratorApp;
      const session = app.workerTaskCoordinator.getSessionSnapshot();
      const health = window.__webglGeneratorHealth?.getEvents?.(180) || [];
      const mismatches = [];
      for (const province of app.map.politics.provinces || []) {
        if (!province?.i || province.removed) continue;
        const cities = app.map.settlements.cities.filter(city => city && !city.removed
          && Number(city.province) === Number(province.i) && city.provincial);
        const capital = cities[0];
        const burg = capital ? app.map.pack.burgs[capital.burgId] : null;
        const packProvince = app.map.pack.provinces[province.i];
        const hasTerritory = Array.from(app.map.pack.cells.province || []).some(id => Number(id) === Number(province.i));
        if (!hasTerritory) {
          if (cities.length !== 0 || Number(province.burg || 0) !== 0 || Number(packProvince?.burg || 0) !== 0) {
            mismatches.push(Number(province.i));
          }
          continue;
        }
        if (cities.length !== 1 || !capital || !burg
          || Number(province.burg) !== Number(capital.burgId)
          || Number(province.center) !== Number(capital.packCell)
          || Number(province.gridCenter) !== Number(capital.cell)
          || Number(packProvince?.burg) !== Number(province.burg)
          || !burg.provincial) {
          mismatches.push(Number(province.i));
        }
      }
      const signals = {
        loadingVisible: Number(Boolean(document.getElementById("generation-loading") && !document.getElementById("generation-loading").hidden))
          + Number(Boolean(document.getElementById("operation-loading") && !document.getElementById("operation-loading").hidden)),
        healthErrors: health.filter(event => event.severity === "error"),
        glError: Number(app.renderer.getStats().draw?.glError ?? 0)
      };
      return {session, history: app.editHistory.getStats(), revision: app.mapRevision.getSnapshot(), signals, mismatches};
    });
    assert.equal(after.session?.id, worker.session.id, `${kind} 修复结果切换了 MapWorker session`);
    assert.equal(after.session?.status, "idle", `${kind} 修复后 session 不是 idle`);
    assert.equal(after.history.undo, before.history.undo + 1, `${kind} 修复没有形成单条历史`);
    assert.equal(after.revision.mapRevision, before.revision.mapRevision + 1, `${kind} 修复没有单次推进 map revision`);
    assert.deepEqual(after.mismatches, [], `${kind} 修复后仍有省会镜像不一致`);
    assert.equal(after.signals.loadingVisible, 0, `${kind} 修复后 Loading 未清理`);
    const nonPerformanceHealth = after.signals.healthErrors.filter(event => !["main-thread-long-task", "operation-stall", "render-frame-gap", "input-handler-stall"].includes(event.type));
    assert.deepEqual(nonPerformanceHealth, [], `${kind} 修复产生非性能 health error`);
    assert.equal(after.signals.glError, 0, `${kind} 修复产生 WebGL error`);
    const undoRoundTrip = await page.evaluate(async () => {
      const app = window.__webglGeneratorApp;
      const beforeGeometry = app.renderer.cellVisualCorrectionGeometry;
      const undo = await window.webglGeneratorApi.history.undo();
      const afterGeometry = app.renderer.cellVisualCorrectionGeometry;
      return {
        undo,
        beforeGeometry: {type: beforeGeometry?.constructor?.name, length: beforeGeometry?.length, byteLength: beforeGeometry?.byteLength},
        afterGeometry: {type: afterGeometry?.constructor?.name, length: afterGeometry?.length, byteLength: afterGeometry?.byteLength}
      };
    });
    assert.equal(undoRoundTrip.undo?.ok, true, `${kind} 修复结果无法撤销：${JSON.stringify(undoRoundTrip)}`);
    results.push({kind, provinces: before.provinces, orphanProvinceId: before.orphanProvinceId, session: worker.session});
  }
  assert.deepEqual(consoleErrors.filter(message => !/^\[FMG health\] (?:main-thread-long-task|operation-stall|render-frame-gap|input-handler-stall)\b/.test(message)), [], "修复入口出现应用 console error");
  assert.deepEqual(pageErrors, [], "修复入口出现 page error");
  return results;
}

async function createFrozenBaseline(page, seed, cellsTarget) {
  const response = await page.evaluate(async input => window.webglGeneratorApi.generate.newMap({
    confirm: true,
    seed: input.seed,
    cellsTarget: input.cellsTarget,
    heightmapTemplate: "continents"
  }), {seed, cellsTarget});
  assert.equal(response?.ok, true, `固定基线生成失败：${response?.error?.message || "unknown"}`);
  await page.evaluate(() => window.__webglGeneratorApp.editHistory.clear());
}

async function runFormalRegeneration(page, cdp, kind, consoleErrors, pageErrors, {undoRedo, progress}) {
  progress.phase = "execute";
  const before = await page.evaluate(targetKind => {
    const app = window.__webglGeneratorApp;
    return {
      salt: Number(app.map.metadata?.regeneration?.[targetKind]) || 0,
      history: app.editHistory.getStats(),
      routes: targetKind === "rivers" ? JSON.stringify(app.map.settlements?.routes || []) : "",
      routeSalt: targetKind === "rivers" ? Number(app.map.metadata?.regeneration?.routes) || 0 : 0
    };
  }, kind);
  const metricsBefore = indexMetrics(await cdp.send("Performance.getMetrics"));
  const call = page.evaluate(async targetKind => window.webglGeneratorApi.generate.regenerate(targetKind, {confirm: true}), kind);
  let settled = false;
  void call.then(() => { settled = true; }, () => { settled = true; });
  const loadingSamples = [];
  while (!settled) {
    loadingSamples.push(await page.evaluate(() => {
      const generation = document.getElementById("generation-loading");
      const operation = document.getElementById("operation-loading");
      return {
        visible: Number(Boolean(generation && !generation.hidden)) + Number(Boolean(operation && !operation.hidden)),
        text: generation && !generation.hidden ? document.getElementById("generation-loading-text")?.textContent?.trim() || "" : ""
      };
    }));
    await delay(20);
  }
  const response = await call;
  assert.equal(response?.ok, true, `${kind} 正式 Worker API 失败：${response?.error?.message || "unknown"}`);
  const result = response.data;
  assert.equal(result?.worker?.mode, "worker", `${kind} 正式入口没有使用 Worker`);
  assert.equal(result?.worker?.accepted, true, `${kind} Worker 未进入 accepted`);
  assert.ok(result?.worker?.session?.id, `${kind} 缺少持久 Worker session`);
  assert.equal(result?.worker?.session?.pending, false, `${kind} Worker session 未完成提交`);
  assert.equal(result?.worker?.session?.committed, true, `${kind} Worker session 提交失败`);
  const telemetry = result.worker.telemetry || {};
  progress.worker = {mode: result.worker.mode, accepted: result.worker.accepted, session: result.worker.session};
  progress.telemetry = telemetry;
  for (const field of ["inputPackets", "outputPackets", "computeMs", "commitInstallMs", "refreshMs"]) {
    assert.equal(Number.isFinite(Number(telemetry[field])), true, `${kind} 缺少 ${field} 遥测`);
  }
  assert.ok(Number(telemetry.inputPackets) > 0 && Number(telemetry.outputPackets) > 0, `${kind} 分块流包计数无效`);
  assert.ok(Number(telemetry.inputPostMaxMs) < 50, `${kind} 输入单包主线程发送超预算：${telemetry.inputPostMaxMs}`);
  assert.ok(Number(telemetry.outputDecodeMaxMs) < 50, `${kind} 结果单包主线程解码超预算：${telemetry.outputDecodeMaxMs}`);
  assert.ok(Number(telemetry.outputWorkerPostMaxMs) < 50, `${kind} 结果单包 Worker 发送超预算：${telemetry.outputWorkerPostMaxMs}`);
  const performance = {execute: await collectLongTaskPhase(page, kind, "execute", progress)};

  const after = await page.evaluate(targetKind => {
    const app = window.__webglGeneratorApp;
    const health = window.__webglGeneratorHealth?.getEvents?.(180) || [];
    return {
      salt: Number(app.map.metadata?.regeneration?.[targetKind]) || 0,
      history: app.editHistory.getStats(),
      routes: targetKind === "rivers" ? JSON.stringify(app.map.settlements?.routes || []) : "",
      routeSalt: targetKind === "rivers" ? Number(app.map.metadata?.regeneration?.routes) || 0 : 0,
      healthErrors: health.filter(event => event.severity === "error"),
      glError: Number(app.renderer.getStats().draw?.glError ?? 0),
      loadingVisible: Number(Boolean(document.getElementById("generation-loading") && !document.getElementById("generation-loading").hidden))
        + Number(Boolean(document.getElementById("operation-loading") && !document.getElementById("operation-loading").hidden))
    };
  }, kind);
  assert.equal(after.salt, before.salt + 1, `${kind} salt 未单次推进`);
  assert.equal(after.history.undo, before.history.undo + 1, `${kind} 未形成单条历史`);
  assert.equal(after.loadingVisible, 0, `${kind} 完成后 Loading 未清理`);
  assert.ok(loadingSamples.length > 0, `${kind} 未观察到 Loading 采样窗口`);
  assert.ok(Math.max(...loadingSamples.map(sample => sample.visible)) <= 1, `${kind} 同时显示多个 Loading`);
  const loadingTexts = [...new Set(loadingSamples.filter(sample => sample.visible).map(sample => sample.text).filter(Boolean))];
  assert.ok(loadingTexts.length >= 2, `${kind} Loading 没有显示分阶段文案：${JSON.stringify(loadingTexts)}`);
  if (kind === "rivers") {
    assert.equal(after.routes, before.routes, "河流 Worker 重算改写了道路对象");
    assert.equal(after.routeSalt, before.routeSalt, "河流 Worker 重算改写了道路 salt");
  }
  const nonPerformanceHealth = after.healthErrors.filter(event => !["main-thread-long-task", "operation-stall", "render-frame-gap", "input-handler-stall"].includes(event.type));
  assert.deepEqual(nonPerformanceHealth, [], `${kind} 出现非性能 health error`);
  assert.deepEqual(consoleErrors.filter(message => !/^\[FMG health\] (?:main-thread-long-task|operation-stall|render-frame-gap|input-handler-stall)\b/.test(message)), [], `${kind} 出现应用 console error`);
  assert.deepEqual(pageErrors, [], `${kind} 出现 page error`);
  assert.equal(after.glError, 0, `${kind} 出现 WebGL error`);

  if (undoRedo) {
    progress.phase = "undo";
    const undoResult = await page.evaluate(async targetKind => {
      const api = window.webglGeneratorApi;
      const app = window.__webglGeneratorApp;
      const undo = await api.history.undo();
      if (!undo?.ok) throw new Error(`undo失败：${undo?.error?.message || "unknown"}`);
      return {salt: Number(app.map.metadata?.regeneration?.[targetKind]) || 0};
    }, kind);
    performance.undo = await collectLongTaskPhase(page, kind, "undo", progress);
    assert.equal(undoResult.salt, before.salt, `${kind} undo 未恢复 salt`);

    progress.phase = "redo";
    const redoResult = await page.evaluate(async targetKind => {
      const api = window.webglGeneratorApi;
      const app = window.__webglGeneratorApp;
      const redo = await api.history.redo();
      if (!redo?.ok) throw new Error(`redo失败：${redo?.error?.message || "unknown"}`);
      return {salt: Number(app.map.metadata?.regeneration?.[targetKind]) || 0};
    }, kind);
    performance.redo = await collectLongTaskPhase(page, kind, "redo", progress);
    assert.equal(redoResult.salt, after.salt, `${kind} redo 未恢复 salt`);
    await assertRuntimeClean(page, kind, consoleErrors, pageErrors, "undo/redo");
  }

  const metricsAfter = indexMetrics(await cdp.send("Performance.getMetrics"));
  progress.phase = null;
  return {
    kind,
    worker: {mode: result.worker.mode, accepted: result.worker.accepted, session: result.worker.session},
    telemetry,
    loadingTexts,
    performance,
    taskDurationDeltaMs: roundMs((metricsAfter.TaskDuration - metricsBefore.TaskDuration) * 1000)
  };
}

async function collectLongTaskPhase(page, kind, phase, progress) {
  await page.evaluate(() => new Promise(resolveFrame => requestAnimationFrame(() => setTimeout(resolveFrame, 0))));
  const tasks = await page.evaluate(() => {
    const rows = window.__task322LongTasks.slice();
    window.__task322LongTasks.length = 0;
    return rows;
  });
  const normalized = tasks.map(task => ({startTime: roundMs(task.startTime), duration: roundMs(task.duration), name: String(task.name || "")}));
  const overBudget = normalized.filter(task => task.duration > longTaskBudgetMs);
  const result = {
    count: normalized.length,
    maxMs: normalized.length ? Math.max(...normalized.map(task => task.duration)) : 0,
    over200: overBudget.length,
    tasks: normalized
  };
  progress.phase = phase;
  progress.performance[phase] = result;
  assert.deepEqual(overBudget, [], `${kind} ${phase} 出现 >${longTaskBudgetMs}ms 产品 LongTask：${JSON.stringify(overBudget)}`);
  progress.phase = null;
  return result;
}

async function assertRuntimeClean(page, kind, consoleErrors, pageErrors, phase) {
  const state = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const health = window.__webglGeneratorHealth?.getEvents?.(180) || [];
    return {
      healthErrors: health.filter(event => event.severity === "error"),
      glError: Number(app.renderer.getStats().draw?.glError ?? 0),
      loadingVisible: Number(Boolean(document.getElementById("generation-loading") && !document.getElementById("generation-loading").hidden))
        + Number(Boolean(document.getElementById("operation-loading") && !document.getElementById("operation-loading").hidden))
    };
  });
  const nonPerformanceHealth = state.healthErrors.filter(event => !["main-thread-long-task", "operation-stall", "render-frame-gap", "input-handler-stall"].includes(event.type));
  assert.deepEqual(nonPerformanceHealth, [], `${kind} ${phase} 出现非性能 health error`);
  assert.deepEqual(consoleErrors.filter(message => !/^\[FMG health\] (?:main-thread-long-task|operation-stall|render-frame-gap|input-handler-stall)\b/.test(message)), [], `${kind} ${phase} 出现应用 console error`);
  assert.deepEqual(pageErrors, [], `${kind} ${phase} 出现 page error`);
  assert.equal(state.glError, 0, `${kind} ${phase} 出现 WebGL error`);
  assert.equal(state.loadingVisible, 0, `${kind} ${phase} 后 Loading 未清理`);
}

function buildCompactSummary(result) {
  const summarize = (item, index = null) => ({
    ...(index === null ? {} : {index}),
    kind: item.kind,
    accepted: item.worker.accepted,
    sessionId: item.worker.session.id,
    reused: item.worker.session.reused,
    inputPackets: Number(item.telemetry.inputPackets),
    phases: Object.fromEntries(Object.entries(item.performance).map(([phase, value]) => [phase, {count: value.count, maxMs: value.maxMs, over200: value.over200}]))
  });
  const independent = Object.values(result.independent).map(item => summarize(item));
  const chain = result.chain.map((item, index) => summarize(item, index));
  const active = result.active ? summarizeActiveProgress(result.active) : null;
  const rows = [...independent, ...chain, ...(active ? [active] : [])];
  const phases = rows.flatMap(row => Object.values(row.phases));
  return {
    ok: result.ok,
    longTaskBudgetMs,
    independent,
    chain,
    maxLongTaskMs: phases.length ? Math.max(...phases.map(phase => phase.maxMs)) : 0,
    over200: phases.reduce((sum, phase) => sum + phase.over200, 0),
    active,
    failure: result.failure,
    rejectionSession: result.rejectionSession
  };
}

function createActiveProgress(scope, kind, index = null) {
  return {scope, ...(index === null ? {} : {index}), kind, phase: null, worker: null, telemetry: null, performance: {}};
}

function summarizeActiveProgress(progress) {
  return {
    scope: progress.scope,
    ...(progress.index === undefined ? {} : {index: progress.index}),
    kind: progress.kind,
    phase: progress.phase,
    accepted: progress.worker?.accepted ?? null,
    sessionId: progress.worker?.session?.id ?? null,
    reused: progress.worker?.session?.reused ?? null,
    inputPackets: Number(progress.telemetry?.inputPackets ?? 0),
    phases: Object.fromEntries(Object.entries(progress.performance).map(([phase, value]) => [phase, {count: value.count, maxMs: value.maxMs, over200: value.over200}]))
  };
}

function serializeFailure(error, active) {
  const phase = active?.phase || null;
  const phaseResult = phase ? active?.performance?.[phase] : null;
  return {
    name: String(error?.name || "Error"),
    message: String(error?.message || error || "unknown"),
    kind: active?.kind || null,
    scope: active?.scope || null,
    phase,
    overBudget: (phaseResult?.tasks || []).filter(task => task.duration > longTaskBudgetMs)
  };
}

function persistArtifacts(result) {
  const compactSummary = buildCompactSummary(result);
  mkdirSync(artifactDir, {recursive: true});
  writeFileSync(fullArtifact, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  writeFileSync(summaryArtifact, `${JSON.stringify(compactSummary, null, 2)}\n`, "utf8");
  return compactSummary;
}

function clearWindowSignals(page, consoleErrors, pageErrors) {
  consoleErrors.length = 0;
  pageErrors.length = 0;
  return page.evaluate(() => {
    window.__task322LongTasks.length = 0;
    window.__webglGeneratorHealth?.clear?.();
  });
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
    let target = resolve(distDir, "." + normalize(pathname));
    if (pathname === "/" || !existsSync(target) || statSync(target).isDirectory()) target = join(distDir, "index.html");
    if (!target.startsWith(distDir) || !existsSync(target)) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, {"Content-Type": mimeType(target), "Cache-Control": "no-store"});
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
