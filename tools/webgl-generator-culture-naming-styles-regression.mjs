#!/usr/bin/env node
import assert from "node:assert/strict";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {createChineseNameGenerator} from "../app/webgl-generator/src/generator/names.js";
import {
  CULTURE_SET_IDS,
  cultureNamingStyleConfig,
  isChineseCultureNameStyle
} from "../app/webgl-generator/src/generator/culture-naming-styles.js";
import {provinceFormForState} from "../app/webgl-generator/src/generator/province-naming.js";
import {createMapDocument, parseMapDocument, stringifyMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";

const baseOptions = {cellsTarget: 3000, heightmapTemplate: "continents", culturesNumber: 10, culturesSetMax: 32};
const report = {ok: true, chains: {}, sets: {}, world: {}, defaults: {}, compatibility: {}};

assert.deepEqual(CULTURE_SET_IDS, ["oriental", "european", "english", "antique", "highFantasy", "darkFantasy", "world", "random"]);
testForeignChain("european");
testForeignChain("english");

for (const culturesSet of CULTURE_SET_IDS.filter(id => id !== "world" && id !== "random")) {
  const map = generatePlaceholderMap({...baseOptions, seed: `culture-style-${culturesSet}`, culturesSet});
  const styles = activeCultures(map).map(culture => culture.nameStyle);
  assert.ok(styles.length > 0, `${culturesSet} 没有生成文化`);
  assert.ok(styles.every(style => style === culturesSet), `${culturesSet} 静默退化为其它命名风格：${[...new Set(styles)].join(", ")}`);
  assertMapNamingChains(map);
  report.sets[culturesSet] = {cultures: styles.length, states: activeStates(map).length, styles: [...new Set(styles)]};
}

testWorldMix();
testRandomSet();
testRandomizedDefaults();
testDeterminism();
testCompatibility();

console.log(JSON.stringify(report, null, 2));

function testForeignChain(styleId) {
  const config = cultureNamingStyleConfig(styleId);
  assert.equal(config.chinese, false);
  assert.ok(new Set(config.placeRoots).size >= 30, `${styleId} 外国根名库不足 30 项`);
  const generator = createChineseNameGenerator(`foreign-chain-${styleId}`);
  const names = Array.from({length: 120}, (_, id) => generator.makePlaceName({id, cell: id * 3, culture: 1, cultureType: styleId, type: "Generic"}));
  assert.ok(new Set(names).size >= 30, `${styleId} 组合链没有生成 30 个唯一名称`);
  assert.ok(names.every(name => containsStyleRoot(name, config)), `${styleId} 生成链混入非本风格根名`);
  report.chains[styleId] = {rootPool: config.placeRoots.length, generated: names.length, unique: new Set(names).size, sample: names.slice(0, 6)};
}

function testWorldMix() {
  const map = generatePlaceholderMap({...baseOptions, seed: "culture-style-world", culturesSet: "world", culturesNumber: 16});
  const styles = new Set(activeCultures(map).map(culture => culture.nameStyle));
  assert.ok(styles.has("oriental"), "world 没有稳定混入中国风文化");
  assert.ok([...styles].some(style => !isChineseCultureNameStyle(style)), "world 没有稳定混入外国风文化");
  assertMapNamingChains(map);
  report.world = {cultures: activeCultures(map).length, styles: [...styles]};
}

function testRandomSet() {
  const map = generatePlaceholderMap({...baseOptions, seed: "culture-style-random", culturesSet: "random", culturesNumber: 16});
  const styles = new Set(activeCultures(map).map(culture => culture.nameStyle));
  assert.ok(styles.size >= 3, "random 文化集合仍退化为单一 world 风格");
  assertMapNamingChains(map);
  report.sets.random = {cultures: activeCultures(map).length, states: activeStates(map).length, styles: [...styles]};
}

function testRandomizedDefaults() {
  let states = 0;
  let foreignStates = 0;
  const selectedSets = new Set();
  for (let index = 0; index < 12; index++) {
    const map = generatePlaceholderMap({...baseOptions, seed: `culture-default-${index}`});
    selectedSets.add(map.options.culturesSet);
    for (const state of activeStates(map)) {
      states++;
      if (!isChineseCultureNameStyle(state.nameStyle)) foreignStates++;
    }
  }
  assert.ok(foreignStates > 0, "随机默认跨种子没有生成外国风国家");
  report.defaults = {maps: 12, states, foreignStates, selectedSets: [...selectedSets]};
}

function testDeterminism() {
  const options = {...baseOptions, seed: "culture-style-deterministic", culturesSet: "world", culturesNumber: 16};
  const first = namingDigest(generatePlaceholderMap(options));
  const second = namingDigest(generatePlaceholderMap(options));
  assert.deepEqual(second, first, "相同 seed 的文化命名链不稳定");
  report.world.deterministic = true;
}

function testCompatibility() {
  const map = generatePlaceholderMap({...baseOptions, seed: "culture-style-compat", culturesSet: "oriental"});
  const culture = activeCultures(map)[0];
  const state = activeStates(map)[0];
  const city = map.settlements.cities[0];
  const province = map.politics.provinces.find(item => item?.i && !item.removed);
  culture.nameStyle = null;
  culture.name = "旧文化原名";
  culture.root = "旧文化根";
  state.nameStyle = null;
  state.name = "旧国家原名";
  state.fullName = "旧国家完整名";
  city.name = "旧城市原名";
  province.name = "旧省原名";
  province.formName = "旧制";
  province.fullName = "旧省原名旧制";
  map.namebases = {version: 1, user: [{id: "user-old", name: "旧用户库", source: ["甲", "乙"]}], bindings: {global: {}, cultures: {}}};
  const roundTrip = parseMapDocument(stringifyMapDocument(createMapDocument(map, map.options))).map;
  assert.equal(roundTrip.society.cultures[culture.i].nameStyle, null);
  assert.equal(roundTrip.society.cultures[culture.i].name, "旧文化原名");
  assert.equal(roundTrip.politics.states[state.i].fullName, "旧国家完整名");
  assert.equal(roundTrip.settlements.cities[city.id].name, "旧城市原名");
  assert.equal(roundTrip.politics.provinces[province.i].fullName, "旧省原名旧制");
  assert.equal(roundTrip.namebases.user[0].name, "旧用户库");
  report.compatibility = {cultureId: culture.i, stateId: state.i, cityId: city.id, provinceId: province.i, userNamebase: true};
}

function assertMapNamingChains(map) {
  const cultures = new Map(activeCultures(map).map(culture => [culture.i, culture]));
  for (const culture of cultures.values()) {
    const config = cultureNamingStyleConfig(culture.nameStyle);
    assert.ok(config, `文化 #${culture.i} 使用未声明的命名风格 ${culture.nameStyle}`);
    assert.ok(config.cultureRoots.includes(culture.root), `文化 #${culture.i} 根名不属于 ${culture.nameStyle}`);
  }
  for (const state of activeStates(map)) {
    const culture = cultures.get(Number(state.culture));
    if (!culture) continue;
    assert.equal(state.nameStyle, culture.nameStyle, `国家 #${state.i} 没有继承文化命名风格`);
    if (!isChineseCultureNameStyle(culture.nameStyle)) assert.ok(containsStyleRoot(state.name, cultureNamingStyleConfig(culture.nameStyle)), `国家 #${state.i} 根名不属于 ${culture.nameStyle}`);
    const expectedForm = provinceFormForState(state, map.society.cultures);
    const provinces = map.politics.provinces.filter(province => province?.i && !province.removed && Number(province.state) === state.i);
    for (const province of provinces) {
      if (!province.burg && province.formName === "边地") continue;
      assert.equal(province.formName, expectedForm, `国家 #${state.i} 省份后缀没有继承命名风格`);
      const localCulture = cultures.get(Number(map.pack?.cells?.culture?.[province.center])) || culture;
      if (!isChineseCultureNameStyle(localCulture.nameStyle)) {
        assert.ok(containsStyleRoot(province.name, cultureNamingStyleConfig(localCulture.nameStyle)), `省份 #${province.i} 根名不属于所在地文化 ${localCulture.nameStyle}`);
      }
    }
  }
  for (const city of map.settlements.cities || []) {
    const culture = cultures.get(Number(city.culture));
    if (!culture || isChineseCultureNameStyle(culture.nameStyle)) continue;
    assert.ok(containsStyleRoot(city.name, cultureNamingStyleConfig(culture.nameStyle)), `城市 #${city.id} 根名不属于 ${culture.nameStyle}`);
  }
}

function containsStyleRoot(name, config) {
  const value = String(name || "");
  return config.placeRoots.some(root => value.includes(root) || (root.length > 2 && value.includes(root.slice(0, -1))));
}

function activeCultures(map) {
  return (map.society.cultures || []).filter(culture => culture?.i && !culture.removed);
}

function activeStates(map) {
  return (map.politics.states || []).filter(state => state?.i && !state.removed);
}

function namingDigest(map) {
  return {
    cultures: activeCultures(map).map(culture => [culture.i, culture.root, culture.nameStyle]),
    states: activeStates(map).map(state => [state.i, state.name, state.nameStyle]),
    cities: map.settlements.cities.map(city => [city.id, city.name, city.culture]),
    provinces: map.politics.provinces.filter(province => province?.i && !province.removed).map(province => [province.i, province.name, province.formName])
  };
}
