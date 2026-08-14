#!/usr/bin/env node
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createRequire} from "node:module";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const distDir = join(rootDir, "dist", "webgl-generator");
const host = "127.0.0.1";
const port = 5562;
const requestedCells = readRequestedCells(process.argv.slice(2));
const timeoutMs = 900000;
const seed = `task333-map-file-worker-browser-${requestedCells}`;
const performanceTypes = ["operation-stall", "main-thread-long-task", "render-frame-gap", "input-handler-stall"];
const technicalCopy = /\bWorker\b|\bworker\b|线程|任务会话|消息包|结构化克隆|\bbuffer\b|LocalStorage|sessionStorage|IndexedDB|\bBlob\b|缓存后端|浏览器概念/;
const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const server = spawn(process.execPath, [join(rootDir, "tools", "serve-prototype.mjs"), "--host", host, "--port", String(port), "--dir", distDir], {stdio: "ignore"});
let browser;
let context;

try {
  await waitForServer(server);
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  context = await browser.newContext({viewport: {width: 1280, height: 820}});
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(`http://${host}:${port}?healthClear=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, timeoutMs);
  const generated = await page.evaluate(({seedValue, requestedCells}) => window.webglGeneratorApi.generate.newMap({confirm: true, seed: seedValue, cellsTarget: requestedCells}), {seedValue: seed, requestedCells});
  assert.equal(generated.ok, true, generated.error?.message || "存档测试地图生成失败");
  const consoleStart = consoleErrors.length;
  const report = await page.evaluate(async ({forbiddenSource, performanceTypes}) => {
    const api = window.webglGeneratorApi;
    const app = window.__webglGeneratorApp;
    const renderer = app.renderer;
    const coordinator = app.workerTaskCoordinator;
    const trace = {runs: [], patches: [], invalidations: [], operations: [], preparedLoads: [], legacyLoads: 0, preparedPresentations: 0, fullThemeUpdates: 0, fullUnitUpdates: 0, longTasks: [], visibleMessages: []};
    const originalRun = coordinator.run;
    const originalApplySessionPatch = coordinator.applySessionPatch;
    const originalInvalidateSession = coordinator.invalidateSession;
    const originalPrepared = renderer.completePreparedMapLoadAsync;
    const originalLegacy = renderer.loadMapAsync;
    const originalPreparedPresentation = renderer.setPreparedPresentation;
    const originalTheme = renderer.setVisualTheme;
    const originalUnits = renderer.setUnitPreferences;
    const wrappedCoordinator = {
      async run(task, payload, options) {
        const record = {task, operation: payload?.operation || payload?.mode || "", inputKind: payload?.input?.kind || typeof payload?.input, requestLayers: [...(payload?.render?.layers || [])], payloadOwnMap: Object.hasOwn(payload || {}, "map"), sessionPayloadOwnMap: Object.hasOwn(options?.sessionPayload || {}, "map")};
        trace.runs.push(record);
        const result = await Reflect.apply(originalRun, coordinator, [task, payload, options]);
        Object.assign(record, {
          mode: result?.worker?.mode || "",
          accepted: result?.worker?.accepted === true,
          telemetry: result?.worker?.telemetry || null,
          preparedLayers: Object.keys(result?.preparedRender?.layers || {}),
          session: result?.worker?.session ? {...result.worker.session} : null,
          sessionChecksum: coordinator.getSessionSnapshot()?.checksum || null,
          outputEncoding: result?.archive?.encoding || result?.encoding || "",
          outputOriginalBytes: result?.archive?.originalBytes || result?.originalBytes || 0,
          outputBytes: result?.archive?.bytes || result?.bytes || 0
        });
        return result;
      },
      async applySessionPatch(sessionId, patch, binding) {
        const record = {sessionId, sessionChecksumBefore: coordinator.getSessionSnapshot()?.checksum || null};
        trace.patches.push(record);
        const operation = Reflect.apply(originalApplySessionPatch, coordinator, [sessionId, patch, binding]);
        try {
          const resolvedPatch = await patch;
          Object.assign(record, {baseRevision: resolvedPatch?.baseRevision, targetRevision: resolvedPatch?.targetRevision, patchId: resolvedPatch?.patchId, writes: resolvedPatch?.writes?.length || 0, baseChecksum: resolvedPatch?.baseChecksum || null, targetChecksum: resolvedPatch?.targetChecksum || null});
          record.result = await operation;
          record.sessionChecksumAfter = coordinator.getSessionSnapshot()?.checksum || null;
          return record.result;
        } catch (error) {
          record.error = {code: error?.code || "", message: error?.message || String(error)};
          throw error;
        }
      },
      commitSession: coordinator.commitSession.bind(coordinator),
      invalidateSession(reason) {
        trace.invalidations.push({reason, session: coordinator.getSessionSnapshot()});
        return Reflect.apply(originalInvalidateSession, coordinator, [reason]);
      },
      getSessionSnapshot: coordinator.getSessionSnapshot.bind(coordinator)
    };
    renderer.completePreparedMapLoadAsync = async function(...args) {
      const record = {startedAt: performance.now()};
      trace.preparedLoads.push(record);
      try {
        return await Reflect.apply(originalPrepared, this, args);
      } finally {
        record.endedAt = performance.now();
        record.rendererLoad = this.lastLoad ? structuredClone(this.lastLoad) : null;
      }
    };
    renderer.loadMapAsync = async function(...args) {
      trace.legacyLoads += 1;
      return Reflect.apply(originalLegacy, this, args);
    };
    renderer.setPreparedPresentation = function(...args) {
      trace.preparedPresentations += 1;
      return Reflect.apply(originalPreparedPresentation, this, args);
    };
    renderer.setVisualTheme = function(...args) {
      trace.fullThemeUpdates += 1;
      return Reflect.apply(originalTheme, this, args);
    };
    renderer.setUnitPreferences = function(...args) {
      trace.fullUnitUpdates += 1;
      return Reflect.apply(originalUnits, this, args);
    };
    app.mapWorkerCoordinator = wrappedCoordinator;
    app.workerTaskCoordinator = wrappedCoordinator;
    app.renderTaskCoordinator = wrappedCoordinator;
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) trace.longTasks.push({startTime: entry.startTime, duration: entry.duration});
    });
    observer.observe({entryTypes: ["longtask"]});
    const feedbackNodes = ["generation-loading", "operation-loading", "map-toast", "file-operation-status"].map(id => document.getElementById(id)).filter(Boolean);
    const sampleFeedback = () => {
      for (const node of feedbackNodes) {
        const style = getComputedStyle(node);
        if (node.hidden || style.display === "none" || style.visibility === "hidden" || !node.getClientRects().length) continue;
        const text = node.textContent?.trim() || "";
        if (text) trace.visibleMessages.push(text);
      }
    };
    const mutations = new MutationObserver(sampleFeedback);
    mutations.observe(document.body, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["hidden", "class"]});
    window.__webglGeneratorHealth?.clear?.();
    try {
      const runOperation = async (label, task) => {
        await new Promise(done => setTimeout(done, 0));
        const record = {label, startedAt: performance.now()};
        trace.operations.push(record);
        try {
          return await task();
        } finally {
          record.endedAt = performance.now();
          record.preparedInstall = app.lastPreparedMapInstallProfile ? structuredClone(app.lastPreparedMapInstallProfile) : null;
          record.runtimeRefresh = app.lastRuntimeRefreshProfile ? structuredClone(app.lastRuntimeRefreshProfile) : null;
          await new Promise(done => setTimeout(done, 0));
        }
      };
      const waitForReplicaIdle = async owner => {
        for (let attempt = 0; attempt < 200; attempt += 1) {
          const snapshot = owner.getSessionSnapshot();
          if (!snapshot || snapshot.status === "idle") return snapshot;
          await new Promise(done => setTimeout(done, 10));
        }
        throw new Error("等待 Worker 地图副本 ACK 超时");
      };
      const city = app.map.settlements.cities.find(item => item && !item.removed);
      const before = {seed: app.map.metadata.seed, checksum: app.map.metadata.checksum, cityId: city.id ?? city.i, cityName: city.name};
      const exported = await runOperation("export", () => app.runtimeActions.data.exportCompressedAll({download: false, includeBlob: true, includeBase64: false}));
      const saved = await runOperation("save", () => app.runtimeActions.data.saveBrowserMap({toast: false}));
      const localRunStart = trace.runs.length;
      const localCanvasStartedAt = performance.now();
      const canvas = document.getElementById("map-canvas");
      const box = canvas.getBoundingClientRect();
      api.selection.select({kind: "city", id: before.cityId});
      canvas.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2, pointerId: 1, isPrimary: true}));
      canvas.dispatchEvent(new WheelEvent("wheel", {bubbles: true, cancelable: true, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2, deltaY: -120}));
      renderer.camera.offsetX += 0.04;
      renderer.camera.offsetY -= 0.03;
      renderer.requestViewportPreview({kind: "pan"});
      for (let attempt = 0; attempt < 500; attempt += 1) {
        if (!renderer.viewportPreviewFrame && !renderer.viewportCommitTimer && !renderer.viewportCommitEvent && !renderer.overlayInteractionSuspended) break;
        await new Promise(done => setTimeout(done, 10));
        if (attempt === 499) throw new Error("等待本地视图提交稳定超时");
      }
      await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
      const localCanvasRunDelta = trace.runs.length - localRunStart;
      const localCanvasEndedAt = performance.now();
      const renamed = `${before.cityName}·校验`;
      if (!api.edit.cities.rename(before.cityId, renamed)?.ok) throw new Error("城市改名失败");
      await waitForReplicaIdle(coordinator);
      if (!api.history.undo()?.ok) throw new Error("城市改名撤销失败");
      await waitForReplicaIdle(coordinator);
      if (!api.history.redo()?.ok) throw new Error("城市改名重做失败");
      await waitForReplicaIdle(coordinator);
      const patchedExport = await runOperation("patched-export", () => app.runtimeActions.data.exportCompressedAll({download: false, includeBlob: true, includeBase64: false}));
      const imported = await runOperation("import", () => app.runtimeActions.data.importMap(patchedExport.blob, {confirm: true, toast: false}));
      const importedCityName = app.map.settlements.cities.find(item => (item.id ?? item.i) === before.cityId)?.name || "";
      const restored = await runOperation("restore", () => app.runtimeActions.data.restoreBrowserMap({confirm: true, toast: false}));
      await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
      await new Promise(done => setTimeout(done, 100));
      for (const entry of observer.takeRecords()) trace.longTasks.push({startTime: entry.startTime, duration: entry.duration});
      sampleFeedback();
      const health = window.__webglGeneratorHealth?.getEvents?.(240) || [];
      return {
        before,
        after: {seed: app.map.metadata.seed, checksum: app.map.metadata.checksum, gridCells: app.map.grid.cells.i.length},
        export: {bytes: exported.compressedBytes, originalBytes: exported.originalBytes, hasBlob: exported.blob instanceof Blob},
        patchedExport: {bytes: patchedExport.compressedBytes, originalBytes: patchedExport.originalBytes, importedCityName},
        save: {backend: saved.storageBackend, encoding: saved.encoding, directBinary: saved.effects?.includes("browser-storage-binary-write") === true},
        localCanvasRunDelta,
        localCanvas: {startedAt: localCanvasStartedAt, endedAt: localCanvasEndedAt},
        importWorker: imported.timings?.worker || null,
        restoreWorker: restored.timings?.worker || null,
        history: app.editHistory.getStats(),
        loading: api.info.runtimeStats().data?.loading || {},
        session: coordinator.getSessionSnapshot(),
        trace,
        forbiddenMessages: [...new Set(trace.visibleMessages)].filter(text => new RegExp(forbiddenSource, "i").test(text)),
        nonPerformanceHealth: health.filter(event => event.severity === "error" && !performanceTypes.includes(event.type)),
        glError: renderer.getStats().draw?.glError ?? 0
      };
    } finally {
      mutations.disconnect();
      observer.disconnect();
      if (app.mapWorkerCoordinator === wrappedCoordinator) app.mapWorkerCoordinator = coordinator;
      if (app.workerTaskCoordinator === wrappedCoordinator) app.workerTaskCoordinator = coordinator;
      if (app.renderTaskCoordinator === wrappedCoordinator) app.renderTaskCoordinator = coordinator;
      if (renderer.completePreparedMapLoadAsync !== originalPrepared) renderer.completePreparedMapLoadAsync = originalPrepared;
      if (renderer.loadMapAsync !== originalLegacy) renderer.loadMapAsync = originalLegacy;
      if (renderer.setPreparedPresentation !== originalPreparedPresentation) renderer.setPreparedPresentation = originalPreparedPresentation;
      if (renderer.setVisualTheme !== originalTheme) renderer.setVisualTheme = originalTheme;
      if (renderer.setUnitPreferences !== originalUnits) renderer.setUnitPreferences = originalUnits;
    }
  }, {forbiddenSource: technicalCopy.source, performanceTypes});
  const targetConsole = consoleErrors.slice(consoleStart);
  const applicationConsole = targetConsole.filter(message => !performanceTypes.some(type => message.includes(`[FMG health] ${type}`)));
  console.log(JSON.stringify({ok: true, report, applicationConsole, pageErrors}, null, 2));
  assert.equal(report.trace.runs.length, 5, "五条存档入口没有各自执行一次正式任务");
  assert.deepEqual(report.trace.runs.map(run => [run.task, run.operation]), [["regeneration.compute", "archive-export"], ["regeneration.compute", "archive-export"], ["regeneration.compute", "archive-export"], ["map-file-io", "import"], ["map-file-io", "import"]]);
  assert.ok(report.trace.runs.every(run => run.mode === "worker" && run.accepted), "存档入口发生主线程降级");
  assert.ok(report.trace.runs.every(run => run.telemetry?.inputPackets > 0 && run.telemetry?.outputPackets > 0), "存档任务缺少流式遥测");
  assert.ok(report.trace.runs.slice(3).every(run => run.preparedLayers.length === 13), "导入没有准备完整 renderer 图层");
  assert.equal(report.trace.preparedLoads.length, 2);
  assert.equal(report.trace.legacyLoads, 0);
  assert.equal(report.trace.preparedPresentations, 2);
  assert.equal(report.trace.fullThemeUpdates, 0);
  assert.equal(report.trace.fullUnitUpdates, 0);
  assert.deepEqual(report.after.seed, report.before.seed);
  assert.deepEqual(report.after.checksum, report.before.checksum);
  const expectedCells = requestedCells === 100000 ? 99846 : 10004;
  assert.equal(report.after.gridCells, expectedCells);
  assert.ok(report.export.bytes > 0 && report.export.originalBytes > report.export.bytes && report.export.hasBlob);
  assert.equal(report.trace.runs[0].outputEncoding, "webfmg-v3");
  assert.equal(report.trace.runs[0].session?.reused, false);
  assert.match(report.trace.runs[0].sessionChecksum, /^s1:[0-9a-f]{16}$/u, "cold 存档必须以输入流 checksum 建立唯一地图会话");
  assert.equal(report.trace.runs[1].sessionChecksum, report.trace.runs[0].sessionChecksum, "warm 存档不得重算或漂移初始地图 checksum");
  assert.ok(report.trace.runs.slice(0, 3).every(run => run.telemetry.mainReplicaChecksumMs === 0 && run.telemetry.workerReplicaChecksumMs === 0), "存档链仍执行独立 canonical 深扫");
  assert.equal(report.trace.runs[1].session?.reused, true);
  assert.equal(report.trace.runs[2].session?.reused, true);
  assert.equal(report.trace.runs[1].session?.id, report.trace.runs[0].session?.id);
  assert.equal(report.trace.runs[2].session?.id, report.trace.runs[0].session?.id);
  assert.ok(report.trace.runs[0].telemetry.inputPackets > (requestedCells === 100000 ? 100 : 10));
  assert.ok(report.trace.runs.slice(1, 3).every(run => run.telemetry.inputPackets <= 3 && run.sessionPayloadOwnMap === false), "warm 存档仍重传完整地图");
  assert.equal(report.trace.patches.length, 3, "改名 / 撤销 / 重做没有各发布一个 patch");
  assert.ok(report.trace.patches.every((patch, index) => patch.result === true && patch.targetRevision === patch.baseRevision + 1 && (!index || patch.baseRevision === report.trace.patches[index - 1].targetRevision)), "revision patch 未连续 ACK");
  assert.equal(report.localCanvasRunDelta, 0, "平移 / 缩放 / 悬停 / 选择触发了 Worker 地图任务");
  assert.equal(report.patchedExport.importedCityName, `${report.before.cityName}·校验`, "patched Worker 副本没有写入 v3 存档");
  assert.equal(report.after.seed, report.before.seed);
  assert.equal(report.save.backend, "indexedDB");
  assert.equal(report.save.encoding, "gzip");
  assert.equal(report.save.directBinary, true);
  if (requestedCells === 100000) {
    assert.ok(report.export.originalBytes <= 16 * 1024 * 1024, `100k v3 raw 超限：${report.export.originalBytes}`);
    assert.ok(report.export.bytes <= 8 * 1024 * 1024, `100k v3 gzip 超限：${report.export.bytes}`);
  }
  assert.equal(report.history.undo, 0);
  assert.equal(report.loading.visible, false);
  assert.equal(report.session, null);
  const archiveOperationLongTasks = report.trace.longTasks.filter(entry => report.trace.operations.some(operation => entry.startTime >= operation.startedAt - 5 && entry.startTime < operation.endedAt));
  const loadOperations = ["import", "restore"].map(label => report.trace.operations.find(operation => operation.label === label));
  const patchedExportOperation = report.trace.operations.find(operation => operation.label === "patched-export");
  const registeredLoadLongTasks = requestedCells === 100000
    ? loadOperations.map((operation, index) => archiveOperationLongTasks.filter(entry => entry.duration <= 80
      && entry.startTime >= Number(operation?.preparedInstall?.endedAt || Infinity)
      && entry.startTime + entry.duration <= Number(report.trace.preparedLoads[index]?.endedAt || -Infinity)))
    : [[], []];
  const registeredWarmExportLongTasks = requestedCells === 100000
    ? archiveOperationLongTasks.filter(entry => entry.duration <= 80
      && entry.startTime >= Number(patchedExportOperation?.startedAt || Infinity)
      && entry.startTime < Number(patchedExportOperation?.endedAt || -Infinity))
    : [];
  const registeredArchiveLongTasks = [...new Set([...registeredLoadLongTasks.flat(), ...registeredWarmExportLongTasks])];
  const unexpectedArchiveLongTasks = archiveOperationLongTasks.filter(entry => !registeredArchiveLongTasks.includes(entry));
  assert.ok(registeredLoadLongTasks.every(entries => entries.length <= 1), "100k 导入 / 恢复 commit 单入口登记例外超过一次");
  assert.ok(registeredWarmExportLongTasks.length <= 2, "100k warm 导出登记例外超过两次");
  assert.deepEqual(unexpectedArchiveLongTasks, [], "保存 / 恢复操作出现未登记 LongTask");
  assert.deepEqual(report.forbiddenMessages, []);
  assert.deepEqual(report.nonPerformanceHealth, []);
  assert.equal(report.glError, 0);
  assert.deepEqual(applicationConsole, []);
  assert.deepEqual(pageErrors, []);
} finally {
  if (context) await Promise.race([context.close(), delay(5000)]);
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  server.kill();
  await Promise.race([new Promise(done => server.once("exit", done)), delay(5000)]);
}

async function waitForServer(child) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`静态服务提前退出：${child.exitCode}`);
    try { if ((await fetch(`http://${host}:${port}`)).ok) return; } catch {}
    await delay(50);
  }
  throw new Error("等待静态服务超时");
}

function delay(ms) { return new Promise(done => setTimeout(done, ms)); }

function readRequestedCells(args) {
  const value = Number(args.find(item => item.startsWith("--cells="))?.slice(8) || 10000);
  if (![10000, 100000].includes(value)) throw new Error("--cells 仅支持 10000 或 100000");
  return value;
}
