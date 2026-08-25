#!/usr/bin/env node
import {strict as assert} from "node:assert";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {
  buildMarketAssignmentChanges,
  createApplyMarketAssignmentCommand,
  createRebuildEconomyCommand
} from "../app/webgl-generator/src/runtime/economy-edit-commands.js";
import {normalizeRegenerationWorkingCopy} from "../app/webgl-generator/src/runtime/regeneration-working-copy.js";

const map = generatePlaceholderMap({
  seed: "regeneration-working-copy",
  cellsTarget: 3000,
  heightmapTemplate: "continents"
});
const markerPrimary = structuredClone(map.markers.markers);
const packState = map.pack.states.find(state => state?.i && !state.removed);
const staleProvinceId = map.pack.provinces.find(province => province?.i && Number(province.state) !== Number(packState.i))?.i;
assert(packState && staleProvinceId, "working copy 夹具缺少国家 / 省份样本");

map.politics.states = structuredClone(map.pack.states);
map.politics.states[packState.i].name = "旧 politics 漂移";
map.politics.provinces = structuredClone(map.pack.provinces);
map.pack.states[packState.i].provinces = [staleProvinceId];
delete map.pack.states[packState.i].military;
map.pack.markers = structuredClone(markerPrimary);
const marker = map.pack.markers.find(Boolean);
if (marker) marker.packCell = Number(marker.packCell || 0) + 1;
map.pack.cultures = structuredClone(map.society.cultures);
map.pack.religions = structuredClone(map.society.religions);
map.pack.zones = structuredClone(map.zones.zones);
if (map.zones.zones[0]) map.zones.zones[0].cells = [-1, -1];
const activeZone = map.zones.zones.find(zone => zone?.i && !zone.removed);
if (activeZone) activeZone.cells = [activeZone.cells?.[0] ?? 0, activeZone.cells?.[0] ?? 0, map.pack.cells.i.length + 1];
map.options.diplomacyRegenerationSalt = 2;
map.metadata.regeneration ||= {};
map.metadata.regeneration.diplomacy = 7;

const invalidMarket = map.pack.markets.find(Boolean);
assert(invalidMarket, "working copy 夹具缺少市场");
invalidMarket.centerBurgId = map.pack.burgs.length + 100;
map.economy.markets = structuredClone(map.pack.markets);
map.economy.markets[invalidMarket.i].name = "旧 economy 漂移";
map.pack.cells.market = Array.from(map.pack.cells.market);

normalizeRegenerationWorkingCopy(map);
assert.equal(map.politics.states, map.pack.states, "state 镜像未收敛为共享 canonical store");
assert.equal(map.politics.provinces, map.pack.provinces, "province 镜像未收敛为共享 canonical store");
assert.notEqual(map.pack.states[packState.i].name, "旧 politics 漂移", "旧 politics 漂移覆盖了 pack canonical state");
assert(Array.isArray(map.pack.states[packState.i].military), "旧国家缺失 military 数组未回填");
assert(map.pack.states[packState.i].provinces.every(id => Number(map.pack.provinces[id]?.state) === Number(packState.i)), "state.provinces 仍包含错误父国引用");
assert.equal(map.markers.markers, map.pack.markers, "marker 镜像未收敛为共享 canonical store");
assert.equal(map.pack.markers.find(Boolean)?.packCell, markerPrimary.find(Boolean)?.packCell, "pack marker 漂移覆盖了 marker canonical store");
assert.equal(map.society.cultures, map.pack.cultures, "culture 镜像未收敛");
assert.equal(map.society.religions, map.pack.religions, "religion 镜像未收敛");
assert.equal(map.zones.zones, map.pack.zones, "zone 镜像未收敛");
assert.equal(map.economy.goods, map.pack.goods, "good 镜像未收敛");
assert.equal(map.economy.markets, map.pack.markets, "market 镜像未收敛");
assert.equal(map.economy.deals, map.pack.deals, "deal 镜像未收敛");
assert.notEqual(map.pack.markets[invalidMarket.i].name, "旧 economy 漂移", "旧 economy 漂移覆盖了 pack canonical market");
assert.deepEqual(map.zones.zones[0]?.cells || [], [], "zone 根槽未归一为空 cells");
if (activeZone) assert(activeZone.cells.every((cell, index, cells) => cell >= 0 && cell < map.pack.cells.i.length && cells.indexOf(cell) === index), "旧 zone cells 未去重 / 去越界");
assert.equal(map.options.diplomacyRegenerationSalt, 7, "外交 option salt 未收敛");
assert.equal(map.metadata.regeneration.diplomacy, 7, "外交 metadata salt 未收敛");
assert(map.pack.burgs[invalidMarket.centerBurgId]?.i, "旧市场失效中心未迁移到有效城市");

const beforeRebuild = structuredClone(map);
const rebuild = createRebuildEconomyCommand();
rebuild.apply({map});
assert(rebuild.getResult()?.markets > 0, "旧普通数组经济链未成功重算");
rebuild.revert({map});
assert.deepEqual(map, beforeRebuild, "经济链撤销没有恢复旧普通数组 before-image");
assert(Array.isArray(map.pack.cells.market), "经济链撤销改变了旧 market cells 容器类型");

const targetMarket = map.pack.markets.find(Boolean);
const targetMarketId = Number(targetMarket.i ?? targetMarket.id);
const targetCell = map.pack.cells.i.find(cell => Number(map.pack.cells.market[cell] || 0) !== targetMarketId && Number(map.pack.cells.h[cell]) >= 20);
assert(Number.isInteger(targetCell), "working copy 夹具缺少可改派市场单元");
const assignmentBefore = structuredClone(map);
const assignment = createApplyMarketAssignmentCommand(buildMarketAssignmentChanges(map, targetMarketId, [targetCell]));
assignment.apply({map});
assert.equal(Number(map.pack.cells.market[targetCell]), targetMarketId, "市场单元改派未提交");
assignment.revert({map});
assert.deepEqual(map, assignmentBefore, "市场单元改派撤销没有恢复 before-image");

console.log(JSON.stringify({
  ok: true,
  mirrors: ["states", "provinces", "markers", "cultures", "religions", "zones", "goods", "markets", "deals"],
  diplomacySalt: 7,
  economy: {plainArrayRollback: true, marketAssignmentRollback: true}
}, null, 2));
