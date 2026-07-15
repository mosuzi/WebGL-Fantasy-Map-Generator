#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {applyMarketAssignmentPreview, buildMarketAssignmentChanges, createApplyMarketAssignmentCommand, inspectMarketAssignment, restoreMarketAssignmentPreview} from "../app/webgl-generator/src/runtime/economy-edit-commands.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {createMapDocument, parseMapDocument, stringifyMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";

const map = generatePlaceholderMap({seed: "market-assignment-regression", cellsTarget: 3000, heightmapTemplate: "continents"});
const target = findCrossStateBurgTarget(map);
assert(target, "固定 seed 应存在可跨国改派的市场城市");

const previewChanges = buildMarketAssignmentChanges(map, target.marketId, [target.packCell]);
const beforePreview = economySnapshot(map);
applyMarketAssignmentPreview(map, previewChanges);
assert.equal(map.pack.cells.market[target.packCell], target.marketId, "预览应写入工作中的 pack.cells.market");
restoreMarketAssignmentPreview(map, previewChanges);
assert.deepEqual(economySnapshot(map), beforePreview, "取消预览不得改变任何经济数据");

const preflight = inspectMarketAssignment(map, previewChanges);
assert.equal(preflight.valid, true);
assert.equal(preflight.crossStateCells, 1, "跨国覆盖必须在应用前明确报告");
assert.equal(preflight.requiresWarning, true);

const waterCell = map.pack.cells.i.find(cell => (map.pack.cells.h[cell] || 0) < 20);
assert(Number.isInteger(waterCell));
const waterPreview = inspectMarketAssignment(map, [{packCell: waterCell, before: map.pack.cells.market[waterCell] || 0, after: target.marketId}]);
assert.equal(waterPreview.valid, false, "水域市场归属必须拒绝");
assert.equal(waterPreview.waterCells, 1);

const diplomacyBefore = structuredClone(map.diplomacy);
const militaryBefore = structuredClone(map.military);
const before = economySnapshot(map);
const history = new EditHistory();
const command = createApplyMarketAssignmentCommand(previewChanges);
history.execute(command, {map});
assert.equal(history.getStats().undo, 1, "市场归属应用只能形成一条历史");
assert.equal(map.pack.cells.market[target.packCell], target.marketId);
assert.equal(map.pack.burgs[target.burgId].market, target.marketId, "burg market 必须按 cell 归属重算");
assert(map.pack.burgs[target.burgId].production?.length > 0, "生产记录必须重算");
assert(map.pack.deals.length > 0, "交易必须重算");
assert(map.pack.markets.some(market => market?.priceSummary), "价格压力摘要必须重算");
assert(map.pack.states.some(state => state?.i && Number.isFinite(state.treasury)), "国家财政必须重算");
assert.equal(map.economy.metadata.deals, map.pack.deals.length, "经济摘要与交易列表必须一致");
assert.deepEqual(map.diplomacy, diplomacyBefore, "市场归属编辑不得驱动外交重生成");
assert.deepEqual(map.military, militaryBefore, "市场归属编辑不得驱动军事重生成");
const after = economySnapshot(map);
assert.notDeepEqual(after, before, "有效市场归属应用必须改变经济链");

const roundTripMap = parseMapDocument(stringifyMapDocument(createMapDocument(map, map.options))).map;
assert.deepEqual(Array.from(roundTripMap.pack.cells.market), Array.from(map.pack.cells.market), "完整地图 JSON 必须保留市场 cell 归属");
assert.deepEqual(roundTripMap.pack.deals, map.pack.deals, "完整地图 JSON 必须保留重算后的交易");
assert.deepEqual(roundTripMap.economy, JSON.parse(JSON.stringify(map.economy)), "完整地图 JSON 必须保留重算后的经济摘要");

history.undo({map});
assert.deepEqual(economySnapshot(map), before, "撤销必须完整恢复归属、生产、交易、价格与财政");
history.redo({map});
assert.deepEqual(economySnapshot(map), after, "重做必须恢复相同经济结果");

const appSource = readFileSync(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8");
const panelSource = readFileSync(new URL("../app/webgl-generator/src/ui/vue/components/EconomyPanel.vue", import.meta.url), "utf8");
const consoleSource = readFileSync(new URL("../app/webgl-generator/src/runtime/console-api.js", import.meta.url), "utf8");
const rendererSource = readFileSync(new URL("../app/webgl-generator/src/renderer/placeholder-renderer.js", import.meta.url), "utf8");
assert.match(appSource, /MARKET_ASSIGN[\s\S]*applyPendingMarketAssignment[\s\S]*createApplyMarketAssignmentCommand/, "市场 UI 未共用市场归属命令");
assert.match(panelSource, /市场归属预览[\s\S]*应用并重算[\s\S]*取消预览/, "经济面板缺少预览、应用或取消入口");
assert.match(panelSource, /function exportCsv[\s\S]*function exportJson[\s\S]*function exportRows\(\)[\s\S]*buildEconomyMetrics/, "经济 CSV/JSON 导出未读取当前重算结果");
assert.match(rendererSource, /function topTradeFlowDeals\(map\)[\s\S]*map\?\.pack\?\.deals/, "静态贸易流数据未读取重算后的 pack.deals");
assert.match(consoleSource, /economy\.inspectAssignment[\s\S]*economy\.assignCells[\s\S]*economy\.rebuild/, "控制台 API 缺少市场预检、应用或经济重算");

console.log(JSON.stringify({
  ok: true,
  target,
  preflight,
  history: history.getStats(),
  economy: {
    markets: map.economy.metadata.markets,
    deals: map.economy.metadata.deals,
    assignedMarketCells: map.economy.metadata.assignedMarketCells,
    burgsWithMarket: map.economy.metadata.burgsWithMarket,
    statesWithTaxes: map.economy.metadata.statesWithTaxes
  },
  sync: {mapJson: true, panelCsvJson: true, staticTradeFlowData: true},
  isolated: {diplomacy: true, military: true}
}, null, 2));

function findCrossStateBurgTarget(map) {
  const markets = (map.pack.markets || []).filter(Boolean);
  for (const burg of map.pack.burgs || []) {
    if (!burg?.i || burg.removed || !Number.isInteger(burg.cell)) continue;
    if ((map.pack.cells.h[burg.cell] || 0) < 20 || !(burg.state > 0)) continue;
    const targetMarket = markets.find(market => market.i !== burg.market && market.state > 0 && market.state !== burg.state);
    if (targetMarket) return {burgId: burg.i, packCell: burg.cell, beforeMarketId: burg.market, marketId: targetMarket.i, burgState: burg.state, marketState: targetMarket.state};
  }
  return null;
}

function economySnapshot(map) {
  return {
    marketCells: Array.from(map.pack.cells.market || []),
    markets: structuredClone(map.pack.markets || []),
    deals: structuredClone(map.pack.deals || []),
    burgs: (map.pack.burgs || []).map(burg => burg ? {
      market: burg.market,
      plaza: burg.plaza,
      production: structuredClone(burg.production || []),
      product: burg.product,
      treasury: burg.treasury
    } : null),
    states: (map.pack.states || []).map(state => state ? pickEconomyFields(state) : null),
    provinces: (map.pack.provinces || []).map(province => province ? pickEconomyFields(province) : null),
    economy: structuredClone(map.economy || null)
  };
}

function pickEconomyFields(item) {
  return Object.fromEntries([
    "salesTax", "pollTax", "treasury", "resourcePower", "economicPower", "governmentEconomicModifier",
    "governmentTradeModifier", "populationPower", "territoryPower", "settlementPower", "powerScore", "militarySupply"
  ].map(key => [key, structuredClone(item[key])]))
}
