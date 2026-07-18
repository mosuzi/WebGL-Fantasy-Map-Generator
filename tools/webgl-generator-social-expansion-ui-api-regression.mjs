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

for (const method of ["cultures.inspectExpansion", "cultures.applyExpansion", "religions.inspectExpansion", "religions.applyExpansion"]) {
  assert(API_METHODS.edit.includes(method), `稳定 API 目录缺少 ${method}`);
}
assert.equal(Object.values(API_METHODS).reduce((sum, methods) => sum + methods.length, 0), 208);
assert.equal(API_METHODS.edit.length, 110);
assert(!CONFIRM_REQUIRED_METHODS.includes("edit.cultures.inspectExpansion"), "文化扩张只读预检不应要求确认");
assert(!CONFIRM_REQUIRED_METHODS.includes("edit.religions.inspectExpansion"), "宗教扩张只读预检不应要求确认");

const [appSource, consoleSource, cultureController, religionController, culturePanel, religionPanel] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/console-api.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/panels/culture-panel.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/panels/religion-panel.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/CulturePanel.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/ReligionPanel.vue", import.meta.url), "utf8")
]);

for (const kind of ["cultures", "religions"]) {
  for (const method of ["inspectExpansion", "applyExpansion"]) {
    assert(consoleSource.includes(`actions.edit?.${kind}?.${method}`), `Console API 缺少 ${kind}.${method} 动态转发`);
    assert(appSource.includes(`state.runtimeActions.edit.${kind}.${method}`), `面板未通过公共 runtime action 调用 ${kind}.${method}`);
  }
}
assert(consoleSource.includes('conditionalConfirm: "mode=reexpand"'), "API metadata 缺少重扩条件确认声明");
for (const token of ["CULTURE_CENTER", "RELIGION_CENTER", "setExpansionCenter", "centerPickActive"]) assert(appSource.includes(token) || cultureController.includes(token) || religionController.includes(token), `中心单次拾取缺少 ${token}`);
for (const source of [culturePanel, religionPanel]) {
  for (const text of ["中心与扩张", "从画布拾取一次", "只读预检", "仅保存", "确认并重新扩张"]) assert(source.includes(text), `社会扩张面板缺少“${text}”`);
  assert(source.includes("UiActionDock"), "社会扩张编辑没有复用 UiActionDock");
  assert(source.includes("onExpansionDraftChange"), "扩张草稿变化后没有清除过期预检");
}
assert(culturePanel.includes("同事务联动宗教（默认关闭）"), "文化面板缺少默认关闭的宗教联动开关");
assert(religionPanel.includes("Folk 固定为文化范围"), "宗教面板缺少 Folk 固定规则提示");

const dynamic = await testDynamicRuntime();
console.log(JSON.stringify({ok: true, methodCounts: {total: 208, edit: 110}, dynamic}, null, 2));

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
    for (const name of ["inspectSocialExpansionViaApi", "applySocialExpansionViaApi", "executeHistoryCommand"]) assert.equal(typeof appRuntime[name], "function", `动态加载缺少 ${name}`);

    const seed = "social-expansion-ui-api";
    const uiMap = generatePlaceholderMap({seed, cellsTarget: 3000, heightmapTemplate: "continents", culturesNumber: 8, religionsNumber: 4});
    const apiMap = generatePlaceholderMap({seed, cellsTarget: 3000, heightmapTemplate: "continents", culturesNumber: 8, religionsNumber: 4});
    const cultureId = uiMap.society.cultures.find(item => item?.i)?.i;
    const religionId = uiMap.society.religions.find(item => item?.i && item.type !== "Folk")?.i;
    assert(cultureId && religionId, "动态回归缺少文化或非 Folk 宗教");
    const ui = createHarness(uiMap, appRuntime, consoleRuntime);
    const api = createHarness(apiMap, appRuntime, consoleRuntime);

    const cultureOptions = {mode: "save", expansionism: 2.3};
    const uiInspect = ui.actions.edit.cultures.inspectExpansion(cultureId, cultureOptions);
    const apiInspect = api.api.edit.cultures.inspectExpansion(cultureId, cultureOptions);
    assert.equal(apiInspect.ok, true);
    assert.deepEqual(apiInspect.data, uiInspect, "文化 UI/API 预检结果不一致");
    assert.equal(ui.state.editHistory.getStats().undo, 0, "UI 预检污染历史");
    assert.equal(api.state.editHistory.getStats().undo, 0, "API 预检污染历史");

    const uiSave = ui.actions.edit.cultures.applyExpansion(cultureId, cultureOptions);
    const apiSave = api.api.edit.cultures.applyExpansion(cultureId, cultureOptions);
    assert.equal(uiSave.executed, true, uiSave.error?.message);
    assert.equal(apiSave.ok, true, apiSave.error?.message);
    assert.equal(apiSave.data.executed, true, apiSave.data.error?.message);
    assert.deepEqual(mapDigest(apiMap), mapDigest(uiMap), "文化 save 的 UI/API 地图结果不一致");

    const missingConfirm = api.api.edit.religions.applyExpansion(religionId, {mode: "reexpand", expansion: "global", expansionism: 8});
    assert.equal(missingConfirm.ok, false, "宗教重扩缺少 confirm 未被拒绝");
    assert.match(missingConfirm.error.message, /confirm|显式/);
    const beforeReligion = mapDigest(apiMap);
    const inspectedReligion = api.api.edit.religions.inspectExpansion(religionId, {mode: "reexpand", expansion: "global", expansionism: 8});
    assert.equal(inspectedReligion.ok, true);
    const appliedReligion = api.api.edit.religions.applyExpansion(religionId, {mode: "reexpand", expansion: "global", expansionism: 8, confirm: true});
    assert.equal(appliedReligion.ok, true, appliedReligion.error?.message);
    assert.equal(appliedReligion.data.executed, true, appliedReligion.data.error?.message);
    assert.notDeepEqual(mapDigest(apiMap), beforeReligion, "宗教重扩没有修改地图");
    assert.equal(api.state.editHistory.getStats().undo, 2, "文化 save 与宗教重扩没有各形成一条历史");
    return {cultureId, religionId, history: api.state.editHistory.getStats(), conditionalConfirm: true, uiApiConverged: true};
  } finally {
    await server.close();
  }
}

function createHarness(map, appRuntime, consoleRuntime) {
  const state = {
    map,
    editHistory: new EditHistory(),
    editRefreshScheduler: {run() {}},
    selection: null,
    editingObject: null,
    renderer: {objectHighlights: []},
    panels: {},
    canvasToolModes: {getActive() { return null; }}
  };
  state.selectionStore = new SelectionStore(snapshot => {
    state.selection = snapshot.selection;
    state.editingObject = snapshot.editingObject;
  }, object => resolveObject(state.map, object));
  const documentRef = {defaultView: {}, dispatchEvent() {}, getElementById() { return null; }};
  const runtimeUi = {refresh() {}, refreshPanels: false, updateRuntimePanel() {}, updateEditingInteractionLock() {}};
  const actions = {
    history: {
      undo: () => appRuntime.executeHistoryCommand(state, documentRef, "undo", runtimeUi),
      redo: () => appRuntime.executeHistoryCommand(state, documentRef, "redo", runtimeUi)
    },
    edit: {
      cultures: {
        inspectExpansion: (id, options) => appRuntime.inspectSocialExpansionViaApi(state, "culture", id, options),
        applyExpansion: (id, options) => appRuntime.applySocialExpansionViaApi(state, documentRef, "culture", id, options, runtimeUi)
      },
      religions: {
        inspectExpansion: (id, options) => appRuntime.inspectSocialExpansionViaApi(state, "religion", id, options),
        applyExpansion: (id, options) => appRuntime.applySocialExpansionViaApi(state, documentRef, "religion", id, options, runtimeUi)
      }
    }
  };
  const api = consoleRuntime.installConsoleApi(documentRef, state, {actions});
  return {state, actions, api};
}

function mapDigest(map) {
  const metadata = structuredClone(map.society.metadata || {});
  if (metadata.updatedAt) delete metadata.updatedAt;
  delete metadata.cultureTiming;
  delete metadata.buildMs;
  delete metadata.religionBuildMs;
  const stale = structuredClone(map.metadata.derivedStale || null);
  if (stale) delete stale.updatedAt;
  return {
    packCulture: [...map.pack.cells.culture],
    packReligion: [...map.pack.cells.religion],
    gridCulture: [...map.grid.cells.culture],
    gridReligion: [...map.grid.cells.religion],
    cultures: map.society.cultures,
    religions: map.society.religions,
    metadata,
    stale
  };
}
