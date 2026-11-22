#!/usr/bin/env node
import assert from "node:assert/strict";
import {cultureNamingStyleConfig} from "../app/webgl-generator/src/generator/culture-naming-styles.js";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {createChineseNameGenerator, getBuiltinNamebaseSummaries, isUnsuitableGeneratedStateName} from "../app/webgl-generator/src/generator/names.js";
import {buildPolitics} from "../app/webgl-generator/src/generator/politics.js";
import {createRandom} from "../app/webgl-generator/src/generator/random.js";

const draw = (options, context) => createChineseNameGenerator("name-check", context).makeStateRoot(options);
function withStateNames(source) {
  return {namebases: {bases: [{id: "fixture", source}], bindings: {global: {stateRoot: "fixture"}}}};
}

const wholeRootIds = new Set(["ancient-state-roots", "ancient-state-compounds", "place-stems", "high-fantasy-stems"]);
const wholeRoots = new Set(getBuiltinNamebaseSummaries({includeSource: true})
  .filter(row => wholeRootIds.has(row.id)).flatMap(row => row.source));
for (const root of cultureNamingStyleConfig("oriental").cultureRoots) wholeRoots.add(root);
const samples = new Set();
for (let id = 0; id < 32768; id++) {
  const root = draw({id});
  assert.ok(wholeRoots.has(root), `内置国名使用了词库以外的拼字：${root}`);
  samples.add(root);
}
assert.ok(samples.size > 200, "抽取结果应覆盖古国及多种完整地名");

for (const [id, previous] of [[22993, "青楼"], [6639, "开门"], [94188, "开庭"], [432494, "开春"], [565570, "会阴"], [620105, "上楼"]]) {
  const root = draw({id});
  assert.ok(wholeRoots.has(root));
  assert.notEqual(root, previous);
  assert.equal(draw({id}), root);
}
for (const term of [
  "青楼", "北青樓城", "賭坊", "妓院", "茅廁", "会阴", "北會陰", "上楼", "開庭", "关门", "开春",
  "开关", "開關", "开光", "開光", "北開關城", "新开光王国", "开灯", "關燈", "開機", "关机", "开店", "關店"
]) {
  assert.equal(isUnsuitableGeneratedStateName(term), true, term);
  const bound = withStateNames([term]);
  const substitutes = [
    draw({id: 6, cultureRoot: term}),
    draw({id: 1, capitalName: term, allowCapitalName: true}),
    draw({id: 1}, bound)
  ];
  assert.ok(substitutes.every(name => wholeRoots.has(name)), term);
}
assert.equal(draw({id: 22992}), "罗");
for (const cultureRoot of ["楼兰", "青岚", "会宁", "江阴", "山阴", "开封", "开元", "关中", "光山", "玉门", "上京"]) {
  assert.equal(draw({id: 6, cultureRoot}), cultureRoot);
  assert.equal(draw({id: 1}, withStateNames([cultureRoot])), cultureRoot);
}
assert.equal(isUnsuitableGeneratedStateName("江阴道"), false);
assert.equal(isUnsuitableGeneratedStateName("北會陰王國"), true);
for (const style of ["european", "english", "antique", "highFantasy", "darkFantasy"]) {
  const options = {id: 1, cultureType: style};
  const result = draw(options, withStateNames(["开门"]));
  assert.ok(result);
  assert.ok(cultureNamingStyleConfig(style).placeRoots.some(root => root.startsWith(result)), `${style} 名称库无可用词后的国名：${result}`);
}

const map = generatePlaceholderMap({seed: "state-name-grid-469", cellsTarget: 3000, culturesSet: "oriental"});
for (const [name, kept] of [["会阴文化", false], ["会宁文化", true], ["開關文化", false], ["开光文化", false], ["光州文化", true]]) {
  const society = {...map.society, cultures: map.society.cultures.map(culture => culture && {...culture, name})};
  const politics = buildPolitics(map.grid, map.features, society, map.rivers, createRandom("grid"), map.options, null);
  const states = politics.states.filter(state => state.culture > 0);
  assert.ok(states.length > 0);
  for (const state of states) {
    const root = name.replace("文化", "");
    assert.ok(state.name);
    assert.equal(state.name === root, kept);
    assert.equal(state.fullName.includes(root), kept);
  }
}

console.log(`32768 次内置抽取覆盖 ${samples.size} 种完整国名；旧种子、继承名称、名称库和文化风格对照通过。`);
