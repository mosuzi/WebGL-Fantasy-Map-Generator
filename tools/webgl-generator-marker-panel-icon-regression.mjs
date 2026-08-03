#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {MARKER_SYMBOL_OPTIONS, resolveMarkerIconVisual} from "../app/webgl-generator/src/renderer/canvas-icon-registry.js";

const panelSource = await readFile(new URL("../app/webgl-generator/src/ui/vue/components/MarkerPanel.vue", import.meta.url), "utf8");
const automatic = resolveMarkerIconVisual("tea-hills", {
  symbol: "life",
  palette: "resource",
  manual: false,
  categoryColor: [0.2, 0.6, 0.3, 1]
});
const manual = resolveMarkerIconVisual("tea-hills", {
  symbol: "life",
  palette: "culture",
  manual: true
});

assert.equal(automatic.symbol, "type:tea-hills", "自动茶山必须按 type 使用实际图形");
assert.equal(automatic.palette, "resource");
assert.equal(automatic.manual, false);
assert.deepEqual(automatic.categoryColor, [0.2, 0.6, 0.3, 1]);
assert.equal(manual.symbol, "life", "手工图标必须保留旧 symbol");
assert.equal(manual.palette, "culture");
assert.equal(manual.manual, true);
assert(MARKER_SYMBOL_OPTIONS.every(option => !option.value.startsWith("type:")), "手工选项不得包含自动 type:* 键");

assert.match(panelSource, /const visual = resolveMarkerIconVisual\(marker\.type, storedVisual\);/, "面板读面必须使用 renderer 同一解析器");
assert.match(panelSource, /startsWith\("type:"\)/, "面板必须识别自动图形键");
assert.match(panelSource, /`自动：\$\{markerTypeLabel\(String\(value\)\.slice\(5\)\)\}`/, "自动图形必须显示具体 Marker 类型");
assert.match(panelSource, /:disabled="isAutomaticVisualDraft"/, "自动图形未转换为手工键前不得提交");
assert.match(panelSource, /if \(!selected\.value \|\| isAutomaticVisualDraft\.value\) return;/, "写面必须阻止 type:* 回写存档");
assert.match(panelSource, /const symbolOptions = MARKER_SYMBOL_OPTIONS;/, "手工选项必须继续由旧 16 symbol 注册表派生");

console.log(JSON.stringify({
  ok: true,
  automatic: {type: "tea-hills", symbol: automatic.symbol, palette: automatic.palette, label: "自动：茶山 / 资源"},
  manual: {symbol: manual.symbol, palette: manual.palette},
  writableAutomaticTypeKey: false,
  manualOptions: MARKER_SYMBOL_OPTIONS.length
}, null, 2));
