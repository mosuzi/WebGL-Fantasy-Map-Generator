import {createRandom} from "./random.js";
import {getGovernmentEffects} from "./governments.js";

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

const GOOD_SOURCE_NATURAL = 1;
const GOOD_SOURCE_MARKER = 2;

const RESOURCE_KEY_GOOD_IDS = Object.freeze({
  geothermal: [35],
  ore: [29, 30, 31, 32, 33],
  salt: [18],
  "rare-biota": [8, 17, 24],
  gems: [34],
  stone: [26],
  clay: [25],
  coal: [28],
  sulfur: [35],
  nitrate: [36],
  amber: [37],
  pearls: [20, 34],
  coral: [20, 34],
  fish: [19],
  harbor: [19, 20, 38],
  timber: [13],
  resin: [14],
  herbs: [8],
  dyes: [39],
  spices: [17],
  tea: [7],
  silk: [12],
  horses: [22],
  "salt-meadow": [18, 21],
  oasis: [15, 1, 5],
  "sacred-water": [8, 24],
  freshwater: [1, 5]
});

export function prepareInitialGoods(pack, options = {}) {
  const random = createRandom(`${options.seed}:economy-goods`);
  const goods = ensurePackGoods(pack);
  const rawGoods = goods.filter(good => good?.distribution);
  const assignment = assignResourceGoods(pack, rawGoods, random, {includeMarkers: false, preserveExisting: false});
  writeResourceGoods(pack, assignment);
  return assignment.metadata;
}

export function buildEconomy(pack, options = {}) {
  const random = createRandom(`${options.seed}:economy`);
  const goods = ensurePackGoods(pack);
  const rawGoods = goods.filter(good => good?.distribution);
  const manufacturedGoods = goods.filter(good => good?.recipes?.length);
  const aliveBurgs = (pack.burgs || []).filter(burg => burg?.i && !burg.removed);
  const states = (pack.states || []).filter(state => state?.i && !state.removed);

  const resourceAssignment = assignResourceGoods(pack, rawGoods, random, {includeMarkers: true, preserveExisting: true});
  writeResourceGoods(pack, resourceAssignment);
  const resourcePopulation = applyResourcePopulationBonus(pack, {markerOnly: true});
  syncPoliticalPopulationStats(pack);
  pack.markets = createMarkets(pack, aliveBurgs, goods, random, options);
  pack.cells.market = assignMarketsToCells(pack, pack.markets);
  const resourceTrade = applyResourceSupplyToMarkets(pack, pack.markets);
  assignMarketsToBurgs(pack, aliveBurgs, pack.markets);
  const demand = applyMarketDemandDiagnostics(pack, pack.markets, goods);
  initializeTaxRates(states, random);
  const deals = createProductionAndDeals(pack, aliveBurgs, goods, rawGoods, manufacturedGoods, states, random, options);
  pack.deals = deals;
  const pricePropagation = applyPricePropagationDiagnostics(pack, pack.markets, deals, goods);
  collectStateTreasuries(states, deals, pack.markets, pack);
  const markerEconomy = refreshPoliticalEconomicPower(pack);

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
    resourceTrade: {
      ...resourceTrade,
      resourceDeals: deals.filter(deal => deal.source === "market-resource" || deal.source === "marker-resource").length,
      markerResourceDeals: deals.filter(deal => deal.source === "marker-resource").length
    },
    demand,
    pricePropagation,
    tradeDistance: summarizeTradeDistance(deals),
    statesWithTaxes: states.filter(state => Number.isFinite(state.salesTax) && Number.isFinite(state.pollTax)).length,
    markerEconomy
  };

  return {goods: pack.goods, markets: pack.markets, deals: pack.deals, metadata};
}

function ensurePackGoods(pack) {
  const existing = (pack.goods || []).filter(Boolean);
  if (existing.length) return existing;
  const goods = createGoods();
  pack.goods = [null, ...goods];
  return goods;
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

function applyResourcePopulationBonus(pack, {markerOnly = false} = {}) {
  const {cells} = pack;
  if (!cells.good || !cells.s || !cells.pop) return {cells: 0, total: 0};
  const meanArea = average(Array.from(cells.area || [])) || 1;
  let affected = 0;
  let total = 0;

  for (const cell of cells.i) {
    if ((cells.h[cell] || 0) < 20) continue;
    const neighborCells = cells.c?.[cell] || [];
    const hasResource = cells.good[cell] || neighborCells.some(neighbor => cells.good[neighbor]);
    if (!hasResource) continue;
    if (markerOnly && !isMarkerResourceNeighborhood(cells, cell, neighborCells)) continue;
    const cellRes = getResourceValue(pack, cell);
    const neighborRes = average((cells.c?.[cell] || []).map(neighbor => getResourceValue(pack, neighbor)));
    const supply = Number(cells.goodSupply?.[cell] || 1);
    const bonus = ((cellRes ? cellRes + 10 : 0) + neighborRes) * (markerOnly ? 0.32 : 1) + supply;
    if (bonus <= 0) continue;
    cells.s[cell] += bonus;
    cells.pop[cell] = cells.s[cell] > 0 ? (cells.s[cell] * cells.area[cell]) / meanArea : 0;
    affected++;
    total += bonus;
  }

  return {cells: affected, total: round(total)};
}

function isMarkerResourceNeighborhood(cells, cell, neighbors) {
  if ((cells.goodSource?.[cell] || 0) >= GOOD_SOURCE_MARKER) return true;
  return neighbors.some(neighbor => (cells.goodSource?.[neighbor] || 0) >= GOOD_SOURCE_MARKER);
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

function writeResourceGoods(pack, assignment) {
  pack.cells.good = assignment.goods;
  pack.cells.goodSupply = assignment.supply;
  pack.cells.goodSource = assignment.source;
  if (!pack.metadata) pack.metadata = {};
  pack.metadata.resourceGoods = assignment.metadata;
}

function assignResourceGoods(pack, rawGoods, random, {includeMarkers = true, preserveExisting = true} = {}) {
  const {cells} = pack;
  const resource = preserveExisting && cells.good ? new Uint16Array(cells.good) : new Uint16Array(cells.i.length);
  const supply = preserveExisting && cells.goodSupply ? new Float32Array(cells.goodSupply) : new Float32Array(cells.i.length);
  const source = preserveExisting && cells.goodSource ? new Uint8Array(cells.goodSource) : new Uint8Array(cells.i.length);
  const metadata = {
    naturalCells: countPositive(resource),
    markerCells: 0,
    markerTradeCells: 0,
    markerResources: 0,
    markerGoods: {}
  };

  if (!metadata.naturalCells) {
    metadata.naturalCells = assignNaturalResourceGoods(pack, rawGoods, random, resource, supply, source);
  }

  if (includeMarkers) {
    const markerStats = assignMarkerResourceGoods(pack, rawGoods, resource, supply, source);
    metadata.markerCells = markerStats.cells;
    metadata.markerTradeCells = markerStats.tradeCells;
    metadata.markerResources = markerStats.markers;
    metadata.markerGoods = markerStats.goods;
  }

  metadata.totalCells = countPositive(resource);
  metadata.supply = round(sumValues(supply), 2);
  metadata.hasMarkerSources = metadata.markerCells > 0;
  return {goods: resource, supply, source, metadata};
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

function assignNaturalResourceGoods(pack, rawGoods, random, resource, supply, source) {
  const {cells} = pack;
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
    supply[cell] = Math.max(supply[cell] || 0, naturalSupplyScore(candidates[index].score));
    source[cell] = GOOD_SOURCE_NATURAL;
  }
  return target;
}

function assignMarkerResourceGoods(pack, rawGoods, resource, supply, source) {
  const touchedCells = new Set();
  const tradeCells = new Set();
  const goods = {};
  let markers = 0;

  for (const marker of pack.markers || []) {
    if (marker?.category !== "resource") continue;
    const packCell = Number(marker.packCell);
    if (!Number.isInteger(packCell) || packCell < 0 || packCell >= pack.cells.i.length) continue;
    const goodId = markerResourceGoodId(marker, packCell, rawGoods);
    if (!goodId) continue;
    markers++;

    const markerSupply = markerSupplyScore(marker);
    writeResourceCell(resource, supply, source, packCell, goodId, markerSupply, GOOD_SOURCE_MARKER);
    touchedCells.add(packCell);

    const accessCell = markerAccessCell(pack, packCell);
    if (Number.isInteger(accessCell) && accessCell !== packCell) {
      writeResourceCell(resource, supply, source, accessCell, goodId, markerSupply * 0.75, GOOD_SOURCE_MARKER);
      touchedCells.add(accessCell);
      tradeCells.add(accessCell);
    }

    const name = pack.goods?.[goodId]?.name || `good-${goodId}`;
    goods[name] = (goods[name] || 0) + 1;
  }

  return {cells: touchedCells.size, tradeCells: tradeCells.size, markers, goods};
}

function writeResourceCell(resource, supply, source, cell, goodId, nextSupply, nextSource) {
  const currentSource = source[cell] || 0;
  const currentSupply = supply[cell] || 0;
  if (currentSource > nextSource && currentSupply >= nextSupply) return;
  if (currentSource === nextSource && currentSupply > nextSupply) return;
  resource[cell] = goodId;
  supply[cell] = Math.max(currentSupply, nextSupply);
  source[cell] = nextSource;
}

function markerResourceGoodId(marker, cell, rawGoods) {
  const ids = RESOURCE_KEY_GOOD_IDS[marker.resourceKey] || RESOURCE_KEY_GOOD_IDS[marker.type];
  if (ids?.length) return ids[Math.abs((cell + marker.id * 7) % ids.length)];
  return rawGoods[Math.abs((cell + marker.id * 11) % rawGoods.length)]?.i || 0;
}

function markerAccessCell(pack, packCell) {
  if ((pack.cells.h?.[packCell] || 0) >= 20) return packCell;
  const candidates = (pack.cells.c?.[packCell] || [])
    .filter(cell => (pack.cells.h?.[cell] || 0) >= 20)
    .map(cell => ({cell, score: (pack.cells.s?.[cell] || 0) + (pack.cells.pop?.[cell] || 0) * 0.25 + (pack.cells.harbor?.[cell] ? 20 : 0)}))
    .sort((a, b) => b.score - a.score || a.cell - b.cell);
  return candidates[0]?.cell ?? packCell;
}

function naturalSupplyScore(score) {
  return round(clamp(0.7 + Math.sqrt(Math.max(0, score)) / 12, 0.8, 3.2), 2);
}

function markerSupplyScore(marker) {
  return round(clamp(1.4 + Number(marker.economicValue || 0) / 7, 1.5, 5.5), 2);
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

function applyResourceSupplyToMarkets(pack, markets) {
  const validMarkets = markets.filter(Boolean);
  const metadata = {
    resourceCells: 0,
    markerResourceCells: 0,
    suppliedMarkets: 0,
    stockBoost: 0,
    goods: {},
    markerGoods: {}
  };
  if (!validMarkets.length) return metadata;

  const suppliedMarkets = new Set();
  for (const cell of pack.cells.i) {
    const goodId = pack.cells.good?.[cell] || 0;
    if (!goodId) continue;
    const marketId = pack.cells.market?.[cell] || nearestMarketId(pack.cells.p[cell], validMarkets);
    const market = markets[marketId];
    const record = market?.goods?.[goodId];
    if (!market || !record) continue;

    const markerSource = (pack.cells.goodSource?.[cell] || 0) >= GOOD_SOURCE_MARKER;
    const supply = Number(pack.cells.goodSupply?.[cell] || 1);
    const goodValue = Number(pack.goods?.[goodId]?.value || 2);
    const boost = round((markerSource ? 2.1 : 1) * supply + Math.sqrt(goodValue), 2);
    record.stock = round(Number(record.stock || 0) + boost, 2);
    record.price = round(Math.max(0.5, Number(record.price || 2) - Math.min(0.35, boost * 0.025)), 2);

    market.resourceSupply ??= {};
    market.resourceSupplySources ??= {};
    market.resourceSupply[goodId] = round((market.resourceSupply[goodId] || 0) + boost, 2);
    if (markerSource) market.resourceSupplySources[goodId] = GOOD_SOURCE_MARKER;
    else if (!market.resourceSupplySources[goodId]) market.resourceSupplySources[goodId] = GOOD_SOURCE_NATURAL;

    const goodName = pack.goods?.[goodId]?.name || `good-${goodId}`;
    metadata.resourceCells++;
    metadata.stockBoost = round(metadata.stockBoost + boost, 2);
    metadata.goods[goodName] = round((metadata.goods[goodName] || 0) + boost, 2);
    if (markerSource) {
      metadata.markerResourceCells++;
      metadata.markerGoods[goodName] = round((metadata.markerGoods[goodName] || 0) + boost, 2);
    }
    suppliedMarkets.add(market.i);
  }

  metadata.suppliedMarkets = suppliedMarkets.size;
  return metadata;
}

function applyMarketDemandDiagnostics(pack, markets, goods) {
  const validMarkets = markets.filter(Boolean);
  const goodsList = goods.filter(Boolean);
  const marketDemandBase = new Map(validMarkets.map(market => [market.i, {rural: 0, urban: 0, burgs: 0}]));
  const goodSummary = new Map(goodsList.map(good => [good.i, {
    good: good.i,
    name: good.name || `good-${good.i}`,
    demand: 0,
    supply: 0,
    shortage: 0,
    surplus: 0
  }]));
  const metadata = {
    totalDemand: 0,
    totalSupply: 0,
    shortage: 0,
    surplus: 0,
    shortageGoods: 0,
    shortageMarkets: 0,
    topShortages: []
  };

  for (const cell of pack.cells?.i || []) {
    const marketId = pack.cells.market?.[cell] || 0;
    const item = marketDemandBase.get(marketId);
    if (!item || (pack.cells.h?.[cell] || 0) < 20) continue;
    item.rural += Number(pack.cells.pop?.[cell] || 0);
  }

  for (const burg of pack.burgs || []) {
    if (!burg?.i || burg.removed || !burg.market) continue;
    const item = marketDemandBase.get(burg.market);
    if (!item) continue;
    item.urban += Number(burg.population || 0);
    item.burgs++;
  }

  for (const market of validMarkets) {
    const base = marketDemandBase.get(market.i) || {rural: 0, urban: 0, burgs: 0};
    let marketDemand = 0;
    let marketSupply = 0;
    let marketShortage = 0;
    let marketSurplus = 0;

    for (const good of goodsList) {
      const record = market.goods?.[good.i];
      if (!record) continue;
      const demand = marketGoodDemand(good, base);
      const supply = round(Number(record.stock || 0) + Number(market.resourceSupply?.[good.i] || 0), 2);
      const gap = round(supply - demand, 2);
      const shortage = round(Math.max(0, -gap), 2);
      const surplus = round(Math.max(0, gap), 2);

      record.demand = demand;
      record.supply = supply;
      record.gap = gap;
      record.shortage = shortage;
      record.surplus = surplus;

      marketDemand = round(marketDemand + demand, 2);
      marketSupply = round(marketSupply + supply, 2);
      marketShortage = round(marketShortage + shortage, 2);
      marketSurplus = round(marketSurplus + surplus, 2);

      const summary = goodSummary.get(good.i);
      if (summary) {
        summary.demand = round(summary.demand + demand, 2);
        summary.supply = round(summary.supply + supply, 2);
        summary.shortage = round(summary.shortage + shortage, 2);
        summary.surplus = round(summary.surplus + surplus, 2);
      }
    }

    market.demandSummary = {
      demand: marketDemand,
      supply: marketSupply,
      gap: round(marketSupply - marketDemand, 2),
      shortage: marketShortage,
      surplus: marketSurplus
    };

    metadata.totalDemand = round(metadata.totalDemand + marketDemand, 2);
    metadata.totalSupply = round(metadata.totalSupply + marketSupply, 2);
    metadata.shortage = round(metadata.shortage + marketShortage, 2);
    metadata.surplus = round(metadata.surplus + marketSurplus, 2);
    if (marketShortage > 0) metadata.shortageMarkets++;
  }

  metadata.shortageGoods = [...goodSummary.values()].filter(item => item.shortage > 0).length;
  metadata.topShortages = [...goodSummary.values()]
    .filter(item => item.shortage > 0)
    .sort((a, b) => b.shortage - a.shortage || a.good - b.good)
    .slice(0, 8)
    .map(item => ({good: item.good, name: item.name, shortage: round(item.shortage, 2)}));
  metadata.balance = round(metadata.totalSupply - metadata.totalDemand, 2);
  return metadata;
}

function marketGoodDemand(good, base) {
  const coverage = good.demandCoverage || {};
  const urbanCoverage = Number(coverage.urban ?? 0.36);
  const ruralCoverage = Number(coverage.rural ?? 0.28);
  const consumerBase = Math.sqrt(Math.max(0, base.rural)) * 1.15 + Number(base.urban || 0) * 2.4 + Number(base.burgs || 0) * 0.18 + 0.35;
  const typeFactor = good.distribution && !good.recipes?.length ? 1.08 : good.recipes?.length ? 0.82 : 1;
  return round(Math.max(0.05, consumerBase * (0.25 + urbanCoverage * 0.58 + ruralCoverage * 0.34) * typeFactor), 2);
}

function applyPricePropagationDiagnostics(pack, markets, deals, goods) {
  const validMarkets = (markets || []).filter(Boolean);
  const goodsList = (goods || []).filter(Boolean);
  const flows = buildTradeFlowByMarketGood(pack, deals);
  const metadata = {
    records: 0,
    marketsWithSignals: 0,
    priceRisers: 0,
    priceFallers: 0,
    averageDelta: 0,
    maxDelta: 0,
    topRisers: [],
    topFallers: []
  };
  const topSignals = [];
  let totalDelta = 0;

  for (const market of validMarkets) {
    let marketDelta = 0;
    let marketPressureGoods = 0;
    let marketTradeIn = 0;
    let marketTradeOut = 0;

    for (const good of goodsList) {
      const record = market.goods?.[good.i];
      if (!record) continue;
      const flow = flows.get(flowKey(market.i, good.i)) || emptyMarketGoodFlow();
      const localPrice = Number(record.price || 0);
      const demand = Number(record.demand || 0);
      const supply = Number(record.supply || record.stock || 0);
      const shortage = Number(record.shortage || 0);
      const surplus = Number(record.surplus || 0);
      const resourceSupply = Number(market.resourceSupply?.[good.i] || 0);
      const demandBase = Math.max(1, demand);
      const tradeBase = Math.max(1, demand + supply);
      const demandPressure = clamp((shortage - surplus * 0.25) / demandBase, -0.28, 0.42);
      const tradePressure = clamp((flow.outUnits - flow.inUnits) / tradeBase, -0.18, 0.24);
      const resourceRelief = clamp(resourceSupply / demandBase, 0, 0.22);
      const pressure = round(demandPressure + tradePressure - resourceRelief, 3);
      const effectivePrice = round(Math.max(0.35, localPrice * (1 + pressure)), 2);
      const delta = round(effectivePrice - localPrice, 2);

      record.localPrice = round(localPrice, 2);
      record.effectivePrice = effectivePrice;
      record.priceDelta = delta;
      record.pricePressure = pressure;
      record.tradeInUnits = round(flow.inUnits, 2);
      record.tradeOutUnits = round(flow.outUnits, 2);
      record.netTradeUnits = round(flow.inUnits - flow.outUnits, 2);
      record.tradeInValue = round(flow.inValue, 2);
      record.tradeOutValue = round(flow.outValue, 2);
      record.netTradeValue = round(flow.inValue - flow.outValue, 2);

      metadata.records++;
      totalDelta = round(totalDelta + delta, 2);
      marketDelta = round(marketDelta + delta, 2);
      marketTradeIn = round(marketTradeIn + flow.inValue, 2);
      marketTradeOut = round(marketTradeOut + flow.outValue, 2);
      metadata.maxDelta = round(Math.max(metadata.maxDelta, Math.abs(delta)), 2);
      if (delta > 0.01) metadata.priceRisers++;
      if (delta < -0.01) metadata.priceFallers++;
      if (Math.abs(delta) > 0.01) {
        marketPressureGoods++;
        topSignals.push({
          market: market.i,
          marketName: market.name,
          good: good.i,
          name: good.name || `good-${good.i}`,
          delta,
          effectivePrice,
          localPrice: round(localPrice, 2)
        });
      }
    }

    market.priceSummary = {
      averageDelta: round(marketDelta / Math.max(1, goodsList.length), 3),
      pressureGoods: marketPressureGoods,
      tradeInValue: marketTradeIn,
      tradeOutValue: marketTradeOut,
      netTradeValue: round(marketTradeIn - marketTradeOut, 2)
    };
    if (marketPressureGoods) metadata.marketsWithSignals++;
  }

  metadata.averageDelta = round(totalDelta / Math.max(1, metadata.records), 3);
  metadata.topRisers = topSignals
    .filter(item => item.delta > 0)
    .sort((a, b) => b.delta - a.delta || a.market - b.market || a.good - b.good)
    .slice(0, 8);
  metadata.topFallers = topSignals
    .filter(item => item.delta < 0)
    .sort((a, b) => a.delta - b.delta || a.market - b.market || a.good - b.good)
    .slice(0, 8);
  return metadata;
}

function buildTradeFlowByMarketGood(pack, deals) {
  const flows = new Map();
  for (const deal of deals || []) {
    const goodId = Number(deal.good || 0);
    if (!goodId) continue;
    const units = Number(deal.units || 0);
    const value = round(units * Number(deal.price || 0), 2);
    const sellerMarket = tradePartyMarketId(pack, deal.sellerType, deal.seller);
    const buyerMarket = tradePartyMarketId(pack, deal.buyerType, deal.buyer);

    if (sellerMarket) {
      const flow = ensureMarketGoodFlow(flows, sellerMarket, goodId);
      flow.outUnits = round(flow.outUnits + units, 2);
      flow.outValue = round(flow.outValue + value, 2);
    }
    if (buyerMarket) {
      const flow = ensureMarketGoodFlow(flows, buyerMarket, goodId);
      flow.inUnits = round(flow.inUnits + units, 2);
      flow.inValue = round(flow.inValue + value, 2);
    }
  }
  return flows;
}

function tradePartyMarketId(pack, type, id) {
  if (type === "market") return Number(id || 0);
  if (type === "burg") return Number(pack?.burgs?.[id]?.market || 0);
  return 0;
}

function ensureMarketGoodFlow(flows, marketId, goodId) {
  const key = flowKey(marketId, goodId);
  let flow = flows.get(key);
  if (!flow) {
    flow = emptyMarketGoodFlow();
    flows.set(key, flow);
  }
  return flow;
}

function emptyMarketGoodFlow() {
  return {inUnits: 0, outUnits: 0, inValue: 0, outValue: 0};
}

function flowKey(marketId, goodId) {
  return `${marketId}:${goodId}`;
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
    const governmentEffects = getGovernmentEffects(state);
    state.salesTax = round((0.12 + random.range(0, 0.06)) * governmentEffects.taxMultiplier, 3);
    state.pollTax = round((0.16 + random.range(0, 0.07)) * governmentEffects.taxMultiplier, 3);
    state.governmentEconomicModifier = round(governmentEffects.economyMultiplier, 3);
    state.governmentTradeModifier = round(governmentEffects.tradeMultiplier, 3);
    state.treasury = 0;
  }
}

function createProductionAndDeals(pack, aliveBurgs, goods, rawGoods, manufacturedGoods, states, random, options = {}) {
  const deals = [];
  const stateDealTax = new Map();
  const statesById = new Map(states.map(state => [state.i, state]));
  const distanceContext = createTradeDistanceContext(pack, options);
  const localProductionRate = getLocalProductionRate(options);
  const dealProductWeight = getDealProductWeight(options);
  const dealValueScale = getDealValueScale(options);
  const dealGoods = getDealGoods(goods, options);
  const dealGoodIds = new Set(dealGoods.map(good => good.i));
  const rawDealGoods = rawGoods.filter(good => dealGoodIds.has(good.i));
  const marketToBurgDeals = getMarketToBurgDealCount(pack, options);

  for (const burg of aliveBurgs) {
    burg.production = [];
    const localMarket = pack.markets?.[burg.market];
    const localGood = selectMarketDealGood(localMarket, rawGoods, burg.i, 0, rawGoods[(burg.i * 7) % rawGoods.length]);
    const localGoodId = pack.cells.good?.[burg.cell] || localGood.good.i;
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
      const selectedGood = selectMarketDealGood(localMarket, dealGoods, burg.i, index, dealGoods[(burg.i * 13 + index * 7) % dealGoods.length]);
      const deal = addDeal({
        pack,
        deals,
        statesById,
        stateDealTax,
        goodId: selectedGood.good.i,
        sellerType: "market",
        seller: burg.market,
        buyerType: "burg",
        buyer: burg.i,
        units: 1,
        price: marketPrice(localMarket, selectedGood.good.i),
        valueScale: dealValueScale,
        source: selectedGood.source,
        distanceContext
      });
      burg.production.push({dealId: deal.i});
    }

    for (let index = 0; index < 3; index++) {
      const fallbackGoodId = rawDealGoods[(burg.i * 3 + index * 5) % rawDealGoods.length]?.i ?? dealGoods[(burg.i + index) % dealGoods.length].i;
      const selectedGood = selectMarketDealGood(localMarket, rawDealGoods.length ? rawDealGoods : dealGoods, burg.i, index + 17, {i: fallbackGoodId});
      const goodId = index === 0 && dealGoodIds.has(localGoodId) ? localGoodId : selectedGood.good.i;
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
        price: marketPrice(localMarket, goodId) * 0.75,
        valueScale: dealValueScale,
        source: selectedGood.source,
        distanceContext
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
      const selectedGood = selectMarketDealGood(market, dealGoods, market.i, index, dealGoods[(market.i * 17 + index * 9) % dealGoods.length]);
      addDeal({
        pack,
        deals,
        statesById,
        stateDealTax,
        goodId: selectedGood.good.i,
        sellerType: "market",
        seller: market.i,
        buyerType: "market",
        buyer: buyer.i,
        units: 1.5 + (index % 3) * 0.25,
        price: marketPrice(market, selectedGood.good.i),
        valueScale: dealValueScale,
        source: selectedGood.source,
        distanceContext
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

function selectMarketDealGood(market, goods, saltA, saltB, fallback) {
  const fallbackGood = fallback || goods[Math.abs((saltA + saltB) % goods.length)];
  const allowed = new Set(goods.map(good => good.i));
  const supplied = Object.entries(market?.resourceSupply || {})
    .map(([goodId, supply]) => ({
      goodId: Number(goodId),
      supply: Number(supply || 0),
      source: market.resourceSupplySources?.[goodId] >= GOOD_SOURCE_MARKER ? "marker-resource" : "market-resource"
    }))
    .filter(item => allowed.has(item.goodId) && item.supply > 0)
    .sort((a, b) => b.supply - a.supply || a.goodId - b.goodId);

  if (!supplied.length) return {good: fallbackGood, source: "scheduled"};
  const supplyPreference = ((saltA * 31 + saltB * 17) % 100) < 58;
  if (!supplyPreference) return {good: fallbackGood, source: "scheduled"};
  const selected = supplied[Math.abs((saltA * 13 + saltB * 7) % supplied.length)];
  return {
    good: goods.find(good => good.i === selected.goodId) || fallbackGood,
    source: selected.source
  };
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

function addDeal({pack, deals, statesById, stateDealTax, goodId, sellerType, seller, buyerType, buyer, units, price, valueScale = 1, source = "scheduled", distanceContext = null}) {
  const sellerState = partyState(pack, sellerType, seller);
  const sellerStateItem = statesById.get(sellerState);
  const salesTax = sellerStateItem?.salesTax || 0.15;
  const tradeMultiplier = sellerStateItem?.governmentTradeModifier || 1;
  const roundedUnits = round(units);
  const basePrice = round(price * valueScale * tradeMultiplier);
  const distance = tradePartyDistance(pack, sellerType, seller, buyerType, buyer);
  const distanceRate = tradeDistanceRate(distance, sellerType, buyerType, distanceContext);
  const distanceMultiplier = round(1 + distanceRate, 3);
  const distanceCost = round(basePrice * distanceRate);
  const roundedPrice = round(basePrice + distanceCost);
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
    basePrice,
    price: roundedPrice,
    distance: Number.isFinite(distance) ? round(distance, 2) : null,
    distanceCost,
    distanceMultiplier,
    tax,
    source
  };
  deals.push(deal);
  if (sellerState > 0) stateDealTax.set(sellerState, round((stateDealTax.get(sellerState) || 0) + tax));
  return deal;
}

function createTradeDistanceContext(pack, options = {}) {
  const extent = pointExtent(pack?.cells?.p || []);
  const width = Math.max(1, Number(options.graphWidth || 0) || extent.width || 1440);
  const height = Math.max(1, Number(options.graphHeight || 0) || extent.height || 960);
  return {
    diagonal: Math.max(1, Math.hypot(width, height))
  };
}

function pointExtent(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points || []) {
    if (!Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) continue;
    minX = Math.min(minX, point[0]);
    minY = Math.min(minY, point[1]);
    maxX = Math.max(maxX, point[0]);
    maxY = Math.max(maxY, point[1]);
  }
  return Number.isFinite(minX) ? {width: maxX - minX, height: maxY - minY} : {width: 0, height: 0};
}

function tradePartyDistance(pack, sellerType, seller, buyerType, buyer) {
  const from = tradePartyPoint(pack, sellerType, seller);
  const to = tradePartyPoint(pack, buyerType, buyer);
  if (!from || !to) return null;
  return Math.hypot(from[0] - to[0], from[1] - to[1]);
}

function tradePartyPoint(pack, type, id) {
  if (type === "burg") {
    const burg = pack?.burgs?.[id];
    return Number.isFinite(burg?.x) && Number.isFinite(burg?.y) ? [burg.x, burg.y] : null;
  }
  const market = pack?.markets?.[id];
  const center = pack?.burgs?.[market?.centerBurgId];
  const x = Number.isFinite(market?.x) ? market.x : center?.x;
  const y = Number.isFinite(market?.y) ? market.y : center?.y;
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
}

function tradeDistanceRate(distance, sellerType, buyerType, context) {
  if (!Number.isFinite(distance) || distance <= 0) return 0;
  const normalized = distance / Math.max(1, Number(context?.diagonal || 1));
  const routeWeight = sellerType === "market" && buyerType === "market" ? 1.25 : 0.72;
  return round(clamp(normalized * routeWeight * 0.26, 0, 0.28), 4);
}

function summarizeTradeDistance(deals) {
  const distances = deals.map(deal => Number(deal.distance)).filter(Number.isFinite);
  const costs = deals.map(deal => Number(deal.distanceCost || 0));
  return {
    dealsWithDistance: distances.length,
    averageDistance: round(average(distances), 2),
    maxDistance: round(Math.max(0, ...distances), 2),
    totalDistanceCost: round(sumValues(costs), 2),
    averageDistanceCost: round(average(costs), 3)
  };
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

export function refreshPoliticalEconomicPower(pack) {
  const markerEconomy = pack.metadata?.markerResourceEconomy || {};
  const states = (pack.states || []).filter(state => state?.i && !state.removed);
  const provinces = (pack.provinces || []).filter(province => province?.i && !province.removed);
  const stateAverages = politicalAverages(states);
  const provinceAverages = politicalAverages(provinces);
  let statesWithResources = 0;
  let provincesWithResources = 0;

  for (const state of states) {
    applyPoliticalPowerFields(state, stateAverages, {
      kind: "state",
      treasury: Number(state.treasury || 0),
      population: Number(state.rural || 0) + Number(state.urban || 0),
      burgs: Number(state.burgs || 0),
      area: Number(state.area || state.cells || 0)
    });
    if (Number(state.resourcePotential || 0) > 0) statesWithResources++;
  }

  for (const province of provinces) {
    const populationBase = Number(province.rural || 0) + Number(province.urban || 0);
    applyPoliticalPowerFields(province, provinceAverages, {
      kind: "province",
      treasury: populationBase * 0.2,
      population: populationBase,
      burgs: Number(province.burgs || province.cityCount || 0),
      area: Number(province.area || province.cells || 0)
    });
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

function politicalAverages(groups) {
  return {
    population: average(groups.map(group => Number(group?.rural || 0) + Number(group?.urban || 0))),
    area: average(groups.map(group => Number(group?.area || group?.cells || 0))),
    burgs: average(groups.map(group => Number(group?.burgs || group?.cityCount || 0))),
    economy: average(groups.map(group => {
      const population = Number(group?.rural || 0) + Number(group?.urban || 0);
      const base = Number(group?.treasury || 0) || population * 0.2;
      return base + Number(group?.markerEconomicPotential || 0);
    }))
  };
}

function applyPoliticalPowerFields(group, averages, context) {
  const markerPotential = Number(group.markerEconomicPotential || 0);
  const resourcePotential = Number(group.resourcePotential || 0);
  const governmentEffects = context.kind === "state" ? getGovernmentEffects(group) : null;
  const governmentEconomyModifier = governmentEffects?.economyMultiplier || 1;
  const economicPower = (Number(context.treasury || 0) + markerPotential) * governmentEconomyModifier;
  const populationScore = relativeScore(context.population, averages.population, 42);
  const territoryScore = relativeScore(context.area, averages.area, context.kind === "state" ? 18 : 14);
  const settlementScore = relativeScore(context.burgs, averages.burgs, context.kind === "state" ? 20 : 16);
  const economyScore = relativeScore(economicPower, averages.economy, context.kind === "state" ? 28 : 22);
  const resourceScore = Math.sqrt(Math.max(0, resourcePotential)) * (context.kind === "state" ? 5.5 : 4.5);
  const markerScore = Math.sqrt(Math.max(0, markerPotential)) * 2;

  group.resourcePower = round(resourceScore, 2);
  group.economicPower = round(economicPower, 2);
  if (context.kind === "state") {
    group.governmentEconomicModifier = round(governmentEconomyModifier, 3);
    group.governmentTradeModifier = round(governmentEffects?.tradeMultiplier || 1, 3);
  }
  group.populationPower = round(populationScore, 2);
  group.territoryPower = round(territoryScore, 2);
  group.settlementPower = round(settlementScore, 2);
  group.powerScore = round(populationScore + territoryScore + settlementScore + economyScore + resourceScore + markerScore, 2);
  group.militarySupply = round(1 + clamp(resourcePotential / 320, 0, 0.18) + clamp(Math.sqrt(Math.max(0, economicPower)) / 240, 0, 0.12), 3);
}

function relativeScore(value, averageValue, weight) {
  const numeric = Math.max(0, Number(value || 0));
  const baseline = Math.max(1, Number(averageValue || 0));
  return Math.sqrt(numeric / baseline) * weight;
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

function sumValues(values = []) {
  let total = 0;
  for (const value of values || []) total += Number(value || 0);
  return total;
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
