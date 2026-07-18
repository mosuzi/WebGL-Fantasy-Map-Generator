#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {createChineseNameGenerator} from "../app/webgl-generator/src/generator/names.js";

const synthetic = countGeneratedNames({seedCount: 12, namesPerSeed: 80});
assert.equal(synthetic.total, 960, "合成分布样本数量异常");
assert(synthetic.lakeRatio > 0.55, `常用湖后缀分布没有形成稳定多数：${synthetic.lakeRatio}`);
assert(synthetic.other > 0, "常用湖后缀分布不得消灭其它合法类型词");
assert.deepEqual(
  generateNameSequence("lake-deterministic", 120, {preferCommonSuffix: true}),
  generateNameSequence("lake-deterministic", 120, {preferCommonSuffix: true}),
  "同 seed 的常用湖后缀序列必须确定性复现"
);

const legacyExpected = new Map([
  ["lake-legacy-a", "金泽"],
  ["lake-legacy-b", "青海"],
  ["lake-legacy-c", "金泽"]
]);
for (const [seed, expected] of legacyExpected) {
  const actual = createChineseNameGenerator(seed).makeLakeName({id: 1, cell: 2, type: "freshwater", major: false});
  assert.equal(actual, expected, "未启用新地图偏好时必须保持既有确定性湖名");
}

const seeds = Array.from({length: 12}, (_, index) => `lake-distribution-${index + 1}`);
const real = {total: 0, lake: 0, other: 0, suffixes: {}};
for (const seed of seeds) {
  const map = generatePlaceholderMap({
    seed,
    randomSeed: false,
    cellsTarget: 5000,
    graphWidth: 1440,
    graphHeight: 960,
    heightmapTemplate: "continents"
  });
  for (const feature of map.pack.features || []) {
    if (feature?.type !== "lake") continue;
    const name = String(feature.name || "");
    assert(name, `真实生成湖泊 #${feature.i ?? feature.id} 缺少名称`);
    real.total++;
    if (name.endsWith("湖")) real.lake++;
    else real.other++;
    const suffix = Array.from(name).at(-1) || "空";
    real.suffixes[suffix] = (real.suffixes[suffix] || 0) + 1;
  }
}
real.lakeRatio = real.total ? real.lake / real.total : 0;
assert(real.total >= 20, `真实多 seed 湖泊样本不足：${real.total}`);
assert(real.lakeRatio > 0.5, `真实新地图中“湖”没有形成严格多数：${real.lakeRatio}`);
assert(real.other > 0, "真实新地图仍须保留少量其它合法湖泊类型词");

const [riverSource, lakeEditSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/generator/rivers.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/lake-edit-commands.js", import.meta.url), "utf8")
]);
assert.match(riverSource, /defineLakeNames[\s\S]*preferCommonSuffix:\s*true/, "新地图湖泊命名必须显式启用常用后缀分布");
assert.doesNotMatch(lakeEditSource, /preferCommonSuffix/, "手工建湖和显式重命名不得静默套用新地图分布");

console.log(JSON.stringify({
  ok: true,
  weighting: {lake: 7, other: 4},
  synthetic,
  real,
  legacy: Object.fromEntries(legacyExpected)
}, null, 2));

function countGeneratedNames({seedCount, namesPerSeed}) {
  const result = {total: 0, lake: 0, other: 0, lakeRatio: 0};
  for (let seedIndex = 0; seedIndex < seedCount; seedIndex++) {
    const generator = createChineseNameGenerator(`lake-weight-${seedIndex + 1}`);
    for (let id = 0; id < namesPerSeed; id++) {
      const name = generator.makeLakeName({id, cell: id * 3, type: "freshwater", preferCommonSuffix: true});
      result.total++;
      if (name.endsWith("湖")) result.lake++;
      else result.other++;
    }
  }
  result.lakeRatio = result.total ? result.lake / result.total : 0;
  return result;
}

function generateNameSequence(seed, count, options = {}) {
  const generator = createChineseNameGenerator(seed);
  return Array.from({length: count}, (_, id) => generator.makeLakeName({id, cell: id * 5, type: "freshwater", ...options}));
}
