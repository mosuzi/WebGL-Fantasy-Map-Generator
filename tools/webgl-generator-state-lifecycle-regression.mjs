#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {createMapDocument, createMapFeatureGeoJson} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {resolveObject} from "../app/webgl-generator/src/runtime/object-resolver.js";
import {createAddStateAtCellCommand, createApplyStateBrushCommand, createDeleteStateCommand, inspectStateCreation} from "../app/webgl-generator/src/runtime/state-edit-commands.js";

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

const inconsistentLegacyMap = generatePlaceholderMap({seed: "state-lifecycle-inconsistent-land", cellsTarget: 3000, heightmapTemplate: "continents"});
const inconsistentGridCell = findAllowedGridCell(inconsistentLegacyMap);
const inconsistentFeature = inconsistentLegacyMap.features.features[inconsistentLegacyMap.grid.cells.f[inconsistentGridCell]];
assert.equal(inconsistentFeature?.land, true, "旧图兼容样本必须由 feature 明确标记为陆地");
inconsistentLegacyMap.grid.cells.h[inconsistentGridCell] = 19;
for (const packCell of packCellsForGrid(inconsistentLegacyMap, inconsistentGridCell)) inconsistentLegacyMap.pack.cells.h[packCell] = 19;
const inconsistentInspection = inspectStateCreation(inconsistentLegacyMap, inconsistentGridCell);
assert.equal(inconsistentInspection.valid, true, "可视 feature 为陆地时不能因旧高度值低于海平面而拒绝创建国家");
const inconsistentHistory = new EditHistory();
const inconsistentCommand = createAddStateAtCellCommand(inconsistentGridCell);
inconsistentHistory.execute(inconsistentCommand, {map: inconsistentLegacyMap});
const inconsistentCreated = inconsistentCommand.getResult();
assert.ok(inconsistentLegacyMap.politics.states[inconsistentCreated.stateId], "高度与 feature 不一致的旧图必须仍可创建国家");
inconsistentHistory.undo({map: inconsistentLegacyMap});
assert.equal(inconsistentLegacyMap.politics.states[inconsistentCreated.stateId], undefined, "旧图兼容创建仍必须完整支持撤销");

const sparseLegacyMap = generatePlaceholderMap({seed: "state-lifecycle-sparse-legacy", cellsTarget: 3000, heightmapTemplate: "continents"});
const sparseAllowedGridCell = findAllowedGridCell(sparseLegacyMap);
const sparseStateTombstone = {i: 4009, id: 4009, name: "旧国家墓碑", removed: true};
const sparseProvinceTombstone = {i: 70000, id: 70000, name: "旧省份墓碑", removed: true};
sparseLegacyMap.politics.states[4009] = sparseStateTombstone;
sparseLegacyMap.pack.states[4009] = sparseLegacyMap.pack.states === sparseLegacyMap.politics.states ? sparseStateTombstone : {...sparseStateTombstone};
sparseLegacyMap.politics.provinces[70000] = sparseProvinceTombstone;
sparseLegacyMap.pack.provinces[70000] = sparseLegacyMap.pack.provinces === sparseLegacyMap.politics.provinces ? sparseProvinceTombstone : {...sparseProvinceTombstone};
sparseLegacyMap.grid.cells.state = Uint8Array.from(sparseLegacyMap.grid.cells.state);
sparseLegacyMap.pack.cells.state = Uint8Array.from(sparseLegacyMap.pack.cells.state);
sparseLegacyMap.grid.cells.province = Uint16Array.from(sparseLegacyMap.grid.cells.province);
sparseLegacyMap.pack.cells.province = Uint16Array.from(sparseLegacyMap.pack.cells.province);
sparseLegacyMap.__stateEditorPackCellsByGrid = {};
const sparseHistory = new EditHistory();
const sparseCommand = createAddStateAtCellCommand(sparseAllowedGridCell);
sparseHistory.execute(sparseCommand, {map: sparseLegacyMap});
const sparseCreated = sparseCommand.getResult();
assert.ok(sparseLegacyMap.__stateEditorPackCellsByGrid instanceof Map, "旧存档中的普通对象缓存必须自动重建为 Map");
assert.equal(Object.prototype.propertyIsEnumerable.call(sparseLegacyMap, "__stateEditorPackCellsByGrid"), false, "重建的运行时缓存不能再次进入存档");
assert.equal(sparseCreated.stateId, 4010, "稀疏旧图必须沿用现有最大国家 ID");
assert.equal(sparseCreated.provinceId, 70001, "稀疏旧图必须沿用现有最大省份 ID");
assert.ok(sparseLegacyMap.grid.cells.state instanceof Uint16Array, "国家 ID 超过 Uint8 后必须扩容 grid 归属数组");
assert.ok(sparseLegacyMap.pack.cells.state instanceof Uint16Array, "国家 ID 超过 Uint8 后必须扩容 pack 归属数组");
assert.ok(sparseLegacyMap.grid.cells.province instanceof Uint32Array, "省份 ID 超过 Uint16 后必须扩容 grid 归属数组");
assert.ok(sparseLegacyMap.pack.cells.province instanceof Uint32Array, "省份 ID 超过 Uint16 后必须扩容 pack 归属数组");
assert.equal(sparseLegacyMap.grid.cells.state[sparseAllowedGridCell], sparseCreated.stateId, "扩容后 grid 国家归属不能截断高 ID");
assert.ok(packCellsForGrid(sparseLegacyMap, sparseAllowedGridCell).every(packCell => sparseLegacyMap.pack.cells.state[packCell] === sparseCreated.stateId), "扩容后 pack 国家归属不能截断高 ID");
sparseHistory.undo({map: sparseLegacyMap});
assert.ok(sparseLegacyMap.grid.cells.state instanceof Uint8Array, "稀疏旧图撤销必须恢复原 grid 国家数组类型");
assert.ok(sparseLegacyMap.pack.cells.state instanceof Uint8Array, "稀疏旧图撤销必须恢复原 pack 国家数组类型");
assert.ok(sparseLegacyMap.grid.cells.province instanceof Uint16Array, "稀疏旧图撤销必须恢复原 grid 省份数组类型");
assert.ok(sparseLegacyMap.pack.cells.province instanceof Uint16Array, "稀疏旧图撤销必须恢复原 pack 省份数组类型");
sparseHistory.redo({map: sparseLegacyMap});
assert.equal(sparseLegacyMap.grid.cells.state[sparseAllowedGridCell], sparseCreated.stateId, "稀疏旧图重做必须再次写入完整国家 ID");

const faultMap = generatePlaceholderMap({seed: "state-lifecycle-fault-rollback", cellsTarget: 3000, heightmapTemplate: "continents"});
const faultGridCell = findAllowedGridCell(faultMap);
const frozenStates = Object.freeze([...faultMap.politics.states]);
faultMap.politics.states = frozenStates;
faultMap.pack.states = frozenStates;
const beforeFault = snapshotStateCollections(faultMap);
const faultCommand = createAddStateAtCellCommand(faultGridCell);
assert.throws(() => faultCommand.apply({map: faultMap}), TypeError, "国家档案写入失败必须向上报告");
assert.deepEqual(snapshotStateCollections(faultMap), beforeFault, "国家创建任一阶段失败都必须恢复国家、省份、城市和 cell 快照");

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

const deleteHistory = new EditHistory();
const beforeDelete = snapshotStateCollections(map);
const deletedProvinceIds = (map.politics.provinces || []).filter(province => province && Number(province.state) === created.stateId).map(province => Number(province.i ?? province.id));
const deleteCommand = createDeleteStateCommand(created.stateId);
deleteHistory.execute(deleteCommand, {map});
assert.equal(map.politics.states[created.stateId], null, "删除后 politics 国家档案槽位必须为空");
assert.equal(map.pack.states[created.stateId], null, "删除后 pack 国家档案槽位必须为空");
assert.ok(Array.from(map.grid.cells.state).every(stateId => Number(stateId) !== created.stateId), "grid cells 不能残留已删除国家");
assert.ok(Array.from(map.pack.cells.state).every(stateId => Number(stateId) !== created.stateId), "pack cells 不能残留已删除国家");
assert.ok((map.settlements.cities || []).every(city => !city || Number(city.state) !== created.stateId), "城市不能残留已删除国家归属");
assert.ok(deletedProvinceIds.every(provinceId => map.politics.provinces[provinceId]?.removed), "原国家省份档案必须标记移除");
assert.equal(resolveObject(map, {kind: "state", id: created.stateId}), null, "对象解析器不能再解析已删除国家");
const stateGeoJson = createMapFeatureGeoJson(map, {layers: {state: true, city: false, route: false, river: false, marker: false, zone: false}});
assert.ok(stateGeoJson.features.every(feature => feature.properties.numericId !== created.stateId), "要素导出不能包含已删除国家");
const mapDocument = createMapDocument(map, map.options);
assert.equal(mapDocument.map.politics.states[created.stateId], null, "完整地图导出不能保留国家档案");
assert.equal(mapDocument.map.pack.states[created.stateId], null, "完整地图 pack 导出不能保留国家档案");
assert.equal(deleteHistory.getStats().undo, 1, "删除国家只写入一条历史");
deleteHistory.undo({map});
assert.deepEqual(snapshotStateCollections(map), beforeDelete, "撤销必须完整恢复国家档案和关联数据");
deleteHistory.redo({map});
assert.equal(map.politics.states[created.stateId], null, "重做必须再次移除国家档案");
assert.equal(map.pack.states[created.stateId], null, "重做必须再次移除 pack 国家档案");

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
const statePanelBridgeSource = readFileSync(resolve("app/webgl-generator/src/ui/panels/state-panel.js"), "utf8");
const statePanelVueSource = readFileSync(resolve("app/webgl-generator/src/ui/vue/components/StatePanel.vue"), "utf8");
assert.match(statePanelBridgeSource, /!state\.removed/, "国家面板桥接列表必须兼容过滤旧 removed 档案");
assert.match(statePanelVueSource, /!stateItem\.removed/, "国家 Vue 列表必须兼容过滤旧 removed 档案");

console.log(JSON.stringify({
  ok: true,
  protected: protectedSample,
  allowed: {gridCell: allowedGridCell, provinceId: allowedInspection.provinceId},
  created,
  inconsistentLegacy: {
    gridCell: inconsistentGridCell,
    created: inconsistentCreated,
    history: inconsistentHistory.getStats()
  },
  sparseLegacy: {
    created: sparseCreated,
    stateType: sparseLegacyMap.grid.cells.state.constructor.name,
    provinceType: sparseLegacyMap.grid.cells.province.constructor.name,
    history: sparseHistory.getStats()
  },
  faultRollback: true,
  expansion: {gridCell: expansionGridCell, packCells: expansionPackCells, before: expansionBefore, after: created.stateId},
  deleted: {stateId: created.stateId, provinceIds: deletedProvinceIds},
  history: history.getStats(),
  brushHistory: brushHistory.getStats(),
  deleteHistory: deleteHistory.getStats()
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
