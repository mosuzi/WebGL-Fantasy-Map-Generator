#!/usr/bin/env node
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {createMapDocument, parseMapDocument, stringifyMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {
  createApplyCultureExpansionCommand,
  createApplyReligionExpansionCommand,
  inspectCultureExpansion,
  inspectReligionExpansion,
  normalizeSocialExpansionMap
} from "../app/webgl-generator/src/runtime/social-expansion-edit-commands.js";

const seed = "social-expansion-regression";
const base = createMap();
const culture = activeItems(base.society.cultures)[0];
const cultureAlternate = ownedLandCell(base, "culture", culture.i, new Set(activeItems(base.society.cultures).map(item => item.center)), culture.center);
assert(Number.isInteger(cultureAlternate), "缺少文化中心迁移样本");

const saveMap = structuredClone(base);
const saveBeforeCulture = [...saveMap.pack.cells.culture];
const saveBeforeReligion = [...saveMap.pack.cells.religion];
const saveInspection = inspectCultureExpansion(saveMap, culture.i, {mode: "save", center: cultureAlternate, type: "Naval", expansionism: 2.4});
assert(saveInspection.valid && saveInspection.centerChanged, `文化 save 预检失败：${saveInspection.reason}`);
assertDeepEqual([...saveMap.pack.cells.culture], saveBeforeCulture, "inspect 修改了文化归属");
const saveHistory = new EditHistory();
saveHistory.execute(createApplyCultureExpansionCommand(culture.i, {mode: "save", center: cultureAlternate, type: "Naval", expansionism: 2.4}), {map: saveMap});
assertDeepEqual([...saveMap.pack.cells.culture], saveBeforeCulture, "save 改变了文化覆盖");
assertDeepEqual([...saveMap.pack.cells.religion], saveBeforeReligion, "文化 save 改变了宗教覆盖");
assertDeepEqual(saveMap.metadata.derivedStale || null, base.metadata.derivedStale || null, "文化 save 不应标记覆盖下游为 stale");
assert(saveMap.society.cultures[culture.i].center === cultureAlternate && saveMap.society.cultures[culture.i].type === "Naval", "文化 save 没有保存中心和参数");
const saveAfter = socialSnapshot(saveMap);
saveHistory.undo({map: saveMap});
assert(saveMap.society.cultures[culture.i].center === culture.center, "文化 save 撤销没有恢复中心");
saveHistory.redo({map: saveMap});
assertDeepEqual(socialSnapshot(saveMap), saveAfter, "文化 save 重做没有精确恢复");

const waterCell = base.pack.cells.i.find(cell => base.pack.cells.h[cell] < 20);
const otherCultureCell = base.pack.cells.i.find(cell => base.pack.cells.h[cell] >= 20 && Number(base.pack.cells.culture[cell]) > 0 && Number(base.pack.cells.culture[cell]) !== culture.i);
assert(inspectCultureExpansion(base, culture.i, {center: waterCell}).code === "center-water", "水域中心没有被拒绝");
assert(inspectCultureExpansion(base, culture.i, {center: otherCultureCell}).code === "center-not-owned", "他属中心没有被拒绝");
assert(inspectCultureExpansion(base, culture.i, {type: "Unknown"}).code === "invalid-type", "非法文化类型没有被拒绝");
assert(inspectCultureExpansion(base, culture.i, {expansionism: 10.1}).code === "invalid-expansionism", "越界文化扩张系数没有被拒绝");
assert(inspectCultureExpansion(base, culture.i, {expansionism: "bad"}).code === "invalid-expansionism", "非有限文化扩张系数没有被拒绝");
assert(inspectCultureExpansion(base, culture.i, {mode: "replace"}).code === "invalid-mode", "非法执行方式没有被拒绝");

const cultureReexpandMap = structuredClone(base);
const religionBeforeUnlinked = [...cultureReexpandMap.pack.cells.religion];
const culturePreview = inspectCultureExpansion(cultureReexpandMap, culture.i, {mode: "reexpand", expansionism: 10});
assert(culturePreview.valid && culturePreview.requiresConfirm, `文化重扩预检失败：${culturePreview.reason}`);
assertThrows(() => createApplyCultureExpansionCommand(culture.i, {mode: "reexpand", expansionism: 10}).apply({map: cultureReexpandMap}), "confirm: true", "文化重扩没有要求确认");
const cultureHistory = new EditHistory();
const cultureBefore = structuredClone(socialSnapshot(cultureReexpandMap));
cultureHistory.execute(createApplyCultureExpansionCommand(culture.i, {mode: "reexpand", expansionism: 10, confirm: true}), {map: cultureReexpandMap});
assertDeepEqual([...cultureReexpandMap.pack.cells.religion], religionBeforeUnlinked, "默认文化重扩错误联动宗教");
assert(cultureReexpandMap.metadata.derivedStale.systems.includes("religions"), "未联动文化重扩没有标记宗教待派生");
assertUrbanCoverage(cultureReexpandMap, "culture");
assertSocialReferences(cultureReexpandMap, "culture");
cultureHistory.undo({map: cultureReexpandMap});
assertDeepEqual(socialSnapshot(cultureReexpandMap), cultureBefore, "文化重扩撤销没有精确恢复");
cultureHistory.redo({map: cultureReexpandMap});
assert(cultureHistory.getStats().undo === 1, "文化重扩没有形成单条历史");

const deterministicA = structuredClone(base);
const deterministicB = structuredClone(base);
createApplyCultureExpansionCommand(culture.i, {mode: "reexpand", expansionism: 9.5, includeReligions: true, confirm: true}).apply({map: deterministicA});
createApplyCultureExpansionCommand(culture.i, {mode: "reexpand", expansionism: 9.5, includeReligions: true, confirm: true}).apply({map: deterministicB});
assertDeepEqual([...deterministicA.pack.cells.culture], [...deterministicB.pack.cells.culture], "文化重扩不确定");
assertDeepEqual([...deterministicA.pack.cells.religion], [...deterministicB.pack.cells.religion], "联动宗教重扩不确定");
assert(deterministicA.society.metadata.religionsStale === false, "显式联动后宗教仍标记为待派生");

const folk = activeItems(base.society.religions).find(item => item.type === "Folk");
const nonFolk = activeItems(base.society.religions).find(item => item.type !== "Folk");
assert(folk && nonFolk, "缺少 Folk 或非 Folk 宗教样本");
const folkPreview = inspectReligionExpansion(base, folk.i, {mode: "save", expansion: "global", expansionism: 7});
assert(folkPreview.valid && folkPreview.next.expansion === "culture" && folkPreview.next.expansionism === 0, "Folk 参数没有固定");

for (const expansion of ["culture", "state", "global"]) {
  const map = structuredClone(base);
  const preview = inspectReligionExpansion(map, nonFolk.i, {mode: "reexpand", expansion, expansionism: 10});
  assert(preview.valid, `${expansion} 宗教重扩预检失败：${preview.reason}`);
  createApplyReligionExpansionCommand(nonFolk.i, {mode: "reexpand", expansion, expansionism: 10, confirm: true}).apply({map});
  assertReligionBoundary(map, nonFolk.i, expansion);
  assertFolkBoundary(map);
  assertUrbanCoverage(map, "religion");
  assertSocialReferences(map, "religion");
}

const religionMap = structuredClone(base);
const religionHistory = new EditHistory();
const religionBefore = structuredClone(socialSnapshot(religionMap));
religionHistory.execute(createApplyReligionExpansionCommand(nonFolk.i, {mode: "reexpand", expansion: "global", expansionism: 8, confirm: true}), {map: religionMap});
const religionAfter = socialSnapshot(religionMap);
religionHistory.undo({map: religionMap});
assertDeepEqual(socialSnapshot(religionMap), religionBefore, "宗教重扩撤销没有精确恢复");
religionHistory.redo({map: religionMap});
assertDeepEqual(socialSnapshot(religionMap), religionAfter, "宗教重扩重做没有精确恢复");

for (const faultAt of ["after-parameters", "after-ownership", "after-references"]) {
  const map = structuredClone(base);
  const before = structuredClone(socialSnapshot(map));
  const history = new EditHistory();
  assertThrows(
    () => history.execute(createApplyCultureExpansionCommand(culture.i, {mode: "reexpand", expansionism: 8, includeReligions: true, confirm: true, faultAt}), {map}),
    faultAt,
    `${faultAt} 故障没有抛错`
  );
  assertDeepEqual(socialSnapshot(map), before, `${faultAt} 故障没有完整回滚`);
  assert(history.getStats().undo === 0, `${faultAt} 故障不应写入历史`);
}

const legacy = structuredClone(base);
const legacyCulture = activeItems(legacy.society.cultures)[0];
const legacyReligion = activeItems(legacy.society.religions).find(item => item.type !== "Folk");
legacyCulture.type = "bad";
legacyCulture.expansionism = Number.NaN;
legacyCulture.center = -99;
legacyReligion.expansion = "planet";
legacyReligion.expansionism = 99;
const legacyCultureCoverage = [...legacy.pack.cells.culture];
const legacyReligionCoverage = [...legacy.pack.cells.religion];
normalizeSocialExpansionMap(legacy);
assert(legacyCulture.type === "Generic" && legacyCulture.expansionism === 1, "旧文化参数没有回填默认值");
assert(legacyCulture.center >= 0 && legacy.pack.cells.culture[legacyCulture.center] === legacyCulture.i, "旧文化中心没有确定性回退");
assert(legacyReligion.expansion === "culture" && legacyReligion.expansionism === 10, "旧宗教参数没有按规则规范化");
assertDeepEqual([...legacy.pack.cells.culture], legacyCultureCoverage, "旧值规范化改变了文化覆盖");
assertDeepEqual([...legacy.pack.cells.religion], legacyReligionCoverage, "旧值规范化改变了宗教覆盖");
const roundtripBindings = structuredClone(legacy.namebases?.bindings?.cultures || legacy.options?.namebaseBindings?.cultures || {});
const roundtrip = parseMapDocument(stringifyMapDocument(createMapDocument(legacy, legacy.options))).map;
assert(roundtrip.society.cultures[legacyCulture.i].type === "Generic" && roundtrip.society.cultures[legacyCulture.i].expansionism === 1, "完整地图往返丢失文化兼容回填");
assert(roundtrip.society.religions[legacyReligion.i].expansion === "culture" && roundtrip.society.religions[legacyReligion.i].expansionism === 10, "完整地图往返丢失宗教兼容回填");
assertDeepEqual(roundtrip.namebases?.bindings?.cultures || roundtrip.options?.namebaseBindings?.cultures || {}, roundtripBindings, "完整地图往返改变了名称库绑定");
assertDeepEqual(roundtrip.society.cultures, roundtrip.pack.cultures, "完整地图往返后文化双 store 不一致");
assertDeepEqual(roundtrip.society.religions, roundtrip.pack.religions, "完整地图往返后宗教双 store 不一致");

const packOnly = structuredClone(base);
const packOnlyCultureCount = activeItems(packOnly.pack.cultures).length;
const packOnlyReligionCount = activeItems(packOnly.pack.religions).length;
const packOnlyCultureCoverage = [...packOnly.pack.cells.culture];
const packOnlyReligionCoverage = [...packOnly.pack.cells.religion];
delete packOnly.society;
normalizeSocialExpansionMap(packOnly);
assert(activeItems(packOnly.society.cultures).length === packOnlyCultureCount, "仅 pack 旧图没有恢复文化主存储");
assert(activeItems(packOnly.society.religions).length === packOnlyReligionCount, "仅 pack 旧图没有恢复宗教主存储");
assertDeepEqual(packOnly.society.cultures, packOnly.pack.cultures, "仅 pack 旧图文化双 store 不一致");
assertDeepEqual(packOnly.society.religions, packOnly.pack.religions, "仅 pack 旧图宗教双 store 不一致");
assertDeepEqual([...packOnly.pack.cells.culture], packOnlyCultureCoverage, "仅 pack 旧图规范化改变了文化覆盖");
assertDeepEqual([...packOnly.pack.cells.religion], packOnlyReligionCoverage, "仅 pack 旧图规范化改变了宗教覆盖");
const packOnlyRoundtrip = parseMapDocument(stringifyMapDocument(createMapDocument(packOnly, packOnly.options))).map;
assertDeepEqual(packOnlyRoundtrip.society.cultures, packOnlyRoundtrip.pack.cultures, "仅 pack 旧图往返后文化双 store 不一致");
assertDeepEqual(packOnlyRoundtrip.society.religions, packOnlyRoundtrip.pack.religions, "仅 pack 旧图往返后宗教双 store 不一致");

console.log(JSON.stringify({
  ok: true,
  seed,
  save: {cultureId: culture.i, center: cultureAlternate, coverageUnchanged: true},
  reexpand: {cultureChanged: culturePreview.changedPackCells, deterministic: true, linked: true},
  religion: {folk: folk.i, nonFolk: nonFolk.i, scopes: ["culture", "state", "global"]},
  compatibility: {legacyDefaults: true, packOnlyStores: true, faultStages: 3, undoRedo: true, fullMapRoundtrip: true, namebaseBindings: true}
}, null, 2));

function createMap() {
  return generatePlaceholderMap({seed, cellsTarget: 10000, heightmapTemplate: "continents", culturesNumber: 10, religionsNumber: 6});
}

function activeItems(items) {
  return (items || []).filter(item => item && !item.removed && Number(item.i ?? item.id) > 0);
}

function ownedLandCell(map, field, id, excluded = new Set(), skip = -1) {
  return map.pack.cells.i.find(cell => cell !== skip && !excluded.has(cell) && map.pack.cells.h[cell] >= 20 && Number(map.pack.cells[field][cell]) === id);
}

function assertReligionBoundary(map, religionId, expansion) {
  const religion = map.society.religions[religionId];
  const centerState = Number(map.pack.cells.state?.[religion.center]) || 0;
  for (const cell of map.pack.cells.i) {
    if (Number(map.pack.cells.religion[cell]) !== religionId) continue;
    if (expansion === "culture") assert(Number(map.pack.cells.culture[cell]) === Number(religion.culture), "culture 宗教越过绑定文化");
    if (expansion === "state") assert(Number(map.pack.cells.state?.[cell] || 0) === centerState, "state 宗教越过中心国家");
  }
}

function assertFolkBoundary(map) {
  for (const religion of activeItems(map.society.religions).filter(item => item.type === "Folk")) {
    assert(religion.expansion === "culture" && religion.expansionism === 0, `Folk #${religion.i} 参数漂移`);
    for (const cell of map.pack.cells.i) {
      if (Number(map.pack.cells.religion[cell]) === religion.i) assert(Number(map.pack.cells.culture[cell]) === Number(religion.culture), `Folk #${religion.i} 越过文化范围`);
    }
  }
}

function assertSocialReferences(map, field) {
  for (const burg of map.pack.burgs || []) {
    if (!burg?.i || burg.removed) continue;
    assert(Number(burg[field] || 0) === Number(map.pack.cells[field]?.[burg.cell] || 0), `burg ${field} 引用未同步`);
  }
  for (const city of map.settlements?.cities || []) {
    if (!Number.isInteger(Number(city?.packCell))) continue;
    assert(Number(city[field] || 0) === Number(map.pack.cells[field]?.[city.packCell] || 0), `city ${field} 引用未同步`);
  }
}

function assertUrbanCoverage(map, field) {
  const items = map.society[`${field}s`];
  const expected = new Map();
  for (const burg of map.pack.burgs || []) {
    if (!burg?.i || burg.removed) continue;
    const id = Number(map.pack.cells[field]?.[burg.cell]) || 0;
    expected.set(id, round((expected.get(id) || 0) + (Number(burg.population) || 0)));
  }
  for (const item of activeItems(items)) {
    assert(Number(item.urban || 0) === Number(expected.get(item.i) || 0), `${field} #${item.i} 城市人口覆盖统计不一致`);
  }
}

function socialSnapshot(map) {
  return {
    packCulture: [...map.pack.cells.culture],
    packReligion: [...map.pack.cells.religion],
    gridCulture: [...map.grid.cells.culture],
    gridReligion: [...map.grid.cells.religion],
    societyCultures: map.society.cultures,
    societyReligions: map.society.religions,
    packCultures: map.pack.cultures,
    packReligions: map.pack.religions,
    burgs: (map.pack.burgs || []).map(item => item && ({i: item.i, culture: item.culture, religion: item.religion})),
    cities: (map.settlements?.cities || []).map(item => item && ({id: item.id, culture: item.culture, religion: item.religion})),
    states: (map.pack.states || []).map(item => item && ({i: item.i, culture: item.culture, religion: item.religion})),
    provinces: (map.pack.provinces || []).map(item => item && ({i: item.i, culture: item.culture, religion: item.religion})),
    societyMetadata: map.society.metadata,
    stale: map.metadata.derivedStale || null
  };
}

function assertDeepEqual(actual, expected, message) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), message);
}

function assertThrows(action, pattern, message) {
  try {
    action();
  } catch (error) {
    assert(String(error?.message || error).includes(pattern), `${message}：${error?.message || error}`);
    return;
  }
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function round(value) {
  return Math.round(value * 100) / 100;
}
