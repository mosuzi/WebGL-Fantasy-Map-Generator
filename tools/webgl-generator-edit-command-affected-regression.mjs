#!/usr/bin/env node
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {createApplyHeightBrushCommand} from "../app/webgl-generator/src/runtime/height-edit-commands.js";
import {
  createClearUserNamebasesCommand,
  createCreateUserNamebaseCommand,
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

const clearCommand = createClearUserNamebasesCommand();
assertAffected(clearCommand.effects.affected, [
  {kind: "derived-system", id: "namebase-clear"},
  {kind: "namebase", id: "all"}
], "名称库清空目标");

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
  createAffected: createCommand.effects.affected,
  bindingAffected: bindingCommand.effects.affected,
  clearAffected: clearCommand.effects.affected,
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
