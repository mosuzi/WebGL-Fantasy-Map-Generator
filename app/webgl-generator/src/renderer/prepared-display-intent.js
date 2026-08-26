import {
  normalizeRenderResourceBinding,
  sameRenderResourceBinding
} from "./render-resource-binding.js";

export const PREPARED_DISPLAY_INTENT_SCHEMA_VERSION = 1;

export function createPreparedDisplayIntent(payload = {}, inputBinding = payload.binding) {
  const binding = normalizeRenderResourceBinding(inputBinding, "preparedDisplayIntent.binding");
  const viewOptions = payload.viewOptions || {};
  const colorMode = String(payload.colorMode || "height");
  const smoothCellBorders = viewOptions.smoothCellBorders !== false;
  const intent = {
    schemaVersion: PREPARED_DISPLAY_INTENT_SCHEMA_VERSION,
    binding: {...binding},
    colorMode,
    showOceanHeight: Boolean(viewOptions.showOceanHeight),
    smoothCellBorders,
    mapEdgeFade: viewOptions.mapEdgeFade !== false,
    visualThemeFingerprint: visualThemeFingerprint(viewOptions.visualTheme),
    shoreSurfaceKey: smoothCellBorders ? gpuResidentShoreSurfaceKey(colorMode, viewOptions) : ""
  };
  return Object.freeze({...intent, fingerprint: preparedDisplayIntentFingerprint(intent)});
}

export function assertPreparedDisplayIntent(intent, payload = {}, inputBinding = payload.binding, {required = false} = {}) {
  if (!intent) {
    if (required) throw preparedDisplayIntentError("render-display-intent-missing", "地图首屏显示状态不完整，请重新导入");
    return false;
  }
  const expected = createPreparedDisplayIntent(payload, inputBinding);
  const mismatch = preparedDisplayIntentMismatch(intent, expected);
  if (mismatch) {
    throw preparedDisplayIntentError("render-display-intent-mismatch", "地图首屏显示状态已过期，请重新导入");
  }
  return true;
}

export function assertMatchingPreparedDisplayIntents(first, second) {
  if (!first || !second) {
    throw preparedDisplayIntentError("render-display-intent-missing", "地图首屏显示状态不完整，请重新导入");
  }
  const mismatch = preparedDisplayIntentMismatch(first, second);
  if (mismatch) {
    throw preparedDisplayIntentError("render-display-intent-parallel-mismatch", "地图首屏显示状态不一致，请重新导入");
  }
  return true;
}

export function gpuResidentShoreSurfaceKey(colorMode, viewOptions = {}) {
  return JSON.stringify([
    String(colorMode || "height"),
    Boolean(viewOptions.showOceanHeight),
    viewOptions.visualTheme?.id || "default",
    viewOptions.visualTheme?.water?.fill || null,
    viewOptions.visualTheme?.land?.fill || null,
    viewOptions.visualTheme?.terrain?.heightRamp || null
  ]);
}

function preparedDisplayIntentMismatch(actual, expected) {
  if (Number(actual?.schemaVersion) !== PREPARED_DISPLAY_INTENT_SCHEMA_VERSION) return "schema-version";
  if (!sameRenderResourceBinding(actual?.binding, expected?.binding)) return "binding";
  for (const key of ["colorMode", "showOceanHeight", "smoothCellBorders", "mapEdgeFade", "visualThemeFingerprint", "shoreSurfaceKey"]) {
    if (actual?.[key] !== expected?.[key]) return key;
  }
  const actualFingerprint = String(actual?.fingerprint || "");
  if (!actualFingerprint || actualFingerprint !== preparedDisplayIntentFingerprint(actual)) return "fingerprint";
  if (actualFingerprint !== String(expected?.fingerprint || "")) return "fingerprint";
  return "";
}

function preparedDisplayIntentFingerprint(intent) {
  const binding = intent?.binding || {};
  return JSON.stringify([
    PREPARED_DISPLAY_INTENT_SCHEMA_VERSION,
    String(binding.mapIdentity || ""),
    Number(binding.sourceRevision),
    Number(binding.topologyRevision),
    Number(binding.renderGeneration),
    String(binding.renderPreparationId || ""),
    String(intent?.colorMode || "height"),
    Boolean(intent?.showOceanHeight),
    intent?.smoothCellBorders !== false,
    intent?.mapEdgeFade !== false,
    String(intent?.visualThemeFingerprint || ""),
    String(intent?.shoreSurfaceKey || "")
  ]);
}

function visualThemeFingerprint(theme) {
  return JSON.stringify([
    theme?.id || "default",
    theme?.water?.fill || null,
    theme?.land?.fill || null,
    theme?.terrain?.heightRamp || null,
    theme?.lines?.coastline || null,
    theme?.lines?.lakeShore || null,
    theme?.lines?.stateBorder || null,
    theme?.lines?.provinceBorder || null
  ]);
}

function preparedDisplayIntentError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
