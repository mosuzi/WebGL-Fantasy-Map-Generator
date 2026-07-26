#!/usr/bin/env node
import {createReadStream, existsSync, mkdirSync, statSync, writeFileSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {dirname, extname, join, normalize, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {partitionApiBrowserDiagnostics, waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const args = parseArgs(process.argv.slice(2));
const host = String(args.host || "127.0.0.1");
const port = Number(args.port || 5445);
const timeoutMs = Number(args.timeout || 180000);
const cells = Number(args.cells || 1000);
const seed = String(args.seed || "api-roundtrip-source");
const alternateSeed = String(args["alternate-seed"] || "api-roundtrip-other");
const template = String(args.template || "continents");
const browserChannel = args["browser-channel"] || args.channel || "chrome";
const distDir = resolve(args.dir || join(rootDir, "dist", "webgl-generator"));
const outPath = resolve(args.out || join(rootDir, "docs", "generated", "reports", "api-roundtrip-regression-results.json"));
const markdownPath = resolve(args.markdown || join(rootDir, "docs", "generated", "reports", "api-roundtrip-regression-results.md"));
const viewport = parseViewport(args.viewport || "1280x820");

if (!existsSync(distDir)) fail(`构建产物不存在：${distDir}`);
mkdirSync(dirname(outPath), {recursive: true});
mkdirSync(dirname(markdownPath), {recursive: true});

const playwright = await loadPlaywright(sourceDir);
const server = await startStaticServer({host, port, publicDir: distDir});
let browser = null;

try {
  browser = await launchBrowser(playwright, {headless: !args.headful, browserChannel});
  const context = await browser.newContext({viewport, deviceScaleFactor: 1});
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
  const result = await inspectRoundtrip(page, {cells, seed, alternateSeed, template});
  const observedHealthErrors = await inspectHealthErrors(page);
  const diagnostics = partitionApiBrowserDiagnostics(observedHealthErrors, consoleErrors);
  const healthErrors = diagnostics.healthErrors;

  const report = {
    metadata: {
      generatedAt: new Date().toISOString(),
      url: baseUrl,
      distDir,
      seed,
      alternateSeed,
      cells,
      template,
      viewport,
      browserChannel,
      consoleErrors: diagnostics.consoleErrors,
      performanceConsoleErrors: diagnostics.performanceConsoleErrors,
      pageErrors
    },
    ...result,
    healthErrors,
    passed: result.passed && healthErrors.total === 0 && diagnostics.consoleErrors.length === 0 && pageErrors.length === 0
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

async function inspectRoundtrip(page, {cells, seed, alternateSeed, template}) {
  return page.evaluate(async ({cells, seed, alternateSeed, template}) => {
    const failures = [];
    const api = window.webglGeneratorApi;
    const sourceGeneration = unwrap(await api.generate.newMap({
      confirm: true,
      seed,
      cellsTarget: cells,
      heightmapTemplate: template
    }), "generate.newMap.source");
    const sourceSummary = unwrap(api.info.mapSummary(), "info.mapSummary.source");
    const exported = unwrap(api.data.exportAll({download: false}), "data.exportAll");
    const afterJsonExport = unwrap(api.info.mapSummary(), "info.mapSummary.afterJsonExport");
    const documentObject = JSON.parse(exported.text);
    const compressed = unwrap(await api.data.exportCompressedAll({download: false}), "data.exportCompressedAll");
    const afterCompressedExport = unwrap(api.info.mapSummary(), "info.mapSummary.afterCompressedExport");
    if (afterJsonExport.checksum !== sourceSummary.checksum) failures.push("JSON 导出改变了当前地图 checksum");
    if (afterCompressedExport.checksum !== sourceSummary.checksum) failures.push("压缩导出改变了当前地图 checksum");
    const noConfirm = await api.data.importMap(documentObject, {toast: false});
    if (noConfirm?.ok !== false || !String(noConfirm?.error?.message || "").includes("confirm")) {
      failures.push("importMap 未传 confirm:true 时没有结构化失败");
    }
    const afterNoConfirm = unwrap(api.info.mapSummary(), "info.mapSummary.afterNoConfirm");
    if (afterNoConfirm.checksum !== sourceSummary.checksum) failures.push("未确认导入改变了当前地图 checksum");

    const objectImport = await regenerateAndImport(api, {
      seed: `${alternateSeed}-object`,
      cells,
      template,
      payload: documentObject,
      label: "object"
    });
    const stringImport = await regenerateAndImport(api, {
      seed: `${alternateSeed}-string`,
      cells,
      template,
      payload: exported.text,
      label: "string"
    });
    const compressedImport = await regenerateAndImport(api, {
      seed: `${alternateSeed}-compressed`,
      cells,
      template,
      payload: compressed,
      label: "compressed"
    });
    const gzipBase64Import = await regenerateAndImport(api, {
      seed: `${alternateSeed}-gzip-base64`,
      cells,
      template,
      payload: {encoding: "gzip-base64", data: compressed.base64},
      label: "gzip-base64"
    });

    const beforeBadImport = unwrap(api.info.mapSummary(), "info.mapSummary.beforeBadImport");
    const badImport = await api.data.importMap("{bad json", {confirm: true, toast: false});
    if (badImport?.ok !== false) failures.push("坏 JSON 导入没有结构化失败");
    const afterBadImport = unwrap(api.info.mapSummary(), "info.mapSummary.afterBadImport");
    if (afterBadImport.checksum !== beforeBadImport.checksum) failures.push("坏 JSON 导入改变了当前地图 checksum");
    const badRuntime = unwrap(api.info.runtimeStats(), "info.runtimeStats.afterBadImport");
    if (badRuntime.operation?.busy !== false) failures.push("坏 JSON 导入后 operation 没有回到空闲");
    if (badRuntime.loading?.visible !== false) failures.push("坏 JSON 导入后 loading 没有关闭");
    const recoveryImport = unwrap(await api.data.importMap(documentObject, {confirm: true, toast: false}), "data.importMap.recovery");
    const recoverySummary = unwrap(api.info.mapSummary(), "info.mapSummary.recovery");
    const recoveryRuntime = unwrap(api.info.runtimeStats(), "info.runtimeStats.recovery");
    if (recoverySummary.checksum !== sourceSummary.checksum) failures.push("坏 JSON 后重试没有恢复源 checksum");
    if (recoveryRuntime.operation?.busy !== false || recoveryRuntime.loading?.visible !== false) failures.push("坏 JSON 后成功重试没有恢复稳定运行状态");

    const history = unwrap(api.history.get(), "history.get");
    const stats = window.__webglGeneratorApp?.renderer?.getStats?.() || {};
    const glError = stats.draw?.glError ?? 0;
    if (glError !== 0) failures.push(`WebGL error 非 0：${glError}`);
    if (exported.metadata?.checksum !== sourceSummary.checksum) {
      failures.push(`exportAll metadata checksum ${exported.metadata?.checksum} 与源 checksum ${sourceSummary.checksum} 不一致`);
    }
    if (compressed.metadata?.checksum !== sourceSummary.checksum) {
      failures.push(`exportCompressedAll metadata checksum ${compressed.metadata?.checksum} 与源 checksum ${sourceSummary.checksum} 不一致`);
    }
    if (!compressed.base64) failures.push("压缩导出缺少 base64");
    for (const item of [objectImport, stringImport, compressedImport, gzipBase64Import]) {
      if (item.changedChecksum === sourceSummary.checksum) failures.push(`${item.label} 导入前扰动地图 checksum 未改变`);
      if (item.imported.checksum !== sourceSummary.checksum) failures.push(`${item.label} 导入未恢复源 checksum`);
      if (item.imported.seed !== seed) failures.push(`${item.label} 导入未恢复源 seed`);
      if (item.history.undo !== 0 || item.history.redo !== 0) failures.push(`${item.label} 导入后历史栈未清空`);
    }

    return {
      source: {
        generation: sourceGeneration,
        seed: sourceSummary.seed,
        checksum: sourceSummary.checksum,
        gridCells: sourceSummary.gridCells,
        packCells: sourceSummary.packCells
      },
      exports: {
        json: {
          filename: exported.filename,
          bytes: exported.bytes,
          metadata: exported.metadata,
          textLength: exported.text?.length || 0
        },
        compressed: {
          filename: compressed.filename,
          originalBytes: compressed.originalBytes,
          compressedBytes: compressed.compressedBytes,
          base64Length: compressed.base64?.length || 0,
          metadata: compressed.metadata
        }
      },
      checks: {
        checkpoints: {
          source: sourceSummary.checksum,
          afterJsonExport: afterJsonExport.checksum,
          afterCompressedExport: afterCompressedExport.checksum,
          afterNoConfirm: afterNoConfirm.checksum
        },
        noConfirm: {
          ok: noConfirm?.ok ?? null,
          message: noConfirm?.error?.message || ""
        },
        objectImport,
        stringImport,
        compressedImport,
        gzipBase64Import,
        badImport: {
          ok: badImport?.ok ?? null,
          message: badImport?.error?.message || "",
          checksumPreserved: afterBadImport.checksum === beforeBadImport.checksum,
          operationBusy: badRuntime.operation?.busy ?? null,
          loadingVisible: badRuntime.loading?.visible ?? null
        },
        recovery: {
          checksum: recoverySummary.checksum,
          resultMetadata: recoveryImport.metadata,
          operationBusy: recoveryRuntime.operation?.busy ?? null,
          loadingVisible: recoveryRuntime.loading?.visible ?? null
        }
      },
      history,
      glError,
      failures,
      passed: failures.length === 0
    };

    async function regenerateAndImport(apiRoot, {seed: nextSeed, cells: targetCells, template: nextTemplate, payload, label}) {
      unwrap(await apiRoot.generate.newMap({
        confirm: true,
        seed: nextSeed,
        cellsTarget: targetCells,
        heightmapTemplate: nextTemplate
      }), `generate.newMap.${label}`);
      const changed = unwrap(apiRoot.info.mapSummary(), `info.mapSummary.changed.${label}`);
      const importedResult = unwrap(await apiRoot.data.importMap(payload, {confirm: true, toast: false}), `data.importMap.${label}`);
      const imported = unwrap(apiRoot.info.mapSummary(), `info.mapSummary.imported.${label}`);
      const importHistory = unwrap(apiRoot.history.get(), `history.get.${label}`);
      return {
        label,
        changedSeed: changed.seed,
        changedChecksum: changed.checksum,
        imported: {
          seed: imported.seed,
          checksum: imported.checksum,
          gridCells: imported.gridCells,
          packCells: imported.packCells
        },
        resultMetadata: importedResult.metadata,
        timings: importedResult.timings,
        history: {
          undo: importHistory.undo,
          redo: importHistory.redo,
          lastAffected: importHistory.lastAffected || []
        }
      };
    }

    function unwrap(result, label) {
      if (!result?.ok) throw new Error(`${label} 调用失败：${result?.error?.message || "未知错误"}`);
      return result.data;
    }
  }, {cells, seed, alternateSeed, template});
}

async function inspectHealthErrors(page) {
  return page.evaluate(() => {
    const result = window.webglGeneratorApi.info.healthEvents({severity: "error", limit: 180});
    if (!result?.ok) throw new Error(`info.healthEvents 调用失败：${result?.error?.message || "未知错误"}`);
    return {
      total: result.data.total,
      counts: result.data.counts,
      events: result.data.events.map(event => ({
        type: event.type || "",
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
    source: {
      seed: report.source.seed,
      checksum: report.source.checksum,
      gridCells: report.source.gridCells,
      packCells: report.source.packCells
    },
    exports: {
      jsonBytes: report.exports.json.bytes,
      compressedBytes: report.exports.compressed.compressedBytes,
      base64Length: report.exports.compressed.base64Length
    },
    imports: {
      object: report.checks.objectImport.imported.checksum,
      string: report.checks.stringImport.imported.checksum,
      compressed: report.checks.compressedImport.imported.checksum,
      gzipBase64: report.checks.gzipBase64Import.imported.checksum
    },
    checkpoints: report.checks.checkpoints,
    noConfirmRejected: report.checks.noConfirm.ok === false,
    badImportRejected: report.checks.badImport.ok === false,
    badImportChecksumPreserved: report.checks.badImport.checksumPreserved,
    recovery: report.checks.recovery,
    glError: report.glError,
    healthErrors: report.healthErrors.total,
    consoleErrors: report.metadata.consoleErrors.length,
    pageErrors: report.metadata.pageErrors.length
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# API 完整地图 roundtrip 回归报告", "");
  lines.push(`- 生成时间：${report.metadata.generatedAt}`);
  lines.push(`- seed：\`${report.metadata.seed}\``);
  lines.push(`- 地形模板：\`${report.metadata.template}\``);
  lines.push(`- 目标 cells：\`${report.metadata.cells}\``);
  lines.push(`- 结论：${report.passed ? "通过" : "失败"}`);
  lines.push("");
  lines.push("## 源地图", "");
  lines.push(`- checksum：\`${report.source.checksum}\``);
  lines.push(`- grid cells：${report.source.gridCells}`);
  lines.push(`- pack cells：${report.source.packCells}`);
  lines.push("");
  lines.push("## 导出", "");
  lines.push(`- JSON：${report.exports.json.bytes} bytes，文件名 \`${report.exports.json.filename}\``);
  lines.push(`- gzip：${report.exports.compressed.compressedBytes} / ${report.exports.compressed.originalBytes} bytes，base64 长度 ${report.exports.compressed.base64Length}`);
  lines.push("");
  lines.push("## 导入闭环", "");
  lines.push("| 输入 | 扰动 checksum | 导入 checksum | 历史 undo/redo |");
  lines.push("|---|---|---|---|");
  for (const item of [report.checks.objectImport, report.checks.stringImport, report.checks.compressedImport, report.checks.gzipBase64Import]) {
    lines.push(`| ${item.label} | \`${item.changedChecksum}\` | \`${item.imported.checksum}\` | ${item.history.undo}/${item.history.redo} |`);
  }
  lines.push("");
  lines.push("## 错误边界", "");
  lines.push(`- 未传 \`confirm:true\` 导入：${report.checks.noConfirm.ok === false ? "结构化失败" : "异常"}`);
  lines.push(`- 坏 JSON 导入：${report.checks.badImport.ok === false ? "结构化失败" : "异常"}`);
  lines.push(`- 坏 JSON 后 checksum 保持：${report.checks.badImport.checksumPreserved ? "是" : "否"}`);
  lines.push(`- 坏 JSON 后 operation / loading：${report.checks.badImport.operationBusy} / ${report.checks.badImport.loadingVisible}`);
  lines.push(`- 随后成功重试 checksum：\`${report.checks.recovery.checksum}\``);
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
  if (report.metadata.consoleErrors.length) {
    lines.push("", "## Console Errors", "");
    for (const error of report.metadata.consoleErrors) lines.push(`- ${error}`);
  }
  if (report.metadata.pageErrors.length) {
    lines.push("", "## Page Errors", "");
    for (const error of report.metadata.pageErrors) lines.push(`- ${error}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function renderFailureSummary(report) {
  const lines = ["API 完整地图 roundtrip 回归失败："];
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
