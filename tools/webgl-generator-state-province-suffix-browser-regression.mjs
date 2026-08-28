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
const timeoutMs = 180000;
const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
assert.ok(existsSync(distDir), `构建产物不存在：${distDir}`);

const server = await startStaticServer();
const port = server.address().port;
let browser;
try {
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  const context = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1});
  await context.addInitScript(() => {
    localStorage.clear();
    window.__task368LongTasks = [];
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) window.__task368LongTasks.push({name: entry.name, startTime: entry.startTime, duration: entry.duration});
    }).observe({type: "longtask", buffered: true});
  });
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => {
    if (message.type() === "error" && !message.text().startsWith("[FMG health]")) consoleErrors.push(message.text());
  });
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto(`http://${host}:${port}/?debug=1&task=368`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, timeoutMs);
  await page.waitForFunction(() => {
    const app = window.__webglGeneratorApp;
    return app?.map?.metadata?.generationTiming?.totalMs
      && !app.runtimeOperation?.getSnapshot?.().current
      && document.getElementById("generation-loading")?.hidden === true
      && document.getElementById("operation-loading")?.hidden === true;
  });

  const fixture = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const map = app.map;
    const provinces = map.politics.provinces || [];
    const state = (map.politics.states || []).find(candidate => {
      if (!candidate?.i || candidate.removed) return false;
      return provinces.filter(province => province?.i && !province.removed && Number(province.state) === Number(candidate.i)).length >= 2;
    });
    if (!state) throw new Error("找不到至少含两个省份的国家浏览器夹具");
    const targets = provinces.filter(province => province?.i && !province.removed && Number(province.state) === Number(state.i));
    const custom = targets[0];
    const customFullName = `${custom.name}都护领`;
    custom.fullName = customFullName;
    const packCustom = map.pack.provinces?.[custom.i];
    if (packCustom && packCustom !== custom) packCustom.fullName = customFullName;
    app.selectionStore.setSelection({object: {kind: "state", id: state.i}}, {sourcePanelId: "state-panel"});
    app.panels.state.setTargetStateId(state.i);
    app.healthMonitor?.clear?.();
    window.__webglGeneratorHealth?.clear?.();
    window.__task368LongTasks = [];
    return {
      stateId: state.i,
      stateGovernment: {governmentKey: state.governmentKey, formName: state.formName, fullName: state.fullName},
      customProvinceId: custom.i,
      customFullName,
      provinceIds: targets.map(province => province.i),
      beforeNames: targets.map(province => ({id: province.i, formName: province.formName, fullName: province.fullName})),
      geography: targets.map(province => ({id: province.i, name: province.name, state: province.state, center: province.center, burg: province.burg, color: province.color, cells: province.cells, pole: province.pole})),
      history: app.editHistory.getStats()
    };
  });

  console.log(`[task-368] fixture state #${fixture.stateId}, provinces ${fixture.provinceIds.length}`);
  await page.evaluate(() => document.getElementById("open-state-panel")?.click());
  const panel = page.locator('.floating-panel[data-panel-id="state-panel"]:not(.hidden)');
  await panel.waitFor({state: "visible"});
  await panel.getByRole("button", {name: "调整辖下省份后缀"}).click();
  const dialog = page.getByRole("dialog", {name: "调整辖下省份后缀"});
  await dialog.waitFor({state: "visible"});
  await dialog.getByText("默认保留手工定制的省份全名", {exact: false}).waitFor({state: "visible"});
  console.log("[task-368] state panel and suffix dialog ready");

  const suffixSelect = dialog.locator(".state-province-suffix-select select.ui-select-native");
  const options = await suffixSelect.locator("option").allTextContents();
  const targetFormName = options.find(value => value && !fixture.beforeNames.some(item => item.formName === value))
    || options.find(value => value && value !== fixture.beforeNames[1]?.formName);
  assert.ok(targetFormName, `省份后缀选择器没有可用于验证的候选：${JSON.stringify(options)}`);
  await suffixSelect.selectOption({label: targetFormName}, {force: true});
  await dialog.getByRole("button", {name: "调整辖下全部省份"}).click();
  await dialog.locator(".state-province-suffix-result").waitFor({state: "visible"});
  console.log(`[task-368] applied suffix ${targetFormName}`);

  const afterApply = await page.evaluate(({fixture, targetFormName}) => {
    const app = window.__webglGeneratorApp;
    const provinces = app.map.politics.provinces;
    const packProvinces = app.map.pack.provinces;
    return {
      names: fixture.provinceIds.map(id => ({id, formName: provinces[id].formName, fullName: provinces[id].fullName})),
      packNames: fixture.provinceIds.map(id => ({id, formName: packProvinces[id].formName, fullName: packProvinces[id].fullName})),
      geography: fixture.provinceIds.map(id => {
        const province = provinces[id];
        return {id: province.i, name: province.name, state: province.state, center: province.center, burg: province.burg, color: province.color, cells: province.cells, pole: province.pole};
      }),
      government: (() => {
        const state = app.map.politics.states[fixture.stateId];
        return {governmentKey: state.governmentKey, formName: state.formName, fullName: state.fullName};
      })(),
      history: app.editHistory.getStats(),
      targetFormName
    };
  }, {fixture, targetFormName});

  const customAfter = afterApply.names.find(item => item.id === fixture.customProvinceId);
  assert.equal(customAfter.fullName, fixture.customFullName, "默认操作覆盖了手工定制省份全名");
  const standardAfter = afterApply.names.filter(item => item.id !== fixture.customProvinceId);
  assert.ok(standardAfter.every(item => item.formName === targetFormName), "标准省份没有全部套用目标后缀");
  assert.deepEqual(afterApply.names, afterApply.packNames, "production UI 操作后省份双镜像不一致");
  assert.deepEqual(afterApply.geography, fixture.geography, "production UI 操作改写了省份地理或身份");
  assert.deepEqual(afterApply.government, fixture.stateGovernment, "省份后缀操作改写了国家政体或国号");
  assert.equal(afterApply.history.undo, fixture.history.undo + 1, "production UI 批量操作没有只增加一条历史");
  assert.equal(afterApply.history.redo, 0);

  await panel.getByRole("button", {name: "撤销"}).click();
  await page.waitForFunction(expectedUndo => window.__webglGeneratorApp?.editHistory?.getStats?.().undo === expectedUndo, fixture.history.undo);
  console.log("[task-368] undo restored history");
  const afterUndo = await page.evaluate(fixture => {
    const app = window.__webglGeneratorApp;
    return {
      names: fixture.provinceIds.map(id => {
        const province = app.map.politics.provinces[id];
        return {id, formName: province.formName, fullName: province.fullName};
      }),
      history: app.editHistory.getStats(),
      loading: {
        generation: !document.getElementById("generation-loading")?.hidden,
        operation: !document.getElementById("operation-loading")?.hidden
      },
      healthErrors: (window.__webglGeneratorHealth?.getEvents?.(240) || []).filter(event => event.severity === "error"),
      glError: app.renderer?.gl?.getError?.() ?? 0,
      longTasks: window.__task368LongTasks || []
    };
  }, fixture);
  assert.deepEqual(afterUndo.names, fixture.beforeNames, "production UI 撤销没有精确恢复全部省份名称");
  assert.deepEqual(afterUndo.loading, {generation: false, operation: false}, "浏览器验收结束后 Loading 未清零");
  assert.deepEqual(afterUndo.healthErrors, [], "省份后缀目标窗口产生 health error");
  assert.deepEqual(consoleErrors, [], "省份后缀目标窗口产生 console error");
  assert.deepEqual(pageErrors, [], "省份后缀目标窗口产生 page error");
  assert.equal(afterUndo.glError, 0, "省份后缀目标窗口产生 WebGL error");
  const overBudget = afterUndo.longTasks.filter(entry => entry.duration > 200);
  assert.deepEqual(overBudget, [], `省份后缀目标窗口出现 >200ms LongTask：${JSON.stringify(overBudget)}`);

  console.log(JSON.stringify({
    ok: true,
    production: true,
    stateId: fixture.stateId,
    provinces: fixture.provinceIds.length,
    targetFormName,
    protectedCustomProvinceId: fixture.customProvinceId,
    history: {before: fixture.history, afterApply: afterApply.history, afterUndo: afterUndo.history},
    loading: afterUndo.loading,
    errors: {health: afterUndo.healthErrors.length, console: consoleErrors.length, page: pageErrors.length, webgl: afterUndo.glError},
    longTasks: {total: afterUndo.longTasks.length, over200ms: overBudget.length, maxMs: Math.max(0, ...afterUndo.longTasks.map(entry => entry.duration))}
  }, null, 2));
  await context.close();
} finally {
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await new Promise(done => server.close(done));
}

async function startStaticServer() {
  const serverInstance = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, `http://${host}`).pathname);
    let target = resolve(distDir, "." + normalize(pathname));
    if (pathname === "/" || !existsSync(target) || statSync(target).isDirectory()) target = join(distDir, "index.html");
    if (!target.startsWith(distDir) || !existsSync(target)) return response.writeHead(404).end("Not found");
    response.writeHead(200, {"content-type": contentType(target), "cache-control": "no-store"});
    createReadStream(target).pipe(response);
  });
  await new Promise((done, fail) => {
    serverInstance.once("error", fail);
    serverInstance.listen(0, host, done);
  });
  return serverInstance;
}

function contentType(file) {
  return ({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml"
  })[extname(file).toLowerCase()] || "application/octet-stream";
}

function delay(ms) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms));
}
