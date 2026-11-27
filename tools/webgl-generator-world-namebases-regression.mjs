import assert from "node:assert/strict";
import {createChineseNameGenerator, getBuiltinNamebaseSummaries, isUnsuitableGeneratedStateName} from "../app/webgl-generator/src/generator/names.js";
import {copyBuiltinNamebaseToUser, createNamebaseDocument, createNamebaseGeneratedExamples, createLegacyNamebaseText, importNamebaseDocument, parseNamebaseDocument} from "../app/webgl-generator/src/generator/namebase-store.js";

const rows = getBuiltinNamebaseSummaries({includeSource: true}).filter(row => row.category === "世界地名");
const byId = new Map(rows.map(row => [row.id, row]));
const localRows = rows.filter(row => row.id.endsWith("-native"));
assert.equal(rows.length, localRows.length * 2);
assert.equal(new Set(rows.map(row => row.name)).size, rows.length);
const targets = ["stateRoot", "place", "hydro", "culture", "religion"];
for (const [style, chinese, local] of [
  ["english", "埃文福德", "Avenford"], ["german", "林登堡", "Lindenburg"], ["norwegian", "比约克维克", "Bjørkvik"],
  ["russian", "别拉亚戈拉", "Белая Гора"], ["polish", "比亚瓦古拉", "Biała Góra"], ["arabic", "盖迈尔谷", "وادي القمر"],
  ["quechua", "亚纳马尤", "Yana Mayu"], ["guarani", "伊维波朗", "Yvy Porã"],
  ["swahili", "米科科岛", "Kisiwa cha Mikoko"], ["hausa", "库卡丘", "Tudun Kuka"],
  ["japanese", "樱泽", "桜沢"], ["korean", "青川", "청천"],
  ["thai", "盖奥溪", "ห้วยแก้ว"], ["vietnamese", "永和", "Vĩnh Hòa"], ["malay", "班丹湾", "Teluk Pandan"]
]) {
  const index = byId.get(`world-${style}-native`).source.indexOf(local);
  assert.ok(index >= 0, local);
  assert.equal(byId.get(`world-${style}-zh`).source[index], chinese);
}

for (const local of localRows) {
  const chinese = byId.get(local.id.replace(/-native$/, "-zh"));
  assert.equal(chinese.source.length, local.source.length);
  assert.ok(!chinese.source.some(isUnsuitableGeneratedStateName), chinese.name);
  const sources = new Set(local.source);
  assert.equal(sources.size, local.samples);
  assert.equal(new Set(chinese.source).size, chinese.samples);
  assert.equal(local.lengthOutlierSamples, 0);
  assert.deepEqual(local.unusualChars, []);
  assert.ok(chinese.source.every(name => /^\p{Script=Han}+$/u.test(name)));
  const previews = createNamebaseGeneratedExamples(local, {count: 16, seed: "完整拼写"});
  assert.equal(previews.length, 16);
  assert.ok(previews.every(name => sources.has(name)));
  const generator = id => createChineseNameGenerator("相同种子", {namebases: {
    bindings: {global: Object.fromEntries(targets.map(target => [target, id]))}
  }});
  const a = generator(local.id), b = generator(chinese.id);
  const distinct = new Set();
  for (let id = 1; id <= local.samples; id++) {
    const options = {id, port: id % 2 === 0};
    const native = a.makePlaceName(options);
    const translated = b.makePlaceName(options);
    assert.ok(sources.has(native));
    assert.equal(chinese.source[local.source.indexOf(native)], translated);
    distinct.add(native);
  }
  assert.equal(distinct.size, local.samples);
  assert.ok(!distinct.has(a.makePlaceName({id: local.samples + 1})));
  for (const make of ["makeStateRoot", "makeRiverName", "makeLakeName", "makeCultureName", "makeReligionName"]) {
    assert.ok(sources.has(a[make]({id: 1})), local.name + " " + make);
  }
  assert.ok(sources.has(a.makeProvinceName({id: 1, baseName: "原名", formName: "州"}).name));
}

const legacyId = "world-english-zh";
const oldCustom = createChineseNameGenerator("旧档自定义编号", {namebases: {
  bindings: {global: {place: legacyId}}, bases: [{id: legacyId, source: ["旧名"]}]
}});
assert.equal(oldCustom.makePlaceName({id: 1}), "旧名");

const vi = byId.get("world-vietnamese-native");
const map = {namebases: {bases: [], bindings: {global: {}, cultures: {}}}, settlements: {cities: [{name: "手写名"}]}};
const copiedId = copyBuiltinNamebaseToUser(map, vi.id).id;
const copyExport = createNamebaseDocument(map, {baseIds: [copiedId]});
const reloaded = {namebases: {bases: []}};
importNamebaseDocument(reloaded, copyExport);
const imported = reloaded.namebases.bases[0];
assert.ok(createNamebaseGeneratedExamples(imported).every(name => vi.source.includes(name)));
imported.source = ["示例"];
assert.deepEqual(createNamebaseGeneratedExamples({...imported, minLength: 2, maxLength: 2}), ["示例"]);
const json = createNamebaseDocument(map, {baseIds: [vi.id]});
const text = createLegacyNamebaseText(map, {baseIds: [vi.id]});
for (const doc of [parseNamebaseDocument(JSON.stringify(json)), parseNamebaseDocument(text)]) {
  assert.deepEqual(doc.bases[0].source, vi.source);
  const copy = structuredClone(map);
  importNamebaseDocument(copy, doc);
  assert.deepEqual(copy.namebases.bases.at(-1).source, vi.source);
  assert.deepEqual(copy.settlements, map.settlements);
}

const byCulture = createChineseNameGenerator("文化优先", {namebases: {bindings: {
  global: {place: "world-korean-zh"}, cultures: {7: {place: "world-korean-native"}}
}}});
assert.match(byCulture.makePlaceName({id: 1, cultureId: 7}), /^\p{Script=Hangul}+$/u);
assert.match(byCulture.makePlaceName({id: 1, cultureId: 8}), /^\p{Script=Han}+$/u);
console.log(`${rows.length} 个词库，${localRows.reduce((sum, row) => sum + row.samples, 0)} 对名称，全量双写法、预览、五类绑定与导出回读通过。`);
