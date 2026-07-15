#!/usr/bin/env node
import {createReadStream, existsSync, mkdirSync, statSync, writeFileSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {dirname, extname, join, normalize, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const args = parseArgs(process.argv.slice(2));
const host = String(args.host || "127.0.0.1");
const port = Number(args.port || 5447);
const timeoutMs = Number(args.timeout || 180000);
const cells = Number(args.cells || 1000);
const seed = String(args.seed || "api-export-records-regression");
const template = String(args.template || "continents");
const browserChannel = args["browser-channel"] || args.channel || "chrome";
const distDir = resolve(args.dir || join(rootDir, "dist", "webgl-generator"));
const outPath = resolve(args.out || join(rootDir, "docs", "generated", "reports", "api-export-records-regression-results.json"));
const markdownPath = resolve(args.markdown || join(rootDir, "docs", "generated", "reports", "api-export-records-regression-results.md"));
const viewport = parseViewport(args.viewport || "1280x820");

if (!existsSync(distDir)) fail(`构建产物不存在：${distDir}`);
mkdirSync(dirname(outPath), {recursive: true});
mkdirSync(dirname(markdownPath), {recursive: true});

const playwright = await loadPlaywright(sourceDir);
const server = await startStaticServer({host, port, publicDir: distDir});
let browser = null;

try {
  browser = await launchBrowser(playwright, {headless: !args.headful, browserChannel});
  const context = await browser.newContext({viewport, deviceScaleFactor: 1, acceptDownloads: true});
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", error => pageErrors.push(error.message));

  const baseUrl = `http://${host}:${port}`;
  await page.goto(`${baseUrl}?healthClear=1`, {waitUntil: "domcontentloaded", timeout: timeoutMs});
  await waitForApiReady(page, timeoutMs);
  const result = await inspectRecordExports(page, {cells, seed, template});
  const healthErrors = await inspectHealthErrors(page);

  const report = {
    metadata: {
      generatedAt: new Date().toISOString(),
      url: baseUrl,
      distDir,
      seed,
      cells,
      template,
      viewport,
      browserChannel,
      consoleErrors,
      pageErrors
    },
    ...result,
    healthErrors,
    passed: result.passed && healthErrors.total === 0 && consoleErrors.length === 0 && pageErrors.length === 0
  };

  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(markdownPath, renderMarkdown(report), "utf8");
  console.log(JSON.stringify(buildConsoleSummary(report), null, 2));
  console.log(`Wrote ${outPath}`);
  console.log(`Wrote ${markdownPath}`);
  if (!report.passed) fail(renderFailureSummary(report));
} finally {
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await new Promise(resolveClose => server.close(resolveClose));
}

async function inspectRecordExports(page, {cells, seed, template}) {
  const core = await page.evaluate(async ({cells, seed, template}) => {
    const failures = [];
    const api = window.webglGeneratorApi;
    unwrap(await api.generate.newMap({confirm: true, seed, cellsTarget: cells, heightmapTemplate: template}), "generate.newMap");
    const before = unwrap(api.info.mapSummary(), "info.mapSummary.before");
    const fixture = createExportFixture();
    const noteResult = unwrap(api.edit.notes.set(fixture.noteObject, fixture.noteBody, {name: fixture.noteName}), "edit.notes.set");
    const measurementResult = unwrap(api.edit.measurements.save(fixture.measurementPoints, {name: fixture.measurementName}), "edit.measurements.save");
    const noteId = noteResult.result?.note?.id || noteResult.result?.id || `city:${fixture.noteObject.id}`;
    const measurementId = measurementResult.result?.measurement?.id || measurementResult.result?.id || firstMeasurementId();

    const notesAll = unwrap(api.data.exportNotes({download: false}), "data.exportNotes.all");
    const notesSelected = unwrap(api.data.exportNotes({ids: [noteId], download: false}), "data.exportNotes.selected");
    const notesSummaryOnly = unwrap(api.data.exportNotes({ids: [noteId], download: false, includeText: false}), "data.exportNotes.summaryOnly");
    const measurementsAll = unwrap(api.data.exportMeasurements({download: false}), "data.exportMeasurements.all");
    const measurementsSelected = unwrap(api.data.exportMeasurements({measurementIds: [measurementId], download: false}), "data.exportMeasurements.selected");
    const measurementsSummaryOnly = unwrap(api.data.exportMeasurements({measurementIds: [measurementId], download: false, includeText: false}), "data.exportMeasurements.summaryOnly");
    const after = unwrap(api.info.mapSummary(), "info.mapSummary.after");
    const history = unwrap(api.history.get(), "history.get");
    const stats = window.__webglGeneratorApp?.renderer?.getStats?.() || {};
    const glError = stats.draw?.glError || 0;

    const parsedNotesAll = parseJson(notesAll.text, "notesAll", failures);
    const parsedNotesSelected = parseJson(notesSelected.text, "notesSelected", failures);
    const parsedMeasurementsAll = parseJson(measurementsAll.text, "measurementsAll", failures);
    const parsedMeasurementsSelected = parseJson(measurementsSelected.text, "measurementsSelected", failures);
    const exportedNote = parsedNotesAll?.notes?.find(note => note.id === noteId);
    const selectedNote = parsedNotesSelected?.notes?.[0] || null;
    const exportedMeasurement = parsedMeasurementsAll?.measurements?.find(item => item.id === measurementId);
    const selectedMeasurement = parsedMeasurementsSelected?.measurements?.[0] || null;

    if (before.checksum !== after.checksum) failures.push(`导出前后 checksum 改变：${before.checksum} -> ${after.checksum}`);
    if (notesAll.metadata?.type !== "webgl-generator-notes-summary") failures.push(`notes metadata type 异常：${notesAll.metadata?.type}`);
    if (measurementsAll.metadata?.type !== "webgl-generator-measurements") failures.push(`measurements metadata type 异常：${measurementsAll.metadata?.type}`);
    if (notesAll.metadata?.checksum !== before.checksum) failures.push("notes metadata checksum 不匹配");
    if (measurementsAll.metadata?.checksum !== before.checksum) failures.push("measurements metadata checksum 不匹配");
    if (!notesAll.filename.endsWith(".notes.json")) failures.push(`notes filename 异常：${notesAll.filename}`);
    if (!notesSelected.filename.endsWith(".notes-selected.json")) failures.push(`selected notes filename 异常：${notesSelected.filename}`);
    if (!measurementsAll.filename.endsWith(".measurements.json")) failures.push(`measurements filename 异常：${measurementsAll.filename}`);
    if (!measurementsSelected.filename.endsWith(".measurements-selected.json")) failures.push(`selected measurements filename 异常：${measurementsSelected.filename}`);
    if (Object.prototype.hasOwnProperty.call(notesSummaryOnly, "text")) failures.push("notes includeText:false 仍返回 text");
    if (Object.prototype.hasOwnProperty.call(measurementsSummaryOnly, "text")) failures.push("measurements includeText:false 仍返回 text");
    if (!exportedNote) failures.push("notes 全量导出缺少新增备注");
    if (exportedNote?.body !== fixture.noteBody) failures.push("notes 全量导出备注正文不一致");
    if (selectedNote?.id !== noteId || parsedNotesSelected?.notes?.length !== 1) failures.push("notes 筛选导出未只返回目标备注");
    if (!exportedMeasurement) failures.push("measurements 全量导出缺少新增测量对象");
    if (exportedMeasurement?.pointCount !== fixture.measurementPoints.length) failures.push("measurements 点数不一致");
    if (!(exportedMeasurement?.distanceMapUnits > 0)) failures.push("measurements 距离应为正数");
    if (selectedMeasurement?.id !== measurementId || parsedMeasurementsSelected?.measurements?.length !== 1) failures.push("measurements 筛选导出未只返回目标测量对象");
    if (measurementsAll.metadata?.measurements < 1) failures.push("measurements metadata 计数异常");
    if (glError) failures.push(`WebGL error ${glError}`);

    return {
      fixture: {...fixture, noteId, measurementId},
      map: {
        checksum: before.checksum,
        gridCells: before.gridCells,
        packCells: before.packCells
      },
      exports: {
        notesAll: summarizeExport(notesAll, parsedNotesAll),
        notesSelected: summarizeExport(notesSelected, parsedNotesSelected),
        notesSummaryOnly: summarizeSummaryOnly(notesSummaryOnly),
        measurementsAll: summarizeExport(measurementsAll, parsedMeasurementsAll),
        measurementsSelected: summarizeExport(measurementsSelected, parsedMeasurementsSelected),
        measurementsSummaryOnly: summarizeSummaryOnly(measurementsSummaryOnly)
      },
      exportedNote,
      selectedNote,
      exportedMeasurement,
      selectedMeasurement,
      history: {undo: history.undo, redo: history.redo, lastAffected: history.lastAffected || []},
      glError,
      failures,
      passed: failures.length === 0
    };

    function createExportFixture() {
      const app = window.__webglGeneratorApp;
      const map = app.map;
      const city = (map.settlements?.burgs || []).find(item => item?.i && !item.removed) || {i: 1, name: "城市"};
      const width = Number(map.metadata?.graphWidth) || 1440;
      const height = Number(map.metadata?.graphHeight) || 960;
      return {
        noteObject: {kind: "city", id: city.i},
        noteName: city.name || `城市 ${city.i}`,
        noteBody: "API 导出回归备注：这里有码头和粮仓。",
        measurementName: "API 导出回归测量线",
        measurementPoints: [
          {x: round(width * 0.28), y: round(height * 0.32)},
          {x: round(width * 0.42), y: round(height * 0.38)},
          {x: round(width * 0.56), y: round(height * 0.44)}
        ]
      };
    }

    function firstMeasurementId() {
      return window.__webglGeneratorApp?.map?.measurements?.items?.[0]?.id || "";
    }

    function parseJson(text, label, output) {
      try {
        return JSON.parse(text);
      } catch (error) {
        output.push(`${label} 不是合法 JSON：${error.message}`);
        return null;
      }
    }

    function summarizeExport(result, parsed) {
      return {
        filename: result.filename,
        bytes: result.bytes,
        metadata: result.metadata,
        hasText: typeof result.text === "string",
        type: parsed?.type || "",
        itemCount: parsed?.notes?.length ?? parsed?.measurements?.length ?? 0
      };
    }

    function summarizeSummaryOnly(result) {
      return {
        filename: result.filename,
        bytes: result.bytes,
        metadata: result.metadata,
        hasText: Object.prototype.hasOwnProperty.call(result, "text")
      };
    }

    function unwrap(result, label) {
      if (!result?.ok) throw new Error(`${label} 调用失败：${result?.error?.message || "未知错误"}`);
      return result.data;
    }

    function round(value) {
      return Math.round(Number(value || 0) * 1000) / 1000;
    }
  }, {cells, seed, template});

  const downloads = await inspectDownloads(page, core.fixture);
  const failures = [...core.failures, ...downloads.failures];
  return {
    ...core,
    downloads,
    failures,
    passed: failures.length === 0
  };
}

async function inspectDownloads(page, fixture) {
  const downloads = [];
  const failures = [];
  const notesDownload = await waitForApiDownload(page, () => window.webglGeneratorApi.data.exportNotes({ids: [window.__apiExportFixture.noteId], download: true, includeText: false}), fixture);
  const measurementsDownload = await waitForApiDownload(page, () => window.webglGeneratorApi.data.exportMeasurements({measurementIds: [window.__apiExportFixture.measurementId], download: true, includeText: false}), fixture);
  downloads.push(notesDownload, measurementsDownload);
  if (!notesDownload.suggestedFilename.endsWith(".notes-selected.json")) failures.push(`notes 下载文件名异常：${notesDownload.suggestedFilename}`);
  if (!measurementsDownload.suggestedFilename.endsWith(".measurements-selected.json")) failures.push(`measurements 下载文件名异常：${measurementsDownload.suggestedFilename}`);
  if (notesDownload.resultHasText) failures.push("notes 下载 includeText:false 返回了 text");
  if (measurementsDownload.resultHasText) failures.push("measurements 下载 includeText:false 返回了 text");
  return {items: downloads, failures, passed: failures.length === 0};
}

async function waitForApiDownload(page, browserFunction, fixture) {
  await page.evaluate(fixtureData => {
    window.__apiExportFixture = fixtureData;
  }, fixture);
  const [download, apiResult] = await Promise.all([
    page.waitForEvent("download", {timeout: timeoutMs}),
    page.evaluate(browserFunction)
  ]);
  const data = unwrap(apiResult, "download api");
  return {
    suggestedFilename: download.suggestedFilename(),
    apiFilename: data.filename,
    mimeType: data.mimeType,
    bytes: data.bytes,
    resultHasText: Object.prototype.hasOwnProperty.call(data, "text"),
    metadata: data.metadata
  };

  function unwrap(result, label) {
    if (!result?.ok) throw new Error(`${label} 调用失败：${result?.error?.message || "未知错误"}`);
    return result.data;
  }
}

async function inspectHealthErrors(page) {
  return page.evaluate(() => {
    const result = window.webglGeneratorApi.info.healthEvents({severity: "error", limit: 180});
    if (!result?.ok) throw new Error(`info.healthEvents 调用失败：${result?.error?.message || "未知错误"}`);
    return {
      total: result.data.total,
      counts: result.data.counts,
      events: result.data.events.map(event => ({
        severity: event.severity || event.level || "",
        message: event.message || "",
        operation: event.operation || ""
      }))
    };
  });
}

function buildConsoleSummary(report) {
  return {
    ok: report.passed,
    checksum: report.map.checksum,
    notes: {
      all: report.exports.notesAll.itemCount,
      selected: report.exports.notesSelected.itemCount,
      summaryOnlyHasText: report.exports.notesSummaryOnly.hasText,
      download: report.downloads.items[0]?.suggestedFilename || ""
    },
    measurements: {
      all: report.exports.measurementsAll.itemCount,
      selected: report.exports.measurementsSelected.itemCount,
      summaryOnlyHasText: report.exports.measurementsSummaryOnly.hasText,
      distanceMapUnits: report.exportedMeasurement?.distanceMapUnits || 0,
      download: report.downloads.items[1]?.suggestedFilename || ""
    },
    glError: report.glError,
    healthErrors: report.healthErrors.total,
    consoleErrors: report.metadata.consoleErrors.length,
    pageErrors: report.metadata.pageErrors.length
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# API 备注与测量导出回归报告", "");
  lines.push(`- 生成时间：${report.metadata.generatedAt}`);
  lines.push(`- seed：\`${report.metadata.seed}\``);
  lines.push(`- 地形模板：\`${report.metadata.template}\``);
  lines.push(`- 目标 cells：\`${report.metadata.cells}\``);
  lines.push(`- 结论：${report.passed ? "通过" : "失败"}`);
  lines.push("");
  lines.push("## 地图", "");
  lines.push(`- checksum：\`${report.map.checksum}\``);
  lines.push(`- grid cells：${report.map.gridCells}`);
  lines.push(`- pack cells：${report.map.packCells}`);
  lines.push("");
  lines.push("## 备注导出", "");
  lines.push(`- 全量条目：${report.exports.notesAll.itemCount}`);
  lines.push(`- 筛选条目：${report.exports.notesSelected.itemCount}`);
  lines.push(`- includeText:false 返回 text：${report.exports.notesSummaryOnly.hasText ? "是" : "否"}`);
  lines.push(`- 下载文件名：\`${report.downloads.items[0]?.suggestedFilename || ""}\``);
  lines.push("");
  lines.push("## 测量导出", "");
  lines.push(`- 全量条目：${report.exports.measurementsAll.itemCount}`);
  lines.push(`- 筛选条目：${report.exports.measurementsSelected.itemCount}`);
  lines.push(`- 距离：${report.exportedMeasurement?.distanceMapUnits || 0}`);
  lines.push(`- includeText:false 返回 text：${report.exports.measurementsSummaryOnly.hasText ? "是" : "否"}`);
  lines.push(`- 下载文件名：\`${report.downloads.items[1]?.suggestedFilename || ""}\``);
  lines.push("");
  lines.push("## 运行状态", "");
  lines.push(`- WebGL error：${report.glError}`);
  lines.push(`- health error：${report.healthErrors.total}`);
  lines.push(`- console error：${report.metadata.consoleErrors.length}`);
  lines.push(`- page error：${report.metadata.pageErrors.length}`);
  if (report.failures.length) {
    lines.push("", "## 失败项", "");
    for (const failure of report.failures) lines.push(`- ${failure}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function renderFailureSummary(report) {
  const lines = ["API 备注与测量导出回归失败："];
  for (const failure of report.failures) lines.push(`- ${failure}`);
  for (const event of report.healthErrors.events || []) lines.push(`- health error: ${event.message || JSON.stringify(event)}`);
  for (const error of report.metadata.consoleErrors) lines.push(`- console error: ${error}`);
  for (const error of report.metadata.pageErrors) lines.push(`- page error: ${error}`);
  return lines.join("\n");
}

async function startStaticServer({host, port, publicDir}) {
  const server = createServer((request, response) => {
    const url = new URL(request.url || "/", `http://${host}:${port}`);
    const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const target = resolve(publicDir, `.${normalize(pathname)}`);

    if (!target.startsWith(publicDir)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }
    if (!existsSync(target) || !statSync(target).isFile()) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "content-type": getContentType(target),
      "cache-control": "no-store, max-age=0"
    });
    createReadStream(target).pipe(response);
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, host, () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
  return server;
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (!arg.startsWith("--")) continue;
    const [key, inlineValue] = arg.slice(2).split("=");
    parsed[key] = inlineValue ?? argv[++index] ?? true;
  }
  return parsed;
}

function parseViewport(value) {
  const [width, height] = String(value).split("x").map(Number);
  return {
    width: Number.isFinite(width) ? width : 1280,
    height: Number.isFinite(height) ? height : 820
  };
}

function getContentType(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html;charset=utf-8";
  if (ext === ".js") return "text/javascript;charset=utf-8";
  if (ext === ".css") return "text/css;charset=utf-8";
  if (ext === ".json" || ext === ".geojson") return "application/json;charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

async function loadPlaywright(sourceDirectory) {
  const requireFromSource = createRequire(join(sourceDirectory, "package.json"));
  try {
    return requireFromSource("playwright");
  } catch (error) {
    fail(`无法加载 Playwright，请先在 source/Fantasy-Map-Generator 安装依赖：${error.message}`);
  }
}

async function launchBrowser(playwright, {headless, browserChannel}) {
  try {
    return await playwright.chromium.launch({headless, channel: browserChannel});
  } catch (error) {
    fail(`无法启动 Chromium channel=${browserChannel}：${error.message}`);
  }
}

function delay(ms) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
