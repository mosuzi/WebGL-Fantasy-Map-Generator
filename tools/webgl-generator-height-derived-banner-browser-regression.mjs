#!/usr/bin/env node
import assert from "node:assert/strict";
import {createReadStream, existsSync, statSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {dirname, extname, join, normalize, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {partitionApiBrowserDiagnostics, waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const distDir = join(rootDir, "dist", "webgl-generator");
const screenshotPath = join(rootDir, "docs", "generated", "screenshots", "height-derived-banner-compact.png");
const host = "127.0.0.1";
const port = 5475;
assert.ok(existsSync(distDir), "构建产物不存在：" + distDir);

const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const server = await startStaticServer();
let browser;

try {
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  const context = await browser.newContext({viewport: {width: 520, height: 900}, deviceScaleFactor: 1});
  await context.addInitScript(() => localStorage.clear());
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto("http://" + host + ":" + port + "?healthClear=1", {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 60000);
  const save = process.env.FMG_HEIGHT_APPLY_SAVE;
  if (save) {
    await page.locator("#import-map-file").setInputFiles(save);
    await page.waitForFunction(() => window.__webglGeneratorApp.map.grid.cells.h.length === 100000);
    await waitForApiReady(page, 90000);
  }
  await page.evaluate(() => document.getElementById("open-height-panel")?.click());
  const panel = page.locator('.floating-panel[data-panel-id="height-panel"]');
  await panel.waitFor({state: "visible"});
  const persistentUpdate = panel.getByRole("button", {name: "完成编辑并更新地图", exact: true});
  await persistentUpdate.waitFor({state: "visible"});
  assert.equal(await persistentUpdate.isDisabled(), true, "地图内容已同步时永久更新入口没有禁用");
  const affectSeafloor = panel.getByRole("switch", {name: "影响海底", exact: true});
  await affectSeafloor.waitFor({state: "visible"});
  const defaultBrush = await page.evaluate(() => window.__webglGeneratorApp.panels.height.getBrush());
  assert.equal(defaultBrush.affectSeafloor, false, "影响海底没有默认关闭");
  assert.equal(defaultBrush.scope, "land", "默认高度画笔没有限制在陆地");
  assert.equal(defaultBrush.preserveSurface, true, "默认高度画笔没有保护海陆分界");
  await affectSeafloor.evaluate(node => node.click());
  const seabedBrush = await page.evaluate(() => window.__webglGeneratorApp.panels.height.getBrush());
  assert.equal(seabedBrush.affectSeafloor, true, "影响海底开关没有写入会话状态");
  assert.equal(seabedBrush.scope, "all", "影响海底开启后没有覆盖陆地与水域");
  assert.equal(seabedBrush.preserveSurface, false, "影响海底开启后仍在阻止跨越海平面");
  await panel.getByRole("button", {name: "降低地形", exact: true}).evaluate(node => node.click());
  const switchedActionBrush = await page.evaluate(() => window.__webglGeneratorApp.panels.height.getBrush());
  assert.equal(switchedActionBrush.affectSeafloor, true, "切换高度动作重置了影响海底开关");
  assert.equal(switchedActionBrush.scope, "all", "切换高度动作重置了海底作用范围");
  await affectSeafloor.evaluate(node => node.click());
  const restoredLandBrush = await page.evaluate(() => window.__webglGeneratorApp.panels.height.getBrush());
  assert.equal(restoredLandBrush.affectSeafloor, false, "影响海底开关无法关闭");
  assert.equal(restoredLandBrush.scope, "land", "关闭影响海底后没有恢复陆地范围");
  assert.equal(restoredLandBrush.preserveSurface, true, "关闭影响海底后没有恢复海陆保护");

  const heightChange = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const heights = app.map.grid.cells.h;
    const gridCell = heights.findIndex(height => height >= 20 && height < 100);
    if (gridCell < 0) throw new Error("没有可测试的陆地高度单元");
    const before = Number(heights[gridCell]);
    const result = window.webglGeneratorApi.edit.height.applyChanges([{gridCell, before, after: before + 1}]);
    const derivedStaleSystems = app.map.metadata?.derivedStale?.systems || [];
    app.panels.height.update({derivedStaleSystems});
    return {gridCell, before, after: Number(heights[gridCell]), derivedStaleSystems, ok: result?.ok, error: result?.error?.message || ""};
  });
  assert.equal(heightChange.ok, true, heightChange.error || "高度变化没有应用");
  assert.ok(heightChange.derivedStaleSystems.includes("features"), "普通非跨海高度变化没有登记待更新派生内容");

  const banner = panel.locator('.height-derived-banner[data-ui-state="stale"]');
  await banner.waitFor({state: "visible"});
  await banner.getByText("地图内容待更新", {exact: true}).waitFor();
  await banner.getByText("完成后统一更新。", {exact: true}).waitFor();
  assert.equal(await persistentUpdate.isDisabled(), false, "高度变化后永久更新入口没有启用");

  const layout = await banner.evaluate(node => {
    const copy = node.querySelector(".ui-state-banner-copy");
    const actions = node.querySelector(".ui-state-banner-actions");
    const buttons = [...node.querySelectorAll(".ui-state-banner-actions button")];
    const rect = item => {
      if (!item) return null;
      const box = item.getBoundingClientRect();
      return {left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height};
    };
    return {
      banner: rect(node),
      copy: rect(copy),
      actions: rect(actions),
      buttons: buttons.map(rect),
      clientWidth: node.clientWidth,
      scrollWidth: node.scrollWidth,
      text: node.innerText
    };
  });

  assert.ok(!layout.actions || !rectanglesOverlap(layout.copy, layout.actions), "提示文案与操作按钮发生重叠");
  assert.ok(layout.buttons.every(button => button.left >= layout.banner.left && button.right <= layout.banner.right + 0.5), "按钮超出待更新提示边界");
  assert.equal(layout.buttons.length, 0, "普通地图更新入口仍嵌在条件横幅内");
  assert.ok(layout.scrollWidth <= layout.clientWidth + 1, "待更新提示产生横向溢出");
  assert.doesNotMatch(layout.text, /待派生|\d+\s*项：|宗教、|标记、|地区等/, "待更新提示仍暴露派生调试信息");
  await page.screenshot({path: screenshotPath, fullPage: true});
  assert.ok(existsSync(screenshotPath) && statSync(screenshotPath).size > 0, "高度待更新提示截图没有生成");
  const coast = await page.evaluate(() => {
    const {map, renderer} = window.__webglGeneratorApp;
    const cells = map.grid.cells;
    renderer.setColorMode("states");
    const rect = renderer.canvas.getBoundingClientRect();
    const id = cells.h.findIndex((h, i) => {
      if (h < 20 || !cells.state[i] || cells.burg[i] >= 0 || !cells.c[i].some(n => cells.h[n] < 20)) return false;
      const p = renderer.worldToScreen(...map.grid.points[i], rect);
      return p.x > 30 && p.x < rect.width - 30 && p.y > 30 && p.y < rect.height - 30;
    });
    if (id < 0) throw Error("验收地图缺少已分配的海岸陆格");
    const country = cells.state[id], state = map.politics.states[country];
    window.heightImpactPixel = () => {
      const canvas = renderer.canvas, gl = renderer.gl, box = canvas.getBoundingClientRect();
      const p = renderer.worldToScreen(...map.grid.points[id], box), rgba = new Uint8Array(4);
      renderer.draw();
      gl.readPixels(Math.floor(p.x * canvas.width / box.width), canvas.height - 1 - Math.floor(p.y * canvas.height / box.height),
        1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      return [...rgba];
    };
    const landPixel = window.heightImpactPixel();
    const result = window.webglGeneratorApi.edit.height.applyChanges([{gridCell: id, before: cells.h[id], after: 10}]);
    if (!result.ok) throw Error(result.error?.message);
    return {id, country, capital: state.capital, name: state.fullName, color: state.color, landPixel};
  });
  await page.evaluate(() => {
    const app = window.__webglGeneratorApp, coordinator = app.workerTaskCoordinator;
    window.heightComputations = [];
    const refresh = app.renderer.refreshCellAttributeCells.bind(app.renderer);
    window.firstHeightPreview = null;
    app.renderer.refreshCellAttributeCells = (ids, source) => {
      const result = refresh(ids, source);
      if (source && source !== app.map && window.firstHeightPreview === null) {
        window.firstHeightPreview = {ms: Math.round(performance.now() - window.heightApplyStart),
          pending: Boolean(app.map.metadata.derivedStale?.heightEdits), mode: app.renderer.colorMode};
      }
      return result;
    };
    app.workerTaskCoordinator = {...coordinator, run(task, payload, options) {
      if (task === "height-derived.compute") window.heightComputations.push(payload.mode);
      return coordinator.run(task, payload, options);
    }};
    window.heightApplyTasks = [];
    window.heightApplyObserver = new PerformanceObserver(list => window.heightApplyTasks.push(...list.getEntries().map(e => Math.round(e.duration))));
    window.heightApplyObserver.observe({entryTypes: ["longtask"]});
    window.heightApplyStart = performance.now();
  });
  const enable = panel.getByRole("button", {name: "启用高度编辑", exact: true});
  if (await enable.isVisible()) await enable.click();
  await persistentUpdate.click();
  if (process.env.FMG_HEIGHT_SWITCH_VIEW === "1") {
    await page.waitForFunction(() => window.webglGeneratorApi.info.runtimeStats().data?.operation?.busy);
    const biomes = page.locator('.ui-segmented-mode-bridge[data-mode="biomes"]');
    assert.equal(await biomes.isDisabled(), false, "应用期间玩家视图选择仍被锁定");
    await biomes.evaluate(button => button.click());
  }
  await page.waitForFunction(() => !window.__webglGeneratorApp.map.metadata.derivedStale?.heightEdits, null, {timeout: 90000});
  await waitForApiReady(page, 90000);
  const timing = await page.evaluate(() => {
    window.heightApplyObserver.disconnect();
    return {ms: Math.round(performance.now() - window.heightApplyStart), longTasks: window.heightApplyTasks,
      computations: window.heightComputations, preview: window.firstHeightPreview};
  });
  assert.equal(timing.computations.filter(mode => mode === "edited-height").length, 1, "视图变化重复执行了高度结算");
  assert.ok(timing.preview?.pending && timing.preview.ms < timing.ms, "当前视图必须在整笔高度应用提交前收到变更格数据");
  assert.ok(timing.longTasks.every(ms => ms <= 200), `高度应用阻塞主线程：${timing.longTasks.join(" / ")}ms`);
  if (process.env.FMG_HEIGHT_SWITCH_VIEW === "1") {
    assert.equal(await page.evaluate(() => window.__webglGeneratorApp.renderer.colorMode), "biomes", "应用高度时切换的视图被覆盖");
    assert.equal(timing.preview.mode, "biomes");
  }
  const applied = await page.evaluate(({id, country}) => {
    const {map, renderer} = window.__webglGeneratorApp;
    renderer.setColorMode("states");
    const state = map.politics.states[country], cells = map.grid.cells;
    return {height: cells.h[id], owner: cells.state[id], province: cells.province[id],
      land: map.features.features[cells.f[id]].land, capital: state.capital, name: state.fullName, color: state.color};
  }, coast);
  assert.deepEqual(applied, {height: 10, owner: 0, province: 0, land: false, capital: coast.capital, name: coast.name, color: coast.color});
  const pixels = await page.evaluate(() => {
    const {renderer} = window.__webglGeneratorApp;
    const states = window.heightImpactPixel();
    renderer.setColorMode("provinces");
    const provinces = window.heightImpactPixel();
    renderer.setColorMode("states");
    return {states, provinces};
  });
  assert.notDeepEqual(pixels.states, coast.landPixel, "沉没格中心仍显示原来的国色");
  assert.deepEqual(pixels.states, pixels.provinces, "国家和省份视图对同一片水域着色不一致");
  await banner.waitFor({state: "hidden"});
  await persistentUpdate.waitFor({state: "visible"});
  assert.equal(await persistentUpdate.isDisabled(), true, "完成更新后永久入口消失或没有恢复禁用");
  const history = await page.evaluate(async ({id, country}) => {
    const api = window.webglGeneratorApi;
    const map = window.__webglGeneratorApp.map;
    const undo = await api.history.undo();
    if (!undo.ok || map.grid.cells.state[id] !== country) throw Error(undo.error?.message || "撤销后的国家归属有误");
    const redo = await api.history.redo();
    if (!redo.ok || map.grid.cells.state[id] !== 0) throw Error(redo.error?.message || "重做后的水格有国色");
    return {undo: undo.ok, redo: redo.ok};
  }, coast);
  const diagnostics = partitionApiBrowserDiagnostics(
    await page.evaluate(() => window.__webglGeneratorHealth?.getEvents?.() ? {events: window.__webglGeneratorHealth.getEvents()} : {}),
    consoleErrors
  );
  assert.deepEqual(diagnostics.consoleErrors, []);
  assert.deepEqual(pageErrors, []);

  console.log(JSON.stringify({
    ok: true,
    url: "http://" + host + ":" + port + "?healthClear=1",
    viewport: "520x900",
    heightChange,
    coast, applied, history, pixels, timing,
    layout,
    screenshotPath,
    consoleErrors: diagnostics.consoleErrors,
    performanceConsoleErrors: diagnostics.performanceConsoleErrors,
    pageErrors
  }, null, 2));
  const saved = await page.evaluate(() => window.webglGeneratorApi.data.saveBrowserMap());
  assert.ok(saved.ok, saved.error?.message);
  await page.reload({waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 90000);
  const reopened = await page.evaluate(({id, country}) => {
    const {map} = window.__webglGeneratorApp;
    return [map.grid.cells.h[id], map.grid.cells.state[id], map.politics.states[country]?.capital, map.metadata.derivedStale?.heightEdits ?? null];
  }, coast);
  assert.deepEqual(reopened, [10, 0, coast.capital, null]);
  console.log(JSON.stringify({reopened}));
  if (!save) for (const scenario of ["capital", "last-land"]) {
    const report = await page.evaluate(async scenario => {
      const api = window.webglGeneratorApi, map = window.__webglGeneratorApp.map;
      const g = map.grid.cells, p = map.pack.cells;
      const country = map.politics.states.filter(s => s?.capital && !s.removed && s.cells >= 2)
        .sort((a, b) => a.cells - b.cells).find(s => p.i.some(i => p.state[i] === s.i && !p.burg[i] && p.h[i] >= 20 && g.h[p.g[i]] >= 20));
      if (!country) throw Error("验收地图缺少可以迁都的国家");
      const id = country.i, capital = country.capital, originalCity = map.pack.burgs[capital];
      const cells = scenario === "capital" ? [p.g[originalCity.cell]] : [...new Set([
        ...g.i.filter(i => g.state[i] === id), ...p.i.filter(i => p.state[i] === id).map(i => p.g[i])
      ])];
      const others = map.politics.states.filter(s => s && s.i !== id && !s.removed).map(s => [s.i, s.name, s.color, s.capital]);
      const brush = api.edit.height.applyChanges(cells.map(i => ({gridCell: i, before: g.h[i], after: 10})));
      if (!brush.ok) throw Error(brush.error.message);
      if (scenario === "capital") {
        const {renderer} = window.__webglGeneratorApp, offset = cells[0] * 4;
        const snapshot = () => {
          const gpu = renderer.cellAttributeStore.snapshot;
          return JSON.stringify([g.state[cells[0]], map.politics.states[id].capital, map.metadata.derivedStale,
            ...["terrain", "identities", "numeric"].map(key => [...gpu[key].slice(offset, offset + 4)])]);
        };
        const before = snapshot();
        window.__webglGeneratorWorkerRefreshFault = {kind: "height-derived", stage: "after-render", mode: "once"};
        const failed = await api.edit.height.rebuildAllDerived({confirm: true, mode: "edited-height"});
        delete window.__webglGeneratorWorkerRefreshFault;
        if (failed.ok || snapshot() !== before) throw Error("高度应用失败时地图或预览颜色没有恢复");
      }
      const updated = await api.edit.height.rebuildAllDerived({confirm: true, mode: "edited-height"});
      if (!updated.ok) throw Error(updated.error.message);
      const state = map.politics.states[id], destination = map.pack.burgs[state.capital];
      const valid = scenario === "capital" ? !state.removed && state.capital === capital && destination.name === originalCity.name
        && p.h[destination.cell] >= 20 && p.state[destination.cell] === id : state.removed && !state.capital;
      const othersPreserved = others.every(([i, name, color, burg]) => {
        const row = map.politics.states[i];
        return row.name === name && row.color === color && row.capital === burg && !row.removed;
      });
      return {scenario, cells: cells.length, valid, othersPreserved};
    }, scenario);
    assert.ok(report.valid && report.othersPreserved, JSON.stringify(report));
    console.log(JSON.stringify(report));
  }
  if (!save) {
    const explicit = await page.evaluate(async () => {
      const app = window.__webglGeneratorApp;
      const coordinator = app.workerTaskCoordinator;
      const requests = [];
      app.workerTaskCoordinator = {...coordinator, run(task, payload, options) {
        if (task === "height-derived.compute") requests.push({scope: payload.scope, mode: payload.mode ?? "full"});
        return coordinator.run(task, payload, options);
      }};
      try {
        const result = await window.webglGeneratorApi.edit.height.rebuildAllDerived({confirm: true});
        return {ok: result.ok, error: result.error, requests};
      } finally {
        app.workerTaskCoordinator = coordinator;
      }
    });
    assert.ok(explicit.ok, JSON.stringify(explicit.error));
    assert.deepEqual(explicit.requests, [{scope: "all", mode: "full"}]);
    console.log(JSON.stringify({explicitRegeneration: explicit.requests}));
  }
  assert.deepEqual(pageErrors, []);
  await context.close();
} finally {
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await new Promise(done => server.close(done));
}

function rectanglesOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

async function startStaticServer() {
  const serverInstance = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://" + host + ":" + port).pathname);
    let target = resolve(distDir, "." + normalize(pathname));
    if (pathname === "/" || !existsSync(target) || statSync(target).isDirectory()) target = join(distDir, "index.html");
    if (!target.startsWith(distDir) || !existsSync(target)) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
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
  return ({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png"
  })[extname(file).toLowerCase()] || "application/octet-stream";
}

function delay(ms) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms));
}
