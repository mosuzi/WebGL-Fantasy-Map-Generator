#!/usr/bin/env node
import {createReadStream, existsSync, mkdirSync, statSync, writeFileSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {dirname, extname, join, normalize, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const args = parseArgs(process.argv.slice(2));
const host = String(args.host || "127.0.0.1");
const port = Number(args.port || 5453);
const timeoutMs = Number(args.timeout || 240000);
const cells = Number(args.cells || 10000);
const seed = String(args.seed || "panel-open-profile-smoke");
const template = String(args.template || "continents");
const graphWidth = Number(args.width || 1440);
const graphHeight = Number(args.height || 960);
const browserChannel = args["browser-channel"] || args.channel || "chrome";
const distDir = resolve(args.dir || join(rootDir, "dist", "webgl-generator"));
const outPath = resolve(args.out || join(rootDir, "docs", "generated", "reports", "panel-open-profile-results.json"));
const markdownPath = resolve(args.markdown || join(rootDir, "docs", "generated", "reports", "panel-open-profile-results.md"));
const viewport = parseViewport(args.viewport || "1280x820");
const maxOpenMs = Number(args["max-open-ms"] || 900);
const maxHealthEvents = Number(args["max-health-events"] || 0);
const errorHealthOnly = Boolean(args["error-health-only"]);

const defaultPanels = [
  ["open-height-panel", "height-panel", "高度编辑"],
  ["open-climate-panel", "climate-panel", "气候统计"],
  ["open-biome-panel", "biome-panel", "生物群系"],
  ["open-feature-panel", "feature-panel", "水体与地貌"],
  ["open-state-panel", "state-panel", "国家编辑"],
  ["open-province-panel", "province-panel", "省份管理"],
  ["open-city-panel", "city-panel", "城市管理"],
  ["open-culture-panel", "culture-panel", "文化管理"],
  ["open-religion-panel", "religion-panel", "宗教管理"],
  ["open-diplomacy-panel", "diplomacy-panel", "外交管理"],
  ["open-government-panel", "government-panel", "政体管理"],
  ["open-economy-panel", "economy-panel", "经济总览"],
  ["open-military-panel", "military-panel", "军事管理"],
  ["open-route-panel", "route-panel", "路线管理"],
  ["open-river-panel", "river-panel", "河流管理"],
  ["open-ocean-current-panel", "ocean-current-panel", "洋流管理"],
  ["open-lake-panel", "lake-panel", "湖泊管理"],
  ["open-population-panel", "population-panel", "人口统计"],
  ["open-zone-panel", "zone-panel", "地区管理"],
  ["open-marker-panel", "marker-panel", "资源点与通用标记"],
  ["open-label-naming-panel", "label-naming-panel", "标签管理"],
  ["open-notes-panel", "notes-panel", "备注总览"],
  ["open-measurement-panel", "measurement-panel", "测量对象"],
  ["open-namebase-panel", "namebase-panel", "名称库"],
  ["", "emblem-panel", "纹章统计", "emblem"],
  ["", "cloud-storage-panel", "云端存储", "cloudStorage"],
  ["", "object-details", "对象详情", "objectDetails"]
].map(([buttonId, panelId, label, openVia = ""]) => ({buttonId, panelId, label, openVia}));
const panelFilter = parsePanelFilter(args.panels);
const panels = panelFilter.length ? defaultPanels.filter(panel => panelFilter.includes(panel.panelId) || panelFilter.includes(panel.buttonId)) : defaultPanels;

if (!existsSync(distDir)) fail(`构建产物不存在：${distDir}`);
mkdirSync(dirname(outPath), {recursive: true});
mkdirSync(dirname(markdownPath), {recursive: true});

const playwright = await loadPlaywright(sourceDir);
const server = await startStaticServer({host, port, publicDir: distDir});
let browser = null;

try {
  browser = await launchBrowser(playwright, {headless: !args.headful, browserChannel});
  const context = await browser.newContext({viewport, deviceScaleFactor: 1});
  await context.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("webgl-generator-control-preferences", JSON.stringify({
      colorMode: "height",
      showOceanHeight: false,
      smoothCellBorders: true,
      showHoverInfo: true,
      maxCityLabels: 5000,
      layers: {
        coastline: true,
        lakeShore: true,
        stateBorders: true,
        provinceBorders: true,
        cities: true,
        labels: true,
        markers: true,
        resources: true,
        military: true,
        measurements: true
      }
    }));
  });

  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  const consoleErrors = [];
  page.on("console", message => {
    if (message.type() === "error" && !message.text().startsWith("[FMG health]")) consoleErrors.push(message.text());
  });
  page.on("pageerror", error => consoleErrors.push(error.message));

  const baseUrl = `http://${host}:${port}`;
  await page.goto(baseUrl, {waitUntil: "domcontentloaded", timeout: timeoutMs});
  await page.waitForFunction(() => window.__webglGeneratorApp?.renderer?.getStats?.()?.webgl2, null, {timeout: timeoutMs});
  await page.waitForFunction(() => {
    const app = window.__webglGeneratorApp;
    return app?.map?.metadata?.generationTiming?.totalMs
      && !app.runtimeOperation?.getSnapshot?.().current
      && document.getElementById("generation-loading")?.hidden === true
      && document.getElementById("operation-loading")?.hidden === true;
  }, null, {timeout: timeoutMs});
  const generation = await generateCase(page, {cells, seed, template, graphWidth, graphHeight});
  const lazyPreload = await waitForLazyPreload(page);
  await openManagementTab(page);

  const panelReports = [await page.evaluate(() => {
    const root = document.querySelector(".vue-control-panel-root");
    const leaks = visibleTechnicalTerms(root);
    return {buttonId: "", panelId: "control-panel", label: "控制面板", openVia: "mounted", elapsedMs: 0, openMs: 0, selectMs: 0, actionMs: 0,
      panelWidth: Math.round(root?.getBoundingClientRect().width || 0), panelHeight: Math.round(root?.getBoundingClientRect().height || 0), rowCount: 0, actionCount: 0,
      secondaryPanels: 0, healthEvents: [], longTasks: [], longTaskCount: 0, longTaskTotalMs: 0, longTaskMaxMs: 0, technicalLeaks: leaks};
    function visibleTechnicalTerms(element) { const text = element?.innerText || ""; return [...new Set(text.match(/\b(?:cell|grid|pack|feature|worker|buffer|revision)\b|镜像|补丁|派生|运行时|同事务/giu) || [])]; }
  })];
  for (const panel of panels) panelReports.push(await profilePanelOpen(page, panel));
  const failures = [];
  for (const item of panelReports) {
    if (item.elapsedMs > maxOpenMs) failures.push(`${item.label} 打开耗时 ${item.elapsedMs}ms 超过 ${maxOpenMs}ms`);
    const blockingHealthCount = errorHealthOnly ? item.healthEvents.filter(event => event.severity === "error").length : item.healthEvents.length;
    if (blockingHealthCount > maxHealthEvents) failures.push(`${item.label} health 事件 ${blockingHealthCount} 个超过 ${maxHealthEvents} 个`);
    if (item.technicalLeaks?.length) failures.push(`${item.label} 普通文案泄露技术词：${item.technicalLeaks.join("、")}`);
  }
  if (panelReports.length !== 28) failures.push(`面板覆盖 ${panelReports.length}/28`);
  const pageOverflowX = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth));
  if (pageOverflowX > 1) failures.push(`页面横向溢出 ${pageOverflowX}px`);
  for (const error of consoleErrors) failures.push(`console error: ${error}`);

  const report = {
    metadata: {
      generatedAt: new Date().toISOString(),
      url: baseUrl,
      distDir,
      seed,
      cells,
      template,
      graphWidth,
      graphHeight,
      viewport,
      browserChannel,
      maxOpenMs,
      maxHealthEvents,
      errorHealthOnly,
      pageOverflowX,
      consoleErrors
    },
    generation,
    lazyPreload,
    panels: panelReports,
    failures,
    passed: failures.length === 0
  };

  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(markdownPath, renderMarkdown(report), "utf8");
  console.log(`Wrote ${outPath}`);
  console.log(`Wrote ${markdownPath}`);
  if (!report.passed) {
    console.error(renderFailureSummary(report));
    process.exitCode = 1;
  }
} finally {
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await new Promise(resolveClose => server.close(resolveClose));
}

async function generateCase(page, {cells, seed, template, graphWidth, graphHeight}) {
  const generation = await page.evaluate(async ({cells, seed, template, graphWidth, graphHeight}) => {
    window.__panelOpenProfilePreviousMap = window.__webglGeneratorApp?.map || null;
    const started = performance.now();
    const response = await window.webglGeneratorApi.generate.newMap({confirm: true, seed, cellsTarget: cells, heightmapTemplate: template, graphWidth, graphHeight});
    return {started, ok: response?.ok === true, error: response?.error || null};
  }, {cells, seed, template, graphWidth, graphHeight});
  if (!generation.ok) fail(`生成固定面板地图失败：${JSON.stringify(generation.error)}`);

  await page.waitForFunction(
    expected => {
      const app = window.__webglGeneratorApp;
      const loading = document.getElementById("generation-loading");
      return app?.map &&
        app.map !== window.__panelOpenProfilePreviousMap &&
        app.map.metadata?.seed === expected.seed &&
        app.map.metadata?.cellsTarget === expected.cells &&
        app.renderer?.getStats?.()?.draw?.glError === 0 &&
        loading?.hidden === true;
    },
    {cells, seed},
    {timeout: timeoutMs}
  );

  return page.evaluate(startedAt => {
    const roundBrowserMs = value => Math.round(value * 10) / 10;
    const app = window.__webglGeneratorApp;
    const stats = app.renderer.getStats();
    return {
      elapsedMs: roundBrowserMs(performance.now() - startedAt),
      generationMs: app.map.metadata.generationTiming?.totalMs || 0,
      loadMapMs: stats.loadMap?.totalMs || 0,
      loadMapSlowest: stats.loadMap?.slowest || null,
      draw: stats.draw,
      gridCells: app.map.metadata.gridCells,
      packCells: app.map.metadata.packCells
    };
  }, generation.started);
}

async function waitForLazyPreload(page) {
  await page.waitForFunction(() => window.__webglGeneratorLazyPreload?.started || false, null, {timeout: Math.min(timeoutMs, 10000)}).catch(() => {});
  await page.waitForFunction(() => {
    const preload = window.__webglGeneratorLazyPreload;
    return !preload || preload.finishedAt || preload.pending === 0;
  }, null, {timeout: Math.min(timeoutMs, 90000)}).catch(() => {});
  return page.evaluate(() => window.__webglGeneratorLazyPreload?.getStats?.() || null);
}

async function openManagementTab(page) {
  await page.evaluate(() => {
    document.querySelector("[data-control-tab='management']")?.click();
  });
  await page.waitForFunction(() => {
    const panel = document.querySelector("[data-control-panel='management']");
    return panel && panel.hidden === false;
  }, null, {timeout: timeoutMs});
}

async function profilePanelOpen(page, panel) {
  await closeOpenPanels(page);
  await page.evaluate(() => window.__webglGeneratorHealth?.clear?.());
  await startLongTaskRecorder(page);
  const result = await page.evaluate(async panel => {
    const roundMs = value => Math.round(value * 10) / 10;
    const startedAt = performance.now();
    const app = window.__webglGeneratorApp;
    if (panel.openVia === "emblem") app.panels.emblem.open(app.map, app.editHistory.getStats());
    else if (panel.openVia === "cloudStorage") app.panels.cloudStorage.open({mode: "save"});
    else if (panel.openVia === "objectDetails") {
      const city = app.map.settlements?.cities?.find(item => item?.id >= 0 && !item.removed);
      if (!city) throw new Error("对象详情面板缺少可选城市");
      const response = await window.webglGeneratorApi.selection.select({kind: "city", id: city.id});
      if (!response?.ok) throw new Error(response?.error?.message || "对象详情面板选择城市失败");
    } else document.getElementById(panel.buttonId)?.click();
    await waitFor(() => {
      const root = document.querySelector(`.floating-panel[data-panel-id="${panel.panelId}"]:not(.hidden)`);
      const bodyText = root?.querySelector(".floating-panel-body")?.textContent || "";
      return root && !root.querySelector("[data-lazy-panel-loading]") && !bodyText.includes("将在首次打开时加载");
    });
    const openedAt = performance.now();
    const root = document.querySelector(`.floating-panel[data-panel-id="${panel.panelId}"]`);
    const rows = [...(root?.querySelectorAll(".object-table-row, .el-table__body-wrapper tbody tr") || [])]
      .filter(row => row.getBoundingClientRect().width > 0 && row.getBoundingClientRect().height > 0);
    const row = panel.panelId === "state-panel" ? rows[1] || rows[0] : rows[0];
    row?.dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: true, view: window}));
    await delay(60);
    const selectedAt = performance.now();
    const actions = [...(root?.querySelectorAll(".ui-action-dock .ui-icon-action") || [])]
      .filter(button => !button.disabled && button.getBoundingClientRect().width > 0);
    actions[0]?.dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: true, view: window}));
    await new Promise(resolve => requestAnimationFrame(resolve));
    await waitFor(() => !app.runtimeOperation?.getSnapshot?.().current
      && document.getElementById("operation-loading")?.hidden === true);
    const actionAt = performance.now();
    const secondaryPanels = [...document.querySelectorAll(".ui-secondary-action-panel")]
      .filter(element => element.getBoundingClientRect().width > 0).length;
    const rect = root?.getBoundingClientRect();
    const healthEvents = window.__webglGeneratorHealth?.getEvents?.(40) || [];
    return {
      elapsedMs: roundMs(performance.now() - startedAt),
      openMs: roundMs(openedAt - startedAt),
      selectMs: roundMs(selectedAt - openedAt),
      actionMs: roundMs(actionAt - selectedAt),
      panelWidth: roundMs(rect?.width || 0),
      panelHeight: roundMs(rect?.height || 0),
      rowCount: rows.length,
      actionCount: actions.length,
      secondaryPanels,
      technicalLeaks: visibleTechnicalTerms(root),
      healthEvents
    };

    function waitFor(predicate) {
      return new Promise((resolve, reject) => {
        const deadline = performance.now() + 30000;
        function tick() {
          if (predicate()) {
            resolve();
            return;
          }
          if (performance.now() > deadline) {
            reject(new Error(`等待面板超时：${panel.panelId}`));
            return;
          }
          requestAnimationFrame(tick);
        }
        tick();
      });
    }

    function delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
    function visibleTechnicalTerms(element) { const text = element?.innerText || ""; return [...new Set(text.match(/\b(?:cell|grid|pack|feature|worker|buffer|revision)\b|镜像|补丁|派生|运行时|同事务/giu) || [])]; }
  }, panel);
  const longTasks = await stopLongTaskRecorder(page);
  await closeOpenPanels(page);
  return {
    ...panel,
    ...result,
    longTasks,
    longTaskCount: longTasks.length,
    longTaskTotalMs: roundMs(longTasks.reduce((sum, item) => sum + item.duration, 0)),
    longTaskMaxMs: roundMs(longTasks.reduce((max, item) => Math.max(max, item.duration), 0))
  };
}

async function startLongTaskRecorder(page) {
  await page.evaluate(() => {
    const profile = {longTasks: [], observer: null};
    if ("PerformanceObserver" in window) {
      try {
        profile.observer = new PerformanceObserver(list => {
          for (const entry of list.getEntries()) profile.longTasks.push({startTime: entry.startTime, duration: entry.duration});
        });
        profile.observer.observe({entryTypes: ["longtask"]});
      } catch {
        profile.observer = null;
      }
    }
    window.__webglGeneratorPanelOpenProfile = profile;
  });
}

async function stopLongTaskRecorder(page) {
  return page.evaluate(() => {
    const profile = window.__webglGeneratorPanelOpenProfile;
    if (!profile) return [];
    profile.observer?.disconnect?.();
    return profile.longTasks.map(item => ({
      startTime: Math.round(item.startTime * 10) / 10,
      duration: Math.round(item.duration * 10) / 10
    }));
  });
}

async function closeOpenPanels(page) {
  await page.evaluate(() => {
    for (const button of document.querySelectorAll(".ui-secondary-action-panel .ui-secondary-action-close")) {
      button.dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: true, view: window}));
    }
    for (const button of document.querySelectorAll(".floating-panel:not(.hidden) .floating-panel-close")) {
      button.dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: true, view: window}));
    }
  });
  await page.waitForTimeout(40);
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# 面板打开性能报告", "");
  lines.push(`- 生成时间：${report.metadata.generatedAt}`);
  lines.push(`- seed：\`${report.metadata.seed}\``);
  lines.push(`- 地形模板：\`${report.metadata.template}\``);
  lines.push(`- cells：\`${report.metadata.cells}\``);
  lines.push(`- 视口：\`${report.metadata.viewport.width} x ${report.metadata.viewport.height}\``);
  if (report.lazyPreload) lines.push(`- 面板预热：完成 ${report.lazyPreload.completed} / ${report.lazyPreload.total}，失败 ${report.lazyPreload.failed}`);
  lines.push(`- 打开耗时上限：\`${report.metadata.maxOpenMs}ms\``);
  lines.push(`- health 事件上限：\`${report.metadata.maxHealthEvents}\``);
  lines.push(`- 结论：${report.passed ? "通过" : "失败"}`);
  lines.push(`- 点击到出图：\`${report.generation.elapsedMs}ms\`，WebGL 加载：\`${report.generation.loadMapMs}ms\``);
  lines.push("");
  lines.push("## 总览", "");
  lines.push("| 面板 | 总耗时 | 打开 | 选中 | 二级 | longtask | health | 行 | 操作 | 弹层 | 尺寸 |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|");
  for (const panel of report.panels) {
    lines.push(`| ${panel.label} | ${panel.elapsedMs}ms | ${panel.openMs}ms | ${panel.selectMs}ms | ${panel.actionMs}ms | ${panel.longTaskCount} / ${panel.longTaskMaxMs}ms | ${panel.healthEvents.length} | ${panel.rowCount} | ${panel.actionCount} | ${panel.secondaryPanels} | ${panel.panelWidth} x ${panel.panelHeight} |`);
  }
  if (report.failures.length) {
    lines.push("", "## 失败项", "");
    for (const failure of report.failures) lines.push(`- ${failure}`);
  }
  lines.push("", "## Health 事件摘要", "");
  for (const panel of report.panels.filter(item => item.healthEvents.length)) {
    lines.push(`### ${panel.label}`, "");
    for (const event of panel.healthEvents) lines.push(`- ${event.type} / ${event.severity} / ${event.detail?.durationMs || event.detail?.handlerDurationMs || ""}ms`);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function renderFailureSummary(report) {
  return ["面板打开性能守门失败：", ...report.failures.map(failure => `- ${failure}`)].join("\n");
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

function parsePanelFilter(value) {
  if (!value) return [];
  return String(value).split(",").map(item => item.trim()).filter(Boolean);
}

function parseViewport(value) {
  const [width, height] = String(value).split("x").map(Number);
  return {width: width || 1280, height: height || 820};
}

async function loadPlaywright(fallbackSourceDir) {
  try {
    const require = createRequire(import.meta.url);
    return require("playwright");
  } catch {
    const requireFromSource = createRequire(join(fallbackSourceDir, "package.json"));
    return requireFromSource("playwright");
  }
}

async function launchBrowser(playwright, {headless, browserChannel}) {
  const options = {headless};
  if (browserChannel) options.channel = browserChannel;
  return playwright.chromium.launch(options);
}

function getContentType(file) {
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".svg": "image/svg+xml"
  };
  return types[extname(file).toLowerCase()] || "application/octet-stream";
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function roundMs(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}
