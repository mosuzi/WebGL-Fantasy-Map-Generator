#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {buildMilitary} from "../app/webgl-generator/src/generator/military.js";
import {collectionAffected, summarizeAffectedTargets, systemAffected} from "../app/webgl-generator/src/runtime/edit-command-effects.js";
import {compareMilitaryVariation, snapshotMilitaryVariation, syncMilitaryStateMirrors} from "../app/webgl-generator/src/runtime/military-regeneration-variation.js";

const map = generatePlaceholderMap({
  seed: "military-regeneration-regression",
  cellsTarget: 3000,
  graphWidth: 960,
  graphHeight: 640,
  heightmapTemplate: "continents"
});
const state = map.pack.states.find(item => item?.i && !item.removed);
assert(state, "固定样本没有生成有效国家");

const ratioKeys = Object.keys(state.militaryPolicy?.unitRatios || {});
assert(ratioKeys.length >= 2, "固定样本缺少可验证的兵种比例");
const preservedRatios = Object.fromEntries(ratioKeys.map((key, index) => [key, index === 0 ? 0.7 : index === 1 ? 0.3 : 0]));
state.militaryPolicy.unitRatios = {...preservedRatios};
const previousEvents = [{id: "archive:event:1", regimentObjectId: "1:0", stateId: 1, regimentId: 0, kind: "battle"}];
const eventSequence = 7;
map.military.events = previousEvents;
map.military.metadata.events = previousEvents.length;
map.military.metadata.eventSequence = eventSequence;

const before = militaryCounts(map);
const beforeSnapshot = snapshotMilitaryVariation(map);
map.military = buildMilitary(map.pack, {...map.options, seed: `${map.options.seed}:regenerate-military:1`});
const variation = compareMilitaryVariation(beforeSnapshot, snapshotMilitaryVariation(map));
const archivedEvents = previousEvents.map(event => ({...event, archived: true, archiveReason: "military-regeneration", archiveGeneration: 1}));
map.military.events = archivedEvents;
map.military.metadata.events = archivedEvents.length;
map.military.metadata.eventSequence = eventSequence;
const after = militaryCounts(map);
assert.deepEqual(state.militaryPolicy.unitRatios, preservedRatios, "军事重生成没有保留有效兵种比例");
assert.deepEqual(map.military.events, archivedEvents, "军事重生成静默丢失了全局战报档案");
assert(map.military.events.every(event => event.archived && event.archiveReason === "military-regeneration"), "旧战报没有标记为静态归档");
assert.equal(map.military.metadata.eventSequence, eventSequence, "军事重生成没有保留战报序号");
assert(regimentsHaveNoArchivedEvents(map, archivedEvents), "旧战报被错误挂接到新军团");
assert.equal(after.regiments, map.pack.states.flatMap(item => item?.military || []).length, "军团摘要与国家军团集合不一致");
assert.equal(after.fronts, map.military.fronts.length, "战线摘要与结果集合不一致");
assert.equal(after.campaigns, map.military.campaigns.length, "战役摘要与结果集合不一致");
assert(variation.changed, "军事重生成前后快照完全同构");
assert(variation.changedRegiments > 0, "军事重生成没有改变任何军团");
assert(variation.troopChanges + variation.compositionChanges + variation.statusChanges + variation.positionChanges + variation.orderChanges > 0, "军事重生成没有产生可观察变化");

const restoredMap = structuredClone(map);
restoredMap.politics.states = restoredMap.pack.states.map(state => ({...structuredClone(state), military: []}));
assert.notStrictEqual(restoredMap.pack.states, restoredMap.politics.states, "序列化回归样本没有断开国家数组引用");
assert.equal(restoredMap.politics.states.flatMap(state => state?.military || []).length, 0, "序列化回归样本未建立空军事镜像");
restoredMap.military = buildMilitary(restoredMap.pack, {...restoredMap.options, seed: `${restoredMap.options.seed}:regenerate-military:restored`});
const restoredRegiments = restoredMap.pack.states.flatMap(state => state?.military || []);
assert(restoredRegiments.length > 0, "序列化回归样本没有在 pack 侧重建军团");
const syncedStates = syncMilitaryStateMirrors(restoredMap);
const mirroredRegiments = restoredMap.politics.states.flatMap(state => state?.military || []);
assert(syncedStates > 0, "军事重生成没有同步断开引用的 politics 国家镜像");
assert.equal(mirroredRegiments.length, restoredRegiments.length, "politics 国家镜像没有获得重建后的军团");
for (const politicsState of restoredMap.politics.states) {
  const packState = restoredMap.pack.states.find(state => Number(state?.i) === Number(politicsState?.i));
  if (!packState) continue;
  assert.strictEqual(politicsState.military, packState.military, `国家 ${politicsState.i} 的军团集合没有恢复共享引用`);
  assert.strictEqual(politicsState.militaryPolicy, packState.militaryPolicy, `国家 ${politicsState.i} 的军事策略没有恢复共享引用`);
}

const regiments = map.pack.states.flatMap(item => item?.military || []);
const affected = systemAffected("military", collectionAffected("military", regiments));
const affectedSummary = summarizeAffectedTargets(affected);
assert.equal(affectedSummary.count, regiments.length + 1, "affected 总数没有包含军事系统与全部军团");
assert.equal(affectedSummary.kinds[0]?.kind, "derived-system", "affected 缺少军事系统目标");
assert(affectedSummary.text.startsWith("derived-system#military"), "affected 摘要没有以军事系统开头");

const [appSource, controlSource, militaryCommandSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/ControlPanel.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/military-edit-commands.js", import.meta.url), "utf8")
]);
const militaryBlock = functionBlock(appSource, "regenerateMilitary");
assert.match(controlSource, /\{value: "military", kind: "military", label: regenerationKindLabel\("military"\), impact:/, "控制面板缺少军事重生成入口");
assert.match(appSource, /\["military", "army", "armies"\]\.includes\(value\)/, "API 缺少 military 别名归一化");
assert.match(militaryBlock, /validStates\.length/, "军事重生成没有拒绝缺少有效国家的地图");
assert.match(militaryBlock, /nextRegenerationSalt\(map, "military"\)/, "军事重生成没有推进扰动编号");
assert.match(militaryBlock, /markDerivedFresh\(map, \["military"\]\)/, "军事重生成没有把 military 标为 fresh");
assert.match(militaryBlock, /markDerivedStale\(map, \["zones"\]\)/, "军事重生成没有把 zones 标为 stale");
assert.match(militaryCommandSource, /archiveReason: "military-regeneration"[\s\S]*map\.military\.events = archivedEvents/, "军事重生成命令没有保留并标记全局战报档案");
assert.match(militaryCommandSource, /preservedBattleEvents: archivedEvents\.length/, "军事命令结果没有返回保留战报数");
assert.match(militaryBlock, /regenerationSalt: salt/, "军事结果没有返回扰动编号");
assert.match(militaryCommandSource, /attempts < attemptLimit/, "军事重生成没有在同构结果下自动更换扰动重试");
assert.match(militaryCommandSource, /syncMilitaryStateMirrors\(map\)/, "军事重生成没有同步序列化后断开的国家军事镜像");
assert.match(militaryBlock, /variation,/, "军事结果没有返回实际变化摘要");
assert.match(militaryBlock, /\["point-layers", "line-layers", "labels", "object-panels", "object-index"\]/, "军事重生成没有同步刷新图标、标签和战线");
assert.match(militaryBlock, /before,\s+after,/, "军事结果没有返回前后摘要");
assert.match(militaryBlock, /affected: \{\s+summary:/, "军事结果没有返回 affected 摘要");
assert.match(appSource, /militaryFronts:[\s\S]*militaryCampaigns:/, "API 前后摘要缺少战线或战役数");
assert.match(appSource, /details: result\.details \|\| null/, "API 没有返回军事重生成详情");
const militaryPanelSource = await readFile(new URL("../app/webgl-generator/src/ui/vue/components/MilitaryPanel.vue", import.meta.url), "utf8");
assert.match(militaryPanelSource, /function eventBelongsToRegiment[\s\S]*if \(event\?\.archived\) return false;/, "已归档旧战报不得自动挂到新军团");

console.log(JSON.stringify({
  ok: true,
  regenerationSalt: 1,
  before,
  after,
  variation,
  restoredMirror: {
    syncedStates,
    regiments: mirroredRegiments.length
  },
  preservedRatios,
  preservedBattleEvents: map.military.events.length,
  affected: {
    summary: affectedSummary.text,
    count: affectedSummary.count,
    kinds: affectedSummary.kinds
  }
}, null, 2));

function militaryCounts(targetMap) {
  return {
    regiments: Number(targetMap.military?.metadata?.regiments) || 0,
    fronts: Number(targetMap.military?.metadata?.fronts) || targetMap.military?.fronts?.length || 0,
    campaigns: Number(targetMap.military?.metadata?.campaigns) || targetMap.military?.campaigns?.length || 0
  };
}

function regimentsHaveNoArchivedEvents(targetMap, events) {
  const ids = new Set(events.map(event => event.id));
  return targetMap.pack.states
    .flatMap(item => item?.military || [])
    .every(regiment => !(regiment.events || []).some(event => ids.has(event?.id)));
}

function functionBlock(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `缺少函数 ${name}`);
  const next = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, next < 0 ? source.length : next);
}
