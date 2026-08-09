#!/usr/bin/env node
import assert from "node:assert/strict";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {buildRivers} from "../app/webgl-generator/src/generator/rivers.js";
import {
  applyRiverNetworkCandidate,
  createRiverNetworkCandidateSnapshot,
  inspectRiverDisplayQuality
} from "../app/webgl-generator/src/generator/river-network-candidate.js";
import {pickRiver} from "../app/webgl-generator/src/renderer/picking.js";
import {isRiverVisibleForRendering, riverVisualPolicyForRendering} from "../app/webgl-generator/src/renderer/placeholder-renderer.js";

const matrix = [];
for (const seed of ["321-river-quality-a", "321-river-quality-b", "321-river-quality-c"]) {
  for (const salt of ["regen-1", "regen-2"]) {
    const map = generatePlaceholderMap({seed, cellsTarget: 3000, heightmapTemplate: "continents", riverNetworkCandidate: false});
    const baseline = buildRivers(map.grid, map.features, map.pack, {
      seed,
      cellsTarget: 3000,
      riverRegenerationSalt: salt,
      riverNetworkCandidate: false
    });
    const canonicalBefore = canonicalNetwork(baseline.rivers);
    const result = applyRiverNetworkCandidate(baseline.rivers, map.pack, map.grid, {metadata: {seed, salt}});
    assert.equal(result.metadata.rejectedRelations, 0, `${seed}/${salt} 仍有拒绝的声明汇流关系`);
    assert.deepEqual(canonicalNetwork(result.rivers), canonicalBefore, `${seed}/${salt} 改写了 canonical 河网`);

    const byId = new Map(result.rivers.map(river => [Number(river.id ?? river.i), river]));
    let accepted = 0;
    let wrongAnchors = 0;
    let maxGap = 0;
    for (const relation of result.candidate.relations.filter(item => item.status === "accepted")) {
      accepted++;
      const child = byId.get(relation.childId);
      const parent = byId.get(relation.parentId);
      const gap = closestPolylineDistance(child.points.at(-1), parent.points);
      maxGap = Math.max(maxGap, gap);
      if (gap > 1e-7) wrongAnchors++;
      if (relation.attachmentSource === "shared-hydrology-cell") {
        if (relation.attachmentMode !== "canonical-shared-cell-local-segment") wrongAnchors++;
        if (relation.parentSegmentIndex < relation.localSegmentStart || relation.parentSegmentIndex > relation.localSegmentEnd) wrongAnchors++;
        const expectedKey = `${relation.hydrologyCell}:${relation.parentHydrologyIndex}:${relation.parentSegmentIndex}`;
        if (relation.anchorKey !== expectedKey) wrongAnchors++;
        if (pointSegmentDistance(relation.to, parent.points[relation.parentSegmentIndex], parent.points[relation.parentSegmentIndex + 1]) > 1e-7) wrongAnchors++;
      }
    }
    assert.equal(maxGap, 0, `${seed}/${salt} 声明汇流 gap 未归零`);
    assert.equal(wrongAnchors, 0, `${seed}/${salt} 存在错误父河 anchor`);

    const snapshot = createRiverNetworkCandidateSnapshot(result.rivers, map.pack, map.grid);
    const quality = inspectRiverDisplayQuality(snapshot);
    assert.equal(quality.selfIntersections, 0, `${seed}/${salt} 仍有显示自交`);
    assert.equal(quality.selfRetraces, 0, `${seed}/${salt} 仍有显示回折针或非相邻接触`);
    assert.equal(quality.backtracks, 0, `${seed}/${salt} 仍有显示回头`);
    assert.equal(quality.extraCrossings, 0, `${seed}/${salt} 仍有新增非父子交叉`);

    const renderMap = {...map, rivers: {...baseline, rivers: result.rivers}};
    const hiddenPolicies = result.candidate.fragmentPolicies.filter(item => item.policy === "hide-visual-only");
    const visibleHiddenFragments = hiddenPolicies.filter(item => isRiverVisibleForRendering(renderMap, item.riverId));
    assert.equal(visibleHiddenFragments.length, 0, `${seed}/${salt} hide-visual-only 仍被 renderer 判为可见`);
    matrix.push({seed, salt, rivers: result.rivers.length, accepted, maxGap, wrongAnchors, ...quality, hiddenFragments: hiddenPolicies.length, visibleHiddenFragments: visibleHiddenFragments.length});
  }
}

verifyCanonicalLocalAnchorRejectsGlobalDecoy();
verifyMissingSharedCellRejection();
verifySharedSiblingJunctionNormalization();
verifyBaseGeometryFallbacks();
verifySelfRetraceAndCrossRiverContacts();
verifyParentChildOverconnectionFallback();
verifyEqualCountIntersectionMigration();
verifyFragmentRendererConsumption();
verifyLongBridgeRefusal();
verifyProtectedOutletAndFrozenRiver();
verifyFrozenParentGeometry();
verifyResidualQualityStatuses();
verifyPointFluxPreservation();

console.log(JSON.stringify({ok: true, matrix}, null, 2));

function verifyCanonicalLocalAnchorRejectsGlobalDecoy() {
  const rivers = [
    formalRiver(1, 0, [1, 2, 3, 4, 5], [[0, 0], [100, 0], [100, 98], [3, 100], [0, 10]], {discharge: 20, width: 0.2, outletKind: "ocean"}),
    formalRiver(2, 1, [9, 4], [[30, 80], [0, 80]], {discharge: 5, width: 0.1})
  ];
  const pack = formalPack(new Map([
    [1, [0, 0]], [2, [100, 0]], [3, [100, 100]], [4, [0, 100]], [5, [0, 10]], [9, [30, 80]]
  ]));
  const result = applyRiverNetworkCandidate(rivers, pack, {metadata: {spacing: 4}});
  const relation = result.candidate.relations.find(item => item.childId === 2);
  assert.equal(relation.status, "accepted", "局部 anchor 正例没有被接受");
  assert.equal(relation.attachmentMode, "canonical-shared-cell-local-segment", "共享 cell 没有锁定局部父河段");
  assert.ok(relation.to[1] >= 97.9, `共享 cell 局部 anchor 偏离 canonical 汇流位置：${relation.to}`);
  assert.ok(pointDistance(relation.to, [0, 100]) < 5, `共享 cell 仍吸附到全局更近的下游折返位置：${relation.to}`);
  assert.ok(closestPolylineDistance(rivers[1].points.at(-1), rivers[0].points) <= 1e-7, "局部 anchor 正例的最终 gap 未归零");
}

function verifyMissingSharedCellRejection() {
  const rivers = [
    formalRiver(1, 0, [1, 2], [[0, 0], [100, 0]], {discharge: 20, width: 0.2, outletKind: "ocean"}),
    formalRiver(2, 1, [8, 9], [[48, 3], [50, 0.5]], {discharge: 5, width: 0.1})
  ];
  const pack = formalPack(new Map([[1, [0, 0]], [2, [100, 0]], [8, [48, 3]], [9, [50, 0.5]]]));
  const before = structuredClone(rivers[1]);
  const result = applyRiverNetworkCandidate(rivers, pack, {metadata: {spacing: 2}});
  const relation = result.candidate.relations.find(item => item.childId === 2);
  assert.equal(relation?.status, "rejected", "无共享 canonical cell 的近邻父子关系被接受");
  assert.equal(relation?.reason, "confluence-shared-cell-missing", "无共享 canonical cell 的拒绝原因不精确");
  assert.equal(result.candidate.anchors.some(anchor => anchor.childId === 2), false, "无共享 canonical cell 仍生成了 anchor");
  assert.deepEqual(rivers[1], before, "无共享 canonical cell 的支流被显示候选改写");

  const sharedRivers = [
    formalRiver(1, 0, [1, 2], [[0, 0], [100, 0]], {discharge: 20, width: 0.2, outletKind: "ocean"}),
    formalRiver(2, 1, [8, 1], [[48, 3], [50, 0.5]], {discharge: 5, width: 0.1})
  ];
  const sharedPack = formalPack(new Map([[1, [50, 0]], [2, [100, 0]], [8, [48, 3]]]));
  const sharedResult = applyRiverNetworkCandidate(sharedRivers, sharedPack, {metadata: {spacing: 2}});
  const sharedRelation = sharedResult.candidate.relations.find(item => item.childId === 2);
  assert.equal(sharedRelation?.status, "accepted", "共享 canonical cell 正例没有被接受");
  assert.equal(sharedRelation?.finalGap, 0, "共享 canonical cell 正例最终 gap 未归零");
}

function verifySharedSiblingJunctionNormalization() {
  const sharedPoint = [10, 0.05];
  const rivers = [
    formalRiver(1, 0, [1, 2, 3], [[0, 0, 10], [20, 0, 20]], {discharge: 20, width: 0.2, outletKind: "ocean"}),
    formalRiver(2, 1, [4, 2], [[8, 5, 3], [...sharedPoint, 4]], {discharge: 5, width: 0.1}),
    formalRiver(3, 1, [5, 2], [[12, 5, 3], [...sharedPoint, 4]], {discharge: 4, width: 0.08})
  ];
  const pack = formalPack(new Map([[1, [0, 0]], [2, sharedPoint], [3, [20, 0]], [4, [8, 5]], [5, [12, 5]]]));
  const result = applyRiverNetworkCandidate(rivers, pack, {metadata: {spacing: 4}});
  const relations = result.candidate.relations.filter(item => item.parentId === 1);
  assert.equal(result.metadata.status, "accepted", "同一 canonical junction 的 sibling 归一化未被接受");
  assert.equal(relations.length, 2, "同一 canonical junction 的 sibling 关系数量漂移");
  assert.ok(relations.every(item => item.status === "accepted" && item.curve?.application === "replace-terminal"), "亚像素 sibling gap 没有使用末端替换归一到唯一锚点");
  assert.ok(rivers.slice(1).every(river => river.points.length === 2 && river.points.every(point => Number.isFinite(Number(point[2])))), "sibling 末端替换追加了重叠尾巴或丢失逐点 flux");
  assert.ok(rivers.slice(1).every(river => !river.points.some(point => pointDistance(point, sharedPoint) <= 1e-7)), "sibling 末端替换仍保留旧 P 并形成 P→Q 双尾巴");
  const junctions = uniquePolylineContactPoints(rivers[1].points, rivers[2].points);
  assert.equal(junctions.length, 1, "同一 canonical junction 的 sibling 最终不止一个显示接触事件");
  assert.ok(pointDistance(junctions[0], relations[0].to) <= 1e-7 && pointDistance(junctions[0], relations[1].to) <= 1e-7, "sibling 最终接触没有落在同一已验证局部锚点");
  const quality = inspectRiverDisplayQuality(createRiverNetworkCandidateSnapshot(rivers, pack, {metadata: {spacing: 4}}));
  assert.equal(quality.extraCrossings, 0, "同一 canonical junction 归一化后仍残留非父子过连");
}

function verifyBaseGeometryFallbacks() {
  const rivers = [
    formalRiver(1, 0, [1, 2, 3, 4], [[0, 0], [10, 10], [0, 10], [10, 0]], {outletKind: "ocean"}),
    formalRiver(2, 0, [5, 6, 7, 8], [[20, 0], [28, 0], [23, 0], [30, 0]], {outletKind: "ocean"}),
    formalRiver(3, 0, [9, 10, 11], [[40, 0], [50, 5], [40, 10]], {outletKind: "ocean"}),
    formalRiver(4, 0, [12, 13, 14], [[45, 0], [35, 5], [45, 10]], {outletKind: "ocean"})
  ];
  const pack = formalPack(new Map([
    [1, [0, 0]], [2, [3, 0]], [3, [7, 0]], [4, [10, 0]],
    [5, [20, 0]], [6, [23, 0]], [7, [27, 0]], [8, [30, 0]],
    [9, [40, 0]], [10, [40, 5]], [11, [40, 10]],
    [12, [45, 0]], [13, [45, 5]], [14, [45, 10]]
  ]));
  const canonicalBefore = canonicalNetwork(rivers);
  const result = applyRiverNetworkCandidate(rivers, pack, {metadata: {spacing: 2}});
  const quality = inspectRiverDisplayQuality(createRiverNetworkCandidateSnapshot(result.rivers, pack, {metadata: {spacing: 2}}));
  assert.deepEqual(canonicalNetwork(result.rivers), canonicalBefore, "基础显示安全回退改写了 canonical 河网");
  assert.equal(quality.selfIntersections, 0, "基础显示自交未回退");
  assert.equal(quality.backtracks, 0, "基础显示回头未回退");
  assert.equal(quality.extraCrossings, 0, "基础显示新增非父子交叉未回退");
}

function verifySelfRetraceAndCrossRiverContacts() {
  const hairpin = [formalRiver(1, 0, [1, 2, 3, 4, 5], [[0, 0], [10, 0], [10, 5], [10, 0], [20, 0]], {outletKind: "internal"})];
  const hairpinPack = formalPack(new Map([[1, [0, 0]], [2, [5, 0]], [3, [10, 0]], [4, [15, 0]], [5, [20, 0]]]));
  const hairpinBefore = inspectRiverDisplayQuality(createRiverNetworkCandidateSnapshot(hairpin, hairpinPack, {metadata: {spacing: 2}}));
  assert.ok(hairpinBefore.selfRetraces > 0, "非相邻重复顶点与反向重叠发夹未进入 self-retrace 门禁");
  const originalPoints = structuredClone(hairpin[0].points);
  const hairpinResult = applyRiverNetworkCandidate(hairpin, hairpinPack, {metadata: {spacing: 2}});
  const hairpinAfter = inspectRiverDisplayQuality(createRiverNetworkCandidateSnapshot(hairpin, hairpinPack, {metadata: {spacing: 2}}));
  assert.equal(hairpinResult.metadata.status, "accepted", "可确定回退的发夹河线未被修复接受");
  assert.equal(hairpinAfter.selfRetraces, 0, "发夹河线回退后仍有 self-retrace/touch");
  assert.notDeepEqual(hairpin[0].points, originalPoints, "发夹河线候选接受但显示点未改变");

  const vertexTouch = [
    formalRiver(1, 0, [10, 11, 12], [[0, 0], [10, 0], [20, 0]], {outletKind: "internal"}),
    formalRiver(2, 0, [13, 14, 15], [[10, -5], [10, 0], [10, 5]], {outletKind: "internal"})
  ];
  const vertexPack = formalPack(new Map([
    [10, [0, -2]], [11, [10, -2]], [12, [20, -2]],
    [13, [8, 1]], [14, [8, 6]], [15, [8, 11]]
  ]));
  const vertexBefore = inspectRiverDisplayQuality(createRiverNetworkCandidateSnapshot(vertexTouch, vertexPack, {metadata: {spacing: 2}}));
  assert.equal(vertexBefore.extraCrossings, 1, "非父子河流在双方 vertex 相交时未去重计为一次新增过连");
  const vertexResult = applyRiverNetworkCandidate(vertexTouch, vertexPack, {metadata: {spacing: 2}});
  const vertexAfter = inspectRiverDisplayQuality(createRiverNetworkCandidateSnapshot(vertexTouch, vertexPack, {metadata: {spacing: 2}}));
  if (vertexResult.metadata.status === "accepted") assert.equal(vertexAfter.extraCrossings, 0, "vertex 过连回退后仍残留交点");
  else assert.ok(vertexResult.metadata.residualQuality?.nonFrozenExtraCrossings > 0, "vertex 过连未修复时仍缺少拒绝残余证据");

  const overlap = [
    formalRiver(1, 0, [20, 21], [[0, 0], [20, 0]], {outletKind: "internal"}),
    formalRiver(2, 0, [22, 23], [[5, 0], [15, 0]], {outletKind: "internal"})
  ];
  const overlapPack = formalPack(new Map([[20, [0, -2]], [21, [20, -2]], [22, [5, 2]], [23, [15, 2]]]));
  const overlapBefore = inspectRiverDisplayQuality(createRiverNetworkCandidateSnapshot(overlap, overlapPack, {metadata: {spacing: 2}}));
  assert.equal(overlapBefore.extraCrossings, 1, "非父子河流正长度共线重叠未进入过连门禁");
  const overlapResult = applyRiverNetworkCandidate(overlap, overlapPack, {metadata: {spacing: 2}});
  assert.notEqual(overlapResult.metadata.status, "accepted", "无法移动端点的共线重叠残余被伪 accepted");
  assert.ok(overlapResult.metadata.residualQuality?.nonFrozenExtraCrossings > 0, "共线重叠拒绝时缺少残余证据");
}

function verifyParentChildOverconnectionFallback() {
  const rivers = [
    formalRiver(1, 0, [1, 2], [[0, 0], [100, 0]], {discharge: 20, width: 0.2, outletKind: "ocean"}),
    formalRiver(2, 1, [4, 5, 6, 1], [[20, 20], [30, -10], [40, 10], [50, 0]], {discharge: 5, width: 0.1})
  ];
  const pack = formalPack(new Map([
    [1, [50, 0]], [2, [100, 0]], [4, [20, 20]], [5, [30, 15]], [6, [40, 10]]
  ]));
  const baselineSnapshot = createRiverNetworkCandidateSnapshot(rivers, pack, {metadata: {spacing: 4}});
  assert.ok(inspectRiverDisplayQuality(baselineSnapshot).extraCrossings >= 2, "父子河流多次相交反例未进入过连门禁");
  const canonicalBefore = canonicalNetwork(rivers);
  const result = applyRiverNetworkCandidate(rivers, pack, {metadata: {spacing: 4}});
  const quality = inspectRiverDisplayQuality(createRiverNetworkCandidateSnapshot(result.rivers, pack, {metadata: {spacing: 4}}));
  assert.equal(quality.extraCrossings, 0, "支流在正式汇流前仍反复穿过父河");
  assert.deepEqual(canonicalNetwork(result.rivers), canonicalBefore, "父子过连回退改写了 canonical 河网");
}

function verifyEqualCountIntersectionMigration() {
  const unrelated = [
    formalRiver(1, 0, [1, 2], [[0, 10], [10, 10]], {outletKind: "internal"}),
    formalRiver(2, 0, [3, 4], [[8, 5], [8, 15]], {outletKind: "internal"})
  ];
  const unrelatedPack = formalPack(new Map([[1, [0, 0]], [2, [10, 0]], [3, [2, -5]], [4, [2, 5]]]));
  const unrelatedQuality = inspectRiverDisplayQuality(createRiverNetworkCandidateSnapshot(unrelated, unrelatedPack, {metadata: {spacing: 2}}));
  assert.equal(unrelatedQuality.extraCrossings, 1, "非父子 canonical 旧交点消失并异地新增等量交点时被总数抵消");

  const related = [
    formalRiver(1, 0, [1, 2, 3], [[0, 20], [100, 20]], {outletKind: "internal"}),
    formalRiver(2, 1, [8, 9, 3], [[60, 10], [60, 30], [100, 20]], {outletKind: "confluence"})
  ];
  const relatedPack = formalPack(new Map([
    [1, [0, 0]], [2, [50, 0]], [3, [100, 0]],
    [8, [10, -10]], [9, [10, 10]]
  ]));
  const relatedQuality = inspectRiverDisplayQuality(createRiverNetworkCandidateSnapshot(related, relatedPack, {metadata: {spacing: 2}}));
  assert.equal(relatedQuality.extraCrossings, 1, "父子 canonical 旧交点消失并异地新增等量交点时被共享 cell 或总数抵消");

  const nearAnchor = [
    formalRiver(1, 0, [1, 2], [[0, 0], [100, 0]], {outletKind: "internal"}),
    formalRiver(2, 1, [3, 1], [[45, 5], [49, -1], [50, 0]], {outletKind: "confluence"})
  ];
  const nearAnchorPack = formalPack(new Map([[1, [50, 0]], [2, [100, 0]], [3, [45, 5]]]));
  const nearAnchorQuality = inspectRiverDisplayQuality(createRiverNetworkCandidateSnapshot(nearAnchor, nearAnchorPack, {metadata: {spacing: 2}}));
  assert.equal(nearAnchorQuality.extraCrossings, 1, "共享汇流 endpoint 附近的提前穿越被 anchor 容差误当合法");
}

function verifyFragmentRendererConsumption() {
  const parent = formalRiver(1, 0, [1, 2], [[0, 0], [20, 0]], {width: 0.2, outletKind: "ocean"});
  const oldShort = formalRiver(2, 0, [3, 4], [[20, 2], [21, 2]], {width: 0.005, outletKind: "internal"});
  const manualShort = {...formalRiver(3, 0, [5, 6], [[24, 2], [25, 2]], {width: 0.005, outletKind: "internal"}), manual: true};
  const hidden = {...formalRiver(4, 0, [7, 8], [[2, 2], [3, 2]], {width: 0.005, outletKind: "internal"}), displayPolicy: {fragment: "hide-visual-only"}};
  const lockedHidden = {...formalRiver(5, 0, [9, 10], [[6, 2], [7, 2]], {width: 0.005, outletKind: "internal"}), displayPolicy: {fragment: "hide-visual-only"}};
  const connected = {...formalRiver(6, 1, [11, 1], [[8, 2], [8, 0]], {width: 0.005}), displayPolicy: {fragment: "extend-to-confluence"}};
  const protectedOutlet = {...formalRiver(7, 1, [12, 13], [[12, 2], [12, 1]], {width: 0.005, outletKind: "lake-outlet"}), displayPolicy: {fragment: "preserve-protected-outlet"}};
  const map = {
    rivers: {rivers: [parent, oldShort, manualShort, hidden, lockedHidden, connected, protectedOutlet]},
    regenerationLocks: {version: 1, entries: [{kind: "river", id: 5}]}
  };
  assert.equal(riverVisualPolicyForRendering(map, oldShort), "preserve", "旧图短细河无固化策略时被动态隐藏");
  assert.equal(riverVisualPolicyForRendering(map, manualShort), "preserve", "手工短细河无固化策略时被动态隐藏");
  assert.equal(riverVisualPolicyForRendering(map, hidden), "hide-visual-only", "本次固化的隐藏策略没有被 renderer 消费");
  assert.equal(isRiverVisibleForRendering(map, hidden), false, "显式 hide-visual-only 仍会进入 river mesh");
  assert.equal(riverVisualPolicyForRendering(map, lockedHidden), "preserve", "河流重生成锁没有优先覆盖隐藏策略");
  assert.equal(isRiverVisibleForRendering(map, lockedHidden), true, "锁定短细河仍被隐藏");
  assert.equal(riverVisualPolicyForRendering(map, connected), "extend-to-confluence", "已汇流细支流被误隐藏");
  assert.equal(isRiverVisibleForRendering(map, protectedOutlet), true, "保护出口被误隐藏");
  assert.equal(isRiverVisibleForRendering(map, parent), true, "主河河口被误隐藏");
  const picked = pickRiver(map, null, 2.5, 2, 5, river => isRiverVisibleForRendering(map, river));
  assert.equal(picked?.id, parent.id, "更近的隐藏碎片遮断了相邻可见河流拾取");

  const current = [formalRiver(20, 0, [20, 21], [[30, 0], [31, 0]], {width: 0.005, outletKind: "internal"})];
  const currentPack = formalPack(new Map([[20, [30, 0]], [21, [31, 0]]]));
  const currentResult = applyRiverNetworkCandidate(current, currentPack, {metadata: {spacing: 2}});
  assert.equal(currentResult.metadata.accepted, true, "本次短细河候选未完成");
  assert.equal(current[0].displayPolicy?.fragment, "hide-visual-only", "本次非冻结候选没有固化 fragment policy");
  assert.equal(isRiverVisibleForRendering({rivers: {rivers: current}}, current[0]), false, "本次固化隐藏策略未进入可见性链");

  const frozen = [formalRiver(21, 0, [22, 23], [[34, 0], [35, 0]], {width: 0.005, outletKind: "internal"})];
  const frozenPack = formalPack(new Map([[22, [34, 0]], [23, [35, 0]]]));
  applyRiverNetworkCandidate(frozen, frozenPack, {metadata: {spacing: 2}}, {frozenIds: new Set([21])});
  assert.equal(frozen[0].displayPolicy, undefined, "冻结短细河被写入本次 fragment policy");
  assert.equal(isRiverVisibleForRendering({rivers: {rivers: frozen}}, frozen[0]), true, "冻结短细河无策略时没有默认保留");
}

function verifyLongBridgeRefusal() {
  const rivers = [
    formalRiver(1, 0, [1, 2], [[0, 0], [100, 0]], {discharge: 20, width: 0.2, outletKind: "ocean"}),
    formalRiver(2, 1, [9, 1], [[0, 1000], [0, 500]], {discharge: 5, width: 0.1})
  ];
  const pack = formalPack(new Map([[1, [50, 0]], [2, [100, 0]], [9, [0, 1000]]]));
  const before = structuredClone(rivers[1]);
  const result = applyRiverNetworkCandidate(rivers, pack, {metadata: {spacing: 2}});
  const relation = result.candidate.relations.find(item => item.childId === 2);
  assert.equal(relation.reason, "confluence-display-gap", "500+ 长桥反例没有拒绝");
  assert.deepEqual(rivers[1], before, "500+ 长桥反例改写了支流");
}

function verifyProtectedOutletAndFrozenRiver() {
  const rivers = [
    formalRiver(1, 0, [1, 2], [[0, 0], [100, 0]], {discharge: 20, width: 0.2, outletKind: "ocean"}),
    formalRiver(2, 1, [9, 1], [[0, 20], [49, 2]], {discharge: 5, width: 0.1, outletKind: "lake-outlet"}),
    formalRiver(3, 1, [10, 1], [[0, 40], [45, 10]], {discharge: 4, width: 0.08})
  ];
  const pack = formalPack(new Map([[1, [50, 0]], [2, [100, 0]], [9, [0, 20]], [10, [0, 40]]]));
  const protectedBefore = structuredClone(rivers[1]);
  const frozenBefore = structuredClone(rivers[2]);
  const frozenGapBefore = closestPolylineDistance(rivers[2].points.at(-1), rivers[0].points);
  const result = applyRiverNetworkCandidate(rivers, pack, {metadata: {spacing: 4}}, {frozenIds: new Set([3])});
  const frozenRelation = result.candidate.relations.find(item => item.childId === 3);
  assert.deepEqual(rivers[1].points, protectedBefore.points, "保护河口几何被显示候选改写");
  assert.equal(rivers[1].displayPolicy?.fragment, "preserve-protected-outlet", "保护河口没有固化保留策略");
  assert.deepEqual(rivers[2], frozenBefore, "冻结河流被显示候选改写");
  assert.equal(result.metadata.frozenSkipped, 1, "冻结河流跳过证据缺失");
  assert.equal(frozenRelation?.status, "frozen", "断连冻结支流仍被伪标 accepted");
  assert.equal(frozenRelation?.reason, "frozen-child-preserved", "断连冻结支流的限制原因不精确");
  assert.equal(frozenRelation?.finalGap, frozenGapBefore, "冻结支流关系距离没有使用 apply 后实际 source 几何");
  assert.equal(result.metadata.status, "partial", "断连冻结支流没有把整体状态降为 partial");
  assert.equal(result.metadata.accepted, false, "断连冻结支流仍让 metadata 伪 accepted");
}

function verifyFrozenParentGeometry() {
  const rivers = [
    formalRiver(1, 0, [1, 2, 3, 4], [[0, 0], [10, 10], [0, 10], [10, 0]], {discharge: 20, width: 0.2, outletKind: "ocean"}),
    formalRiver(2, 1, [9, 4], [[12, 8], [5, 1]], {discharge: 5, width: 0.1})
  ];
  const pack = formalPack(new Map([[1, [0, 0]], [2, [3, 0]], [3, [7, 0]], [4, [10, 0]], [9, [12, 8]]]));
  const frozenParent = structuredClone(rivers[0]);
  assert.ok(closestPolylineDistance(rivers[1].points.at(-1), rivers[0].points) > 1, "冻结父河夹具初始并未断连");
  const result = applyRiverNetworkCandidate(rivers, pack, {metadata: {spacing: 2}}, {frozenIds: new Set([1])});
  const relation = result.candidate.relations.find(item => item.childId === 2 && item.parentId === 1);
  const gap = closestPolylineDistance(rivers[1].points.at(-1), rivers[0].points);
  assert.deepEqual(rivers[0], frozenParent, "自交冻结父河被基础显示修复改写");
  assert.ok(["rejected", "frozen"].includes(relation?.status) || gap <= 1e-7, "冻结父河关系被伪 accepted 但最终仍断连");
  if (relation?.status === "accepted") assert.equal(gap, 0, "冻结父河 accepted 关系最终 gap 未归零");
  assert.equal(result.metadata.status, "partial", "冻结父河残余自交没有把状态降为 partial");
  assert.equal(result.metadata.accepted, false, "冻结父河残余自交仍被伪 accepted");
  assert.ok(result.metadata.residualQuality?.frozenSelfIntersections > 0, "冻结父河残余质量证据缺失");
}

function verifyResidualQualityStatuses() {
  const frozen = [formalRiver(1, 0, [1, 2, 3, 4], [[0, 0], [10, 10], [0, 10], [10, 0]], {outletKind: "internal"})];
  const frozenPack = formalPack(new Map([[1, [0, 0]], [2, [3, 0]], [3, [7, 0]], [4, [10, 0]]]));
  const before = structuredClone(frozen[0]);
  const frozenResult = applyRiverNetworkCandidate(frozen, frozenPack, {metadata: {spacing: 2}}, {frozenIds: new Set([1])});
  assert.deepEqual(frozen[0], before, "冻结自交根河被修改");
  assert.equal(frozenResult.metadata.status, "partial", "冻结自交根河仍被标为 accepted");
  assert.equal(frozenResult.candidate.rejection?.reason, "frozen-quality-limited", "冻结残余质量原因不精确");
  assert.equal(frozenResult.metadata.residualQuality?.frozenSelfIntersections, 1, "冻结自交残余证据不精确");

  const rivers = [];
  const points = new Map();
  let cell = 1;
  for (let pair = 0; pair < 65; pair++) {
    const x = pair * 20;
    const upperCells = [cell++, cell++, cell++];
    const lowerCells = [cell++, cell++, cell++];
    rivers.push(formalRiver(rivers.length + 1, 0, upperCells, [[x, 0], [x + 5, 10], [x + 10, 0]], {outletKind: "internal"}));
    rivers.push(formalRiver(rivers.length + 1, 0, lowerCells, [[x, 10], [x + 5, 0], [x + 10, 10]], {outletKind: "internal"}));
    points.set(upperCells[0], [x, 0]);
    points.set(upperCells[1], [x + 5, 0]);
    points.set(upperCells[2], [x + 10, 0]);
    points.set(lowerCells[0], [x, 10]);
    points.set(lowerCells[1], [x + 5, 10]);
    points.set(lowerCells[2], [x + 10, 10]);
  }
  const limited = applyRiverNetworkCandidate(rivers, formalPack(points), {metadata: {spacing: 2}});
  assert.equal(limited.metadata.status, "rejected", "超过基础修复上限的非冻结残余仍被接受");
  assert.equal(limited.metadata.accepted, false, "超过修复上限的残余 metadata 仍为 accepted");
  assert.equal(limited.candidate.rejection?.reason, "display-quality-residual", "非冻结残余质量原因不精确");
  assert.ok(limited.metadata.residualQuality?.nonFrozenExtraCrossings > 0, "修复上限残余交叉证据缺失");
}

function verifyPointFluxPreservation() {
  const map = generatePlaceholderMap({seed: "flux-preservation-audit", cellsTarget: 10000, heightmapTemplate: "continents", riverNetworkCandidate: false});
  const before = structuredClone(map.rivers.rivers);
  const result = applyRiverNetworkCandidate(map.rivers.rivers, map.pack, map.grid, {metadata: {seed: "flux-preservation-audit", cellsTarget: 10000}});
  const beforeById = new Map(before.map(river => [Number(river.id ?? river.i), river]));
  const changed = result.rivers.filter(river => !sameXYPoints(beforeById.get(Number(river.id ?? river.i))?.points, river.points));
  assert.ok(changed.length > 0, "逐点 flux 夹具没有产生任何候选几何变化");
  assert.equal(changed.length, result.metadata.appliedCurves, "逐点 flux 验证集合与 appliedCurves 不一致");
  assert.ok(result.metadata.restoredPointFluxes > 0, "候选改点没有记录逐点 flux 恢复");
  for (const river of changed) {
    const original = beforeById.get(Number(river.id ?? river.i));
    assert.ok(original.points.every(point => Number.isFinite(Number(point[2]))), `河流 #${river.id} 原始逐点 flux 夹具不完整`);
    assert.ok(river.points.every(point => Number.isFinite(Number(point[2]))), `河流 #${river.id} 候选改点后丢失逐点 flux`);
    assert.ok(river.points.every((point, index) => index === 0 || Number(point[2]) + 1e-7 >= Number(river.points[index - 1][2])), `河流 #${river.id} 候选逐点 flux 不再单调`);
    assert.ok(Math.abs(Number(river.points[0][2]) - Number(original.points[0][2])) <= 1e-7, `河流 #${river.id} 源头逐点 flux 语义漂移`);
    assert.ok(Math.abs(Number(river.points.at(-1)[2]) - Number(original.points.at(-1)[2])) <= 1e-7, `河流 #${river.id} 末端逐点 flux 语义漂移`);
    const originalEndpointIndex = river.points.findIndex(point => pointDistance(point, original.points.at(-1)) <= 1e-7);
    if (originalEndpointIndex >= 0 && originalEndpointIndex < river.points.length - 1) {
      assert.ok(river.points.slice(originalEndpointIndex).every(point => Math.abs(Number(point[2]) - Number(original.points.at(-1)[2])) <= 1e-7), `河流 #${river.id} 汇流追加段没有延续终端 flux`);
    }
  }
}

function formalRiver(id, parent, cells, points, options = {}) {
  return {
    id,
    i: id,
    parent,
    basin: parent || id,
    source: cells[0],
    mouth: cells.at(-1),
    cells,
    gridCells: [...cells],
    points,
    discharge: options.discharge || 1,
    flux: options.discharge || 1,
    width: options.width ?? 0.05,
    length: 1,
    outletKind: options.outletKind || (parent ? "confluence" : "ocean")
  };
}

function formalPack(cellPoints) {
  const pack = {cells: {p: [], h: []}};
  for (const [cell, point] of cellPoints) {
    pack.cells.p[cell] = point;
    pack.cells.h[cell] = 30;
  }
  return pack;
}

function canonicalNetwork(rivers) {
  return rivers.map(river => ({
    id: Number(river.id ?? river.i),
    parent: Number(river.parent || 0),
    basin: Number(river.basin || 0),
    source: Number(river.source),
    mouth: Number(river.mouth),
    cells: [...(river.cells || [])],
    gridCells: [...(river.gridCells || [])]
  })).sort((left, right) => left.id - right.id);
}

function closestPolylineDistance(point, points) {
  return Math.min(...points.slice(1).map((end, index) => pointSegmentDistance(point, points[index], end)));
}

function pointSegmentDistance(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  const ratio = lengthSquared ? Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared)) : 0;
  return Math.hypot(point[0] - (start[0] + ratio * dx), point[1] - (start[1] + ratio * dy));
}

function uniquePolylineContactPoints(left, right) {
  const contacts = [];
  for (let leftIndex = 1; leftIndex < left.length; leftIndex++) {
    const a = left[leftIndex - 1];
    const b = left[leftIndex];
    const rx = b[0] - a[0];
    const ry = b[1] - a[1];
    for (let rightIndex = 1; rightIndex < right.length; rightIndex++) {
      const c = right[rightIndex - 1];
      const d = right[rightIndex];
      const sx = d[0] - c[0];
      const sy = d[1] - c[1];
      const denominator = rx * sy - ry * sx;
      if (Math.abs(denominator) <= 1e-9) continue;
      const qx = c[0] - a[0];
      const qy = c[1] - a[1];
      const t = (qx * sy - qy * sx) / denominator;
      const u = (qx * ry - qy * rx) / denominator;
      if (t < -1e-7 || t > 1 + 1e-7 || u < -1e-7 || u > 1 + 1e-7) continue;
      const point = [a[0] + rx * Math.max(0, Math.min(1, t)), a[1] + ry * Math.max(0, Math.min(1, t))];
      if (!contacts.some(existing => pointDistance(existing, point) <= 1e-7)) contacts.push(point);
    }
  }
  return contacts;
}

function pointDistance(left, right) {
  return Math.hypot(left[0] - right[0], left[1] - right[1]);
}

function sameXYPoints(left, right) {
  return (left?.length || 0) === (right?.length || 0)
    && (left || []).every((point, index) => pointDistance(point, right[index]) <= 1e-7);
}
