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

  const rows = [
    {label: "地貌", value: formatHoverTerrainLine(pick)},
    {label: "气候", value: `${pick.temperature}°C / 降水 ${formatDisplayPrecipitation(pick.precipitation, unitPreferences)}`},
    {label: "政区", value: `${pick.state} / ${pick.province}`},
    {label: "社会", value: `${pick.culture} / ${pick.religion}`},
    {label: "人口", value: formatDisplayPopulation(pick.population, unitPreferences)}
  ];

  const objectText = formatHoverObjectLine(pick, unitPreferences, debugEnabled);
  if (objectText) rows.unshift({label: "对象", value: objectText});
  if (debugEnabled) rows.push(
    {label: "内部位置", value: `grid ${pick.gridCell} / pack ${pick.packCell ?? "none"}`},
    {label: "内部地形", value: `${pick.featureType} #${pick.featureId} / 高度 ${formatDisplayHeight(pick.height, unitPreferences)}`},
    {label: "调试", value: formatHoverDebugLine(pick, unitPreferences)}
  );
  return rows.filter(row => String(row.label || "").trim() && String(row.value || "").trim());
}

export function formatHoverObjectTitle(object) {
  const name = object?.name || object?.text || object?.goodName || object?.relationLabel || "";
  const label = HOVER_OBJECT_LABELS[object?.kind] || "对象";
  return name ? `${label} ${name}` : label;
}

export function isNamedHoverRoute(route) {
  return Boolean(route?.from && route?.to && route.from !== "unknown" && route.to !== "unknown");
}

function formatHoverTerrainLine(pick) {
  const featureLabels = {ocean: "海洋", lake: "湖泊", island: "岛屿", land: "陆地"};
  const feature = featureLabels[pick.featureType] || (pick.featureLand ? "陆地" : "水域");
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
