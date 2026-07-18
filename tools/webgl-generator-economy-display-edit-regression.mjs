import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {
  defaultGoodDisplayProperties,
  defaultMarketDisplayProperties,
  normalizeGoodDisplayProperties,
  normalizeMarketDisplayProperties
} from "../app/webgl-generator/src/generator/economy-display-properties.js";
import {createSetGoodDisplayCommand, createSetMarketDisplayCommand} from "../app/webgl-generator/src/runtime/economy-edit-commands.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {createMapDocument, parseMapDocument, stringifyMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {API_METHODS} from "../app/webgl-generator/src/runtime/api-contract.js";

const map = generatePlaceholderMap({seed: "economy-display-edit", cellsTarget: 1000, heightmapTemplate: "continents"});
const good = map.pack.goods.find(item => item?.i);
const market = map.pack.markets.find(item => item?.i);
assert(good && market, "固定样本缺少商品或市场");
assert.deepEqual(normalizeGoodDisplayProperties(good), defaultGoodDisplayProperties(good));
assert.deepEqual(normalizeMarketDisplayProperties(market), defaultMarketDisplayProperties(market));

const numericBefore = economyNumericChecksum(map);
const history = new EditHistory();
const goodBefore = normalizeGoodDisplayProperties(good);
history.execute(createSetGoodDisplayCommand(good.i, {
  visible: false,
  color: "#123456",
  icon: "✹",
  label: "回归商品标签"
}), {map});
assert.equal(history.getStats().undo, 1, "商品单次保存没有只写一条历史");
assert.deepEqual(normalizeGoodDisplayProperties(map.pack.goods[good.i]), {
  visible: false,
  color: "#123456",
  icon: "✹",
  label: "回归商品标签"
});
assert.deepEqual(normalizeGoodDisplayProperties(map.economy.goods[good.i]), normalizeGoodDisplayProperties(map.pack.goods[good.i]));
assert.equal(economyNumericChecksum(map), numericBefore, "商品展示编辑改变了经济数值");
history.undo({map});
assert.deepEqual(normalizeGoodDisplayProperties(map.pack.goods[good.i]), goodBefore);
history.redo({map});
assert.equal(map.pack.goods[good.i].label, "回归商品标签");

const marketBefore = normalizeMarketDisplayProperties(market);
history.execute(createSetMarketDisplayCommand(market.i, {name: "回归市场", color: "#abcdef"}), {map});
assert.equal(history.getStats().undo, 2, "市场单次保存没有只增加一条历史");
assert.deepEqual(normalizeMarketDisplayProperties(map.pack.markets[market.i]), {name: "回归市场", color: "#abcdef"});
assert.deepEqual(normalizeMarketDisplayProperties(map.economy.markets[market.i]), normalizeMarketDisplayProperties(map.pack.markets[market.i]));
assert.equal(economyNumericChecksum(map), numericBefore, "市场展示编辑改变了经济数值");
history.undo({map});
assert.deepEqual(normalizeMarketDisplayProperties(map.pack.markets[market.i]), marketBefore);
history.redo({map});
assert.equal(map.pack.markets[market.i].name, "回归市场");

const roundtrip = parseMapDocument(stringifyMapDocument(createMapDocument(map, map.options))).map;
assert.deepEqual(normalizeGoodDisplayProperties(roundtrip.pack.goods[good.i]), normalizeGoodDisplayProperties(map.pack.goods[good.i]));
assert.deepEqual(normalizeMarketDisplayProperties(roundtrip.pack.markets[market.i]), normalizeMarketDisplayProperties(map.pack.markets[market.i]));
assert.equal(economyNumericChecksum(roundtrip), numericBefore);

const oldDocument = createMapDocument(generatePlaceholderMap({seed: "economy-display-old-map", cellsTarget: 1000}), {});
const oldGood = oldDocument.map.pack.goods.find(item => item?.i);
const oldMarket = oldDocument.map.pack.markets.find(item => item?.i);
for (const item of [oldGood, oldDocument.map.economy.goods[oldGood.i]]) {
  delete item.color;
  delete item.icon;
  delete item.label;
  delete item.visible;
}
for (const item of [oldMarket, oldDocument.map.economy.markets[oldMarket.i]]) delete item.color;
const oldImported = parseMapDocument(stringifyMapDocument(oldDocument)).map;
assert.deepEqual(normalizeGoodDisplayProperties(oldImported.pack.goods[oldGood.i]), defaultGoodDisplayProperties(oldGood));
assert.deepEqual(normalizeMarketDisplayProperties(oldImported.pack.markets[oldMarket.i]), defaultMarketDisplayProperties(oldMarket));

assert(API_METHODS.edit.includes("economy.setGoodDisplay"));
assert(API_METHODS.edit.includes("economy.setMarketDisplay"));
const economyPanelControllerSource = readFileSync(new URL("../app/webgl-generator/src/ui/panels/economy-panel.js", import.meta.url), "utf8");
assert.match(economyPanelControllerSource, /onGoodDisplayApply:\s*\(goodId, patch\)\s*=>/);
assert.match(economyPanelControllerSource, /callbacks\.onGoodDisplayApply\?\.\(goodId, patch\)/);
assert.match(economyPanelControllerSource, /onMarketDisplayApply:\s*\(marketId, patch\)\s*=>/);
assert.match(economyPanelControllerSource, /callbacks\.onMarketDisplayApply\?\.\(marketId, patch\)/);
assert.match(economyPanelControllerSource, /panelState\.version\+\+/);
assert.throws(() => createSetGoodDisplayCommand(good.i, {color: "invalid"}).isNoop({map}), /商品颜色/);
assert.throws(() => createSetMarketDisplayCommand(market.i, {name: "   "}).isNoop({map}), /市场名称/);

console.log(JSON.stringify({
  good: normalizeGoodDisplayProperties(map.pack.goods[good.i]),
  market: normalizeMarketDisplayProperties(map.pack.markets[market.i]),
  history: history.getStats(),
  oldMapDefaults: {
    good: normalizeGoodDisplayProperties(oldImported.pack.goods[oldGood.i]),
    market: normalizeMarketDisplayProperties(oldImported.pack.markets[oldMarket.i])
  },
  numericChecksumBytes: numericBefore.length
}, null, 2));

function economyNumericChecksum(source) {
  const goods = (source.pack?.goods || []).filter(Boolean).map(item => ({
    i: item.i,
    value: item.value ?? null,
    distribution: item.distribution ?? null,
    recipes: item.recipes ?? null,
    demandCoverage: item.demandCoverage ?? null
  }));
  const markets = (source.pack?.markets || []).filter(Boolean).map(item => ({
    i: item.i,
    centerBurgId: item.centerBurgId,
    cell: item.cell,
    state: item.state,
    goods: item.goods,
    demandSummary: item.demandSummary,
    priceSummary: item.priceSummary
  }));
  return JSON.stringify({goods, markets, deals: source.pack?.deals || [], cellsMarket: [...(source.pack?.cells?.market || [])]});
}
