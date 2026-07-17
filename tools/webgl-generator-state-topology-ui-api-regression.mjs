#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {createServer as createViteServer} from "vite";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {API_METHODS, CONFIRM_REQUIRED_METHODS} from "../app/webgl-generator/src/runtime/api-contract.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {resolveObject} from "../app/webgl-generator/src/runtime/object-resolver.js";
import {SelectionStore} from "../app/webgl-generator/src/runtime/selection-store.js";
import {inspectStateMerge, inspectStateSplit} from "../app/webgl-generator/src/runtime/state-topology-commands.js";

const samples = [
  ["inspectMerge", {survivorStateId: 1, victimStateId: 2}],
  ["merge", {survivorStateId: 1, victimStateId: 2, confirm: true}],
  ["inspectSplit", {sourceStateId: 1, selectedProvinceIds: [3], newCapitalCityId: 4}],
  ["split", {sourceStateId: 1, selectedProvinceIds: [3], newCapitalCityId: 4, name: "新国", confirm: true}]
];

for (const method of ["states.inspectMerge", "states.merge", "states.inspectSplit", "states.split"]) {
  assert(API_METHODS.edit.includes(method), `稳定 API 目录缺少 ${method}`);
}
assert(CONFIRM_REQUIRED_METHODS.includes("edit.states.merge"));
assert(CONFIRM_REQUIRED_METHODS.includes("edit.states.split"));
assert(!CONFIRM_REQUIRED_METHODS.includes("edit.states.inspectMerge"));
assert(!CONFIRM_REQUIRED_METHODS.includes("edit.states.inspectSplit"));

const [appSource, consoleApiSource, controllerSource, panelSource, topologySource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/console-api.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/panels/state-panel.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/StatePanel.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/state-topology-commands.js", import.meta.url), "utf8")
]);
for (const [method] of samples) {
  assert(consoleApiSource.includes(`${method}: (options = {}) => apiCall(() => requireApiAction(actions.edit?.states?.${method}, "edit.states.${method}")(options))`), `console API ${method} 没有原样汇入 runtime action`);
}
for (const signature of [
  "inspectMerge: options => inspectStateMergeViaApi",
  "merge: options => mergeStatesViaApi",
  "inspectSplit: options => inspectStateSplitViaApi",
  "split: options => splitStateViaApi"
]) assert(appSource.includes(signature), `runtime action 缺少 ${signature}`);
assert.match(appSource, /preparePanelRefresh: \(targetState, executed, topologyResult\) => applyStateTopologyUiResult/);
assert.match(appSource, /if \(command\.domain === "state-topology"\) synchronizeStateTopologyHistoryUi\(state, command, action\);/);
assert.equal((appSource.match(/synchronizeStateTopologyHistoryUi\(/g) || []).length, 2, "拓扑历史 UI 同步只能由通用 history 调用一次");
for (const token of ["selectionTarget", "redirects", "topologyRefresh", "objectHighlights", "startEditing"]) {
  assert(appSource.includes(token), `app 未消费拓扑结果字段：${token}`);
}
for (const callback of ["onInspectMerge", "onMerge", "onInspectSplit", "onSplit"]) {
  assert(controllerSource.includes(callback), `国家面板 controller 缺少 ${callback}`);
  assert(panelSource.includes(callback), `国家面板 Vue 缺少 ${callback}`);
}
for (const token of ["topologySourceStateId", "splitProvinceIds", "splitCapitalCityId", "topologyInspection", "确认合并", "确认拆分"]) {
  assert(panelSource.includes(token), `国家面板拓扑闭环缺少 ${token}`);
}
assert.match(panelSource, /if \(!topologyActionActive\(\)\) activeAction\.value = null;/, "selection 变化仍会关闭并扭曲拓扑配置");
assert.match(panelSource, /@update:model-value="updateMergeSurvivorState"/);
assert.match(panelSource, /@update:model-value="updateSplitCapitalCity"/);
assert(!panelSource.includes("updateTopologyValue("), "不得把模板中自动解包的 ref 传给通用 setter");
for (const effect of ["cell-colors", "political-boundaries", "point-layers", "labels", "object-index", "object-panels"]) {
  assert(topologySource.includes(`"${effect}"`), `国家拓扑 effects 缺少 ${effect}`);
}
assert(!API_METHODS.edit.some(method => /repartition|reprovince/i.test(method)), "不得新增独立分省公开 API");

const dynamic = await testDynamicRuntime();

console.log(JSON.stringify({
  ok: true,
  methods: samples.map(([method]) => `edit.states.${method}`),
  totalMethods: Object.values(API_METHODS).reduce((sum, methods) => sum + methods.length, 0),
  editMethods: API_METHODS.edit.length,
  confirmation: ["edit.states.merge", "edit.states.split"],
  ui: {sourceLocked: true, explicitPreview: true, explicitCommit: true},
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
    const runtime = {
      executeHistoryCommand: appRuntime.executeHistoryCommand,
      executeStateTopologyViaApi: appRuntime.executeStateTopologyViaApi,
      installConsoleApi: consoleRuntime.installConsoleApi
    };
    for (const [name, value] of Object.entries(runtime)) assert.equal(typeof value, "function", `动态加载缺少 ${name}`);
    const merge = testMergeHistoryClosure(runtime);
    const split = testMultiProvinceSplit(runtime);
    const invalid = testInvalidInputs(runtime);
    const ordinaryDomain = testOrdinaryDomainIsolation(runtime);
    return {merge, split, invalid, ordinaryDomain};
  } finally {
    await server.close();
  }
}

function testMergeHistoryClosure(runtime) {
  const map = createDynamicMap("state-topology-ui-api-merge");
  const input = findMergeInput(map);
  const {state, api, panel} = createApiHarness(map, runtime, input.victimStateId);
  setUiObjects(state, input.victimStateId);

  const executed = api.edit.states.merge({...input, confirm: true});
  assert.equal(executed.ok, true);
  assert.equal(executed.data.executed, true);
  assertUiObjects(state, panel, input.survivorStateId, "合并执行");
  assert.equal(state.editHistory.getStats().undo, 1);

  const undo = api.history.undo();
  assert.equal(undo.ok, true, undo.error?.message);
  assert.equal(undo.data.executed, true);
  assertUiObjects(state, panel, input.victimStateId, "合并撤销");

  const redo = api.history.redo();
  assert.equal(redo.ok, true, redo.error?.message);
  assert.equal(redo.data.executed, true);
  assertUiObjects(state, panel, input.survivorStateId, "合并重做");
  assert.equal(panel.setCalls, 3, "合并 execute / undo / redo 应各同步一次面板，不能重复");
  return {survivorStateId: input.survivorStateId, victimStateId: input.victimStateId, panelSyncs: panel.setCalls};
}

function testMultiProvinceSplit(runtime) {
  const map = createDynamicMap("state-topology-ui-api-split");
  const input = findMultiProvinceSplitInput(map);
  const {state, api, panel, observed} = createApiHarness(map, runtime, input.sourceStateId);
  state.selectionStore.setSelection({object: {kind: "state", id: input.sourceStateId}});

  const executed = api.edit.states.split({...input, name: "多省拆分回归国", confirm: true});
  assert.equal(executed.ok, true);
  assert.equal(executed.data.executed, true);
  assert.deepEqual(observed.split.selectedProvinceIds, input.selectedProvinceIds, "多省 split 请求必须完整传入 runtime action");
  const newStateId = executed.data.result.selectionTarget.id;
  assert.equal(state.selection?.object?.id, newStateId);
  assert.equal(panel.targetStateId, newStateId);
  assert(input.selectedProvinceIds.length > 1);

  assert.equal(api.history.undo().data.executed, true);
  assert.equal(state.selection?.object?.id, input.sourceStateId);
  assert.equal(panel.targetStateId, input.sourceStateId);
  assert.equal(api.history.redo().data.executed, true);
  assert.equal(state.selection?.object?.id, newStateId);
  assert.equal(panel.targetStateId, newStateId);
  return {sourceStateId: input.sourceStateId, newStateId, selectedProvinceIds: input.selectedProvinceIds};
}

function testInvalidInputs(runtime) {
  const map = createDynamicMap("state-topology-ui-api-invalid");
  const input = findMergeInput(map);
  const {state, api, panel, actions} = createApiHarness(map, runtime, input.victimStateId);
  setUiObjects(state, input.victimStateId);
  const before = uiDigest(state, panel);

  const uiInvalid = actions.edit.states.merge({survivorStateId: input.survivorStateId, victimStateId: input.survivorStateId, confirm: true});
  assert.equal(uiInvalid.executed, false);
  assert.equal(state.editHistory.getStats().undo, 0, "非法 UI runtime 输入不得进入历史");
  assert.deepEqual(uiDigest(state, panel), before, "非法 UI runtime 输入不得修改选择、高亮、编辑目标或面板");

  const apiInvalid = api.edit.states.merge(input);
  assert.equal(apiInvalid.ok, false, "缺少 confirm 的 API 输入必须拒绝");
  assert.equal(state.editHistory.getStats().undo, 0, "非法 API 输入不得进入历史");
  assert.deepEqual(uiDigest(state, panel), before, "非法 API 输入不得修改 UI 状态");
  return {uiNoop: uiInvalid.noop, apiError: apiInvalid.error.message, history: state.editHistory.getStats().undo};
}

function testOrdinaryDomainIsolation(runtime) {
  const map = createDynamicMap("state-topology-ui-api-ordinary");
  const stateId = map.politics.states.find(item => item?.i && !item.removed).i;
  const {state, api, panel} = createApiHarness(map, runtime, stateId);
  setUiObjects(state, stateId);
  const before = uiDigest(state, panel);
  state.editHistory.execute({
    label: "普通领域回归",
    domain: "state",
    effects: {render: "none", selection: "none", derived: []},
    apply() {},
    revert() {}
  }, {map});
  assert.equal(api.history.undo().data.executed, true);
  assert.deepEqual(uiDigest(state, panel), before, "普通 domain 的历史不得触发拓扑 UI 同步");
  assert.equal(panel.setCalls, 0);
  return {stateId, panelSyncs: panel.setCalls};
}

function createApiHarness(map, runtime, initialStateId) {
  const panel = {
    targetStateId: initialStateId,
    setCalls: 0,
    setTargetStateId(stateId) {
      this.targetStateId = stateId;
      this.setCalls += 1;
    },
    getBrush() {
      return {targetStateId: this.targetStateId};
    },
    isOpen() {
      return false;
    }
  };
  const renderer = {
    objectHighlights: [],
    setObjectHighlights(objects) {
      this.objectHighlights = objects.map(object => ({...object}));
    }
  };
  const state = {
    map,
    editHistory: new EditHistory(),
    editRefreshScheduler: {run() {}},
    selection: null,
    editingObject: null,
    panels: {state: panel},
    renderer,
    stateEdit: {sourceStateId: initialStateId, lastAffected: 0, lastPointer: null}
  };
  state.selectionStore = new SelectionStore(snapshot => {
    state.selection = snapshot.selection;
    state.editingObject = snapshot.editingObject;
  }, object => resolveObject(state.map, object));
  const documentRef = {
    defaultView: {},
    dispatchEvent() {},
    getElementById() {
      return null;
    }
  };
  const noRuntimeUi = {updateRuntimePanel() {}, updateEditingInteractionLock() {}};
  const historyOptions = {refresh() {}, refreshPanels: false, updateEditingInteractionLock() {}};
  const observed = {merge: null, split: null};
  const actions = {
    history: {
      undo: () => runtime.executeHistoryCommand(state, documentRef, "undo", historyOptions),
      redo: () => runtime.executeHistoryCommand(state, documentRef, "redo", historyOptions)
    },
    edit: {
      states: {
        merge: options => {
          observed.merge = structuredClone(options);
          return runtime.executeStateTopologyViaApi(state, documentRef, "merge", options, noRuntimeUi);
        },
        split: options => {
          observed.split = structuredClone(options);
          return runtime.executeStateTopologyViaApi(state, documentRef, "split", options, noRuntimeUi);
        }
      }
    }
  };
  const api = runtime.installConsoleApi(documentRef, state, {actions});
  return {state, api, panel, observed, actions};
}

function setUiObjects(state, stateId) {
  const object = {kind: "state", id: stateId};
  state.selectionStore.setSelection({object});
  state.selectionStore.startEditing(object, {select: false});
  state.renderer.setObjectHighlights([object]);
}

function assertUiObjects(state, panel, stateId, label) {
  assert.equal(state.selection?.object?.id, stateId, `${label} selection`);
  assert.equal(state.editingObject?.id, stateId, `${label} editingObject`);
  assert.deepEqual(state.renderer.objectHighlights.map(object => object.id), [stateId], `${label} highlights`);
  assert.equal(panel.targetStateId, stateId, `${label} panel target`);
}

function uiDigest(state, panel) {
  return {
    selection: state.selection?.object ? {kind: state.selection.object.kind, id: state.selection.object.id} : null,
    editingObject: state.editingObject ? {kind: state.editingObject.kind, id: state.editingObject.id} : null,
    highlights: state.renderer.objectHighlights.map(object => ({kind: object.kind, id: object.id})),
    panelStateId: panel.targetStateId,
    sourceStateId: state.stateEdit.sourceStateId
  };
}

function createDynamicMap(seed) {
  return generatePlaceholderMap({seed, cellsTarget: 3000, heightmapTemplate: "continents"});
}

function findMergeInput(map) {
  for (const state of map.politics.states || []) {
    if (!state?.i || state.removed) continue;
    for (const neighbor of state.neighbors || []) {
      const input = {survivorStateId: state.i, victimStateId: Number(neighbor)};
      if (inspectStateMerge(map, input).valid) return input;
    }
  }
  throw new Error("动态回归找不到可合并国家");
}

function findMultiProvinceSplitInput(map) {
  for (const state of map.politics.states || []) {
    if (!state?.i || state.removed) continue;
    const provinceIds = (map.politics.provinces || [])
      .filter(province => province && !province.removed && Number(province.state) === state.i)
      .map(province => Number(province.i ?? province.id));
    for (let first = 0; first < provinceIds.length; first += 1) {
      for (let second = first + 1; second < provinceIds.length; second += 1) {
        const selectedProvinceIds = [provinceIds[first], provinceIds[second]];
        const capitals = (map.settlements.cities || []).filter(city => city && selectedProvinceIds.includes(Number(city.province)));
        for (const city of capitals) {
          const input = {sourceStateId: state.i, selectedProvinceIds, newCapitalCityId: city.id};
          if (inspectStateSplit(map, input).valid) return input;
        }
      }
    }
  }
  throw new Error("动态回归找不到可执行的多省拆分请求");
}
