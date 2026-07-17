#!/usr/bin/env node
import {existsSync, mkdirSync, rmSync, writeFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {createMapFeatureGeoJson, createMapGeoJson} from "../app/webgl-generator/src/runtime/map-file-io.js";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const defaultQgis = join(rootDir, "work", "qgis-portable", "QGIS 3.44.12", "bin", "qgis_process-qgis-ltr.bat");
const qgisProcess = resolve(String(args["qgis-process"] || defaultQgis));
const ogrinfo = resolve(args.ogrinfo || join(dirname(qgisProcess), "ogrinfo.exe"));
const artifactDir = resolve(args.artifacts || join(rootDir, "docs", "generated", "gis", "geojson-range"));
const outPath = resolve(args.out || join(rootDir, "docs", "generated", "reports", "geojson-range-qgis-regression-results.json"));

if (!existsSync(qgisProcess)) fail(`找不到 qgis_process：${qgisProcess}`);
if (!existsSync(ogrinfo)) fail(`找不到 ogrinfo：${ogrinfo}`);
mkdirSync(artifactDir, {recursive: true});
mkdirSync(dirname(outPath), {recursive: true});

const map = generatePlaceholderMap({
  seed: "geojson-range-qgis",
  heightmapTemplate: "continents",
  cellsTarget: 5000,
  graphWidth: 1440,
  graphHeight: 960,
  randomSeed: false
});
const range = {mode: "bbox", bbox: [360, 240, 1080, 720]};
const documents = [
  {
    id: "pack",
    geometry: "Polygon",
    document: createMapGeoJson(map, {range})
  },
  {
    id: "political-dissolved",
    geometry: "Multi Polygon",
    document: createMapFeatureGeoJson(map, {
      range,
      dissolvePolitical: true,
      layers: {state: true, province: true, city: false, route: false, river: false, marker: false, zone: true}
    })
  },
  {
    id: "network-lines",
    geometry: "Line String",
    expectedFields: ["networkSchema", "networkSchemaVersion", "displayName", "typeCode", "typeLabel", "levelCode", "levelLabel", "lengthWorld", "lengthUnit", "segmentCount", "gridCellCount", "packCellCount"],
    document: createMapFeatureGeoJson(map, {
      range,
      layers: {state: false, province: false, city: false, route: true, river: true, marker: false, zone: false}
    })
  }
];

const version = run(qgisProcess, ["--version"]).stdout.trim();
const results = [];
for (const item of documents) {
  const source = join(artifactDir, `${item.id}.geojson`);
  const output = join(artifactDir, `${item.id}.gpkg`);
  writeFileSync(source, `${JSON.stringify(item.document)}\n`, "utf8");
  rmSync(output, {force: true});
  const save = run(qgisProcess, [
    "run", "native:savefeatures", "--",
    `INPUT=${source}`,
    `OUTPUT=${output}`,
    `LAYER_NAME=${item.id.replaceAll("-", "_")}`
  ]);
  const diagnostics = `${save.stdout}\n${save.stderr}`;
  if (/\b(?:warning|error)\b/i.test(diagnostics)) fail(`${item.id} QGIS 读取出现告警：\n${diagnostics}`);
  if (!existsSync(output)) fail(`${item.id} QGIS 没有生成 GeoPackage`);
  const info = run(ogrinfo, ["-ro", "-al", "-so", output]).stdout;
  const featureCount = Number(info.match(/Feature Count:\s*(\d+)/)?.[1] || 0);
  if (featureCount !== item.document.features.length) fail(`${item.id} QGIS Feature Count ${featureCount} != ${item.document.features.length}`);
  if (!new RegExp(`Geometry:\\s*${item.geometry}`).test(info)) fail(`${item.id} QGIS 几何类型不是 ${item.geometry}`);
  for (const field of item.expectedFields || []) if (!new RegExp(`^${field}:`, "m").test(info)) fail(`${item.id} QGIS 字段表缺少 ${field}`);
  results.push({
    id: item.id,
    source,
    output,
    featureCount,
    geometry: item.geometry,
    exportRange: item.document.properties.exportRange,
    warnings: 0,
    fields: item.expectedFields || []
  });
}

const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  qgis: {version, qgisProcess, ogrinfo},
  map: {gridCells: map.grid.points.length, packCells: map.pack.cells.i.length},
  results
};
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
