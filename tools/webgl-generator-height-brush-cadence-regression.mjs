#!/usr/bin/env node
import assert from "node:assert/strict";

import {getHeightBrushChanges} from "../app/webgl-generator/src/runtime/height-brush.js";
import {
  acceptHeightBrushSample,
  HEIGHT_BRUSH_MIN_SAMPLE_DISTANCE_PX,
  HEIGHT_BRUSH_MIN_SAMPLE_INTERVAL_MS
} from "../app/webgl-generator/src/runtime/height-brush-cadence.js";

const jitterStroke = {};
assert.equal(acceptHeightBrushSample(jitterStroke, sample(100, 100, 0)), true, "首次按下没有立即落笔");
for (let index = 1; index <= 60; index++) {
  assert.equal(
    acceptHeightBrushSample(jitterStroke, sample(100 + (index % 3) - 1, 100 + (index % 5) / 2 - 1, index * 8)),
    false,
    "细微抖动产生了重复落笔"
  );
}

const dragStroke = {};
const accepted = [];
for (let index = 0; index <= 60; index++) {
  const pointer = sample(100 + index * 2, 100, index * (1000 / 60));
  if (acceptHeightBrushSample(dragStroke, pointer)) accepted.push(pointer);
}
assert.equal(accepted[0].timeStamp, 0, "拖动首次落笔不是即时反馈");
assert.ok(accepted.length <= Math.ceil(1000 / HEIGHT_BRUSH_MIN_SAMPLE_INTERVAL_MS) + 1, "一秒拖动落笔次数超过节奏上限");
for (let index = 1; index < accepted.length; index++) {
  assert.ok(accepted[index].timeStamp - accepted[index - 1].timeStamp >= HEIGHT_BRUSH_MIN_SAMPLE_INTERVAL_MS, "相邻落笔时间间隔不足");
  assert.ok(accepted[index].clientX - accepted[index - 1].clientX >= HEIGHT_BRUSH_MIN_SAMPLE_DISTANCE_PX, "相邻落笔位移不足");
}
assert.equal(acceptHeightBrushSample(dragStroke, sample(230, 100, 1010), {force: true}), true, "pointerup 真实末点没有补刷");
assert.equal(acceptHeightBrushSample(dragStroke, sample(230, 100, 1020), {force: true}), false, "同一 pointerup 末点被重复补刷");

const map = {
  grid: {
    points: [[0, 0], [0, 15], [9, 0], [9, 15], [0, 21]],
    cells: {
      p: Uint32Array.from([0, 1, 2, 3, 4]),
      h: Uint8Array.from([30, 30, 30, 30, 30])
    }
  }
};
const circularChanges = getHeightBrushChanges(
  map,
  {x: 0, y: 0},
  {action: "raise", scope: "all", preserveSurface: false, radius: 10, radiusX: 10, radiusY: 20, strength: 6, falloff: false},
  {originals: new Map()}
);
assert.deepEqual(circularChanges.map(change => change.gridCell), [0, 2], "高度画笔仍读取投影补偿轴，实际命中不是世界坐标正圆");
assert.ok(circularChanges.every(change => change.after - change.before === 6), "受控落笔步长没有保持单次明确反馈");

console.log(JSON.stringify({
  ok: true,
  intervalMs: HEIGHT_BRUSH_MIN_SAMPLE_INTERVAL_MS,
  distancePx: HEIGHT_BRUSH_MIN_SAMPLE_DISTANCE_PX,
  oneSecondStamps: accepted.length,
  circleCells: circularChanges.length
}, null, 2));

function sample(clientX, clientY, timeStamp) {
  return {clientX, clientY, timeStamp};
}
