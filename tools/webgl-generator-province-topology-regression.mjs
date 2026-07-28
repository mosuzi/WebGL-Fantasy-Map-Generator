import assert from "node:assert/strict";

import {API_METHODS, CONFIRM_REQUIRED_METHODS} from "../app/webgl-generator/src/runtime/api-contract.js";
import {buildApiMethodDescriptionRegistry} from "../app/webgl-generator/src/runtime/api-schema-registry.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {
  createMergeProvincesCommand,
  createSplitProvinceCommand,
  inspectProvinceMerge,
  inspectProvinceSplit,
  inspectProvinceTopologyTransaction,
  PROVINCE_TOPOLOGY_ACTION
} from "../app/webgl-generator/src/runtime/state-topology-commands.js";

const mergeMap = createFixture();
const mergeBefore = snapshot(mergeMap);
const mergeInspection = inspectProvinceMerge(mergeMap, {
  provinceIds: [2, 1],
  targetProvinceId: 1
});
assert.equal(mergeInspection.allowed, true);
assert.deepEqual(mergeInspection.normalizedInput.provinceIds, [1, 2]);
assert.equal(mergeInspection.capitalCityId, 1, "默认必须保留目标省有效旧省会");
const targetCustom = structuredClone(mergeMap.politics.provinces[1].custom);
const mergeHistory = new EditHistory();
const mergeCommand = createMergeProvincesCommand(mergeInspection.normalizedInput, {timestamp: "2026-07-29T00:00:00.000Z"});
mergeHistory.execute(mergeCommand, {map: mergeMap});
assert.equal(mergeHistory.getStats().undo, 1);
assert.deepEqual(Array.from(mergeMap.pack.cells.province.slice(0, 6)), [1, 1, 1, 1, 1, 1]);
assert.deepEqual(Array.from(mergeMap.grid.cells.province.slice(0, 3)), [1, 1, 1]);
assert.equal(mergeMap.politics.provinces[2].removed, true);
assert.deepEqual(mergeMap.politics.provinces[1].custom, targetCustom, "目标省全部用户字段必须保留");
assert.equal(mergeMap.settlements.cities[3].province, 1);
assert.equal(mergeMap.pack.burgs[3].province, 1);
assert.deepEqual(mergeMap.politics.states[1].provinces, [1]);
assert.deepEqual(mergeMap.politics.provinces[3].neighbors, [1]);
assertProvinceCapital(mergeMap, 1, 1);
assertMirror(mergeMap, "provinces", [1, 2, 3]);
assertMirror(mergeMap, "states", [1]);
const mergeAfter = snapshot(mergeMap);
mergeHistory.undo({map: mergeMap});
assert.equal(snapshot(mergeMap), mergeBefore);
mergeHistory.redo({map: mergeMap});
assert.equal(snapshot(mergeMap), mergeAfter);

const explicitMergeMap = createFixture();
const explicitMerge = inspectProvinceMerge(explicitMergeMap, {
  provinceIds: [1, 2],
  targetProvinceId: 1,
  capitalCityId: 3
});
assert.equal(explicitMerge.allowed, true);
new EditHistory().execute(createMergeProvincesCommand(explicitMerge.normalizedInput), {map: explicitMergeMap});
assertProvinceCapital(explicitMergeMap, 1, 3);

const splitMap = createFixture({historicalProvinceId: 9});
const splitBefore = snapshot(splitMap);
const splitInspection = inspectProvinceSplit(splitMap, {
  sourceProvinceId: 1,
  packCellIds: [3, 1, 2]
});
assert.equal(splitInspection.allowed, true);
assert.equal(splitInspection.newProvinceId, 10, "新省 ID 必须取全部历史最大 ID + 1");
assert.equal(splitInspection.sourceCapitalCityId, 1);
assert.equal(splitInspection.newCapitalCityId, 2);
assert.deepEqual(splitInspection.gridAssignments, [
  {gridCell: 0, provinceId: 1, selectedVotes: 1, remainderVotes: 1},
  {gridCell: 1, provinceId: 10, selectedVotes: 2, remainderVotes: 0}
], "grid 多数票和平票归较小 source ID 必须冻结");
const splitHistory = new EditHistory();
const splitCommand = createSplitProvinceCommand(splitInspection.normalizedInput, {timestamp: "2026-07-29T00:00:00.000Z"});
splitHistory.execute(splitCommand, {map: splitMap});
assert.equal(splitHistory.getStats().undo, 1);
assert.deepEqual(Array.from(splitMap.pack.cells.province.slice(0, 4)), [1, 10, 10, 10]);
assert.deepEqual(Array.from(splitMap.grid.cells.province.slice(0, 2)), [1, 10]);
assert.equal(splitMap.settlements.cities[2].province, 10);
assert.equal(splitMap.pack.burgs[2].province, 10);
assert.equal(splitMap.politics.provinces[10].state, 1);
assert.equal(splitMap.politics.provinces[10].removed, false);
assert.ok(splitMap.politics.provinces[10].name);
assert.ok(splitMap.politics.provinces[10].color);
assert.deepEqual(splitMap.politics.states[1].provinces, [1, 2, 10]);
assertProvinceCapital(splitMap, 1, 1);
assertProvinceCapital(splitMap, 10, 2);
assertMirror(splitMap, "provinces", [1, 10]);
assertMirror(splitMap, "states", [1]);
const splitAfter = snapshot(splitMap);
splitHistory.undo({map: splitMap});
assert.equal(snapshot(splitMap), splitBefore);
splitHistory.redo({map: splitMap});
assert.equal(snapshot(splitMap), splitAfter);

testRejectedInspections();
testFaultRollback();
testLegacyMirrorsAndTypedArrays();
testSharedGridThirdProvinceOwner();

assert.equal(
  inspectProvinceTopologyTransaction(createFixture(), "politics.unknown", {}).code,
  "unknown-action"
);
assert.equal(
  inspectProvinceTopologyTransaction(createFixture(), PROVINCE_TOPOLOGY_ACTION.MERGE, {
    provinceIds: [1, 2],
    targetProvinceId: 1
  }).allowed,
  true
);

const syntheticMetadata = Object.fromEntries(Object.entries(API_METHODS).map(([namespace, methods]) => [
  namespace,
  Object.fromEntries(methods.map(method => [method, {
    requiresConfirm: CONFIRM_REQUIRED_METHODS.includes(`${namespace}.${method}`)
  }]))
]));
const descriptions = buildApiMethodDescriptionRegistry(API_METHODS, syntheticMetadata);
for (const method of ["edit.provinces.inspectMerge", "edit.provinces.inspectSplit"]) {
  const required = descriptions[method]?.resultSchema?.properties?.data?.required || [];
  for (const field of [
    "allowed", "code", "summary", "normalizedInput", "affected", "requiresConfirm",
    "expectedRevision", "inspectionToken", "inspectorSchemaVersion"
  ]) {
    assert.ok(required.includes(field), `${method} 的 info.describe 缺少 ${field}`);
  }
}
for (const method of ["edit.provinces.merge", "edit.provinces.split"]) {
  const inputSchema = descriptions[method]?.inputSchema;
  const options = inputSchema?.prefixItems?.find(item => item.title === "options");
  assert.equal(inputSchema?.minItems, 2, `${method} 必须要求 options`);
  for (const field of ["inspectionToken", "expectedRevision", "confirm"]) {
    assert.ok(options?.required?.includes(field), `${method} 没有强制 ${field}`);
  }
  assert.equal(options.properties.confirm.const, true, `${method} 的 confirm 必须固定为 true`);
  assert.ok(descriptions[method].businessCodes.includes("inspection-required"));
  assert.ok(descriptions[method].businessCodes.includes("confirmation_required"));
}
for (const [method, code] of [
  ["edit.provinces.inspectMerge", "capital-candidate-missing"],
  ["edit.provinces.inspectSplit", "source-capital-candidate-missing"]
]) {
  assert.ok(descriptions[method].businessCodes.includes(code), `${method} 缺少 ${code}`);
}
for (const method of ["edit.provinces.inspectMerge", "edit.provinces.inspectSplit"]) {
  assert.equal(descriptions[method].businessCodes.some(code => code.endsWith("-unchanged")), false, `${method} 不得声明不可达 no-op code`);
}

console.log(JSON.stringify({
  ok: true,
  actions: PROVINCE_TOPOLOGY_ACTION,
  merge: {
    targetProvinceId: mergeInspection.targetProvinceId,
    tombstonedProvinceIds: mergeInspection.tombstonedProvinceIds,
    capitalCityId: mergeInspection.capitalCityId
  },
  split: {
    sourceProvinceId: splitInspection.sourceProvinceId,
    newProvinceId: splitInspection.newProvinceId,
    gridAssignments: splitInspection.gridAssignments
  },
  faultRollback: true,
  legacyMirrors: true
}, null, 2));

function testRejectedInspections() {
  const mergeCases = [
    ["province-selection-too-small", map => inspectProvinceMerge(map, {provinceIds: [1], targetProvinceId: 1})],
    ["target-province-not-selected", map => inspectProvinceMerge(map, {provinceIds: [1, 2], targetProvinceId: 3})],
    ["province-not-found", map => inspectProvinceMerge(map, {provinceIds: [1, 99], targetProvinceId: 1})],
    ["province-state-mismatch", map => inspectProvinceMerge(map, {provinceIds: [1, 3], targetProvinceId: 1})],
    ["province-territory-empty", map => {
      for (const cell of [4, 5]) map.pack.cells.province[cell] = 0;
      return inspectProvinceMerge(map, {provinceIds: [1, 2], targetProvinceId: 1});
    }],
    ["province-owner-mismatch", map => {
      map.pack.cells.state[4] = 2;
      return inspectProvinceMerge(map, {provinceIds: [1, 2], targetProvinceId: 1});
    }],
    ["merge-region-disconnected", map => {
      setProvinceState(map, 3, 1);
      map.pack.cells.state[6] = 1;
      map.pack.cells.state[7] = 1;
      return inspectProvinceMerge(map, {provinceIds: [1, 3], targetProvinceId: 1});
    }],
    ["merge-region-without-city", map => {
      removeCities(map, [1, 2, 3]);
      return inspectProvinceMerge(map, {provinceIds: [1, 2], targetProvinceId: 1});
    }],
    ["capital-city-not-found", map => inspectProvinceMerge(map, {provinceIds: [1, 2], targetProvinceId: 1, capitalCityId: 99})],
    ["capital-outside-merge", map => inspectProvinceMerge(map, {provinceIds: [1, 2], targetProvinceId: 1, capitalCityId: 4})],
    ["capital-candidate-missing", map => {
      removeBurgs(map, [1, 2, 3]);
      return inspectProvinceMerge(map, {provinceIds: [1, 2], targetProvinceId: 1});
    }]
  ];
  for (const [code, inspect] of mergeCases) assert.equal(inspect(createFixture()).code, code, `merge 必须返回 ${code}`);

  const splitCases = [
    ["source-province-not-found", map => inspectProvinceSplit(map, {sourceProvinceId: 99, packCellIds: [1]})],
    ["source-province-territory-empty", map => {
      for (const cell of [0, 1, 2, 3]) map.pack.cells.province[cell] = 0;
      return inspectProvinceSplit(map, {sourceProvinceId: 1, packCellIds: [1]});
    }],
    ["split-selection-empty", map => inspectProvinceSplit(map, {sourceProvinceId: 1, packCellIds: []})],
    ["pack-cell-invalid", map => inspectProvinceSplit(map, {sourceProvinceId: 1, packCellIds: [1, 1]})],
    ["pack-cell-water", map => {
      map.pack.cells.h[1] = 10;
      return inspectProvinceSplit(map, {sourceProvinceId: 1, packCellIds: [1]});
    }],
    ["pack-cell-outside-source", map => inspectProvinceSplit(map, {sourceProvinceId: 1, packCellIds: [4]})],
    ["split-covers-all", map => inspectProvinceSplit(map, {sourceProvinceId: 1, packCellIds: [0, 1, 2, 3]})],
    ["split-side-disconnected", map => inspectProvinceSplit(map, {sourceProvinceId: 1, packCellIds: [0, 2]})],
    ["split-side-without-city", map => inspectProvinceSplit(map, {sourceProvinceId: 1, packCellIds: [3]})],
    ["new-capital-not-found", map => inspectProvinceSplit(map, {sourceProvinceId: 1, packCellIds: [1, 2, 3], newCapitalCityId: 99})],
    ["new-capital-outside-selection", map => inspectProvinceSplit(map, {sourceProvinceId: 1, packCellIds: [1, 2, 3], newCapitalCityId: 1})],
    ["source-capital-candidate-missing", map => {
      removeBurgs(map, [1]);
      map.politics.provinces[1].burg = 2;
      map.pack.provinces[1].burg = 2;
      return inspectProvinceSplit(map, {sourceProvinceId: 1, packCellIds: [2, 3]});
    }],
    ["pack-grid-mapping-missing", map => {
      map.pack.cells.g[3] = 99;
      return inspectProvinceSplit(map, {sourceProvinceId: 1, packCellIds: [1, 2, 3]});
    }],
    ["province-id-overflow", map => {
      map.politics.provinces[4] = {id: 65535, i: 65535, removed: true};
      map.pack.provinces[4] = {id: 65535, i: 65535, removed: true};
      return inspectProvinceSplit(map, {sourceProvinceId: 1, packCellIds: [1, 2, 3]});
    }]
  ];
  for (const [code, inspect] of splitCases) assert.equal(inspect(createFixture()).code, code, `split 必须返回 ${code}`);
}

function testFaultRollback() {
  for (const [kind, inspect, createCommand, stages] of [
    ["merge", map => inspectProvinceMerge(map, {provinceIds: [1, 2], targetProvinceId: 1}), createMergeProvincesCommand,
      ["after-pack-assignment", "after-grid-sync", "after-tombstones", "after-city-sync", "after-capitals", "after-neighbors", "after-metadata", "before-validate"]],
    ["split", map => inspectProvinceSplit(map, {sourceProvinceId: 1, packCellIds: [1, 2, 3]}), createSplitProvinceCommand,
      ["after-pack-assignment", "after-grid-sync", "after-new-record", "after-city-sync", "after-capitals", "after-neighbors", "after-metadata", "before-validate"]]
  ]) {
    for (const stage of stages) {
      const map = createFixture();
      const before = snapshot(map);
      const history = new EditHistory();
      const command = createCommand(inspect(map).normalizedInput, {faultAt: stage});
      assert.throws(() => history.execute(command, {map}), /故障注入/, `${kind}.${stage} 必须抛出故障注入`);
      assert.equal(snapshot(map), before, `${kind}.${stage} 故障必须恢复整图`);
      assert.equal(history.getStats().undo, 0, `${kind}.${stage} 故障不得写入历史`);
    }
  }
}

function testLegacyMirrorsAndTypedArrays() {
  const map = createFixture({historicalProvinceId: 300});
  map.grid.cells.province = Uint8Array.from(map.grid.cells.province);
  map.pack.cells.province = Uint8Array.from(map.pack.cells.province);
  const gridProvinceRef = map.grid.cells.province;
  const packProvinceRef = map.pack.cells.province;
  delete map.pack.states;
  delete map.pack.provinces;
  delete map.pack.routes;
  delete map.economy;
  const before = snapshot(map);
  const history = new EditHistory();
  const inspection = inspectProvinceSplit(map, {sourceProvinceId: 1, packCellIds: [1, 2, 3]});
  assert.equal(inspection.allowed, true);
  history.execute(createSplitProvinceCommand(inspection.normalizedInput), {map});
  assert.equal(map.politics.provinces[301].state, 1);
  assert.ok(map.grid.cells.province instanceof Uint16Array);
  assert.ok(map.pack.cells.province instanceof Uint16Array);
  assert.ok(Array.from(map.pack.cells.province).includes(301), "Uint8 旧图的新省 ID 不得截断");
  history.undo({map});
  assert.equal(snapshot(map), before);
  assert.equal(map.grid.cells.province, gridProvinceRef, "撤销必须恢复原 grid province 引用");
  assert.equal(map.pack.cells.province, packProvinceRef, "撤销必须恢复原 pack province 引用");
  assert.ok(map.grid.cells.province instanceof Uint8Array);
  assert.ok(map.pack.cells.province instanceof Uint8Array);
  assert.equal("provinces" in map.pack, false, "撤销不得凭空构造旧图 pack.provinces");
}

function testSharedGridThirdProvinceOwner() {
  const map = createFixture();
  map.grid.cells.province[1] = 2;
  const before = snapshot(map);
  const inspection = inspectProvinceSplit(map, {sourceProvinceId: 1, packCellIds: [1, 2, 3]});
  assert.equal(inspection.allowed, true, "第三省 grid 摘要不得阻断真实 pack 拆分");
  assert.equal(inspection.gridAssignments.find(item => item.gridCell === 1)?.provinceId, 2, "第三省 grid 摘要必须保持原 owner");
  const history = new EditHistory();
  history.execute(createSplitProvinceCommand(inspection.normalizedInput), {map});
  assert.equal(map.grid.cells.province[1], 2);
  history.undo({map});
  assert.equal(snapshot(map), before);
}

function createFixture({historicalProvinceId = 0} = {}) {
  const adjacency = Array.from({length: 8}, (_, cell) => [
    ...(cell > 0 ? [cell - 1] : []),
    ...(cell < 7 ? [cell + 1] : [])
  ]);
  const stateRows = [
    {id: 0, i: 0, name: "中立地", removed: false, provinces: []},
    {id: 1, i: 1, name: "甲国", color: "#8d4a45", capital: 1, center: 0, gridCenter: 0, provinces: [1, 2], removed: false},
    {id: 2, i: 2, name: "乙国", color: "#45658d", capital: 4, center: 6, gridCenter: 3, provinces: [3], removed: false}
  ];
  const provinceRows = [
    null,
    province(1, 1, 0, 1, "甲州", [2], {custom: {lockedLabel: "保留"}}),
    province(2, 1, 4, 3, "乙州", [1, 3]),
    province(3, 2, 6, 4, "丙州", [2])
  ];
  if (historicalProvinceId) provinceRows[4] = {id: historicalProvinceId, i: historicalProvinceId, name: "旧省", removed: true};
  const cities = [
    null,
    city(1, 1, "甲城", 0, 1, 1, true, true, 12),
    city(2, 2, "乙城", 2, 1, 1, false, false, 18),
    city(3, 3, "丙城", 4, 1, 2, false, true, 30),
    city(4, 4, "丁城", 6, 2, 3, true, true, 16)
  ];
  const burgs = cities.map(item => item ? {
    id: item.burgId,
    i: item.burgId,
    cityId: item.id,
    name: item.name,
    cell: item.packCell,
    state: item.state,
    province: item.province,
    capital: Number(item.capital),
    removed: false,
    group: item.capital ? "capital" : "town"
  } : null);
  const packState = Uint16Array.from([1, 1, 1, 1, 1, 1, 2, 2]);
  const packProvince = Uint16Array.from([1, 1, 1, 1, 2, 2, 3, 3]);
  return {
    options: {seed: "province-topology-regression", provincesRatio: 50},
    metadata: {seed: "province-topology-regression", derivedStale: {systems: []}},
    grid: {cells: {
      i: [0, 1, 2, 3],
      h: Uint8Array.from([30, 30, 30, 30]),
      c: [[1], [0, 2], [1, 3], [2]],
      state: Uint16Array.from([1, 1, 1, 2]),
      province: Uint16Array.from([1, 1, 2, 3]),
      p: [[0, 0], [2, 0], [4, 0], [6, 0]]
    }},
    pack: {
      cells: {
        i: Array.from({length: 8}, (_, index) => index),
        h: Uint8Array.from(Array(8).fill(30)),
        c: adjacency,
        g: Uint32Array.from([0, 0, 1, 1, 2, 2, 3, 3]),
        state: packState,
        province: packProvince,
        area: Float64Array.from(Array(8).fill(10)),
        pop: Float64Array.from(Array(8).fill(2)),
        s: Float64Array.from([2, 3, 9, 4, 8, 1, 6, 5]),
        p: Array.from({length: 8}, (_, index) => [index, 0]),
        culture: Uint16Array.from(Array(8).fill(1)),
        religion: Uint16Array.from(Array(8).fill(1))
      },
      states: structuredClone(stateRows),
      provinces: structuredClone(provinceRows),
      burgs,
      routes: []
    },
    politics: {
      states: structuredClone(stateRows),
      provinces: structuredClone(provinceRows),
      metadata: {states: 2, provinces: 3}
    },
    settlements: {
      cities,
      routes: [],
      metadata: {cities: 4, capitals: 2, provincialCapitals: 3}
    }
  };
}

function province(id, state, center, burg, name, neighbors, extra = {}) {
  return {
    id,
    i: id,
    state,
    center,
    gridCenter: Math.floor(center / 2),
    burg,
    name,
    formName: "州",
    fullName: name,
    color: "#999999",
    cells: id === 1 ? 4 : 2,
    area: id === 1 ? 40 : 20,
    neighbors,
    removed: false,
    ...extra
  };
}

function city(id, burgId, name, packCell, state, provinceId, capital, provincial, population) {
  return {id, burgId, name, cell: packCell, packCell, state, province: provinceId, capital, provincial, population, culture: 1, religion: 1, group: capital ? "capital" : "town"};
}

function setProvinceState(map, provinceId, stateId) {
  map.politics.provinces[provinceId].state = stateId;
  map.pack.provinces[provinceId].state = stateId;
}

function removeCities(map, ids) {
  for (const id of ids) {
    map.settlements.cities[id].removed = true;
    map.pack.burgs[id].removed = true;
  }
}

function removeBurgs(map, ids) {
  for (const id of ids) map.pack.burgs[id].removed = true;
}

function assertProvinceCapital(map, provinceId, cityId) {
  const provinceItem = map.politics.provinces[provinceId];
  const cityItem = map.settlements.cities[cityId];
  assert.equal(provinceItem.burg, cityItem.burgId);
  assert.equal(provinceItem.center, cityItem.packCell);
  assert.equal(cityItem.province, provinceId);
  assert.equal(cityItem.provincial, true);
  assert.equal(
    map.settlements.cities.filter(item => item && !item.removed && item.province === provinceId && item.provincial).length,
    1
  );
}

function assertMirror(map, key, ids) {
  for (const id of ids) assert.deepEqual(map.politics[key][id], map.pack[key][id], `${key} #${id} 镜像必须一致`);
}

function snapshot(value) {
  return JSON.stringify(value, (_key, item) => ArrayBuffer.isView(item) ? Array.from(item) : item);
}
