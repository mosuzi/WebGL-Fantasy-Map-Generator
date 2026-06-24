#!/usr/bin/env node
import {existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const mode = args.mode || "quick";
const port = Number(args.port || 5411);
const browserChannel = args["browser-channel"] || args.channel || null;
const timeoutMs = Number(args.timeout || 180000);
const outRoot = resolve(args.outDir || args["out-dir"] || join(rootDir, "docs", "source-baselines"));
const refresh = Boolean(args.refresh);
const refreshCandidate = refresh || Boolean(args["refresh-candidate"]);
const refreshDiff = refresh || Boolean(args["refresh-diff"]);
const includeScreenshots = Boolean(args.screenshots || args.screenshot);

const cases = buildCases(mode, outRoot);
const results = [];

mkdirSync(outRoot, {recursive: true});

for (const [index, item] of cases.entries()) {
  const caseName = item.caseName || `${item.template}-${item.cells}-${item.seed}`;
  const caseDir = join(outRoot, caseName);
  const sourcePath = join(caseDir, "source-summary.json");
  const candidatePath = join(caseDir, "candidate-summary.json");
  const diffPath = join(caseDir, "diff.json");

  if (!existsSync(sourcePath)) {
    fail(`缺少 source baseline：${sourcePath}\n请先运行 tools/source-baseline-matrix.mjs 或 tools/source-export-baseline.mjs。`);
  }

  if (!refreshCandidate && existsSync(candidatePath)) {
    console.log(`Skip existing candidate baseline: ${caseName}`);
  } else {
    runCandidateCase({item, caseDir, casePort: port + index});
  }

  if (!refreshDiff && existsSync(diffPath) && existsSync(candidatePath)) {
    console.log(`Skip existing diff: ${caseName}`);
  } else {
    runDiffCase({caseName});
  }

  const source = JSON.parse(readFileSync(sourcePath, "utf8"));
  const candidate = JSON.parse(readFileSync(candidatePath, "utf8"));
  const diff = JSON.parse(readFileSync(diffPath, "utf8"));
  results.push(toMatrixRow({caseName, source, candidate, diff}));
}

const matrix = {
  metadata: {
    generatedAt: new Date().toISOString(),
    mode,
    cases: results.length,
    outRoot,
    screenshots: includeScreenshots,
    status: summarizeStatus(results)
  },
  cases: results
};

writeFileSync(join(outRoot, "candidate-matrix.json"), `${JSON.stringify(matrix, null, 2)}\n`, "utf8");
writeFileSync(join(outRoot, "candidate-matrix.md"), renderMarkdown(matrix), "utf8");
console.log(`Wrote candidate baseline matrix to ${join(outRoot, "candidate-matrix.json")}`);
console.log(`Wrote candidate baseline report to ${join(outRoot, "candidate-matrix.md")}`);

function runCandidateCase({item, caseDir, casePort}) {
  console.log(`Run candidate baseline: ${item.template}, ${item.cells}, ${item.seed}`);
  const command = [
    join(rootDir, "tools", "webgl-generator-export-baseline.mjs"),
    "--port",
    String(casePort),
    "--template",
    item.template,
    "--cells",
    String(item.cells),
    "--seed",
    item.seed,
    "--out-dir",
    caseDir,
    "--timeout",
    String(timeoutMs)
  ];
  if (!includeScreenshots) command.push("--screenshot", "false");
  if (browserChannel) command.push("--browser-channel", browserChannel);

  const result = spawnSync(process.execPath, command, {
    cwd: rootDir,
    stdio: "inherit"
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

function runDiffCase({caseName}) {
  console.log(`Run baseline diff: ${caseName}`);
  const command = [join(rootDir, "tools", "baseline-diff.mjs"), "--case", caseName];
  const result = spawnSync(process.execPath, command, {
    cwd: rootDir,
    stdio: "inherit"
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

function buildCases(selectedMode, root) {
  if (selectedMode === "existing") return discoverExistingCases(root);

  const quick = [
    {template: "mediterranean", cells: 100000, seed: "audit-mediterranean-001"},
    {template: "continents", cells: 100000, seed: "audit-continents-001"},
    {template: "archipelago", cells: 100000, seed: "audit-archipelago-001"}
  ];
  if (selectedMode === "quick") return quick;

  if (selectedMode !== "full") fail(`Unsupported mode: ${selectedMode}`);
  const templates = ["mediterranean", "continents", "archipelago", "highIsland", "lowIsland", "peninsula", "pangea"];
  const cellsList = [10000, 50000, 100000];
  const seedIds = ["001", "002", "003"];
  return templates.flatMap(template =>
    cellsList.flatMap(cells => seedIds.map(id => ({template, cells, seed: `audit-${template}-${id}`})))
  );
}

function discoverExistingCases(root) {
  return readdirSync(root)
    .map(name => ({name, path: join(root, name)}))
    .filter(item => statSync(item.path).isDirectory() && existsSync(join(item.path, "source-summary.json")))
    .map(item => {
      const source = JSON.parse(readFileSync(join(item.path, "source-summary.json"), "utf8"));
      return {
        caseName: item.name,
        template: source.metadata.template,
        cells: source.metadata.cellsTarget,
        seed: source.metadata.seed
      };
    });
}

function toMatrixRow({caseName, source, candidate, diff}) {
  const failedChecks = [...diff.metrics, ...diff.invariants, ...diff.candidateSpecific]
    .filter(item => item.status === "fail")
    .map(item => item.label || item.id);
  const warnedChecks = diff.metrics.filter(item => item.status === "warn").map(item => item.label || item.id);

  return {
    caseName,
    template: source.metadata?.template,
    seed: source.metadata?.seed,
    cellsTarget: source.metadata?.cellsTarget,
    status: diff.metadata.status,
    failCount: diff.metadata.failCount,
    warnCount: diff.metadata.warnCount,
    failedChecks,
    warnedChecks,
    gridCells: pair(source.grid?.cells, candidate.grid?.cells),
    landRatio: pair(source.grid?.landRatio, candidate.grid?.landRatio),
    heightP50: pair(source.grid?.height?.p50, candidate.grid?.height?.p50),
    heightP95: pair(source.grid?.height?.p95, candidate.grid?.height?.p95),
    tempMin: pair(source.grid?.temperature?.min, candidate.grid?.temperature?.min),
    precipitationMean: pair(source.grid?.precipitation?.mean, candidate.grid?.precipitation?.mean),
    packCells: pair(source.pack?.cells, candidate.pack?.cells),
    rivers: pair(source.rivers?.count, candidate.rivers?.count),
    populationCells: pair(source.population?.positivePopulationCells, candidate.population?.positivePopulationCells),
    burgs: pair(source.society?.burgs, candidate.society?.burgs),
    ports: pair(source.society?.ports, candidate.society?.ports),
    states: pair(source.society?.states, candidate.society?.states),
    religions: pair(source.society?.religions, candidate.society?.religions),
    provinces: pair(source.society?.provinces, candidate.society?.provinces),
    routes: pair(source.routes?.total, candidate.routes?.total),
    landRouteWaterCells: candidate.routes?.landRouteWaterCells,
    seaRouteLandCells: candidate.routes?.seaRouteLandCells,
    recommendation: diff.nextStageRecommendation
  };
}

function summarizeStatus(results) {
  const fail = results.filter(item => item.status === "fail").length;
  const warn = results.filter(item => item.status === "warn").length;
  return fail ? "fail" : warn ? "warn" : "pass";
}

function renderMarkdown(matrix) {
  const lines = [];
  lines.push("# Candidate baseline 矩阵回归");
  lines.push("");
  lines.push(`生成时间：${matrix.metadata.generatedAt}`);
  lines.push(`模式：${matrix.metadata.mode}`);
  lines.push(`样例数：${matrix.metadata.cases}`);
  lines.push(`状态：${matrix.metadata.status}`);
  lines.push("");
  lines.push("## 总览");
  lines.push("");
  lines.push("| case | 模板 | cells | 状态 | fail | warn | grid | pack | 陆地比 S/C | 高度 p50 S/C | 高度 p95 S/C | 温度低值 S/C |");
  lines.push("|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const item of matrix.cases) {
    lines.push(
      `| ${item.caseName} | ${item.template} | ${item.cellsTarget} | ${item.status} | ${item.failCount} | ${item.warnCount} | ${item.gridCells.candidate} | ${item.packCells.candidate} | ${formatPair(item.landRatio)} | ${formatPair(item.heightP50)} | ${formatPair(item.heightP95)} | ${formatPair(item.tempMin)} |`
    );
  }
  lines.push("");
  lines.push("## 语义指标");
  lines.push("");
  lines.push("| case | 河流 S/C | 人口 cell S/C | 城市 S/C | 港口 S/C | 国家 S/C | 宗教 S/C | 省份 S/C | 路线 S/C | 陆路穿水 | 海路中段穿陆 |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const item of matrix.cases) {
    lines.push(
      `| ${item.caseName} | ${formatPair(item.rivers)} | ${formatPair(item.populationCells)} | ${formatPair(item.burgs)} | ${formatPair(item.ports)} | ${formatPair(item.states)} | ${formatPair(item.religions)} | ${formatPair(item.provinces)} | ${formatPair(item.routes)} | ${item.landRouteWaterCells} | ${item.seaRouteLandCells} |`
    );
  }
  lines.push("");
  lines.push("## 问题清单");
  lines.push("");
  for (const item of matrix.cases) {
    const failed = item.failedChecks.length ? item.failedChecks.join("、") : "无";
    const warned = item.warnedChecks.length ? item.warnedChecks.join("、") : "无";
    lines.push(`- ${item.caseName}：fail ${item.failCount}（${failed}），warn ${item.warnCount}（${warned}）。`);
  }
  lines.push("");
  lines.push("## 下一步建议");
  lines.push("");
  if (matrix.metadata.status === "pass") {
    lines.push("quick 矩阵当前全部通过。下一步可刷新 source full 矩阵，或进入 source 后段命名、军事、区域、marker 细节补齐。");
  } else {
    lines.push("优先处理 fail case；若多个模板集中失败，应回到对应 source 阶段算法，而不是只调单一 seed 参数。");
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function pair(source, candidate) {
  return {source: round(source), candidate: round(candidate), delta: round(Number(candidate || 0) - Number(source || 0))};
}

function formatPair(value) {
  return `${value.source} / ${value.candidate}`;
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

function round(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 1000) / 1000;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
