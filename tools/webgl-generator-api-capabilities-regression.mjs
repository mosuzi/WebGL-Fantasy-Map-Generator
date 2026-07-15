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
const port = Number(args.port || 5444);
const timeoutMs = Number(args.timeout || 180000);
const cells = Number(args.cells || 1000);
const seed = String(args.seed || "api-capabilities-regression");
const template = String(args.template || "continents");
const browserChannel = args["browser-channel"] || args.channel || "chrome";
const distDir = resolve(args.dir || join(rootDir, "dist", "webgl-generator"));
const outPath = resolve(args.out || join(rootDir, "docs", "generated", "reports", "api-capabilities-regression-results.json"));
const markdownPath = resolve(args.markdown || join(rootDir, "docs", "generated", "reports", "api-capabilities-regression-results.md"));
const viewport = parseViewport(args.viewport || "1280x820");

if (!existsSync(distDir)) fail(`构建产物不存在：${distDir}`);
mkdirSync(dirname(outPath), {recursive: true});
mkdirSync(dirname(markdownPath), {recursive: true});

const playwright = await loadPlaywright(sourceDir);
const server = await startStaticServer({host, port, publicDir: distDir});
let browser = null;
let context = null;

try {
  browser = await launchBrowser(playwright, {headless: !args.headful, browserChannel});
  context = await browser.newContext({viewport, deviceScaleFactor: 1});
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
  const result = await inspectCapabilities(page, {cells, seed, template});
  const uiApiConvergence = await inspectUiApiConvergence(page);
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
    uiApiConvergence,
    healthErrors,
    passed: result.passed && uiApiConvergence.passed && healthErrors.total === 0 && consoleErrors.length === 0 && pageErrors.length === 0
  };

  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(markdownPath, renderMarkdown(report), "utf8");
  console.log(JSON.stringify(buildConsoleSummary(report), null, 2));
  console.log(`Wrote ${outPath}`);
  console.log(`Wrote ${markdownPath}`);
  if (!report.passed) fail(renderFailureSummary(report));
} finally {
  if (context) await Promise.race([context.close(), delay(5000)]);
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await new Promise(resolveClose => server.close(resolveClose));
}

async function inspectCapabilities(page, {cells, seed, template}) {
  return page.evaluate(async ({cells, seed, template}) => {
    const failures = [];
    const expectedConfirmRequired = [
      "generate.regenerate",
      "generate.newMap",
      "generate.rerollSeed",
      "data.importMap",
      "data.importGEO",
      "data.importHeightmap",
      "data.restoreBrowserMap",
      "namebases.clear",
      "namebases.renameObjects",
      "edit.height.rebuildBaseDerived",
      "edit.height.rebuildDownstreamDerived",
      "edit.economy.assignCells",
      "edit.economy.rebuild"
    ];
    const expectedConfirmGroups = {
      generate: ["regenerate", "newMap", "rerollSeed"],
      data: ["importMap", "importGEO", "importHeightmap", "restoreBrowserMap"],
      namebases: ["clear", "renameObjects"],
      edit: ["height.rebuildBaseDerived", "height.rebuildDownstreamDerived", "economy.assignCells", "economy.rebuild"]
    };
    const expectedRepresentativeMutates = {
      "generate.setOptions": "generation-options",
      "edit.notes.set": "notes",
      "edit.states.setGovernment": "political-entities",
      "data.exportPNG": "download-or-export-result",
      "debug.profileNextRender": "renderer-diagnostics",
      "selection.locate": "camera-and-selection-state",
      "selection.highlight": "persistent-highlight-state",
      "selection.clearHighlights": "persistent-highlight-state",
      "history.undo": "map-and-edit-history-state",
      "namebases.renameObjects": "object-names"
    };

    const api = window.webglGeneratorApi;
    const version = unwrap(api.info.version(), "info.version");
    const generation = unwrap(await api.generate.newMap({
      confirm: true,
      seed,
      cellsTarget: cells,
      heightmapTemplate: template
    }), "generate.newMap");
    const beforeSummary = unwrap(api.info.mapSummary(), "info.mapSummary.before");
    const capabilities = unwrap(api.info.capabilities(), "info.capabilities");
    const runtimeStats = unwrap(api.info.runtimeStats(), "info.runtimeStats");
    const afterSummary = unwrap(api.info.mapSummary(), "info.mapSummary.after");
    const stats = window.__webglGeneratorApp?.renderer?.getStats?.() || {};
    const glError = stats.draw?.glError ?? 0;

    if (beforeSummary.checksum !== afterSummary.checksum) {
      failures.push(`读取 capabilities 前后 checksum 改变：${beforeSummary.checksum} -> ${afterSummary.checksum}`);
    }
    if (!capabilities.methods) failures.push("capabilities 缺少 methods 字段");
    if (!capabilities.methodMetadata) failures.push("capabilities 缺少 methodMetadata 字段");
    if (!capabilities.methodMetadataCoverage) failures.push("capabilities 缺少 methodMetadataCoverage 字段");
    if (api.version !== "1.0.0" || api.stability !== "stable") failures.push(`根 API 版本错误：${api.version} / ${api.stability}`);
    if (window.api !== api) failures.push("window.api 没有指向正式根 API");
    if (version.apiVersion !== "1.0.0" || version.stability !== "stable") failures.push("info.version 没有返回稳定版本");
    if (version.capabilitySchemaVersion !== "1.0.0" || version.compatibilityPolicyVersion !== "1.0.0") failures.push("info.version 缺少能力或兼容策略版本");
    if (capabilities.contract?.stableCompatibility !== "same-major") failures.push("capabilities 缺少同主版本兼容策略");
    if (capabilities.contract?.deprecatedRemoval !== "next-major-only") failures.push("capabilities 缺少 deprecated 移除策略");
    if (Object.keys(capabilities.capabilityGroups || {}).length !== 13) failures.push("capabilities 能力组不是 13 个");
    if (JSON.stringify(capabilities.stabilitySummary) !== JSON.stringify({stable: 167, experimental: 7, deprecated: 1})) failures.push("稳定等级统计不是 167 / 7 / 1");
    if (!Object.prototype.hasOwnProperty.call(runtimeStats, "lastEditRefresh")) failures.push("runtimeStats 缺少 lastEditRefresh 字段");
    const coverage = capabilities.methodMetadataCoverage || {};
    if (coverage.complete !== true) failures.push("methodMetadataCoverage.complete 不是 true");
    if (coverage.methods !== coverage.documented || coverage.methods !== coverage.metadata || coverage.methods !== coverage.runtime) {
      failures.push(`覆盖数量不一致：methods=${coverage.methods}, documented=${coverage.documented}, metadata=${coverage.metadata}, runtime=${coverage.runtime}`);
    }
    if ((coverage.missing || []).length) failures.push(`存在缺失元数据：${coverage.missing.join(", ")}`);
    if ((coverage.extra || []).length) failures.push(`存在多余元数据：${coverage.extra.join(", ")}`);
    if ((coverage.runtimeMissing || []).length) failures.push(`真实 API 缺少声明方法：${coverage.runtimeMissing.join(", ")}`);
    if ((coverage.runtimeExtra || []).length) failures.push(`真实 API 存在未声明方法：${coverage.runtimeExtra.join(", ")}`);
    for (const [namespace, namespaceCoverage] of Object.entries(coverage.namespaces || {})) {
      if (!namespaceCoverage.complete) failures.push(`${namespace} 命名空间覆盖不完整`);
      if (namespaceCoverage.methods !== namespaceCoverage.documented || namespaceCoverage.methods !== namespaceCoverage.metadata || namespaceCoverage.methods !== namespaceCoverage.runtime) {
        failures.push(`${namespace} 命名空间数量不一致`);
      }
      if ((namespaceCoverage.missing || []).length) failures.push(`${namespace} 缺失：${namespaceCoverage.missing.join(", ")}`);
      if ((namespaceCoverage.extra || []).length) failures.push(`${namespace} 多余：${namespaceCoverage.extra.join(", ")}`);
      if ((namespaceCoverage.runtimeMissing || []).length) failures.push(`${namespace} 真实 API 缺失：${namespaceCoverage.runtimeMissing.join(", ")}`);
      if ((namespaceCoverage.runtimeExtra || []).length) failures.push(`${namespace} 真实 API 多余：${namespaceCoverage.runtimeExtra.join(", ")}`);
    }
    for (const [namespace, methods] of Object.entries(capabilities.methodMetadata || {})) {
      for (const [method, metadata] of Object.entries(methods || {})) {
        const qualifiedName = `${namespace}.${method}`;
        for (const field of ["stable", "stability", "since", "capabilityGroup", "mutates", "undoable", "async", "requiresConfirm"]) {
          if (!Object.prototype.hasOwnProperty.call(metadata, field)) failures.push(`${qualifiedName} 缺少 ${field}`);
        }
        if (!capabilities.capabilityGroups?.[metadata.capabilityGroup]) failures.push(`${qualifiedName} 能力组未声明：${metadata.capabilityGroup}`);
      }
    }
    for (const qualifiedName of ["info.mapSummary", "selection.locate", "layers.setVisible", "history.undo", "data.exportMap", "data.importMap", "edit.states.rename"]) {
      if (getMethodMetadata(capabilities.methodMetadata, qualifiedName)?.stability !== "stable") failures.push(`${qualifiedName} 没有标记 stable`);
    }
    for (const method of capabilities.methods?.debug || []) {
      if (getMethodMetadata(capabilities.methodMetadata, `debug.${method}`)?.stability !== "experimental") failures.push(`debug.${method} 没有标记 experimental`);
    }
    const exportAllMetadata = getMethodMetadata(capabilities.methodMetadata, "data.exportAll");
    if (exportAllMetadata?.stability !== "deprecated" || exportAllMetadata?.deprecated?.replacement !== "data.exportMap") failures.push("data.exportAll deprecated 契约错误");
    const aliases = capabilities.compatibility?.aliases || [];
    if (!aliases.some(item => item.alias === "window.api" && item.target === "window.webglGeneratorApi")) failures.push("兼容目录缺少 window.api");
    if (!aliases.some(item => item.alias === "data.exportAll" && item.target === "data.exportMap")) failures.push("兼容目录缺少 data.exportAll");

    const confirmRequiredMethods = capabilities.safety?.confirmRequiredMethods || [];
    assertSameMembers(confirmRequiredMethods, expectedConfirmRequired, "confirmRequiredMethods", failures);
    const confirmGroups = capabilities.safety?.confirmRequired || {};
    for (const [namespace, methods] of Object.entries(expectedConfirmGroups)) {
      assertSameMembers(confirmGroups[namespace] || [], methods, `confirmRequired.${namespace}`, failures);
    }
    const unexpectedConfirmNamespaces = Object.keys(confirmGroups).filter(namespace => !Object.prototype.hasOwnProperty.call(expectedConfirmGroups, namespace));
    if (unexpectedConfirmNamespaces.length) failures.push(`confirmRequired 出现意外命名空间：${unexpectedConfirmNamespaces.join(", ")}`);

    const representativeMutates = {};
    for (const [qualifiedName, expectedMutates] of Object.entries(expectedRepresentativeMutates)) {
      const metadata = getMethodMetadata(capabilities.methodMetadata, qualifiedName);
      representativeMutates[qualifiedName] = metadata?.mutates || null;
      if (!metadata) {
        failures.push(`缺少代表性元数据：${qualifiedName}`);
      } else if (metadata.mutates !== expectedMutates) {
        failures.push(`${qualifiedName} mutates 变为 ${metadata.mutates}，期望 ${expectedMutates}`);
      }
    }
    if (glError !== 0) failures.push(`WebGL error 非 0：${glError}`);

    return {
      generation,
      contract: {
        version,
        rootVersion: api.version,
        rootStability: api.stability,
        stabilitySummary: capabilities.stabilitySummary,
        capabilityGroups: Object.keys(capabilities.capabilityGroups || {}).length,
        aliases: (capabilities.compatibility?.aliases || []).map(({alias, target, status}) => ({alias, target, status}))
      },
      map: {
        checksum: beforeSummary.checksum,
        gridCells: beforeSummary.gridCells,
        packCells: beforeSummary.packCells,
        states: beforeSummary.states,
        cities: beforeSummary.cities
      },
      coverage: {
        complete: coverage.complete,
        methods: coverage.methods,
        documented: coverage.documented,
        metadata: coverage.metadata,
        runtime: coverage.runtime,
        missing: coverage.missing || [],
        extra: coverage.extra || [],
        runtimeMissing: coverage.runtimeMissing || [],
        runtimeExtra: coverage.runtimeExtra || [],
        namespaces: Object.fromEntries(Object.entries(coverage.namespaces || {}).map(([namespace, item]) => [namespace, {
          complete: item.complete,
          methods: item.methods,
          documented: item.documented,
          metadata: item.metadata,
          runtime: item.runtime,
          missing: item.missing || [],
          extra: item.extra || [],
          runtimeMissing: item.runtimeMissing || [],
          runtimeExtra: item.runtimeExtra || []
        }]))
      },
      safety: {
        confirmRequiredMethods,
        confirmRequired: confirmGroups
      },
      representativeMutates,
      runtimeStats: {
        hasLastEditRefresh: Object.prototype.hasOwnProperty.call(runtimeStats, "lastEditRefresh"),
        lastEditRefresh: runtimeStats.lastEditRefresh
      },
      glError,
      failures,
      passed: failures.length === 0
    };

    function unwrap(result, label) {
      if (!result?.ok) throw new Error(`${label} 调用失败：${result?.error?.message || "未知错误"}`);
      return result.data;
    }

    function getMethodMetadata(methodMetadata, qualifiedName) {
      const firstDot = qualifiedName.indexOf(".");
      const namespace = qualifiedName.slice(0, firstDot);
      const method = qualifiedName.slice(firstDot + 1);
      return methodMetadata?.[namespace]?.[method] || null;
    }

    function assertSameMembers(actual, expected, label, output) {
      const actualSet = new Set(actual);
      const expectedSet = new Set(expected);
      const missing = expected.filter(item => !actualSet.has(item));
      const extra = actual.filter(item => !expectedSet.has(item));
      if (missing.length) output.push(`${label} 缺少：${missing.join(", ")}`);
      if (extra.length) output.push(`${label} 多出：${extra.join(", ")}`);
    }
  }, {cells, seed, template});
}

async function inspectUiApiConvergence(page) {
  const initial = await page.evaluate(() => {
    const result = window.webglGeneratorApi.layers.get();
    if (!result?.ok) throw new Error(`layers.get 调用失败：${result?.error?.message || "未知错误"}`);
    return Boolean(result.data.display.showHoverInfo);
  });
  if (initial) {
    await page.evaluate(() => {
      const result = window.webglGeneratorApi.layers.setShowHoverInfo(false);
      if (!result?.ok) throw new Error(`API 关闭悬停信息失败：${result?.error?.message || "未知错误"}`);
    });
  }
  await page.waitForFunction(() => document.getElementById("show-hover-info")?.getAttribute("aria-pressed") === "false");
  await page.locator("#open-generation-panel").click();
  await page.locator('.floating-panel[data-panel-id="generation-panel"]').waitFor({state: "visible"});
  await page.locator('[data-control-tab="layers"]').click();
  await page.locator("#show-hover-info").click();
  await page.waitForFunction(() => {
    const result = window.webglGeneratorApi.layers.get();
    return result?.ok === true && result.data.display.showHoverInfo === true;
  });
  const uiResult = await page.evaluate(() => window.webglGeneratorApi.layers.get().data.display.showHoverInfo);
  await page.evaluate(() => {
    const result = window.webglGeneratorApi.layers.setShowHoverInfo(false);
    if (!result?.ok) throw new Error(`API 再次关闭悬停信息失败：${result?.error?.message || "未知错误"}`);
  });
  await page.waitForFunction(() => document.getElementById("show-hover-info")?.getAttribute("aria-pressed") === "false");
  const apiResult = await page.evaluate(() => ({
    snapshot: window.webglGeneratorApi.layers.get().data.display.showHoverInfo,
    ariaPressed: document.getElementById("show-hover-info")?.getAttribute("aria-pressed")
  }));
  if (initial) await page.evaluate(() => window.webglGeneratorApi.layers.setShowHoverInfo(true));
  await page.waitForFunction(value => document.getElementById("show-hover-info")?.getAttribute("aria-pressed") === String(value), initial);
  const finalState = await page.evaluate(() => window.webglGeneratorApi.layers.get().data.display.showHoverInfo);
  const restored = finalState === initial;
  return {
    action: "layers.setShowHoverInfo",
    initial,
    uiResult,
    apiResult,
    restored,
    passed: uiResult === true && apiResult.snapshot === false && apiResult.ariaPressed === "false" && restored
  };
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
        message: event.detail?.message || event.message || "",
        operation: event.detail?.operation || event.operation || "",
        detail: event.detail || null
      }))
    };
  });
}

function buildConsoleSummary(report) {
  return {
    ok: report.passed,
    checksum: report.map.checksum,
    gridCells: report.map.gridCells,
    packCells: report.map.packCells,
    coverage: {
      complete: report.coverage.complete,
      methods: report.coverage.methods,
      documented: report.coverage.documented,
      metadata: report.coverage.metadata,
      runtime: report.coverage.runtime
    },
    namespaceCounts: Object.fromEntries(Object.entries(report.coverage.namespaces).map(([namespace, item]) => [namespace, item.methods])),
    confirmRequired: report.safety.confirmRequiredMethods,
    representativeMutates: report.representativeMutates,
    contract: report.contract,
    uiApiConvergence: report.uiApiConvergence,
    glError: report.glError,
    healthErrors: report.healthErrors.total,
    consoleErrors: report.metadata.consoleErrors.length,
    pageErrors: report.metadata.pageErrors.length
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# API capabilities 回归报告", "");
  lines.push(`- 生成时间：${report.metadata.generatedAt}`);
  lines.push(`- seed：\`${report.metadata.seed}\``);
  lines.push(`- 地形模板：\`${report.metadata.template}\``);
  lines.push(`- 目标 cells：\`${report.metadata.cells}\``);
  lines.push(`- 结论：${report.passed ? "通过" : "失败"}`);
  lines.push("");
  lines.push("## 覆盖摘要", "");
  lines.push(`- checksum：\`${report.map.checksum}\``);
  lines.push(`- grid cells：${report.map.gridCells}`);
  lines.push(`- pack cells：${report.map.packCells}`);
  lines.push(`- methodMetadataCoverage.complete：${report.coverage.complete}`);
  lines.push(`- methods / documented / metadata / runtime：${report.coverage.methods} / ${report.coverage.documented} / ${report.coverage.metadata} / ${report.coverage.runtime}`);
  lines.push(`- missing：${report.coverage.missing.length ? report.coverage.missing.join(" / ") : "无"}`);
  lines.push(`- extra：${report.coverage.extra.length ? report.coverage.extra.join(" / ") : "无"}`);
  lines.push(`- runtime missing：${report.coverage.runtimeMissing.length ? report.coverage.runtimeMissing.join(" / ") : "无"}`);
  lines.push(`- runtime extra：${report.coverage.runtimeExtra.length ? report.coverage.runtimeExtra.join(" / ") : "无"}`);
  lines.push(`- API 版本 / 稳定等级：${report.contract.rootVersion} / ${report.contract.rootStability}`);
  lines.push(`- stable / experimental / deprecated：${report.contract.stabilitySummary.stable} / ${report.contract.stabilitySummary.experimental} / ${report.contract.stabilitySummary.deprecated}`);
  lines.push(`- 能力组：${report.contract.capabilityGroups}`);
  lines.push("");
  lines.push("## 命名空间", "");
  lines.push("| 命名空间 | methods | documented | metadata | runtime | 完整 |");
  lines.push("|---|---:|---:|---:|---:|---|");
  for (const [namespace, item] of Object.entries(report.coverage.namespaces)) {
    lines.push(`| ${namespace} | ${item.methods} | ${item.documented} | ${item.metadata} | ${item.runtime} | ${item.complete ? "是" : "否"} |`);
  }
  lines.push("");
  lines.push("## 确认边界", "");
  for (const method of report.safety.confirmRequiredMethods) lines.push(`- \`${method}\``);
  lines.push("");
  lines.push("## 代表性副作用元数据", "");
  for (const [method, mutates] of Object.entries(report.representativeMutates)) lines.push(`- \`${method}\`：\`${mutates}\``);
  lines.push("", "## UI / API 共路径", "");
  lines.push(`- 动作：\`${report.uiApiConvergence.action}\``);
  lines.push(`- UI 开启后 API 读取：${report.uiApiConvergence.uiResult}`);
  lines.push(`- API 关闭后控件同步：${report.uiApiConvergence.apiResult.ariaPressed === "false" ? "是" : "否"}`);
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
  const lines = ["API capabilities 回归失败："];
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
