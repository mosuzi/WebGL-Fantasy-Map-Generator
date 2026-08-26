#!/usr/bin/env node
import assert from "node:assert/strict";

import {
  assertMatchingPreparedDisplayIntents,
  assertPreparedDisplayIntent,
  createPreparedDisplayIntent,
  gpuResidentShoreSurfaceKey
} from "../app/webgl-generator/src/renderer/prepared-display-intent.js";

const binding = {
  mapIdentity: "task-361-exact-archive",
  sourceRevision: 0,
  topologyRevision: 0,
  renderGeneration: 17,
  renderPreparationId: "task-361:initial"
};
const visualTheme = {
  id: "default",
  water: {fill: "#5f94c2"},
  land: {fill: "#7e9b68"},
  terrain: {heightRamp: ["#5f94c2", "#7e9b68"]},
  lines: {coastline: "#26455f", lakeShore: "#315f7d", stateBorder: "#333", provinceBorder: "#777"}
};
const smoothPayload = {
  binding,
  colorMode: "height",
  viewOptions: {showOceanHeight: false, smoothCellBorders: true, mapEdgeFade: false, visualTheme}
};
const hardPayload = {
  ...smoothPayload,
  viewOptions: {...smoothPayload.viewOptions, smoothCellBorders: false}
};

const smooth = createPreparedDisplayIntent(smoothPayload, binding);
const smoothAgain = createPreparedDisplayIntent(structuredClone(smoothPayload), structuredClone(binding));
const hard = createPreparedDisplayIntent(hardPayload, binding);

assert.equal(smooth.shoreSurfaceKey, gpuResidentShoreSurfaceKey("height", smoothPayload.viewOptions));
assert.equal(hard.shoreSurfaceKey, "", "硬边界不得携带可见岸线柔化 surface key");
assert.equal(smooth.fingerprint, smoothAgain.fingerprint, "同一显示意图必须生成稳定指纹");
assert.notEqual(smooth.fingerprint, hard.fingerprint, "HARD 与 SMOOTH 必须是两个不同的合法状态");
assert.equal(assertMatchingPreparedDisplayIntents(smooth, smoothAgain), true);
assert.equal(assertPreparedDisplayIntent(smooth, smoothPayload, binding, {required: true}), true);

assert.throws(
  () => assertMatchingPreparedDisplayIntents(smooth, hard),
  error => error?.code === "render-display-intent-parallel-mismatch",
  "并行 Worker 不得把 HARD 与 SMOOTH 拼成第三态"
);
assert.throws(
  () => assertPreparedDisplayIntent(smooth, hardPayload, binding, {required: true}),
  error => error?.code === "render-display-intent-mismatch",
  "安装器不得把 SMOOTH 资源提交给 HARD 显示意图"
);
assert.throws(
  () => assertPreparedDisplayIntent({...smooth, fingerprint: `${smooth.fingerprint}:tampered`}, smoothPayload, binding, {required: true}),
  error => error?.code === "render-display-intent-mismatch",
  "修改过的显示指纹必须 fail closed"
);
assert.throws(
  () => assertPreparedDisplayIntent(null, smoothPayload, binding, {required: true}),
  error => error?.code === "render-display-intent-missing"
    && !/Worker|binding|fingerprint|buffer/i.test(error.message),
  "首次地图安装不得接纳没有显示指纹的旧式组合"
);

console.log(JSON.stringify({
  ok: true,
  legalStates: [hard.smoothCellBorders ? "smooth" : "hard", smooth.smoothCellBorders ? "smooth" : "hard"],
  smoothFingerprint: smooth.fingerprint,
  hardFingerprint: hard.fingerprint,
  shoreSurfaceKey: smooth.shoreSurfaceKey
}, null, 2));
