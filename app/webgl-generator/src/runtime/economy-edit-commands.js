import {rebuildEconomyFromMarketAssignments} from "../generator/economy.js";
import {normalizeGoodDisplayPatch, normalizeGoodDisplayProperties, normalizeMarketDisplayPatch, normalizeMarketDisplayProperties} from "../generator/economy-display-properties.js";
import {BRUSH_RADIUS_ID, normalizeBrushRadius} from "./brush-radius-contract.js";
import {systemAffected} from "./edit-command-effects.js";

const ECONOMY_REBUILD_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze([
    "market-ownership",
    "burg-markets",
    "market-production",
    "market-trades",
    "market-prices",
    "state-finance",
    "economy-summary",
    "object-panels"
  ])
});

export const MARKET_ASSIGNMENT_PREVIEW_EFFECTS = Object.freeze({
  render: "draw",
  selection: "none",
  runtimeStats: false,
  pickPanel: true,
  derived: Object.freeze(["market-ownership", "object-panels"])
});

const ECONOMY_DISPLAY_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: false,
  pickPanel: true,
  derived: Object.freeze(["economy-display", "object-panels"])
});

export function createSetGoodDisplayCommand(goodId, patch, {label = "编辑商品展示属性"} = {}) {
  const id = normalizeEconomyObjectId(goodId, "商品");
  let before = null;
  let after = null;
  return {
    label: `${label} #${id}`,
    domain: "economy",
    effects: {...ECONOMY_DISPLAY_EFFECTS, affected: systemAffected("economy-display", [{kind: "good", id}])},
    apply(context) {
      const good = findEconomyObject(context.map?.pack?.goods, id, "商品");
      if (!before) {
        before = normalizeGoodDisplayProperties(good);
        after = normalizeGoodDisplayPatch(good, patch);
      }
      writeEconomyDisplay(context.map, "goods", id, after);
    },
    revert(context) {
      if (!before) throw new Error("缺少可撤销的商品展示属性快照");
      writeEconomyDisplay(context.map, "goods", id, before);
    },
    isNoop(context) {
      const good = findEconomyObject(context.map?.pack?.goods, id, "商品");
      return sameDisplayProperties(normalizeGoodDisplayProperties(good), normalizeGoodDisplayPatch(good, patch));
    },
    getResult() {
      return {goodId: id, display: after ? {...after} : null};
    }
  };
}

export function createSetMarketDisplayCommand(marketId, patch, {label = "编辑市场展示属性"} = {}) {
  const id = normalizeEconomyObjectId(marketId, "市场");
  let before = null;
  let after = null;
  return {
    label: `${label} #${id}`,
    domain: "economy",
    effects: {...ECONOMY_DISPLAY_EFFECTS, affected: systemAffected("economy-display", [{kind: "market", id}])},
    apply(context) {
      const market = findEconomyObject(context.map?.pack?.markets, id, "市场");
      if (!before) {
        before = normalizeMarketDisplayProperties(market);
        after = normalizeMarketDisplayPatch(market, patch);
      }
      writeEconomyDisplay(context.map, "markets", id, after);
    },
    revert(context) {
      if (!before) throw new Error("缺少可撤销的市场展示属性快照");
      writeEconomyDisplay(context.map, "markets", id, before);
    },
    isNoop(context) {
      const market = findEconomyObject(context.map?.pack?.markets, id, "市场");
      return sameDisplayProperties(normalizeMarketDisplayProperties(market), normalizeMarketDisplayPatch(market, patch));
    },
    getResult() {
      return {marketId: id, display: after ? {...after} : null};
    }
  };
}

export function createApplyMarketAssignmentCommand(changes, {label = "应用市场归属"} = {}) {
  const normalized = normalizeMarketAssignmentChanges(changes);
  let beforeSnapshot = null;
  let afterSnapshot = null;
  let result = null;
  return {
    label: `${label} ${normalized.length} cells`,
    domain: "economy",
    effects: {
      ...ECONOMY_REBUILD_EFFECTS,
      affected: systemAffected("market-assignment", normalized.map(change => ({kind: "pack-cell", id: change.packCell})))
    },
    apply(context) {
      if (!beforeSnapshot) {
        beforeSnapshot = captureEconomySnapshot(context.map);
        applyMarketAssignmentChanges(context.map, normalized, "after");
        result = rebuildMapEconomy(context.map);
        afterSnapshot = captureEconomySnapshot(context.map);
      } else {
        restoreEconomySnapshot(context.map, afterSnapshot);
      }
    },
    revert(context) {
      if (!beforeSnapshot) throw new Error("缺少可撤销的市场归属快照");
      restoreEconomySnapshot(context.map, beforeSnapshot);
    },
    isNoop(context) {
      return !normalized.length || normalized.every(change => Number(context.map?.pack?.cells?.market?.[change.packCell] || 0) === change.after);
    },
    getResult() {
      return {changed: normalized.length, ...result};
    },
    getChanges() {
      return normalized;
    }
  };
}

export function createRebuildEconomyCommand({label = "重算经济链"} = {}) {
  let beforeSnapshot = null;
  let afterSnapshot = null;
  let result = null;
  return {
    label,
    domain: "economy",
    effects: {
      ...ECONOMY_REBUILD_EFFECTS,
      affected: systemAffected("economy-rebuild")
    },
    apply(context) {
      if (!beforeSnapshot) {
        beforeSnapshot = captureEconomySnapshot(context.map);
        result = rebuildMapEconomy(context.map);
        afterSnapshot = captureEconomySnapshot(context.map);
      } else {
        restoreEconomySnapshot(context.map, afterSnapshot);
      }
    },
    revert(context) {
      if (!beforeSnapshot) throw new Error("缺少可撤销的经济链快照");
      restoreEconomySnapshot(context.map, beforeSnapshot);
    },
    isNoop(context) {
      return !context.map?.pack?.markets?.some(Boolean);
    },
    getResult() {
      return result;
    }
  };
}

export function inspectMarketAssignment(map, changes) {
  const normalized = normalizeMarketAssignmentChanges(changes);
  const markets = new Map((map?.pack?.markets || []).filter(Boolean).map(market => [Number(market.i ?? market.id), market]));
  const invalid = [];
  const crossState = [];
  const unassignedState = [];
  const water = [];
  for (const change of normalized) {
    const market = markets.get(change.after);
    const cellState = Number(map?.pack?.cells?.state?.[change.packCell] || 0);
    if (!market) invalid.push(change.packCell);
    if ((map?.pack?.cells?.h?.[change.packCell] || 0) < 20) water.push(change.packCell);
    if (!cellState) unassignedState.push(change.packCell);
    else if (market && Number(market.state || 0) > 0 && Number(market.state) !== cellState) crossState.push(change.packCell);
  }
  return {
    valid: normalized.length > 0 && invalid.length === 0 && water.length === 0,
    changed: normalized.length,
    invalidMarketCells: invalid.length,
    invalidMarketExamples: invalid.slice(0, 12),
    waterCells: water.length,
    waterExamples: water.slice(0, 12),
    crossStateCells: crossState.length,
    crossStateExamples: crossState.slice(0, 12),
    unassignedStateCells: unassignedState.length,
    unassignedStateExamples: unassignedState.slice(0, 12),
    requiresWarning: crossState.length > 0 || unassignedState.length > 0
  };
}

export function buildMarketAssignmentChanges(map, marketId, packCellIds) {
  const target = Number(marketId);
  if (!Number.isInteger(target) || target <= 0 || !map?.pack?.markets?.[target]) throw new Error(`找不到目标市场 #${marketId}`);
  const cells = [...new Set((packCellIds || []).map(Number).filter(cell => Number.isInteger(cell) && cell >= 0))];
  if (!cells.length) throw new Error("市场归属 pack cell 列表不能为空");
  return cells.map(packCell => {
    if (packCell >= (map?.pack?.cells?.i?.length || 0)) throw new Error(`pack cell #${packCell} 越界`);
    return {packCell, before: Number(map.pack.cells.market?.[packCell] || 0), after: target};
  }).filter(change => change.before !== change.after);
}

export function getMarketAssignmentBrushChanges(map, point, brush, originals) {
  const target = Number(brush?.targetMarketId);
  if (!Number.isInteger(target) || target <= 0 || !map?.pack?.markets?.[target]) return [];
  const radius = normalizeBrushRadius(BRUSH_RADIUS_ID.ECONOMY_MARKET, brush?.radius);
  const radiusSq = radius * radius;
  const changes = [];
  for (const packCell of map.pack?.cells?.i || []) {
    if ((map.pack.cells.h?.[packCell] || 0) < 20) continue;
    const [x, y] = map.pack.cells.p?.[packCell] || [];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const dx = x - point.x;
    const dy = y - point.y;
    if (dx * dx + dy * dy > radiusSq) continue;
    const current = Number(map.pack.cells.market?.[packCell] || 0);
    if (!originals.has(packCell)) originals.set(packCell, current);
    const before = Number(originals.get(packCell) || 0);
    if (current === target) continue;
    changes.push({packCell, before, after: target});
  }
  return changes;
}

export function applyMarketAssignmentPreview(map, changes) {
  applyMarketAssignmentChanges(map, normalizeMarketAssignmentChanges(changes), "after");
}

export function restoreMarketAssignmentPreview(map, changes) {
  applyMarketAssignmentChanges(map, normalizeMarketAssignmentChanges(changes), "before");
}

function normalizeMarketAssignmentChanges(changes) {
  const byCell = new Map();
  for (const change of changes || []) {
    const packCell = Number(change?.packCell ?? change?.cell);
    const before = Number(change?.before || 0);
    const after = Number(change?.after ?? change?.marketId);
    if (!Number.isInteger(packCell) || packCell < 0 || !Number.isInteger(after) || after <= 0) continue;
    const existing = byCell.get(packCell);
    byCell.set(packCell, {packCell, before: existing?.before ?? before, after});
  }
  return [...byCell.values()].filter(change => change.before !== change.after).sort((a, b) => a.packCell - b.packCell);
}

function writeEconomyDisplay(map, collectionKey, id, display) {
  const collections = [map?.pack?.[collectionKey], map?.economy?.[collectionKey]].filter(Array.isArray);
  const visited = new Set();
  for (const collection of collections) {
    const item = findEconomyObject(collection, id, collectionKey === "goods" ? "商品" : "市场", false);
    if (!item || visited.has(item)) continue;
    Object.assign(item, display);
    visited.add(item);
  }
}

function findEconomyObject(collection, id, label, required = true) {
  const indexed = collection?.[id];
  const item = Number(indexed?.i ?? indexed?.id) === id
    ? indexed
    : (collection || []).find(entry => Number(entry?.i ?? entry?.id) === id);
  if (!item && required) throw new Error(`找不到${label} #${id}`);
  return item || null;
}

function normalizeEconomyObjectId(value, label) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error(`${label} id 无效：${value}`);
  return id;
}

function sameDisplayProperties(left, right) {
  return Object.keys(right).every(key => left[key] === right[key]);
}

function applyMarketAssignmentChanges(map, changes, side) {
  const values = map?.pack?.cells?.market;
  if (!values) throw new Error("当前地图缺少 pack.cells.market");
  for (const change of changes) values[change.packCell] = change[side];
}

function rebuildMapEconomy(map) {
  const economy = rebuildEconomyFromMarketAssignments(map.pack, {
    ...(map.options || map.metadata || {}),
    resourcePopulation: cloneValue(map.economy?.metadata?.resourcePopulation)
  });
  map.economy = economy;
  syncEconomyMirrors(map);
  return {
    markets: Math.max(0, economy.markets.length - 1),
    deals: economy.deals.length,
    assignedMarketCells: economy.metadata.assignedMarketCells,
    burgsWithMarket: economy.metadata.burgsWithMarket,
    statesWithTaxes: economy.metadata.statesWithTaxes
  };
}

function syncEconomyMirrors(map) {
  syncObjectFields(map.pack?.states, map.politics?.states);
  syncObjectFields(map.pack?.provinces, map.politics?.provinces);
  for (const city of map.settlements?.cities || []) {
    if (!city) continue;
    const burg = map.pack?.burgs?.[city.burgId] || (map.pack?.burgs || []).find(item => item?.cityId === city.id);
    if (!burg) continue;
    city.market = burg.market;
    city.production = cloneValue(burg.production);
    city.product = burg.product;
    city.treasury = burg.treasury;
  }
}

function syncObjectFields(source, target) {
  if (!Array.isArray(source) || !Array.isArray(target) || source === target) return;
  for (let index = 0; index < source.length; index++) {
    if (!source[index] || !target[index]) continue;
    for (const key of ECONOMY_OBJECT_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(source[index], key)) target[index][key] = cloneValue(source[index][key]);
      else delete target[index][key];
    }
  }
}

const ECONOMY_OBJECT_FIELDS = Object.freeze([
  "salesTax", "pollTax", "treasury", "resourcePower", "economicPower", "governmentEconomicModifier",
  "governmentTradeModifier", "populationPower", "territoryPower", "settlementPower", "powerScore", "militarySupply"
]);

function captureEconomySnapshot(map) {
  return {
    marketCells: cloneTypedArray(map.pack?.cells?.market),
    markets: cloneValue(map.pack?.markets || []),
    deals: cloneValue(map.pack?.deals || []),
    burgs: cloneValue(map.pack?.burgs || []),
    packStates: cloneValue(map.pack?.states || []),
    packProvinces: cloneValue(map.pack?.provinces || []),
    politicsStates: cloneValue(map.politics?.states || []),
    politicsProvinces: cloneValue(map.politics?.provinces || []),
    cities: cloneValue(map.settlements?.cities || []),
    economy: cloneValue(map.economy || null)
  };
}

function restoreEconomySnapshot(map, snapshot) {
  if (!snapshot) throw new Error("经济链快照无效");
  restoreTypedArray(map.pack.cells, "market", snapshot.marketCells);
  map.pack.markets = cloneValue(snapshot.markets);
  map.pack.deals = cloneValue(snapshot.deals);
  restoreObjectArray(map.pack, "burgs", snapshot.burgs);
  restoreObjectArray(map.pack, "states", snapshot.packStates);
  restoreObjectArray(map.pack, "provinces", snapshot.packProvinces);
  if (map.politics) {
    restoreObjectArray(map.politics, "states", snapshot.politicsStates);
    restoreObjectArray(map.politics, "provinces", snapshot.politicsProvinces);
  }
  if (map.settlements) restoreObjectArray(map.settlements, "cities", snapshot.cities);
  map.economy = cloneValue(snapshot.economy);
}

function restoreObjectArray(owner, key, snapshot) {
  const target = owner[key];
  if (!Array.isArray(target)) {
    owner[key] = cloneValue(snapshot);
    return;
  }
  target.length = snapshot.length;
  for (let index = 0; index < snapshot.length; index++) {
    const source = snapshot[index];
    if (!source || typeof source !== "object") {
      target[index] = source;
      continue;
    }
    if (!target[index] || typeof target[index] !== "object") target[index] = {};
    for (const property of Object.keys(target[index])) delete target[index][property];
    Object.assign(target[index], cloneValue(source));
  }
}

function cloneTypedArray(value) {
  if (!value) return new Uint16Array();
  return typeof value.slice === "function" ? value.slice() : new Uint16Array(value);
}

function restoreTypedArray(owner, key, snapshot) {
  if (owner[key]?.constructor === snapshot.constructor && owner[key].length === snapshot.length) owner[key].set(snapshot);
  else owner[key] = cloneTypedArray(snapshot);
}

function cloneValue(value) {
  return value === undefined ? undefined : structuredClone(value);
}
