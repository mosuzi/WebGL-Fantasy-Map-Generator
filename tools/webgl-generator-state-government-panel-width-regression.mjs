#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {createSetStateGovernmentCommand} from "../app/webgl-generator/src/runtime/state-edit-commands.js";
import {GOVERNMENT_OPTIONS, governmentSuffixOptions} from "../app/webgl-generator/src/generator/governments.js";

const [panelSource, dockSource, styles] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/StatePanel.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/base/UiActionDock.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/styles.css", import.meta.url), "utf8")
]);

const governmentAction = panelSource.match(/\{key: "government", label: "调整政体", icon: "⚖", panelWidth: (\d+), disabled:/);
assert(governmentAction, "国家政体动作必须声明专用面板宽度");
const panelWidth = Number(governmentAction[1]);
assert(panelWidth >= 620, "国家政体面板宽度不得小于 620px");
assert.match(dockSource, /Number\(activeAction\.value\?\.panelWidth\) \|\| 340/, "不得改变其它动作面板的通用默认宽度");
assert.match(styles, /\.state-government-field\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit, minmax\(min\(100%, 240px\), 1fr\)\);/, "政体字段没有按可用宽度自适应为双列或单列");
assert.match(styles, /\.state-government-field > \.ui-select-field\s*\{[^}]*grid-template-columns:\s*72px minmax\(0, 1fr\);/, "政体与国号后缀字段没有为选择框保留稳定宽度");
assert.match(styles, /\.state-government-field > \.el-button\s*\{[^}]*grid-column:\s*1 \/ -1;/, "政体提交按钮没有跨越完整弹框内容宽度");
assert.match(styles, /\.ui-select-popper\.el-popper \{[\s\S]*?min-width: 260px !important;/, "共享候选浮层最小宽度契约缺失");
assert.match(styles, /\.ui-select-popper \.el-select-dropdown__item \{[\s\S]*?white-space: normal;/, "较长候选必须继续允许完整换行");
assert.match(panelSource, /label="国号后缀"[\s\S]*?:options="governmentSuffixOptions"/, "政体动作缺少独立国号后缀选择");
assert.match(panelSource, /onGovernmentChange\(selected\.id, governmentDraft, governmentSuffixDraft\)/, "政体提交没有同时携带国号后缀");
assert.deepEqual(governmentSuffixOptions("monarchy"), ["王国", "帝国", "国"], "君主制没有提供王国、帝国与通用国号");

const longestOption = GOVERNMENT_OPTIONS
  .map(option => `${option.label} / ${option.category}`)
  .sort((a, b) => b.length - a.length)[0];
assert.equal(longestOption, "商业共和国 / 共和政体");

const politicsState = createGovernmentState();
const packState = structuredClone(politicsState);
const map = {
  metadata: {},
  politics: {states: [null, politicsState]},
  pack: {states: [null, packState]}
};
const history = new EditHistory();
const context = {map};
const command = createSetStateGovernmentCommand(1, "monarchy", {formName: "帝国"});
assert.equal(command.isNoop(context), false, "同政体切换国号后缀被错误判定为无变化");
history.execute(command, context);
assert.equal(map.politics.states[1].governmentKey, "monarchy");
assert.equal(map.politics.states[1].formName, "帝国");
assert.equal(map.politics.states[1].fullName, "青岚帝国");
assert.equal(map.politics.states[1].government.suffix, "帝国");
assert.equal(map.pack.states[1].fullName, "青岚帝国", "pack 国家镜像没有同步国号后缀");
history.undo(context);
assert.equal(map.politics.states[1].fullName, "青岚王国", "撤销没有恢复原国号");
history.redo(context);
assert.equal(map.politics.states[1].fullName, "青岚帝国", "重做没有恢复主动选择的国号");

console.log(JSON.stringify({
  ok: true,
  panelWidth,
  sharedDefaultWidth: 340,
  longestOption,
  longestOptionCharacters: longestOption.length,
  monarchySuffixes: governmentSuffixOptions("monarchy"),
  renamedState: map.politics.states[1].fullName,
  history: history.getStats()
}, null, 2));

function createGovernmentState() {
  return {
    id: 1,
    i: 1,
    name: "青岚",
    fullName: "青岚王国",
    form: "Monarchy",
    formName: "王国",
    governmentKey: "monarchy",
    governmentLabel: "君主制",
    governmentFamily: "autocracy",
    governmentCategory: "君主政体",
    governmentEra: "traditional",
    governmentSize: "medium",
    selfStyledGreat: false,
    government: {
      key: "monarchy",
      label: "君主制",
      category: "君主政体",
      family: "autocracy",
      era: "traditional",
      legacyForm: "Monarchy",
      size: "medium",
      sizeLabel: "中等",
      selfStyledGreat: false,
      suffix: "王国",
      effects: {}
    }
  };
}
