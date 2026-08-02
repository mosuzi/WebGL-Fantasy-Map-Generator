import {LABEL_TARGET_KIND} from "./object-kinds.js";
import {LABEL_STYLE_TYPE, labelStyleTypeForTarget} from "./label-style-registry.js";

export const LABEL_LAYOUT_VERSION = 1;
export const LABEL_PRIORITY_MIN = 0;
export const LABEL_PRIORITY_MAX = 100;

export const LABEL_LAYOUT_DEFAULT_PRIORITY = Object.freeze({
  [LABEL_STYLE_TYPE.STATE]: 80,
  [LABEL_STYLE_TYPE.PROVINCE]: 60,
  [LABEL_STYLE_TYPE.CAPITAL]: 90,
  [LABEL_STYLE_TYPE.CITY]: 50,
  [LABEL_STYLE_TYPE.CUSTOM]: 70,
  [LABEL_STYLE_TYPE.ZONE]: 50
});

const LABEL_TARGET_KINDS = new Set(Object.values(LABEL_TARGET_KIND));
const OVERRIDE_FIELDS = new Set(["priority", "position"]);

export function normalizeLabelLayoutStore(source, {strict = false} = {}) {
  if (strict && source !== undefined && (!source || typeof source !== "object" || Array.isArray(source))) throw new Error("标签布局存储无效");
  if (strict && source !== undefined && Number(source.version) !== LABEL_LAYOUT_VERSION) throw new Error("标签布局存储版本无效");
  if (strict && source) {
    for (const key of Object.keys(source)) if (key !== "version" && key !== "overrides") throw new Error(`未知标签布局存储字段：${key}`);
  }
  const input = source?.overrides;
  if (strict && source !== undefined && (!input || typeof input !== "object" || Array.isArray(input))) throw new Error("标签布局覆盖表无效");
  const overrides = {};
  for (const [key, value] of Object.entries(input || {})) {
    const target = parseLabelTargetKey(key, {strict});
    if (!target) continue;
    const override = normalizeLabelLayoutOverride(value, {strict});
    if (Object.keys(override).length) overrides[labelTargetKey(target.targetKind, target.targetId)] = override;
  }
  return {version: LABEL_LAYOUT_VERSION, overrides};
}

export function validateLabelLayoutStore(source) {
  normalizeLabelLayoutStore(source, {strict: true});
  return true;
}

export function ensureLabelLayoutStore(map) {
  if (!map.labels || typeof map.labels !== "object") map.labels = {};
  map.labels.layout = normalizeLabelLayoutStore(map.labels.layout);
  return map.labels.layout;
}

export function labelTargetKey(targetKind, targetId) {
  if (!LABEL_TARGET_KINDS.has(targetKind)) throw new Error(`未知标签目标类型：${targetKind}`);
  const id = Number(targetId);
  if (!Number.isInteger(id) || id < 0) throw new Error(`标签目标 ID 无效：${targetId}`);
  return `${targetKind}:${id}`;
}

export function readLabelLayoutOverride(mapOrStore, targetKind, targetId) {
  const store = mapOrStore?.labels?.layout || mapOrStore?.layout || mapOrStore;
  const override = normalizeLabelLayoutStore(store).overrides[labelTargetKey(targetKind, targetId)];
  return cloneLayoutOverride(override);
}

export function patchLabelLayout(map, targetKind, targetId, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("标签布局修改必须是对象");
  const store = ensureLabelLayoutStore(map);
  const key = labelTargetKey(targetKind, targetId);
  const current = cloneLayoutOverride(store.overrides[key]);
  for (const field of Object.keys(patch)) if (!OVERRIDE_FIELDS.has(field)) throw new Error(`未知标签布局字段：${field}`);
  if (Object.hasOwn(patch, "priority")) {
    if (patch.priority === null || patch.priority === undefined || patch.priority === "") delete current.priority;
    else current.priority = normalizePriority(patch.priority, {strict: true});
  }
  if (Object.hasOwn(patch, "position")) {
    if (patch.position === null || patch.position === undefined) delete current.position;
    else current.position = normalizePosition(patch.position, {strict: true});
  }
  if (Object.keys(current).length) store.overrides[key] = current;
  else delete store.overrides[key];
  return cloneLayoutOverride(store.overrides[key]);
}

export function deleteLabelLayoutOverride(map, targetKind, targetId) {
  const store = ensureLabelLayoutStore(map);
  delete store.overrides[labelTargetKey(targetKind, targetId)];
}

export function restoreLabelLayoutOverride(map, targetKind, targetId, override) {
  const key = labelTargetKey(targetKind, targetId);
  const store = ensureLabelLayoutStore(map);
  const normalized = normalizeLabelLayoutOverride(override);
  if (Object.keys(normalized).length) store.overrides[key] = normalized;
  else delete store.overrides[key];
}

export function resolveLabelLayout(mapOrStore, targetKind, targetId, item = null, auto = {}) {
  const styleType = labelStyleTypeForTarget(targetKind, item);
  const override = readLabelLayoutOverride(mapOrStore, targetKind, targetId);
  const autoPosition = normalizePosition({x: auto.x, y: auto.y});
  const position = override.position || autoPosition;
  const manualPriority = Number.isInteger(override.priority);
  const priority = manualPriority ? override.priority : LABEL_LAYOUT_DEFAULT_PRIORITY[styleType];
  const minScale = manualPriority ? priorityAdjustedMinScale(auto.minScale, priority) : Number(auto.minScale) || 0;
  return Object.freeze({
    key: labelTargetKey(targetKind, targetId),
    styleType,
    priority,
    autoPriority: Number(auto.priority) || 0,
    manualPriority,
    locked: Boolean(override.position),
    position: Object.freeze({...position}),
    minScale
  });
}

export function hasManualLabelPriorities(mapOrStore) {
  const store = mapOrStore?.labels?.layout || mapOrStore?.layout || mapOrStore;
  return Object.values(normalizeLabelLayoutStore(store).overrides).some(override => Number.isInteger(override.priority));
}

export function sortLabelItemsByPriority(items) {
  return [...items].sort((left, right) => (
    Number(right.layout?.priority || 0) - Number(left.layout?.priority || 0)
    || Number(right.layout?.autoPriority || 0) - Number(left.layout?.autoPriority || 0)
    || String(left.layout?.key || "").localeCompare(String(right.layout?.key || ""), "en")
  ));
}

function normalizeLabelLayoutOverride(source, {strict = false} = {}) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    if (strict) throw new Error("标签布局覆盖无效");
    return {};
  }
  if (strict) for (const key of Object.keys(source)) if (!OVERRIDE_FIELDS.has(key)) throw new Error(`未知标签布局字段：${key}`);
  const result = {};
  if (Object.hasOwn(source, "priority")) {
    const priority = normalizePriority(source.priority, {strict});
    if (priority !== null) result.priority = priority;
  }
  if (Object.hasOwn(source, "position")) {
    const position = normalizePosition(source.position, {strict});
    if (position) result.position = position;
  }
  return result;
}

function parseLabelTargetKey(value, {strict = false} = {}) {
  const match = String(value || "").match(/^(state|province|city|zone|custom):(\d+)$/);
  if (!match) {
    if (strict) throw new Error(`标签布局目标键无效：${value}`);
    return null;
  }
  return {targetKind: match[1], targetId: Number(match[2])};
}

function normalizePriority(value, {strict = false} = {}) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < LABEL_PRIORITY_MIN || number > LABEL_PRIORITY_MAX) {
    if (strict) throw new Error(`标签优先级必须是 ${LABEL_PRIORITY_MIN} 到 ${LABEL_PRIORITY_MAX} 的整数`);
    return null;
  }
  return number;
}

function normalizePosition(value, {strict = false} = {}) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    if (strict) throw new Error("标签锁定位置必须包含有限 x / y 世界坐标");
    return null;
  }
  return {x, y};
}

function priorityAdjustedMinScale(minScale, priority) {
  const base = Math.max(0, Number(minScale) || 0);
  const factor = 1.35 - priority / LABEL_PRIORITY_MAX * 0.8;
  return Math.round(base * factor * 1000) / 1000;
}

function cloneLayoutOverride(override) {
  if (!override) return {};
  return {
    ...(Number.isInteger(override.priority) ? {priority: override.priority} : {}),
    ...(override.position ? {position: {...override.position}} : {})
  };
}
