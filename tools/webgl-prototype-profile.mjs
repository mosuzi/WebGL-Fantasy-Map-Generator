#!/usr/bin/env node
import {createRequire} from "node:module";
import {existsSync, mkdirSync, writeFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {spawn, spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultOut = join(rootDir, "docs", "webgl-prototype-profile-results.json");
const defaultMarkdown = join(rootDir, "docs", "webgl-prototype-profile-results.md");

const args = parseArgs(process.argv.slice(2));
const port = Number(args.port || 5400);
const host = args.host || "127.0.0.1";
const baseUrl = args.url || `http://${host}:${port}`;
const output = resolve(args.out || defaultOut);
const markdown = args.markdown === false ? null : resolve(args.markdown || defaultMarkdown);
const timeoutMs = Number(args.timeout || 30000);
const iterations = Number(args.iterations || 10);
const browserChannel = args["browser-channel"] || args.channel || null;

let serverProcess = null;
let browser = null;

try {
  if (!args.url && !(await canFetch(baseUrl))) {
    serverProcess = startPrototypeServer(host, port);
    await waitForHttp(baseUrl, timeoutMs);
  }

  const playwright = await loadPlaywright();
  browser = await launchBrowser(playwright, {headless: !args.headful, browserChannel});
  const page = await browser.newPage({viewport: {width: 1280, height: 800}});
  page.setDefaultTimeout(timeoutMs);
  await page.goto(baseUrl, {waitUntil: "domcontentloaded", timeout: timeoutMs});
  await page.waitForFunction(() => window.__graphicsMapRenderer?.getStats?.(), {timeout: timeoutMs});

  const result = await page.evaluate(
    options => {
      const renderer = window.__graphicsMapRenderer;
      const canvas = document.getElementById("map-canvas");
      const rect = canvas.getBoundingClientRect();
      const center = {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};

      const drawSamples = sample(options.iterations, () => {
        renderer.draw();
        return renderer.performance.drawMs;
      });

      renderer.setColorMode("states");
      const stateDrawMs = renderer.performance.drawMs;
      renderer.setColorMode("height");
      const heightDrawMs = renderer.performance.drawMs;

      renderer.setLayerVisible("rivers", false);
      const noRiversDrawMs = renderer.performance.drawMs;
      renderer.setLayerVisible("rivers", true);
      const withRiversDrawMs = renderer.performance.drawMs;

      const pickSamples = sample(options.iterations, () => renderer.pick(center.x, center.y).pickMs);
      const pick = renderer.pick(center.x, center.y);

      return {
        summary: document.getElementById("summary")?.textContent || "",
        stats: renderer.getStats(),
        lastDraw: renderer.lastDraw,
        samples: {
          drawMs: summarize(drawSamples),
          pickMs: summarize(pickSamples),
          stateDrawMs,
          heightDrawMs,
          noRiversDrawMs,
          withRiversDrawMs
        },
        pick
      };

      function sample(count, fn) {
        const values = [];
        for (let index = 0; index < count; index++) values.push(fn());
        return values;
      }

      function summarize(values) {
        const sorted = values.slice().sort((a, b) => a - b);
        const sum = values.reduce((total, value) => total + value, 0);
        return {
          min: round(sorted[0]),
          avg: round(sum / values.length),
          max: round(sorted[sorted.length - 1]),
          samples: values.map(round)
        };
      }

      function round(value) {
        return Math.round(value * 100) / 100;
      }
    },
    {iterations}
  );

  const report = {
    metadata: {
      generatedAt: new Date().toISOString(),
      baseUrl,
      iterations,
      userAgent: await page.evaluate(() => navigator.userAgent)
    },
    result
  };

  mkdirSync(dirname(output), {recursive: true});
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (markdown) {
    mkdirSync(dirname(markdown), {recursive: true});
    writeFileSync(markdown, renderMarkdown(report), "utf8");
  }

  console.log(`Wrote WebGL profile JSON to ${output}`);
  if (markdown) console.log(`Wrote WebGL profile Markdown to ${markdown}`);
} finally {
  if (browser) await browser.close();
  if (serverProcess) stopServer(serverProcess);
}

function renderMarkdown(report) {
  const {metadata, result} = report;
  const {stats, samples, pick} = result;
  return `# WebGL 原型性能采集结果

生成时间：${metadata.generatedAt}
测试地址：\`${metadata.baseUrl}\`
采样次数：${metadata.iterations}

## 地图数据

| 指标 | 数值 |
|---|---:|
| 目标 cells | ${stats.metadata.cellsTarget} |
| 实际 pack cells | ${stats.metadata.packCells} |
| 实际 grid cells | ${stats.metadata.gridCells ?? stats.geometry.renderCellCount} |
| 渲染来源 | ${stats.geometry.renderSource} |
| 渲染 cells | ${stats.geometry.renderCellCount} |
| 渲染顶点 | ${stats.geometry.renderVertexCount} |
| pack Voronoi 顶点 | ${stats.metadata.vertices} |
| 河流数量 | ${stats.metadata.rivers} |
| 三角形 | ${stats.geometry.triangles} |
| GPU 顶点 | ${stats.geometry.vertexCount} |
| 国家边界线段 | ${stats.geometry.stateBorderSegments ?? stats.geometry.borderSegments} |
| 省份边界线段 | ${stats.geometry.provinceBorderSegments ?? 0} |
| 路线数量 | ${stats.geometry.routeCount ?? 0} |
| 路线线段 | ${stats.geometry.routeSegments ?? 0} |
| 河流线段 | ${stats.geometry.riverSegments} |
| 降水点 | ${stats.geometry.pointStats?.precipitationPoints ?? 0} |
| 人口 instances | ${stats.geometry.pointStats?.populationInstances ?? 0} |
| 城市/港口点 | ${stats.geometry.pointStats?.burgIcons ?? 0} |
| marker 点 | ${stats.geometry.pointStats?.markerCount ?? 0} |
| picking 索引桶 | ${stats.picking.buckets} |
| 平均候选 cells | ${stats.picking.avgCandidates} |
| 最大候选 cells | ${stats.picking.maxCandidates} |

## 耗时

| 指标 | ms |
|---|---:|
| buffer 构建 | ${stats.performance.buildMs} |
| buffer 上传 | ${stats.performance.uploadMs} |
| draw 最小值 | ${samples.drawMs.min} |
| draw 平均值 | ${samples.drawMs.avg} |
| draw 最大值 | ${samples.drawMs.max} |
| 切换到国家模式绘制 | ${samples.stateDrawMs} |
| 切换到高度模式绘制 | ${samples.heightDrawMs} |
| 关闭河流后绘制 | ${samples.noRiversDrawMs} |
| 打开河流后绘制 | ${samples.withRiversDrawMs} |
| picking 最小值 | ${samples.pickMs.min} |
| picking 平均值 | ${samples.pickMs.avg} |
| picking 最大值 | ${samples.pickMs.max} |

## 中心点 picking

| 指标 | 数值 |
|---|---:|
| cell id | ${pick.id} |
| 高度 | ${pick.height} |
| 国家 id | ${pick.stateId} |
| 候选 cells | ${pick.pickCandidates} |
| picking ms | ${pick.pickMs} |

## 说明

- 本报告采集的是独立 WebGL 原型，不是原项目完整 UI。
- 当前原型覆盖 cell 面、feature 面、专题面、国家边界、省份边界、路线、河流折线、四类点图层和空间索引 cell picking。
- 后续接入原项目后，仍需在同一张地图和同一图层开关下重新采集 SVG 与 WebGL 的严格对照。
`;
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

async function loadPlaywright() {
  try {
    const require = createRequire(import.meta.url);
    return require("playwright");
  } catch {
    const sourcePackage = join(rootDir, "source", "Fantasy-Map-Generator", "package.json");
    const requireFromSource = createRequire(sourcePackage);
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
        // 继续尝试下一个系统浏览器 channel。
      }
    }
    throw error;
  }
}

function startPrototypeServer(host, port) {
  const script = join(rootDir, "tools", "serve-prototype.mjs");
  if (!existsSync(script)) fail(`Missing prototype server script: ${script}`);
  return spawn("node", [script, "--host", host, "--port", String(port)], {
    cwd: rootDir,
    stdio: "ignore",
    shell: process.platform === "win32"
  });
}

function stopServer(child) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {stdio: "ignore"});
    return;
  }
  child.kill();
}

async function waitForHttp(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await canFetch(url)) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  fail(`Timed out waiting for ${url}`);
}

async function canFetch(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
