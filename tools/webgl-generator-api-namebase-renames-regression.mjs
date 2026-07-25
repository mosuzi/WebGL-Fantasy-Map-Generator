#!/usr/bin/env node
import {createReadStream, existsSync, mkdirSync, statSync, writeFileSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {dirname, extname, join, normalize, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {partitionApiBrowserDiagnostics, waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const args = parseArgs(process.argv.slice(2));
const host = String(args.host || "127.0.0.1");
const port = Number(args.port || 5449);
const timeoutMs = Number(args.timeout || 180000);
const cells = Number(args.cells || 3000);
const seed = String(args.seed || "api-namebase-renames-regression");
const template = String(args.template || "continents");
const browserChannel = args["browser-channel"] || args.channel || "chrome";
const distDir = resolve(args.dir || join(rootDir, "dist", "webgl-generator"));
const outPath = resolve(args.out || join(rootDir, "docs", "generated", "reports", "api-namebase-renames-regression-results.json"));
const markdownPath = resolve(args.markdown || join(rootDir, "docs", "generated", "reports", "api-namebase-renames-regression-results.md"));
const viewport = parseViewport(args.viewport || "1280x820");

if (!existsSync(distDir)) fail(`构建产物不存在：${distDir}`);
mkdirSync(dirname(outPath), {recursive: true});
mkdirSync(dirname(markdownPath), {recursive: true});

const playwright = await loadPlaywright(sourceDir);
const server = await startStaticServer({host, port, publicDir: distDir});
let browser = null;

try {
  browser = await launchBrowser(playwright, {headless: !args.headful, browserChannel});
  const context = await browser.newContext({viewport, deviceScaleFactor: 1});
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
  const result = await inspectNamebaseRenames(page, {cells, seed, template});
  const observedHealthErrors = await inspectHealthErrors(page);
  const diagnostics = partitionApiBrowserDiagnostics(observedHealthErrors, consoleErrors);
  const healthErrors = diagnostics.healthErrors;

  const report = {
    metadata: {
      generatedAt: new Date().toISOString(),
      url: baseUrl,
      distDir,
      seed,
      cells,
      template,
      viewport,
      browserChannel,
      consoleErrors: diagnostics.consoleErrors,
      performanceConsoleErrors: diagnostics.performanceConsoleErrors,
      pageErrors
    },
    ...result,
    healthErrors,
    passed: result.passed && healthErrors.total === 0 && diagnostics.consoleErrors.length === 0 && pageErrors.length === 0
  };

  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(markdownPath, renderMarkdown(report), "utf8");
  console.log(JSON.stringify(buildConsoleSummary(report), null, 2));
  console.log(`Wrote ${outPath}`);
  console.log(`Wrote ${markdownPath}`);
  if (!report.passed) fail(renderFailureSummary(report));
} finally {
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await new Promise(resolveClose => server.close(resolveClose));
}

async function inspectNamebaseRenames(page, {cells, seed, template}) {
  return page.evaluate(async ({cells, seed, template}) => {
    const failures = [];
    const api = window.webglGeneratorApi;
    unwrap(await api.generate.newMap({confirm: true, seed, cellsTarget: cells, heightmapTemplate: template}), "generate.newMap");
    const before = unwrap(api.info.mapSummary(), "info.mapSummary.before");
    const map = window.__webglGeneratorApp?.map;
    const targets = collectTargets(map);

    const noConfirm = api.namebases.renameObjects("city", targets.city.ids.slice(0, 1));
    const unsupported = api.namebases.renameObjects("marker", [1], {confirm: true});
    const emptyIds = api.namebases.renameObjects("city", [], {confirm: true});
    if (noConfirm?.ok !== false || !String(noConfirm?.error?.message || "").includes("confirm")) {
      failures.push(`未确认 renameObjects 未结构化失败：${JSON.stringify(noConfirm)}`);
    }
    if (unsupported?.ok !== false || !String(unsupported?.error?.message || "").includes("province / culture / religion")) {
      failures.push(`不支持类型未结构化失败：${JSON.stringify(unsupported)}`);
    }
    if (emptyIds?.ok !== false || !String(emptyIds?.error?.message || "").includes("ids")) {
      failures.push(`空 ids 未结构化失败：${JSON.stringify(emptyIds)}`);
    }

    const results = [];
    for (const kind of ["state", "city", "river", "lake", "province", "culture", "religion"]) {
      const plan = targets[kind];
      if (!plan.ids.length) {
        results.push({kind, skipped: true, reason: "当前地图没有可重命名对象", ids: []});
        continue;
      }
      const beforeNames = readNameSnapshots(map, kind, plan.ids);
      const renameResult = unwrap(api.namebases.renameObjects(kind, plan.ids, {confirm: true}), `namebases.renameObjects.${kind}`);
      const afterNames = readNameSnapshots(map, kind, plan.ids);
      const changed = afterNames.filter((item, index) => !sameSnapshot(item, beforeNames[index])).length;
      if (!renameResult.executed) failures.push(`${kind} renameObjects 未执行`);
      if ((renameResult.result?.renamed || 0) !== changed) {
        failures.push(`${kind} renamed 计数异常：result=${renameResult.result?.renamed || 0}, changed=${changed}`);
      }
      if (changed <= 0) failures.push(`${kind} 没有任何对象改名`);
      const undoResult = unwrap(api.history.undo(), `history.undo.${kind}`);
      const restoredNames = readNameSnapshots(map, kind, plan.ids);
      const restored = restoredNames.every((item, index) => sameSnapshot(item, beforeNames[index]));
      if (!undoResult.executed) failures.push(`${kind} 撤销未执行`);
      if (!restored) failures.push(`${kind} 撤销后名称未恢复`);
      results.push({
        kind,
        skipped: false,
        ids: plan.ids,
        available: plan.available,
        beforeNames,
        afterNames,
        restoredNames,
        changed,
        rename: summarizeEditResult(renameResult),
        undo: summarizeHistoryResult(undoResult),
        restored
      });
    }

    const after = unwrap(api.info.mapSummary(), "info.mapSummary.after");
    const history = unwrap(api.history.get(), "history.get");
    const stats = window.__webglGeneratorApp?.renderer?.getStats?.() || {};
    const glError = stats.draw?.glError || 0;
    if (before.checksum !== after.checksum) failures.push(`改名并撤销后 checksum 改变：${before.checksum} -> ${after.checksum}`);
    if (glError) failures.push(`WebGL error ${glError}`);

    return {
      map: {
        checksum: before.checksum,
        gridCells: before.gridCells,
        packCells: before.packCells,
        states: before.states,
        cities: before.cities,
        rivers: targets.river.available,
        lakes: targets.lake.available
      },
      safety: {
        noConfirmRejected: noConfirm?.ok === false,
        noConfirmMessage: noConfirm?.error?.message || "",
        unsupportedRejected: unsupported?.ok === false,
        unsupportedMessage: unsupported?.error?.message || "",
        emptyIdsRejected: emptyIds?.ok === false,
        emptyIdsMessage: emptyIds?.error?.message || ""
      },
      targets,
      renames: results,
      history: {undo: history.undo, redo: history.redo, lastAffected: history.lastAffected || []},
      glError,
      failures,
      passed: failures.length === 0
    };

    function collectTargets(map) {
      return {
        state: {
          available: collectStateIds(map).length,
          ids: collectStateIds(map).slice(0, 4)
        },
        city: {
          available: collectCityIds(map).length,
          ids: collectCityIds(map).slice(0, 6)
        },
        river: {
          available: collectRiverIds(map).length,
          ids: collectRiverIds(map).slice(0, 8)
        },
        lake: {
          available: collectLakeIds(map).length,
          ids: collectLakeIds(map).slice(0, 4)
        },
        province: {
          available: collectNamedIds(map?.politics?.provinces || map?.pack?.provinces).length,
          ids: collectNamedIds(map?.politics?.provinces || map?.pack?.provinces).slice(0, 4)
        },
        culture: {
          available: collectNamedIds(map?.society?.cultures || map?.pack?.cultures).length,
          ids: collectNamedIds(map?.society?.cultures || map?.pack?.cultures).slice(0, 4)
        },
        religion: {
          available: collectNamedIds(map?.society?.religions || map?.pack?.religions).length,
          ids: collectNamedIds(map?.society?.religions || map?.pack?.religions).slice(0, 4)
        }
      };
    }

    function collectStateIds(map) {
      return (map?.politics?.states || [])
        .map((state, index) => Number(state?.id ?? state?.i ?? index))
        .filter(id => id > 0 && map?.politics?.states?.[id] && !map.politics.states[id].removed);
    }

    function collectCityIds(map) {
      return (map?.settlements?.cities || [])
        .map((city, index) => Number(city?.id ?? index))
        .filter(id => id >= 0 && map?.settlements?.cities?.[id]);
    }

    function collectRiverIds(map) {
      return (map?.rivers?.rivers || [])
        .map(river => Number(river?.id))
        .filter(id => Number.isInteger(id) && id >= 0 && map.rivers.rivers.some(river => river?.id === id));
    }

    function collectLakeIds(map) {
      return (map?.pack?.features || [])
        .filter(feature => feature?.type === "lake")
        .map(feature => Number(feature.i ?? feature.id))
        .filter(id => Number.isInteger(id) && id >= 0);
    }

    function collectNamedIds(items) {
      return (items || [])
        .map((item, index) => Number(item?.id ?? item?.i ?? index))
        .filter(id => id > 0 && items?.[id] && !items[id].removed);
    }

    function readNameSnapshots(map, kind, ids) {
      return ids.map(id => {
        if (kind === "state") {
          const state = map?.politics?.states?.[id];
          const packState = map?.pack?.states?.[id];
          return {
            id,
            name: state?.name || "",
            fullName: state?.fullName || "",
            packName: packState?.name || "",
            packFullName: packState?.fullName || ""
          };
        }
        if (kind === "city") {
          const city = map?.settlements?.cities?.[id];
          const burg = city ? (map?.pack?.burgs?.[city.burgId] || (map?.pack?.burgs || []).find(item => item?.cityId === city.id)) : null;
          return {id, name: city?.name || "", burgId: city?.burgId || 0, burgName: burg?.name || ""};
        }
        if (kind === "river") {
          const river = (map?.rivers?.rivers || []).find(item => item?.id === id);
          return {id, name: river?.name || ""};
        }
        if (kind === "lake") {
          const lake = (map?.pack?.features || []).find(feature => feature?.type === "lake" && Number(feature.i ?? feature.id) === id);
          return {id, name: lake?.name || ""};
        }
        if (kind === "province") {
          const item = map?.politics?.provinces?.[id] || map?.pack?.provinces?.[id];
          return {id, name: item?.name || "", fullName: item?.fullName || ""};
        }
        if (kind === "culture") {
          const item = map?.society?.cultures?.[id] || map?.pack?.cultures?.[id];
          return {id, name: item?.name || "", root: item?.root || ""};
        }
        const item = map?.society?.religions?.[id] || map?.pack?.religions?.[id];
        return {id, name: item?.name || ""};
      });
    }

    function sameSnapshot(a, b) {
      return JSON.stringify(a) === JSON.stringify(b);
    }

    function summarizeEditResult(result) {
      return {
        executed: result.executed === true,
        label: result.label || "",
        result: result.result || null,
        history: result.history || null,
        error: result.error || null
      };
    }

    function summarizeHistoryResult(result) {
      return {
        executed: result.executed === true,
        label: result.label || "",
        history: result.history || null
      };
    }

    function unwrap(result, label) {
      if (!result?.ok) throw new Error(`${label} 调用失败：${result?.error?.message || "未知错误"}`);
      return result.data;
    }
  }, {cells, seed, template});
}

async function inspectHealthErrors(page) {
  return page.evaluate(() => {
    const result = window.webglGeneratorApi.info.healthEvents({severity: "error", limit: 180});
    if (!result?.ok) throw new Error(`info.healthEvents 调用失败：${result?.error?.message || "未知错误"}`);
    return {
      total: result.data.total,
      counts: result.data.counts,
      events: result.data.events.map(event => ({
        type: event.type || "",
        severity: event.severity || event.level || "",
        message: event.message || "",
        operation: event.operation || ""
      }))
    };
  });
}

function buildConsoleSummary(report) {
  return {
    ok: report.passed,
    checksum: report.map.checksum,
    targets: Object.fromEntries(Object.entries(report.targets).map(([kind, item]) => [kind, {
      available: item.available,
      ids: item.ids
    }])),
    safety: report.safety,
    renames: Object.fromEntries(report.renames.map(item => [item.kind, {
      skipped: item.skipped,
      ids: item.ids,
      changed: item.changed || 0,
      renamed: item.rename?.result?.renamed || 0,
      restored: item.restored === true
    }])),
    glError: report.glError,
    healthErrors: report.healthErrors.total,
    consoleErrors: report.metadata.consoleErrors.length,
    pageErrors: report.metadata.pageErrors.length
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# API 名称库批量改名回归报告", "");
  lines.push(`- 生成时间：${report.metadata.generatedAt}`);
  lines.push(`- seed：\`${report.metadata.seed}\``);
  lines.push(`- 地形模板：\`${report.metadata.template}\``);
  lines.push(`- 目标 cells：\`${report.metadata.cells}\``);
  lines.push(`- 结论：${report.passed ? "通过" : "失败"}`);
  lines.push("");
  lines.push("## 地图", "");
  lines.push(`- checksum：\`${report.map.checksum}\``);
  lines.push(`- grid cells：${report.map.gridCells}`);
  lines.push(`- pack cells：${report.map.packCells}`);
  lines.push(`- 国家：${report.map.states}`);
  lines.push(`- 城市：${report.map.cities}`);
  lines.push(`- 河流：${report.map.rivers}`);
  lines.push(`- 湖泊：${report.map.lakes}`);
  lines.push("");
  lines.push("## 安全边界", "");
  lines.push(`- 未确认调用结构化失败：${report.safety.noConfirmRejected ? "是" : "否"}`);
  lines.push(`- 不支持类型结构化失败：${report.safety.unsupportedRejected ? "是" : "否"}`);
  lines.push(`- 空 ids 结构化失败：${report.safety.emptyIdsRejected ? "是" : "否"}`);
  lines.push("");
  lines.push("## 改名与撤销", "");
  for (const item of report.renames) {
    if (item.skipped) {
      lines.push(`- ${item.kind}：跳过（${item.reason}）`);
      continue;
    }
    lines.push(`- ${item.kind}：目标 ${item.ids.length} 个，实际改名 ${item.changed} 个，撤销恢复：${item.restored ? "是" : "否"}`);
  }
  lines.push("");
  lines.push("## 运行状态", "");
  lines.push(`- WebGL error：${report.glError}`);
  lines.push(`- health error：${report.healthErrors.total}`);
  lines.push(`- console error：${report.metadata.consoleErrors.length}`);
  lines.push(`- page error：${report.metadata.pageErrors.length}`);
  if (report.failures.length) {
    lines.push("", "## 失败项", "");
    for (const failure of report.failures) lines.push(`- ${failure}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function renderFailureSummary(report) {
  const lines = ["API 名称库批量改名回归失败："];
  for (const failure of report.failures) lines.push(`- ${failure}`);
  for (const event of report.healthErrors.events || []) lines.push(`- health error: ${event.message || JSON.stringify(event)}`);
  for (const error of report.metadata.consoleErrors) lines.push(`- console error: ${error}`);
  for (const error of report.metadata.pageErrors) lines.push(`- page error: ${error}`);
  return lines.join("\n");
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

function parseViewport(value) {
  const [width, height] = String(value).split("x").map(Number);
  return {
    width: Number.isFinite(width) ? width : 1280,
    height: Number.isFinite(height) ? height : 820
  };
}

function getContentType(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html;charset=utf-8";
  if (ext === ".js") return "text/javascript;charset=utf-8";
  if (ext === ".css") return "text/css;charset=utf-8";
  if (ext === ".json" || ext === ".geojson") return "application/json;charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

async function loadPlaywright(sourceDirectory) {
  const requireFromSource = createRequire(join(sourceDirectory, "package.json"));
  try {
    return requireFromSource("playwright");
  } catch (error) {
    fail(`无法加载 Playwright，请先在 source/Fantasy-Map-Generator 安装依赖：${error.message}`);
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
