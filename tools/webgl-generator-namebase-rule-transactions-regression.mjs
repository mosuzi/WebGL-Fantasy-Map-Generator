import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

import {API_METHODS, CONFIRM_REQUIRED_METHODS} from "../app/webgl-generator/src/runtime/api-contract.js";
import {buildApiMethodDescriptionRegistry} from "../app/webgl-generator/src/runtime/api-schema-registry.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {
  createBindNamebaseAndRenameCommand,
  createReplaceOrRemoveNamebaseCommand,
  inspectBindNamebaseAndRename,
  inspectNamebaseRuleTransaction,
  inspectReplaceOrRemoveNamebase,
  NAMEBASE_RULE_ACTION
} from "../app/webgl-generator/src/runtime/namebase-rule-transactions.js";

const bindMap = createFixture();
const bindBefore = snapshot(bindMap);
const bindRequest = {
  scope: "culture",
  cultureId: 1,
  target: "place",
  baseId: "user-place",
  rename: {kind: "city", ids: [1, 2]}
};
const bindInspectBefore = snapshot(bindMap);
const bindInspection = inspectBindNamebaseAndRename(bindMap, bindRequest);
assert.equal(bindInspection.allowed, true);
assert.equal(bindInspection.requiresConfirm, true);
assert.equal(snapshot(bindMap), bindInspectBefore, "绑定事务预检不得修改地图");

const bindHistory = new EditHistory();
const bindCommand = createBindNamebaseAndRenameCommand(bindRequest);
bindHistory.execute(bindCommand, {map: bindMap});
assert.equal(bindMap.namebases.bindings.cultures["1"].place, "user-place", "绑定必须先写入指定文化");
assert.notEqual(bindMap.settlements.cities[1].name, "旧城甲", "城市必须在新绑定下重命名");
assert.notEqual(bindMap.settlements.cities[2].name, "旧城乙", "批量城市必须全部重命名");
assert.notEqual(bindMap.settlements.cities[1].name, bindMap.settlements.cities[2].name, "同批名称必须保持唯一");
assert.equal(bindHistory.getStats().undo, 1, "绑定并重命名只能形成一条历史");
const boundSnapshot = snapshot(bindMap);
bindHistory.undo({map: bindMap});
assert.equal(snapshot(bindMap), bindBefore, "一次撤销必须恢复绑定与全部名称");
bindHistory.redo({map: bindMap});
assert.equal(snapshot(bindMap), boundSnapshot, "重做必须恢复同一绑定与同一批名称");
const repeatedInspection = inspectBindNamebaseAndRename(bindMap, bindRequest);
assert.equal(repeatedInspection.allowed, false);
assert.equal(repeatedInspection.code, "rename-unchanged", "相同绑定且名称无变化必须稳定判定 no-op");

const unbindMap = createFixture({placeBinding: "user-place"});
const unbindHistory = new EditHistory();
const unbindInspection = inspectBindNamebaseAndRename(unbindMap, {
  scope: "global",
  target: "place",
  baseId: ""
});
assert.equal(unbindInspection.allowed, true, "空 baseId 必须允许解除显式绑定");
unbindHistory.execute(createBindNamebaseAndRenameCommand(unbindInspection.normalizedInput), {map: unbindMap});
assert.equal(unbindMap.namebases.bindings.global.place, "", "解除绑定后必须回退内置策略");
unbindHistory.undo({map: unbindMap});
assert.equal(unbindMap.namebases.bindings.global.place, "user-place", "解除绑定必须可撤销");

const zeroIdMap = createFixture();
zeroIdMap.settlements.cities[0] = {
  id: 0,
  burgId: 0,
  name: "零号城",
  culture: 1,
  state: 1,
  province: 1,
  population: 6
};
zeroIdMap.pack.burgs[0] = {
  i: 0,
  id: 0,
  cityId: 0,
  name: "零号城",
  culture: 1,
  state: 1,
  province: 1
};
const zeroIdRequest = {
  scope: "global",
  target: "place",
  baseId: "user-place",
  rename: {kind: "city", ids: [0]}
};
const zeroIdInspection = inspectBindNamebaseAndRename(zeroIdMap, zeroIdRequest);
assert.equal(zeroIdInspection.allowed, true, "城市零号 ID 必须可通过规则事务预检");
new EditHistory().execute(createBindNamebaseAndRenameCommand(zeroIdRequest), {map: zeroIdMap});
assert.notEqual(zeroIdMap.settlements.cities[0].name, "零号城", "城市零号 ID 必须可执行重命名");

const mismatch = inspectBindNamebaseAndRename(createFixture(), {
  scope: "global",
  target: "hydro",
  baseId: "user-place",
  rename: {kind: "city", ids: [1]}
});
assert.equal(mismatch.allowed, false);
assert.equal(mismatch.code, "target-kind-mismatch");
assert.equal(inspectBindNamebaseAndRename(createFixture(), {
  scope: "global",
  target: "place",
  baseId: "missing"
}).code, "namebase-not-found");
assert.equal(inspectBindNamebaseAndRename(createFixture({placeBinding: "user-place"}), {
  scope: "global",
  target: "place",
  baseId: "user-place"
}).code, "binding-unchanged");

const deleteMap = createFixture({
  placeBinding: "user-place",
  cultureStateBinding: "user-place",
  cultureCultureBinding: "user-place",
  cultureReligionBinding: "user-place"
});
const deleteBefore = snapshot(deleteMap);
const deleteRequest = {operation: "delete", baseId: "user-place", replacementBaseId: ""};
const deleteInspection = inspectNamebaseRuleTransaction(deleteMap, NAMEBASE_RULE_ACTION.REPLACE_OR_REMOVE, deleteRequest);
assert.equal(deleteInspection.allowed, true);
assert.equal(deleteInspection.requiresConfirm, true);
assert.equal(deleteInspection.details.migrations.length, 4);
const deleteHistory = new EditHistory();
const deleteCommand = createReplaceOrRemoveNamebaseCommand(deleteRequest);
deleteHistory.execute(deleteCommand, {map: deleteMap});
assert.equal(deleteMap.namebases.bases.some(base => base.id === "user-place"), false);
assert.equal(deleteMap.namebases.bindings.global.place, "");
assert.equal(deleteMap.namebases.bindings.cultures["1"].stateRoot, "");
assert.equal(deleteMap.namebases.bindings.cultures["1"].culture, "");
assert.equal(deleteMap.namebases.bindings.cultures["1"].religion, "");
assertNoDanglingBindings(deleteMap);
assert.equal(deleteHistory.getStats().undo, 1, "移除与绑定迁移只能形成一条历史");
const deleteAfter = snapshot(deleteMap);
deleteHistory.undo({map: deleteMap});
assert.equal(snapshot(deleteMap), deleteBefore, "一次撤销必须恢复名称库及其绑定");
deleteHistory.redo({map: deleteMap});
assert.equal(snapshot(deleteMap), deleteAfter, "重做必须复现名称库移除与迁移");

const replaceMap = createFixture({placeBinding: "user-place"});
const replaceDocument = {
  type: "webgl-generator-namebases",
  version: 1,
  bases: [{id: "incoming", name: "新导入库", kind: "place", source: ["青岚", "白沙", "赤川"]}]
};
const replaceCommand = createReplaceOrRemoveNamebaseCommand({
  operation: "replace",
  replacementBaseId: "place-stems",
  document: replaceDocument,
  filename: "replace.json"
});
const replaceHistory = new EditHistory();
replaceHistory.execute(replaceCommand, {map: replaceMap});
assert.equal(replaceMap.namebases.bases.length, 1, "替换事务应只保留新导入用户库");
assert.equal(replaceMap.namebases.bindings.global.place, "place-stems", "替换前必须迁移旧库绑定");
assertNoDanglingBindings(replaceMap);

const failureMap = createFixture({placeBinding: "user-place"});
const failureBefore = snapshot(failureMap);
const failureHistory = new EditHistory();
const failing = createReplaceOrRemoveNamebaseCommand(
  {operation: "delete", baseId: "user-place", replacementBaseId: ""},
  {faultInjector(stage) {
    if (stage === "after-operation") throw new Error("namebase-rule-fault");
  }}
);
assert.throws(() => failureHistory.execute(failing, {map: failureMap}), /namebase-rule-fault/);
assert.equal(snapshot(failureMap), failureBefore, "事务中途故障必须反向恢复名称库和绑定");
assert.equal(failureHistory.getStats().undo, 0, "失败事务不得进入历史");

const conflictProbe = createFixture({placeBinding: "user-place"});
new EditHistory().execute(createBindNamebaseAndRenameCommand({
  scope: "global",
  target: "place",
  baseId: "user-place",
  rename: {kind: "city", ids: [1]}
}), {map: conflictProbe});
const conflictingName = conflictProbe.settlements.cities[1].name;
const conflictMap = createFixture({placeBinding: "user-place"});
conflictMap.settlements.cities[2].name = conflictingName;
conflictMap.pack.burgs[2].name = conflictingName;
const conflictBefore = snapshot(conflictMap);
const conflictHistory = new EditHistory();
let conflictError = null;
try {
  conflictHistory.execute(createBindNamebaseAndRenameCommand({
    scope: "global",
    target: "place",
    baseId: "user-place",
    rename: {kind: "city", ids: [1]}
  }), {map: conflictMap});
} catch (error) {
  conflictError = error;
}
assert.equal(conflictError?.code, "name-conflict", "同类名称冲突必须提供稳定错误码");
assert.equal(snapshot(conflictMap), conflictBefore, "名称冲突必须回滚整笔事务");
assert.equal(conflictHistory.getStats().undo, 0, "名称冲突事务不得进入历史");

const oldMap = createFixture({withoutNamebases: true});
const oldMapBefore = snapshot(oldMap);
const oldHistory = new EditHistory();
oldHistory.execute(createBindNamebaseAndRenameCommand({
  scope: "global",
  target: "place",
  baseId: "place-stems"
}), {map: oldMap});
assert.equal(oldMap.namebases.bindings.global.place, "place-stems", "旧地图必须可补建名称库绑定仓");
oldHistory.undo({map: oldMap});
assert.equal(snapshot(oldMap), oldMapBefore, "旧地图撤销后不应残留补建仓");
oldHistory.redo({map: oldMap});
assert.equal(oldMap.namebases.bindings.global.place, "place-stems", "旧地图绑定必须可重做");

const emptyMap = createFixture({withoutUserBases: true});
const emptyInspection = inspectReplaceOrRemoveNamebase(emptyMap, {
  operation: "clear",
  replacementBaseId: ""
});
assert.equal(emptyInspection.allowed, false);
assert.equal(emptyInspection.code, "no-user-namebases");

for (const [target, kind] of [["culture", "culture"], ["religion", "religion"]]) {
  const scopedMap = createFixture();
  const request = {
    scope: "culture",
    cultureId: 1,
    target,
    baseId: "user-other",
    rename: {kind, ids: [1]}
  };
  const inspection = inspectBindNamebaseAndRename(scopedMap, request);
  assert.equal(inspection.allowed, true, `文化级 ${target} 绑定必须允许同类重命名`);
  new EditHistory().execute(createBindNamebaseAndRenameCommand(request), {map: scopedMap});
  assert.equal(scopedMap.namebases.bindings.cultures["1"][target], "user-other");
}

const syntheticMetadata = Object.fromEntries(Object.entries(API_METHODS).map(([namespace, methods]) => [
  namespace,
  Object.fromEntries(methods.map(method => [method, {
    requiresConfirm: CONFIRM_REQUIRED_METHODS.includes(`${namespace}.${method}`)
  }]))
]));
const descriptions = buildApiMethodDescriptionRegistry(API_METHODS, syntheticMetadata);
for (const method of ["namebases.inspectBindAndRename", "namebases.inspectReplacement"]) {
  const required = descriptions[method]?.resultSchema?.properties?.data?.required || [];
  for (const field of [
    "allowed", "code", "summary", "normalizedInput", "affected", "requiresConfirm",
    "expectedRevision", "inspectionToken", "inspectorSchemaVersion"
  ]) {
    assert.ok(required.includes(field), `${method} 的 info.describe 缺少 ${field}`);
  }
}
for (const code of [
  "target-kind-mismatch", "rename-object-not-found", "rename-culture-mismatch",
  "binding-unchanged", "rename-unchanged", "name-conflict"
]) {
  assert.ok(descriptions["namebases.inspectBindAndRename"].businessCodes.includes(code), `绑定重命名描述缺少 ${code}`);
}
for (const code of [
  "invalid-operation", "user-namebase-not-found", "no-user-namebases", "invalid-document",
  "empty-document", "replacement-not-found", "replacement-will-be-removed"
]) {
  assert.ok(descriptions["namebases.inspectReplacement"].businessCodes.includes(code), `替换迁移描述缺少 ${code}`);
}
assert.equal(
  descriptions["namebases.inspectBindAndRename"].businessCodes.includes("culture-target-unsupported"),
  false,
  "绑定重命名描述不得保留已废弃的 culture-target-unsupported"
);
assert.equal(
  descriptions["namebases.inspectReplacement"].businessCodes.includes("replacement-no-change"),
  false,
  "替换迁移描述不得声明运行时不可达的 replacement-no-change"
);
for (const method of ["namebases.bindAndRename", "namebases.replace"]) {
  const inputSchema = descriptions[method]?.inputSchema;
  const options = inputSchema?.prefixItems?.find(item => item.title === "options");
  assert.ok(options?.properties?.inspectionToken, `${method} 没有描述 inspectionToken`);
  assert.ok(options?.properties?.expectedRevision, `${method} 没有描述 expectedRevision`);
  assert.ok(options?.required?.includes("inspectionToken"), `${method} 没有强制 inspectionToken`);
  assert.ok(options?.required?.includes("expectedRevision"), `${method} 没有强制 expectedRevision`);
  assert.equal(inputSchema?.minItems, 2, `${method} 没有强制 options 参数`);
  assert.ok(descriptions[method].businessCodes.includes("inspection-required"), `${method} 缺少 inspection-required`);
  assert.ok(descriptions[method].businessCodes.includes("confirmation_required"), `${method} 缺少 confirmation_required`);
}
assert.ok(
  descriptions["namebases.replace"].inputSchema.prefixItems[1].required.includes("confirm"),
  "namebases.replace 没有在 schema 中强制 confirm:true"
);
assert.equal(
  descriptions["namebases.replace"].inputSchema.prefixItems[1].properties.confirm.const,
  true,
  "namebases.replace 的 confirm 必须固定为 true"
);
const appSource = readFileSync(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8");
const consoleSource = readFileSync(new URL("../app/webgl-generator/src/runtime/console-api.js", import.meta.url), "utf8");
for (const method of [
  "namebases.inspectBindAndRename", "namebases.bindAndRename",
  "namebases.inspectReplacement", "namebases.replace"
]) {
  assert.ok(consoleSource.includes(`"${method}"`), `${method} 没有接入公开 console API`);
}
assert.match(appSource, /NAMEBASE_RULE_ACTION\.BIND_AND_RENAME/u, "绑定重命名 actionId 未接入 app");
assert.match(appSource, /NAMEBASE_RULE_ACTION\.REPLACE_OR_REMOVE/u, "替换迁移 actionId 未接入 app");
assert.match(appSource, /function assertNamebaseRuleExecution[\s\S]*inspection-required/u, "新增名称库规则入口没有强制预检令牌");

console.log(JSON.stringify({
  actions: Object.values(NAMEBASE_RULE_ACTION),
  bindAndRename: {
    renamed: bindCommand.getResult()?.rename?.renamed,
    unique: bindMap.settlements.cities[1].name !== bindMap.settlements.cities[2].name,
    undoEntries: bindHistory.getStats().undo
  },
  replaceOrRemove: {
    migrated: deleteCommand.getResult()?.migrated,
    undoEntries: deleteHistory.getStats().undo,
    imported: replaceCommand.getResult()?.store?.imported
  },
  rejects: [mismatch.code, emptyInspection.code],
  rollback: snapshot(failureMap) === failureBefore,
  conflictRollback: snapshot(conflictMap) === conflictBefore,
  oldMapRedo: oldMap.namebases.bindings.global.place,
  publicMethods: 4,
  describedExecutors: 2
}, null, 2));

function createFixture({
  placeBinding = "",
  cultureStateBinding = "",
  cultureCultureBinding = "",
  cultureReligionBinding = "",
  withoutNamebases = false,
  withoutUserBases = false
} = {}) {
  const map = {
    metadata: {seed: "namebase-rule-regression", checksum: "fixture"},
    options: {seed: "namebase-rule-regression"},
    politics: {
      states: [null, {id: 1, i: 1, name: "旧国", fullName: "旧国", formName: "王国", culture: 1}],
      provinces: [null, {id: 1, i: 1, name: "旧省", state: 1, culture: 1, center: 0}]
    },
    society: {
      cultures: [null, {id: 1, i: 1, name: "测试文化", root: "测试", type: "Generic", center: 0}],
      religions: [null, {id: 1, i: 1, name: "旧教", culture: 1, center: 0}]
    },
    settlements: {
      cities: [
        null,
        {id: 1, burgId: 1, name: "旧城甲", culture: 1, state: 1, province: 1, population: 10},
        {id: 2, burgId: 2, name: "旧城乙", culture: 1, state: 1, province: 1, population: 8}
      ]
    },
    rivers: {rivers: [{id: 1, name: "旧河", source: 0, cells: [0]}]},
    pack: {
      states: [null],
      provinces: [null],
      cultures: [null],
      religions: [null],
      burgs: [
        null,
        {i: 1, id: 1, cityId: 1, name: "旧城甲", culture: 1, state: 1, province: 1},
        {i: 2, id: 2, cityId: 2, name: "旧城乙", culture: 1, state: 1, province: 1}
      ],
      features: [null, {i: 1, id: 1, type: "lake", name: "旧湖", firstCell: 0, cells: 2}],
      cells: {culture: [1], state: [1], province: [1]}
    }
  };
  if (!withoutNamebases) {
    map.namebases = {
      version: 1,
      bases: withoutUserBases ? [] : [
        {id: "user-place", name: "用户地名", kind: "place", source: ["青岚", "白沙", "赤川"], builtin: false},
        {id: "user-other", name: "其它用户库", kind: "place", source: ["星野", "月港"], builtin: false}
      ],
      bindings: {
        global: {stateRoot: "", place: placeBinding, hydro: "", culture: "", religion: ""},
        cultures: {
          "1": {
            stateRoot: cultureStateBinding,
            place: "",
            hydro: "",
            culture: cultureCultureBinding,
            religion: cultureReligionBinding
          }
        }
      }
    };
  }
  return map;
}

function assertNoDanglingBindings(map) {
  const available = new Set(["place-stems", ...(map.namebases?.bases || []).map(base => base.id)]);
  const bindings = map.namebases?.bindings || {};
  for (const value of Object.values(bindings.global || {})) {
    if (value) assert(available.has(value), `发现悬空全局绑定 ${value}`);
  }
  for (const row of Object.values(bindings.cultures || {})) {
    for (const value of Object.values(row || {})) {
      if (value) assert(available.has(value), `发现悬空文化绑定 ${value}`);
    }
  }
}

function snapshot(value) {
  return JSON.stringify(value);
}
