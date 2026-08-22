#!/usr/bin/env node
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdirSync, writeFileSync} from "node:fs";
import {createRequire} from "node:module";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "source", "Fantasy-Map-Generator");
const port = 5563;
const server = spawn(process.execPath, [join(root, "tools", "serve-prototype.mjs"), "--host", "127.0.0.1", "--port", String(port), "--dir", join(root, "dist", "webgl-generator")], {stdio: "ignore"});
const playwright = createRequire(join(source, "package.json"))("playwright");
let browser;
const artifact = {
  ok: false,
  progress: {phase: "start", active: null, completed: []},
  evaluation: null,
  result: null,
  failure: null
};

try {
  await waitServer();
  artifact.progress.completed.push("server-ready");
  artifact.progress.phase = "browser-launch";
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  artifact.progress.completed.push("browser-launched");
  artifact.progress.phase = "page-ready";
  const page = await browser.newPage({viewport: {width: 1280, height: 820}});
  const consoleErrors = [], pageErrors = [];
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}?healthClear=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 180_000);
  artifact.progress.completed.push("page-ready");
  artifact.progress.phase = "browser-evaluation";
  const evaluation = await page.evaluate(async forbiddenSource => {
    const api = window.webglGeneratorApi;
    const app = window.__webglGeneratorApp;
    const coordinator = app.workerTaskCoordinator;
    const trace = {runs: [], commits: [], messages: [], longTasks: [], spans: []};
    const progress = {phase: "new-map", active: "newMap", completed: []};
    const unwrap = (value, label) => {
      if (!value?.ok) throw new Error(`${label}: ${value?.error?.code || "api_error"} ${value?.error?.message || ""}`);
      return value.data;
    };
    try {
      unwrap(await api.generate.newMap({confirm: true, seed: "economy-worker-browser", cellsTarget: 10_000, heightmapTemplate: "continents"}), "newMap");
      progress.completed.push("newMap");
      progress.phase = "fixture-selection";
      progress.active = "inspect-targets";
    const mapRef = app.map;
    const markets = app.map.pack.markets.filter(Boolean);
    const target = markets[0];
    const packCell = [...app.map.pack.cells.i].find(cell => app.map.pack.cells.h[cell] >= 20 && Number(app.map.pack.cells.market[cell] || 0) > 0 && Number(app.map.pack.cells.market[cell]) !== Number(target.i ?? target.id));
    if (!target || !Number.isInteger(packCell)) throw new Error("10k 经济夹具缺少可改派市场的陆地 cell");
    progress.completed.push("inspect-targets");
    progress.phase = "operations";
    progress.active = null;

    const originalRun = coordinator.run;
    const originalCommit = coordinator.commitSession;
    const spanAsync = async (name, task) => {
      const start = performance.now();
      progress.active = name;
      let succeeded = false;
      try {
        const value = await task();
        succeeded = true;
        return value;
      } finally {
        trace.spans.push({name, start, end: performance.now()});
        if (succeeded) {
          progress.completed.push(name);
          progress.active = null;
        }
      }
    };
    const digest = name => {
      const start = performance.now();
      try {
        return JSON.stringify({
      market: [...app.map.pack.cells.market],
      goods: app.map.pack.goods,
      markets: app.map.pack.markets,
      deals: app.map.pack.deals,
      burgs: app.map.pack.burgs,
      economy: app.map.economy
        });
      } finally {
        trace.spans.push({name, start, end: performance.now()});
      }
    };
    const before = digest("digest:before");
    const historyBefore = app.editHistory.getStats();
    app.workerTaskCoordinator = {
      run: async (task, payload, options) => {
        const output = await Reflect.apply(originalRun, coordinator, [task, payload, options]);
        trace.runs.push({
          task,
          mode: output?.worker?.mode,
          sessionMode: options?.sessionMode,
          sessionPayloadOwnMap: Object.hasOwn(options?.sessionPayload || {}, "map"),
          layers: payload?.render?.layers,
          prepared: Object.keys(output?.preparedRender?.layers || {}),
          session: output?.worker?.session || null,
          telemetry: output?.worker?.telemetry || null
        });
        return output;
      },
      commitSession: async (id, binding, options) => {
        const result = await Reflect.apply(originalCommit, coordinator, [id, binding, options]);
        trace.commits.push({id, delta: options?.expectedRevisionDelta, result});
        return result;
      },
      invalidateSession: coordinator.invalidateSession.bind(coordinator),
      getSessionSnapshot: coordinator.getSessionSnapshot.bind(coordinator)
    };
    const observer = new PerformanceObserver(list => trace.longTasks.push(...list.getEntries().map(({startTime, duration}) => ({startTime, duration}))));
    observer.observe({entryTypes: ["longtask"]});
    const forbidden = new RegExp(forbiddenSource, "i");
    const nodes = ["operation-loading", "generation-loading", "map-toast", "shortcut-toast"].map(id => document.getElementById(id)).filter(Boolean);
    const sample = () => nodes.forEach(node => {
      const style = getComputedStyle(node), text = node.textContent?.trim();
      if (text && !node.hidden && style.display !== "none" && style.visibility !== "hidden") trace.messages.push(text);
    });
    const mutations = new MutationObserver(sample);
    mutations.observe(document.body, {subtree: true, childList: true, characterData: true, attributes: true});
    window.__webglGeneratorHealth?.clear?.();
    try {
      await new Promise(done => setTimeout(done, 0));
      trace.longTasks.length = 0;
      observer.takeRecords();
      const rebuild = await spanAsync("api:rebuild", async () => unwrap(await api.edit.economy.rebuild({confirm: true}), "rebuild"));
      await new Promise(done => setTimeout(done, 0));
      const afterRebuild = digest("digest:after-rebuild");
      await new Promise(done => setTimeout(done, 0));
      const assignment = await spanAsync("api:assign", async () => unwrap(await api.edit.economy.assignCells(Number(target.i ?? target.id), [packCell], {confirm: true}), "assign"));
      await new Promise(done => setTimeout(done, 0));
      const afterAssignment = digest("digest:after-assignment");
      const historyAfter = app.editHistory.getStats();
      await new Promise(done => setTimeout(done, 0));
      await spanAsync("api:undo", async () => unwrap(await api.history.undo(), "undo"));
      await new Promise(done => setTimeout(done, 0));
      const undo = digest("digest:undo");
      await new Promise(done => setTimeout(done, 0));
      await spanAsync("api:redo", async () => unwrap(await api.history.redo(), "redo"));
      await new Promise(done => setTimeout(done, 0));
      const redo = digest("digest:redo");
      await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
      await new Promise(done => setTimeout(done, 100));
      trace.longTasks.push(...observer.takeRecords().map(({startTime, duration}) => ({startTime, duration})));
      sample();
      progress.active = "final-health";
      const health = unwrap(api.info.healthEvents({severity: "error", limit: 100}), "health");
      const stats = unwrap(api.info.runtimeStats(), "stats");
      progress.completed.push("final-health");
      progress.active = null;
      progress.phase = "complete";
      return {ok: true, progress, report: {
        rebuild,
        assignment,
        changed: before !== afterAssignment,
        historyDelta: historyAfter.undo - historyBefore.undo,
        undoExact: undo === afterRebuild,
        redoExact: redo === afterAssignment,
        mapSame: app.map === mapRef,
        trace,
        finalSession: coordinator.getSessionSnapshot(),
        loading: stats.loading,
        glError: app.renderer.getStats().draw?.glError ?? 0,
        health,
        forbidden: [...new Set(trace.messages)].filter(text => forbidden.test(text))
      }};
    } finally {
      observer.disconnect();
      mutations.disconnect();
      app.workerTaskCoordinator = coordinator;
    }
    } catch (error) {
      return {ok: false, progress, trace, failure: {name: error?.name || "Error", code: error?.code || "", message: error?.message || String(error), stack: error?.stack || ""}};
    }
  }, String.raw`\bWorker\b|\bworker\b|线程|任务会话|消息包|结构化克隆|\bbuffer\b|LocalStorage|sessionStorage|IndexedDB|\bBlob\b|缓存后端`);

  artifact.evaluation = evaluation;
  artifact.progress.completed.push("browser-evaluation");
  if (!evaluation?.ok) {
    const error = new Error(evaluation?.failure?.message || "economy browser evaluation failed");
    error.code = evaluation?.failure?.code || "economy_browser_evaluation_failed";
    throw error;
  }
  const report = evaluation.report;

  const performanceSignals = consoleErrors.filter(text => /\[FMG health\] (operation-stall|main-thread-long-task|render-frame-gap|input-handler-stall)/.test(text));
  const applicationErrors = consoleErrors.filter(text => !performanceSignals.includes(text));
  const compactSummary = {
    operations: report.trace.runs.length,
    commits: report.trace.commits.length,
    rebuildExecuted: report.rebuild.executed,
    assignmentExecuted: report.assignment.executed,
    changed: report.changed,
    historyDelta: report.historyDelta,
    undoExact: report.undoExact,
    redoExact: report.redoExact,
    mapSame: report.mapSame,
    sessionId: report.finalSession?.id || "",
    finalSessionStatus: report.finalSession?.status || "",
    reusedRuns: report.trace.runs.slice(1).filter(run => run.session?.reused).length,
    allSubsequentRunsReused: report.trace.runs.slice(1).every(run => run.session?.reused),
    runProfiles: report.trace.runs.map(run => ({
      task: run.task,
      mode: run.mode,
      sessionMode: run.sessionMode,
      sessionPayloadOwnMap: run.sessionPayloadOwnMap,
      layers: run.layers,
      prepared: run.prepared
    })),
    packetCounts: report.trace.runs.map(run => ({input: run.telemetry?.inputPackets || 0, output: run.telemetry?.outputPackets || 0})),
    commitDeltas: report.trace.commits.map(item => item.delta),
    successfulCommits: report.trace.commits.filter(item => item.result).length,
    longTaskCount: report.trace.longTasks.length,
    maxLongTaskMs: Math.max(0, ...report.trace.longTasks.map(task => task.duration)),
    overBudgetLongTasks: report.trace.longTasks.filter(task => task.duration > 200),
    forbiddenCount: report.forbidden.length,
    applicationErrors: applicationErrors.length,
    pageErrors: pageErrors.length,
    healthErrors: report.health?.events?.length || 0,
    glError: report.glError,
    loadingVisible: report.loading?.visible === true
  };
  artifact.result = {performanceSignals, applicationErrors, pageErrors, compactSummary};
  artifact.progress.phase = "assertions";
  assert.equal(report.changed && report.undoExact && report.redoExact && report.mapSame, true);
  assert.equal(report.assignment.executed, true);
  assert.equal(report.historyDelta, (report.rebuild.executed ? 1 : 0) + 1);
  assert.equal(report.trace.runs.length, 4);
  assert.equal(report.trace.commits.length, 4);
  for (const run of report.trace.runs) {
    assert.equal(run.task, "economy.compute");
    assert.equal(run.mode, "worker");
    assert.equal(run.sessionMode, "map-mirror");
    assert.equal(run.sessionPayloadOwnMap, false);
    assert.deepEqual(run.layers, ["point", "labels", "picking"]);
    assert.deepEqual(run.prepared, ["point", "labels", "picking"]);
    assert.ok(run.telemetry?.inputPackets > 0 && run.telemetry?.outputPackets > 0);
  }
  assert.ok(report.trace.runs.slice(1).every(run => run.session?.reused));
  assert.deepEqual(report.trace.commits.map(item => item.delta), [report.rebuild.executed ? 1 : 0, 1, 1, 1]);
  assert.ok(report.trace.commits.every(item => item.result));
  assert.equal(report.finalSession?.status, "idle");
  assert.deepEqual(compactSummary.overBudgetLongTasks, []);
  assert.equal(report.loading.visible, false);
  assert.equal(report.glError, 0);
  assert.deepEqual(report.health?.events, []);
  assert.deepEqual(report.forbidden, []);
  assert.deepEqual(applicationErrors, []);
  assert.deepEqual(pageErrors, []);
  artifact.ok = true;
  artifact.progress.completed.push("assertions");
  artifact.progress.phase = "complete";
  console.log(JSON.stringify({ok: true, ...compactSummary, spans: report.trace.spans, performanceSignals}, null, 2));
} catch (error) {
  artifact.failure = serializeError(error);
  artifact.progress.phase = "failed";
  throw error;
} finally {
  try {
    persistArtifact(artifact);
  } finally {
    await browser?.close();
    server.kill();
    await Promise.race([new Promise(done => server.once("exit", done)), new Promise(done => setTimeout(done, 5000))]);
  }
}

function persistArtifact(value) {
  const artifactDir = process.env.TASK_350_CDP_ARTIFACT_DIR;
  if (!artifactDir) return;
  mkdirSync(artifactDir, {recursive: true});
  writeFileSync(join(artifactDir, "economy-worker-browser-full.json"), JSON.stringify(value, null, 2));
  writeFileSync(join(artifactDir, "economy-worker-browser-summary.json"), JSON.stringify({ok: value.ok, progress: value.progress, evaluationProgress: value.evaluation?.progress || null, failure: value.failure, ...(value.result?.compactSummary || {})}, null, 2));
}

function serializeError(error) {
  return {name: error?.name || "Error", code: error?.code || "", message: error?.message || String(error), stack: error?.stack || ""};
}

async function waitServer() {
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(`静态服务提前退出：${server.exitCode}`);
    try {
      if ((await fetch(`http://127.0.0.1:${port}`)).ok) return;
    } catch {}
    await new Promise(done => setTimeout(done, 50));
  }
  throw new Error("等待静态服务超时");
}
