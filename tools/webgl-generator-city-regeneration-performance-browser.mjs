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
const artifactDir = join(rootDir, "work", "task347-city-regeneration-performance");
const cellsTarget = numberArgument("--cells", 10000);
const runs = numberArgument("--runs", 1);
const seed = stringArgument("--seed", `task347-cities-${cellsTarget}`);
const host = "127.0.0.1";
const port = 5547;
const timeoutMs = 600000;

assert.ok([10000, 100000].includes(cellsTarget), "--cells 仅支持 10000 或 100000");
assert.ok(Number.isInteger(runs) && runs >= 1 && runs <= 5, "--runs 必须为 1～5");
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
    window.__task347LongTasks = [];
    const append = entries => {
      for (const entry of entries) window.__task347LongTasks.push({startTime: entry.startTime, duration: entry.duration, name: entry.name});
    };
    const observer = new PerformanceObserver(list => append(list.getEntries()));
    observer.observe({entryTypes: ["longtask"]});
    window.__task347DrainLongTasks = async () => {
      await new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));
      append(observer.takeRecords());
      return window.__task347LongTasks.splice(0);
    };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => {
    if (message.type() === "error" && !/^\[FMG health\] (?:main-thread-long-task|operation-stall|render-frame-gap|input-handler-stall)\b/.test(message.text())) {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(`http://${host}:${port}?debug=1&healthClear=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, timeoutMs);

  const generated = await page.evaluate(async input => {
    const startedAt = performance.now();
    const response = await window.webglGeneratorApi.generate.newMap({
      confirm: true,
      seed: input.seed,
      cellsTarget: input.cellsTarget,
      heightmapTemplate: "continents"
    });
    return {response, wallMs: performance.now() - startedAt};
  }, {seed, cellsTarget});
  assert.equal(generated.response?.ok, true, generated.response?.error?.message || "创建基线地图失败");
  await page.evaluate(async () => {
    await new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));
    window.__webglGeneratorApp.editHistory.clear();
    window.__webglGeneratorHealth?.clear?.();
    window.__task347LongTasks.length = 0;
  });

  const samples = [];
  for (let index = 0; index < runs; index++) {
    const sample = await page.evaluate(async runIndex => {
      const app = window.__webglGeneratorApp;
      const api = window.webglGeneratorApi;
      const before = captureState(app);
      window.__task347LongTasks.length = 0;
      const startedAt = performance.now();
      const result = await app.runtimeActions.generate.regenerate("cities", {confirm: true});
      const response = {ok: true, data: result};
      const wallMs = performance.now() - startedAt;
      const after = captureState(app);
      const publishedProfile = JSON.parse(document.documentElement.dataset.regenerationPerformanceProfile || "null");
      const longTasks = await window.__task347DrainLongTasks();
      const undo = api.history.undo();
      const restored = captureState(app);
      return {runIndex, response, wallMs, before, after, publishedProfile, longTasks, undo, restored};

      function captureState(runtime) {
        const cities = (runtime.map.pack?.burgs || []).filter(city => city && !city.removed);
        const routes = runtime.map.routes?.routes || runtime.map.routes || [];
        return {
          cells: Number(runtime.map.grid?.cells?.i?.length) || 0,
          cities: cities.length,
          ports: cities.filter(city => Number(city.port) > 0).length,
          routes: Array.isArray(routes) ? routes.filter(Boolean).length : 0,
          marineCities: cities.filter(city => Number(runtime.map.pack?.cells?.h?.[city.cell]) < 20).length,
          fingerprint: fingerprint(cities),
          history: runtime.editHistory.getStats(),
          revision: runtime.mapRevision.getSnapshot()
        };
      }

      function fingerprint(cities) {
        let hash = 2166136261;
        for (const city of cities) {
          const value = `${city.i}|${city.cell}|${city.name}|${city.state}|${city.province}|${city.capital}|${city.port}`;
          for (let offset = 0; offset < value.length; offset++) hash = Math.imul(hash ^ value.charCodeAt(offset), 16777619) >>> 0;
        }
        return hash >>> 0;
      }
    }, index + 1);
    assert.equal(sample.response?.ok, true, sample.response?.error?.message || `第 ${index + 1} 次城镇重生成失败`);
    const result = sample.response.data;
    const telemetry = result.worker?.telemetry || {};
    const ledger = createLedger(sample.wallMs, result.operation?.durationMs, telemetry);
    assert.equal(result.details?.replacementMode, "from-empty", "城镇重生成没有保持 from-empty");
    assert.equal(Number(result.details?.marineCities), 0, "城镇重生成结果报告水域城市");
    assert.equal(sample.after.marineCities, 0, "正式地图仍存在水域城市");
    assert.equal(sample.publishedProfile?.kind, "cities", "debug 性能账本没有发布城镇类型");
    assert.equal(sample.publishedProfile?.replacementMode, "from-empty", "debug 性能账本没有发布完全重算合同");
    assert.equal(sample.publishedProfile?.marineCities, 0, "debug 性能账本报告水域城镇");
    assert.notEqual(sample.after.fingerprint, sample.before.fingerprint, "城镇完全重生成没有改变身份指纹");
    assert.equal(sample.undo?.ok, true, sample.undo?.error?.message || "撤销失败");
    assert.deepEqual(compactState(sample.restored), compactState(sample.before), "撤销没有恢复原始城镇 / 港口 / 道路 / 指纹");
    samples.push({...sample, response: summarizeResponse(result), ledger});
  }

  assert.deepEqual(consoleErrors, [], "浏览器出现应用 console error");
  assert.deepEqual(pageErrors, [], "浏览器出现 page error");
  const report = {
    generated: {cellsTarget, seed, wallMs: round(generated.wallMs)},
    samples,
    summary: summarizeSamples(samples),
    consoleErrors,
    pageErrors
  };
  mkdirSync(artifactDir, {recursive: true});
  const artifactPath = join(artifactDir, `${cellsTarget}.json`);
  writeFileSync(artifactPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ok: true, artifactPath, summary: report.summary}, null, 2));
} finally {
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  await new Promise(resolveClose => server.close(resolveClose));
}

function createLedger(wallMs, operationMs, telemetry) {
  const segments = {
    inputStreamMs: finite(telemetry.inputStreamMs),
    workerTaskMs: finite(telemetry.totalTaskMs),
    outputReceiveMs: finite(telemetry.outputReceiveMs),
    commitTotalMs: finite(telemetry.commitTotalMs)
  };
  const accountedMs = Object.values(segments).reduce((sum, value) => sum + value, 0);
  const operationWallMs = finite(operationMs) || finite(wallMs);
  const unattributedMs = Math.max(0, operationWallMs - accountedMs);
  return {
    wallMs: round(wallMs),
    operationMs: round(operationWallMs),
    segments,
    accountedMs: round(accountedMs),
    unattributedMs: round(unattributedMs),
    coverageRatio: round(accountedMs / Math.max(1, operationWallMs)),
    detail: {
      setupMs: finite(telemetry.setupMs),
      domainComputeMs: finite(telemetry.domainComputeMs),
      patchCaptureMs: finite(telemetry.patchCaptureMs),
      renderPrepareWorkerMs: finite(telemetry.renderPrepareWorkerMs),
      commitInstallMs: finite(telemetry.commitInstallMs),
      renderInstallPrepareMs: finite(telemetry.renderInstallPrepareMs),
      renderInstallCommitMs: finite(telemetry.renderInstallCommitMs),
      uiRefreshMs: finite(telemetry.uiRefreshMs),
      sessionCommitMs: finite(telemetry.sessionCommitMs),
      renderReplayTotalMs: finite(telemetry.renderReplayTotalMs)
    }
  };
}

function summarizeResponse(result) {
  return {
    executed: Boolean(result.executed),
    replacementMode: result.details?.replacementMode,
    marineCities: result.details?.marineCities,
    history: result.history,
    operation: result.operation,
    worker: {
      mode: result.worker?.mode,
      accepted: result.worker?.accepted,
      session: result.worker?.session,
      telemetry: result.worker?.telemetry
    }
  };
}

function compactState(state) {
  return {cells: state.cells, cities: state.cities, ports: state.ports, routes: state.routes, marineCities: state.marineCities, fingerprint: state.fingerprint};
}

function summarizeSamples(samples) {
  const walls = samples.map(sample => sample.ledger.wallMs).sort((left, right) => left - right);
  return {
    runs: samples.length,
    medianWallMs: walls[Math.floor(walls.length / 2)],
    maxWallMs: Math.max(...walls),
    minCoverageRatio: Math.min(...samples.map(sample => sample.ledger.coverageRatio)),
    maxUnattributedMs: Math.max(...samples.map(sample => sample.ledger.unattributedMs)),
    maxLongTaskMs: Math.max(0, ...samples.flatMap(sample => sample.longTasks.map(task => Number(task.duration) || 0)))
  };
}

async function startStaticServer() {
  const instance = createServer((request, response) => {
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
    instance.once("error", rejectListen);
    instance.listen(port, host, resolveListen);
  });
  return instance;
}

function numberArgument(name, fallback) {
  const value = process.argv.find(argument => argument.startsWith(`${name}=`))?.slice(name.length + 1);
  return value === undefined ? fallback : Number(value);
}

function stringArgument(name, fallback) {
  return process.argv.find(argument => argument.startsWith(`${name}=`))?.slice(name.length + 1) || fallback;
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function round(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
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
