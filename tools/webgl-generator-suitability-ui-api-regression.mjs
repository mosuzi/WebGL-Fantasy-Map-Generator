#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {createServer as createViteServer} from "vite";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {API_METHODS, CONFIRM_REQUIRED_METHODS} from "../app/webgl-generator/src/runtime/api-contract.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";

for (const method of ["biomes.inspectSuitability", "biomes.applySuitability"]) {
  assert(API_METHODS.edit.includes(method), `稳定 API 目录缺少 ${method}`);
  assert(!CONFIRM_REQUIRED_METHODS.includes(`edit.${method}`), `${method} 不应要求显式确认`);
}
assert.equal(Object.values(API_METHODS).reduce((sum, methods) => sum + methods.length, 0), 202);
assert.equal(API_METHODS.edit.length, 104);

const [appSource, consoleSource, controllerSource, panelSource, cursorSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/console-api.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/panels/biome-panel.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/BiomePanel.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/brush-cursor-preview.js", import.meta.url), "utf8")
]);

for (const method of ["inspectSuitability", "applySuitability"]) {
  assert(consoleSource.includes(`actions.edit?.biomes?.${method}`), `Console API 缺少 biomes.${method} 转发`);
}
for (const token of ["SUITABILITY_PAINT", "bindSuitabilityEditing", "applySuitabilityAtEvent", "finishSuitabilityStroke", "createApplySuitabilityCommand"]) {
  assert(appSource.includes(token), `适居度画布闭环缺少 ${token}`);
}
for (const token of ["getSuitabilityBrush", "setSuitabilityActive", "updateSuitability", "onSuitabilityRadius"]) {
  assert(controllerSource.includes(token), `生物群系 panel controller 缺少 ${token}`);
}
for (const text of ["数值适居度", "直接设值", "恢复自动基准", "陆地", "水域", "全部", "水域人口承载恒为 0"]) {
  assert(panelSource.includes(text), `数值适居度面板缺少“${text}”`);
}
assert(cursorSource.includes('modeId === "biome:suitability"'), "适居度模式未接共享画笔光标");
assert.match(appSource, /pointerup[\s\S]*?finishSuitabilityStroke\(state, documentRef\)/, "适居度 pointerup 没有提交 stroke");
assert.match(appSource, /pointercancel[\s\S]*?rollbackCanvasToolStroke\(state, "suitability"\)/, "适居度 pointercancel 没有回滚预览");

const dynamic = await testDynamicRuntime();
console.log(JSON.stringify({ok: true, methodCounts: {total: 202, edit: 104}, dynamic}, null, 2));

async function testDynamicRuntime() {
  const server = await createViteServer({
    configFile: fileURLToPath(new URL("../vite.config.mjs", import.meta.url)),
    logLevel: "silent",
    server: {middlewareMode: true},
    appType: "custom",
    ssr: {noExternal: ["element-plus", /^@element-plus\//]}
  });
  try {
    const [appRuntime, consoleRuntime] = await Promise.all([
      server.ssrLoadModule("/src/runtime/app.js"),
      server.ssrLoadModule("/src/runtime/console-api.js")
    ]);
    for (const name of ["inspectSuitabilityViaApi", "applySuitabilityViaApi", "executeHistoryCommand"]) {
      assert.equal(typeof appRuntime[name], "function", `动态加载缺少 ${name}`);
    }

    const seed = "suitability-ui-api";
    const uiMap = generatePlaceholderMap({seed, cellsTarget: 3000, heightmapTemplate: "continents"});
    const apiMap = generatePlaceholderMap({seed, cellsTarget: 3000, heightmapTemplate: "continents"});
    const gridCell = findLandGridCell(uiMap);
    assert(Number.isInteger(gridCell), "动态回归缺少陆地 grid cell");
    const ui = createHarness(uiMap, appRuntime, consoleRuntime);
    const api = createHarness(apiMap, appRuntime, consoleRuntime);
    const options = {mode: "set", scope: "land", value: 80};

    assert.equal(api.api.edit.biomes.inspectSuitability([gridCell], null).ok, false, "适居度预检接受了非对象参数");
    assert.equal(api.api.edit.biomes.applySuitability([gridCell], null).ok, false, "适居度提交接受了非对象参数");

    const uiInspect = ui.actions.edit.biomes.inspectSuitability([gridCell], options);
    const apiInspect = api.api.edit.biomes.inspectSuitability([gridCell], options);
    assert.equal(apiInspect.ok, true, apiInspect.error?.message);
    assert.deepEqual(apiInspect.data, uiInspect, "适居度 UI/API 预检结果不一致");
    assert.equal(ui.state.editHistory.getStats().undo, 0, "UI 预检污染历史");
    assert.equal(api.state.editHistory.getStats().undo, 0, "API 预检污染历史");

    const before = mapDigest(apiMap);
    const uiApplied = ui.actions.edit.biomes.applySuitability([gridCell], options);
    const apiApplied = api.api.edit.biomes.applySuitability([gridCell], options);
    assert.equal(uiApplied.executed, true, uiApplied.error?.message);
    assert.equal(apiApplied.ok, true, apiApplied.error?.message);
    assert.equal(apiApplied.data.executed, true, apiApplied.data.error?.message);
    assert.deepEqual(mapDigest(apiMap), mapDigest(uiMap), "适居度 UI/API 提交结果不一致");
    assert.equal(api.state.editHistory.getStats().undo, 1, "API 适居度提交没有形成单条历史");

    const undone = api.api.history.undo();
    assert.equal(undone.ok, true);
    assert.deepEqual(mapDigest(apiMap), before, "适居度 API 撤销没有恢复原值");
    const redone = api.api.history.redo();
    assert.equal(redone.ok, true);
    assert.deepEqual(mapDigest(apiMap), mapDigest(uiMap), "适居度 API 重做没有恢复提交值");

    const reset = api.api.edit.biomes.applySuitability([gridCell], {mode: "reset", scope: "land"});
    assert.equal(reset.ok, true, reset.error?.message);
    assert.equal(reset.data.executed, true, "恢复自动基准没有形成编辑");
    return {gridCell, setValue: 80, reset: true, history: api.state.editHistory.getStats(), uiApiConverged: true};
  } finally {
    await server.close();
  }
}

function createHarness(map, appRuntime, consoleRuntime) {
  const state = {
    map,
    editHistory: new EditHistory(),
    editRefreshScheduler: {run() {}},
    selectionStore: {batch(callback) { callback(); }},
    selection: null,
    editingObject: null,
    renderer: {objectHighlights: []},
    panels: {},
    suitabilityEdit: {activeStroke: null, lastAffected: 0, preview: null},
    canvasToolModes: {getActive() { return null; }}
  };
  const documentRef = {defaultView: {}, dispatchEvent() {}, getElementById() { return null; }};
  const runtimeUi = {refresh() {}, refreshPanels: false, updateBiomePanel() {}, updateRuntimePanel() {}, updateEditingInteractionLock() {}};
  const actions = {
    history: {
      undo: () => appRuntime.executeHistoryCommand(state, documentRef, "undo", runtimeUi),
      redo: () => appRuntime.executeHistoryCommand(state, documentRef, "redo", runtimeUi)
    },
    edit: {
      biomes: {
        inspectSuitability: (gridCellIds, options) => appRuntime.inspectSuitabilityViaApi(state, gridCellIds, options),
        applySuitability: (gridCellIds, options) => appRuntime.applySuitabilityViaApi(state, documentRef, gridCellIds, options, runtimeUi)
      }
    }
  };
  const api = consoleRuntime.installConsoleApi(documentRef, state, {actions});
  return {state, actions, api};
}

function findLandGridCell(map) {
  for (let gridCell = 0; gridCell < (map.grid.cells.h?.length || 0); gridCell++) {
    if (Number(map.grid.cells.h[gridCell]) < 20) continue;
    const packCells = (map.pack.cells.i || []).filter(packCell => Number(map.pack.cells.g?.[packCell]) === gridCell);
    if (packCells.length && packCells.every(packCell => Number(map.pack.cells.h?.[packCell]) >= 20)) return gridCell;
  }
  return null;
}

function mapDigest(map) {
  const stale = structuredClone(map.metadata?.derivedStale || null);
  if (stale) delete stale.updatedAt;
  const climate = structuredClone(map.climate?.metadata || {});
  return {
    gridSuitability: [...map.grid.cells.s],
    gridPopulation: [...map.grid.cells.pop],
    packBase: [...map.pack.cells.suitabilityBase],
    packOverride: [...map.pack.cells.suitabilityOverride],
    packSuitability: [...map.pack.cells.s],
    packPopulation: [...map.pack.cells.pop],
    climate,
    stale
  };
}
