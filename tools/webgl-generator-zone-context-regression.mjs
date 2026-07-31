import assert from "node:assert/strict";
import {createSetZoneContextCommand, createSetZonePropertiesCommand, inspectZoneCreation} from "../app/webgl-generator/src/runtime/zone-edit-commands.js";
import {resolveZoneContext, normalizeZoneMap} from "../app/webgl-generator/src/runtime/zone-context.js";
import {resolveZoneEffectsAtCell} from "../app/webgl-generator/src/runtime/zone-types.js";
import {buildZones} from "../app/webgl-generator/src/generator/zones.js";
import {resolveObject} from "../app/webgl-generator/src/runtime/object-resolver.js";
import {getObjectSnapshot} from "../app/webgl-generator/src/runtime/object-query-api.js";
import {createMapFeatureGeoJson} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {formatHoverObjectTitle} from "../app/webgl-generator/src/ui/hover-overlay-content.js";

const map = {
  options: {graphWidth: 100, graphHeight: 100},
  politics: {states: [null, {i: 1, name: "赤岩国"}, {i: 2, name: "白河国"}]},
  society: {religions: [null, {i: 1, name: "山河正教"}, {i: 2, name: "星火新教"}]},
  pack: {
    states: [null, {i: 1, name: "赤岩国"}, {i: 2, name: "白河国"}],
    cells: {i: [0], h: [30], v: [[0, 1, 2]], state: [2], c: [[]], area: [1]},
    vertices: {p: [[0, 0], [10, 0], [0, 10]]}
  },
  zones: {zones: [{i: 7, name: "边境入侵区", type: "Invasion", cells: [0], attacker: 1, defender: 2}], metadata: {}}
};
map.pack.zones = map.zones.zones;

normalizeZoneMap(map);
let zone = map.zones.zones[0];
let context = resolveZoneContext(map, zone);
assert.equal(context.summary, "赤岩国正在入侵白河国");
assert.equal(context.status, "active");

const rebels = {i: 70, name: "赤岩叛乱区", type: "Rebels", cells: [0], context: {status: "active", participants: [
  {role: "rebel", ref: {kind: "faction", id: "culture:3", nameSnapshot: "河谷民团"}},
  {role: "ruler", ref: {kind: "state", id: 1, nameSnapshot: "赤岩国"}}
]}};
assert.equal(resolveZoneContext(map, rebels).summary, "河谷民团反抗赤岩国");

const proselytism = {i: 71, name: "星火传教区", type: "Proselytism", cells: [0], context: {status: "active", participants: [
  {role: "source-religion", ref: {kind: "religion", id: 2, nameSnapshot: "星火新教"}},
  {role: "target-religion", ref: {kind: "religion", id: 1, nameSnapshot: "山河正教"}}
]}};
assert.equal(resolveZoneContext(map, proselytism).summary, "星火新教正向山河正教信仰区传教");

const command = createSetZoneContextCommand(7, {
  status: "resolved",
  participants: [
    {role: "invader", ref: {kind: "state", id: 2, nameSnapshot: "白河国"}},
    {role: "defender", ref: {kind: "state", id: 1, nameSnapshot: "赤岩国"}}
  ]
});
command.apply({map});
context = resolveZoneContext(map, zone);
assert.equal(context.summary, "白河国正在入侵赤岩国");
assert.equal(context.status, "resolved");
command.revert({map});
assert.equal(resolveZoneContext(map, zone).summary, "赤岩国正在入侵白河国");

const resolved = resolveObject(map, {kind: "zone", id: 7});
assert.equal(resolved.summary, "赤岩国正在入侵白河国");
assert.equal(getObjectSnapshot(map, {kind: "zone", id: 7}).summary, resolved.summary);
assert.match(formatHoverObjectTitle(resolved), /赤岩国正在入侵白河国/);

const geojson = createMapFeatureGeoJson(map, {layers: {zone: true}, dissolvePolitical: false});
const feature = geojson.features.find(item => item.properties?.layer === "zone");
assert.equal(feature.properties.summary, resolved.summary);
assert.equal(feature.properties.context.participants.length, 2);

const ambiguous = {i: 8, name: "旧传教区", type: "Proselytism", cells: [0]};
map.zones.zones.push(ambiguous);
assert.equal(resolveZoneContext(map, ambiguous).summary, "参与方信息待补充");
assert.equal(resolveZoneContext(map, ambiguous).status, "incomplete");
const removedStateZone = {i: 81, name: "旧战区", type: "Warzone", cells: [0], context: {status: "active", participants: [
  {role: "attacker", ref: {kind: "state", id: 1, nameSnapshot: "赤岩国"}},
  {role: "defender", ref: {kind: "state", id: 99, nameSnapshot: "旧白河国"}}
]}};
map.politics.states[99] = {i: 99, name: "旧白河国", removed: true};
const removedContext = resolveZoneContext(map, removedStateZone);
assert.equal(removedContext.status, "invalid");
assert.equal(removedContext.complete, false);
assert.equal(removedContext.statusLabel, "参与方引用已失效");
assert.match(removedContext.summary, /已失效/);
assert.equal(removedContext.participants.find(item => item.role === "defender").name, "旧白河国", "失效引用仍可显示快照名称");

const natural = {i: 9, name: "黑沼", type: "Swamp", cells: [0], effects: {movementCost: 1.5, defense: 2}};
map.zones.zones.push(natural);
normalizeZoneMap(map);
assert.equal(map.zones.zones.find(item => item.i === 9).category, "natural");
assert.deepEqual(map.zones.zones.find(item => item.i === 9).effects, {habitability: 0, movementCost: 1.5, economy: 1, defense: 2});
const unknown = {i: 10, name: "秘境", type: "Dreamscape", cells: []};
map.zones.zones.push(unknown);
normalizeZoneMap(map);
assert.equal(map.zones.zones.find(item => item.i === 10).category, "custom");
assert.deepEqual(map.zones.zones.find(item => item.i === 10).effects, {habitability: 0, movementCost: 1, economy: 1, defense: 0});
const normalizedNatural = map.zones.zones.find(item => item.i === 9);
map.zones.zones = [normalizedNatural];
map.pack.zones = map.zones.zones;

assert.equal(inspectZoneCreation(map, {id: 11, type: "Disaster", packCells: [0]}).valid, true, "事件覆盖区允许覆盖自然底区");
assert.equal(inspectZoneCreation(map, {id: 11, type: "Desert", packCells: [0]}).code, "occupied-cell", "自然底区彼此互斥");

const properties = createSetZonePropertiesCommand(9, {description: "终年积水", effects: {habitability: -5, movementCost: 2, economy: 0.8, defense: 3}});
properties.apply({map});
assert.equal(normalizedNatural.description, "终年积水");
assert.deepEqual(resolveZoneEffectsAtCell(map, 0).effects, {habitability: -5, movementCost: 2, economy: 0.8, defense: 3});
properties.revert({map});
assert.equal(normalizedNatural.description, "");
const partialEffects = createSetZonePropertiesCommand(9, {effects: {defense: 7}});
partialEffects.apply({map});
assert.deepEqual(normalizedNatural.effects, {habitability: 0, movementCost: 1.5, economy: 1, defense: 7}, "effects 局部 patch 保留未传字段");
partialEffects.revert({map});

map.zones.zones.push(
  {i: 90, name: "极端底区", type: "Custom", category: "custom", coverage: "base", cells: [0], effects: {habitability: 100, movementCost: 10, economy: 10, defense: 100}},
  {i: 91, name: "极端覆盖区", type: "Custom", category: "custom", coverage: "overlay", cells: [0], effects: {habitability: 100, movementCost: 10, economy: 0, defense: 100}}
);
assert.deepEqual(resolveZoneEffectsAtCell(map, 0).effects, {habitability: 100, movementCost: 10, economy: 0.1, defense: 100}, "双层极值合并后执行最终边界");
map.zones.zones.splice(-2);

const preserved = structuredClone(normalizedNatural);
const pack = {...map.pack, zones: [preserved], military: {fronts: []}, burgs: [], religions: [], cultures: [], provinces: [], markers: [], rivers: []};
const rebuilt = buildZones(pack, {seed: "zone-natural-preserve"});
assert.ok(rebuilt.zones.some(item => item.i === preserved.i && item.category === "natural"), "事件地区重生成保留自然地区");
const roundtrip = JSON.parse(JSON.stringify({zones: {zones: [preserved]}, pack: {...map.pack, zones: [preserved]}}));
normalizeZoneMap(roundtrip);
assert.deepEqual(roundtrip.zones.zones[0].effects, preserved.effects, "完整 JSON 往返保留地区影响");

console.log("地区事件语义定向回归通过：旧字段可靠回填、统一摘要、可撤销编辑、对象查询、hover 与 GeoJSON 均一致。");
