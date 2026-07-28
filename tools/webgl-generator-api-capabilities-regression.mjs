#!/usr/bin/env node
import {createReadStream, existsSync, mkdirSync, statSync, writeFileSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {dirname, extname, join, normalize, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {CONFIRM_REQUIRED_METHODS} from "../app/webgl-generator/src/runtime/api-contract.js";
import {partitionApiBrowserDiagnostics, waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

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
  const result = await inspectCapabilities(page, {
    cells,
    seed,
    template,
    expectedConfirmRequired: [...CONFIRM_REQUIRED_METHODS]
  });
  const uiApiConvergence = await inspectUiApiConvergence(page);
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
    uiApiConvergence,
    healthErrors,
    passed: result.passed && uiApiConvergence.passed && healthErrors.total === 0 && diagnostics.consoleErrors.length === 0 && pageErrors.length === 0
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

async function inspectCapabilities(page, {cells, seed, template, expectedConfirmRequired}) {
  return page.evaluate(async ({cells, seed, template, expectedConfirmRequired}) => {
    const failures = [];
    const expectedConfirmGroups = expectedConfirmRequired.reduce((groups, qualifiedName) => {
      const [namespace, ...parts] = qualifiedName.split(".");
      (groups[namespace] ||= []).push(parts.join("."));
      return groups;
    }, {});
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
    const initialSummary = unwrap(api.info.mapSummary(), "info.mapSummary.initial");
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
    if (!beforeSummary.mapIdentity || beforeSummary.mapIdentity === initialSummary.mapIdentity || beforeSummary.mapRevision !== 0) {
      failures.push("成功换图没有生成新 identity 并从 revision 0 开始");
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
    if (Object.keys(capabilities.capabilityGroups || {}).length !== 17) failures.push("capabilities 能力组不是 17 个");
    if (JSON.stringify(capabilities.stabilitySummary) !== JSON.stringify({stable: 275, experimental: 7, deprecated: 1})) failures.push("稳定等级统计不是 275 / 7 / 1");
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
    const cellRead = await inspectCellReadApi();
    failures.push(...cellRead.failures);
    const existingRuleTransactions = await inspectExistingRuleTransactionApi();
    failures.push(...existingRuleTransactions.failures);
    const remainingRuleTransactions = await inspectRemainingRuleTransactionApi();
    failures.push(...remainingRuleTransactions.failures);
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
        initialMapIdentity: initialSummary.mapIdentity,
        mapIdentity: beforeSummary.mapIdentity,
        mapRevision: beforeSummary.mapRevision,
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
      cellRead,
      existingRuleTransactions,
      remainingRuleTransactions,
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

    async function inspectCellReadApi() {
      const cellFailures = [];
      const before = captureReadonlyState();
      const queryCall = api.cells.query({
        space: "grid",
        filter: {land: true},
        fields: ["id", "height", "featureId", "stateId", "consistency"],
        limit: 1
      });
      const query = unwrap(queryCall, "cells.query");
      const gridRef = {space: "grid", id: query.items[0]?.id};
      const grid = unwrap(api.cells.get(gridRef, {
        includeGeometry: true,
        includeNeighbors: true,
        includeDiagnostics: true
      }), "cells.get.grid");
      const packRef = {space: "pack", id: grid.mapping.primaryPackCell};
      const pack = unwrap(api.cells.get(packRef, {includeDiagnostics: true}), "cells.get.pack");
      const neighbors = unwrap(api.cells.neighbors(gridRef, {depth: 2, limit: 64}), "cells.neighbors");
      const world = unwrap(api.cells.getAtPoint({
        coordinateSpace: "world",
        x: grid.center.x,
        y: grid.center.y
      }), "cells.getAtPoint.world");
      const renderer = window.__webglGeneratorApp?.renderer;
      const canvas = document.getElementById("map-canvas");
      const rect = canvas?.getBoundingClientRect();
      const local = renderer?.worldToScreen?.(grid.center.x, grid.center.y, rect);
      const client = unwrap(api.cells.getAtPoint({
        coordinateSpace: "client",
        x: Number(rect?.left || 0) + Number(local?.x || 0),
        y: Number(rect?.top || 0) + Number(local?.y || 0)
      }), "cells.getAtPoint.client");
      const after = captureReadonlyState();
      const tamperedCursor = query.nextCursor ? `${query.nextCursor.slice(0, -1)}x` : "";
      const tampered = api.cells.query({
        space: "grid",
        filter: {land: true},
        fields: ["id", "height", "featureId", "stateId", "consistency"],
        limit: 1,
        cursor: tamperedCursor
      });
      const crossFilter = api.cells.query({
        space: "grid",
        filter: {land: false},
        fields: ["id", "height", "featureId", "stateId", "consistency"],
        limit: 1,
        cursor: query.nextCursor
      });
      const descriptions = ["cells.get", "cells.getAtPoint", "cells.neighbors", "cells.query"]
        .map(method => unwrap(api.info.describe(method), `info.describe.${method}`));

      if (!query.items.length || !query.nextCursor) cellFailures.push("cells.query 没有返回可分页陆地结果");
      if (queryCall.metadata?.action !== "cells.query" || queryCall.metadata?.readonly !== true || !queryCall.metadata?.mapIdentity || queryCall.metadata?.mapRevision !== before.mapRevision) {
        cellFailures.push("Cells 只读包络 metadata 缺少 action / readonly / identity / revision");
      }
      if (grid.ref?.space !== "grid" || grid.ref?.id !== gridRef.id) cellFailures.push("cells.get Grid 引用失真");
      if (!Array.isArray(grid.geometry?.vertices) || grid.geometry.vertices.length < 3) cellFailures.push("cells.get 显式 geometry 缺失");
      if (!Number.isInteger(packRef.id) || pack.mapping?.gridCell !== gridRef.id) cellFailures.push("Grid / Pack 映射没有往返");
      if (world.found !== true || world.cell?.ref?.id !== gridRef.id) cellFailures.push("世界点没有命中同一 Grid cell");
      if (client.found !== true || client.cell?.ref?.id !== gridRef.id) cellFailures.push("client 点没有命中同一 Grid cell");
      if (!neighbors.returned || neighbors.returned > 64) cellFailures.push("邻接查询没有遵守非空与 limit");
      if (JSON.stringify(before) !== JSON.stringify(after)) cellFailures.push("Cells 只读调用改变了 checksum、revision、历史、选择、相机或 pick");
      if (tampered.ok !== false || tampered.error?.code !== "cursor-invalid") cellFailures.push("篡改 Cell cursor 没有稳定拒绝");
      if (crossFilter.ok !== false || crossFilter.error?.code !== "cursor-stale") cellFailures.push("跨 filter Cell cursor 没有失效");
      if (descriptions.some(description => description.metadata?.capabilityGroup !== "cells.read")) cellFailures.push("Cells 方法没有进入 cells.read 能力组");
      if (descriptions.some(description => description.jsonSerializable !== true)) cellFailures.push("Cells 方法没有声明 JSON 可序列化");
      if (descriptions.some(description => !description.resultSchema?.properties?.metadata?.required?.includes("mapRevision"))) {
        cellFailures.push("Cells 自描述结果 schema 没有公开 revision metadata");
      }

      const statePage = unwrap(api.objects.list("state", {limit: 1, fields: ["id", "name"]}), "objects.list.state");
      const state = statePage.items[0];
      const beforeWriteRevision = unwrap(api.info.mapSummary(), "info.mapSummary.beforeWrite");
      const rename = unwrap(api.edit.states.rename(state.id, `${state.name}·Cell验收`), "edit.states.rename.cellRevision");
      const afterWriteRevision = unwrap(api.info.mapSummary(), "info.mapSummary.afterWrite");
      const staleAfterWrite = api.cells.query({
        space: "grid",
        filter: {land: true},
        fields: ["id", "height", "featureId", "stateId", "consistency"],
        limit: 1,
        cursor: query.nextCursor
      });
      const undo = unwrap(api.history.undo(), "history.undo.cellRevision");
      const afterUndoRevision = unwrap(api.info.mapSummary(), "info.mapSummary.afterUndo");
      const noopPage = unwrap(api.cells.query({
        space: "grid",
        filter: {land: true},
        fields: ["id"],
        limit: 1
      }), "cells.query.noopCursor");
      const beforeNoopRevision = unwrap(api.info.mapSummary(), "info.mapSummary.beforeNoop");
      const noopRename = unwrap(api.edit.states.rename(state.id, state.name), "edit.states.rename.noop");
      const afterNoopRevision = unwrap(api.info.mapSummary(), "info.mapSummary.afterNoop");
      const cursorAfterNoop = api.cells.query({
        space: "grid",
        filter: {land: true},
        fields: ["id"],
        limit: 1,
        cursor: noopPage.nextCursor
      });

      if (rename.executed !== true || afterWriteRevision.mapRevision !== beforeWriteRevision.mapRevision + 1) cellFailures.push("既有成功 map write 没有令 revision 恰好 +1");
      if (staleAfterWrite.ok !== false || staleAfterWrite.error?.code !== "cursor-stale") cellFailures.push("既有 map write 后旧 Cell cursor 没有失效");
      if (undo.executed !== true || afterUndoRevision.mapRevision !== afterWriteRevision.mapRevision + 1) cellFailures.push("undo 没有令 revision 恰好 +1");
      if (noopRename.executed !== false || afterNoopRevision.mapRevision !== beforeNoopRevision.mapRevision) cellFailures.push("no-op 错误改变了 revision");
      if (cursorAfterNoop.ok !== true) cellFailures.push("no-op 错误使 Cell cursor 失效");

      const actionRegistry = unwrap(api.cells.actions(), "cells.actions");
      const structuralInspection = unwrap(api.cells.inspectAction("markers.createAtCell", {
        cell: packRef,
        name: "浏览器验收标记"
      }), "cells.inspectAction");
      const geometryXs = grid.geometry.vertices.map(point => point.x);
      const geometryYs = grid.geometry.vertices.map(point => point.y);
      const diagnosticBbox = {
        minX: Math.min(...geometryXs),
        minY: Math.min(...geometryYs),
        maxX: Math.max(...geometryXs),
        maxY: Math.max(...geometryYs)
      };
      const scan = unwrap(await api.cells.scan({
        space: "grid",
        checks: ["terrain-consistency", "pack-mapping", "political-owner-range"],
        filter: {bbox: diagnosticBbox},
        fields: ["id", "height", "stateId", "consistency"],
        limit: 20
      }), "cells.scan");
      if (actionRegistry.length !== 34 || new Set(actionRegistry.map(item => item.actionId)).size !== 34) {
        cellFailures.push("cells.actions 没有返回 34 条唯一动作");
      }
      if (structuralInspection.allowed !== true || structuralInspection.inspectionLevel !== "spatial-input" || !structuralInspection.inspectionToken) {
        cellFailures.push("cells.inspectAction 没有返回结构预检与 token");
      }
      if (scan.cancelled || scan.code !== "scan-complete" || scan.count > 20) {
        cellFailures.push("cells.scan bbox / limit 结果异常");
      }

      unwrap(api.layers.setVisible("gridCells", false), "layers.setVisible.gridCells.off.initial");
      await waitUntil(() => window.__webglGeneratorApp?.renderer?.getStats?.()?.draw?.gridCellsDrawCalls === 0);
      const disabledStats = renderer?.getStats?.() || {};
      const gridLocate = unwrap(api.cells.locate(gridRef, {fit: true, flash: true, openLayer: true}), "cells.locate.grid");
      await waitUntil(() => window.__webglGeneratorApp?.renderer?.getStats?.()?.diagnostics?.gridCells?.ready === true);
      const packLocate = unwrap(api.cells.locate(packRef, {fit: false, flash: true, openLayer: true}), "cells.locate.pack");
      await waitUntil(() => window.__webglGeneratorApp?.renderer?.getStats?.()?.draw?.gridCellsDrawCalls === 1);
      const enabledStats = renderer?.getStats?.() || {};
      const forcedIdVisible = Boolean(document.querySelector(`.grid-cell-diagnostic-label[data-grid-cell-id="${gridRef.id}"]`));
      if (disabledStats.draw?.gridCellsDrawCalls !== 0) cellFailures.push("Grid Cells 图层关闭时仍增加 draw call");
      if (gridLocate.gridRef?.id !== gridRef.id || packLocate.gridRef?.id !== gridRef.id) cellFailures.push("Grid / Pack 定位没有落到同一视觉 cell");
      if (JSON.stringify(gridLocate.camera?.before) === JSON.stringify(gridLocate.camera?.after)) cellFailures.push("cells.locate 没有调整相机");
      if (!enabledStats.diagnostics?.gridCells?.ready || enabledStats.draw?.gridCellsDrawCalls !== 1) cellFailures.push("Grid Cells 图层没有完成构建与绘制");
      if ((enabledStats.diagnostics?.gridCells?.edges || 0) <= 0 || (enabledStats.diagnostics?.gridCells?.bufferBytes || 0) <= 0) cellFailures.push("Grid Cells 诊断统计缺少共享边或 buffer 字节");
      if (enabledStats.draw?.glError !== 0) cellFailures.push(`Grid Cells 开启后 WebGL error 非 0：${enabledStats.draw?.glError}`);
      if (!forcedIdVisible) cellFailures.push("cells.locate 没有强制显示目标 Grid Cell ID");
      renderer?.clearGridCellDiagnosticHighlight?.({draw: false});
      unwrap(api.layers.setVisible("gridCells", false), "layers.setVisible.gridCells.off.final");
      await waitUntil(() => window.__webglGeneratorApp?.renderer?.getStats?.()?.draw?.gridCellsDrawCalls === 0);

      const createAtCell = [];
      const createCandidates = unwrap(api.cells.query({
        space: "grid",
        filter: {land: true},
        fields: ["id"],
        limit: 1000
      }), "cells.query.createCandidates").items;
      for (const domain of ["states", "provinces", "cities"]) {
        let inspection = null;
        for (const candidate of createCandidates) {
          const next = unwrap(api.edit[domain].inspectCreateAtCell({
            cell: {space: "grid", id: candidate.id}
          }), `edit.${domain}.inspectCreateAtCell`);
          if (next.allowed) {
            inspection = next;
            break;
          }
        }
        if (!inspection) {
          cellFailures.push(`edit.${domain}.inspectCreateAtCell 固定图找不到合法 cell`);
          continue;
        }
        const beforeCreate = unwrap(api.info.mapSummary(), `info.mapSummary.${domain}.beforeCreate`);
        const created = unwrap(api.edit[domain].createAtCell({
          cell: inspection.cell.ref,
          inspectionToken: inspection.inspectionToken,
          expectedRevision: inspection.expectedRevision
        }), `edit.${domain}.createAtCell`);
        const afterCreate = unwrap(api.info.mapSummary(), `info.mapSummary.${domain}.afterCreate`);
        const stale = unwrap(api.edit[domain].createAtCell({
          cell: inspection.cell.ref,
          inspectionToken: inspection.inspectionToken,
          expectedRevision: inspection.expectedRevision
        }), `edit.${domain}.createAtCell.stale`);
        const restored = unwrap(api.history.undo(), `history.undo.${domain}.createAtCell`);
        if (!created.executed || created.code !== "created" || afterCreate.mapRevision !== beforeCreate.mapRevision + 1) {
          cellFailures.push(`edit.${domain}.createAtCell 没有恰好写入一次`);
        }
        if (stale.executed !== false || stale.code !== "inspection-stale") {
          cellFailures.push(`edit.${domain}.createAtCell 没有拒绝陈旧 token`);
        }
        if (!restored.executed) cellFailures.push(`edit.${domain}.createAtCell 无法撤销`);
        createAtCell.push({
          domain,
          gridCell: inspection.cell.ref.id,
          code: created.code,
          staleCode: stale.code,
          revisionBefore: beforeCreate.mapRevision,
          revisionAfter: afterCreate.mapRevision
        });
      }

      return {
        gridRef,
        packRef,
        worldRef: world.cell?.ref || null,
        clientRef: client.cell?.ref || null,
        neighbors: neighbors.returned,
        cursorTamperCode: tampered.error?.code || "",
        cursorCrossFilterCode: crossFilter.error?.code || "",
        revision: {
          before: beforeWriteRevision.mapRevision,
          afterWrite: afterWriteRevision.mapRevision,
          afterUndo: afterUndoRevision.mapRevision,
          afterNoop: afterNoopRevision.mapRevision
        },
        readonlyStateStable: JSON.stringify(before) === JSON.stringify(after),
        descriptions: descriptions.length,
        diagnostics: {
          disabledDrawCalls: disabledStats.draw?.gridCellsDrawCalls ?? null,
          enabledDrawCalls: enabledStats.draw?.gridCellsDrawCalls ?? null,
          edges: enabledStats.diagnostics?.gridCells?.edges || 0,
          bufferBytes: enabledStats.diagnostics?.gridCells?.bufferBytes || 0,
          forcedIdVisible,
          gridLocate: gridLocate.gridRef,
          packLocate: packLocate.gridRef
        },
        scan: {
          code: scan.code,
          scanned: scan.scanned,
          hits: scan.totalHits
        },
        actionRegistry: {
          actions: actionRegistry.length,
          structuralCode: structuralInspection.code,
          semanticLayer: structuralInspection.action?.semanticLayer || null
        },
        createAtCell,
        failures: cellFailures,
        passed: cellFailures.length === 0
      };

      function captureReadonlyState() {
        const summary = unwrap(api.info.mapSummary(), "info.mapSummary.cellsReadonly");
        const history = unwrap(api.history.get(), "history.get.cellsReadonly");
        const selection = unwrap(api.selection.get(), "selection.get.cellsReadonly");
        const stats = window.__webglGeneratorApp?.renderer?.getStats?.() || {};
        return {
          checksum: summary.checksum,
          mapIdentity: summary.mapIdentity,
          mapRevision: summary.mapRevision,
          history,
          selection,
          camera: stats.camera || null,
          pick: window.__webglGeneratorApp?.pick || null
        };
      }

      async function waitUntil(predicate, waitMs = 15000) {
        const deadline = performance.now() + waitMs;
        while (performance.now() < deadline) {
          if (predicate()) return;
          await new Promise(resolve => setTimeout(resolve, 16));
        }
        throw new Error("等待 Cell 浏览器状态超时");
      }
    }

    async function inspectExistingRuleTransactionApi() {
      const ruleFailures = [];
      const evidence = {};
      const inspectionFields = [
        "allowed", "code", "summary", "normalizedInput", "affected", "requiresConfirm",
        "expectedRevision", "inspectionToken", "inspectorSchemaVersion"
      ];
      for (const [method, actionCode] of [
        ["edit.height.inspectChanges", "height-changes-empty"],
        ["edit.biomes.inspectAssignment", "invalid-biome"],
        ["edit.rivers.inspectCreate", "invalid-source"],
        ["edit.cities.inspectDelete", "delete-not-found"],
        ["edit.zones.inspectCreate", "occupied-cell"]
      ]) {
        const description = unwrap(api.info.describe(method), `info.describe.${method}`);
        const required = description.resultSchema?.properties?.data?.required || [];
        if (inspectionFields.some(field => !required.includes(field))) ruleFailures.push(`${method} 缺少统一预检结果字段`);
        if (!description.businessCodes?.includes(actionCode)) ruleFailures.push(`${method} 缺少 ${actionCode}`);
      }

      const initialCell = unwrap(api.cells.get({space: "grid", id: 0}), "rules.height.initial");
      const initialHeight = Number(initialCell.terrain.height);
      const nextHeight = initialHeight === 100 ? 99 : initialHeight + 1;
      const changes = [{gridCell: 0, after: nextHeight}];
      const heightInspection = unwrap(api.edit.height.inspectChanges(changes), "rules.height.inspect");
      const revisionBefore = unwrap(api.info.mapSummary(), "rules.height.revision.before").mapRevision;
      const mismatch = api.edit.height.applyChanges(
        [{gridCell: 0, after: nextHeight === 100 ? 99 : nextHeight + 1}],
        inspectionOptions(heightInspection)
      );
      if (mismatch?.ok !== false || mismatch.error?.code !== "inspection-input-mismatch") ruleFailures.push("高度公开执行没有拒绝输入错配 token");
      const heightApplied = unwrap(api.edit.height.applyChanges(changes, inspectionOptions(heightInspection)), "rules.height.apply");
      const revisionAfter = unwrap(api.info.mapSummary(), "rules.height.revision.after").mapRevision;
      if (!heightApplied.executed || revisionAfter !== revisionBefore + 1) ruleFailures.push("高度公开执行没有恰好推进一次 revision");
      if (Number(unwrap(api.cells.get({space: "grid", id: 0}), "rules.height.changed").terrain.height) !== nextHeight) ruleFailures.push("高度公开执行没有落图");
      unwrap(api.history.undo(), "rules.height.undo");
      if (Number(unwrap(api.cells.get({space: "grid", id: 0}), "rules.height.restored").terrain.height) !== initialHeight) ruleFailures.push("高度公开执行撤销没有恢复");
      const legacyHeight = initialHeight === 0 ? 1 : initialHeight - 1;
      const legacy = unwrap(api.edit.height.applyChanges([{gridCell: 0, after: legacyHeight}]), "rules.height.legacy");
      if (!legacy.executed) ruleFailures.push("高度旧公开调用不再执行");
      unwrap(api.history.undo(), "rules.height.legacy.undo");
      evidence.height = {mismatchCode: mismatch?.error?.code || "", tokenExecuted: heightApplied.executed, legacyExecuted: legacy.executed};

      const packCells = unwrap(api.cells.query({
        space: "pack",
        filter: {land: true},
        fields: ["id", "height"],
        limit: 1000
      }), "rules.packCells").items.sort((left, right) => Number(right.height) - Number(left.height));
      let riverSample = null;
      for (const cell of packCells) {
        const input = {sourcePackCell: Number(cell.id)};
        const inspection = unwrap(api.edit.rivers.inspectCreate(input), "rules.river.inspect");
        if (inspection.allowed) {
          riverSample = {input, inspection};
          break;
        }
      }
      if (!riverSample) {
        ruleFailures.push("生产图找不到合法河流创建样本");
      } else {
        const created = unwrap(api.edit.rivers.create({...riverSample.input, ...inspectionOptions(riverSample.inspection)}), "rules.river.create");
        const riverId = Number(created.result?.riverId);
        if (!created.executed || !Number.isInteger(riverId) || !objectExists({kind: "river", id: riverId})) ruleFailures.push("河流公开创建没有落图");
        unwrap(api.history.undo(), "rules.river.undo");
        if (objectExists({kind: "river", id: riverId})) ruleFailures.push("河流公开创建撤销没有恢复");
        evidence.creation = {kind: "river", id: riverId, executed: created.executed};
      }

      const landCells = unwrap(api.cells.query({
        space: "grid",
        filter: {land: true},
        fields: ["id", "biomeId"],
        limit: 100
      }), "rules.landCells").items;
      const biomeCell = landCells[0];
      const targetBiome = unwrap(api.climate.getBiomes(), "rules.biomes.catalog").entries
        .find(item => Number(item.id) > 0 && Number(item.id) !== Number(biomeCell?.biomeId));
      if (!biomeCell || !targetBiome) {
        ruleFailures.push("生产图找不到生物群系样本");
      } else {
        const biomeOptions = {scope: "land"};
        const inspection = unwrap(api.edit.biomes.inspectAssignment(Number(targetBiome.id), [Number(biomeCell.id)], biomeOptions), "rules.biomes.inspect");
        const assigned = unwrap(api.edit.biomes.assignCells(
          Number(targetBiome.id),
          [Number(biomeCell.id)],
          {...biomeOptions, ...inspectionOptions(inspection)}
        ), "rules.biomes.assign");
        if (!assigned.executed) ruleFailures.push("生物群系公开执行没有落图");
        unwrap(api.history.undo(), "rules.biomes.undo");
        const restored = unwrap(api.cells.get({space: "grid", id: Number(biomeCell.id)}), "rules.biomes.restored");
        if (Number(restored.climate.biomeId) !== Number(biomeCell.biomeId)) ruleFailures.push("生物群系撤销没有恢复");
        evidence.biome = {gridCell: Number(biomeCell.id), target: Number(targetBiome.id), executed: assigned.executed};
      }

      const city = unwrap(api.objects.list("city", {limit: 100}), "rules.cities.list").items[0];
      if (!city) {
        ruleFailures.push("生产图找不到城市删除样本");
      } else {
        const inspection = unwrap(api.edit.cities.inspectDelete(Number(city.id)), "rules.cities.inspectDelete");
        const deleted = unwrap(api.edit.cities.delete(Number(city.id), {
          confirm: true,
          ...inspectionOptions(inspection)
        }), "rules.cities.delete");
        const afterDeleteInspection = unwrap(api.edit.cities.inspectDelete(Number(city.id)), "rules.cities.inspectDelete.after");
        if (!deleted.executed || afterDeleteInspection.allowed || afterDeleteInspection.code !== "delete-not-found") ruleFailures.push("城市危险删除没有落图");
        unwrap(api.history.undo(), "rules.cities.undo");
        const afterUndoInspection = unwrap(api.edit.cities.inspectDelete(Number(city.id)), "rules.cities.inspectDelete.undo");
        if (!afterUndoInspection.allowed) ruleFailures.push("城市危险删除撤销没有恢复");
        evidence.deletion = {kind: "city", id: Number(city.id), confirmPreserved: deleted.executed};
      }

      let zoneSample = null;
      for (const cell of packCells) {
        const input = {packCells: [Number(cell.id)], name: "规则事务验收地区"};
        const inspection = unwrap(api.edit.zones.inspectCreate(input), "rules.zones.inspectCreate");
        if (inspection.allowed) {
          zoneSample = {input, inspection};
          break;
        }
      }
      if (!zoneSample) {
        ruleFailures.push("生产图找不到地区创建样本");
      } else {
        const created = unwrap(api.edit.zones.create({...zoneSample.input, ...inspectionOptions(zoneSample.inspection)}), "rules.zones.create");
        const zoneId = Number(created.result?.zoneId);
        if (!created.executed || !objectExists({kind: "zone", id: zoneId})) ruleFailures.push("地区公开创建没有落图");
        const deleteInspection = unwrap(api.edit.zones.inspectDelete(zoneId), "rules.zones.inspectDelete");
        const deleted = unwrap(api.edit.zones.delete(zoneId, inspectionOptions(deleteInspection)), "rules.zones.delete");
        if (!deleted.executed || objectExists({kind: "zone", id: zoneId})) ruleFailures.push("地区公开删除没有落图");
        unwrap(api.history.undo(), "rules.zones.delete.undo");
        if (!objectExists({kind: "zone", id: zoneId})) ruleFailures.push("地区删除撤销没有恢复");
        unwrap(api.history.undo(), "rules.zones.create.undo");
        if (objectExists({kind: "zone", id: zoneId})) ruleFailures.push("地区创建撤销没有恢复");
        evidence.zone = {id: zoneId, create: created.executed, delete: deleted.executed};
      }

      return {passed: ruleFailures.length === 0, evidence, failures: ruleFailures};

      function inspectionOptions(inspection) {
        return {
          inspectionToken: inspection.inspectionToken,
          expectedRevision: inspection.expectedRevision,
          inspectorSchemaVersion: inspection.inspectorSchemaVersion
        };
      }

      function objectExists(reference) {
        const result = api.objects.get(reference);
        return result?.ok === true && result.data != null;
      }
    }

    async function inspectRemainingRuleTransactionApi() {
      const ruleFailures = [];
      const evidence = {};
      const states = unwrap(api.objects.list("state", {limit: 200}), "remaining.states").items
        .filter(item => Number(item.id) > 0);
      const cities = unwrap(api.objects.list("city", {limit: 200}), "remaining.cities").items
        .filter(item => Number(item.id) > 0);

      const capitalSample = states
        .map(state => ({
          state,
          city: cities.find(city => Number(city.stateId) === Number(state.id) && Number(city.id) !== Number(state.capitalId))
        }))
        .find(sample => sample.city);
      if (!capitalSample) {
        ruleFailures.push("生产图找不到迁都样本");
      } else {
        const inspection = unwrap(
          api.edit.states.inspectCapitalChange(Number(capitalSample.state.id), Number(capitalSample.city.id)),
          "remaining.capital.inspect"
        );
        const executed = unwrap(api.edit.states.setCapital(
          Number(capitalSample.state.id),
          Number(capitalSample.city.id),
          inspectionOptions(inspection)
        ), "remaining.capital.execute");
        if (!executed.executed) ruleFailures.push("迁都公开令牌执行没有落图");
        unwrap(api.history.undo(), "remaining.capital.undo");
        evidence.capital = {stateId: Number(capitalSample.state.id), cityId: Number(capitalSample.city.id), executed: executed.executed};
      }

      if (states.length < 2) {
        ruleFailures.push("生产图找不到双边外交样本");
      } else {
        let diplomacySample = null;
        for (const relation of ["Enemy", "Friendly", "Neutral"]) {
          const inspectionResult = unwrap(
            api.edit.diplomacy.inspectRelation(Number(states[0].id), Number(states[1].id), relation),
            `remaining.diplomacy.inspect.${relation}`
          );
          if (inspectionResult.allowed) {
            diplomacySample = {relation, inspection: inspectionResult};
            break;
          }
        }
        if (!diplomacySample) {
          ruleFailures.push("生产图找不到可变更外交关系");
        } else {
          const withoutConfirm = api.edit.diplomacy.setRelation(
            Number(states[0].id),
            Number(states[1].id),
            diplomacySample.relation,
            inspectionOptions(diplomacySample.inspection)
          );
          if (diplomacySample.inspection.requiresConfirm && (withoutConfirm?.ok !== false || withoutConfirm.error?.code !== "confirmation_required")) {
            ruleFailures.push("外交高影响变更没有保留确认门禁");
          }
          const executed = unwrap(api.edit.diplomacy.setRelation(
            Number(states[0].id),
            Number(states[1].id),
            diplomacySample.relation,
            {
              ...inspectionOptions(diplomacySample.inspection),
              ...(diplomacySample.inspection.requiresConfirm ? {confirm: true} : {})
            }
          ), "remaining.diplomacy.execute");
          if (!executed.executed) ruleFailures.push("外交公开令牌执行没有落图");
          unwrap(api.history.undo(), "remaining.diplomacy.undo");
          evidence.diplomacy = {
            pair: [Number(states[0].id), Number(states[1].id)],
            relation: diplomacySample.relation,
            requiresConfirm: diplomacySample.inspection.requiresConfirm,
            executed: executed.executed
          };
        }
      }

      const regiment = unwrap(api.objects.list("military", {limit: 200}), "remaining.military").items[0];
      if (!regiment) {
        ruleFailures.push("生产图找不到军团态势样本");
      } else {
        const status = ["marching", "resting", "garrisoned"].find(value => value !== regiment.status) || "marching";
        const target = {
          id: regiment.id,
          stateId: Number(regiment.stateId),
          regimentId: Number(regiment.regimentId)
        };
        const inspection = unwrap(api.edit.military.inspectStatus(target, status), "remaining.military.inspect");
        const executed = unwrap(api.edit.military.setStatus(target, status, inspectionOptions(inspection)), "remaining.military.execute");
        if (!executed.executed) ruleFailures.push("军团态势公开令牌执行没有落图");
        unwrap(api.history.undo(), "remaining.military.undo");
        evidence.military = {id: regiment.id, status, executed: executed.executed};
      }

      if (!states.length) {
        ruleFailures.push("生产图找不到集合导入备注目标");
      } else {
        const stateId = Number(states[0].id);
        const noteDocument = {
          type: "webgl-generator-notes-summary",
          version: 1,
          notes: [{
            id: `state:${stateId}`,
            kind: "state",
            objectId: stateId,
            name: states[0].name || `国家 #${stateId}`,
            body: "规则事务浏览器验收",
            format: "plain"
          }]
        };
        const importOptions = {mode: "replace"};
        const inspection = unwrap(api.data.inspectCollectionImport("notes", noteDocument, importOptions), "remaining.collection.inspect");
        const withoutConfirm = api.edit.notes.import(noteDocument, {
          ...importOptions,
          ...inspectionOptions(inspection)
        });
        if (withoutConfirm?.ok !== false || withoutConfirm.error?.code !== "confirmation_required") {
          ruleFailures.push("集合替换导入没有保留确认门禁");
        }
        const executed = unwrap(api.edit.notes.import(noteDocument, {
          ...importOptions,
          confirm: true,
          ...inspectionOptions(inspection)
        }), "remaining.collection.execute");
        if (!executed.executed) ruleFailures.push("集合导入公开令牌执行没有落图");
        unwrap(api.history.undo(), "remaining.collection.undo");
        evidence.collection = {kind: "notes", mode: "replace", requiresConfirm: inspection.requiresConfirm, executed: executed.executed};
      }

      return {passed: ruleFailures.length === 0, evidence, failures: ruleFailures};

      function inspectionOptions(inspection) {
        return {
          inspectionToken: inspection.inspectionToken,
          expectedRevision: inspection.expectedRevision,
          inspectorSchemaVersion: inspection.inspectorSchemaVersion
        };
      }
    }
  }, {cells, seed, template, expectedConfirmRequired});
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
  const gridCellLayerControl = page.locator('[data-layer="gridCells"]');
  await gridCellLayerControl.waitFor({state: "visible"});
  await gridCellLayerControl.click();
  await page.waitForFunction(() => window.webglGeneratorApi.layers.get().data.layers.gridCells === true);
  const gridCellsEnabledByUi = await page.evaluate(() => ({
    layerVisible: window.webglGeneratorApi.layers.get().data.layers.gridCells,
    ariaPressed: document.querySelector('[data-layer="gridCells"]')?.getAttribute("aria-pressed")
  }));
  await gridCellLayerControl.click();
  await page.waitForFunction(() => window.webglGeneratorApi.layers.get().data.layers.gridCells === false);
  const gridCellsDisabledByUi = await page.evaluate(() => ({
    layerVisible: window.webglGeneratorApi.layers.get().data.layers.gridCells,
    ariaPressed: document.querySelector('[data-layer="gridCells"]')?.getAttribute("aria-pressed"),
    drawCalls: window.__webglGeneratorApp?.renderer?.getStats?.()?.draw?.gridCellsDrawCalls
  }));
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
    gridCells: {
      enabledByUi: gridCellsEnabledByUi,
      disabledByUi: gridCellsDisabledByUi
    },
    uiResult,
    apiResult,
    restored,
    passed: uiResult === true
      && apiResult.snapshot === false
      && apiResult.ariaPressed === "false"
      && gridCellsEnabledByUi.layerVisible === true
      && gridCellsEnabledByUi.ariaPressed === "true"
      && gridCellsDisabledByUi.layerVisible === false
      && gridCellsDisabledByUi.ariaPressed === "false"
      && gridCellsDisabledByUi.drawCalls === 0
      && restored
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
    existingRuleTransactions: report.existingRuleTransactions,
    remainingRuleTransactions: report.remainingRuleTransactions,
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
  lines.push(`- 既有规则事务公开链：${report.existingRuleTransactions.passed ? "通过" : "失败"}`);
  lines.push(`- 规则事务证据：\`${JSON.stringify(report.existingRuleTransactions.evidence)}\``);
  lines.push(`- 第 207 项剩余规则事务公开链：${report.remainingRuleTransactions.passed ? "通过" : "失败"}`);
  lines.push(`- 剩余规则事务证据：\`${JSON.stringify(report.remainingRuleTransactions.evidence)}\``);
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
