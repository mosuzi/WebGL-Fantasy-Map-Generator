#!/usr/bin/env node
import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const caseName = args.case || "mediterranean-100000-audit-mediterranean-001";
const caseDir = resolve(args.caseDir || args["case-dir"] || join(rootDir, "docs", "source-baselines", caseName));
const sourcePath = resolve(args.source || join(caseDir, "source-summary.json"));
const candidatePath = resolve(args.candidate || join(caseDir, "candidate-summary.json"));
const outPath = resolve(args.out || join(caseDir, "diff.json"));
const markdownPath = resolve(args.markdown || join(caseDir, "diff.md"));

if (!existsSync(sourcePath)) fail(`Missing source summary: ${sourcePath}`);
if (!existsSync(candidatePath)) fail(`Missing candidate summary: ${candidatePath}`);

const source = JSON.parse(readFileSync(sourcePath, "utf8"));
const candidate = JSON.parse(readFileSync(candidatePath, "utf8"));
const diff = buildDiff({source, candidate, sourcePath, candidatePath});

mkdirSync(dirname(outPath), {recursive: true});
writeFileSync(outPath, `${JSON.stringify(diff, null, 2)}\n`, "utf8");
writeFileSync(markdownPath, renderMarkdown(diff), "utf8");
console.log(`Wrote baseline diff to ${outPath}`);
console.log(`Wrote baseline diff report to ${markdownPath}`);

function buildDiff({source, candidate, sourcePath, candidatePath}) {
  const metrics = [
    metric("grid.cells", "grid.cells", {kind: "relative", warn: 0.02, fail: 0.05}),
    metric("grid.avgDegree", "grid.avgDegree", {kind: "absolute", warn: 0.15, fail: 0.4}),
    metric("grid.boundaryPoints", "grid.boundaryPoints", {kind: "relative", warn: 0.25, fail: 0.8}),
    metric("grid.landRatio", "grid.landRatio", {kind: "absolute", warn: 0.08, fail: 0.16}),
    metric("grid.height.p50", "grid.height.p50", {kind: "absolute", warn: 8, fail: 16}),
    metric("grid.height.p95", "grid.height.p95", {kind: "absolute", warn: 10, fail: 20}),
    metric("grid.temperature.min", "grid.temperature.min", {kind: "absolute", warn: 8, fail: 18}),
    metric("grid.temperature.max", "grid.temperature.max", {kind: "absolute", warn: 8, fail: 18}),
    metric("grid.precipitation.mean", "grid.precipitation.mean", {kind: "relative", warn: 0.6, fail: 1.4}),
    metric("pack.cells", "pack.cells", {kind: "relative", warn: 0.2, fail: 0.45}),
    metric("pack.packGridRatio", "pack.packGridRatio", {kind: "absolute", warn: 0.12, fail: 0.25}),
    metric("pack.avgDegree", "pack.avgDegree", {kind: "absolute", warn: 0.2, fail: 0.6}),
    metric("pack.havenCells", "pack.havenCells", {kind: "relative", warn: 0.5, fail: 0.95}),
    metric("features.total", "features.total", {kind: "relative", warn: 0.45, fail: 0.8}),
    metric("features.lakes", "features.lakes", {kind: "relative", warn: 0.45, fail: 0.8}),
    metric("rivers.count", "rivers.count", {kind: "relative", warn: 0.45, fail: 0.8}),
    metric("rivers.cellsWithRiver", "rivers.cellsWithRiver", {kind: "relative", warn: 0.45, fail: 0.8}),
    metric("population.positivePopulationCells", "population.positivePopulationCells", {kind: "relative", warn: 0.45, fail: 0.85}),
    metric("society.cultures", "society.cultures", {kind: "absolute", warn: 4, fail: 8}),
    metric("society.burgs", "society.burgs", {kind: "relative", warn: 0.5, fail: 0.9}),
    metric("society.ports", "society.ports", {kind: "relative", warn: 0.45, fail: 0.85}),
    metric("society.states", "society.states", {kind: "absolute", warn: 5, fail: 12}),
    metric("society.religions", "society.religions", {kind: "absolute", warn: 5, fail: 12}),
    metric("society.provinces", "society.provinces", {kind: "relative", warn: 0.45, fail: 0.85}),
    metric("routes.total", "routes.total", {kind: "relative", warn: 0.45, fail: 0.85}),
    metric("routes.roads", "routes.roads", {kind: "relative", warn: 0.7, fail: 1.0, absolutePass: 5}),
    metric("routes.trails", "routes.trails", {kind: "relative", warn: 0.45, fail: 0.85}),
    metric("routes.searoutes", "routes.searoutes", {kind: "relative", warn: 0.45, fail: 0.95}),
    metric("routes.landRouteWaterCells", "routes.landRouteWaterCells", {kind: "max-extra", warn: 1, fail: 5}),
    metric("routes.seaRouteLandCells", "routes.seaRouteLandCells", {kind: "max-extra", warn: 2, fail: 8}),
    metric("lateStages.names.burgNames", "lateStages.names.burgNames", {kind: "relative", warn: 0.25, fail: 0.6}),
    metric("lateStages.names.burgCoas", "lateStages.names.burgCoas", {kind: "relative", warn: 0.25, fail: 0.6}),
    metric("lateStages.names.stateFullNames", "lateStages.names.stateFullNames", {kind: "relative", warn: 0.25, fail: 0.6}),
    metric("lateStages.names.stateFormNames", "lateStages.names.stateFormNames", {kind: "relative", warn: 0.25, fail: 0.6}),
    metric("lateStages.names.riverNames", "lateStages.names.riverNames", {kind: "relative", warn: 0.35, fail: 0.75}),
    metric("lateStages.names.lakeNames", "lateStages.names.lakeNames", {kind: "relative", warn: 0.35, fail: 0.75}),
    metric("lateStages.military.regiments", "lateStages.military.regiments", {kind: "relative", warn: 0.45, fail: 0.9}),
    metric("lateStages.military.statesWithMilitary", "lateStages.military.statesWithMilitary", {
      kind: "relative",
      warn: 0.45,
      fail: 0.9
    }),
    metric("lateStages.markers.total", "lateStages.markers.total", {kind: "relative", warn: 0.5, fail: 0.9}),
    metric("lateStages.markers.withIcon", "lateStages.markers.withIcon", {kind: "relative", warn: 0.5, fail: 0.9}),
    metric("lateStages.zones.total", "lateStages.zones.total", {kind: "relative", warn: 0.5, fail: 0.9}),
    metric("lateStages.statistics.burgsWithPopulation", "lateStages.statistics.burgsWithPopulation", {
      kind: "relative",
      warn: 0.25,
      fail: 0.6
    }),
    metric("lateStages.statistics.statesWithArea", "lateStages.statistics.statesWithArea", {
      kind: "relative",
      warn: 0.25,
      fail: 0.6
    }),
    metric("lateStages.statistics.provincesWithPole", "lateStages.statistics.provincesWithPole", {
      kind: "relative",
      warn: 0.45,
      fail: 0.85
    })
  ];

  const invariantChecks = [
    invariant("grid 邻接引用", "validation.gridNeighborInvalidRefs", 0),
    invariant("grid 顶点引用", "validation.gridVertexInvalidRefs", 0),
    invariant("pack grid 引用", "validation.packGridRefsInvalid", 0),
    invariant("pack 邻接引用", "validation.packNeighborInvalidRefs", 0),
    invariant("pack 顶点引用", "validation.packVertexInvalidRefs", 0),
    invariant("城市落水", "validation.cityWaterCells", 0),
    invariant("陆路穿水", "validation.landRouteWaterCells", source.validation?.landRouteWaterCells ?? 0),
    invariant("海路中段穿陆", "validation.seaRouteLandCells", source.validation?.seaRouteLandCells ?? 0),
    invariant("marker cell 引用", "lateStages.markers.invalidCells", source.lateStages?.markers?.invalidCells ?? 0),
    invariant("zone cell 引用", "lateStages.zones.invalidCells", source.lateStages?.zones?.invalidCells ?? 0),
    invariant("military cell 引用", "lateStages.military.invalidCells", source.lateStages?.military?.invalidCells ?? 0)
  ];

  const candidateSpecific = [
    {
      id: "gridHasBoundary",
      label: "candidate source boundary points",
      status: candidate.grid?.boundaryPoints > 0 ? "pass" : "fail",
      source: source.grid?.boundaryPoints > 0,
      candidate: candidate.grid?.boundaryPoints > 0,
      message: candidate.grid?.boundaryPoints > 0 ? "candidate 已输出 boundary points" : "candidate 没有 source 风格 boundary points"
    },
    {
      id: "packHasVoronoi",
      label: "candidate pack 真实 Voronoi",
      status: candidate.validation?.packHasVoronoi ? "pass" : "fail",
      source: true,
      candidate: Boolean(candidate.validation?.packHasVoronoi),
      message: candidate.validation?.packHasVoronoi ? "candidate pack 已有独立 Voronoi 字段" : "candidate pack 仍缺少 c/v/area 等 reGraph 字段"
    },
    {
      id: "packMappingOneToOne",
      label: "candidate pack 非一比一映射",
      status: candidate.validation?.packMappingOneToOne ? "fail" : "pass",
      source: false,
      candidate: Boolean(candidate.validation?.packMappingOneToOne),
      message: candidate.validation?.packMappingOneToOne ? "candidate pack 仍是 one-grid-cell-to-one-pack-cell" : "candidate pack 不再是一比一映射"
    },
    {
      id: "routesHaveSeaRoutes",
      label: "candidate 海路",
      status: candidate.validation?.routesHaveSeaRoutes ? "pass" : "fail",
      source: true,
      candidate: Boolean(candidate.validation?.routesHaveSeaRoutes),
      message: candidate.validation?.routesHaveSeaRoutes ? "candidate 已生成海路" : "candidate 没有 searoutes"
    }
  ];

  const rows = metrics.map(item => compareMetric(source, candidate, item));
  const invariants = invariantChecks.map(item => compareInvariant(source, candidate, item));
  const allChecks = [...rows, ...invariants, ...candidateSpecific];
  const failCount = allChecks.filter(item => item.status === "fail").length;
  const warnCount = allChecks.filter(item => item.status === "warn").length;

  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      sourceSummary: sourcePath,
      candidateSummary: candidatePath,
      seed: source.metadata?.seed,
      template: source.metadata?.template,
      cellsTarget: source.metadata?.cellsTarget,
      failCount,
      warnCount,
      status: failCount ? "fail" : warnCount ? "warn" : "pass"
    },
    metrics: rows,
    invariants,
    candidateSpecific,
    missingRequiredPackFields: candidate.pack?.missingRequiredPackFields || [],
    nextStageRecommendation: recommendNextStage({failCount, warnCount, candidate})
  };
}

function metric(label, path, rule) {
  return {label, path, rule};
}

function invariant(label, path, expectedMaximum) {
  return {label, path, expectedMaximum};
}

function compareMetric(source, candidate, item) {
  const sourceRaw = getByPath(source, item.path);
  const candidateRaw = getByPath(candidate, item.path);
  if (item.path.startsWith("lateStages.") && sourceRaw === undefined) {
    return {
      id: item.path,
      label: item.label,
      source: "missing",
      candidate: round(candidateRaw ?? 0),
      delta: "n/a",
      ratio: "n/a",
      status: "fail",
      rule: item.rule
    };
  }

  const sourceValue = Number(sourceRaw ?? 0);
  const candidateValue = Number(candidateRaw ?? 0);
  const delta = candidateValue - sourceValue;
  const absDelta = Math.abs(delta);
  let ratio = sourceValue === 0 ? (candidateValue === 0 ? 0 : Infinity) : absDelta / Math.abs(sourceValue);
  let score = item.rule.kind === "absolute" ? absDelta : ratio;

  if (item.rule.kind === "max-extra") {
    const extra = candidateValue - sourceValue;
    score = extra;
    ratio = sourceValue === 0 ? candidateValue : extra / Math.max(1, Math.abs(sourceValue));
  }

  const status =
    item.rule.absolutePass !== undefined && absDelta <= item.rule.absolutePass
      ? "pass"
      : score > item.rule.fail
        ? "fail"
        : score > item.rule.warn
          ? "warn"
          : "pass";
  return {
    id: item.path,
    label: item.label,
    source: round(sourceValue),
    candidate: round(candidateValue),
    delta: round(delta),
    ratio: Number.isFinite(ratio) ? round(ratio) : "Infinity",
    status,
    rule: item.rule
  };
}

function compareInvariant(source, candidate, item) {
  const sourceValue = getByPath(source, item.path);
  const candidateValue = getByPath(candidate, item.path);
  const expectedMaximum = item.expectedMaximum;
  const numericCandidate = Number(candidateValue ?? 0);
  const status = numericCandidate > expectedMaximum ? "fail" : "pass";
  return {
    id: item.path,
    label: item.label,
    source: sourceValue,
    candidate: candidateValue,
    expectedMaximum,
    status
  };
}

function recommendNextStage({failCount, warnCount, candidate}) {
  const missingPackFields = candidate.pack?.missingRequiredPackFields || [];
  if (Math.abs((candidate.grid?.precipitation?.mean || 0) - 0) > 0 && candidate.grid?.precipitation?.mean > 30) {
    return "进入阶段 3：当前 grid 与高度主体已经对齐，但温度/降水仍明显偏离 source，必须先恢复 grid features、湖泊预处理、地图坐标、温度和降水，再进入 reGraph。";
  }
  if (candidate.validation?.packMappingOneToOne || !candidate.validation?.packHasVoronoi) {
    return "进入阶段 4：当前 grid、高度与降水主链路已到可验收范围，必须恢复 reGraph() pack 重建，消除一比一 pack 映射。";
  }
  if (candidate.pack?.havenCells === 0 || missingPackFields.includes("pack.cells.haven")) {
    return "进入阶段 5：pack Voronoi 已建立，下一步复刻 Features.markupPack()、haven、harbor 和 feature groups。";
  }
  if (missingPackFields.some(field => ["pack.cells.fl", "pack.cells.r", "pack.cells.conf"].includes(field)) || (candidate.rivers?.count || 0) < 100) {
    return "进入阶段 6：pack features 与 haven/harbor 已建立，下一步复刻河流和湖泊水文，生成 pack.cells.fl/r/conf 与 source 同量级河网。";
  }
  if (missingPackFields.includes("pack.cells.s")) {
    return "进入阶段 7：河流基础字段之后，复刻生物群系和人口评分，生成 pack.cells.s/pop。";
  }
  if (failCount && (candidate.society?.burgs || 0) < 100) {
    if (String(candidate.metadata?.generatorStage || "").includes("stage-8")) {
      return "进入阶段 9：文化已经迁移到 pack 语义图，下一步复刻 Burgs.generate，在 pack population、culture、river、haven/harbor 基础上恢复城市和港口数量级。";
    }
    return "进入阶段 8：pack 生物群系和人口评分已建立，下一步将文化生成与扩张迁移到 pack 语义图，再为城市阶段提供可靠人口基础。";
  }
  if (failCount && String(candidate.metadata?.generatorStage || "").includes("stage-9")) {
    return "进入阶段 10：城市和港口已经回到 source 同量级，下一步复刻 States.generate，让国家来自 capital burgs 并迁移到 pack 语义图。";
  }
  if (failCount && String(candidate.metadata?.generatorStage || "").includes("stage-10")) {
    return "进入阶段 11：国家已经来自 capital burgs 并迁移到 pack 语义图，下一步复刻 Provinces.generate，让省份来自 burg/state/religion 并提升省份数量级。";
  }
  if (failCount && String(candidate.metadata?.generatorStage || "").includes("stage-11")) {
    return "进入阶段 12：省份已经迁移到 pack 语义图，下一步复刻 Routes.generate，恢复主路、小路和海路。";
  }
  if (failCount && String(candidate.metadata?.generatorStage || "").includes("stage-12")) {
    return "进入阶段 13：路线和海路已经恢复 source 同量级，下一步复刻 Religions.generate，将宗教迁移到 pack 语义图。";
  }
  if (!failCount && warnCount && String(candidate.metadata?.generatorStage || "").includes("stage-13")) {
    return "阶段 13 宗教已通过当前强制 case；下一步单独收紧温度最低值 warn，并继续补齐 source 后段的命名、军事、区域等专题。";
  }
  if (hasLateStageGaps(candidate)) {
    return "进入阶段 18：主生成矩阵已经通过，当前差异来自 source 后段专题。下一步先复刻 Burgs.specify、States.defineStateForms、Rivers.specify、Lakes.defineNames、Military.generate、Markers.generate 和 Zones.generate 的字段产物。";
  }
  if (failCount) return "继续当前阶段整改，先消除 fail 项，再推进下一阶段。";
  if (String(candidate.metadata?.generatorStage || "").includes("stage-14")) {
    return "当前强制 case 已全项通过；下一步可扩大模板/seed 矩阵回归，并补齐 source 后段的命名、军事、区域、marker 细节和统计字段。";
  }
  return "当前 case 达到阶段 0 对照要求，可推进下一阶段。";
}

function hasLateStageGaps(candidate) {
  const late = candidate.lateStages || {};
  return (
    !late.names ||
    !late.military ||
    !late.markers ||
    !late.zones ||
    Number(late.names?.stateFullNames || 0) === 0 ||
    Number(late.military?.regiments || 0) === 0 ||
    Number(late.zones?.total || 0) === 0
  );
}

function renderMarkdown(diff) {
  const lines = [];
  lines.push("# Source / Candidate 对照差异");
  lines.push("");
  lines.push(`生成时间：${diff.metadata.generatedAt}`);
  lines.push(`模板：\`${diff.metadata.template}\``);
  lines.push(`Seed：\`${diff.metadata.seed}\``);
  lines.push(`目标 cells：${diff.metadata.cellsTarget}`);
  lines.push(`状态：${diff.metadata.status}（fail ${diff.metadata.failCount}，warn ${diff.metadata.warnCount}）`);
  lines.push("");
  lines.push("## 关键指标");
  lines.push("");
  lines.push("| 指标 | source | candidate | delta | ratio | 状态 |");
  lines.push("|---|---:|---:|---:|---:|---|");
  for (const item of diff.metrics) {
    lines.push(`| ${item.label} | ${item.source} | ${item.candidate} | ${item.delta} | ${item.ratio} | ${item.status} |`);
  }
  lines.push("");
  lines.push("## 不变量");
  lines.push("");
  lines.push("| 检查 | source | candidate | 上限 | 状态 |");
  lines.push("|---|---:|---:|---:|---|");
  for (const item of diff.invariants) {
    lines.push(`| ${item.label} | ${item.source} | ${item.candidate} | ${item.expectedMaximum} | ${item.status} |`);
  }
  lines.push("");
  lines.push("## Candidate 特有检查");
  lines.push("");
  lines.push("| 检查 | candidate | 状态 | 说明 |");
  lines.push("|---|---:|---|---|");
  for (const item of diff.candidateSpecific) {
    lines.push(`| ${item.label} | ${item.candidate} | ${item.status} | ${item.message} |`);
  }
  lines.push("");
  if (diff.missingRequiredPackFields.length) {
    lines.push("## 缺失 pack 字段");
    lines.push("");
    for (const field of diff.missingRequiredPackFields) lines.push(`- \`${field}\``);
    lines.push("");
  }
  lines.push("## 下一步建议");
  lines.push("");
  lines.push(diff.nextStageRecommendation);
  return `${lines.join("\n")}\n`;
}

function getByPath(object, path) {
  return path.split(".").reduce((value, key) => (value == null ? undefined : value[key]), object);
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
  return Math.round((Number(value) || 0) * 1000) / 1000;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
