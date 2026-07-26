#!/usr/bin/env node
import assert from "node:assert/strict";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {getCellAction, inspectCellAction, listCellActions} from "../app/webgl-generator/src/runtime/cell-action-inspector-registry.js";
import {issueCellInspectionToken, validateCellInspectionToken} from "../app/webgl-generator/src/runtime/cell-inspection-token.js";
import {createAddStateAtCellCommand, inspectStateCreation} from "../app/webgl-generator/src/runtime/state-edit-commands.js";
import {createAddProvinceAtCellCommand, inspectProvinceCreation} from "../app/webgl-generator/src/runtime/province-edit-commands.js";
import {createAddCityAtCellCommand, inspectCityCreation} from "../app/webgl-generator/src/runtime/city-edit-commands.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {MapRevisionTracker} from "../app/webgl-generator/src/runtime/map-revision.js";

const sourceMap = generatePlaceholderMap({
  cellsTarget: 2400,
  seed: "cell-action-registry-regression",
  graphWidth: 1000,
  graphHeight: 600
});
const actions = listCellActions();
assert.equal(actions.length, 34, "Cell action registry 没有覆盖 34 / 34 planned-registry");
assert.equal(new Set(actions.map(item => item.actionId)).size, 34, "Cell action registry 存在重复 actionId");
assert(actions.every(item => item.inspectTarget && item.executeTarget && item.inputSpace), "registry 存在空目标或输入空间");
assert(actions.every(item => item.semanticLayer === "editor-primitive" && item.compoundRulesCovered === false), "registry 错误声称覆盖复合规则");
assert.equal(getCellAction("unknown.action"), null, "未知 actionId 不应返回登记项");

const revision = new MapRevisionTracker({identityFactory: () => "cell-action-map"});
revision.replaceMap();
const unknown = inspectCellAction(sourceMap, revision, "unknown.action", {});
assert.deepEqual({allowed: unknown.allowed, code: unknown.code}, {allowed: false, code: "action-not-inspectable"}, "未知动作没有稳定拒绝");
for (const action of actions) {
  const empty = inspectCellAction(sourceMap, revision, action.actionId, {});
  assert.equal(empty.allowed, false, `${action.actionId} 错误允许空输入`);
  assert.equal(empty.code, "invalid-input", `${action.actionId} 空输入没有稳定拒绝 code`);
}
const structural = inspectCellAction(sourceMap, revision, "markers.createAtCell", {
  cell: {space: "pack", id: 0},
  name: "测试标记"
});
assert.equal(structural.allowed, true, "合法 Pack CellRef 没有通过结构预检");
assert.equal(structural.inspectionLevel, "spatial-input", "无领域 inspector 的动作没有标为结构预检");
assert(structural.inspectionToken, "结构预检没有签发 inspection token");
const invalidRef = inspectCellAction(sourceMap, revision, "markers.createAtCell", {
  cell: {space: "pack", id: Number.MAX_SAFE_INTEGER}
});
assert.deepEqual({allowed: invalidRef.allowed, code: invalidRef.code}, {allowed: false, code: "cell-not-found"}, "越界 Pack CellRef 没有稳定拒绝");

const normalizedInput = {cell: {space: "grid", id: 1}};
const issued = issueCellInspectionToken(revision, "states.createAtCell", normalizedInput);
assert.equal(validateCellInspectionToken(revision, issued.inspectionToken, "states.createAtCell", normalizedInput, issued.expectedRevision).valid, true, "合法 inspection token 没有通过");
assert.equal(validateCellInspectionToken(revision, issued.inspectionToken, "cities.createAtCell", normalizedInput, issued.expectedRevision).code, "inspection-token-mismatch", "token 错误跨 action 复用");
revision.advance();
assert.equal(validateCellInspectionToken(revision, issued.inspectionToken, "states.createAtCell", normalizedInput, issued.expectedRevision).code, "inspection-stale", "revision 变化没有使 token 失效");

const cases = [
  {
    domain: "states",
    inspect: inspectStateCreation,
    command: createAddStateAtCellCommand
  },
  {
    domain: "provinces",
    inspect: inspectProvinceCreation,
    command: createAddProvinceAtCellCommand
  },
  {
    domain: "cities",
    inspect: inspectCityCreation,
    command: createAddCityAtCellCommand
  }
];
const results = [];
for (const item of cases) {
  const probeMap = structuredClone(sourceMap);
  const gridCell = Array.from(probeMap.grid.cells.i).find(cell => item.inspect(probeMap, cell).valid);
  assert(Number.isInteger(gridCell), `${item.domain} 固定图找不到合法 createAtCell`);
  const map = structuredClone(sourceMap);
  const beforeInspection = JSON.stringify(map);
  const beforeInspectionKeys = Reflect.ownKeys(map).sort();
  const inspection = item.inspect(map, gridCell);
  assert.equal(inspection.allowed, true, `${item.domain} inspector 没有允许合法 cell`);
  assert.equal(JSON.stringify(map), beforeInspection, `${item.domain} inspector 修改了地图`);
  assert.deepEqual(Reflect.ownKeys(map).sort(), beforeInspectionKeys, `${item.domain} inspector 添加了运行时缓存`);

  const tracker = new MapRevisionTracker({identityFactory: () => `${item.domain}-map`});
  tracker.replaceMap();
  const history = new EditHistory({onMutation: () => tracker.advance()});
  const context = {map};
  const command = item.command(gridCell);
  history.execute(command, context);
  assert.equal(tracker.getSnapshot().mapRevision, 1, `${item.domain} 成功创建没有令 revision 恰好 +1`);
  assert.equal(history.getStats().undo, 1, `${item.domain} 成功创建没有只写一条历史`);

  const faultMap = structuredClone(sourceMap);
  const faultCell = Array.from(faultMap.grid.cells.i).find(cell => item.inspect(faultMap, cell).valid);
  const faultBefore = JSON.stringify(captureCreationState(faultMap));
  const faultTracker = new MapRevisionTracker({identityFactory: () => `${item.domain}-fault-map`});
  faultTracker.replaceMap();
  const faultHistory = new EditHistory({onMutation: () => faultTracker.advance()});
  assert.throws(
    () => faultHistory.execute(item.command(faultCell, {
      faultInjector: () => { throw new Error(`${item.domain}-fault`); }
    }), {map: faultMap}),
    new RegExp(`${item.domain}-fault`),
    `${item.domain} 注入异常没有抛出`
  );
  assert.equal(JSON.stringify(captureCreationState(faultMap)), faultBefore, `${item.domain} 注入异常没有完整恢复快照`);
  assert.equal(faultTracker.getSnapshot().mapRevision, 0, `${item.domain} 注入异常错误递增 revision`);
  assert.equal(faultHistory.getStats().undo, 0, `${item.domain} 注入异常错误写入历史`);
  results.push({domain: item.domain, gridCell, code: inspection.code});
}

function captureCreationState(map) {
  return {
    politics: {
      states: map.politics?.states,
      provinces: map.politics?.provinces,
      metadata: map.politics?.metadata
    },
    pack: {
      states: map.pack?.states,
      provinces: map.pack?.provinces,
      burgs: map.pack?.burgs,
      state: Array.from(map.pack?.cells?.state || []),
      province: Array.from(map.pack?.cells?.province || []),
      burg: Array.from(map.pack?.cells?.burg || [])
    },
    grid: {
      state: Array.from(map.grid?.cells?.state || []),
      province: Array.from(map.grid?.cells?.province || []),
      burg: Array.from(map.grid?.cells?.burg || [])
    },
    settlements: {
      cities: map.settlements?.cities,
      metadata: map.settlements?.metadata
    },
    derivedStale: map.metadata?.derivedStale || null
  };
}

console.log(JSON.stringify({
  ok: true,
  registry: {
    actions: actions.length,
    unique: new Set(actions.map(item => item.actionId)).size,
    compoundRulesCovered: 0
  },
  token: {
    actionBound: true,
    revisionBound: true
  },
  creation: results
}, null, 2));
