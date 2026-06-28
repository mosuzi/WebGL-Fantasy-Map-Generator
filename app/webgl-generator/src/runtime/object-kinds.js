export const OBJECT_KIND = Object.freeze({
  CITY: "city",
  LABEL: "label",
  MARKER: "marker",
  ROUTE: "route",
  RIVER: "river",
  STATE: "state",
  PROVINCE: "province",
  CULTURE: "culture",
  RELIGION: "religion",
  REGION: "region"
});

export const LABEL_TARGET_KIND = Object.freeze({
  CITY: OBJECT_KIND.CITY,
  STATE: OBJECT_KIND.STATE,
  CUSTOM: "custom"
});

export const OBJECT_KIND_LABEL = Object.freeze({
  [OBJECT_KIND.CITY]: "城市",
  [OBJECT_KIND.LABEL]: "标签",
  [OBJECT_KIND.MARKER]: "标记",
  [OBJECT_KIND.ROUTE]: "路线",
  [OBJECT_KIND.RIVER]: "河流",
  [OBJECT_KIND.STATE]: "国家",
  [OBJECT_KIND.PROVINCE]: "省份",
  [OBJECT_KIND.CULTURE]: "文化",
  [OBJECT_KIND.RELIGION]: "宗教",
  [OBJECT_KIND.REGION]: "区域"
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
  OBJECT_KIND.MARKER
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
