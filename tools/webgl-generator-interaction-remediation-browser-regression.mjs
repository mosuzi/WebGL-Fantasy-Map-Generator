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
  const pageErrors = [];
  page.on("console", message => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (!text.startsWith("[FMG health]")) consoleErrors.push(text);
  });
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto(`${baseUrl}/?debug=1&healthClear=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, timeoutMs);
  await page.waitForFunction(() => window.webglGeneratorApi.info.mapSummary()?.data?.ready === true);
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
  page.setDefaultTimeout(timeoutMs);
  for (const viewport of [{width: 1280, height: 820}, {width: 576, height: 576}]) {
    await page.setViewportSize(viewport);
    directManipulation.push(await verifyDirectManipulationMatrix(page, viewport));
  }
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

  console.log(JSON.stringify({
    ok: true,
    runtimeModes,
    directManipulation,
    actionSemantics,
    feedback,
    tableGeometry,
    runtime,
    consoleErrors,
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

    const replaceReasons = [];
    for (const kind of kinds) {
      module.beginDirectManipulationSession({
        kind,
        ownerId: kind,
        onRollback: ({reason}) => replaceReasons.push(`${kind}:${reason}`)
      });
    }
    const beforeReplace = module.getDirectManipulationSessionSnapshot();
    const generation = await window.webglGeneratorApi.generate.newMap({
      seed: `interaction-remediation-${viewport.width}`,
      cells: 2000,
      confirm: true
    });
    if (!generation?.ok) throw new Error(generation?.error?.message || "换图失败");
    const afterReplace = module.getDirectManipulationSessionSnapshot();

    return {
      viewport,
      kinds,
      reasons,
      outcomes,
      mapReplace: {before: beforeReplace.length, after: afterReplace.length, reasons: replaceReasons.sort()}
    };
  }, {viewport}).then(result => {
    for (const item of result.outcomes) {
      assert.equal(item.first, true, `${item.kind}/${item.reason} 首次结束失败`);
      assert.equal(item.second, false, `${item.kind}/${item.reason} 重复结束未保持幂等`);
      assert.equal(item.cleanups, 1, `${item.kind}/${item.reason} 清理次数错误`);
      assert.equal(item.commits, item.reason === "pointerup" ? 1 : 0, `${item.kind}/${item.reason} 提交次数错误`);
      assert.equal(item.rollbacks, item.reason === "pointerup" ? 0 : 1, `${item.kind}/${item.reason} 回滚次数错误`);
    }
    assert.equal(result.mapReplace.before, 6, "换图前必须存在六类活动会话");
    assert.equal(result.mapReplace.after, 0, "换图后六类活动会话必须全部清理");
    assert.deepEqual(
      result.mapReplace.reasons,
      result.kinds.map(kind => `${kind}:map-replace`).sort(),
      "换图必须以 map-replace 原因回滚六类会话"
    );
    return {
      viewport: result.viewport,
      kinds: result.kinds.length,
      lifecycleCases: result.outcomes.length,
      normalCommits: result.outcomes.filter(item => item.commits === 1).length,
      rollbackCases: result.outcomes.filter(item => item.rollbacks === 1).length,
      mapReplace: result.mapReplace
    };
  });
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
