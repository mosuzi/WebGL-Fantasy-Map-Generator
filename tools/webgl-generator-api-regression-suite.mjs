#!/usr/bin/env node
import {spawnSync} from "node:child_process";
import {mkdirSync, writeFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {performance} from "node:perf_hooks";

import {runGateSequence} from "./regression-gate-runner.mjs";

const toolsDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(toolsDir, "..");
const args = parseArgs(process.argv.slice(2));
const browserChannel = String(args["browser-channel"] || args.channel || "chrome");
const outPath = resolve(args.out || resolve(rootDir, "docs", "generated", "reports", "api-regression-suite-results.json"));
const markdownPath = resolve(args.markdown || resolve(rootDir, "docs", "generated", "reports", "api-regression-suite-results.md"));
const gates = [
  {id: "api-inventory", label: "API 能力盘点与三方覆盖", filename: "webgl-generator-api-capability-inventory-regression.mjs", kind: "code"},
  {id: "api-edit-coverage", label: "既有编辑命令 API 覆盖", filename: "webgl-generator-api-edit-coverage-regression.mjs", kind: "code"},
  {id: "api-action-convergence", label: "UI 与 API 公共 action", filename: "webgl-generator-api-action-convergence-regression.mjs", kind: "code"},
  {id: "api-operation", label: "异步 operation 与错误事务", filename: "webgl-generator-api-operation-regression.mjs", kind: "code"},
  {id: "api-data-compatibility", label: "旧数据兼容与完整往返", filename: "webgl-generator-api-data-compatibility-regression.mjs", kind: "code"},
  {id: "api-stability", label: "稳定版本与扩展契约", filename: "webgl-generator-api-stability-contract-regression.mjs", kind: "code"},
  {id: "api-capabilities", label: "公开能力与 UI / API 共路径浏览器验收", filename: "webgl-generator-api-capabilities-regression.mjs", kind: "browser"},
  {id: "api-roundtrip", label: "完整地图浏览器往返与失败恢复", filename: "webgl-generator-api-roundtrip-regression.mjs", kind: "browser"},
  {id: "api-geo", label: "GEO 与 Cells GEO 浏览器导入", filename: "webgl-generator-api-geo-regression.mjs", kind: "browser"},
  {id: "api-exports", label: "备注与测量浏览器导出", filename: "webgl-generator-api-export-records-regression.mjs", kind: "browser"},
  {id: "api-namebases", label: "名称库文档浏览器往返", filename: "webgl-generator-api-namebase-docs-regression.mjs", kind: "browser"},
  {id: "api-namebase-renames", label: "名称库批量改名浏览器验收", filename: "webgl-generator-api-namebase-renames-regression.mjs", kind: "browser"}
];

mkdirSync(dirname(outPath), {recursive: true});
mkdirSync(dirname(markdownPath), {recursive: true});
const started = performance.now();
const sequence = runGateSequence(gates, gate => {
  const childArgs = ["--no-warnings", resolve(toolsDir, gate.filename)];
  if (gate.kind === "browser") childArgs.push("--browser-channel", browserChannel);
  return spawnSync(process.execPath, childArgs, {
    cwd: rootDir,
    env: {...process.env, CI: "true"},
    stdio: "inherit"
  });
}, {
  onStart(gate, index, total) {
    console.log(`\n[API 聚合门禁 ${index + 1}/${total}] ${gate.label}`);
  },
  onFinish(step) {
    if (step.status === "failed") console.error(`[API 聚合门禁失败] ${step.label}，退出码 ${step.exitCode}`);
  }
});

const report = {
  suite: "webgl-generator-api-regression",
  generatedAt: new Date().toISOString(),
  ok: sequence.failureCode === 0,
  browserChannel,
  durationMs: round(performance.now() - started),
  summary: summarize(sequence.steps),
  steps: sequence.steps
};
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
writeFileSync(markdownPath, renderMarkdown(report), "utf8");
console.log(`\n${JSON.stringify(report, null, 2)}`);
console.log(`Wrote ${outPath}`);
console.log(`Wrote ${markdownPath}`);
if (sequence.failureCode) process.exitCode = sequence.failureCode;

function summarize(steps) {
  return {
    total: steps.length,
    passed: steps.filter(step => step.status === "passed").length,
    failed: steps.filter(step => step.status === "failed").length,
    skipped: steps.filter(step => step.status === "skipped").length,
    code: steps.filter(step => step.kind === "code" && step.status === "passed").length,
    browser: steps.filter(step => step.kind === "browser" && step.status === "passed").length
  };
}

function renderMarkdown(report) {
  const lines = [
    "# API 聚合门禁报告",
    "",
    `- 生成时间：${report.generatedAt}`,
    `- 浏览器通道：\`${report.browserChannel}\``,
    `- 结论：${report.ok ? "通过" : "失败"}`,
    `- 总耗时：${report.durationMs} ms`,
    `- 通过 / 失败 / 跳过：${report.summary.passed} / ${report.summary.failed} / ${report.summary.skipped}`,
    "",
    "| 步骤 | 类型 | 状态 | 耗时 ms | 退出码 |",
    "|---|---|---|---:|---:|"
  ];
  for (const step of report.steps) {
    lines.push(`| ${step.label} | ${step.kind === "browser" ? "浏览器" : "代码"} | ${statusLabel(step.status)} | ${step.durationMs} | ${step.exitCode ?? "-"} |`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function statusLabel(status) {
  if (status === "passed") return "通过";
  if (status === "failed") return "失败";
  return "已跳过";
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--" || !arg.startsWith("--")) continue;
    const [key, inlineValue] = arg.slice(2).split("=");
    parsed[key] = inlineValue ?? argv[++index] ?? true;
  }
  return parsed;
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
