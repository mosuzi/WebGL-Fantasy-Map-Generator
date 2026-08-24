#!/usr/bin/env node
import assert from "node:assert/strict";
import {mkdir, writeFile} from "node:fs/promises";
import {spawn} from "node:child_process";
import {createRequire} from "node:module";
import {basename, dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const options = readOptions(process.argv.slice(2));
const source = join(root, "source", "Fantasy-Map-Generator");
const playwright = loadPlaywright([source, options.playwrightRoot]);
const server = spawn(process.execPath, [join(root, "tools", "serve-prototype.mjs"), "--host", options.host, "--port", String(options.port), "--dir", options.dist], {stdio: "ignore"});
const runReports = [];
const visualReports = [];
let browser;

try {
  await mkdir(options.artifactDir, {recursive: true});
  await waitForServer(server, options);
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  for (let index = 0; index < options.runs; index++) {
    const context = await browser.newContext({viewport: {width: 1280, height: 820}, deviceScaleFactor: 1});
    const page = await context.newPage();
    page.setDefaultTimeout(options.timeoutMs);
    const consoleErrors = [];
    const pageErrors = [];
    page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.goto(`http://${options.host}:${options.port}?healthClear=1`, {waitUntil: "domcontentloaded"});
    await waitForApiReady(page, options.timeoutMs);
    await prepareImportCapture(page);
    await attachFile(page, options.file);
    const report = await importAttachedFile(page);
    await page.screenshot({path: join(options.artifactDir, `run-${index + 1}-stable.png`), fullPage: false});
    report.consoleErrors = consoleErrors;
    report.pageErrors = pageErrors;
    assert.equal(report.response.ok, true, report.response.error?.message || "真实存档导入失败");
    assert.equal(report.rendererCurrent, true, "renderer 没有接纳正式地图对象");
    assert.equal(report.history.undo, 0, "导入后历史初态漂移");
    assert.equal(report.glError, 0, "真实存档导入产生 WebGL error");
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(applicationConsoleErrors(consoleErrors), []);
    assert.ok(report.draws.length >= 2, "没有捕获首个正式帧与稳定帧");
    assert.equal(report.draws[0].lineSignature, report.draws[1].lineSignature, "首帧与稳定帧的政治边界顶点发生变化");
    assert.equal(report.draws[0].pixelHash, report.draws[1].pixelHash, "首帧与稳定帧的 WebGL 像素发生变化");
    assert.ok(report.longTasks.every(item => item.duration <= 200), `出现超过 200ms 的产品 LongTask：${JSON.stringify(report.longTasks)}`);
    runReports.push(report);

    if (options.visual && index === options.runs - 1) {
      visualReports.push(...await verifyBoundaryStyles(page, options.artifactDir));
    }
    await context.close();
  }

  const totals = runReports.map(report => report.totalMs);
  const result = {
    ok: true,
    file: basename(options.file),
    filePath: options.file,
    dist: options.dist,
    runs: runReports,
    medianMs: median(totals),
    minMs: Math.min(...totals),
    maxMs: Math.max(...totals),
    visuals: visualReports
  };
  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (options.output) await writeFile(options.output, json, "utf8");
  process.stdout.write(json);
} finally {
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  server.kill();
  await Promise.race([new Promise(done => server.once("exit", done)), delay(5000)]);
}

async function prepareImportCapture(page) {
  await page.evaluate(async () => {
    const api = window.webglGeneratorApi;
    const app = window.__webglGeneratorApp;
    for (const layer of ["routes", "rivers", "cities", "population", "markers", "resources", "military", "warFronts", "zones", "zoneEvents", "zoneNatural", "zoneWilderness", "oceanCurrents"]) {
      const response = await api.layers.setVisible(layer, false);
      if (!response.ok) throw new Error(response.error?.message || `无法关闭 ${layer}`);
    }
    const upload = document.createElement("input");
    upload.id = "task-352-map-file";
    upload.type = "file";
    upload.hidden = true;
    document.body.append(upload);
    const renderer = app.renderer;
    const previousMap = app.map;
    const originalDraw = renderer.draw;
    const draws = [];
    const longTasks = [];
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) longTasks.push({startTime: entry.startTime, duration: entry.duration});
    });
    observer.observe({entryTypes: ["longtask"]});
    renderer.draw = function(drawOptions = {}) {
      const value = Reflect.apply(originalDraw, this, [drawOptions]);
      if (this.map !== previousMap && this.lineVertices?.length && draws.length < 2) {
        draws.push({
          updateOverlay: drawOptions.updateOverlay !== false,
          lineSignature: floatSignature(this.lineVertices),
          pixelHash: readCenterPixelHash(this.gl, this.canvas),
          drawSequence: this.lastDraw?.sequence || 0
        });
      }
      return value;
    };
    window.__task352ImportCapture = {draws, longTasks, observer, originalDraw};

    function floatSignature(values) {
      const view = new DataView(values.buffer, values.byteOffset, values.byteLength);
      let hash = 2166136261;
      const stride = Math.max(4, Math.floor(values.byteLength / 16384 / 4) * 4);
      for (let offset = 0; offset < values.byteLength; offset += stride) {
        hash ^= view.getUint32(offset, true);
        hash = Math.imul(hash, 16777619);
      }
      return `${values.length}:${(hash >>> 0).toString(16).padStart(8, "0")}`;
    }

    function readCenterPixelHash(gl, canvas) {
      const width = Math.min(256, canvas.width);
      const height = Math.min(256, canvas.height);
      const x = Math.max(0, Math.floor((canvas.width - width) / 2));
      const y = Math.max(0, Math.floor((canvas.height - height) / 2));
      const pixels = new Uint8Array(width * height * 4);
      gl.readPixels(x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let hash = 2166136261;
      for (let index = 0; index < pixels.length; index += 16) {
        hash ^= pixels[index];
        hash = Math.imul(hash, 16777619);
      }
      return `${width}x${height}:${(hash >>> 0).toString(16).padStart(8, "0")}`;
    }
  });
}

async function attachFile(page, file) {
  await page.locator("#task-352-map-file").setInputFiles(file);
}

async function importAttachedFile(page) {
  return page.evaluate(async () => {
    const app = window.__webglGeneratorApp;
    const api = window.webglGeneratorApi;
    const capture = window.__task352ImportCapture;
    window.__webglGeneratorHealth?.clear?.();
    const file = document.getElementById("task-352-map-file")?.files?.[0];
    if (!file) throw new Error("浏览器没有接收到真实存档文件");
    const startedAt = performance.now();
    const response = await api.data.importMap(file, {confirm: true, source: "ui", sourceFile: file, toast: false});
    const endedAt = performance.now();
    await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(done))));
    await new Promise(done => setTimeout(done, 120));
    for (const entry of capture.observer.takeRecords()) capture.longTasks.push({startTime: entry.startTime, duration: entry.duration});
    capture.observer.disconnect();
    app.renderer.draw = capture.originalDraw;
    return {
      response: {
        ok: response.ok,
        error: response.error || null,
        map: response.data?.map || null,
        operationMs: response.data?.operation?.durationMs ?? null
      },
      totalMs: Number((endedAt - startedAt).toFixed(1)),
      workerTask: response.data?.timings?.workerTask || null,
      worker: response.data?.timings?.worker || null,
      loadMap: summarizeProfile(response.data?.timings?.loadMap),
      preparedInstall: summarizeProfile(app.lastPreparedMapInstallProfile),
      runtimeRefresh: summarizeProfile(app.lastRuntimeRefreshProfile),
      checksum: app.map?.metadata?.checksum || null,
      counts: {
        gridCells: app.map?.grid?.points?.length || 0,
        states: app.map?.politics?.states?.filter(Boolean).length || 0,
        provinces: app.map?.politics?.provinces?.filter(Boolean).length || 0,
        cities: app.map?.settlements?.cities?.filter(Boolean).length || 0,
        routes: app.map?.pack?.routes?.filter(Boolean).length || 0
      },
      rendererCurrent: app.renderer.map === app.map,
      history: app.editHistory.getStats(),
      glError: app.renderer.getStats().draw?.glError ?? 0,
      viewOptions: {...app.renderer.viewOptions, visualTheme: app.renderer.viewOptions?.visualTheme?.id || ""},
      draws: capture.draws,
      longTasks: capture.longTasks.filter(item => item.startTime >= startedAt && item.startTime <= endedAt)
    };

    function summarizeProfile(profile) {
      if (!profile || typeof profile !== "object") return null;
      const startedAt = Number(profile.startedAt);
      const endedAt = Number(profile.endedAt);
      return {
        totalMs: Number.isFinite(Number(profile.totalMs))
          ? Number(profile.totalMs)
          : Number.isFinite(startedAt) && Number.isFinite(endedAt) ? Number((endedAt - startedAt).toFixed(1)) : null,
        slowest: profile.slowest ? {...profile.slowest} : null,
        stages: Array.isArray(profile.stages) ? profile.stages.length : 0
      };
    }
  });
}

async function verifyBoundaryStyles(page, artifactDir) {
  const reports = [];
  const checksum = await page.evaluate(() => window.__webglGeneratorApp.map.metadata.checksum);
  const province = await page.evaluate(() => window.webglGeneratorApi.layers.setVisible("provinceBorders", true));
  assert.equal(province.ok, true);
  for (const value of [0, 50, 100]) {
    const beforeSequence = await page.evaluate(() => window.__webglGeneratorApp.renderer.lastDraw.sequence || 0);
    await page.locator("#political-boundary-softness").evaluate((input, softness) => {
      input.value = String(softness);
      input.dispatchEvent(new Event("input", {bubbles: true}));
      input.dispatchEvent(new Event("change", {bubbles: true}));
    }, value);
    await page.waitForFunction(({softness, beforeSequence}) => {
      const renderer = window.__webglGeneratorApp?.renderer;
      return renderer?.viewOptions?.politicalBoundarySoftness === softness && Number(renderer?.lastDraw?.sequence) > beforeSequence;
    }, {softness: value, beforeSequence});
    await page.screenshot({path: join(artifactDir, `boundary-softness-${value}.png`), fullPage: false});
    const report = await page.evaluate(softness => {
      const app = window.__webglGeneratorApp;
      const vertices = app.renderer.lineVertices;
      let minAlpha = 1;
      let maxAlpha = 0;
      let hash = 2166136261;
      const view = new DataView(vertices.buffer, vertices.byteOffset, vertices.byteLength);
      for (let index = 0; index < vertices.length; index += 6) {
        minAlpha = Math.min(minAlpha, vertices[index + 5]);
        maxAlpha = Math.max(maxAlpha, vertices[index + 5]);
      }
      for (let offset = 0; offset < vertices.byteLength; offset += Math.max(4, Math.floor(vertices.byteLength / 16384 / 4) * 4)) {
        hash ^= view.getUint32(offset, true);
        hash = Math.imul(hash, 16777619);
      }
      return {
        softness,
        rendererSoftness: app.renderer.viewOptions.politicalBoundarySoftness,
        preferenceSoftness: window.__webglGeneratorStores.config.readPreferences().politicalBoundarySoftness,
        vertexCount: vertices.length / 6,
        minAlpha: Number(minAlpha.toFixed(4)),
        maxAlpha: Number(maxAlpha.toFixed(4)),
        signature: `${vertices.length}:${(hash >>> 0).toString(16).padStart(8, "0")}`,
        checksum: app.map.metadata.checksum,
        glError: app.renderer.getStats().draw?.glError ?? 0
      };
    }, value);
    assert.equal(report.rendererSoftness, value);
    assert.equal(report.preferenceSoftness, value);
    assert.equal(report.checksum, checksum, "边界样式改变了地图 checksum");
    assert.equal(report.glError, 0);
    reports.push(report);
  }
  assert.equal(new Set(reports.map(report => report.signature)).size, 3, "三档边界柔化没有生成不同政治边界 mesh");

  const roundtrip = await page.evaluate(async () => {
    const app = window.__webglGeneratorApp;
    const beforeChecksum = app.map.metadata.checksum;
    const exported = await app.runtimeActions.data.exportCompressedAll({download: false, includeBlob: true, includeBase64: false});
    const imported = await app.runtimeActions.data.importMap(exported.blob, {confirm: true, source: "ui", sourceFile: exported.blob, toast: false});
    return {
      imported: imported.map,
      beforeChecksum,
      afterChecksum: app.map.metadata.checksum,
      storedSoftness: app.map.display?.politicalBoundarySoftness,
      rendererSoftness: app.renderer.viewOptions.politicalBoundarySoftness,
      preferenceSoftness: window.__webglGeneratorStores.config.readPreferences().politicalBoundarySoftness,
      history: app.editHistory.getStats(),
      glError: app.renderer.getStats().draw?.glError ?? 0
    };
  });
  assert.equal(roundtrip.beforeChecksum, roundtrip.afterChecksum);
  assert.equal(roundtrip.storedSoftness, 100);
  assert.equal(roundtrip.rendererSoftness, 100);
  assert.equal(roundtrip.preferenceSoftness, 100);
  assert.equal(roundtrip.history.undo, 0);
  assert.equal(roundtrip.glError, 0);
  reports.push({roundtrip});
  return reports;
}

function applicationConsoleErrors(messages) {
  const performance = ["operation-stall", "main-thread-long-task", "render-frame-gap", "input-handler-stall"];
  return messages.filter(message => !performance.some(type => message.includes(`[FMG health] ${type}`)));
}

function readOptions(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index++) {
    const token = args[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) values.set(key, true);
    else {
      values.set(key, next);
      index++;
    }
  }
  const file = resolve(String(values.get("file") || ""));
  if (!values.get("file")) throw new Error("必须提供 --file <path>");
  const artifactDir = resolve(String(values.get("artifact-dir") || join(root, "docs", "local-logs", "task-352-map-unseal")));
  return {
    file,
    dist: resolve(String(values.get("dist") || join(root, "dist", "webgl-generator"))),
    host: String(values.get("host") || "127.0.0.1"),
    port: Number(values.get("port")) || 5572,
    runs: Math.max(1, Math.min(5, Number(values.get("runs")) || 1)),
    timeoutMs: Math.max(30_000, Number(values.get("timeout")) || 900_000),
    artifactDir,
    output: values.get("output") ? resolve(String(values.get("output"))) : "",
    playwrightRoot: values.get("playwright-root") ? resolve(String(values.get("playwright-root"))) : "",
    visual: values.get("visual") === true || values.get("visual") === "true"
  };
}

function loadPlaywright(roots) {
  const failures = [];
  for (const candidate of roots.filter(Boolean)) {
    try {
      return createRequire(join(candidate, "package.json"))("playwright");
    } catch (error) {
      failures.push(`${candidate}: ${error?.code || error?.message || error}`);
    }
  }
  throw new Error(`找不到 Playwright；可通过 --playwright-root 指向含 playwright 的 node_modules。${failures.length ? `\n${failures.join("\n")}` : ""}`);
}

async function waitForServer(child, config) {
  for (let attempt = 0; attempt < 160; attempt++) {
    if (child.exitCode !== null) throw new Error(`静态服务提前退出：${child.exitCode}`);
    try {
      const response = await fetch(`http://${config.host}:${config.port}`);
      if (response.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error("等待静态服务超时");
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(1));
}

function delay(ms) {
  return new Promise(resolvePromise => setTimeout(resolvePromise, ms));
}
