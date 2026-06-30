#!/usr/bin/env node
import {mkdirSync, writeFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const cellsList = parseCells(args.cells || "10000,50000,100000");
const seed = String(args.seed || "stage-2-1");
const template = String(args.template || "continents");
const graphWidth = Number(args.width || 1440);
const graphHeight = Number(args.height || 960);
const iterations = Math.max(1, Number(args.iterations || 1));
const outPath = resolve(args.out || join(rootDir, "docs", "generated", "reports", "generation-profile-results.json"));
const markdownPath = resolve(args.markdown || join(rootDir, "docs", "generated", "reports", "generation-profile-results.md"));

mkdirSync(dirname(outPath), {recursive: true});
mkdirSync(dirname(markdownPath), {recursive: true});

const report = {
  metadata: {
    generatedAt: new Date().toISOString(),
    seed,
    template,
    graphWidth,
    graphHeight,
    cells: cellsList,
    iterations,
    node: process.version
  },
  cases: cellsList.map(cells => profileCase({cells, seed, template, graphWidth, graphHeight, iterations}))
};

writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
writeFileSync(markdownPath, renderMarkdown(report), "utf8");
console.log(`Wrote ${outPath}`);
console.log(`Wrote ${markdownPath}`);

function profileCase({cells, seed, template, graphWidth, graphHeight, iterations}) {
  const runs = [];
  for (let index = 0; index < iterations; index++) {
    const startedAt = performance.now();
    const map = generatePlaceholderMap({
      seed,
      heightmapTemplate: template,
      cellsTarget: cells,
      graphWidth,
      graphHeight,
      randomSeed: false
    });
    const wallMs = roundMs(performance.now() - startedAt);
    const timing = map.metadata.generationTiming;
    runs.push({
      run: index + 1,
      wallMs,
      totalMs: timing.totalMs,
      gridCells: map.metadata.gridCells,
      packCells: map.metadata.packCells,
      checksum: map.summary.checksum,
      slowest: timing.slowest,
      stages: timing.stages
    });
  }

  return {
    cells,
    summary: summarizeRuns(runs),
    runs
  };
}

function summarizeRuns(runs) {
  const stageIds = [...new Set(runs.flatMap(run => run.stages.map(stage => stage.id)))];
  const stages = stageIds.map(id => {
    const samples = runs
      .map(run => run.stages.find(stage => stage.id === id))
      .filter(Boolean);
    return {
      id,
      label: samples[0]?.label || id,
      avgMs: roundMs(average(samples.map(stage => stage.ms))),
      maxMs: roundMs(Math.max(...samples.map(stage => stage.ms))),
      share: round(average(samples.map(stage => stage.ms)) / Math.max(1, average(runs.map(run => run.totalMs))) * 100, 1)
    };
  }).sort((a, b) => b.avgMs - a.avgMs);

  return {
    avgWallMs: roundMs(average(runs.map(run => run.wallMs))),
    avgTotalMs: roundMs(average(runs.map(run => run.totalMs))),
    maxTotalMs: roundMs(Math.max(...runs.map(run => run.totalMs))),
    gridCells: runs[0]?.gridCells ?? 0,
    packCells: runs[0]?.packCells ?? 0,
    checksum: runs[0]?.checksum ?? "none",
    slowestStages: stages.slice(0, 8),
    stages
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# WebGL 生成性能阶段报告", "");
  lines.push(`- 生成时间：${report.metadata.generatedAt}`);
  lines.push(`- seed：\`${report.metadata.seed}\``);
  lines.push(`- 地形模板：\`${report.metadata.template}\``);
  lines.push(`- 地图尺寸：\`${report.metadata.graphWidth} x ${report.metadata.graphHeight}\``);
  lines.push(`- 采样次数：\`${report.metadata.iterations}\``);
  lines.push("");
  lines.push("## 总览", "");
  lines.push("| 目标 cells | 实际 grid cells | pack cells | 平均总耗时 | 最大总耗时 | checksum | 最慢阶段 |");
  lines.push("|---:|---:|---:|---:|---:|---|---|");
  for (const item of report.cases) {
    const slowest = item.summary.slowestStages[0];
    lines.push(`| ${item.cells} | ${item.summary.gridCells} | ${item.summary.packCells} | ${item.summary.avgTotalMs}ms | ${item.summary.maxTotalMs}ms | \`${item.summary.checksum}\` | ${slowest ? `${slowest.label} ${slowest.avgMs}ms` : "none"} |`);
  }

  for (const item of report.cases) {
    lines.push("", `## ${item.cells} cells 阶段明细`, "");
    lines.push("| 阶段 | 平均耗时 | 最大耗时 | 占比 |");
    lines.push("|---|---:|---:|---:|");
    for (const stage of item.summary.stages) {
      lines.push(`| ${stage.label} | ${stage.avgMs}ms | ${stage.maxMs}ms | ${stage.share}% |`);
    }
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index++;
    }
  }
  return parsed;
}

function parseCells(value) {
  return String(value)
    .split(",")
    .map(item => Number(item.trim()))
    .filter(value => Number.isFinite(value) && value > 0);
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundMs(value) {
  return round(value, 1);
}

function round(value, digits) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
