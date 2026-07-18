#!/usr/bin/env node
import assert from "node:assert/strict";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {CHINESE_PROVINCE_NAMES} from "../app/webgl-generator/src/generator/namebase-chinese-provinces.js";
import {createChineseNameGenerator, getBuiltinNamebaseSummaries} from "../app/webgl-generator/src/generator/names.js";
import {regeneratePackProvincesWithinStates} from "../app/webgl-generator/src/generator/politics.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {createAddProvinceAtCellCommand} from "../app/webgl-generator/src/runtime/province-edit-commands.js";

const provinceNamebase = getBuiltinNamebaseSummaries().find(item => item.id === "province-stems");
assert(provinceNamebase, "名称库总览缺少中文省份备用根名");
assert(provinceNamebase.uniqueSamples >= 5000, "中文省份备用根名不足 5000 个");
assert.equal(provinceNamebase.samples, provinceNamebase.uniqueSamples, "中文省份备用根名存在内部重复");
assert.equal(new Set(CHINESE_PROVINCE_NAMES).size, CHINESE_PROVINCE_NAMES.length, "省份备用库导出存在重复");

const reservedGenerator = createChineseNameGenerator("province-reserved-regression", {provinceNames: ["清河", "云阳"]});
const reservedNames = Array.from({length: 600}, (_, index) => reservedGenerator.makeProvinceName({
  id: index + 1,
  cell: index,
  culture: 1,
  cultureType: "Generic",
  state: 1,
  baseName: index % 2 ? "清河" : "云阳"
}).name);
assert.equal(new Set(reservedNames).size, reservedNames.length, "重复基础名没有在省份域内消解");
assert(!reservedNames.includes("清河") && !reservedNames.includes("云阳"), "新增省份撞上预载的已有省名");

const boundNamebases = {
  bases: [{id: "province-bound-place", name: "省份绑定验证", source: ["阿莱恩", "布洛克", "卡维尔", "德里安", "埃诺斯"]}],
  bindings: {global: {place: "province-bound-place"}, cultures: {}}
};
const boundGenerator = createChineseNameGenerator("province-bound-regression", {namebases: boundNamebases});
const fallbackSet = new Set(CHINESE_PROVINCE_NAMES);
const boundNames = Array.from({length: 40}, (_, index) => boundGenerator.makeProvinceName({
  id: index + 1,
  cell: index,
  culture: 1,
  cultureType: "Generic",
  state: 1
}).name);
assert(boundNames.every(name => !fallbackSet.has(name)), "用户绑定 place 名称库被省份备用库覆盖");

const seeds = Array.from({length: 12}, (_, index) => `province-name-diversity-${index + 1}`);
const rows = seeds.map(seed => inspectGeneratedMap(seed));
for (const row of rows) {
  assert.equal(row.duplicateRoots, 0, `${row.seed} 仍有重复省份根名`);
  assert.equal(row.duplicateFullNames, 0, `${row.seed} 仍有重复省份完整名称`);
}

const deterministicOptions = {seed: "province-name-deterministic", cellsTarget: 3000, heightmapTemplate: "continents", provincesRatio: 40};
const deterministicLeft = provinceNames(generatePlaceholderMap(deterministicOptions));
const deterministicRight = provinceNames(generatePlaceholderMap(deterministicOptions));
assert.deepEqual(deterministicRight, deterministicLeft, "固定 seed 的省份名称序列不稳定");

const regenerationMap = generatePlaceholderMap({seed: "province-name-regeneration", cellsTarget: 3000, heightmapTemplate: "continents", provincesRatio: 40});
const regenerationResult = regeneratePackProvincesWithinStates(
  regenerationMap.grid,
  regenerationMap.society,
  {...regenerationMap.options, namebases: regenerationMap.namebases, provincesRatio: 40},
  regenerationMap.pack,
  {salt: 1}
);
assert(regenerationResult?.provinces?.length, "省份重生成没有返回省份集合");
const regeneratedNames = provinceNames({politics: {provinces: regenerationResult.provinces}});
assert.equal(new Set(regeneratedNames.map(item => item.name)).size, regeneratedNames.length, "省份重生成仍有重复根名");
assert.equal(new Set(regeneratedNames.map(item => item.fullName)).size, regeneratedNames.length, "省份重生成仍有重复完整名称");

const creationMap = generatePlaceholderMap({seed: "province-name-create", cellsTarget: 3000, heightmapTemplate: "continents"});
const existingNames = new Set(provinceNames(creationMap).map(item => item.name));
const gridCell = creationMap.grid.cells.i.find(cell => creationMap.grid.cells.h[cell] >= 20 && creationMap.grid.cells.state[cell] > 0);
assert(Number.isInteger(gridCell), "没有找到可新增省份的国家陆地 cell");
const history = new EditHistory();
const addCommand = createAddProvinceAtCellCommand(gridCell);
history.execute(addCommand, {map: creationMap});
const created = creationMap.politics.provinces[addCommand.getResult()?.provinceId];
assert(created?.name, "新增省份没有生成名称");
assert(!existingNames.has(created.name), "新增省份名称撞上当前地图已有省名");
history.undo({map: creationMap});
assert.equal(history.getStats().redo, 1, "新增省份撤销链异常");

const totals = rows.reduce((result, row) => ({
  provinces: result.provinces + row.provinces,
  duplicateRoots: result.duplicateRoots + row.duplicateRoots,
  duplicateFullNames: result.duplicateFullNames + row.duplicateFullNames
}), {provinces: 0, duplicateRoots: 0, duplicateFullNames: 0});

console.log(JSON.stringify({
  ok: true,
  namebase: {
    samples: provinceNamebase.samples,
    uniqueSamples: provinceNamebase.uniqueSamples,
    duplicateSamples: provinceNamebase.duplicateSamples
  },
  reserved: {generated: reservedNames.length, unique: new Set(reservedNames).size},
  boundSamples: boundNames.slice(0, 8),
  maps: rows.length,
  totals,
  deterministicNames: deterministicLeft.length,
  regeneratedNames: regeneratedNames.length,
  createdProvince: created.name
}, null, 2));

function inspectGeneratedMap(seed) {
  const names = provinceNames(generatePlaceholderMap({seed, cellsTarget: 5000, heightmapTemplate: "continents", provincesRatio: 40}));
  const roots = names.map(item => item.name);
  const fullNames = names.map(item => item.fullName);
  return {
    seed,
    provinces: names.length,
    duplicateRoots: roots.length - new Set(roots).size,
    duplicateFullNames: fullNames.length - new Set(fullNames).size
  };
}

function provinceNames(map) {
  return (map?.politics?.provinces || [])
    .filter(item => item?.i && !item.removed)
    .map(item => ({name: item.name, fullName: item.fullName || `${item.name}${item.formName || ""}`}));
}
