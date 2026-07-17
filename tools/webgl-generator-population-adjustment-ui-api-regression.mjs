#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {createServer as createViteServer} from "vite";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {API_METHODS, CONFIRM_REQUIRED_METHODS} from "../app/webgl-generator/src/runtime/api-contract.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {inspectPopulationAdjustment} from "../app/webgl-generator/src/runtime/population-adjustment-commands.js";

for (const method of ["population.inspectAdjustment", "population.applyAdjustment"]) {
  assert(API_METHODS.edit.includes(method), `稳定 API 目录缺少 ${method}`);
  assert(!CONFIRM_REQUIRED_METHODS.includes(`edit.${method}`), `${method} 不应要求显式确认`);
}
assert.equal(Object.values(API_METHODS).reduce((sum, methods) => sum + methods.length, 0), 204);
assert.equal(API_METHODS.edit.length, 106);

const [appSource, consoleSource, controllerSource, panelSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/console-api.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/panels/population-panel.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/PopulationPanel.vue", import.meta.url), "utf8")
]);

for (const method of ["inspectAdjustment", "applyAdjustment"]) assert(consoleSource.includes(`actions.edit?.population?.${method}`), `Console API 缺少 population.${method} 转发`);
for (const token of ["inspectPopulationAdjustmentViaApi", "applyPopulationAdjustmentViaApi", "createApplyPopulationAdjustmentCommand"]) assert(appSource.includes(token), `人口运行时缺少 ${token}`);
for (const token of ["onAdjustmentDelta", "onInspectAdjustment", "onApplyAdjustment", "historyActions"]) assert(controllerSource.includes(token), `人口 panel controller 缺少 ${token}`);
for (const text of ["区域人口增减", "人口增减量", "预检", "应用单次调整", "可通过历史撤销"]) assert(panelSource.includes(text), `人口面板缺少“${text}”`);

const dynamic = await testDynamicRuntime();
console.log(JSON.stringify({ok: true, methodCounts: {total: 204, edit: 106}, dynamic}, null, 2));

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
    for (const name of ["inspectPopulationAdjustmentViaApi", "applyPopulationAdjustmentViaApi", "executeHistoryCommand"]) assert.equal(typeof appRuntime[name], "function", `动态加载缺少 ${name}`);

    const seed = "population-adjustment-ui-api";
    const uiMap = generatePlaceholderMap({seed, cellsTarget: 3000, heightmapTemplate: "continents"});
    const apiMap = generatePlaceholderMap({seed, cellsTarget: 3000, heightmapTemplate: "continents"});
    const target = findTarget(uiMap);
    assert(target, "动态回归缺少人口目标");
    const ui = createHarness(uiMap, appRuntime, consoleRuntime);
    const api = createHarness(apiMap, appRuntime, consoleRuntime);
    const options = {delta: 25};

    assert.equal(api.api.edit.population.inspectAdjustment(target, null).ok, false, "人口预检接受了非对象参数");
    assert.equal(api.api.edit.population.applyAdjustment(target, null).ok, false, "人口提交接受了非对象参数");

    const uiInspect = ui.actions.edit.population.inspectAdjustment(target, options);
    const apiInspect = api.api.edit.population.inspectAdjustment(target, options);
    assert.equal(apiInspect.ok, true, apiInspect.error?.message);
    assert.deepEqual(apiInspect.data, uiInspect, "人口 UI/API 预检结果不一致");
    assert.equal(ui.state.editHistory.getStats().undo, 0, "UI 预检污染历史");
    assert.equal(api.state.editHistory.getStats().undo, 0, "API 预检污染历史");

    const before = mapDigest(apiMap);
    const uiApplied = ui.actions.edit.population.applyAdjustment(target, options);
    const apiApplied = api.api.edit.population.applyAdjustment(target, options);
    assert.equal(uiApplied.executed, true, uiApplied.error?.message);
    assert.equal(apiApplied.ok, true, apiApplied.error?.message);
    assert.equal(apiApplied.data.executed, true, apiApplied.data.error?.message);
    assert.deepEqual(mapDigest(apiMap), mapDigest(uiMap), "人口 UI/API 提交结果不一致");
    assert.equal(api.state.editHistory.getStats().undo, 1, "API 人口提交没有形成单条历史");

    assert.equal(api.api.history.undo().ok, true);
    assert.deepEqual(mapDigest(apiMap), before, "人口 API 撤销没有恢复原值");
    assert.equal(api.api.history.redo().ok, true);
    assert.deepEqual(mapDigest(apiMap), mapDigest(uiMap), "人口 API 重做没有恢复提交值");
    return {target, delta: 25, history: api.state.editHistory.getStats(), uiApiConverged: true};
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
    canvasToolModes: {getActive() { return null; }}
  };
  const documentRef = {defaultView: {}, dispatchEvent() {}, getElementById() { return null; }};
  const runtimeUi = {refresh() {}, refreshPanels: false, updatePopulationPanel() {}, updateRuntimePanel() {}, updateEditingInteractionLock() {}};
  const actions = {
    history: {
      undo: () => appRuntime.executeHistoryCommand(state, documentRef, "undo", runtimeUi),
      redo: () => appRuntime.executeHistoryCommand(state, documentRef, "redo", runtimeUi)
    },
    edit: {
      population: {
        inspectAdjustment: (target, options) => appRuntime.inspectPopulationAdjustmentViaApi(state, target, options),
        applyAdjustment: (target, options) => appRuntime.applyPopulationAdjustmentViaApi(state, documentRef, target, options, runtimeUi)
      }
    }
  };
  const api = consoleRuntime.installConsoleApi(documentRef, state, {actions});
  return {state, actions, api};
}

function findTarget(map) {
  for (const state of map.politics?.states || []) {
    const id = Number(state?.i ?? state?.id);
    if (!state || state.removed || id <= 0) continue;
    const target = {scope: "state", id};
    if (inspectPopulationAdjustment(map, target, {delta: 25}).valid) return target;
  }
  return null;
}

function mapDigest(map) {
  const stale = structuredClone(map.metadata?.derivedStale || null);
  if (stale) delete stale.updatedAt;
  return JSON.parse(JSON.stringify({
    gridPopulation: [...map.grid.cells.pop],
    packPopulation: [...map.pack.cells.pop],
    cities: (map.settlements?.cities || []).map(city => city && ({id: city.id, population: city.population})),
    burgs: (map.pack?.burgs || []).map(burg => burg && ({i: burg.i, population: burg.population})),
    states: groupStats(map.politics?.states),
    provinces: groupStats(map.politics?.provinces),
    cultures: groupStats(map.society?.cultures),
    religions: groupStats(map.society?.religions),
    settlementMetadata: map.settlements?.metadata,
    markets: map.pack?.markets,
    economyDemand: map.economy?.metadata?.demand,
    stale
  }));
}

function groupStats(items) {
  return (items || []).map(item => item && ({i: item.i ?? item.id, rural: item.rural, urban: item.urban, burgs: item.burgs, civilizationProfile: item.civilizationProfile}));
}
