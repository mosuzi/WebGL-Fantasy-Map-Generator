#!/usr/bin/env node
import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const baselineRoot = resolve(args.root || join(rootDir, "docs", "generated", "source-baselines"));
const cases = String(args.cases || "continents-10000-audit-continents-001,continents-10000-audit-continents-003")
  .split(",")
  .map(value => value.trim())
  .filter(Boolean);
const outPath = resolve(args.out || join(rootDir, "docs", "generated", "reports", "source-candidate-warn-diagnostics.json"));
const markdownPath = resolve(args.markdown || join(rootDir, "docs", "generated", "reports", "source-candidate-warn-diagnostics.md"));

const report = {
  metadata: {
    generatedAt: new Date().toISOString(),
    baselineRoot,
    cases: cases.length
  },
  cases: cases.map(readCaseDiagnostics)
};

mkdirSync(dirname(outPath), {recursive: true});
mkdirSync(dirname(markdownPath), {recursive: true});
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
writeFileSync(markdownPath, renderMarkdown(report), "utf8");
console.log(`Wrote source/candidate warn diagnostics to ${outPath}`);
console.log(`Wrote source/candidate warn diagnostics report to ${markdownPath}`);

function readCaseDiagnostics(caseName) {
  const caseDir = join(baselineRoot, caseName);
  const source = readJson(join(caseDir, "source-summary.json"));
  const candidate = readJson(join(caseDir, "candidate-summary.json"));
  const diff = readJson(join(caseDir, "diff.json"));
  const warnings = diff.metrics
    .filter(item => item.status === "warn")
    .map(item => ({
      id: item.id,
      source: item.source,
      candidate: item.candidate,
      delta: item.delta,
      ratio: item.ratio,
      diagnosis: diagnoseWarning(item, source, candidate)
    }));

  return {
    caseName,
    status: diff.metadata?.status,
    failCount: diff.metadata?.failCount || 0,
    warnCount: diff.metadata?.warnCount || 0,
    warnings,
    featureSummary: compareFeatureSummary(source.features, candidate.features)
  };
}

function diagnoseWarning(warning, source, candidate) {
  if (warning.id === "features.total") {
    const sourceLand = Number(source.features?.land || 0);
    const candidateLand = Number(candidate.features?.land || 0);
    const sourceTiny = tinyLand(source.features, "cellsLt3");
    const candidateTiny = tinyLand(candidate.features, "cellsLt3");
    return [
      `feature 总数差异主要来自陆地 feature：source ${sourceLand}，candidate ${candidateLand}`,
      `小陆块 cells < 3：source ${sourceTiny}，candidate ${candidateTiny}`,
      "湖泊数量与命名数在该 case 中已对齐，不能用湖泊命名过滤处理"
    ];
  }
  if (warning.id === "lateStages.names.lakeNames") {
    const sourceLakes = Number(source.features?.lakes || 0);
    const candidateLakes = Number(candidate.features?.lakes || 0);
    const sourceNamed = Number(source.features?.diagnostics?.lakes?.named ?? source.lateStages?.names?.lakeNames ?? 0);
    const candidateNamed = Number(candidate.features?.diagnostics?.lakes?.named ?? candidate.lateStages?.names?.lakeNames ?? 0);
    const candidateOutlet = Number(candidate.features?.diagnostics?.lakes?.withOutlet ?? candidate.features?.lakeFields?.withOutlet ?? 0);
    return [
      `湖泊命名数跟随真实湖泊数：source 湖泊 ${sourceLakes} / 命名 ${sourceNamed}，candidate 湖泊 ${candidateLakes} / 命名 ${candidateNamed}`,
      `candidate 有 outlet 的湖泊 ${candidateOutlet}，但命名数仍等于湖泊数，说明 warn 不是 defineLakeNames 过滤不足`,
      "应回到湖泊 feature 形成、洼地和 outlet 拓扑，不应只过滤 lakeNames"
    ];
  }
  return ["该 warn 暂无专门诊断规则，请查看 diff.md 和 feature diagnostics 明细"];
}

function compareFeatureSummary(sourceFeatures = {}, candidateFeatures = {}) {
  return {
    total: pair(sourceFeatures.total, candidateFeatures.total),
    land: pair(sourceFeatures.land, candidateFeatures.land),
    water: pair(sourceFeatures.water, candidateFeatures.water),
    islands: pair(sourceFeatures.types?.island, candidateFeatures.types?.island),
    lakes: pair(sourceFeatures.lakes, candidateFeatures.lakes),
    namedLakes: pair(sourceFeatures.diagnostics?.lakes?.named, candidateFeatures.diagnostics?.lakes?.named),
    lakesWithOutlet: pair(sourceFeatures.diagnostics?.lakes?.withOutlet, candidateFeatures.diagnostics?.lakes?.withOutlet),
    tinyLandCellsLt3: pair(tinyLand(sourceFeatures, "cellsLt3"), tinyLand(candidateFeatures, "cellsLt3")),
    tinyLandCellsLt10: pair(tinyLand(sourceFeatures, "cellsLt10"), tinyLand(candidateFeatures, "cellsLt10")),
    tinyLakesCellsLt3: pair(sourceFeatures.diagnostics?.lakes?.cellsLt3, candidateFeatures.diagnostics?.lakes?.cellsLt3),
    tinyLakesCellsLt10: pair(sourceFeatures.diagnostics?.lakes?.cellsLt10, candidateFeatures.diagnostics?.lakes?.cellsLt10)
  };
}

function renderMarkdown(report) {
  const lines = [
    "# Source / Candidate 剩余 warn 诊断",
    "",
    `生成时间：${report.metadata.generatedAt}`,
    `baseline：\`${report.metadata.baselineRoot}\``,
    ""
  ];
  for (const item of report.cases) {
    lines.push(`## ${item.caseName}`, "");
    lines.push(`状态：${item.status}（fail ${item.failCount}，warn ${item.warnCount}）`, "");
    lines.push("| 指标 | source | candidate | delta |");
    lines.push("|---|---:|---:|---:|");
    for (const [key, value] of Object.entries(item.featureSummary)) {
      lines.push(`| ${key} | ${format(value.source)} | ${format(value.candidate)} | ${format(value.delta)} |`);
    }
    lines.push("");
    lines.push("| warn | source | candidate | delta | ratio | 诊断 |");
    lines.push("|---|---:|---:|---:|---:|---|");
    for (const warning of item.warnings) {
      lines.push(`| ${warning.id} | ${format(warning.source)} | ${format(warning.candidate)} | ${format(warning.delta)} | ${format(warning.ratio)} | ${warning.diagnosis.join("<br>")} |`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function tinyLand(features, key) {
  return Number(features?.diagnostics?.tinyLand?.[key] ?? 0);
}

function pair(source, candidate) {
  const sourceValue = source ?? 0;
  const candidateValue = candidate ?? 0;
  return {
    source: sourceValue,
    candidate: candidateValue,
    delta: Number(candidateValue) - Number(sourceValue)
  };
}

function format(value) {
  if (value === undefined || value === null || Number.isNaN(value)) return "";
  return typeof value === "number" ? String(Math.round(value * 1000) / 1000) : String(value);
}

function readJson(path) {
  if (!existsSync(path)) throw new Error(`Missing required file: ${path}`);
  return JSON.parse(readFileSync(path, "utf8"));
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
      continue;
    }
    parsed[key] = next;
    index++;
  }
  return parsed;
}
