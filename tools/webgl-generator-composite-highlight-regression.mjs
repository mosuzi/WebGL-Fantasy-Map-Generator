#!/usr/bin/env node
import {compositeConnectorPoints, pickCompositeConnector} from "../app/webgl-generator/src/renderer/composite-connectors.js";
import {buildSelectionMeshVertices, selectionHighlightMode} from "../app/webgl-generator/src/renderer/selection-layer.js";
import {diplomacyRelationObject, resolveDiplomacyRelation} from "../app/webgl-generator/src/runtime/diplomacy-relations.js";
import {OBJECT_KIND} from "../app/webgl-generator/src/runtime/object-kinds.js";
import {resolveObject} from "../app/webgl-generator/src/runtime/object-resolver.js";

const map = createSyntheticMap();
const relation = diplomacyRelationObject({subjectId: 1, id: 2, subjectName: "甲国", name: "乙国", relation: "Friendly", relationLabel: "友好"});
const inverse = resolveDiplomacyRelation(map, {kind: OBJECT_KIND.DIPLOMACY_RELATION, id: "2:1"});
const resolvedRelation = resolveDiplomacyRelation(map, relation);
const tradeFlow = resolveObject(map, {kind: OBJECT_KIND.TRADE_FLOW, id: 7});

assert(relation.id === "1:2" && resolvedRelation?.relation === "Friendly", "外交关系方向身份或解析错误");
assert(inverse?.id === "2:1" && inverse.relation === "Suspicion", "反向外交关系没有保留独立语义");
assert(resolvedRelation.from?.join(",") === "20,30" && resolvedRelation.to?.join(",") === "80,70", "外交关系端点错误");
assert(tradeFlow?.from?.join(",") === "15,20" && tradeFlow.to?.join(",") === "85,80", "贸易流端点错误");

const relationPick = pickCompositeConnector(map, [resolvedRelation], 50, 50, 2);
const tradePick = pickCompositeConnector(map, [tradeFlow], 50, 50, 2);
assert(relationPick?.kind === OBJECT_KIND.DIPLOMACY_RELATION && relationPick.id === "1:2", "外交关系连线拾取失败");
assert(tradePick?.kind === OBJECT_KIND.TRADE_FLOW && tradePick.id === 7, "贸易流连线拾取失败");

const camera = {scale: 1, offsetX: 0, offsetY: 0};
const canvas = {width: 100, height: 100, clientWidth: 100};
const highlights = [resolvedRelation, tradeFlow];
const vertices = buildSelectionMeshVertices(map, camera, canvas, null, null, highlights);
assert(vertices.length / 6 === 12, `两条复合高亮连线顶点数异常：${vertices.length / 6}`);
assert(selectionHighlightMode(null, null, highlights) === "multi-object highlight (2)", "复合多对象高亮模式错误");
assert(compositeConnectorPoints(map, resolvedRelation)?.length === 2, "外交关系高亮几何缺失");

console.log(JSON.stringify({
  ok: true,
  relationId: resolvedRelation.id,
  inverseRelationId: inverse.id,
  tradeFlowId: tradeFlow.id,
  connectorVertices: vertices.length / 6,
  relationPickCandidates: relationPick.candidateCount,
  tradePickCandidates: tradePick.candidateCount
}, null, 2));

function createSyntheticMap() {
  const states = [
    {i: 0},
    {i: 1, name: "甲", fullName: "甲国", center: 0, diplomacy: [null, "Self", "Friendly"]},
    {i: 2, name: "乙", fullName: "乙国", center: 1, diplomacy: [null, "Suspicion", "Self"]}
  ];
  return {
    metadata: {graphWidth: 100, graphHeight: 100},
    politics: {states},
    grid: {
      points: [[25, 25], [75, 75]],
      cells: {
        v: [[0, 1, 2, 3], [4, 5, 6, 7]],
        p: [0, 1],
        state: [1, 2],
        province: [1, 2],
        culture: [1, 2],
        religion: [1, 2],
        region: [1, 2]
      },
      vertices: {p: [[0, 0], [50, 0], [50, 50], [0, 50], [50, 50], [100, 50], [100, 100], [50, 100]]}
    },
    pack: {
      states,
      cells: {p: [[20, 30], [80, 70]]},
      burgs: [null, {i: 1, name: "甲城", x: 15, y: 20}, {i: 2, name: "乙城", x: 85, y: 80}],
      markets: [],
      goods: [null, {i: 1, name: "盐"}],
      deals: [{i: 7, good: 1, sellerType: "burg", seller: 1, buyerType: "burg", buyer: 2, units: 4, price: 5, source: "scheduled"}]
    },
    settlements: {cities: []},
    rivers: {metadata: {maxFlux: 1}, rivers: []},
    zones: {zones: []}
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
