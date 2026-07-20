#!/usr/bin/env node
import assert from "node:assert/strict";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {regeneratePackProvincesWithinStates} from "../app/webgl-generator/src/generator/politics.js";
import {
  CHINESE_PROVINCE_FORMS,
  CULTURE_TYPE_PROVINCE_FORMS,
  HIGHLAND_PROVINCE_FORMS,
  HUNTING_PROVINCE_FORMS,
  LAKE_PROVINCE_FORMS,
  NAVAL_PROVINCE_FORMS,
  RIVER_PROVINCE_FORMS,
  STEPPE_PROVINCE_FORMS,
  backfillProvinceNames,
  isChineseProvinceNamingStyle,
  isSteppeProvinceNamingStyle,
  provinceFormsForCultureType,
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
const report = {ok: true, generated: [], add: {}, rebuild: {}, cultureEdit: {}, merge: {}, split: {}, compatibility: {}};

assert.deepEqual(CHINESE_PROVINCE_FORMS, ["州", "郡", "府", "道", "路", "军", "镇", "司"]);
assert.deepEqual(STEPPE_PROVINCE_FORMS, ["盟", "旗", "部", "万户"]);
assert.deepEqual(HUNTING_PROVINCE_FORMS, ["部落", "猎围", "林寨", "山场"]);
assert.deepEqual(HIGHLAND_PROVINCE_FORMS, ["峒", "寨", "关", "土司"]);
assert.deepEqual(RIVER_PROVINCE_FORMS, ["川", "津", "浦", "漕司"]);
assert.deepEqual(LAKE_PROVINCE_FORMS, ["泽", "泊", "汊", "湖府"]);
assert.deepEqual(NAVAL_PROVINCE_FORMS, ["港", "岛", "海府", "舶司"]);
assert.equal(isChineseProvinceNamingStyle({nameStyle: "oriental"}), true);
assert.equal(isChineseProvinceNamingStyle({nameStyle: "english"}), false);
assert.equal(isSteppeProvinceNamingStyle({state: {type: "Nomadic"}}), true);
assert.equal(isSteppeProvinceNamingStyle({culture: {type: "Nomadic"}}), true);
assert.equal(isSteppeProvinceNamingStyle({state: {type: "River"}}), false);
assert.equal(isSteppeProvinceNamingStyle({state: {type: "Nomadic"}, culture: {type: "River"}}), false, "当前文化类型应优先于国家旧镜像类型");
assert.equal(isSteppeProvinceNamingStyle({state: {type: "Nomadic"}, culture: {type: "invalid"}}), true, "非法文化类型没有回退到国家兼容镜像");
assert.deepEqual(provinceFormsForCultureType({culture: {type: "Generic"}}), [], "通用文化不应覆盖命名风格自带形制");

const distinctiveForms = Object.values(CULTURE_TYPE_PROVINCE_FORMS).flat();
assert.equal(new Set(distinctiveForms).size, distinctiveForms.length, "不同文化类型的特色省份形制发生串型重叠");

for (const [type, forms] of Object.entries(CULTURE_TYPE_PROVINCE_FORMS)) {
  assert.strictEqual(provinceFormsForCultureType({culture: {type}}), forms, `${type} 没有读取冻结的省份形制集合`);
  assert.strictEqual(provinceFormsForCultureType({culture: {type: type.toLowerCase()}}), forms, `${type} 小写类型没有兼容`);
  for (let stateId = 1; stateId <= forms.length; stateId++) {
    assert.equal(
      provinceFormForState({i: stateId, type: "Generic", nameStyle: "oriental"}, [{type}], {culture: {type}}),
      forms[stateId - 1],
      `${type} 国家 #${stateId} 没有稳定选择对应特色形制`
    );
  }
}

for (const generationOptions of [
  {...options, seed: "province-policy-a"},
  {...options, seed: "province-policy-b"},
  {...options, seed: "province-policy-c"},
  {...options, seed: "stage-2-1", cellsTarget: 10000, culturesNumber: 18},
  {...options, seed: "culture-types", cellsTarget: 10000, culturesNumber: 18}
]) {
  const map = generatePlaceholderMap(generationOptions);
  const summary = assertCultureStatePolicies(map);
  const seed = generationOptions.seed;
  report.generated.push({seed, ...summary});
}

const generatedTypeCoverage = new Set(report.generated.flatMap(item => Object.keys(item.typeStates || {})));
for (const type of ["Generic", ...Object.keys(CULTURE_TYPE_PROVINCE_FORMS)]) assert.ok(generatedTypeCoverage.has(type), `真实固定种子没有覆盖文化类型 ${type}`);

testAddProvince();
testRebuildProvinces();
testCultureTypeEditPolicy();
testMergePreservesNames();
testSplitUsesStatePolicies();
await testCompatibilityBackfill();

console.log(JSON.stringify(report, null, 2));

function testAddProvince() {
  const map = generatePlaceholderMap({...options, seed: "province-policy-a"});
  let applied = null;
  for (const gridCell of map.grid.cells.i) {
    const stateId = Number(map.grid.cells.state?.[gridCell]) || 0;
    if (map.politics.states?.[stateId]?.type !== "Nomadic") continue;
    const cultureId = Number(map.politics.states[stateId].culture) || 0;
    map.society.cultures[cultureId].type = "Highland";
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
  assert.ok(HIGHLAND_PROVINCE_FORMS.includes(province.formName), "手动新增省份没有读取文化当前类型");
  report.add = {provinceId: applied.provinceId, stateId: applied.stateId, stateType: state.type, cultureType: "Highland", formName: province.formName};
}

function testRebuildProvinces() {
  const map = generatePlaceholderMap({...options, seed: "province-policy-a"});
  const result = regeneratePackProvincesWithinStates(map.grid, map.society, map.options, map.pack, {salt: 7});
  assert.ok(result?.provinces?.length);
  map.politics.provinces = map.pack.provinces;
  const summary = assertCultureStatePolicies(map);
  report.rebuild = {...summary, salt: 7};
}

function testCultureTypeEditPolicy() {
  const map = generatePlaceholderMap({...options, seed: "culture-type-edit", cellsTarget: 10000, culturesNumber: 18});
  const state = (map.politics.states || []).find(candidate => {
    if (!candidate?.i || candidate.removed) return false;
    return (map.politics.provinces || []).some(province => province?.i && !province.removed && province.state === candidate.i && province.burg);
  });
  assert.ok(state, "文化改型样本找不到含普通省份的国家");
  const culture = map.society.cultures?.[state.culture];
  assert.ok(culture, "文化改型样本找不到国家主文化");
  const oldStateType = state.type;
  const nextCultureType = oldStateType === "Naval" ? "River" : "Naval";
  culture.type = nextCultureType;
  assert.notEqual(state.type, nextCultureType, "文化改型样本没有保留国家旧镜像类型");

  const result = regeneratePackProvincesWithinStates(map.grid, map.society, map.options, map.pack, {salt: 11});
  assert.ok(result?.provinces?.length, "文化改型后省份重划没有生成结果");
  map.politics.provinces = map.pack.provinces;
  const expected = provinceFormForState(state, map.society.cultures);
  const provinces = map.politics.provinces.filter(province => province?.i && !province.removed && province.state === state.i && province.burg);
  assert.ok(provinces.length, "文化改型后国家没有普通省份");
  assert.ok(provinces.every(province => province.formName === expected), "文化改型后省份重划仍读取国家旧镜像类型");
  assert.ok(CULTURE_TYPE_PROVINCE_FORMS[nextCultureType].includes(expected), "文化改型后没有使用新类型的特色形制");
  report.cultureEdit = {stateId: state.i, oldStateType, nextCultureType, formName: expected, provinces: provinces.length};
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
  const map = generatePlaceholderMap({...options, seed: "province-policy-a"});
  const provinces = map.politics.provinces.filter(province => province?.i && !province.removed);
  const nomadicProvinces = provinces.filter(province => map.politics.states?.[province.state]?.type === "Nomadic");
  assert.ok(nomadicProvinces.length >= 2, "兼容样本缺少两个草原省份");
  const [complete, missing] = nomadicProvinces;
  const derived = provinces.find(province => province.i !== complete.i && province.i !== missing.i);
  assert.ok(derived, "兼容样本缺少可反推后缀的第三个省份");
  const missingCultureId = map.politics.states[missing.state].culture;
  map.society.cultures[missingCultureId].type = "Lake";
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
  assert.ok(LAKE_PROVINCE_FORMS.includes(roundTrip.politics.provinces[missing.i].formName), "缺字段旧省没有按当前湖泽文化回填特色形制");
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

function assertCultureStatePolicies(map) {
  let states = 0;
  let provinces = 0;
  let borderlands = 0;
  let steppeStates = 0;
  let steppeProvinces = 0;
  const steppeForms = new Set();
  const typeStates = {};
  const typeProvinces = {};
  const typeForms = {};
  for (const state of map.politics.states || []) {
    if (!state?.i || state.removed) continue;
    const culture = map.society.cultures?.[state.culture];
    const cultureType = culture?.type || state.type || "Generic";
    const expectedForms = provinceFormsForCultureType({state, culture});
    const expected = provinceFormForState(state, map.society.cultures);
    const items = (map.politics.provinces || []).filter(province => province?.i && !province.removed && Number(province.state) === state.i);
    if (!items.length) continue;
    states++;
    typeStates[cultureType] = (typeStates[cultureType] || 0) + 1;
    const steppe = isSteppeProvinceNamingStyle({state, culture});
    if (steppe) steppeStates++;
    for (const province of items) {
      provinces++;
      if (!province.burg && province.formName === "边地") {
        borderlands++;
        continue;
      }
      assert.equal(province.formName, expected, `国家 #${state.i} 的普通省份后缀不统一`);
      assert.notEqual(province.formName, "领", `国家 #${state.i} 的中国风普通省份仍使用“领”`);
      typeProvinces[cultureType] = (typeProvinces[cultureType] || 0) + 1;
      typeForms[cultureType] ||= [];
      if (!typeForms[cultureType].includes(province.formName)) typeForms[cultureType].push(province.formName);
      if (expectedForms.length) {
        assert.ok(expectedForms.includes(province.formName), `${cultureType} 国家 #${state.i} 没有使用自身特色形制`);
      } else {
        assert.ok(!distinctiveForms.includes(province.formName), `通用文化国家 #${state.i} 被误套特色文化形制`);
      }
      if (steppe) {
        steppeProvinces++;
        steppeForms.add(province.formName);
        assert.ok(STEPPE_PROVINCE_FORMS.includes(province.formName), `草原国家 #${state.i} 仍使用常规省份后缀`);
      }
    }
  }
  assert.ok(states > 0 && provinces > 0);
  return {states, provinces, borderlands, steppeStates, steppeProvinces, steppeForms: [...steppeForms], typeStates, typeProvinces, typeForms};
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
