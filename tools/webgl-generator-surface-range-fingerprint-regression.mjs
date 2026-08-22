#!/usr/bin/env node
import assert from "node:assert/strict";
import {fingerprintSurfaceCellRanges} from "../app/webgl-generator/src/renderer/surface-base-buffer-set.js";

const orderedRanges = new Map(Array.from({length: 100000}, (_, cell) => [cell, {start: cell * 18, end: cell * 18 + 18}]));
const shuffledRanges = new Map([...orderedRanges].reverse());
const originalArraySort = Array.prototype.sort;
let sortCalls = 0;
Array.prototype.sort = function(...args) {
  sortCalls++;
  return Reflect.apply(originalArraySort, this, args);
};

let orderedFingerprint;
let shuffledFingerprint;
const startedAt = performance.now();
try {
  orderedFingerprint = fingerprintSurfaceCellRanges(orderedRanges, 100000 * 18);
  assert.equal(sortCalls, 0, "已按 cell ID 单调插入的 surface ranges 不应复制排序");
  shuffledFingerprint = fingerprintSurfaceCellRanges(shuffledRanges, 100000 * 18);
} finally {
  Array.prototype.sort = originalArraySort;
}

assert.equal(sortCalls, 1, "乱序 surface ranges 应只执行一次兼容排序");
assert.equal(shuffledFingerprint, orderedFingerprint, "有序快路与乱序兼容路径指纹不一致");
assert.throws(() => fingerprintSurfaceCellRanges(new Map([[0, {start: 0, end: 19}]]), 18), /cell range 无效/u, "有序快路不得放宽 range 边界校验");

console.log(JSON.stringify({
  ok: true,
  cells: orderedRanges.size,
  orderedSortCalls: 0,
  shuffledSortCalls: 1,
  parity: true,
  totalMs: Number((performance.now() - startedAt).toFixed(1)),
  browserRuns: 0
}, null, 2));
