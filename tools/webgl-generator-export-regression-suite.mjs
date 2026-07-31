#!/usr/bin/env node
import {spawnSync} from "node:child_process";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {performance} from "node:perf_hooks";

const toolsDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(toolsDir, "..");
const gates = [
  ["map-migration", "完整地图跨版本迁移", "webgl-generator-map-migration-regression.mjs"],
  ["diplomacy-export", "外交关系完整地图往返", "webgl-generator-diplomacy-export-regression.mjs"],
  ["map-import-diagnostics", "完整地图导入诊断", "webgl-generator-map-import-diagnostics-regression.mjs"],
  ["png-options", "PNG 显式选项", "webgl-generator-png-options-regression.mjs"],
  ["heightmap-png", "高度灰度 PNG", "webgl-generator-heightmap-export-regression.mjs"],
  ["geojson-range", "GeoJSON 范围导出与坐标参考", "webgl-generator-geojson-range-regression.mjs"],
  ["network-geojson", "路线与河流 GeoJSON 稳定属性", "webgl-generator-network-geojson-properties-regression.mjs"],
  ["dissolve-compatibility", "政治面 dissolve 外部兼容性", "webgl-generator-dissolve-compatibility-regression.mjs"],
  ["dissolve-performance", "政治面 dissolve 100k 性能", "webgl-generator-dissolve-performance-regression.mjs"]
];

const suiteStarted = performance.now();
const steps = [];
let failureCode = 0;
for (let index = 0; index < gates.length; index += 1) {
  const [id, label, filename] = gates[index];
  if (failureCode) {
    steps.push({id, label, status: "skipped", durationMs: 0, exitCode: null});
    continue;
  }

  console.log(`\n[导出回归 ${index + 1}/${gates.length}] ${label}`);
  const started = performance.now();
  const result = spawnSync(process.execPath, ["--no-warnings", resolve(toolsDir, filename)], {
    cwd: rootDir,
    env: {...process.env, CI: "true"},
    stdio: "inherit"
  });
  const exitCode = Number.isInteger(result.status) ? result.status : 1;
  const status = !result.error && exitCode === 0 ? "passed" : "failed";
  steps.push({id, label, status, durationMs: round(performance.now() - started), exitCode});
  if (status === "failed") {
    failureCode = exitCode || 1;
    if (result.error) console.error(`[导出回归失败] ${label}：${result.error.message}`);
    else if (result.signal) console.error(`[导出回归失败] ${label} 被信号 ${result.signal} 终止`);
    else console.error(`[导出回归失败] ${label} 退出码 ${exitCode}`);
  }
}

const report = {
  suite: "webgl-generator-export-regression",
  ok: failureCode === 0,
  durationMs: round(performance.now() - suiteStarted),
  steps
};
console.log(`\n${JSON.stringify(report, null, 2)}`);
if (failureCode) process.exitCode = failureCode;

function round(value) {
  return Math.round(value * 1000) / 1000;
}
