#!/usr/bin/env node
import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import {spawn} from "node:child_process";
import {createRequire} from "node:module";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const distDir = join(rootDir, "dist", "webgl-generator");
const cellsTarget = Number(process.argv.find(value => value.startsWith("--cells="))?.split("=")[1] || 10_000);
const diagnoseTopology = process.argv.includes("--diagnose-topology");
const diagnoseDomain = process.argv.includes("--diagnose-domain");
const diagnosePerformance = process.argv.includes("--diagnose-performance");
const expected = new Map([
  [10_000, {actual: 10_004, topology: {initial: [2670938683, 1140895987], states: [1730797020, 4254544681], provinces: [1730797020, 1466562821], undo: [1730797020, 4254544681], redo: [1730797020, 1466562821], "scoped-provinces": [1730797020, 1403560435]}}],
  [50_000, {actual: 50_142, topology: {initial: [3210466766, 1560097514], states: [368487075, 311697555], provinces: [368487075, 929352987]}}],
  [100_000, {actual: 99_846, topology: {initial: [2538270575, 2907504870], states: [3518234334, 2690100839], provinces: [3518234334, 1671331210]}}]
]).get(cellsTarget);
assert.ok(expected, "--cells 只允许 10000 / 50000 / 100000");
assert.ok(existsSync(distDir), `构建产物不存在：${distDir}`);
const host = "127.0.0.1";
const port = 5582;
const timeoutMs = 360_000;
const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const server = spawn(process.execPath, [join(rootDir, "tools", "serve-prototype.mjs"), "--host", host, "--port", String(port), "--dir", distDir], {stdio: "ignore"});
let browser;
let context;
try {
  await waitForServer(server);
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  context = await browser.newContext({viewport: {width: 1280, height: 820}, deviceScaleFactor: 1});
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(`http://${host}:${port}?healthClear=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, timeoutMs);
  const consoleStart = consoleErrors.length;
  const report = await page.evaluate(runBrowserCase, {cellsTarget, seed: `task328-calibration-${cellsTarget}`, diagnoseTopology, diagnoseDomain, diagnosePerformance});
  if (diagnoseTopology || diagnoseDomain || diagnosePerformance) {
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = diagnoseTopology && (report.initial.stateFragments || report.initial.provinceFragments) ? 1 : 0;
  } else {
  const performanceTypes = ["operation-stall", "main-thread-long-task", "render-frame-gap", "input-handler-stall"];
  const applicationConsoleErrors = consoleErrors.slice(consoleStart).filter(message => !performanceTypes.some(type => message.includes(`[FMG health] ${type}`)));
  assert.equal(report.requestedCells, cellsTarget);
  assert.equal(report.cells, expected.actual);
  assert.ok(report.initial.strong > 0);
  assert.ok(report.initial.checksum > 0);
  assert.equal(report.initial.stateFragments, 0);
  assert.equal(report.initial.provinceFragments, 0);
  assert.equal(report.initial.unassigned, 0);
  assert.deepEqual([report.initial.stateChecksum, report.initial.provinceChecksum], expected.topology.initial, "初始政治 topology checksum 漂移");
  if (report.fallbackCompatibility) {
    assert.equal(report.fallbackCompatibility.operation.longTasks.length <= 1, true, "fallback-provinces LongTask 数量超过登记上限");
    assert.equal(report.fallbackCompatibility.operation.longTasks.every(task => task.name === "self" && task.duration <= 80), true, "fallback-provinces LongTask 时长或来源超过登记上限");
    assert.equal(report.fallbackCompatibility.operation.invariants.valid, true, "小图 fallback 河流、道路、GPU 或 picking 不同源");
    assert.equal(report.fallbackCompatibility.operation.topology.stateFragments, 0);
    assert.equal(report.fallbackCompatibility.operation.topology.provinceFragments, 0);
  }
  for (const operation of report.operations) {
    const registeredHundredThousandStates = cellsTarget === 100_000 && operation.label === "states";
    if (registeredHundredThousandStates) {
      assert.equal(operation.longTasks.length <= 1, true, "100k states LongTask 数量超过登记上限");
      assert.equal(operation.longTasks.every(task => task.name === "self" && task.duration <= 80), true, "100k states LongTask 时长或来源超过登记上限");
    } else {
      assert.deepEqual(operation.longTasks, [], `${operation.label} 捕获主线程 LongTask`);
    }
    assert.equal(operation.invariants.valid, true, `${operation.label} 改写河流、道路、GPU 或 picking：${JSON.stringify(operation.invariants)}`);
    if (operation.topology) {
      assert.deepEqual([operation.topology.stateChecksum, operation.topology.provinceChecksum], expected.topology[operation.label], `${operation.label} 政治 topology checksum 漂移`);
      assert.equal(operation.topology.stateFragments, 0, `${operation.label} 国家断裂`);
      assert.equal(operation.topology.provinceFragments, 0, `${operation.label} 省份断裂`);
      assert.equal(operation.topology.unassigned, 0, `${operation.label} 存在未分配省份 cell`);
      assert.equal(operation.topology.centerMismatches, 0, `${operation.label} 行政中心不在归属内`);
    }
  }
  assert.equal(report.detailsChecksums.every(checksum => checksum === report.initial.checksum), true);
  assert.equal(report.loadingVisible, 0);
  assert.equal(report.glError, 0);
  assert.deepEqual(report.healthErrors, []);
  assert.deepEqual(applicationConsoleErrors, []);
  assert.deepEqual(pageErrors, []);
    console.log(JSON.stringify({ok: true, ...report, applicationConsoleErrors, pageErrors}, null, 2));
  }
} finally {
  if (context) await Promise.race([context.close(), delay(5_000)]);
  if (browser) await Promise.race([browser.close(), delay(5_000)]);
  server.kill();
  await Promise.race([new Promise(done => server.once("exit", done)), delay(5_000)]);
}
async function runBrowserCase({cellsTarget, seed, diagnoseTopology, diagnoseDomain, diagnosePerformance}) {
  const api = window.webglGeneratorApi;
  const app = window.__webglGeneratorApp;
  const longTasks = [];
  const observer = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(entry => ({startTime: entry.startTime, duration: entry.duration, name: entry.name}))));
  observer.observe({entryTypes: ["longtask"]});
  const operations = [];
  const detailsChecksums = [];
  const expectedPerformanceTypes = new Set(["operation-stall", "main-thread-long-task", "render-frame-gap", "input-handler-stall"]);
  try {
    let fallbackCompatibility = null;
    if (cellsTarget === 10_000 && !diagnoseTopology) {
      unwrap(await api.generate.newMap({confirm: true, seed: "task328-fallback-100", cellsTarget: 100, heightmapTemplate: "continents", statesNumber: 2, provincesRatio: 50, culturesNumber: 2}), "fallback newMap");
      app.editHistory.clear();
      await settle();
      longTasks.length = 0;
      const fallbackState = activeStates().find(state => activeProvinces().some(province => Number(province.state) === Number(state.i)));
      check(fallbackState, "fallback 夹具缺少可重分省国家");
      const fallback = await runFallback(fallbackState.i);
      assertSuccess(fallback.response, "fallback provinces");
      assertWorker(fallback.response, "fallback");
      const fallbackChecksum = assertDiagnostics(fallback.response, "fallback provinces", {requireStrong: false});
      fallback.operation.topology = assertTopology();
      fallbackCompatibility = {checksum: fallbackChecksum, operation: fallback.operation};
      operations.length = 0;
    }
    unwrap(await api.generate.newMap({confirm: true, seed, cellsTarget, heightmapTemplate: "continents"}), "newMap");
    app.editHistory.clear();
    await settle();
    longTasks.length = 0;
    window.__webglGeneratorHealth.clear();
    const initial = {...assertTopology(), ...assertCompactDiagnostics()};
    if (diagnoseTopology) return {requestedCells: app.map.options.cellsTarget, cells: app.map.grid.points.length, options: structuredClone(app.map.options), initial};
    const performanceBefore = diagnosePerformance ? app.renderer.getPerformanceEvents({includeRecent: true}) : null;
    const states = await operation("states", () => api.generate.regenerate("states", {confirm: true}));
    assertSuccess(states, "states");
    assertWorker(states, "worker");
    detailsChecksums.push(assertDiagnostics(states, "states"));
    operations.at(-1).topology = assertTopology();
    if (diagnoseDomain) return {requestedCells: app.map.options.cellsTarget, cells: app.map.grid.points.length, initial, operations};
    if (diagnosePerformance) {
      const performanceAfter = app.renderer.getPerformanceEvents({includeRecent: true});
      const telemetry = structuredClone(states.data.worker?.telemetry || {});
      const renderInstallStages = telemetry.renderInstallStages || {};
      delete telemetry.renderInstallStages;
      const stageEntries = Object.entries(renderInstallStages).map(([stage, value]) => ({
        stage,
        count: value.count,
        firstMs: value.firstMs,
        lastMs: value.lastMs,
        spanMs: Math.round((Number(value.lastMs) - Number(value.firstMs)) * 1000) / 1000,
        completed: value.completed,
        total: value.total
      }));
      return {
        requestedCells: app.map.options.cellsTarget,
        cells: app.map.grid.points.length,
        initial,
        operations,
        worker: {
          mode: states.data.worker?.mode,
          accepted: states.data.worker?.accepted,
          session: structuredClone(states.data.worker?.session || null),
          telemetry,
          renderInstallStageCount: stageEntries.length,
          slowRenderInstallStages: stageEntries.sort((left, right) => right.spanMs - left.spanMs).slice(0, 24)
        },
        rendererPerformance: Object.fromEntries(Object.entries(performanceAfter).flatMap(([name, after]) => {
          const before = performanceBefore?.[name];
          if (after.sequence === before?.sequence) return [];
          const recent = (after.recent || []).filter(event => Number(event.sequence) > Number(before?.sequence || 0));
          return [[name, {
            beforeSequence: before?.sequence || 0,
            afterSequence: after.sequence,
            completedDelta: Number(after.completed || 0) - Number(before?.completed || 0),
            last: after.last,
            recent
          }]];
        }))
      };
    }
    const beforeProvinces = politicsDigest();
    const provinces = await operation("provinces", () => api.generate.regenerate("provinces", {confirm: true}));
    assertSuccess(provinces, "provinces");
    assertWorker(provinces, "worker");
    detailsChecksums.push(assertDiagnostics(provinces, "provinces"));
    const afterProvinces = politicsDigest();
    operations.at(-1).topology = assertTopology();
    if (cellsTarget === 10_000) {
      const undo = await operation("undo", () => api.history.undo());
      unwrap(undo, "undo");
      check(politicsDigest() === beforeProvinces, "撤销没有恢复省份生成前政治域");
      operations.at(-1).topology = assertTopology();
      const redo = await operation("redo", () => api.history.redo());
      unwrap(redo, "redo");
      check(politicsDigest() === afterProvinces, "重做没有恢复省份生成后政治域");
      operations.at(-1).topology = assertTopology();

      const targetState = activeStates().find(state => activeProvinces().filter(province => Number(province.state) === Number(state.i)).length >= 2);
      check(targetState, "固定 10k 图缺少可局部重分省国家");
      const outside = JSON.stringify(activeProvinces().filter(province => Number(province.state) !== Number(targetState.i)));
      const scoped = await operation("scoped-provinces", () => api.generate.regenerate("provinces", {confirm: true, scope: "state", stateId: targetState.i}));
      assertSuccess(scoped, "scoped provinces");
      assertWorker(scoped, "worker");
      detailsChecksums.push(assertDiagnostics(scoped, "scoped provinces"));
      check(JSON.stringify(activeProvinces().filter(province => Number(province.state) !== Number(targetState.i))) === outside, "局部重分省改写范围外省份");
      operations.at(-1).topology = assertTopology();

      const cancellation = await runCancellation();
      operations.push(cancellation.operation);
      check(cancellation.response?.ok === false && cancellation.response?.error?.code === "operation_cancelled", "accepted 后取消语义错误");
      check(cancellation.hit === 1 && cancellation.cancelled && cancellation.accepted, "未在 accepted 后首个正式进度取消");
      check(cancellation.before === transactionDigest(), "取消后政治域、历史或 revision 漂移");
      const fault = await runFault();
      operations.push(fault.operation);
      check(fault.response?.ok === false && fault.response?.error?.code === "worker_regeneration_refresh_fault", "after-render 故障语义错误");
      check(fault.before === transactionDigest(), "故障后政治域、历史或 revision 未回滚");
    }
    await settle();
    const health = window.__webglGeneratorHealth.getEvents(500);
    return {
      cells: app.map.grid.points.length,
      requestedCells: app.map.options.cellsTarget,
      initial,
      operations,
      fallbackCompatibility,
      detailsChecksums,
      final: assertTopology(),
      compact: structuredClone(app.map.politics.metadata.riverBoundaries),
      loadingVisible: Number(Boolean(document.getElementById("generation-loading") && !document.getElementById("generation-loading").hidden))
        + Number(Boolean(document.getElementById("operation-loading") && !document.getElementById("operation-loading").hidden)),
      glError: app.renderer.getStats().draw.glError,
      healthErrors: health.filter(event => event.severity === "error" && !expectedPerformanceTypes.has(event.type))
    };
  } finally {
    observer.disconnect();
    delete window.__webglGeneratorWorkerRefreshFault;
  }

  async function operation(label, action) {
    await settle();
    longTasks.length = 0;
    const domainBefore = captureDomain();
    const startedAt = performance.now();
    const response = await action();
    await settle();
    longTasks.push(...observer.takeRecords().map(entry => ({startTime: entry.startTime, duration: entry.duration, name: entry.name})));
    const endedAt = performance.now();
    const entry = {
      label,
      longTasks: longTasks.filter(task => task.startTime >= startedAt && task.startTime < endedAt),
      invariants: assertDomain(domainBefore)
    };
    operations.push(entry);
    return response;
  }

  async function runFallback(stateId) {
    const original = app.workerTaskCoordinator;
    let hit = 0;
    const wrapped = coordinatorWrapper(original, (task, payload, options) => {
      const shouldFallback = hit === 0 && task === "regeneration.compute" && payload?.kind === "provinces";
      if (shouldFallback) hit++;
      return {...options, forceFallback: shouldFallback || options.forceFallback};
    });
    app.workerTaskCoordinator = wrapped;
    try {
      const response = await operation("fallback-provinces", () => api.generate.regenerate("provinces", {confirm: true, scope: "state", stateId}));
      check(hit === 1, "fallback 没有命中唯一 provinces Worker 调用");
      return {response, operation: operations.pop()};
    } finally {
      if (app.workerTaskCoordinator === wrapped) app.workerTaskCoordinator = original;
    }
  }

  async function runCancellation() {
    const before = transactionDigest();
    const original = app.workerTaskCoordinator;
    let hit = 0;
    let cancelled = false;
    let accepted = false;
    const wrapped = coordinatorWrapper(original, (task, payload, options) => ({
      ...options,
      onProgress(stage, detail, context) {
        const name = String(stage || "");
        const preAccepted = name === "input-stream" || name.startsWith("input-stream-") || name === "worker-accept";
        if (!preAccepted && hit === 0) {
          hit = 1;
          accepted = context?.fallback !== true && String(context?.task || "") === "regeneration.compute";
          cancelled = app.runtimeOperation.cancelCurrent("task328 accepted cancellation") === true;
        }
        return options.onProgress?.(stage, detail, context);
      }
    }));
    app.workerTaskCoordinator = wrapped;
    try {
      const response = await operation("cancel-states", () => api.generate.regenerate("states", {confirm: true}));
      return {before, response, hit, cancelled, accepted, operation: operations.pop()};
    } finally {
      if (app.workerTaskCoordinator === wrapped) app.workerTaskCoordinator = original;
    }
  }

  async function runFault() {
    const before = transactionDigest();
    window.__webglGeneratorWorkerRefreshFault = {kind: "provinces", stage: "after-render", mode: "once", hits: 0};
    try {
      const response = await operation("fault-provinces", () => api.generate.regenerate("provinces", {confirm: true}));
      return {before, response, operation: operations.pop()};
    } finally {
      delete window.__webglGeneratorWorkerRefreshFault;
    }
  }

  function coordinatorWrapper(original, transform) {
    return Object.freeze({
      run(task, payload, options = {}) { return Reflect.apply(original.run, original, [task, payload, transform(task, payload, options)]); },
      commitSession: original.commitSession.bind(original),
      invalidateSession: original.invalidateSession.bind(original),
      getSessionSnapshot: original.getSessionSnapshot.bind(original)
    });
  }

  function assertSuccess(response, label) {
    unwrap(response, label);
    check(response.data.executed !== false, `${label} 没有执行`);
  }

  function assertWorker(response, mode) {
    check(response.data.worker?.mode === mode, `Worker 模式应为 ${mode}`);
    if (mode === "worker") check(response.data.worker.accepted === true && response.data.worker.session?.committed === true, "Worker 未 accepted/commit");
  }

  function assertDiagnostics(response, label, {requireStrong = true} = {}) {
    const details = response.data.details?.riverBoundaries;
    check(details?.model?.candidates > 0 && (!requireStrong || details.model.strong > 0), `${label} 缺少河流候选`);
    check(details.model.rivers?.length === details.model.candidates, `${label} 逐河诊断数量不符`);
    check(details.model.rivers.every(river => Number.isFinite(river.strength) && river.components && Number.isFinite(river.order)), `${label} 河流评分不完整`);
    for (const level of ["states", "provinces"]) {
      check(Array.isArray(details[level]?.rivers), `${label} 缺少 ${level} 逐河采用诊断`);
      check(Number.isFinite(details[level].adoptionRate) && details[level].adoptionRate >= 0 && details[level].adoptionRate <= 1, `${label} ${level} 采用率无效`);
      check(details[level].rivers.every(river => Number.isFinite(river.boundaryLength) && Number.isFinite(river.sameOwnerCrossings) && typeof river.adoptionReason === "string"), `${label} ${level} 边界诊断不完整`);
    }
    check(!Object.hasOwn(app.map.politics.metadata.riverBoundaries, "rivers"), "政治 metadata 持有逐河大数组");
    return details.model.checksum;
  }

  function assertCompactDiagnostics() {
    const value = app.map.politics.metadata.riverBoundaries;
    check(value?.candidates > 0 && value.strong > 0 && !Object.hasOwn(value, "rivers"), "新图河界紧凑诊断无效");
    return {strong: value.strong, checksum: value.checksum};
  }

  function assertTopology() {
    const cells = app.map.pack.cells;
    const inspect = (records, key) => {
      const byOwnerFeature = new Map();
      let centerMismatches = 0;
      for (const record of records || []) if (record?.i && !record.removed && Number(cells[key]?.[record.center]) !== Number(record.i)) centerMismatches++;
      for (const cell of cells.i) {
        const owner = Number(cells[key]?.[cell]) || 0;
        if (cells.h[cell] < 20 || !records?.[owner] || records[owner].removed) continue;
        const mapKey = `${owner}:${Number(cells.f?.[cell]) || 0}`;
        const list = byOwnerFeature.get(mapKey) || [];
        list.push(cell);
        byOwnerFeature.set(mapKey, list);
      }
      let fragments = 0;
      let singletons = 0;
      const fragmentDetails = [];
      for (const owned of byOwnerFeature.values()) {
        if (owned.length === 1) singletons++;
        const allowed = new Set(owned);
        const visited = new Set([owned[0]]);
        const queue = [owned[0]];
        while (queue.length) for (const neighbor of cells.c[queue.pop()] || []) if (allowed.has(neighbor) && !visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
        if (visited.size !== owned.length) {
          fragments++;
          const [owner, feature] = [...byOwnerFeature].find(([, cells]) => cells === owned)?.[0].split(":").map(Number) || [0, 0];
          const sizes = [];
          const remaining = new Set(owned);
          while (remaining.size) {
            const first = remaining.values().next().value;
            const component = new Set([first]);
            const pending = [first];
            remaining.delete(first);
            while (pending.length) for (const neighbor of cells.c[pending.pop()] || []) if (remaining.has(neighbor)) {
              remaining.delete(neighbor);
              component.add(neighbor);
              pending.push(neighbor);
            }
            sizes.push(component.size);
          }
          fragmentDetails.push({owner, feature, center: Number(records[owner]?.center), sizes: sizes.sort((a, b) => b - a)});
        }
      }
      return {fragments, singletons, centerMismatches, fragmentDetails};
    };
    const states = inspect(app.map.pack.states, "state");
    const provinces = inspect(app.map.pack.provinces, "province");
    let unassigned = 0;
    for (const cell of cells.i) {
      const state = app.map.pack.states?.[cells.state?.[cell]];
      if (cells.h[cell] >= 20 && state?.provinces?.length && !cells.province?.[cell]) unassigned++;
    }
    return {
      stateFragments: states.fragments,
      provinceFragments: provinces.fragments,
      stateFragmentDetails: states.fragmentDetails,
      provinceFragmentDetails: provinces.fragmentDetails,
      stateSingletons: states.singletons,
      provinceSingletons: provinces.singletons,
      centerMismatches: states.centerMismatches + provinces.centerMismatches,
      unassigned,
      stateChecksum: typedChecksum(cells.state),
      provinceChecksum: typedChecksum(cells.province)
    };
  }

  function captureDomain() {
    const renderer = app.renderer;
    return {
      rivers: app.map.rivers,
      riverJson: JSON.stringify(app.map.rivers),
      riverBuffer: renderer.riverBuffer,
      routeBuffer: renderer.routeBuffer,
      riverBytes: bufferBytes(renderer.riverBuffer),
      riverSegments: renderer.objectPickingIndex.riverSegmentCount
    };
  }

  function assertDomain(before) {
    const renderer = app.renderer;
    const expectedRouteSegments = (app.map.settlements.routes || []).reduce((total, route) => total + Math.max(0, (route?.points?.length || 0) - 1), 0);
    const routeBufferCanonical = bufferBytes(renderer.routeBuffer) === renderer.routeVertexCount * 6 * 4;
    const detachedOldRoute = renderer.routeBuffer === before.routeBuffer || !renderer.gl.isBuffer(before.routeBuffer);
    const checks = {
      riverRef: app.map.rivers === before.rivers,
      riverData: JSON.stringify(app.map.rivers) === before.riverJson,
      riverBufferRef: renderer.riverBuffer === before.riverBuffer,
      riverBufferValid: renderer.gl.isBuffer(renderer.riverBuffer),
      routeBufferValid: renderer.gl.isBuffer(renderer.routeBuffer),
      riverBufferBytes: bufferBytes(renderer.riverBuffer) === before.riverBytes,
      riverPicking: renderer.objectPickingIndex.riverSegmentCount === before.riverSegments,
      routePicking: renderer.objectPickingIndex.routeSegmentCount === expectedRouteSegments,
      rendererMap: renderer.map === app.map,
      routeBufferCanonical,
      detachedOldRoute
    };
    return {valid: Object.values(checks).every(Boolean), ...checks};
  }

  function bufferBytes(buffer) {
    const {gl} = app.renderer;
    const previous = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const bytes = Number(gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE)) || 0;
    gl.bindBuffer(gl.ARRAY_BUFFER, previous);
    return bytes;
  }

  function politicsDigest() {
    return JSON.stringify({
      politics: app.map.politics,
      state: [...app.map.pack.cells.state],
      province: [...app.map.pack.cells.province],
      routes: app.map.settlements.routes
    });
  }

  function transactionDigest() {
    return JSON.stringify({politics: politicsDigest(), revision: app.mapRevision.getSnapshot(), history: app.editHistory.getStats()});
  }

  function activeStates() { return (app.map.politics.states || []).filter(item => item?.i && !item.removed); }
  function activeProvinces() { return (app.map.politics.provinces || []).filter(item => item?.i && !item.removed); }
  function typedChecksum(values) {
    let hash = 2166136261;
    for (const value of values || []) hash = Math.imul(hash ^ Number(value), 16777619) >>> 0;
    return hash;
  }
  function unwrap(response, label) {
    if (!response?.ok) throw new Error(`${label} 失败：${response?.error?.code || "unknown"} ${response?.error?.message || ""}`);
    return response.data;
  }
  function check(value, message) { if (!value) throw new Error(message); }
  async function settle() {
    await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
    await new Promise(done => setTimeout(done, 100));
  }
}

async function waitForServer(child) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`静态服务提前退出：${child.exitCode}`);
    try { if ((await fetch(`http://${host}:${port}`)).ok) return; } catch {}
    await delay(50);
  }
  throw new Error("等待静态服务超时");
}

function delay(ms) {
  return new Promise(done => setTimeout(done, ms));
}
