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
const scenario = String(args.scenario || "default");

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
  const healthEvents = [];
  page.on("console", message => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (text.startsWith("[FMG health]")) {
      healthEvents.push(text);
      return;
    }
    consoleErrors.push(text);
  });
  page.on("pageerror", error => consoleErrors.push(error.message));

  const baseUrl = `http://${host}:${port}`;
  await page.goto(baseUrl, {waitUntil: "domcontentloaded", timeout: timeoutMs});
  await page.waitForFunction(() => window.__webglGeneratorApp?.renderer?.getStats?.()?.webgl2, null, {timeout: timeoutMs});
  await page.waitForFunction(() => window.__webglGeneratorApp?.map?.metadata?.generationTiming?.totalMs, null, {timeout: timeoutMs});
  const generation = await generateCase(page, {cells, seed, template, graphWidth, graphHeight});
  if (scenario === "deep") await prepareDeepScenario(page);
  const lazyPreload = scenario === "deep" ? await waitForLazyPreload(page) : null;

  const controlPanel = await auditControlPanel(page);
  await openManagementTab(page);
  const panelReports = [];
  for (const panel of panels) {
    panelReports.push(await auditPanel(page, panel));
  }
  const pageAudit = await auditPage(page);
  const issues = collectIssues(panelReports, pageAudit, consoleErrors, controlPanel);
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
      scenario,
      failOnIssues,
      consoleErrors,
      healthEvents
    },
    generation,
    lazyPreload,
    controlPanel,
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

async function waitForLazyPreload(page) {
  await page.waitForFunction(() => window.__webglGeneratorLazyPreload?.started || false, null, {timeout: Math.min(timeoutMs, 10000)}).catch(() => {});
  await page.waitForFunction(() => {
    const preload = window.__webglGeneratorLazyPreload;
    return !preload || preload.finishedAt || preload.pending === 0;
  }, null, {timeout: Math.min(timeoutMs, 90000)}).catch(() => {});
  return page.evaluate(() => window.__webglGeneratorLazyPreload?.getStats?.() || null);
}

async function prepareDeepScenario(page) {
  await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const map = app?.map;
    if (!map) return;
    const longName = "北辰南麓联合海陆商贸保护自治领";
    const longSuffix = "边境商港与高原粮道共治委员会";
    const longSummary = "盐铁、良港、森林木场、药草谷、琥珀海岸、茶山、马场、硝石洞";
    const longNote = "这是一条用于面板深场景审计的长备注，覆盖国家、城市、资源、战报、名称库等详情字段，确保文字可以自然换行而不是被压成奇怪的窄列。";

    const firstUsable = items => (items || []).find((item, index) => item && !item.removed && (item.i || item.id || index > 0));
    const state = firstUsable(map.politics?.states);
    if (state) {
      state.name = longName;
      state.fullName = `${longName}${longSuffix}`;
      state.formName = "联邦保护自治领";
      state.resourceTypes = {salt: 12, timber: 9, amber: 7, tea: 6, horses: 5, niter: 4};
      state.diplomacySummary = {Ally: 3, Rival: 2, Vassal: 1, Suzerain: 1};
      state.government = state.government || {};
      state.government.sizeLabel = "跨海复合行政";
      state.government.effects = {economyMultiplier: 1.18, tradeMultiplier: 1.22, militaryRecruitment: 0.94};
    }
    for (const militaryState of map.politics?.states || map.pack?.states || []) {
      if (!militaryState?.i || militaryState.removed || !Array.isArray(militaryState.military)) continue;
      for (const regiment of militaryState.military) {
        const stateId = militaryState.i;
        const regimentId = regiment.i ?? regiment.id ?? 0;
        const regimentObjectId = regiment.id ?? `${stateId}:${regimentId}`;
        const chainKey = `deep-audit-chain:${stateId}:${regimentId}`;
        const existing = new Set((regiment.events || []).map(event => event?.id));
        const events = [
          {
            id: `deep-audit-battle-applied:${stateId}:${regimentId}`,
            kind: "battle",
            sequence: 991,
            at: "深场景审计",
            stateId,
            stateName: militaryState.fullName || militaryState.name || `国家 #${stateId}`,
            regimentId,
            regimentObjectId,
            regimentName: regiment.name || `军团 #${regimentId}`,
            chainKey,
            chainLabel: `${longName}边境战报链`,
            chainSide: "attacker",
            chainSideLabel: "攻方",
            type: "siege",
            typeLabel: "攻城",
            outcome: "minor-victory",
            outcomeLabel: "小胜",
            resultApplied: true,
            result: {casualties: 132, sideCasualties: {attacker: 132, defender: 0, participant: 0, local: 0, manual: 0}},
            description: "深场景审计战报：长链路、损耗摘要和说明文字用于验证军事面板不会把战报区域压成异常窄列。"
          },
          {
            id: `deep-audit-battle-pending:${stateId}:${regimentId}`,
            kind: "battle",
            sequence: 992,
            at: "深场景审计",
            stateId,
            stateName: militaryState.fullName || militaryState.name || `国家 #${stateId}`,
            regimentId,
            regimentObjectId,
            regimentName: regiment.name || `军团 #${regimentId}`,
            chainKey,
            chainLabel: `${longName}边境战报链`,
            chainSide: "attacker",
            chainSideLabel: "攻方",
            type: "ambush",
            typeLabel: "伏击",
            outcome: "stalemate",
            outcomeLabel: "相持",
            resultApplied: false,
            result: {casualties: 0, sideCasualties: {attacker: 0, defender: 0, participant: 0, local: 0, manual: 0}},
            description: "深场景审计待结算战报：用于保持战报筛选、清理按钮和摘要链在有数据时也被布局审计覆盖。"
          }
        ];
        regiment.events = [...(regiment.events || []), ...events.filter(event => !existing.has(event.id))];
      }
    }

    const province = firstUsable(map.politics?.provinces || map.pack?.provinces);
    if (province) province.name = `${longName}直属边境贸易省`;
    const city = firstUsable(map.settlements?.cities);
    if (city) {
      city.name = `${longName}银帆港`;
      city.resourceGoodIds = ["salt", "timber", "amber", "tea", "horses", "niter"];
    }
    const culture = firstUsable(map.society?.cultures);
    if (culture) culture.name = `${longName}山海混合文化圈`;
    const religion = firstUsable(map.society?.religions);
    if (religion) religion.name = `${longName}诸圣共祭教团`;
    const route = firstUsable(map.settlements?.routes);
    if (route) {
      route.name = `${longName}盐铁驿路与海港联络线`;
      route.resourceGoodIds = ["salt", "iron", "timber", "amber", "tea", "horses"];
    }
    const river = firstUsable(map.rivers?.rivers);
    if (river) river.name = `${longName}曲折长河`;
    const lake = firstUsable(map.pack?.features?.filter(feature => feature?.type === "lake"));
    if (lake) lake.name = `${longName}内海湖`;
    const marker = firstUsable(map.markers?.markers);
    if (marker) {
      marker.name = `${longName}琥珀盐铁复合资源点`;
      marker.label = `${longName}琥珀盐铁复合资源点`;
      marker.resourceLabel = longSummary;
    }
    const label = firstUsable(map.labels?.labels || map.labels?.items);
    if (label) label.text = `${longName}边疆总标注`;

    if (!map.notes || typeof map.notes !== "object") map.notes = {notes: [], metadata: {}};
    if (!Array.isArray(map.notes.notes)) map.notes.notes = [];
    const noteTargetId = state ? `state:${state.id ?? state.i}` : "map:deep-layout";
    map.notes.notes = map.notes.notes.filter(note => note?.id !== noteTargetId);
    map.notes.notes.push({
      id: noteTargetId,
      target: state ? {kind: "state", id: state.id ?? state.i} : {kind: "map", id: "deep-layout"},
      body: longNote,
      updatedAt: new Date().toISOString()
    });
    map.notes.metadata.notes = map.notes.notes.length;

    app.renderer?.buildLabels?.(map);
    app.renderer?.updateLabels?.();
  });
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

async function auditControlPanel(page) {
  await page.evaluate(() => document.getElementById("open-generation-panel")?.click());
  await page.waitForSelector(`.floating-panel[data-panel-id="generation-panel"]:not(.hidden)`, {timeout: timeoutMs});
  const tabs = [
    {id: "about", label: "简介"},
    {id: "generation", label: "生成"},
    {id: "themes", label: "视图"},
    {id: "units", label: "单位"},
    {id: "layers", label: "图层"},
    {id: "management", label: "管理"}
  ];
  const reports = [];
  for (const tab of tabs) {
    await page.evaluate(tabId => document.querySelector(`[data-control-tab='${tabId}']`)?.click(), tab.id);
    await page.waitForFunction(tabId => {
      const panel = document.querySelector(`[data-control-panel='${tabId}']`);
      return panel && panel.hidden === false;
    }, tab.id, {timeout: timeoutMs});
    await page.waitForTimeout(50);
    reports.push(await page.evaluate(tab => {
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

      function normalizedText(element) {
        return (element.textContent || "").replace(/\s+/g, " ").trim();
      }

      function shortText(text) {
        return text.length > 24 ? `${text.slice(0, 24)}...` : text;
      }

      function roundNumber(value) {
        return Math.round((Number(value) || 0) * 10) / 10;
      }

      function lineHeightOf(element) {
        return Number.parseFloat(getComputedStyle(element).lineHeight) || Number.parseFloat(getComputedStyle(element).fontSize) || 14;
      }

      function findButtonIssues(root) {
        return [...root.querySelectorAll("button, .el-button")].filter(isVisibleElement).flatMap(element => {
          const text = normalizedText(element);
          if (!text || text.length < 3) return [];
          const rect = element.getBoundingClientRect();
          const issues = [];
          if (element.scrollWidth > element.clientWidth + 2) issues.push(`按钮“${shortText(text)}”文字横向溢出`);
          if (rect.width < 58 && text.length >= 4) issues.push(`按钮“${shortText(text)}”宽度 ${roundNumber(rect.width)}px 偏窄`);
          return issues;
        });
      }

      function findTextIssues(root) {
        const candidates = [
          ...root.querySelectorAll(".field-row > span:first-child, .generation-field-row > span:first-child, .unit-derived-row span, .unit-scale-field > span:first-child, .climate-slider-field > span:first-child, .label-limit-field > span:first-child")
        ].filter(isVisibleElement);
        const issues = [];
        for (const element of candidates) {
          const text = normalizedText(element);
          if (!text || text.length < 2) continue;
          const rect = element.getBoundingClientRect();
          const computed = getComputedStyle(element);
          const lineHeight = lineHeightOf(element);
          if (element.scrollWidth > element.clientWidth + 2 && computed.overflowX !== "auto" && computed.overflowX !== "scroll") {
            issues.push(`文本“${shortText(text)}”横向溢出`);
            continue;
          }
          if (text.length >= 4 && rect.height > lineHeight * 1.45) {
            issues.push(`文本“${shortText(text)}”疑似折行，高度 ${roundNumber(rect.height)}px`);
          }
          if (text.length >= 4 && rect.width < 56) {
            issues.push(`文本“${shortText(text)}”宽度 ${roundNumber(rect.width)}px 偏窄`);
          }
        }
        return issues.slice(0, 16);
      }

      function auditSliderLabels(root) {
        return [...root.querySelectorAll(".ui-slider-field")].filter(isVisibleElement).map(element => {
          const label = element.querySelector(":scope > span:first-child");
          const rect = label?.getBoundingClientRect();
          return {
            text: normalizedText(label),
            width: roundNumber(rect?.width),
            height: roundNumber(rect?.height),
            whiteSpace: label ? getComputedStyle(label).whiteSpace : ""
          };
        });
      }

      function findGridAlignmentIssues(root) {
        const grids = [
          [".layer-toggle-grid", "图层按钮网格"],
          [".management-panel-actions", "管理按钮网格"],
          [".regeneration-action-grid", "重新生成按钮网格"],
          [".generation-button-row", "生成按钮行"]
        ];
        const issues = [];
        const reports = [];
        for (const [selector, label] of grids) {
          const grid = root.querySelector(selector);
          if (!grid || !isVisibleElement(grid)) continue;
          const children = [...grid.children].filter(isVisibleElement).map(element => {
            const rect = element.getBoundingClientRect();
            return {left: roundNumber(rect.left), top: Math.round(rect.top), width: roundNumber(rect.width), text: shortText(normalizedText(element))};
          });
          const rows = new Map();
          for (const child of children) {
            if (!rows.has(child.top)) rows.set(child.top, []);
            rows.get(child.top).push(child);
          }
          const sortedRows = [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, items]) => items.sort((a, b) => a.left - b.left));
          const first = sortedRows[0] || [];
          reports.push({label, rows: sortedRows.length, columns: first.length, lefts: first.map(item => item.left)});
          for (const row of sortedRows.slice(1)) {
            for (let index = 0; index < Math.min(row.length, first.length); index += 1) {
              if (Math.abs(row[index].left - first[index].left) > 2) {
                issues.push(`${label} 第 ${index + 1} 列从第二行开始偏移 ${roundNumber(row[index].left - first[index].left)}px`);
                break;
              }
            }
          }
        }
        return {reports, issues};
      }

      const root = document.querySelector(`.floating-panel[data-panel-id="generation-panel"]`);
      const panel = document.querySelector(`[data-control-panel='${tab.id}']`);
      const issues = [];
      if (!root || !panel) return {...tab, missing: true, issues: ["未找到控制面板或 tab"]};
      const body = root.querySelector(".floating-panel-body");
      if (body && body.scrollWidth > body.clientWidth + 2) issues.push(`控制面板 body 横向溢出 ${body.scrollWidth - body.clientWidth}px`);
      if (panel.scrollWidth > panel.clientWidth + 2) issues.push(`${tab.label} tab 横向溢出 ${panel.scrollWidth - panel.clientWidth}px`);
      const buttonIssues = findButtonIssues(panel);
      const textIssues = findTextIssues(panel);
      const gridAlignment = findGridAlignmentIssues(panel);
      issues.push(...buttonIssues, ...textIssues, ...gridAlignment.issues);
      return {
        ...tab,
        missing: false,
        rect: rectOf(panel),
        body: {
          clientWidth: roundNumber(body?.clientWidth),
          scrollWidth: roundNumber(body?.scrollWidth)
        },
        panelClientWidth: roundNumber(panel.clientWidth),
        panelScrollWidth: roundNumber(panel.scrollWidth),
        sliderLabels: auditSliderLabels(panel),
        gridAlignment: gridAlignment.reports,
        buttonIssues,
        textIssues,
        issues
      };
    }, tab));
  }
  const issues = reports.flatMap(report => (report.issues || []).map(message => ({scope: `control:${report.id}`, message})));
  return {tabs: reports, issues};
}

async function auditPanel(page, panel) {
  await closeSecondaryPanels(page);
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
  if (scenario === "deep") await preparePanelDeepState(page, panel.panelId);

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
        ...root.querySelectorAll(".ui-detail-grid strong, .ui-metric-grid strong, .object-table-cell, .object-table-el .cell, .ui-segmented-el .el-segmented__item-label")
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
    const actionGroups = [...root.querySelectorAll("[class*='actions'], [class*='toolbar']")]
      .filter(isVisibleElement)
      .map(element => {
        const buttons = [...element.querySelectorAll("button, .el-button")].filter(isVisibleElement);
        if (buttons.length < 2) return null;
        return {
          className: element.className,
          rect: rectOf(element),
          clientWidth: roundNumber(element.clientWidth),
          scrollWidth: roundNumber(element.scrollWidth),
          buttonCount: buttons.length,
          lineCount: buttonLineCount(buttons),
          minButtonWidth: minRectValue(buttons, "width"),
          maxButtonHeight: maxRectValue(buttons, "height")
        };
      })
      .filter(Boolean);
    const militaryEventChains = auditCollection(root, ".military-event-chain", element => {
      const items = [...element.querySelectorAll(":scope > span")].filter(isVisibleElement);
      return {
        className: element.className,
        rect: rectOf(element),
        clientWidth: roundNumber(element.clientWidth),
        scrollWidth: roundNumber(element.scrollWidth),
        itemCount: items.length,
        lineCount: buttonLineCount(items),
        minItemWidth: minRectValue(items, "width")
      };
    });
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
    for (const group of actionGroups) {
      if (group.scrollWidth > group.clientWidth + 2) issues.push(`工具按钮组横向溢出 ${group.scrollWidth - group.clientWidth}px`);
      if (group.minButtonWidth && group.minButtonWidth < 72) issues.push(`工具按钮组最小按钮宽 ${group.minButtonWidth}px 低于 72px`);
    }
    for (const chain of militaryEventChains) {
      if (chain.scrollWidth > chain.clientWidth + 2) issues.push(`战报摘要横向溢出 ${chain.scrollWidth - chain.clientWidth}px`);
      if (chain.minItemWidth && chain.minItemWidth < 112) issues.push(`战报摘要最小项宽 ${chain.minItemWidth}px 低于 112px`);
    }
    for (const issue of buttonIssues) issues.push(issue.message);
    for (const issue of textIssues) issues.push(issue.message);
    const secondaryPanels = [...document.querySelectorAll(".ui-secondary-action-panel")]
      .filter(isVisibleElement)
      .map(element => {
        const secondaryBody = element.querySelector(".ui-secondary-action-body") || element;
        const secondaryMetrics = auditGrid(element, ".ui-metric-grid", ".ui-metric-grid > div");
        const secondaryDetails = auditGrid(element, ".ui-detail-grid", ".ui-detail-grid > div");
        const secondaryButtonIssues = findButtonIssues(element);
        const secondaryTextIssues = findTextIssues(element);
        const secondaryIssues = [];
        if (secondaryBody.scrollWidth > secondaryBody.clientWidth + 2) secondaryIssues.push(`二级面板 body 横向溢出 ${secondaryBody.scrollWidth - secondaryBody.clientWidth}px`);
        for (const item of secondaryMetrics) {
          if (item.minItemWidth && item.minItemWidth < 112) secondaryIssues.push(`二级 summary 最小项宽 ${item.minItemWidth}px 低于 112px`);
        }
        for (const item of secondaryDetails) {
          if (item.minItemWidth && item.minItemWidth < 120) secondaryIssues.push(`二级 detail 最小项宽 ${item.minItemWidth}px 低于 120px`);
        }
        for (const issue of secondaryButtonIssues) secondaryIssues.push(issue.message);
        for (const issue of secondaryTextIssues) secondaryIssues.push(issue.message);
        return {
          label: normalizedText(element.querySelector(".ui-secondary-action-header strong")) || "二级编辑面板",
          rect: rectOf(element),
          body: {
            rect: rectOf(secondaryBody),
            clientWidth: roundNumber(secondaryBody.clientWidth),
            scrollWidth: roundNumber(secondaryBody.scrollWidth)
          },
          metrics: secondaryMetrics,
          details: secondaryDetails,
          buttonIssues: secondaryButtonIssues,
          textIssues: secondaryTextIssues,
          issues: secondaryIssues
        };
      });
    for (const secondary of secondaryPanels) {
      for (const issue of secondary.issues || []) issues.push(`${secondary.label}: ${issue}`);
    }
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
      actionGroups,
      militaryEventChains,
      secondaryPanels,
      buttonIssues,
      textIssues,
      issues
    };
  }, panel);

  await page.locator(`.floating-panel[data-panel-id="${panel.panelId}"] .floating-panel-close`).click();
  await closeSecondaryPanels(page);
  return report;
}

async function closeSecondaryPanels(page) {
  await page.evaluate(() => {
    for (const button of document.querySelectorAll(".ui-secondary-action-panel .ui-secondary-action-close")) {
      button.dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: true, view: window}));
    }
  });
  await page.waitForTimeout(30);
}

async function preparePanelDeepState(page, panelId) {
  const panelSelector = `.floating-panel[data-panel-id="${panelId}"]`;
  const rowLocator = page.locator(`${panelSelector} .object-table-row, ${panelSelector} .el-table__body-wrapper tbody tr`);
  const actionSelector = `${panelSelector} .ui-action-dock .ui-icon-action:not([disabled]):not(.is-disabled)`;
  const rowCount = await rowLocator.count();
  const preferredRows = panelId === "state-panel" ? [1, 0, 2, 3, 4, 5] : [0, 1, 2];

  if (rowCount) {
    for (const rowIndex of preferredRows) {
      if (rowIndex >= rowCount) continue;
      const row = rowLocator.nth(rowIndex);
      if (!(await row.isVisible().catch(() => false))) continue;
      await row.click({timeout: 800}).catch(() => {});
      await page.waitForTimeout(80);
      if (await page.locator(actionSelector).first().isVisible().catch(() => false)) break;
    }
  } else {
    await page.waitForTimeout(80);
  }

  const firstAction = page.locator(actionSelector).first();
  if (await firstAction.isVisible().catch(() => false)) {
    await firstAction.click({timeout: 800}).catch(() => {});
    await page.waitForSelector(".ui-secondary-action-panel", {state: "visible", timeout: 800}).catch(() => {});
  }
  await page.waitForTimeout(120);
}

async function auditPage(page) {
  return page.evaluate(() => ({
    viewport: {width: window.innerWidth, height: window.innerHeight},
    bodyClientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.documentElement.scrollWidth,
    bodyOverflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)
  }));
}

function collectIssues(panels, pageAudit, consoleErrors, controlPanel = null) {
  const issues = [];
  if (pageAudit.bodyOverflowX > 0) issues.push({scope: "page", message: `页面横向溢出 ${pageAudit.bodyOverflowX}px`});
  for (const error of consoleErrors) issues.push({scope: "console", message: error});
  for (const issue of controlPanel?.issues || []) issues.push(issue);
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
  lines.push(`- 场景：\`${report.metadata.scenario}\``);
  if (report.lazyPreload) {
    lines.push(`- 面板预热：完成 ${report.lazyPreload.completed} / ${report.lazyPreload.total}，失败 ${report.lazyPreload.failed}`);
  }
  lines.push(`- 结论：${report.issues.length ? `发现 ${report.issues.length} 个待复核项` : "未发现待复核项"}`);
  lines.push(`- 点击到出图：\`${report.generation.elapsedMs}ms\`，WebGL 加载：\`${report.generation.loadMapMs}ms\``);
  lines.push("");
  if (report.controlPanel) {
    lines.push("## 控制面板", "");
    lines.push("| Tab | 宽度 | tab 溢出 | 滑条标签 | 网格 | 待复核项 |");
    lines.push("|---|---:|---:|---:|---:|---:|");
    for (const tab of report.controlPanel.tabs || []) {
      const sliderLabelMinWidth = minAuditValue(tab.sliderLabels, "width");
      lines.push([
        tab.label,
        px(tab.rect?.width),
        px(Math.max(0, (tab.panelScrollWidth || 0) - (tab.panelClientWidth || 0))),
        px(sliderLabelMinWidth),
        tab.gridAlignment?.map(item => `${item.label} ${item.rows}行`).join("；") || "none",
        tab.issues?.length || 0
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
    }
    lines.push("");
  }
  lines.push("## 总览", "");
  lines.push("| 面板 | 宽度 | body 溢出 | summary 最小项 | detail 最小项 | 二级面板 | 表格横滚 | 待复核项 |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|");
  for (const panel of report.panels) {
    lines.push([
      panel.label,
      px(panel.rect?.width),
      px(Math.max(0, (panel.body?.scrollWidth || 0) - (panel.body?.clientWidth || 0))),
      px(minAuditValue(panel.metrics, "minItemWidth")),
      px(minAuditValue(panel.details, "minItemWidth")),
      panel.secondaryPanels?.length || 0,
      panel.tables?.filter(table => table.scrollable).length || 0,
      panel.issues?.length || 0
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
  if (report.issues.length) {
    lines.push("", "## 待复核项", "");
    for (const issue of report.issues) lines.push(`- ${issue.scope}: ${issue.message}`);
  }
  if (report.metadata.healthEvents.length) {
    lines.push("", "## 健康监控事件", "");
    lines.push("这些事件不计入布局待复核项；加载 / 绘制性能以 e2e 和 overlay profile 守门为准。");
    for (const event of report.metadata.healthEvents) lines.push(`- ${event}`);
  }
  if (report.controlPanel?.tabs?.length) {
    lines.push("", "## 控制面板详情", "");
    for (const tab of report.controlPanel.tabs) {
      lines.push(`### ${tab.label}`, "");
      lines.push(`- tab：client ${px(tab.panelClientWidth)} / scroll ${px(tab.panelScrollWidth)}`);
      lines.push(`- 滑条标签：${tab.sliderLabels?.map(item => `${item.text || "未命名"} ${px(item.width)} x ${px(item.height)} ${item.whiteSpace}`).join("；") || "none"}`);
      lines.push(`- 网格：${tab.gridAlignment?.map(item => `${item.label} ${item.rows}行 / ${item.columns}列 / left ${item.lefts.join(",")}`).join("；") || "none"}`);
      if (tab.issues?.length) {
        for (const issue of tab.issues) lines.push(`  - ${issue}`);
      }
      lines.push("");
    }
  }
  lines.push("", "## 详情", "");
  for (const panel of report.panels) {
    lines.push(`### ${panel.label}`, "");
    lines.push(`- 面板：${px(panel.rect?.width)} x ${px(panel.rect?.height)}`);
    lines.push(`- body：client ${px(panel.body?.clientWidth)} / scroll ${px(panel.body?.scrollWidth)}`);
    lines.push(`- summary 最小项：${px(minAuditValue(panel.metrics, "minItemWidth"))}`);
    lines.push(`- detail 最小项：${px(minAuditValue(panel.details, "minItemWidth"))}`);
    lines.push(`- segmented：${panel.segmented?.map(item => `${item.itemCount} 项 / ${item.lineCount} 行 / min ${px(item.minItemWidth)}`).join("；") || "none"}`);
    lines.push(`- 工具按钮组：${panel.actionGroups?.map(item => `${shortClassName(item.className)} ${item.buttonCount} 项 / ${item.lineCount} 行 / min ${px(item.minButtonWidth)} / overflow ${px(Math.max(0, (item.scrollWidth || 0) - (item.clientWidth || 0)))}`).join("；") || "none"}`);
    lines.push(`- 战报摘要：${panel.militaryEventChains?.map(item => `${item.itemCount} 项 / ${item.lineCount} 行 / min ${px(item.minItemWidth)} / overflow ${px(Math.max(0, (item.scrollWidth || 0) - (item.clientWidth || 0)))}`).join("；") || "none"}`);
    lines.push(`- 二级面板：${panel.secondaryPanels?.map(item => `${item.label} ${px(item.rect?.width)}`).join("；") || "none"}`);
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

function shortClassName(className = "") {
  const text = String(className || "").trim().replace(/\s+/g, ".");
  return text.length > 36 ? `${text.slice(0, 36)}...` : text || "工具组";
}

function px(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0 ? `${roundNumber(value)}px` : "none";
}

function roundNumber(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}
