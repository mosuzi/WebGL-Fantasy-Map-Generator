#!/usr/bin/env node
import assert from "node:assert/strict";
import {createReadStream, existsSync, statSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {dirname, extname, join, normalize, resolve, sep} from "node:path";
import {fileURLToPath} from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const distDir = join(rootDir, "dist", "webgl-generator");
const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const host = "127.0.0.1";
const timeoutMs = 120000;
const configuredBaseUrl = String(process.env.FMG_PROTOTYPE_BASE_URL || "").replace(/\/$/, "");

assert.ok(configuredBaseUrl || existsSync(distDir), `构建产物不存在：${distDir}`);
const server = configuredBaseUrl ? null : await startStaticServer();
let browser;

try {
  const baseUrl = configuredBaseUrl || `http://${host}:${server.address().port}`;
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  const reports = [];
  for (const laboratory of [
    {path: "/prototype/boundary-topology-lab/", api: "boundaryTopologyLab", fixtureSelector: "#fixture-list [data-fixture]", additionalSelector: "#algorithm-list [data-algorithm]", matrixSelector: "#result-grid .result-item", workbenchTab: "拓扑回归", blendFixtureSelector: "#blend-fixture-list [data-blend-fixture]", expected: {fixtures: 20, additionalCases: 7, matrix: 20, blendFixtures: 4}},
    {path: "/prototype/river-network-lab/", api: "riverNetworkLab", fixtureSelector: "#fixture-list [data-case]", additionalSelector: "#generated-list [data-case]", matrixSelector: "#matrix .matrix-item", expected: {fixtures: 8, additionalCases: 3, matrix: 8}}
  ]) {
    const context = await browser.newContext({viewport: {width: 1280, height: 820}});
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    const consoleErrors = [];
    const pageErrors = [];
    page.on("console", message => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.goto(`${baseUrl}${laboratory.path}`, {waitUntil: "networkidle"});
    await page.waitForFunction(({fixtureSelector, api}) => document.querySelectorAll(fixtureSelector).length > 0 && Boolean(window[api]), laboratory);
    if (laboratory.workbenchTab) await page.getByRole("tab", {name: laboratory.workbenchTab, exact: true}).click();
    await page.getByRole("button", {name: /运行全部/}).click();
    await page.waitForFunction(selector => document.querySelectorAll(selector).length > 0, laboratory.matrixSelector);
    const state = await page.evaluate(({fixtureSelector, additionalSelector, matrixSelector, blendFixtureSelector, api}) => ({
      fixtures: document.querySelectorAll(fixtureSelector).length,
      additionalCases: document.querySelectorAll(additionalSelector).length,
      matrix: document.querySelectorAll(matrixSelector).length,
      blendFixtures: blendFixtureSelector ? document.querySelectorAll(blendFixtureSelector).length : undefined,
      apiReady: Boolean(window[api]),
      appSourceRequests: performance.getEntriesByType("resource").map(entry => entry.name).filter(name => name.includes("/app/webgl-generator/src/"))
    }), laboratory);
    const actualCounts = {fixtures: state.fixtures, additionalCases: state.additionalCases, matrix: state.matrix};
    if (laboratory.blendFixtureSelector) actualCounts.blendFixtures = state.blendFixtures;
    assert.deepEqual(actualCounts, laboratory.expected, `${laboratory.path} 固定用例或矩阵数量漂移`);
    assert.equal(state.apiReady, true, `${laboratory.path} 实验室 API 没有初始化`);
    assert.deepEqual(state.appSourceRequests, [], `${laboratory.path} 仍请求未部署的正式源码`);
    assert.deepEqual(consoleErrors, [], `${laboratory.path} 出现 console error`);
    assert.deepEqual(pageErrors, [], `${laboratory.path} 出现 page error`);
    reports.push({path: laboratory.path, ...state, consoleErrors: 0, pageErrors: 0});
    await context.close();
  }
  console.log(JSON.stringify({ok: true, baseUrl, reports}, null, 2));
} finally {
  if (browser) await browser.close();
  if (server) await new Promise(done => server.close(done));
}

async function startStaticServer() {
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url || "/", `http://${host}`).pathname);
    const route = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
    const target = resolve(distDir, `.${normalize(route)}`);
    if (!target.startsWith(`${distDir}${sep}`) || !existsSync(target) || statSync(target).isDirectory()) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, {"content-type": contentType(target), "cache-control": "no-store"});
    createReadStream(target).pipe(response);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, resolve);
  });
  return server;
}

function contentType(file) {
  return ({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png"
  })[extname(file).toLowerCase()] || "application/octet-stream";
}
