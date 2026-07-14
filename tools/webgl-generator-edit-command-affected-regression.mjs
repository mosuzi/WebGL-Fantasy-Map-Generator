#!/usr/bin/env node
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {createSetDiplomacyRelationCommand, diplomacyRegenerationAffected} from "../app/webgl-generator/src/runtime/diplomacy-edit-commands.js";
import {createApplyHeightBrushCommand} from "../app/webgl-generator/src/runtime/height-edit-commands.js";
import {
  createClearUserNamebasesCommand,
  createCreateUserNamebaseCommand,
  createImportNamebasesCommand,
  createRenameUserNamebaseCommand,
  createSetNamebaseBindingCommand
} from "../app/webgl-generator/src/runtime/namebase-edit-commands.js";

const map = createSyntheticMap();
const history = new EditHistory();

const createCommand = createCreateUserNamebaseCommand({payload: {name: "契约名称库", source: ["青川", "云泽"]}});
assertAffected(createCommand.effects.affected, [{kind: "namebase", id: "new"}], "名称库新增初始目标");
history.execute(createCommand, {map});
const createdId = createCommand.getResult()?.id;
assert(createdId, "名称库新增命令没有返回真实 id");
assertHistory(history, "namebase", [{kind: "namebase", id: createdId}], "名称库新增历史");
history.undo({map});
assert(map.namebases.bases.length === 0, "撤销名称库新增后仍有用户库");
history.redo({map});
assert(map.namebases.bases.some(base => base.id === createdId), "重做名称库新增后没有恢复相同 id");
assertHistory(history, "namebase", [{kind: "namebase", id: createdId}], "名称库新增重做历史");

const renameCommand = createRenameUserNamebaseCommand(createdId, "重命名后的名称库");
history.execute(renameCommand, {map});
assertHistory(history, "namebase", [{kind: "namebase", id: createdId}], "名称库重命名历史");

const bindingCommand = createSetNamebaseBindingCommand("place", createdId, {cultureId: 3});
assertAffected(bindingCommand.effects.affected, [
  {kind: "derived-system", id: "namebase-binding"},
  {kind: "namebase-binding", id: "culture:3:place"}
], "名称库绑定目标");

const importCommand = createImportNamebasesCommand({bases: [{id: "import-a", name: "导入名称库", source: ["白沙", "玄岭"]}]}, {filename: "affected-regression.json"});
assertAffected(importCommand.effects.affected, [
  {kind: "derived-system", id: "namebase-import"},
  {kind: "namebase", id: "new"}
], "名称库导入初始目标");
history.execute(importCommand, {map});
const importedId = map.namebases.bases.find(base => base.origin === "导入")?.id;
assert(importedId, "名称库导入后没有生成真实 id");
assertHistory(history, "namebase", [
  {kind: "derived-system", id: "namebase-import"},
  {kind: "namebase", id: importedId}
], "名称库导入历史");

const clearCommand = createClearUserNamebasesCommand();
assertAffected(clearCommand.effects.affected, [
  {kind: "derived-system", id: "namebase-clear"},
  {kind: "namebase", id: "all"}
], "名称库清空初始目标");
history.execute(clearCommand, {map});
assertHistory(history, "namebase", [
  {kind: "derived-system", id: "namebase-clear"},
  {kind: "namebase", id: createdId},
  {kind: "namebase", id: importedId}
], "名称库清空历史");

const diplomacyAffected = diplomacyRegenerationAffected({pack: {states: [
  {i: 0, name: "中立"},
  {i: 1, name: "甲"},
  {i: 2, name: "已移除", removed: true},
  {i: 3, name: "乙"}
]}});
assertAffected(diplomacyAffected, [
  {kind: "derived-system", id: "diplomacy-regeneration"},
  {kind: "state", id: 1},
  {kind: "state", id: 3}
], "外交重生成目标");

const diplomacyMap = createDiplomacyMap();
const diplomacyHistory = new EditHistory();
const relationCommand = createSetDiplomacyRelationCommand(1, 2, "Friendly");
diplomacyHistory.execute(relationCommand, {map: diplomacyMap});
assertDiplomacyMirrors(diplomacyMap, "Friendly", "外交关系执行");
diplomacyHistory.undo({map: diplomacyMap});
assertDiplomacyMirrors(diplomacyMap, "Suspicion", "外交关系撤销");
diplomacyHistory.redo({map: diplomacyMap});
assertDiplomacyMirrors(diplomacyMap, "Friendly", "外交关系重做");

const heightCommand = createApplyHeightBrushCommand([{gridCell: 0, before: 10, after: 24}]);
history.execute(heightCommand, {map});
assert(map.grid.cells.h[0] === 24 && map.pack.cells.h[0] === 24, "高度笔刷没有同步 grid / pack 高度");
assertHistory(history, "height", [
  {kind: "derived-system", id: "height-brush"},
  {kind: "grid-cells", id: 1}
], "高度笔刷历史");
history.undo({map});
assert(map.grid.cells.h[0] === 10 && map.pack.cells.h[0] === 10, "撤销高度笔刷没有恢复 grid / pack 高度");

console.log(JSON.stringify({
  ok: true,
  createdId,
  importedId,
  createAffected: createCommand.effects.affected,
  importAffected: importCommand.effects.affected,
  bindingAffected: bindingCommand.effects.affected,
  clearAffected: clearCommand.effects.affected,
  diplomacyAffected,
  diplomacyMirrorRelation: diplomacyMap.politics.states[1].diplomacy[2],
  heightDomain: heightCommand.domain,
  heightAffected: heightCommand.effects.affected
}, null, 2));

function createSyntheticMap() {
  return {
    metadata: {},
    namebases: {version: 1, bases: [], bindings: {}, metadata: {bases: 0}},
    grid: {cells: {h: Uint8Array.from([10, 20])}},
    pack: {cells: {g: Uint32Array.from([0, 1]), h: Uint8Array.from([10, 20])}}
  };
}

function createDiplomacyMap() {
  const packStates = [
    {i: 0, name: "中立", diplomacy: []},
    {i: 1, name: "甲", diplomacy: ["x", "x", "Suspicion"], diplomacySummary: {Suspicion: 1}, campaigns: []},
    {i: 2, name: "乙", diplomacy: ["x", "Suspicion", "x"], diplomacySummary: {Suspicion: 1}, campaigns: []}
  ];
  return {
    pack: {states: packStates, diplomacy: {chronicle: [], metadata: {buildMs: 0}}},
    politics: {states: JSON.parse(JSON.stringify(packStates))},
    diplomacy: null
  };
}

function assertDiplomacyMirrors(map, relation, label) {
  assert(map.pack.states[1].diplomacy[2] === relation, `${label} pack 关系异常`);
  assert(map.politics.states[1].diplomacy[2] === relation, `${label} politics 关系异常`);
  assert(map.pack.states[2].diplomacy[1] === relation, `${label} pack 反向关系异常`);
  assert(map.politics.states[2].diplomacy[1] === relation, `${label} politics 反向关系异常`);
}

function assertHistory(history, domain, affected, label) {
  const stats = history.getStats();
  assert(stats.lastDomain === domain, `${label} domain 异常：${stats.lastDomain}`);
  assertAffected(stats.lastAffected, affected, label);
}

function assertAffected(actual, expected, label) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label} affected 异常：${JSON.stringify(actual)}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
