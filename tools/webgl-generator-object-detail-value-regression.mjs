import assert from "node:assert/strict";
import fs from "node:fs";
import {OBJECT_KIND} from "../app/webgl-generator/src/runtime/object-kinds.js";
import {
  formatPlayerText,
  formatStructuredDetailValue,
  joinPlayerDetailValues,
  normalizeObjectDetailRows
} from "../app/webgl-generator/src/ui/object-detail-values.js";

assert.equal(formatPlayerText("可读文本"), "可读文本");
assert.equal(formatPlayerText({id: 1}, "未知"), "未知");
assert.equal(formatPlayerText("[object Object]", "未知"), "未知");
assert.equal(joinPlayerDetailValues(["甲", {id: 2}, "乙"]), "甲 / 乙");

const nested = {
  state: 3,
  tags: ["港口", "矿区"],
  weights: new Float32Array([0.25, 0.5, 0.75]),
  metadata: {source: "旧地图", internal: {revision: 2}}
};
const summary = formatStructuredDetailValue(nested);
assert.match(summary, /^\{/);
assert.match(summary, /"weights":\[0\.25,0\.5,0\.75\]/);
assert.doesNotMatch(summary, /\[object Object\]/);
assert.doesNotThrow(() => JSON.parse(summary));
const truncatedSummary = formatStructuredDetailValue({text: "长".repeat(500)}, {maxLength: 90});
assert.equal(JSON.parse(truncatedSummary).truncated, true);
assert.ok(truncatedSummary.length <= 90);

const circular = {name: "循环"};
circular.self = circular;
assert.match(formatStructuredDetailValue(circular), /\[循环引用\]/);
assert.equal(formatStructuredDetailValue({}), "");
assert.equal(formatStructuredDetailValue([]), "");

const rows = normalizeObjectDetailRows([
  {label: "名称", value: "旧对象"},
  {label: "错误标量", value: {id: 1}},
  {label: "旧字符串", value: "[object Object]"},
  {label: "结构摘要", value: nested, structured: true},
  {label: "TypedArray", value: new Uint16Array([2, 4, 6]), structured: true},
  {label: "空结构", value: {}, structured: true},
  {label: "空可选", value: null, omitEmpty: true}
]);
assert.deepEqual(rows.map(row => row.label), ["名称", "旧字符串", "结构摘要", "TypedArray"]);
assert.equal(rows.find(row => row.label === "旧字符串")?.value, "无");
assert.equal(rows.some(row => String(row.value).includes("[object Object]")), false);
assert.equal(rows.find(row => row.label === "TypedArray")?.value, "[2,4,6]");

const componentSource = fs.readFileSync(new URL("../app/webgl-generator/src/ui/vue/components/ObjectDetailsPanel.vue", import.meta.url), "utf8");
const sharedGridSource = fs.readFileSync(new URL("../app/webgl-generator/src/ui/vue/components/base/UiKeyValueGrid.vue", import.meta.url), "utf8");
assert.match(componentSource, /normalizeObjectDetailRows\(\[/, "对象详情没有在组件边界显式规范化值");
assert.match(componentSource, /value: object\.data, structured: true/, "marker 嵌套数据没有使用有限结构摘要");
for (const [constant, kind] of Object.entries(OBJECT_KIND)) {
  assert.match(componentSource, new RegExp(`\\[OBJECT_KIND\\.${constant}\\]: object => \\[`), `对象详情缺少 ${kind} 的领域行定义`);
}
assert.match(sharedGridSource, /function formatCellText\(value, fallback\)/, "共享键值网格契约被意外移除");

console.log(`对象详情值回归通过：${Object.keys(OBJECT_KIND).length} 类对象均有领域行，结构值有限摘要且不产生 [object Object]。`);
