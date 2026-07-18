import assert from "node:assert/strict";
import {performance} from "node:perf_hooks";
import {readFile} from "node:fs/promises";
import {buildTradeQueryOptions, EMPTY_TRADE_QUERY, hasStructuredTradeQuery, normalizeTradeQuery, queryTradeDeals} from "../app/webgl-generator/src/ui/economy-trade-query.js";

const pack = createPack();
const all = queryTradeDeals(pack, {limit: Infinity});
assert.equal(all.total, 6);
assert.deepEqual(all.entries.map(entry => entry.deal.i), [6, 5, 4, 3, 2, 1], "默认金额排序错误");

assert.deepEqual(ids({stateId: 2}), [6, 5, 4]);
assert.deepEqual(ids({provinceId: 2}), [5, 4, 3, 2]);
assert.deepEqual(ids({marketId: 2}), [6, 5, 4, 3, 2]);
assert.deepEqual(ids({goodId: 2}), [5, 3, 1]);
assert.deepEqual(ids({seller: "北港"}), [5, 4, 3, 2]);
assert.deepEqual(ids({buyer: "burg:3"}), [6, 5, 4]);
assert.deepEqual(ids({stateId: 1, provinceId: 2, marketId: 2, goodId: 2, seller: "北港", buyer: "河城"}), [5]);

const textCombined = queryTradeDeals(pack, {query: {marketId: 2}, text: "矿石 南国", limit: Infinity});
assert.deepEqual(textCombined.entries.map(entry => entry.deal.i), [5]);

const limited = queryTradeDeals(pack, {query: {stateId: 1}, limit: 2, selectedDealId: 1});
assert.equal(limited.total, 6);
assert.deepEqual(limited.entries.map(entry => entry.deal.i), [6, 5, 1], "限量结果没有保留当前已选交易");
const exported = queryTradeDeals(pack, {query: {stateId: 1}, limit: Infinity});
assert.deepEqual(exported.entries.slice(0, 2).map(entry => entry.deal.i), limited.entries.slice(0, 2).map(entry => entry.deal.i), "导出与面板结果集排序不一致");

assert.equal(hasStructuredTradeQuery(EMPTY_TRADE_QUERY), false);
assert.equal(hasStructuredTradeQuery({seller: "北港"}), true);
assert.deepEqual(normalizeTradeQuery({stateId: "1", seller: " 北港 "}), {stateId: 1, provinceId: 0, marketId: 0, goodId: 0, seller: "北港", buyer: ""});
const options = buildTradeQueryOptions(pack);
assert.equal(options.states[0].value, "");
assert.equal(options.provinces.length, 4);
assert.equal(options.markets.length, 3);
assert.equal(options.goods.length, 3);

const largePack = createLargePack(50000);
const openedAt = performance.now();
const opened = queryTradeDeals(largePack, {limit: 120, sortKey: "value", sortDir: "desc"});
const openMs = performance.now() - openedAt;
assert.equal(opened.total, 50000);
assert(openMs < 250, `5 万交易打开查询耗时 ${openMs.toFixed(2)}ms，不满足 250ms 门禁`);
const filteredAt = performance.now();
const filtered = queryTradeDeals(largePack, {query: {stateId: 2, provinceId: 2, marketId: 2, goodId: 2, seller: "北港", buyer: "河城"}, limit: 120});
const filterMs = performance.now() - filteredAt;
assert(filtered.total > 0);
assert(filterMs < 250, `5 万交易组合筛选耗时 ${filterMs.toFixed(2)}ms，不满足 250ms 门禁`);

const [vueSource, panelSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/EconomyPanel.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/panels/economy-panel.js", import.meta.url), "utf8")
]);
for (const field of ["stateId", "provinceId", "marketId", "goodId", "seller", "buyer"]) assert(vueSource.includes(`tradeQuery.${field}`), `面板缺少 ${field} 结构化条件`);
assert(vueSource.includes("dealQuery: tradeQuery") && vueSource.includes("tradeQuery: {...tradeQuery}"), "列表与 JSON 导出没有共用结构化条件");
assert(vueSource.includes("清空全部筛选") && vueSource.includes('callbacks.onFilter?.("")'), "清空操作没有同时清除组合条件与自由文本");
assert(vueSource.includes("buildDealLocateTargets") && vueSource.includes('politicalLocateObject("state"') && vueSource.includes('politicalLocateObject("province"'), "关联定位缺少国家或行政区域对象");
assert(panelSource.includes("onLocateAssociation: object => callbacks.onLocate?.(object)"), "关联定位没有复用 selection / object details 路径");

console.log(JSON.stringify({
  ok: true,
  filters: {all: all.total, combined: ids({stateId: 1, provinceId: 2, marketId: 2, goodId: 2, seller: "北港", buyer: "河城"})},
  limit: {total: limited.total, rows: limited.entries.map(entry => entry.deal.i)},
  performance: {deals: largePack.deals.length, openMs: round(openMs), filterMs: round(filterMs), filtered: filtered.total}
}, null, 2));

function ids(query) {
  return queryTradeDeals(pack, {query, limit: Infinity}).entries.map(entry => entry.deal.i);
}

function createPack() {
  const cells = {province: new Uint16Array([0, 1, 2, 3])};
  const states = [null, {i: 1, name: "北国"}, {i: 2, name: "南国"}];
  const provinces = [null, {i: 1, name: "北原"}, {i: 2, name: "北港"}, {i: 3, name: "南岭"}];
  const burgs = [null,
    {i: 1, name: "山城", state: 1, cell: 1, market: 1, x: 10, y: 10},
    {i: 2, name: "北港", state: 1, cell: 2, market: 2, x: 20, y: 20},
    {i: 3, name: "河城", state: 2, cell: 3, market: 2, x: 30, y: 30}
  ];
  const markets = [null,
    {i: 1, id: 1, name: "山城市", state: 1, centerBurgId: 1, x: 10, y: 10},
    {i: 2, id: 2, name: "北港市", state: 1, centerBurgId: 2, x: 20, y: 20}
  ];
  const goods = [null, {i: 1, name: "粮食"}, {i: 2, name: "矿石"}];
  const deals = [
    deal(1, 2, "burg", 1, "market", 1, 1),
    deal(2, 1, "burg", 2, "market", 2, 2),
    deal(3, 2, "market", 2, "burg", 2, 3),
    deal(4, 1, "market", 2, "burg", 3, 4),
    deal(5, 2, "burg", 2, "burg", 3, 5),
    deal(6, 1, "burg", 1, "burg", 3, 6)
  ];
  return {cells, states, provinces, burgs, markets, goods, deals};
}

function createLargePack(count) {
  const source = createPack();
  source.deals = Array.from({length: count}, (_, index) => {
    const template = sourceTemplate(index);
    return deal(index + 1, template.good, template.sellerType, template.seller, template.buyerType, template.buyer, (index % 97) + 1);
  });
  return source;
}

function sourceTemplate(index) {
  return [
    {good: 1, sellerType: "burg", seller: 1, buyerType: "market", buyer: 1},
    {good: 2, sellerType: "burg", seller: 2, buyerType: "burg", buyer: 3},
    {good: 2, sellerType: "market", seller: 2, buyerType: "burg", buyer: 2},
    {good: 1, sellerType: "market", seller: 2, buyerType: "burg", buyer: 3}
  ][index % 4];
}

function deal(i, good, sellerType, seller, buyerType, buyer, units) {
  return {i, good, sellerType, seller, buyerType, buyer, units, price: i + 1, distance: i * 2, distanceCost: i / 10, source: i % 2 ? "scheduled" : "market-resource"};
}

function round(value) {
  return Math.round(value * 100) / 100;
}
