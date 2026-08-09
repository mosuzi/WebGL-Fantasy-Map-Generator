#!/usr/bin/env node
import assert from "node:assert/strict";

import {
  centripetalCatmullRomToBezier,
  createRiverVisualCurveDescriptor,
  evaluateCubicBezier,
  isSharedCubicCurve,
  sampleCentripetalCatmullRom,
  sampledPathLength
} from "../app/webgl-generator/src/geometry/cubic-path.js";
import {bindRiverControlPointEditing} from "../app/webgl-generator/src/runtime/river-control-point-drag.js";
import {createRiverWaypointSession} from "../app/webgl-generator/src/runtime/river-waypoint-session.js";
import {createEditRiverControlPointsCommand, inspectRiverControlPointAction} from "../app/webgl-generator/src/runtime/river-edit-commands.js";
import {createCompressedMapDocumentBlob, createMapDocument, createMapFeatureGeoJson, parseMapDocument, parseMapDocumentPayload, stringifyMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {buildObjectPickingIndex} from "../app/webgl-generator/src/renderer/picking.js";

const anchors = [[0, 0], [18, 34], [43, 11], [78, 28]];
const values = [1, 8, 20, 32];
const descriptor = createRiverVisualCurveDescriptor();
assert.equal(isSharedCubicCurve(descriptor), true);
const segments = centripetalCatmullRomToBezier(anchors);
assert.equal(segments.length, anchors.length - 1);
assert.deepEqual(evaluateCubicBezier(segments[0], 0), anchors[0]);
assert.deepEqual(evaluateCubicBezier(segments.at(-1), 1), anchors.at(-1));

const sampled = sampleCentripetalCatmullRom(anchors, {values});
assert(sampled.points.length > anchors.length, "三次曲线必须生成确定性采样点");
assert.equal(sampled.spans.length, sampled.points.length - 1, "每条可视采样子段必须携带原始河段 provenance");
assert.deepEqual([...new Set(sampled.spans.map(span => span.sourceSegmentIndex))], [0, 1, 2]);
for (const anchor of anchors) {
  assert(sampled.points.some(point => Math.hypot(point[0] - anchor[0], point[1] - anchor[1]) < 1e-8), "三次曲线没有经过锚点");
}
assert(sampled.values.every(value => value >= Math.min(...values) && value <= Math.max(...values)), "沿程属性插值发生过冲");
assert(sampledPathLength(sampled.points) > 0);
assert.deepEqual(sampleCentripetalCatmullRom(anchors, {values}), sampled, "相同输入的曲线采样不确定");
const repeated = sampleCentripetalCatmullRom([[0, 0], [0, 0], [20, 10], [20, 10]]);
assert(repeated.points.every(point => point.every(Number.isFinite)), "重复锚点产生非有限曲线坐标");
const collinear = sampleCentripetalCatmullRom([[0, 0], [10, 0], [30, 0], [80, 0]]);
assert(collinear.points.every(point => Math.abs(point[1]) < 1e-10), "非均匀向心参数破坏了共线河段");
const crossingPoints = [[0, 0, 1], [100, 100, 2], [0, 100, 3], [100, 0, 4]];
const crossingRiver = {id: 8, points: crossingPoints, cells: [0, 1, 2, 3], visualCurve: descriptor};
const crossingMap = {metadata: {graphWidth: 120, graphHeight: 120}, pack: {cells: {p: crossingPoints, i: [0, 1, 2, 3]}}, rivers: {rivers: [crossingRiver]}};
const visualSegmentPoint = sampleCentripetalCatmullRom(crossingPoints).points[8];
const visualInsertion = inspectRiverControlPointAction(crossingMap, crossingRiver.id, {type: "add", point: visualSegmentPoint}, crossingRiver);
assert.equal(visualInsertion.insertIndex, 1, "点击可视三次曲线必须按 provenance 插入对应原始河段");
assert.ok(visualInsertion.candidatePoint[2] >= 1 && visualInsertion.candidatePoint[2] <= 2, "新增点 flux 必须按可视来源河段插值");

const map = createMap();
const river = map.rivers.rivers[0];
const drafts = [];
const session = createRiverWaypointSession({onDraftChange: draft => drafts.push(draft)});
session.begin(map, river.id);
const target = createEventTarget();
const frames = createFrameClock();
const state = {
  map,
  riverEdit: {waypointRiverId: river.id, session},
  canvasToolModes: {isActive: id => id === "river:edit-waypoint"},
  renderer: {
    screenToWorld: (x, y) => ({x, y}),
    pickThresholdWorld: value => value,
    setRiverWaypointPreview() {}
  },
  panels: {river: {setWaypointFeedback() {}}}
};
const binding = bindRiverControlPointEditing(target, state, {defaultView: frames.view});

target.dispatch("pointerdown", pointer(1, 22, 70, 10));
target.dispatch("pointerup", pointer(1, 22, 70, 20));
assert.equal(session.getDraft()?.action, "add", "自由位置点击没有进入唯一 stageAction 链");
assert.equal(session.getDraft()?.controlPoints.length, 1);
const control = session.getDraft().controlPoints[0];

target.dispatch("pointerdown", pointer(2, control.x, control.y, 30));
for (let index = 1; index <= 120; index++) target.dispatch("pointermove", pointer(2, control.x + index / 4, control.y - index / 8, 30 + index));
assert.equal(frames.pending(), 1, "高频 pointermove 没有合并为单个 RAF");
target.dispatch("pointerup", pointer(2, control.x + 31, control.y - 16, 160));
assert.equal(frames.pending(), 0, "pointerup 必须取消已经调度的 RAF");
assert.equal(session.getDraft()?.action, "move");
assert.deepEqual(session.getDraft()?.candidatePoint.slice(0, 2), [control.x + 31, control.y - 16], "pointerup 必须采纳最终世界坐标");

const moved = session.getDraft().controlPoints[0];
target.dispatch("pointerdown", pointer(3, moved.x, moved.y, 95));
target.dispatch("pointermove", pointer(3, moved.x + 12, moved.y + 8, 100));
assert.equal(frames.pending(), 1);
assert.equal(binding.cancel("test-cancel"), true);
assert.equal(frames.pending(), 0, "取消模式必须回收待执行 RAF");
assert.deepEqual(session.getWorkingState().controlPoints[0], moved, "取消拖动必须恢复 working 控制点");
target.dispatch("pointerdown", pointer(4, moved.x, moved.y, 110));
target.dispatch("pointerup", pointer(4, moved.x, moved.y, 120));
target.dispatch("pointerdown", pointer(5, moved.x + 1, moved.y + 1, 240));
target.dispatch("pointerup", pointer(5, moved.x + 1, moved.y + 1, 250));
assert.equal(session.getDraft()?.action, "delete", "稳定 ID 双击没有删除目标控制点");
assert.equal(session.getDraft()?.controlPoints.length, 0);

binding.dispose();
assert.equal(frames.pending(), 0);

const faultMap = createMap();
faultMap.rivers.rivers[0].controlPoints = [{id: "fault-control", x: 50, y: 50, pointIndex: 1, packCell: 1, flux: 15}];
faultMap.rivers.rivers[0].visualCurve = descriptor;
const faultTarget = createEventTarget();
const faultFrames = createFrameClock();
let restoredAfterFault = 0;
let faultFeedback = null;
const faultState = {
  map: faultMap,
  riverEdit: {waypointRiverId: 7, session: {
    getWorkingState: () => structuredClone(faultMap.rivers.rivers[0]),
    stageAction() { throw new Error("injected-stage-failure"); },
    restoreWorking() { restoredAfterFault++; }
  }},
  canvasToolModes: {isActive: id => id === "river:edit-waypoint"},
  renderer: {screenToWorld: (x, y) => ({x, y}), pickThresholdWorld: value => value},
  panels: {river: {setWaypointFeedback(value) { faultFeedback = value; }}}
};
const faultBinding = bindRiverControlPointEditing(faultTarget, faultState, {defaultView: faultFrames.view});
faultTarget.dispatch("pointerdown", pointer(10, 50, 50, 200));
faultTarget.dispatch("pointermove", pointer(10, 70, 70, 210));
assert.equal(faultFrames.pending(), 1);
faultTarget.dispatch("pointerup", pointer(10, 80, 80, 220));
assert.equal(faultTarget.hasPointerCapture(10), false, "异常后不得遗留 pointer capture");
assert.equal(faultFrames.pending(), 0, "异常后不得遗留 RAF");
assert.equal(faultBinding.getActiveDrag(), null);
assert.equal(restoredAfterFault, 1, "异常后必须恢复拖动前 working 状态");
assert.equal(faultFeedback?.code, "control-point-interaction-error");
faultBinding.dispose();
const disposeTarget = createEventTarget();
const disposeFrames = createFrameClock();
const disposeBinding = bindRiverControlPointEditing(disposeTarget, faultState, {defaultView: disposeFrames.view});
disposeTarget.dispatch("pointerdown", pointer(11, 50, 50, 230));
disposeTarget.dispatch("pointermove", pointer(11, 70, 70, 240));
assert.equal(disposeTarget.hasPointerCapture(11), true);
disposeBinding.dispose();
assert.equal(disposeTarget.hasPointerCapture(11), false, "dispose 必须释放 active pointer capture");
assert.equal(disposeFrames.pending(), 0, "dispose 必须回收待执行 RAF");
assert.equal(restoredAfterFault, 2, "dispose 必须恢复拖动前 working 状态");
const addFaultTarget = createEventTarget();
const addFaultBinding = bindRiverControlPointEditing(addFaultTarget, faultState, {defaultView: createFrameClock().view});
addFaultTarget.dispatch("pointerdown", pointer(12, 10, 80, 250));
assert.equal(addFaultTarget.hasPointerCapture(12), false, "新增异常不得持有 pointer capture");
assert.equal(restoredAfterFault, 3, "新增异常必须恢复 stageAction 前 working 状态");
addFaultBinding.dispose();

const generated = generatePlaceholderMap({seed: "river-cubic-roundtrip", cellsTarget: 1000, heightmapTemplate: "continents"});
const generatedRiver = generated.rivers.rivers.find(item => item.points?.length >= 2);
assert(generatedRiver, "往返夹具没有生成河流");
const sourcePoint = generatedRiver.points[Math.floor((generatedRiver.points.length - 1) / 2)];
const exactPoint = [sourcePoint[0] + 0.23456789, sourcePoint[1] + 0.28765432];
const roundtripDraft = inspectRiverControlPointAction(generated, generatedRiver.id, {type: "add", point: exactPoint});
assert.equal(roundtripDraft.valid, true, roundtripDraft.reason);
assert.deepEqual(roundtripDraft.candidatePoint.slice(0, 2), exactPoint, "自由控制点不得量化世界坐标");
createEditRiverControlPointsCommand(generatedRiver.id, roundtripDraft.working || roundtripDraft).apply({map: generated});
const restored = parseMapDocument(stringifyMapDocument(createMapDocument(generated, {}))).map;
const restoredRiver = restored.rivers.rivers.find(item => Number(item.id) === Number(generatedRiver.id));
assert.equal(restoredRiver.visualCurve.kind, descriptor.kind, "曲线版本没有通过地图文档往返");
assert.equal(restoredRiver.controlPoints.length, 1, "控制点没有通过地图文档往返");
const compressedBlob = (await createCompressedMapDocumentBlob({defaultView: globalThis}, createMapDocument(generated, {}))).blob;
const compressedRestored = (await parseMapDocumentPayload({defaultView: globalThis}, compressedBlob)).map;
const compressedRiver = compressedRestored.rivers.rivers.find(item => Number(item.id) === Number(generatedRiver.id));
assert.equal(compressedRiver.visualCurve.kind, descriptor.kind, "共享曲线没有通过 gzip 存档往返");
assert.equal(compressedRiver.controlPoints.length, 1, "控制点没有通过 gzip 存档往返");
const legacyMap = createMap();
const legacyBlob = (await createCompressedMapDocumentBlob({defaultView: globalThis}, createMapDocument(legacyMap, {}))).blob;
const legacyRestored = (await parseMapDocumentPayload({defaultView: globalThis}, legacyBlob)).map.rivers.rivers[0];
assert.equal(legacyRestored.visualCurve, undefined, "旧河流 gzip 存档不得被自动升级为新曲线");
assert.equal(legacyRestored.controlPoints, undefined, "旧河流 gzip 存档不得凭空增加控制点");
const expectedVisualPoints = sampleCentripetalCatmullRom(generatedRiver.points).points;
const riverGeoJson = createMapFeatureGeoJson(generated, {layers: {river: true}}).features.find(feature => feature.id === `river-${generatedRiver.id}`);
assert.equal(riverGeoJson.geometry.coordinates.length, expectedVisualPoints.length, "GeoJSON 没有使用共享三次曲线采样");
assert.equal(riverGeoJson.properties.segmentCount, expectedVisualPoints.length - 1, "GeoJSON 段数没有与共享曲线坐标同源");
const pickingIndex = buildObjectPickingIndex(generated);
const expectedRiverSegments = generated.rivers.rivers.reduce((sum, item) => sum + (isSharedCubicCurve(item.visualCurve) ? sampleCentripetalCatmullRom(item.points).points.length : item.points.length) - 1, 0);
assert.equal(pickingIndex.riverSegmentCount, expectedRiverSegments, "picking index 没有使用共享三次曲线采样");

console.log(JSON.stringify({
  ok: true,
  curve: {segments: segments.length, samples: sampled.points.length, length: sampledPathLength(sampled.points)},
  interaction: {rafCoalescedMoves: 120, finalAction: session.getDraft()?.action, controlPoints: session.getDraft()?.controlPoints.length, faultRecovered: restoredAfterFault === 3},
  roundtrip: {riverId: generatedRiver.id, controls: restoredRiver.controlPoints.length, curve: restoredRiver.visualCurve.kind, gzip: true, legacyGzip: true}
}, null, 2));

function createMap() {
  const targetRiver = {id: 7, points: [[0, 0, 5], [50, 50, 15], [100, 100, 30]], cells: [0, 1, 2], length: 142};
  return {
    metadata: {graphWidth: 100, graphHeight: 100},
    pack: {cells: {p: [[0, 0], [50, 50], [100, 100]], i: [0, 1, 2]}, rivers: [targetRiver]},
    rivers: {rivers: [targetRiver]}
  };
}

function pointer(pointerId, clientX, clientY, timeStamp) {
  return {pointerId, clientX, clientY, timeStamp, button: 0, preventDefault() {}, stopImmediatePropagation() {}};
}

function createEventTarget() {
  const handlers = new Map();
  const captured = new Set();
  return {
    addEventListener(type, handler) { handlers.set(type, handler); },
    removeEventListener(type) { handlers.delete(type); },
    dispatch(type, event) { handlers.get(type)?.(event); },
    setPointerCapture(pointerId) { captured.add(pointerId); },
    hasPointerCapture(pointerId) { return captured.has(pointerId); },
    releasePointerCapture(pointerId) { captured.delete(pointerId); }
  };
}

function createFrameClock() {
  let nextId = 1;
  const callbacks = new Map();
  return {
    view: {
      requestAnimationFrame(callback) { const id = nextId++; callbacks.set(id, callback); return id; },
      cancelAnimationFrame(id) { callbacks.delete(id); }
    },
    pending: () => callbacks.size,
    flush() {
      const pending = [...callbacks.values()];
      callbacks.clear();
      for (const callback of pending) callback(0);
    }
  };
}
