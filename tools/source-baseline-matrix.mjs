#!/usr/bin/env node
import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {spawn, spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const args = parseArgs(process.argv.slice(2));
const mode = args.mode || "quick";
const port = Number(args.port || 5301);
const browserChannel = args["browser-channel"] || args.channel || null;
const timeoutMs = Number(args.timeout || 180000);
const outRoot = resolve(args.outDir || args["out-dir"] || join(rootDir, "docs", "generated", "source-baselines"));
const refresh = Boolean(args.refresh);
const reuseServer = Boolean(args["reuse-server"]);

const cases = buildCases(mode);
const results = [];
let sharedServer = null;

mkdirSync(outRoot, {recursive: true});

try {
  const sharedUrl = reuseServer ? await startSharedSourceServer({port, timeoutMs}) : null;

  for (const [index, item] of cases.entries()) {
    const caseName = `${item.template}-${item.cells}-${item.seed}`;
    const caseDir = join(outRoot, caseName);
    const summaryPath = join(caseDir, "source-summary.json");

    if (!refresh && existsSync(summaryPath)) {
      console.log(`Skip existing source baseline: ${caseName}`);
    } else {
      runCase({item, caseDir, casePort: port + index, sharedUrl});
    }

    const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
    results.push(toMatrixRow(summary, caseName));
  }
} finally {
  if (sharedServer) stopDevServer(sharedServer);
}

const matrix = {
  metadata: {
    generatedAt: new Date().toISOString(),
    mode,
    cases: results.length,
    outRoot
  },
  cases: results
};

writeFileSync(join(outRoot, "matrix.json"), `${JSON.stringify(matrix, null, 2)}\n`, "utf8");
writeFileSync(join(outRoot, "matrix.md"), renderMarkdown(matrix), "utf8");
console.log(`Wrote source baseline matrix to ${join(outRoot, "matrix.json")}`);
console.log(`Wrote source baseline report to ${join(outRoot, "matrix.md")}`);

function runCase({item, caseDir, casePort, sharedUrl}) {
  console.log(`Run source baseline: ${item.template}, ${item.cells}, ${item.seed}`);
  const command = [
    join(rootDir, "tools", "source-export-baseline.mjs"),
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
  if (sharedUrl) command.push("--url", sharedUrl);
  else command.push("--port", String(casePort));
  if (browserChannel) command.push("--browser-channel", browserChannel);

  const result = spawnSync(process.execPath, command, {
    cwd: rootDir,
    stdio: "inherit"
  });
  if (result.status !== 0) throw new Error(`source baseline case failed: ${item.template}/${item.cells}/${item.seed}`);
}

async function startSharedSourceServer({port, timeoutMs}) {
  const url = `http://127.0.0.1:${port}`;
  console.log(`Start shared source dev server: ${url}`);
  sharedServer = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: sourceDir,
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32"
  });
  sharedServer.stdout.on("data", chunk => process.stdout.write(chunk));
  sharedServer.stderr.on("data", chunk => process.stderr.write(chunk));
  await waitForHttp(url, timeoutMs);
  return url;
}

function stopDevServer(child) {
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
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite 启动期间连接失败是正常情况。
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  fail(`Timed out waiting for ${url}`);
}

function buildCases(selectedMode) {
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

function toMatrixRow(summary, caseName) {
  return {
    caseName,
    seed: summary.metadata.seed,
    template: summary.metadata.template,
    cellsTarget: summary.metadata.cellsTarget,
    gridCells: summary.grid.cells,
    packCells: summary.pack.cells,
    landRatio: summary.grid.landRatio,
    gridAvgDegree: summary.grid.avgDegree,
    packAvgDegree: summary.pack.avgDegree,
    features: summary.features.total,
    lakes: summary.features.lakes,
    rivers: summary.rivers.count,
    burgs: summary.society.burgs,
    ports: summary.society.ports,
    states: summary.society.states,
    routes: summary.routes.total,
    roads: summary.routes.roads,
    trails: summary.routes.trails,
    searoutes: summary.routes.searoutes,
    landRouteWaterCells: summary.routes.landRouteWaterCells,
    seaRouteLandCells: summary.routes.seaRouteLandCells,
    invalidPackGridRefs: summary.pack.packGridRefsInvalid,
    invalidHavens: summary.validation.havenInvalidCount,
    harborMismatch: summary.validation.harborMismatchCount,
    routeLinkAsymmetry: summary.validation.routeLinkAsymmetry
  };
}

function renderMarkdown(matrix) {
  const lines = [];
  lines.push("# Source baseline 矩阵");
  lines.push("");
  lines.push(`生成时间：${matrix.metadata.generatedAt}`);
  lines.push(`模式：${matrix.metadata.mode}`);
  lines.push(`样例数：${matrix.metadata.cases}`);
  lines.push("");
  lines.push("## 汇总");
  lines.push("");
  lines.push(
    "| case | 模板 | cells | grid | pack | 陆地比 | 河流 | 城市 | 港口 | 国家 | 路线 | 陆路穿水 | 海路中段穿陆 |"
  );
  lines.push("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const item of matrix.cases) {
    lines.push(
      `| ${item.caseName} | ${item.template} | ${item.cellsTarget} | ${item.gridCells} | ${item.packCells} | ${item.landRatio} | ${item.rivers} | ${item.burgs} | ${item.ports} | ${item.states} | ${item.routes} | ${item.landRouteWaterCells} | ${item.seaRouteLandCells} |`
    );
  }
  lines.push("");
  lines.push("## 结构检查");
  lines.push("");
  lines.push("| case | pack 引用错误 | haven 错误 | harbor 不一致 | route 非双向 |");
  lines.push("|---|---:|---:|---:|---:|");
  for (const item of matrix.cases) {
    lines.push(
      `| ${item.caseName} | ${item.invalidPackGridRefs} | ${item.invalidHavens} | ${item.harborMismatch} | ${item.routeLinkAsymmetry} |`
    );
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
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

function fail(message) {
  console.error(message);
  process.exit(1);
}
