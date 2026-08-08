#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {createMoveCityCommand, inspectCityMove} from "../app/webgl-generator/src/runtime/city-relocation.js";
import {bindCityRelocationDrag} from "../app/webgl-generator/src/runtime/city-relocation-drag.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {API_METHODS} from "../app/webgl-generator/src/runtime/api-contract.js";
import {createMapDocument, parseMapDocument, stringifyMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";

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
assert.equal(inspectCityMove(base, 1, {gridCell: 7, packCell: 7}).valid, false, "重复占位必须拒绝");
assert.equal(inspectCityMove(base, 1, {gridCell: 99}).code, "missing-cell-mapping");

const capitalMap = sampleMap();
capitalMap.settlements.cities[1].capital = true;
capitalMap.pack.burgs[1].capital = 1;
capitalMap.politics.states[1].capital = 1;
assert.match(inspectCityMove(capitalMap, 1, {gridCell: 2, packCell: 2}).reasons.join(" "), /首都/);
const provincialMap = sampleMap();
provincialMap.settlements.cities[1].provincial = true;
provincialMap.politics.provinces[1].burg = 1;
assert.match(inspectCityMove(provincialMap, 1, {gridCell: 3, packCell: 3}).reasons.join(" "), /省会/);
const marketGateMap = sampleMap({marketCenter: true});
assert.match(inspectCityMove(marketGateMap, 1, {gridCell: 2, packCell: 2}).reasons.join(" "), /市场中心/);

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

const unreachable = sampleMap();
unreachable.pack.cells.c[1] = [4];
unreachable.pack.cells.c[0] = [3, 7];
const failedRoad = inspectCityMove(unreachable, 1, {gridCell: 1, packCell: 1});
assert.equal(failedRoad.valid, false);
assert.match(failedRoad.reasons.join(" "), /陆路|小径/);

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
assert.equal(moved.pack.cells.market[3], 1);
assert.equal(moved.pack.burgs[1].market, 1);
assert.equal(moved.pack.burgs[1].plaza, 1);
assert.deepEqual(moved.metadata.derivedStale.systems, ["economy", "diplomacy", "military", "zones"]);
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

const fullMap = generatePlaceholderMap({seed: "city-relocation-full-map", cellsTarget: 5000, heightmapTemplate: "continents"});
const realHarborCity = fullMap.settlements.cities.find(city => city && !city.capital && city.port && Number(fullMap.pack.cells.harbor?.[city.packCell]) > 1);
assert(realHarborCity, "完整生成地图没有非首都 harbor > 1 港城样本");
const realHarborPreview = inspectCityMove(fullMap, realHarborCity.id, {gridCell: realHarborCity.cell, packCell: realHarborCity.packCell});
assert.equal(realHarborPreview.port.status, "kept", "既有非首都高 harbor 港口原位预检不得清除");
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
assert.equal(fullMap.settlements.populationPoints.some(point => point.cell === fullTarget.target.gridCell), false, "城市目标 cell 仍在绘制农村人口点");
assert.equal(fullMap.settlements.metadata.ruralPopulationPoints, fullMap.settlements.populationPoints.length);
const undoStarted = performance.now();
fullHistory.undo({map: fullMap});
const undoMs = performance.now() - undoStarted;
assert.deepEqual(fullMap.settlements.populationPoints.find(point => point.cell === fullTarget.target.gridCell), populationPointBefore, "撤销未恢复农村人口点");
assert.equal(fullMap.unrelatedPayload, unrelatedPayload, "撤销替换了有界范围外 payload");
const redoStarted = performance.now();
fullHistory.redo({map: fullMap});
const redoMs = performance.now() - redoStarted;
assert.equal(fullMap.settlements.populationPoints.some(point => point.cell === fullTarget.target.gridCell), false, "重做未移除农村人口点");
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
assert.match(cityRelocationSource, /restoreCityMoveSnapshot\(after\)/);
assert.match(appSource, /CITY_MOVE: "city:move"/);
assert.match(appSource, /bindCityRelocationDrag\(canvas/);
assert.match(appSource, /if \(activeModeId\) return cancelCanvasToolMode\(state, documentRef, activeModeId, "escape"\)/);
assert.match(appSource, /register\(CANVAS_TOOL_MODE\.CITY_MOVE, "city-panel"/);
assert.match(appSource, /selectionStore\.setSelection\(\{object: \{kind: OBJECT_KIND\.CITY, id: cityId\}\}\)/);
assert.match(panelSource, /moveMode: false/);
assert.match(panelSource, /updateMovePreview/);
assert.match(panelVueSource, /拖动城市到目标 cell/);
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
