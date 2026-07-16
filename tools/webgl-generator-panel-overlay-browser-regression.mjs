#!/usr/bin/env node
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
const port = 5454;
const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
assert.ok(existsSync(distDir), `构建产物不存在：${distDir}`);

const server = await startStaticServer();
let browser;
try {
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  const desktop = await runViewportCase(browser, {width: 1280, height: 720, label: "desktop"});
  const narrow = await runViewportCase(browser, {width: 720, height: 720, label: "narrow"});
  console.log(JSON.stringify({ok: true, desktop, narrow}, null, 2));
} finally {
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await new Promise(done => server.close(done));
}

async function runViewportCase(browserInstance, viewport) {
  const context = await browserInstance.newContext({viewport: {width: viewport.width, height: viewport.height}, deviceScaleFactor: 1});
  await context.addInitScript(() => {
    if (sessionStorage.getItem("panel-overlay-browser-started")) return;
    localStorage.clear();
    sessionStorage.setItem("panel-overlay-browser-started", "1");
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));
  try {
    await page.goto(`http://${host}:${port}?healthClear=1`, {waitUntil: "domcontentloaded"});
    await waitForReady(page);
    const fixture = await page.evaluate(() => {
      const map = window.__webglGeneratorApp.map;
      const packCell = map.pack.cells.h.findIndex(height => height >= 20);
      const noteId = "panel-overlay-audit-note";
      const created = window.webglGeneratorApi.edit.notes.createStandalone({id: noteId, name: "浮层审计备注", body: "用于验证对象详情共存", packCell});
      if (!created?.ok) throw new Error(created?.error?.message || "无法创建浮层审计备注");
      return {noteId};
    });

    await page.locator("#open-generation-panel").click();
    await page.waitForSelector('.floating-panel[data-panel-id="generation-panel"]:not(.hidden)');
    await page.evaluate(noteId => {
      const result = window.webglGeneratorApi.selection.select({kind: "note", id: noteId});
      if (!result?.ok) throw new Error(result?.error?.message || "备注选择失败");
    }, fixture.noteId);
    await page.waitForSelector('.floating-panel[data-panel-id="object-details"]:not(.hidden)');
    const coexistence = await inspectPanelCoexistence(page);
    if (viewport.width >= 1000) {
      assert.equal(coexistence.main.length, 1, `${viewport.label} 应保留一个主面板`);
      assert.equal(coexistence.details.length, 1, `${viewport.label} 应允许对象详情共存`);
      assert.equal(coexistence.overlap, false, `${viewport.label} 主面板与对象详情发生重叠`);
    } else {
      assert.equal(coexistence.main.length, 0, `${viewport.label} 空间不足时旧主面板应让位`);
      assert.equal(coexistence.details.length, 1, `${viewport.label} 最后打开的对象详情应保持可达`);
    }
    await page.keyboard.press("Escape");
    await page.waitForSelector('.floating-panel[data-panel-id="object-details"]', {state: "hidden"});

    await page.keyboard.press("Shift+S");
    await page.waitForSelector('.floating-panel[data-panel-id="state-panel"]:not(.hidden)');
    await page.keyboard.press("Shift+C");
    await page.waitForSelector('.floating-panel[data-panel-id="city-panel"]:not(.hidden)');
    const switchedMain = await visibleMainPanelIds(page);
    assert.deepEqual(switchedMain, ["city-panel"], `${viewport.label} 打开新主面板后旧主面板仍可见`);
    const manualPosition = await verifyManualPanelPosition(page, {
      panelId: "city-panel",
      noteId: fixture.noteId,
      viewport
    });
    const heightViewportOrigin = viewport.width >= 1000 ? await verifyHeightPanelViewportOrigin(page, viewport) : null;

    await page.locator("#open-generation-panel").click();
    await page.waitForSelector('.floating-panel[data-panel-id="generation-panel"]:not(.hidden)');
    await page.locator('[data-control-tab="about"]').click();
    const exportTrigger = page.locator("#open-export-panel");
    await exportTrigger.click();
    await page.waitForSelector('[data-overlay-id="project-export"]:not([style*="display: none"])');
    const exportOverlay = await inspectFixedOverlay(page, "project-export");
    assertSafeOverlay(exportOverlay, viewport, "导出浮层");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.querySelector('[data-overlay-id="project-export"]')?.getAttribute("aria-hidden") === "true" || document.querySelector(".project-export-panel")?.style.display === "none");
    assert.equal(await page.evaluate(() => document.activeElement?.id), "open-export-panel", `${viewport.label} 导出浮层关闭后焦点没有返回入口`);

    await page.evaluate(() => document.getElementById("open-height-panel")?.click());
    await page.waitForSelector('.floating-panel[data-panel-id="height-panel"]:not(.hidden)');
    await page.locator(".heightmap-workbench-open").click();
    await page.waitForSelector('[data-overlay-id="heightmap-import-workbench"]');
    const workbenchOverlay = await inspectFixedOverlay(page, "heightmap-import-workbench");
    assertSafeOverlay(workbenchOverlay, viewport, "高度图工作台");
    await page.keyboard.press("Escape");
    await page.waitForSelector('[data-overlay-id="heightmap-import-workbench"]', {state: "detached"});

    await page.evaluate(() => document.getElementById("open-culture-panel")?.click());
    await page.waitForSelector('.floating-panel[data-panel-id="culture-panel"]:not(.hidden)');
    await page.locator('.floating-panel[data-panel-id="culture-panel"] .inheritance-tree-open').click();
    await page.waitForSelector('[data-overlay-id="tree-display"]');
    const treeOverlay = await inspectFixedOverlay(page, "tree-display");
    assertSafeOverlay(treeOverlay, viewport, "树状总览");
    await page.keyboard.press("Escape");
    await page.waitForSelector('[data-overlay-id="tree-display"]', {state: "detached"});

    await page.evaluate(() => {
      localStorage.setItem("webgl-generator-panel:state-panel", JSON.stringify({left: 400, top: 128, width: 560, open: true, openedAt: 10}));
      localStorage.setItem("webgl-generator-panel:city-panel", JSON.stringify({left: 410, top: 132, width: 560, open: true, openedAt: 20}));
      localStorage.setItem("webgl-generator-panel:last-main", "city-panel");
    });
    await page.reload({waitUntil: "domcontentloaded"});
    await waitForReady(page);
    await page.waitForSelector('.floating-panel[data-panel-id="city-panel"]:not(.hidden)');
    const restoredMain = await visibleMainPanelIds(page);
    assert.deepEqual(restoredMain, ["city-panel"], `${viewport.label} 持久化恢复没有只保留最后主面板`);
    const migratedState = await page.evaluate(() => JSON.parse(localStorage.getItem("webgl-generator-panel:state-panel")));
    assert.equal(migratedState.open, false, `${viewport.label} 旧的多开持久化状态没有收口`);

    assert.deepEqual(consoleErrors, [], `${viewport.label} 出现控制台错误`);
    assert.deepEqual(pageErrors, [], `${viewport.label} 出现页面错误`);
    return {viewport: `${viewport.width}x${viewport.height}`, coexistence, switchedMain, manualPosition, heightViewportOrigin, exportOverlay, workbenchOverlay, treeOverlay, restoredMain};
  } finally {
    await context.close();
  }
}

async function verifyHeightPanelViewportOrigin(page, viewport) {
  const panelId = "height-panel";
  const panelSelector = `.floating-panel[data-panel-id="${panelId}"]`;
  const target = {left: 900, top: 16};
  await page.keyboard.press("Shift+H");
  await page.waitForSelector(`${panelSelector}:not(.hidden)`);
  await page.waitForFunction(selector => {
    const body = document.querySelector(`${selector} .floating-panel-body`);
    return body && !body.textContent.includes("正在加载") && body.textContent.includes("高级地形程序与条件变换");
  }, panelSelector);
  assert.deepEqual(await visibleMainPanelIds(page), [panelId], `${viewport.label} Shift+H 必须唯一打开高度面板`);

  const header = page.locator(`${panelSelector} .floating-panel-header`);
  const start = await readPanelPositionState(page, panelId);
  const box = await header.boundingBox();
  assert.ok(box, `${viewport.label} 无法读取高度面板标题栏位置`);
  const pointer = {x: box.x + Math.min(100, box.width / 2), y: box.y + Math.min(20, box.height / 2)};
  await page.mouse.move(pointer.x, pointer.y);
  await page.mouse.down();
  await page.mouse.move(pointer.x + target.left - start.runtime.left, pointer.y + target.top - start.runtime.top, {steps: 6});
  await page.mouse.up();
  await page.waitForFunction(id => JSON.parse(localStorage.getItem(`webgl-generator-panel:${id}`) || "{}").positionMode === "manual", panelId);
  const before = await inspectManagedPanelViewport(page, panelId);
  assertPanelPositionNear(before.runtime, target, viewport, "高度面板展开前");
  assert.equal(before.windowScroll.y, 0, `${viewport.label} 高度面板展开前 document viewport 已偏移`);

  const summary = page.locator(`${panelSelector} details.height-advanced-section > summary`, {hasText: "高级地形程序与条件变换"});
  assert.equal(await summary.count(), 1, `${viewport.label} 高级地形 summary 必须唯一`);
  assert.equal(await summary.isVisible(), true, `${viewport.label} 高级地形 summary 必须可见`);
  await summary.click();
  await page.waitForFunction(selector => document.querySelector(`${selector} details.height-advanced-section`)?.open === true, panelSelector);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(50);
  const after = await inspectManagedPanelViewport(page, panelId);
  assertPanelPositionNear(after.runtime, before.runtime, viewport, "高度面板展开后 runtime");
  assertPanelPositionNear(after.preference, before.preference, viewport, "高度面板展开后 preference");
  assert.equal(after.windowScroll.x, 0, `${viewport.label} 深层 summary 点击后 window.scrollX 必须归零`);
  assert.equal(after.windowScroll.y, 0, `${viewport.label} 深层 summary 点击后 window.scrollY 必须归零`);
  assert.ok(Math.abs(after.mapStage.y) <= 0.5, `${viewport.label} 深层 summary 点击后 map-stage 不得离开 viewport 原点`);
  assert.equal(after.headerReachable, true, `${viewport.label} 深层 summary 点击后标题栏不可达`);
  assert.equal(after.closeReachable, true, `${viewport.label} 深层 summary 点击后关闭按钮不可达`);
  assert.equal(after.bodyScrollable, true, `${viewport.label} 高度面板 body 必须保留内部滚动能力`);
  assert.ok(after.bodyScrollTop >= 0, `${viewport.label} 高度面板 body scrollTop 无效`);

  await page.locator(`${panelSelector} .floating-panel-close`).click();
  await page.waitForSelector(panelSelector, {state: "hidden"});
  return {target, before, after};
}

async function inspectManagedPanelViewport(page, panelId) {
  return page.evaluate(id => {
    const panel = document.querySelector(`.floating-panel[data-panel-id="${id}"]`);
    const header = panel.querySelector(".floating-panel-header");
    const close = panel.querySelector(".floating-panel-close");
    const body = panel.querySelector(".floating-panel-body");
    const mapStage = document.querySelector(".map-stage");
    const saved = JSON.parse(localStorage.getItem(`webgl-generator-panel:${id}`) || "{}");
    const panelRect = panel.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    const closeRect = close.getBoundingClientRect();
    const stageRect = mapStage.getBoundingClientRect();
    return {
      runtime: {left: Number.parseFloat(panel.style.left) || 0, top: Number.parseFloat(panel.style.top) || 0},
      preference: {left: saved.left, top: saved.top},
      panelRect: {left: panelRect.left, top: panelRect.top, right: panelRect.right, bottom: panelRect.bottom},
      headerRect: {left: headerRect.left, top: headerRect.top, right: headerRect.right, bottom: headerRect.bottom},
      mapStage: {x: stageRect.x, y: stageRect.y},
      windowScroll: {x: window.scrollX, y: window.scrollY},
      headerReachable: headerRect.bottom > 0 && headerRect.top < innerHeight && headerRect.right > 0 && headerRect.left < innerWidth,
      closeReachable: closeRect.left >= 0 && closeRect.top >= 0 && closeRect.right <= innerWidth && closeRect.bottom <= innerHeight,
      bodyScrollable: body.scrollHeight > body.clientHeight,
      bodyScrollTop: body.scrollTop
    };
  }, panelId);
}

async function verifyManualPanelPosition(page, {panelId, noteId, viewport}) {
  const panelSelector = `.floating-panel[data-panel-id="${panelId}"]`;
  const header = page.locator(`${panelSelector} .floating-panel-header`);
  await header.click({position: {x: 80, y: 20}});
  const clickMode = await page.evaluate(id => JSON.parse(localStorage.getItem(`webgl-generator-panel:${id}`) || "{}").positionMode, panelId);
  assert.equal(clickMode, "auto", `${viewport.label} 仅点按标题栏不应切换手动模式`);

  const target = viewport.width >= 1000 ? {left: 180, top: 96} : {left: 48, top: 88};
  const start = await page.evaluate(selector => {
    const panel = document.querySelector(selector);
    return {left: Number.parseFloat(panel.style.left) || 0, top: Number.parseFloat(panel.style.top) || 0};
  }, panelSelector);
  const box = await header.boundingBox();
  assert.ok(box, `${viewport.label} 无法读取面板标题栏位置`);
  const pointer = {x: box.x + Math.min(100, box.width / 2), y: box.y + Math.min(20, box.height / 2)};
  await page.mouse.move(pointer.x, pointer.y);
  await page.mouse.down();
  await page.mouse.move(pointer.x + target.left - start.left, pointer.y + target.top - start.top, {steps: 6});
  await page.mouse.up();
  await page.waitForFunction(id => JSON.parse(localStorage.getItem(`webgl-generator-panel:${id}`) || "{}").positionMode === "manual", panelId);

  const dragged = await readPanelPositionState(page, panelId);
  assertPanelPositionNear(dragged.runtime, target, viewport, "拖动后");
  assertPanelPositionNear(dragged.preference, target, viewport, "偏好写入后");

  await page.locator(`${panelSelector} .floating-panel-close`).click();
  assert.deepEqual(await visibleMainPanelIds(page), [], `${viewport.label} 城市面板关闭后仍有主面板可见`);
  await page.keyboard.press("Shift+C");
  await page.waitForSelector(`${panelSelector}:not(.hidden)`);
  assert.deepEqual(await visibleMainPanelIds(page), [panelId], `${viewport.label} Shift+C 重开后必须只有城市面板可见`);
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await page.waitForTimeout(30);
  const reopened = await readPanelPositionState(page, panelId);
  assertPanelPositionNear(reopened.runtime, target, viewport, "重开与 resize 后");
  assertPanelPositionNear(reopened.preference, target, viewport, "重开后的偏好");

  let coexistence = null;
  let narrowed = null;
  let restoredAfterNarrow = null;
  if (viewport.width >= 1000) {
    await page.evaluate(id => {
      const result = window.webglGeneratorApi.selection.select({kind: "note", id});
      if (!result?.ok) throw new Error(result?.error?.message || "备注选择失败");
    }, noteId);
    await page.waitForSelector('.floating-panel[data-panel-id="object-details"]:not(.hidden)');
    coexistence = await inspectPanelCoexistence(page);
    assert.equal(coexistence.overlap, false, `${viewport.label} 对象详情不得覆盖手动主面板`);
    const withDetails = await readPanelPositionState(page, panelId);
    assertPanelPositionNear(withDetails.runtime, target, viewport, "对象详情共存后");
    assertPanelPositionNear(withDetails.preference, target, viewport, "对象详情共存偏好");

    await page.setViewportSize({width: 720, height: viewport.height});
    await page.waitForSelector(panelSelector, {state: "hidden"});
    narrowed = await inspectPanelCoexistence(page);
    assert.deepEqual(narrowed.main, [], `${viewport.label} 缩窄后较早打开的城市面板必须关闭`);
    assert.deepEqual(narrowed.details.map(item => item.id), ["object-details"], `${viewport.label} 缩窄后必须保留后打开的对象详情`);
    const narrowedPreference = await readPanelPositionState(page, panelId);
    assertPanelPositionNear(narrowedPreference.preference, target, viewport, "缩窄关闭后的偏好");

    await page.setViewportSize({width: viewport.width, height: viewport.height});
    await page.keyboard.press("Escape");
    await page.waitForSelector('.floating-panel[data-panel-id="object-details"]', {state: "hidden"});
    await page.keyboard.press("Shift+C");
    await page.waitForSelector(`${panelSelector}:not(.hidden)`);
    assert.deepEqual(await visibleMainPanelIds(page), [panelId], `${viewport.label} 恢复宽屏后 Shift+C 必须唯一重开城市面板`);
    restoredAfterNarrow = await readPanelPositionState(page, panelId);
    assertPanelPositionNear(restoredAfterNarrow.runtime, target, viewport, "恢复宽屏重开后");
    assertPanelPositionNear(restoredAfterNarrow.preference, target, viewport, "恢复宽屏后的偏好");
  }

  return {clickMode, target, dragged, reopened, coexistence, narrowed, restoredAfterNarrow};
}

async function readPanelPositionState(page, panelId) {
  return page.evaluate(id => {
    const panel = document.querySelector(`.floating-panel[data-panel-id="${id}"]`);
    const saved = JSON.parse(localStorage.getItem(`webgl-generator-panel:${id}`) || "{}");
    return {
      runtime: {left: Number.parseFloat(panel.style.left) || 0, top: Number.parseFloat(panel.style.top) || 0},
      preference: {left: saved.left, top: saved.top},
      positionMode: saved.positionMode
    };
  }, panelId);
}

function assertPanelPositionNear(actual, expected, viewport, stage) {
  assert.ok(Math.abs(actual.left - expected.left) <= 2, `${viewport.label} ${stage} left 偏差超过 2px`);
  assert.ok(Math.abs(actual.top - expected.top) <= 2, `${viewport.label} ${stage} top 偏差超过 2px`);
}

async function waitForReady(page) {
  await waitForApiReady(page, 60000);
  await page.waitForFunction(() => window.webglGeneratorApi.info.mapSummary()?.data?.ready === true);
}

async function inspectPanelCoexistence(page) {
  return page.evaluate(() => {
    const project = node => {
      const rect = node.getBoundingClientRect();
      return {id: node.dataset.panelId, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom};
    };
    const main = [...document.querySelectorAll('.floating-panel[data-panel-role="main"]:not(.hidden)')].map(project);
    const details = [...document.querySelectorAll('.floating-panel[data-panel-role="detail"]:not(.hidden)')].map(project);
    const a = main[0];
    const b = details[0];
    const overlap = Boolean(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
    return {main, details, overlap};
  });
}

async function visibleMainPanelIds(page) {
  return page.evaluate(() => [...document.querySelectorAll('.floating-panel[data-panel-role="main"]:not(.hidden)')].map(node => node.dataset.panelId));
}

async function inspectFixedOverlay(page, id) {
  return page.evaluate(overlayId => {
    const node = document.querySelector(`[data-overlay-id="${overlayId}"]`);
    const rect = node.getBoundingClientRect();
    const close = node.querySelector('button[aria-label*="关闭"]')?.getBoundingClientRect?.();
    const toolbar = document.querySelector(".map-toolbar")?.getBoundingClientRect?.();
    return {
      id: overlayId,
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      zIndex: Number(getComputedStyle(node).zIndex) || 0,
      safeArea: node.dataset.overlaySafeArea,
      closeVisible: Boolean(close && close.left >= 0 && close.top >= 0 && close.right <= innerWidth && close.bottom <= innerHeight),
      overlapsToolbar: Boolean(toolbar && rect.left < toolbar.right && rect.right > toolbar.left && rect.top < toolbar.bottom && rect.bottom > toolbar.top)
    };
  }, id);
}

function assertSafeOverlay(result, viewport, label) {
  assert(result.top >= 63, `${viewport.label} ${label} 侵入顶部地图工具安全区`);
  assert(result.bottom <= viewport.height - 63, `${viewport.label} ${label} 侵入底部提示安全区`);
  assert.equal(result.closeVisible, true, `${viewport.label} ${label} 关闭控件不可达`);
  assert.equal(result.overlapsToolbar, false, `${viewport.label} ${label} 遮挡地图工具栏`);
  assert(result.zIndex >= 900, `${viewport.label} ${label} 没有进入统一层级`);
  assert.equal(result.safeArea, "12,64,12,64", `${viewport.label} ${label} 没有使用统一安全区`);
}

async function startStaticServer() {
  const serverInstance = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, `http://${host}:${port}`).pathname);
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
    ".png": "image/png",
    ".svg": "image/svg+xml"
  })[extname(file).toLowerCase()] || "application/octet-stream";
}

function delay(ms) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms));
}
