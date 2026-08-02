#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {createDeleteLabelCommand, createMoveCustomLabelCommand, ensureLabelStore} from "../app/webgl-generator/src/runtime/label-edit-commands.js";
import {createPatchLabelLayoutCommand} from "../app/webgl-generator/src/runtime/label-layout-edit-commands.js";
import {
  ensureLabelLayoutStore,
  hasManualLabelPriorities,
  LABEL_LAYOUT_DEFAULT_PRIORITY,
  normalizeLabelLayoutStore,
  patchLabelLayout,
  readLabelLayoutOverride,
  resolveLabelLayout,
  sortLabelItemsByPriority,
  validateLabelLayoutStore
} from "../app/webgl-generator/src/runtime/label-layout-registry.js";
import {createCompressedMapDocumentBlob, createMapDocument, parseMapDocument, parseMapDocumentPayload, stringifyMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {LABEL_TARGET_KIND} from "../app/webgl-generator/src/runtime/object-kinds.js";

const map = {
  metadata: {seed: "label-layout-regression", checksum: "layout-must-not-change-geography"},
  options: {},
  settlements: {cities: [
    {id: 0, name: "王城", capital: true, x: 20, y: 30, population: 80},
    {id: 1, name: "边城", capital: false, x: 24, y: 34, population: 20}
  ]},
  politics: {
    states: [null, {i: 1, name: "北国", fullName: "北境王国", center: 1, area: 300, burgs: 2}],
    provinces: [null, {i: 1, state: 1, name: "霜原", pole: [24, 36], center: 1, area: 100, burgs: 1}]
  },
  pack: {cells: {p: [[0, 0], [24, 36]]}}
};
const store = ensureLabelStore(map);
store.custom.push({id: 1, text: "古道", x: 40, y: 50});
assert.equal(ensureLabelLayoutStore(map).version, 1);
assert.deepEqual(map.labels.layout.overrides, {});
assert.equal(hasManualLabelPriorities(map), false, "旧图空覆盖必须继续走自动布局");

const capitalAuto = resolveLabelLayout(map, LABEL_TARGET_KIND.CITY, 0, map.settlements.cities[0], {x: 20, y: 30, priority: 400, minScale: 0.45});
const cityAuto = resolveLabelLayout(map, LABEL_TARGET_KIND.CITY, 1, map.settlements.cities[1], {x: 24, y: 34, priority: 20, minScale: 1.2});
const stateAuto = resolveLabelLayout(map, LABEL_TARGET_KIND.STATE, 1, null, {x: 22, y: 32, priority: 500, minScale: 0.5});
const provinceAuto = resolveLabelLayout(map, LABEL_TARGET_KIND.PROVINCE, 1, null, {x: 24, y: 36, priority: 140, minScale: 0.8});
const customAuto = resolveLabelLayout(map, LABEL_TARGET_KIND.CUSTOM, 1, null, {x: 40, y: 50, priority: 90000, minScale: 0.25});
const zoneAuto = resolveLabelLayout(map, LABEL_TARGET_KIND.ZONE, 1, null, {x: 36, y: 44, priority: 600, minScale: 0.7});
assert.equal(capitalAuto.priority, LABEL_LAYOUT_DEFAULT_PRIORITY.capital);
assert.equal(cityAuto.priority, LABEL_LAYOUT_DEFAULT_PRIORITY.city);
assert.equal(stateAuto.priority, LABEL_LAYOUT_DEFAULT_PRIORITY.state);
assert.equal(provinceAuto.priority, LABEL_LAYOUT_DEFAULT_PRIORITY.province);
assert.equal(customAuto.priority, LABEL_LAYOUT_DEFAULT_PRIORITY.custom);
assert.equal(zoneAuto.priority, LABEL_LAYOUT_DEFAULT_PRIORITY.zone);
assert.equal(zoneAuto.priority, cityAuto.priority, "地区默认优先级没有保持此前城市 fallback 行为");
assert.equal(cityAuto.minScale, 1.2, "自动优先级不得改变旧 LOD");

assert.throws(() => patchLabelLayout(map, "city", 1, {priority: 101}), /0 到 100/);
assert.throws(() => patchLabelLayout(map, "city", 1, {position: {x: NaN, y: 2}}), /有限 x \/ y/);
assert.throws(() => validateLabelLayoutStore({version: 1, overrides: {"route:1": {priority: 10}}}), /目标键无效/);
assert.deepEqual(normalizeLabelLayoutStore({version: 99, overrides: {"city:1": {priority: 55}, "route:1": {priority: 90}}}), {version: 1, overrides: {"city:1": {priority: 55}}}, "宽容读取必须丢弃未知目标并回填当前版本");

const history = new EditHistory();
const context = {map};
const checksum = map.metadata.checksum;
history.execute(createPatchLabelLayoutCommand({targetKind: "city", targetId: 1}, {priority: 95}), context);
let cityManual = resolveLabelLayout(map, "city", 1, map.settlements.cities[1], {x: 24, y: 34, priority: 20, minScale: 1.2});
assert.equal(cityManual.priority, 95);
assert(cityManual.minScale < cityAuto.minScale, "高优先级没有提前城市 LOD");
assert.equal(hasManualLabelPriorities(map), true);
history.execute(createPatchLabelLayoutCommand({targetKind: "city", targetId: 1}, {position: {x: 70, y: 80}}), context);
cityManual = resolveLabelLayout(map, "city", 1, map.settlements.cities[1], {x: 999, y: 999, priority: 20, minScale: 1.2});
assert.deepEqual(cityManual.position, {x: 70, y: 80}, "锁定位置没有覆盖自动锚点");
assert.equal(cityManual.locked, true);
history.undo(context);
assert.equal(resolveLabelLayout(map, "city", 1, map.settlements.cities[1], {x: 24, y: 34}).locked, false, "撤销没有解锁位置");
history.redo(context);
assert.equal(resolveLabelLayout(map, "city", 1, map.settlements.cities[1], {x: 24, y: 34}).locked, true, "重做没有恢复锁定位置");
assert.equal(map.metadata.checksum, checksum, "标签布局不应改写地理 checksum");

const sortedInput = [
  {layout: {...stateAuto, priority: 80, autoPriority: 500, key: "state:1"}},
  {layout: {...customAuto, priority: 80, autoPriority: 90000, key: "custom:1"}},
  {layout: {...cityManual, priority: 95, autoPriority: 20, key: "city:1"}}
];
const firstSort = sortLabelItemsByPriority(sortedInput).map(item => item.layout.key);
assert.deepEqual(firstSort, ["city:1", "custom:1", "state:1"], "优先级、自动分值和稳定键排序错误");
assert.deepEqual(sortLabelItemsByPriority(sortedInput).map(item => item.layout.key), firstSort, "重复布局排序发生抖动");

patchLabelLayout(map, "custom", 1, {priority: 40});
const customManual = resolveLabelLayout(map, LABEL_TARGET_KIND.CUSTOM, 1, null, {x: 40, y: 50, priority: 90000, minScale: 0.25});
const mixedOrder = sortLabelItemsByPriority([
  {layout: stateAuto},
  {layout: zoneAuto},
  {layout: customManual},
  {layout: cityManual}
]).map(item => item.layout.key);
assert.deepEqual(mixedOrder, ["city:1", "state:1", "zone:1", "custom:1"], "地区加入后默认与手工优先级混排退化");

patchLabelLayout(map, "custom", 1, {position: {x: 40, y: 50}});
const lockedMove = createMoveCustomLabelCommand(1, {x: 60, y: 70});
assert.equal(lockedMove.isNoop(context), true, "锁定手工标签仍允许拖动");
assert.throws(() => lockedMove.apply(context), /已锁定位置/);
const customDelete = createDeleteLabelCommand({targetKind: "custom", targetId: 1});
history.execute(customDelete, context);
assert.deepEqual(readLabelLayoutOverride(map, "custom", 1), {}, "删除手工标签没有清理布局覆盖");
history.undo(context);
assert.deepEqual(readLabelLayoutOverride(map, "custom", 1).position, {x: 40, y: 50}, "撤销删除没有恢复布局覆盖");

const document = createMapDocument(map, map.options);
const roundTrip = parseMapDocument(stringifyMapDocument(document));
assert.deepEqual(roundTrip.map.labels.layout, document.map.labels.layout, "完整地图往返没有保留标签布局");
const oldV2 = structuredClone(document);
delete oldV2.map.labels.layout;
const parsedOldV2 = parseMapDocument(stringifyMapDocument(oldV2));
assert.deepEqual(parsedOldV2.map.labels.layout, {version: 1, overrides: {}}, "旧 v2 缺字段没有在读取时回填布局存储");
assert.deepEqual(createMapDocument(parsedOldV2.map, parsedOldV2.options).map.labels.layout, {version: 1, overrides: {}}, "旧 v2 再导出没有保留回填后的布局存储");
const oldV1 = JSON.parse(await readFile(new URL("./fixtures/webgl-map-v1-minimal.json", import.meta.url), "utf8"));
const migratedV1 = parseMapDocument(JSON.stringify(oldV1));
assert.deepEqual(migratedV1.map.labels.layout, {version: 1, overrides: {}}, "v1 地图没有回填自动布局");
const documentRef = {defaultView: globalThis};
const compressed = await createCompressedMapDocumentBlob(documentRef, document);
const gzipBase64 = Buffer.from(await compressed.blob.arrayBuffer()).toString("base64");
const parsedGzip = await parseMapDocumentPayload(documentRef, {encoding: "gzip-base64", data: gzipBase64});
assert.deepEqual(parsedGzip.map.labels.layout, document.map.labels.layout, "gzip 完整地图没有保留标签布局");

const [rendererSource, panelSource, mapIoSource, appSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/renderer/placeholder-renderer.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/LabelNamingPanel.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/map-file-io.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8")
]);
assert.match(rendererSource, /hasManualLabelPriorities\(map\) \? sortLabelItemsByPriority\(labels\) : labels/, "旧图自动顺序与手工优先级排序没有明确分流");
assert.match(rendererSource, /const ranked = hasManualLabelPriorities\(map\)[\s\S]*sortLabelItemsByPriority\(candidates\)[\s\S]*\.slice\(0, maxCityLabels\)/, "手工优先级没有在城市 LOD 截断前参与排序");
assert.match(rendererSource, /priorityLayout[\s\S]*boxesOverlapAny\(occupiedByPriority/, "手工优先级没有进入统一碰撞顺序");
assert.match(rendererSource, /x: layout\.position\.x, y: layout\.position\.y/, "锁定世界锚点没有进入实时标签模型");
assert.match(panelSource, /显示优先级[\s\S]*恢复自动优先级[\s\S]*锁定当前位置/, "标签面板缺少优先级或位置锁定入口");
assert.match(appSource, /labelPositionLocked === "true"[\s\S]*请先在标签管理中解锁/, "锁定手工标签仍可能进入拖动流程");
assert.match(mapIoSource, /selectors\.push\(\.\.\.PNG_SEMANTIC_LABEL_SELECTORS\)/, "PNG 没有复用实时可见标签生产契约");

console.log(JSON.stringify({
  ok: true,
  automaticPriorities: {
    state: stateAuto.priority,
    province: provinceAuto.priority,
    capital: capitalAuto.priority,
    city: cityAuto.priority,
    custom: customAuto.priority,
    zone: zoneAuto.priority
  },
  manualPriority: cityManual.priority,
  lockedPosition: cityManual.position,
  stableOrder: firstSort,
  mixedOrder,
  roundTripOverrides: Object.keys(roundTrip.map.labels.layout.overrides).length,
  oldV1LayoutVersion: migratedV1.map.labels.layout.version,
  history: history.getStats()
}, null, 2));
