export const HEIGHT_BASE_REBUILD_STEPS = Object.freeze(["features", "rivers", "states"]);
export const HEIGHT_DOWNSTREAM_REBUILD_STEPS = Object.freeze(["religions", "markers", "diplomacy", "military", "zones"]);

export function createRegenerationResult(kind, status, constraint) {
  const labels = {
    states: "国家",
    provinces: "省份",
    cities: "城镇",
    routes: "道路",
    rivers: "河流",
    religions: "宗教",
    markers: "资源点与经济",
    diplomacy: "外交",
    military: "军事",
    zones: "地区",
    features: "Feature 与岸线",
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
  return rebuildHeightDerivedSteps(regenerate, HEIGHT_BASE_REBUILD_STEPS, {
    action: "高度基础派生",
    successConstraint: "已按 Feature / 岸线 -> 河流 / 生物群系 / 道路 -> 国家 / 省份 / 城镇 / 道路的顺序完成基础派生重算。"
  });
}

export function rebuildHeightDownstreamDerived(regenerate) {
  return rebuildHeightDerivedSteps(regenerate, HEIGHT_DOWNSTREAM_REBUILD_STEPS, {
    action: "高度下游派生",
    successConstraint: "已按宗教 -> 资源点 / 经济 -> 外交 -> 军事 -> 地区的顺序完成下游派生重算。"
  });
}

function rebuildHeightDerivedSteps(regenerate, orderedSteps, {action, successConstraint}) {
  if (typeof regenerate !== "function") throw new Error("高度派生重建缺少 regenerate 回调");
  const steps = [];
  for (const kind of orderedSteps) {
    const result = regenerate(kind);
    steps.push({kind, result});
    if (!result?.executed) break;
  }
  const executed = steps.length === orderedSteps.length && steps.every(step => step.result?.executed);
  const status = steps.map(step => `${step.result?.action || step.kind}：${step.result?.status || "未返回状态"}`).join("；");
  return {
    action,
    executed,
    status,
    constraint: executed
      ? successConstraint
      : `${action}在${steps.at(-1)?.result?.action || steps.at(-1)?.kind || "未知步骤"}停止，未继续执行依赖它的后续步骤。`,
    steps: steps.map(step => ({kind: step.kind, action: step.result?.action || step.kind, executed: Boolean(step.result?.executed)}))
  };
}
