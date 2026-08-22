const MAP_REPLACE_DEBUG_FAULT_KEY = "__webglGeneratorMapReplaceFault";

export function maybeInjectMapReplaceDebugFault(documentRef, {stage, operationName = ""} = {}) {
  const view = documentRef?.defaultView;
  if (!isDebugView(view)) return false;
  const fault = view?.[MAP_REPLACE_DEBUG_FAULT_KEY];
  if (!fault || typeof fault !== "object" || fault.enabled === false) return false;
  if (String(fault.stage || "") !== String(stage || "")) return false;
  if (fault.operationName && String(fault.operationName) !== String(operationName || "")) return false;

  fault.hits = (Number(fault.hits) || 0) + 1;
  if (fault.mode === "once" && fault.hits > 1) return false;
  const error = new Error(`地图替换故障注入：${stage}`);
  error.code = "map_replace_debug_fault";
  error.stage = String(stage || "map-replace");
  error.details = {
    stage: String(stage || ""),
    operationName: String(operationName || ""),
    mode: fault.mode === "persistent" ? "persistent" : "once",
    hits: fault.hits
  };
  throw error;
}

function isDebugView(view) {
  try {
    return new URLSearchParams(view?.location?.search || "").get("debug") === "1";
  } catch {
    return false;
  }
}
