#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {API_METHODS, CONFIRM_REQUIRED_METHODS} from "../app/webgl-generator/src/runtime/api-contract.js";
import {
  climateDownstreamRegenerationSalt,
  executeClimateDownstreamRebuild,
  executeClimateDownstreamRebuildAsync,
  inspectClimateDownstreamRebuild
} from "../app/webgl-generator/src/runtime/climate-downstream-rebuild.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {createMapDocument, parseMapDocument, stringifyMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {createRegenerateResourceMarkersCommand} from "../app/webgl-generator/src/runtime/marker-edit-commands.js";

const allSystems = ["cities", "states", "provinces", "religions", "markers", "economy", "diplomacy", "military", "zones"];
const preview = inspectClimateDownstreamRebuild(sampleMap(), {systems: ["zones"], seed: 41});
assert.deepEqual(preview.requestedSystems, ["zones"]);
assert.deepEqual(preview.requiredSystems, ["cities", "states", "provinces", "religions", "markers", "economy", "diplomacy", "military"]);
assert.deepEqual(preview.executionOrder, ["states", "religions", "markers", "diplomacy", "military", "zones"]);
assert.equal(preview.candidates.find(item => item.id === "cities").estimatedAffected, 4);
assert.equal(preview.candidates.find(item => item.id === "states").estimatedAffected, 2);
assert.equal(preview.candidates.find(item => item.id === "markers").selected, true);

const economyOnly = inspectClimateDownstreamRebuild(sampleMap(), {systems: ["economy"], seed: 41});
assert.deepEqual(economyOnly.requestedSystems, ["economy"]);
assert.deepEqual(economyOnly.requiredSystems, ["markers"]);
assert.equal(economyOnly.candidates.find(item => item.id === "economy").coveredBy, "markers");
assert.deepEqual(economyOnly.executionOrder, ["markers"]);

const covered = inspectClimateDownstreamRebuild(sampleMap(), {systems: ["states", "provinces", "markers", "economy"], seed: 41});
assert.deepEqual(covered.executionOrder, ["states", "markers"]);
assert.equal(covered.candidates.find(item => item.id === "cities").coveredBy, "states");
assert.equal(covered.candidates.find(item => item.id === "economy").coveredBy, "markers");
assert.equal(climateDownstreamRegenerationSalt(41, "states"), climateDownstreamRegenerationSalt(41, "states"));
assert.notEqual(climateDownstreamRegenerationSalt(41, "states"), climateDownstreamRegenerationSalt(42, "states"));

const first = runSuccessfulTransaction(sampleMap(), ["diplomacy"], 73);
const second = runSuccessfulTransaction(sampleMap(), ["diplomacy"], 73);
const asyncEquivalent = await runSuccessfulAsyncTransaction(sampleMap(), ["diplomacy"], 73);
assert.equal(first.result.checksum, second.result.checksum);
assert.deepEqual(structuredResult(first.result), structuredResult(second.result));
assert.deepEqual(structuredResult(asyncEquivalent.result), structuredResult(first.result), "分阶段事务改变了同步事务结果");
assert.deepEqual(asyncEquivalent.map.trace, first.map.trace, "分阶段事务改变了系统执行轨迹");
assert.equal(first.commandState.beforeChecksum, first.result.checksum, "登记外层命令前地图应已处于最终状态");
assert.equal(first.commandState.afterChecksum, first.commandState.beforeChecksum, "外层命令首次 apply 不应重复恢复地图");
assert.deepEqual(first.commandState.afterTrace, first.commandState.beforeTrace, "外层命令首次 apply 不应改写最终结果");
assert.deepEqual(first.result.executionOrder, ["states", "religions", "markers", "diplomacy"]);
assert.deepEqual(first.map.metadata.derivedStale.systems, ["military", "zones"]);
assert.equal(first.history.getStats().undo, 1, "多个内层命令应收拢为一条历史");

const after = structuredClone(first.map);
const optionsReference = first.map.options;
first.history.undo({map: first.map});
assert.deepEqual(first.map, first.before, "撤销未恢复整张地图");
assert.equal(first.map.options, optionsReference, "撤销不应破坏运行时 options 引用");
first.history.redo({map: first.map});
assert.deepEqual(first.map, after, "重做未恢复整张地图");
assert.equal(first.map.options, optionsReference, "重做不应破坏运行时 options 引用");

const failureMap = sampleMap();
const failureBefore = structuredClone(failureMap);
const failureHistory = new EditHistory();
assert.throws(() => executeClimateDownstreamRebuild({
  map: failureMap,
  editHistory: failureHistory,
  systems: ["diplomacy"],
  seed: 17,
  executeCommand(command) {
    failureHistory.execute(command, {map: failureMap});
    return {executed: true, command};
  },
  executeSystem(systemId) {
    if (systemId === "religions") throw new Error("注入失败");
    applyInnerMutation(failureMap, failureHistory, systemId);
    return {executed: true};
  }
}), /注入失败/);
assert.deepEqual(failureMap, failureBefore, "失败回滚留下了部分重算状态");
assert.equal(failureHistory.getStats().undo, 0, "失败回滚留下了内层历史");

const asyncFailureMap = sampleMap();
const asyncFailureBefore = structuredClone(asyncFailureMap);
const asyncFailureHistory = new EditHistory();
await assert.rejects(() => executeClimateDownstreamRebuildAsync({
  map: asyncFailureMap,
  editHistory: asyncFailureHistory,
  systems: ["diplomacy"],
  seed: 17,
  executeCommand(command) {
    asyncFailureHistory.execute(command, {map: asyncFailureMap});
    return {executed: true, command};
  },
  executeSystem(systemId) {
    if (systemId === "religions") throw new Error("异步注入失败");
    applyInnerMutation(asyncFailureMap, asyncFailureHistory, systemId);
    return {executed: true};
  }
}), /异步注入失败/);
assert.deepEqual(asyncFailureMap, asyncFailureBefore, "分阶段失败回滚留下了部分重算状态");
assert.equal(asyncFailureHistory.getStats().undo, 0, "分阶段失败回滚留下了内层历史");

const roundtrip = JSON.parse(JSON.stringify(first.map));
assert.deepEqual(roundtrip.metadata.derivedStale.systems, ["military", "zones"]);
assert.equal(Object.prototype.hasOwnProperty.call(roundtrip, "climateDownstreamRebuild"), false, "完整地图不应增加强制存档字段");

const fullMap = generatePlaceholderMap({seed: "climate-downstream-roundtrip", cellsTarget: 1000, heightmapTemplate: "continents"});
fullMap.metadata.derivedStale = {systems: [...allSystems], updatedAt: "before"};
const fullHistory = new EditHistory();
const fullResult = executeClimateDownstreamRebuild({
  map: fullMap,
  editHistory: fullHistory,
  systems: ["cities"],
  seed: 91,
  executeCommand(command) {
    fullHistory.execute(command, {map: fullMap});
    return {executed: true, command};
  },
  executeSystem(systemId) {
    const salt = Number(fullMap.metadata.regeneration?.[systemId] || 0) + 1;
    fullHistory.execute({
      label: `完整地图 ${systemId}`,
      domain: systemId,
      apply(context) {
        context.map.metadata.regeneration[systemId] = salt;
      },
      revert(context) {
        context.map.metadata.regeneration[systemId] = salt - 1;
      }
    }, {map: fullMap});
    return {executed: true};
  },
  refreshSummary(targetMap) {
    targetMap.metadata.checksum = checksum(JSON.stringify(targetMap.metadata.regeneration));
    targetMap.summary.checksum = targetMap.metadata.checksum;
  }
});
const parsedFullDocument = parseMapDocument(stringifyMapDocument(createMapDocument(fullMap, fullMap.options)));
assert.equal(parsedFullDocument.map.metadata.checksum, fullResult.checksum, "完整地图往返丢失重算 checksum");
assert.equal(parsedFullDocument.map.metadata.derivedStale.systems.includes("cities"), false, "完整地图往返后已选系统变回 stale");
assert.equal(parsedFullDocument.map.metadata.derivedStale.systems.includes("markers"), true, "完整地图往返后未选系统没有保持 stale");
assert.equal(Object.prototype.hasOwnProperty.call(parsedFullDocument.map, "climateDownstreamRebuild"), false, "旧图兼容不应依赖新顶层字段");

const chunkedPerformance = await runChunkedPerformanceTransaction();
assert.deepEqual(chunkedPerformance.result.executionOrder, ["markers"], "经济候选没有收敛为资源 marker / 经济组合步骤");
assert.equal(chunkedPerformance.history.undo, 1, "分阶段气候重算没有收拢为一条历史");
assert(chunkedPerformance.result.timings.chunks.some(chunk => chunk.id === "system:markers"), "分阶段计时缺少 markers / economy 块");
assert(chunkedPerformance.result.timings.maxBlockingMs < 250, `固定 10k 样本仍有超阈值同步块：${JSON.stringify(chunkedPerformance.result.timings)}`);
assert(chunkedPerformance.yields.length >= 4, `固定 10k 样本没有在快照、系统和提交之间让出主线程：${chunkedPerformance.yields}`);
assert(chunkedPerformance.progress.includes("system:markers"), "分阶段重算没有报告 markers / economy 进度");

const [appSource, panelModelSource, panelVueSource, consoleApiSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/panels/climate-panel.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/ClimatePanel.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/console-api.js", import.meta.url), "utf8")
]);
assert.match(appSource, /inspectDownstreamRebuild: \(options = \{\}\) => inspectClimateDownstreamRebuildViaApi/);
assert.match(appSource, /applyDownstreamRebuild: \(options = \{\}\) => applyClimateDownstreamRebuildViaApi/);
assert.match(appSource, /await executeClimateDownstreamRebuildAsync\(\{/);
assert.match(appSource, /yieldToMain: \(\) => yieldToBrowser\(documentRef\)/);
assert.match(appSource, /regenerateMarkerResources\(state, documentRef, \{deferRefresh: true\}\)/);
assert.match(panelModelSource, /downstreamSystems: \[\]/, "气候面板不应默认全选");
assert.match(panelModelSource, /confirm: true/);
assert.match(panelModelSource, /onApplyDownstream: async/);
assert.match(panelModelSource, /downstreamRunning: false/);
assert.match(panelVueSource, /type="checkbox"/);
assert.match(panelVueSource, /固定 seed/);
assert.match(panelVueSource, />预检</);
assert.match(panelVueSource, /重算中…/);
assert.match(consoleApiSource, /actions\.climate\?\.inspectDownstreamRebuild/);
assert.match(consoleApiSource, /actions\.climate\?\.applyDownstreamRebuild/);
assert.match(consoleApiSource, /applyDownstreamRebuild: \{stable: "draft", mutates: "map-derived-data", undoable: true, async: true/);
assert(API_METHODS.climate.includes("inspectDownstreamRebuild"));
assert(API_METHODS.climate.includes("applyDownstreamRebuild"));
assert(CONFIRM_REQUIRED_METHODS.includes("climate.applyDownstreamRebuild"));

console.log(JSON.stringify({
  ok: true,
  candidates: preview.candidates.length,
  dependencyOrder: preview.executionOrder,
  coveredOrder: covered.executionOrder,
  deterministicChecksum: first.result.checksum,
  staleAfter: first.result.staleSystems,
  fullMapRoundtripChecksum: parsedFullDocument.map.metadata.checksum,
  chunkedPerformance: chunkedPerformance.result.timings,
  publicClimateMethods: API_METHODS.climate.length,
  history: first.history.getStats()
}, null, 2));

function runSuccessfulTransaction(map, systems, seed) {
  const before = structuredClone(map);
  const history = new EditHistory();
  const commandState = {};
  const result = executeClimateDownstreamRebuild({
    map,
    editHistory: history,
    systems,
    seed,
    executeCommand(command) {
      commandState.beforeChecksum = map.metadata.checksum;
      commandState.beforeTrace = structuredClone(map.trace);
      history.execute(command, {map});
      commandState.afterChecksum = map.metadata.checksum;
      commandState.afterTrace = structuredClone(map.trace);
      return {executed: true, command};
    },
    executeSystem(systemId) {
      applyInnerMutation(map, history, systemId);
      return {executed: true, system: systemId};
    },
    refreshSummary(targetMap) {
      const trace = targetMap.trace.map(item => `${item.system}:${item.salt}`).join("|");
      targetMap.metadata.checksum = checksum(trace);
      targetMap.summary = {checksum: targetMap.metadata.checksum};
    }
  });
  return {map, history, result, before, commandState};
}

async function runSuccessfulAsyncTransaction(map, systems, seed) {
  const history = new EditHistory();
  const result = await executeClimateDownstreamRebuildAsync({
    map,
    editHistory: history,
    systems,
    seed,
    executeCommand(command) {
      history.execute(command, {map});
      return {executed: true, command};
    },
    executeSystem(systemId) {
      applyInnerMutation(map, history, systemId);
      return {executed: true, system: systemId};
    },
    refreshSummary(targetMap) {
      const trace = targetMap.trace.map(item => `${item.system}:${item.salt}`).join("|");
      targetMap.metadata.checksum = checksum(trace);
      targetMap.summary = {checksum: targetMap.metadata.checksum};
    }
  });
  return {map, history, result};
}

async function runChunkedPerformanceTransaction() {
  const map = generatePlaceholderMap({seed: "climate-downstream-10k", cellsTarget: 10000, heightmapTemplate: "continents"});
  map.metadata.derivedStale = {systems: [...allSystems], updatedAt: "before"};
  const history = new EditHistory();
  const yields = [];
  const progress = [];
  const result = await executeClimateDownstreamRebuildAsync({
    map,
    editHistory: history,
    systems: ["economy"],
    seed: 41,
    executeSystem(systemId, {regenerationSalt}) {
      assert.equal(systemId, "markers", "经济候选执行了意外系统");
      history.execute(createRegenerateResourceMarkersCommand({salt: regenerationSalt}), {map});
      return {executed: true, status: "资源 marker 与经济已重算"};
    },
    executeCommand(command) {
      history.execute(command, {map});
      return {executed: true, command};
    },
    refreshSummary(targetMap) {
      targetMap.metadata.checksum = checksum(`${targetMap.markers?.markers?.length || 0}:${targetMap.economy?.deals?.length || 0}`);
      targetMap.summary.checksum = targetMap.metadata.checksum;
    },
    onProgress(item) {
      progress.push(item.system ? `${item.phase}:${item.system}` : item.phase);
    },
    async yieldToMain(item) {
      yields.push(item.id);
      await new Promise(resolve => setImmediate(resolve));
    }
  });
  return {result, history: history.getStats(), yields, progress};
}

function applyInnerMutation(map, history, systemId) {
  const salt = systemId === "economy" ? 0 : Number(map.metadata.regeneration?.[systemId] || 0) + 1;
  history.execute({
    label: `内层 ${systemId}`,
    domain: systemId,
    apply(context) {
      context.map.trace.push({system: systemId, salt});
    },
    revert(context) {
      context.map.trace.pop();
    }
  }, {map});
}

function structuredResult(result) {
  return {
    seed: result.seed,
    requestedSystems: result.requestedSystems,
    requiredSystems: result.requiredSystems,
    selectedSystems: result.selectedSystems,
    executionOrder: result.executionOrder,
    staleSystems: result.staleSystems,
    checksum: result.checksum,
    steps: result.steps.map(step => ({system: step.system, covers: step.covers, regenerationSalt: step.regenerationSalt}))
  };
}

function sampleMap() {
  return {
    options: {seed: "climate-downstream"},
    metadata: {checksum: "before", derivedStale: {systems: [...allSystems], updatedAt: "before"}},
    summary: {checksum: "before"},
    trace: [],
    settlements: {cities: [{id: 0}, {id: 1}, {id: 2}, {id: 3}]},
    politics: {
      states: [{i: 0}, {i: 1}, {i: 2}],
      provinces: [{i: 0}, {i: 1}, {i: 2}, {i: 3}]
    },
    society: {religions: [{i: 0}, {i: 1}, {i: 2}]},
    markers: {markers: [{id: 0}, {id: 1}], metadata: {stale: true}},
    economy: {markets: [{i: 0}, {i: 1}], deals: [{id: 1}, {id: 2}], metadata: {stale: true}},
    diplomacy: {metadata: {pairs: 4, stale: true}},
    military: {regiments: [{id: 1}, {id: 2}, {id: 3}], metadata: {regiments: 3, stale: true}},
    zones: {zones: [{i: 0}, {i: 1}], metadata: {zones: 2, stale: true}}
  };
}

function checksum(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
