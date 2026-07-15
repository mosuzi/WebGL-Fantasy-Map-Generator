#!/usr/bin/env node
import {existsSync, mkdirSync, rmSync, writeFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const qgisProcess = resolve(String(args["qgis-process"] || ""));
const ogrinfo = resolve(args.ogrinfo || join(dirname(qgisProcess), "ogrinfo.exe"));
const artifactDir = resolve(args.artifacts || join(rootDir, "docs", "generated", "gis", "political-100k"));
const outPath = resolve(args.out || join(rootDir, "docs", "generated", "reports", "political-gis-qgis-regression-results.json"));

if (!existsSync(qgisProcess)) fail(`找不到 qgis_process：${qgisProcess}`);
if (!existsSync(ogrinfo)) fail(`找不到 ogrinfo：${ogrinfo}`);
mkdirSync(dirname(outPath), {recursive: true});

const version = run(qgisProcess, ["--version"]).stdout.trim();
const cases = [
  {id: "raw", source: join(artifactDir, "political-100k-raw.geojson"), output: join(artifactDir, "qgis-political-100k-raw.gpkg"), layer: "political_raw"},
  {id: "dissolved", source: join(artifactDir, "political-100k-dissolved.geojson"), output: join(artifactDir, "qgis-political-100k-dissolved.gpkg"), layer: "political_dissolved"}
];
const results = [];
for (const item of cases) {
  if (!existsSync(item.source)) fail(`缺少浏览器下载产物：${item.source}`);
  rmSync(item.output, {force: true});
  const save = run(qgisProcess, [
    "run", "native:savefeatures", "--",
    `INPUT=${item.source}`,
    `OUTPUT=${item.output}`,
    `LAYER_NAME=${item.layer}`
  ]);
  const diagnostics = `${save.stdout}\n${save.stderr}`;
  if (/\b(?:warning|error)\b/i.test(diagnostics)) fail(`${item.id} QGIS 读取出现告警：\n${diagnostics}`);
  if (!existsSync(item.output)) fail(`${item.id} QGIS 没有生成 GeoPackage`);
  const info = run(ogrinfo, ["-ro", "-al", "-so", item.output]).stdout;
  const featureCount = Number(info.match(/Feature Count:\s*(\d+)/)?.[1] || 0);
  if (featureCount !== 611) fail(`${item.id} QGIS Feature Count ${featureCount} != 611`);
  if (!/Geometry:\s*Multi Polygon/.test(info)) fail(`${item.id} QGIS 几何类型不是 Multi Polygon`);
  for (const field of ["layer: String", "id: String", "numericId: Integer", "attacker: Integer", "defender: Integer", "dissolved: Integer\(Boolean\)"]) {
    if (!info.includes(field)) fail(`${item.id} QGIS 缺少字段：${field}`);
  }
  results.push({id: item.id, source: item.source, output: item.output, layer: item.layer, featureCount, geometry: "Multi Polygon", warnings: 0});
}

const report = {ok: true, generatedAt: new Date().toISOString(), qgis: {version, qgisProcess, ogrinfo}, results};
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));

function run(command, commandArgs) {
  const bat = command.toLowerCase().endsWith(".bat");
  const executable = bat ? process.env.ComSpec || "cmd.exe" : command;
  const args = bat ? ["/d", "/c", "call", command, ...commandArgs] : commandArgs;
  const result = spawnSync(executable, args, {encoding: "utf8", windowsHide: true});
  if (result.error) fail(result.error.message);
  if (result.status !== 0) fail(`${command} 退出码 ${result.status}\n${result.stdout || ""}\n${result.stderr || ""}`);
  return result;
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith("--")) continue;
    const [key, inline] = argv[index].slice(2).split("=");
    parsed[key] = inline ?? argv[++index] ?? true;
  }
  return parsed;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
