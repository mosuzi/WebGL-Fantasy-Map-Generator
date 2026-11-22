#!/usr/bin/env node
import assert from "node:assert/strict";
import {createChineseNameGenerator} from "../app/webgl-generator/src/generator/names.js";

const draw = (options, context) => createChineseNameGenerator("name-check", context).makeStateRoot(options);
const namebases = {
  bases: [{id: "fixture", source: ["青楼"], minLength: 2, maxLength: 2}],
  bindings: {global: {stateRoot: "fixture"}}
};
for (const [options, context] of [
  [{id: 22993}], // 此种子和编号曾直接拼出“青楼”。
  [{id: 6, cultureRoot: "青楼"}],
  [{id: 1, capitalName: "青楼", allowCapitalName: true}],
  [{id: 6, cultureRoot: "北青樓城"}],
  [{id: 1}, {namebases}]
]) {
  const root = draw(options, context);
  assert.ok(root);
  assert.doesNotMatch(root, /青[楼樓]/u);
  assert.equal(draw(options, context), root);
}
assert.equal(draw({id: 22992}), "罗");
for (const cultureRoot of ["楼兰", "青岚"]) {
  assert.equal(draw({id: 6, cultureRoot}), cultureRoot);
}

console.log("随机国名重抽、固定种子及正常国名对照通过。");
