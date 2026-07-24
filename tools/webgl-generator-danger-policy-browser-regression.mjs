#!/usr/bin/env node
import assert from "node:assert/strict";
import {createReadStream, existsSync, statSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {dirname, extname, join, normalize, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const distDir = join(rootDir, "dist", "webgl-generator");
const host = "127.0.0.1";
const port = 5499;
const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
assert.ok(existsSync(distDir), `构建产物不存在：${distDir}`);

const server = await startStaticServer();
let browser;
try {
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  const context = await browser.newContext({viewport: {width: 1280, height: 820}, deviceScaleFactor: 1});
  await context.addInitScript(() => localStorage.clear());
  const page = await context.newPage();
  page.setDefaultTimeout(180000);
  await page.goto(`http://${host}:${port}?healthClear=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 180000);
  const report = await page.evaluate(async () => {
    const api = window.webglGeneratorApi;
    unwrap(await api.generate.newMap({confirm: true, seed: "danger-policy-browser", cellsTarget: 1000}), "newMap");
    const app = window.__webglGeneratorApp;
    const stateId = app.map.politics.states.find(item => item && !item.removed && Number(item.id) > 0)?.id;
    if (!Number.isInteger(stateId)) throw new Error("缺少可删除国家");
    const before = JSON.stringify(app.map);
    const beforeHistory = unwrap(api.history.stats(), "history.before");
    const inspection = unwrap(api.edit.states.delete(stateId, {inspectOnly: true}), "states.delete.inspect");
    if (!inspection.inspectOnly || !inspection.preview?.requiresConfirm) throw new Error("国家删除预检结果异常");
    const denied = api.edit.states.delete(stateId);
    if (denied.ok !== false || denied.error?.code !== "confirmation_required" || !denied.error?.preview) {
      throw new Error(`国家删除未确认结果异常：${JSON.stringify(denied)}`);
    }
    if (JSON.stringify(app.map) !== before) throw new Error("未确认 API 删除改变地图");
    const confirmed = unwrap(api.edit.states.delete(stateId, {confirm: true}), "states.delete.confirm");
    if (!confirmed.executed || !confirmed.preview || !confirmed.deleteSummary || confirmed.result === undefined) {
      throw new Error(`国家删除成功包络异常：${JSON.stringify(confirmed)}`);
    }
    const afterHistory = unwrap(api.history.stats(), "history.after");
    if (afterHistory.undo !== beforeHistory.undo + 1) throw new Error("国家删除没有形成一条历史");
    unwrap(api.history.undo(), "history.undo");
    if (JSON.stringify(app.map) !== before) throw new Error("国家删除撤销没有恢复整图");

    const created = unwrap(api.namebases.create({name: "危险策略浏览器名称库", source: ["甲", "乙"]}), "namebases.create");
    const baseId = created.result?.id;
    const namebaseDenied = api.namebases.delete(baseId);
    if (namebaseDenied.ok !== false || namebaseDenied.error?.code !== "confirmation_required") throw new Error("名称库删除未返回 confirmation_required");
    const namebaseDeleted = unwrap(api.namebases.delete(baseId, {confirm: true}), "namebases.delete");
    if (!namebaseDeleted.executed || namebaseDeleted.result?.id !== baseId) throw new Error("名称库删除旧 result 包络未保留");
    unwrap(api.history.undo(), "namebases.undo");

    return {
      stateId,
      statePreview: inspection.preview.summary,
      stateDenied: denied.error.code,
      stateHistoryDelta: afterHistory.undo - beforeHistory.undo,
      namebaseDenied: namebaseDenied.error.code,
      namebaseRestored: Boolean(app.map.namebases.bases.find(base => base.id === baseId))
    };

    function unwrap(result, label) {
      if (!result?.ok) throw new Error(`${label}：${result?.error?.code || "unknown"} ${result?.error?.message || ""}`);
      return result.data;
    }
  });
  assert.equal(report.stateDenied, "confirmation_required");
  assert.equal(report.stateHistoryDelta, 1);
  assert.equal(report.namebaseDenied, "confirmation_required");
  assert.equal(report.namebaseRestored, true);
  console.log(JSON.stringify({ok: true, ...report}, null, 2));
  await context.close();
} finally {
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await new Promise(done => server.close(done));
}

async function startStaticServer() {
  const serverInstance = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, `http://${host}:${port}`).pathname);
    let target = resolve(distDir, "." + normalize(pathname));
    if (pathname === "/" || !existsSync(target) || statSync(target).isDirectory()) target = join(distDir, "index.html");
    if (!target.startsWith(distDir) || !existsSync(target)) return response.writeHead(404).end("Not found");
    response.writeHead(200, {"content-type": contentType(target), "cache-control": "no-store"});
    createReadStream(target).pipe(response);
  });
  await new Promise((done, fail) => {
    serverInstance.once("error", fail);
    serverInstance.listen(port, host, done);
  });
  return serverInstance;
}

function contentType(file) {
  return ({".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png"})[extname(file).toLowerCase()] || "application/octet-stream";
}

function delay(ms) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms));
}
