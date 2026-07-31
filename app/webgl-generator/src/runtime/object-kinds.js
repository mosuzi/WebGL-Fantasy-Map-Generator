export const OBJECT_KIND = Object.freeze({
  CITY: "city",
  LABEL: "label",
  MARKER: "marker",
  NOTE: "note",
  ROUTE: "route",
  TRADE_FLOW: "trade-flow",
  ECONOMY_MARKET: "economy-market",
  RIVER: "river",
  LAKE: "lake",
  FEATURE: "feature",
  OCEAN_CURRENT: "ocean-current",
  MEASUREMENT: "measurement",
  MILITARY: "military",
  DIPLOMACY_RELATION: "diplomacy-relation",
  STATE: "state",
  PROVINCE: "province",
  CULTURE: "culture",
  RELIGION: "religion",
  REGION: "region",
  ZONE: "zone"
});

export const LABEL_TARGET_KIND = Object.freeze({
  CITY: OBJECT_KIND.CITY,
  STATE: OBJECT_KIND.STATE,
  PROVINCE: OBJECT_KIND.PROVINCE,
  ZONE: OBJECT_KIND.ZONE,
  CUSTOM: "custom"
});

export const OBJECT_KIND_LABEL = Object.freeze({
  [OBJECT_KIND.CITY]: "城市",
  [OBJECT_KIND.LABEL]: "标签",
  [OBJECT_KIND.MARKER]: "标记",
  [OBJECT_KIND.NOTE]: "独立备注",
  [OBJECT_KIND.ROUTE]: "路线",
  [OBJECT_KIND.TRADE_FLOW]: "贸易流",
  [OBJECT_KIND.ECONOMY_MARKET]: "经济市场",
  [OBJECT_KIND.RIVER]: "河流",
  [OBJECT_KIND.LAKE]: "湖泊",
  [OBJECT_KIND.FEATURE]: "地貌单元",
  [OBJECT_KIND.OCEAN_CURRENT]: "洋流",
  [OBJECT_KIND.MEASUREMENT]: "测量对象",
  [OBJECT_KIND.MILITARY]: "军团",
  [OBJECT_KIND.DIPLOMACY_RELATION]: "外交关系",
  [OBJECT_KIND.STATE]: "国家",
  [OBJECT_KIND.PROVINCE]: "省份",
  [OBJECT_KIND.CULTURE]: "文化",
  [OBJECT_KIND.RELIGION]: "宗教",
  [OBJECT_KIND.REGION]: "区域",
  [OBJECT_KIND.ZONE]: "地区"
});

export const POLITICAL_OBJECT_KINDS = Object.freeze([
  OBJECT_KIND.STATE,
  OBJECT_KIND.PROVINCE,
  OBJECT_KIND.REGION,
  OBJECT_KIND.CULTURE,
  OBJECT_KIND.RELIGION
]);

export const POLITICAL_OBJECT_FIELD = Object.freeze({
  [OBJECT_KIND.STATE]: "state",
  [OBJECT_KIND.PROVINCE]: "province",
  [OBJECT_KIND.REGION]: "region",
  [OBJECT_KIND.CULTURE]: "culture",
  [OBJECT_KIND.RELIGION]: "religion"
});

export const POINT_OBJECT_KINDS = Object.freeze([
  OBJECT_KIND.CITY,
  OBJECT_KIND.LABEL,
  OBJECT_KIND.MARKER,
  OBJECT_KIND.NOTE,
  OBJECT_KIND.MILITARY
]);

export function isKind(object, kind) {
  return object?.kind === kind;
}

export function isPoliticalObjectKind(kind) {
  return POLITICAL_OBJECT_KINDS.includes(kind);
}

export function isPointObjectKind(kind) {
  return POINT_OBJECT_KINDS.includes(kind);
}
