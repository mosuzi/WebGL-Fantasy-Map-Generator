#!/usr/bin/env node
import assert from "node:assert/strict";
import {simplifyMeasurementPoints, sampleMeasurementCurve} from "../app/webgl-generator/src/runtime/measurement-geometry.js";
import {
  ensureMeasurementStore,
  measurementArea,
  measurementDistance,
  measurementDisplayPoints,
  normalizeMeasurementItem
} from "../app/webgl-generator/src/runtime/measurement-objects.js";
import {
  createImportMeasurementsCommand,
  createSaveMeasurementCommand,
  createUpdateMeasurementPointsCommand
} from "../app/webgl-generator/src/runtime/measurement-edit-commands.js";

const rawCurve = Array.from({length: 121}, (_, index) => ({
  x: index,
  y: 35 + Math.sin(index / 9) * 12 + Math.sin(index / 3) * 0.35
}));
const simplifiedCurve = simplifyMeasurementPoints(rawCurve, 0.8);
const repeatedCurve = simplifyMeasurementPoints(rawCurve, 0.8);
assert.deepEqual(simplifiedCurve, repeatedCurve, "固定参数曲线简化必须可复现");
assert(simplifiedCurve.length < rawCurve.length / 2, "曲线简化没有减少足够控制点");
const rawLength = measurementDistance(rawCurve);
const simplifiedLength = measurementDistance(simplifiedCurve);
const lengthErrorRatio = Math.abs(simplifiedLength - rawLength) / rawLength;
assert(lengthErrorRatio <= 0.015, `曲线长度误差 ${lengthErrorRatio} 超过 1.5%`);

const rawRing = Array.from({length: 160}, (_, index) => {
  const angle = index / 160 * Math.PI * 2;
  const radius = 42 + Math.sin(index * 0.37) * 0.25;
  return {x: 80 + Math.cos(angle) * radius, y: 70 + Math.sin(angle) * radius};
});
const simplifiedRing = simplifyMeasurementPoints(rawRing, 0.8, {closed: true});
assert.deepEqual(simplifiedRing, simplifyMeasurementPoints(rawRing, 0.8, {closed: true}), "闭合点列简化必须可复现");
assert(simplifiedRing.length >= 8 && simplifiedRing.length < rawRing.length / 2, "闭合点列简化结果异常");
const rawArea = measurementArea(rawRing);
const simplifiedArea = measurementArea(simplifiedRing);
const areaErrorRatio = Math.abs(simplifiedArea - rawArea) / rawArea;
assert(areaErrorRatio <= 0.02, `闭合面积误差 ${areaErrorRatio} 超过 2%`);

const openCurve = sampleMeasurementCurve(simplifiedCurve.slice(0, 8), {segmentsPerSpan: 6});
const closedCurve = sampleMeasurementCurve(simplifiedRing.slice(0, 10), {closed: true, segmentsPerSpan: 6});
assert.equal(openCurve.length, 43, "开放曲线采样点数量错误");
assert.equal(closedCurve.length, 60, "闭合曲线采样点数量错误");

const map = {
  metadata: {graphWidth: 200, graphHeight: 160},
  measurements: {
    version: 1,
    items: [
      {id: "measurement-1", type: "polyline", name: "旧折线", points: rawCurve.slice(0, 3), closed: false, routeFit: "none"},
      {id: "measurement-2", type: "polygon", name: "旧面积", points: rawRing.slice(0, 12), closed: true, routeFit: "none"},
      {id: "measurement-3", type: "polyline", name: "旧路线", points: rawCurve.slice(0, 2), closed: false, routeFit: "roads", cellStops: []}
    ],
    metadata: {measurements: 3, nextId: 4}
  }
};
const migrated = ensureMeasurementStore(map);
assert.deepEqual(migrated.items.map(item => item.drawMode), ["ruler", "area", "route"], "旧测量类型回填错误");
assert.deepEqual(migrated.items.map(item => item.sampling.mode), ["click", "click", "click"], "旧测量采样模式回填错误");
assert.equal(migrated.items[1].smooth, false, "旧面积对象不应自动改成平滑闭合");

const context = {map};
const save = createSaveMeasurementCommand(simplifiedCurve, {
  name: "连续曲线",
  drawMode: "curve",
  closed: true,
  smooth: true,
  sampling: {mode: "continuous", minDistancePx: 4, simplifyTolerance: 0.8, rawPointCount: rawCurve.length, segmentsPerSpan: 6}
});
assert.equal(save.isNoop(context), false);
save.apply(context);
const created = save.getMeasurement();
assert.equal(created.drawMode, "curve");
assert.equal(created.closed, true);
assert.equal(created.smooth, true);
assert.equal(created.sampling.rawPointCount, rawCurve.length);
assert(created.summary.displayPointCount > created.summary.pointCount, "平滑曲线没有产生显示采样点");
assert(created.summary.areaMapUnits > 0, "平滑闭合曲线没有面积摘要");
assert.equal(measurementDisplayPoints(created, map).length, created.summary.displayPointCount);
save.revert(context);
assert.equal(map.measurements.items.length, 3, "撤销保存没有恢复旧测量集合");
save.apply(context);
assert.equal(map.measurements.items.length, 4, "重做保存没有恢复曲线对象");

const update = createUpdateMeasurementPointsCommand(created.id, simplifiedCurve.slice(0, 6), {
  drawMode: "ruler",
  closed: false,
  smooth: false,
  sampling: {mode: "click", rawPointCount: 6}
});
assert.equal(update.isNoop(context), false);
update.apply(context);
const updated = map.measurements.items.find(item => item.id === created.id);
assert.equal(updated.drawMode, "ruler");
assert.equal(updated.closed, false);
update.revert(context);
assert.equal(map.measurements.items.find(item => item.id === created.id).drawMode, "curve", "撤销更新没有恢复曲线模式");

const importMap = {metadata: map.metadata};
ensureMeasurementStore(importMap);
const importCommand = createImportMeasurementsCommand([normalizeMeasurementItem(created, map)]);
importCommand.apply({map: importMap});
const imported = importCommand.getImported()[0];
assert.deepEqual({drawMode: imported.drawMode, closed: imported.closed, smooth: imported.smooth, sampling: imported.sampling}, {
  drawMode: created.drawMode,
  closed: created.closed,
  smooth: created.smooth,
  sampling: created.sampling
}, "曲线对象导入没有保留参数");

console.log(JSON.stringify({
  ok: true,
  curve: {rawPoints: rawCurve.length, simplifiedPoints: simplifiedCurve.length, lengthErrorRatio: roundRatio(lengthErrorRatio)},
  area: {rawPoints: rawRing.length, simplifiedPoints: simplifiedRing.length, areaErrorRatio: roundRatio(areaErrorRatio)},
  sampling: {openPoints: openCurve.length, closedPoints: closedCurve.length},
  migration: migrated.items.slice(0, 3).map(item => ({id: item.id, drawMode: item.drawMode, smooth: item.smooth})),
  command: {id: created.id, drawMode: created.drawMode, closed: created.closed, displayPoints: created.summary.displayPointCount}
}, null, 2));

function roundRatio(value) {
  return Math.round(value * 1000000) / 1000000;
}
