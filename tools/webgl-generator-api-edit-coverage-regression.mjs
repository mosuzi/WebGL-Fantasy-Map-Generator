#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {createSyncCityOwnerToCellCommand, createSetCityVisualCommand, createResetCityVisualCommand} from "../app/webgl-generator/src/runtime/city-edit-commands.js";
import {API_METHODS} from "../app/webgl-generator/src/runtime/api-contract.js";
import {createSetDiplomacyRelationCommand} from "../app/webgl-generator/src/runtime/diplomacy-edit-commands.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {createApplyHeightBrushCommand} from "../app/webgl-generator/src/runtime/height-edit-commands.js";
import {createImportMeasurementsCommand} from "../app/webgl-generator/src/runtime/measurement-edit-commands.js";
import {
  createClearMilitaryBattleEventsCommand,
  createImportMilitaryBattleEventsCommand,
  createMoveMilitaryStationCommand,
  createRecordMilitaryBattleEventCommand,
  createRenameMilitaryRegimentCommand,
  createSetMilitaryBaseCommand,
  createSetMilitaryRatiosCommand,
  createSetMilitaryStatusBatchCommand,
  createSetMilitaryStatusCommand
} from "../app/webgl-generator/src/runtime/military-edit-commands.js";
import {createSetStateCapitalCommand} from "../app/webgl-generator/src/runtime/object-edit-commands.js";
import {createApplyProvinceBrushCommand} from "../app/webgl-generator/src/runtime/province-edit-commands.js";
import {createApplyStateBrushCommand, createSetStatesGovernmentBatchCommand} from "../app/webgl-generator/src/runtime/state-edit-commands.js";
import {createSetZoneStyleCommand} from "../app/webgl-generator/src/runtime/zone-edit-commands.js";

const map = generatePlaceholderMap({seed: "api-edit-coverage", cellsTarget: 3000, heightmapTemplate: "continents"});
const results = [];

const measurementCommand = createImportMeasurementsCommand([{
  name: "API 距离样本",
  type: "polyline",
  routeFit: "none",
  points: [{x: 120, y: 160}, {x: 180, y: 210}]
}]);
results.push(roundTrip("measurements.import", map, measurementCommand, () => ({
  ids: (map.measurements?.items || []).map(item => item.id),
  points: (map.measurements?.items || []).map(item => item.points?.length || 0)
})));

const city = map.settlements.cities.find(Boolean);
const burg = map.pack.burgs[city.burgId];
const expectedOwner = {state: city.state, province: city.province};
city.state = city.province = 0;
burg.state = burg.province = 0;
results.push(roundTrip("cities.syncOwner", map, createSyncCityOwnerToCellCommand(city.id), () => ({
  city: [city.state, city.province],
  burg: [burg.state, burg.province]
})));
assert.deepEqual([city.state, city.province], [expectedOwner.state, expectedOwner.province], "城市归属没有同步到所在 cell");
results.push(roundTrip("cities.setVisual", map, createSetCityVisualCommand(city.id, {silhouette: "fort", palette: "highland", cultureStyle: "highland"}), () => ({...city.visual})));
assert.equal(city.visual.manual, true, "城市剪影没有切换为手工模式");
results.push(roundTrip("cities.resetVisual", map, createResetCityVisualCommand(city.id), () => ({...city.visual})));
assert.equal(city.visual.manual, false, "城市剪影没有恢复自动模式");

const activeProvinces = map.politics.provinces.filter(item => item?.i && !item.removed);
const provincePair = findSameStateProvincePair(activeProvinces);
const provinceCell = findEditableGridCell(map, "province", provincePair[0].i);
results.push(roundTrip("provinces.applyChanges", map, createApplyProvinceBrushCommand([{
  gridCell: provinceCell,
  before: provincePair[0].i,
  after: provincePair[1].i
}]), () => Number(map.grid.cells.province[provinceCell])));

const activeStates = map.pack.states.filter(item => item?.i && !item.removed);
const stateCell = findEditableGridCell(map, "state", activeStates[0].i);
results.push(roundTrip("states.applyChanges", map, createApplyStateBrushCommand([{
  gridCell: stateCell,
  before: activeStates[0].i,
  after: activeStates[1].i
}]), () => Number(map.grid.cells.state[stateCell])));

const capitalTarget = findAlternativeCapital(map);
results.push(roundTrip("states.setCapital", map, createSetStateCapitalCommand(capitalTarget.state.i, capitalTarget.city.burgId), () => ({
  capital: capitalTarget.state.capital,
  cityCapital: Boolean(capitalTarget.city.capital)
})));

const governmentStates = activeStates.slice(0, 2);
const governmentKey = governmentStates.every(item => item.governmentKey === "republic") ? "monarchy" : "republic";
results.push(roundTrip("states.setGovernmentBatch", map, createSetStatesGovernmentBatchCommand(governmentStates.map(item => item.i), governmentKey), () => governmentStates.map(item => item.governmentKey)));

const heightCell = findEditableGridCell(map, "state", activeStates[0].i);
const heightBefore = Number(map.grid.cells.h[heightCell]);
const heightAfter = heightBefore >= 90 ? heightBefore - 5 : heightBefore + 5;
results.push(roundTrip("height.applyChanges", map, createApplyHeightBrushCommand([{gridCell: heightCell, before: heightBefore, after: heightAfter}]), () => ({
  grid: Number(map.grid.cells.h[heightCell]),
  pack: packHeightsForGrid(map, heightCell)
})));

const diplomacySubject = activeStates[0];
const diplomacyObject = activeStates[1];
const currentRelation = diplomacySubject.diplomacy[diplomacyObject.i];
const nextRelation = currentRelation === "Friendly" ? "Neutral" : "Friendly";
results.push(roundTrip("diplomacy.setRelation", map, createSetDiplomacyRelationCommand(diplomacySubject.i, diplomacyObject.i, nextRelation, {reason: "API 覆盖回归"}), () => ({
  forward: map.pack.states[diplomacySubject.i].diplomacy[diplomacyObject.i],
  backward: map.pack.states[diplomacyObject.i].diplomacy[diplomacySubject.i]
})));

const ratioState = activeStates.find(item => item.military?.length);
const ratios = {...ratioState.militaryPolicy.unitRatios};
const ratioKeys = Object.keys(ratios);
ratios[ratioKeys[0]] = Number(ratios[ratioKeys[0]] || 0) + 0.1;
results.push(roundTrip("military.setRatios", map, createSetMilitaryRatiosCommand(ratioState.i, ratios), () => ({...map.pack.states[ratioState.i].militaryPolicy.unitRatios})));

let regimentTargets = firstRegimentTargets(map, 2);
results.push(roundTrip("military.setStatus", map, createSetMilitaryStatusCommand(regimentTargets[0], "marching"), () => militaryStatus(map, regimentTargets[0])));
regimentTargets = firstRegimentTargets(map, 2);
results.push(roundTrip("military.setStatusBatch", map, createSetMilitaryStatusBatchCommand(regimentTargets, "routed"), () => regimentTargets.map(target => militaryStatus(map, target))));

regimentTargets = firstRegimentTargets(map, 2);
const destinationCell = map.pack.cells.p.findIndex((point, index) => point && index !== regimentTargets[0].cell);
results.push(roundTrip("military.moveStation", map, createMoveMilitaryStationCommand(regimentTargets[0], {cell: destinationCell}), () => militaryStation(map, regimentTargets[0])));
results.push(roundTrip("military.setBase", map, createSetMilitaryBaseCommand(regimentTargets[0]), () => militaryBase(map, regimentTargets[0])));
results.push(roundTrip("military.recordBattleEvent", map, createRecordMilitaryBattleEventCommand(regimentTargets[0], {type: "raid", outcome: "draw", description: "API 覆盖回归"}), () => militaryEventIds(map, regimentTargets[0])));

const importedEventId = "api-edit-coverage-imported-event";
results.push(roundTrip("military.importBattleEvents", map, createImportMilitaryBattleEventsCommand({events: [{
  id: importedEventId,
  regimentObjectId: regimentTargets[0].id,
  stateId: regimentTargets[0].stateId,
  regimentId: regimentTargets[0].regimentId,
  type: "skirmish",
  outcome: "victory",
  description: "导入战报"
}]}), () => militaryEventIds(map, regimentTargets[0])));
results.push(roundTrip("military.clearBattleEvents", map, createClearMilitaryBattleEventsCommand(regimentTargets[0], {eventIds: [importedEventId]}), () => militaryEventIds(map, regimentTargets[0])));
results.push(roundTrip("military.rename", map, createRenameMilitaryRegimentCommand(regimentTargets[0], "API 回归军团"), () => findRegiment(map, regimentTargets[0]).name));

const zone = map.zones.zones[0];
const nextPattern = zone.pattern === "cross" ? "dots" : "cross";
results.push(roundTrip("zones.setStyle", map, createSetZoneStyleCommand(zone.i, {pattern: nextPattern, color: "#123456"}), () => ({pattern: zone.pattern, hexColor: zone.hexColor})));

const [consoleApiSource, appSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/runtime/console-api.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8")
]);
const expectedMethods = results.map(item => item.name);
for (const method of expectedMethods) {
  assert(consoleApiSource.includes(`"${method}"`), `capabilities 缺少 ${method}`);
  assert(consoleApiSource.includes(`"${method}": {stable: "draft"`), `元数据缺少 ${method}`);
}
const actionSignatures = {
  "measurements.import": "import: (measurements, options = {}) => importMeasurementsViaApi",
  "cities.syncOwner": "syncOwner: (cityId, options = {}) => syncCityOwnerViaApi",
  "cities.setVisual": "setVisual: (cityId, patch) => setCityVisualViaApi",
  "cities.resetVisual": "resetVisual: cityId => resetCityVisualViaApi",
  "provinces.applyChanges": "applyChanges: changes => applyProvinceChangesViaApi",
  "states.applyChanges": "applyChanges: changes => applyStateChangesViaApi",
  "states.inspectMerge": "inspectMerge: options => inspectStateMergeViaApi",
  "states.merge": "merge: options => mergeStatesViaApi",
  "states.inspectSplit": "inspectSplit: options => inspectStateSplitViaApi",
  "states.split": "split: options => splitStateViaApi",
  "states.setCapital": "setCapital: (stateId, cityId, options = {}) => setStateCapitalViaApi",
  "states.setGovernmentBatch": "setGovernmentBatch: (stateIds, governmentKey) => setStatesGovernmentBatchViaApi",
  "height.applyChanges": "applyChanges: (changes, editOptions = {}) => applyHeightChangesViaApi",
  "diplomacy.setRelation": "setRelation: (subjectId, objectId, relation, editOptions = {}) => setDiplomacyRelationViaApi",
  "military.setRatios": "setRatios: (stateId, ratios, options = {}) => operation.run(",
  "military.setStatus": "setStatus: (target, status, options = {}) => setMilitaryStatusViaApi",
  "military.setStatusBatch": "setStatusBatch: (targets, status, options = {}) => setMilitaryStatusBatchViaApi",
  "military.moveStation": "moveStation: (target, destination, options = {}) => moveMilitaryStationViaApi",
  "military.setBase": "setBase: (target, options = {}) => setMilitaryBaseViaApi",
  "military.recordBattleEvent": "recordBattleEvent: (target, event = {}) => recordMilitaryBattleEventViaApi",
  "military.importBattleEvents": "importBattleEvents: (document, options = {}) => importMilitaryBattleEventsViaApi",
  "military.clearBattleEvents": "clearBattleEvents: (target, editOptions = {}) => clearMilitaryBattleEventsViaApi",
  "military.rename": "rename: (target, name) => renameMilitaryRegimentViaApi",
  "zones.setStyle": "setStyle: (zoneId, patch) => setZoneStyleViaApi"
};
for (const [method, signature] of Object.entries(actionSignatures)) assert(appSource.includes(signature), `${method} 没有接入对应 API action`);
assert(appSource.includes("context => setMilitaryRatiosViaApi(state, documentRef, stateId, ratios, options, context)"), "military.setRatios 没有把 operation context 传入军事策略 Worker 入口");
const editResultSource = /function editApiResult\(state, result\) \{[\s\S]*?\n\}/.exec(appSource)?.[0] || "";
for (const field of ["affected:", "stale:", "noop:"]) assert(editResultSource.includes(field), `editApiResult 缺少 ${field}`);
assert(consoleApiSource.includes("buildDebugStateDump(state, documentRef, options, api)"), "debug.dumpState 没有复用真实 API 覆盖对象");
assert.equal(expectedMethods.length, 20, "第 29 项冻结方法数量漂移");
const declaredCounts = countDeclaredMethods(API_METHODS);
assert.equal(declaredCounts.edit, 179, "edit capabilities 方法数不是 179");
assert.equal(declaredCounts.total, 329, "公开 capabilities 方法总数不是 329");

console.log(JSON.stringify({
  ok: true,
  methods: expectedMethods.length,
  declaredCounts,
  commands: results.map(item => ({name: item.name, domain: item.domain, affected: item.affected}))
}, null, 2));

function roundTrip(name, targetMap, command, probe) {
  const history = new EditHistory();
  const context = {map: targetMap};
  assert.equal(command.isNoop?.(context), false, `${name} 初始状态被错误判定为 noop`);
  const before = clone(probe());
  history.execute(command, context);
  const after = clone(probe());
  assert.notDeepEqual(after, before, `${name} 执行后没有产生数据变化`);
  assert((command.effects?.affected || []).length > 0, `${name} 没有 affected`);
  history.undo(context);
  assert.deepEqual(clone(probe()), before, `${name} 撤销没有恢复原数据`);
  history.redo(context);
  assert.deepEqual(clone(probe()), after, `${name} 重做没有恢复执行后数据`);
  return {name, domain: command.domain, affected: command.effects.affected.length};
}

function findSameStateProvincePair(provinces) {
  for (const province of provinces) {
    const sibling = provinces.find(item => item.i !== province.i && item.state === province.state);
    if (sibling) return [province, sibling];
  }
  throw new Error("没有找到同国省份样本");
}

function findEditableGridCell(targetMap, field, ownerId) {
  const cityCells = new Set((targetMap.settlements?.cities || []).filter(Boolean).map(item => item.cell));
  for (let gridCell = 0; gridCell < targetMap.grid.cells[field].length; gridCell++) {
    if (Number(targetMap.grid.cells[field][gridCell]) !== Number(ownerId) || cityCells.has(gridCell)) continue;
    return gridCell;
  }
  throw new Error(`没有找到 ${field}=${ownerId} 的可编辑 grid cell`);
}

function findAlternativeCapital(targetMap) {
  for (const state of targetMap.pack.states.filter(item => item?.i && !item.removed)) {
    const city = targetMap.settlements.cities.find(item => item && item.state === state.i && item.burgId !== state.capital);
    if (city) return {state, city};
  }
  throw new Error("没有找到可替换首都的城市样本");
}

function firstRegimentTargets(targetMap, count) {
  const targets = [];
  for (const state of targetMap.pack.states || []) {
    for (const regiment of state?.military || []) {
      targets.push({id: regiment.id || `${state.i}:${regiment.i}`, stateId: state.i, regimentId: regiment.i, cell: regiment.cell});
      if (targets.length >= count) return targets;
    }
  }
  throw new Error(`军团样本不足 ${count}`);
}

function findRegiment(targetMap, target) {
  return targetMap.pack.states[target.stateId]?.military?.find(item => Number(item.i) === Number(target.regimentId));
}

function militaryStatus(targetMap, target) {
  const regiment = findRegiment(targetMap, target);
  return {status: regiment?.status, order: clone(regiment?.order)};
}

function militaryStation(targetMap, target) {
  const regiment = findRegiment(targetMap, target);
  return {cell: regiment?.cell, x: regiment?.x, y: regiment?.y, status: regiment?.status};
}

function militaryBase(targetMap, target) {
  const regiment = findRegiment(targetMap, target);
  return {baseCell: regiment?.baseCell, bcell: regiment?.bcell, bx: regiment?.bx, by: regiment?.by};
}

function militaryEventIds(targetMap, target) {
  return (findRegiment(targetMap, target)?.events || []).map(item => item.id).sort();
}

function packHeightsForGrid(targetMap, gridCell) {
  const values = [];
  for (let packCell = 0; packCell < targetMap.pack.cells.g.length; packCell++) {
    if (targetMap.pack.cells.g[packCell] === gridCell) values.push(Number(targetMap.pack.cells.h[packCell]));
  }
  return values;
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function countDeclaredMethods(methods) {
  const counts = Object.fromEntries(Object.entries(methods).map(([namespace, names]) => [namespace, names.length]));
  return {
    total: Object.values(counts).reduce((sum, value) => sum + value, 0),
    edit: counts.edit,
    namespaces: counts
  };
}
