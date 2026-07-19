#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {GOVERNMENT_OPTIONS} from "../app/webgl-generator/src/generator/governments.js";

const [panelSource, dockSource, styles] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/StatePanel.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/base/UiActionDock.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/styles.css", import.meta.url), "utf8")
]);

const governmentAction = panelSource.match(/\{key: "government", label: "调整政体", icon: "⚖", panelWidth: (\d+), disabled:/);
assert(governmentAction, "国家政体动作必须声明专用面板宽度");
const panelWidth = Number(governmentAction[1]);
assert(panelWidth >= 460, "国家政体面板宽度不得小于 460px");
assert.match(dockSource, /Number\(activeAction\.value\?\.panelWidth\) \|\| 340/, "不得改变其它动作面板的通用默认宽度");
assert.match(styles, /\.ui-select-popper\.el-popper \{[\s\S]*?min-width: 260px !important;/, "共享候选浮层最小宽度契约缺失");
assert.match(styles, /\.ui-select-popper \.el-select-dropdown__item \{[\s\S]*?white-space: normal;/, "较长候选必须继续允许完整换行");

const longestOption = GOVERNMENT_OPTIONS
  .map(option => `${option.label} / ${option.category}`)
  .sort((a, b) => b.length - a.length)[0];
assert.equal(longestOption, "商业共和国 / 共和政体");

console.log(JSON.stringify({
  ok: true,
  panelWidth,
  sharedDefaultWidth: 340,
  longestOption,
  longestOptionCharacters: longestOption.length
}, null, 2));
