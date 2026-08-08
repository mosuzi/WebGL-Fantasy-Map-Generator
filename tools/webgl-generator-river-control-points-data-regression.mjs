#!/usr/bin/env node
import assert from "node:assert/strict";
import {createRiverControlPoint, normalizeRiverControlPoints, updateRiverControlPointIndexes} from "../app/webgl-generator/src/runtime/river-control-points.js";

const river = {
  id: 17,
  points: [[0, 0, 10], [10, 0, 20], [20, 0, 30]],
  controlPoints: [
    {id: "river-17-control-7", x: 10, y: 0, packCell: 2},
    {id: "river-17-control-8", x: 10.5, y: 0.5, packCell: 2}
  ]
};
const packCells = {p: [[0, 0], [10, 0], [10, 0], [20, 0]]};
const normalized = normalizeRiverControlPoints(river, packCells);
assert.equal(normalized.length, 2);
assert.deepEqual(normalized.map(point => point.id), ["river-17-control-7", "river-17-control-8"]);
assert.deepEqual(normalized.map(point => point.packCell), [2, 2], "同一个 pack cell 只能是派生引用，不能当唯一键");
assert.deepEqual(normalized.map(point => point.pointIndex), [1, 2]);

const generated = createRiverControlPoint(river, 1, river.points[1], packCells);
assert.match(generated.id, /^river-17-control-/);
assert.notEqual(generated.id, normalized[0].id);
assert.equal(generated.packCell, 1);

const inserted = updateRiverControlPointIndexes(normalized, null, 1);
assert.deepEqual(inserted.map(point => point.pointIndex), [2, 3]);
const removed = updateRiverControlPointIndexes(inserted, 2, null);
assert.deepEqual(removed.map(point => point.id), ["river-17-control-8"]);
assert.deepEqual(removed.map(point => point.pointIndex), [2]);

const legacy = {id: 18, points: [[0, 0], [10, 0]]};
assert.equal(normalizeRiverControlPoints(legacy, packCells), undefined, "旧河流缺少可选字段时不得静默生成控制点集合");
assert.equal(normalizeRiverControlPoints({...legacy, controlPoints: [{id: "bad", x: 10, y: 0}]}, packCells).length, 1);

console.log(JSON.stringify({ok: true, schemaVersion: generated.schemaVersion, samePackCell: true, legacyCompatible: true}, null, 2));
