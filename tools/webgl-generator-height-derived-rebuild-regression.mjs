#!/usr/bin/env node
import {
  createRegenerationResult,
  HEIGHT_BASE_REBUILD_STEPS,
  HEIGHT_DOWNSTREAM_REBUILD_STEPS,
  rebuildHeightBaseDerived,
  rebuildHeightDownstreamDerived
} from "../app/webgl-generator/src/runtime/height-derived-rebuild.js";

assert(JSON.stringify(HEIGHT_BASE_REBUILD_STEPS) === JSON.stringify(["rivers", "states"]), `基础派生顺序异常：${HEIGHT_BASE_REBUILD_STEPS}`);

const successCalls = [];
const success = rebuildHeightBaseDerived(kind => {
  successCalls.push(kind);
  return createRegenerationResult(kind, `${kind} done`, `${kind} constraints`);
});
assert(success.executed === true, "完整基础派生没有返回 executed=true");
assert(JSON.stringify(successCalls) === JSON.stringify(["rivers", "states"]), `完整基础派生调用顺序异常：${successCalls}`);
assert(success.steps.length === 2 && success.steps.every(step => step.executed), "完整基础派生步骤摘要异常");
assert(success.constraint.includes("河流 / 生物群系 / 道路 -> 国家 / 省份 / 城镇 / 道路"), "完整基础派生没有解释拓扑顺序");

const riverFailureCalls = [];
const riverFailure = rebuildHeightBaseDerived(kind => {
  riverFailureCalls.push(kind);
  return createRegenerationResult(kind, "未执行", "缺少河流输入");
});
assert(riverFailure.executed === false, "河流失败没有返回 executed=false");
assert(JSON.stringify(riverFailureCalls) === JSON.stringify(["rivers"]), `河流失败后仍执行了下游：${riverFailureCalls}`);
assert(riverFailure.constraint.includes("高度基础派生在河流停止"), `河流失败摘要异常：${riverFailure.constraint}`);

const stateFailureCalls = [];
const stateFailure = rebuildHeightBaseDerived(kind => {
  stateFailureCalls.push(kind);
  return createRegenerationResult(kind, kind === "states" ? "暂未执行" : "rivers done", "constraints");
});
assert(stateFailure.executed === false, "国家失败没有返回 executed=false");
assert(JSON.stringify(stateFailureCalls) === JSON.stringify(["rivers", "states"]), `国家失败调用顺序异常：${stateFailureCalls}`);
assert(stateFailure.steps[0].executed && !stateFailure.steps[1].executed, "部分完成步骤摘要异常");

assert(
  JSON.stringify(HEIGHT_DOWNSTREAM_REBUILD_STEPS) === JSON.stringify(["religions", "markers", "diplomacy", "military", "zones"]),
  `下游派生顺序异常：${HEIGHT_DOWNSTREAM_REBUILD_STEPS}`
);

const downstreamSuccessCalls = [];
const downstreamSuccess = rebuildHeightDownstreamDerived(kind => {
  downstreamSuccessCalls.push(kind);
  return createRegenerationResult(kind, `${kind} done`, `${kind} constraints`);
});
assert(downstreamSuccess.executed === true, "完整下游派生没有返回 executed=true");
assert(
  JSON.stringify(downstreamSuccessCalls) === JSON.stringify(HEIGHT_DOWNSTREAM_REBUILD_STEPS),
  `完整下游派生调用顺序异常：${downstreamSuccessCalls}`
);
assert(downstreamSuccess.steps.length === 5 && downstreamSuccess.steps.every(step => step.executed), "完整下游派生步骤摘要异常");
assert(
  downstreamSuccess.constraint.includes("宗教 -> 资源点 / 经济 -> 外交 -> 军事 -> 地区"),
  `完整下游派生没有解释依赖顺序：${downstreamSuccess.constraint}`
);

const markerFailureCalls = [];
const markerFailure = rebuildHeightDownstreamDerived(kind => {
  markerFailureCalls.push(kind);
  return createRegenerationResult(kind, kind === "markers" ? "未执行" : `${kind} done`, "constraints");
});
assert(markerFailure.executed === false, "资源点失败没有返回 executed=false");
assert(
  JSON.stringify(markerFailureCalls) === JSON.stringify(["religions", "markers"]),
  `资源点失败后仍执行了下游：${markerFailureCalls}`
);
assert(markerFailure.constraint.includes("高度下游派生在资源点与经济停止"), `资源点失败摘要异常：${markerFailure.constraint}`);

const militaryFailureCalls = [];
const militaryFailure = rebuildHeightDownstreamDerived(kind => {
  militaryFailureCalls.push(kind);
  return createRegenerationResult(kind, kind === "military" ? "暂未执行" : `${kind} done`, "constraints");
});
assert(militaryFailure.executed === false, "军事失败没有返回 executed=false");
assert(
  JSON.stringify(militaryFailureCalls) === JSON.stringify(["religions", "markers", "diplomacy", "military"]),
  `军事失败后仍执行了地区：${militaryFailureCalls}`
);
assert(militaryFailure.steps.length === 4 && !militaryFailure.steps.at(-1).executed, "军事失败步骤摘要异常");

console.log(JSON.stringify({
  ok: true,
  steps: HEIGHT_BASE_REBUILD_STEPS,
  success: {executed: success.executed, calls: successCalls, summary: success.constraint},
  riverFailure: {executed: riverFailure.executed, calls: riverFailureCalls, summary: riverFailure.constraint},
  stateFailure: {executed: stateFailure.executed, calls: stateFailureCalls, summary: stateFailure.constraint},
  downstream: {
    steps: HEIGHT_DOWNSTREAM_REBUILD_STEPS,
    success: {executed: downstreamSuccess.executed, calls: downstreamSuccessCalls, summary: downstreamSuccess.constraint},
    markerFailure: {executed: markerFailure.executed, calls: markerFailureCalls, summary: markerFailure.constraint},
    militaryFailure: {executed: militaryFailure.executed, calls: militaryFailureCalls, summary: militaryFailure.constraint}
  }
}, null, 2));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
