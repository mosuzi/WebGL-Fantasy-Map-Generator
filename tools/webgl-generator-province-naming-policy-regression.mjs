#!/usr/bin/env node
import assert from "node:assert/strict";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {regeneratePackProvincesWithinStates} from "../app/webgl-generator/src/generator/politics.js";
import {
  CHINESE_PROVINCE_FORMS,
  backfillProvinceNames,
  isChineseProvinceNamingStyle,
  provinceFormForState
} from "../app/webgl-generator/src/generator/province-naming.js";
import {createAddProvinceAtCellCommand} from "../app/webgl-generator/src/runtime/province-edit-commands.js";
import {
  createCompressedMapDocumentBlob,
  createMapDocument,
  parseMapDocument,
  parseMapDocumentPayload,
  stringifyMapDocument
} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {
  createMergeStatesCommand,
  createSplitStateCommand,
  inspectStateMerge,
  inspectStateSplit
} from "../app/webgl-generator/src/runtime/state-topology-commands.js";

const options = {seed: "province-naming-policy", cellsTarget: 5000, heightmapTemplate: "continents"};
const report = {ok: true, generated: [], add: {}, rebuild: {}, merge: {}, split: {}, compatibility: {}};

assert.deepEqual(CHINESE_PROVINCE_FORMS, ["州", "郡", "府", "道", "路", "军", "镇", "司"]);
assert.equal(isChineseProvinceNamingStyle({nameStyle: "oriental"}), true);
assert.equal(isChineseProvinceNamingStyle({nameStyle: "english"}), false);

for (const seed of ["province-policy-a", "province-policy-b", "province-policy-c"]) {
  const map = generatePlaceholderMap({...options, seed});
  const summary = assertChineseStatePolicies(map);
  report.generated.push({seed, ...summary});
}

testAddProvince();
testRebuildProvinces();
testMergePreservesNames();
testSplitUsesStatePolicies();
await testCompatibilityBackfill();

console.log(JSON.stringify(report, null, 2));

function testAddProvince() {
  const map = generatePlaceholderMap({...options, seed: "province-policy-add"});
  let applied = null;
  for (const gridCell of map.grid.cells.i) {
    const command = createAddProvinceAtCellCommand(gridCell);
    if (command.isNoop({map})) continue;
    command.apply({map});
    applied = command.getResult();
    break;
  }
  assert.ok(applied?.provinceId, "固定图找不到可新增省份的 cell");
  const province = map.politics.provinces[applied.provinceId];
  const state = map.politics.states[applied.stateId];
  assert.equal(province.formName, provinceFormForState(state, map.society.cultures));
  assert.notEqual(province.formName, "领");
  report.add = {provinceId: applied.provinceId, stateId: applied.stateId, formName: province.formName};
}

function testRebuildProvinces() {
  const map = generatePlaceholderMap({...options, seed: "province-policy-rebuild"});
  const result = regeneratePackProvincesWithinStates(map.grid, map.society, map.options, map.pack, {salt: 7});
  assert.ok(result?.provinces?.length);
  map.politics.provinces = map.pack.provinces;
  const summary = assertChineseStatePolicies(map);
  report.rebuild = {...summary, salt: 7};
}

function testMergePreservesNames() {
  const map = generatePlaceholderMap({...options, seed: "state-topology-regression", cellsTarget: 3000});
  const input = findMergeInput(map);
  const inspection = inspectStateMerge(map, input);
  const oldNames = inspection.affectedOldProvinceIds.map(id => map.politics.provinces[id].fullName);
  const command = createMergeStatesCommand(input);
  command.apply({map});
  const result = command.getResult();
  const newProvinces = result.provinceIds.map(id => map.politics.provinces[id]);
  const newNames = newProvinces.map(province => province.fullName);
  for (const name of oldNames) assert.ok(newNames.includes(name), `国家合并丢失既有省名：${name}`);
  const survivor = map.politics.states[inspection.survivorStateId];
  const inheritedForm = provinceFormForState(survivor, map.society.cultures);
  for (const province of newProvinces.slice(oldNames.length)) assert.equal(province.formName, inheritedForm);
  report.merge = {oldNames: oldNames.length, newNames: newNames.length, inheritedForm};
}

function testSplitUsesStatePolicies() {
  const map = generatePlaceholderMap({...options, seed: "province-policy-split"});
  const input = findSplitInput(map);
  const command = createSplitStateCommand(input);
  command.apply({map});
  const result = command.getResult();
  for (const stateId of result.stateIds) {
    const state = map.politics.states[stateId];
    const expected = provinceFormForState(state, map.society.cultures);
    const provinces = result.provinceIds.map(id => map.politics.provinces[id]).filter(province => province.state === stateId);
    assert.ok(provinces.length, `拆分后国家 #${stateId} 没有新省份`);
    assert.ok(provinces.every(province => province.formName === expected), `拆分后国家 #${stateId} 没有使用自身省份策略`);
  }
  report.split = {stateIds: result.stateIds, provinceIds: result.provinceIds.length};
}

async function testCompatibilityBackfill() {
  const map = generatePlaceholderMap({...options, seed: "province-policy-compat"});
  const provinces = map.politics.provinces.filter(province => province?.i && !province.removed).slice(0, 3);
  assert.equal(provinces.length, 3);
  const [complete, missing, derived] = provinces;
  complete.formName = "都护府";
  complete.fullName = `${complete.name}都护府`;
  delete missing.formName;
  missing.fullName = missing.name;
  delete derived.formName;
  derived.fullName = `${derived.name}观察使司`;

  const document = createMapDocument(map, map.options);
  const roundTrip = parseMapDocument(stringifyMapDocument(document)).map;
  assert.equal(roundTrip.politics.provinces[complete.i].fullName, `${complete.name}都护府`, "完整旧省名被批量重写");
  assert.equal(roundTrip.politics.provinces[complete.i].formName, "都护府");
  const missingState = roundTrip.politics.states[missing.state];
  assert.equal(roundTrip.politics.provinces[missing.i].formName, provinceFormForState(missingState, roundTrip.society.cultures));
  assert.equal(roundTrip.politics.provinces[missing.i].fullName, `${missing.name}${roundTrip.politics.provinces[missing.i].formName}`);
  assert.equal(roundTrip.politics.provinces[derived.i].formName, "观察使司", "已有完整名称没有反推缺失后缀");
  assert.equal(roundTrip.politics.provinces[derived.i].fullName, `${derived.name}观察使司`);
  for (const province of [complete, missing, derived]) {
    assert.equal(roundTrip.pack.provinces[province.i].formName, roundTrip.politics.provinces[province.i].formName, `省份 #${province.i} 的 pack 镜像后缀未同步回填`);
    assert.equal(roundTrip.pack.provinces[province.i].fullName, roundTrip.politics.provinces[province.i].fullName, `省份 #${province.i} 的 pack 镜像全名未同步回填`);
  }

  const plain = await parseMapDocumentPayload({defaultView: globalThis}, {encoding: "plain", data: stringifyMapDocument(document)});
  assert.equal(plain.map.politics.provinces[complete.i].fullName, `${complete.name}都护府`);
  const gzip = await createCompressedMapDocumentBlob({defaultView: globalThis}, document);
  const compressed = await parseMapDocumentPayload({defaultView: globalThis}, gzip.blob);
  assert.equal(compressed.map.politics.provinces[missing.i].fullName, `${missing.name}${compressed.map.politics.provinces[missing.i].formName}`);

  const direct = structuredClone(roundTrip);
  assert.deepEqual(backfillProvinceNames(direct), {changed: 0, collections: 2}, "重复回填必须保持幂等");
  report.compatibility = {complete: complete.i, missing: missing.i, derived: derived.i, gzipBytes: gzip.compressedBytes};
}

function assertChineseStatePolicies(map) {
  let states = 0;
  let provinces = 0;
  let borderlands = 0;
  for (const state of map.politics.states || []) {
    if (!state?.i || state.removed) continue;
    const expected = provinceFormForState(state, map.society.cultures);
    const items = (map.politics.provinces || []).filter(province => province?.i && !province.removed && Number(province.state) === state.i);
    if (!items.length) continue;
    states++;
    for (const province of items) {
      provinces++;
      if (!province.burg && province.formName === "边地") {
        borderlands++;
        continue;
      }
      assert.equal(province.formName, expected, `国家 #${state.i} 的普通省份后缀不统一`);
      assert.notEqual(province.formName, "领", `国家 #${state.i} 的中国风普通省份仍使用“领”`);
    }
  }
  assert.ok(states > 0 && provinces > 0);
  return {states, provinces, borderlands};
}

function findMergeInput(map) {
  for (const state of map.politics.states || []) {
    if (!state?.i || state.removed) continue;
    for (const neighbor of state.neighbors || []) {
      const input = {survivorStateId: state.i, victimStateId: Number(neighbor)};
      if (inspectStateMerge(map, input).valid) return input;
    }
  }
  throw new Error("固定生成图找不到可合并国家");
}

function findSplitInput(map) {
  for (const state of map.politics.states || []) {
    if (!state?.i || state.removed) continue;
    const provinces = (map.politics.provinces || []).filter(province => province?.i && !province.removed && Number(province.state) === state.i);
    for (const province of provinces) {
      const cities = (map.settlements.cities || []).filter(city => city && Number(city.state) === state.i && Number(city.province) === Number(province.i));
      for (const city of cities) {
        const input = {sourceStateId: state.i, selectedProvinceIds: [province.i], newCapitalCityId: city.id};
        if (inspectStateSplit(map, input).valid) return input;
      }
    }
  }
  throw new Error("固定生成图找不到可拆分国家");
}
