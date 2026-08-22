#!/usr/bin/env node
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createRequire} from "node:module";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {closeTask350BrowserResource, createTask350BrowserArtifact} from "./task-350-browser-artifact.mjs";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "source", "Fantasy-Map-Generator");
const port = 5572;
const evidence = createTask350BrowserArtifact("context-restore-browser");
const server = spawn(process.execPath, [join(root, "tools", "serve-prototype.mjs"), "--host", "127.0.0.1", "--port", String(port), "--dir", join(root, "dist", "webgl-generator")], {stdio: "ignore"});
const playwright = createRequire(join(source, "package.json"))("playwright");
let browser = null;
let context = null;
let primaryError = null;

try {
  evidence.mark("server", {active: "wait-server"});
  await waitServer();
  evidence.mark("browser", {active: "launch", complete: "server-ready"});
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  context = await browser.newContext({viewport: {width: 1280, height: 820}, deviceScaleFactor: 1});
  const page = await context.newPage();
  page.setDefaultTimeout(180_000);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));
  evidence.mark("page", {active: "ready", complete: "browser-launched"});
  await page.goto(`http://127.0.0.1:${port}?debug=1&healthClear=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 180_000);

  evidence.mark("context-restore", {active: "lose-and-restore", complete: "page-ready"});
  const evaluation = await page.evaluate(async () => {
    const api = window.webglGeneratorApi;
    const app = window.__webglGeneratorApp;
    const renderer = app.renderer;
    const unwrap = (value, label) => {
      if (!value?.ok) throw new Error(`${label}: ${value?.error?.code || "api_error"} ${value?.error?.message || ""}`);
      return value.data;
    };
    unwrap(await api.generate.newMap({confirm: true, seed: "context-restore-browser-r4b", cellsTarget: 10_000, heightmapTemplate: "continents"}), "newMap");
    unwrap(await api.layers.setTheme("ancient"), "theme");
    unwrap(await api.layers.setViewMode("states"), "view mode");
    unwrap(await api.layers.setVisible("routes", true), "routes");
    unwrap(await api.layers.setVisible("rivers", true), "rivers");
    unwrap(await api.layers.setVisible("markers", true), "markers");
    await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
    const ownerBinding = owner => owner ? {
      mapIdentity: owner.mapIdentity,
      sourceRevision: owner.sourceRevision,
      topologyRevision: owner.topologyRevision,
      renderPreparationId: owner.renderPreparationId,
      renderGeneration: owner.renderGeneration
    } : null;
    const owners = () => ({
      surface: ownerBinding(renderer.surfaceResourceOwner),
      caches: Object.fromEntries(["line", "point", "route", "river", "tradeFlow", "selection"].map(family => [family, ownerBinding(renderer.renderCacheResourceOwners?.[family])])),
      picking: ownerBinding(renderer.objectPickingResourceOwner),
      label: ownerBinding(renderer.labelLayoutResourceOwner),
      overlay: ownerBinding(renderer.overlayResourceOwner)
    });
    const state = () => ({
      map: unwrap(api.info.mapSummary(), "summary"),
      history: unwrap(api.history.get(), "history"),
      layers: unwrap(api.layers.get(), "layers"),
      camera: {...renderer.camera}
    });
    const pickCity = () => {
      const city = app.map.settlements.cities.find(item => item && !item.removed && Number.isFinite(item.x) && Number.isFinite(item.y));
      if (!city) throw new Error("context restore fixture 缺少可拾取城市");
      const rect = renderer.canvas.getBoundingClientRect();
      const point = renderer.worldToScreen(city.x, city.y, rect);
      const picked = renderer.pickClientPoint(rect.left + point.x, rect.top + point.y)?.object;
      return {expected: Number(city.id ?? city.i), kind: picked?.kind || "", id: Number(picked?.id ?? picked?.i ?? picked?.cityId)};
    };
    const before = {state: state(), owners: owners(), pick: pickCity(), mapRef: app.map, drawCount: Number(renderer.getStats().draw?.sequence || 0)};
    window.__task350R4bLongTasks = [];
    const observer = new PerformanceObserver(list => window.__task350R4bLongTasks.push(...list.getEntries().map(({startTime, duration}) => ({startTime, duration, phase: "context-restore"}))));
    observer.observe({type: "longtask", buffered: false});
    window.__webglGeneratorHealth?.clear?.();
    const receipt = unwrap(await api.debug.simulateContextLoss({restoreDelayMs: 50}), "simulate context loss");
    await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
    await new Promise(done => setTimeout(done, 100));
    window.__task350R4bLongTasks.push(...observer.takeRecords().map(({startTime, duration}) => ({startTime, duration, phase: "context-restore"})));
    observer.disconnect();
    const after = {
      state: state(),
      owners: owners(),
      pick: pickCity(),
      sameMapRef: app.map === before.mapRef,
      drawCount: Number(renderer.getStats().draw?.sequence || 0),
      resourceState: renderer.webGlContextResourceState,
      retainedState: renderer.retainedResourceState,
      contextLost: Boolean(renderer.webGlContextLost || renderer.gl.isContextLost?.()),
      glError: renderer.getStats().draw?.glError ?? 0,
      loading: unwrap(api.info.runtimeStats(), "stats").loading,
      health: unwrap(api.info.healthEvents({severity: "error", limit: 100}), "health")
    };
    return {before: {...before, mapRef: undefined}, receipt, after, longTasks: window.__task350R4bLongTasks};
  });

  evidence.mark("assertions", {active: "owners-picking-state", complete: "context-restore"});
  const performanceSignals = consoleErrors.filter(text => /\[FMG health\] (operation-stall|main-thread-long-task|render-frame-gap|input-handler-stall)/u.test(text));
  const applicationErrors = consoleErrors.filter(text => !performanceSignals.includes(text));
  const overBudget = evaluation.longTasks.filter(task => task.duration > 200);
  const beforeOwnerValues = [evaluation.before.owners.surface, ...Object.values(evaluation.before.owners.caches), evaluation.before.owners.picking, evaluation.before.owners.label, evaluation.before.owners.overlay];
  const ownerValues = [evaluation.after.owners.surface, ...Object.values(evaluation.after.owners.caches), evaluation.after.owners.picking, evaluation.after.owners.label, evaluation.after.owners.overlay];
  const beforeOwnersAligned = beforeOwnerValues.every(owner => owner !== null && JSON.stringify(owner) === JSON.stringify(evaluation.receipt.beforeBinding));
  const ownersAligned = ownerValues.every(owner => JSON.stringify(owner) === JSON.stringify(evaluation.receipt.afterBinding));
  const stateExact = JSON.stringify(evaluation.before.state) === JSON.stringify(evaluation.after.state);
  const pickExact = evaluation.before.pick.expected === evaluation.before.pick.id
    && evaluation.after.pick.expected === evaluation.after.pick.id
    && evaluation.after.pick.id === evaluation.before.pick.id;
  const compact = {
    cells: evaluation.before.state.map.gridCells,
    restored: evaluation.receipt.restored === true,
    sameMapRef: evaluation.after.sameMapRef,
    sourceRevision: evaluation.receipt.afterBinding?.sourceRevision,
    topologyRevision: evaluation.receipt.afterBinding?.topologyRevision,
    generationDelta: Number(evaluation.receipt.afterBinding?.renderGeneration) - Number(evaluation.receipt.beforeBinding?.renderGeneration),
    drawDelta: evaluation.after.drawCount - evaluation.before.drawCount,
    beforeOwnersAligned,
    ownersAligned,
    stateExact,
    pickExact,
    resourceState: evaluation.after.resourceState,
    retainedState: evaluation.after.retainedState,
    contextLost: evaluation.after.contextLost,
    longTaskCount: evaluation.longTasks.length,
    maxLongTaskMs: Math.max(0, ...evaluation.longTasks.map(task => task.duration)),
    overBudget,
    applicationErrors: applicationErrors.length,
    pageErrors: pageErrors.length,
    healthErrors: evaluation.after.health?.events?.length || 0,
    glError: evaluation.after.glError,
    loadingVisible: evaluation.after.loading?.visible === true
  };
  evidence.setResult({evaluation, performanceSignals, applicationErrors, pageErrors}, compact);
  assert(evaluation.before.state.map.gridCells >= 9_000, "context restore fixture 未使用代表性 10k 地图");
  assert.equal(evaluation.receipt.restored, true);
  assert.equal(evaluation.after.sameMapRef, true, "context restore 不得刷新页面或生成替代地图");
  assert.equal(Number(evaluation.receipt.afterBinding.renderGeneration), Number(evaluation.receipt.beforeBinding.renderGeneration) + 1);
  assert.equal(evaluation.receipt.afterBinding.mapIdentity, evaluation.receipt.beforeBinding.mapIdentity);
  assert.equal(evaluation.receipt.afterBinding.sourceRevision, evaluation.receipt.beforeBinding.sourceRevision);
  assert.equal(evaluation.receipt.afterBinding.topologyRevision, evaluation.receipt.beforeBinding.topologyRevision);
  assert.equal(compact.drawDelta, 1, "context restore 必须且只能产生一次最终 draw");
  assert.equal(beforeOwnersAligned, true, "context restore 起点必须是完整同源 binding owner");
  assert.equal(ownersAligned, true);
  assert.equal(stateExact, true);
  assert.equal(pickExact, true);
  assert.equal(evaluation.after.resourceState, "ready");
  assert.equal(evaluation.after.retainedState, "ready");
  assert.equal(evaluation.after.contextLost, false);
  assert.deepEqual(overBudget, []);
  assert.deepEqual(applicationErrors, []);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(evaluation.after.health?.events || [], []);
  assert.equal(evaluation.after.loading?.visible, false);
  assert.equal(evaluation.after.glError, 0);
  evidence.succeed();
  console.log(JSON.stringify({ok: true, ...compact, performanceSignals}, null, 2));
} catch (error) {
  primaryError = error;
  evidence.fail(error);
} finally {
  for (const [label, close] of [
    ["context", () => context?.close()],
    ["browser", () => browser?.close()],
    ["server", async () => {
      if (server.exitCode !== null) return;
      server.kill();
      await new Promise((resolve, reject) => {
        server.once("exit", resolve);
        server.once("error", reject);
      });
    }]
  ]) {
    try {
      await closeTask350BrowserResource(label, close);
    } catch (error) {
      if (label === "server") server.unref();
      evidence.failTeardown(error);
    }
  }
  evidence.persist();
}

if (primaryError) throw primaryError;
if (!evidence.artifact.ok) throw Object.assign(new Error(evidence.artifact.failure?.message || "context restore teardown failed"), {code: evidence.artifact.failure?.code || "context_restore_teardown_failed"});

async function waitServer() {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null) throw new Error(`静态服务提前退出：${server.exitCode}`);
    try {
      if ((await fetch(`http://127.0.0.1:${port}`)).ok) return;
    } catch {}
    await new Promise(done => setTimeout(done, 50));
  }
  throw new Error("等待静态服务超时");
}
