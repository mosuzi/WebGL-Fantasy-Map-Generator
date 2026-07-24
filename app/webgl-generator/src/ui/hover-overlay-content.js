import {OBJECT_KIND} from "../runtime/object-kinds.js";
import {
  formatHeight as formatDisplayHeight,
  formatNumber as formatDisplayNumber,
  formatPopulation as formatDisplayPopulation,
  formatPrecipitation as formatDisplayPrecipitation,
  formatRiverFlow as formatDisplayRiverFlow
} from "./display-units.js";

const HOVER_OBJECT_LABELS = Object.freeze({
  [OBJECT_KIND.CITY]: "城市",
  [OBJECT_KIND.LABEL]: "标签",
  [OBJECT_KIND.MARKER]: "标记",
  [OBJECT_KIND.ROUTE]: "路线",
  [OBJECT_KIND.TRADE_FLOW]: "贸易流",
  [OBJECT_KIND.DIPLOMACY_RELATION]: "外交关系",
  [OBJECT_KIND.RIVER]: "河流",
  [OBJECT_KIND.LAKE]: "湖泊",
  [OBJECT_KIND.STATE]: "国家",
  [OBJECT_KIND.PROVINCE]: "省份",
  [OBJECT_KIND.CULTURE]: "文化",
  [OBJECT_KIND.RELIGION]: "宗教",
  [OBJECT_KIND.REGION]: "区域",
  [OBJECT_KIND.ZONE]: "地区",
  [OBJECT_KIND.MILITARY]: "军事单位"
});

export const HOVER_VIEW_MODES = Object.freeze([
  "height",
  "temperature",
  "precipitation",
  "biomes",
  "cultures",
  "religions",
  "diplomacy",
  "governments",
  "states",
  "provinces",
  "regions",
  "population"
]);

const RELATION_LABELS = Object.freeze({Ally: "盟友", Friendly: "友好", Neutral: "中立", Suspicion: "猜疑", Rival: "宿敌", Enemy: "战争", Vassal: "附庸", Suzerain: "宗主", Unknown: "未知"});

const HOVER_VIEW_ROW_REGISTRY = Object.freeze({
  height: context => [
    row("高度", formatDisplayHeight(context.pick.packHeight ?? context.pick.height, context.units)),
    row("地貌", formatFeatureName(context.pick))
  ],
  temperature: context => [
    row("温度", `${formatDisplayNumber(context.pick.temperature, context.units)}°C`),
    row("地貌", formatFeatureName(context.pick))
  ],
  precipitation: context => [
    row("降水", formatDisplayPrecipitation(context.pick.precipitation, context.units)),
    row("地貌", formatFeatureName(context.pick))
  ],
  biomes: context => [
    row("生物群系", context.pick.packBiome && context.pick.packBiome !== "none" ? context.pick.packBiome : context.pick.biome),
    row("说明", context.pick.packBiomeDescription || context.pick.biomeDescription || "暂无生态说明")
  ],
  cultures: context => [row("文化", context.pick.culture)],
  religions: context => [row("宗教", context.pick.religion), row("文化", context.pick.culture)],
  diplomacy: context => diplomacyRows(context),
  governments: context => governmentRows(context),
  states: context => [row("国家", politicalName(context, "states", context.pick.stateId, context.pick.state)), row("省份", politicalName(context, "provinces", context.pick.provinceId, context.pick.province))],
  provinces: context => [row("省份", politicalName(context, "provinces", context.pick.provinceId, context.pick.province)), row("国家", politicalName(context, "states", context.pick.stateId, context.pick.state))],
  regions: context => [row("区域", politicalName(context, "regions", context.pick.regionId, context.pick.region)), row("国家", politicalName(context, "states", context.pick.stateId, context.pick.state))],
  population: context => [
    row("人口", formatDisplayPopulation(context.pick.population, context.units)),
    row("适居度", formatDisplayNumber(context.pick.suitability, context.units))
  ]
});

export function buildHoverRowEntries(pick, unitPreferences = {}, options = {}) {
  const debugEnabled = Boolean(options.debugEnabled);
  if (pick.invalidMapArea) {
    const rows = [
      {label: "状态", value: "未开发"},
      {label: "说明", value: pick.invalidReason === "outside-map" ? "地图有效范围外" : "未命中有效区域"}
    ];
    if (debugEnabled) rows.splice(1, 0,
      {label: "位置", value: `x ${formatDisplayNumber(pick.worldX, unitPreferences)} / y ${formatDisplayNumber(pick.worldY, unitPreferences)}`},
      {label: "范围", value: `${formatDisplayNumber(pick.graphWidth, unitPreferences)} x ${formatDisplayNumber(pick.graphHeight, unitPreferences)}`}
    );
    return rows;
  }

  const colorMode = HOVER_VIEW_MODES.includes(options.colorMode) ? options.colorMode : "unknown";
  const context = {pick, units: unitPreferences, map: options.map || null, viewOptions: options.viewOptions || {}};
  const viewRows = HOVER_VIEW_ROW_REGISTRY[colorMode]?.(context);
  const rows = viewRows ? mergeRowsByLabel(viewRows, basicGeographyRows(context)) : genericRows(context);
  if (colorMode !== "biomes") {
    const objectText = formatHoverObjectLine(pick, unitPreferences, debugEnabled);
    if (objectText && !duplicatesPrimaryObject(pick, colorMode)) rows.unshift({label: "对象", value: objectText});
  }
  if (debugEnabled) rows.push(
    {label: "诊断·位置", value: `grid ${pick.gridCell} / pack ${pick.packCell ?? "none"}`},
    {label: "诊断·地形", value: `${pick.featureType} #${pick.featureId} / 高度 ${formatDisplayHeight(pick.height, unitPreferences)}`},
    {label: "诊断·原始值", value: formatHoverDebugLine(pick, unitPreferences)}
  );
  return rows.map(normalizeRow).filter(Boolean);
}

export function hoverViewTitle(colorMode) {
  return {
    height: "高度",
    temperature: "温度",
    precipitation: "降水",
    biomes: "生物群系",
    cultures: "文化",
    religions: "宗教",
    diplomacy: "外交",
    governments: "政体",
    states: "国家",
    provinces: "省份",
    regions: "区域",
    population: "人口"
  }[colorMode] || "地图信息";
}

export function formatHoverObjectTitle(object) {
  const name = object?.name || object?.text || object?.goodName || object?.relationLabel || "";
  const label = HOVER_OBJECT_LABELS[object?.kind] || "对象";
  return name ? `${label} ${name}` : label;
}

export function isNamedHoverRoute(route) {
  return Boolean(route?.from && route?.to && route.from !== "unknown" && route.to !== "unknown");
}

function genericRows(context) {
  const {pick, units} = context;
  return [
    row("地貌", formatHoverTerrainLine(pick)),
    row("气候", `${formatDisplayNumber(pick.temperature, units)}°C / 降水 ${formatDisplayPrecipitation(pick.precipitation, units)}`),
    row("政区", `${playerValue(pick.state)} / ${playerValue(pick.province)}`),
    row("社会", `${playerValue(pick.culture)} / ${playerValue(pick.religion)}`),
    row("人口", formatDisplayPopulation(pick.population, units))
  ];
}

function basicGeographyRows(context) {
  const {pick, units} = context;
  return [
    row("高度", formatDisplayHeight(pick.packHeight ?? pick.height, units)),
    row("地貌", formatFeatureName(pick)),
    row("温度", `${formatDisplayNumber(pick.temperature, units)}°C`),
    row("降水", formatDisplayPrecipitation(pick.precipitation, units))
  ];
}

function mergeRowsByLabel(primaryRows, sharedRows) {
  const labels = new Set(primaryRows.map(entry => entry?.label));
  return [...primaryRows, ...sharedRows.filter(entry => !labels.has(entry?.label))];
}

function diplomacyRows(context) {
  const states = context.map?.politics?.states || context.map?.pack?.states || [];
  const subjectId = Number(context.viewOptions?.diplomacySubjectId) || states.find(state => state?.i && !state.removed)?.i || 0;
  const targetId = Number(context.pick.stateId) || 0;
  const subject = states[subjectId];
  const target = states[targetId];
  const relation = subjectId && subjectId === targetId ? "本国" : RELATION_LABELS[subject?.diplomacy?.[targetId] || "Unknown"] || "未知";
  return [
    row("参照国家", subject?.fullName || subject?.name || "无"),
    row("国家", target?.fullName || target?.name || context.pick.state),
    row("外交关系", targetId ? relation : "无")
  ];
}

function governmentRows(context) {
  const state = collectionItem(context, "states", context.pick.stateId);
  return [
    row("国家", state?.fullName || state?.name || context.pick.state),
    row("政体", state?.formName || state?.governmentLabel || state?.form || state?.type || "未登记")
  ];
}

function politicalName(context, collection, id, fallback) {
  const item = collectionItem(context, collection, id);
  return item?.fullName || item?.name || fallback;
}

function collectionItem(context, collection, id) {
  const items = context.map?.politics?.[collection] || context.map?.pack?.[collection] || [];
  const numericId = Number(id);
  return items[numericId] || items.find(item => Number(item?.i ?? item?.id) === numericId) || null;
}

function duplicatesPrimaryObject(pick, colorMode) {
  const primaryKind = {
    cultures: OBJECT_KIND.CULTURE,
    religions: OBJECT_KIND.RELIGION,
    diplomacy: OBJECT_KIND.STATE,
    governments: OBJECT_KIND.STATE,
    states: OBJECT_KIND.STATE,
    provinces: OBJECT_KIND.PROVINCE,
    regions: OBJECT_KIND.REGION
  }[colorMode];
  return Boolean(primaryKind && (pick.object?.kind === primaryKind || pick.politicalObject?.kind === primaryKind) && !pick.label && (!pick.city || pick.city === "none") && !pick.marker && !pick.river && !isNamedHoverRoute(pick.route));
}

function row(label, value) {
  return {label, value};
}

function normalizeRow(entry) {
  const label = String(entry?.label || "").trim();
  const value = playerValue(entry?.value);
  return label && value ? {label, value} : null;
}

function playerValue(value) {
  if (value !== null && typeof value === "object") return "无";
  const text = String(value ?? "").trim();
  if (!text || text === "none" || text === "unknown" || text === "undefined" || text === "null") return "无";
  return text;
}

function formatFeatureName(pick) {
  return ({ocean: "海洋", lake: "湖泊", island: "岛屿", land: "陆地"})[pick.featureType] || (pick.featureLand ? "陆地" : "水域");
}

function formatHoverTerrainLine(pick) {
  const feature = formatFeatureName(pick);
  const biome = pick.packBiome && pick.packBiome !== "none" ? pick.packBiome : pick.biome;
  return biome && biome !== "none" && biome !== "unknown" ? `${feature} / ${biome}` : feature;
}

function formatHoverDebugLine(pick, unitPreferences) {
  const resource = pick.resource
    ? `${pick.resource.name} v${formatDisplayNumber(pick.resource.value, unitPreferences)} x${formatDisplayNumber(pick.resource.supply, unitPreferences)}`
    : "none";
  return [
    `biome ${pick.packBiome || pick.biome || "unknown"}`,
    `h ${formatDisplayHeight(pick.packHeight ?? pick.height, unitPreferences)}`,
    `s ${formatDisplayNumber(pick.suitability, unitPreferences)}`,
    `pack ${pick.packCell ?? "none"}`,
    `流量 ${formatDisplayRiverFlow(pick.flux, unitPreferences)}`,
    `resource ${resource}`
  ].join(" / ");
}

function formatHoverObjectLine(pick, unitPreferences, debugEnabled) {
  if (pick.label) return debugEnabled ? `${pick.label.text} / ${pick.label.targetKind}` : pick.label.text;
  if (pick.city && pick.city !== "none") return pick.city;
  if (pick.marker) return formatHoverMarkerSummary(pick.marker, unitPreferences, debugEnabled);
  if (pick.tradeFlow) return `${pick.tradeFlow.goodName} / ${pick.tradeFlow.sellerName} -> ${pick.tradeFlow.buyerName} / ${pick.tradeFlow.priceSignalLabel || "平稳"} ${formatSignedDisplayNumber(pick.tradeFlow.priceDelta, unitPreferences)}`;
  if (isNamedHoverRoute(pick.route)) return `${pick.route.from} -> ${pick.route.to}`;
  if (pick.river) return debugEnabled ? `河流 #${pick.river.id} / 流量 ${formatDisplayRiverFlow(pick.river.flux, unitPreferences)}` : "河流";
  if (pick.object && pick.object.kind !== OBJECT_KIND.ROUTE) return debugEnabled ? formatDebugHoverObjectTitle(pick.object) : formatHoverObjectTitle(pick.object);
  if (pick.politicalObject) return debugEnabled ? formatDebugHoverObjectTitle(pick.politicalObject) : formatHoverObjectTitle(pick.politicalObject);
  return "";
}

function formatHoverMarkerSummary(marker, unitPreferences, debugEnabled) {
  const label = marker.label || marker.type || "标记";
  const category = marker.categoryLabel || marker.category || "未知类别";
  const resource = marker.resourceLabel ? ` / ${marker.resourceLabel}` : "";
  const economic = Number(marker.economicValue || 0) > 0 ? ` / 潜力 ${formatDisplayNumber(marker.economicValue, unitPreferences)}` : "";
  return debugEnabled ? `${label} / ${category}${resource}${economic} / cell ${marker.cell}` : `${category}${resource}${economic}`;
}

function formatDebugHoverObjectTitle(object) {
  const title = formatHoverObjectTitle(object);
  return object?.id === undefined || object?.id === null ? title : `${title} #${object.id}`;
}

function formatSignedDisplayNumber(value, unitPreferences) {
  const numeric = Number(value || 0);
  return `${numeric > 0 ? "+" : ""}${formatDisplayNumber(numeric, unitPreferences)}`;
}
