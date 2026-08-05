#!/usr/bin/env node
import assert from "node:assert/strict";
import {createReadStream, existsSync, statSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {dirname, extname, join, normalize, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {gzipSync} from "node:zlib";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {createMapDocument, stringifyMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const distDir = join(rootDir, "dist", "webgl-generator");
const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const host = "127.0.0.1";
const port = 5536;
const baseUrl = `http://${host}:${port}`;
const origin = new URL(baseUrl).origin;
const dropboxConfig = {appKey: "fixture-dropbox-app", redirectUri: `${origin}/oauth/dropbox/callback`};
const googleConfig = {clientId: "fixture-google-client-id", folderPath: "/"};
const dropboxScopes = ["files.metadata.read", "files.content.read", "files.content.write"];
const googleScope = "https://www.googleapis.com/auth/drive.file";
const sessionKeys = {
  dropbox: "fmg-cloud-session:v1:dropbox",
  google: "fmg-cloud-session:v1:google-drive"
};
const modifiedAt = "2026-08-06T03:04:05.000Z";
const targetMap = generatePlaceholderMap({seed: "cloud-import-target-296", cellsTarget: 3000, heightmapTemplate: "continents"});
targetMap.options = {...targetMap.options, visualTheme: "night"};
const targetUnits = {distanceUnit: "mi", areaUnit: "mi2", customUnits: [], numberAbbreviation: "none", mapScaleKmPerCm: 88, populationScale: 1.2, militaryScale: 0.8, precipitationScale: 1.1};
const targetText = stringifyMapDocument(createMapDocument(targetMap, {...targetMap.options, display: {units: targetUnits}}));
const futureDocument = JSON.parse(targetText);
futureDocument.version = 999;
const bodies = new Map([
  ["target-octet.webfmg", gzipSync(Buffer.from(targetText))],
  ["slow.webfmg", gzipSync(Buffer.from(targetText))],
  ["legacy.gz", gzipSync(Buffer.from(targetText))],
  ["google-legacy.gz", gzipSync(Buffer.from(targetText))],
  ["target-google.json", Buffer.from(targetText)],
  ["bad-json.json", Buffer.from("{not-json")],
  ["bad-gzip.webfmg", Buffer.from("not-a-gzip")],
  ["future.json", Buffer.from(JSON.stringify(futureDocument))],
  ["renderer-fail.json", Buffer.from(targetText)],
  ["late-fail.json", Buffer.from(targetText)]
]);
const dropboxNames = ["target-octet.webfmg", "slow.webfmg", "legacy.gz", "bad-json.json", "bad-gzip.webfmg", "future.json", "renderer-fail.json", "late-fail.json"];
const googleNames = ["target-google.json", "google-legacy.gz"];
const downloadCounts = new Map([...bodies.keys()].map(name => [name, 0]));
let releaseSlowDownload = null;
let slowDownloadGate = Promise.resolve();
let releaseRendererFailureDownload = null;
let rendererFailureDownloadGate = Promise.resolve();
let releaseLateFailureDownload = null;
let lateFailureDownloadGate = Promise.resolve();

assert.ok(existsSync(distDir), `构建产物不存在：${distDir}`);
const server = await startStaticServer();
let browser;
try {
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  const context = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1});
  await seedCloudSessions(context);
  await installMockTransport(context);
  const page = await context.newPage();
  page.setDefaultTimeout(90000);
  const consoleErrors = [];
  const pageErrors = [];
  let acceptConfirm = true;
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("dialog", dialog => acceptConfirm ? dialog.accept() : dialog.dismiss());

  await page.goto(`${baseUrl}/?healthClear=1&cloudImportBrowser=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 90000);
  await installImportAudit(page);
  await openCloudImport(page);
  await assertProviderConnected(page, "Dropbox");
  await waitForFile(page, "target-octet.webfmg");

  await assertEntryAndModes(page);
  const cancelBefore = totalDownloads();
  await selectRemoteFile(page, "target-octet.webfmg");
  acceptConfirm = false;
  await importSelected(page);
  await page.waitForTimeout(150);
  acceptConfirm = true;
  assert.equal(totalDownloads(), cancelBefore, "取消云端导入后仍发生下载");

  await prepareHistory(page);
  await selectRemoteFile(page, "target-octet.webfmg");
  await importSelected(page);
  await waitForImportSuccess(page, "target-octet.webfmg");
  await assertImported(page, {name: "target-octet.webfmg", type: "application/gzip", historyCleared: true});

  await selectProvider(page, "Google Drive");
  await waitForFile(page, "target-google.json");
  await selectRemoteFile(page, "target-google.json");
  await importSelected(page);
  await waitForImportSuccess(page, "target-google.json");
  await assertImported(page, {name: "target-google.json", type: "application/json"});

  await waitForFile(page, "google-legacy.gz");
  await selectRemoteFile(page, "google-legacy.gz");
  await importSelected(page);
  await waitForImportSuccess(page, "google-legacy.gz");
  await assertImported(page, {name: "google-legacy.gz", type: "application/gzip"});

  await selectProvider(page, "Dropbox");
  await waitForFile(page, "legacy.gz");
  await selectRemoteFile(page, "legacy.gz");
  await importSelected(page);
  await waitForImportSuccess(page, "legacy.gz");
  await assertImported(page, {name: "legacy.gz", type: "application/gzip"});

  slowDownloadGate = new Promise(resolveGate => { releaseSlowDownload = resolveGate; });
  await prepareHistory(page);
  await selectRemoteFile(page, "slow.webfmg");
  await importSelected(page);
  await page.locator(".cloud-storage-panel").waitFor({state: "visible"});
  await page.waitForFunction(() => document.querySelector(".cloud-storage-panel")?.getAttribute("aria-busy") === "true");
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("project-map-save", {detail: {target: "cloud-storage", mode: "save"}})));
  assert.equal(await page.locator(".cloud-storage-panel").getAttribute("aria-busy"), "true", "忙时外部入口错误释放了互斥锁");
  assert.ok(await page.locator(".cloud-storage-import-section").evaluate(element => element.classList.contains("is-active")), "忙时外部入口错误切换了模式");
  assert.equal(await page.getByRole("tab", {name: "Google Drive", exact: true}).isDisabled(), true, "忙时仍允许切换 provider");
  releaseSlowDownload();
  await waitForImportSuccess(page, "slow.webfmg");
  await assertImported(page, {name: "slow.webfmg", type: "application/gzip", historyCleared: true});

  const healthOutcomes = [];
  for (const name of ["bad-json.json", "bad-gzip.webfmg", "future.json", "renderer-fail.json", "late-fail.json"]) {
    await page.evaluate(() => window.webglGeneratorApi.units.apply({distanceUnit: "km-cn", numberAbbreviation: "wan", mapScaleKmPerCm: 100}));
    await page.evaluate(() => window.webglGeneratorApi.layers.setTheme("ancient"));
    await prepareHistory(page);
    const previousHealthOutcome = await latestHealthOutcomeSignature(page);
    let before;
    if (name === "renderer-fail.json" || name === "late-fail.json") {
      if (name === "renderer-fail.json") rendererFailureDownloadGate = new Promise(resolveGate => { releaseRendererFailureDownload = resolveGate; });
      else lateFailureDownloadGate = new Promise(resolveGate => { releaseLateFailureDownload = resolveGate; });
      await selectRemoteFile(page, name);
      await importSelected(page);
      await page.waitForFunction(() => document.querySelector(".cloud-storage-panel")?.getAttribute("aria-busy") === "true");
      await createNonDefaultEditingState(page);
      if (name === "renderer-fail.json") await injectRendererFailure(page);
      else await injectLateMapRevisionFailure(page);
      before = await captureRuntimeState(page);
      assert.ok(before.selection && before.editing && before.canvasToolMode, `${name} 夹具没有建立非默认选择、编辑和画布工具状态`);
      assert.equal(before.visualTheme, "ancient", `${name} 夹具没有建立与目标文档不同的视觉主题`);
      assert.equal(before.units.distanceUnit, "km-cn", `${name} 夹具没有建立与目标文档不同的单位`);
      if (name === "renderer-fail.json") releaseRendererFailureDownload();
      else releaseLateFailureDownload();
    } else {
      if (name === "bad-json.json") await installBadJsonCanvasModeAudit(page);
      before = await captureRuntimeState(page);
      await selectRemoteFile(page, name);
      await importSelected(page);
    }
    await page.locator(".cloud-storage-error").filter({hasText: name}).waitFor();
    assert.deepEqual(await captureRuntimeState(page), before, `${name} 失败后没有完整回滚运行时状态`);
    if (name === "bad-json.json") await assertAndClearBadJsonCanvasModeAudit(page);
    healthOutcomes.push(await assertExpectedHealthOutcome(page, name, previousHealthOutcome));
  }

  await page.evaluate(async () => {
    const state = window.__webglGeneratorApp;
    state.canvasToolModes.reset("cloud-import-layout-check");
    await window.webglGeneratorApi.selection.stopEditing();
  });
  await openCloudImport(page);
  await waitForFile(page, "renderer-fail.json");

  const layouts = [];
  for (const viewport of [{width: 1440, height: 900}, {width: 390, height: 760}, {width: 320, height: 700}]) {
    await page.setViewportSize(viewport);
    await openCloudImport(page);
    await waitForFile(page, "renderer-fail.json");
    await page.waitForTimeout(120);
    const metrics = await measureLayout(page);
    assert.equal(metrics.documentOverflow, 0, `${viewport.width}px document 横向溢出`);
    assert.equal(metrics.contentOverflow, 0, `${viewport.width}px 云端面板正文横向溢出`);
    assert.ok(metrics.panel.right > metrics.panel.left && metrics.panel.bottom > metrics.panel.top, `${viewport.width}px 云端面板不可见`);
    assert.ok(metrics.panel.left >= 0 && metrics.panel.right <= viewport.width + 1, `${viewport.width}px 云端面板横向越界`);
    assert.ok(metrics.panel.top >= 0 && metrics.panel.bottom <= viewport.height + 1, `${viewport.width}px 云端面板纵向越界`);
    assert.deepEqual(metrics.actionOrder, ["从云端导入所选地图", "覆盖所选文件"], `${viewport.width}px 导入动作顺序错误`);
    assert.deepEqual(metrics.modeSections, {save: true, import: true, importActive: true}, `${viewport.width}px 保存/导入双区或激活态错误`);
    assert.equal(metrics.localInputAccept, ".webfmg,.json,.gz,.webgl-map.json,.webgl-map.json.gz,application/json,application/gzip,application/x-gzip", `${viewport.width}px 本地导入入口契约变化`);
    assert.equal(metrics.cloudImportEntry.visible, true, `${viewport.width}px 云端导入入口不可见`);
    assert.ok(metrics.cloudImportEntry.rect.width > 0 && metrics.cloudImportEntry.rect.height > 0, `${viewport.width}px 云端导入入口没有实际尺寸`);
    assert.ok(metrics.cloudImportEntry.rect.left >= 0 && metrics.cloudImportEntry.rect.right <= viewport.width + 1, `${viewport.width}px 云端导入入口横向越界`);
    assert.ok(metrics.cloudImportEntry.rect.top >= 0 && metrics.cloudImportEntry.rect.bottom <= viewport.height + 1, `${viewport.width}px 云端导入入口纵向越界`);
    assert.ok(metrics.cloudImportEntry.rect.left >= metrics.cloudImportEntry.visibleBody.left - 1 && metrics.cloudImportEntry.rect.right <= metrics.cloudImportEntry.visibleBody.right + 1, `${viewport.width}px 云端导入入口不在控制面板横向可视区`);
    assert.ok(metrics.cloudImportEntry.rect.top >= metrics.cloudImportEntry.visibleBody.top - 1 && metrics.cloudImportEntry.rect.bottom <= metrics.cloudImportEntry.visibleBody.bottom + 1, `${viewport.width}px 云端导入入口不在控制面板纵向可视区`);
    layouts.push({viewport: `${viewport.width}x${viewport.height}`, ...metrics});
  }

  await page.evaluate(() => {
    window.__webglGeneratorHealth?.clear?.();
    window.__webglGeneratorDebug?.clearHealthEvents?.();
  });
  await page.waitForTimeout(50);
  const healthErrors = await page.evaluate(() => (window.__webglGeneratorHealth?.getEvents?.(200) || []).filter(event => event?.severity === "error"));
  assert.deepEqual(healthErrors, [], "清空后仍有应用 health error");
  const expectedConsoleErrors = consoleErrors.filter(message => message.includes("[FMG health] operation-failed"));
  const unexpectedConsoleErrors = consoleErrors.filter(message => !message.includes("[FMG health] operation-failed"));
  assert.equal(expectedConsoleErrors.length, 3, "损坏 gzip、renderer、late 没有各自产生一条预期 health console error");
  assert.deepEqual(unexpectedConsoleErrors, [], "全流程出现非预期 console error");
  assert.deepEqual(pageErrors, [], "全流程出现 page error");
  assert.equal(await page.evaluate(() => window.__webglGeneratorApp?.renderer?.getStats?.()?.draw?.glError ?? null), 0, "出现 WebGL error");

  console.log(JSON.stringify({
    ok: true,
    imports: await page.evaluate(() => window.__cloudImportAudit),
    downloads: Object.fromEntries(downloadCounts),
    rollbackFailures: ["bad-json.json", "bad-gzip.webfmg", "future.json", "renderer-fail.json", "late-fail.json"],
    healthOutcomes,
    expectedConsoleErrors: expectedConsoleErrors.length,
    unexpectedConsoleErrors: unexpectedConsoleErrors.length,
    layouts
  }, null, 2));
  await context.close();
} finally {
  if (browser) await browser.close();
  await new Promise(done => server.close(done));
}

async function seedCloudSessions(context) {
  await context.addInitScript(({origin, dropboxConfig, googleConfig, dropboxScopes, googleScope, sessionKeys}) => {
    const expiresAt = Date.now() + 60 * 60 * 1000;
    sessionStorage.setItem(sessionKeys.dropbox, JSON.stringify({version: 1, provider: "dropbox", fingerprint: JSON.stringify([1, "dropbox", origin, dropboxConfig.appKey, dropboxConfig.redirectUri, ...dropboxScopes]), accessToken: "fixture-dropbox-token", expiresAt}));
    sessionStorage.setItem(sessionKeys.google, JSON.stringify({version: 1, provider: "google-drive", fingerprint: JSON.stringify([1, "google-drive", origin, googleConfig.clientId, googleConfig.folderPath, googleScope]), accessToken: "fixture-google-token", expiresAt}));
  }, {origin, dropboxConfig, googleConfig, dropboxScopes, googleScope, sessionKeys});
}

async function installMockTransport(context) {
  await context.route("**/cloud-provider-config.js", route => route.fulfill({status: 200, contentType: "application/javascript; charset=utf-8", body: `globalThis.__FMG_CLOUD_PROVIDER_CONFIG__=${JSON.stringify({version: 1, providers: {dropbox: dropboxConfig, googleDrive: googleConfig}})};`}));
  await context.route("https://api.dropboxapi.com/**", route => {
    if (route.request().url().endsWith("/files/list_folder")) return route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({entries: dropboxNames.map(dropboxEntry), has_more: false})});
    return route.fulfill({status: 200, contentType: "application/json", body: "{}"});
  });
  await context.route("https://content.dropboxapi.com/2/files/download", async route => {
    const path = JSON.parse(route.request().headers()["dropbox-api-arg"] || "{}").path || "";
    const name = path.replace(/^\//, "");
    downloadCounts.set(name, (downloadCounts.get(name) || 0) + 1);
    if (name === "slow.webfmg") await slowDownloadGate;
    if (name === "renderer-fail.json") await rendererFailureDownloadGate;
    if (name === "late-fail.json") await lateFailureDownloadGate;
    return route.fulfill({status: 200, contentType: "application/octet-stream", body: bodies.get(name)});
  });
  await context.route("https://www.googleapis.com/drive/v3/files**", route => {
    const url = new URL(route.request().url());
    const mediaMatch = url.pathname.match(/\/files\/([^/]+)$/);
    if (mediaMatch && url.searchParams.get("alt") === "media") {
      const name = decodeURIComponent(mediaMatch[1]).replace(/^g-/, "");
      downloadCounts.set(name, (downloadCounts.get(name) || 0) + 1);
      return route.fulfill({status: 200, contentType: "application/json", body: bodies.get(name)});
    }
    return route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({files: googleNames.map(googleEntry)})});
  });
}

function dropboxEntry(name) {
  return {".tag": "file", id: `db-${name}`, name, path_lower: `/${name}`, path_display: `/${name}`, rev: `rev-${name}`, size: bodies.get(name).length, server_modified: modifiedAt};
}

function googleEntry(name) {
  return {id: `g-${name}`, name, size: String(bodies.get(name).length), modifiedTime: modifiedAt, version: "1", parents: ["root"]};
}

async function installImportAudit(page) {
  await page.evaluate(() => {
    const actions = window.__webglGeneratorApp.runtimeActions.data;
    const original = actions.importMap;
    window.__cloudImportAudit = [];
    actions.importMap = (payload, options) => {
      window.__cloudImportAudit.push({name: payload.name, type: payload.type, lastModified: payload.lastModified, isFile: payload instanceof File, same: payload === options.sourceFile});
      return original(payload, options);
    };
  });
}

async function openCloudImport(page) {
  const entry = await focusCloudImportEntry(page);
  await entry.click();
  await page.waitForSelector('.floating-panel[data-panel-id="cloud-storage-panel"]:not(.hidden) .cloud-storage-panel');
}

async function focusCloudImportEntry(page) {
  const heading = page.getByRole("heading", {name: "控制面板", exact: true});
  if (!await heading.isVisible().catch(() => false)) {
    const cloudPanel = page.locator('.floating-panel[data-panel-id="cloud-storage-panel"]');
    if (await cloudPanel.isVisible().catch(() => false)) await cloudPanel.locator(".floating-panel-close").click();
    await page.getByRole("button", {name: "控制面板", exact: true}).click();
  }
  await heading.waitFor();
  await page.getByRole("tab", {name: "简介", exact: true}).click();
  const entry = page.getByRole("button", {name: "从云端导入…", exact: true});
  await entry.evaluate(element => element.scrollIntoView({block: "center", inline: "nearest"}));
  assert.equal(await entry.isVisible(), true, "云端导入入口不可见");
  return entry;
}

async function assertEntryAndModes(page) {
  assert.equal(await page.locator("#import-map-file").count(), 1, "本地导入 input 丢失");
  assert.equal(await page.getByText("保存到云端", {exact: true}).count(), 1, "保存区缺失");
  assert.equal(await page.getByText("从云端导入", {exact: true}).count(), 1, "导入区缺失");
  assert.equal(await page.locator(".cloud-storage-save-section").isVisible(), true, "保存区不可见");
  assert.equal(await page.locator(".cloud-storage-import-section").isVisible(), true, "导入区不可见");
  assert.ok(await page.locator(".cloud-storage-import-section").evaluate(element => element.classList.contains("is-active")), "云端导入入口没有激活导入区");
}

async function selectProvider(page, label) {
  const tab = page.getByRole("tab", {name: label, exact: true});
  if (await tab.getAttribute("aria-selected") !== "true") {
    await tab.click();
    await page.locator('.cloud-storage-connection[data-cloud-state="connected"]').waitFor();
    await page.getByRole("button", {name: "刷新列表", exact: true}).click();
    await page.waitForFunction(() => document.querySelector(".cloud-storage-panel")?.getAttribute("aria-busy") === "false");
  }
}

async function assertProviderConnected(page, label) {
  await selectProvider(page, label);
  await page.locator('.cloud-storage-connection[data-cloud-state="connected"]').waitFor();
}

async function waitForFile(page, name) {
  await page.locator(".cloud-storage-file", {hasText: name}).waitFor();
}

async function selectRemoteFile(page, name) {
  const file = page.locator(".cloud-storage-file", {hasText: name});
  await file.waitFor();
  await file.click();
}

async function importSelected(page) {
  await page.getByRole("button", {name: "从云端导入所选地图", exact: true}).click();
}

async function waitForImportSuccess(page, name) {
  await page.locator(".cloud-storage-status").filter({hasText: `已从云端导入“${name}”`}).waitFor();
  await waitForApiReady(page, 90000);
}

async function assertImported(page, {name, type, historyCleared = false}) {
  const state = await page.evaluate(() => ({seed: window.__webglGeneratorApp.map?.metadata?.seed, history: window.__webglGeneratorApp.editHistory.getStats(), audit: window.__cloudImportAudit.at(-1)}));
  assert.equal(state.seed, "cloud-import-target-296", `${name} 没有替换当前地图`);
  assert.deepEqual(state.audit, {name, type, lastModified: Date.parse(modifiedAt), isFile: true, same: true}, `${name} 没有以同一个具名 File 贯穿 UI 导入链`);
  if (historyCleared) assert.deepEqual({undo: state.history.undo, redo: state.history.redo}, {undo: 0, redo: 0}, `${name} 成功后没有清空历史`);
}

async function prepareHistory(page) {
  await page.evaluate(() => {
    const state = window.__webglGeneratorApp;
    const context = {map: state.map};
    const command = label => ({label, domain: "cloud-import-fixture", apply() {}, revert() {}});
    state.editHistory.execute(command("fixture-a"), context);
    state.editHistory.execute(command("fixture-b"), context);
    state.editHistory.undo(context);
  });
}

async function captureRuntimeState(page) {
  return page.evaluate(() => {
    const state = window.__webglGeneratorApp;
    const units = window.webglGeneratorApi.units.get().data.units;
    const history = state.editHistory.getStats();
    return {
      mapSeed: state.map?.metadata?.seed,
      mapChecksum: state.map?.metadata?.checksum,
      options: JSON.stringify(state.options),
      pendingGenerateId: state.pendingGenerateId,
      mapRevision: state.mapRevision.getSnapshot(),
      mapCursorSignature: state.mapRevision.signCursor("cloud-import-rollback"),
      rendererMap: {
        sameIdentity: state.renderer.map === state.map,
        seed: state.renderer.map?.metadata?.seed,
        checksum: state.renderer.map?.metadata?.checksum
      },
      visualTheme: state.renderer.visualTheme?.id || null,
      history: {undo: history.undo, redo: history.redo, lastLabel: history.lastLabel, lastDomain: history.lastDomain},
      selection: state.selection?.object ? {kind: state.selection.object.kind, id: state.selection.object.id} : null,
      editing: state.editingObject ? {kind: state.editingObject.kind, id: state.editingObject.id} : null,
      canvasToolMode: state.canvasToolModes.getActive() ? {
        id: state.canvasToolModes.getActive().id,
        context: JSON.parse(JSON.stringify(state.canvasToolModes.getActive().context))
      } : null,
      units
    };
  });
}

async function createNonDefaultEditingState(page) {
  await page.evaluate(async () => {
    const state = window.__webglGeneratorApp;
    const city = state.map?.settlements?.cities?.find(Boolean);
    if (!city) throw new Error("renderer failure 夹具缺少可选城镇");
    const reference = {kind: "city", id: city.id};
    const selected = await window.webglGeneratorApi.selection.select(reference);
    if (selected?.ok !== true) throw new Error("renderer failure 夹具无法建立选择状态");
    const editing = await window.webglGeneratorApi.selection.startEditing(reference);
    if (editing?.ok !== true) throw new Error("renderer failure 夹具无法建立编辑状态");
    state.canvasToolModes.enter("height:brush", {fixture: "cloud-import-renderer-rollback"});
  });
}

async function injectRendererFailure(page) {
  await page.evaluate(() => {
    const renderer = window.__webglGeneratorApp.renderer;
    const original = renderer.loadMapAsync.bind(renderer);
    renderer.loadMapAsync = async (...args) => {
      renderer.loadMapAsync = original;
      throw new Error("fixture renderer failure");
    };
  });
}

async function injectLateMapRevisionFailure(page) {
  await page.evaluate(() => {
    const tracker = window.__webglGeneratorApp.mapRevision;
    const original = tracker.replaceMap.bind(tracker);
    tracker.replaceMap = (...args) => {
      tracker.replaceMap = original;
      const result = original(...args);
      throw new Error("fixture late failure after mapRevision.replaceMap");
    };
  });
}

async function installBadJsonCanvasModeAudit(page) {
  await page.evaluate(() => {
    const manager = window.__webglGeneratorApp.canvasToolModes;
    manager.reset("bad-json-audit-setup");
    const context = {fixture: "bad-json-canvas-mode", draft: {token: "preserve", points: [2, 7, 11]}};
    manager.enter("height:brush", context);
    const originalEnter = manager.enter;
    window.__badJsonCanvasModeAudit = {context, originalEnter, enterCalls: 0};
    manager.enter = (...args) => {
      window.__badJsonCanvasModeAudit.enterCalls++;
      return originalEnter(...args);
    };
  });
}

async function assertAndClearBadJsonCanvasModeAudit(page) {
  const result = await page.evaluate(() => {
    const state = window.__webglGeneratorApp;
    const audit = window.__badJsonCanvasModeAudit;
    const active = state.canvasToolModes.getActive();
    const result = {
      enterCalls: audit.enterCalls,
      sameContext: active?.context === audit.context,
      context: active?.context
    };
    state.canvasToolModes.enter = audit.originalEnter;
    state.canvasToolModes.reset("bad-json-audit-complete");
    delete window.__badJsonCanvasModeAudit;
    return result;
  });
  assert.equal(result.enterCalls, 0, "bad JSON 回滚错误触发了 canvas mode onRepeat");
  assert.equal(result.sameContext, true, "bad JSON 回滚替换了未受影响的 canvas mode context");
  assert.deepEqual(result.context?.draft, {token: "preserve", points: [2, 7, 11]}, "bad JSON 回滚破坏了 canvas mode draft");
}

async function latestHealthOutcomeSignature(page) {
  return page.evaluate(() => {
    const outcomes = (window.__webglGeneratorHealth?.getEvents?.(200) || []).filter(event => event.type === "operation-rejected" || event.type === "operation-failed");
    const latest = outcomes.at(-1);
    return latest ? `${latest.at}|${latest.pageTimeMs}|${latest.type}|${latest.detail?.operationId || ""}` : "";
  });
}

async function assertExpectedHealthOutcome(page, name, previousSignature) {
  const outcomes = await page.evaluate(() => (window.__webglGeneratorHealth?.getEvents?.(200) || []).filter(event => event.type === "operation-rejected" || event.type === "operation-failed"));
  const outcome = outcomes.at(-1);
  assert.ok(outcome, `${name} 没有产生 operation health 结果`);
  const signature = `${outcome.at}|${outcome.pageTimeMs}|${outcome.type}|${outcome.detail?.operationId || ""}`;
  assert.notEqual(signature, previousSignature, `${name} 没有产生新的 operation health 结果`);
  const expectedFailure = name === "bad-gzip.webfmg" || name === "renderer-fail.json" || name === "late-fail.json";
  assert.equal(outcome.type, expectedFailure ? "operation-failed" : "operation-rejected", `${name} health 分类错误`);
  assert.equal(outcome.severity, expectedFailure ? "error" : "info", `${name} health severity 错误`);
  return {name, type: outcome.type, severity: outcome.severity, code: outcome.detail?.code || ""};
}

async function measureLayout(page) {
  const cloud = await page.evaluate(() => {
    const panel = document.querySelector('.floating-panel[data-panel-id="cloud-storage-panel"]');
    const content = panel.querySelector(".cloud-storage-panel");
    const rect = panel.getBoundingClientRect();
    return {
      panel: {left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom},
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      contentOverflow: content.scrollWidth - content.clientWidth,
      actionOrder: [...content.querySelectorAll(".cloud-storage-selected-actions button")].map(button => button.textContent.trim()),
      modeSections: {
        save: Boolean(content.querySelector(".cloud-storage-save-section")),
        import: Boolean(content.querySelector(".cloud-storage-import-section")),
        importActive: content.querySelector(".cloud-storage-import-section")?.classList.contains("is-active") || false
      },
      localInputAccept: document.getElementById("import-map-file")?.getAttribute("accept") || ""
    };
  });
  await focusCloudImportEntry(page);
  const cloudImportEntry = await page.evaluate(() => {
    const entry = document.getElementById("open-cloud-import");
    const body = entry?.closest('.floating-panel[data-panel-id="generation-panel"]')?.querySelector(".floating-panel-body");
    const entryRect = entry?.getBoundingClientRect();
    const bodyRect = body?.getBoundingClientRect();
    const rect = value => value ? {left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height} : {left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0};
    return {
      visible: Boolean(entry && entryRect?.width > 0 && entryRect?.height > 0 && getComputedStyle(entry).visibility !== "hidden"),
      rect: rect(entryRect),
      visibleBody: bodyRect ? {
        left: Math.max(0, bodyRect.left),
        top: Math.max(0, bodyRect.top),
        right: Math.min(innerWidth, bodyRect.right),
        bottom: Math.min(innerHeight, bodyRect.bottom)
      } : {left: 0, top: 0, right: 0, bottom: 0}
    };
  });
  return {...cloud, cloudImportEntry};
}

function totalDownloads() {
  return [...downloadCounts.values()].reduce((sum, value) => sum + value, 0);
}

async function startStaticServer() {
  const instance = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, baseUrl).pathname);
    let target = resolve(distDir, `.${normalize(pathname)}`);
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
    instance.once("error", fail);
    instance.listen(port, host, done);
  });
  return instance;
}

function contentType(file) {
  return ({".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml"})[extname(file).toLowerCase()] || "application/octet-stream";
}
