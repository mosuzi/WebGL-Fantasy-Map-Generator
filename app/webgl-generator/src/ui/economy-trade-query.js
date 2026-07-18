import {goodDisplayName, normalizeMarketDisplayProperties} from "../generator/economy-display-properties.js";

export const EMPTY_TRADE_QUERY = Object.freeze({stateId: "", provinceId: "", marketId: "", goodId: "", seller: "", buyer: ""});

export function normalizeTradeQuery(query = {}) {
  return {
    stateId: normalizeOptionalId(query.stateId),
    provinceId: normalizeOptionalId(query.provinceId),
    marketId: normalizeOptionalId(query.marketId),
    goodId: normalizeOptionalId(query.goodId),
    seller: normalizeText(query.seller),
    buyer: normalizeText(query.buyer)
  };
}

export function hasStructuredTradeQuery(query = {}) {
  return Object.values(normalizeTradeQuery(query)).some(Boolean);
}

export function queryTradeDeals(pack = {}, options = {}) {
  const query = normalizeTradeQuery(options.query);
  const textTokens = normalizeText(options.text).split(/\s+/).filter(Boolean);
  const context = createTradeQueryContext(pack);
  const matches = [];
  for (const deal of (pack.deals || [])) {
    if (!Number.isInteger(deal?.i)) continue;
    const entry = createDealEntry(deal, context);
    if (!matchesStructuredQuery(entry, query)) continue;
    if (textTokens.length) {
      const searchText = dealSearchText(entry);
      if (!textTokens.every(token => searchText.includes(token))) continue;
    }
    matches.push(entry);
  }
  matches.sort((left, right) => compareDealEntries(left, right, options.sortKey, options.sortDir));
  const total = matches.length;
  const limit = Number(options.limit);
  if (!Number.isFinite(limit)) return {entries: matches, total, query};
  const entries = matches.slice(0, Math.max(0, limit));
  const selectedId = Number(options.selectedDealId);
  if (Number.isInteger(selectedId) && !entries.some(entry => entry.deal.i === selectedId)) {
    const selected = matches.find(entry => entry.deal.i === selectedId);
    if (selected) entries.push(selected);
  }
  return {entries, total, query};
}

export function buildTradeQueryOptions(pack = {}) {
  return {
    states: allOption("全部国家", pack.states, item => item?.fullName || item?.name || `国家 #${item?.i}`),
    provinces: allOption("全部行政区域", pack.provinces, item => item?.fullName || item?.name || `行政区域 #${item?.i}`),
    markets: allOption("全部市场", pack.markets, item => normalizeMarketDisplayProperties(item).name),
    goods: allOption("全部商品", pack.goods, item => goodDisplayName(item))
  };
}

function createTradeQueryContext(pack) {
  return {
    pack,
    goodsById: new Map((pack.goods || []).filter(Boolean).map(item => [Number(item.i ?? item.id), item])),
    marketsById: new Map((pack.markets || []).filter(Boolean).map(item => [Number(item.i ?? item.id), item]))
  };
}

function createDealEntry(deal, context) {
  return {
    deal,
    good: context.goodsById.get(Number(deal.good)) || null,
    seller: partyContext(context, deal.sellerType, deal.seller),
    buyer: partyContext(context, deal.buyerType, deal.buyer)
  };
}

function partyContext(context, type, rawId) {
  const {pack, marketsById} = context;
  const id = Number(rawId);
  if (type === "market") {
    const market = marketsById.get(id);
    const burg = pack.burgs?.[market?.centerBurgId];
    const stateId = Number(market?.state || burg?.state || 0);
    const provinceId = provinceForBurg(pack, burg);
    return {
      type: "market",
      id,
      key: `market:${id}`,
      name: normalizeMarketDisplayProperties(market || {i: id}).name,
      stateId,
      stateName: stateName(pack, stateId),
      provinceId,
      provinceName: provinceName(pack, provinceId),
      marketId: market ? id : 0,
      marketName: market ? normalizeMarketDisplayProperties(market).name : "",
      marketCenterCityId: Number(market?.centerBurgId || 0),
      x: market?.x ?? burg?.x,
      y: market?.y ?? burg?.y,
      valid: Boolean(market),
      cityId: Number(market?.centerBurgId || 0)
    };
  }
  const burg = pack.burgs?.[id];
  const stateId = Number(burg?.state || 0);
  const provinceId = provinceForBurg(pack, burg);
  const marketId = Number(burg?.market || 0);
  const market = marketsById.get(marketId);
  return {
    type: "burg",
    id,
    key: `burg:${id}`,
    name: burg?.name || `城镇 #${id}`,
    stateId,
    stateName: stateName(pack, stateId),
    provinceId,
    provinceName: provinceName(pack, provinceId),
    marketId,
    marketName: market ? normalizeMarketDisplayProperties(market).name : "",
    marketCenterCityId: Number(market?.centerBurgId || 0),
    x: burg?.x,
    y: burg?.y,
    valid: Boolean(burg),
    cityId: burg ? id : 0
  };
}

function matchesStructuredQuery(entry, query) {
  if (query.stateId && entry.seller.stateId !== query.stateId && entry.buyer.stateId !== query.stateId) return false;
  if (query.provinceId && entry.seller.provinceId !== query.provinceId && entry.buyer.provinceId !== query.provinceId) return false;
  if (query.marketId && entry.seller.marketId !== query.marketId && entry.buyer.marketId !== query.marketId) return false;
  if (query.goodId && Number(entry.deal.good) !== query.goodId) return false;
  if (query.seller && !partySearchText(entry.seller).includes(query.seller)) return false;
  if (query.buyer && !partySearchText(entry.buyer).includes(query.buyer)) return false;
  return true;
}

function dealSearchText(entry) {
  return [
    entry.deal.i,
    entry.good ? goodDisplayName(entry.good) : `商品 #${entry.deal.good}`,
    entry.seller.name,
    entry.buyer.name,
    entry.seller.stateName,
    entry.buyer.stateName,
    entry.seller.provinceName,
    entry.buyer.provinceName,
    entry.seller.marketName,
    entry.buyer.marketName,
    entry.deal.source,
    entry.deal.sellerType,
    entry.deal.buyerType
  ].join(" ").toLowerCase();
}

function partySearchText(party) {
  return [party.key, party.id, party.name, party.stateName, party.provinceName, party.marketName].join(" ").toLowerCase();
}

function compareDealEntries(left, right, key = "value", direction = "desc") {
  const factor = direction === "asc" ? 1 : -1;
  const a = rawDealSortValue(left.deal, key);
  const b = rawDealSortValue(right.deal, key);
  return compareValues(a, b) * factor || compareValues(left.deal.i, right.deal.i);
}

function rawDealSortValue(deal, key) {
  if (key === "units") return Number(deal?.units || 0);
  if (key === "price") return Number(deal?.price || 0);
  if (key === "distance") return Number(deal?.distance || 0);
  if (key === "distanceCost") return Number(deal?.distanceCost || 0);
  if (key === "routeLabel") return `${partyTypeLabel(deal?.sellerType)} -> ${partyTypeLabel(deal?.buyerType)}`;
  return Number(deal?.units || 0) * Number(deal?.price || 0);
}

function compareValues(a, b) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a ?? "").localeCompare(String(b ?? ""), "zh-CN");
}

function partyTypeLabel(type) {
  return type === "market" ? "市场" : "城镇";
}

function allOption(label, collection, resolveLabel) {
  return [
    {value: "", label},
    ...(collection || []).filter(item => Number(item?.i ?? item?.id) > 0).map(item => ({
      value: Number(item.i ?? item.id),
      label: resolveLabel(item)
    }))
  ];
}

function stateName(pack, id) {
  const state = pack.states?.[id];
  return state?.fullName || state?.name || (id ? `国家 #${id}` : "无国家");
}

function provinceName(pack, id) {
  const province = pack.provinces?.[id];
  return province?.fullName || province?.name || (id ? `行政区域 #${id}` : "无行政区域");
}

function provinceForBurg(pack, burg) {
  if (!burg) return 0;
  return Number(burg.province || pack.cells?.province?.[burg.cell] || 0);
}

function normalizeOptionalId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : 0;
}

function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase();
}
