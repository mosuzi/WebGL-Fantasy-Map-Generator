#!/usr/bin/env node
import {readFile} from "node:fs/promises";
import {gunzipSync} from "node:zlib";
import {createHeadlessMapApi, loadHeadlessMapDocument} from "../app/webgl-generator/src/runtime/headless-map-api.js";

const [file, method = "info.mapSummary", rawArguments = "[]"] = process.argv.slice(2);
if (!file) {
  process.stderr.write(`${JSON.stringify({ok: false, error: {code: "headless_cli_error", message: "用法：node tools/webgl-generator-headless-api.mjs <map.json|map.json.gz> [method] [jsonArguments]"}})}\n`);
  process.exit(1);
}

try {
  const bytes = await readFile(file);
  const text = file.toLowerCase().endsWith(".gz") ? gunzipSync(bytes).toString("utf8") : bytes.toString("utf8");
  const api = createHeadlessMapApi(loadHeadlessMapDocument(text));
  const callable = method.split(".").reduce((value, key) => value?.[key], api);
  if (typeof callable !== "function") throw new Error(`未知或不允许的无头方法：${method}`);
  const args = JSON.parse(rawArguments);
  if (!Array.isArray(args)) throw new Error("jsonArguments 必须是 JSON 数组");
  const result = await callable(...args);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result?.ok) process.exitCode = 2;
} catch (error) {
  process.stderr.write(`${JSON.stringify({ok: false, error: {code: "headless_cli_error", message: error?.message || String(error)}})}\n`);
  process.exitCode = 1;
}
