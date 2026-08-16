import assert from "node:assert/strict";
import {createReadStream, existsSync, statSync} from "node:fs";
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
const kinds = ["features", "routes", "rivers", "cities", "states", "provinces", "markers", "diplomacy", "religions", "military", "zones"];
const dependencyOrder = ["features", "states", "provinces", "cities", "routes", "rivers", "markers", "diplomacy", "religions", "military", "zones"];
const loadingOnlyKind = String(process.argv.find(argument => argument.startsWith("--loading-kind="))?.split("=")[1] || "");
const loadingOnlyCells = Number(process.argv.find(argument => argument.startsWith("--cells="))?.split("=")[1] || 10000);
const rejectionSessionOnly = process.argv.includes("--rejection-session");
if (loadingOnlyKind) assert.ok(kinds.includes(loadingOnlyKind), `未知 Loading 诊断类型：${loadingOnlyKind}`);
if (loadingOnlyKind) assert.ok([10000, 100000].includes(loadingOnlyCells), `Loading 诊断不支持 ${loadingOnlyCells} cells`);

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

  const independent = {};
  const rejectionSession = rejectionSessionOnly
    ? await runRepairableRegenerationSessionGate(page, consoleErrors, pageErrors)
    : null;
  if (!rejectionSessionOnly) {
    for (const kind of loadingOnlyKind ? [loadingOnlyKind] : kinds) {
      await createFrozenBaseline(page, "worker-regeneration-browser-baseline", loadingOnlyKind ? loadingOnlyCells : 1000);
      await clearWindowSignals(page, consoleErrors, pageErrors);
      independent[kind] = await runFormalRegeneration(page, cdp, kind, consoleErrors, pageErrors, {undoRedo: true});
    }
    assert.ok(Object.values(independent).every(item => item.worker.session.reused === true), "新图 adoption 后的首次重生成没有复用 MapWorker");
  }

  const chain = [];
  if (!loadingOnlyKind && !rejectionSessionOnly) {
    await createFrozenBaseline(page, "worker-regeneration-browser-chain", 10000);
    await clearWindowSignals(page, consoleErrors, pageErrors);
    for (const kind of dependencyOrder) {
      chain.push(await runFormalRegeneration(page, cdp, kind, consoleErrors, pageErrors, {undoRedo: false}));
      await clearWindowSignals(page, consoleErrors, pageErrors);
    }
    assert.equal(chain[0].worker.session.reused, true, "连续链首项没有复用新图 adoption MapWorker");
    assert.ok(chain.every(item => item.worker.session.reused === true), "连续链存在未复用 MapWorker 的重生成");
    assert.ok(chain.every(item => item.worker.session.id === chain[0].worker.session.id), "连续链必须复用同一个 Worker session");
    assert.ok(chain.every(item => Number(item.telemetry.inputPackets) <= 4), "新图 adoption 后的重生成仍在传输完整地图");
  }

  console.log(JSON.stringify({ok: true, independent, chain, rejectionSession}, null, 2));
} finally {
  if (context) await Promise.race([context.close(), delay(5000)]);
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await new Promise(done => server.close(done));
}

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
    const undoRoundTrip = await page.evaluate(() => {
      const app = window.__webglGeneratorApp;
      const beforeGeometry = app.renderer.cellVisualCorrectionGeometry;
      const undo = window.webglGeneratorApi.history.undo();
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

async function runFormalRegeneration(page, cdp, kind, consoleErrors, pageErrors, {undoRedo}) {
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
  for (const field of ["inputPackets", "outputPackets", "computeMs", "commitInstallMs", "refreshMs"]) {
    assert.equal(Number.isFinite(Number(telemetry[field])), true, `${kind} 缺少 ${field} 遥测`);
  }
  assert.ok(Number(telemetry.inputPackets) > 0 && Number(telemetry.outputPackets) > 0, `${kind} 分块流包计数无效`);
  assert.ok(Number(telemetry.inputPostMaxMs) < 50, `${kind} 输入单包主线程发送超预算：${telemetry.inputPostMaxMs}`);
  assert.ok(Number(telemetry.outputDecodeMaxMs) < 50, `${kind} 结果单包主线程解码超预算：${telemetry.outputDecodeMaxMs}`);
  assert.ok(Number(telemetry.outputWorkerPostMaxMs) < 50, `${kind} 结果单包 Worker 发送超预算：${telemetry.outputWorkerPostMaxMs}`);

  const after = await page.evaluate(targetKind => {
    const app = window.__webglGeneratorApp;
    const health = window.__webglGeneratorHealth?.getEvents?.(180) || [];
    return {
      salt: Number(app.map.metadata?.regeneration?.[targetKind]) || 0,
      history: app.editHistory.getStats(),
      routes: targetKind === "rivers" ? JSON.stringify(app.map.settlements?.routes || []) : "",
      routeSalt: targetKind === "rivers" ? Number(app.map.metadata?.regeneration?.routes) || 0 : 0,
      longTasks: window.__task322LongTasks.slice(),
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
    const historyRoundTrip = await page.evaluate(async targetKind => {
      const api = window.webglGeneratorApi;
      const app = window.__webglGeneratorApp;
      const undo = api.history.undo();
      if (!undo?.ok) throw new Error(`undo失败：${undo?.error?.message || "unknown"}`);
      const undoSalt = Number(app.map.metadata?.regeneration?.[targetKind]) || 0;
      const redo = api.history.redo();
      if (!redo?.ok) throw new Error(`redo失败：${redo?.error?.message || "unknown"}`);
      return {undoSalt, redoSalt: Number(app.map.metadata?.regeneration?.[targetKind]) || 0};
    }, kind);
    assert.equal(historyRoundTrip.undoSalt, before.salt, `${kind} undo 未恢复 salt`);
    assert.equal(historyRoundTrip.redoSalt, after.salt, `${kind} redo 未恢复 salt`);
  }

  const metricsAfter = indexMetrics(await cdp.send("Performance.getMetrics"));
  return {
    kind,
    worker: {mode: result.worker.mode, accepted: result.worker.accepted, session: result.worker.session},
    telemetry,
    loadingTexts,
    longTasks: after.longTasks,
    taskDurationDeltaMs: roundMs((metricsAfter.TaskDuration - metricsBefore.TaskDuration) * 1000)
  };
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
