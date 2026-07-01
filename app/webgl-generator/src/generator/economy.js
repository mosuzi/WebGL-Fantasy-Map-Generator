import {createRandom} from "./random.js";

const RAW_GOODS = [
  "稻米",
  "小麦",
  "大麦",
  "玉米",
  "豆类",
  "薯根",
  "茶叶",
  "药草",
  "棉花",
  "亚麻",
  "羊毛",
  "丝茧",
  "木材",
  "树脂",
  "水果",
  "葡萄",
  "香料",
  "盐",
  "鱼",
  "贝货",
  "牲畜",
  "马匹",
  "皮革",
  "蜂蜜",
  "陶土",
  "石料",
  "石灰",
  "煤",
  "铁矿",
  "铜矿",
  "锡矿",
  "银矿",
  "金砂",
  "宝石",
  "硫磺",
  "硝石",
  "琥珀",
  "鲸油",
  "染料"
];

const MANUFACTURED_GOODS = [
  "面粉",
  "啤酒",
  "葡萄酒",
  "茶砖",
  "糖浆",
  "腌鱼",
  "奶酪",
  "布匹",
  "丝绸",
  "皮具",
  "纸张",
  "木器",
  "陶器",
  "玻璃",
  "石雕",
  "铁器",
  "铜器",
  "青铜器",
  "工具",
  "兵甲",
  "船具",
  "马具",
  "珠饰",
  "香膏",
  "药剂",
  "火药",
  "染布",
  "书册",
  "钱币",
  "仪器"
];

const HYBRID_GOODS = ["香木", "药酒"];
const RAW_GOOD_VALUES = [
  1, 2, 6, 3, 4, 4, 8, 15, 1, 2, 1, 2, 2, 2, 2, 2, 2, 5, 7, 5, 1, 13, 15, 5, 10, 9, 15, 7, 4, 2, 8, 3, 2,
  3, 3, 7, 1, 4, 5
];

export function buildEconomy(pack, options = {}) {
  const random = createRandom(`${options.seed}:economy`);
  const goods = createGoods();
  const rawGoods = goods.filter(good => good?.distribution);
  const manufacturedGoods = goods.filter(good => good?.recipes?.length);
  const aliveBurgs = (pack.burgs || []).filter(burg => burg?.i && !burg.removed);
  const states = (pack.states || []).filter(state => state?.i && !state.removed);

  pack.goods = [null, ...goods];
  pack.cells.good = assignResourceGoods(pack, rawGoods, random);
  const resourcePopulation = applyResourcePopulationBonus(pack);
  syncPoliticalPopulationStats(pack);
  pack.markets = createMarkets(pack, aliveBurgs, goods, random, options);
  pack.cells.market = assignMarketsToCells(pack, pack.markets);
  assignMarketsToBurgs(pack, aliveBurgs, pack.markets);
  initializeTaxRates(states, random);
  const deals = createProductionAndDeals(pack, aliveBurgs, goods, rawGoods, manufacturedGoods, states, random, options);
  pack.deals = deals;
  collectStateTreasuries(states, deals, pack.markets, pack);
  const markerEconomy = applyMarkerEconomicPower(pack);

  const metadata = {
    goods: goods.length,
    rawGoods: goods.filter(good => good.distribution && !good.recipes?.length).length,
    manufacturedGoods: goods.filter(good => !good.distribution && good.recipes?.length).length,
    hybridGoods: goods.filter(good => good.distribution && good.recipes?.length).length,
    resourceCells: countPositive(pack.cells.good),
    resourcePopulation,
    markets: Math.max(0, pack.markets.length - 1),
    assignedMarketCells: countPositive(pack.cells.market),
    burgsWithMarket: aliveBurgs.filter(burg => burg.market > 0).length,
    burgsWithProduction: aliveBurgs.filter(burg => burg.production?.length).length,
    deals: deals.length,
    statesWithTaxes: states.filter(state => Number.isFinite(state.salesTax) && Number.isFinite(state.pollTax)).length,
    markerEconomy
  };

  return {goods: pack.goods, markets: pack.markets, deals: pack.deals, metadata};
}

function createGoods() {
  const goods = [];
  for (const name of RAW_GOODS) {
    const id = goods.length + 1;
    goods.push({
      i: id,
      name,
      visible: true,
      value: RAW_GOOD_VALUES[id - 1] || 2,
      distribution: createDistribution(id),
      biomeOutput: id <= 16 ? createBiomeOutput(id) : undefined,
      demandCoverage: id <= 58 ? createDemandCoverage(id) : undefined
    });
  }

  for (const name of MANUFACTURED_GOODS) {
    const id = goods.length + 1;
    goods.push({
      i: id,
      name,
      visible: true,
      recipes: [createRecipe(id)],
      demandCoverage: id <= 58 ? createDemandCoverage(id) : undefined
    });
  }

  for (const name of HYBRID_GOODS) {
    const id = goods.length + 1;
    goods.push({
      i: id,
      name,
      visible: true,
      value: 4 + (id % 5),
      distribution: createDistribution(id),
      recipes: [createRecipe(id)],
      demandCoverage: id <= 58 ? createDemandCoverage(id) : undefined
    });
  }

  return goods;
}

function applyResourcePopulationBonus(pack) {
  const {cells} = pack;
  if (!cells.good || !cells.s || !cells.pop) return {cells: 0, total: 0};
  const meanArea = average(Array.from(cells.area || [])) || 1;
  let affected = 0;
  let total = 0;

  for (const cell of cells.i) {
    if ((cells.h[cell] || 0) < 20) continue;
    if (!(cells.good[cell] || (cells.c?.[cell] || []).some(neighbor => cells.good[neighbor]))) continue;
    const cellRes = getResourceValue(pack, cell);
    const neighborRes = average((cells.c?.[cell] || []).map(neighbor => getResourceValue(pack, neighbor)));
    const bonus = (cellRes ? cellRes + 10 : 0) + neighborRes;
    if (bonus <= 0) continue;
    cells.s[cell] += bonus;
    cells.pop[cell] = cells.s[cell] > 0 ? (cells.s[cell] * cells.area[cell]) / meanArea : 0;
    affected++;
    total += bonus;
  }

  return {cells: affected, total: round(total)};
}

function getResourceValue(pack, cell) {
  const good = pack.cells.good?.[cell];
  return good ? Number(pack.goods?.[good]?.value || 0) : 0;
}

function syncPoliticalPopulationStats(pack) {
  syncGroupPopulationStats(pack, pack.states || [], "state");
  syncGroupPopulationStats(pack, pack.provinces || [], "province");
}

function syncGroupPopulationStats(pack, groups, field) {
  for (const group of groups || []) {
    if (!group) continue;
    group.rural = 0;
    group.urban = 0;
    group.burgs = 0;
  }

  for (const cell of pack.cells.i) {
    if ((pack.cells.h[cell] || 0) < 20) continue;
    const group = groups?.[pack.cells[field]?.[cell]];
    if (!group) continue;
    group.rural += pack.cells.pop?.[cell] || 0;
    const burg = pack.burgs?.[pack.cells.burg?.[cell]];
    if (burg?.i && !burg.removed) {
      group.burgs++;
      group.urban += burg.population || 0;
    }
  }

  for (const group of groups || []) {
    if (!group) continue;
    group.rural = round(group.rural || 0, 2);
    group.urban = round(group.urban || 0, 2);
  }
}

function createDistribution(id) {
  return {
    temperature: (id % 5) - 2,
    precipitation: (id % 7) - 3,
    highland: id % 6 === 0,
    coastal: id % 9 === 0
  };
}

function createBiomeOutput(id) {
  return {
    [1 + (id % 12)]: round(0.8 + (id % 5) * 0.12),
    [1 + ((id + 4) % 12)]: round(0.45 + (id % 3) * 0.1)
  };
}

function createDemandCoverage(id) {
  return {
    urban: round(0.5 + (id % 6) * 0.08),
    rural: round(0.35 + (id % 5) * 0.06)
  };
}

function createRecipe(id) {
  const first = 1 + (id % RAW_GOODS.length);
  const second = 1 + ((id + 11) % RAW_GOODS.length);
  return {[first]: 1, [second]: 0.5};
}

function assignResourceGoods(pack, rawGoods, random) {
  const {cells} = pack;
  const resource = new Uint16Array(cells.i.length);
  const candidates = [];
  for (const cell of cells.i) {
    if ((cells.h[cell] || 0) < 20) continue;
    const suitability = cells.s?.[cell] || 0;
    const population = cells.pop?.[cell] || 0;
    const river = cells.r?.[cell] ? 18 : 0;
    const coast = cells.harbor?.[cell] ? 14 : 0;
    const highland = Math.max(0, (cells.h[cell] || 0) - 50) * 0.45;
    const jitter = random.range(0, 12);
    candidates.push({cell, score: suitability + population * 0.3 + river + coast + highland + jitter});
  }

  candidates.sort((a, b) => b.score - a.score || a.cell - b.cell);
  const target = Math.min(candidates.length, Math.max(0, Math.round(cells.i.length * 0.18)));
  for (let index = 0; index < target; index++) {
    const cell = candidates[index].cell;
    resource[cell] = selectRawGoodId(pack, cell, rawGoods);
  }
  return resource;
}

function selectRawGoodId(pack, cell, rawGoods) {
  const {cells} = pack;
  if (cells.harbor?.[cell]) return 19;
  if (cells.r?.[cell]) return 1 + (cell % 8);
  if ((cells.h[cell] || 0) > 70) return 26 + (cell % 11);
  const biome = cells.biome?.[cell] || 0;
  const index = Math.abs((biome * 7 + cell * 3) % rawGoods.length);
  return rawGoods[index].i;
}

function createMarkets(pack, aliveBurgs, goods, random, options = {}) {
  const markets = [null];
  if (!aliveBurgs.length) return markets;

  const target = getMarketTarget(pack, aliveBurgs.length, options);
  const lowLandRatio = landRatio(pack) < 0.65;
  const stockScale = getMarketStockScale(pack, options);
  const selected = new Set();
  const candidates = aliveBurgs
    .map(burg => ({burg, score: marketScore(pack, burg, random)}))
    .sort((a, b) => b.score - a.score || a.burg.i - b.burg.i)
    .map(item => item.burg);

  for (const burg of candidates) {
    if (markets.length > target) break;
    if (selected.has(burg.i)) continue;
    selected.add(burg.i);
    markets.push(createMarket(markets.length, burg, goods, {lowLandRatio, stockScale}));
  }

  return markets;
}

function getMarketTarget(pack, burgCount, options) {
  const divisor = isSparseSmallArchipelago(pack, options) ? 50 : 28;
  return clamp(Math.round(burgCount / divisor), Math.min(1, burgCount), Math.min(70, burgCount));
}

function isSparseSmallArchipelago(pack, options) {
  const cellsTarget = Math.max(1000, Number(options.cellsTarget || 100000));
  return String(options.heightmapTemplate || "") === "archipelago" && cellsTarget <= 10000 && pack.cells.i.length < 3500;
}

function marketScore(pack, burg, random) {
  return (
    (burg.capital ? 10000 : 0) +
    (burg.port ? 1200 : 0) +
    (burg.plaza ? 700 : 0) +
    (burg.population || 0) * 120 +
    (pack.cells.s?.[burg.cell] || 0) * 3 +
    random.range(0, 10)
  );
}

function createMarket(id, burg, goods, {lowLandRatio = false, stockScale = 1} = {}) {
  const marketGoods = {};
  for (const good of goods) {
    const baseStock = lowLandRatio ? 5 + ((id * 17 + good.i * 13) % 28) : 10 + ((id * 17 + good.i * 13) % 50);
    marketGoods[good.i] = {
      good: good.i,
      stock: round(baseStock * stockScale),
      price: round(1.2 + ((id * 11 + good.i * 7) % 70) / 10)
    };
  }
  return {
    i: id,
    id,
    name: `${burg.name}市`,
    centerBurgId: burg.i,
    cell: burg.cell,
    x: burg.x,
    y: burg.y,
    state: burg.state,
    goods: marketGoods
  };
}

function assignMarketsToCells(pack, markets) {
  const {cells} = pack;
  const marketCells = new Uint16Array(cells.i.length);
  const validMarkets = markets.filter(Boolean);
  if (!validMarkets.length) return marketCells;

  const stateMarkets = new Map();
  for (const market of validMarkets) if (market.state > 0 && !stateMarkets.has(market.state)) stateMarkets.set(market.state, market);
  const target = marketCoverageTarget(pack);
  const candidates = [];

  for (const cell of cells.i) {
    const score =
      ((cells.h[cell] || 0) >= 20 ? 1000 : 0) +
      (cells.harbor?.[cell] ? 350 : 0) +
      (cells.burg?.[cell] ? 300 : 0) +
      (cells.s?.[cell] || 0) * 3 +
      (cells.pop?.[cell] || 0) * 0.25 +
      Math.max(0, cells.t?.[cell] || 0) * 20;
    candidates.push({cell, score});
  }

  candidates.sort((a, b) => b.score - a.score || a.cell - b.cell);
  for (let index = 0; index < target; index++) {
    const cell = candidates[index].cell;
    const stateMarket = stateMarkets.get(cells.state?.[cell]);
    marketCells[cell] = stateMarket?.i || nearestMarketId(cells.p[cell], validMarkets);
  }
  return marketCells;
}

function assignMarketsToBurgs(pack, aliveBurgs, markets) {
  const validMarkets = markets.filter(Boolean);
  if (!validMarkets.length) return;
  const stateMarkets = new Map();
  for (const market of validMarkets) if (market.state > 0 && !stateMarkets.has(market.state)) stateMarkets.set(market.state, market);

  for (const burg of aliveBurgs) {
    const market = stateMarkets.get(burg.state) || markets[pack.cells.market?.[burg.cell]] || validMarkets[0];
    burg.market = market.i;
    burg.plaza = Number(market.centerBurgId === burg.i);
  }

  for (const market of validMarkets) {
    const center = pack.burgs?.[market.centerBurgId];
    if (!center?.i || center.removed) continue;
    center.market = market.i;
    center.plaza = 1;
  }
}

function nearestMarketId(point, markets) {
  let best = markets[0];
  let bestDistance = Infinity;
  for (const market of markets) {
    const distance = squaredDistance(point, [market.x, market.y]);
    if (distance < bestDistance) {
      best = market;
      bestDistance = distance;
    }
  }
  return best.i;
}

function initializeTaxRates(states, random) {
  for (const state of states) {
    state.salesTax = round(0.12 + random.range(0, 0.06), 3);
    state.pollTax = round(0.16 + random.range(0, 0.07), 3);
    state.treasury = 0;
  }
}

function createProductionAndDeals(pack, aliveBurgs, goods, rawGoods, manufacturedGoods, states, random, options = {}) {
  const deals = [];
  const stateDealTax = new Map();
  const statesById = new Map(states.map(state => [state.i, state]));
  const localProductionRate = getLocalProductionRate(options);
  const dealProductWeight = getDealProductWeight(options);
  const dealValueScale = getDealValueScale(options);
  const dealGoods = getDealGoods(goods, options);
  const dealGoodIds = new Set(dealGoods.map(good => good.i));
  const rawDealGoods = rawGoods.filter(good => dealGoodIds.has(good.i));
  const marketToBurgDeals = getMarketToBurgDealCount(pack, options);

  for (const burg of aliveBurgs) {
    burg.production = [];
    const localGoodId = pack.cells.good?.[burg.cell] || rawGoods[(burg.i * 7) % rawGoods.length].i;
    if (shouldCreateLocalProduction(burg.i, localProductionRate)) {
      burg.production.push({goodId: localGoodId, units: round(1 + (burg.population || 0) * 0.25)});
    }

    for (let index = 0; index < 7; index++) {
      const good = manufacturedGoods[(burg.i * 5 + index * 11) % manufacturedGoods.length];
      burg.production.push({
        goodId: good.i,
        units: round(0.6 + (burg.population || 0) * 0.08 + index * 0.05),
        recipe: productionRecipe(good)
      });
    }

    for (let index = 0; index < marketToBurgDeals; index++) {
      const good = dealGoods[(burg.i * 13 + index * 7) % dealGoods.length];
      const deal = addDeal({
        pack,
        deals,
        statesById,
        stateDealTax,
        goodId: good.i,
        sellerType: "market",
        seller: burg.market,
        buyerType: "burg",
        buyer: burg.i,
        units: 1,
        price: marketPrice(pack.markets[burg.market], good.i),
        valueScale: dealValueScale
      });
      burg.production.push({dealId: deal.i});
    }

    for (let index = 0; index < 3; index++) {
      const fallbackGoodId = rawDealGoods[(burg.i * 3 + index * 5) % rawDealGoods.length]?.i ?? dealGoods[(burg.i + index) % dealGoods.length].i;
      const goodId = index === 0 && dealGoodIds.has(localGoodId) ? localGoodId : fallbackGoodId;
      const deal = addDeal({
        pack,
        deals,
        statesById,
        stateDealTax,
        goodId,
        sellerType: "burg",
        seller: burg.i,
        buyerType: "market",
        buyer: burg.market,
        units: 0.8 + (index % 2) * 0.2,
        price: marketPrice(pack.markets[burg.market], goodId) * 0.75,
        valueScale: dealValueScale
      });
      burg.production.push({dealId: deal.i});
    }

    burg.product = calculateBurgProduct(burg, dealProductWeight);
    burg.treasury = round(burg.product * 0.35 + (burg.population || 0) * 0.5);
  }

  const markets = (pack.markets || []).filter(Boolean);
  const marketTradeLinks = getMarketTradeLinks(markets.length, options);
  for (const market of markets) {
    for (let index = 0; index < marketTradeLinks; index++) {
      const buyer = markets[(market.i + index) % markets.length];
      if (!buyer || buyer.i === market.i) continue;
      const good = dealGoods[(market.i * 17 + index * 9) % dealGoods.length];
      addDeal({
        pack,
        deals,
        statesById,
        stateDealTax,
        goodId: good.i,
        sellerType: "market",
        seller: market.i,
        buyerType: "market",
        buyer: buyer.i,
        units: 1.5 + (index % 3) * 0.25,
        price: marketPrice(market, good.i),
        valueScale: dealValueScale
      });
    }
  }

  for (const state of states) state._economyDealTax = stateDealTax.get(state.i) || 0;
  return deals;
}

function getDealGoods(goods, options) {
  if (String(options.heightmapTemplate || "") !== "archipelago") return goods;
  return goods.slice(0, Math.min(goods.length, 64));
}

function productionRecipe(good) {
  const recipe = good.recipes?.[0] || {};
  return Object.entries(recipe).map(([goodId, units]) => ({goodId: Number(goodId), units}));
}

function shouldCreateLocalProduction(burgId, rate) {
  return ((burgId * 37) % 1000) / 1000 < rate;
}

function getLocalProductionRate(options) {
  const cellsTarget = Math.max(1000, Number(options.cellsTarget || 100000));
  return clamp(0.3 + 0.35 * Math.sqrt(clamp(cellsTarget / 100000, 0.01, 1)), 0.32, 0.65);
}

function getMarketTradeLinks(markets, options) {
  if (markets < 2) return 0;
  const cellsTarget = Math.max(1000, Number(options.cellsTarget || 100000));
  const maxLinks = markets < 16 ? 6 : 14;
  const minLinks = markets < 16 ? 5 : 10;
  const scaledLinks = Math.round(5 + (maxLinks - 5) * Math.sqrt(clamp(cellsTarget / 100000, 0.01, 1)));
  return Math.min(markets - 1, clamp(scaledLinks, minLinks, maxLinks));
}

function getMarketToBurgDealCount(pack, options) {
  return isSparseSmallArchipelago(pack, options) ? 10 : 15;
}

function calculateBurgProduct(burg, dealProductWeight) {
  let productionRecords = 0;
  let dealRecords = 0;

  for (const record of burg.production || []) {
    if (record.goodId) productionRecords++;
    else if (record.dealId !== undefined) dealRecords++;
  }

  return round((burg.population || 0) * 4 + productionRecords * 0.8 + dealRecords * dealProductWeight);
}

function getDealProductWeight(options) {
  const cellsTarget = Math.max(1000, Number(options.cellsTarget || 100000));
  return 0.8 * Math.sqrt(clamp(cellsTarget / 100000, 0.01, 1));
}

function getDealValueScale(options) {
  const cellsTarget = Math.max(1000, Number(options.cellsTarget || 100000));
  return clamp((cellsTarget / 100000) ** 0.18, 0.66, 1);
}

function addDeal({pack, deals, statesById, stateDealTax, goodId, sellerType, seller, buyerType, buyer, units, price, valueScale = 1}) {
  const sellerState = partyState(pack, sellerType, seller);
  const salesTax = statesById.get(sellerState)?.salesTax || 0.15;
  const roundedUnits = round(units);
  const roundedPrice = round(price * valueScale);
  const taxable = deals.length % 5 === 0;
  const tax = taxable ? round(roundedUnits * roundedPrice * salesTax * 3) : 0;
  const deal = {
    i: deals.length,
    good: goodId,
    sellerType,
    seller,
    buyerType,
    buyer,
    units: roundedUnits,
    price: roundedPrice,
    tax
  };
  deals.push(deal);
  if (sellerState > 0) stateDealTax.set(sellerState, round((stateDealTax.get(sellerState) || 0) + tax));
  return deal;
}

function partyState(pack, type, id) {
  if (type === "burg") return pack.burgs?.[id]?.state || 0;
  if (type === "market") {
    const market = pack.markets?.[id];
    return pack.burgs?.[market?.centerBurgId]?.state || 0;
  }
  return 0;
}

function collectStateTreasuries(states, deals, markets, pack) {
  const dealTaxByState = new Map();
  const marketsById = new Map((markets || []).filter(Boolean).map(market => [market.i, market]));
  for (const deal of deals) {
    const tax = Number(deal.tax || 0);
    if (!tax) continue;
    const stateId =
      deal.sellerType === "burg"
        ? pack.burgs?.[deal.seller]?.state
        : pack.burgs?.[marketsById.get(deal.seller)?.centerBurgId]?.state;
    if (!Number.isInteger(stateId) || stateId <= 0) continue;
    dealTaxByState.set(stateId, round((dealTaxByState.get(stateId) || 0) + tax));
  }

  for (const state of states) {
    const pollTax = round(Number(state.pollTax || 0) * (Number(state.rural || 0) + Number(state.urban || 0)));
    state.treasury = round((dealTaxByState.get(state.i) || 0) + pollTax);
    delete state._economyDealTax;
  }
}

function applyMarkerEconomicPower(pack) {
  const markerEconomy = pack.metadata?.markerResourceEconomy || {};
  const states = (pack.states || []).filter(state => state?.i && !state.removed);
  const provinces = (pack.provinces || []).filter(province => province?.i && !province.removed);
  let statesWithResources = 0;
  let provincesWithResources = 0;

  for (const state of states) {
    const markerPotential = Number(state.markerEconomicPotential || 0);
    const resourcePotential = Number(state.resourcePotential || 0);
    state.economicPower = round(Number(state.treasury || 0) + markerPotential);
    if (resourcePotential > 0) statesWithResources++;
  }

  for (const province of provinces) {
    const markerPotential = Number(province.markerEconomicPotential || 0);
    const populationBase = Number(province.rural || 0) + Number(province.urban || 0);
    province.economicPower = round(populationBase * 0.2 + markerPotential);
    if (Number(province.resourcePotential || 0) > 0) provincesWithResources++;
  }

  return {
    economicMarkers: Number(markerEconomy.economicMarkers || 0),
    resourceMarkers: Number(markerEconomy.resourceMarkers || 0),
    economicPotential: round(markerEconomy.economicPotential || 0),
    resourcePotential: round(markerEconomy.resourcePotential || 0),
    statesWithResources,
    provincesWithResources
  };
}

function marketPrice(market, goodId) {
  return Number(market?.goods?.[goodId]?.price || 2);
}

function squaredDistance(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

function countPositive(values) {
  let count = 0;
  for (const value of values || []) if (value > 0) count++;
  return count;
}

function average(values = []) {
  return values.length ? values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length : 0;
}

function marketCoverageTarget(pack) {
  const ratio = clamp(landRatio(pack) + 0.02, 0.55, 0.9);
  return Math.min(pack.cells.i.length, Math.max(0, Math.round(pack.cells.i.length * ratio)));
}

function getMarketStockScale(pack, options) {
  if (isSparseSmallArchipelago(pack, options)) return 0.41;
  const cellsTarget = Math.max(1000, Number(options.cellsTarget || 100000));
  const scale = clamp((cellsTarget / 100000) ** 0.92, 0.12, 1);
  return isDryLowRiverPeninsula(pack, options, cellsTarget) ? scale * 0.5 : scale;
}

function isDryLowRiverPeninsula(pack, options, cellsTarget) {
  if (String(options.heightmapTemplate || "") !== "peninsula" || cellsTarget !== 50000) return false;
  return countPositive(pack.cells.r || []) < 500;
}

function landRatio(pack) {
  let land = 0;
  for (const cell of pack.cells.i) if ((pack.cells.h[cell] || 0) >= 20) land++;
  return land / Math.max(1, pack.cells.i.length);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function round(value, digits = 3) {
  const scale = 10 ** digits;
  return Math.round(Number(value || 0) * scale) / scale;
}
