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
const port = Number(args.port || 5452);
const timeoutMs = Number(args.timeout || 180000);
const browserChannel = args["browser-channel"] || args.channel || "chrome";
const distDir = resolve(args.dir || join(rootDir, "dist", "webgl-generator"));
const outPath = resolve(args.out || join(rootDir, "docs", "generated", "reports", "keyboard-shortcuts-browser-results.json"));
const markdownPath = resolve(args.markdown || join(rootDir, "docs", "generated", "reports", "keyboard-shortcuts-browser-results.md"));

if (!existsSync(distDir)) fail(`构建产物不存在：${distDir}`);
mkdirSync(dirname(outPath), {recursive: true});
mkdirSync(dirname(markdownPath), {recursive: true});

const playwright = await loadPlaywright(sourceDir);
const server = await startStaticServer({host, port, publicDir: distDir});
let browser = null;

try {
  browser = await launchBrowser(playwright, {headless: !args.headful, browserChannel});
  const context = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1});
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
  await page.waitForFunction(() => window.webglGeneratorApi.info.mapSummary()?.data?.ready === true);
  const result = await inspectShortcuts(page);
  const healthErrors = await inspectHealthErrors(page);
  const report = {
    metadata: {generatedAt: new Date().toISOString(), url: baseUrl, browserChannel, consoleErrors, pageErrors},
    ...result,
    healthErrors,
    passed: result.failures.length === 0 && result.glError === 0 && healthErrors.total === 0 && consoleErrors.length === 0 && pageErrors.length === 0
  };
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(markdownPath, renderMarkdown(report), "utf8");
  console.log(JSON.stringify({
    ok: report.passed,
    shortcuts: report.registry.shortcuts,
    bindings: report.registry.bindings,
    groups: report.registry.groups,
    sampledGroups: report.sampledGroups,
    hint: report.hint,
    hoverShortcutHelp: {
      focusVisible: report.hoverShortcutHelp.focusVisible,
      stableAfterNormalPick: report.hoverShortcutHelp.stableAfterNormalPick,
      stableAfterHeightPick: report.hoverShortcutHelp.stableAfterHeightPick,
      viewportWidths: report.hoverShortcutHelp.viewports.map(item => item.viewport.width)
    },
    glError: report.glError,
    healthErrors: report.healthErrors.total,
    consoleErrors: consoleErrors.length,
    pageErrors: pageErrors.length
  }, null, 2));
  console.log(`Wrote ${outPath}`);
  console.log(`Wrote ${markdownPath}`);
  if (!report.passed) fail(report.failures.map(item => `- ${item}`).join("\n") || "快捷键浏览器回归失败");
} finally {
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await new Promise(resolveClose => server.close(resolveClose));
}

async function inspectShortcuts(page) {
  const failures = [];
  const registry = await page.evaluate(() => {
    const items = window.__webglGeneratorApp?.keyboardShortcuts?.registry || [];
    return {
      shortcuts: items.length,
      bindings: items.reduce((total, item) => total + item.bindings.length, 0),
      groups: [...new Set(items.map(item => item.group))],
      ids: items.map(item => item.id),
      saveAria: document.getElementById("save-browser-storage")?.getAttribute("aria-keyshortcuts") || "",
      toolbarAria: document.getElementById("open-generation-panel")?.getAttribute("aria-keyshortcuts") || ""
    };
  });
  if (registry.shortcuts !== 22 || registry.bindings !== 23) failures.push(`registry 数量错误：${registry.shortcuts}/${registry.bindings}`);
  for (const group of ["file", "generation", "history", "editing", "selection", "view", "layers", "panels"]) {
    if (!registry.groups.includes(group)) failures.push(`registry 缺少 ${group} 分组`);
  }
  if (registry.toolbarAria !== "Shift+G") failures.push(`控制面板 aria-keyshortcuts 错误：${registry.toolbarAria}`);

  const toolbar = page.locator("#open-generation-panel");
  await toolbar.hover();
  await page.waitForTimeout(400);
  const beforeThreshold = await page.locator("#shortcut-toast").isHidden();
  await page.waitForTimeout(520);
  const hint = await page.evaluate(() => {
    const toast = document.getElementById("shortcut-toast");
    const rect = toast.getBoundingClientRect();
    const style = getComputedStyle(toast);
    return {
      visible: !toast.hidden,
      text: toast.textContent,
      centerDelta: Math.abs(rect.left + rect.width / 2 - innerWidth / 2),
      bottom: Math.round(innerHeight - rect.bottom),
      background: style.backgroundColor
    };
  });
  if (!beforeThreshold) failures.push("悬停未到 850ms 就显示提示");
  if (!hint.visible || !hint.text.includes("打开控制面板") || !hint.text.includes("Shift+G")) failures.push("悬停达到阈值后提示内容错误");
  if (hint.centerDelta > 2 || Math.abs(hint.bottom - 22) > 2) failures.push(`快捷键提示没有底部居中：${hint.centerDelta}/${hint.bottom}`);
  if (!hint.background.includes("245, 247, 250")) failures.push(`快捷键提示不是中性半透明背景：${hint.background}`);
  await page.mouse.move(10, 10);
  await page.waitForFunction(() => document.getElementById("shortcut-toast")?.hidden === true);
  const hoverShortcutHelp = await inspectHoverShortcutHelp(page, failures);

  await pressCode(page, "KeyG", {shiftKey: true});
  await page.locator('.floating-panel[data-panel-id="generation-panel"]:not(.hidden)').waitFor({state: "visible"});

  await page.locator("#seed-input").focus();
  await pressCode(page, "KeyH", {shiftKey: true});
  await page.waitForTimeout(80);
  if (await page.locator('.floating-panel[data-panel-id="height-panel"]:not(.hidden)').count()) failures.push("输入框聚焦时仍触发高度面板快捷键");
  await page.evaluate(() => document.activeElement?.blur());

  await page.evaluate(() => {
    const modal = document.createElement("div");
    modal.id = "shortcut-exclusive-modal";
    modal.setAttribute("aria-modal", "true");
    document.body.append(modal);
  });
  await pressCode(page, "KeyH", {shiftKey: true});
  await page.waitForTimeout(80);
  if (await page.locator('.floating-panel[data-panel-id="height-panel"]:not(.hidden)').count()) failures.push("独占键盘模态框存在时仍触发快捷键");
  await page.locator("#shortcut-exclusive-modal").evaluate(element => element.remove());

  await pressCode(page, "KeyH", {shiftKey: true});
  await page.locator('.floating-panel[data-panel-id="height-panel"]:not(.hidden)').waitFor({state: "visible"});
  await page.locator('.floating-panel[data-panel-id="height-panel"] .floating-panel-close').click();
  const canvasModeBefore = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const entered = app.canvasToolModes.enter("height:brush");
    return {entered, mode: app.canvasToolModes.getSnapshot(), history: window.webglGeneratorApi.history.get().data};
  });
  await pressCode(page, "Escape");
  const canvasModeAfter = await page.evaluate(() => ({
    mode: window.__webglGeneratorApp.canvasToolModes.getSnapshot(),
    history: window.webglGeneratorApi.history.get().data
  }));
  const canvasModeCoverage = canvasModeBefore.mode.registrationCoverage;
  if (canvasModeBefore.mode.declaredModeIds.length !== 29 || canvasModeBefore.mode.registeredModeIds.length !== 29 || canvasModeCoverage?.complete !== true || !canvasModeBefore.entered?.changed || canvasModeBefore.mode.active?.id !== "height:brush" || canvasModeAfter.mode.active) failures.push("Escape 没有覆盖当前 29 个已声明且完整注册的画布模式，或未通过通用入口取消活动模式");
  if (canvasModeAfter.history.undo !== canvasModeBefore.history.undo || canvasModeAfter.history.redo !== canvasModeBefore.history.redo) failures.push("取消画布模式错误写入历史");
  await pressCode(page, "KeyG", {shiftKey: true});
  await page.locator('.floating-panel[data-panel-id="generation-panel"]:not(.hidden)').waitFor({state: "visible"});
  await page.locator('[data-control-tab="management"]').click();
  await page.locator("#open-height-panel").click();
  await page.locator('.floating-panel[data-panel-id="height-panel"]:not(.hidden)').waitFor({state: "visible"});
  await page.locator('.floating-panel[data-panel-id="height-panel"]:not(.hidden) .floating-panel-close').click();
  await page.locator('.floating-panel[data-panel-id="generation-panel"]:not(.hidden) .floating-panel-close').click();

  const history = await page.evaluate(() => {
    const api = window.webglGeneratorApi;
    const state = window.__webglGeneratorApp.map.pack.states.find(item => item?.i && !item.removed);
    const set = api.edit.notes.set({kind: "state", id: state.i}, "快捷键撤销重做验收");
    if (!set?.ok) throw new Error(set?.error?.message || "写入备注失败");
    return {stateId: state.i, afterEdit: api.history.get().data};
  });
  await pressCode(page, "KeyZ", {ctrlKey: true});
  const afterUndo = await page.evaluate(() => window.webglGeneratorApi.history.get().data);
  await pressCode(page, "KeyZ", {ctrlKey: true, shiftKey: true});
  const afterRedo = await page.evaluate(() => window.webglGeneratorApi.history.get().data);
  if (afterUndo.undo !== history.afterEdit.undo - 1 || afterUndo.redo !== history.afterEdit.redo + 1) failures.push("Ctrl+Z 没有执行统一历史撤销");
  if (afterRedo.undo !== history.afterEdit.undo || afterRedo.redo !== history.afterEdit.redo) failures.push("Ctrl+Shift+Z 没有执行统一历史重做");

  const cancelBefore = await page.evaluate(stateId => {
    const api = window.webglGeneratorApi;
    api.selection.startEditing({kind: "state", id: stateId});
    return api.selection.get().data;
  }, history.stateId);
  await pressCode(page, "Escape");
  const cancelAfterEditing = await page.evaluate(() => window.webglGeneratorApi.selection.get().data);
  if (!cancelBefore.editingObject || cancelAfterEditing.editingObject || !cancelAfterEditing.selection) failures.push("首次 Escape 没有只停止对象编辑");
  await pressCode(page, "Escape");
  const cancelAfterSelection = await page.evaluate(() => window.webglGeneratorApi.selection.get().data);
  if (cancelAfterSelection.editingObject || cancelAfterSelection.selection) failures.push("第二次 Escape 没有清除 selection");

  await pressCode(page, "Digit4", {shiftKey: true});
  const viewMode = await page.evaluate(() => window.webglGeneratorApi.layers.get().data.colorMode);
  if (viewMode !== "states") failures.push(`Shift+4 没有切换国家视图：${viewMode}`);

  const layerResult = await page.evaluate(() => {
    const api = window.webglGeneratorApi;
    return api.layers.get().data.layers.routes;
  });
  await pressCode(page, "Digit5", {shiftKey: true});
  const layerAfter = await page.evaluate(() => window.webglGeneratorApi.layers.get().data.layers.routes);
  if (layerAfter === layerResult) failures.push("Shift+5 没有切换道路图层");
  await pressCode(page, "Digit5", {shiftKey: true});

  await page.locator("#map-canvas").evaluate(canvas => {
    const rect = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new WheelEvent("wheel", {
      deltaY: -800,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      bubbles: true,
      cancelable: true
    }));
  });
  await page.waitForTimeout(100);
  const zoomBeforeFit = await page.evaluate(() => window.__webglGeneratorApp.renderer.getStats().camera.scale);
  await pressCode(page, "Home", {shiftKey: true});
  const zoomAfterFit = await page.evaluate(() => window.__webglGeneratorApp.renderer.getStats().camera.scale);
  if (zoomBeforeFit === zoomAfterFit) failures.push("Shift+Home 没有执行适配视图");

  await pressCode(page, "KeyS", {ctrlKey: true});
  await page.waitForFunction(() => document.getElementById("map-toast")?.hidden === false && document.getElementById("map-toast")?.textContent.includes("保存"));
  await toolbar.hover();
  await page.waitForTimeout(950);
  const toastPriority = await page.evaluate(() => ({
    mapToastVisible: !document.getElementById("map-toast").hidden,
    shortcutToastHidden: document.getElementById("shortcut-toast").hidden
  }));
  if (!toastPriority.mapToastVisible || !toastPriority.shortcutToastHidden) failures.push("成功 toast 与快捷键提示优先级错误");

  const runtime = await page.evaluate(() => {
    const stats = window.__webglGeneratorApp.renderer.getStats();
    return {glError: stats.draw?.glError ?? 0};
  });
  return {
    registry,
    sampledGroups: ["file", "generation", "history", "editing", "selection", "view", "layers", "panels"],
    hint: {...hint, beforeThresholdHidden: beforeThreshold, mapToastPriority: toastPriority},
    hoverShortcutHelp,
    history: {afterEdit: history.afterEdit, afterUndo, afterRedo},
    editing: {before: cancelBefore, afterEditing: cancelAfterEditing, afterSelection: cancelAfterSelection, canvasModeBefore, canvasModeAfter},
    view: {mode: viewMode, zoomBeforeFit, zoomAfterFit},
    layers: {routesBefore: layerResult, routesAfter: layerAfter},
    glError: runtime.glError,
    failures
  };
}

async function inspectHoverShortcutHelp(page, failures) {
  await page.setViewportSize({width: 1440, height: 900});
  const initial = await exposeHoverCard(page, 0);
  const display = await page.evaluate(() => {
    const scenarioGroup = [...document.querySelectorAll(".hover-shortcut-group")]
      .find(group => group.querySelector("h3")?.textContent === "场景操作");
    return {
      descriptions: document.querySelectorAll(".hover-shortcut-item").length,
      groups: document.querySelectorAll(".hover-shortcut-group").length,
      scenarioRows: scenarioGroup ? [...scenarioGroup.querySelectorAll(".hover-shortcut-item")].map(row => ({
        label: row.querySelector("dt")?.textContent || "",
        keys: [...row.querySelectorAll("kbd")].map(key => key.textContent || "")
      })) : []
    };
  });
  if (display.descriptions !== 24 || display.groups !== 5) failures.push(`快捷键弹层展示分母错误：${display.descriptions} 条 / ${display.groups} 组`);
  const measurementScenario = display.scenarioRows.find(row => row.label.includes("测量编辑") && row.label.includes("删除当前测量点"));
  const hexScenario = display.scenarioRows.find(row => row.label.includes("HEX 颜色输入") && row.label.includes("确认 HEX 颜色输入"));
  if (JSON.stringify(measurementScenario?.keys) !== JSON.stringify(["Delete", "Backspace"]) || JSON.stringify(hexScenario?.keys) !== JSON.stringify(["Enter"])) failures.push("快捷键弹层缺少两个场景条目或其分片按键文案错误");
  await page.evaluate(() => {
    window.__shortcutHelpIdentity = {
      trigger: document.querySelector(".hover-shortcut-trigger"),
      popover: document.querySelector(".hover-shortcut-popover")
    };
  });

  const normal = await exerciseHoverShortcutPath(page, {label: "普通悬停", expectedPick: initial.pickKey});
  if (!normal.triggerVisible || !normal.popoverVisible || !normal.visibleAfterScroll || !normal.scrolled) failures.push("普通悬停无法稳定从 i 按钮进入并滚动快捷键弹层");

  const updated = await exposeHoverCard(page, 1, initial.pickKey);
  const stableAfterNormalPick = await shortcutHelpIdentityStable(page);
  if (!updated.pickChanged) failures.push("普通悬停没有产生第二个真实 pick，无法冻结节点更新契约");
  if (!stableAfterNormalPick) failures.push("普通 pick 更新重建了快捷键按钮或弹层节点");

  const heightMode = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const entered = app.canvasToolModes.enter("height:brush");
    return {entered, active: app.canvasToolModes.getActive()?.id || null, brushActive: app.panels.height?.getBrush?.().active === true};
  });
  if (heightMode.active !== "height:brush" || !heightMode.brushActive) failures.push("高度画笔场景未真实激活");
  const heightPick = await exposeHoverCard(page, 2);
  const height = await exerciseHoverShortcutPath(page, {label: "高度画笔", expectedPick: heightPick.pickKey, requirePickRetention: true});
  if (!height.triggerVisible || !height.popoverVisible || !height.visibleAfterScroll || !height.scrolled) failures.push("高度画笔下无法稳定从 i 按钮进入并滚动快捷键弹层");
  if (!height.pickRetained) failures.push("高度画笔移入快捷键帮助时清空了当前 pick");
  const heightUpdated = await exposeHoverCard(page, 3, heightPick.pickKey);
  const stableAfterHeightPick = await shortcutHelpIdentityStable(page);
  if (!heightUpdated.pickChanged) failures.push("高度画笔没有产生第二个真实 pick，无法冻结节点更新契约");
  if (!stableAfterHeightPick) failures.push("高度画笔 pick 更新重建了快捷键按钮或弹层节点");
  await page.evaluate(() => window.__webglGeneratorApp.canvasToolModes.cancel("height:brush", "browser-regression"));

  await page.mouse.move(12, 12);
  await page.locator(".hover-shortcut-trigger").focus();
  const focusVisible = await isShortcutPopoverVisible(page);
  if (!focusVisible) failures.push("键盘 focus 没有显示快捷键弹层");
  await page.evaluate(() => document.activeElement?.blur());

  const viewports = [];
  for (const viewport of [{width: 1440, height: 900}, {width: 390, height: 780}, {width: 320, height: 720}]) {
    await page.setViewportSize(viewport);
    await exposeHoverCard(page, viewport.width);
    await page.locator(".hover-shortcut-trigger").focus();
    await page.waitForTimeout(180);
    const geometry = await page.evaluate(() => {
      const overlay = document.getElementById("hover-overlay");
      const trigger = overlay.querySelector(".hover-shortcut-trigger");
      const popover = overlay.querySelector(".hover-shortcut-popover");
      const overlayRect = overlay.getBoundingClientRect();
      const triggerRect = trigger.getBoundingClientRect();
      const popoverRect = popover.getBoundingClientRect();
      const probeX = Math.min(overlayRect.right - 4, overlayRect.left + 8);
      const probeY = overlayRect.bottom - 8;
      const hit = document.elementFromPoint(probeX, probeY);
      return {
        viewport: {width: innerWidth, height: innerHeight},
        overlay: rectSnapshot(overlayRect),
        trigger: rectSnapshot(triggerRect),
        popover: rectSnapshot(popoverRect),
        visible: getComputedStyle(popover).visibility === "visible",
        seam: triggerRect.top - popoverRect.bottom,
        nonIconHit: hit?.id || hit?.className || hit?.tagName || ""
      };

      function rectSnapshot(rect) {
        return {left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height};
      }
    });
    const {popover, viewport: actualViewport} = geometry;
    geometry.inBounds = popover.left >= -0.5 && popover.top >= -0.5 && popover.right <= actualViewport.width + 0.5 && popover.bottom <= actualViewport.height + 0.5;
    geometry.seamConnected = geometry.seam <= 0.5;
    geometry.canvasPassThrough = geometry.nonIconHit === "map-canvas";
    if (!geometry.visible) failures.push(`${viewport.width}px 键盘 focus 后快捷键弹层仍不可见`);
    else if (!geometry.inBounds) failures.push(`${viewport.width}px 快捷键弹层越出视口：left=${popover.left}, top=${popover.top}, right=${popover.right}, bottom=${popover.bottom}`);
    if (!geometry.seamConnected) failures.push(`${viewport.width}px 信息按钮与弹层之间存在 ${geometry.seam}px 间隙`);
    if (!geometry.canvasPassThrough) failures.push(`${viewport.width}px hover 主区域截获了画布命中：${geometry.nonIconHit}`);
    viewports.push(geometry);
    await page.evaluate(() => document.activeElement?.blur());
  }
  await page.setViewportSize({width: 1440, height: 900});
  await page.evaluate(() => {
    delete window.__shortcutHelpIdentity;
  });

  return {
    display: {descriptions: display.descriptions, groups: display.groups},
    normal,
    height: {...height, mode: heightMode},
    focusVisible,
    stableAfterNormalPick,
    stableAfterHeightPick,
    viewports
  };
}

async function exerciseHoverShortcutPath(page, {label, expectedPick, requirePickRetention = false}) {
  const trigger = page.locator(".hover-shortcut-trigger");
  const popover = page.locator(".hover-shortcut-popover");
  await trigger.hover();
  const triggerVisible = await isShortcutPopoverVisible(page);
  const popoverBox = await popover.boundingBox();
  if (!popoverBox) throw new Error(`${label}快捷键弹层没有可命中的真实边界`);
  await page.mouse.move(popoverBox.x + popoverBox.width - 12, popoverBox.y + popoverBox.height - 10, {steps: 12});
  const popoverVisible = await isShortcutPopoverVisible(page);
  const pickRetained = !requirePickRetention || await page.evaluate(expected => {
    const pick = window.__webglGeneratorApp.pick;
    return pick && `${pick.gridCell ?? ""}:${pick.packCell ?? ""}` === expected;
  }, expectedPick);
  await popover.evaluate(element => {
    element.scrollTop = 0;
  });
  const beforeScroll = await popover.evaluate(element => ({top: element.scrollTop, height: element.clientHeight, scrollHeight: element.scrollHeight}));
  await page.mouse.wheel(0, 620);
  await page.waitForTimeout(80);
  const afterScroll = await popover.evaluate(element => ({top: element.scrollTop, visible: getComputedStyle(element).visibility === "visible", overlayVisible: !element.closest("#hover-overlay").hidden}));
  return {
    triggerVisible,
    popoverVisible,
    visibleAfterScroll: afterScroll.visible && afterScroll.overlayVisible,
    scrolled: beforeScroll.scrollHeight > beforeScroll.height && afterScroll.top > beforeScroll.top,
    pickRetained
  };
}

async function exposeHoverCard(page, variant = 0, previousPick = null) {
  const canvas = page.locator("#map-canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("地图 canvas 没有可用边界");
  const ratios = [[0.5, 0.5], [0.32, 0.42], [0.68, 0.58], [0.24, 0.7], [0.76, 0.3]];
  for (let offset = 0; offset < ratios.length; offset += 1) {
    const [xRatio, yRatio] = ratios[(variant + offset) % ratios.length];
    await page.mouse.move(box.x + box.width * xRatio, box.y + box.height * yRatio);
    await page.waitForTimeout(80);
    const snapshot = await page.evaluate(previous => {
      const overlay = document.getElementById("hover-overlay");
      const pick = window.__webglGeneratorApp.pick;
      const pickKey = pick ? `${pick.gridCell ?? ""}:${pick.packCell ?? ""}` : null;
      return {visible: Boolean(overlay && !overlay.hidden && pick), pickKey, pickChanged: previous === null || pickKey !== previous};
    }, previousPick);
    if (snapshot.visible && (previousPick === null || snapshot.pickChanged)) return snapshot;
  }
  throw new Error(previousPick === null ? "无法通过真实 canvas pointermove 显示悬停卡" : "无法通过真实 canvas pointermove 更新 pick");
}

async function isShortcutPopoverVisible(page) {
  return page.locator(".hover-shortcut-popover").evaluate(element => {
    const style = getComputedStyle(element);
    return style.visibility === "visible" && Number(style.opacity) > 0 && !element.closest("#hover-overlay").hidden;
  });
}

async function shortcutHelpIdentityStable(page) {
  return page.evaluate(() => window.__shortcutHelpIdentity?.trigger === document.querySelector(".hover-shortcut-trigger")
    && window.__shortcutHelpIdentity?.popover === document.querySelector(".hover-shortcut-popover"));
}

async function pressCode(page, code, modifiers = {}) {
  await page.evaluate(({code, modifiers}) => {
    const event = new KeyboardEvent("keydown", {code, key: code, bubbles: true, cancelable: true, ...modifiers});
    (document.activeElement || document).dispatchEvent(event);
  }, {code, modifiers});
  await page.waitForTimeout(60);
}

async function inspectHealthErrors(page) {
  return page.evaluate(() => {
    const result = window.webglGeneratorApi.info.healthEvents({severity: "error", limit: 180});
    if (!result?.ok) throw new Error(result?.error?.message || "healthEvents 调用失败");
    return {total: result.data.total, counts: result.data.counts, events: result.data.events};
  });
}

function renderMarkdown(report) {
  const lines = [
    "# 键盘快捷键浏览器回归报告",
    "",
    `- 生成时间：${report.metadata.generatedAt}`,
    `- 结论：${report.passed ? "通过" : "失败"}`,
    `- registry：${report.registry.shortcuts} 项 / ${report.registry.bindings} 组按键`,
    `- 抽查分组：${report.sampledGroups.join(" / ")}`,
    `- 提示文案：${report.hint.text}`,
    `- 悬停帮助：${report.hoverShortcutHelp.display.descriptions} 条 / ${report.hoverShortcutHelp.display.groups} 组`,
    `- 节点稳定：普通 ${report.hoverShortcutHelp.stableAfterNormalPick ? "是" : "否"} / 高度画笔 ${report.hoverShortcutHelp.stableAfterHeightPick ? "是" : "否"}`,
    `- 响应式视口：${report.hoverShortcutHelp.viewports.map(item => item.viewport.width).join(" / ")}`,
    `- 居中偏差：${report.hint.centerDelta}px`,
    `- 背景：${report.hint.background}`,
    `- WebGL error：${report.glError}`,
    `- health / console / page error：${report.healthErrors.total} / ${report.metadata.consoleErrors.length} / ${report.metadata.pageErrors.length}`
  ];
  if (report.failures.length) {
    lines.push("", "## 失败项", "");
    for (const failure of report.failures) lines.push(`- ${failure}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
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
    response.writeHead(200, {"content-type": getContentType(target), "cache-control": "no-store, max-age=0"});
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
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--" || !arg.startsWith("--")) continue;
    const [key, inlineValue] = arg.slice(2).split("=");
    parsed[key] = inlineValue ?? argv[++index] ?? true;
  }
  return parsed;
}

function getContentType(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html;charset=utf-8";
  if (ext === ".js") return "text/javascript;charset=utf-8";
  if (ext === ".css") return "text/css;charset=utf-8";
  if (ext === ".json") return "application/json;charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

async function loadPlaywright(sourceDirectory) {
  const requireFromSource = createRequire(join(sourceDirectory, "package.json"));
  try {
    return requireFromSource("playwright");
  } catch (error) {
    fail(`无法加载 Playwright：${error.message}`);
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
