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
const port = Number(args.port || 5452);
const timeoutMs = Number(args.timeout || 240000);
const cells = Number(args.cells || 10000);
const seed = String(args.seed || "panel-layout-audit-smoke");
const template = String(args.template || "continents");
const graphWidth = Number(args.width || 1440);
const graphHeight = Number(args.height || 960);
const browserChannel = args["browser-channel"] || args.channel || "chrome";
const distDir = resolve(args.dir || join(rootDir, "dist", "webgl-generator"));
const outPath = resolve(args.out || join(rootDir, "docs", "generated", "reports", "panel-layout-audit-results.json"));
const markdownPath = resolve(args.markdown || join(rootDir, "docs", "generated", "reports", "panel-layout-audit-results.md"));
const viewport = parseViewport(args.viewport || "1280x820");
const failOnIssues = Boolean(args["fail-on-issues"]);

const defaultPanels = [
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
  ["open-lake-panel", "lake-panel", "湖泊管理"],
  ["open-marker-panel", "marker-panel", "资源标记"],
  ["open-label-naming-panel", "label-naming-panel", "标签管理"],
  ["open-notes-panel", "notes-panel", "备注总览"],
  ["open-measurement-panel", "measurement-panel", "测量对象"],
  ["open-namebase-panel", "namebase-panel", "名称库"]
].map(([buttonId, panelId, label]) => ({buttonId, panelId, label}));
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
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", error => consoleErrors.push(error.message));

  const baseUrl = `http://${host}:${port}`;
  await page.goto(baseUrl, {waitUntil: "domcontentloaded", timeout: timeoutMs});
  await page.waitForFunction(() => window.__webglGeneratorApp?.renderer?.getStats?.()?.webgl2, null, {timeout: timeoutMs});
  await page.waitForFunction(() => window.__webglGeneratorApp?.map?.metadata?.generationTiming?.totalMs, null, {timeout: timeoutMs});
  const generation = await generateCase(page, {cells, seed, template, graphWidth, graphHeight});

  await openManagementTab(page);
  const panelReports = [];
  for (const panel of panels) {
    panelReports.push(await auditPanel(page, panel));
  }
  const pageAudit = await auditPage(page);
  const issues = collectIssues(panelReports, pageAudit, consoleErrors);
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
      failOnIssues,
      consoleErrors
    },
    generation,
    page: pageAudit,
    panels: panelReports,
    issues,
    passed: issues.length === 0
  };

  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(markdownPath, renderMarkdown(report), "utf8");
  console.log(`Wrote ${outPath}`);
  console.log(`Wrote ${markdownPath}`);
  if (failOnIssues && issues.length) {
    console.error(renderIssueSummary(issues));
    process.exitCode = 1;
  }
} finally {
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await new Promise(resolveClose => server.close(resolveClose));
}

async function generateCase(page, {cells, seed, template, graphWidth, graphHeight}) {
  await page.waitForSelector("#cells-input", {state: "attached", timeout: timeoutMs});
  const startedAt = await page.evaluate(({cells, seed, template, graphWidth, graphHeight}) => {
    window.__panelAuditPreviousMap = window.__webglGeneratorApp?.map || null;
    document.getElementById("auto-random-seed").checked = false;
    document.getElementById("seed-input").value = seed;
    document.getElementById("cells-input").value = String(cells);
    document.getElementById("width-input").value = String(graphWidth);
    document.getElementById("height-input").value = String(graphHeight);
    document.getElementById("heightmap-template").value = template;
    const started = performance.now();
    document.getElementById("generate-map").click();
    return started;
  }, {cells, seed, template, graphWidth, graphHeight});

  await page.waitForFunction(
    expected => {
      const app = window.__webglGeneratorApp;
      const loading = document.getElementById("generation-loading");
      return app?.map &&
        app.map !== window.__panelAuditPreviousMap &&
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
  }, startedAt);
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

async function auditPanel(page, panel) {
  await page.evaluate(buttonId => {
    document.getElementById(buttonId)?.click();
  }, panel.buttonId);
  await page.waitForSelector(`.floating-panel[data-panel-id="${panel.panelId}"]:not(.hidden)`, {timeout: timeoutMs});
  await page.waitForFunction(panelId => {
    const panel = document.querySelector(`.floating-panel[data-panel-id="${panelId}"]`);
    if (!panel || panel.classList.contains("hidden")) return false;
    const bodyText = panel.querySelector(".floating-panel-body")?.textContent || "";
    return !bodyText.includes("正在加载") && !bodyText.includes("将在首次打开时加载");
  }, panel.panelId, {timeout: timeoutMs});
  await page.waitForTimeout(80);

  const report = await page.evaluate(panel => {
    function rectOf(element) {
      if (!element) return {x: 0, y: 0, width: 0, height: 0};
      const rect = element.getBoundingClientRect();
      return {
        x: roundNumber(rect.x),
        y: roundNumber(rect.y),
        width: roundNumber(rect.width),
        height: roundNumber(rect.height)
      };
    }

    function auditGrid(root, selector, itemSelector) {
      return [...root.querySelectorAll(selector)].filter(isVisibleElement).map(element => {
        const items = [...element.querySelectorAll(itemSelector)].filter(isVisibleElement);
        return {
          className: element.className,
          rect: rectOf(element),
          itemCount: items.length,
          minItemWidth: minRectValue(items, "width"),
          maxItemHeight: maxRectValue(items, "height"),
          lineCount: buttonLineCount(items)
        };
      });
    }

    function auditCollection(root, selector, mapper) {
      return [...root.querySelectorAll(selector)].filter(isVisibleElement).map(mapper);
    }

    function findButtonIssues(root) {
      const controls = [...root.querySelectorAll("button, .el-button")].filter(isVisibleElement);
      return controls.flatMap(element => {
        if (element.closest(".ui-segmented-el")) return [];
        const rect = element.getBoundingClientRect();
        const text = normalizedText(element);
        if (!text || text.length < 3) return [];
        if (element.scrollWidth > element.clientWidth + 2) {
          return [{message: `按钮“${shortText(text)}”文字横向溢出`}];
        }
        if (rect.width < 58 && text.length >= 4) {
          return [{message: `按钮“${shortText(text)}”宽度 ${roundNumber(rect.width)}px 偏窄`}];
        }
        return [];
      });
    }

    function findTextIssues(root) {
      const candidates = [
        ...root.querySelectorAll(".ui-detail-grid strong, .ui-metric-grid strong, .object-table-el .cell, .ui-segmented-el .el-segmented__item-label")
      ].filter(isVisibleElement);
      const issues = [];
      for (const element of candidates) {
        const text = normalizedText(element);
        if (!text || text.length < 5) continue;
        const rect = element.getBoundingClientRect();
        const computed = getComputedStyle(element);
        const lineHeight = Number.parseFloat(computed.lineHeight) || 16;
        if (element.scrollWidth > element.clientWidth + 2 && computed.overflowX !== "auto" && computed.overflowX !== "scroll") {
          issues.push({message: `文本“${shortText(text)}”横向溢出`});
          continue;
        }
        if (rect.width < 72 && rect.height > lineHeight * 2.4) {
          issues.push({message: `文本“${shortText(text)}”在 ${roundNumber(rect.width)}px 宽度内疑似异常折行`});
        }
      }
      return issues.slice(0, 12);
    }

    function isVisibleElement(element) {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 &&
        rect.height > 0 &&
        element.getAttribute("aria-hidden") !== "true" &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity) !== 0;
    }

    function minRectValue(elements, key) {
      const values = elements.map(element => element.getBoundingClientRect()[key]).filter(Number.isFinite);
      return values.length ? roundNumber(Math.min(...values)) : 0;
    }

    function maxRectValue(elements, key) {
      const values = elements.map(element => element.getBoundingClientRect()[key]).filter(Number.isFinite);
      return values.length ? roundNumber(Math.max(...values)) : 0;
    }

    function buttonLineCount(elements) {
      const tops = new Set(elements.map(element => Math.round(element.getBoundingClientRect().top)));
      return tops.size;
    }

    function normalizedText(element) {
      return (element.textContent || "").replace(/\s+/g, " ").trim();
    }

    function shortText(text) {
      return text.length > 24 ? `${text.slice(0, 24)}...` : text;
    }

    function roundNumber(value) {
      return Math.round((Number(value) || 0) * 10) / 10;
    }

    const root = document.querySelector(`.floating-panel[data-panel-id="${panel.panelId}"]`);
    if (!root) return {...panel, missing: true, issues: ["未找到面板"]};
    const body = root.querySelector(".floating-panel-body");
    const rootRect = rectOf(root);
    const bodyRect = rectOf(body);
    const metrics = auditGrid(root, ".ui-metric-grid", ".ui-metric-grid > div");
    const details = auditGrid(root, ".ui-detail-grid", ".ui-detail-grid > div");
    const sortBars = auditCollection(root, ".ui-sort-bar", element => {
      const buttons = [...element.querySelectorAll("button, .el-button")].filter(isVisibleElement);
      return {
        className: element.className,
        rect: rectOf(element),
        buttonCount: buttons.length,
        minButtonWidth: minRectValue(buttons, "width"),
        maxButtonHeight: maxRectValue(buttons, "height"),
        wraps: buttonLineCount(buttons) > 1
      };
    });
    const segmented = auditCollection(root, ".ui-segmented-el", element => {
      const group = element.querySelector(".el-segmented__group") || element;
      const items = [...element.querySelectorAll(".el-segmented__item-label")].filter(isVisibleElement);
      return {
        className: element.className,
        rect: rectOf(element),
        groupRect: rectOf(group),
        groupDisplay: getComputedStyle(group).display,
        groupOverflowX: getComputedStyle(group).overflowX,
        itemCount: items.length,
        minItemWidth: minRectValue(items, "width"),
        lineCount: buttonLineCount(items)
      };
    });
    const tables = auditCollection(root, ".object-table-wrap", element => ({
      className: element.className,
      rect: rectOf(element),
      clientWidth: roundNumber(element.clientWidth),
      scrollWidth: roundNumber(element.scrollWidth),
      overflowX: getComputedStyle(element).overflowX,
      scrollable: element.scrollWidth > element.clientWidth + 2
    }));
    const buttonIssues = findButtonIssues(root);
    const textIssues = findTextIssues(root);
    const issues = [];
    if (body && body.scrollWidth > body.clientWidth + 2) issues.push(`面板 body 横向溢出 ${body.scrollWidth - body.clientWidth}px`);
    for (const item of metrics) {
      if (item.minItemWidth && item.minItemWidth < 112) issues.push(`summary 最小项宽 ${item.minItemWidth}px 低于 112px`);
    }
    for (const item of details) {
      if (item.minItemWidth && item.minItemWidth < 120) issues.push(`detail 最小项宽 ${item.minItemWidth}px 低于 120px`);
    }
    for (const issue of buttonIssues) issues.push(issue.message);
    for (const issue of textIssues) issues.push(issue.message);
    return {
      ...panel,
      missing: false,
      rect: rootRect,
      body: {
        rect: bodyRect,
        clientWidth: body ? roundNumber(body.clientWidth) : 0,
        scrollWidth: body ? roundNumber(body.scrollWidth) : 0
      },
      metrics,
      details,
      sortBars,
      segmented,
      tables,
      buttonIssues,
      textIssues,
      issues
    };
  }, panel);

  await page.locator(`.floating-panel[data-panel-id="${panel.panelId}"] .floating-panel-close`).click();
  return report;
}

async function auditPage(page) {
  return page.evaluate(() => ({
    viewport: {width: window.innerWidth, height: window.innerHeight},
    bodyClientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.documentElement.scrollWidth,
    bodyOverflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)
  }));
}

function collectIssues(panels, pageAudit, consoleErrors) {
  const issues = [];
  if (pageAudit.bodyOverflowX > 0) issues.push({scope: "page", message: `页面横向溢出 ${pageAudit.bodyOverflowX}px`});
  for (const error of consoleErrors) issues.push({scope: "console", message: error});
  for (const panel of panels) {
    for (const message of panel.issues || []) issues.push({scope: panel.panelId, message});
  }
  return issues;
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# 面板布局审计报告", "");
  lines.push(`- 生成时间：${report.metadata.generatedAt}`);
  lines.push(`- seed：\`${report.metadata.seed}\``);
  lines.push(`- 地形模板：\`${report.metadata.template}\``);
  lines.push(`- cells：\`${report.metadata.cells}\``);
  lines.push(`- 视口：\`${report.metadata.viewport.width} x ${report.metadata.viewport.height}\``);
  lines.push(`- 结论：${report.issues.length ? `发现 ${report.issues.length} 个待复核项` : "未发现待复核项"}`);
  lines.push(`- 点击到出图：\`${report.generation.elapsedMs}ms\`，WebGL 加载：\`${report.generation.loadMapMs}ms\``);
  lines.push("");
  lines.push("## 总览", "");
  lines.push("| 面板 | 宽度 | body 溢出 | summary 最小项 | detail 最小项 | 表格横滚 | 待复核项 |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|");
  for (const panel of report.panels) {
    lines.push([
      panel.label,
      px(panel.rect?.width),
      px(Math.max(0, (panel.body?.scrollWidth || 0) - (panel.body?.clientWidth || 0))),
      px(minAuditValue(panel.metrics, "minItemWidth")),
      px(minAuditValue(panel.details, "minItemWidth")),
      panel.tables?.filter(table => table.scrollable).length || 0,
      panel.issues?.length || 0
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
  if (report.issues.length) {
    lines.push("", "## 待复核项", "");
    for (const issue of report.issues) lines.push(`- ${issue.scope}: ${issue.message}`);
  }
  lines.push("", "## 详情", "");
  for (const panel of report.panels) {
    lines.push(`### ${panel.label}`, "");
    lines.push(`- 面板：${px(panel.rect?.width)} x ${px(panel.rect?.height)}`);
    lines.push(`- body：client ${px(panel.body?.clientWidth)} / scroll ${px(panel.body?.scrollWidth)}`);
    lines.push(`- summary 最小项：${px(minAuditValue(panel.metrics, "minItemWidth"))}`);
    lines.push(`- detail 最小项：${px(minAuditValue(panel.details, "minItemWidth"))}`);
    lines.push(`- segmented：${panel.segmented?.map(item => `${item.itemCount} 项 / ${item.lineCount} 行 / min ${px(item.minItemWidth)}`).join("；") || "none"}`);
    lines.push(`- 表格横向滚动：${panel.tables?.filter(item => item.scrollable).length || 0}`);
    if (panel.issues?.length) {
      for (const issue of panel.issues) lines.push(`  - ${issue}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function renderIssueSummary(issues) {
  return ["面板布局审计发现待复核项：", ...issues.map(issue => `- ${issue.scope}: ${issue.message}`)].join("\n");
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
  try {
    return await playwright.chromium.launch(options);
  } catch (error) {
    if (browserChannel) throw error;
    for (const channel of ["chrome", "msedge"]) {
      try {
        return await playwright.chromium.launch({headless, channel});
      } catch {
        // Try the next installed system browser channel.
      }
    }
    throw error;
  }
}

function getContentType(file) {
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
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

function minAuditValue(items, key) {
  const values = (items || []).map(item => Number(item[key])).filter(Number.isFinite);
  return values.length ? Math.min(...values) : 0;
}

function px(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0 ? `${roundNumber(value)}px` : "none";
}

function roundNumber(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}
