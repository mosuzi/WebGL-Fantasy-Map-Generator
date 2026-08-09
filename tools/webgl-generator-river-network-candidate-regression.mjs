#!/usr/bin/env node
import assert from "node:assert/strict";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {applyRiverNetworkCandidate} from "../app/webgl-generator/src/generator/river-network-candidate.js";
import {createMapDocument, parseMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";

const fixed = [];
for (const cellsTarget of [10000, 50000, 100000]) {
  const seed = `304-river-network-lab-${cellsTarget}`;
  const map = generatePlaceholderMap({seed, cellsTarget, heightmapTemplate: "continents", riverNetworkCandidate: false});
  assert.equal(map.rivers.metadata.networkCandidate.status, "disabled-diagnostic-baseline", `${cellsTarget} 诊断基线没有关闭正式候选`);
  const beforeRivers = structuredClone(map.rivers.rivers);
  const beforeCanonical = canonicalNetwork(beforeRivers);
  const first = applyRiverNetworkCandidate(map.rivers.rivers, map.pack, map.grid);
  assert.equal(first.metadata.status, "accepted", `${cellsTarget} 正式候选未接受`);
  assert.equal(first.metadata.rejectedRelations, 0, `${cellsTarget} 正式候选仍有拒绝关系`);
  assert.equal(first.metadata.dischargeViolations, 0, `${cellsTarget} 正式候选仍有流量越级`);
  assert.equal(first.metadata.widthViolations, 0, `${cellsTarget} 正式候选仍有宽度越级`);
  assert.deepEqual(canonicalNetwork(first.rivers), beforeCanonical, `${cellsTarget} 正式候选改写了 canonical 河网`);

  const secondRivers = structuredClone(beforeRivers);
  const second = applyRiverNetworkCandidate(secondRivers, map.pack, map.grid);
  assert.deepEqual(semanticCandidate(first), semanticCandidate(second), `${cellsTarget} 正式候选结果不确定`);

  if (cellsTarget === 100000) verifyKnownHundredKRelation(beforeRivers, first.rivers, first);
  fixed.push({
    cellsTarget,
    rivers: first.metadata.rivers,
    relations: first.metadata.relations,
    appliedCurves: first.metadata.appliedCurves,
    hydrologyUpdates: first.metadata.hydrologyUpdates,
    status: first.metadata.status
  });
}

verifyLongBridgeRefusal();
verifyFrozenSnapshot();

const formalMap = generatePlaceholderMap({seed: "river-network-candidate-formal-roundtrip", cellsTarget: 10000, heightmapTemplate: "continents"});
assert.equal(formalMap.rivers.metadata.networkCandidate.status, "accepted", "正式生成链没有默认启用候选");
assert.ok(formalMap.rivers.metadata.networkCandidate.appliedRivers > 0, "正式生成链没有应用任何候选变化");
const formalBefore = semanticRivers(formalMap.rivers.rivers);
const formalImported = parseMapDocument(JSON.stringify(createMapDocument(formalMap))).map;
assert.deepEqual(semanticRivers(formalImported.rivers.rivers), formalBefore, "新图存档往返改变了正式候选河流");
assert.deepEqual(
  withoutPerformance(formalImported.rivers.metadata.networkCandidate),
  withoutPerformance(formalMap.rivers.metadata.networkCandidate),
  "新图存档往返丢失正式候选元数据"
);

const oldMap = generatePlaceholderMap({seed: "river-network-candidate-old-map", cellsTarget: 3000, heightmapTemplate: "continents", riverNetworkCandidate: false});
const oldBefore = semanticRivers(oldMap.rivers.rivers);
const oldImported = parseMapDocument(JSON.stringify(createMapDocument(oldMap))).map;
assert.deepEqual(semanticRivers(oldImported.rivers.rivers), oldBefore, "旧图加载不应自动应用正式候选");
assert.equal(oldImported.rivers.metadata.networkCandidate.status, "disabled-diagnostic-baseline", "旧图加载不应改写候选状态");

console.log(JSON.stringify({
  ok: true,
  fixed,
  formalRoundtrip: {
    rivers: formalMap.rivers.rivers.length,
    appliedCurves: formalMap.rivers.metadata.networkCandidate.appliedCurves,
    hydrologyUpdates: formalMap.rivers.metadata.networkCandidate.hydrologyUpdates
  },
  oldMap: {rivers: oldMap.rivers.rivers.length, status: oldImported.rivers.metadata.networkCandidate.status}
}, null, 2));

function verifyKnownHundredKRelation(before, after, result) {
  const beforeChild = before.find(river => Number(river.id) === 760);
  const afterChild = after.find(river => Number(river.id) === 760);
  const parent = after.find(river => Number(river.id) === Number(afterChild?.parent));
  assert.equal(afterChild?.parent, 5, "100k 已知断接支流的父河变化");
  const baselineDistance = closestPolylineDistance(beforeChild.points.at(-1), before.find(river => Number(river.id) === 5).points);
  const candidateDistance = closestPolylineDistance(afterChild.points.at(-1), parent.points);
  assert.ok(baselineDistance > 12, "100k 诊断基线不再覆盖固定阈值外的断接关系");
  assert.ok(candidateDistance <= 1e-6, `100k 正式支流末端仍未贴合父河：${candidateDistance}`);
  assert.ok(afterChild.points.length > beforeChild.points.length, "100k 正式候选没有追加曲线采样点");
  const curvePoints = afterChild.points.slice(beforeChild.points.length - 1);
  const chordStart = curvePoints[0];
  const chordEnd = curvePoints.at(-1);
  const curvature = Math.max(...curvePoints.map(point => pointSegmentDistance(point, chordStart, chordEnd)));
  assert.ok(curvature > 0.5, `100k 正式汇流退化为直线：${curvature}`);
  const relation = result.candidate.relations.find(item => item.childId === 760 && item.parentId === 5);
  assert.equal(relation?.status, "accepted", "100k 已知断接关系没有通过同源安全门");
  assert.ok(relation.distance <= relation.tolerance.total, "100k 已知断接关系绕过真实显示距离门");
  assert.ok(Object.values(relation.safety.gates).every(Boolean), "100k 已知断接关系未通过全部曲线安全门");
}

function verifyLongBridgeRefusal() {
  const rivers = [
    formalRiver(1, 0, [1, 2], [[0, 0], [100, 0]], {discharge: 20, width: 0.2}),
    formalRiver(2, 1, [9, 1], [[0, 1000], [0, 500]], {discharge: 5, width: 0.1})
  ];
  const pack = {cells: {p: [], h: []}};
  pack.cells.p[1] = [50, 0];
  pack.cells.p[2] = [100, 0];
  pack.cells.p[9] = [0, 1000];
  pack.cells.h[1] = pack.cells.h[2] = pack.cells.h[9] = 30;
  const beforePoints = structuredClone(rivers[1].points);
  const result = applyRiverNetworkCandidate(rivers, pack, {metadata: {spacing: 2}});
  const relation = result.candidate.relations.find(item => item.childId === 2);
  assert.equal(result.metadata.status, "rejected", "500+ 显示长桥不得被正式候选接受");
  assert.equal(relation?.reason, "confluence-display-gap", "500+ 显示长桥拒绝原因错误");
  assert.ok(relation.distance >= 500 && relation.hydrologyDistance === 0, "500+ 长桥反例没有同时覆盖共享水文 cell");
  assert.deepEqual(rivers[1].points, beforePoints, "拒绝关系的显示几何被正式候选改写");
}

function verifyFrozenSnapshot() {
  const rivers = [
    formalRiver(1, 0, [1, 2], [[0, 0], [100, 0]], {discharge: 20, width: 0.2}),
    formalRiver(2, 1, [9, 1], [[0, 40], [45, 10]], {discharge: 5, width: 0.1})
  ];
  const pack = {cells: {p: [], h: []}};
  pack.cells.p[1] = [50, 0];
  pack.cells.p[2] = [100, 0];
  pack.cells.p[9] = [0, 40];
  pack.cells.h[1] = pack.cells.h[2] = pack.cells.h[9] = 30;
  const frozen = structuredClone(rivers[1]);
  const result = applyRiverNetworkCandidate(rivers, pack, {metadata: {spacing: 4}}, {frozenIds: new Set([2])});
  assert.deepEqual(rivers[1], frozen, "冻结河流被正式候选改写");
  assert.equal(result.metadata.frozenSkipped, 1, "冻结河流跳过证据缺失");
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
    width: options.width || 0.05,
    length: 1,
    outletKind: parent ? "confluence" : "ocean",
    ...options
  };
}

function canonicalNetwork(rivers) {
  return rivers.map(river => ({
    id: Number(river.id ?? river.i),
    parent: Number(river.parent || 0),
    basin: Number(river.basin || 0),
    source: Number(river.source),
    mouth: Number(river.mouth),
    outletKind: river.outletKind || "",
    cells: [...(river.cells || [])],
    gridCells: [...(river.gridCells || [])]
  })).sort((left, right) => left.id - right.id);
}

function semanticCandidate(result) {
  return {
    rivers: semanticRivers(result.rivers),
    metadata: withoutPerformance(result.metadata),
    relations: result.candidate.relations.map(relation => ({
      childId: relation.childId,
      parentId: relation.parentId,
      status: relation.status,
      reason: relation.reason,
      distance: relation.distance,
      hydrologyDistance: relation.hydrologyDistance,
      tolerance: relation.tolerance?.total,
      curve: relation.curve?.sampledPoints
    }))
  };
}

function semanticRivers(rivers) {
  return rivers.map(river => ({
    id: Number(river.id ?? river.i),
    parent: Number(river.parent || 0),
    discharge: Number(river.discharge || 0),
    flux: Number(river.flux || 0),
    width: Number(river.width || 0),
    length: Number(river.length || 0),
    points: (river.points || []).map(point => [...point]),
    cells: [...(river.cells || [])]
  })).sort((left, right) => left.id - right.id);
}

function withoutPerformance(metadata) {
  const {performance, ...rest} = metadata || {};
  return rest;
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
