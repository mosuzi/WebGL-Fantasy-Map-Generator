#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {executeClimateDownstreamRebuildAsync} from "../app/webgl-generator/src/runtime/climate-downstream-rebuild.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {executeMapSnapshotTransaction} from "../app/webgl-generator/src/runtime/map-snapshot-transaction.js";
import {createRuntimeOperationManager} from "../app/webgl-generator/src/runtime/runtime-operation.js";

const regenerationKinds = ["features", "routes", "rivers", "cities", "states", "provinces", "markers", "diplomacy", "religions", "military", "zones"];
for (const kind of regenerationKinds) verifySuccessfulTransaction(kind);

for (const scope of ["base", "downstream", "all"]) {
  for (const faultIndex of [0, 1, scope === "all" ? 7 : 2]) verifyFaultRollback(`${scope}:${faultIndex}`, faultIndex);
}
verifyNoopRollback();
verifyCommitFailureRollback();
await verifyObsoleteClimateDoesNotRestoreReplacementHistory();
await verifyCancelledClimateRestoresSameMapHistory();
await verifyRuntimeBusyResult();
await verifyStaticWiring();

console.log(JSON.stringify({
  ok: true,
  regenerationKinds,
  heightFaultScopes: ["base", "downstream", "all"],
  climate: {obsoleteHistoryIsolation: true, sameMapCancellationRollback: true},
  runtime: {busyDistinctFromObsolete: true}
}, null, 2));

function verifySuccessfulTransaction(kind) {
  const map = sampleMap(kind);
  const mapReference = map;
  const optionsReference = map.options;
  const before = structuredClone(map);
  const history = new EditHistory();
  const transaction = executeMapSnapshotTransaction({
    map,
    editHistory: history,
    label: `重生成 ${kind}`,
    domain: "regeneration",
    effects: transactionEffects(kind),
    execute() {
      applyInnerMutation(map, history, `${kind}:first`);
      applyInnerMutation(map, history, `${kind}:second`);
      return {executed: true, kind};
    },
    executeCommand: command => {
      history.execute(command, {map});
      return {executed: true, command};
    }
  });
  const after = structuredClone(map);
  assert.equal(transaction.executed, true, `${kind} 没有成功提交事务`);
  assert.equal(history.getStats().undo, 1, `${kind} 没有收敛为一条历史`);
  assert.equal(map, mapReference, `${kind} 替换了 map 引用`);
  assert.equal(map.options, optionsReference, `${kind} 替换了 map.options 引用`);
  history.undo({map});
  assert.deepEqual(map, before, `${kind} 单条撤销没有恢复完整地图`);
  assert.equal(map.options, optionsReference, `${kind} 撤销替换了 map.options 引用`);
  history.redo({map});
  assert.deepEqual(map, after, `${kind} 单条重做没有恢复完整地图`);
  assert.equal(map.options, optionsReference, `${kind} 重做替换了 map.options 引用`);
}

function verifyFaultRollback(label, faultIndex) {
  const map = sampleMap(label);
  const mapReference = map;
  const optionsReference = map.options;
  const before = structuredClone(map);
  const history = new EditHistory();
  let restoredStage = "";
  assert.throws(() => executeMapSnapshotTransaction({
    map,
    editHistory: history,
    label,
    effects: transactionEffects(label),
    execute() {
      for (let index = 0; index <= Math.max(2, faultIndex); index++) {
        applyInnerMutation(map, history, `${label}:${index}`);
        if (index === faultIndex) throw new Error(`fault:${label}`);
      }
      return {executed: true};
    },
    executeCommand: command => {
      history.execute(command, {map});
      return {executed: true, command};
    },
    onRestore(stage) {
      restoredStage = stage;
    }
  }), new RegExp(`fault:${escapeRegExp(label)}`));
  assert.deepEqual(map, before, `${label} 故障没有恢复完整地图`);
  assert.equal(map, mapReference, `${label} 故障替换了 map 引用`);
  assert.equal(map.options, optionsReference, `${label} 故障替换了 map.options 引用`);
  assert.equal(history.getStats().undo, 0, `${label} 故障留下历史碎片`);
  assert.equal(restoredStage, "rollback", `${label} 没有触发统一回滚刷新阶段`);
}

function verifyNoopRollback() {
  const map = sampleMap("noop");
  const optionsReference = map.options;
  const before = structuredClone(map);
  const history = new EditHistory();
  let restoredStage = "";
  const transaction = executeMapSnapshotTransaction({
    map,
    editHistory: history,
    execute() {
      applyInnerMutation(map, history, "noop-inner");
      return {executed: false};
    },
    executeCommand() {
      throw new Error("noop 不应提交");
    },
    onRestore(stage) {
      restoredStage = stage;
    }
  });
  assert.equal(transaction.executed, false);
  assert.deepEqual(map, before, "未执行事务留下了部分地图变化");
  assert.equal(map.options, optionsReference, "未执行事务替换了 options 引用");
  assert.equal(history.getStats().undo, 0, "未执行事务留下了历史碎片");
  assert.equal(restoredStage, "noop", "未执行事务没有触发统一恢复刷新");
}

function verifyCommitFailureRollback() {
  const map = sampleMap("commit-failure");
  const optionsReference = map.options;
  const before = structuredClone(map);
  const history = new EditHistory();
  assert.throws(() => executeMapSnapshotTransaction({
    map,
    editHistory: history,
    execute() {
      applyInnerMutation(map, history, "before-commit-failure");
      return {executed: true};
    },
    executeCommand: () => ({executed: false, error: new Error("commit-failure")})
  }), /commit-failure/);
  assert.deepEqual(map, before, "历史提交失败没有恢复完整地图");
  assert.equal(map.options, optionsReference, "历史提交失败替换了 options 引用");
  assert.equal(history.getStats().undo, 0, "历史提交失败留下了历史碎片");
}

async function verifyObsoleteClimateDoesNotRestoreReplacementHistory() {
  const oldMap = climateMap();
  const oldBefore = structuredClone(oldMap);
  const replacementMap = sampleMap("replacement");
  const history = new EditHistory();
  let current = true;
  let replacementInstalled = false;
  await assert.rejects(() => executeClimateDownstreamRebuildAsync({
    map: oldMap,
    editHistory: history,
    systems: ["cities"],
    executeSystem() {
      oldMap.trace.push("obsolete-write");
      return {executed: true};
    },
    executeCommand() {
      throw new Error("过期请求不得提交");
    },
    assertCurrent: () => current,
    shouldRestoreHistory: () => current,
    async yieldToMain() {
      if (replacementInstalled) return;
      replacementInstalled = true;
      current = false;
      history.execute({
        label: "新地图历史",
        apply(context) {
          context.map.trace.push("replacement");
        },
        revert(context) {
          context.map.trace.pop();
        }
      }, {map: replacementMap});
    }
  }), error => error?.code === "operation_obsolete");
  assert.deepEqual(oldMap, oldBefore, "过期气候请求没有回滚旧地图");
  assert.deepEqual(replacementMap.trace, ["replacement"], "过期气候请求触碰了新地图");
  assert.equal(history.getStats().undo, 1, "过期气候请求覆盖了新地图历史");
  assert.equal(history.getStats().lastLabel, "新地图历史", "过期气候请求恢复了旧历史标签");
}

async function verifyCancelledClimateRestoresSameMapHistory() {
  const map = climateMap();
  const before = structuredClone(map);
  const history = new EditHistory();
  const abortController = new AbortController();
  await assert.rejects(() => executeClimateDownstreamRebuildAsync({
    map,
    editHistory: history,
    systems: ["cities"],
    signal: abortController.signal,
    executeSystem() {
      map.trace.push("cancelled-write");
      return {executed: true};
    },
    executeCommand() {
      throw new Error("取消请求不得提交");
    },
    async yieldToMain() {
      abortController.abort("test-cancel");
    }
  }), error => error?.name === "AbortError");
  assert.deepEqual(map, before, "同图取消没有恢复完整地图");
  assert.equal(history.getStats().undo, 0, "同图取消留下了历史碎片");
}

async function verifyRuntimeBusyResult() {
  let release;
  const blocker = new Promise(resolve => {
    release = resolve;
  });
  const manager = createRuntimeOperationManager();
  const running = manager.run("climate.applyDownstreamRebuild", async () => {
    await blocker;
    return {executed: true};
  });
  await assert.rejects(
    () => manager.run("generate.regenerate", async () => ({executed: true})),
    error => error?.code === "operation_busy" && error?.expected === true
  );
  release();
  await running;
}

async function verifyStaticWiring() {
  const [appSource, geoSource, operationSource, consoleApiSource] = await Promise.all([
    readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8"),
    readFile(new URL("../app/webgl-generator/src/runtime/fmg-cells-geojson-import.js", import.meta.url), "utf8"),
    readFile(new URL("../app/webgl-generator/src/runtime/runtime-operation.js", import.meta.url), "utf8"),
    readFile(new URL("../app/webgl-generator/src/runtime/console-api.js", import.meta.url), "utf8")
  ]);
  assert.match(appSource, /generate\.regenerate[\s\S]*executeMapSnapshotTransaction\(\{/);
  assert.match(appSource, /const constraintBundle = captureRegenerationConstraintBundle\(state\.map, \{closure: \["world"\]\}\);/);
  assert.match(appSource, /const regenerate = kind => \{[\s\S]*regenerateMapAttributeCoreViaApi[\s\S]*constraintBundle/);
  assert.match(appSource, /constraintBundle\.assertDomain\(state\.map, "world", "after"\)/);
  assert.match(appSource, /rebuildAllDerived: \(editOptions = \{\}\) => operation\.runSync/);
  assert.match(appSource, /onRegenerateAll:[\s\S]*runtimeActions\.edit\.height\.rebuildAllDerived/);
  assert.match(appSource, /importGEO:[\s\S]*mapMutationConfig\("正在导入 GEO 数据"\)/);
  assert.match(appSource, /shouldRestoreHistory: \(\) => state\.map === map/);
  assert.match(appSource, /refreshMapMutationRollback\(state, documentRef\)/);
  assert.match(geoSource, /catch \(error\) \{[\s\S]*applyHeightChanges\(context\.map, changes, "before"\);[\s\S]*restoreGeoImportDerivedSnapshot/);
  assert.match(operationSource, /operation_obsolete: "地图已被替换/);
  for (const signature of [
    'regenerate: {stable: "draft", mutates: "map-derived-data", undoable: true',
    '"height.rebuildBaseDerived": {stable: "draft", mutates: "map-derived-data", undoable: true',
    '"height.rebuildDownstreamDerived": {stable: "draft", mutates: "map-derived-data", undoable: true',
    'importGEO: {stable: "draft", mutates: "map-or-measurements", undoable: true'
  ]) {
    assert(consoleApiSource.includes(signature), `API 元数据仍未声明完整事务：${signature}`);
  }
}

function sampleMap(seed) {
  return {
    options: {seed},
    metadata: {checksum: `before:${seed}`},
    summary: {checksum: `before:${seed}`},
    trace: []
  };
}

function climateMap() {
  return {
    options: {seed: "climate"},
    metadata: {checksum: "before", derivedStale: {systems: ["cities"]}},
    summary: {checksum: "before"},
    trace: [],
    settlements: {cities: [{id: 1}]}
  };
}

function applyInnerMutation(map, history, value) {
  history.execute({
    label: `内层 ${value}`,
    apply(context) {
      context.map.trace.push(value);
      context.map.metadata.checksum = value;
      context.map.options.lastMutation = value;
    },
    revert(context) {
      context.map.trace.pop();
    }
  }, {map});
}

function transactionEffects(id) {
  return {
    render: "draw",
    selection: "refresh",
    runtimeStats: true,
    pickPanel: true,
    derived: ["object-index"],
    affected: [{kind: "system", id}]
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
