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
const port = Number(args.port || 5448);
const timeoutMs = Number(args.timeout || 180000);
const cells = Number(args.cells || 1000);
const seed = String(args.seed || "api-namebase-docs-regression");
const template = String(args.template || "continents");
const browserChannel = args["browser-channel"] || args.channel || "chrome";
const distDir = resolve(args.dir || join(rootDir, "dist", "webgl-generator"));
const outPath = resolve(args.out || join(rootDir, "docs", "generated", "reports", "api-namebase-docs-regression-results.json"));
const markdownPath = resolve(args.markdown || join(rootDir, "docs", "generated", "reports", "api-namebase-docs-regression-results.md"));
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
  const result = await inspectNamebaseDocs(page, {cells, seed, template});
  const observedHealthErrors = await inspectHealthErrors(page);
  const diagnostics = partitionApiBrowserDiagnostics(observedHealthErrors, consoleErrors);
  const healthErrors = diagnostics.healthErrors;

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

async function inspectNamebaseDocs(page, {cells, seed, template}) {
  const core = await page.evaluate(async ({cells, seed, template}) => {
    const failures = [];
    const api = window.webglGeneratorApi;
    unwrap(await api.generate.newMap({confirm: true, seed, cellsTarget: cells, heightmapTemplate: template}), "generate.newMap");
    document.getElementById("open-namebase-panel")?.click();
    await new Promise(resolve => setTimeout(resolve, 350));
    const before = unwrap(api.info.mapSummary(), "info.mapSummary.before");
    const initialList = unwrap(api.namebases.list({includeSource: false}), "namebases.list.initial");
    const sourceList = unwrap(api.namebases.list({includeSource: true}), "namebases.list.source");
    const selectedBase = initialList.bases.find(base => base.builtin && base.id) || initialList.bases.find(base => base.id);
    if (!selectedBase) throw new Error("没有可用于回归的名称库");

    const selectedSourceBase = sourceList.bases.find(base => base.id === selectedBase.id);
    const initialUserCount = countUserBases(initialList);
    const selectedJson = unwrap(api.namebases.export({download: false, baseIds: [selectedBase.id]}), "namebases.export.selectedJson");
    const selectedJsonSummaryOnly = unwrap(api.namebases.export({download: false, includeText: false, baseIds: [selectedBase.id]}), "namebases.export.selectedJson.summaryOnly");
    const selectedLegacy = unwrap(api.namebases.export({download: false, format: "legacy", baseIds: [selectedBase.id]}), "namebases.export.selectedLegacy");
    const selectedLegacySummaryOnly = unwrap(api.namebases.export({download: false, format: "legacy", includeText: false, baseIds: [selectedBase.id]}), "namebases.export.selectedLegacy.summaryOnly");
    const parsedJson = parseJson(selectedJson.text, "selectedJson", failures);
    const legacyLines = String(selectedLegacy.text || "").split(/\r?\n/g).filter(Boolean);

    if (initialList.metadata?.totalBases !== initialList.bases.length) failures.push("list metadata.totalBases 与 bases.length 不一致");
    if (initialList.metadata?.userBases !== initialUserCount) failures.push("list metadata.userBases 与实际用户库数量不一致");
    if (!Array.isArray(initialList.bindingTargets) || initialList.bindingTargets.length < 5) failures.push("list bindingTargets 数量异常");
    if (Object.prototype.hasOwnProperty.call(selectedBase, "source")) failures.push("默认 list 不应返回 source");
    if (!Array.isArray(selectedSourceBase?.source) || selectedSourceBase.source.length === 0) failures.push("includeSource:true 未返回源词条");
    if (selectedJson.metadata?.type !== "webgl-generator-namebases") failures.push(`JSON 导出 type 异常：${selectedJson.metadata?.type}`);
    if (selectedJson.metadata?.version !== 1) failures.push(`JSON 导出 version 异常：${selectedJson.metadata?.version}`);
    if (selectedJson.metadata?.exportMode !== "selected-namebases") failures.push(`JSON 导出模式异常：${selectedJson.metadata?.exportMode}`);
    if (selectedJson.metadata?.bases !== 1 || parsedJson?.bases?.length !== 1) failures.push("JSON 选中导出未只包含 1 个名称库");
    if (!selectedJson.filename.endsWith(".namebases-selected.json")) failures.push(`JSON 选中导出文件名异常：${selectedJson.filename}`);
    if (Object.prototype.hasOwnProperty.call(selectedJsonSummaryOnly, "text")) failures.push("JSON includeText:false 仍返回 text");
    if (selectedLegacy.metadata?.exportMode !== "selected-namebases") failures.push(`legacy 导出模式异常：${selectedLegacy.metadata?.exportMode}`);
    if (selectedLegacy.metadata?.bases !== 1 || legacyLines.length !== 1) failures.push("legacy 选中导出未只包含 1 行");
    if (!selectedLegacy.filename.endsWith(".namebases-selected.txt")) failures.push(`legacy 选中导出文件名异常：${selectedLegacy.filename}`);
    if (Object.prototype.hasOwnProperty.call(selectedLegacySummaryOnly, "text")) failures.push("legacy includeText:false 仍返回 text");

    const objectImport = unwrap(api.namebases.import(parsedJson, {filename: "api-namebase-object.json"}), "namebases.import.object");
    const afterObjectImport = unwrap(api.namebases.list(), "namebases.list.afterObjectImport");
    assertUserCount(afterObjectImport, initialUserCount + 1, "对象导入后用户库数量", failures);
    if (!objectImport.executed || objectImport.result?.imported !== 1) failures.push("对象导入未执行或 imported 不是 1");
    const undoObjectImport = unwrap(api.history.undo(), "history.undo.objectImport");
    await new Promise(resolve => setTimeout(resolve, 350));
    const afterObjectUndo = unwrap(api.namebases.list(), "namebases.list.afterObjectUndo");
    assertUserCount(afterObjectUndo, initialUserCount, "对象导入撤销后用户库数量", failures);
    if (!undoObjectImport.executed) failures.push("对象导入撤销未执行");
    const panelHistoryAfterObjectUndo = readNamebasePanelHistory();
    if (!panelHistoryAfterObjectUndo.undoDisabled || panelHistoryAfterObjectUndo.redoDisabled) failures.push(`名称库面板未同步 API 撤销栈：${JSON.stringify(panelHistoryAfterObjectUndo)}`);
    if (!panelHistoryAfterObjectUndo.redoTitle.includes("@namebase") || !panelHistoryAfterObjectUndo.redoTitle.includes("namebase#")) failures.push(`名称库面板重做摘要缺少领域或真实目标：${panelHistoryAfterObjectUndo.redoTitle}`);

    const transientCreate = unwrap(api.namebases.create({
      name: "API 临时待替换名称库",
      source: ["玄岚", "霜野", "云浦"],
      minLength: 2,
      maxLength: 4
    }), "namebases.create.transient");
    const afterTransientCreate = unwrap(api.namebases.list(), "namebases.list.afterTransientCreate");
    assertUserCount(afterTransientCreate, initialUserCount + 1, "临时名称库创建后用户库数量", failures);
    if (!transientCreate.executed) failures.push("临时名称库创建未执行");
    const transientId = firstUserBase(afterTransientCreate)?.id || "";

    const stringReplace = unwrap(api.namebases.import(selectedJson.text, {mode: "replace", filename: "api-namebase-replace.json"}), "namebases.import.stringReplace");
    const afterStringReplace = unwrap(api.namebases.list(), "namebases.list.afterStringReplace");
    assertUserCount(afterStringReplace, 1, "字符串 replace 后用户库数量", failures);
    if (!stringReplace.executed || stringReplace.result?.imported !== 1 || stringReplace.result?.replaced !== initialUserCount + 1) {
      failures.push(`字符串 replace 结果异常：${JSON.stringify(stringReplace.result)}`);
    }
    if (transientId && afterStringReplace.bases.some(base => base.id === transientId)) failures.push("replace 后仍保留被替换的临时用户库");
    const undoStringReplace = unwrap(api.history.undo(), "history.undo.stringReplace");
    const afterReplaceUndo = unwrap(api.namebases.list(), "namebases.list.afterReplaceUndo");
    assertUserCount(afterReplaceUndo, initialUserCount + 1, "replace 撤销后用户库数量", failures);
    if (!undoStringReplace.executed) failures.push("replace 撤销未执行");
    unwrap(api.history.undo(), "history.undo.transientCreate");
    const afterTransientUndo = unwrap(api.namebases.list(), "namebases.list.afterTransientUndo");
    assertUserCount(afterTransientUndo, initialUserCount, "临时创建撤销后用户库数量", failures);

    const legacyImport = unwrap(api.namebases.import(selectedLegacy.text, {filename: "api-namebase-legacy.txt"}), "namebases.import.legacy");
    const afterLegacyImport = unwrap(api.namebases.list(), "namebases.list.afterLegacyImport");
    assertUserCount(afterLegacyImport, initialUserCount + 1, "legacy 导入后用户库数量", failures);
    if (!legacyImport.executed || legacyImport.result?.imported !== 1) failures.push("legacy 导入未执行或 imported 不是 1");
    unwrap(api.history.undo(), "history.undo.legacyImport");
    const afterLegacyUndo = unwrap(api.namebases.list(), "namebases.list.afterLegacyUndo");
    assertUserCount(afterLegacyUndo, initialUserCount, "legacy 撤销后用户库数量", failures);

    const clearCreateA = unwrap(api.namebases.create({name: "API 清空测试一", source: ["清河", "晴川"]}), "namebases.create.clearA");
    const clearCreateB = unwrap(api.namebases.create({name: "API 清空测试二", source: ["云港", "月浦"]}), "namebases.create.clearB");
    const afterClearCreates = unwrap(api.namebases.list(), "namebases.list.afterClearCreates");
    assertUserCount(afterClearCreates, initialUserCount + 2, "清空测试创建后用户库数量", failures);
    if (!clearCreateA.executed || !clearCreateB.executed) failures.push("清空测试名称库创建未执行");
    const clearDenied = api.namebases.clear();
    const afterDeniedClear = unwrap(api.namebases.list(), "namebases.list.afterDeniedClear");
    if (clearDenied?.ok !== false) failures.push("存在用户名称库时，未确认 clear 应返回结构化失败");
    if (!String(clearDenied?.error?.message || "").includes("确认")) failures.push(`未确认 clear 错误信息异常：${clearDenied?.error?.message || ""}`);
    assertUserCount(afterDeniedClear, initialUserCount + 2, "未确认 clear 后用户库数量", failures);
    const clearConfirmed = unwrap(api.namebases.clear({confirm: true}), "namebases.clear.confirmed");
    const afterClear = unwrap(api.namebases.list(), "namebases.list.afterClear");
    assertUserCount(afterClear, 0, "确认 clear 后用户库数量", failures);
    if (!clearConfirmed.executed || clearConfirmed.result?.removed !== initialUserCount + 2) failures.push(`确认 clear 结果异常：${JSON.stringify(clearConfirmed.result)}`);
    const undoClear = unwrap(api.history.undo(), "history.undo.clear");
    const afterClearUndo = unwrap(api.namebases.list(), "namebases.list.afterClearUndo");
    assertUserCount(afterClearUndo, initialUserCount + 2, "clear 撤销后用户库数量", failures);
    if (!undoClear.executed) failures.push("clear 撤销未执行");
    unwrap(api.history.undo(), "history.undo.clearCreateB");
    unwrap(api.history.undo(), "history.undo.clearCreateA");
    const finalList = unwrap(api.namebases.list(), "namebases.list.final");
    assertUserCount(finalList, initialUserCount, "最终用户库数量", failures);

    const after = unwrap(api.info.mapSummary(), "info.mapSummary.after");
    const history = unwrap(api.history.get(), "history.get");
    const stats = window.__webglGeneratorApp?.renderer?.getStats?.() || {};
    const glError = stats.draw?.glError || 0;
    if (before.checksum !== after.checksum) failures.push(`名称库文档回归前后 checksum 改变：${before.checksum} -> ${after.checksum}`);
    if (glError) failures.push(`WebGL error ${glError}`);

    return {
      selectedBase: {
        id: selectedBase.id,
        name: selectedBase.name,
        samples: selectedBase.samples,
        sourceSamples: selectedSourceBase?.source?.length || 0
      },
      map: {
        checksum: before.checksum,
        gridCells: before.gridCells,
        packCells: before.packCells
      },
      list: {
        totalBases: initialList.metadata?.totalBases || 0,
        builtinBases: initialList.metadata?.builtinBases || 0,
        initialUserBases: initialUserCount,
        finalUserBases: countUserBases(finalList),
        bindingTargets: initialList.bindingTargets.map(target => target.key)
      },
      exports: {
        selectedJson: summarizeExport(selectedJson, parsedJson),
        selectedJsonSummaryOnly: summarizeSummaryOnly(selectedJsonSummaryOnly),
        selectedLegacy: summarizeLegacyExport(selectedLegacy, legacyLines),
        selectedLegacySummaryOnly: summarizeSummaryOnly(selectedLegacySummaryOnly)
      },
      imports: {
        object: summarizeEditResult(objectImport),
        stringReplace: summarizeEditResult(stringReplace),
        legacy: summarizeEditResult(legacyImport),
        clearDenied: {ok: clearDenied?.ok === true, message: clearDenied?.error?.message || ""},
        clearConfirmed: summarizeEditResult(clearConfirmed),
        undoClear: summarizeEditResult(undoClear)
      },
      history: {undo: history.undo, redo: history.redo, lastAffected: history.lastAffected || []},
      glError,
      failures,
      passed: failures.length === 0
    };

    function countUserBases(snapshot) {
      return (snapshot?.bases || []).filter(base => base && base.builtin !== true).length;
    }

    function firstUserBase(snapshot) {
      return (snapshot?.bases || []).find(base => base && base.builtin !== true) || null;
    }

    function assertUserCount(snapshot, expected, label, output) {
      const actual = countUserBases(snapshot);
      if (actual !== expected) output.push(`${label} 异常：${actual}，期望 ${expected}`);
    }

    function summarizeEditResult(result) {
      return {
        executed: result.executed === true,
        label: result.label || "",
        result: result.result || null,
        history: result.history || null,
        error: result.error || null
      };
    }

    function readNamebasePanelHistory() {
      const buttons = Array.from(document.querySelectorAll('[data-panel-id="namebase-panel"] .floating-panel-history-button'));
      const undo = buttons.find(button => button.getAttribute("aria-label") === "撤销");
      const redo = buttons.find(button => button.getAttribute("aria-label") === "重做");
      return {
        undoDisabled: Boolean(undo?.disabled),
        redoDisabled: Boolean(redo?.disabled),
        undoTitle: undo?.getAttribute("title") || "",
        redoTitle: redo?.getAttribute("title") || ""
      };
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
        format: result.format,
        metadata: result.metadata,
        hasText: typeof result.text === "string",
        type: parsed?.type || "",
        baseCount: parsed?.bases?.length || 0
      };
    }

    function summarizeLegacyExport(result, lines) {
      return {
        filename: result.filename,
        bytes: result.bytes,
        format: result.format,
        metadata: result.metadata,
        hasText: typeof result.text === "string",
        lineCount: lines.length
      };
    }

    function summarizeSummaryOnly(result) {
      return {
        filename: result.filename,
        bytes: result.bytes,
        format: result.format,
        metadata: result.metadata,
        hasText: Object.prototype.hasOwnProperty.call(result, "text")
      };
    }

    function unwrap(result, label) {
      if (!result?.ok) throw new Error(`${label} 调用失败：${result?.error?.message || "未知错误"}`);
      return result.data;
    }
  }, {cells, seed, template});

  const downloads = await inspectDownloads(page, core.selectedBase.id);
  const failures = [...core.failures, ...downloads.failures];
  return {
    ...core,
    downloads,
    failures,
    passed: failures.length === 0
  };
}

async function inspectDownloads(page, baseId) {
  const downloads = [];
  const failures = [];
  const jsonDownload = await waitForApiDownload(page, () => window.webglGeneratorApi.namebases.export({download: true, includeText: false, baseIds: [window.__apiNamebaseBaseId]}), baseId);
  const legacyDownload = await waitForApiDownload(page, () => window.webglGeneratorApi.namebases.export({download: true, includeText: false, format: "legacy", baseIds: [window.__apiNamebaseBaseId]}), baseId);
  downloads.push(jsonDownload, legacyDownload);
  if (!jsonDownload.suggestedFilename.endsWith(".namebases-selected.json")) failures.push(`JSON 下载文件名异常：${jsonDownload.suggestedFilename}`);
  if (!legacyDownload.suggestedFilename.endsWith(".namebases-selected.txt")) failures.push(`legacy 下载文件名异常：${legacyDownload.suggestedFilename}`);
  if (jsonDownload.resultHasText) failures.push("JSON 下载 includeText:false 返回了 text");
  if (legacyDownload.resultHasText) failures.push("legacy 下载 includeText:false 返回了 text");
  return {items: downloads, failures, passed: failures.length === 0};
}

async function waitForApiDownload(page, browserFunction, baseId) {
  await page.evaluate(id => {
    window.__apiNamebaseBaseId = id;
  }, baseId);
  const [download, apiResult] = await Promise.all([
    page.waitForEvent("download", {timeout: timeoutMs}),
    page.evaluate(browserFunction)
  ]);
  const data = unwrap(apiResult, "download api");
  return {
    suggestedFilename: download.suggestedFilename(),
    apiFilename: data.filename,
    mimeType: data.mimeType,
    format: data.format,
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
    checksum: report.map.checksum,
    selectedBase: report.selectedBase.id,
    exports: {
      jsonBases: report.exports.selectedJson.baseCount,
      legacyLines: report.exports.selectedLegacy.lineCount,
      jsonSummaryOnlyHasText: report.exports.selectedJsonSummaryOnly.hasText,
      legacySummaryOnlyHasText: report.exports.selectedLegacySummaryOnly.hasText
    },
    imports: {
      objectImported: report.imports.object.result?.imported || 0,
      stringReplaceImported: report.imports.stringReplace.result?.imported || 0,
      stringReplaceReplaced: report.imports.stringReplace.result?.replaced || 0,
      legacyImported: report.imports.legacy.result?.imported || 0,
      clearDeniedOk: report.imports.clearDenied.ok,
      clearRemoved: report.imports.clearConfirmed.result?.removed || 0
    },
    downloads: report.downloads.items.map(item => item.suggestedFilename),
    glError: report.glError,
    healthErrors: report.healthErrors.total,
    consoleErrors: report.metadata.consoleErrors.length,
    pageErrors: report.metadata.pageErrors.length
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# API 名称库文档回归报告", "");
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
  lines.push("## 名称库快照", "");
  lines.push(`- 选中名称库：\`${report.selectedBase.id}\` / ${report.selectedBase.name}`);
  lines.push(`- 总名称库：${report.list.totalBases}`);
  lines.push(`- 内置名称库：${report.list.builtinBases}`);
  lines.push(`- 初始用户库：${report.list.initialUserBases}`);
  lines.push(`- 最终用户库：${report.list.finalUserBases}`);
  lines.push("");
  lines.push("## 导出与下载", "");
  lines.push(`- JSON 选中导出数量：${report.exports.selectedJson.baseCount}`);
  lines.push(`- legacy 选中导出行数：${report.exports.selectedLegacy.lineCount}`);
  lines.push(`- JSON includeText:false 返回 text：${report.exports.selectedJsonSummaryOnly.hasText ? "是" : "否"}`);
  lines.push(`- legacy includeText:false 返回 text：${report.exports.selectedLegacySummaryOnly.hasText ? "是" : "否"}`);
  lines.push(`- 下载文件名：${report.downloads.items.map(item => `\`${item.suggestedFilename}\``).join("、")}`);
  lines.push("");
  lines.push("## 导入、替换和清空", "");
  lines.push(`- JSON 对象导入：${report.imports.object.result?.imported || 0}`);
  lines.push(`- JSON 字符串 replace 导入：${report.imports.stringReplace.result?.imported || 0}`);
  lines.push(`- JSON 字符串 replace 替换：${report.imports.stringReplace.result?.replaced || 0}`);
  lines.push(`- legacy 文本导入：${report.imports.legacy.result?.imported || 0}`);
  lines.push(`- 未确认 clear 结构化失败：${report.imports.clearDenied.ok ? "否" : "是"}`);
  lines.push(`- 确认 clear 删除：${report.imports.clearConfirmed.result?.removed || 0}`);
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
  const lines = ["API 名称库文档回归失败："];
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
