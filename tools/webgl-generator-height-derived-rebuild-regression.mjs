#!/usr/bin/env node
import {createRegenerationResult, HEIGHT_BASE_REBUILD_STEPS, rebuildHeightBaseDerived} from "../app/webgl-generator/src/runtime/height-derived-rebuild.js";

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
assert(riverFailure.constraint.includes("河流停止"), `河流失败摘要异常：${riverFailure.constraint}`);

const stateFailureCalls = [];
const stateFailure = rebuildHeightBaseDerived(kind => {
  stateFailureCalls.push(kind);
  return createRegenerationResult(kind, kind === "states" ? "暂未执行" : "rivers done", "constraints");
});
assert(stateFailure.executed === false, "国家失败没有返回 executed=false");
assert(JSON.stringify(stateFailureCalls) === JSON.stringify(["rivers", "states"]), `国家失败调用顺序异常：${stateFailureCalls}`);
assert(stateFailure.steps[0].executed && !stateFailure.steps[1].executed, "部分完成步骤摘要异常");

console.log(JSON.stringify({
  ok: true,
  steps: HEIGHT_BASE_REBUILD_STEPS,
  success: {executed: success.executed, calls: successCalls, summary: success.constraint},
  riverFailure: {executed: riverFailure.executed, calls: riverFailureCalls, summary: riverFailure.constraint},
  stateFailure: {executed: stateFailure.executed, calls: stateFailureCalls, summary: stateFailure.constraint}
}, null, 2));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
