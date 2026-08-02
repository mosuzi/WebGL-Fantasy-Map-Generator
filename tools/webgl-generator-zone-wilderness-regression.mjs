import assert from "node:assert/strict";
import {collectWildernessComponents, rebuildWildernessZones, wildernessLabelAnchor, wildernessSemanticName} from "../app/webgl-generator/src/runtime/zone-wilderness.js";
import {createSetZonePropertiesCommand} from "../app/webgl-generator/src/runtime/zone-edit-commands.js";
import {isZoneLayerVisible} from "../app/webgl-generator/src/renderer/zone-layer.js";
import {resolveObject} from "../app/webgl-generator/src/runtime/object-resolver.js";
import {normalizeLabelLayoutStore, patchLabelLayout, readLabelLayoutOverride} from "../app/webgl-generator/src/runtime/label-layout-registry.js";
import {buildZones} from "../app/webgl-generator/src/generator/zones.js";

function fixture() {
  return {
    cells: {
      i: [0, 1, 2, 3, 4, 5, 6, 7],
      h: [30, 30, 30, 30, 30, 30, 10, 30],
      state: [0, 0, 0, 1, 0, 0, 0, 0],
      burg: [0, 0, 0, 0, 1, 0, 0, 0],
      pop: [0, 0.2, 0, 0, 0, 0.8, 0, 0],
      c: [[1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 6], [5], []],
      p: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [10, 0]]
    }
  };
}

const pack = fixture();
assert.deepEqual(collectWildernessComponents(pack), [[0, 1, 2], [7]], "只纳入中立、无城、低人口陆地并按邻接分块");

let zones = rebuildWildernessZones(pack, []);
assert.equal(zones.length, 2);
assert.notEqual(zones[0].name, zones[1].name);
assert(!zones.some(zone => /^荒(?:野|原)\s*\d+$/u.test(zone.name)), "自动无人区不得使用纯编号名称");

const namedPack = fixture();
namedPack.cells.province = [0, 0, 0, 1, 0, 0, 0, 0];
namedPack.cells.culture = [2, 2, 2, 2, 0, 0, 0, 0];
namedPack.cells.burg[3] = 1;
namedPack.burgs = [null, {i: 1, name: "临川"}];
namedPack.provinces = [null, {i: 1, name: "河西", fullName: "河西省"}];
namedPack.cultures = [null, null, {i: 2, name: "青原"}];
assert.equal(wildernessSemanticName(namedPack, [0, 1, 2]), "临川外野", "邻近城镇优先提供地理语义");
namedPack.cells.burg[3] = 0;
assert.equal(wildernessSemanticName(namedPack, [0, 1, 2]), "河西荒原", "没有邻近城镇时使用省份语义");
namedPack.cells.province[3] = 0;
assert.equal(wildernessSemanticName(namedPack, [0, 1, 2]), "青原原野", "没有城镇和省份时使用文化语义");
assert.equal(wildernessSemanticName(namedPack, [0, 1, 2]), wildernessSemanticName(namedPack, [2, 0, 1]), "语义命名不受 cell 输入顺序影响");
const stateNamedPack = fixture();
stateNamedPack.cells.c[0] = [1, 2];
stateNamedPack.cells.state[1] = 1;
stateNamedPack.cells.state[2] = 1;
stateNamedPack.states = [null, {i: 1, name: "云中"}];
assert.equal(wildernessSemanticName(stateNamedPack, [0]), "云中边荒", "国家只在单一边界明显占优时兜底");
const first = structuredClone(zones[0]);
first.name = "静寂荒原";
first.nameMode = "manual";
zones = rebuildWildernessZones(pack, [first, zones[1]]);
assert.equal(zones.find(zone => zone.i === first.i).name, "静寂荒原", "无变化保持 id 与手工名称");
const automaticLegacy = {...structuredClone(zones.find(zone => zone.i !== first.i)), name: "荒野 77", nameMode: "auto"};
const refreshedAutomatic = rebuildWildernessZones(pack, [first, automaticLegacy]).find(zone => zone.i === automaticLegacy.i);
assert.notEqual(refreshedAutomatic.name, "荒野 77", "显式重建时更新旧的自动编号名称");
const compactAutomaticLegacy = {...structuredClone(automaticLegacy), name: "荒野4"};
delete compactAutomaticLegacy.nameMode;
const refreshedCompactAutomatic = rebuildWildernessZones(pack, [first, compactAutomaticLegacy]).find(zone => zone.i === compactAutomaticLegacy.i);
assert.notEqual(refreshedCompactAutomatic.name, "荒野4", "无空格的旧自动编号名称同样必须更新");
const legacyManual = {...structuredClone(automaticLegacy), name: "沉星旧野"};
delete legacyManual.nameMode;
const preservedLegacyManual = rebuildWildernessZones(pack, [first, legacyManual]).find(zone => zone.i === legacyManual.i);
assert.equal(preservedLegacyManual.name, "沉星旧野", "无法证明为自动编号的旧名称必须按手工名称保护");

const splitPack = fixture();
splitPack.cells.state[1] = 1;
const split = rebuildWildernessZones(splitPack, [first]);
assert.equal(split.filter(zone => zone.name === "静寂荒原").length, 1, "分裂只允许一个碎片继承手工名称");
assert.equal(new Set(split.map(zone => zone.name)).size, split.length);

const mergePack = fixture();
const oldLeft = {...first, i: 20, id: 20, cells: [0], name: "西荒"};
const oldRight = {...first, i: 21, id: 21, cells: [2], name: "东荒"};
const merged = rebuildWildernessZones(mergePack, [oldLeft, oldRight]);
const mergedMain = merged.find(zone => zone.cells.includes(0) && zone.cells.includes(2));
assert.equal(mergedMain.id, 20, "合并时确定性继承主重叠对象");
assert.equal(["西荒", "东荒"].filter(name => merged.some(zone => zone.name === name)).length, 1);

const anchor = wildernessLabelAnchor(pack, mergedMain);
assert.ok(mergedMain.cells.includes(anchor.cell));
assert.deepEqual([anchor.x, anchor.y], pack.cells.p[anchor.cell]);

const visibility = {zones: true, zoneEvents: false, zoneNatural: true, zoneWilderness: false};
assert.equal(isZoneLayerVisible({category: "event", source: "generated"}, visibility), false);
assert.equal(isZoneLayerVisible({category: "natural", source: "manual"}, visibility), true);
assert.equal(isZoneLayerVisible({category: "natural", source: "auto-wilderness"}, visibility), false);
const before = JSON.stringify(merged);
isZoneLayerVisible(mergedMain, {...visibility, zoneWilderness: true});
assert.equal(JSON.stringify(merged), before, "图层开关判断不修改地图数据");

const map = {pack, zones: {zones: [structuredClone(first)]}};
map.pack.zones = map.zones.zones;
const rename = createSetZonePropertiesCommand(first.i, {name: "新荒原"});
assert.ok(rename.effects.derived.includes("labels"), "地区改名、创建和删除必须刷新标签派生物");
rename.apply({map});
assert.equal(map.zones.zones[0].nameMode, "manual");
rename.revert({map});
assert.equal(map.zones.zones[0].name, "静寂荒原");
const label = resolveObject(map, {kind: "label", id: first.i, targetKind: "zone", targetId: first.i});
assert.equal(label.targetKind, "zone");
assert.equal(label.targetName, "静寂荒原");

const lockedAuto = {...structuredClone(first), i: 70, id: 70, cells: [0], name: "锁定荒野", color: "#123456", pattern: "dots", context: {status: "active", participants: [{role: "origin", ref: {kind: "region", id: "cell:0", nameSnapshot: "原点"}}]}, lockedExtra: {keep: true}};
delete lockedAuto.coverage;
delete lockedAuto.effects;
const lockedResult = rebuildWildernessZones(pack, [lockedAuto], {preservedZones: [lockedAuto]});
assert.deepEqual(lockedResult.find(zone => zone.id === 70), lockedAuto, "锁定自动无人区逐字段原样保留");
assert.ok(lockedResult.some(zone => zone.id !== 70 && zone.cells.includes(1)), "锁定候选扩张在锁区外形成新分量");
assert.ok(lockedResult.filter(zone => zone.id !== 70).every(zone => !zone.cells.includes(0)), "新分量不得占用锁定 cells");
assert.equal(new Set(lockedResult.map(zone => zone.id)).size, lockedResult.length, "新分量不得复用锁定 id");
const buildPack = {...fixture(), zones: [structuredClone(lockedAuto)], military: {fronts: []}, states: [], burgs: [], religions: [], cultures: [], provinces: [], markers: [], rivers: []};
const builtWithLock = buildZones(buildPack, {seed: "locked-auto-wilderness", preservedZones: [lockedAuto]});
assert.deepEqual(builtWithLock.zones.find(zone => zone.id === 70), lockedAuto, "buildZones 同样原样保留锁定自动无人区");

const labelMap = {labels: {layout: {version: 1, overrides: {}}}};
patchLabelLayout(labelMap, "zone", 70, {priority: 12, position: {x: 4, y: 5}});
assert.deepEqual(readLabelLayoutOverride(labelMap, "zone", 70), {priority: 12, position: {x: 4, y: 5}});
const normalizedLayout = normalizeLabelLayoutStore(JSON.parse(JSON.stringify(labelMap.labels.layout)), {strict: true});
assert.deepEqual(normalizedLayout.overrides["zone:70"], {priority: 12, position: {x: 4, y: 5}}, "zone 标签布局覆盖往返不丢失");

console.log("自动无人区定向回归通过：候选过滤、连通分块、稳定继承、手工名称、图层可见性与标签锚点均正确。");
