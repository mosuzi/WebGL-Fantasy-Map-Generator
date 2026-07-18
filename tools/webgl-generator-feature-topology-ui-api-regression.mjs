#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {createServer as createViteServer} from "vite";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {API_METHODS, CONFIRM_REQUIRED_METHODS} from "../app/webgl-generator/src/runtime/api-contract.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {inspectFeatureTopology} from "../app/webgl-generator/src/runtime/feature-topology-edit-commands.js";
import {resolveObject} from "../app/webgl-generator/src/runtime/object-resolver.js";
import {SelectionStore} from "../app/webgl-generator/src/runtime/selection-store.js";

for (const method of ["features.inspectTopology", "features.applyTopology", "features.inspectPatch", "features.applyPatch"]) {
  assert(API_METHODS.edit.includes(method), `稳定 API 目录缺少 ${method}`);
}
assert(CONFIRM_REQUIRED_METHODS.includes("edit.features.applyTopology"), "Feature 拓扑提交缺少显式确认门禁");
assert(!CONFIRM_REQUIRED_METHODS.includes("edit.features.inspectTopology"), "Feature 拓扑只读预检不应要求确认");
assert(!CONFIRM_REQUIRED_METHODS.includes("edit.features.applyPatch"), "既有局部 Feature patch 不应被追加确认门禁");

const [appSource, consoleSource, controllerSource, panelSource, lakePanelSource, lakeEditSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/console-api.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/panels/feature-panel.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/FeaturePanel.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/LakePanel.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/lake-edit-commands.js", import.meta.url), "utf8")
]);

for (const method of ["inspectTopology", "applyTopology"]) {
  assert(consoleSource.includes(`${method}: (options = {}) => apiCall(() => requireApiAction(actions.edit?.features?.${method}, "edit.features.${method}")(options))`), `Console API ${method} 没有原样汇入 runtime action`);
}
assert.match(appSource, /onTopologyInspect: options => state\.runtimeActions\.edit\.features\.inspectTopology\(options\)/, "Feature 面板预检未走公共 runtime action");
assert.match(appSource, /onTopologyApply: options => state\.runtimeActions\.edit\.features\.applyTopology\(options\)/, "Feature 面板提交未走公共 runtime action");
assert.match(appSource, /FEATURE_TOPOLOGY_SELECT: "feature:topology-select"/, "缺少 Feature 拓扑画布模式");
assert.match(appSource, /setHeightTransformPreview\?\.\(changes/, "Feature 拓扑预览未使用 renderer-only 高度预览");
const topologyPreviewSource = appSource.slice(
  appSource.indexOf("function previewFeatureTopologyDraft"),
  appSource.indexOf("function clearFeatureTopologyPreview")
);
assert(!topologyPreviewSource.includes("applyHeightBrushPreview("), "Feature 拓扑预览不得临时改写地图高度");
for (const token of ["setTopologyCell", "clearTopologyDraft", "setTopologySelectMode", "getTopologyDraft", "getSelectedFeatureId", "setSelectedFeatureId"]) {
  assert(controllerSource.includes(token), `Feature controller 缺少 ${token}`);
}
assert(panelSource.includes("feature => feature && !feature.removed"), "Feature 表格仍会显示 tombstone");
assert(panelSource.includes("确认应用拓扑修改"), "Feature 面板缺少显式确认动作");
assert(panelSource.includes("整湖填平沿用湖泊面板"), "Feature 面板没有说明整湖填平的既有入口");
assert(lakePanelSource.includes("填平并删除选中湖泊"), "既有湖泊面板缺少整湖填平入口");
assert(lakeEditSource.includes("export function createDeleteLakeCommand"), "整湖填平没有复用完整湖泊删除命令");
for (const mode of ["carve-coast", "reclaim-coast", "open-strait", "close-strait", "open-lake-to-sea"]) {
  assert(panelSource.includes(mode), `Feature 面板缺少 ${mode}`);
}

const dynamic = await testDynamicRuntime();

console.log(JSON.stringify({
  ok: true,
  methods: ["edit.features.inspectTopology", "edit.features.applyTopology"],
  methodCounts: {
    total: Object.values(API_METHODS).reduce((sum, methods) => sum + methods.length, 0),
    edit: API_METHODS.edit.length
  },
  confirmation: "edit.features.applyTopology",
  dynamic
}, null, 2));

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
    for (const name of ["inspectFeatureTopologyViaApi", "applyFeatureTopologyViaApi", "executeHistoryCommand"]) {
      assert.equal(typeof appRuntime[name], "function", `动态加载缺少 ${name}`);
    }
    assert.equal(typeof consoleRuntime.installConsoleApi, "function", "动态加载缺少 installConsoleApi");

    const seed = "feature-topology-ui-api";
    const uiMap = generatePlaceholderMap({seed, cellsTarget: 3000, heightmapTemplate: "continents"});
    const apiMap = generatePlaceholderMap({seed, cellsTarget: 3000, heightmapTemplate: "continents"});
    const input = findValidCarve(uiMap);
    const sourceFeatureId = sourcePackFeatureId(uiMap, input.gridCells);
    assert(Number.isInteger(sourceFeatureId) && sourceFeatureId > 0, "无法解析 Feature 拓扑源对象");
    assert.equal(inspectFeatureTopology(apiMap, input).valid, true, "同 seed API 地图未复现合法海岸雕刻输入");

    const ui = createHarness(uiMap, appRuntime, consoleRuntime, sourceFeatureId);
    const api = createHarness(apiMap, appRuntime, consoleRuntime, sourceFeatureId);
    const beforeUi = mapDigest(uiMap);
    const beforeApi = mapDigest(apiMap);
    assert.deepEqual(beforeApi, beforeUi, "UI/API 同 seed 初始地图不一致");

    const inspectedUi = ui.actions.edit.features.inspectTopology(input);
    const inspectedApi = api.api.edit.features.inspectTopology(input);
    assert.equal(inspectedUi.valid, true);
    assert.equal(inspectedApi.ok, true);
    assert.deepEqual(inspectedApi.data, inspectedUi, "UI/API 预检结果不一致");
    assert.deepEqual(mapDigest(uiMap), beforeUi, "UI 预检修改了地图");
    assert.deepEqual(mapDigest(apiMap), beforeApi, "Console 预检修改了地图");
    assert.equal(ui.state.editHistory.getStats().undo, 0);
    assert.equal(api.state.editHistory.getStats().undo, 0);

    const missingConfirm = api.api.edit.features.applyTopology(input);
    assert.equal(missingConfirm.ok, false, "缺少 confirm 的 Feature 拓扑提交未被拒绝");
    assert.match(missingConfirm.error.message, /confirm|显式/);
    assert.deepEqual(mapDigest(apiMap), beforeApi, "缺少 confirm 的请求修改了地图");
    assert.equal(api.state.editHistory.getStats().undo, 0);

    const uiApplied = ui.actions.edit.features.applyTopology({...input, confirm: true});
    const apiApplied = api.api.edit.features.applyTopology({...input, confirm: true});
    assert.equal(uiApplied.executed, true, uiApplied.error?.message);
    assert.equal(apiApplied.ok, true, apiApplied.error?.message);
    assert.equal(apiApplied.data.executed, true, apiApplied.data.error?.message);
    assert.equal(ui.state.editHistory.getStats().undo, 1, "UI 提交没有形成一条历史");
    assert.equal(api.state.editHistory.getStats().undo, 1, "Console 提交没有形成一条历史");
    assert.equal(ui.panel.selectedFeatureId, uiApplied.result.selectionTarget.id, "UI 提交后没有切换到结果 Feature");
    assert.equal(api.panel.selectedFeatureId, apiApplied.data.result.selectionTarget.id, "Console 提交后没有切换到结果 Feature");
    const afterUi = mapDigest(uiMap);
    const afterApi = mapDigest(apiMap);
    assert.notDeepEqual(afterUi, beforeUi, "合法 Feature 拓扑提交没有修改地图");
    assert.deepEqual(afterApi, afterUi, "UI/Console 提交后的地图不一致");
    assert.deepEqual(apiApplied.data.result, uiApplied.result, "UI/Console 提交结果不一致");

    const selectedAfterApply = api.panel.selectedFeatureId;
    const undo = api.api.history.undo();
    assert.equal(undo.ok, true);
    assert.equal(undo.data.executed, true);
    assert.deepEqual(mapDigest(apiMap), beforeApi, "Feature 拓扑撤销未精确恢复地图");
    assert.equal(api.panel.selectedFeatureId, api.panel.initialFeatureId, "Feature 拓扑撤销未恢复面板目标");
    const redo = api.api.history.redo();
    assert.equal(redo.ok, true);
    assert.equal(redo.data.executed, true);
    assert.deepEqual(mapDigest(apiMap), afterApi, "Feature 拓扑重做未精确恢复地图");
    assert.equal(api.panel.selectedFeatureId, selectedAfterApply, "Feature 拓扑重做未恢复面板目标");
    assert.equal(api.panel.setSelectedCalls, 3, "Feature 面板目标应只在 apply / undo / redo 各同步一次");

    const legacyPayload = {lakeId: 1, target: "land", packCell: 2};
    const legacyPatch = api.api.edit.features.applyPatch(legacyPayload);
    assert.equal(legacyPatch.ok, true, "既有 Feature patch API 不可调用");
    assert.deepEqual(api.legacyPatchCalls.at(-1), legacyPayload, "既有 Feature patch 参数没有原样转发");
    assert.equal(api.state.editHistory.getStats().undo, 1, "Feature patch spy 不应污染拓扑历史");

    return {
      input,
      history: api.state.editHistory.getStats(),
      selectedAfterApply,
      panelRestores: api.panel.setSelectedCalls,
      legacyPatchForwarded: true
    };
  } finally {
    await server.close();
  }
}

function createHarness(map, appRuntime, consoleRuntime, initialFeatureId) {
  const panel = {
    initialFeatureId,
    selectedFeatureId: initialFeatureId,
    setSelectedCalls: 0,
    clearCalls: 0,
    isOpen() { return false; },
    getSelectedFeatureId() { return this.selectedFeatureId; },
    setSelectedFeatureId(featureId) {
      this.selectedFeatureId = featureId;
      this.setSelectedCalls += 1;
    },
    clearTopologyDraft() { this.clearCalls += 1; }
  };
  const renderer = {
    objectHighlights: [],
    setObjectHighlights(objects) { this.objectHighlights = objects.map(object => ({...object})); },
    clearHeightTransformPreview() {},
    clearHeightCellSelection() {}
  };
  const state = {
    map,
    editHistory: new EditHistory(),
    editRefreshScheduler: {run() {}},
    selection: null,
    editingObject: null,
    renderer,
    panels: {feature: panel},
    featureTopology: {active: false},
    canvasToolModes: {getActive() { return null; }}
  };
  state.selectionStore = new SelectionStore(snapshot => {
    state.selection = snapshot.selection;
    state.editingObject = snapshot.editingObject;
  }, object => resolveObject(state.map, object));
  const documentRef = {
    defaultView: {},
    dispatchEvent() {},
    getElementById() { return null; }
  };
  const runtimeUi = {updateRuntimePanel() {}, updateEditingInteractionLock() {}};
  const historyOptions = {refresh() {}, refreshPanels: false, updateEditingInteractionLock() {}};
  const legacyPatchCalls = [];
  const actions = {
    history: {
      undo: () => appRuntime.executeHistoryCommand(state, documentRef, "undo", historyOptions),
      redo: () => appRuntime.executeHistoryCommand(state, documentRef, "redo", historyOptions)
    },
    edit: {
      features: {
        inspectTopology: options => appRuntime.inspectFeatureTopologyViaApi(state, options),
        applyTopology: options => appRuntime.applyFeatureTopologyViaApi(state, documentRef, options, runtimeUi),
        inspectPatch: options => ({valid: true, options}),
        applyPatch: options => {
          legacyPatchCalls.push(structuredClone(options));
          return {executed: false, noop: true, options};
        }
      }
    }
  };
  const api = consoleRuntime.installConsoleApi(documentRef, state, {actions});
  return {state, panel, actions, api, legacyPatchCalls};
}

function findValidCarve(map) {
  for (const gridCell of map.grid.cells.i || map.grid.cells.h.map((_, index) => index)) {
    const input = {mode: "carve-coast", gridCells: [Number(gridCell)]};
    if (inspectFeatureTopology(map, input).valid) return input;
  }
  throw new Error("动态回归找不到合法的单 cell 海岸雕刻输入");
}

function sourcePackFeatureId(map, gridCells) {
  const selected = new Set(gridCells.map(Number));
  for (let packCell = 0; packCell < (map.pack?.cells?.g?.length || 0); packCell++) {
    if (!selected.has(Number(map.pack.cells.g[packCell]))) continue;
    const featureId = Number(map.pack.cells.f?.[packCell]);
    if (Number.isInteger(featureId) && featureId > 0) return featureId;
  }
  return null;
}

function mapDigest(map) {
  return {
    gridH: Array.from(map.grid.cells.h || []),
    gridF: Array.from(map.grid.cells.f || []),
    packH: Array.from(map.pack.cells.h || []),
    packF: Array.from(map.pack.cells.f || []),
    packType: Array.from(map.pack.cells.type || []),
    gridFeatures: featureDigest(map.features?.features),
    packFeatures: featureDigest(map.pack?.features),
    shore: structuredClone(map.features?.shore || {}),
    stale: staleDigest(map.metadata?.derivedStale || map.metadata?.derived?.stale || {})
  };
}

function featureDigest(features) {
  return (features || []).map(feature => feature ? {
    i: feature.i ?? feature.id,
    type: feature.type,
    group: feature.group,
    land: feature.land,
    border: feature.border,
    cells: feature.cells,
    firstCell: feature.firstCell,
    removed: Boolean(feature.removed),
    redirect: feature.redirect ?? feature.redirectTo ?? null
  } : null);
}

function staleDigest(stale) {
  const snapshot = structuredClone(stale || {});
  delete snapshot.updatedAt;
  return snapshot;
}
