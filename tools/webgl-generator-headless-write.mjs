#!/usr/bin/env node
import {createHash} from "node:crypto";
import {readFile, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {gunzipSync, gzipSync} from "node:zlib";
import {createHeadlessWriteSession, loadHeadlessWriteDocument} from "../app/webgl-generator/src/runtime/headless-write-api.js";
import {stringifyMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {isCompressedMapDocumentFilename} from "../app/webgl-generator/src/runtime/map-filename.js";

const options = parseArguments(process.argv.slice(2));

try {
  if (options.command === "inspect") await inspect();
  else if (options.command === "apply") await apply();
  else if (options.command === "verify") await verify();
  else throw cliError("headless_cli_usage", "命令必须是 inspect、apply 或 verify");
} catch (error) {
  process.stderr.write(`${JSON.stringify({ok: false, error: {code: error.code || "headless_write_cli_error", message: error.message || String(error), ...(error.details ? {details: error.details} : {})}})}\n`);
  process.exitCode = 1;
}

async function inspect() {
  requireValue(options.input, "inspect 必须提供输入文件");
  requireValue(options.method, "inspect 必须提供方法名");
  const session = await loadSession(options.input);
  const result = session.inspect(options.method, parseJsonArguments(options.arguments));
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 2;
}

async function apply() {
  requireValue(options.input, "apply 必须提供输入文件");
  requireValue(options.output, "apply 必须提供输出文件");
  requireValue(options.method, "apply 必须提供方法名");
  const inputPath = resolve(options.input);
  const outputPath = resolve(options.output);
  const overwriteInput = inputPath === outputPath;
  if (overwriteInput && (!options.overwrite || options.confirmOverwrite !== "OVERWRITE")) {
    throw cliError("headless_overwrite_confirmation_required", "覆盖输入文件必须同时提供 --overwrite --confirm-overwrite OVERWRITE");
  }
  const inputBytes = await readFile(inputPath);
  const inputHash = hash(inputBytes);
  const session = await loadSession(inputPath, inputBytes);
  const result = session.apply(options.method, parseJsonArguments(options.arguments), {
    documentId: options.documentId,
    expectedRevision: options.expectedRevision,
    inspectionToken: options.inspectionToken,
    requestId: options.requestId
  });
  if (!result.ok) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = 2;
    return;
  }
  const text = stringifyMapDocument(session.getDocument());
  const outputBytes = isCompressedMapDocumentFilename(outputPath) ? gzipSync(text) : Buffer.from(text);
  await writeFile(outputPath, outputBytes, {flag: overwriteInput ? "w" : "wx"});
  const inputAfterHash = hash(await readFile(inputPath));
  if (!overwriteInput && inputAfterHash !== inputHash) throw cliError("headless_input_changed", "写出期间输入文件发生变化");
  const verified = await loadSession(outputPath);
  const response = {
    ...result,
    output: {
      path: outputPath,
      bytes: outputBytes.length,
      sha256: hash(outputBytes),
      documentId: verified.documentId,
      revision: verified.revision,
      inputUnchanged: overwriteInput ? null : inputAfterHash === inputHash
    }
  };
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

async function verify() {
  requireValue(options.input, "verify 必须提供输入文件");
  const bytes = await readFile(options.input);
  const session = await loadSession(options.input, bytes);
  const summary = session.getReadApi().info.mapSummary();
  process.stdout.write(`${JSON.stringify({ok: true, data: {path: resolve(options.input), bytes: bytes.length, sha256: hash(bytes), documentId: session.documentId, revision: session.revision, mapSummary: summary.data, history: session.history.getStats()}})}\n`);
}

async function loadSession(file, bytes = null) {
  const source = bytes || await readFile(file);
  const text = isCompressedMapDocumentFilename(file) ? gunzipSync(source).toString("utf8") : source.toString("utf8");
  return createHeadlessWriteSession(loadHeadlessWriteDocument(text));
}

function parseArguments(args) {
  const command = args[0] || "";
  const result = {command};
  let optionStart = 0;
  if (command === "inspect") {
    [result.input, result.method, result.arguments = "[]"] = args.slice(1, 4);
    optionStart = 4;
  } else if (command === "apply") {
    [result.input, result.output, result.method, result.arguments = "[]"] = args.slice(1, 5);
    optionStart = 5;
  } else if (command === "verify") {
    result.input = args[1];
    optionStart = 2;
  }
  for (let index = optionStart; index < args.length; index += 1) {
    const key = args[index];
    if (key === "--document-id") result.documentId = args[++index];
    else if (key === "--expected-revision") result.expectedRevision = Number(args[++index]);
    else if (key === "--inspection-token") result.inspectionToken = args[++index];
    else if (key === "--request-id") result.requestId = args[++index];
    else if (key === "--overwrite") result.overwrite = true;
    else if (key === "--confirm-overwrite") result.confirmOverwrite = args[++index];
    else throw cliError("headless_cli_option", `未知参数：${key}`);
  }
  return result;
}

function parseJsonArguments(value) {
  let parsed;
  try {
    parsed = JSON.parse(value || "[]");
  } catch (error) {
    throw cliError("headless_arguments_invalid", `arguments 不是有效 JSON：${error.message}`);
  }
  if (!Array.isArray(parsed)) throw cliError("headless_arguments_invalid", "arguments 必须是 JSON 数组");
  return parsed;
}

function requireValue(value, message) {
  if (!String(value || "").trim()) throw cliError("headless_cli_usage", message);
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function cliError(code, message, details = undefined) {
  const error = new Error(message);
  error.code = code;
  if (details) error.details = details;
  return error;
}
