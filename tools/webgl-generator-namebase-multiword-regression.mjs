#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

import {createNamebaseDocument, createLegacyNamebaseText, importNamebaseDocument, parseNamebaseDocument, setNamebaseBinding, updateUserNamebaseOptions} from "../app/webgl-generator/src/generator/namebase-store.js";
import {createNamebaseSourceEntry, generateNamebaseCandidate, normalizeNamebaseGenerationOptions} from "../app/webgl-generator/src/generator/names.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {createRenameNamedObjectsFromNamebaseCommand} from "../app/webgl-generator/src/runtime/object-edit-commands.js";

const source = {
  id: "multiword-test",
  name: "多词测试库",
  kind: "place",
  source: ["青川", "云泽", "鹿原", "玄岭", "白沙", "赤水"],
  minLength: 2,
  maxLength: 2,
  legacyMultiwordRate: 0.35
};
const entry = createNamebaseSourceEntry(source);
const first = generateSequence(entry, "fixed-seed", 2000);
const second = generateSequence(entry, "fixed-seed", 2000);
assert.deepEqual(second, first, "固定 seed 与固定 m 必须得到相同候选序列");
const multiword = first.filter(name => name.includes(" "));
assert(Math.abs(multiword.length / first.length - 0.35) < 0.04, `多词比例偏离 m：${multiword.length}/${first.length}`);
assert(multiword.every(name => /^[^\s]+ [^\s]+$/u.test(name)), "多词候选必须只用一个半角空格分隔两个词");

const singleEntry = createNamebaseSourceEntry({...source, legacyMultiwordRate: 0});
const singleFirst = generateSequence(singleEntry, "single-seed", 200);
const singleSecond = generateSequence(singleEntry, "single-seed", 200);
assert.deepEqual(singleSecond, singleFirst, "m=0 必须保持原单词随机序列可复现");
assert(singleFirst.every(name => !name.includes(" ")), "m=0 不得生成多词名称");
assert.equal(normalizeNamebaseGenerationOptions({}).multiwordRate, 0, "缺少 m 的旧数据必须回填为 0");

const map = createMap(source);
const existingNames = objectNames(map);
updateUserNamebaseOptions(map, source.id, {minLength: 2, maxLength: 2, legacyMultiwordRate: 0.6});
assert.equal(createNamebaseSourceEntry(map.namebases.bases[0]).multiwordRate, 0.6, "面板参数编辑必须立即覆盖导入时的 m");
updateUserNamebaseOptions(map, source.id, {minLength: 2, maxLength: 2, legacyMultiwordRate: 0.35});
setNamebaseBinding(map, "culture", source.id);
assert.deepEqual(objectNames(map), existingNames, "编辑参数与设置绑定不得自动改写已有对象名称");
const jsonText = JSON.stringify(createNamebaseDocument(map));
const jsonMap = createMap();
jsonMap.namebases.bases = [];
importNamebaseDocument(jsonMap, parseNamebaseDocument(jsonText), {mode: "replace"});
assert.equal(jsonMap.namebases.bases.find(base => base.sourceId === source.id)?.legacyMultiwordRate, 0.35, "JSON 名称库往返必须保留 m");
assert.deepEqual(objectNames(jsonMap), objectNames(createMap()), "导入名称库不得自动改写已有对象名称");

const legacyText = createLegacyNamebaseText(map, {baseIds: [source.id]});
const legacyMap = createMap();
legacyMap.namebases.bases = [];
importNamebaseDocument(legacyMap, parseNamebaseDocument(legacyText), {mode: "replace"});
assert.equal(legacyMap.namebases.bases[0].legacyMultiwordRate, 0.35, "原版文本往返必须保留 m");

const fullMap = JSON.parse(JSON.stringify(map));
assert.equal(fullMap.namebases.bases[0].legacyMultiwordRate, 0.35, "完整地图 JSON 往返必须保留 m");

const appSource = readFileSync(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8");
assert.match(appSource, /createGenerationNamebaseSnapshot[\s\S]*legacyMultiwordRate:[\s\S]*persistNamebasePreferences/, "本地名称库偏好快照必须保留 m");
for (const panel of ["ProvincePanel.vue", "CulturePanel.vue", "ReligionPanel.vue"]) {
  const panelSource = readFileSync(new URL(`../app/webgl-generator/src/ui/vue/components/${panel}`, import.meta.url), "utf8");
  assert.match(panelSource, /rename-visible[\s\S]*onRenameVisibleFromNamebase/, `${panel} 缺少筛选结果名称库重命名入口`);
}

const renameMap = createMap(source);
const beforeProvinces = structuredClone(renameMap.politics.provinces);
const history = new EditHistory();
const command = createRenameNamedObjectsFromNamebaseCommand("province", [1, 2]);
history.execute(command, {map: renameMap});
assert.equal(history.getStats().undo, 1, "省份批量重命名只能形成一条历史");
assert.equal(command.getResult().renamed, 2, "省份筛选结果应全部得到新名称");
history.undo({map: renameMap});
assert.deepEqual(renameMap.politics.provinces, beforeProvinces, "撤销必须恢复省份 name/fullName");

console.log(JSON.stringify({
  ok: true,
  multiword: {
    expectedRate: 0.35,
    actualRate: Math.round(multiword.length / first.length * 10000) / 10000,
    samples: first.length,
    separator: "single-space"
  },
  roundtrip: {json: 0.35, legacy: 0.35, fullMap: 0.35, localPreference: "source-verified"},
  batchRename: {renamed: command.getResult().renamed, history: history.getStats()}
}, null, 2));

function generateSequence(namebase, seed, count) {
  const rng = createRng(seed);
  return Array.from({length: count}, () => generateNamebaseCandidate(rng, namebase));
}

function createRng(seed) {
  let state = hash(seed) || 0x6d2b79f5;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function hash(value) {
  let result = 2166136261;
  for (const char of String(value)) {
    result ^= char.codePointAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function createMap(base = null) {
  const bases = base ? [structuredClone(base)] : [];
  return {
    metadata: {seed: "namebase-multiword-regression", checksum: "namebase-multiword"},
    options: {seed: "namebase-multiword-regression"},
    namebases: {
      version: 1,
      bases,
      bindings: {global: {place: base?.id || ""}, cultures: {}},
      metadata: {bases: bases.length}
    },
    politics: {
      states: [null, {id: 1, i: 1, name: "旧国", fullName: "旧国", culture: 1}],
      provinces: [null,
        {id: 1, i: 1, name: "旧一", formName: "郡", fullName: "旧一郡", state: 1, center: 0, culture: 1},
        {id: 2, i: 2, name: "旧二", formName: "州", fullName: "旧二州", state: 1, center: 1, culture: 1}
      ]
    },
    society: {cultures: [null, {id: 1, i: 1, name: "旧文化", root: "旧", center: 0}], religions: [null, {id: 1, i: 1, name: "旧教", culture: 1, form: "教", center: 0}]},
    pack: {cells: {culture: [1, 1]}, states: [], provinces: [], cultures: [], religions: []}
  };
}

function objectNames(map) {
  return {
    provinces: map.politics.provinces.map(item => item ? [item.name, item.fullName] : null),
    cultures: map.society.cultures.map(item => item ? [item.name, item.root] : null),
    religions: map.society.religions.map(item => item ? item.name : null)
  };
}
