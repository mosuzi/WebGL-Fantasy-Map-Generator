#!/usr/bin/env node
import {OBJECT_KIND} from "../app/webgl-generator/src/runtime/object-kinds.js";
import {buildSelectionMeshVertices} from "../app/webgl-generator/src/renderer/selection-layer.js";
import {
  MAX_PERSISTENT_OBJECT_HIGHLIGHTS,
  PERSISTENT_HIGHLIGHT_OBJECT_KINDS,
  isPersistentHighlightObjectKind,
  normalizePersistentHighlights,
  persistentHighlightKey,
  samePersistentHighlightMembership
} from "../app/webgl-generator/src/runtime/persistent-highlights.js";

const map = createSyntheticMap();
const sources = [
  {kind: OBJECT_KIND.MEASUREMENT, id: "measurement-1"},
  {kind: OBJECT_KIND.MEASUREMENT, id: "measurement-1"},
  {kind: OBJECT_KIND.DIPLOMACY_RELATION, id: "1:2"},
  {kind: OBJECT_KIND.TRADE_FLOW, id: 7},
  {kind: OBJECT_KIND.MEASUREMENT, id: "missing"},
  {kind: "good", id: 1}
];
const normalized = normalizePersistentHighlights(map, sources);

assert(MAX_PERSISTENT_OBJECT_HIGHLIGHTS === 100, "持久高亮上限发生非预期变化");
assert(PERSISTENT_HIGHLIGHT_OBJECT_KINDS.length === 20, `支持类型数量异常：${PERSISTENT_HIGHLIGHT_OBJECT_KINDS.length}`);
assert(isPersistentHighlightObjectKind(OBJECT_KIND.TRADE_FLOW) && isPersistentHighlightObjectKind(OBJECT_KIND.DIPLOMACY_RELATION), "复合对象没有进入共享支持类型契约");
assert(
  [OBJECT_KIND.FEATURE, OBJECT_KIND.OCEAN_CURRENT, OBJECT_KIND.ECONOMY_MARKET].every(isPersistentHighlightObjectKind),
  "阶段 B 新增对象没有进入持久高亮支持类型"
);
assert(!isPersistentHighlightObjectKind("good"), "经济聚合行不应进入持久高亮支持类型");
assert(normalized.highlights.length === 3, `规范化后对象数异常：${normalized.highlights.length}`);
assert(normalized.rejected.length === 2, `无效对象拒绝数异常：${normalized.rejected.length}`);
assert(normalized.duplicates === 1, `重复对象计数异常：${normalized.duplicates}`);
assert(new Set(normalized.highlights.map(persistentHighlightKey)).size === 3, "规范化后仍有重复 key");

map.measurements.items[0].name = "更新后的测量";
const reconciled = normalizePersistentHighlights(map, normalized.highlights);
const measurement = reconciled.highlights.find(object => object.kind === OBJECT_KIND.MEASUREMENT);
assert(measurement?.name === "更新后的测量", "重新解析没有刷新对象摘要");
assert(samePersistentHighlightMembership(normalized.highlights, reconciled.highlights), "对象摘要更新不应误判为高亮成员变化");

map.measurements.items = [];
const afterDelete = normalizePersistentHighlights(map, reconciled.highlights);
assert(afterDelete.highlights.length === 2 && afterDelete.rejected.length === 1, "删除对象后没有清理陈旧高亮");
assert(!samePersistentHighlightMembership(reconciled.highlights, afterDelete.highlights), "删除对象后应识别高亮成员变化");

const phaseBAdapters = normalizePersistentHighlights(map, [
  {kind: OBJECT_KIND.FEATURE, id: 4},
  {kind: OBJECT_KIND.OCEAN_CURRENT, id: "current-1"},
  {kind: OBJECT_KIND.ECONOMY_MARKET, id: 3}
]);
assert(
  JSON.stringify(phaseBAdapters.highlights.map(object => object.kind))
    === JSON.stringify([OBJECT_KIND.FEATURE, OBJECT_KIND.OCEAN_CURRENT, OBJECT_KIND.ECONOMY_MARKET]),
  "阶段 B 三类对象必须通过真实地图数据解析为持久高亮对象"
);
assert(phaseBAdapters.rejected.length === 0, "阶段 B 三类有效对象不应被持久高亮契约拒绝");
assert(phaseBAdapters.highlights[0].firstCell === 1, "地貌高亮必须保留定位 cell");
assert(
  phaseBAdapters.highlights[1].points?.kind === "cubic"
    && phaseBAdapters.highlights[1].points.segments?.length === 1,
  "洋流高亮必须保留正式 cubic path"
);
assert(phaseBAdapters.highlights[2].cell === 1, "市场高亮必须保留定位 cell");
const cubicOceanCurrentVertices = buildSelectionMeshVertices(
  map,
  {scale: 1, offsetX: 0, offsetY: 0},
  {width: 100, height: 100, clientWidth: 100},
  null,
  null,
  [phaseBAdapters.highlights[1]]
);
assert(cubicOceanCurrentVertices.length > 0, "持久高亮必须把正式 cubic 洋流构建为非空 selection mesh");

console.log(JSON.stringify({
  ok: true,
  supportedKinds: PERSISTENT_HIGHLIGHT_OBJECT_KINDS.length,
  normalized: normalized.highlights.length,
  rejected: normalized.rejected.length,
  duplicates: normalized.duplicates,
  afterDelete: afterDelete.highlights.length,
  cubicOceanCurrentVertices: cubicOceanCurrentVertices.length / 6,
  maxHighlights: MAX_PERSISTENT_OBJECT_HIGHLIGHTS
}, null, 2));

function createSyntheticMap() {
  const states = [
    {i: 0},
    {i: 1, name: "甲", fullName: "甲国", center: 0, diplomacy: [null, "Self", "Friendly"]},
    {i: 2, name: "乙", fullName: "乙国", center: 1, diplomacy: [null, "Suspicion", "Self"]}
  ];
  return {
    metadata: {graphWidth: 100, graphHeight: 100},
    measurements: {items: [{id: "measurement-1", name: "初始测量", type: "polyline", points: [{x: 10, y: 10}, {x: 20, y: 20}], summary: {displayPointCount: 2}}]},
    politics: {states},
    pack: {
      states,
      cells: {p: [[20, 30], [80, 70]]},
      burgs: [null, {i: 1, name: "甲城", x: 15, y: 20}, {i: 2, name: "乙城", x: 85, y: 80}],
      features: [null, null, null, null, {i: 4, name: "北海", type: "ocean", firstCell: 1, cells: 2}],
      markets: [{i: 3, name: "北方市场", centerBurgId: 2, cell: 1, state: 2}],
      goods: [null, {i: 1, name: "盐"}],
      deals: [{i: 7, good: 1, sellerType: "burg", seller: 1, buyerType: "burg", buyer: 2, units: 4, price: 5, source: "scheduled"}]
    },
    oceanCurrents: {
      currents: [{
        id: "current-1",
        name: "北海暖流",
        path: {
          kind: "cubic",
          segments: [{
            start: [10, 60],
            control1: [20, 58],
            control2: [30, 57],
            end: [40, 55]
          }]
        },
        strength: 0.7
      }]
    },
    settlements: {cities: []}
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
