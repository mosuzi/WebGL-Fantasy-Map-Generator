<template>
  <UiMetricGrid :metrics="summaryMetrics" class-name="economy-panel-summary" />

  <div class="economy-panel-controls">
    <UiSegmented label="经济范围" :options="tabOptions" :model-value="state.tab" @select="callbacks.onTab" />
    <UiFilterInput :model-value="state.filter" placeholder="筛选商品 / 市场 / 城镇 / 国家 / 来源" @update:model-value="callbacks.onFilter" />
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
</template>

<script setup>
import {computed, watch} from "vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import UiSegmented from "./base/UiSegmented.vue";
import UiSortBar from "./base/UiSortBar.vue";
import {formatDistance, formatNumber as formatDisplayNumber} from "../../display-units.js";
import {findByObjectId} from "../../object-id.js";
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
  return buildEconomyMetrics(props.state.map);
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
    {label: "交易额", value: formatNumber(selectedMarket.value.tradeValue)}
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
    {label: "税额", value: formatNumber(selectedDeal.value.tax)}
  ] : [];
  return selectedGood.value ? [
    {label: "商品", value: selectedGood.value.name},
    {label: "类型", value: selectedGood.value.typeLabel},
    {label: "基价", value: formatNumber(selectedGood.value.value)},
    {label: "市场库存", value: formatNumber(selectedGood.value.stock)},
    {label: "资源 cells", value: formatNumber(selectedGood.value.sourceCells)},
    {label: "生产记录", value: formatNumber(selectedGood.value.production)},
    {label: "交易记录", value: formatNumber(selectedGood.value.deals)},
    {label: "交易额", value: formatNumber(selectedGood.value.tradeValue)}
  ] : [];
});

watch(activeSortOptions, options => {
  if (options.some(option => option.key === props.state.sortKey)) return;
  callbacks.onSort?.(options[0]?.key || "id");
});

function buildEconomyMetrics(map) {
  const pack = map?.pack || {};
  const goods = (pack.goods || []).filter(good => good?.i);
  const markets = (pack.markets || []).filter(market => market?.i);
  const deals = (pack.deals || []).filter(deal => Number.isInteger(deal?.i));
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

  const dealRows = deals.map(deal => {
    const seller = partyInfo(pack, deal.sellerType, deal.seller, marketsById);
    const buyer = partyInfo(pack, deal.buyerType, deal.buyer, marketsById);
    const distance = partyDistance(seller, buyer);
    const value = dealValue(deal);
    return withSearchText({
      id: deal.i,
      goodName: goodsById.get(deal.good)?.name || `商品 #${deal.good}`,
      sellerName: seller.name,
      buyerName: buyer.name,
      routeLabel: routeLabel(deal),
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
    }
  };
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
      locateObject: cityLocateObject(id)
    };
  }
  const market = marketsById.get(id);
  const city = pack.burgs?.[market?.centerBurgId];
  return {
    name: market?.name || `市场 #${id}`,
    x: market?.x ?? city?.x,
    y: market?.y ?? city?.y,
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
</script>
