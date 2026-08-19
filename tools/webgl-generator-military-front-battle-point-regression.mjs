#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {
  MILITARY_FRONT_BATTLE_POINT_CROSS_HALF_LENGTH_FACTOR,
  MILITARY_FRONT_BATTLE_POINT_LENGTH_FACTOR,
  MILITARY_FRONT_BATTLE_POINT_RADIUS_FACTOR,
  buildMilitaryFrontRenderPlan,
  militaryFrontBoundaryPoints,
  militaryFrontPathLength,
  militaryFrontPathMidpoint,
  pushMilitaryFrontLayer
} from "../app/webgl-generator/src/renderer/military-front-layer.js";

const widthWorld = 12;
const shortAttack = createFront({id: "3:5:attack:996", stance: "attack", points: [[20, 30], [26, 30]]});
const shortDefense = createFront({id: "3:5:defense:996", stance: "defense", points: [[26, 30], [20, 30]]});
const shortPairPlan = buildMilitaryFrontRenderPlan([shortAttack, shortDefense], widthWorld);
assert.equal(MILITARY_FRONT_BATTLE_POINT_LENGTH_FACTOR, 2.4);
assert.equal(MILITARY_FRONT_BATTLE_POINT_RADIUS_FACTOR, 0.2);
assert.equal(MILITARY_FRONT_BATTLE_POINT_CROSS_HALF_LENGTH_FACTOR, 1.12);
assert.equal(shortPairPlan.arrows.length, 0, "极近攻防线仍被保留为箭头");
assert.equal(shortPairPlan.battlePoints.length, 1, "同一战争的极近攻防线没有合并为单一交战点");
assert.equal(shortPairPlan.collapsedFrontCount, 2);
assert.deepEqual(shortPairPlan.battlePoints[0].stances, ["attack", "defense"]);
assert.deepEqual(shortPairPlan.battlePoints[0].center, [23, 30]);

const separateWar = createFront({
  id: "3:5:attack:997",
  stance: "attack",
  points: [[20, 30], [26, 30]],
  campaign: "第二场战争"
});
const separateWarPlan = buildMilitaryFrontRenderPlan([shortAttack, shortDefense, separateWar], widthWorld);
assert.equal(separateWarPlan.battlePoints.length, 2, "不同战争的极近战线被误合并");

const distantSameWarPlan = buildMilitaryFrontRenderPlan([
  shortAttack,
  createFront({id: "3:5:defense:996", stance: "defense", points: [[120, 30], [126, 30]]})
], widthWorld);
assert.equal(distantSameWarPlan.battlePoints.length, 2, "同一战争中不同位置的极近战线被误合并");

const legacyPairPlan = buildMilitaryFrontRenderPlan([
  createFront({id: null, stance: "attack", points: [[40, 40], [46, 40]], campaign: "旧档战争"}),
  createFront({id: null, stance: "defense", points: [[46, 40], [40, 40]], campaign: "旧档战争"})
], widthWorld);
assert.equal(legacyPairPlan.battlePoints.length, 1, "缺少新版 id 的旧档攻防线没有按国家、战役和位置聚合");

const singleShortPlan = buildMilitaryFrontRenderPlan([shortAttack], widthWorld);
assert.equal(singleShortPlan.battlePoints.length, 1, "单条极近旧战线没有交战点兜底");
assert.equal(singleShortPlan.battlePoints[0].frontCount, 1);

const longLength = widthWorld * MILITARY_FRONT_BATTLE_POINT_LENGTH_FACTOR + 1;
const longAttack = createFront({id: "6:8:attack:999", stance: "attack", points: [[0, 0], [longLength, 0]], maxLength: 0});
const longPlan = buildMilitaryFrontRenderPlan([longAttack], widthWorld);
assert.equal(longPlan.arrows.length, 1, "阈值以上的正常战线没有保留箭头");
assert.equal(longPlan.battlePoints.length, 0);
assert.equal(longPlan.arrows[0].length, longLength);

const clippedFront = createFront({id: "7:9:attack:998", stance: "attack", points: [[0, 0], [80, 0]], maxLength: 6});
const clippedPoints = militaryFrontBoundaryPoints(clippedFront);
assert.equal(militaryFrontPathLength(clippedPoints), 6, "战线有效路径长度没有服从 maxLength");
assert.deepEqual(militaryFrontPathMidpoint(clippedPoints), [40, 0]);
assert.equal(buildMilitaryFrontRenderPlan([clippedFront], widthWorld).battlePoints.length, 1, "裁短后的有效战线没有转为交战点");

const vertices = [];
const renderStats = pushMilitaryFrontLayer(vertices, {map: {metadata: {graphWidth: 960, graphHeight: 640}}}, {
  metadata: {graphWidth: 960, graphHeight: 640},
  military: {fronts: [shortAttack, shortDefense]}
});
assert.deepEqual(renderStats, {arrowCount: 0, battlePointCount: 1, collapsedFrontCount: 2, widthWorld: 12});
assert(vertices.length > 0 && vertices.length % 6 === 0, "交战点没有生成有效 WebGL 三角形顶点");
assert(vertices.every(Number.isFinite), "交战点顶点包含非有限值");
assert.equal(vertices.length / 6, 120, "交战点没有收为单圆圈与两条交叉斜杆");
const colors = vertexColors(vertices);
assert(colors.some(color => color[0] > 0.9 && color[1] < 0.35 && color[2] < 0.25), "交战点缺少红色进攻兵刃");
assert(colors.some(color => color[0] < 0.3 && color[1] > 0.5 && color[2] > 0.9), "交战点缺少蓝色防守兵刃");
assert.equal(new Set(colors.map(color => color.join(","))).size, 3, "交战点包含圆圈、红杆和蓝杆以外的装饰颜色");
assert(!colors.some(color => color[0] > 0.9 && color[1] > 0.65 && color[2] < 0.7), "交战点仍包含金色环或中心钉");
const battlePointBounds = vertexNdcBounds(vertices);
const battlePointDiameterNdc = battlePointBounds.maxX - battlePointBounds.minX;
const battlePointDiameterWorld = battlePointDiameterNdc * 960 / 2;
const expectedDiameterWorld = widthWorld * MILITARY_FRONT_BATTLE_POINT_RADIUS_FACTOR * 2;
assert.ok(Math.abs(battlePointDiameterWorld - expectedDiameterWorld) < 0.0001, "交战点世界尺寸没有按小型符号半径生成");
assert.ok(battlePointDiameterWorld < widthWorld / 2, "交战点仍接近战线宽度，未缩到城镇图标量级");
const circleDiameterWorld = expectedDiameterWorld;
const expectedCrossLengthWorld = circleDiameterWorld * MILITARY_FRONT_BATTLE_POINT_CROSS_HALF_LENGTH_FACTOR;
const attackCrossLengthWorld = coloredVertexProjectionSpan(vertices, color => color[0] > 0.9 && color[1] < 0.35, -Math.PI / 4);
const defenseCrossLengthWorld = coloredVertexProjectionSpan(vertices, color => color[0] < 0.3 && color[1] > 0.5, Math.PI / 4);
assert.ok(Math.abs(attackCrossLengthWorld - expectedCrossLengthWorld) < 0.0001, "红色叉臂长度不符合约定");
assert.ok(Math.abs(defenseCrossLengthWorld - expectedCrossLengthWorld) < 0.0001, "蓝色叉臂长度不符合约定");
assert.ok(attackCrossLengthWorld > circleDiameterWorld && attackCrossLengthWorld < circleDiameterWorld * 1.15, "红蓝叉没有只比圆圈直径略长");
const fitScreenDiameter = battlePointDiameterNdc * 960 / 2;
const zoomedScreenDiameter = battlePointDiameterNdc * 960 / 2 * 3;
assert.ok(fitScreenDiameter <= 5 && zoomedScreenDiameter >= 14, "交战点没有形成全图微小、放大后可辨的缩放语义");

const longVertices = [];
const longRenderStats = pushMilitaryFrontLayer(longVertices, {map: {metadata: {graphWidth: 960, graphHeight: 640}}}, {
  metadata: {graphWidth: 960, graphHeight: 640},
  military: {fronts: [longAttack, {...longAttack, id: "6:8:defense:999", stance: "defense", direction: {x: -1, y: 0}}]}
});
assert.deepEqual(longRenderStats, {arrowCount: 2, battlePointCount: 0, collapsedFrontCount: 0, widthWorld: 12});
assert.equal(longVertices.length / 6, 36, "正常攻防线没有保持原箭身、箭头与 halo 顶点数量");
const longColors = vertexColors(longVertices);
assert(longColors.some(color => color[0] === 1 && color[1] === 0.23 && color[2] === 0.07), "正常进攻线暖色箭头丢失");
assert(longColors.some(color => color[0] === 0.2 && color[1] === 0.58 && color[2] === 1), "正常防守线冷色箭头丢失");

const realMap = generatePlaceholderMap({
  seed: "military-front-12",
  cellsTarget: 3000,
  graphWidth: 960,
  graphHeight: 640,
  heightmapTemplate: "continents"
});
const realPlan = buildMilitaryFrontRenderPlan(realMap.military?.fronts || [], widthWorld);
assert(realMap.military.fronts.length >= 2, "固定真实样本没有生成可验证战线");
assert.equal(realPlan.arrows.length, 0, "固定真实样本的极近战线没有全部转为交战点");
assert(realPlan.battlePoints.length > 0, "固定真实样本没有生成交战点");
assert.equal(realPlan.collapsedFrontCount, realMap.military.fronts.length);

const rendererSource = await readFile(new URL("../app/webgl-generator/src/renderer/placeholder-renderer.js", import.meta.url), "utf8");
assert.match(rendererSource, /import \{pushMilitaryFrontLayer\} from "\.\/military-front-layer\.js";/, "主渲染器没有接入独立战线图层");
assert.match(rendererSource, /visibility\.warFronts !== false\) pushMilitaryFrontLayer\(vertices, context, map\)/, "战线开关没有控制新的交战点路径");
assert.doesNotMatch(rendererSource, /function pushMilitaryFrontLines\(/, "主渲染器仍保留旧战线重复实现");

console.log(JSON.stringify({
  ok: true,
  thresholdFactor: MILITARY_FRONT_BATTLE_POINT_LENGTH_FACTOR,
  shortPair: {
    sourceFronts: 2,
    arrows: shortPairPlan.arrows.length,
    battlePoints: shortPairPlan.battlePoints.length,
    center: shortPairPlan.battlePoints[0].center
  },
  longFront: {
    length: longLength,
    arrows: longRenderStats.arrowCount,
    battlePoints: longRenderStats.battlePointCount,
    vertices: longVertices.length / 6
  },
  render: {
    ...renderStats,
    vertices: vertices.length / 6,
    triangles: vertices.length / 18,
    diameterWorld: battlePointDiameterWorld,
    crossLengthWorld: attackCrossLengthWorld,
    fitScreenDiameter,
    zoomedScreenDiameter
  },
  realSample: {
    fronts: realMap.military.fronts.length,
    arrows: realPlan.arrows.length,
    battlePoints: realPlan.battlePoints.length
  }
}, null, 2));

function createFront({id, stance, points, campaign = "边境战争", maxLength = 0}) {
  return {
    id,
    attacker: 3,
    defender: 5,
    stance,
    campaign,
    borderCellPairs: [[1, 2]],
    points,
    maxLength,
    direction: stance === "defense" ? {x: -1, y: 0} : {x: 1, y: 0}
  };
}

function vertexNdcBounds(vertices) {
  const xs = [];
  const ys = [];
  for (let index = 0; index < vertices.length; index += 6) {
    xs.push(vertices[index]);
    ys.push(vertices[index + 1]);
  }
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  };
}

function vertexColors(vertexData) {
  const result = [];
  for (let offset = 0; offset < vertexData.length; offset += 6) result.push(vertexData.slice(offset + 2, offset + 6));
  return result;
}

function coloredVertexProjectionSpan(vertexData, predicate, angle) {
  const direction = [Math.cos(angle), Math.sin(angle)];
  const projections = [];
  for (let offset = 0; offset < vertexData.length; offset += 6) {
    const color = vertexData.slice(offset + 2, offset + 6);
    if (!predicate(color)) continue;
    const worldX = ((vertexData[offset] + 1) / 2) * 960;
    const worldY = ((1 - vertexData[offset + 1]) / 2) * 640;
    projections.push(worldX * direction[0] + worldY * direction[1]);
  }
  return Math.max(...projections) - Math.min(...projections);
}
