#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {createAddStateAtCellCommand, createApplyStateBrushCommand, inspectStateCreation} from "../app/webgl-generator/src/runtime/state-edit-commands.js";

const map = generatePlaceholderMap({seed: "state-lifecycle-regression", cellsTarget: 3000, heightmapTemplate: "continents"});
const history = new EditHistory();
const protectedSample = findProtectedProvinceSample(map);
const beforeRejected = snapshotStateCollections(map);

for (const gridCell of [protectedSample.capitalGridCell, protectedSample.otherGridCell]) {
  const inspection = inspectStateCreation(map, gridCell);
  assert.equal(inspection.valid, false);
  assert.equal(inspection.code, "capital-province-protected");
  assert.equal(inspection.provinceId, protectedSample.provinceId);
  assert.equal(inspection.protectedStateId, protectedSample.stateId);
  const command = createAddStateAtCellCommand(gridCell);
  assert.equal(command.isNoop({map}), true);
  assert.match(command.getInspection().summary, /首都所在的省份/u);
  assert.throws(() => command.apply({map}), /首都所在的省份/u, "直接 apply 也必须重新拒绝首都省份");
}

assert.deepEqual(snapshotStateCollections(map), beforeRejected, "拒绝路径不能修改国家、省份、城市或 cell 归属");
assert.equal(history.getStats().undo, 0, "拒绝路径不能写入编辑历史");

const allowedGridCell = findAllowedGridCell(map);
const allowedInspection = inspectStateCreation(map, allowedGridCell);
assert.equal(allowedInspection.valid, true);
const beforeAllowed = snapshotStateCollections(map);
const addCommand = createAddStateAtCellCommand(allowedGridCell);
assert.equal(addCommand.isNoop({map}), false);
history.execute(addCommand, {map});
const created = addCommand.getResult();
assert.ok(map.politics.states[created.stateId], "允许区域必须仍可创建国家");
assert.equal(history.getStats().undo, 1);
history.undo({map});
assert.deepEqual(snapshotStateCollections(map), beforeAllowed, "撤销必须完整恢复允许创建前的状态");
history.redo({map});
assert.ok(map.politics.states[created.stateId], "重做必须恢复新建国家");

const brushHistory = new EditHistory();
const expansionGridCell = findExpansionGridCell(map, created.stateId);
const expansionBefore = Number(map.grid.cells.state[expansionGridCell] || 0);
const expansionPackCells = packCellsForGrid(map, expansionGridCell);
const stateCellsBefore = Number(map.politics.states[created.stateId].cells || 0);
const brushCommand = createApplyStateBrushCommand([{gridCell: expansionGridCell, before: expansionBefore, after: created.stateId}], {label: "回归：新国家扩张"});
brushHistory.execute(brushCommand, {map});
assert.equal(map.grid.cells.state[expansionGridCell], created.stateId, "新国家必须能取得 grid cell 归属");
assert.ok(expansionPackCells.every(packCell => map.pack.cells.state[packCell] === created.stateId), "新国家必须同步取得 pack cells 归属");
assert.ok(map.politics.states[created.stateId].cells > stateCellsBefore, "国家统计必须在扩张后增加");
assert.equal(brushHistory.getStats().undo, 1, "一次笔刷扩张只写入一条历史");
brushHistory.undo({map});
assert.equal(map.grid.cells.state[expansionGridCell], expansionBefore, "撤销必须恢复 grid 归属");
assert.ok(expansionPackCells.every(packCell => map.pack.cells.state[packCell] === expansionBefore), "撤销必须恢复 pack 归属");
brushHistory.redo({map});
assert.equal(map.grid.cells.state[expansionGridCell], created.stateId, "重做必须恢复新国家扩张");

const appSource = readFileSync(resolve("app/webgl-generator/src/runtime/app.js"), "utf8");
assert.equal((appSource.match(/getInspection\?\.\(\)\?\.summary/g) || []).length, 2, "画布与 API 新增必须共用命令预检提示");
const stateBinding = appSource.slice(appSource.indexOf("function bindStateEditing"), appSource.indexOf("function bindProvinceEditing"));
const pointerUpMarker = 'addEventListener("pointerup"';
const pointerCancelMarker = 'addEventListener("pointercancel"';
const pointerUpBlock = stateBinding.slice(stateBinding.indexOf(pointerUpMarker), stateBinding.indexOf(pointerCancelMarker));
const pointerCancelBlock = stateBinding.slice(stateBinding.indexOf(pointerCancelMarker));
assert.match(pointerUpBlock, /finishStateStroke\(state, documentRef\)/, "国家笔刷正常松手必须提交命令");
assert.doesNotMatch(pointerUpBlock, /rollbackCanvasToolStroke\(state, "state"\)/, "国家笔刷正常松手不能回滚");
assert.match(pointerCancelBlock, /rollbackCanvasToolStroke\(state, "state"\)/, "国家笔刷取消事件必须回滚预览");
assert.doesNotMatch(pointerCancelBlock, /finishStateStroke\(state, documentRef\)/, "国家笔刷取消事件不能提交命令");
assert.match(stateBinding, /setTargetStateId\(result\.stateId\)[\s\S]*setSelection\(\{object: stateObject\}\)/, "新建国家必须继续成为面板目标和地图选择对象");

console.log(JSON.stringify({
  ok: true,
  protected: protectedSample,
  allowed: {gridCell: allowedGridCell, provinceId: allowedInspection.provinceId},
  created,
  expansion: {gridCell: expansionGridCell, packCells: expansionPackCells, before: expansionBefore, after: created.stateId},
  history: history.getStats(),
  brushHistory: brushHistory.getStats()
}, null, 2));

function findProtectedProvinceSample(targetMap) {
  for (const state of targetMap.politics.states || []) {
    const stateId = Number(state?.i ?? state?.id);
    if (!state || state.removed || !stateId) continue;
    const city = (targetMap.settlements.cities || []).find(item => item?.burgId === state.capital);
    const provinceId = Number(city?.province || targetMap.pack.burgs?.[state.capital]?.province || 0);
    if (!provinceId) continue;
    const cells = Array.from(targetMap.grid.cells.i).filter(gridCell => targetMap.grid.cells.h[gridCell] >= 20 && Number(targetMap.grid.cells.province?.[gridCell]) === provinceId);
    const capitalGridCell = Number(city?.cell ?? state.gridCenter);
    const otherGridCell = cells.find(gridCell => gridCell !== capitalGridCell);
    if (cells.includes(capitalGridCell) && Number.isInteger(otherGridCell)) return {stateId, provinceId, capitalGridCell, otherGridCell};
  }
  throw new Error("固定地图找不到含两个陆地 cells 的首都省份");
}

function findAllowedGridCell(targetMap) {
  for (const gridCell of targetMap.grid.cells.i) {
    if (inspectStateCreation(targetMap, gridCell).valid) return gridCell;
  }
  throw new Error("固定地图找不到允许创建国家的陆地 cell");
}

function findExpansionGridCell(targetMap, stateId) {
  const owned = Array.from(targetMap.grid.cells.i).filter(gridCell => Number(targetMap.grid.cells.state[gridCell]) === stateId);
  for (const gridCell of owned) {
    for (const neighbor of targetMap.grid.cells.c?.[gridCell] || []) {
      if (targetMap.grid.cells.h[neighbor] < 20 || Number(targetMap.grid.cells.state[neighbor]) === stateId) continue;
      if (packCellsForGrid(targetMap, neighbor).length) return neighbor;
    }
  }
  for (const gridCell of targetMap.grid.cells.i) {
    if (targetMap.grid.cells.h[gridCell] >= 20 && Number(targetMap.grid.cells.state[gridCell]) !== stateId && packCellsForGrid(targetMap, gridCell).length) return gridCell;
  }
  throw new Error("固定地图找不到可供新国家扩张的陆地 cell");
}

function packCellsForGrid(targetMap, gridCell) {
  const cells = [];
  for (const packCell of targetMap.pack.cells.i) {
    if (targetMap.pack.cells.h[packCell] >= 20 && Number(targetMap.pack.cells.g?.[packCell]) === gridCell) cells.push(packCell);
  }
  return cells;
}

function snapshotStateCollections(targetMap) {
  return clone({
    states: targetMap.politics.states,
    packStates: targetMap.pack.states,
    provinces: targetMap.politics.provinces,
    packProvinces: targetMap.pack.provinces,
    gridState: targetMap.grid.cells.state,
    gridProvince: targetMap.grid.cells.province,
    packState: targetMap.pack.cells.state,
    packProvince: targetMap.pack.cells.province,
    burgs: targetMap.pack.burgs,
    cities: targetMap.settlements.cities,
    stale: targetMap.metadata.derivedStale
  });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
