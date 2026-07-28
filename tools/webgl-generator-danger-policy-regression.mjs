import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {API_METHODS, CONFIRM_REQUIRED_METHODS} from "../app/webgl-generator/src/runtime/api-contract.js";
import {apiCall} from "../app/webgl-generator/src/runtime/api-result.js";
import {createDeleteConfirmationRequiredError, inspectDeleteImpact} from "../app/webgl-generator/src/runtime/delete-impact.js";
import {OBJECT_KIND} from "../app/webgl-generator/src/runtime/object-kinds.js";

const [appSource, consoleApiSource, heightPanelSource, heightComponentSource, controlPanelSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/console-api.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/panels/height-panel.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/HeightPanel.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/ControlPanel.vue", import.meta.url), "utf8")
]);

const highImpactMethods = [
  "edit.states.delete",
  "edit.provinces.delete",
  "edit.cities.delete",
  "edit.cultures.delete",
  "edit.religions.delete",
  "edit.rivers.delete",
  "edit.lakes.delete",
  "edit.notes.deleteBatch",
  "edit.military.clearBattleEvents",
  "namebases.delete",
  "namebases.clear"
];
for (const method of highImpactMethods) {
  assert(CONFIRM_REQUIRED_METHODS.includes(method), `${method} 缺少显式确认元数据`);
}
for (const method of [
  "edit.routes.delete",
  "edit.markers.delete",
  "edit.labels.delete",
  "edit.notes.delete",
  "edit.measurements.delete",
  "edit.zones.delete"
]) {
  assert(!CONFIRM_REQUIRED_METHODS.includes(method), `${method} 不得统一升级为强制确认`);
}

const preview = inspectDeleteImpact({
  politics: {states: [null, {id: 1, name: "测试国", culture: 0, religion: 0}], provinces: [null]},
  society: {cultures: [{name: "中立"}], religions: [{name: "无"}]},
  settlements: {cities: []},
  grid: {cells: {state: [1]}},
  pack: {cells: {state: [1]}},
  notes: {notes: []}
}, OBJECT_KIND.STATE, [1]);
const failure = apiCall(() => {
  throw createDeleteConfirmationRequiredError(preview);
});
assert.equal(preview.impactLevel, "high", "国家删除影响等级必须可判定为 high");
assert.equal(failure.ok, false);
assert.equal(failure.error.code, "confirmation_required");
assert.deepEqual(failure.error.preview, preview);
assert.deepEqual(failure.error.details.preview, preview);
assert.doesNotThrow(() => JSON.stringify(failure), "确认拒绝必须可序列化");

const lowImpactRoutePreview = inspectDeleteImpact({
  settlements: {
    routes: [{id: 7, points: [[0, 0], [1, 1]], packCells: [3, 4]}]
  },
  notes: {notes: []}
}, OBJECT_KIND.ROUTE, [7]);
assert.equal(lowImpactRoutePreview.requiresConfirm, false, "普通单路线删除不得被自身几何升级为确认");
assert.equal(lowImpactRoutePreview.impactLevel, "low", "普通单路线删除必须保持低影响");

for (const kind of ["cities", "provinces", "states", "cultures", "religions", "routes", "rivers", "lakes"]) {
  assert.match(consoleApiSource, new RegExp(`${kind}[\\s\\S]{0,520}?delete: \\([^\\n]+options = \\{\\}`), `${kind}.delete 控制台 API 缺少可选 options`);
}
assert.match(appSource, /function deleteApiResult[\s\S]*?summary\.subresults\[0\]\.result[\s\S]*?deleteSummary/, "单对象删除没有保留旧 result 并追加 deleteSummary");

for (const mode of ["STATE_DELETE", "PROVINCE_DELETE", "CITY_DELETE"]) {
  const block = sourceAround(appSource, `CANVAS_TOOL_MODE.${mode}`, 2400);
  assert.match(block, /executeDeleteWithPreflight/, `${mode} 画布删除没有接入统一预检执行器`);
}

assert.match(appSource, /deleteNamebaseViaAction[\s\S]*?confirmation === "explicit"[\s\S]*?createDeleteConfirmationRequiredError/, "名称库 UI/API 没有共用确认 action");
assert.match(appSource, /impactLevel: "medium"[\s\S]*?function clearNamebasesViaApi[\s\S]*?impactLevel: "high"/, "名称库删除/清空缺少稳定 medium/high 影响等级");
assert.match(heightPanelSource, /confirm\(`确定删除用户模板[\s\S]*?saveHeightTerrainTemplateRecycleRecord[\s\S]*?restoreLastDeletedTerrainProgram[\s\S]*?clearHeightTerrainTemplateRecycleRecord/, "高度模板删除、回收与恢复接线不完整");
assert.match(heightComponentSource, /恢复上次删除/, "高度面板缺少恢复上次删除入口");
assert.match(controlPanelSource, /CUSTOM_UNIT_RECYCLE_STORAGE_KEY[\s\S]*?window\.confirm[\s\S]*?restoreLastDeletedCustomUnit/, "自定义单位缺少确认与跨刷新回收恢复");

const publicMethods = Object.values(API_METHODS).reduce((sum, methods) => sum + methods.length, 0);
assert.equal(publicMethods, 279, "公开 API 分母漂移");
assert(API_METHODS.edit.includes("labels.resetStyles"), "公开 labels.resetStyles 没有进入危险动作清单");
const publicDangerMethods = Object.entries(API_METHODS).flatMap(([namespace, methods]) => methods
  .map(method => `${namespace}.${method}`)
  .filter(name => name !== "selection.clear" && (name === "layers.deleteTheme" || /(^|\.)(delete|deleteBatch|clear|clearBattleEvents|resetStyles)$/.test(name)))
).sort();
assert.deepEqual(publicDangerMethods, [
  "edit.cities.delete",
  "edit.cultures.delete",
  "edit.labels.delete",
  "edit.labels.resetStyles",
  "edit.lakes.delete",
  "edit.markers.delete",
  "edit.measurements.delete",
  "edit.military.clearBattleEvents",
  "edit.notes.delete",
  "edit.notes.deleteBatch",
  "edit.provinces.delete",
  "edit.religions.delete",
  "edit.rivers.delete",
  "edit.routes.delete",
  "edit.states.delete",
  "edit.zones.delete",
  "layers.deleteTheme",
  "namebases.clear",
  "namebases.delete"
]);

console.log(JSON.stringify({
  publicMethods,
  deleteKinds: 8,
  explicitConfirmMethods: highImpactMethods.length,
  lowImpactUnpromoted: 6,
  lowImpactRoute: lowImpactRoutePreview.impactLevel,
  confirmationCode: failure.error.code,
  localRecovery: ["height-template", "custom-unit"]
}, null, 2));

function sourceAround(source, token, length) {
  const index = source.indexOf(token);
  assert(index >= 0, `源码缺少 ${token}`);
  return source.slice(index, index + length);
}
