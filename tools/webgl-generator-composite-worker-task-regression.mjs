import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {serialize} from "node:v8";
import {createGenerationSummary, generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {RENDER_PREPARATION_LAYERS} from "../app/webgl-generator/src/renderer/render-preparation.js";
import {
  assertOceanCurrentWorldIdentity,
  rebuildOceanCurrentWorldStage,
  snapshotOceanCurrentWorldIdentity
} from "../app/webgl-generator/src/generator/ocean-current-world.js";
import {reconcileWarDerivedData} from "../app/webgl-generator/src/generator/war-consistency.js";
import {
  CLIMATE_DOWNSTREAM_WORKER_TASK,
  getClimateDownstreamPatchPolicy
} from "../app/webgl-generator/src/runtime/climate-downstream-worker-task.js";
import {
  executeClimateDownstreamRebuild,
  inspectClimateDownstreamRebuild
} from "../app/webgl-generator/src/runtime/climate-downstream-rebuild.js";
import {createDomainPatchCommand, createMapReplacementCommand} from "../app/webgl-generator/src/runtime/domain-patch.js";
import {
  getHeightDerivedPatchPolicy,
  HEIGHT_DERIVED_WORKER_TASK
} from "../app/webgl-generator/src/runtime/height-derived-worker-task.js";
import {
  HEIGHT_BASE_REBUILD_STEPS,
  HEIGHT_DOWNSTREAM_REBUILD_STEPS,
  rebuildHeightAllDerived,
  rebuildHeightBaseDerived,
  rebuildHeightDownstreamDerived
} from "../app/webgl-generator/src/runtime/height-derived-rebuild.js";
import {ensureLabelStore} from "../app/webgl-generator/src/runtime/label-edit-commands.js";
import {GENERATION_WORKER_TASK} from "../app/webgl-generator/src/runtime/generation-worker-task.js";
import {syncMilitaryStateMirrors} from "../app/webgl-generator/src/runtime/military-regeneration-variation.js";
import {LABEL_TARGET_KIND, OBJECT_KIND} from "../app/webgl-generator/src/runtime/object-kinds.js";
import {OCEAN_CURRENT_WORLD_WORKER_TASK} from "../app/webgl-generator/src/runtime/ocean-current-world-worker-task.js";
import {
  OCEAN_CURRENT_WORLD_REBUILD_ORDER,
  executeOceanCurrentWorldRebuild
} from "../app/webgl-generator/src/runtime/ocean-current-world-rebuild.js";
import {captureRegenerationConstraintBundle} from "../app/webgl-generator/src/runtime/regeneration-constraint-bundle.js";
import {regenerateMapAttributeForWorker} from "../app/webgl-generator/src/runtime/regeneration-worker-task.js";
import {buildSeafloorResetPlan, createResetSeafloorCommand} from "../app/webgl-generator/src/runtime/seafloor-reset.js";
import {createWorkerGraphDecoder, encodeWorkerGraph} from "../app/webgl-generator/src/runtime/worker-graph-stream.js";
import {createWorkerTaskCoordinator} from "../app/webgl-generator/src/runtime/worker-task-coordinator.js";
import {
  collectWorkerTaskTransferables,
  getWorkerTaskHandler,
  listWorkerTasks
} from "../app/webgl-generator/src/runtime/worker-task-registry.js";

const binding = {
  mapIdentity: "composite-fixture",
  mapRevision: 7,
  topologyRevision: 2,
  generationToken: 3,
  lockFingerprint: "fixture-locks",
  operationId: 11,
  operationName: "composite.compute"
};
const mutationTaskNames = [HEIGHT_DERIVED_WORKER_TASK, CLIMATE_DOWNSTREAM_WORKER_TASK, OCEAN_CURRENT_WORLD_WORKER_TASK];
const taskNames = [...mutationTaskNames, GENERATION_WORKER_TASK];
const report = {
  wiring: {},
  registry: [],
  height: {},
  climate: {},
  ocean: {},
  generation: {},
  locks: {},
  safety: {},
  large: {}
};

report.wiring = await verifyFormalRuntimeWiring();

assert.deepEqual(
  [...HEIGHT_BASE_REBUILD_STEPS, ...HEIGHT_DOWNSTREAM_REBUILD_STEPS],
  ["features", "rivers", "states", "religions", "markers", "diplomacy", "military", "zones"]
);
assert.equal(OCEAN_CURRENT_WORLD_REBUILD_ORDER.length, 11);
for (const task of taskNames) {
  assert(listWorkerTasks().includes(task), `${task} 未注册到正式 Worker registry`);
  assert.equal(typeof getWorkerTaskHandler(task), "function", `${task} 缺少 registry handler`);
}
report.registry = taskNames;

console.log("[composite-worker] 正在验证整图生成与渲染准备同源输出");
const generationPayload = {
  options: {seed: "generation-worker-result", cellsTarget: 512, heightmapTemplate: "continents"},
  render: {
    binding: {
      mapIdentity: "generated:fixture",
      mapRevision: 0,
      sourceRevision: 0,
      topologyRevision: 0,
      renderPreparationId: "generated:fixture:render:0",
      renderGeneration: 0
    },
    layers: [...RENDER_PREPARATION_LAYERS],
    camera: {scale: 1, offsetX: 0, offsetY: 0},
    canvas: {width: 1024, height: 768, clientWidth: 1024, clientHeight: 768},
    visibility: {routes: true, rivers: true, markers: true, cities: true},
    colorMode: "height",
    viewOptions: {},
    labelOptions: {},
    visualTheme: {},
    unitPreferences: {}
  }
};
const generationWorker = await runWorkerMode(GENERATION_WORKER_TASK, generationPayload, "generation-worker-result");
const generationFallback = await runFallbackMode(GENERATION_WORKER_TASK, generationPayload);
assertStableMapEqual(generationWorker.output.map, generationFallback.output.map, "整图生成 Worker / fallback 地图不同源");
const generationPreparedLayerKeys = Object.keys(generationWorker.output.preparedRender.layers);
assert.deepEqual(generationPreparedLayerKeys, [
  "cellVisual", "shore", "statePaths", "provincePaths", "political", "politicalDebug",
  "surface", "line", "picking", "labels", "route", "river", "point", "gpuShoreSurface"
], "整图生成没有返回完整渲染准备结果");
assert.equal(Object.hasOwn(generationWorker.output.preparedRender.layers, "cell-visual"), false, "整图生成错误保留了请求层 ID");
assert.equal(Object.hasOwn(generationWorker.output.preparedRender.layers, "politicalDebug"), true, "整图生成漏掉政治调试准备结果");
assert.deepEqual(generationWorker.output.preparedRender.binding, generationPayload.render.binding, "整图生成渲染准备绑定漂移");
assert(generationWorker.outputPackets > 1, "整图生成结果没有经过多包输出");
assert(collectWorkerTaskTransferables(GENERATION_WORKER_TASK, generationWorker.output).length > 0, "整图生成未暴露可转移结果");
report.generation = {
  inputPackets: generationWorker.inputPackets,
  outputPackets: generationWorker.outputPackets,
  layers: generationPreparedLayerKeys.length,
  fallback: generationFallback.output.worker.mode
};

console.log("[composite-worker] 正在生成 1k 对拍夹具");
const source = generatePlaceholderMap({seed: "composite-worker", cellsTarget: 1000, heightmapTemplate: "continents"});
const sourceSnapshot = structuredClone(source);
const sourceHeightCapture = captureTyped(source.pack.cells.h);

const expectedHeight = structuredClone(source);
const legacyHeight = runLegacyHeight(expectedHeight);
assert.equal(legacyHeight.executed, true);
refreshGenerationSummary(expectedHeight);
const heightWorker = await runWorkerMode(HEIGHT_DERIVED_WORKER_TASK, {map: source, scope: "all", render: createRenderRequest()}, "height-worker");
const heightWorkingMap = heightWorker.input.map;
refreshGenerationSummary(heightWorkingMap);
assertStableMapEqual(heightWorkingMap, expectedHeight, "高度复合 Worker 与既有编排不一致");
assert.equal(heightWorker.output.binding.mapIdentity, binding.mapIdentity);
assertPreparedOutput(heightWorker.output, "高度全部派生");
assert.equal(heightWorker.output.result.executed, true);
assert.equal(Object.prototype.hasOwnProperty.call(heightWorker.output, "map"), false);
assert.equal(Object.prototype.hasOwnProperty.call(heightWorker.output, "sourceMap"), false);
assert(!heightWorker.output.patch.writeSet.includes("summary"), "高度 Worker 不应把运行时 summary 作为领域补丁传回");

const heightFallback = await runFallbackMode(HEIGHT_DERIVED_WORKER_TASK, {map: source, scope: "all", render: createRenderRequest()});
assertPreparedOutput(heightFallback.output, "高度全部派生 fallback");
refreshGenerationSummary(heightFallback.input.map);
assertStableMapEqual(heightFallback.input.map, heightWorkingMap, "高度 Worker 与 fallback handler 语义不一致");
assertStableValueEqual(heightFallback.output.result, heightWorker.output.result, "高度 Worker 与 fallback 结果摘要不一致");

const heightFormal = structuredClone(source);
const heightCommand = createDomainPatchCommand({
  patch: heightWorker.output.patch,
  policy: getHeightDerivedPatchPolicy("all", heightWorker.output.result.changedKinds),
  label: "高度复合 Worker 测试补丁",
  effects: {}
});
heightCommand.apply({map: heightFormal});
refreshGenerationSummary(heightFormal);
assert.deepEqual(heightFormal.summary, heightWorkingMap.summary, "高度补丁提交后主线程 summary 不精确");
assertStableMapEqual(heightFormal, heightWorkingMap, "高度补丁提交结果与 Worker working map 不一致");
assertCompleteAliases(heightFormal, "高度提交");
heightCommand.revert({map: heightFormal});
refreshGenerationSummary(heightFormal);
assertStableMapEqual(heightFormal, source, "高度补丁撤销没有恢复源图");
assertCompleteAliases(heightFormal, "高度撤销");
heightCommand.apply({map: heightFormal});
refreshGenerationSummary(heightFormal);
assertStableMapEqual(heightFormal, heightWorkingMap, "高度补丁重做没有恢复结果");
assertCompleteAliases(heightFormal, "高度重做");
assertSourceTypedUnchanged(source.pack.cells.h, sourceHeightCapture, "高度 Worker 输入");
assertStableMapEqual(source, sourceSnapshot, "高度 Worker 改写了正式源图");
assertCompleteAliases(source, "高度 Worker 源图");
assert(collectWorkerTaskTransferables(HEIGHT_DERIVED_WORKER_TASK, heightWorker.output).length > 0, "高度 registry 缺少 transferable 收集结果");
report.height = {
  patchOperations: heightWorker.output.patch.operations.length,
  inputPackets: heightWorker.inputPackets,
  outputPackets: heightWorker.outputPackets,
  progressStages: heightWorker.progress.map(item => item.stage)
};
report.height.scopes = {};
for (const scope of ["base", "downstream"]) report.height.scopes[scope] = await verifyHeightScopeContract(source, scope);
console.log("[composite-worker] 高度 legacy / worker / fallback / patch / undo-redo 通过");

const requestedClimateSystems = ["zones"];
const climatePreview = inspectClimateDownstreamRebuild(source, {systems: requestedClimateSystems, seed: "climate-composite"});
assert.equal(climatePreview.executionOrder.at(-1), "zones");
assert(!climatePreview.executionOrder.includes("economy"), "气候下游错误地把 economy 拆成独立执行步骤");
const economyPreview = inspectClimateDownstreamRebuild(source, {systems: ["economy"], seed: "climate-economy-covered"});
assert.deepEqual(economyPreview.executionOrder, ["markers"], "economy 应继续由 markers 组合步骤覆盖");
assert.equal(economyPreview.candidates.find(item => item.id === "economy")?.coveredBy, "markers");

const expectedClimate = structuredClone(source);
const legacyClimate = executeClimateDownstreamRebuild({
  map: expectedClimate,
  editHistory: fakeHistory(),
  systems: requestedClimateSystems,
  seed: "climate-composite",
  executeSystem: (system, {constraintBundle}) => executeClimateSystem(expectedClimate, system, constraintBundle),
  executeCommand: command => executePreparedCommand(command, expectedClimate),
  refreshSummary: refreshGenerationSummary
});
assert.equal(legacyClimate.executed, true);
const climateWorker = await runWorkerMode(CLIMATE_DOWNSTREAM_WORKER_TASK, {
  map: source,
  systems: requestedClimateSystems,
  seed: "climate-composite",
  render: createRenderRequest()
}, "climate-worker");
const climateWorkingMap = climateWorker.input.map;
refreshGenerationSummary(climateWorkingMap);
assertStableMapEqual(climateWorkingMap, expectedClimate, "气候下游 Worker 与既有编排不一致");
assert.equal(climateWorker.output.result.executed, true);
assertPreparedOutput(climateWorker.output, "气候下游");
assert.equal(Object.prototype.hasOwnProperty.call(climateWorker.output, "map"), false);
assert.equal(Object.prototype.hasOwnProperty.call(climateWorker.output, "sourceMap"), false);

const climateFallback = await runFallbackMode(CLIMATE_DOWNSTREAM_WORKER_TASK, {
  map: source,
  systems: requestedClimateSystems,
  seed: "climate-composite",
  render: createRenderRequest()
});
assertPreparedOutput(climateFallback.output, "气候下游 fallback");
refreshGenerationSummary(climateFallback.input.map);
assertStableMapEqual(climateFallback.input.map, climateWorkingMap, "气候下游 Worker 与 fallback handler 语义不一致");
const climateFormal = structuredClone(source);
const climateCommand = createDomainPatchCommand({
  patch: climateWorker.output.patch,
  policy: getClimateDownstreamPatchPolicy(climateWorker.output.result.steps.map(step => step.system)),
  label: "气候下游 Worker 测试补丁",
  effects: {}
});
climateCommand.apply({map: climateFormal});
refreshGenerationSummary(climateFormal);
assert.deepEqual(climateFormal.summary, climateWorkingMap.summary, "气候补丁提交后主线程 summary 不精确");
assertStableMapEqual(climateFormal, climateWorkingMap, "气候补丁没有应用到 fresh map");
assertCompleteAliases(climateFormal, "气候提交");
climateCommand.revert({map: climateFormal});
refreshGenerationSummary(climateFormal);
assertStableMapEqual(climateFormal, source, "气候补丁撤销没有恢复源图");
assertCompleteAliases(climateFormal, "气候撤销");
climateCommand.apply({map: climateFormal});
refreshGenerationSummary(climateFormal);
assertStableMapEqual(climateFormal, climateWorkingMap, "气候补丁重做没有恢复结果");
assertCompleteAliases(climateFormal, "气候重做");
assert(collectWorkerTaskTransferables(CLIMATE_DOWNSTREAM_WORKER_TASK, climateWorker.output).length > 0, "气候 registry 缺少 transferable 收集结果");
report.climate = {
  patchOperations: climateWorker.output.patch.operations.length,
  executionOrder: climateWorker.output.result.executionOrder,
  economyCoveredBy: economyPreview.candidates.find(item => item.id === "economy")?.coveredBy,
  inputPackets: climateWorker.inputPackets,
  outputPackets: climateWorker.outputPackets
};
console.log("[composite-worker] 气候 legacy / worker / fallback / patch / undo-redo 通过");

const expectedOcean = structuredClone(source);
const expectedOceanIdentity = snapshotOceanCurrentWorldIdentity(expectedOcean);
const observedLegacySeeds = [];
const legacyOcean = await executeOceanCurrentWorldRebuild({
  map: expectedOcean,
  editHistory: fakeHistory(),
  seed: "ocean-composite",
  executeStage: (system, stageContext) => {
    observedLegacySeeds.push(stageContext.seed);
    return rebuildOceanCurrentWorldStage(expectedOcean, system, stageContext);
  },
  executeCommand: command => executePreparedCommand(command, expectedOcean),
  refreshSummary: () => finalizeOceanWorld(expectedOcean, expectedOceanIdentity, "ocean-composite", false)
});
assert.equal(legacyOcean.executed, true);
assert.deepEqual(new Set(observedLegacySeeds), new Set([legacyOcean.preview.seed]), "旧整链编排没有显式传递 preview.seed");
const oceanWorker = await runWorkerMode(OCEAN_CURRENT_WORLD_WORKER_TASK, {
  map: source,
  seed: "ocean-composite",
  render: createRenderRequest()
}, "ocean-worker");
const oceanReplacement = oceanWorker.output.replacementMap;
assert.equal(oceanWorker.output.result.executed, true);
assertPreparedOutput(oceanWorker.output, "洋流世界");
assert.equal(Object.prototype.hasOwnProperty.call(oceanWorker.output, "sourceMap"), false);
assertStableMapEqual(oceanReplacement, expectedOcean, "洋流世界 Worker 与正式旧整链编排不一致");
assert.equal(oceanReplacement.grid.cells.temp[0], expectedOcean.grid.cells.temp[0], "洋流世界 seed 漂移导致温度首值不一致");
assert.equal(
  oceanReplacement.climate.metadata.oceanCurrentInfluence?.checksum,
  expectedOcean.climate.metadata.oceanCurrentInfluence?.checksum,
  "洋流气候影响 checksum 不一致"
);
assertCompleteAliases(oceanReplacement, "洋流 replacement");
const oceanFallback = await runFallbackMode(OCEAN_CURRENT_WORLD_WORKER_TASK, {map: source, seed: "ocean-composite", render: createRenderRequest()});
assertPreparedOutput(oceanFallback.output, "洋流世界 fallback");
assertStableMapEqual(oceanFallback.output.replacementMap, oceanReplacement, "洋流世界 Worker 与 fallback handler 语义不一致");
assertSourceTypedUnchanged(source.pack.cells.h, sourceHeightCapture, "洋流 Worker 输入");
assert(oceanWorker.output.replacementMap.pack.cells.h.byteLength > 0, "洋流 replacement 输出 buffer 被 detach");
assert(oceanWorker.input.map.pack.cells.h.byteLength > 0, "洋流 Worker working buffer 被 output stream detach");
assert(collectWorkerTaskTransferables(OCEAN_CURRENT_WORLD_WORKER_TASK, oceanWorker.output).length > 0, "洋流 registry 缺少 transferable 收集结果");
const oceanFormal = structuredClone(source);
const oceanCommand = createMapReplacementCommand({
  replacementMap: structuredClone(oceanReplacement),
  label: "洋流世界 Worker 测试替换",
  effects: {},
  result: oceanWorker.output.result
});
oceanCommand.apply({map: oceanFormal});
assertStableMapEqual(oceanFormal, oceanReplacement, "洋流 replacement 没有提交到正式地图");
assertCompleteAliases(oceanFormal, "洋流 replacement 提交");
oceanCommand.revert({map: oceanFormal});
assertStableMapEqual(oceanFormal, source, "洋流 replacement 撤销没有恢复源图");
oceanCommand.apply({map: oceanFormal});
assertStableMapEqual(oceanFormal, oceanReplacement, "洋流 replacement 重做没有恢复结果");
const oceanFaultTarget = structuredClone(source);
const oceanFaultBefore = structuredClone(oceanFaultTarget);
const oceanFaultCommand = createMapReplacementCommand({
  replacementMap: structuredClone(oceanReplacement),
  effects: {},
  afterSwap() {
    throw new Error("replacement-commit-fault");
  }
});
assert.throws(() => oceanFaultCommand.apply({map: oceanFaultTarget}), /replacement-commit-fault/);
assertStableMapEqual(oceanFaultTarget, oceanFaultBefore, "洋流 replacement 提交故障没有精确回滚");

const seafloorSource = generatePlaceholderMap({seed: "composite-worker-seafloor", cellsTarget: 2000, heightmapTemplate: "continents"});
const seafloorPlan = buildSeafloorResetPlan(seafloorSource, {seed: "composite-seafloor-plan"});
assert(seafloorPlan.stats.changedCells > 0, "海底复合夹具没有变化");
const expectedSeafloor = structuredClone(seafloorSource);
const expectedSeafloorIdentity = snapshotOceanCurrentWorldIdentity(expectedSeafloor);
const expectedSeafloorExecution = await executeOceanCurrentWorldRebuild({
  map: expectedSeafloor,
  editHistory: fakeHistory(),
  seed: "composite-seafloor-world",
  executePrepare() {
    const command = createResetSeafloorCommand(seafloorPlan);
    command.apply({map: expectedSeafloor});
    return {executed: true, result: command.getResult()};
  },
  executeStage: (system, stageContext) => rebuildOceanCurrentWorldStage(expectedSeafloor, system, stageContext),
  executeCommand: command => executePreparedCommand(command, expectedSeafloor),
  refreshSummary: () => finalizeOceanWorld(expectedSeafloor, expectedSeafloorIdentity, "composite-seafloor-world", true)
});
assert.equal(expectedSeafloorExecution.preview.includeSeafloor, true);
const seafloorWorker = await runWorkerMode(OCEAN_CURRENT_WORLD_WORKER_TASK, {
  map: seafloorSource,
  seed: "composite-seafloor-world",
  render: createRenderRequest(),
  seafloorPlan
}, "ocean-seafloor-worker");
assert.equal(seafloorWorker.output.result.includeSeafloor, true);
assert.equal(seafloorWorker.output.result.steps[0]?.system, "seafloor");
assertStableMapEqual(seafloorWorker.output.replacementMap, expectedSeafloor, "海底 + 洋流世界 Worker 与正式旧整链不一致");
assertCompleteAliases(seafloorWorker.output.replacementMap, "海底洋流 replacement");
report.ocean = {
  executionOrder: oceanWorker.output.result.executionOrder,
  legacySeed: legacyOcean.preview.seed,
  temperature0: oceanReplacement.grid.cells.temp[0],
  inputPackets: oceanWorker.inputPackets,
  outputPackets: oceanWorker.outputPackets,
  seafloor: {
    changedCells: seafloorPlan.stats.changedCells,
    resultChecksum: seafloorPlan.resultChecksum,
    outputPackets: seafloorWorker.outputPackets
  }
};
console.log("[composite-worker] 洋流 legacy seed / worker / fallback / replacement / seafloor 通过");

report.locks.heightRivers = await verifyHeightRiverLocks(source);
report.locks.climateZones = await verifyClimateZoneLocks(source);
report.locks.oceanRivers = await verifyOceanRiverLocks(source);
await verifyCancelAndFault(source);
await verifyObsoleteFallback(source);
report.safety = {
  sourceBufferHash: sourceHeightCapture.hash,
  cancellation: taskNames,
  faults: ["height-after-rivers", "climate-after-markers", "ocean-after-climate"],
  obsolete: taskNames
};
console.log("[composite-worker] 锁 / 取消 / 故障拒绝通过");

console.log("[composite-worker] 正在生成并重建 100k 高度基础派生夹具");
let largeSource = generatePlaceholderMap({seed: "composite-worker-100k", cellsTarget: 100000, heightmapTemplate: "continents"});
const largeSourceCapture = captureTyped(largeSource.pack.cells.h);
let largeWorkingMap = structuredClone(largeSource);
let largeCheckpoints = 0;
const largeProgress = [];
let largeResult = await getWorkerTaskHandler(HEIGHT_DERIVED_WORKER_TASK)({map: largeWorkingMap, scope: "base"}, {
  binding,
  checkpoint() {
    largeCheckpoints += 1;
    return true;
  },
  report(stage, detail) {
    largeProgress.push({stage, ...detail});
  }
});
const largeResultCapture = captureTyped(largeWorkingMap.pack.cells.h);
const largeTransit = await graphRoundTrip(largeResult, "height-100k-output");
assert.equal(largeResult.result.executed, true);
assert.equal(largeWorkingMap.grid.cells.i.length, 99846);
assert(largeWorkingMap.pack.cells.i.length >= 50000 && largeWorkingMap.pack.cells.i.length <= 100000);
assert(largeResult.patch.operations.length >= 50);
assert(largeTransit.packets > 1);
assert(largeCheckpoints >= 8);
for (const stage of ["features", "rivers", "states", "patch"]) {
  assert(largeProgress.some(item => item.stage === stage), `100k 高度基础缺少 ${stage} 进度`);
}
assert.equal(Object.prototype.hasOwnProperty.call(largeTransit.value, "sourceMap"), false);
assertSourceTypedUnchanged(largeSource.pack.cells.h, largeSourceCapture, "100k 高度正式输入");
assertSourceTypedUnchanged(largeWorkingMap.pack.cells.h, largeResultCapture, "100k 高度 Worker 输出流");
assert(largeTransit.value.patch.operations.length === largeResult.patch.operations.length);
report.large = {
  gridCells: largeWorkingMap.grid.cells.i.length,
  packCells: largeWorkingMap.pack.cells.i.length,
  patchOperations: largeResult.patch.operations.length,
  outputPackets: largeTransit.packets,
  checkpoints: largeCheckpoints,
  sourceHash: largeSourceCapture.hash,
  outputHash: largeResultCapture.hash
};
largeResult = null;
largeWorkingMap = null;
largeSource = null;
globalThis.gc?.();

assertSourceTypedUnchanged(source.pack.cells.h, sourceHeightCapture, "复合专项结束后的正式源图");
assertStableMapEqual(source, sourceSnapshot, "复合专项结束后正式源图发生变化");
assertCompleteAliases(source, "复合专项源图");
console.log(JSON.stringify({status: "PASS", ...report}, null, 2));

async function verifyFormalRuntimeWiring() {
  const [appSource, consoleApiSource] = await Promise.all([
    readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8"),
    readFile(new URL("../app/webgl-generator/src/runtime/console-api.js", import.meta.url), "utf8")
  ]);
  const heightEntries = [
    ["rebuildBaseDerived", "base"],
    ["rebuildDownstreamDerived", "downstream"],
    ["rebuildAllDerived", "all"]
  ];
  for (const [method, scope] of heightEntries) {
    assert.match(
      appSource,
      new RegExp(`${method}: \\(editOptions = \\{\\}\\) => operation\\.run\\([\\s\\S]{0,240}rebuildHeightDerivedViaAction\\(state, documentRef, "${scope}", editOptions, context\\)`),
      `高度 ${scope} 正式入口未通过 operation.run 接入统一重建动作`
    );
    assert.match(
      consoleApiSource,
      new RegExp(`"height\\.${method}": \\{[^\\n]+async: true`),
      `height.${method} 公开元数据未声明 async`
    );
  }
  assert.match(
    appSource,
    /applyDownstreamRebuild: \(options = \{\}\) => operation\.run\([\s\S]{0,240}applyClimateDownstreamRebuildViaApi\(state, documentRef, options, context\)/,
    "气候下游正式入口未通过 operation.run 接入统一重建动作"
  );
  assert.match(
    appSource,
    /rebuildWorld: \(options = \{\}\) => operation\.run\([\s\S]{0,240}applyOceanCurrentWorldRebuildViaAction\(state, documentRef, options, context\)/,
    "洋流世界正式入口未通过 operation.run 接入统一重建动作"
  );

  const heightAction = extractTopLevelFunctionSource(appSource, "rebuildHeightDerivedViaAction");
  const climateAction = extractTopLevelFunctionSource(appSource, "applyClimateDownstreamRebuildViaApi");
  const oceanAction = extractTopLevelFunctionSource(appSource, "applyOceanCurrentWorldRebuildViaAction");
  const generationAction = extractTopLevelFunctionSource(appSource, "generateMapOffMainThread");
  const mapLoadAction = extractTopLevelFunctionSource(appSource, "loadMapIntoRuntime");
  const coordinator = extractTopLevelFunctionSource(appSource, "executeWorkerMapMutation");
  const outputBindingAssertion = extractTopLevelFunctionSource(appSource, "assertWorkerRegenerationOutputCurrent");
  assert.match(heightAction, /executeWorkerMapMutation\(state, documentRef, \{/);
  assert.match(heightAction, /task: HEIGHT_DERIVED_WORKER_TASK/);
  assert.match(climateAction, /executeWorkerMapMutation\(state, documentRef, \{/);
  assert.match(climateAction, /task: CLIMATE_DOWNSTREAM_WORKER_TASK/);
  assert.match(oceanAction, /executeWorkerMapMutation\(state, documentRef, \{/);
  assert.match(oceanAction, /task: OCEAN_CURRENT_WORLD_WORKER_TASK/);
  assert.match(generationAction, /workerTaskCoordinator\.run\(GENERATION_WORKER_TASK,/);
  assert.match(generationAction, /createWorkerRegenerationRenderRequest\(state, "generation", renderBinding, \[\.\.\.RENDER_PREPARATION_LAYERS\]\)/);
  assert.match(mapLoadAction, /prepareRendererWorkerInstall\(state\.renderer, map, preparedRender,/);
  assert.match(mapLoadAction, /completePreparedMapLoadAsync\(state\.map, rendererLoadOptions\)/);
  assert.match(mapLoadAction, /await refreshRuntimeAfterMapLoadAsync\(state, documentRef/);
  assert.match(appSource, /id:\s*"namebase",\s*run:\s*\(\)\s*=>\s*updateNamebasePanel\(state\)/);
  assert.match(mapLoadAction, /deferOverlayLayout:\s*true/);
  assert.match(mapLoadAction, /revealPreparedOverlay:\s*Boolean\(preparedInstall\)/);
  assert.doesNotMatch(appSource, /GenerationWorker from "\.\/generation-worker\.js\?worker"/);
  assert.match(coordinator, /state\.workerTaskCoordinator\.run\(task,/);
  assert.match(coordinator, /assertWorkerRegenerationOutputCurrent\(state, binding, output, operation\)/);
  assert.match(outputBindingAssertion, /sameRegenerationWorkerBinding\(output\?\.binding, binding\)/);

  return {
    height: heightEntries.map(([, scope]) => scope),
    climate: CLIMATE_DOWNSTREAM_WORKER_TASK,
    ocean: OCEAN_CURRENT_WORLD_WORKER_TASK,
    generation: GENERATION_WORKER_TASK,
    coordinator: "executeWorkerMapMutation"
  };
}

function extractTopLevelFunctionSource(source, name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert(match, `未找到正式函数 ${name}`);
  const end = source.indexOf("\n}\n\n", match.index);
  assert(end >= 0, `无法确定正式函数 ${name} 的边界`);
  return source.slice(match.index, end + 2);
}

async function runWorkerMode(task, payload, streamPrefix) {
  const inputTransit = await graphRoundTrip(payload, `${streamPrefix}:input`);
  const progress = [];
  const direct = await getWorkerTaskHandler(task)(inputTransit.value, context(progress));
  const directBufferCaptures = collectViews(direct).slice(0, 8).map(view => ({view, capture: captureTyped(view)}));
  const outputTransit = await graphRoundTrip(direct, `${streamPrefix}:output`);
  for (const item of directBufferCaptures) assertSourceTypedUnchanged(item.view, item.capture, `${task} output stream`);
  return {
    input: inputTransit.value,
    output: outputTransit.value,
    inputPackets: inputTransit.packets,
    outputPackets: outputTransit.packets,
    progress
  };
}

async function runFallbackMode(task, payload) {
  const input = structuredClone(payload);
  const coordinator = createWorkerTaskCoordinator({
    getBinding: () => binding,
    validateBinding: candidate => JSON.stringify(candidate) === JSON.stringify(binding)
  });
  const output = await coordinator.run(task, input, {forceFallback: true, payloadIsolated: true});
  assert.equal(output.worker.mode, "fallback", `${task} 没有走正式 fallback 路径`);
  return {input, output};
}

async function graphRoundTrip(value, streamId) {
  const decoder = createWorkerGraphDecoder({streamId});
  let packets = 0;
  let transferredBytes = 0;
  for await (const packet of encodeWorkerGraph(value, {
    streamId,
    packetUnits: 1024,
    recordUnits: 128,
    sliceBytes: 128 * 1024,
    budgetMs: 4,
    yieldToMain: () => new Promise(resolve => setImmediate(resolve))
  })) {
    transferredBytes += packet.transferables.reduce((sum, buffer) => sum + buffer.byteLength, 0);
    const message = structuredClone(packet.message, packet.transferables.length ? {transfer: packet.transferables} : undefined);
    decoder.push(message);
    packets += 1;
  }
  return {value: decoder.finish(), packets, transferredBytes};
}

function runLegacyHeight(map, scope = "all") {
  const constraintBundle = captureRegenerationConstraintBundle(map, {closure: ["world"]});
  const regenerate = kind => {
    const domain = heightDomain(kind);
    constraintBundle.assertDomain(map, domain, "before");
    if (constraintBundle.isDomainFullyLocked(domain)) {
      constraintBundle.assertDomain(map, domain, "skip");
      return {kind, action: kind, executed: true, skipped: true, status: "锁定领域已完整跳过"};
    }
    const result = regenerateMapAttributeForWorker(map, kind, {
      scope: "all",
      constraintBundle
    });
    constraintBundle.assertDomain(map, domain, "after");
    return result;
  };
  const result = scope === "base"
    ? rebuildHeightBaseDerived(regenerate)
    : scope === "downstream"
      ? rebuildHeightDownstreamDerived(regenerate)
      : rebuildHeightAllDerived(regenerate);
  constraintBundle.assertDomain(map, "world", "after");
  return result;
}

async function verifyHeightScopeContract(sourceMap, scope) {
  const expected = structuredClone(sourceMap);
  const legacy = runLegacyHeight(expected, scope);
  assert.equal(legacy.executed, true, `高度 ${scope} 旧编排没有执行`);
  refreshGenerationSummary(expected);
  const worker = await runWorkerMode(HEIGHT_DERIVED_WORKER_TASK, {
    map: sourceMap,
    scope,
    render: createRenderRequest()
  }, `height-${scope}-worker`);
  refreshGenerationSummary(worker.input.map);
  assertPreparedOutput(worker.output, `高度 ${scope}`);
  assertStableMapEqual(worker.input.map, expected, `高度 ${scope} Worker 与旧编排不一致`);
  const fallback = await runFallbackMode(HEIGHT_DERIVED_WORKER_TASK, {
    map: sourceMap,
    scope,
    render: createRenderRequest()
  });
  refreshGenerationSummary(fallback.input.map);
  assertPreparedOutput(fallback.output, `高度 ${scope} fallback`);
  assertStableMapEqual(fallback.input.map, worker.input.map, `高度 ${scope} fallback 语义不一致`);
  const formal = structuredClone(sourceMap);
  const command = createDomainPatchCommand({
    patch: worker.output.patch,
    policy: getHeightDerivedPatchPolicy(scope, worker.output.result.changedKinds),
    label: `高度 ${scope} Worker 测试补丁`,
    effects: {}
  });
  command.apply({map: formal});
  refreshGenerationSummary(formal);
  assertStableMapEqual(formal, worker.input.map, `高度 ${scope} 补丁提交不一致`);
  command.revert({map: formal});
  refreshGenerationSummary(formal);
  assertStableMapEqual(formal, sourceMap, `高度 ${scope} 补丁撤销不一致`);
  command.apply({map: formal});
  refreshGenerationSummary(formal);
  assertStableMapEqual(formal, worker.input.map, `高度 ${scope} 补丁重做不一致`);
  return {
    patchOperations: worker.output.patch.operations.length,
    preparedLayers: Object.keys(worker.output.preparedRender.layers),
    fallback: fallback.output.worker.mode
  };
}

function executeClimateSystem(map, system, constraintBundle) {
  assert.notEqual(system, "economy", "economy 独立分支不应从现有气候公开链到达");
  return regenerateMapAttributeForWorker(map, system, {
    scope: "all",
    constraintBundle
  });
}

function finalizeOceanWorld(map, identity, seed, seafloor) {
  assertOceanCurrentWorldIdentity(map, identity);
  syncMilitaryStateMirrors(map);
  reconcileWarDerivedData(map);
  const store = ensureLabelStore(map);
  store.hidden[LABEL_TARGET_KIND.CITY] = [];
  store.metadata = {
    custom: store.custom.length,
    hidden: store.hidden[LABEL_TARGET_KIND.CITY].length + store.hidden[LABEL_TARGET_KIND.STATE].length
  };
  markDerivedFresh(map, [
    "ocean-currents", "climate", "rivers", "biomes", "population", "cultures", "cities", "routes",
    "states", "provinces", "religions", "markers", "economy", "diplomacy", "military", "zones"
  ]);
  refreshGenerationSummary(map);
  map.generationLog ||= [];
  map.generationLog.push(`rebuild ocean current world: seed=${seed || "auto"}, seafloor=${Boolean(seafloor)}`);
}

function refreshGenerationSummary(map) {
  map.summary = createGenerationSummary(
    map.options,
    map.grid,
    map.features,
    map.climate,
    map.society,
    map.politics,
    map.settlements,
    map.markers,
    map.pack,
    map.rivers,
    map.layers,
    map.military,
    map.zones,
    map.economy,
    map.diplomacy
  );
}

function markDerivedFresh(map, systems) {
  map.metadata ||= {};
  const stale = new Set(map.metadata.derivedStale?.systems || []);
  for (const system of systems) stale.delete(system);
  const remaining = [...stale];
  if (remaining.length) map.metadata.derivedStale = {systems: remaining, updatedAt: new Date().toISOString()};
  else delete map.metadata.derivedStale;
  for (const system of ["markers", "economy", "diplomacy", "military", "zones"]) {
    if (map[system]?.metadata) map[system].metadata.stale = remaining.includes(system);
  }
}

async function verifyHeightRiverLocks(sourceMap) {
  const map = structuredClone(sourceMap);
  const rivers = activeObjects(map.rivers?.rivers);
  assert(rivers.length > 0, "高度锁夹具缺少河流");
  lockObjects(map, OBJECT_KIND.RIVER, rivers);
  const before = new Map(rivers.map(item => [objectId(item), structuredClone(item)]));
  const beforeLakeEdges = captureLockedRiverLakeEdges(map, new Set(before.keys()));
  assert(beforeLakeEdges.length > 0, "高度锁夹具缺少河流 lake in/out 镜像");
  const salt = Number(map.metadata?.regeneration?.rivers || 0);
  const output = await getWorkerTaskHandler(HEIGHT_DERIVED_WORKER_TASK)({map, scope: "base"}, context([]));
  const after = activeObjects(map.rivers?.rivers).filter(item => before.has(objectId(item)));
  assert.equal(after.length, before.size);
  for (const item of after) assert.deepEqual(item, before.get(objectId(item)), `锁定河流 #${objectId(item)} 被高度重建改写`);
  assert.deepEqual(captureLockedRiverLakeEdges(map, new Set(before.keys())), beforeLakeEdges, "高度 Feature 前序移除了锁定河流 lake in/out 镜像");
  assert.equal(Number(map.metadata?.regeneration?.rivers || 0), salt, "全河锁时高度重建推进了 rivers salt");

  const unsafeMap = structuredClone(sourceMap);
  const unsafeRivers = activeObjects(unsafeMap.rivers?.rivers);
  lockObjects(unsafeMap, OBJECT_KIND.RIVER, unsafeRivers);
  const unsafeRiverIds = new Set(unsafeRivers.map(objectId));
  const unsafeLakeId = captureLockedRiverLakeEdges(unsafeMap, unsafeRiverIds)[0]?.id;
  assert(Number.isSafeInteger(unsafeLakeId), "高度锁负例缺少关联湖泊");
  const unsafePackCells = [];
  for (let cell = 0; cell < (unsafeMap.pack?.cells?.f?.length || 0); cell++) {
    if (Number(unsafeMap.pack.cells.f[cell]) === unsafeLakeId) unsafePackCells.push(cell);
  }
  assert(unsafePackCells.length > 0, "高度锁负例的关联湖泊缺少 pack cells");
  const unsafeGridCells = new Set(unsafePackCells.map(cell => Number(unsafeMap.pack.cells.g[cell])));
  for (const cell of unsafePackCells) unsafeMap.pack.cells.h[cell] = 20;
  for (const cell of unsafeGridCells) unsafeMap.grid.cells.h[cell] = 20;
  const unsafeError = await getWorkerTaskHandler(HEIGHT_DERIVED_WORKER_TASK)({map: unsafeMap, scope: "base"}, context([])).then(() => null, error => error);
  assert.equal(unsafeError?.code, "regeneration_lock_conflict", "关联湖泊拓扑不安全时没有在提交前结构化拒绝");
  assert.equal(unsafeError?.details?.kind, "feature", `关联湖泊拓扑拒绝领域不精确：${JSON.stringify(unsafeError?.details || {})}`);
  assert.equal(unsafeError?.details?.reason, "locked-feature-topology-changed", `关联湖泊拓扑拒绝原因不精确：${JSON.stringify(unsafeError?.details || {})}`);
  return {locked: before.size, preserved: after.length, lakeEdges: beforeLakeEdges.length, unsafeCode: unsafeError.code, unsafeReason: unsafeError.details.reason, salt, executed: output.result.executed};
}

function captureLockedRiverLakeEdges(map, lockedRiverIds) {
  return (map?.pack?.features || []).filter(feature => feature?.type === "lake").flatMap(feature => {
    const river = Number(feature.river);
    const outlet = Number(feature.outlet);
    const inlets = [...new Set((feature.inlets || []).map(Number).filter(id => lockedRiverIds.has(id)))].sort((a, b) => a - b);
    if (!lockedRiverIds.has(river) && !lockedRiverIds.has(outlet) && !inlets.length) return [];
    return [{
      id: Number(feature.i ?? feature.id),
      river: lockedRiverIds.has(river) ? river : 0,
      outlet: lockedRiverIds.has(outlet) ? outlet : 0,
      inlets
    }];
  }).sort((a, b) => a.id - b.id);
}

async function verifyClimateZoneLocks(sourceMap) {
  const map = structuredClone(sourceMap);
  const zones = activeObjects(map.zones?.zones);
  assert(zones.length > 0, "气候锁夹具缺少地区");
  lockObjects(map, OBJECT_KIND.ZONE, zones);
  const before = new Map(zones.map(item => [objectId(item), structuredClone(item)]));
  const salt = Number(map.metadata?.regeneration?.zones || 0);
  const output = await getWorkerTaskHandler(CLIMATE_DOWNSTREAM_WORKER_TASK)({
    map,
    systems: ["zones"],
    seed: "climate-zone-lock"
  }, context([]));
  const after = activeObjects(map.zones?.zones).filter(item => before.has(objectId(item)));
  assert.equal(after.length, before.size);
  for (const item of after) assert.deepEqual(item, before.get(objectId(item)), `锁定地区 #${objectId(item)} 被气候重算改写`);
  assert.equal(Number(map.metadata?.regeneration?.zones || 0), salt, "全地区锁时气候重算推进了 zones salt");
  return {locked: before.size, preserved: after.length, salt, executed: output.result.executed};
}

async function verifyOceanRiverLocks(sourceMap) {
  const map = structuredClone(sourceMap);
  const rivers = activeObjects(map.rivers?.rivers);
  assert(rivers.length > 0, "洋流锁夹具缺少河流");
  lockObjects(map, OBJECT_KIND.RIVER, rivers);
  const before = new Map(rivers.map(item => [objectId(item), structuredClone(item)]));
  const output = await getWorkerTaskHandler(OCEAN_CURRENT_WORLD_WORKER_TASK)({
    map,
    seed: "ocean-river-lock"
  }, context([]));
  const riverStep = output.result.steps.find(step => step.system === "rivers");
  assert.equal(riverStep?.executed, false);
  assert.equal(riverStep?.reason, "domain-fully-locked");
  const after = activeObjects(map.rivers?.rivers).filter(item => before.has(objectId(item)));
  assert.equal(after.length, before.size);
  for (const item of after) assert.deepEqual(item, before.get(objectId(item)), `锁定河流 #${objectId(item)} 被洋流整链改写`);
  return {locked: before.size, preserved: after.length, stageReason: riverStep.reason};
}

async function verifyCancelAndFault(sourceMap) {
  const cancelCases = [
    [HEIGHT_DERIVED_WORKER_TASK, {map: structuredClone(sourceMap), scope: "all"}],
    [CLIMATE_DOWNSTREAM_WORKER_TASK, {map: structuredClone(sourceMap), systems: ["zones"], seed: "climate-cancel"}],
    [OCEAN_CURRENT_WORLD_WORKER_TASK, {map: structuredClone(sourceMap), seed: "ocean-cancel"}],
    [GENERATION_WORKER_TASK, structuredClone(generationPayload)]
  ];
  for (const [task, payload] of cancelCases) {
    let checks = 0;
    await assert.rejects(
      () => getWorkerTaskHandler(task)(payload, {
        binding,
        checkpoint() {
          checks += 1;
          return checks < 3;
        },
        report() {}
      }),
      error => error?.name === "AbortError",
      `${task} checkpoint 取消没有返回 AbortError`
    );
  }
  const faultCases = [
    [HEIGHT_DERIVED_WORKER_TASK, {map: structuredClone(sourceMap), scope: "all", faultAt: "after:rivers"}, "worker_height_derived_fault"],
    [CLIMATE_DOWNSTREAM_WORKER_TASK, {map: structuredClone(sourceMap), systems: ["zones"], seed: "climate-fault", faultAt: "after:markers"}, "worker_climate_downstream_fault"],
    [OCEAN_CURRENT_WORLD_WORKER_TASK, {map: structuredClone(sourceMap), seed: "ocean-fault", faultAt: "after:climate"}, "worker_ocean_current_world_fault"]
  ];
  for (const [task, payload, code] of faultCases) {
    await assert.rejects(
      () => getWorkerTaskHandler(task)(payload, context([])),
      error => error?.code === code && /故障注入/.test(error.message),
      `${task} 故障注入没有返回结构化错误`
    );
  }
}

async function verifyObsoleteFallback(sourceMap) {
  const cases = [
    [HEIGHT_DERIVED_WORKER_TASK, {map: sourceMap, scope: "base", render: createRenderRequest()}],
    [CLIMATE_DOWNSTREAM_WORKER_TASK, {map: sourceMap, systems: ["zones"], seed: "climate-obsolete", render: createRenderRequest()}],
    [OCEAN_CURRENT_WORLD_WORKER_TASK, {map: sourceMap, seed: "ocean-obsolete", render: createRenderRequest()}],
    [GENERATION_WORKER_TASK, structuredClone(generationPayload)]
  ];
  assert.deepEqual(cases.map(([task]) => task), taskNames, "过期 fallback 反例没有覆盖全部正式任务");
  for (const [task, payload] of cases) {
    let valid = true;
    const coordinator = createWorkerTaskCoordinator({
      getBinding: () => binding,
      validateBinding: () => valid
    });
    await assert.rejects(
      () => coordinator.run(task, payload, {
        forceFallback: true,
        onProgress() {
          valid = false;
        }
      }),
      error => error?.code === "operation_obsolete",
      `${task} 过期 fallback 结果没有拒绝`
    );
  }
}

function createRenderRequest() {
  return {
    binding: {
      mapIdentity: binding.mapIdentity,
      mapRevision: binding.mapRevision,
      sourceRevision: binding.mapRevision,
      topologyRevision: binding.topologyRevision,
      renderPreparationId: "composite-fixture:render:7",
      renderGeneration: binding.generationToken
    },
    layers: ["point"],
    camera: {scale: 1, offsetX: 0, offsetY: 0},
    canvas: {width: 1200, height: 720, clientWidth: 1200, clientHeight: 720},
    visibility: {},
    visualTheme: {},
    unitPreferences: {},
    viewOptions: {},
    labelOptions: {}
  };
}

function assertPreparedOutput(output, label) {
  assert.deepEqual(output.binding, binding, `${label} 输出绑定不精确`);
  assert(output.preparedRender, `${label} 缺少 preparedRender`);
  assert.deepEqual(output.preparedRender.binding, {
    mapIdentity: binding.mapIdentity,
    mapRevision: binding.mapRevision,
    sourceRevision: binding.mapRevision,
    topologyRevision: binding.topologyRevision,
    renderPreparationId: "composite-fixture:render:7",
    renderGeneration: binding.generationToken
  }, `${label} preparedRender 绑定不精确`);
  assert(output.preparedRender.layers.point?.vertices instanceof Float32Array, `${label} 缺少 point 渲染准备结果`);
}

function lockObjects(map, kind, items) {
  map.regenerationLocks = {
    version: 1,
    entries: items.map(item => ({kind, id: objectId(item)}))
  };
}

function activeObjects(items = []) {
  return items.filter(item => item && !item.removed && Number.isFinite(objectId(item)) && objectId(item) >= 0);
}

function objectId(item) {
  return Number(item?.id ?? item?.i);
}

function fakeHistory() {
  return {createSnapshot: () => ({cursor: 0}), restoreSnapshot: () => {}};
}

function executePreparedCommand(command, map) {
  command.apply({map});
  return {executed: true, command};
}

function context(progress) {
  return {
    binding,
    checkpoint() {
      return true;
    },
    report(stage, detail) {
      progress.push({stage, ...detail});
    }
  };
}

function heightDomain(kind) {
  return ({
    features: "features",
    rivers: "rivers",
    states: "states-provinces",
    religions: "religions",
    markers: "markers-economy",
    diplomacy: "diplomacy",
    military: "military",
    zones: "zones"
  })[kind] || kind;
}

function assertCompleteAliases(map, label) {
  const pairs = [
    ["states", map.pack?.states, map.politics?.states],
    ["provinces", map.pack?.provinces, map.politics?.provinces],
    ["rivers", map.pack?.rivers, map.rivers?.rivers],
    ["goods", map.pack?.goods, map.economy?.goods],
    ["markets", map.pack?.markets, map.economy?.markets],
    ["deals", map.pack?.deals, map.economy?.deals],
    ["cultures", map.pack?.cultures, map.society?.cultures],
    ["religions", map.pack?.religions, map.society?.religions],
    ["markers", map.pack?.markers, map.markers?.markers],
    ["zones", map.pack?.zones, map.zones?.zones]
  ];
  for (const [name, left, right] of pairs) {
    assert(left && right, `${label} 缺少 ${name} 镜像`);
    assert.equal(left, right, `${label} 破坏 ${name} 完整别名`);
  }
}

function captureTyped(view) {
  assert(ArrayBuffer.isView(view), "buffer 捕获目标必须是 TypedArray");
  return {
    buffer: view.buffer,
    byteLength: view.byteLength,
    hash: typedHash(view)
  };
}

function assertSourceTypedUnchanged(view, capture, label) {
  assert.equal(view.buffer, capture.buffer, `${label} 更换了正式 buffer 引用`);
  assert.equal(view.byteLength, capture.byteLength, `${label} detach 了正式 buffer`);
  assert.equal(typedHash(view), capture.hash, `${label} 改写了正式 buffer 内容`);
}

function typedHash(view) {
  return createHash("sha256")
    .update(Buffer.from(view.buffer, view.byteOffset, view.byteLength))
    .digest("hex");
}

function collectViews(root, limit = 64) {
  const views = [];
  const seen = new WeakSet();
  visit(root);
  return views;

  function visit(value) {
    if (!value || typeof value !== "object" || seen.has(value) || views.length >= limit) return;
    seen.add(value);
    if (ArrayBuffer.isView(value)) {
      views.push(value);
      return;
    }
    if (value instanceof ArrayBuffer) return;
    if (value instanceof Map) {
      for (const [key, item] of value) {
        visit(key);
        visit(item);
      }
      return;
    }
    if (value instanceof Set) {
      for (const item of value) visit(item);
      return;
    }
    for (const key of Object.keys(value)) visit(value[key]);
  }
}

function assertStableMapEqual(actual, expected, message) {
  assertStableValueEqual(stableMap(actual), stableMap(expected), message);
}

function assertStableValueEqual(actual, expected, message) {
  const actualFingerprint = valueFingerprint(actual);
  const expectedFingerprint = valueFingerprint(expected);
  if (actualFingerprint === expectedFingerprint) return;
  const difference = findFirstDifference(actual, expected);
  if (!difference) return;
  assert.fail(`${message}；首个差异：${JSON.stringify(difference)}；actual=${actualFingerprint} expected=${expectedFingerprint}`);
}

function stableMap(map) {
  const clone = structuredClone(map);
  stripVolatile(clone, new WeakSet(), []);
  return clone;
}

function valueFingerprint(value) {
  return createHash("sha256").update(serialize(value)).digest("hex");
}

function stripVolatile(value, seen, path) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return;
  for (const key of Object.keys(value)) {
    const childPath = [...path, key];
    if (key === "generationLog" && Array.isArray(value[key])) {
      value[key] = value[key].filter(entry => typeof entry !== "string" || (
        !entry.startsWith("generation timing:") && !entry.startsWith("grid checksum:")
      ));
    }
    if (isVolatileField(key, childPath)) {
      delete value[key];
      continue;
    }
    stripVolatile(value[key], seen, childPath);
  }
}

function isVolatileField(key, path) {
  if (["updatedAt", "generatedAt", "timing", "provinceTiming", "cultureTiming", "generationTiming", "ms"].includes(key)) return true;
  if (/Ms$/.test(key) || /Timing$/.test(key)) return true;
  const parent = path.at(-2) || "";
  return key === "checksum" && (parent === "summary" || parent === "metadata") && path.length <= 2;
}

function findFirstDifference(actual, expected) {
  const pairs = new WeakMap();
  let visits = 0;
  return compare(actual, expected, "$ ");

  function compare(left, right, path) {
    visits += 1;
    if (visits > 500000) return {path, reason: "difference-search-budget-exhausted"};
    if (Object.is(left, right)) return null;
    if (typeof left !== typeof right) return {path, reason: "type", actual: typeof left, expected: typeof right};
    if (!left || !right || typeof left !== "object") return {path, reason: "value", actual: previewValue(left), expected: previewValue(right)};
    if (ArrayBuffer.isView(left) || ArrayBuffer.isView(right)) {
      if (!ArrayBuffer.isView(left) || !ArrayBuffer.isView(right)) return {path, reason: "typed-kind"};
      if (left.constructor !== right.constructor || left.length !== right.length) {
        return {path, reason: "typed-shape", actual: `${left.constructor.name}:${left.length}`, expected: `${right.constructor.name}:${right.length}`};
      }
      const leftHash = typedHash(left);
      const rightHash = typedHash(right);
      return leftHash === rightHash ? null : {path, reason: "typed-content", actual: leftHash, expected: rightHash};
    }
    let expectedPairs = pairs.get(left);
    if (!expectedPairs) {
      expectedPairs = new WeakSet();
      pairs.set(left, expectedPairs);
    } else if (expectedPairs.has(right)) return null;
    expectedPairs.add(right);
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (leftKeys.length !== rightKeys.length || leftKeys.some((key, index) => key !== rightKeys[index])) {
      return {path, reason: "keys", actual: leftKeys.slice(0, 20), expected: rightKeys.slice(0, 20)};
    }
    for (const key of leftKeys) {
      const difference = compare(left[key], right[key], `${path}.${key}`);
      if (difference) return difference;
    }
    return null;
  }
}

function previewValue(value) {
  if (typeof value === "string") return value.slice(0, 160);
  if (["number", "boolean", "undefined"].includes(typeof value) || value === null) return value;
  return Object.prototype.toString.call(value);
}
