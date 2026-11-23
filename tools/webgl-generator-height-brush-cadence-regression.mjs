#!/usr/bin/env node
import assert from "node:assert/strict";

import {getHeightBrushChanges} from "../app/webgl-generator/src/runtime/height-brush.js";
import {sampleHeightBrushSegment} from "../app/webgl-generator/src/runtime/height-brush-cadence.js";

const stroke = {};
const sample = (x, y, final = false) => sampleHeightBrushSegment(stroke, {x, y}, 12, final);
assert.deepEqual(sample(0, 0), [{x: 0, y: 0}]);
assert.deepEqual(sample(1, 1), [], "微抖不应叠加高度");
assert.deepEqual(sample(24, 0), [6, 12, 18, 24].map(x => ({x, y: 0})), "快速横划不能跳过中段");
assert.deepEqual(sample(24, 13), [6, 12].map(y => ({x: 24, y})), "拐角应保留");
assert.deepEqual(sample(24, 13, true), [{x: 24, y: 13}], "松手应补进真实末点");
assert.deepEqual(sample(24, 13, true), [], "末点不应重复累加强度");

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
assert.ok(circularChanges.every(change => change.after - change.before === 5), "输入超过上限时单次落笔必须限制在五级以内");

console.log(JSON.stringify({
  ok: true,
  circleCells: circularChanges.length
}, null, 2));
