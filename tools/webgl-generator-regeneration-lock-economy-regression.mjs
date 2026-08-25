#!/usr/bin/env node
import assert from "node:assert/strict";

import {buildEconomy, rebuildEconomyFromMarketAssignments} from "../app/webgl-generator/src/generator/economy.js";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {createApplyMarketAssignmentCommand, createRebuildEconomyCommand} from "../app/webgl-generator/src/runtime/economy-edit-commands.js";

const options = {
  seed: "regeneration-lock-economy",
  cellsTarget: 1600,
  heightmapTemplate: "continents"
};
const report = {ok: true, cases: []};

testPartialLocksAcrossFullBuildAndRebuild();
testSparseIds();
testSingleDomainFullLocks();
testEmptyOwnedMarketLock();
testBypassedGenerationConstraints();
testBothDomainsLockedCommandNoop();
testAssignmentConflictAndFailureRollback();

console.log(JSON.stringify(report, null, 2));

function testPartialLocksAcrossFullBuildAndRebuild() {
  const map = generatePlaceholderMap(options);
  const lockedMarket = structuredClone(map.pack.markets.find(Boolean));
  const lockedDeal = structuredClone(map.pack.deals.find(Boolean));
  const marketCells = ownedCells(map.pack.cells.market, lockedMarket.i);
  const unlockedBefore = unlockedEconomyFingerprint(map.pack, lockedMarket.i, lockedDeal.i);

  buildEconomy(map.pack, {
    ...map.options,
    seed: `${map.options.seed}-full-rebuild`,
    lockedMarkets: [lockedMarket],
    lockedDeals: [lockedDeal]
  });
  assertLockedEconomy(map.pack, lockedMarket, lockedDeal, marketCells);
  assert.notEqual(unlockedEconomyFingerprint(map.pack, lockedMarket.i, lockedDeal.i), unlockedBefore, "full build 后未锁经济对象没有变化");

  const unlockedAfterBuild = unlockedEconomyFingerprint(map.pack, lockedMarket.i, lockedDeal.i);
  const unlockedMarkets = map.pack.markets.filter(market => market?.i && market.i !== lockedMarket.i);
  const reassignedCell = map.pack.cells.i.find(cell => map.pack.cells.market[cell] === unlockedMarkets[0]?.i);
  assert.ok(Number.isInteger(reassignedCell) && unlockedMarkets[1], "缺少未锁市场归属重算样本");
  map.pack.cells.market[reassignedCell] = unlockedMarkets[1].i;
  rebuildEconomyFromMarketAssignments(map.pack, {
    ...map.options,
    seed: `${map.options.seed}-assignment-rebuild`,
    lockedMarkets: [lockedMarket],
    lockedDeals: [lockedDeal]
  });
  assertLockedEconomy(map.pack, lockedMarket, lockedDeal, marketCells);
  assert.notEqual(unlockedEconomyFingerprint(map.pack, lockedMarket.i, lockedDeal.i), unlockedAfterBuild, "assignment rebuild 后未锁经济对象没有变化");
  report.cases.push("partial-full-build-and-rebuild");
}

function testSparseIds() {
  const map = generatePlaceholderMap({...options, seed: `${options.seed}-sparse`});
  const sourceMarket = map.pack.markets.find(Boolean);
  const sourceDeal = map.pack.deals.find(Boolean);
  const oldMarketId = sourceMarket.i;
  const sparseMarketId = 301;
  const sparseDealId = 9001;

  map.pack.markets[oldMarketId] = null;
  sourceMarket.i = sparseMarketId;
  sourceMarket.id = sparseMarketId;
  map.pack.markets[sparseMarketId] = sourceMarket;
  for (const cell of map.pack.cells.i) if (map.pack.cells.market[cell] === oldMarketId) map.pack.cells.market[cell] = sparseMarketId;
  for (const burg of map.pack.burgs || []) if (burg?.market === oldMarketId) burg.market = sparseMarketId;
  for (const deal of map.pack.deals || []) {
    if (deal?.sellerType === "market" && deal.seller === oldMarketId) deal.seller = sparseMarketId;
    if (deal?.buyerType === "market" && deal.buyer === oldMarketId) deal.buyer = sparseMarketId;
  }
  sourceDeal.i = sparseDealId;

  const marketSnapshot = structuredClone(sourceMarket);
  const dealSnapshot = structuredClone(sourceDeal);
  const cellsSnapshot = ownedCells(map.pack.cells.market, sparseMarketId);
  buildEconomy(map.pack, {
    ...map.options,
    seed: `${map.options.seed}-next`,
    lockedMarkets: [marketSnapshot],
    lockedDeals: [dealSnapshot]
  });

  assertLockedEconomy(map.pack, marketSnapshot, dealSnapshot, cellsSnapshot);
  assert.ok(map.pack.markets.some(market => market?.i && market.i !== sparseMarketId), "稀疏市场 ID 约束下没有生成其它市场");
  assert.ok(map.pack.deals.some(deal => deal?.i !== sparseDealId), "稀疏交易 ID 约束下没有生成其它交易");
  assert.equal(new Set(map.pack.deals.map(deal => deal.i)).size, map.pack.deals.length, "交易 ID 发生碰撞");
  report.cases.push("sparse-market-and-deal-ids");
}

function testSingleDomainFullLocks() {
  const marketLockedMap = generatePlaceholderMap({...options, seed: `${options.seed}-all-markets`});
  const markets = marketLockedMap.pack.markets.filter(Boolean).map(market => structuredClone(market));
  const cellsBefore = Array.from(marketLockedMap.pack.cells.market);
  const dealsBefore = JSON.stringify(marketLockedMap.pack.deals);
  buildEconomy(marketLockedMap.pack, {
    ...marketLockedMap.options,
    seed: `${marketLockedMap.options.seed}-next`,
    lockedMarkets: markets
  });
  assert.deepEqual(marketLockedMap.pack.markets.filter(Boolean), markets, "市场全锁时市场快照被改写");
  assert.deepEqual(Array.from(marketLockedMap.pack.cells.market), cellsBefore, "市场全锁时归属 cell 被改写");
  assert.notEqual(JSON.stringify(marketLockedMap.pack.deals), dealsBefore, "市场全锁时未锁交易没有重生成");

  const dealLockedMap = generatePlaceholderMap({...options, seed: `${options.seed}-all-deals`});
  const deals = dealLockedMap.pack.deals.map(deal => structuredClone(deal));
  const recalculatedMarket = dealLockedMap.pack.markets.find(Boolean);
  recalculatedMarket.name = "待重算市场";
  buildEconomy(dealLockedMap.pack, {
    ...dealLockedMap.options,
    seed: `${dealLockedMap.options.seed}-next`,
    lockedDeals: deals
  });
  assert.deepEqual(dealLockedMap.pack.deals, deals, "交易全锁时交易快照被改写");
  assert.ok(dealLockedMap.pack.markets.filter(Boolean).length > 0, "交易全锁时市场重算丢失");
  assert.notEqual(dealLockedMap.pack.markets[recalculatedMarket.i]?.name, "待重算市场", "交易全锁时市场没有重算");
  report.cases.push("single-domain-full-locks");
}

function testEmptyOwnedMarketLock() {
  const map = generatePlaceholderMap({...options, seed: `${options.seed}-empty-owned`});
  const lockedMarket = map.pack.markets.find(Boolean);
  const targetMarket = map.pack.markets.find(market => market?.i && market.i !== lockedMarket.i);
  assert.ok(lockedMarket && targetMarket, "缺少空归属市场锁样本");
  for (const cell of map.pack.cells.i) {
    if (Number(map.pack.cells.market[cell]) === Number(lockedMarket.i)) map.pack.cells.market[cell] = targetMarket.i;
  }
  const snapshot = structuredClone(lockedMarket);
  map.regenerationLocks = {version: 1, entries: [{kind: "economy-market", id: lockedMarket.i}]};
  const command = createRebuildEconomyCommand();
  command.apply({map});
  assert.deepEqual(map.pack.markets[lockedMarket.i], snapshot, "空 owned cells 市场完整快照被改写");
  assert.deepEqual(ownedCells(map.pack.cells.market, lockedMarket.i), [], "空 owned cells 市场被意外分配 cell");
  report.cases.push("empty-owned-market-lock");
}

function testBypassedGenerationConstraints() {
  const map = generatePlaceholderMap({...options, seed: `${options.seed}-bypass`});
  const lockedMarket = map.pack.markets.find(Boolean);
  const lockedDeal = map.pack.deals.find(Boolean);
  const mismatchedCell = map.pack.cells.i.find(cell => Number(cell) !== Number(map.pack.burgs[lockedMarket.centerBurgId]?.cell));
  const disconnectedPair = map.pack.cells.i.find(from =>
    map.pack.cells.i.some(to => to !== from && !(map.pack.cells.c[from] || []).includes(to))
  );
  const disconnectedTarget = map.pack.cells.i.find(to =>
    to !== disconnectedPair && !(map.pack.cells.c[disconnectedPair] || []).includes(to)
  );
  assert.ok(Number.isInteger(mismatchedCell) && Number.isInteger(disconnectedPair) && Number.isInteger(disconnectedTarget), "缺少经济限制直通样本");
  lockedMarket.cell = mismatchedCell;
  lockedDeal.path = [disconnectedPair, disconnectedTarget];
  const marketSnapshot = structuredClone(lockedMarket);
  const dealSnapshot = structuredClone(lockedDeal);
  const marketCells = ownedCells(map.pack.cells.market, lockedMarket.i);
  map.regenerationLocks = {
    version: 1,
    entries: [
      {kind: "economy-market", id: lockedMarket.i},
      {kind: "trade-flow", id: lockedDeal.i}
    ]
  };
  createRebuildEconomyCommand().apply({map});
  assertLockedEconomy(map.pack, marketSnapshot, dealSnapshot, marketCells);
  report.cases.push("bypass-center-and-path-generation-constraints");
}

function testBothDomainsLockedCommandNoop() {
  const map = generatePlaceholderMap({...options, seed: `${options.seed}-both-noop`});
  map.regenerationLocks = {
    version: 1,
    entries: [
      ...map.pack.markets.filter(Boolean).map(market => ({kind: "economy-market", id: market.i})),
      ...map.pack.deals.map(deal => ({kind: "trade-flow", id: deal.i}))
    ]
  };
  const command = createRebuildEconomyCommand();
  assert.equal(command.isNoop({map}), true, "市场与交易双域全锁时 command 未返回 no-op");
  report.cases.push("both-domains-command-noop");
}

function testAssignmentConflictAndFailureRollback() {
  const map = generatePlaceholderMap({...options, seed: `${options.seed}-rollback`});
  const lockedMarket = map.pack.markets.find(Boolean);
  const otherMarket = map.pack.markets.find(market => market?.i && market.i !== lockedMarket.i);
  const lockedCell = map.pack.cells.i.find(cell => map.pack.cells.market[cell] === lockedMarket.i);
  assert.ok(otherMarket && Number.isInteger(lockedCell), "缺少市场归属冲突样本");
  map.regenerationLocks = {version: 1, entries: [{kind: "economy-market", id: lockedMarket.i}]};
  const before = economySnapshot(map);
  const command = createApplyMarketAssignmentCommand([{
    packCell: lockedCell,
    before: lockedMarket.i,
    after: otherMarket.i
  }]);
  assert.throws(
    () => command.apply({map}),
    error => error?.code === "regeneration_lock_conflict" && error?.details?.reason === "locked-market-cells-changed"
  );
  assert.equal(economySnapshot(map), before, "市场归属锁冲突后没有回滚");

  const lockedDeal = map.pack.deals.find(Boolean);
  lockedDeal.path = [-1];
  map.regenerationLocks = {version: 1, entries: [{kind: "trade-flow", id: lockedDeal.i}]};
  const failureBefore = economySnapshot(map);
  const rebuild = createRebuildEconomyCommand();
  assert.throws(
    () => rebuild.apply({map}),
    error => error?.code === "regeneration_lock_conflict" && error?.details?.reason === "invalid-deal-path-cell"
  );
  assert.equal(economySnapshot(map), failureBefore, "交易依赖故障后没有回滚");
  report.cases.push("assignment-conflict-and-failure-rollback");
}

function assertLockedEconomy(pack, market, deal, cells) {
  assert.deepEqual(pack.markets[market.i], market, "锁定市场完整快照被改写");
  assert.deepEqual(pack.deals.find(item => item.i === deal.i), deal, "锁定交易完整快照被改写");
  assert.deepEqual(ownedCells(pack.cells.market, market.i), cells, "锁定市场完整 cell 集合被改写");
}

function ownedCells(values, id) {
  const cells = [];
  for (let cell = 0; cell < values.length; cell++) if (Number(values[cell]) === Number(id)) cells.push(cell);
  return cells;
}

function unlockedEconomyFingerprint(pack, marketId, dealId) {
  return JSON.stringify({
    markets: pack.markets.filter(market => market && market.i !== marketId),
    deals: pack.deals.filter(deal => deal && deal.i !== dealId)
  });
}

function economySnapshot(map) {
  return JSON.stringify({
    marketCells: Array.from(map.pack.cells.market),
    markets: map.pack.markets,
    deals: map.pack.deals,
    burgs: map.pack.burgs,
    states: map.pack.states,
    economy: map.economy
  });
}
