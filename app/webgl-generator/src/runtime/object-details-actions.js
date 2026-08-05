import {LABEL_TARGET_KIND, OBJECT_KIND} from "./object-kinds.js";

export const OBJECT_DETAILS_EDIT_MODE = Object.freeze({
  INLINE_NAME: "inline-name",
  DOMAIN_PANEL: "domain-panel"
});

const LOCATABLE_KINDS = new Set([
  OBJECT_KIND.CITY,
  OBJECT_KIND.LABEL,
  OBJECT_KIND.MARKER,
  OBJECT_KIND.NOTE,
  OBJECT_KIND.ROUTE,
  OBJECT_KIND.TRADE_FLOW,
  OBJECT_KIND.RIVER,
  OBJECT_KIND.LAKE,
  OBJECT_KIND.OCEAN_CURRENT,
  OBJECT_KIND.MEASUREMENT,
  OBJECT_KIND.MILITARY,
  OBJECT_KIND.DIPLOMACY_RELATION,
  OBJECT_KIND.STATE,
  OBJECT_KIND.PROVINCE,
  OBJECT_KIND.CULTURE,
  OBJECT_KIND.RELIGION,
  OBJECT_KIND.REGION,
  OBJECT_KIND.ZONE
]);

const DOMAIN_EDIT_LABELS = Object.freeze({
  [OBJECT_KIND.STATE]: "打开国家编辑",
  [OBJECT_KIND.PROVINCE]: "打开省份编辑",
  [OBJECT_KIND.CULTURE]: "打开文化编辑",
  [OBJECT_KIND.RELIGION]: "打开宗教编辑",
  [OBJECT_KIND.ROUTE]: "打开路线编辑",
  [OBJECT_KIND.RIVER]: "打开河流编辑",
  [OBJECT_KIND.ZONE]: "打开地区编辑",
  [OBJECT_KIND.MARKER]: "打开标记编辑",
  [OBJECT_KIND.NOTE]: "打开备注编辑",
  [OBJECT_KIND.MEASUREMENT]: "打开测量编辑",
  [OBJECT_KIND.MILITARY]: "打开军事编辑",
  [OBJECT_KIND.FEATURE]: "打开地貌编辑",
  [OBJECT_KIND.OCEAN_CURRENT]: "打开洋流编辑",
  [OBJECT_KIND.ECONOMY_MARKET]: "打开经济编辑",
  [OBJECT_KIND.DIPLOMACY_RELATION]: "打开外交编辑"
});

export function describeObjectDetailsActions(object) {
  return {
    canLocate: Boolean(object && LOCATABLE_KINDS.has(object.kind)),
    edit: describeEditAction(object)
  };
}

function describeEditAction(object) {
  if (!object) return null;
  if (object.kind === OBJECT_KIND.CITY || object.kind === OBJECT_KIND.LAKE) {
    return {mode: OBJECT_DETAILS_EDIT_MODE.INLINE_NAME, label: "编辑名称", editingLabel: "退出名称编辑"};
  }
  if (object.kind === OBJECT_KIND.LABEL) {
    if (object.targetKind === LABEL_TARGET_KIND.CITY || object.targetKind === LABEL_TARGET_KIND.STATE) {
      return {mode: OBJECT_DETAILS_EDIT_MODE.INLINE_NAME, label: "编辑名称", editingLabel: "退出名称编辑"};
    }
    return {mode: OBJECT_DETAILS_EDIT_MODE.DOMAIN_PANEL, label: "打开标签编辑"};
  }
  const label = DOMAIN_EDIT_LABELS[object.kind];
  return label ? {mode: OBJECT_DETAILS_EDIT_MODE.DOMAIN_PANEL, label} : null;
}
