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
const port = Number(args.port || 5458);
const timeoutMs = Number(args.timeout || 180000);
const browserChannel = args["browser-channel"] || args.channel || "chrome";
const distDir = resolve(args.dir || join(rootDir, "dist", "webgl-generator"));
const outPath = resolve(args.out || join(rootDir, "docs", "generated", "reports", "ui-system-audit-results.json"));
const markdownPath = resolve(args.markdown || join(rootDir, "docs", "generated", "reports", "ui-system-audit-results.md"));
const maxMountLongTaskMs = 500;

if (!existsSync(distDir)) fail(`构建产物不存在：${distDir}`);
mkdirSync(dirname(outPath), {recursive: true});
mkdirSync(dirname(markdownPath), {recursive: true});

const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const server = await startStaticServer();
let browser;

try {
  browser = await playwright.chromium.launch({headless: !args.headful, channel: browserChannel});
  console.log("[UI 审计] 开始大型低频面板懒加载与挂载性能矩阵");
  const lazyPerformance = await auditLazyPerformance(browser);
  console.log("[UI 审计] 开始桌面多面板与键盘矩阵");
  const desktop = await auditDesktopInteraction(browser);
  console.log("[UI 审计] 开始窄视口、页面缩放与字体放大矩阵");
  const scaled = await auditScaledViewport(browser);
  const failures = [
    ...lazyPerformance.failures.map(message => `懒加载与性能：${message}`),
    ...desktop.failures.map(message => `桌面交互：${message}`),
    ...scaled.failures.map(message => `窄视口与缩放：${message}`)
  ];
  const report = {
    metadata: {
      generatedAt: new Date().toISOString(),
      url: `http://${host}:${port}`,
      browserChannel,
      distDir,
      methodology: {
        zoom: "720×720 物理视口按 125% 页面缩放折算为 576×576 CSS 视口",
        font: "根节点字体 20px，用于自动化复现系统字体放大后的排版压力",
        memory: "Chrome HeapProfiler 在连续打开前后主动回收并读取 JSHeapUsedSize"
      }
    },
    matrix: {lazyPerformance, desktop, scaled},
    failures,
    passed: failures.length === 0
  };
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(markdownPath, renderMarkdown(report), "utf8");
  console.log(JSON.stringify({
    ok: report.passed,
    lazyPanels: lazyPerformance.panels.map(panel => ({id: panel.panelId, firstOpenMs: panel.firstOpenMs, longTaskMaxMs: panel.longTaskMaxMs, lazyChunk: panel.lazyChunk})),
    heapDeltaMb: lazyPerformance.heap.deltaMb,
    desktop: {coexistence: desktop.coexistence, keyboard: desktop.keyboard, fixedOverlay: desktop.fixedOverlay, persistence: desktop.persistence},
    scaled: {viewport: scaled.viewport, panel: scaled.panel, toast: scaled.toast},
    failures
  }, null, 2));
  console.log(`Wrote ${outPath}`);
  console.log(`Wrote ${markdownPath}`);
  if (!report.passed) process.exitCode = 1;
} finally {
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await new Promise(done => server.close(done));
}

async function auditLazyPerformance(browserInstance) {
  const {context, page, errors} = await createAuditPage(browserInstance, {width: 1280, height: 820}, "lazy-performance");
  const failures = [];
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  await cdp.send("HeapProfiler.enable");
  try {
    await openReadyPage(page);
    await page.waitForFunction(() => window.__webglGeneratorLazyPreload?.started === true);
    await keepLazyPreloadQuiet(page);
    await cdp.send("HeapProfiler.collectGarbage");
    const heapBefore = await readHeap(cdp);
    const initialAssets = await readAssetNames(page);
    const panels = [];
    const definitions = [
      {buttonId: "open-height-panel", panelId: "height-panel", chunk: "HeightPanel-", label: "高度编辑"},
      {buttonId: "open-military-panel", panelId: "military-panel", chunk: "MilitaryPanel-", label: "军事管理"},
      {buttonId: "open-economy-panel", panelId: "economy-panel", chunk: "EconomyPanel-", label: "经济总览"},
      {buttonId: "open-namebase-panel", panelId: "namebase-panel", chunk: "NamebasePanel-", label: "名称库"}
    ];
    for (const definition of definitions) {
      console.log(`[UI 审计] 首次打开 ${definition.label}`);
      const initialChunk = initialAssets.find(name => name.includes(definition.chunk)) || "";
      const result = await profileFirstPanelOpen(page, definition);
      panels.push({...definition, ...result, initialChunk});
      if (initialChunk) failures.push(`${definition.label} 首次打开前已加载组件 chunk：${initialChunk}`);
      if (!result.lazyChunk) failures.push(`${definition.label} 首次打开后未观察到独立组件 chunk`);
      if (result.firstOpenMs > 1500) failures.push(`${definition.label} 首次挂载 ${result.firstOpenMs}ms 超过 1500ms`);
      if (result.longTaskMaxMs > maxMountLongTaskMs) failures.push(`${definition.label} 最长任务 ${result.longTaskMaxMs}ms 超过 ${maxMountLongTaskMs}ms`);
    }

    const repeatDurations = [];
    for (let round = 0; round < 3; round++) {
      console.log(`[UI 审计] 连续打开内存样本 ${round + 1}/3`);
      for (const definition of definitions) {
        await keepLazyPreloadQuiet(page);
        const startedAt = Date.now();
        await openPanelAndWait(page, definition);
        repeatDurations.push({round: round + 1, panelId: definition.panelId, elapsedMs: Date.now() - startedAt});
        await closePanel(page, definition.panelId);
      }
    }
    await cdp.send("HeapProfiler.collectGarbage");
    const heapAfter = await readHeap(cdp);
    const heap = {
      beforeMb: roundMb(heapBefore),
      afterMb: roundMb(heapAfter),
      deltaMb: roundMb(heapAfter - heapBefore),
      limitMb: 96
    };
    if (heap.deltaMb > heap.limitMb) failures.push(`连续打开后 JS heap 增长 ${heap.deltaMb}MB 超过 ${heap.limitMb}MB`);
    const slowRepeat = repeatDurations.filter(item => item.elapsedMs > 900);
    if (slowRepeat.length) failures.push(`重复打开出现 ${slowRepeat.length} 次超过 900ms`);
    appendRuntimeErrors(failures, errors);
    return {panels, repeatDurations, heap, errors, failures};
  } finally {
    await context.close();
  }
}

async function auditDesktopInteraction(browserInstance) {
  const {context, page, errors} = await createAuditPage(browserInstance, {width: 1280, height: 720}, "desktop");
  const failures = [];
  try {
    await openReadyPage(page);
    console.log("[UI 审计] 桌面样本地图已就绪");
    const noteId = await page.evaluate(() => {
      const app = window.__webglGeneratorApp;
      const packCell = app.map.pack.cells.h.findIndex(height => height >= 20);
      const id = "ui-system-audit-note";
      const created = window.webglGeneratorApi.edit.notes.createStandalone({id, name: "UI 审计备注", body: "用于验证对象详情共存", packCell});
      if (!created?.ok) throw new Error(created?.error?.message || "无法创建审计备注");
      return id;
    });
    await page.locator("#open-generation-panel").click();
    await page.waitForSelector('.floating-panel[data-panel-id="generation-panel"]:not(.hidden)');
    await page.evaluate(id => {
      const result = window.webglGeneratorApi.selection.select({kind: "note", id});
      if (!result?.ok) throw new Error(result?.error?.message || "备注选择失败");
    }, noteId);
    await page.waitForSelector('.floating-panel[data-panel-id="object-details"]:not(.hidden)');
    const coexistence = await inspectCoexistence(page);
    if (coexistence.main.length !== 1 || coexistence.details.length !== 1 || coexistence.overlap) failures.push("桌面主面板与对象详情没有无重叠共存");
    await page.keyboard.press("Escape");
    await page.waitForSelector('.floating-panel[data-panel-id="object-details"]', {state: "hidden"});

    await closeAllPanels(page);
    const trigger = page.locator("#open-generation-panel");
    await trigger.focus();
    await page.keyboard.press("Shift+G");
    await page.waitForSelector('.floating-panel[data-panel-id="generation-panel"]:not(.hidden)');
    await page.waitForTimeout(40);
    const focusEntered = await page.evaluate(() => document.activeElement?.closest?.('[data-panel-id="generation-panel"]') != null);
    let reachedTab = false;
    const tabStops = [];
    for (let index = 0; index < 8; index++) {
      await page.keyboard.press("Tab");
      const stop = await page.evaluate(() => ({
        tag: document.activeElement?.tagName || "",
        text: String(document.activeElement?.textContent || "").trim().slice(0, 30),
        role: document.activeElement?.getAttribute?.("role") || "",
        label: document.activeElement?.getAttribute?.("aria-label") || ""
      }));
      tabStops.push(stop);
      if (stop.role === "tab") {
        reachedTab = true;
        break;
      }
    }
    const selectedTabBefore = await page.locator('.floating-panel[data-panel-id="generation-panel"] [role="tab"][aria-selected="true"]').textContent();
    if (reachedTab) await page.keyboard.press("ArrowRight");
    const selectedTabAfter = await page.locator('.floating-panel[data-panel-id="generation-panel"] [role="tab"][aria-selected="true"]').textContent();
    await page.keyboard.press("Escape");
    await page.waitForSelector('.floating-panel[data-panel-id="generation-panel"]', {state: "hidden"});
    const focusReturned = await page.evaluate(() => document.activeElement?.id === "open-generation-panel");
    const keyboard = {focusEntered, reachedTab, selectedTabBefore: selectedTabBefore?.trim(), selectedTabAfter: selectedTabAfter?.trim(), focusReturned, tabStops};
    if (!focusEntered) failures.push("快捷键打开主面板后焦点未进入面板");
    if (!reachedTab) failures.push("Tab 顺序未能到达控制面板页签");
    if (selectedTabBefore === selectedTabAfter) failures.push("键盘方向键未能切换控制面板页签");
    if (!focusReturned) failures.push("Esc 关闭主面板后焦点未返回入口");

    await trigger.click();
    await page.waitForSelector('.floating-panel[data-panel-id="generation-panel"]:not(.hidden)');
    const accessibility = await inspectAccessibility(page);
    if (accessibility.unnamedIconButtons.length) failures.push(`存在 ${accessibility.unnamedIconButtons.length} 个无可访问名称的图标按钮`);
    if (accessibility.positiveTabIndex.length) failures.push(`存在 ${accessibility.positiveTabIndex.length} 个正 tabindex 元素`);
    if (accessibility.shortcutConflicts.length) failures.push(`存在快捷键冲突：${accessibility.shortcutConflicts.join("、")}`);

    await page.locator('[data-control-tab="about"]').click();
    await page.locator("#open-export-panel").click();
    await page.waitForSelector('[data-overlay-id="project-export"]:not([style*="display: none"])');
    const fixedOverlay = await inspectFixedOverlay(page, "project-export");
    if (!fixedOverlay.closeVisible || !fixedOverlay.safe || fixedOverlay.overlapsToolbar) failures.push("导出固定浮层未保持安全区或关闭控件不可达");
    await page.keyboard.press("Escape");
    const exportFocusReturned = await page.evaluate(() => document.activeElement?.id === "open-export-panel");
    fixedOverlay.focusReturned = exportFocusReturned;
    if (!exportFocusReturned) failures.push("导出浮层 Esc 关闭后焦点未返回入口");

    await closeAllPanels(page);
    const toast = await inspectShortcutToast(page);
    if (!toast.visible || toast.centerDelta > 2 || Math.abs(toast.bottom - 22) > 3 || toast.overlapCount) failures.push("底部快捷键提示未处于安全区或遮挡交互控件");

    await page.evaluate(() => {
      localStorage.setItem("webgl-generator-panel:state-panel", JSON.stringify({left: 400, top: 128, width: 560, open: true, openedAt: 10}));
      localStorage.setItem("webgl-generator-panel:city-panel", JSON.stringify({left: 410, top: 132, width: 560, open: true, openedAt: 20}));
      localStorage.setItem("webgl-generator-panel:last-main", "city-panel");
    });
    await page.reload({waitUntil: "domcontentloaded"});
    await waitForApiReady(page, timeoutMs);
    await page.waitForSelector('.floating-panel[data-panel-id="city-panel"]:not(.hidden)');
    const persistence = await page.evaluate(() => ({
      visibleMain: [...document.querySelectorAll('.floating-panel[data-panel-role="main"]:not(.hidden)')].map(node => node.dataset.panelId),
      oldMainOpen: JSON.parse(localStorage.getItem("webgl-generator-panel:state-panel") || "{}").open
    }));
    if (persistence.visibleMain.length !== 1 || persistence.visibleMain[0] !== "city-panel" || persistence.oldMainOpen !== false) failures.push("持久化恢复没有收口到最后打开的主面板");
    appendRuntimeErrors(failures, errors);
    return {coexistence, keyboard, accessibility, fixedOverlay, toast, persistence, errors, failures};
  } finally {
    await context.close();
  }
}

async function auditScaledViewport(browserInstance) {
  const physicalViewport = {width: 720, height: 720};
  const viewport = {width: 576, height: 576};
  const {context, page, errors} = await createAuditPage(browserInstance, viewport, "scaled");
  const failures = [];
  try {
    await openReadyPage(page);
    console.log("[UI 审计] 缩放样本地图已就绪");
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "20px";
      window.dispatchEvent(new Event("resize"));
    });
    const trigger = page.locator("#open-generation-panel");
    await trigger.focus();
    await page.keyboard.press("Shift+H");
    await page.waitForSelector('.floating-panel[data-panel-id="height-panel"]:not(.hidden)');
    await page.waitForFunction(() => {
      const body = document.querySelector('.floating-panel[data-panel-id="height-panel"] .floating-panel-body');
      return body && !body.textContent.includes("正在加载") && body.textContent.trim().length > 20;
    });
    const panel = await page.evaluate(() => {
      const root = document.querySelector('.floating-panel[data-panel-id="height-panel"]:not(.hidden)');
      const close = root.querySelector(".floating-panel-close");
      const body = root.querySelector(".floating-panel-body");
      const rect = root.getBoundingClientRect();
      const closeRect = close.getBoundingClientRect();
      body.scrollTop = body.scrollHeight;
      return {
        rect: {left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom},
        closeVisible: closeRect.left >= 0 && closeRect.top >= 0 && closeRect.right <= innerWidth && closeRect.bottom <= innerHeight,
        bodyScrollable: body.scrollHeight > body.clientHeight,
        reachedBottom: Math.abs(body.scrollTop + body.clientHeight - body.scrollHeight) <= 2,
        viewport: {width: innerWidth, height: innerHeight}
      };
    });
    if (panel.rect.left < 0 || panel.rect.top < 0 || panel.rect.right > viewport.width || panel.rect.bottom > viewport.height) failures.push("125% 页面缩放下主面板超出窄视口");
    if (!panel.closeVisible) failures.push("125% 页面缩放下关闭按钮不可达");
    if (panel.bodyScrollable && !panel.reachedBottom) failures.push("字体放大后面板内容无法滚动到底部");
    await page.keyboard.press("Escape");
    const focusReturned = await page.evaluate(() => document.activeElement?.id === "open-generation-panel");
    if (!focusReturned) failures.push("缩放样本 Esc 关闭后焦点未返回入口");
    const toast = await inspectShortcutToast(page, "#open-generation-panel");
    if (!toast.visible || toast.centerDelta > 3 || Math.abs(toast.bottom - 22) > 3 || toast.overlapCount) failures.push("缩放样本底部快捷键提示不在安全区");
    appendRuntimeErrors(failures, errors);
    return {viewport: `${physicalViewport.width}x${physicalViewport.height} 物理 / ${viewport.width}x${viewport.height} CSS`, zoom: "125%", rootFontPx: 20, panel, focusReturned, toast, errors, failures};
  } finally {
    await context.close();
  }
}

async function createAuditPage(browserInstance, viewport, label) {
  const context = await browserInstance.newContext({viewport, deviceScaleFactor: 1});
  await context.addInitScript(caseLabel => {
    const marker = `ui-system-audit:${caseLabel}`;
    if (!sessionStorage.getItem(marker)) {
      localStorage.clear();
      sessionStorage.setItem(marker, "1");
    }
    window.__uiSystemAudit = {caseLabel, longTasks: []};
    if ("PerformanceObserver" in window) {
      try {
        const observer = new PerformanceObserver(list => {
          for (const entry of list.getEntries()) window.__uiSystemAudit.longTasks.push({startTime: entry.startTime, duration: entry.duration});
        });
        observer.observe({entryTypes: ["longtask"]});
        window.__uiSystemAudit.observer = observer;
      } catch {}
    }
  }, label);
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  const errors = {console: [], page: []};
  page.on("console", message => message.type() === "error" && errors.console.push(message.text()));
  page.on("pageerror", error => errors.page.push(error.message));
  return {context, page, errors};
}

async function openReadyPage(page) {
  await page.goto(`http://${host}:${port}?healthClear=1`, {waitUntil: "domcontentloaded", timeout: timeoutMs});
  await waitForApiReady(page, timeoutMs);
  await page.waitForFunction(() => window.webglGeneratorApi.info.mapSummary()?.data?.ready === true);
}

async function keepLazyPreloadQuiet(page) {
  await page.evaluate(() => {
    if (window.__webglGeneratorLazyPreloadInput) window.__webglGeneratorLazyPreloadInput.lastInputAt = performance.now();
  });
}

async function profileFirstPanelOpen(page, definition) {
  await keepLazyPreloadQuiet(page);
  const beforeAssets = await readAssetNames(page);
  const longTaskStart = await page.evaluate(() => window.__uiSystemAudit.longTasks.length);
  const startedAt = Date.now();
  await openPanelAndWait(page, definition);
  const firstOpenMs = Date.now() - startedAt;
  const afterAssets = await readAssetNames(page);
  const newAssets = afterAssets.filter(name => !beforeAssets.includes(name));
  const longTasks = await page.evaluate(start => window.__uiSystemAudit.longTasks.slice(start).map(item => ({
    startTime: Math.round(item.startTime * 10) / 10,
    duration: Math.round(item.duration * 10) / 10
  })), longTaskStart);
  await closePanel(page, definition.panelId);
  return {
    firstOpenMs,
    lazyChunk: newAssets.find(name => name.includes(definition.chunk)) || afterAssets.find(name => name.includes(definition.chunk)) || "",
    newAssets,
    longTasks,
    longTaskMaxMs: roundMs(longTasks.reduce((max, item) => Math.max(max, item.duration), 0)),
    longTaskLimitMs: maxMountLongTaskMs
  };
}

async function openPanelAndWait(page, definition) {
  await page.evaluate(buttonId => document.getElementById(buttonId)?.click(), definition.buttonId);
  await page.waitForSelector(`.floating-panel[data-panel-id="${definition.panelId}"]:not(.hidden)`);
  await page.waitForFunction(panelId => {
    const body = document.querySelector(`.floating-panel[data-panel-id="${panelId}"] .floating-panel-body`);
    return body && !body.textContent.includes("正在加载") && !body.textContent.includes("首次打开时加载") && body.textContent.trim().length > 20;
  }, definition.panelId);
}

async function closePanel(page, panelId) {
  await page.evaluate(id => document.querySelector(`.floating-panel[data-panel-id="${id}"] .floating-panel-close`)?.click(), panelId);
  await page.waitForSelector(`.floating-panel[data-panel-id="${panelId}"]`, {state: "hidden"});
}

async function closeAllPanels(page) {
  await page.evaluate(() => {
    for (const button of document.querySelectorAll(".floating-panel:not(.hidden) .floating-panel-close")) button.click();
  });
  await page.waitForTimeout(40);
}

async function readAssetNames(page) {
  return page.evaluate(() => [...new Set(performance.getEntriesByType("resource").map(entry => {
    try { return new URL(entry.name).pathname.split("/").pop(); } catch { return entry.name; }
  }).filter(Boolean))]);
}

async function readHeap(cdp) {
  const result = await cdp.send("Performance.getMetrics");
  return result.metrics.find(metric => metric.name === "JSHeapUsedSize")?.value || 0;
}

async function inspectCoexistence(page) {
  return page.evaluate(() => {
    const project = node => {
      const rect = node.getBoundingClientRect();
      return {id: node.dataset.panelId, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom};
    };
    const main = [...document.querySelectorAll('.floating-panel[data-panel-role="main"]:not(.hidden)')].map(project);
    const details = [...document.querySelectorAll('.floating-panel[data-panel-role="detail"]:not(.hidden)')].map(project);
    const a = main[0];
    const b = details[0];
    return {main, details, overlap: Boolean(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top)};
  });
}

async function inspectAccessibility(page) {
  return page.evaluate(() => {
    const visible = node => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const nameOf = node => String(node.getAttribute("aria-label") || node.getAttribute("title") || node.textContent || "").trim();
    const iconLike = node => {
      const text = String(node.textContent || "").trim();
      return !text || /^[×↶↷+−←→↑↓⋮…⌕✎✕✓]+$/u.test(text) || Boolean(node.querySelector("svg")) && text.length <= 1;
    };
    const unnamedIconButtons = [...document.querySelectorAll("button")]
      .filter(node => visible(node) && iconLike(node) && !nameOf(node))
      .map(node => node.id || node.className || node.outerHTML.slice(0, 80));
    const positiveTabIndex = [...document.querySelectorAll("[tabindex]")]
      .filter(node => visible(node) && Number(node.getAttribute("tabindex")) > 0)
      .map(node => node.id || node.className || node.tagName);
    const registry = window.__webglGeneratorApp?.keyboardShortcuts?.registry || [];
    const bindings = new Map();
    for (const item of registry) {
      for (const binding of item.bindings || []) {
        const key = [binding.ctrl ? "Ctrl" : "", binding.alt ? "Alt" : "", binding.shift ? "Shift" : "", binding.meta ? "Meta" : "", binding.code].filter(Boolean).join("+");
        const ids = bindings.get(key) || [];
        ids.push(item.id);
        bindings.set(key, ids);
      }
    }
    const shortcutConflicts = [...bindings].filter(([, ids]) => ids.length > 1).map(([key, ids]) => `${key}:${ids.join(",")}`);
    return {unnamedIconButtons, positiveTabIndex, shortcutConflicts, shortcutCount: registry.length};
  });
}

async function inspectFixedOverlay(page, id) {
  return page.evaluate(overlayId => {
    const node = document.querySelector(`[data-overlay-id="${overlayId}"]`);
    const rect = node.getBoundingClientRect();
    const close = node.querySelector('button[aria-label*="关闭"]')?.getBoundingClientRect?.();
    const toolbar = document.querySelector(".map-toolbar")?.getBoundingClientRect?.();
    return {
      rect: {left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom},
      closeVisible: Boolean(close && close.left >= 0 && close.top >= 0 && close.right <= innerWidth && close.bottom <= innerHeight),
      safe: rect.top >= 63 && rect.bottom <= innerHeight - 63 && node.dataset.overlaySafeArea === "12,64,12,64",
      overlapsToolbar: Boolean(toolbar && rect.left < toolbar.right && rect.right > toolbar.left && rect.top < toolbar.bottom && rect.bottom > toolbar.top),
      zIndex: Number(getComputedStyle(node).zIndex) || 0
    };
  }, id);
}

async function inspectShortcutToast(page, selector = "#open-generation-panel") {
  await page.waitForFunction(() => document.getElementById("map-toast")?.hidden !== false);
  const target = page.locator(selector);
  await target.hover();
  await page.waitForTimeout(920);
  const result = await page.evaluate(() => {
    const toast = document.getElementById("shortcut-toast");
    const rect = toast.getBoundingClientRect();
    const intersects = candidate => {
      const other = candidate.getBoundingClientRect();
      return rect.left < other.right && rect.right > other.left && rect.top < other.bottom && rect.bottom > other.top;
    };
    const overlapCount = [...document.querySelectorAll("button, [role='button'], input, select")]
      .filter(node => node !== toast && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0 && intersects(node)).length;
    return {
      visible: !toast.hidden,
      text: toast.textContent,
      centerDelta: Math.round(Math.abs(rect.left + rect.width / 2 - innerWidth / 2) * 10) / 10,
      bottom: Math.round((innerHeight - rect.bottom) * 10) / 10,
      overlapCount,
      background: getComputedStyle(toast).backgroundColor
    };
  });
  await page.mouse.move(8, 8);
  await page.waitForFunction(() => document.getElementById("shortcut-toast")?.hidden === true);
  return result;
}

function appendRuntimeErrors(failures, errors) {
  for (const message of errors.console) failures.push(`console error: ${message}`);
  for (const message of errors.page) failures.push(`page error: ${message}`);
}

function renderMarkdown(report) {
  const lazy = report.matrix.lazyPerformance;
  const desktop = report.matrix.desktop;
  const scaled = report.matrix.scaled;
  const lines = [
    "# UI 系统综合审计报告",
    "",
    `- 生成时间：${report.metadata.generatedAt}`,
    `- 浏览器：${report.metadata.browserChannel}`,
    `- 结论：${report.passed ? "通过" : "失败"}`,
    `- 缩放样本：${report.metadata.methodology.zoom}`,
    `- 字体样本：${report.metadata.methodology.font}`,
    "",
    "## 审计矩阵",
    "",
    "| 领域 | 样本 | 结果 |",
    "|---|---|---|",
    `| 多面板组合 | 主面板 + 对象详情 | ${desktop.coexistence.overlap ? "重叠" : "无重叠"} |`,
    `| 持久化恢复 | 最后主面板 | ${desktop.persistence.visibleMain.join("、") || "无"} |`,
    `| 键盘路径 | 打开 / Tab 操作 / Esc / 焦点返回 | ${desktop.keyboard.focusEntered && desktop.keyboard.reachedTab && desktop.keyboard.focusReturned ? "通过" : "失败"} |`,
    `| 固定浮层 | 导出浮层安全区 | ${desktop.fixedOverlay.safe && desktop.fixedOverlay.closeVisible ? "通过" : "失败"} |`,
    `| 底部提示 | 桌面 / 缩放样本 | ${desktop.toast.overlapCount === 0 && scaled.toast.overlapCount === 0 ? "无交互遮挡" : "存在遮挡"} |`,
    `| 窄视口与缩放 | ${scaled.viewport} / ${scaled.zoom} / ${scaled.rootFontPx}px | ${scaled.panel.closeVisible && scaled.panel.reachedBottom ? "关键控件可达" : "失败"} |`,
    `| 可访问名称 | 图标按钮 / tabindex / 快捷键冲突 | ${desktop.accessibility.unnamedIconButtons.length} / ${desktop.accessibility.positiveTabIndex.length} / ${desktop.accessibility.shortcutConflicts.length} |`,
    `| 连续打开内存 | 4 个低频面板 × 3 轮 | ${lazy.heap.deltaMb}MB（上限 ${lazy.heap.limitMb}MB） |`,
    "",
    "## 大型低频面板",
    "",
    "| 面板 | 首次挂载 | 最长任务 | 独立 chunk |",
    "|---|---:|---:|---|"
  ];
  for (const panel of lazy.panels) lines.push(`| ${panel.label} | ${panel.firstOpenMs}ms | ${panel.longTaskMaxMs}ms | ${panel.lazyChunk || "未观察到"} |`);
  if (report.failures.length) {
    lines.push("", "## 失败项", "");
    for (const failure of report.failures) lines.push(`- ${failure}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
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
  await new Promise((done, reject) => {
    serverInstance.once("error", reject);
    serverInstance.listen(port, host, done);
  });
  return serverInstance;
}

function contentType(file) {
  return ({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".png": "image/png",
    ".svg": "image/svg+xml"
  })[extname(file).toLowerCase()] || "application/octet-stream";
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const [key, inlineValue] = arg.slice(2).split("=");
    parsed[key] = inlineValue ?? argv[++index] ?? true;
  }
  return parsed;
}

function roundMs(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

function roundMb(bytes) {
  return Math.round((Number(bytes) || 0) / 1024 / 1024 * 100) / 100;
}

function delay(ms) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
