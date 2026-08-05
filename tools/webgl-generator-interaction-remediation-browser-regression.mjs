#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createServer as createViteServer} from "vite";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const auditPath = join(rootDir, "docs", "generated", "interaction-audit", "canvas-and-direct-manipulation.json");
const audit = JSON.parse(readFileSync(auditPath, "utf8"));
const coveredModeIds = audit.modeContracts.map(item => item.modeId).sort();
const host = "127.0.0.1";
const port = 5516;
const baseUrl = `http://${host}:${port}`;
const timeoutMs = 180000;
const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const vite = await createViteServer({
  configFile: join(rootDir, "vite.config.mjs"),
  server: {host, port, strictPort: true},
  logLevel: "error"
});
let browser;

try {
  await vite.listen();
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  const context = await browser.newContext({viewport: {width: 1280, height: 820}, deviceScaleFactor: 1});
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  const consoleErrors = [];
  const healthConsoleErrors = [];
  const pageErrors = [];
  page.on("console", message => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (text.startsWith("[FMG health]")) healthConsoleErrors.push(text);
    else consoleErrors.push(text);
  });
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto(`${baseUrl}/?debug=1&healthClear=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, timeoutMs);
  await page.waitForFunction(() => window.webglGeneratorApi.info.mapSummary()?.data?.ready === true);
  if (await page.locator("#app-loading-screen").getAttribute("data-state") === "error") {
    await page.reload({waitUntil: "domcontentloaded"});
    await waitForApiReady(page, timeoutMs);
    await page.waitForFunction(() => window.webglGeneratorApi.info.mapSummary()?.data?.ready === true);
  }
  await page.waitForFunction(() => document.getElementById("app-loading-screen")?.hidden === true);
  console.log("[interaction-remediation] runtime", await page.evaluate(() => ({
    states: window.__webglGeneratorApp.map.politics.states.filter(item => item && !item.removed).length,
    cities: window.__webglGeneratorApp.map.settlements.cities.filter(Boolean).length
  })));

  console.log("[interaction-remediation] 1/5 运行时模式三向差集");
  const runtimeModes = await verifyRuntimeModeSets(page, coveredModeIds);
  page.setDefaultTimeout(30000);
  console.log("[interaction-remediation] 2/5 动作身份、ARIA 与双击");
  const actionSemantics = await verifyActionSemantics(page);
  console.log("[interaction-remediation] 3/5 定位、no-op 与模式反馈");
  const feedback = await verifyFeedbackFamilies(page);
  console.log("[interaction-remediation] 4/5 长表首中末与命中框");
  const tableGeometry = await verifyTableGeometry(page);
  const directManipulation = [];
  console.log("[interaction-remediation] 5/5 六类直接操控生命周期");
  page.setDefaultTimeout(30000);
  for (const viewport of [{width: 1280, height: 820}, {width: 576, height: 576}]) {
    await page.setViewportSize(viewport);
    const realPaths = await verifyRealDirectManipulationPaths(page, viewport);
    const lifecycle = await verifyDirectManipulationMatrix(page, viewport);
    directManipulation.push({...lifecycle, realPaths});
  }
  const mapReplace = await verifyMapReplaceCleanup(page);
  await page.setViewportSize({width: 1280, height: 820});
  const runtime = await page.evaluate(() => ({
    glError: window.__webglGeneratorApp.renderer.getStats().draw?.glError ?? 0,
    documentOverflow: {
      x: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      y: Math.max(0, document.documentElement.scrollHeight - document.documentElement.clientHeight)
    }
  }));

  assert.equal(runtime.glError, 0, "WebGL error 必须为 0");
  assert.deepEqual(runtime.documentOverflow, {x: 0, y: 0}, "正式应用不得产生 document 溢出");
  assert.deepEqual(consoleErrors, [], "不得产生 application console error");
  assert.deepEqual(pageErrors, [], "不得产生 page error");
  assert.equal(
    healthConsoleErrors.every(text => /main-thread-long-task|input-handler-stall/.test(text)),
    true,
    `只允许既有 long-task / input-stall 健康遥测：${JSON.stringify(healthConsoleErrors)}`
  );

  console.log(JSON.stringify({
    ok: true,
    runtimeModes,
    directManipulation,
    mapReplace,
    actionSemantics,
    feedback,
    tableGeometry,
    runtime,
    consoleErrors,
    healthConsoleErrors,
    pageErrors
  }, null, 2));
  await context.close();
} finally {
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await vite.close();
}

async function verifyRuntimeModeSets(page, coveredIds) {
  const snapshot = await page.evaluate(() => window.__webglGeneratorApp.canvasToolModes.getSnapshot());
  const declared = [...snapshot.declaredModeIds].sort();
  const registered = [...snapshot.registeredModeIds].sort();
  const covered = [...coveredIds].sort();
  const differences = {
    declaredMissingRegistered: difference(declared, registered),
    registeredMissingDeclared: difference(registered, declared),
    declaredMissingCovered: difference(declared, covered),
    coveredMissingDeclared: difference(covered, declared),
    registeredMissingCovered: difference(registered, covered),
    coveredMissingRegistered: difference(covered, registered)
  };
  assert.equal(declared.length, 29, "正式运行时模式分母必须为 29");
  assert.equal(registered.length, 29, "正式运行时注册快照必须为 29");
  assert.equal(covered.length, 29, "回归覆盖集合必须为 29");
  assert.equal(Object.values(differences).flat().length, 0, "声明 / 注册 / 覆盖三向差集必须为 0");
  return {declared: declared.length, registered: registered.length, covered: covered.length, differences};
}

async function verifyDirectManipulationMatrix(page, viewport) {
  return page.evaluate(async ({viewport}) => {
    const module = await import("/src/runtime/direct-manipulation-session.js");
    const kinds = ["custom-label", "measurement-point", "panel-manager", "ui-action-dock", "vue-floating-panel", "object-table-column"];
    const reasons = ["pointerup", "pointercancel", "lostpointercapture", "panel-close"];
    const outcomes = [];

    for (const reason of reasons) {
      for (const kind of kinds) {
        let commits = 0;
        let rollbacks = 0;
        let cleanups = 0;
        const scopeElement = document.createElement("div");
        scopeElement.dataset.browserDirectKind = kind;
        document.body.append(scopeElement);
        const session = module.beginDirectManipulationSession({
          kind,
          scopeElement,
          ownerId: kind,
          onCommit: () => commits++,
          onRollback: () => rollbacks++,
          onCleanup: () => cleanups++
        });
        const first = session.finish(reason);
        const second = session.finish(reason);
        outcomes.push({kind, reason, first, second, commits, rollbacks, cleanups});
        scopeElement.remove();
      }
    }

    return {
      viewport,
      kinds,
      reasons,
      outcomes
    };
  }, {viewport}).then(result => {
    for (const item of result.outcomes) {
      assert.equal(item.first, true, `${item.kind}/${item.reason} 首次结束失败`);
      assert.equal(item.second, false, `${item.kind}/${item.reason} 重复结束未保持幂等`);
      assert.equal(item.cleanups, 1, `${item.kind}/${item.reason} 清理次数错误`);
      assert.equal(item.commits, item.reason === "pointerup" ? 1 : 0, `${item.kind}/${item.reason} 提交次数错误`);
      assert.equal(item.rollbacks, item.reason === "pointerup" ? 0 : 1, `${item.kind}/${item.reason} 回滚次数错误`);
    }
    return {
      viewport: result.viewport,
      kinds: result.kinds.length,
      lifecycleCases: result.outcomes.length,
      normalCommits: result.outcomes.filter(item => item.commits === 1).length,
      rollbackCases: result.outcomes.filter(item => item.rollbacks === 1).length
    };
  });
}

async function verifyRealDirectManipulationPaths(page, viewport) {
  const customLabel = await verifyCustomLabelDrag(page);
  const measurement = await verifyMeasurementPointDrag(page);
  const panel = await verifyManagedPanelDrag(page);
  const actionDock = await verifyActionDockDrag(page);
  const vueOverlay = await verifyVueOverlayDrag(page);
  const column = await verifyColumnResizeDrag(page);
  return {viewport, customLabel, measurement, panel, actionDock, vueOverlay, column};
}

async function verifyCustomLabelDrag(page) {
  await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    for (const panel of document.querySelectorAll(".floating-panel:not(.hidden)")) {
      app.panelManager.close(panel.dataset.panelId, {restoreFocus: false, restoreParent: false});
    }
  });
  const screenPoint = await uncoveredCanvasPoint(page, {x: 0.68, y: 0.42});
  const setup = await page.evaluate(async screenPoint => {
    const app = window.__webglGeneratorApp;
    const point = app.renderer.screenToWorld(screenPoint.x, screenPoint.y);
    const created = await window.webglGeneratorApi.edit.labels.addCustom({
      text: `直接操控验收${innerWidth}`,
      x: point.x,
      y: point.y
    });
    if (!created?.ok) throw new Error(created?.error?.message || "创建手工标签失败");
    const label = app.map.labels.custom.at(-1);
    return {
      id: label.id,
      point: {x: label.x, y: label.y},
      history: app.editHistory.getStats()
    };
  }, screenPoint);
  const selector = `.custom-label[data-label-target-id="${setup.id}"]`;
  await page.locator(selector).waitFor({state: "visible"});
  const drag = await cancelTrustedDrag(page, `${selector} .map-label-content`, {
    observedSelector: selector,
    captureSelector: ".map-overlay",
    expectedKind: "custom-label"
  });
  const after = await page.evaluate(id => {
    const app = window.__webglGeneratorApp;
    const label = app.map.labels.custom.find(item => item?.id === id);
    return {
      point: {x: label.x, y: label.y},
      history: app.editHistory.getStats(),
      selection: app.selectionStore.getSnapshot().selection?.object || null,
      activeDrag: Boolean(app.customLabelDrag)
    };
  }, setup.id);
  assert.deepEqual(after.point, setup.point, "手工标签 pointercancel 未恢复起点");
  assert.deepEqual(after.history, setup.history, "手工标签 pointercancel 错误写入历史");
  assert.equal(after.selection?.id, setup.id, "手工标签取消后 selection 未保持目标");
  assert.equal(after.activeDrag, false, "手工标签取消后 drag 未清理");
  assert.equal(drag.captureAfter, false, "手工标签取消后 pointer capture 未释放");
  assert.deepEqual(drag.after, drag.late, "手工标签取消后迟到 pointermove 仍生效");
  return {id: setup.id, movedDuringGesture: rectMoved(drag.before, drag.during), restored: true, historyUnchanged: true, captureReleased: true, lateMoveIgnored: true};
}

async function verifyMeasurementPointDrag(page) {
  await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    app.canvasToolModes.cancel(null, "browser-setup");
    for (const panel of document.querySelectorAll(".floating-panel:not(.hidden)")) {
      app.panelManager.close(panel.dataset.panelId, {restoreFocus: false, restoreParent: false});
    }
    app.canvasToolModes.enter("measurement:draw");
  });
  const canvas = page.locator("#map-canvas");
  const box = await canvas.boundingBox();
  assert.ok(box, "地图画布不可见");
  const firstPoint = await uncoveredCanvasPoint(page, {x: 0.4, y: 0.45});
  const secondPoint = await uncoveredCanvasPoint(page, {x: 0.56, y: 0.55});
  await page.mouse.click(firstPoint.x, firstPoint.y);
  await page.mouse.click(secondPoint.x, secondPoint.y);
  await page.waitForFunction(() => document.querySelectorAll(".measurement-point").length >= 2);
  const setup = await page.evaluate(() => ({
    point: {...window.__webglGeneratorApp.measurement.points[0]},
    history: window.__webglGeneratorApp.editHistory.getStats(),
    selection: window.__webglGeneratorApp.selectionStore.getSnapshot()
  }));
  const drag = await cancelTrustedDrag(page, ".measurement-point", {
    observedSelector: ".measurement-point",
    captureSelector: ".map-overlay",
    expectedKind: "measurement-point"
  });
  const after = await page.evaluate(() => ({
    point: {...window.__webglGeneratorApp.measurement.points[0]},
    history: window.__webglGeneratorApp.editHistory.getStats(),
    selection: window.__webglGeneratorApp.selectionStore.getSnapshot(),
    activeDrag: Boolean(window.__webglGeneratorApp.measurement.drag)
  }));
  assert.deepEqual(after.point, setup.point, "测量控制点 pointercancel 未恢复起点");
  assert.deepEqual(after.history, setup.history, "测量控制点 pointercancel 错误写入历史");
  assert.deepEqual(after.selection, setup.selection, "测量控制点 pointercancel 错误改变 selection");
  assert.equal(after.activeDrag, false, "测量控制点取消后 window listener / drag 未清理");
  assert.equal(drag.captureAfter, false, "测量控制点取消后 pointer capture 未释放");
  assert.deepEqual(drag.after, drag.late, "测量控制点取消后迟到 pointermove 仍生效");
  await page.keyboard.press("Escape");
  return {movedDuringGesture: rectMoved(drag.before, drag.during), restored: true, historyUnchanged: true, selectionUnchanged: true, captureReleased: true, lateMoveIgnored: true};
}

async function verifyManagedPanelDrag(page) {
  await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    for (const panel of document.querySelectorAll(".floating-panel:not(.hidden)")) {
      app.panelManager.close(panel.dataset.panelId, {restoreFocus: false, restoreParent: false});
    }
    app.panels.height.open(app.editHistory.getStats());
  });
  const panelSelector = '.floating-panel[data-panel-id="height-panel"]:not(.hidden)';
  await page.locator(panelSelector).waitFor({state: "visible"});
  await page.locator(`${panelSelector} .height-panel-summary`).waitFor({state: "visible"});
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(120);
  const before = await readUiState(page, panelSelector, "height-panel");
  const drag = await cancelTrustedDrag(page, `${panelSelector} .floating-panel-header`, {
    observedSelector: panelSelector,
    cancelTarget: "element",
    expectedKind: "panel-manager"
  });
  const after = await readUiState(page, panelSelector, "height-panel");
  assertRectNear(after.rect, before.rect, "主浮动面板 pointercancel 未恢复位置");
  assert.deepEqual(after.storage, before.storage, "主浮动面板 pointercancel 错误写入 localStorage");
  assert.deepEqual(after.history, before.history, "主浮动面板 pointercancel 错误写入历史");
  assert.deepEqual(after.selection, before.selection, "主浮动面板 pointercancel 错误改变 selection");
  assert.equal(drag.captureAfter, false, "主浮动面板取消后 pointer capture 未释放");
  assert.deepEqual(drag.after, drag.late, "主浮动面板取消后迟到 pointermove 仍生效");
  const coexistenceCommit = await verifyManagedPanelCommitCoexistence(page, panelSelector);
  return {
    movedDuringGesture: rectMoved(drag.before, drag.during),
    restored: true,
    storageUnchanged: true,
    historyUnchanged: true,
    selectionUnchanged: true,
    captureReleased: true,
    lateMoveIgnored: true,
    coexistenceCommit
  };
}

async function verifyManagedPanelCommitCoexistence(page, panelSelector) {
  const viewport = page.viewportSize();
  if (viewport.width < 800) return {applicable: false, reason: "窄屏不允许主面板与详情面板共存"};
  await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const city = app.map.settlements.cities.find(Boolean);
    app.panels.objectDetails.show({object: {kind: "city", id: city.id, name: city.name}});
  });
  const detailSelector = '.floating-panel[data-panel-id="object-details"]:not(.hidden)';
  await page.locator(detailSelector).waitFor({state: "visible"});
  const beforeMain = await readRect(page, panelSelector);
  const beforeDetail = await readRect(page, detailSelector);
  assert.equal(rectanglesOverlap(beforeMain, beforeDetail), false, "主面板与详情面板初始 dock 不得重叠");

  const handleSelector = `${panelSelector} .floating-panel-header`;
  const handle = page.locator(handleSelector).first();
  const start = await findHittablePoint(handle, handleSelector);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  const session = await readActiveDirectManipulationSession(page, "panel-manager");
  const captureDuring = await handle.evaluate(
    (element, pointerId) => element.hasPointerCapture?.(pointerId) || false,
    session.pointerId
  );
  assert.equal(captureDuring, true, "主面板共存提交路径未建立 pointer capture");
  const target = {
    x: beforeDetail.left + beforeDetail.width / 2,
    y: Math.max(12, Math.min(viewport.height - 12, start.y))
  };
  await page.mouse.move(target.x, target.y, {steps: 8});
  const duringMain = await readRect(page, panelSelector);
  assert.equal(rectMoved(beforeMain, duringMain), true, "主面板共存提交路径未发生真实移动");
  await page.mouse.up();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(50);

  const afterMain = await readRect(page, panelSelector);
  const afterDetail = await readRect(page, detailSelector);
  const activeAfter = await readActiveDirectManipulationSession(page, "panel-manager", {required: false});
  const captureAfter = await handle.evaluate(
    (element, pointerId) => element.hasPointerCapture?.(pointerId) || false,
    session.pointerId
  );
  assert.equal(activeAfter, null, "主面板 pointerup 后活动事务未清理");
  assert.equal(captureAfter, false, "主面板 pointerup 后 pointer capture 未释放");
  assert.equal(rectanglesOverlap(afterMain, afterDetail), false, "主面板 pointerup 后共存重排仍发生重叠");
  const saved = await page.evaluate(() => localStorage.getItem("webgl-generator-panel:height-panel"));
  assert.equal(JSON.parse(saved || "{}").positionMode, "manual", "主面板 pointerup 后未提交手工位置");
  await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    app.panels.objectDetails.clear();
    app.panelManager.close("height-panel", {restoreFocus: false, restoreParent: false});
  });
  return {
    applicable: true,
    movedDuringGesture: true,
    captureEstablished: true,
    captureReleased: true,
    sessionCleared: true,
    overlapAfterCommit: false,
    position: "manual"
  };
}

async function verifyActionDockDrag(page) {
  await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    app.panels.state.updateAddMode(false);
    app.panels.state.open(app.map, app.editHistory.getStats());
  });
  const statePanel = page.locator('.floating-panel[data-panel-id="state-panel"]:not(.hidden)');
  await statePanel.locator(".object-table-row").first().click();
  await statePanel.locator('[data-action-id="StatePanel:rename"]').click();
  const panelSelector = '.ui-secondary-action-panel[aria-label="重命名"]';
  await page.locator(panelSelector).waitFor({state: "visible"});
  const before = await readUiState(page, panelSelector, "StatePanel");
  const drag = await cancelTrustedDrag(page, `${panelSelector} .ui-secondary-action-header`, {
    observedSelector: panelSelector,
    expectedKind: "ui-action-dock"
  });
  const after = await readUiState(page, panelSelector, "StatePanel");
  assertRectNear(after.rect, before.rect, "动作坞二级面板 pointercancel 未恢复位置");
  assert.deepEqual(after.storage, before.storage, "动作坞取消错误写入 localStorage");
  assert.deepEqual(after.history, before.history, "动作坞取消错误写入历史");
  assert.deepEqual(after.selection, before.selection, "动作坞取消错误改变 selection");
  assert.equal(drag.captureAfter, false, "动作坞取消后 pointer capture 未释放");
  assert.deepEqual(drag.after, drag.late, "动作坞取消后迟到 pointermove 仍生效");
  await page.locator(`${panelSelector} .ui-secondary-action-close`).click();
  return {movedDuringGesture: rectMoved(drag.before, drag.during), restored: true, historyUnchanged: true, selectionUnchanged: true, captureReleased: true, lateMoveIgnored: true};
}

async function verifyVueOverlayDrag(page) {
  await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    app.panels.culture.open(app.map, app.editHistory.getStats());
  });
  await page.locator('.floating-panel[data-panel-id="culture-panel"]:not(.hidden) .inheritance-tree-open').click();
  const panelSelector = '.ui-tree-display-panel[aria-label="文化树总览"]';
  await page.locator(panelSelector).waitFor({state: "visible"});
  await page.waitForFunction(() => Boolean(document.querySelector('.ui-tree-display-panel[aria-label="文化树总览"]')?.style.left));
  await page.waitForTimeout(180);
  const before = await readUiState(page, panelSelector, "culture-tree");
  const drag = await cancelTrustedDrag(page, `${panelSelector} .ui-tree-display-header`, {
    observedSelector: panelSelector,
    expectedKind: "vue-floating-panel"
  });
  const after = await readUiState(page, panelSelector, "culture-tree");
  assertRectNear(after.rect, before.rect, "Vue 树状浮层 pointercancel 未恢复位置");
  assert.deepEqual(after.storage, before.storage, "Vue 树状浮层 pointercancel 错误写入 localStorage");
  assert.deepEqual(after.history, before.history, "Vue 树状浮层 pointercancel 错误写入历史");
  assert.deepEqual(after.selection, before.selection, "Vue 树状浮层 pointercancel 错误改变 selection");
  assert.equal(drag.captureAfter, false, "Vue 树状浮层取消后 pointer capture 未释放");
  assert.deepEqual(drag.after, drag.late, "Vue 树状浮层取消后迟到 pointermove 仍生效");
  await page.locator(`${panelSelector} .ui-tree-display-close`).click();
  return {movedDuringGesture: rectMoved(drag.before, drag.during), restored: true, storageUnchanged: true, historyUnchanged: true, selectionUnchanged: true, captureReleased: true, lateMoveIgnored: true};
}

async function verifyColumnResizeDrag(page) {
  await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    app.panels.city.open(app.map, app.editHistory.getStats());
  });
  const panelSelector = '.floating-panel[data-panel-id="city-panel"]:not(.hidden)';
  const handleSelector = `${panelSelector} .object-table-column-resize-handle`;
  await page.locator(handleSelector).first().waitFor({state: "visible"});
  const observedSelector = `${panelSelector} .object-table-native th.object-table-resizable-column`;
  const before = await readUiState(page, observedSelector, "city-panel");
  const drag = await cancelTrustedDrag(page, handleSelector, {
    observedSelector,
    expectedKind: "object-table-column"
  });
  const after = await readUiState(page, observedSelector, "city-panel");
  assertRectNear(after.rect, before.rect, "对象表格列宽 pointercancel 未恢复宽度");
  assert.deepEqual(after.storage, before.storage, "对象表格列宽 pointercancel 错误写入 localStorage");
  assert.deepEqual(after.history, before.history, "对象表格列宽 pointercancel 错误写入历史");
  assert.deepEqual(after.selection, before.selection, "对象表格列宽 pointercancel 错误改变 selection");
  assert.equal(drag.captureAfter, false, "列宽取消后 pointer capture 未释放");
  assert.deepEqual(drag.after, drag.late, "列宽取消后迟到 pointermove 仍生效");
  return {widthChangedDuringGesture: Math.abs(drag.before.width - drag.during.width) > 1, restored: true, storageUnchanged: true, historyUnchanged: true, selectionUnchanged: true, captureReleased: true, lateMoveIgnored: true};
}

async function verifyMapReplaceCleanup(page) {
  return page.evaluate(async () => {
    const module = await import("/src/runtime/direct-manipulation-session.js");
    const kinds = ["custom-label", "measurement-point", "panel-manager", "ui-action-dock", "vue-floating-panel", "object-table-column"];
    const reasons = [];
    for (const kind of kinds) {
      module.beginDirectManipulationSession({
        kind,
        ownerId: kind,
        onRollback: ({reason}) => reasons.push(`${kind}:${reason}`)
      });
    }
    const before = module.getDirectManipulationSessionSnapshot().length;
    const generation = await window.webglGeneratorApi.generate.newMap({
      seed: "interaction-remediation-map-replace",
      cellsTarget: 10000,
      confirm: true
    });
    if (!generation?.ok) throw new Error(generation?.error?.message || "换图失败");
    const after = module.getDirectManipulationSessionSnapshot().length;
    return {before, after, reasons: reasons.sort()};
  }).then(result => {
    assert.equal(result.before, 6, "换图前必须存在六类活动会话");
    assert.equal(result.after, 0, "换图后六类活动会话必须全部清理");
    assert.deepEqual(result.reasons, [
      "custom-label:map-replace",
      "measurement-point:map-replace",
      "object-table-column:map-replace",
      "panel-manager:map-replace",
      "ui-action-dock:map-replace",
      "vue-floating-panel:map-replace"
    ]);
    return result;
  });
}

async function cancelTrustedDrag(
  page,
  handleSelector,
  {observedSelector = handleSelector, captureSelector = handleSelector, cancelTarget = "window", expectedKind, dx = 36, dy = 24} = {}
) {
  const handle = page.locator(handleSelector).first();
  const captureTarget = page.locator(captureSelector).first();
  const box = await handle.boundingBox();
  assert.ok(box, `拖动入口不可见：${handleSelector}`);
  const start = await findHittablePoint(handle, handleSelector);
  const before = await readRect(page, observedSelector);
  const viewport = page.viewportSize();
  const moveDx = before.left + before.width + Math.abs(dx) + 8 <= viewport.width ? Math.abs(dx) : -Math.abs(dx);
  const moveDy = before.top + before.height + Math.abs(dy) + 8 <= viewport.height ? Math.abs(dy) : -Math.abs(dy);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  const activeSessionRecord = await readActiveDirectManipulationSession(page, expectedKind);
  const activePointerId = activeSessionRecord?.pointerId;
  const captureDuring = await captureTarget.evaluate(
    (element, pointerId) => element.hasPointerCapture?.(pointerId) || false,
    activePointerId
  );
  assert.equal(captureDuring, true, `真实 DOM 拖动未建立 pointer capture：${handleSelector}`);
  await page.mouse.move(start.x + moveDx, start.y + moveDy, {steps: 3});
  const during = await readRect(page, observedSelector);
  assert.equal(
    expectedKind === "object-table-column"
      ? Math.abs(before.width - during.width) > 1
      : rectMoved(before, during),
    true,
    `真实 DOM 拖动未产生可见变化：${expectedKind}；before=${JSON.stringify(before)}；during=${JSON.stringify(during)}；delta=${moveDx},${moveDy}`
  );
  await page.evaluate(({handleSelector, cancelTarget, pointerId, x, y}) => {
    const event = new PointerEvent("pointercancel", {
      pointerId,
      pointerType: "mouse",
      button: 0,
      buttons: 0,
      clientX: x,
      clientY: y,
      bubbles: true,
      cancelable: true
    });
    if (cancelTarget === "element") document.querySelector(handleSelector)?.dispatchEvent(event);
    else window.dispatchEvent(event);
  }, {handleSelector, cancelTarget, pointerId: activePointerId, x: start.x + moveDx, y: start.y + moveDy});
  await page.waitForTimeout(50);
  await page.mouse.move(start.x, start.y);
  await page.mouse.up();
  await page.waitForTimeout(50);
  const after = await readRect(page, observedSelector);
  const captureAfter = await captureTarget.evaluate(
    (element, pointerId) => element.hasPointerCapture?.(pointerId) || false,
    activePointerId
  );
  await page.evaluate(({pointerId, x, y}) => {
    window.dispatchEvent(new PointerEvent("pointermove", {
      pointerId,
      pointerType: "mouse",
      buttons: 1,
      clientX: x,
      clientY: y,
      bubbles: true
    }));
  }, {pointerId: activePointerId, x: start.x + moveDx * 2, y: start.y + moveDy * 2});
  await page.waitForTimeout(30);
  const late = await readRect(page, observedSelector);
  return {
    before,
    during,
    after,
    late,
    captureDuring,
    captureAfter,
    activeKinds: [activeSessionRecord.kind]
  };
}

async function findHittablePoint(handle, selector) {
  const point = await handle.evaluate(element => {
    const rect = element.getBoundingClientRect();
    for (const xRatio of [0.5, 0.25, 0.75, 0.1, 0.9]) {
      for (const yRatio of [0.5, 0.25, 0.75, 0.1, 0.9]) {
        const x = rect.left + rect.width * xRatio;
        const y = rect.top + rect.height * yRatio;
        const hit = document.elementFromPoint(x, y);
        if (hit && (hit === element || element.contains(hit))) return {x, y};
      }
    }
    return null;
  });
  assert.ok(point, `拖动入口被其它元素遮挡：${selector}`);
  return point;
}

async function readActiveDirectManipulationSession(page, kind, {required = true} = {}) {
  const result = await page.evaluate(async kind => {
    const moduleUrl = performance
      .getEntriesByType("resource")
      .map(entry => entry.name)
      .find(url => url.includes("/src/runtime/direct-manipulation-session.js"));
    const module = await import(moduleUrl || "/src/runtime/direct-manipulation-session.js");
    return {
      moduleUrl: moduleUrl || "/src/runtime/direct-manipulation-session.js",
      session: module.getDirectManipulationSessionSnapshot().find(session => session.kind === kind) || null
    };
  }, kind);
  if (required) {
    assert.ok(result.session, `真实 DOM 拖动未登记 ${kind} 活动事务；模块=${result.moduleUrl}`);
  }
  return result.session;
}

async function readRect(page, selector) {
  return page.locator(selector).first().evaluate(element => {
    const rect = element.getBoundingClientRect();
    return {left: rect.left, top: rect.top, width: rect.width, height: rect.height};
  });
}

async function readUiState(page, selector, storageNeedle) {
  return page.locator(selector).first().evaluate((element, storageNeedle) => {
    const app = window.__webglGeneratorApp;
    const rect = element.getBoundingClientRect();
    return {
      rect: {left: rect.left, top: rect.top, width: rect.width, height: rect.height},
      storage: Object.fromEntries(
        Object.keys(localStorage)
          .filter(key => key.includes(storageNeedle))
          .sort()
          .map(key => [key, localStorage.getItem(key)])
      ),
      history: app.editHistory.getStats(),
      selection: app.selectionStore.getSnapshot()
    };
  }, storageNeedle);
}

function assertRectNear(actual, expected, message) {
  for (const key of ["left", "top", "width", "height"]) {
    assert.ok(Math.abs(actual[key] - expected[key]) <= 1, `${message}：${key} ${actual[key]} / ${expected[key]}`);
  }
}

function rectMoved(before, after) {
  return Math.abs(before.left - after.left) > 1 || Math.abs(before.top - after.top) > 1;
}

function rectanglesOverlap(left, right) {
  return !(
    left.left + left.width <= right.left
    || right.left + right.width <= left.left
    || left.top + left.height <= right.top
    || right.top + right.height <= left.top
  );
}

async function uncoveredCanvasPoint(page, preferred) {
  return page.evaluate(preferred => {
    const canvas = document.getElementById("map-canvas");
    const rect = canvas.getBoundingClientRect();
    const candidates = [
      preferred,
      {x: 0.75, y: 0.5},
      {x: 0.5, y: 0.75},
      {x: 0.75, y: 0.75},
      {x: 0.5, y: 0.5}
    ];
    for (const candidate of candidates) {
      const x = rect.left + rect.width * candidate.x;
      const y = rect.top + rect.height * candidate.y;
      if (document.elementFromPoint(x, y) === canvas) return {x, y};
    }
    throw new Error("找不到未被浮层覆盖的画布坐标");
  }, preferred);
}

async function verifyActionSemantics(page) {
  await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const state = app.map.politics.states.find(item => item?.id && !item.removed);
    window.webglGeneratorApi.selection.select({kind: "state", id: state.id});
    app.panels.state.setTargetStateId(state.id);
    app.panels.state.open(app.map, app.editHistory.getStats());
  });
  const statePanel = page.locator('.floating-panel[data-panel-id="state-panel"]:not(.hidden)');
  await statePanel.waitFor({state: "visible"});
  const add = statePanel.locator('[data-action-id="StatePanel:add"]');
  await add.click();
  await page.waitForFunction(() => window.__webglGeneratorApp.canvasToolModes.getActive()?.id === "state:add");
  const toggleState = await add.evaluate(element => ({
    active: element.classList.contains("active"),
    editing: element.classList.contains("is-editing"),
    ariaPressed: element.getAttribute("aria-pressed")
  }));
  assert.deepEqual(toggleState, {active: true, editing: true, ariaPressed: "true"}, "画布动作视觉 active 与 ARIA 不一致");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__webglGeneratorApp.canvasToolModes.getActive() === null);
  await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const state = app.map.politics.states.find(item => item?.id && !item.removed);
    app.panels.state.updateAddMode(false);
    app.panels.state.setTargetStateId(state.id);
    app.panels.state.update();
    app.panels.state.open(app.map, app.editHistory.getStats());
    window.webglGeneratorApi.selection.select({kind: "state", id: state.id});
  });
  await statePanel.locator(".object-table-row").first().click();

  const rename = statePanel.locator('[data-action-id="StatePanel:rename"]');
  await page.waitForFunction(() => {
    const button = document.querySelector('.floating-panel[data-panel-id="state-panel"]:not(.hidden) [data-action-id="StatePanel:rename"]');
    return button && !button.disabled;
  });
  await rename.click();
  const renameState = await rename.evaluate(element => ({
    active: element.classList.contains("active"),
    editing: element.classList.contains("is-editing"),
    ariaPressed: element.getAttribute("aria-pressed"),
    id: element.dataset.actionId
  }));
  assert.deepEqual(renameState, {active: true, editing: true, ariaPressed: "true", id: "StatePanel:rename"}, "二级动作身份或 active / ARIA 不一致");
  await page.locator('.ui-secondary-action-panel[aria-label="重命名"]').waitFor({state: "visible"});
  await page.locator(".ui-secondary-action-close").click();

  const doubleClick = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    app.panels.state.setActive(false);
    app.selectionStore.stopEditing();
    const store = app.selectionStore;
    const counts = {select: 0, edit: 0};
    const originalSetSelection = store.setSelection.bind(store);
    store.setSelection = (...args) => {
      counts.select++;
      return originalSetSelection(...args);
    };
    document.querySelector('.floating-panel[data-panel-id="state-panel"]:not(.hidden) .object-table-row')
      ?.addEventListener("dblclick", () => counts.edit++, {once: true});
    window.__interactionDoubleClickCounts = counts;
  });
  void doubleClick;
  const firstRow = statePanel.locator(".object-table-row").first();
  await firstRow.dblclick();
  const doubleClickCounts = await page.evaluate(() => ({
    ...window.__interactionDoubleClickCounts,
    renamePanels: document.querySelectorAll('.ui-secondary-action-panel[aria-label="重命名"]').length,
    renameActive: document.querySelector('[data-action-id="StatePanel:rename"]')?.getAttribute("aria-pressed")
  }));
  assert.equal(doubleClickCounts.select, 2, "真实双击应只有两个原生 click 选择，不得由 dblclick 额外补选");
  assert.equal(doubleClickCounts.edit, 1, "真实双击必须只进入一次编辑");
  assert.equal(doubleClickCounts.renamePanels, 1, `双击后必须只打开一个编辑弹框：${JSON.stringify(doubleClickCounts)}`);
  assert.equal(doubleClickCounts.renameActive, "true", `双击后重命名动作必须保持 ARIA active：${JSON.stringify(doubleClickCounts)}`);
  await page.locator('.ui-secondary-action-panel[aria-label="重命名"] .ui-secondary-action-close').click();

  await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const culture = app.map.pack.cultures.find(item => item?.i && !item.removed);
    window.webglGeneratorApi.selection.select({kind: "culture", id: culture.i});
    app.panels.culture.open(app.map, app.editHistory.getStats());
  });
  const culturePanel = page.locator('.floating-panel[data-panel-id="culture-panel"]:not(.hidden)');
  await culturePanel.waitFor({state: "visible"});
  await culturePanel.locator('[data-action-id="CulturePanel:namebase"]').click();
  await page.locator('.floating-panel[data-panel-id="namebase-panel"]:not(.hidden)').waitFor({state: "visible"});
  const crossPanel = await page.evaluate(() => ({
    namebaseVisible: Boolean(document.querySelector('.floating-panel[data-panel-id="namebase-panel"]:not(.hidden)')),
    secondaryVisible: document.querySelectorAll(".ui-secondary-action-panel").length,
    wrongCultureSecondary: Boolean(document.querySelector('.ui-secondary-action-panel[aria-label="名称库绑定"]'))
  }));
  assert.deepEqual(crossPanel, {namebaseVisible: true, secondaryVisible: 0, wrongCultureSecondary: false}, "跨面板动作错误打开本宿主二级层");
  return {toggleState, renameState, doubleClickCounts, crossPanel};
}

async function verifyFeedbackFamilies(page) {
  const result = await page.evaluate(async () => {
    const app = window.__webglGeneratorApp;
    const api = window.webglGeneratorApi;
    const beforeLocate = api.history.get().data;
    const located = app.locateAndSelectObject("state-panel", {kind: "state", id: 999999, name: "幽灵国"});
    const locateStatus = document.getElementById("file-operation-status")?.textContent || "";
    const afterLocate = api.history.get().data;

    const state = app.map.pack.states.find(item => item?.i && !item.removed);
    const beforeRename = api.history.get().data;
    const rename = api.edit.states.rename(state.i, state.name);
    const renameStatus = document.getElementById("file-operation-status")?.textContent || "";
    const afterRename = api.history.get().data;

    const city = app.map.settlements.cities.find(item => item && !item.removed);
    const families = [
      {family: "持续", id: "height:brush"},
      {family: "一次性", id: "state:add"},
      {family: "移动", id: "city:move", context: {cityId: city.id}},
      {family: "选择", id: "feature:topology-select"}
    ];
    const modes = [];
    for (const item of families) {
      app.canvasToolModes.enter(item.id, item.context || {});
      await new Promise(resolve => requestAnimationFrame(resolve));
      const feedback = document.getElementById("canvas-tool-mode-feedback");
      modes.push({
        ...item,
        active: app.canvasToolModes.getActive()?.id || null,
        text: feedback?.textContent?.trim() || "",
        visible: Boolean(feedback && !feedback.hidden && feedback.getBoundingClientRect().width > 0),
        cursor: getComputedStyle(document.getElementById("map-canvas")).cursor
      });
      document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", code: "Escape", bubbles: true, cancelable: true}));
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    return {
      locate: {located, status: locateStatus, historyUnchanged: JSON.stringify(beforeLocate) === JSON.stringify(afterLocate)},
      rename: {ok: rename?.ok, executed: rename?.data?.executed, status: renameStatus, historyUnchanged: JSON.stringify(beforeRename) === JSON.stringify(afterRename)},
      modes,
      afterModes: {
        active: app.canvasToolModes.getActive(),
        feedbackHidden: document.getElementById("canvas-tool-mode-feedback")?.hidden,
        cursor: getComputedStyle(document.getElementById("map-canvas")).cursor
      }
    };
  });
  assert.equal(result.locate.located, false, "不存在对象定位必须失败");
  assert.match(result.locate.status, /无法定位国家.*不存在、已删除或已成为孤儿/);
  assert.equal(result.locate.historyUnchanged, true, "定位失败不得修改历史");
  assert.equal(result.rename.ok, true, "重命名 no-op API 调用必须稳定返回");
  assert.equal(result.rename.executed, false, "同名重命名必须为 no-op");
  assert.match(result.rename.status, /国家.*名称.*变化/);
  assert.equal(result.rename.historyUnchanged, true, "重命名 no-op 不得修改历史");
  for (const item of result.modes) {
    assert.equal(item.active, item.id, `${item.family}模式未成为活动模式`);
    assert.equal(item.visible, true, `${item.family}模式反馈不可见`);
    assert.ok(item.text.length > 4, `${item.family}模式缺少下一步提示`);
    assert.notEqual(item.cursor, "auto", `${item.family}模式仍使用默认光标`);
  }
  assert.equal(result.afterModes.active, null, "Escape 后画布模式未清理");
  assert.equal(result.afterModes.feedbackHidden, true, "Escape 后画布模式反馈未隐藏");
  return result;
}

async function verifyTableGeometry(page) {
  await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    app.panels.city.open(app.map, app.editHistory.getStats());
  });
  const panel = page.locator('.floating-panel[data-panel-id="city-panel"]:not(.hidden)');
  await panel.waitFor({state: "visible"});
  const wrap = panel.locator(".object-table-wrap");
  await wrap.waitFor({state: "visible"});
  const positions = [];
  for (const position of ["start", "middle", "end"]) {
    positions.push(await wrap.evaluate(async (element, position) => {
      element.scrollTop = position === "start" ? 0 : position === "middle" ? element.scrollHeight / 2 : element.scrollHeight;
      element.dispatchEvent(new Event("scroll", {bubbles: true}));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const tbody = element.querySelector("tbody");
      const rows = [...element.querySelectorAll("tbody .object-table-row")];
      const topSpacerCell = tbody?.firstElementChild?.classList.contains("object-table-spacer-row")
        ? tbody.firstElementChild.querySelector("td")
        : null;
      const bottomSpacerCell = tbody?.lastElementChild?.classList.contains("object-table-spacer-row")
        ? tbody.lastElementChild.querySelector("td")
        : null;
      const topSpacer = Number.parseFloat(topSpacerCell?.style.height || "0") || 0;
      const bottomSpacer = Number.parseFloat(bottomSpacerCell?.style.height || "0") || 0;
      const rowHeights = rows.map(row => row.getBoundingClientRect().height);
      const totalRows = Math.round((topSpacer + bottomSpacer + rowHeights.reduce((sum, value) => sum + value, 0)) / 42);
      const reconstructionError = Math.abs(topSpacer + bottomSpacer + rowHeights.reduce((sum, value) => sum + value, 0) - totalRows * 42);
      return {
        position,
        scrollTop: element.scrollTop,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
        renderedRows: rows.length,
        topSpacer,
        bottomSpacer,
        rowHeightMin: Math.min(...rowHeights),
        rowHeightMax: Math.max(...rowHeights),
        reconstructionError
      };
    }, position));
  }
  for (const position of positions) {
    assert.ok(position.renderedRows > 0, `${position.position} 未渲染虚拟行`);
    assert.ok(Math.abs(position.rowHeightMin - 42) <= 1 && Math.abs(position.rowHeightMax - 42) <= 1, `${position.position} 行高偏差超过 1px`);
    assert.ok(position.reconstructionError <= 1, `${position.position} 虚拟定位误差超过 1px`);
  }
  assert.equal(positions[0].topSpacer, 0, "首段不得保留顶部虚拟 spacer");
  assert.equal(positions.at(-1).bottomSpacer, 0, "末段不得保留底部虚拟 spacer");

  const hitTargets = await panel.evaluate(element => {
    const checkbox = element.querySelector(".object-table-selection-checkbox");
    const checkboxHit = element.querySelector(".object-table-selection-hit");
    const resize = element.querySelector(".object-table-column-resize-handle");
    const sort = element.querySelector(".object-table-sort-button");
    const rect = target => target?.getBoundingClientRect();
    return {
      checkbox: {visual: rect(checkbox)?.width || 0, hit: rect(checkboxHit)?.width || 0},
      resize: {hit: rect(resize)?.width || 0, visual: Number.parseFloat(getComputedStyle(resize, "::after").width) || 0},
      sort: {hit: rect(sort)?.height || 0}
    };
  });
  assert.ok(hitTargets.checkbox.visual <= 14.5 && hitTargets.checkbox.hit >= 28, "checkbox 视觉 / 命中框不符合 14 / 28");
  assert.ok(hitTargets.resize.visual <= 2.5 && hitTargets.resize.hit >= 16, "列宽拖柄视觉 / 命中框不符合 2 / 16");
  assert.ok(hitTargets.sort.hit >= 28, "排序按钮命中高度不足 28px");
  return {positions, hitTargets};
}

function difference(left, right) {
  const rightSet = new Set(right);
  return left.filter(item => !rightSet.has(item));
}

function delay(ms) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms));
}
