#!/usr/bin/env node
import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";
import {preview} from "vite";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const root = resolve(import.meta.dirname, "..");
const archivePath = process.env.FMG_REAL_ARCHIVE || "C:\\Users\\mosuzi\\Downloads\\krichars (3).webfmg";
assert.ok(existsSync(archivePath), `指定存档不存在：${archivePath}`);
const {chromium} = createRequire(join(root, "source/Fantasy-Map-Generator/package.json"))("playwright");
const server = await preview({configFile: join(root, "vite.config.mjs"), preview: {host: "127.0.0.1", port: 5596, strictPort: true}, logLevel: "error"});
const browser = await chromium.launch({channel: "chrome", headless: true});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
page.setDefaultTimeout(180000);
const errors = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => {if (message.type() === "error" && !message.text().startsWith("[FMG health]")) errors.push(message.text());});

try {
  await page.goto("http://127.0.0.1:5596/?healthClear=1&debug=1", {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 30000);
  await page.evaluate(() => {window.__stateLatencyPreviousMap = window.__webglGeneratorApp?.map;});
  await page.locator("#import-map-file").setInputFiles(archivePath);
  await page.waitForFunction(() => {
    const app = window.__webglGeneratorApp;
    return app?.map && app.map !== window.__stateLatencyPreviousMap && app.map.grid?.cells?.i?.length === 100000
      && !app.runtimeOperationSnapshot?.busy;
  });
  await waitForApiReady(page, 180000);
  const target = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const map = app.map;
    const cells = map.grid.cells;
    const state = map.politics.states.find(item => {
      const capitalCell = map.pack.cells.g?.[map.pack.burgs[item?.capital]?.cell];
      return Number.isInteger(capitalCell) && (cells.c?.[capitalCell] || []).some(neighbor => cells.h[neighbor] >= 20 && cells.state[neighbor] === (item.i ?? item.id));
    });
    if (!state) throw new Error("真实存档找不到可复验首都");
    const gridCell = map.pack.cells.g[map.pack.burgs[state.capital].cell];
    const oldStateId = state.i ?? state.id;
    return {gridCell, oldStateId};
  });
  const created = await page.evaluate(({gridCell}) => {
    const startedAt = performance.now();
    const created = window.webglGeneratorApi.edit.states.add(gridCell);
    const addEndedAt = performance.now();
    if (!created.ok) throw new Error(JSON.stringify(created.error));
    return {startedAt, addEndedAt, newStateId: created.data?.result?.stateId};
  }, target);
  await page.waitForTimeout(50);
  const painted = await page.evaluate(({gridCell, oldStateId, newStateId}) => {
    const cells = window.__webglGeneratorApp.map.grid.cells;
    const brushStartedAt = performance.now();
    const painted = window.webglGeneratorApi.edit.states.applyChanges([{gridCell, after: oldStateId}]);
    const brushEndedAt = performance.now();
    if (!painted.ok) throw new Error(JSON.stringify(painted.error));
    const borderCell = Array.from(cells.i).find(cell => cells.state[cell] === oldStateId
      && (cells.c?.[cell] || []).some(neighbor => cells.state[neighbor] === newStateId));
    if (!Number.isInteger(borderCell)) throw new Error("没有可复验的旧国接壤 cell");
    return {brushStartedAt, brushEndedAt, borderCell};
  }, {...target, ...created});
  await page.waitForTimeout(50);
  const forced = await page.evaluate(({newStateId, oldStateId}) => {
    const map = window.__webglGeneratorApp.map;
    const colorRepairStartedAt = performance.now();
    const forced = window.webglGeneratorApi.edit.states.setColor(newStateId, map.politics.states[oldStateId].color);
    const colorSetEndedAt = performance.now();
    if (!forced.ok) throw new Error(JSON.stringify(forced.error));
    return {colorRepairStartedAt, colorSetEndedAt};
  }, {...target, ...created});
  await page.waitForTimeout(50);
  const recolored = await page.evaluate(({borderCell, newStateId}) => {
    const recolorStartedAt = performance.now();
    const recolored = window.webglGeneratorApi.edit.states.applyChanges([{gridCell: borderCell, after: newStateId}]);
    if (!recolored.ok) throw new Error(JSON.stringify(recolored.error));
    const colorRepairEndedAt = performance.now();
    return {recolorStartedAt, colorRepairEndedAt};
  }, {...created, ...painted});
  const result = {...target, ...created, ...painted, ...forced, ...recolored};
  await page.waitForFunction(startedAt => window.__webglGeneratorApp.healthMonitor.getCanvasSamples()
    .some(item => item.phase === "state-label-refresh" && item.pageTimeMs >= startedAt), result.startedAt);
  await page.waitForTimeout(250);
  const observed = await page.evaluate(({startedAt, gridCell, oldStateId, newStateId}) => {
    const app = window.__webglGeneratorApp;
    return {
      samples: app.healthMonitor.getCanvasSamples().filter(item => item.pageTimeMs >= startedAt),
      health: app.healthMonitor.getEvents().filter(item => item.pageTimeMs >= startedAt && /long-task|stall/.test(item.type)),
      overlay: app.renderer.lastOverlayUpdate,
      labelProfile: app.renderer.lastLabelRefreshProfile,
      oldCapital: app.map.politics.states[oldStateId]?.capital,
      newCapital: app.map.politics.states[newStateId]?.capital,
      newColor: app.map.politics.states[newStateId]?.color,
      neighborColors: app.map.politics.states[newStateId]?.neighbors?.map(id => app.map.politics.states[id]?.color),
      gridOwner: app.map.grid.cells.state[gridCell],
      glError: app.renderer.gl.getError()
    };
  }, result);
  const timings = {
    addMs: result.addEndedAt - result.startedAt,
    brushMs: result.brushEndedAt - result.brushStartedAt,
    setColorMs: result.colorSetEndedAt - result.colorRepairStartedAt,
    recolorMs: result.colorRepairEndedAt - result.recolorStartedAt
  };
  assert.ok(Object.values(timings).every(ms => ms < 200), `真实旧档国家编辑阻塞超限：${JSON.stringify(timings)}`);
  assert.ok(observed.samples.some(sample => sample.phase === "state-color"), "改色应进入画布阶段监控");
  assert.equal(observed.health.length, 0, `真实旧档产生长任务或交互卡顿：${JSON.stringify(observed.health)}`);
  assert.ok(observed.neighborColors.every(color => color?.toLowerCase() !== observed.newColor?.toLowerCase()), "新增国家接壤后颜色应避免撞色");
  assert.equal(observed.gridOwner, result.oldStateId);
  assert.ok(observed.oldCapital > 0 && observed.newCapital > 0 && observed.oldCapital !== observed.newCapital);
  assert.equal(observed.glError, 0);
  assert.deepEqual(errors, []);
  const immediate = await page.evaluate(({borderCell, oldStateId, newStateId}) => {
    const startedAt = performance.now();
    const brushed = window.webglGeneratorApi.edit.states.applyChanges([{gridCell: borderCell, after: oldStateId}]);
    const recolored = window.webglGeneratorApi.edit.states.setColor(newStateId, "#ab8c63");
    if (!brushed.ok || !recolored.ok) throw new Error(JSON.stringify({brushed, recolored}));
    return {startedAt, endedAt: performance.now()};
  }, result);
  await page.waitForFunction(startedAt => window.__webglGeneratorApp.healthMonitor.getCanvasSamples()
    .some(item => item.phase === "state-label-refresh" && item.pageTimeMs >= startedAt), immediate.startedAt);
  const immediateObserved = await page.evaluate(startedAt => {
    const app = window.__webglGeneratorApp;
    app.renderer.draw();
    return {glError: app.renderer.gl.getError(), health: app.healthMonitor.getEvents().filter(item => item.pageTimeMs >= startedAt && /long-task|stall|resource-owner/.test(item.type))};
  }, immediate.startedAt);
  assert.ok(immediate.endedAt - immediate.startedAt < 200);
  assert.equal(immediateObserved.glError, 0);
  assert.deepEqual(immediateObserved.health, []);
  assert.deepEqual(errors, []);
  const history = await page.evaluate(async ({stateId, originalColor}) => {
    const api = window.webglGeneratorApi;
    const app = window.__webglGeneratorApp;
    const startedAt = performance.now();
    const undone = await api.history.undo();
    const undoColor = app.map.politics.states[stateId].color;
    const redone = await api.history.redo();
    const redoColor = app.map.politics.states[stateId].color;
    app.renderer.draw();
    return {startedAt, undone, redone, undoColor, redoColor, originalColor,
      health: app.healthMonitor.getEvents().filter(item => item.pageTimeMs >= startedAt && /long-task|stall|resource-owner/.test(item.type)),
      glError: app.renderer.gl.getError()};
  }, {stateId: result.newStateId, originalColor: observed.newColor});
  assert.equal(history.undone.ok && history.redone.ok, true, JSON.stringify(history));
  assert.equal(history.undoColor, history.originalColor);
  assert.equal(history.redoColor, "#ab8c63");
  assert.deepEqual(history.health, []);
  assert.equal(history.glError, 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({timings, result, observed, immediate, immediateObserved, history, errors}, null, 2));
} finally {
  await browser.close();
  await new Promise(resolveClose => server.httpServer.close(resolveClose));
}
