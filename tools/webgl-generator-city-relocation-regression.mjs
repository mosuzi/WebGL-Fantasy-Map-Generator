#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {reexpandPackPoliticsPreservingIdentity} from "../app/webgl-generator/src/generator/politics.js";
import {rebuildRelocatedPopulationPointsAsync} from "../app/webgl-generator/src/generator/settlements.js";
import {createMoveCityCommand, inspectCityMove, inspectCityMoveAsync, inspectCityMoveFast} from "../app/webgl-generator/src/runtime/city-relocation.js";
import {bindCityRelocationDrag, resolveCityRelocationPointerCityId} from "../app/webgl-generator/src/runtime/city-relocation-drag.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {burgIdsAtPackCell, cityIdsAtGridCell, routesAtCity} from "../app/webgl-generator/src/runtime/settlement-cell-index.js";
import {API_METHODS} from "../app/webgl-generator/src/runtime/api-contract.js";
import {createMapDocument, parseMapDocument, stringifyMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {getCellSnapshot} from "../app/webgl-generator/src/runtime/cell-query-api.js";
import {captureLockedRegenerationObjects} from "../app/webgl-generator/src/runtime/regeneration-lock-protection.js";

const base = sampleMap();
const pureBefore = structuredClone(base);
const sameState = inspectCityMove(base, 1, {gridCell: 1, packCell: 1});
assert.equal(sameState.valid, true);
assert.deepEqual(base, pureBefore, "只读预检不得修改地图");
assert.deepEqual(sameState.owners.after, {state: 1, province: 1, culture: 2, religion: 2});
assert.equal(sameState.port.status, "kept");
assert.equal(base.pack.cells.harbor[1], 5, "同 cell 港口样本必须覆盖 harbor > 1");
assert.equal(sameState.routes.rerouted, 2);

const crossState = inspectCityMove(base, 1, {gridCell: 2, packCell: 2});
assert.equal(crossState.valid, true, "普通城市允许迁国");
assert.equal(crossState.owners.after.state, 2);
const crossProvince = inspectCityMove(base, 1, {gridCell: 3, packCell: 3});
assert.equal(crossProvince.valid, true, "普通城市允许迁省");
assert.equal(crossProvince.owners.after.province, 2);
assert.equal(crossProvince.port.status, "cleared");
assert.equal(crossProvince.routes.deleted, 1);
assert.match(crossProvince.warnings.join(" "), /海路/);

assert.equal(inspectCityMove(base, 1, {gridCell: 4, packCell: 4}).valid, false, "水域必须拒绝");
const refinedBoundaryMap = sampleMap();
refinedBoundaryMap.pack.cells.h[2] = 10;
assert.equal(
  inspectCityMove(refinedBoundaryMap, 1, {gridCell: 2, packCell: 2}).valid,
  true,
  "100k 细分后的可见 grid 陆地与旧 pack 高度不一致时，应以实际渲染的 grid 地形为准"
);
refinedBoundaryMap.grid.cells.h[2] = 10;
refinedBoundaryMap.pack.cells.h[2] = 30;
assert.equal(
  inspectCityMove(refinedBoundaryMap, 1, {gridCell: 2, packCell: 2}).valid,
  false,
  "100k 细分后的可见 grid 水域不得被旧 pack 陆地误放行"
);
const occupiedPreview = inspectCityMove(base, 1, {gridCell: 7, packCell: 7, x: 0.15, y: -0.85});
assert.equal(occupiedPreview.valid, true, "用户主动移动必须允许同 cell 多城");
assert.deepEqual(occupiedPreview.occupancy.cityIds, [2]);
assert.equal(inspectCityMove(base, 1, {gridCell: 99}).code, "missing-cell-mapping");

const capitalMap = sampleMap();
capitalMap.settlements.cities[1].capital = true;
capitalMap.pack.burgs[1].capital = 1;
for (const states of [capitalMap.politics.states, capitalMap.pack.states]) {
  Object.assign(states[1], {capital: 1, center: 0, gridCenter: 0});
  Object.assign(states[2], {capital: 0, center: 2, gridCenter: 2});
}
const capitalPreview = inspectCityMove(capitalMap, 1, {gridCell: 2, packCell: 2});
assert.equal(capitalPreview.valid, true, "首都允许跨国移动");
assert.equal(capitalPreview.politics.sourceStateReplacementCityId, 3);
assert.equal(capitalPreview.politics.targetStatePromotion, true);
new EditHistory().execute(createMoveCityCommand(1, capitalPreview.target, {preflight: capitalPreview}), {map: capitalMap});
assert.equal(capitalMap.politics.states[1].capital, 3, "原国家应重选首都");
assert.equal(capitalMap.politics.states[2].capital, 1, "无首都的目标国家应接纳迁入首都");
assert.equal(capitalMap.settlements.cities[3].capital, true);
const provincialMap = sampleMap();
provincialMap.settlements.cities[1].provincial = true;
provincialMap.pack.burgs[1].provincial = 1;
for (const provinces of [provincialMap.politics.provinces, provincialMap.pack.provinces]) {
  Object.assign(provinces[1], {burg: 1, center: 0, gridCenter: 0, state: 1});
  Object.assign(provinces[2], {burg: 0, center: 3, gridCenter: 3, state: 1});
}
const provincialPreview = inspectCityMove(provincialMap, 1, {gridCell: 3, packCell: 3});
assert.equal(provincialPreview.valid, true, "省会允许跨省移动");
assert.equal(provincialPreview.politics.sourceProvinceReplacementCityId, 3);
assert.equal(provincialPreview.politics.targetProvincePromotion, true);
new EditHistory().execute(createMoveCityCommand(1, provincialPreview.target, {preflight: provincialPreview}), {map: provincialMap});
assert.equal(provincialMap.politics.provinces[1].burg, 3, "原省份应重选省会");
assert.equal(provincialMap.politics.provinces[2].burg, 1, "无省会的目标省份应接纳迁入省会");
const marketGateMap = sampleMap({marketCenter: true});
assert.equal(inspectCityMove(marketGateMap, 1, {gridCell: 2, packCell: 2}).valid, true, "市场中心不得阻止用户移动");

const changedFeature = inspectCityMove(base, 1, {gridCell: 8, packCell: 8});
assert.equal(changedFeature.valid, true);
assert.equal(changedFeature.port.status, "changed-feature");
assert.equal(changedFeature.port.feature, 11);
assert.equal(changedFeature.routes.deleted, 1, "改连其它水体时原海路应明示删除");

const quotaExcludedPortMap = sampleMap();
quotaExcludedPortMap.pack.cells.f[4] = 11;
quotaExcludedPortMap.pack.cells.haven[6] = undefined;
quotaExcludedPortMap.pack.cells.haven[7] = undefined;
quotaExcludedPortMap.pack.cells.harbor[8] = 7;
quotaExcludedPortMap.settlements.cities[1].port = 11;
quotaExcludedPortMap.pack.burgs[1].port = 11;
const quotaSeaRoute = quotaExcludedPortMap.settlements.routes.find(route => route.id === 1);
Object.assign(quotaSeaRoute, {
  feature: 11,
  cells: [5, 4],
  packCells: [5, 4],
  points: [quotaExcludedPortMap.pack.cells.p[5], quotaExcludedPortMap.pack.cells.p[4]]
});
assert.equal(quotaExcludedPortMap.pack.cells.burg[8], 0);
assert.equal(quotaExcludedPortMap.grid.cells.burg[8], -1);
assert.equal(quotaExcludedPortMap.pack.features[quotaExcludedPortMap.pack.cells.f[quotaExcludedPortMap.pack.cells.haven[8]]].type, "ocean");
assert(quotaExcludedPortMap.grid.cells.temp[quotaExcludedPortMap.pack.cells.g[8]] > 0);
assert.equal(
  quotaExcludedPortMap.pack.burgs.filter(burg => burg?.i && burg.i !== 1 && quotaExcludedPortMap.pack.cells.haven[burg.cell] && quotaExcludedPortMap.pack.cells.f[quotaExcludedPortMap.pack.cells.haven[burg.cell]] === 11 && quotaExcludedPortMap.pack.cells.harbor[burg.cell]).length,
  0,
  "目标 feature 除迁移城市外不得有第二个生成器港口候选"
);
const quotaExcludedPreview = inspectCityMove(quotaExcludedPortMap, 1, {gridCell: 8, packCell: 8});
assert.equal(quotaExcludedPreview.valid, true);
assert.equal(quotaExcludedPreview.port.feature, 11, "合法目标不能因生成器配额未选中而清港");
assert.equal(quotaExcludedPreview.port.status, "kept");
assert.equal(quotaExcludedPreview.routes.items.find(route => route.id === 1)?.action, "reroute", "兼容海路应局部重寻而非误删");
assert.equal(quotaExcludedPreview.routes.deleted, 0);
const nonPortMap = sampleMap();
nonPortMap.settlements.cities[1].port = 0;
nonPortMap.pack.burgs[1].port = 0;
assert.equal(inspectCityMove(nonPortMap, 1, {gridCell: 1, packCell: 1}).port.status, "unchanged-non-port");
assert.deepEqual(inspectCityMoveFast(nonPortMap, 1, {gridCell: 7, packCell: 7, x: 0.15, y: -0.85}).target.point, [0.15, -0.85], "非港口目标应保留用户精确坐标");

const unreachable = sampleMap();
unreachable.pack.cells.c[1] = [4];
unreachable.pack.cells.c[0] = [3, 7];
const failedRoad = inspectCityMove(unreachable, 1, {gridCell: 1, packCell: 1});
assert.equal(failedRoad.valid, true, "路线重寻失败不得阻止城市移动");
assert(failedRoad.routes.items.some(route => route.action === "delete"));
assert.match(failedRoad.warnings.join(" "), /删除|待重算/);

const moved = sampleMap({marketCenter: true, routeNote: true});
const before = structuredClone(moved);
const movedRootReference = moved;
const movedGridReference = moved.grid;
const movedPackReference = moved.pack;
const movedOptionsReference = moved.options;
const unrelatedCityReference = moved.settlements.cities[2];
const unrelatedBurgReference = moved.pack.burgs[2];
const unrelatedRouteReference = moved.settlements.routes.find(route => route.id === 2);
const politicsStatesReference = moved.politics.states;
const packStatesReference = moved.pack.states;
const politicsStateObjectReference = moved.politics.states[1];
const packStateObjectReference = moved.pack.states[1];
const history = new EditHistory();
const command = createMoveCityCommand(1, {gridCell: 3, packCell: 3});
assert.equal(command.isNoop({map: moved}), false);
history.execute(command, {map: moved});
const result = command.getResult();
assert.equal(history.getStats().undo, 1);
assert.equal(moved.settlements.cities[1].cell, 3);
assert.equal(moved.settlements.cities[1].packCell, 3);
assert.equal(moved.pack.burgs[1].cell, 3);
assert.equal(moved.grid.cells.burg[0], -1);
assert.equal(moved.grid.cells.burg[3], 1);
assert.equal(moved.pack.cells.burg[0], 0);
assert.equal(moved.pack.cells.burg[3], 1);
assert.deepEqual(
  pickOwners(moved.settlements.cities[1]),
  {state: 1, province: 2, culture: 3, religion: 3},
  "四类归属应跟随目标 cell"
);
assert.deepEqual(pickOwners(moved.pack.burgs[1]), pickOwners(moved.settlements.cities[1]), "city / burg 归属镜像不一致");
assert.equal(moved.settlements.cities[1].name, "甲城");
assert.equal(moved.settlements.cities[1].population, 12);
assert.equal(moved.settlements.cities[1].visual.manual, true, "手工 visual 应保留");
assert.equal(moved.settlements.cities[1].port, 0);
assert.equal(moved.settlements.routes.some(route => route.id === 1), false, "失效海路未删除");
assert.equal(moved.notes.notes.some(note => note.id === "route:1"), false, "删除海路遗留备注孤儿");
assert.deepEqual(moved.settlements.routes.find(route => route.id === 2), before.settlements.routes.find(route => route.id === 2), "无关路线被改写");
assert.equal(moved.pack.routes.some(route => route?.i === 1), false, "pack.routes 遗留已删除海路");
assert.equal(Object.values(moved.pack.cells.routes).some(links => Object.values(links).includes(1)), false, "pack route links 遗留已删除海路");
assert.equal(moved.pack.markets[1].cell, 3);
assert.equal(moved.economy.markets[1].cell, 3);
assert.equal(moved.pack.cells.market[0], 0, "市场中心迁出后源 cell 不得保留陈旧 singular 代表");
assert.equal(moved.pack.cells.market[3], 1);
assert.equal(moved.pack.burgs[1].market, 1);
assert.equal(moved.pack.burgs[1].plaza, 1);
assert.deepEqual(moved.metadata.derivedStale.systems, ["economy", "diplomacy", "military", "zones", "population-points"]);
assert.equal(moved.economy.metadata.stale, true);
assert.equal(moved.diplomacy.metadata.stale, true);
assert.equal(moved.military.metadata.stale, true);
assert.equal(moved.zones.metadata.stale, true);
assert.equal(moved.settlements.metadata.ports, 1);
assert.equal(result.routes.deleted, 1);
assert(command.effects.derived.includes("route-mesh"));
assert(command.effects.affected.some(target => target.kind === "city" && target.id === 1));
assert(command.effects.affected.some(target => target.kind === "route" && target.id === 1));

const after = structuredClone(moved);
const optionsReference = moved.options;
history.undo({map: moved});
assert.deepEqual(moved, before, "撤销未恢复完整地图");
assert.equal(moved.options, optionsReference, "撤销破坏 options 引用");
history.redo({map: moved});
assert.deepEqual(moved, after, "重做未精确复用 after 快照");
assert.equal(moved.options, optionsReference, "重做破坏 options 引用");
assert.equal(moved, movedRootReference, "命令替换了 map 根对象");
assert.equal(moved.grid, movedGridReference, "命令替换了无关 grid 引用");
assert.equal(moved.pack, movedPackReference, "命令替换了 pack 根引用");
assert.equal(moved.options, movedOptionsReference, "命令替换了无关 options 引用");
assert.equal(moved.settlements.cities[2], unrelatedCityReference, "命令替换了无关城市引用");
assert.equal(moved.pack.burgs[2], unrelatedBurgReference, "命令替换了无关 burg 引用");
assert.equal(moved.settlements.routes.find(route => route.id === 2), unrelatedRouteReference, "命令替换了无关路线引用");
assert.equal(moved.politics.states, politicsStatesReference);
assert.equal(moved.pack.states, packStatesReference);
assert.equal(moved.politics.states[1], politicsStateObjectReference, "独立 politics state 对象引用被替换");
assert.equal(moved.pack.states[1], packStateObjectReference, "独立 pack state 对象引用被替换");
assert.notEqual(moved.politics.states[1], moved.pack.states[1], "独立政治镜像被错误合并");

const ordinaryPlazaMap = sampleMap();
ordinaryPlazaMap.pack.burgs[1].plaza = 1;
ordinaryPlazaMap.settlements.cities[1].plaza = 1;
new EditHistory().execute(createMoveCityCommand(1, {gridCell: 3, packCell: 3}), {map: ordinaryPlazaMap});
assert.equal(ordinaryPlazaMap.pack.burgs[1].plaza, 0, "非市场中心城市不得保留 plaza 标志");
assert.equal(ordinaryPlazaMap.settlements.cities[1].plaza, 0);

const failureMap = sampleMap();
const failureBefore = structuredClone(failureMap);
const failureHistory = new EditHistory();
assert.throws(() => failureHistory.execute(createMoveCityCommand(1, {gridCell: 1, packCell: 1}, {
  faultInjector(stage) {
    if (stage === "after-routes") throw new Error("注入写入失败");
  }
}), {map: failureMap}), /注入写入失败/);
assert.deepEqual(failureMap, failureBefore, "故障注入后留下半移动状态");
assert.equal(failureHistory.getStats().undo, 0);

const document = parseMapDocument(stringifyMapDocument(createMapDocument(moved, moved.options)));
assert.equal(document.map.settlements.cities[1].cell, 3);
assert.equal(document.map.pack.burgs[1].cell, 3);
assert.equal(document.map.pack.cells.burg[3], 1);
assert.equal(document.map.metadata.derivedStale.systems.includes("economy"), true);
assert.equal(Object.prototype.hasOwnProperty.call(document.map, "cityRelocation"), false, "完整地图不应新增强制 schema 字段");
const oldMap = sampleMap();
delete oldMap.metadata.derivedStale;
delete oldMap.economy.metadata.stale;
const oldPreview = inspectCityMove(oldMap, 1, {gridCell: 1, packCell: 1});
assert.equal(oldPreview.valid, true, "旧图缺少新状态字段时仍应可预检");

const crossStateRoundtrip = roundtripMap(sampleMap());
assert.notEqual(crossStateRoundtrip.politics.states, crossStateRoundtrip.pack.states, "往返后 state 双镜像应为不同引用");
new EditHistory().execute(createMoveCityCommand(1, {gridCell: 2, packCell: 2}), {map: crossStateRoundtrip});
assertPoliticalStatsMirrored(crossStateRoundtrip, "states", [1, 2]);
assert.deepEqual(
  crossStateRoundtrip.politics.states.slice(1).map(state => ({burgs: state.burgs, urban: state.urban})),
  [{burgs: 2, urban: 14}, {burgs: 1, urban: 12}],
  "跨国移动未重算国家 burgs / urban"
);
for (const id of [1, 2]) {
  assert.deepEqual(crossStateRoundtrip.politics.states[id].civilizationProfile, crossStateRoundtrip.pack.states[id].civilizationProfile);
  assert.equal(crossStateRoundtrip.politics.states[id].civilizationType, crossStateRoundtrip.pack.states[id].civilizationType);
  assert.equal(crossStateRoundtrip.politics.states[id].civilizationLabel, crossStateRoundtrip.pack.states[id].civilizationLabel);
}

const crossProvinceRoundtrip = roundtripMap(sampleMap());
assert.notEqual(crossProvinceRoundtrip.politics.provinces, crossProvinceRoundtrip.pack.provinces, "往返后 province 双镜像应为不同引用");
new EditHistory().execute(createMoveCityCommand(1, {gridCell: 3, packCell: 3}), {map: crossProvinceRoundtrip});
assertPoliticalStatsMirrored(crossProvinceRoundtrip, "provinces", [1, 2]);
assert.deepEqual(
  crossProvinceRoundtrip.politics.provinces.slice(1).map(province => ({burgs: province.burgs, urban: province.urban})),
  [{burgs: 2, urban: 14}, {burgs: 1, urban: 12}],
  "跨省移动未重算省份 burgs / urban"
);

const sharedPoliticalMap = sampleMap();
sharedPoliticalMap.politics.states = sharedPoliticalMap.pack.states;
sharedPoliticalMap.politics.provinces = sharedPoliticalMap.pack.provinces;
const sharedStatesReference = sharedPoliticalMap.pack.states;
const sharedStateReference = sharedPoliticalMap.pack.states[1];
const sharedProvincesReference = sharedPoliticalMap.pack.provinces;
const sharedHistory = new EditHistory();
sharedHistory.execute(createMoveCityCommand(1, {gridCell: 3, packCell: 3}), {map: sharedPoliticalMap});
sharedHistory.undo({map: sharedPoliticalMap});
sharedHistory.redo({map: sharedPoliticalMap});
assert.equal(sharedPoliticalMap.politics.states, sharedStatesReference, "共享 state 数组别名被破坏");
assert.equal(sharedPoliticalMap.pack.states[1], sharedStateReference, "共享 state 对象引用被替换");
assert.equal(sharedPoliticalMap.politics.provinces, sharedProvincesReference, "共享 province 数组别名被破坏");

runDragLifecycleRegression();
runOverlappingCityPointerRegression();
await runPendingDragRegression();
runMultiSettlementCellRegression();
await runAsyncPreflightRegression();
await runRouteAdjacencyCancellationRegression();
await runPopulationPointTopKRegression();

const fullMap = generatePlaceholderMap({seed: "city-relocation-full-map", cellsTarget: 5000, heightmapTemplate: "continents"});
const realHarborCity = fullMap.settlements.cities.find(city => city && !city.capital && city.port && Number(fullMap.pack.cells.harbor?.[city.packCell]) > 0);
assert(realHarborCity, "完整生成地图没有非首都有效 harbor 港城样本");
const realHarborPreview = inspectCityMove(fullMap, realHarborCity.id, {gridCell: realHarborCity.cell, packCell: realHarborCity.packCell});
assert.equal(realHarborPreview.port.status, "kept", "既有非首都有效 harbor 港口原位预检不得清除");
const fullTarget = findFullMapPopulationMove(fullMap);
assert(fullTarget, "完整生成地图没有找到可验收的城市移动落点");
const populationPointBefore = structuredClone(fullMap.settlements.populationPoints.find(point => point.cell === fullTarget.target.gridCell));
assert(populationPointBefore, "完整地图移动目标必须是既有农村人口点");
const unrelatedPayload = {large: new Uint8Array(8_000_000), nonCloneable() { return true; }};
const unrelatedPayloadArray = unrelatedPayload.large;
fullMap.unrelatedPayload = unrelatedPayload;
const fullMapOptionsReference = fullMap.options;
const fullMapHeightReference = fullMap.grid.cells.h;
const fullHistory = new EditHistory();
const fullCommand = createMoveCityCommand(fullTarget.cityId, fullTarget.target);
const executeStarted = performance.now();
fullHistory.execute(fullCommand, {map: fullMap});
const executeMs = performance.now() - executeStarted;
const fullResult = fullCommand.getResult();
assert.equal(fullMap.unrelatedPayload, unrelatedPayload);
assert.equal(fullMap.unrelatedPayload.large, unrelatedPayloadArray);
assert.equal(fullMap.metadata.derivedStale.systems.includes("population-points"), true, "局部事务必须标记农村人口点待异步重建");
const undoStarted = performance.now();
fullHistory.undo({map: fullMap});
const undoMs = performance.now() - undoStarted;
assert.deepEqual(fullMap.settlements.populationPoints.find(point => point.cell === fullTarget.target.gridCell), populationPointBefore, "撤销未恢复农村人口点");
assert.equal(fullMap.unrelatedPayload, unrelatedPayload, "撤销替换了有界范围外 payload");
const redoStarted = performance.now();
fullHistory.redo({map: fullMap});
const redoMs = performance.now() - redoStarted;
assert.equal(fullMap.metadata.derivedStale.systems.includes("population-points"), true, "重做未恢复农村人口点待重建标志");
assert.equal(fullMap.unrelatedPayload, unrelatedPayload, "重做替换了有界范围外 payload");
assert.equal(fullMap.options, fullMapOptionsReference);
assert.equal(fullMap.grid.cells.h, fullMapHeightReference);
for (const [action, duration] of Object.entries({execute: executeMs, undo: undoMs, redo: redoMs})) assert(duration < 250, `${action} 有界事务耗时 ${duration.toFixed(1)}ms 超过 250ms`);
delete fullMap.unrelatedPayload;
const fullRoundtrip = parseMapDocument(stringifyMapDocument(createMapDocument(fullMap, fullMap.options)));
assert.equal(fullRoundtrip.map.settlements.cities[fullTarget.cityId].packCell, fullResult.target.packCell);
assert.equal(fullRoundtrip.map.pack.burgs[fullResult.burgId].cell, fullResult.target.packCell);
assert.equal(fullRoundtrip.map.pack.cells.burg[fullResult.target.packCell], fullResult.burgId);
assert.equal(Object.prototype.hasOwnProperty.call(fullRoundtrip.map, "cityRelocation"), false);

const [appSource, panelSource, panelVueSource, consoleSource, settlementsSource, cityRelocationSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/panels/city-panel.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/CityPanel.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/console-api.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/generator/settlements.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/city-relocation.js", import.meta.url), "utf8")
]);
const relocationPortSource = settlementsSource.match(/export function inspectRelocatedSettlementPort[\s\S]+?\n}\n\nexport function refreshRelocatedSettlementDerived/)?.[0] || "";
assert(relocationPortSource);
assert.doesNotMatch(relocationPortSource, /selectPortCandidates/, "城市迁移港口不得重新参加生成器全图配额");
assert.doesNotMatch(cityRelocationSource, /structuredClone\((?:context\.)?map\)|cloneValue\((?:context\.)?map\)|restoreMap/, "城市移动不得克隆或重建整张 map");
assert.match(cityRelocationSource, /captureCityMoveSnapshot\(context\.map, inspection\)/);
assert.match(cityRelocationSource, /restoreCityMoveSnapshot\(context\.map, after\)/);
assert.match(appSource, /CITY_MOVE: "city:move"/);
assert.match(appSource, /bindCityRelocationDrag\(canvas/);
assert.match(appSource, /if \(activeModeId\) return cancelCanvasToolMode\(state, documentRef, activeModeId, "escape"\)/);
assert.match(appSource, /register\(CANVAS_TOOL_MODE\.CITY_MOVE, "city-panel"/);
assert.match(appSource, /selectionStore\.setSelection\(\{object: \{kind: OBJECT_KIND\.CITY, id(?:: cityId)?\}\}\)|selectionStore\.setSelection\(\{object: \{kind: OBJECT_KIND\.CITY, id\}\}\)/);
assert.match(appSource, /onPointerMiss: \(\) => \{\s*cancelCanvasToolModeAfterPointerMiss\(state, documentRef, CANVAS_TOOL_MODE\.CITY_MOVE\)/);
assert.match(appSource, /function cancelCanvasToolModeAfterPointerMiss[\s\S]+?requestAnimationFrame\(\(\) => \{[\s\S]+?updateEditingInteractionLock[\s\S]+?updateRuntimePanel/);
assert.doesNotMatch(appSource, /completeCanvasToolMode\(state, documentRef, CANVAS_TOOL_MODE\.CITY_MOVE/);
assert.match(appSource, /state\.panels\.city\?\.updateMovePreview\?\.\(null\);\s*showCityMoveStartHandle\(state, cityId\)/);
assert.match(panelSource, /moveMode: false/);
assert.match(panelSource, /updateMovePreview/);
assert.match(panelVueSource, /提交后可继续拖动|连续拖动城市到目标 cell/);
assert.match(panelVueSource, /退出移动城市/);
assert.match(consoleSource, /actions\.edit\?\.cities\?\.inspectMove/);
assert.match(consoleSource, /"cities\.inspectMove": \{stable: "draft", mutates: "none", undoable: false/);
assert.match(consoleSource, /"cities\.move": \{stable: "draft", mutates: "settlements-routes", undoable: true/);
assert(API_METHODS.edit.includes("cities.inspectMove"));
assert(API_METHODS.edit.includes("cities.move"));

console.log(JSON.stringify({
  ok: true,
  preview: {
    sameState: sameState.summary,
    crossState: crossState.summary,
    crossProvince: crossProvince.summary,
    portKept: sameState.port.status,
    portChanged: changedFeature.port.status,
    portCleared: crossProvince.port.status
  },
  routes: result.routes,
  history: history.getStats(),
  stale: moved.metadata.derivedStale.systems,
  fullMap: {cityId: fullTarget.cityId, target: fullResult.target, history: fullHistory.getStats(), performanceMs: {execute: roundMs(executeMs), undo: roundMs(undoMs), redo: roundMs(redoMs)}},
  publicEditMethods: API_METHODS.edit.length
}, null, 2));

function sampleMap({marketCenter = false, routeNote = false} = {}) {
  const points = [[0, 0], [1, 0], [0, 1], [-1, 0], [1, 1], [2, 1], [3, 1], [0, -1], [2, 0]];
  const adjacency = [[1, 2, 3, 7], [0, 4], [0], [0, 8], [1, 5], [4, 6, 8], [5], [0], [3, 5]];
  const burgs = [null,
    {i: 1, id: 1, cityId: 1, cell: 0, x: 0, y: 0, state: 1, province: 1, culture: 1, religion: 1, name: "甲城", feature: 1, port: 10, population: 12, market: marketCenter ? 1 : 0, plaza: Number(marketCenter), group: "city", type: "Naval", visual: {manual: true, silhouette: "fortress", palette: "capital"}},
    {i: 2, id: 2, cityId: 2, cell: 7, x: 0, y: -1, state: 1, province: 1, culture: 1, religion: 1, name: "乙城", feature: 1, port: 0, population: 6, group: "town", type: "Generic"},
    {i: 3, id: 3, cityId: 3, cell: 6, x: 3, y: 1, state: 1, province: 1, culture: 1, religion: 1, name: "丙港", feature: 1, port: 10, population: 8, group: "city", type: "Naval"}
  ];
  const cities = [null,
    {id: 1, burgId: 1, cell: 0, packCell: 0, x: 0, y: 0, state: 1, province: 1, culture: 1, religion: 1, name: "甲城", port: 10, population: 12, capital: false, provincial: false, group: "city", type: "Naval", visual: {manual: true, silhouette: "fortress", palette: "capital"}},
    {id: 2, burgId: 2, cell: 7, packCell: 7, x: 0, y: -1, state: 1, province: 1, culture: 1, religion: 1, name: "乙城", port: 0, population: 6, capital: false, provincial: false, group: "town", type: "Generic"},
    {id: 3, burgId: 3, cell: 6, packCell: 6, x: 3, y: 1, state: 1, province: 1, culture: 1, religion: 1, name: "丙港", port: 10, population: 8, capital: false, provincial: false, group: "city", type: "Naval"}
  ];
  const routes = [
    {id: 0, type: "road", level: "secondary", feature: 1, state: 1, province: 1, from: 1, to: 2, cells: [0, 7], packCells: [0, 7], points: [[0, 0], [0, -1]], resourceCells: 0, markerResourceCells: 0, resourceGoodIds: [], visual: {manual: true, color: "#123456"}},
    {id: 1, type: "searoute", level: "secondary", feature: 10, state: 0, province: 0, from: 1, to: 3, cells: [4, 5], packCells: [4, 5], points: [[1, 1], [2, 1]], resourceCells: 0, markerResourceCells: 0, resourceGoodIds: []},
    {id: 2, type: "trail", level: "trail", feature: 1, state: 1, province: 1, from: 2, to: 3, cells: [7, 0, 1, 4, 5, 6], packCells: [7, 0, 1, 4, 5, 6], points: [[0, -1], [0, 0], [1, 0], [1, 1], [2, 1], [3, 1]], resourceCells: 0, markerResourceCells: 0, resourceGoodIds: [], visual: {manual: true, width: 9}}
  ];
  const market = marketCenter ? {i: 1, id: 1, name: "甲城市", centerBurgId: 1, cell: 0, x: 0, y: 0, state: 1, goods: {}} : null;
  const burgCells = new Uint16Array(points.length);
  burgCells[0] = 1;
  burgCells[7] = 2;
  burgCells[6] = 3;
  const gridBurgs = new Array(points.length).fill(-1);
  gridBurgs[0] = 1;
  gridBurgs[7] = 2;
  gridBurgs[6] = 3;
  const marketCells = new Uint16Array(points.length);
  if (marketCenter) marketCells[0] = 1;
  const packMarkets = marketCenter ? [null, structuredClone(market)] : [null];
  const economyMarkets = marketCenter ? [null, structuredClone(market)] : [null];
  return {
    options: {seed: "city-relocation", cellsTarget: 1000},
    metadata: {seed: "city-relocation"},
    grid: {
      points,
      cells: {
        i: points.map((_, index) => index), h: [40, 45, 42, 44, 10, 10, 43, 41, 46], f: [1, 1, 2, 1, 10, 11, 1, 1, 1],
        state: [1, 1, 2, 1, 0, 0, 1, 1, 1], province: [1, 1, 2, 2, 0, 0, 1, 1, 1], culture: [1, 2, 2, 3, 0, 0, 1, 1, 4], religion: [1, 2, 2, 3, 0, 0, 1, 1, 4],
        temp: [12, 12, 12, 12, 8, 8, 12, 12, 12], burg: gridBurgs
      }
    },
    pack: {
      cells: {
        i: points.map((_, index) => index), p: points, c: adjacency, g: points.map((_, index) => index), h: [40, 45, 42, 44, 10, 10, 43, 41, 46], f: [1, 1, 2, 1, 10, 11, 1, 1, 1],
        state: [1, 1, 2, 1, 0, 0, 1, 1, 1], province: [1, 1, 2, 2, 0, 0, 1, 1, 1], culture: [1, 2, 2, 3, 0, 0, 1, 1, 4], religion: [1, 2, 2, 3, 0, 0, 1, 1, 4],
        haven: [4, 4, undefined, undefined, undefined, undefined, 5, 4, 5], harbor: [1, 5, 0, 0, 0, 0, 1, 4, 1], r: new Uint16Array(points.length), fl: new Uint16Array(points.length), biome: [6, 6, 5, 7, 0, 0, 6, 5, 6], pop: [8, 7, 5, 4, 0, 0, 6, 5, 5], s: [20, 19, 15, 18, 0, 0, 18, 17, 18],
        burg: burgCells, market: marketCells, routes: {0: {7: 0}, 7: {0: 0}}, good: new Uint16Array(points.length), goodSource: new Uint8Array(points.length), goodSupply: new Float32Array(points.length)
      },
      features: [null, {i: 1, type: "island", land: true, cells: 6}, {i: 2, type: "island", land: true, cells: 1}, null, null, null, null, null, null, null, {i: 10, type: "ocean", land: false, cells: 2}, {i: 11, type: "ocean", land: false, cells: 2}],
      rivers: [], burgs, states: [null, {i: 1, id: 1, name: "一国"}, {i: 2, id: 2, name: "二国"}], provinces: [null, {i: 1, id: 1, name: "一省"}, {i: 2, id: 2, name: "二省"}], cultures: [null, {i: 1, name: "甲文化"}, {i: 2, name: "乙文化"}, {i: 3, name: "丙文化"}, {i: 4, name: "丁文化"}], goods: [null], markets: packMarkets, routes: []
    },
    features: {features: []},
    politics: {states: [null, {i: 1, id: 1, name: "一国"}, {i: 2, id: 2, name: "二国"}], provinces: [null, {i: 1, id: 1, name: "一省"}, {i: 2, id: 2, name: "二省"}]},
    society: {cultures: [null, {i: 1, name: "甲文化"}, {i: 2, name: "乙文化"}, {i: 3, name: "丙文化"}, {i: 4, name: "丁文化"}], religions: [null, {i: 1, name: "甲宗教"}, {i: 2, name: "乙宗教"}, {i: 3, name: "丙宗教"}, {i: 4, name: "丁宗教"}]},
    settlements: {cities, routes, metadata: {cities: 3, capitals: 0, ports: 2, routes: 3, routeSegments: 7}},
    economy: {markets: economyMarkets, metadata: {stale: false}}, diplomacy: {metadata: {stale: false}}, military: {metadata: {stale: false}}, zones: {zones: [], metadata: {stale: false}},
    notes: {notes: routeNote ? [{id: "route:1", kind: "route", objectId: 1, name: "海路", body: "保留测试", format: "plain", pinned: false, createdAt: "2026-01-01", updatedAt: "2026-01-01"}] : [], metadata: {notes: routeNote ? 1 : 0, formatVersion: 1}}
  };
}

function pickOwners(item) {
  return {state: item.state, province: item.province, culture: item.culture, religion: item.religion};
}

function roundMs(value) {
  return Math.round(value * 100) / 100;
}

function roundtripMap(map) {
  return parseMapDocument(stringifyMapDocument(createMapDocument(map, map.options))).map;
}

function assertPoliticalStatsMirrored(map, kind, ids) {
  for (const id of ids) {
    assert.equal(map.politics[kind][id].burgs, map.pack[kind][id].burgs, `${kind} #${id} burgs 双镜像不一致`);
    assert.equal(map.politics[kind][id].urban, map.pack[kind][id].urban, `${kind} #${id} urban 双镜像不一致`);
  }
}

function runDragLifecycleRegression() {
  const validMap = sampleMap();
  const validHistory = new EditHistory();
  const validTarget = createPointerTargetStub();
  const released = [];
  let selection = null;
  const validBinding = bindCityRelocationDrag(validTarget, {
    isActive: () => true,
    isPrimaryPointerDown: () => true,
    getCityId: event => event.cityId,
    getSelectedCityId: () => 1,
    getTarget: event => event.targetCell,
    inspect: (cityId, target) => inspectCityMove(validMap, cityId, target),
    capturePointer() {},
    releasePointer: pointerId => released.push(pointerId),
    onCommit: (cityId, target) => {
      validHistory.execute(createMoveCityCommand(cityId, target), {map: validMap});
      selection = cityId;
    }
  });
  validTarget.emit("pointerdown", pointerEvent(7, {cityId: 1, targetCell: {gridCell: 1, packCell: 1}}));
  validTarget.emit("pointermove", pointerEvent(7, {targetCell: {gridCell: 3, packCell: 3}}));
  validTarget.emit("pointerup", pointerEvent(7, {targetCell: {gridCell: 3, packCell: 3}}));
  assert.equal(validHistory.getStats().undo, 1, "完整拖动事件链只能写入一条历史");
  assert.equal(validMap.settlements.cities[1].cell, 3);
  assert.equal(selection, 1, "拖动提交后未保持城市选择");
  assert.deepEqual(released, [7]);
  assert.equal(validBinding.getActiveDrag(), null, "pointerup 后拖动态未清理");
  validTarget.emit("pointerdown", pointerEvent(17, {cityId: 1, targetCell: {gridCell: 3, packCell: 3}}));
  validTarget.emit("pointermove", pointerEvent(17, {targetCell: {gridCell: 2, packCell: 2}}));
  validTarget.emit("pointerup", pointerEvent(17, {targetCell: {gridCell: 2, packCell: 2}}));
  assert.equal(validHistory.getStats().undo, 2, "同一绑定必须允许连续提交第二次城市移动");
  assert.equal(validMap.settlements.cities[1].cell, 2, "连续第二次移动未写入目标 cell");
  assert.deepEqual(released, [7, 17], "连续移动没有分别释放 pointer capture");

  let pointerMisses = 0;
  const missTarget = createPointerTargetStub();
  bindCityRelocationDrag(missTarget, {
    isActive: () => true,
    isPrimaryPointerDown: () => true,
    getCityId: event => event.cityId,
    getSelectedCityId: () => 1,
    onPointerMiss: () => pointerMisses++
  });
  missTarget.emit("pointerdown", pointerEvent(18, {cityId: 2}));
  assert.equal(pointerMisses, 1, "点击当前城市以外的位置必须交给模式退出回调");

  const invalidMap = sampleMap();
  const invalidBefore = structuredClone(invalidMap);
  const invalidHistory = new EditHistory();
  const invalidTarget = createPointerTargetStub();
  const invalidBinding = bindCityRelocationDrag(invalidTarget, {
    isActive: () => true,
    isPrimaryPointerDown: () => true,
    getCityId: event => event.cityId,
    getSelectedCityId: () => 1,
    getTarget: event => event.targetCell,
    inspect: (cityId, target) => inspectCityMove(invalidMap, cityId, target),
    onCommit: (cityId, target) => invalidHistory.execute(createMoveCityCommand(cityId, target), {map: invalidMap})
  });
  invalidTarget.emit("pointerdown", pointerEvent(8, {cityId: 1, targetCell: {gridCell: 1, packCell: 1}}));
  invalidTarget.emit("pointerup", pointerEvent(8, {targetCell: {gridCell: 4, packCell: 4}}));
  assert.equal(invalidHistory.getStats().undo, 0, "无效拖动不得写历史");
  assert.deepEqual(invalidMap, invalidBefore, "无效拖动修改了地图");
  assert.equal(invalidBinding.getActiveDrag(), null, "无效 pointerup 后拖动态未清理");

  const cancelTarget = createPointerTargetStub();
  let cancelled = 0;
  const cancelBinding = bindCityRelocationDrag(cancelTarget, {
    isActive: () => true,
    isPrimaryPointerDown: () => true,
    getCityId: event => event.cityId,
    getSelectedCityId: () => 1,
    getTarget: event => event.targetCell,
    inspect: (cityId, target) => inspectCityMove(sampleMap(), cityId, target),
    onCancel: () => cancelled++
  });
  cancelTarget.emit("pointerdown", pointerEvent(9, {cityId: 1, targetCell: {gridCell: 1, packCell: 1}}));
  cancelTarget.emit("pointercancel", pointerEvent(9));
  assert.equal(cancelled, 1);
  assert.equal(cancelBinding.getActiveDrag(), null, "pointercancel 后拖动态未清理");
  cancelTarget.emit("pointerdown", pointerEvent(10, {cityId: 1, targetCell: {gridCell: 1, packCell: 1}}));
  assert.equal(cancelBinding.cancel("map-reset", false), true);
  assert.equal(cancelBinding.getActiveDrag(), null, "切图取消后拖动态未清理");
  assert.equal(cancelled, 1, "外部模式退出不得重复触发取消回调");

  const frameTarget = createPointerTargetStub();
  const frames = new Map();
  let nextFrameId = 1;
  let fastInspections = 0;
  const frameBinding = bindCityRelocationDrag(frameTarget, {
    isActive: () => true,
    isPrimaryPointerDown: () => true,
    getCityId: event => event.cityId,
    getSelectedCityId: () => 1,
    getTarget: event => event.targetCell,
    inspectFast: (cityId, target) => {
      fastInspections++;
      return inspectCityMoveFast(sampleMap(), cityId, target);
    },
    requestFrame(callback) {
      const id = nextFrameId++;
      frames.set(id, callback);
      return id;
    },
    cancelFrame: id => frames.delete(id)
  });
  frameTarget.emit("pointerdown", pointerEvent(11, {cityId: 1, targetCell: {gridCell: 1, packCell: 1}}));
  for (let index = 0; index < 60; index++) {
    frameTarget.emit("pointermove", pointerEvent(11, {targetCell: {gridCell: 3, packCell: 3, x: index / 100, y: 1}}));
  }
  assert.equal(frames.size, 1, "pointermove 洪峰必须合并为一个 RAF 预览");
  const [[frameId, flush]] = frames;
  frames.delete(frameId);
  flush();
  assert.equal(fastInspections, 1, "同一帧只能运行一次轻量预检");
  frameBinding.cancel("test-finished", false);

  const throwTarget = createPointerTargetStub();
  const throwReleases = [];
  const throwErrors = [];
  const throwBinding = bindCityRelocationDrag(throwTarget, {
    isActive: () => true,
    isPrimaryPointerDown: () => true,
    getCityId: event => event.cityId,
    getSelectedCityId: () => 1,
    getTarget: event => event.targetCell,
    inspectFast: (cityId, target) => inspectCityMoveFast(sampleMap(), cityId, target),
    releasePointer: pointerId => throwReleases.push(pointerId),
    onCommit: () => { throw new Error("commit failed"); },
    onError: error => throwErrors.push(error.message)
  });
  throwTarget.emit("pointerdown", pointerEvent(12, {cityId: 1, targetCell: {gridCell: 1, packCell: 1}}));
  throwTarget.emit("pointerup", pointerEvent(12, {targetCell: {gridCell: 3, packCell: 3}}));
  assert.equal(throwBinding.getActiveDrag(), null, "提交异常后拖动态未清理");
  assert.deepEqual(throwReleases, [12], "提交异常后 pointer capture 未释放");
  assert.deepEqual(throwErrors, ["commit failed"]);

  const targetErrorTarget = createPointerTargetStub();
  const targetErrorEvents = [];
  const targetErrorBinding = bindCityRelocationDrag(targetErrorTarget, {
    isActive: () => true,
    isPrimaryPointerDown: () => true,
    getCityId: event => event.cityId,
    getSelectedCityId: () => 1,
    getTarget: () => { throw new Error("target failed"); },
    inspectFast: () => { throw new Error("inspect must not run"); },
    onPreview: preview => targetErrorEvents.push(preview === null ? "clear" : "preview"),
    onCancel: reason => targetErrorEvents.push(reason),
    onError: error => targetErrorEvents.push(error.message)
  });
  targetErrorTarget.emit("pointerdown", pointerEvent(14, {cityId: 1}));
  targetErrorTarget.emit("pointerup", pointerEvent(14));
  assert.equal(targetErrorBinding.getActiveDrag(), null, "pointerup getTarget 异常后拖动态未清理");
  assert.deepEqual(targetErrorEvents, ["target failed", "pointerup-error", "clear"], "pointerup getTarget 异常未清 ghost 或退出模式");
}

function runOverlappingCityPointerRegression() {
  const pick = {cityObject: {kind: "city", id: 2, overlapCandidateIds: [2, 9]}};
  assert.equal(resolveCityRelocationPointerCityId(pick, 9), 9, "重合城市拖动必须优先采用已选候选");
  assert.equal(resolveCityRelocationPointerCityId(pick, 7), 2, "已选城市不在重合候选时必须保持普通 picking");
  assert.equal(resolveCityRelocationPointerCityId(pick, null), 2, "无移动选择时必须保持普通 picking");
}

function runMultiSettlementCellRegression() {
  const map = sampleMap({marketCenter: true});
  const secondMarket = {i: 2, id: 2, name: "乙城市", centerBurgId: 2, cell: 7, x: 0, y: -1, state: 1, goods: {}};
  map.pack.markets[2] = structuredClone(secondMarket);
  map.economy.markets[2] = structuredClone(secondMarket);
  map.pack.burgs[2].market = 2;
  map.pack.burgs[2].plaza = 1;
  map.settlements.cities[2].market = 2;
  map.settlements.cities[2].plaza = 1;
  map.pack.cells.market[7] = 2;
  const preview = inspectCityMove(map, 1, {gridCell: 7, packCell: 7, x: 0.15, y: -0.85});
  const command = createMoveCityCommand(1, preview.target, {preflight: preview});
  const history = new EditHistory();
  history.execute(command, {map});
  assert.deepEqual(cityIdsAtGridCell(map, 7), [1, 2], "grid cell 多城索引必须保留全部城市");
  assert.deepEqual(burgIdsAtPackCell(map, 7), [1, 2], "pack cell 多 burg 索引必须保留全部 burg");
  assert.equal(map.grid.cells.burg[7], 1, "旧 singular grid 索引应稳定选择最小城市 ID");
  assert.equal(map.pack.cells.burg[7], 1, "旧 singular pack 索引应稳定选择最小 burg ID");
  assert.equal(map.pack.cells.market[7], 1, "同 cell 多市场的旧 singular 代表应稳定选择最小市场 ID");
  assert.equal(map.pack.markets[1].centerBurgId, 1);
  assert.equal(map.pack.markets[2].centerBurgId, 2);
  const gridOccupants = getCellSnapshot(map, {space: "grid", id: 7}).occupants;
  assert.deepEqual(gridOccupants.cityIds, [1, 2], "grid query 未返回同 cell 的 cityIds");
  assert.deepEqual(gridOccupants.burgIds, [1, 2], "grid query 未区分 cityIds / burgIds");
  assert.deepEqual(getCellSnapshot(map, {space: "pack", id: 7}).occupants.cityIds, [1, 2], "pack query 遗漏同 cell 城市");
  map.regenerationLocks = {version: 1, entries: [{kind: "city", id: 2}]};
  const locked = captureLockedRegenerationObjects(map, "city");
  assert.deepEqual(locked.entries[0].related.gridCellCityIds, [1, 2], "非 singular 代表城市锁未捕获完整 grid 多值镜像");
  assert.deepEqual(locked.entries[0].related.packCellBurgIds, [1, 2], "非 singular 代表城市锁未捕获完整 pack 多值镜像");
  const loaded = parseMapDocument(stringifyMapDocument(createMapDocument(map, map.options))).map;
  assert.deepEqual(cityIdsAtGridCell(loaded, 7), [1, 2], "多城存档加载后 grid 多值索引丢失");
  assert.deepEqual(burgIdsAtPackCell(loaded, 7), [1, 2], "多城存档加载后 pack 多值索引丢失");
  assert.equal(loaded.grid.cells.burg[7], 1, "多城存档加载未恢复稳定 grid singular 代表");
  assert.equal(loaded.pack.cells.burg[7], 1, "多城存档加载未恢复稳定 pack singular 代表");
  history.undo({map});
  assert.deepEqual(cityIdsAtGridCell(map, 7), [2], "撤销后多城索引未恢复");
  history.redo({map});
  assert.deepEqual(cityIdsAtGridCell(map, 7), [1, 2], "重做后多城索引未恢复");
  map.settlements.cities[2].removed = true;
  map.pack.burgs[2].removed = true;
  assert.deepEqual(cityIdsAtGridCell(map, 7), [1], "同数组软删除后多城索引不得返回陈旧城市");
  assert.deepEqual(burgIdsAtPackCell(map, 7), [1], "同数组软删除后多 burg 索引不得返回陈旧 burg");
  delete map.settlements.cities[2].removed;
  delete map.pack.burgs[2].removed;
  assert.deepEqual(cityIdsAtGridCell(map, 7), [1, 2], "软删除撤销后多城索引未恢复");
  assert.deepEqual(burgIdsAtPackCell(map, 7), [1, 2], "软删除撤销后多 burg 索引未恢复");

  const lastCityMap = sampleMap();
  for (const id of [2, 3]) {
    lastCityMap.settlements.cities[id].state = 2;
    lastCityMap.pack.burgs[id].state = 2;
  }
  lastCityMap.settlements.cities[1].capital = true;
  lastCityMap.pack.burgs[1].capital = 1;
  for (const states of [lastCityMap.politics.states, lastCityMap.pack.states]) {
    Object.assign(states[1], {capital: 1, center: 0, gridCenter: 0});
    Object.assign(states[2], {capital: 2, center: 7, gridCenter: 7});
  }
  const lastPreview = inspectCityMove(lastCityMap, 1, {gridCell: 2, packCell: 2});
  assert.equal(lastPreview.politics.sourceStateReplacementCityId, null);
  const lastCityHistory = new EditHistory();
  lastCityHistory.execute(createMoveCityCommand(1, lastPreview.target, {preflight: lastPreview}), {map: lastCityMap});
  assert.equal(lastCityMap.politics.states[1].capital, 0, "最后一城迁出后原国家允许无首都");
  assert.equal(lastCityMap.politics.states[1].center, 0, "最后一城迁出后原国家中心应保留合法本国陆地");
  assert.equal(lastCityMap.politics.states[2].capital, 2, "目标国家已有首都时不得篡位");
  assert.equal(lastCityMap.settlements.cities[1].capital, false);
  lastCityHistory.undo({map: lastCityMap});
  assert.equal(lastCityMap.politics.states[1].capital, 1, "最后一城迁移撤销未恢复首都");
  lastCityHistory.redo({map: lastCityMap});
  assert.equal(lastCityMap.politics.states[1].capital, 0, "最后一城迁移重做未恢复空国首都状态");
  const emptyStateRoundtrip = roundtripMap(lastCityMap);
  assert.equal(emptyStateRoundtrip.politics.states[1].capital, 0, "空国首都状态未通过存档往返");
  emptyStateRoundtrip.regenerationLocks = {version: 1, entries: [{kind: "state", id: 1}]};
  assert.equal(captureLockedRegenerationObjects(emptyStateRoundtrip, "state").entries.length, 1, "空国国家锁捕获失败");
  emptyStateRoundtrip.pack.cells.t ||= new Int8Array(emptyStateRoundtrip.pack.cells.i.length);
  emptyStateRoundtrip.pack.cells.area ||= new Float32Array(emptyStateRoundtrip.pack.cells.i.length).fill(1);
  emptyStateRoundtrip.pack.provinces = [null];
  const emptyState = structuredClone(emptyStateRoundtrip.pack.states[1]);
  assert.doesNotThrow(() => reexpandPackPoliticsPreservingIdentity(
    emptyStateRoundtrip.grid,
    emptyStateRoundtrip.society,
    emptyStateRoundtrip.pack,
    emptyStateRoundtrip.settlements,
    {lockedStates: [emptyState], lockedCities: [], lockedProvinces: []}
  ), "空国政治重扩张不应强制补首都");
  assert.equal(emptyStateRoundtrip.pack.states[1].capital, 0, "空国政治重扩张错误生成首都");
}

async function runAsyncPreflightRegression() {
  const map = sampleMap();
  const controller = new AbortController();
  controller.abort("test");
  await assert.rejects(
    inspectCityMoveAsync(map, 1, {gridCell: 3, packCell: 3}, {signal: controller.signal, sliceMs: 0}),
    error => error?.code === "operation_cancelled"
  );

  const preflight = await inspectCityMoveAsync(map, 1, {gridCell: 3, packCell: 3}, {sliceMs: 0});
  assert.throws(
    () => createMoveCityCommand(1, {gridCell: 2, packCell: 2}, {preflight}).isNoop({map}),
    error => error?.code === "inspection_stale",
    "preflight 不得被用于其它目标"
  );
  const command = createMoveCityCommand(1, preflight.target, {preflight});
  assert.equal(command.isNoop({map}), false);
  assert.equal(command.getInspection(), preflight, "isNoop 必须复用已完成 preflight");
  command.apply({map});
  assert.equal(command.getInspection(), preflight, "apply 不得重复执行 preflight");
}

async function runRouteAdjacencyCancellationRegression() {
  for (const routeCount of [0, 4, 10]) {
    const map = routeCount ? createLongRouteCancellationMap(routeCount) : sampleMap();
    const template = map.settlements.routes.find(route => Number(route.from) === 1 || Number(route.to) === 1);
    map.settlements.routes = Array.from({length: routeCount}, (_, index) => ({
      ...structuredClone(template),
      id: index,
      from: 1,
      to: 2
    }));
    assert.equal(routesAtCity(map, 1).length, routeCount, `${routeCount} 条路线的 city 邻接索引不完整`);
    const controller = new AbortController();
    let yields = 0;
    if (!routeCount) controller.abort("cancel-0");
    await assert.rejects(
      inspectCityMoveAsync(map, 1, {gridCell: 3, packCell: 3}, {
        signal: controller.signal,
        sliceMs: 1,
        yieldToBrowser: async () => {
          yields++;
          controller.abort(`cancel-${routeCount}`);
        }
      }),
      error => error?.code === "operation_cancelled",
      `${routeCount} 条关联路线时预检未响应取消`
    );
    if (routeCount) assert.ok(yields >= 1, `${routeCount} 条关联路线必须在路线规划已开始并完成至少一次切片后取消`);
  }
}

function createLongRouteCancellationMap(routeCount) {
  const map = sampleMap();
  const size = 20000;
  const points = Array.from({length: size}, (_, cell) => [cell, 0]);
  const adjacency = Array.from({length: size}, (_, cell) => [cell - 1, cell + 1].filter(neighbor => neighbor >= 0 && neighbor < size));
  map.pack.cells = {
    ...map.pack.cells,
    i: points.map((_, cell) => cell),
    p: points,
    c: adjacency,
    g: points.map((_, cell) => cell < map.grid.points.length ? cell : 3),
    h: new Uint8Array(size).fill(40),
    f: new Uint16Array(size).fill(1),
    state: new Uint16Array(size).fill(1),
    province: new Uint16Array(size).fill(1),
    culture: new Uint16Array(size).fill(1),
    religion: new Uint16Array(size).fill(1),
    haven: new Int32Array(size).fill(-1),
    harbor: new Uint8Array(size),
    r: new Uint16Array(size),
    fl: new Uint16Array(size),
    biome: new Uint8Array(size).fill(6),
    pop: new Float32Array(size),
    s: new Float32Array(size),
    burg: new Uint32Array(size),
    market: new Uint32Array(size),
    routes: {},
    good: new Uint16Array(size),
    goodSource: new Uint8Array(size),
    goodSupply: new Float32Array(size)
  };
  map.pack.cells.burg[0] = 1;
  map.pack.cells.burg[size - 1] = 2;
  map.pack.burgs[2].cell = size - 1;
  map.settlements.cities[2].packCell = size - 1;
  const template = map.settlements.routes[0];
  map.settlements.routes = Array.from({length: routeCount}, (_, index) => ({
    ...structuredClone(template),
    id: index,
    from: 1,
    to: 2,
    packCells: [0, size - 1],
    cells: [0, size - 1],
    points: [points[0], points[size - 1]]
  }));
  return map;
}

async function runPopulationPointTopKRegression() {
  const count = 12000;
  const grid = {
    points: Array.from({length: count}, (_, cell) => [cell, 0]),
    cells: {
      pop: Array.from({length: count}, (_, cell) => 43 + cell % 17),
      h: new Uint8Array(count).fill(40),
      f: new Uint16Array(count).fill(1),
      burg: new Int32Array(count).fill(-1)
    }
  };
  const features = {features: [null, {i: 1, land: true, type: "island"}]};
  const expected = grid.points.map((point, cell) => ({cell, point, population: grid.cells.pop[cell]}))
    .sort((a, b) => b.population - a.population || a.cell - b.cell)
    .slice(0, Math.min(2400, Math.round(count * 0.22)));
  const actual = await rebuildRelocatedPopulationPointsAsync(grid, features, {sliceMs: 1, yieldToMain: () => Promise.resolve()});
  assert.deepEqual(actual.map(item => [item.cell, item.population]), expected.map(item => [item.cell, item.population]), "人口点有界 top-K 与全量排序不等价");
  const controller = new AbortController();
  controller.abort("test");
  await assert.rejects(
    rebuildRelocatedPopulationPointsAsync(grid, features, {signal: controller.signal, sliceMs: 1, yieldToMain: () => Promise.resolve()}),
    error => error?.code === "operation_cancelled"
  );
}

async function runPendingDragRegression() {
  const map = sampleMap();
  const target = createPointerTargetStub();
  let resolvePreflight;
  let preflightSignal = null;
  let commits = 0;
  const binding = bindCityRelocationDrag(target, {
    isActive: () => true,
    isPrimaryPointerDown: () => true,
    getCityId: event => event.cityId,
    getSelectedCityId: () => 1,
    getTarget: event => event.targetCell,
    inspectFast: (cityId, destination) => inspectCityMoveFast(map, cityId, destination),
    preflight: (_cityId, _destination, options) => {
      preflightSignal = options.signal;
      return new Promise(resolve => { resolvePreflight = resolve; });
    },
    onCommit: () => commits++
  });
  target.emit("pointerdown", pointerEvent(13, {cityId: 1, targetCell: {gridCell: 1, packCell: 1}}));
  target.emit("pointerup", pointerEvent(13, {targetCell: {gridCell: 3, packCell: 3}}));
  assert.deepEqual(binding.getPendingPreflight(), {generation: 1, cityId: 1});
  assert.equal(binding.cancel("map-reset", false), true);
  assert.equal(preflightSignal.aborted, true, "地图切换必须中止未完成 preflight");
  resolvePreflight(inspectCityMove(map, 1, {gridCell: 3, packCell: 3}));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(commits, 0, "已取消的 preflight 不得迟到提交");
  assert.equal(binding.getPendingPreflight(), null);
}

function createPointerTargetStub() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    removeEventListener(type, listener) {
      listeners.set(type, (listeners.get(type) || []).filter(item => item !== listener));
    },
    emit(type, event) {
      for (const listener of listeners.get(type) || []) listener(event);
    }
  };
}

function pointerEvent(pointerId, extra = {}) {
  return {pointerId, preventDefault() {}, stopImmediatePropagation() {}, ...extra};
}

function findFullMapPopulationMove(map) {
  for (const city of map.settlements?.cities || []) {
    if (!city || city.removed || city.capital || city.provincial) continue;
    for (const point of map.settlements?.populationPoints || []) {
      for (const packCell of map.pack?.cells?.i || []) {
        if (Number(map.pack.cells.g?.[packCell]) !== Number(point.cell) || Number(map.pack.cells.h?.[packCell]) < 20 || Number(map.pack.cells.burg?.[packCell]) > 0) continue;
        const target = {gridCell: point.cell, packCell};
        const preview = inspectCityMove(map, city.id, target);
        if (preview.valid && preview.changed) return {cityId: city.id, target};
      }
    }
  }
  return null;
}
