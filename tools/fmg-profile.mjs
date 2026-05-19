#!/usr/bin/env node
import {createRequire} from "node:module";
import {existsSync, mkdirSync, writeFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {spawn, spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultSourceDir = join(rootDir, "source", "Fantasy-Map-Generator");

const args = parseArgs(process.argv.slice(2));
const sourceDir = resolve(args.source || defaultSourceDir);
const cells = parseCells(args.cells || "10000,50000,100000");
const outputJson = resolve(args.out || join(rootDir, "docs", "performance-baseline-results.json"));
const outputMd = resolve(args.markdown || join(rootDir, "docs", "performance-baseline-results.md"));
const port = Number(args.port || 5173);
const host = args.host || "127.0.0.1";
const timeoutMs = Number(args.timeout || 180000);
const headless = args.headful ? false : true;
const browserChannel = args["browser-channel"] || args.channel || null;

if (!existsSync(sourceDir)) {
  fail(`Source directory does not exist: ${sourceDir}`);
}

// Playwright 优先从当前工具环境加载；如果根目录没有依赖，再尝试使用原项目依赖。
const playwright = await loadPlaywright(sourceDir);
let serverProcess = null;
let baseUrl = args.url;

try {
  if (!baseUrl) {
    if (!existsSync(join(sourceDir, "node_modules"))) {
      fail(
        [
          `Missing dependencies in ${sourceDir}.`,
          "Run `npm install` in the source project, or pass --url to profile an already running dev server."
        ].join("\n")
      );
    }

    baseUrl = `http://${host}:${port}`;
    serverProcess = startDevServer(sourceDir, host, port);
    await waitForHttp(baseUrl, timeoutMs);
  }

  const browser = await launchBrowser(playwright, {headless, browserChannel});
  const page = await browser.newPage({viewport: {width: 1440, height: 960}});
  page.setDefaultTimeout(timeoutMs);

  const results = {
    metadata: {
      generatedAt: new Date().toISOString(),
      sourceDir,
      baseUrl,
      cells,
      userAgent: null
    },
    runs: []
  };

  for (const cellCount of cells) {
    // 每一档 cells 都刷新页面，避免上一轮地图状态污染下一轮测量。
    await page.goto(baseUrl, {waitUntil: "domcontentloaded", timeout: timeoutMs});
    await page.waitForFunction(() => typeof window.generate === "function" && typeof window.drawLayers === "function", {
      timeout: timeoutMs
    });
    await injectProfiler(page);

    const run = await page.evaluate(
      async options => {
        return await window.__fmgProfile(options);
      },
      {
        cells: cellCount,
        preset: args.preset || "political",
        includeExport: args.export !== "false",
        timeoutMs
      }
    );

    results.runs.push(run);
    if (!results.metadata.userAgent) {
      results.metadata.userAgent = await page.evaluate(() => navigator.userAgent);
    }
  }

  await browser.close();

  mkdirSync(dirname(outputJson), {recursive: true});
  writeFileSync(outputJson, `${JSON.stringify(results, null, 2)}\n`, "utf8");

  mkdirSync(dirname(outputMd), {recursive: true});
  writeFileSync(outputMd, renderMarkdownChinese(results), "utf8");

  console.log(`Wrote JSON results to ${outputJson}`);
  console.log(`Wrote Markdown report to ${outputMd}`);
} finally {
  if (serverProcess) {
    stopDevServer(serverProcess);
  }
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;

    const [key, inlineValue] = arg.slice(2).split("=");
    if (inlineValue !== undefined) {
      parsed[key] = inlineValue;
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }

    parsed[key] = next;
    index++;
  }
  return parsed;
}

function parseCells(value) {
  return String(value)
    .split(",")
    .map(item => Number(item.trim()))
    .filter(Number.isFinite);
}

async function loadPlaywright(sourceDir) {
  try {
    const require = createRequire(import.meta.url);
    return require("playwright");
  } catch {
    const requireFromSource = createRequire(join(sourceDir, "package.json"));
    try {
      return requireFromSource("playwright");
    } catch {
      fail(
        [
          "Cannot find Playwright.",
          "Install dependencies in source/Fantasy-Map-Generator, or run this from an environment where `playwright` is available."
        ].join("\n")
      );
    }
  }
}

async function launchBrowser(playwright, {headless, browserChannel}) {
  const launchOptions = {headless};
  if (browserChannel) launchOptions.channel = browserChannel;

  try {
    return await playwright.chromium.launch(launchOptions);
  } catch (error) {
    if (browserChannel) throw error;

    // Playwright 自带浏览器未安装时，优先复用系统浏览器，避免基线流程卡在浏览器下载。
    for (const channel of ["chrome", "msedge"]) {
      try {
        return await playwright.chromium.launch({headless, channel});
      } catch {
        // 当前机器可能没有对应浏览器，继续尝试下一个 channel。
      }
    }

    throw error;
  }
}

function startDevServer(sourceDir, host, port) {
  // 使用原项目自己的 dev 脚本，确保 profiling 的是当前 SVG 实现，而不是工具目录的环境。
  const child = spawn("npm", ["run", "dev", "--", "--host", host, "--port", String(port)], {
    cwd: sourceDir,
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32"
  });

  child.stdout.on("data", chunk => process.stdout.write(chunk));
  child.stderr.on("data", chunk => process.stderr.write(chunk));
  child.on("exit", code => {
    if (code !== null && code !== 0) {
      console.error(`Dev server exited with code ${code}`);
    }
  });

  return child;
}

function stopDevServer(child) {
  if (!child.pid) return;

  if (process.platform === "win32") {
    // Vite 由 npm/cmd/node 多层进程启动；Windows 下需要结束整棵进程树。
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {stdio: "ignore"});
    return;
  }

  child.kill();
}

async function waitForHttp(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // dev server 启动期间连接失败是正常情况，继续轮询即可。
    }
    await delay(500);
  }
  fail(`Timed out waiting for ${url}`);
}

async function injectProfiler(page) {
  // 注入页面运行时，而不是写入 source/，这样 profiling 工具不会污染原项目源码。
  await page.evaluate(() => {
    window.__fmgProfile = async function __fmgProfile(options = {}) {
      const settings = {
        cells: 10000,
        preset: "political",
        includeExport: true,
        timeoutMs: 180000,
        ...options
      };

      const layerSelectors = [
        "ocean",
        "landmass",
        "texture",
        "terrs",
        "lakes",
        "biomes",
        "cells",
        "gridOverlay",
        "coordinates",
        "compass",
        "rivers",
        "terrain",
        "relig",
        "cults",
        "regions",
        "provs",
        "zones",
        "borders",
        "routes",
        "temperature",
        "coastline",
        "ice",
        "prec",
        "population",
        "emblems",
        "icons",
        "labels",
        "armies",
        "markers",
        "fogging",
        "ruler",
        "debug"
      ];

      const drawFunctions = [
        "drawFeatures",
        "drawHeightmap",
        "drawBiomes",
        "drawCells",
        "drawCultures",
        "drawReligions",
        "drawStates",
        "drawProvinces",
        "drawBorders",
        "drawRivers",
        "drawRoutes",
        "drawTemperature",
        "drawPopulation",
        "drawIce",
        "drawPrecipitation",
        "drawEmblems",
        "drawLabels",
        "drawBurgIcons",
        "drawMilitary",
        "drawMarkers"
      ];

      const run = {
        cellsTarget: settings.cells,
        preset: settings.preset,
        timings: {},
        layerTimings: {},
        nodeCounts: {},
        totals: {},
        map: {},
        errors: []
      };

      setCellCount(settings.cells);
      setPreset(settings.preset);

      // 生成、应用预设和完整绘制是最核心的基线指标。
      await measure(run.timings, "generate", async () => {
        await window.generate();
        await settle();
      });

      await measure(run.timings, "applyLayersPreset", async () => {
        window.applyLayersPreset?.();
        await settle();
      });

      await measure(run.timings, "drawLayers", async () => {
        window.drawLayers();
        await settle();
      });

      // 单独重跑各 draw* 函数，用于识别后续最值得迁移到 GPU 的图层。
      for (const fnName of drawFunctions) {
        if (typeof window[fnName] !== "function") continue;
        try {
          await measure(run.layerTimings, fnName, async () => {
            const result = window[fnName]();
            if (result && typeof result.then === "function") await result;
            await settle();
          });
        } catch (error) {
          run.errors.push({operation: fnName, message: String(error?.message || error)});
        }
      }

      // 缩放相关测量用于评估当前 SVG viewbox transform 和主动缩放逻辑的成本。
      await measure(run.timings, "zoomToScale8", async () => {
        if (typeof window.zoomTo === "function") {
          window.zoomTo(window.graphWidth / 2, window.graphHeight / 2, 8, 0);
          await settle(4);
        }
      });

      await measure(run.timings, "resetZoom", async () => {
        if (typeof window.resetZoom === "function") {
          window.resetZoom(0);
          await settle(4);
        }
      });

      if (settings.includeExport) {
        // 这里只测 SVG 序列化，不触发浏览器下载，用作导出链路的轻量基线。
        await measure(run.timings, "serializeSvgForExport", async () => {
          const map = document.getElementById("map");
          if (!map) return;
          new XMLSerializer().serializeToString(map);
          await settle();
        });
      }

      run.nodeCounts = collectLayerNodeCounts(layerSelectors);
      run.totals = collectTotals();
      run.map = collectMapInfo();
      return run;

      async function measure(target, name, fn) {
        const startedAt = performance.now();
        await fn();
        const durationMs = performance.now() - startedAt;
        target[name] = Math.round(durationMs * 100) / 100;
      }

      function setCellCount(cells) {
        const pointsInput = document.getElementById("pointsInput");
        if (!pointsInput) throw new Error("Cannot find #pointsInput");
        const densityValue = getCellsDensityValue(cells);

        // 原项目的 value 是 1-13 档位，dataset.cells 才是实际目标点数。
        if (typeof window.changeCellsDensity === "function") {
          window.changeCellsDensity(densityValue);
        } else {
          pointsInput.dataset.cells = String(cells);
          pointsInput.value = String(densityValue);
          document.getElementById("pointsOutputFormatted").value = `${cells / 1000}K`;
        }

        lockOption("points");
      }

      function getCellsDensityValue(cells) {
        const densityMap = {
          1000: 1,
          2000: 2,
          5000: 3,
          10000: 4,
          20000: 5,
          30000: 6,
          40000: 7,
          50000: 8,
          60000: 9,
          70000: 10,
          80000: 11,
          90000: 12,
          100000: 13
        };

        if (!densityMap[cells]) throw new Error(`Unsupported cell count: ${cells}`);
        return densityMap[cells];
      }

      function lockOption(id) {
        const lockEl = document.getElementById(`lock_${id}`);
        if (!lockEl) return;

        lockEl.dataset.locked = "1";
        lockEl.className = "icon-lock";
      }

      function setPreset(preset) {
        const layersPreset = document.getElementById("layersPreset");
        if (layersPreset) {
          layersPreset.value = preset;
          localStorage.setItem("preset", preset);
        }
      }

      async function settle(frames = 2) {
        // 等待若干 RAF，让 D3 transition、DOM 更新和 requestAnimationFrame 合并刷新完成。
        for (let index = 0; index < frames; index++) {
          await new Promise(resolve => requestAnimationFrame(resolve));
        }
      }

      function collectLayerNodeCounts(ids) {
        const counts = {};
        for (const id of ids) {
          const el = document.getElementById(id);
          if (!el) continue;
          counts[id] = {
            descendants: el.querySelectorAll("*").length,
            paths: el.querySelectorAll("path").length,
            uses: el.querySelectorAll("use").length,
            texts: el.querySelectorAll("text,textPath,tspan").length,
            circles: el.querySelectorAll("circle").length,
            lines: el.querySelectorAll("line,polyline").length,
            images: el.querySelectorAll("image").length
          };
        }
        return counts;
      }

      function collectTotals() {
        const map = document.getElementById("map");
        return {
          svgDescendants: map ? map.querySelectorAll("*").length : 0,
          pathNodes: map ? map.querySelectorAll("path").length : 0,
          useNodes: map ? map.querySelectorAll("use").length : 0,
          textNodes: map ? map.querySelectorAll("text,textPath,tspan").length : 0,
          circleNodes: map ? map.querySelectorAll("circle").length : 0,
          lineNodes: map ? map.querySelectorAll("line,polyline").length : 0,
          imageNodes: map ? map.querySelectorAll("image").length : 0
        };
      }

      function collectMapInfo() {
        return {
          gridCells: window.grid?.cells?.i?.length || 0,
          packCells: window.pack?.cells?.i?.length || 0,
          vertices: window.pack?.vertices?.i?.length || window.pack?.vertices?.p?.length || 0,
          features: window.pack?.features?.length || 0,
          rivers: window.pack?.rivers?.length || 0,
          routes: window.pack?.routes?.length || 0,
          burgs: window.pack?.burgs?.filter?.(burg => burg?.i && !burg.removed).length || 0,
          states: window.pack?.states?.filter?.(state => state?.i && !state.removed).length || 0,
          provinces: window.pack?.provinces?.filter?.(province => province?.i && !province.removed).length || 0,
          width: window.graphWidth,
          height: window.graphHeight
        };
      }
    };
  });
}

function renderMarkdown(results) {
  const lines = [];
  lines.push("# Fantasy Map Generator 性能基线结果");
  lines.push("");
  lines.push(`生成时间：${results.metadata.generatedAt}`);
  lines.push(`源码目录：\`${results.metadata.sourceDir}\``);
  lines.push(`测试地址：\`${results.metadata.baseUrl}\``);
  lines.push("");
  lines.push("## 耗时汇总");
  lines.push("");
  lines.push("| 目标 cells | 实际 pack cells | 生成耗时 ms | 完整绘制 ms | SVG 节点 | path | use | 文本节点 |");
  lines.push("|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const run of results.runs) {
    lines.push(
      `| ${run.cellsTarget} | ${run.map.packCells} | ${run.timings.generate ?? ""} | ${run.timings.drawLayers ?? ""} | ${run.totals.svgDescendants} | ${run.totals.pathNodes} | ${run.totals.useNodes} | ${run.totals.textNodes} |`
    );
  }
  lines.push("");
  lines.push("## 图层节点统计");
  lines.push("");
  for (const run of results.runs) {
    lines.push(`### ${run.cellsTarget} 目标 cells`);
    lines.push("");
    lines.push("| 图层 | 子节点 | path | use | 文本 | circle | line | image |");
    lines.push("|---|---:|---:|---:|---:|---:|---:|---:|");
    for (const [layer, count] of Object.entries(run.nodeCounts)) {
      if (!count.descendants) continue;
      lines.push(
        `| ${layer} | ${count.descendants} | ${count.paths} | ${count.uses} | ${count.texts} | ${count.circles} | ${count.lines} | ${count.images} |`
      );
    }
    lines.push("");
  }
  lines.push("## 单图层绘制耗时");
  lines.push("");
  for (const run of results.runs) {
    lines.push(`### ${run.cellsTarget} 目标 cells`);
    lines.push("");
    lines.push("| 操作 | ms |");
    lines.push("|---|---:|");
    for (const [operation, ms] of Object.entries(run.layerTimings)) {
      lines.push(`| ${operation} | ${ms} |`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function renderMarkdownChinese(results) {
  const lines = [];
  lines.push("# Fantasy Map Generator 性能基线结果");
  lines.push("");
  lines.push(`生成时间：${results.metadata.generatedAt}`);
  lines.push(`源码目录：\`${results.metadata.sourceDir}\``);
  lines.push(`测试地址：\`${results.metadata.baseUrl}\``);
  lines.push("");
  lines.push("## 耗时汇总");
  lines.push("");
  lines.push("| 目标 cells | 实际 grid cells | 实际 pack cells | 生成耗时 ms | 完整绘制 ms | SVG 节点 | path | use | 文本节点 |");
  lines.push("|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const run of results.runs) {
    lines.push(
      `| ${run.cellsTarget} | ${run.map.gridCells} | ${run.map.packCells} | ${run.timings.generate ?? ""} | ${run.timings.drawLayers ?? ""} | ${run.totals.svgDescendants} | ${run.totals.pathNodes} | ${run.totals.useNodes} | ${run.totals.textNodes} |`
    );
  }

  lines.push("");
  lines.push("## 图层节点统计");
  lines.push("");
  for (const run of results.runs) {
    lines.push(`### ${run.cellsTarget} 目标 cells`);
    lines.push("");
    lines.push("| 图层 | 子节点 | path | use | 文本 | circle | line | image |");
    lines.push("|---|---:|---:|---:|---:|---:|---:|---:|");
    for (const [layer, count] of Object.entries(run.nodeCounts)) {
      if (!count.descendants) continue;
      lines.push(
        `| ${layer} | ${count.descendants} | ${count.paths} | ${count.uses} | ${count.texts} | ${count.circles} | ${count.lines} | ${count.images} |`
      );
    }
    lines.push("");
  }

  lines.push("## 单图层绘制耗时");
  lines.push("");
  for (const run of results.runs) {
    lines.push(`### ${run.cellsTarget} 目标 cells`);
    lines.push("");
    lines.push("| 操作 | ms |");
    lines.push("|---|---:|");
    for (const [operation, ms] of Object.entries(run.layerTimings)) {
      lines.push(`| ${operation} | ${ms} |`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
