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

const REGENERATION_SOURCE_COPY = Object.freeze({
  features: "山川水陆与海岸轮廓",
  routes: "城邑、港口与通行地势",
  rivers: "地势高低、雨水与湖泊",
  cities: "山河、人烟、文化与政区",
  states: "城邑、疆域、文化与人烟",
  provinces: "国家、城邑与地形脉络",
  markers: "地貌、物产与人烟分布",
  diplomacy: "诸国关系、战争与往来",
  religions: "文化、城邑与人口分布",
  military: "诸国、城邑、地势与战局",
  zones: "战争、信仰、军事与地貌"
});

const REGENERATION_PHASE_RANK = Object.freeze({
  initial: 0,
  preparation: 10,
  calculation: 20,
  compatibility: 25,
  result: 30,
  commit: 40,
  render: 50,
  complete: 60,
  cancel: 70,
  failure: 70
});

const ERROR_MESSAGES = Object.freeze({
  operation_busy: "当前还有操作正在进行，请稍后再试。",
  operation_cancelled: "本次重新生成已取消。",
  operation_obsolete: "地图已发生变化，本次结果未应用，请重新操作。",
  operation_invalid_input: "无法开始重新生成，请检查所选范围和条件。",
  regeneration_lock_conflict: "锁定数据本身已损坏或缺少依赖，请检查对应对象后重试。",
  operation_rollback_failed: "重新生成失败，地图恢复未能完整完成，请重新载入当前地图后检查。",
  operation_failed: "重新生成失败，当前地图未应用本次更改。"
});

export function regenerationKindLabel(kind) {
  return REGENERATION_KIND_LABELS[String(kind || "").trim().toLowerCase()] || "地图内容";
}

export function regenerationLoadingMessage(kind, stage = "initial") {
  return regenerationLoadingState(kind, stage).message;
}

export function regenerationLoadingState(kind, stage = "initial") {
  const normalizedKind = resolveRegenerationKind(kind);
  const label = regenerationKindLabel(kind);
  const phase = regenerationLoadingPhase(stage);
  const source = REGENERATION_SOURCE_COPY[normalizedKind] || "地图中的相关脉络";
  const message = regenerationLoadingCopy(label, source, phase);
  return {phase, rank: REGENERATION_PHASE_RANK[phase], message};
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
      : `重设失败：${response?.error?.message || "未知错误"}${debugRegenerationErrorDetails(response?.error)}`;
  }
  if (response?.ok) return regenerationResultMessage(kind, response.data);
  return regenerationErrorMessage(response?.error?.code);
}

function debugRegenerationErrorDetails(error) {
  const details = error?.details;
  if (!details || typeof details !== "object") return "";
  const lock = details.reference || details.worker?.details?.reference || null;
  const reason = details.reason || details.worker?.details?.reason || "";
  const changed = details.changedFields || details.worker?.details?.changedFields || [];
  const changedSummary = details.changedSummary || details.worker?.details?.changedSummary || null;
  if (!lock && !reason && !changed.length && !changedSummary) return "";
  const summary = changedSummary ? JSON.stringify(changedSummary).slice(0, 600) : "";
  return `（${[lock ? `${lock.kind || "object"} #${lock.id}` : "", reason, changed.length ? `字段 ${changed.join("、")}` : "", summary].filter(Boolean).join("；")}）`;
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
  if (/render-install|render-commit|gpu|overlay|draw/.test(value)) return "render";
  if (/commit|apply-patch/.test(value)) return "commit";
  if (/render-prepare/.test(value)) return "calculation";
  if (/stream-input|input|snapshot|prepare|validate/.test(value)) return "preparation";
  if (/regenerate|initial|start/.test(value)) return "initial";
  return "calculation";
}

function regenerationLoadingCopy(label, source, phase) {
  switch (phase) {
    case "preparation": return `正在汇集${source}`;
    case "calculation": return `正在重新铺陈${label}`;
    case "result": return `正在校定新${label}的彼此关系`;
    case "compatibility": return `正在另择稳妥路径铺陈${label}`;
    case "commit": return `正在将新${label}落定成图`;
    case "render": return `正在描清新${label}的图上细节`;
    case "complete": return `${label}新卷已经落定`;
    case "cancel": return `已停下本次${label}重绘`;
    case "failure": return `本次${label}未能落定`;
    default: return `正在为${label}重开一卷`;
  }
}
