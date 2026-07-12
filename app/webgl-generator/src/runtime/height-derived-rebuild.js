export const HEIGHT_BASE_REBUILD_STEPS = Object.freeze(["rivers", "states"]);

export function createRegenerationResult(kind, status, constraint) {
  const labels = {
    states: "国家",
    provinces: "省份",
    cities: "城镇",
    routes: "道路",
    rivers: "河流",
    "height-base": "高度基础派生"
  };
  const normalizedStatus = String(status || "");
  return {
    action: labels[kind] || kind,
    executed: !["未执行", "暂未执行"].includes(normalizedStatus),
    status: normalizedStatus,
    constraint: String(constraint || "")
  };
}

export function rebuildHeightBaseDerived(regenerate) {
  if (typeof regenerate !== "function") throw new Error("高度基础派生重建缺少 regenerate 回调");
  const steps = [];
  for (const kind of HEIGHT_BASE_REBUILD_STEPS) {
    const result = regenerate(kind);
    steps.push({kind, result});
    if (!result?.executed) break;
  }
  const executed = steps.length === HEIGHT_BASE_REBUILD_STEPS.length && steps.every(step => step.result?.executed);
  const status = steps.map(step => `${step.result?.action || step.kind}：${step.result?.status || "未返回状态"}`).join("；");
  return {
    action: "高度基础派生",
    executed,
    status,
    constraint: executed
      ? "已按河流 / 生物群系 / 道路 -> 国家 / 省份 / 城镇 / 道路的顺序完成基础派生重算。"
      : `基础派生在${steps.at(-1)?.result?.action || steps.at(-1)?.kind || "未知步骤"}停止，未继续执行依赖它的后续步骤。`,
    steps: steps.map(step => ({kind: step.kind, action: step.result?.action || step.kind, executed: Boolean(step.result?.executed)}))
  };
}
