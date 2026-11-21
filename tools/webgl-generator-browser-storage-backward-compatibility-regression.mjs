#!/usr/bin/env node
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {createReadStream, existsSync, statSync} from "node:fs";
import {readFile} from "node:fs/promises";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {dirname, extname, join, normalize, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {MAP_SCHEMA_VERSION} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {LABEL_LAYOUT_VERSION} from "../app/webgl-generator/src/runtime/label-layout-registry.js";
import {closeTask350BrowserResource, createTask350BrowserArtifact} from "./task-350-browser-artifact.mjs";
import {collectTask350LongTaskWindow, partitionTask350StartupLongTasks, prepareTask350LongTaskObserver, resetTask350LongTaskWindow, summarizeTask350LongTasks} from "./task-350-browser-long-task.mjs";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const distDir = join(rootDir, "dist", "webgl-generator");
const screenshotPath = join(rootDir, "docs", "generated", "screenshots", "browser-storage-old-v2-recovery.png");
const storageKey = "webgl-generator-current-map-v1";
const host = "127.0.0.1";
const port = 5472;
const evidence = createTask350BrowserArtifact("browser-storage-compatibility", {mode: "browser-persistence"});
let server;
let browser;
let thrownError = null;
const consoleErrors = [];
const healthEvents = [];
const pageErrors = [];
const setupLongTasks = [];
const startupBaselineLongTasks = [];
const reloadLongTasks = [];
const sharedStartupLongTasks = [];
const longTasks = [];
const finalReport = {
  ok: false,
  url: "http://" + host + ":" + port + "?healthClear=1",
  restored: null,
  currentRestore: null,
  fileImport: null,
  legacyWebfmgImport: null,
  missingBurgRestore: null,
  failedRestore: null,
  screenshotPath,
  consoleErrors,
  healthEvents,
  pageErrors,
  setupLongTasks,
  startupBaselineLongTasks,
  reloadLongTasks,
  sharedStartupLongTasks,
  longTasks,
  performance: {longTaskCount: 0, maxLongTaskMs: 0, overBudget: []}
};
const compactReport = {
  ok: false,
  restored: null,
  currentRestore: null,
  fileImport: null,
  legacyWebfmgImport: null,
  missingBurgRestore: null,
  failedRestore: null,
  screenshot: {path: screenshotPath, exists: false, bytes: 0},
  setupLongTasks,
  startupBaselineLongTasks,
  reloadLongTasks,
  sharedStartupLongTasks,
  longTasks,
  performance: finalReport.performance
};

try {
  evidence.setResult(finalReport, compactReport);
  assert.ok(existsSync(distDir), "构建产物不存在：" + distDir);
  evidence.mark("server-start", {active: "browser-storage-compatibility"});
  const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
  server = await startStaticServer();
  evidence.mark("browser-start", {active: "browser-storage-compatibility", complete: "server-start"});
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  await prepareTask350LongTaskObserver(page);
  page.setDefaultTimeout(45000);
  page.on("console", message => {
    if (message.type() !== "error") return;
    if (message.text().startsWith("[FMG health]")) healthEvents.push(message.text());
    else consoleErrors.push(message.text());
  });
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    window.__mapUpgradeNotices = [];
    window.__mapUpgradeConfirmCalls = [];
    window.confirm = message => {
      window.__mapUpgradeConfirmCalls.push(String(message));
      return false;
    };
    document.addEventListener("DOMContentLoaded", () => {
      const loading = document.getElementById("generation-loading");
      const toast = document.getElementById("map-toast");
      const capture = () => {
        const opening = loading && !loading.hidden && loading.textContent.includes("旧卷待整");
        const completed = toast && !toast.hidden && toast.textContent.includes("旧卷已依今制修整");
        const phase = opening ? "opening" : completed ? "completed" : "";
        if (!phase || window.__mapUpgradeNotices.at(-1)?.phase === phase) return;
        window.__mapUpgradeNotices.push({phase, seed: window.__webglGeneratorApp?.map?.metadata?.seed || null});
      };
      for (const element of [loading, toast]) {
        if (element) new MutationObserver(capture).observe(element, {attributes: true, childList: true, characterData: true, subtree: true});
      }
      capture();
    }, {once: true});
  });
  await page.goto("http://" + host + ":" + port + "?healthClear=1", {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 45000);
  evidence.mark("browser-evaluation", {active: "browser-storage-compatibility", complete: "browser-start"});
  setupLongTasks.push(...await collectTask350LongTaskWindow(page, "cold-startup-control"));
  await page.reload({waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 45000);
  startupBaselineLongTasks.push(...await collectTask350LongTaskWindow(page, "clean-reload-control"));
  assert.deepEqual(await page.evaluate(() => window.__mapUpgradeNotices), [], "无旧档的启动错误显示升级提示");
  await resetTask350LongTaskWindow(page);

  const legacyPreparation = await page.evaluate(async key => {
    const generated = await window.webglGeneratorApi.generate.newMap({confirm: true, seed: "browser-storage-legacy-v2", cellsTarget: 10000});
    if (!generated?.ok) throw new Error(generated?.error?.message || "兼容性地图生成失败");
    const exported = window.webglGeneratorApi.data.exportMap({download: false, includeText: true});
    if (!exported?.ok) throw new Error(exported?.error?.message || "兼容性地图导出失败");
    const document = JSON.parse(exported.data.text);
    const activeState = (document.map.pack?.states || []).find(state => state && !state.removed && Number(state.i ?? state.id) > 0);
    const expected = {
      seed: document.map.metadata?.seed || document.metadata?.seed,
      checksum: document.map.metadata?.checksum || document.metadata?.checksum,
      gridCells: document.map.metadata?.gridCells,
      stateName: activeState?.name || "",
      firstHeight: window.__webglGeneratorApp.map.grid?.cells?.h?.[0] ?? null,
      heightType: window.__webglGeneratorApp.map.grid?.cells?.h?.constructor?.name || ""
    };

    delete document.metadata.mapSchemaVersion;
    delete document.map.metadata.schemaVersion;
    delete document.map.notes;
    delete document.map.measurements;
    delete document.map.labels;
    delete document.map.visualTheme;
    delete document.map.diplomacy;
    delete document.map.oceanCurrents;
    document.map.display = {units: {distanceUnit: "km"}};
    const legacyText = JSON.stringify(document);
    const compressed = await new Response(
      new Blob([legacyText], {type: "application/json;charset=utf-8"}).stream().pipeThrough(new CompressionStream("gzip"))
    ).arrayBuffer();
    const bytes = new Uint8Array(compressed);
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    const data = btoa(binary);
    const envelope = {
      type: "webgl-generator-local-map-storage",
      version: 1,
      savedAt: "2026-01-01T00:00:00.000Z",
      originalBytes: legacyText.length,
      metadata: {
        seed: expected.seed,
        checksum: expected.checksum,
        gridCells: expected.gridCells,
        packCells: document.map.metadata?.packCells || 0
      },
      encoding: "gzip-base64",
      data,
      bytes: bytes.length
    };
    const raw = JSON.stringify(envelope);
    localStorage.setItem(key, raw);
    return {expected, raw};
  }, storageKey);
  setupLongTasks.push(...await collectTask350LongTaskWindow(page, "legacy-preparation"));

  await page.reload({waitUntil: "domcontentloaded"});
  await page.waitForFunction(seed => window.__webglGeneratorApp?.map?.metadata?.seed === seed, legacyPreparation.expected.seed);
  await waitForApiReady(page, 45000);
  const restored = await page.evaluate(({key, raw}) => {
    const map = window.__webglGeneratorApp.map;
    const activeState = (map.pack?.states || []).find(state => state && !state.removed && Number(state.i ?? state.id) > 0);
    return {
      seed: map.metadata?.seed,
      checksum: map.metadata?.checksum,
      gridCells: map.metadata?.gridCells,
      stateName: activeState?.name || "",
      firstHeight: map.grid?.cells?.h?.[0] ?? null,
      heightType: map.grid?.cells?.h?.constructor?.name || "",
      documentSchemaVersion: map.metadata?.schemaVersion,
      labelLayoutVersion: map.labels?.layout?.version,
      notesFormatVersion: map.notes?.metadata?.formatVersion,
      measurementVersion: map.measurements?.version,
      labelHiddenTables: [map.labels?.hidden?.city, map.labels?.hidden?.state, map.labels?.hidden?.province].map(Array.isArray),
      labelStylesAvailable: Boolean(map.labels?.styles && map.labels?.layout),
      visualThemeVersion: map.visualTheme?.version,
      diplomacyAvailable: Boolean(map.diplomacy?.metadata && Array.isArray(map.pack?.states?.find(state => state && Number(state.i ?? state.id) > 0)?.diplomacy)),
      oceanCurrentVersion: map.oceanCurrents?.version,
      customUnitsAvailable: Array.isArray(map.display?.units?.customUnits),
      brushRadii: map.display?.brushRadii,
      rawStorageUnchanged: localStorage.getItem(key) === raw,
      diagnostic: window.__webglGeneratorApp.lastMapImportDiagnostic,
      status: document.getElementById("file-operation-status")?.textContent || "",
      upgradeNotices: window.__mapUpgradeNotices,
      upgradeConfirmCalls: window.__mapUpgradeConfirmCalls
    };
  }, {key: storageKey, raw: legacyPreparation.raw});
  await page.screenshot({path: screenshotPath, fullPage: true});
  const legacyReloadLongTasks = await collectTask350LongTaskWindow(page, "legacy-restore");
  reloadLongTasks.push(...legacyReloadLongTasks);
  finalReport.restored = restored;
  compactReport.restored = restored;
  compactReport.screenshot = {path: screenshotPath, exists: existsSync(screenshotPath), bytes: statSync(screenshotPath).size};

  assert.equal(restored.seed, legacyPreparation.expected.seed, "旧 v2 浏览器存档没有恢复原 seed");
  assert.equal(restored.checksum, legacyPreparation.expected.checksum, "旧 v2 浏览器存档没有保留 checksum");
  assert.equal(restored.gridCells, legacyPreparation.expected.gridCells, "旧 v2 浏览器存档没有保留网格规模");
  assert.equal(restored.stateName, legacyPreparation.expected.stateName, "旧 v2 浏览器存档没有保留国家数据");
  assert.equal(restored.firstHeight, legacyPreparation.expected.firstHeight, "旧 v2 浏览器存档没有保留高度数据");
  assert.equal(restored.heightType, legacyPreparation.expected.heightType, "旧 v2 浏览器存档改变了高度数组类型");
  assert.equal(restored.documentSchemaVersion, MAP_SCHEMA_VERSION, "旧 v2 浏览器存档没有升级到当前地图 schema 版本");
  assert.equal(restored.labelLayoutVersion, LABEL_LAYOUT_VERSION, "旧 v2 浏览器存档没有升级到当前标签布局版本");
  assert.deepEqual(restored.brushRadii, {state: 28, province: 28, culture: 28, religion: 28, biome: 28, suitability: 28}, "旧 v2 浏览器存档没有补齐画笔大小");
  assert.equal(restored.notesFormatVersion, 1, "旧 v2 浏览器存档没有补回备注存储");
  assert.equal(restored.measurementVersion, 1, "旧 v2 浏览器存档没有补回测量存储");
  assert.deepEqual(restored.labelHiddenTables, [true, true, true], "旧 v2 浏览器存档没有补回标签隐藏表");
  assert.equal(restored.labelStylesAvailable, true, "旧 v2 浏览器存档没有补回标签样式与布局");
  assert.equal(restored.visualThemeVersion, 2, "旧 v2 浏览器存档没有补回视觉主题");
  assert.equal(restored.diplomacyAvailable, true, "旧 v2 浏览器存档没有补回外交数据");
  assert.equal(restored.oceanCurrentVersion, 1, "旧 v2 浏览器存档没有补回洋流模型");
  assert.equal(restored.customUnitsAvailable, true, "旧 v2 浏览器存档没有补回显示单位字段");
  assert.equal(restored.rawStorageUnchanged, true, "成功恢复时浏览器原始存档被改写");
  assert.equal(restored.diagnostic, null, "成功恢复旧 v2 存档时产生了导入诊断");
  assert.match(restored.status, /已恢复浏览器保存的地图/, "成功恢复旧 v2 存档后缺少状态反馈");
  assert.equal(restored.upgradeNotices.some(item => item.phase === "opening" && item.seed !== restored.seed), true, "旧存档未在地图替换前显示整理提示");
  assert.equal(restored.upgradeNotices.some(item => item.phase === "completed"), true, "旧存档整理成功后没有显示完成提示");
  assert.deepEqual(restored.upgradeConfirmCalls, [], "旧存档升级弹出了确认框");

  const savedCurrent = await page.evaluate(async () => window.webglGeneratorApi.data.saveBrowserMap());
  assert.equal(savedCurrent?.ok, true, "当前存档保存失败");
  await page.reload({waitUntil: "domcontentloaded"});
  await page.waitForFunction(seed => window.__webglGeneratorApp?.map?.metadata?.seed === seed, legacyPreparation.expected.seed);
  await waitForApiReady(page, 45000);
  const currentRestore = await page.evaluate(() => ({notices: window.__mapUpgradeNotices, confirms: window.__mapUpgradeConfirmCalls}));
  finalReport.currentRestore = currentRestore;
  compactReport.currentRestore = currentRestore;
  assert.deepEqual(currentRestore.notices, [], "当前版本存档打开时错误显示升级提示");
  assert.deepEqual(currentRestore.confirms, [], "当前版本存档恢复弹出了确认框");

  await page.evaluate(() => {
    const exported = window.webglGeneratorApi.data.exportMap({download: false, includeText: true});
    if (!exported?.ok) throw new Error(exported?.error?.message || "旧文件准备失败");
    const document = JSON.parse(exported.data.text);
    delete document.map.notes;
    window.__legacyImportFile = new File([JSON.stringify(document)], "旧图.json", {type: "application/json"});
  });
  await resetTask350LongTaskWindow(page);
  const fileImport = await page.evaluate(async () => {
    window.__mapUpgradeNotices.length = 0;
    const result = await window.webglGeneratorApi.data.importMap(window.__legacyImportFile, {confirm: true, source: "ui", toast: false});
    return {ok: result?.ok, notices: window.__mapUpgradeNotices, confirms: window.__mapUpgradeConfirmCalls,
      timings: result?.data?.timings || result?.timings || null};
  });
  const fileImportLongTasks = await collectTask350LongTaskWindow(page, "legacy-file-import");
  finalReport.fileImport = fileImport;
  compactReport.fileImport = fileImport;
  assert.equal(fileImport.ok, true, "旧文件没有自动整理并打开");
  assert.deepEqual(fileImport.notices.map(item => item.phase), ["opening", "completed"], "旧文件打开时缺少完整升级提示");
  assert.deepEqual(fileImport.confirms, [], "旧文件升级弹出了确认框");
  assert.equal(fileImport.timings?.workerTask?.canonicalDecodeMs, 0, "旧 JSON 文件仍在主线程完整解码");

  const missingBurgPreparation = await page.evaluate(async key => {
    const exported = window.webglGeneratorApi.data.exportMap({download: false, includeText: true});
    if (!exported?.ok) throw new Error(exported?.error?.message || "旧城镇固定图导出失败");
    const document = JSON.parse(exported.data.text);
    const city = document.map.settlements.cities.find(item => item && !item.removed && Number.isInteger(item.burgId));
    if (!city) throw new Error("旧城镇固定图缺少活动城市");
    document.map.pack.burgs[city.burgId] = null;
    document.map.pack.cells.burg.data[city.packCell] = 0;
    document.map.grid.cells.burg[city.cell] = -1;
    const text = JSON.stringify(document);
    const bytes = new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    const raw = JSON.stringify({type: "webgl-generator-local-map-storage", version: 1, savedAt: new Date(Date.now() + 60_000).toISOString(), originalBytes: text.length,
      metadata: {seed: document.map.metadata.seed}, encoding: "gzip-base64", data: btoa(binary), bytes: bytes.length});
    localStorage.setItem(key, raw);
    return {raw, cityId: city.id, burgId: city.burgId, name: city.name, population: city.population};
  }, storageKey);
  await resetTask350LongTaskWindow(page);
  await page.reload({waitUntil: "domcontentloaded"});
  await page.waitForFunction(({cityId, burgId}) => window.__webglGeneratorApp?.map?.pack?.burgs?.[burgId]?.cityId === cityId, missingBurgPreparation);
  await waitForApiReady(page, 45000);
  const missingBurgRestore = await page.evaluate(({key, preparation}) => {
    const map = window.__webglGeneratorApp.map;
    const city = map.settlements.cities[preparation.cityId];
    const burg = map.pack.burgs[preparation.burgId];
    return {name: city.name, population: city.population, burgCityId: burg.cityId, gridMirror: map.grid.cells.burg[city.cell], packMirror: map.pack.cells.burg[city.packCell], rawUnchanged: localStorage.getItem(key) === preparation.raw,
      diagnostic: window.__webglGeneratorApp.lastMapImportDiagnostic, detailDisplay: getComputedStyle(document.getElementById("file-operation-error-details")).display,
      upgradeNotices: window.__mapUpgradeNotices, upgradeConfirmCalls: window.__mapUpgradeConfirmCalls};
  }, {key: storageKey, preparation: missingBurgPreparation});
  finalReport.missingBurgRestore = missingBurgRestore;
  compactReport.missingBurgRestore = missingBurgRestore;
  const missingBurgLongTasks = await collectTask350LongTaskWindow(page, "missing-burg-restore");
  reloadLongTasks.push(...missingBurgLongTasks);
  assert.equal(missingBurgRestore.name, missingBurgPreparation.name, "旧档补全改变城市名称");
  assert.equal(missingBurgRestore.population, missingBurgPreparation.population, "旧档补全改变城市人口");
  assert.equal(missingBurgRestore.burgCityId, missingBurgPreparation.cityId, "旧档未补齐 burg");
  assert.equal(missingBurgRestore.gridMirror, missingBurgPreparation.cityId, "旧档未补齐 grid 镜像");
  assert.equal(missingBurgRestore.packMirror, missingBurgPreparation.burgId, "旧档未补齐 pack 镜像");
  assert.equal(missingBurgRestore.rawUnchanged, true, "旧档恢复覆盖了原始浏览器存档");
  assert.equal(missingBurgRestore.diagnostic, null, "可修复旧档产生了失败诊断");
  assert.equal(missingBurgRestore.detailDisplay, "none", "普通模式显示了技术诊断");
  assert.deepEqual(missingBurgRestore.upgradeNotices.map(item => item.phase), ["opening", "completed"], "旧城镇缺失同版修复没有完整升级提示");
  assert.deepEqual(missingBurgRestore.upgradeConfirmCalls, [], "同版城镇修复弹出了确认框");

  const directExportGuard = await page.evaluate(({burgId}) => {
    const map = window.__webglGeneratorApp.map;
    const burg = map.pack.burgs[burgId];
    try {
      map.pack.burgs[burgId] = null;
      const result = window.webglGeneratorApi.data.exportMap({download: false, includeText: true});
      return {ok: result?.ok, code: result?.error?.code, hasText: Boolean(result?.data?.text)};
    } finally {
      map.pack.burgs[burgId] = burg;
    }
  }, {burgId: missingBurgPreparation.burgId});
  finalReport.directExportGuard = directExportGuard;
  compactReport.directExportGuard = directExportGuard;
  assert.deepEqual(directExportGuard, {ok: false, code: "settlement_cell_identity_invalid", hasText: false}, "直接 JSON 导出不得绕过保存身份校验");

  const playableLegacyBinary = await readFile(new URL("./fixtures/webgl-map-v2-playable-legacy-notes.webfmg", import.meta.url));
  assert.equal(createHash("sha256").update(playableLegacyBinary).digest("hex"), "e0418f77d6aff1b5bc5e93926542b69bf242d2ee03672c7d84c1aac87393ded3", "完整旧结构 WEBFMG3 夹具被改写");
  await page.waitForFunction(() => document.getElementById("map-toast")?.hidden === true);
  await page.evaluate(base64 => {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    window.__legacyWebfmgFile = new File([bytes], "旧图.webfmg", {type: "application/gzip"});
  }, playableLegacyBinary.toString("base64"));
  await resetTask350LongTaskWindow(page);
  const legacyWebfmgImport = await page.evaluate(async () => {
    window.__mapUpgradeNotices.length = 0;
    const result = await window.webglGeneratorApi.data.importMap(window.__legacyWebfmgFile, {confirm: true, source: "ui", toast: false});
    return {ok: result?.ok, error: result?.error || null, notices: window.__mapUpgradeNotices,
      confirms: window.__mapUpgradeConfirmCalls, gridCells: window.__webglGeneratorApp.map?.grid?.points?.length || 0};
  });
  const legacyWebfmgLongTasks = await collectTask350LongTaskWindow(page, "legacy-webfmg-import");
  finalReport.legacyWebfmgImport = legacyWebfmgImport;
  compactReport.legacyWebfmgImport = legacyWebfmgImport;
  assert.equal(legacyWebfmgImport.ok, true, `完整旧结构 WEBFMG3 打开失败：${legacyWebfmgImport.error?.message || ""}`);
  assert.equal(legacyWebfmgImport.gridCells, 10004, "旧结构 WEBFMG3 地图规模未恢复");
  assert.deepEqual(legacyWebfmgImport.notices.map(item => item.phase), ["opening", "completed"], "完整旧结构 WEBFMG3 未显示完整升级提示");
  assert.deepEqual(legacyWebfmgImport.confirms, [], "完整旧结构 WEBFMG3 升级弹出了确认框");

  const corruptRaw = JSON.stringify({
    type: "webgl-generator-local-map-storage",
    version: 1,
    savedAt: new Date(Date.now() + 60_000).toISOString(),
    originalBytes: 12,
    metadata: {seed: "corrupt-browser-save"},
    encoding: "plain",
    data: "{broken-json",
    bytes: 12
  });
  await page.evaluate(({key, raw}) => localStorage.setItem(key, raw), {key: storageKey, raw: corruptRaw});
  await page.reload({waitUntil: "domcontentloaded"});
  await page.waitForFunction(() => Boolean(window.__webglGeneratorApp?.lastMapImportDiagnostic) && Boolean(window.__webglGeneratorApp?.map));
  await waitForApiReady(page, 45000);
  const failedRestore = await page.evaluate(({key, raw}) => ({
    rawStorageUnchanged: localStorage.getItem(key) === raw,
    diagnosticMessage: window.__webglGeneratorApp.lastMapImportDiagnostic?.error?.message || "",
    generatedSeed: window.__webglGeneratorApp.map?.metadata?.seed || "",
    status: document.getElementById("file-operation-status")?.textContent || "",
    detailDisplay: getComputedStyle(document.getElementById("file-operation-error-details")).display,
    diagnosticSource: window.__webglGeneratorApp.lastMapImportDiagnostic?.source,
    upgradeNotices: window.__mapUpgradeNotices
  }), {key: storageKey, raw: corruptRaw});
  const corruptReloadLongTasks = await collectTask350LongTaskWindow(page, "corrupt-restore");
  reloadLongTasks.push(...corruptReloadLongTasks);
  finalReport.failedRestore = failedRestore;
  compactReport.failedRestore = failedRestore;

  assert.equal(failedRestore.rawStorageUnchanged, true, "恢复失败后浏览器原始存档被删除或改写");
  assert.match(failedRestore.diagnosticMessage, /JSON|解析|Unexpected|position/i, "恢复失败后缺少可解释的导入诊断");
  assert.ok(failedRestore.generatedSeed, "恢复失败后没有生成可继续使用的临时地图");
  assert.equal(failedRestore.status, "", "普通菜单仍显示了恢复错误");
  assert.equal(failedRestore.detailDisplay, "none", "普通菜单仍显示了技术诊断");
  assert.equal(failedRestore.diagnosticSource, "browser-storage", "浏览器存档被误标成 API 文档");
  assert.deepEqual(failedRestore.upgradeNotices, [], "损坏存档错误宣称升级完成");
  await page.evaluate(() => { window.__webglGeneratorDebug.enabled = true; });
  await page.waitForFunction(() => getComputedStyle(document.getElementById("file-operation-error-details")).display !== "none");
  assert.match(await page.locator("#file-operation-error-details").textContent(), /来源：浏览器保存的地图/);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);
  assert.ok(existsSync(screenshotPath) && statSync(screenshotPath).size > 0, "旧 v2 浏览器存档恢复截图没有生成");
  for (const partition of [
    partitionTask350StartupLongTasks(startupBaselineLongTasks, legacyReloadLongTasks, 50),
    partitionTask350StartupLongTasks(startupBaselineLongTasks, missingBurgLongTasks, 50),
    partitionTask350StartupLongTasks(startupBaselineLongTasks, corruptReloadLongTasks, 50)
  ]) {
    sharedStartupLongTasks.push(...partition.sharedStartup);
    longTasks.push(...partition.active);
  }
  longTasks.push(...fileImportLongTasks);
  longTasks.push(...legacyWebfmgLongTasks);
  const performance = summarizeTask350LongTasks(longTasks, 200);
  finalReport.performance = performance;
  compactReport.performance = performance;
  const overBudget = performance.overBudget;
  assert.deepEqual(overBudget, [], `浏览器存储兼容目标窗口出现 >200ms LongTask：${JSON.stringify(overBudget)}`);

  finalReport.ok = true;
  compactReport.ok = true;
  evidence.succeed();
  console.log(JSON.stringify(finalReport, null, 2));
} catch (error) {
  evidence.fail(error);
  thrownError = error;
} finally {
  for (const [label, close] of [
    ["browser-storage-compatibility-browser", browser ? () => browser.close() : null],
    ["browser-storage-compatibility-server", server ? () => new Promise((resolveClose, rejectClose) => server.close(error => error ? rejectClose(error) : resolveClose())) : null]
  ]) {
    if (!close) continue;
    try {
      await closeTask350BrowserResource(label, close);
    } catch (error) {
      evidence.failTeardown(error);
      if (!thrownError) thrownError = error;
    }
  }
  evidence.persist();
}
if (thrownError) throw thrownError;

async function startStaticServer() {
  const serverInstance = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://" + host + ":" + port).pathname);
    let target = resolve(distDir, "." + normalize(pathname));
    if (pathname === "/" || !existsSync(target) || statSync(target).isDirectory()) target = join(distDir, "index.html");
    if (!target.startsWith(distDir) || !existsSync(target)) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, {"content-type": contentType(target), "cache-control": "no-store"});
    createReadStream(target).pipe(response);
  });
  await new Promise((done, fail) => {
    serverInstance.once("error", fail);
    serverInstance.listen(port, host, done);
  });
  return serverInstance;
}

function contentType(file) {
  return ({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png"
  })[extname(file).toLowerCase()] || "application/octet-stream";
}
