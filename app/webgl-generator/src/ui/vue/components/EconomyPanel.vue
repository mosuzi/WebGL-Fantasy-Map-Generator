<template>
  <UiMetricGrid :metrics="summaryMetrics" class-name="economy-panel-summary" />

  <div class="economy-panel-controls">
    <UiSegmented label="经济范围" :options="tabOptions" :model-value="state.tab" @select="callbacks.onTab" />
    <UiFilterInput :model-value="state.filter" placeholder="筛选商品 / 市场 / 城镇 / 国家 / 来源" @update:model-value="callbacks.onFilter" />
    <div class="economy-panel-export-actions" aria-label="经济导出">
      <UiButton id="economy-export-csv" variant="secondary" :disabled="!activeTotalRows" @click="exportCsv">导出 CSV</UiButton>
      <UiButton id="economy-export-json" variant="secondary" :disabled="!activeTotalRows" @click="exportJson">导出 JSON</UiButton>
    </div>
  </div>

  <UiSortBar class-name="economy-panel-sort" :options="activeSortOptions" :active-key="state.sortKey" :direction="state.sortDir" @sort="callbacks.onSort" />

  <UiObjectTable
    v-if="state.tab === 'goods'"
    :columns="goodColumns"
    :rows="visibleGoodRows"
    :selected-id="state.selectedGoodId"
    empty-text="没有匹配的商品"
    @select="callbacks.onSelectGood"
    @locate="callbacks.onLocate"
  />
  <UiObjectTable
    v-else-if="state.tab === 'markets'"
    :columns="marketColumns"
    :rows="visibleMarketRows"
    :selected-id="state.selectedMarketId"
    empty-text="没有匹配的市场"
    @select="callbacks.onSelectMarket"
    @locate="callbacks.onLocate"
  />
  <UiObjectTable
    v-else
    :columns="dealColumns"
    :rows="visibleDealRows"
    :selected-id="state.selectedDealId"
    empty-text="没有匹配的交易"
    @select="callbacks.onSelectDeal"
    @locate="callbacks.onLocate"
  />

  <p v-if="activeTotalRows > activeVisibleRows" class="economy-panel-limit">
    已显示 {{ formatNumber(activeVisibleRows) }} / {{ formatNumber(activeTotalRows) }}
  </p>

  <UiDetailGrid class-name="economy-panel-details" empty-text="未选中经济对象" :rows="detailRows" />

  <section v-if="debugEnabled" class="economy-panel-diagnostics" aria-label="经济开发诊断">
    <div class="economy-panel-diagnostics-header">
      <h3>开发诊断</h3>
      <span>{{ diagnosticsSummary }}</span>
    </div>
    <UiDetailGrid class-name="economy-panel-diagnostic-grid" empty-text="暂无诊断" :rows="diagnosticRows" />
    <p v-if="metrics.diagnostics.samples.length" class="economy-panel-diagnostic-samples">
      {{ metrics.diagnostics.samples.join("；") }}
    </p>
  </section>
</template>

<script setup>
import {computed, watch} from "vue";
import UiButton from "./base/UiButton.vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import UiSegmented from "./base/UiSegmented.vue";
import UiSortBar from "./base/UiSortBar.vue";
import {formatDistance, formatNumber as formatDisplayNumber} from "../../display-units.js";
import {findByObjectId} from "../../object-id.js";
import {useDebugMode} from "../composables/use-debug-mode.js";
import {useUnitPreferences} from "../composables/use-unit-preferences.js";

defineOptions({
  name: "EconomyPanel"
});

const props = defineProps({
  state: {
    type: Object,
    required: true
  },
  callbacks: {
    type: Object,
    default: () => ({})
  }
});
const callbacks = props.callbacks;
const unitPreferences = useUnitPreferences();
const debugEnabled = useDebugMode();
const ROW_LIMIT = 500;

const tabOptions = Object.freeze([
  {value: "goods", label: "商品"},
  {value: "markets", label: "市场"},
  {value: "deals", label: "交易"}
]);

const goodSortOptions = Object.freeze([
  {key: "stock", label: "库存"},
  {key: "tradeValue", label: "交易额"},
  {key: "deals", label: "交易"},
  {key: "value", label: "基价"},
  {key: "name", label: "名称"}
]);
const marketSortOptions = Object.freeze([
  {key: "tradeValue", label: "交易额"},
  {key: "stock", label: "库存"},
  {key: "cells", label: "覆盖"},
  {key: "burgs", label: "城镇"},
  {key: "name", label: "名称"}
]);
const dealSortOptions = Object.freeze([
  {key: "value", label: "金额"},
  {key: "units", label: "数量"},
  {key: "price", label: "单价"},
  {key: "distance", label: "距离"},
  {key: "routeLabel", label: "类型"}
]);

const goodColumns = Object.freeze([
  {key: "id", label: "ID", align: "right"},
  {key: "name", label: "商品"},
  {key: "typeLabel", label: "类型"},
  {key: "value", label: "基价", align: "right", format: value => formatNumber(value)},
  {key: "stock", label: "库存", align: "right", format: value => formatNumber(value)},
  {key: "deals", label: "交易", align: "right", format: value => formatNumber(value)},
  {key: "tradeValue", label: "交易额", align: "right", format: value => formatNumber(value)}
]);
const marketColumns = Object.freeze([
  {key: "id", label: "ID", align: "right"},
  {key: "name", label: "市场"},
  {key: "stateName", label: "国家"},
  {key: "cityName", label: "中心"},
  {key: "cells", label: "覆盖", align: "right", format: value => formatNumber(value)},
  {key: "stock", label: "库存", align: "right", format: value => formatNumber(value)},
  {key: "tradeValue", label: "交易额", align: "right", format: value => formatNumber(value)}
]);
const dealColumns = Object.freeze([
  {key: "id", label: "ID", align: "right"},
  {key: "goodName", label: "商品"},
  {key: "sellerName", label: "卖方"},
  {key: "buyerName", label: "买方"},
  {key: "routeLabel", label: "类型"},
  {key: "units", label: "数量", align: "right", format: value => formatNumber(value)},
  {key: "value", label: "金额", align: "right", format: value => formatNumber(value)}
]);

const metrics = computed(() => {
  props.state.version;
  return buildEconomyMetrics(props.state.map, {includeDiagnostics: debugEnabled.value});
});
const activeSortOptions = computed(() => {
  if (props.state.tab === "markets") return marketSortOptions;
  if (props.state.tab === "deals") return dealSortOptions;
  return goodSortOptions;
});
const filteredGoodRows = computed(() => sortRows(filterRows(metrics.value.goods, props.state.filter), props.state.sortKey, props.state.sortDir));
const filteredMarketRows = computed(() => sortRows(filterRows(metrics.value.markets, props.state.filter), props.state.sortKey, props.state.sortDir));
const filteredDealRows = computed(() => sortRows(filterRows(metrics.value.deals, props.state.filter), props.state.sortKey, props.state.sortDir));
const visibleGoodRows = computed(() => filteredGoodRows.value.slice(0, ROW_LIMIT));
const visibleMarketRows = computed(() => filteredMarketRows.value.slice(0, ROW_LIMIT));
const visibleDealRows = computed(() => filteredDealRows.value.slice(0, ROW_LIMIT));
const activeTotalRows = computed(() => {
  if (props.state.tab === "markets") return filteredMarketRows.value.length;
  if (props.state.tab === "deals") return filteredDealRows.value.length;
  return filteredGoodRows.value.length;
});
const activeVisibleRows = computed(() => {
  if (props.state.tab === "markets") return visibleMarketRows.value.length;
  if (props.state.tab === "deals") return visibleDealRows.value.length;
  return visibleGoodRows.value.length;
});
const selectedGood = computed(() => findByObjectId(metrics.value.goods, props.state.selectedGoodId) || metrics.value.goods[0] || null);
const selectedMarket = computed(() => findByObjectId(metrics.value.markets, props.state.selectedMarketId) || metrics.value.markets[0] || null);
const selectedDeal = computed(() => findByObjectId(metrics.value.deals, props.state.selectedDealId) || metrics.value.deals[0] || null);

const summaryMetrics = computed(() => [
  {label: "商品", value: formatNumber(metrics.value.summary.goods)},
  {label: "市场", value: formatNumber(metrics.value.summary.markets)},
  {label: "交易", value: formatNumber(metrics.value.summary.deals)},
  {label: "资源点", value: formatNumber(metrics.value.summary.resourceMarkers)},
  {label: "总库存", value: formatNumber(metrics.value.summary.stock)},
  {label: "交易额", value: formatNumber(metrics.value.summary.tradeValue)}
]);

const detailRows = computed(() => {
  if (props.state.tab === "markets") return selectedMarket.value ? [
    {label: "市场", value: selectedMarket.value.name},
    {label: "国家", value: selectedMarket.value.stateName},
    {label: "中心城镇", value: selectedMarket.value.cityName},
    {label: "覆盖 cells", value: formatNumber(selectedMarket.value.cells)},
    {label: "覆盖城镇", value: formatNumber(selectedMarket.value.burgs)},
    {label: "库存", value: formatNumber(selectedMarket.value.stock)},
    {label: "资源供给", value: formatNumber(selectedMarket.value.resourceSupply)},
    {label: "交易额", value: formatNumber(selectedMarket.value.tradeValue)},
    {label: "market id", value: selectedMarket.value.id, debug: true},
    {label: "center burg", value: selectedMarket.value.centerBurgId || "none", debug: true},
    {label: "cell", value: selectedMarket.value.cell ?? "none", debug: true}
  ] : [];
  if (props.state.tab === "deals") return selectedDeal.value ? [
    {label: "商品", value: selectedDeal.value.goodName},
    {label: "卖方", value: selectedDeal.value.sellerName},
    {label: "买方", value: selectedDeal.value.buyerName},
    {label: "类型", value: selectedDeal.value.routeLabel},
    {label: "来源", value: selectedDeal.value.sourceLabel},
    {label: "数量", value: formatNumber(selectedDeal.value.units)},
    {label: "单价", value: formatNumber(selectedDeal.value.price)},
    {label: "距离", value: selectedDeal.value.distanceLabel},
    {label: "税额", value: formatNumber(selectedDeal.value.tax)},
    {label: "deal id", value: selectedDeal.value.id, debug: true},
    {label: "seller", value: `${selectedDeal.value.sellerType} #${selectedDeal.value.sellerId}`, debug: true},
    {label: "buyer", value: `${selectedDeal.value.buyerType} #${selectedDeal.value.buyerId}`, debug: true},
    {label: "source", value: selectedDeal.value.source || "scheduled", debug: true}
  ] : [];
  return selectedGood.value ? [
    {label: "商品", value: selectedGood.value.name},
    {label: "类型", value: selectedGood.value.typeLabel},
    {label: "基价", value: formatNumber(selectedGood.value.value)},
    {label: "市场库存", value: formatNumber(selectedGood.value.stock)},
    {label: "资源 cells", value: formatNumber(selectedGood.value.sourceCells)},
    {label: "生产记录", value: formatNumber(selectedGood.value.production)},
    {label: "交易记录", value: formatNumber(selectedGood.value.deals)},
    {label: "交易额", value: formatNumber(selectedGood.value.tradeValue)},
    {label: "good id", value: selectedGood.value.id, debug: true},
    {label: "visible", value: selectedGood.value.visibleLabel, debug: true}
  ] : [];
});

const diagnosticRows = computed(() => [
  {label: "无市场城镇", value: formatNumber(metrics.value.diagnostics.burgsWithoutMarket)},
  {label: "缺中心市场", value: formatNumber(metrics.value.diagnostics.marketsWithoutCenter)},
  {label: "无覆盖市场", value: formatNumber(metrics.value.diagnostics.marketsWithoutCells)},
  {label: "无库存商品", value: formatNumber(metrics.value.diagnostics.goodsWithoutStock)},
  {label: "孤儿交易", value: formatNumber(metrics.value.diagnostics.invalidDeals)},
  {label: "无税交易", value: formatNumber(metrics.value.diagnostics.untaxedDeals)}
]);

const diagnosticsSummary = computed(() => {
  const total = metrics.value.diagnostics.totalIssues;
  return total ? `${formatNumber(total)} 项需复查` : "未发现明显异常";
});

watch(activeSortOptions, options => {
  if (options.some(option => option.key === props.state.sortKey)) return;
  callbacks.onSort?.(options[0]?.key || "id");
});

function buildEconomyMetrics(map, {includeDiagnostics = false} = {}) {
  const pack = map?.pack || {};
  const goods = (pack.goods || []).filter(good => good?.i);
  const markets = (pack.markets || []).filter(market => market?.i);
  const deals = (pack.deals || []).filter(deal => Number.isInteger(deal?.i));
  const aliveBurgs = includeDiagnostics ? (pack.burgs || []).filter(burg => burg?.i && !burg.removed) : [];
  const goodsById = new Map(goods.map(good => [good.i, good]));
  const marketsById = new Map(markets.map(market => [market.i, market]));
  const stockByGood = new Map();
  const marketStock = new Map();
  const marketResourceSupply = new Map();
  const marketCells = countByValue(pack.cells?.market || []);
  const marketBurgs = countBurgsByMarket(pack.burgs || []);
  const goodSourceCells = countByValue(pack.cells?.good || []);
  const goodProduction = countProductionByGood(pack.burgs || []);
  const goodDeals = new Map();
  const marketDeals = new Map();
  const bestMarketByGood = new Map();

  for (const market of markets) {
    let stock = 0;
    let resourceSupply = 0;
    for (const record of Object.values(market.goods || {})) {
      const goodId = Number(record.good || 0);
      const amount = Number(record.stock || 0);
      stock += amount;
      stockByGood.set(goodId, round((stockByGood.get(goodId) || 0) + amount));
      const best = bestMarketByGood.get(goodId);
      if (!best || amount > best.stock) bestMarketByGood.set(goodId, {market, stock: amount});
    }
    for (const value of Object.values(market.resourceSupply || {})) resourceSupply += Number(value || 0);
    marketStock.set(market.i, round(stock));
    marketResourceSupply.set(market.i, round(resourceSupply));
  }

  for (const deal of deals) {
    const value = dealValue(deal);
    goodDeals.set(deal.good, accumulateDeal(goodDeals.get(deal.good), value));
    for (const marketId of dealMarketIds(deal)) marketDeals.set(marketId, accumulateDeal(marketDeals.get(marketId), value));
  }

  const goodRows = goods.map(good => {
    const dealStats = goodDeals.get(good.i) || {count: 0, value: 0};
    const bestMarket = bestMarketByGood.get(good.i)?.market || null;
    return {
      id: good.i,
      name: good.name || `商品 #${good.i}`,
      typeLabel: goodTypeLabel(good),
      value: Number(good.value || 0),
      stock: stockByGood.get(good.i) || 0,
      sourceCells: goodSourceCells.get(good.i) || 0,
      production: goodProduction.get(good.i) || 0,
      deals: dealStats.count,
      tradeValue: round(dealStats.value),
      visibleLabel: good.visible === false ? "隐藏" : "显示",
      searchText: "",
      locateObject: cityLocateObject(bestMarket?.centerBurgId)
    };
  }).map(withSearchText);

  const marketRows = markets.map(market => {
    const state = pack.states?.[market.state];
    const city = pack.burgs?.[market.centerBurgId];
    const dealStats = marketDeals.get(market.i) || {count: 0, value: 0};
    return withSearchText({
      id: market.i,
      name: market.name || `市场 #${market.i}`,
      centerBurgId: market.centerBurgId || 0,
      cell: market.cell ?? null,
      stateName: state?.fullName || state?.name || "无",
      cityName: city?.name || `城镇 #${market.centerBurgId || 0}`,
      cells: marketCells.get(market.i) || 0,
      burgs: marketBurgs.get(market.i) || 0,
      stock: marketStock.get(market.i) || 0,
      resourceSupply: marketResourceSupply.get(market.i) || 0,
      deals: dealStats.count,
      tradeValue: round(dealStats.value),
      locateObject: cityLocateObject(market.centerBurgId)
    });
  });

  const invalidDealSamples = [];
  const dealRows = deals.map(deal => {
    const seller = partyInfo(pack, deal.sellerType, deal.seller, marketsById);
    const buyer = partyInfo(pack, deal.buyerType, deal.buyer, marketsById);
    const good = goodsById.get(deal.good);
    const distance = partyDistance(seller, buyer);
    const value = dealValue(deal);
    if (includeDiagnostics && (!good || !seller.valid || !buyer.valid) && invalidDealSamples.length < 5) {
      invalidDealSamples.push(`交易 #${deal.i}: ${good ? "" : "缺商品"}${seller.valid ? "" : " 缺卖方"}${buyer.valid ? "" : " 缺买方"}`.trim());
    }
    return withSearchText({
      id: deal.i,
      goodId: deal.good,
      goodValid: Boolean(good),
      goodName: good?.name || `商品 #${deal.good}`,
      sellerType: deal.sellerType,
      sellerId: deal.seller,
      sellerValid: seller.valid,
      sellerName: seller.name,
      buyerType: deal.buyerType,
      buyerId: deal.buyer,
      buyerValid: buyer.valid,
      buyerName: buyer.name,
      routeLabel: routeLabel(deal),
      source: deal.source || "scheduled",
      sourceLabel: sourceLabel(deal.source),
      units: Number(deal.units || 0),
      price: Number(deal.price || 0),
      value,
      tax: Number(deal.tax || 0),
      distance,
      distanceLabel: Number.isFinite(distance) ? formatDistance(distance, unitPreferences.value) : "未知",
      locateObject: seller.locateObject || buyer.locateObject
    });
  });

  const diagnostics = includeDiagnostics
    ? buildEconomyDiagnostics({
      goods: goodRows,
      markets: marketRows,
      deals: dealRows,
      aliveBurgs,
      marketsById,
      invalidDealSamples
    })
    : emptyDiagnostics();

  return {
    goods: goodRows,
    markets: marketRows,
    deals: dealRows,
    summary: {
      goods: goods.length,
      markets: markets.length,
      deals: deals.length,
      resourceMarkers: pack.markers?.filter(marker => marker?.category === "resource").length || map?.markers?.metadata?.resourceMarkers || 0,
      stock: round(sumRows(marketRows, "stock")),
      tradeValue: round(sumRows(dealRows, "value"))
    },
    diagnostics
  };
}

function emptyDiagnostics() {
  return {
    burgsWithoutMarket: 0,
    marketsWithoutCenter: 0,
    marketsWithoutCells: 0,
    goodsWithoutStock: 0,
    invalidDeals: 0,
    untaxedDeals: 0,
    totalIssues: 0,
    samples: []
  };
}

function buildEconomyDiagnostics({goods, markets, deals, aliveBurgs, marketsById, invalidDealSamples}) {
  const burgsWithoutMarket = aliveBurgs.filter(burg => !burg.market || !marketsById.has(burg.market)).length;
  const marketsWithoutCenter = markets.filter(market => !market.centerBurgId).length;
  const marketsWithoutCells = markets.filter(market => !market.cells).length;
  const goodsWithoutStock = goods.filter(good => good.stock <= 0).length;
  const invalidDeals = deals.filter(deal => !deal.goodValid || !deal.sellerValid || !deal.buyerValid).length;
  const untaxedDeals = deals.filter(deal => !deal.tax).length;
  const samples = [
    ...invalidDealSamples,
    ...markets.filter(market => !market.centerBurgId).slice(0, 3).map(market => `市场 #${market.id}: 缺中心城镇`),
    ...goods.filter(good => good.stock <= 0).slice(0, 3).map(good => `商品 #${good.id}: 无库存`)
  ].slice(0, 6);
  return {
    burgsWithoutMarket,
    marketsWithoutCenter,
    marketsWithoutCells,
    goodsWithoutStock,
    invalidDeals,
    untaxedDeals,
    totalIssues: burgsWithoutMarket + marketsWithoutCenter + marketsWithoutCells + goodsWithoutStock + invalidDeals,
    samples
  };
}

function exportCsv() {
  const rows = exportRows();
  if (!rows.length) return;
  const header = exportColumns().map(column => column.label);
  const body = rows.map(row => exportColumns().map(column => exportValue(row, column.key)));
  const text = [header, ...body].map(values => values.map(csvEscape).join(",")).join("\r\n");
  downloadText(`fmg-economy-${props.state.tab}-${safeFilePart(props.state.map?.metadata?.seed)}.csv`, text, "text/csv;charset=utf-8");
}

function exportJson() {
  const rows = exportRows();
  if (!rows.length) return;
  const payload = {
    type: "fmg-economy-summary",
    exportedAt: new Date().toISOString(),
    seed: props.state.map?.metadata?.seed || "",
    tab: props.state.tab,
    filter: props.state.filter || "",
    sortKey: props.state.sortKey,
    sortDir: props.state.sortDir,
    summary: metrics.value.summary,
    count: rows.length,
    rows: rows.map(row => exportColumns().reduce((record, column) => {
      record[column.key] = exportValue(row, column.key);
      return record;
    }, {}))
  };
  downloadText(`fmg-economy-${props.state.tab}-${safeFilePart(props.state.map?.metadata?.seed)}.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
}

function exportRows() {
  if (props.state.tab === "markets") return filteredMarketRows.value;
  if (props.state.tab === "deals") return filteredDealRows.value;
  return filteredGoodRows.value;
}

function exportColumns() {
  if (props.state.tab === "markets") return [
    {key: "id", label: "市场ID"},
    {key: "name", label: "市场"},
    {key: "stateName", label: "国家"},
    {key: "cityName", label: "中心城镇"},
    {key: "cells", label: "覆盖Cells"},
    {key: "burgs", label: "覆盖城镇"},
    {key: "stock", label: "库存"},
    {key: "resourceSupply", label: "资源供给"},
    {key: "deals", label: "交易数"},
    {key: "tradeValue", label: "交易额"}
  ];
  if (props.state.tab === "deals") return [
    {key: "id", label: "交易ID"},
    {key: "goodName", label: "商品"},
    {key: "sellerName", label: "卖方"},
    {key: "buyerName", label: "买方"},
    {key: "routeLabel", label: "类型"},
    {key: "sourceLabel", label: "来源"},
    {key: "units", label: "数量"},
    {key: "price", label: "单价"},
    {key: "value", label: "金额"},
    {key: "tax", label: "税额"},
    {key: "distance", label: "距离"}
  ];
  return [
    {key: "id", label: "商品ID"},
    {key: "name", label: "商品"},
    {key: "typeLabel", label: "类型"},
    {key: "value", label: "基价"},
    {key: "stock", label: "库存"},
    {key: "sourceCells", label: "资源Cells"},
    {key: "production", label: "生产记录"},
    {key: "deals", label: "交易记录"},
    {key: "tradeValue", label: "交易额"},
    {key: "visibleLabel", label: "可见"}
  ];
}

function exportValue(row, key) {
  const value = row?.[key];
  return typeof value === "number" ? round(value, 4) : value ?? "";
}

function sortRows(rows, key, direction) {
  const factor = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const aValue = a[key];
    const bValue = b[key];
    if (aValue === bValue) return Number(a.id || 0) - Number(b.id || 0);
    if (typeof aValue === "string" || typeof bValue === "string") return String(aValue || "").localeCompare(String(bValue || ""), "zh-CN") * factor;
    return (Number(aValue || 0) > Number(bValue || 0) ? 1 : -1) * factor;
  });
}

function filterRows(rows, filter) {
  const query = String(filter || "").trim().toLowerCase();
  if (!query) return rows;
  return rows.filter(row => row.searchText.includes(query) || String(row.id).includes(query));
}

function withSearchText(row) {
  return {
    ...row,
    searchText: Object.values(row)
      .filter(value => typeof value === "string" || typeof value === "number")
      .join(" ")
      .toLowerCase()
  };
}

function countByValue(values) {
  const counts = new Map();
  for (const value of values || []) {
    const id = Number(value || 0);
    if (!id) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return counts;
}

function countBurgsByMarket(burgs) {
  const counts = new Map();
  for (const burg of burgs || []) {
    if (!burg?.i || burg.removed || !burg.market) continue;
    counts.set(burg.market, (counts.get(burg.market) || 0) + 1);
  }
  return counts;
}

function countProductionByGood(burgs) {
  const counts = new Map();
  for (const burg of burgs || []) {
    if (!burg?.i || burg.removed) continue;
    for (const record of burg.production || []) {
      if (!record.goodId) continue;
      counts.set(record.goodId, (counts.get(record.goodId) || 0) + 1);
    }
  }
  return counts;
}

function dealMarketIds(deal) {
  const ids = [];
  if (deal.sellerType === "market") ids.push(deal.seller);
  if (deal.buyerType === "market") ids.push(deal.buyer);
  return ids.filter(id => Number.isInteger(id) && id > 0);
}

function accumulateDeal(current = {count: 0, value: 0}, value) {
  return {count: current.count + 1, value: round(current.value + value)};
}

function partyInfo(pack, type, id, marketsById) {
  if (type === "burg") {
    const burg = pack.burgs?.[id];
    return {
      name: burg?.name || `城镇 #${id}`,
      x: burg?.x,
      y: burg?.y,
      valid: Boolean(burg),
      locateObject: cityLocateObject(id)
    };
  }
  const market = marketsById.get(id);
  const city = pack.burgs?.[market?.centerBurgId];
  return {
    name: market?.name || `市场 #${id}`,
    x: market?.x ?? city?.x,
    y: market?.y ?? city?.y,
    valid: Boolean(market),
    locateObject: cityLocateObject(market?.centerBurgId)
  };
}

function partyDistance(a, b) {
  if (!Number.isFinite(a?.x) || !Number.isFinite(a?.y) || !Number.isFinite(b?.x) || !Number.isFinite(b?.y)) return null;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function cityLocateObject(cityId) {
  const id = Number(cityId || 0);
  return id > 0 ? {kind: "city", id} : null;
}

function dealValue(deal) {
  return round(Number(deal.units || 0) * Number(deal.price || 0));
}

function goodTypeLabel(good) {
  if (good.distribution && good.recipes?.length) return "复合";
  if (good.distribution) return "原料";
  if (good.recipes?.length) return "制品";
  return "商品";
}

function routeLabel(deal) {
  return `${partyTypeLabel(deal.sellerType)} -> ${partyTypeLabel(deal.buyerType)}`;
}

function partyTypeLabel(type) {
  return type === "market" ? "市场" : "城镇";
}

function sourceLabel(source) {
  return {
    scheduled: "计划交易",
    "market-resource": "市场资源",
    "marker-resource": "资源点"
  }[source] || source || "计划交易";
}

function sumRows(rows, key) {
  return rows.reduce((sum, row) => sum + Number(row[key] || 0), 0);
}

function formatNumber(value) {
  return formatDisplayNumber(value, unitPreferences.value);
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function safeFilePart(value) {
  return String(value || "map").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "map";
}

function downloadText(filename, text, type) {
  const blob = new Blob([text], {type});
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
</script>
