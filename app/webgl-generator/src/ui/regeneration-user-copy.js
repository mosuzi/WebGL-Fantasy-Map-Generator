export const REGENERATION_KIND_LABELS = Object.freeze({
  features: "地理要素",
  routes: "路线",
  rivers: "河流",
  cities: "城镇",
  states: "国家",
  provinces: "省份",
  markers: "标记",
  diplomacy: "外交",
  religions: "宗教",
  military: "军事",
  zones: "地区"
});

const REGENERATION_ACTION_KINDS = Object.freeze({
  "Feature 与岸线": "features",
  "道路": "routes",
  "河流": "rivers",
  "城镇": "cities",
  "国家": "states",
  "省份": "provinces",
  "资源点与经济": "markers",
  "外交": "diplomacy",
  "宗教": "religions",
  "军事": "military",
  "地区": "zones"
});

const ERROR_MESSAGES = Object.freeze({
  operation_busy: "当前还有操作正在进行，请稍后再试。",
  operation_cancelled: "本次重新生成已取消。",
  operation_obsolete: "地图已发生变化，本次结果未应用，请重新操作。",
  operation_invalid_input: "无法开始重新生成，请检查所选范围和条件。",
  regeneration_lock_conflict: "部分锁定内容与本次重新生成冲突，请调整锁定范围后重试。",
  operation_rollback_failed: "重新生成失败，地图恢复未能完整完成，请重新载入当前地图后检查。",
  operation_failed: "重新生成失败，当前地图未应用本次更改。"
});

export function regenerationKindLabel(kind) {
  return REGENERATION_KIND_LABELS[String(kind || "").trim().toLowerCase()] || "地图内容";
}

export function regenerationLoadingMessage(kind, stage = "initial") {
  const label = regenerationKindLabel(kind);
  switch (regenerationLoadingPhase(stage)) {
    case "preparation": return `正在汇拢${label}所需的山河脉络`;
    case "calculation": return `正在推演新的${label}`;
    case "result": return `正在收束${label}推演结果`;
    case "compatibility": return `正在换一种稳妥方式继续推演${label}`;
    case "commit": return `正在将新的${label}归入地图`;
    case "render": return `正在重整地图上的${label}细节`;
    case "complete": return `新的${label}已经铺陈完成`;
    case "cancel": return `${label}重新生成已取消`;
    case "failure": return `${label}重新生成未能完成`;
    default: return `正在梳理现有${label}`;
  }
}

export function regenerationResultMessage(kind, result = {}) {
  const label = regenerationKindLabel(resolveRegenerationKind(kind, result));
  return result?.executed === false ? `${label}没有需要更新的内容。` : `${label}重新生成完成。`;
}

export function regenerationErrorMessage(code) {
  return ERROR_MESSAGES[String(code || "operation_failed")] || ERROR_MESSAGES.operation_failed;
}

export function regenerationFeedbackMessage(kind, response, {debug = false} = {}) {
  if (debug) {
    return response?.ok
      ? response.data?.status || "重设完成"
      : `重设失败：${response?.error?.message || "未知错误"}`;
  }
  if (response?.ok) return regenerationResultMessage(kind, response.data);
  return regenerationErrorMessage(response?.error?.code);
}

export function createRegenerationUserError(kind, error) {
  const wrapped = new Error(regenerationErrorMessage(error?.code), {cause: error});
  wrapped.name = "RegenerationUserError";
  wrapped.code = String(error?.code || "operation_failed");
  wrapped.regenerationKind = resolveRegenerationKind(kind);
  return wrapped;
}

export function regenerationPanelCopy(result = {}, {debug = false, defaultConstraint = ""} = {}) {
  if (!debug) {
    const kind = resolveRegenerationKind("", result);
    return {
      status: Object.prototype.hasOwnProperty.call(REGENERATION_KIND_LABELS, kind) ? regenerationResultMessage(kind, result) : "",
      constraint: String(defaultConstraint || ""),
      appStatus: null
    };
  }
  const status = String(result.status || "");
  const constraint = String(result.constraint || defaultConstraint || "");
  const action = result.action ? `${result.action}：` : "";
  return {
    status,
    constraint,
    appStatus: status ? `${action}${status}${result.constraint ? ` / ${result.constraint}` : ""}` : null
  };
}

function resolveRegenerationKind(kind, result = {}) {
  const direct = String(kind || result.kind || "").trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(REGENERATION_KIND_LABELS, direct)) return direct;
  return REGENERATION_ACTION_KINDS[String(result.action || kind || "").trim()] || "";
}

function regenerationLoadingPhase(stage) {
  const value = String(stage || "").trim().toLowerCase();
  if (/cancel|abort/.test(value)) return "cancel";
  if (/result-stream|output-stream|patch/.test(value)) return "result";
  if (/complete|success|finish|done/.test(value)) return "complete";
  if (/fail|error|rollback/.test(value)) return "failure";
  if (/fallback|compat/.test(value)) return "compatibility";
  if (/render-install|render-prepare|render-commit|gpu|overlay|draw/.test(value)) return "render";
  if (/commit|apply-patch/.test(value)) return "commit";
  if (/stream-input|input|snapshot|prepare|validate/.test(value)) return "preparation";
  if (/regenerate|initial|start/.test(value)) return "initial";
  return "calculation";
}
