import assert from "node:assert/strict";

import {API_METHODS, CONFIRM_REQUIRED_METHODS} from "../app/webgl-generator/src/runtime/api-contract.js";
import {buildApiMethodDescriptionRegistry} from "../app/webgl-generator/src/runtime/api-schema-registry.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {
  createEnsureProvinceAssignmentCommand,
  createProvinceTransferCommand,
  createTerritoryTransferCommand,
  inspectEnsureProvinceAssignment,
  inspectProvinceTransfer,
  inspectTerritoryTransfer,
  POLITICAL_TRANSFER_ACTION
} from "../app/webgl-generator/src/runtime/state-topology-commands.js";

const ensureMap = createFixture();
const ensureBefore = snapshot(ensureMap);
const ensureInspection = inspectEnsureProvinceAssignment(ensureMap, {
  stateId: 1,
  gridCellIds: [1],
  mode: "ensure",
  anchorGridCell: 1
});
assert.equal(ensureInspection.allowed, true);
assert.equal(ensureInspection.normalizedInput.mode, "ensure");
assert.equal(ensureInspection.requiresConfirm, true);
const ensuredProvinceId = ensureInspection.provincePlan.provinceId;
const ensureHistory = new EditHistory();
ensureHistory.execute(createEnsureProvinceAssignmentCommand(ensureInspection.normalizedInput), {map: ensureMap});
assert.equal(ensureMap.grid.cells.province[1], ensuredProvinceId);
assert.equal(ensureMap.pack.cells.province[1], ensuredProvinceId);
assert.equal(ensureMap.grid.cells.province[0], 1, "ensure 只能修改冻结选区，不能扩圈");
assert.equal(ensureMap.pack.cells.province[0], 1, "ensure 不能修改选区外 pack cell");
assertProvincialCapitals(ensureMap);
assert.equal(ensureHistory.getStats().undo, 1);
const ensureAfter = snapshot(ensureMap);
ensureHistory.undo({map: ensureMap});
assert.equal(snapshot(ensureMap), ensureBefore);
ensureHistory.redo({map: ensureMap});
assert.equal(snapshot(ensureMap), ensureAfter);
assertProvincialCapitals(ensureMap);

const cedeMap = createFixture();
const cedeBefore = snapshot(cedeMap);
const cedeInput = {
  mode: "cede",
  sourceStateId: 1,
  targetStateId: 2,
  gridCellIds: [2],
  province: {mode: "auto"}
};
const cedeInspection = inspectTerritoryTransfer(cedeMap, cedeInput);
assert.equal(cedeInspection.allowed, true);
assert.equal(cedeInspection.provincePlan.provinceId, 3, "auto 必须选择边界最多的目标省");
cedeMap.settlements.cities[1].capital = false;
assert.equal(
  inspectTerritoryTransfer(cedeMap, cedeInput).sourceCapitalCityIdAfter,
  1,
  "旧图未标 city.capital 时仍必须保留未被转移的现有首都"
);
cedeMap.settlements.cities[1].capital = true;
const cedeHistory = new EditHistory();
cedeHistory.execute(createTerritoryTransferCommand(cedeInspection.normalizedInput), {map: cedeMap});
assert.equal(cedeMap.pack.cells.state[2], 2);
assert.equal(cedeMap.pack.cells.province[2], 3);
assert.equal(cedeMap.settlements.cities[2].state, 2);
assert.equal(cedeMap.settlements.routes[1].state, 2, "路线镜像必须跟随起点城市");
assert.equal(cedeMap.pack.routes[1].state, 2);
assertMirror(cedeMap, "states", [1, 2]);
assertMirror(cedeMap, "provinces", [2, 3]);
assertProvincialCapitals(cedeMap);
cedeHistory.undo({map: cedeMap});
assert.equal(snapshot(cedeMap), cedeBefore);
cedeHistory.redo({map: cedeMap});
assertProvincialCapitals(cedeMap);

const provinceMap = createFixture();
const provinceInspection = inspectProvinceTransfer(provinceMap, {provinceId: 2, targetStateId: 2});
assert.equal(provinceInspection.allowed, true);
const provinceHistory = new EditHistory();
provinceHistory.execute(createProvinceTransferCommand(provinceInspection.normalizedInput), {map: provinceMap});
assert.equal(provinceMap.politics.provinces[2].state, 2);
assert.equal(provinceMap.pack.provinces[2].state, 2);
assert.equal(provinceMap.pack.cells.state[2], 2);
assert.equal(provinceHistory.getStats().undo, 1);
assertProvincialCapitals(provinceMap);
provinceHistory.undo({map: provinceMap});
assertProvincialCapitals(provinceMap);
provinceHistory.redo({map: provinceMap});
assertProvincialCapitals(provinceMap);

const capitalMap = createFixture();
const capitalHistory = new EditHistory();
capitalHistory.execute(createTerritoryTransferCommand({
  mode: "cede",
  sourceStateId: 1,
  targetStateId: 2,
  gridCellIds: [0],
  province: {mode: "existing", provinceId: 3}
}), {map: capitalMap});
assert.equal(capitalMap.politics.states[1].capital, 2, "部分划走首都后必须确定性补都");
assert.equal(capitalMap.settlements.cities[2].capital, true);
assert.equal(capitalMap.politics.states[2].capital, 3, "目标国家首都不得变化");

const extinctionMap = createFixture();
const extinctionHistory = new EditHistory();
extinctionHistory.execute(createTerritoryTransferCommand({
  mode: "cede",
  sourceStateId: 1,
  targetStateId: 2,
  gridCellIds: [0, 1, 2],
  province: {mode: "existing", provinceId: 3}
}), {map: extinctionMap});
assert.equal(extinctionMap.politics.states[1].removed, true);
assert.equal(extinctionMap.politics.states[2].military.length, 1, "最后领土转入目标时来源军团必须转入目标");
assert.equal(extinctionMap.politics.states[2].military[0].id, "2:0");
assert.equal(extinctionMap.pack.states[2].military[0].id, "2:0");

const neutralMap = createFixture();
const neutralHistory = new EditHistory();
neutralHistory.execute(createTerritoryTransferCommand({
  mode: "neutralize",
  sourceStateId: 1,
  gridCellIds: [0, 1, 2]
}), {map: neutralMap});
assert.equal(neutralMap.politics.states[1].removed, true);
assert.equal(neutralMap.politics.states[1].military.length, 0);
assert.equal(neutralMap.pack.cells.state[0], 0);
assert.equal(neutralMap.pack.cells.province[0], 0);
assert.equal(neutralMap.military.events.length, 0, "neutralize 灭国必须清理军团活动引用");
assert.equal(neutralMap.military.campaigns[0].ended, true);

const faultMap = createFixture();
const faultBefore = snapshot(faultMap);
const faultHistory = new EditHistory();
assert.throws(() => faultHistory.execute(createTerritoryTransferCommand(cedeInput, {faultAt: "after-province"}), {map: faultMap}), /故障注入/);
assert.equal(snapshot(faultMap), faultBefore, "故障必须回滚整图事务");
assert.equal(faultHistory.getStats().undo, 0);

const oldMap = createFixture();
delete oldMap.pack.states;
delete oldMap.pack.provinces;
delete oldMap.pack.routes;
delete oldMap.economy;
const oldHistory = new EditHistory();
oldHistory.execute(createEnsureProvinceAssignmentCommand({
  stateId: 1,
  gridCellIds: [1],
  mode: "ensure",
  anchorGridCell: 1
}), {map: oldMap});
assert.equal(oldMap.grid.cells.province[0], 1);
assert(oldMap.politics.provinces.some(province => province?.center === 1), "旧图必须可追加新省");

const codes = {};
codes.invalidTransferMode = inspectTerritoryTransfer(createFixture(), {mode: "bad"}).code;
codes.sameState = inspectTerritoryTransfer(createFixture(), {
  mode: "cede", sourceStateId: 1, targetStateId: 1, gridCellIds: [2], province: {mode: "auto"}
}).code;
const peaceMap = createFixture();
peaceMap.politics.states[1].diplomacy[2] = "Neutral";
peaceMap.pack.states[1].diplomacy[2] = "Neutral";
codes.warRequired = inspectTerritoryTransfer(peaceMap, {
  mode: "conquer", sourceStateId: 1, targetStateId: 2, gridCellIds: [2], province: {mode: "auto"}
}).code;
const noCapitalMap = createFixture();
noCapitalMap.settlements.cities[2].removed = true;
noCapitalMap.pack.burgs[2].removed = true;
codes.sourceCapital = inspectTerritoryTransfer(noCapitalMap, {
  mode: "cede", sourceStateId: 1, targetStateId: 2, gridCellIds: [0], province: {mode: "auto"}
}).code;
const noRetreatMap = createFixture();
noRetreatMap.settlements.cities[1].packCell = 3;
noRetreatMap.settlements.cities[1].cell = 3;
noRetreatMap.politics.states[1].center = 0;
noRetreatMap.pack.states[1].center = 0;
codes.military = inspectTerritoryTransfer(noRetreatMap, {
  mode: "cede", sourceStateId: 1, targetStateId: 2, gridCellIds: [0], province: {mode: "auto"}
}).code;
const emptyProvinceMap = createFixture();
emptyProvinceMap.pack.cells.province[2] = 0;
emptyProvinceMap.grid.cells.province[2] = 0;
codes.provinceEmpty = inspectProvinceTransfer(emptyProvinceMap, {provinceId: 2, targetStateId: 2}).code;
const mixedProvinceMap = createFixture();
mixedProvinceMap.pack.cells.state[2] = 2;
codes.provinceOwner = inspectProvinceTransfer(mixedProvinceMap, {provinceId: 2, targetStateId: 2}).code;
const missingSourceMap = createFixture();
missingSourceMap.politics.provinces[2].state = 99;
missingSourceMap.pack.provinces[2].state = 99;
codes.sourceState = inspectProvinceTransfer(missingSourceMap, {provinceId: 2, targetStateId: 2}).code;
codes.cellState = inspectEnsureProvinceAssignment(createFixture(), {
  stateId: 1, gridCellIds: [3], mode: "ensure", anchorGridCell: 3
}).code;
codes.provinceMissing = inspectEnsureProvinceAssignment(createFixture(), {
  stateId: 1, gridCellIds: [1], mode: "existing", provinceId: 99
}).code;
codes.provinceState = inspectEnsureProvinceAssignment(createFixture(), {
  stateId: 1, gridCellIds: [1], mode: "existing", provinceId: 3
}).code;
codes.provinceAnchor = inspectEnsureProvinceAssignment(createFixture(), {
  stateId: 1, gridCellIds: [1], mode: "ensure", anchorGridCell: 2
}).code;
codes.territoryEmpty = inspectTerritoryTransfer(createFixture(), {
  mode: "neutralize", sourceStateId: 1, gridCellIds: []
}).code;
codes.assignmentEmpty = inspectEnsureProvinceAssignment(createFixture(), {
  stateId: 1, gridCellIds: [], mode: "auto"
}).code;
assert.deepEqual(codes, {
  invalidTransferMode: "invalid-transfer-mode",
  sameState: "same-state",
  warRequired: "war-required",
  sourceCapital: "source-capital-candidate-missing",
  military: "military-relocation-unresolved",
  provinceEmpty: "province-territory-empty",
  provinceOwner: "province-owner-mismatch",
  sourceState: "source-state-not-found",
  cellState: "cell-state-mismatch",
  provinceMissing: "province-not-found",
  provinceState: "province-state-mismatch",
  provinceAnchor: "province-anchor-invalid",
  territoryEmpty: "territory-empty",
  assignmentEmpty: "assignment-empty"
});

const syntheticMetadata = Object.fromEntries(Object.entries(API_METHODS).map(([namespace, methods]) => [
  namespace,
  Object.fromEntries(methods.map(method => [method, {
    requiresConfirm: CONFIRM_REQUIRED_METHODS.includes(`${namespace}.${method}`)
  }]))
]));
const descriptions = buildApiMethodDescriptionRegistry(API_METHODS, syntheticMetadata);
for (const method of [
  "edit.states.inspectTerritoryTransfer",
  "edit.provinces.inspectEnsureAssignment",
  "edit.provinces.inspectTransfer"
]) {
  const required = descriptions[method]?.resultSchema?.properties?.data?.required || [];
  for (const field of [
    "allowed", "code", "summary", "normalizedInput", "affected", "requiresConfirm",
    "expectedRevision", "inspectionToken", "inspectorSchemaVersion"
  ]) {
    assert.ok(required.includes(field), `${method} 的 info.describe 缺少 ${field}`);
  }
}
for (const method of [
  "edit.states.transferTerritory",
  "edit.provinces.ensureAssignment",
  "edit.provinces.transfer"
]) {
  const inputSchema = descriptions[method]?.inputSchema;
  const options = inputSchema?.prefixItems?.find(item => item.title === "options");
  assert.ok(options?.properties?.inspectionToken, `${method} 没有描述 inspectionToken`);
  assert.ok(options?.properties?.expectedRevision, `${method} 没有描述 expectedRevision`);
  assert.ok(options?.required?.includes("inspectionToken"), `${method} 没有强制 inspectionToken`);
  assert.ok(options?.required?.includes("expectedRevision"), `${method} 没有强制 expectedRevision`);
  assert.equal(inputSchema?.minItems, 2, `${method} 没有强制 options 参数`);
  assert.ok(descriptions[method].businessCodes.includes("inspection-required"), `${method} 缺少 inspection-required`);
}
for (const method of ["edit.states.transferTerritory", "edit.provinces.transfer"]) {
  const options = descriptions[method].inputSchema.prefixItems[1];
  assert.ok(options.required.includes("confirm"), `${method} 没有强制 confirm`);
  assert.equal(options.properties.confirm.const, true, `${method} 的 confirm 必须固定为 true`);
  assert.ok(descriptions[method].businessCodes.includes("confirmation_required"), `${method} 缺少 confirmation_required`);
}
for (const [method, unreachableCodes] of [
  ["edit.states.inspectTerritoryTransfer", ["territory-unchanged"]],
  ["edit.provinces.inspectEnsureAssignment", ["province-capital-repair-failed"]],
  ["edit.provinces.inspectTransfer", ["province-transfer-unchanged"]]
]) {
  for (const code of unreachableCodes) {
    assert.equal(descriptions[method].businessCodes.includes(code), false, `${method} 不得声明不可达的 ${code}`);
  }
}

console.log(JSON.stringify({
  actions: POLITICAL_TRANSFER_ACTION,
  ensuredProvinceId,
  exactSelection: ensureMap.grid.cells.province[0] === 1,
  partialCapital: capitalMap.politics.states[1].capital,
  extinctionMilitary: extinctionMap.politics.states[2].military.map(item => item.id),
  neutralized: neutralMap.politics.states[1].removed,
  rollback: snapshot(faultMap) === faultBefore,
  codes
}, null, 2));

function createFixture() {
  const stateRows = [
    {id: 0, i: 0, name: "中立地", removed: false, diplomacy: ["x", "x", "x"], military: []},
    {
      id: 1, i: 1, name: "甲国", fullName: "甲王国", formName: "王国", capital: 1, capitalName: "甲都",
      center: 0, gridCenter: 0, culture: 1, religion: 1, removed: false, diplomacy: ["x", "x", "Enemy"],
      military: [{id: "1:0", i: 0, state: 1, cell: 1, baseCell: 0, a: 100, status: "active"}]
    },
    {
      id: 2, i: 2, name: "乙国", fullName: "乙王国", formName: "王国", capital: 3, capitalName: "乙都",
      center: 4, gridCenter: 4, culture: 1, religion: 1, removed: false, diplomacy: ["x", "Enemy", "x"], military: []
    }
  ];
  const provinceRows = [
    null,
    province(1, 1, 0, 1, "甲州", 20),
    province(2, 1, 2, 2, "甲边州", 10),
    province(3, 2, 3, 3, "乙边州", 30),
    province(4, 2, 5, 4, "乙州", 10)
  ];
  const cities = [
    null,
    city(1, 1, "甲都", 0, 1, 1, true, 20),
    city(2, 2, "甲城", 2, 1, 2, false, 12),
    city(3, 3, "乙都", 4, 2, 3, true, 18),
    city(4, 4, "乙城", 5, 2, 4, false, 10)
  ];
  const burgs = cities.map(item => item ? {
    i: item.burgId, id: item.burgId, cityId: item.id, name: item.name, cell: item.packCell,
    state: item.state, province: item.province, culture: 1, religion: 1, capital: Number(item.capital),
    group: item.capital ? "capital" : "town"
  } : null);
  const adjacency = [[1, 3], [0, 2], [1, 3], [0, 2, 4], [3, 5], [4]];
  const state = [1, 1, 1, 2, 2, 2];
  const provinceIds = [1, 1, 2, 3, 3, 4];
  const map = {
    options: {seed: "political-transfer-regression", provincesRatio: 50},
    metadata: {},
    grid: {cells: {
      i: [0, 1, 2, 3, 4, 5], h: [30, 30, 30, 30, 30, 30], c: adjacency.map(row => [...row]),
      state: Uint16Array.from(state), province: Uint16Array.from(provinceIds), p: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]]
    }},
    pack: {
      cells: {
        i: [0, 1, 2, 3, 4, 5], h: [30, 30, 30, 30, 30, 30], c: adjacency.map(row => [...row]),
        g: [0, 1, 2, 3, 4, 5], state: Uint16Array.from(state), province: Uint16Array.from(provinceIds),
        area: [10, 10, 10, 10, 10, 10], pop: [2, 2, 2, 2, 2, 2], religion: [1, 1, 1, 1, 1, 1],
        p: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]], s: [1, 2, 3, 4, 5, 6]
      },
      states: structuredClone(stateRows),
      provinces: structuredClone(provinceRows),
      burgs,
      routes: [null, {i: 1, state: 1, province: 2, group: "roads", points: []}],
      markets: [null, {i: 1, centerBurgId: 2, state: 1}],
      diplomacy: null,
      military: null
    },
    politics: {states: structuredClone(stateRows), provinces: structuredClone(provinceRows), metadata: {}},
    settlements: {
      cities,
      routes: [null, {id: 1, from: 2, to: 3, type: "road", packCells: [2, 3], points: [[2, 0], [3, 0]], state: 1, province: 2}],
      metadata: {cities: 4, capitals: 2, provincialCapitals: 4}
    },
    economy: {markets: [null, {i: 1, centerBurgId: 2, state: 1}]},
    diplomacy: {relations: {}, chronicle: [], metadata: {}},
    military: {
      campaigns: [{id: "campaign-1", attacker: 1, defender: 2, ended: false}],
      fronts: [{id: "front-1", attacker: 1, defender: 2, ended: false}],
      events: [{id: "event-1", stateId: 1, regimentId: 0, regimentObjectId: "1:0"}],
      metadata: {}
    }
  };
  map.pack.diplomacy = structuredClone(map.diplomacy);
  map.pack.military = structuredClone(map.military);
  return map;
}

function province(id, state, center, burg, name, area) {
  return {id, i: id, state, center, gridCenter: center, burg, name, formName: "州", fullName: name, area, cells: id === 1 || id === 3 ? 2 : 1, neighbors: [], removed: false};
}

function city(id, burgId, name, cell, state, province, capital, population) {
  return {id, burgId, name, cell, packCell: cell, state, province, culture: 1, religion: 1, capital, provincial: true, population, group: capital ? "capital" : "town"};
}

function assertMirror(map, key, ids) {
  for (const id of ids) assert.deepEqual(map.politics[key][id], map.pack[key][id], `${key} #${id} 镜像不一致`);
}

function assertProvincialCapitals(map) {
  const activeProvinces = (map.politics.provinces || []).filter(province => province && !province.removed);
  for (const province of activeProvinces) {
    const cities = (map.settlements.cities || []).filter(city => city && !city.removed && Number(city.province) === Number(province.i));
    const capital = cities.find(city => Number(city.burgId) === Number(province.burg));
    if (Number(province.burg)) {
      assert.ok(capital, `省份 #${province.i} 的省会必须对应同省城市`);
      assert.equal(capital.provincial, true, `省份 #${province.i} 的省会城市必须保留 provincial`);
    }
    assert.equal(cities.filter(city => city.provincial).length, Number(province.burg) ? 1 : 0, `省份 #${province.i} 只能有一个省会标记`);
  }
  const expected = activeProvinces.filter(province => Number(province.burg)).length;
  assert.equal(map.settlements.metadata.provincialCapitals, expected, "省会元数据必须与活动省份一致");
}

function snapshot(value) {
  return JSON.stringify(value, (_key, item) => ArrayBuffer.isView(item) ? Array.from(item) : item);
}
