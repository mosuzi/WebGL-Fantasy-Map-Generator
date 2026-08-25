#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const appSource = await readFile(
  new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url),
  "utf8"
);
const heightWorkerSource = await readFile(
  new URL("../app/webgl-generator/src/runtime/height-derived-worker-task.js", import.meta.url),
  "utf8"
);

const heightSource = functionSource(
  appSource,
  "function rebuildHeightDerivedViaAction",
  "function heightDerivedRebuildFailureMessage"
);
const stateTransactionSource = functionSource(
  appSource,
  "function regenerateMapAttributeViaApi",
  "function regenerateMapAttributeCoreViaApi"
);
const stateSource = functionSource(
  appSource,
  "function regenerateStates",
  "function regenerateProvinces"
);

assert.equal(
  count(heightSource, 'captureRegenerationConstraintBundle(state.map, {closure: ["world"]})'),
  1,
  "高度复合事务主线程必须且只能捕获一次完整 world bundle"
);
assert.match(
  heightSource,
  /const constraintBundle = captureRegenerationConstraintBundle[\s\S]*executeWorkerMapMutation/,
  "高度复合事务必须在发起 Worker 写入前捕获 bundle"
);
assert.match(
  heightWorkerSource,
  /constraintBundle\.assertDomain\(map, domain, "before"\)[\s\S]*constraintBundle\.isDomainFullyLocked\(domain\)/,
  "高度复合 Worker 阶段必须先校验约束，再执行完整锁定 no-op"
);
assert.match(
  heightWorkerSource,
  /regenerateMapAttributeForWorker\(map, kind, \{\s*scope: "all",\s*constraintBundle\s*\}\)/,
  "高度复合 Worker 必须向实际子生成器透传同一 bundle"
);
assert.match(
  heightSource,
  /constraintBundle\.assertDomain\(state\.map, "world", "after"\)/,
  "高度复合事务完成后必须校验完整 world closure"
);
for (const wiring of [
  'features: "features"',
  'rivers: "rivers"',
  'states: "states-provinces"',
  'religions: "religions"',
  'markers: "markers-economy"',
  'diplomacy: "diplomacy"',
  'military: "military"',
  'zones: "zones"'
]) {
  assert(heightWorkerSource.includes(wiring), `高度派生阶段缺少 bundle domain 映射：${wiring}`);
}

assert.equal(
  count(stateTransactionSource, 'captureRegenerationConstraintBundle(state.map, {closure: ["world"]})'),
  1,
  "正式重生成入口必须且只能捕获一次完整 world bundle"
);
assert.match(
  stateTransactionSource,
  /execute: \(\) => \{[\s\S]*const constraintBundle = options\.constraintBundle\s*\|\| captureRegenerationConstraintBundle/,
  "正式重生成入口必须在核心重生成前捕获 bundle"
);
assert.match(
  stateTransactionSource,
  /regenerateMapAttributeCoreViaApi\(state, documentRef, targetKind, \{\s*\.\.\.options,\s*constraintBundle\s*\}\)/,
  "正式重生成入口必须向实际子生成器透传同一 bundle"
);
assert.match(
  stateTransactionSource,
  /constraintBundle\.assertDomain\(state\.map, "world", "after"\)/,
  "国家正式入口必须在事务提交前校验完整 world closure"
);
for (const slice of [
  "constraintBundle.lockedStates",
  "constraintBundle.lockedProvinces",
  "constraintBundle.lockedCities",
  "constraintBundle.lockedRoutes"
]) {
  assert(stateSource.includes(slice), `国家重生成缺少同一 bundle slice：${slice}`);
}
assert(!appSource.includes("state-regeneration-cannot-preserve-diplomacy"), "合法外交锁不得再阻塞国家重生成");
assert(!appSource.includes("rejectLockedDiplomacy"), "正式入口不得保留外交锁写前拒绝开关");
assert.match(
  stateSource,
  /restoreRegenerationSalt\(map, previousSalt\);\s*throw error;/,
  "国家子生成器失败必须回滚阶段 salt"
);

console.log(JSON.stringify({
  ok: true,
  height: {
    bundleCaptures: 1,
    domains: 8,
    finalClosure: "world"
  },
  state: {
    bundleCaptures: 1,
    protectedSlices: 4,
    diplomacyLockPriority: "preserve-and-regenerate"
  }
}, null, 2));

function functionSource(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert(startIndex >= 0, `未找到函数起点：${start}`);
  assert(endIndex > startIndex, `未找到函数终点：${end}`);
  return source.slice(startIndex, endIndex);
}

function count(source, text) {
  return source.split(text).length - 1;
}
