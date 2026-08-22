#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {
  PROVINCE_COLLISION_OPACITY,
  automaticPoliticalLabelOrder,
  createPoliticalLabelGlyphLayout,
  resolvePoliticalLabelPlacement,
  restorePoliticalLabelPlacementSnapshot
} from "../app/webgl-generator/src/renderer/political-label-layout.js";
import {estimateLabelTextBox, resolveLabelStyle} from "../app/webgl-generator/src/runtime/label-style-registry.js";

const stateStyle = {fontSize: 30, letterSpacing: 2, strokeWidth: 0, shadowOffsetX: 0, shadowOffsetY: 0, shadowBlur: 0};
const provinceStyle = {fontSize: 18, letterSpacing: 0.2, strokeWidth: 0, shadowOffsetX: 0, shadowOffsetY: 0, shadowBlur: 0};
const stateItem = {targetKind: "state", targetId: 1, text: "北境共和国", rotation: 0, resolvedStyle: stateStyle};
const screen = {x: 320, y: 180};
const viewport = {width: 640, height: 360};

const straight = createPoliticalLabelGlyphLayout(stateItem.text, stateStyle, {targetKind: "state", rotation: 0, bend: 0});
assert.equal(straight.spacing, 2.4, "国家名称必须保留不少于 2.4px 的稳定字距");
assert(straight.glyphs.every(glyph => glyph.y === 0 && glyph.angle === 0), "直线候选不应产生弯曲偏移");
for (let index = 1; index < straight.glyphs.length; index++) {
  assert(straight.glyphs[index].x > straight.glyphs[index - 1].x, "政治标签字形必须按稳定顺序分布");
}

const upward = createPoliticalLabelGlyphLayout(stateItem.text, stateStyle, {targetKind: "state", rotation: 0, bend: 14});
const downward = createPoliticalLabelGlyphLayout(stateItem.text, stateStyle, {targetKind: "state", rotation: 0, bend: -14});
const middle = Math.floor(upward.glyphs.length / 2);
assert(upward.glyphs[middle].y > upward.glyphs[0].y, "正二次曲线中部必须偏离端点");
assert(downward.glyphs[middle].y < downward.glyphs[0].y, "负二次曲线中部必须向反方向偏离");
assert(upward.glyphs[0].angle > 0 && upward.glyphs.at(-1).angle < 0, "二次曲线两端切线角必须方向相反");

const baseline = resolvePoliticalLabelPlacement({item: stateItem, screen, viewport, padding: 6});
assert.equal(baseline.candidateIndex, 0, "无遮挡时必须优先使用直线原锚点");
assert.equal(baseline.collides, false);
const cityObstacle = expandBox(baseline.box, 3);
const avoided = resolvePoliticalLabelPlacement({item: stateItem, screen, obstacles: [cityObstacle], viewport, padding: 6});
assert(avoided.candidateIndex > 0, "原位置被城市占用时必须选择其它直线或曲线候选");
assert.equal(avoided.cityCollides, false, "存在可用候选时不得继续压住城市标签");
assert.deepEqual(
  resolvePoliticalLabelPlacement({item: stateItem, screen, obstacles: [cityObstacle], viewport, padding: 6}),
  avoided,
  "相同输入的政治标签候选必须完全确定"
);
const refreshedPreferred = resolvePoliticalLabelPlacement({item: stateItem, screen, obstacles: [cityObstacle], viewport, padding: 6, preferredCandidateIndex: 0});
const retainedPreferred = resolvePoliticalLabelPlacement({item: stateItem, screen, obstacles: [cityObstacle], viewport, padding: 6, preferredCandidateIndex: 0, retainPreferred: true});
assert.notEqual(refreshedPreferred.candidateIndex, 0, "普通同缩放布局更新不得粘住已碰撞的旧候选");
assert.equal(retainedPreferred.candidateIndex, 0, "纯平移滞回应保留旧候选避免提交跳位");
const snapshotItem = {
  politicalOffsetX: 12,
  politicalOffsetY: -4,
  politicalPlacementSnapshot: {
    candidateIndex: avoided.candidateIndex,
    bend: avoided.bend,
    rootSize: avoided.rootSize,
    glyphs: avoided.glyphs,
    boxOffset: {
      left: avoided.box.left - avoided.anchor.x,
      right: avoided.box.right - avoided.anchor.x,
      top: avoided.box.top - avoided.anchor.y,
      bottom: avoided.box.bottom - avoided.anchor.y
    },
    collides: avoided.collides,
    cityCollides: avoided.cityCollides
  }
};
const restoredSnapshot = restorePoliticalLabelPlacementSnapshot(snapshotItem, {x: 400, y: 250});
assert.deepEqual(restoredSnapshot.anchor, {x: 412, y: 246}, "政治标签快照没有按新基础坐标平移");
assert.equal(restoredSnapshot.candidateIndex, avoided.candidateIndex, "政治标签快照候选发生漂移");
assert.equal(restoredSnapshot.bend, avoided.bend, "政治标签快照弯曲值发生漂移");
assert.equal(restoredSnapshot.rootSize, avoided.rootSize, "政治标签快照误重建 root size");
assert.equal(restoredSnapshot.glyphs, avoided.glyphs, "政治标签快照误重建 glyph layout");
assert.equal(restoredSnapshot.box.left, 412 + snapshotItem.politicalPlacementSnapshot.boxOffset.left, "政治标签快照 box 未保持相对偏移");
assert.equal(restoredSnapshot.collides, avoided.collides, "政治标签快照碰撞标记发生漂移");
assert.equal(restoredSnapshot.cityCollides, avoided.cityCollides, "政治标签快照城市碰撞标记发生漂移");
assert.equal(restoredSnapshot.peerCollides, false, "交互提交快照仍被旧 peer collision 阻断");
assert.equal(restorePoliticalLabelPlacementSnapshot({}, screen), null, "缺失政治标签快照时未回退 resolver");
for (const [name, mutate] of [
  ["candidate", snapshot => delete snapshot.candidateIndex],
  ["bend", snapshot => delete snapshot.bend],
  ["rootSize", snapshot => delete snapshot.rootSize],
  ["glyphs", snapshot => delete snapshot.glyphs],
  ["boxOffset", snapshot => delete snapshot.boxOffset.bottom],
  ["collides", snapshot => delete snapshot.collides],
  ["cityCollides", snapshot => delete snapshot.cityCollides]
]) {
  const partial = structuredClone(snapshotItem);
  mutate(partial.politicalPlacementSnapshot);
  assert.equal(restorePoliticalLabelPlacementSnapshot(partial, screen), null, `部分快照 ${name} 未回退 resolver`);
}

const provinceItem = {targetKind: "province", targetId: 2, text: "霜原行省", rotation: 0, resolvedStyle: provinceStyle};
const provinceStraight = createPoliticalLabelGlyphLayout(provinceItem.text, provinceStyle, {targetKind: "province", rotation: 0, bend: 0});
assert.equal(provinceStraight.spacing, 0.7, "省份名称必须保留不少于 0.7px 的稳定字距");
const impossibleObstacle = {left: -1000, right: 1000, top: -1000, bottom: 1000};
const fallback = resolvePoliticalLabelPlacement({item: provinceItem, screen, obstacles: [impossibleObstacle], viewport, padding: 6});
assert.equal(fallback.collides, true, "无解样本必须返回最佳碰撞候选供省份降级显示");
assert.equal(PROVINCE_COLLISION_OPACITY, 0.76, "省份碰撞透明度必须保持清晰且仍低于正常标签");
const compactZoneBox = estimateLabelTextBox("北境荒原", resolveLabelStyle({version: 1, overrides: {zone: {fontSize: 10, letterSpacing: 0}}}, "zone"));
const expandedZoneBox = estimateLabelTextBox("北境荒原", resolveLabelStyle({version: 1, overrides: {zone: {fontSize: 36, letterSpacing: 5}}}, "zone"));
assert.ok(expandedZoneBox.width > compactZoneBox.width && expandedZoneBox.height > compactZoneBox.height, "地区样式字号与字距没有进入共享碰撞盒");

const orderedKinds = automaticPoliticalLabelOrder([
  {targetKind: "province", targetId: 1, priority: 90},
  {targetKind: "state", targetId: 1, priority: 100},
  {targetKind: "custom", targetId: 1, priority: 1000},
  {targetKind: "city", targetId: 1, priority: 1}
]).map(item => item.targetKind);
assert.deepEqual(orderedKinds, ["city", "custom", "state", "province"], "默认自动布局必须先确定城市，再布置政治标签");

const [rendererSource, stylesSource, mapIoSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/renderer/placeholder-renderer.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/styles.css", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/map-file-io.js", import.meta.url), "utf8")
]);
assert.match(rendererSource, /priorityLayout \? this\.labelItems : automaticPoliticalLabelOrder\(this\.labelItems\)/, "默认标签顺序没有切换为城市优先");
assert.match(rendererSource, /preservePoliticalCandidate = this\.viewportInteractionKind === "pan" \|\| this\.viewportInteractionKind === "zoom"/, "政治标签候选滞回没有覆盖平移与缩放交互提交");
assert.match(
  rendererSource,
  /const retainedPoliticalPlacement = politicalLabel && preservePoliticalCandidate && \(item\.visible \|\| item\.buffered\)[\s\S]*restorePoliticalLabelPlacementSnapshot\(item, baseScreen\)[\s\S]*let politicalPlacement = retainedPoliticalPlacement \|\| \(politicalLabel \? resolvePoliticalLabelPlacement/,
  "政治标签交互提交仍先重算 resolver 再覆盖既有布局快照"
);
assert.match(rendererSource, /provinceLabel\s*\n\s*\? false/, "省份碰撞仍可能被自动布局完全隐藏");
assert.match(rendererSource, /appendLabelNodeText[\s\S]*political-label-glyph/, "国家 / 省份名称没有拆分为逐字路径节点");
assert.match(stylesSource, /\.province-label\.collision-fallback[\s\S]*z-index:\s*1/, "省份碰撞降级没有降低层级");
assert.match(stylesSource, /province-label\.visible\.collision-fallback[\s\S]*province-label-collision-opacity/, "省份碰撞降级没有降低不透明度");
assert.match(mapIoSource, /querySelectorAll\("\.political-label-glyph"\)[\s\S]*cssRotationDegrees\(glyph\)/, "PNG 没有按实时逐字角度绘制政治标签");

console.log(JSON.stringify({
  ok: true,
  spacing: {state: straight.spacing, province: provinceStraight.spacing},
  curves: {upwardMiddleY: upward.glyphs[middle].y, downwardMiddleY: downward.glyphs[middle].y},
  avoidedCandidate: {index: avoided.candidateIndex, bend: avoided.bend, anchor: avoided.anchor},
  fallback: {candidate: fallback.candidateIndex, opacity: PROVINCE_COLLISION_OPACITY},
  zoneBox: {compact: compactZoneBox, expanded: expandedZoneBox},
  order: orderedKinds
}, null, 2));

function expandBox(box, padding) {
  return {left: box.left - padding, right: box.right + padding, top: box.top - padding, bottom: box.bottom + padding};
}
