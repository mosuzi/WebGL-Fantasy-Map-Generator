#!/usr/bin/env node
import {createRequire} from "node:module";
import {existsSync, mkdirSync, writeFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {spawn, spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

import {buildGrid} from "../app/webgl-generator/src/generator/grid.js";
import {createHeightmap, traceHeightmapSteps} from "../app/webgl-generator/src/generator/heightmap.js";
import {normalizeOptions} from "../app/webgl-generator/src/generator/options.js";
import {createRandom} from "../app/webgl-generator/src/generator/random.js";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const args = parseArgs(process.argv.slice(2));
const template = String(args.template || "archipelago");
const cells = Number(args.cells || 100000);
const seed = String(args.seed || `audit-${template}-001`);
const host = args.host || "127.0.0.1";
const port = Number(args.port || 5303);
const timeoutMs = Number(args.timeout || 180000);
const browserChannel = args["browser-channel"] || args.channel || "chrome";
const outDir = resolve(args.outDir || args["out-dir"] || join(rootDir, "docs", "generated", "source-baselines", `heightmap-step-${template}-${cells}-${seed}`));

if (!existsSync(sourceDir)) fail(`Source directory does not exist: ${sourceDir}`);
mkdirSync(outDir, {recursive: true});

const playwright = await loadPlaywright(sourceDir);
let serverProcess = null;
let browser = null;

try {
  const baseUrl = `http://${host}:${port}`;
  serverProcess = startDevServer(sourceDir, host, port);
  await waitForHttp(baseUrl, timeoutMs);
  browser = await launchBrowser(playwright, {browserChannel});
  const page = await browser.newPage({viewport: {width: 1440, height: 960}});
  page.setDefaultTimeout(timeoutMs);
  await page.goto(baseUrl, {waitUntil: "domcontentloaded", timeout: timeoutMs});
  await page.waitForFunction(
    () => typeof window.generate === "function" && typeof window.changeCellsDensity === "function" && typeof heightmapTemplates === "object",
    {timeout: timeoutMs}
  );

  const source = await page.evaluate(
    async options => {
      configureGeneration(options);
      await window.generate({seed: options.seed});
      await waitForMap(options.timeoutMs);
      await settle();

      const {grid} = window;
      const finalHeights = Array.from(grid.cells.h || []);
      const gridInfo = createGridInfo(grid);
      const originalHeights = grid.cells.h;
      const originalAddStep = HeightmapGenerator.addStep.bind(HeightmapGenerator);
      const tracedSteps = [];

      HeightmapGenerator.addStep = (...step) => {
        const previousRandom = Math.random;
        const randomLog = {count: 0, first: []};
        Math.random = () => {
          const value = previousRandom();
          randomLog.count++;
          if (randomLog.first.length < 20) randomLog.first.push(round(value, 12));
          return value;
        };

        const result = originalAddStep(...step);
        Math.random = previousRandom;
        const heights = Array.from(HeightmapGenerator.getHeights());
        tracedSteps.push({
          raw: step.join(" "),
          stats: describeHeights(heights),
          featurePreview: describeFeaturePreview(heights, grid),
          sample: heights.slice(0, 20),
          random: randomLog,
          start: estimateStepStart(step, randomLog.first, grid)
        });
        return result;
      };

      delete grid.cells.h;
      const templateHeights = Array.from(await HeightmapGenerator.generate(grid));
      HeightmapGenerator.addStep = originalAddStep;
      grid.cells.h = originalHeights;
      return {
        gridInfo,
        steps: tracedSteps,
        finalAfterTemplate: describeHeights(templateHeights),
        finalAfterTemplateFeaturePreview: describeFeaturePreview(templateHeights, grid),
        finalAfterGeneration: describeHeights(finalHeights),
        finalSample: finalHeights.slice(0, 20)
      };

      function configureGeneration(options) {
        setCellCount(options.cells);
        setTemplate(options.template);
        lockOption("points");
        lockOption("template");
      }

      function setCellCount(cells) {
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
        const densityValue = densityMap[cells];
        if (!densityValue) throw new Error(`Unsupported cell count: ${cells}`);
        window.changeCellsDensity(densityValue);
      }

      function setTemplate(templateId) {
        const select = document.getElementById("templateInput");
        const name = heightmapTemplates[templateId].name || templateId;
        if (typeof window.applyOption === "function") window.applyOption(select, templateId, name);
        else select.value = templateId;
      }

      function lockOption(id) {
        if (typeof window.lock === "function") {
          window.lock(id);
          return;
        }
        const el = document.getElementById(`lock_${id}`);
        if (!el) return;
        el.dataset.locked = "1";
        el.className = "icon-lock";
      }

      async function waitForMap(timeoutMs) {
        const startedAt = performance.now();
        while (performance.now() - startedAt < timeoutMs) {
          if (window.grid?.cells?.h?.length && window.pack?.cells?.i?.length) return;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        throw new Error("Timed out waiting for source map generation");
      }

      async function settle(frames = 2) {
        for (let index = 0; index < frames; index++) await new Promise(resolve => requestAnimationFrame(resolve));
      }

      function describeHeights(values) {
        const list = Array.from(values || []).map(Number).sort((a, b) => a - b);
        const landCells = list.filter(height => height >= 20).length;
        return {
          min: list[0] || 0,
          p05: quantileSorted(list, 0.05),
          p25: quantileSorted(list, 0.25),
          p50: quantileSorted(list, 0.5),
          p75: quantileSorted(list, 0.75),
          p90: quantileSorted(list, 0.9),
          p95: quantileSorted(list, 0.95),
          p99: quantileSorted(list, 0.99),
          max: list[list.length - 1] || 0,
          mean: round(list.reduce((sum, value) => sum + value, 0) / Math.max(1, list.length), 3),
          landRatio: round(landCells / Math.max(1, list.length), 3),
          landCells
        };
      }

      function describeFeaturePreview(heights, grid) {
        const values = Array.from(heights || []);
        const neighbors = grid.cells?.c || [];
        const borders = grid.cells?.b || [];
        const visited = new Uint8Array(values.length);
        const queue = [];
        const features = [];

        for (let start = 0; start < values.length; start++) {
          if (visited[start]) continue;
          const land = values[start] >= 20;
          let border = false;
          let cells = 0;
          let coastEdges = 0;
          let min = Infinity;
          let max = -Infinity;
          let sum = 0;
          const sample = [];
          visited[start] = 1;
          queue.length = 0;
          queue.push(start);

          for (let cursor = 0; cursor < queue.length; cursor++) {
            const cell = queue[cursor];
            const height = Number(values[cell] || 0);
            cells++;
            sum += height;
            if (height < min) min = height;
            if (height > max) max = height;
            if (sample.length < 8) sample.push(cell);
            if (borders[cell]) border = true;

            for (const neighbor of neighbors[cell] || []) {
              const neighborLand = values[neighbor] >= 20;
              if (neighborLand !== land) {
                coastEdges++;
                continue;
              }
              if (visited[neighbor]) continue;
              visited[neighbor] = 1;
              queue.push(neighbor);
            }
          }

          features.push({
            id: features.length + 1,
            land,
            type: land ? "island" : border ? "ocean" : "lake",
            border,
            cells,
            coastEdges,
            min,
            max,
            mean: round(sum / Math.max(1, cells), 3),
            sample
          });
        }

        const lands = features.filter(feature => feature.land);
        const lakes = features.filter(feature => feature.type === "lake");
        const oceans = features.filter(feature => feature.type === "ocean");
        const nearSea = values.reduce(
          (summary, height) => {
            if (height >= 18 && height < 20) summary.water++;
            if (height >= 20 && height <= 22) summary.land++;
            return summary;
          },
          {water: 0, land: 0}
        );

        return {
          total: features.length,
          land: lands.length,
          oceans: oceans.length,
          lakes: lakes.length,
          landCells: lands.reduce((sum, feature) => sum + feature.cells, 0),
          waterCells: values.length - lands.reduce((sum, feature) => sum + feature.cells, 0),
          smallLandLt3: lands.filter(feature => feature.cells < 3).length,
          smallLandLt10: lands.filter(feature => feature.cells < 10).length,
          smallLakesLt3: lakes.filter(feature => feature.cells < 3).length,
          smallLakesLt10: lakes.filter(feature => feature.cells < 10).length,
          largestLand: lands.reduce((max, feature) => Math.max(max, feature.cells), 0),
          largestLake: lakes.reduce((max, feature) => Math.max(max, feature.cells), 0),
          nearSea,
          smallLandSamples: lands.filter(feature => feature.cells < 10).slice(0, 8),
          smallLakeSamples: lakes.filter(feature => feature.cells < 10).slice(0, 8)
        };
      }

      function quantileSorted(list, percentile) {
        if (!list.length) return 0;
        const index = Math.min(list.length - 1, Math.max(0, Math.floor((list.length - 1) * percentile)));
        return list[index];
      }

      function round(value, digits = 3) {
        const scale = 10 ** digits;
        return Math.round(value * scale) / scale;
      }

      function createGridInfo(grid) {
        const cells = grid.cells || {};
        const neighbors = cells.c || [];
        const points = grid.points || [];
        const boundary = grid.boundary || [];
        const vertices = grid.vertices?.p || [];
        const sampleIds = [0, Math.floor(points.length / 2), points.length - 1].filter(id => id >= 0 && id < points.length);

        return {
          spacing: grid.spacing,
          cellsX: grid.cellsX,
          cellsY: grid.cellsY,
          cellsDesired: grid.cellsDesired,
          points: points.length,
          boundary: boundary.length,
          vertices: vertices.length,
          pointHash: stableHash(points),
          boundaryHash: stableHash(boundary),
          neighborHash: stableHash(neighbors),
          vertexHash: stableHash(vertices),
          firstPoints: points.slice(0, 8),
          samples: sampleIds.map(cell => ({
            cell,
            point: points[cell],
            degree: neighbors[cell]?.length || 0,
            neighbors: Array.from(neighbors[cell] || []).slice(0, 16)
          }))
        };
      }

      function estimateStepStart(step, randomFirst, grid) {
        const [tool, count, height, rangeX, rangeY] = step;
        if (tool !== "Hill" && tool !== "Pit") return null;
        if (!rangeX || !rangeY || randomFirst.length < 2) return null;

        const offset = randomsForNumberInRange(count) + randomsForNumberInRange(height);
        if (randomFirst.length <= offset + 1) return null;

        const x = pointFromRandom(randomFirst[offset], rangeX, graphWidth);
        const y = pointFromRandom(randomFirst[offset + 1], rangeY, graphHeight);
        const cell = regularGridCell(x, y, grid);
        const neighbors = Array.from(grid.cells.c[cell] || []);

        return {
          x: round(x, 3),
          y: round(y, 3),
          cell,
          point: grid.points[cell],
          degree: neighbors.length,
          neighbors: neighbors.slice(0, 16)
        };
      }

      function randomsForNumberInRange(range) {
        if (typeof range !== "string") return 0;
        const numeric = Number(range);
        if (!Number.isNaN(numeric)) {
          const fraction = numeric - Math.trunc(numeric);
          return fraction > 0 && fraction < 1 ? 1 : 0;
        }
        return range.includes("-") ? 1 : 0;
      }

      function pointFromRandom(randomValue, range, length) {
        const min = (Number.parseInt(String(range).split("-")[0], 10) || 0) / 100;
        const max = (Number.parseInt(String(range).split("-")[1], 10) || Number.parseInt(String(range).split("-")[0], 10) || 0) / 100;
        return Math.floor(randomValue * (max * length - min * length + 1)) + min * length;
      }

      function regularGridCell(x, y, grid) {
        return Math.floor(Math.min(y / grid.spacing, grid.cellsY - 1)) * grid.cellsX + Math.floor(Math.min(x / grid.spacing, grid.cellsX - 1));
      }

      function stableHash(value) {
        let hash = 2166136261;
        walkHash(value);
        return (hash >>> 0).toString(16).padStart(8, "0");

        function walkHash(item) {
          if (ArrayBuffer.isView(item)) {
            for (const value of item) update(String(Number(value).toFixed(4)));
            update("|");
            return;
          }
          if (Array.isArray(item)) {
            update("[");
            for (const value of item) walkHash(value);
            update("]");
            return;
          }
          if (typeof item === "number") update(Number(item).toFixed(4));
          else update(String(item));
        }

        function update(text) {
          for (let index = 0; index < text.length; index++) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
          }
        }
      }
    },
    {template, cells, seed, timeoutMs}
  );

  const candidate = createCandidateTrace();
  const report = {metadata: {generatedAt: new Date().toISOString(), template, cells, seed}, source, candidate, comparison: compareSteps(source.steps, candidate.steps)};
  writeFileSync(join(outDir, "heightmap-step-trace.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(join(outDir, "heightmap-step-trace.md"), renderMarkdown(report), "utf8");
  console.log(`Wrote heightmap step trace to ${join(outDir, "heightmap-step-trace.json")}`);
  console.log(`Wrote heightmap step trace report to ${join(outDir, "heightmap-step-trace.md")}`);
} finally {
  if (browser) await Promise.race([browser.close(), new Promise(resolve => setTimeout(resolve, 5000))]);
  if (serverProcess) stopDevServer(serverProcess);
}

function createCandidateTrace() {
  const options = normalizeOptions({seed, heightmapTemplate: template, cellsTarget: cells, graphWidth: 1440, graphHeight: 960, randomSeed: false});
  const heightmap = createHeightmap(options);
  const grid = buildGrid(options, createRandom(options.seed), heightmap, createRandom(options.seed));
  const layout = {spacing: grid.metadata.spacing, columns: grid.metadata.columns, rows: grid.metadata.rows};
  const trace = traceHeightmapSteps(heightmap, grid, layout, createRandom(options.seed), ({heights}) => ({
    featurePreview: describeFeaturePreview(heights, grid)
  }));
  const gridInfo = createCandidateGridInfo(grid);
  return {
    gridInfo,
    steps: trace.steps.map(step => ({
      ...step,
      start: estimateCandidateStepStart(step.raw.split(" "), step.random?.first || [], grid)
    })),
    finalAfterTemplate: trace.steps.at(-1)?.stats || null,
    finalSample: trace.steps.at(-1)?.sample || []
  };
}

function compareSteps(sourceSteps, candidateSteps) {
  return sourceSteps.map((sourceStep, index) => {
    const candidateStep = candidateSteps[index];
    return {
      index: index + 1,
      raw: sourceStep.raw,
      source: sourceStep.stats,
      candidate: candidateStep?.stats || null,
      sourceStart: sourceStep.start || null,
      candidateStart: candidateStep?.start || null,
      sourceRandomCount: sourceStep.random?.count ?? 0,
      candidateRandomCount: candidateStep?.random?.count ?? null,
      delta: candidateStep ? {
        landRatio: round(candidateStep.stats.landRatio - sourceStep.stats.landRatio, 3),
        p50: candidateStep.stats.p50 - sourceStep.stats.p50,
        p90: candidateStep.stats.p90 - sourceStep.stats.p90,
        p95: candidateStep.stats.p95 - sourceStep.stats.p95,
        max: candidateStep.stats.max - sourceStep.stats.max
      } : null,
      featureDelta: candidateStep ? {
        total: (candidateStep.featurePreview?.total ?? 0) - (sourceStep.featurePreview?.total ?? 0),
        land: (candidateStep.featurePreview?.land ?? 0) - (sourceStep.featurePreview?.land ?? 0),
        lakes: (candidateStep.featurePreview?.lakes ?? 0) - (sourceStep.featurePreview?.lakes ?? 0),
        smallLandLt3: (candidateStep.featurePreview?.smallLandLt3 ?? 0) - (sourceStep.featurePreview?.smallLandLt3 ?? 0),
        smallLakesLt3: (candidateStep.featurePreview?.smallLakesLt3 ?? 0) - (sourceStep.featurePreview?.smallLakesLt3 ?? 0)
      } : null
    };
  });
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# 高度模板 step trace 对照");
  lines.push("");
  lines.push(`生成时间：${report.metadata.generatedAt}`);
  lines.push(`模板：${report.metadata.template}`);
  lines.push(`Seed：${report.metadata.seed}`);
  lines.push(`目标 cells：${report.metadata.cells}`);
  lines.push("");
  lines.push("## Grid 对照");
  lines.push("");
  lines.push("| 项目 | source | candidate |");
  lines.push("|---|---:|---:|");
  lines.push(`| spacing | ${report.source.gridInfo.spacing} | ${report.candidate.gridInfo.spacing} |`);
  lines.push(`| cellsX / cellsY | ${report.source.gridInfo.cellsX} / ${report.source.gridInfo.cellsY} | ${report.candidate.gridInfo.cellsX} / ${report.candidate.gridInfo.cellsY} |`);
  lines.push(`| points | ${report.source.gridInfo.points} | ${report.candidate.gridInfo.points} |`);
  lines.push(`| boundary | ${report.source.gridInfo.boundary} | ${report.candidate.gridInfo.boundary} |`);
  lines.push(`| vertices | ${report.source.gridInfo.vertices} | ${report.candidate.gridInfo.vertices} |`);
  lines.push(`| pointHash | ${report.source.gridInfo.pointHash} | ${report.candidate.gridInfo.pointHash} |`);
  lines.push(`| boundaryHash | ${report.source.gridInfo.boundaryHash} | ${report.candidate.gridInfo.boundaryHash} |`);
  lines.push(`| neighborHash | ${report.source.gridInfo.neighborHash} | ${report.candidate.gridInfo.neighborHash} |`);
  lines.push(`| vertexHash | ${report.source.gridInfo.vertexHash} | ${report.candidate.gridInfo.vertexHash} |`);
  lines.push("");
  lines.push("## Step 首个候选点对照");
  lines.push("");
  lines.push("| step | 操作 | source 首候选 | candidate 首候选 | source 邻接 | candidate 邻接 |");
  lines.push("|---:|---|---:|---:|---|---|");
  for (const [index, item] of report.comparison.entries()) {
    if (!item.sourceStart && !item.candidateStart) continue;
    lines.push(`| ${index + 1} | ${item.raw} | ${formatStart(item.sourceStart)} | ${formatStart(item.candidateStart)} | ${formatNeighbors(item.sourceStart)} | ${formatNeighbors(item.candidateStart)} |`);
  }
  lines.push("");
  lines.push("| step | 操作 | 随机数 S/C | 陆地比 S/C | p50 S/C | p90 S/C | p95 S/C | max S/C |");
  lines.push("|---:|---|---:|---:|---:|---:|---:|---:|");
  for (const item of report.comparison) {
    const source = item.source;
    const candidate = item.candidate;
    lines.push(`| ${item.index} | ${item.raw} | ${item.sourceRandomCount} / ${item.candidateRandomCount ?? "-"} | ${source.landRatio} / ${candidate?.landRatio ?? "-"} | ${source.p50} / ${candidate?.p50 ?? "-"} | ${source.p90} / ${candidate?.p90 ?? "-"} | ${source.p95} / ${candidate?.p95 ?? "-"} | ${source.max} / ${candidate?.max ?? "-"} |`);
  }
  lines.push("");
  lines.push("## Step feature 预览对照");
  lines.push("");
  lines.push("| step | 操作 | 总 feature S/C | 陆地 S/C | 湖泊 S/C | <3c 陆块 S/C | <3c 湖 S/C | 近海水格 S/C | 近海陆格 S/C |");
  lines.push("|---:|---|---:|---:|---:|---:|---:|---:|---:|");
  for (const item of report.comparison) {
    const source = item.sourceStepFeature || item.sourceFeature || report.source.steps[item.index - 1]?.featurePreview;
    const candidate = item.candidateStepFeature || item.candidateFeature || report.candidate.steps[item.index - 1]?.featurePreview;
    lines.push(
      `| ${item.index} | ${item.raw} | ${formatPair(source?.total, candidate?.total)} | ${formatPair(source?.land, candidate?.land)} | ${formatPair(source?.lakes, candidate?.lakes)} | ${formatPair(source?.smallLandLt3, candidate?.smallLandLt3)} | ${formatPair(source?.smallLakesLt3, candidate?.smallLakesLt3)} | ${formatPair(source?.nearSea?.water, candidate?.nearSea?.water)} | ${formatPair(source?.nearSea?.land, candidate?.nearSea?.land)} |`
    );
  }
  lines.push("");
  lines.push("## 生成后 source 高度");
  lines.push("");
  lines.push(`source 完整生成后陆地比：${report.source.finalAfterGeneration.landRatio}，p95：${report.source.finalAfterGeneration.p95}，max：${report.source.finalAfterGeneration.max}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function createCandidateGridInfo(grid) {
  const cells = grid.cells || {};
  const neighbors = cells.c || [];
  const points = grid.points || [];
  const boundary = grid.boundary || [];
  const vertices = grid.vertices?.p || [];
  const sampleIds = [0, Math.floor(points.length / 2), points.length - 1].filter(id => id >= 0 && id < points.length);

  return {
    spacing: grid.metadata.spacing,
    cellsX: grid.metadata.columns,
    cellsY: grid.metadata.rows,
    cellsDesired: grid.metadata.cellsDesired,
    points: points.length,
    boundary: boundary.length,
    vertices: vertices.length,
    pointHash: stableHash(points),
    boundaryHash: stableHash(boundary),
    neighborHash: stableHash(neighbors),
    vertexHash: stableHash(vertices),
    firstPoints: points.slice(0, 8),
    samples: sampleIds.map(cell => ({
      cell,
      point: points[cell],
      degree: neighbors[cell]?.length || 0,
      neighbors: Array.from(neighbors[cell] || []).slice(0, 16)
    }))
  };
}

function describeFeaturePreview(heights, grid) {
  const values = Array.from(heights || []);
  const neighbors = grid.cells?.c || [];
  const borders = grid.cells?.b || [];
  const visited = new Uint8Array(values.length);
  const queue = [];
  const features = [];

  for (let start = 0; start < values.length; start++) {
    if (visited[start]) continue;
    const land = values[start] >= 20;
    let border = false;
    let cells = 0;
    let coastEdges = 0;
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    const sample = [];
    visited[start] = 1;
    queue.length = 0;
    queue.push(start);

    for (let cursor = 0; cursor < queue.length; cursor++) {
      const cell = queue[cursor];
      const height = Number(values[cell] || 0);
      cells++;
      sum += height;
      if (height < min) min = height;
      if (height > max) max = height;
      if (sample.length < 8) sample.push(cell);
      if (borders[cell]) border = true;

      for (const neighbor of neighbors[cell] || []) {
        const neighborLand = values[neighbor] >= 20;
        if (neighborLand !== land) {
          coastEdges++;
          continue;
        }
        if (visited[neighbor]) continue;
        visited[neighbor] = 1;
        queue.push(neighbor);
      }
    }

    features.push({
      id: features.length + 1,
      land,
      type: land ? "island" : border ? "ocean" : "lake",
      border,
      cells,
      coastEdges,
      min,
      max,
      mean: round(sum / Math.max(1, cells), 3),
      sample
    });
  }

  const lands = features.filter(feature => feature.land);
  const lakes = features.filter(feature => feature.type === "lake");
  const oceans = features.filter(feature => feature.type === "ocean");
  const landCells = lands.reduce((sum, feature) => sum + feature.cells, 0);
  const nearSea = values.reduce(
    (summary, height) => {
      if (height >= 18 && height < 20) summary.water++;
      if (height >= 20 && height <= 22) summary.land++;
      return summary;
    },
    {water: 0, land: 0}
  );

  return {
    total: features.length,
    land: lands.length,
    oceans: oceans.length,
    lakes: lakes.length,
    landCells,
    waterCells: values.length - landCells,
    smallLandLt3: lands.filter(feature => feature.cells < 3).length,
    smallLandLt10: lands.filter(feature => feature.cells < 10).length,
    smallLakesLt3: lakes.filter(feature => feature.cells < 3).length,
    smallLakesLt10: lakes.filter(feature => feature.cells < 10).length,
    largestLand: lands.reduce((max, feature) => Math.max(max, feature.cells), 0),
    largestLake: lakes.reduce((max, feature) => Math.max(max, feature.cells), 0),
    nearSea,
    smallLandSamples: lands.filter(feature => feature.cells < 10).slice(0, 8),
    smallLakeSamples: lakes.filter(feature => feature.cells < 10).slice(0, 8)
  };
}

function formatPair(source, candidate) {
  return `${source ?? "-"} / ${candidate ?? "-"}`;
}

function estimateCandidateStepStart(step, randomFirst, grid) {
  const [tool, count, height, rangeX, rangeY] = step;
  if (tool !== "Hill" && tool !== "Pit") return null;
  if (!rangeX || !rangeY || randomFirst.length < 2) return null;

  const offset = randomsForNumberInRange(count) + randomsForNumberInRange(height);
  if (randomFirst.length <= offset + 1) return null;

  const x = pointFromRandom(randomFirst[offset], rangeX, grid.metadata.graphWidth);
  const y = pointFromRandom(randomFirst[offset + 1], rangeY, grid.metadata.graphHeight);
  const cell = regularGridCell(x, y, grid);
  const neighbors = Array.from(grid.cells.c[cell] || []);

  return {
    x: round(x, 3),
    y: round(y, 3),
    cell,
    point: grid.points[cell],
    degree: neighbors.length,
    neighbors: neighbors.slice(0, 16)
  };
}

function randomsForNumberInRange(range) {
  if (typeof range !== "string") return 0;
  const numeric = Number(range);
  if (!Number.isNaN(numeric)) {
    const fraction = numeric - Math.trunc(numeric);
    return fraction > 0 && fraction < 1 ? 1 : 0;
  }
  return range.includes("-") ? 1 : 0;
}

function pointFromRandom(randomValue, range, length) {
  const minText = String(range).split("-")[0];
  const maxText = String(range).split("-")[1];
  const min = (Number.parseInt(minText, 10) || 0) / 100;
  const max = (Number.parseInt(maxText, 10) || Number.parseInt(minText, 10) || 0) / 100;
  return Math.floor(randomValue * (max * length - min * length + 1)) + min * length;
}

function regularGridCell(x, y, grid) {
  return (
    Math.floor(Math.min(y / grid.metadata.spacing, grid.metadata.rows - 1)) * grid.metadata.columns +
    Math.floor(Math.min(x / grid.metadata.spacing, grid.metadata.columns - 1))
  );
}

function stableHash(value) {
  let hash = 2166136261;
  walkHash(value);
  return (hash >>> 0).toString(16).padStart(8, "0");

  function walkHash(item) {
    if (ArrayBuffer.isView(item)) {
      for (const value of item) update(String(Number(value).toFixed(4)));
      update("|");
      return;
    }
    if (Array.isArray(item)) {
      update("[");
      for (const value of item) walkHash(value);
      update("]");
      return;
    }
    if (typeof item === "number") update(Number(item).toFixed(4));
    else update(String(item));
  }

  function update(text) {
    for (let index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  }
}

function formatStart(start) {
  if (!start) return "-";
  return `${start.cell} (${start.x}, ${start.y})`;
}

function formatNeighbors(start) {
  if (!start) return "-";
  return `[${start.neighbors.join(",")}]`;
}

async function loadPlaywright(sourceDir) {
  try {
    const require = createRequire(import.meta.url);
    return require("playwright");
  } catch {
    const requireFromSource = createRequire(join(sourceDir, "package.json"));
    return requireFromSource("playwright");
  }
}

function startDevServer(sourceDir, host, port) {
  return spawn("npm", ["run", "dev", "--", "--host", host, "--port", String(port), "--strictPort"], {
    cwd: sourceDir,
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32"
  });
}

function stopDevServer(child) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {stdio: "ignore"});
  } else {
    child.kill();
  }
  child.stdout?.destroy();
  child.stderr?.destroy();
  child.stdin?.destroy();
  child.unref?.();
}

async function waitForHttp(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // dev server 启动期间连接失败是正常情况。
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  fail(`Timed out waiting for ${url}`);
}

async function launchBrowser(playwright, {browserChannel}) {
  const options = {headless: true};
  if (browserChannel) options.channel = browserChannel;
  return playwright.chromium.launch(options);
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

function round(value, digits = 3) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
