#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {provinceFormForState, provinceFormsForState} from "../app/webgl-generator/src/generator/province-naming.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {getObjectSnapshot} from "../app/webgl-generator/src/runtime/object-query-api.js";
import {createSetStateGovernmentCommand, createSetStateProvinceSuffixCommand} from "../app/webgl-generator/src/runtime/state-edit-commands.js";

const [panelSource, panelAdapterSource, appSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/StatePanel.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/panels/state-panel.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8")
]);

assert.match(panelSource, /key: "province-suffix"[\s\S]*?label: "调整辖下省份后缀"/, "国家面板缺少独立省份后缀动作");
assert.match(panelSource, /label="覆盖手工定制全名"[\s\S]*?:checked="overwriteCustomProvinceNames"/, "国家面板缺少强制覆盖的显式开关");
assert.match(panelSource, /callbacks\.onProvinceSuffixChange\?\.[\s\S]*?overwriteCustomProvinceNames\.value/, "国家面板没有提交国家、后缀和覆盖选项");
assert.match(panelSource, /watch\(\(\) => \[selected\.value\?\.id, props\.state\.version\][\s\S]*?\}, \{immediate: true\}\);/, "省份后缀状态没有在首次打开时初始化，提交刷新会清空结果");
assert.match(panelAdapterSource, /onProvinceSuffixChange:[\s\S]*?callbacks\.onProvinceSuffixChange/, "国家面板 adapter 没有转发省份后缀操作");
assert.match(appSource, /onProvinceSuffixChange:[\s\S]*?createSetStateProvinceSuffixCommand/, "运行时没有通过正式编辑命令执行省份后缀操作");

const map = createFixtureMap();
const context = {map};
const history = new EditHistory();
const geographyBefore = snapshotGeography(map);
const provinceNamesBefore = snapshotProvinceNames(map);

assert.deepEqual(provinceFormsForState(map.politics.states[1], map.society.cultures), ["州", "郡", "府", "道", "路", "军", "镇", "司"]);
assert.equal(provinceFormForState(map.politics.states[1], map.society.cultures), "州", "当前文化建议后缀不稳定");

const safeCommand = createSetStateProvinceSuffixCommand(1, "府");
assert.equal(safeCommand.isNoop(context), false);
assert.deepEqual(safeCommand.getResult(), {
  valid: true,
  stateId: 1,
  formName: "府",
  overwriteCustom: false,
  total: 3,
  changed: 1,
  unchanged: 1,
  skippedCustom: 1,
  summary: "将更新 1 个省份，1 个无需变化，1 个定制全名保持不变。"
});
history.execute(safeCommand, context);
assertProvinceName(map, 1, "府", "青原府");
assertProvinceName(map, 2, "郡", "北境都护领");
assertProvinceName(map, 3, "府", "南丘府");
assertMirrorsEqual(map);
assert.deepEqual(snapshotGeography(map), geographyBefore, "批量后缀事务改写了省份地理或身份字段");
assert.equal(history.getStats().undo, 1, "一次批量操作没有保持为单条历史");

const publicProvince = getObjectSnapshot(map, {kind: "province", id: 1});
assert.equal(publicProvince.formName, "府", "公开省份读取缺少 formName");
assert.equal(publicProvince.fullName, "青原府", "公开省份读取缺少 fullName");

history.undo(context);
assert.deepEqual(snapshotProvinceNames(map), provinceNamesBefore, "撤销没有精确恢复省份名称 before-image");
assert.deepEqual(snapshotGeography(map), geographyBefore, "撤销改写了省份地理或身份字段");
history.redo(context);
assertProvinceName(map, 1, "府", "青原府");
assertProvinceName(map, 2, "郡", "北境都护领");

const forceCommand = createSetStateProvinceSuffixCommand(1, "道", {overwriteCustom: true});
assert.equal(forceCommand.isNoop(context), false);
history.execute(forceCommand, context);
assert.deepEqual(forceCommand.getResult(), {
  valid: true,
  stateId: 1,
  formName: "道",
  overwriteCustom: true,
  total: 3,
  changed: 3,
  unchanged: 0,
  skippedCustom: 0,
  summary: "将更新 3 个省份，0 个无需变化，0 个定制全名保持不变。"
});
assertProvinceName(map, 1, "道", "青原道");
assertProvinceName(map, 2, "道", "北境道");
assertProvinceName(map, 3, "道", "南丘道");
assertMirrorsEqual(map);

const noopCommand = createSetStateProvinceSuffixCommand(1, "道");
assert.equal(noopCommand.isNoop(context), true, "全部后缀已一致时仍制造编辑事务");
assert.equal(noopCommand.getResult().changed, 0);
assert.equal(noopCommand.getResult().unchanged, 3);

const invalidCommand = createSetStateProvinceSuffixCommand(1, "星区");
assert.equal(invalidCommand.isNoop(context), true, "文化后缀集合外的输入没有拒绝");
assert.equal(invalidCommand.getResult().valid, false);

const provinceNamesBeforeGovernment = snapshotProvinceNames(map);
const governmentCommand = createSetStateGovernmentCommand(1, "republic", {formName: "共和国"});
assert.equal(governmentCommand.isNoop(context), false);
history.execute(governmentCommand, context);
assert.deepEqual(snapshotProvinceNames(map), provinceNamesBeforeGovernment, "修改国家政体自动牵连了省份后缀");

console.log(JSON.stringify({
  ok: true,
  safe: safeCommand.getResult(),
  force: forceCommand.getResult(),
  noop: noopCommand.getResult(),
  publicProvince,
  history: history.getStats(),
  governmentDoesNotCascade: true
}, null, 2));

function createFixtureMap() {
  const state = {
    id: 1,
    i: 1,
    name: "青岚",
    fullName: "青岚王国",
    form: "Monarchy",
    formName: "王国",
    governmentKey: "monarchy",
    governmentLabel: "君主制",
    governmentSize: "medium",
    government: {key: "monarchy", suffix: "王国", effects: {}},
    culture: 1,
    nameStyle: "oriental"
  };
  const provinces = [
    null,
    province(1, "青原", "州", "青原州", 11, 101),
    province(2, "北境", "郡", "北境都护领", 12, 102),
    province(3, "南丘", "府", "南丘府", 13, 103),
    province(4, "他国", "州", "他国州", 14, 104, 2)
  ];
  return {
    metadata: {},
    society: {cultures: [null, {i: 1, name: "青岚文化", type: "Generic", nameStyle: "oriental"}]},
    politics: {states: [null, state], provinces},
    pack: {states: [null, structuredClone(state)], provinces: structuredClone(provinces)}
  };
}

function province(id, name, formName, fullName, center, burg, state = 1) {
  return {id, i: id, state, name, formName, fullName, center, burg, color: `#12345${id}`, pole: [id, id + 1], cells: id * 10};
}

function assertProvinceName(map, id, formName, fullName) {
  for (const collection of [map.politics.provinces, map.pack.provinces]) {
    assert.equal(collection[id].formName, formName, `省份 #${id} 后缀镜像不一致`);
    assert.equal(collection[id].fullName, fullName, `省份 #${id} 全名镜像不一致`);
  }
}

function assertMirrorsEqual(map) {
  assert.deepEqual(snapshotProvinceNames({politics: map.politics, pack: {provinces: map.politics.provinces}}).politics, snapshotProvinceNames(map).pack);
}

function snapshotProvinceNames(source) {
  return {
    politics: (source.politics.provinces || []).map(item => item ? {id: item.id, formName: item.formName, fullName: item.fullName} : null),
    pack: (source.pack.provinces || []).map(item => item ? {id: item.id, formName: item.formName, fullName: item.fullName} : null)
  };
}

function snapshotGeography(source) {
  return {
    politics: (source.politics.provinces || []).map(item => geography(item)),
    pack: (source.pack.provinces || []).map(item => geography(item))
  };
}

function geography(item) {
  return item ? {id: item.id, i: item.i, state: item.state, name: item.name, center: item.center, burg: item.burg, color: item.color, pole: item.pole, cells: item.cells} : null;
}
