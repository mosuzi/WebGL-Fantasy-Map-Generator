#!/usr/bin/env node
import {createServer} from "node:http";
import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, resolve} from "node:path";

const args = new Map(process.argv.slice(2).map(value => {
  const [key, raw = "true"] = value.replace(/^--/, "").split("=", 2);
  return [key, raw];
}));
const host = args.get("host") || "127.0.0.1";
const port = Number(args.get("port") || 5411);
const outputPath = resolve(args.get("out") || "docs/generated/interaction-audit/unified-browser-evidence.json");
const report = args.has("reset") || !existsSync(outputPath)
  ? {schemaVersion: 1, generatedAt: new Date().toISOString(), cases: []}
  : JSON.parse(readFileSync(outputPath, "utf8"));

mkdirSync(dirname(outputPath), {recursive: true});
writeReport();

const server = createServer(async (request, response) => {
  response.setHeader("access-control-allow-origin", "http://127.0.0.1:5410");
  response.setHeader("access-control-allow-headers", "content-type");
  response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }
  if (request.method === "GET" && request.url === "/status") {
    respondJson(response, 200, summary());
    return;
  }
  if (request.method !== "POST" || request.url !== "/evidence") {
    respondJson(response, 404, {ok: false, error: "not-found"});
    return;
  }
  try {
    const body = await readBody(request);
    const evidence = JSON.parse(body);
    if (!evidence?.caseId || !evidence?.suite) throw new Error("证据缺少 caseId 或 suite");
    const index = report.cases.findIndex(item => item.caseId === evidence.caseId);
    if (index >= 0) report.cases[index] = evidence;
    else report.cases.push(evidence);
    report.generatedAt = new Date().toISOString();
    writeReport();
    respondJson(response, 200, {ok: true, ...summary()});
  } catch (error) {
    respondJson(response, 400, {ok: false, error: error instanceof Error ? error.message : String(error)});
  }
});

server.listen(port, host, () => {
  console.log(JSON.stringify({ok: true, host, port, outputPath, ...summary()}, null, 2));
});

function writeReport() {
  report.cases.sort((a, b) => String(a.caseId).localeCompare(String(b.caseId)));
  report.totals = summary();
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function summary() {
  return {
    cases: report.cases.length,
    main: report.cases.filter(item => item.suite === "main").length,
    visual: report.cases.filter(item => item.suite === "visual").length,
    passed: report.cases.filter(item => item.ok).length,
    failed: report.cases.filter(item => !item.ok).length
  };
}

function respondJson(response, status, body) {
  response.writeHead(status, {"content-type": "application/json; charset=utf-8"});
  response.end(`${JSON.stringify(body)}\n`);
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 8 * 1024 * 1024) throw new Error("证据正文超过 8 MiB");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
