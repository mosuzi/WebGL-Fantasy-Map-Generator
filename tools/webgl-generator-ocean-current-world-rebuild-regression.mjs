#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {applyOceanCurrentClimateInfluence} from "../app/webgl-generator/src/generator/climate.js";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {
  assertOceanCurrentWorldIdentity,
  rebuildOceanCurrentWorldStage,
  snapshotOceanCurrentWorldIdentity
} from "../app/webgl-generator/src/generator/ocean-current-world.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {createCompressedMapDocumentBlob, createMapDocument, parseMapDocument, parseMapDocumentFile, stringifyMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {
  executeOceanCurrentWorldRebuild,
  OCEAN_CURRENT_WORLD_REBUILD_ORDER
} from "../app/webgl-generator/src/runtime/ocean-current-world-rebuild.js";

await verifyTransactionalContract();
const climate = verifyClimateInfluence();
const real = await verifyRealWorldRebuild();
const legacyPolitics = await verifyLegacyPoliticalMirrorCompatibility();
const performanceReports = await verifyPerformanceTiers();
await verifyUiAndRuntimeWiring();

console.log(JSON.stringify({ok: true, order: OCEAN_CURRENT_WORLD_REBUILD_ORDER, climate, real, legacyPolitics, performance: performanceReports}, null, 2));

async function verifyTransactionalContract() {
  const successful = transactionFixture();
  const before = structuredClone(successful.map);
  const result = await runFixture(successful);
  assert.deepEqual(result.executionOrder, OCEAN_CURRENT_WORLD_REBUILD_ORDER);
  assert.equal(successful.history.getStats().undo, 1, "整链重算必须只登记一条历史");
  const after = structuredClone(successful.map);
  successful.history.undo({map: successful.map});
  assert.deepEqual(successful.map, before, "整链撤销没有恢复重算前地图");
  successful.history.redo({map: successful.map});
  assert.deepEqual(successful.map, after, "整链重做没有恢复重算后地图");

  for (const stage of ["seafloor", ...OCEAN_CURRENT_WORLD_REBUILD_ORDER]) {
    const fixture = transactionFixture();
    const snapshot = structuredClone(fixture.map);
    await assert.rejects(() => runFixture(fixture, {prepare: true, faultAt: `after:${stage}`}), /故障注入/);
    assert.deepEqual(fixture.map, snapshot, `故障注入 ${stage} 后留下了部分地图状态`);
    assert.equal(fixture.history.getStats().undo, 0, `故障注入 ${stage} 后留下了历史`);
  }

  const cancelled = transactionFixture();
  const cancelBefore = structuredClone(cancelled.map);
  const controller = new AbortController();
  await assert.rejects(() => runFixture(cancelled, {signal: controller.signal, afterStage: () => controller.abort("测试取消")}), /取消/);
  assert.deepEqual(cancelled.map, cancelBefore, "取消后没有回滚整张地图");

  const stale = transactionFixture();
  const staleBefore = structuredClone(stale.map);
  let current = true;
  await assert.rejects(() => runFixture(stale, {afterStage: () => { current = false; }, assertCurrent: () => current}), /替换/);
  assert.deepEqual(stale.map, staleBefore, "地图替换防护没有回滚旧事务");
}

function verifyClimateInfluence() {
  const source = generatePlaceholderMap({seed: "ocean-climate-contract", cellsTarget: 2000, heightmapTemplate: "continents"});
  const current = source.oceanCurrents.currents[0];
  assert(current, "固定样本没有生成可测试洋流");
  const warmLow = climateVariant(source, {...current, temperature: "warm", strength: 0.25});
  const warmHigh = climateVariant(source, {...current, temperature: "warm", strength: 0.95});
  const cold = climateVariant(source, {...current, temperature: "cold", strength: 0.95});
  const reversed = climateVariant(source, reverseCurrent({...current, temperature: "warm", strength: 0.95}));
  assert(warmLow.meanTemperatureDelta > 0 && warmLow.meanPrecipitationDelta > 0, "暖流没有提高温度与降水");
  assert(warmHigh.meanTemperatureDelta > warmLow.meanTemperatureDelta, "洋流强度没有增强气候影响");
  assert(cold.meanTemperatureDelta < 0 && cold.meanPrecipitationDelta < 0, "寒流没有降低温度与降水");
  assert.notEqual(reversed.checksum, warmHigh.checksum, "反转流向没有改变气候影响分布");
  return {warmLow, warmHigh, cold, reverseChecksum: reversed.checksum};
}

async function verifyRealWorldRebuild() {
  const map = generatePlaceholderMap({seed: "ocean-world-real", cellsTarget: 2000, heightmapTemplate: "continents"});
  map.markers.markers[0].pinned = true;
  map.markers.markers[0].name = "人工保留标记";
  const preservedMarkerId = map.markers.markers[0].id;
  const identity = snapshotOceanCurrentWorldIdentity(map);
  const history = new EditHistory();
  const result = await executeOceanCurrentWorldRebuild({
    map,
    editHistory: history,
    seed: "ocean-world-real:rebuild",
    executeStage: (system, context) => rebuildOceanCurrentWorldStage(map, system, context),
    executeCommand(command) {
      history.execute(command, {map});
      return {executed: true, command};
    },
    refreshSummary() {
      assertOceanCurrentWorldIdentity(map, identity);
    },
    yieldToMain: () => Promise.resolve()
  });
  assert.equal(map.markers.markers.find(marker => marker.id === preservedMarkerId)?.name, "人工保留标记", "手动标记没有保留");
  assert.equal(new Set(map.markers.markers.map(marker => marker.packCell)).size, map.markers.markers.length, "人工标记与重算标记占用了同一 cell");
  assert(!map.settlements.routes.some(route => /pirate|海盗/i.test(`${route?.type || ""} ${route?.group || ""} ${route?.name || ""}`)), "整链重算擅自生成了海盗路线系统");
  assert(map.climate.metadata.oceanCurrentInfluence?.affectedCells > 0, "真实地图没有记录洋流气候影响");

  const document = createMapDocument(map, map.options);
  const parsed = parseMapDocument(stringifyMapDocument(document));
  assert.equal(parsed.map.climate.metadata.oceanCurrentInfluence.checksum, map.climate.metadata.oceanCurrentInfluence.checksum, "JSON 往返丢失洋流气候结果");
  const compressed = await createCompressedMapDocumentBlob({defaultView: globalThis}, document);
  const gzip = await parseMapDocumentFile({defaultView: globalThis}, new File([compressed.blob], "world.json.gz", {type: "application/gzip"}));
  assert.equal(gzip.map.oceanCurrents.currents.length, map.oceanCurrents.currents.length, "gzip 往返丢失洋流");
  return {currents: map.oceanCurrents.currents.length, affectedCells: map.climate.metadata.oceanCurrentInfluence.affectedCells, history: history.getStats(), totalMs: result.timings.totalMs};
}

async function verifyLegacyPoliticalMirrorCompatibility() {
  const map = generatePlaceholderMap({seed: "ocean-world-legacy-politics", cellsTarget: 5000, heightmapTemplate: "continents"});
  map.politics.states = structuredClone(map.politics.states);
  map.politics.provinces = structuredClone(map.politics.provinces);
  const state = map.politics.states.find(item => item?.i && !item.removed);
  const province = map.politics.provinces.find(item => item?.i && !item.removed);
  assert(state && province, "旧档镜像样本缺少国家或省份");
  state.name = "旧档保留国名";
  state.fullName = "旧档保留国全名";
  province.name = "旧档保留省名";
  province.fullName = "旧档保留省全名";
  const identity = snapshotOceanCurrentWorldIdentity(map);

  await rebuildOceanCurrentWorldStage(map, "states-provinces", {seed: "ocean-world-legacy-politics:rebuild"});
  assertOceanCurrentWorldIdentity(map, identity);
  assert.equal(map.pack.states, map.politics.states, "重算后国家双存储没有重新统一");
  assert.equal(map.pack.provinces, map.politics.provinces, "重算后省份双存储没有重新统一");
  assert.equal(map.politics.states[state.i]?.fullName, "旧档保留国全名", "旧档国家名称没有保留");
  assert.equal(map.politics.provinces[province.i]?.fullName, "旧档保留省全名", "旧档省份名称没有保留");
  return {stateId: state.i, provinceId: province.i};
}

async function verifyPerformanceTiers() {
  const reports = [];
  for (const cellsTarget of [10000, 50000, 100000]) {
    const map = generatePlaceholderMap({seed: `ocean-world-performance-${cellsTarget}`, cellsTarget, heightmapTemplate: "continents"});
    const started = performance.now();
    const timings = [];
    for (const system of OCEAN_CURRENT_WORLD_REBUILD_ORDER) {
      const stageStarted = performance.now();
      await rebuildOceanCurrentWorldStage(map, system, {seed: `ocean-world-performance-${cellsTarget}:rebuild`});
      timings.push({system, ms: round(performance.now() - stageStarted)});
    }
    const totalMs = round(performance.now() - started);
    assert(totalMs < (cellsTarget === 100000 ? 120000 : cellsTarget === 50000 ? 60000 : 30000), `${cellsTarget} cells 整链重算超出静态性能门槛：${totalMs}ms`);
    reports.push({cellsTarget, actualGridCells: map.grid.cells.i.length, actualPackCells: map.pack.cells.i.length, totalMs, stages: timings});
  }
  return reports;
}

async function verifyUiAndRuntimeWiring() {
  const [app, panel, model, markers] = await Promise.all([
    readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8"),
    readFile(new URL("../app/webgl-generator/src/ui/vue/components/OceanCurrentPanel.vue", import.meta.url), "utf8"),
    readFile(new URL("../app/webgl-generator/src/ui/panels/ocean-current-panel.js", import.meta.url), "utf8"),
    readFile(new URL("../app/webgl-generator/src/generator/markers.js", import.meta.url), "utf8")
  ]);
  assert.match(app, /oceanCurrents\.rebuildWorld/);
  assert.match(app, /seafloorPlan: plan/);
  assert.match(app, /cancelCurrent\?\.\("用户取消洋流世界重算"\)/);
  assert.match(panel, />仅重新计算洋流</);
  assert.match(panel, />重算气候与世界</);
  assert.match(panel, />取消重算</);
  assert.match(model, /updateWorldRebuild\(snapshot\)/);
  assert.match(markers, /type: "pirates"[\s\S]*category: "hazard"/, "海盗必须继续由既有标记规则生成");
}

function climateVariant(source, current) {
  const map = structuredClone(source);
  return applyOceanCurrentClimateInfluence(map.grid, map.features, map.climate, {currents: [current]});
}

function reverseCurrent(current) {
  return {
    ...current,
    path: {
      ...current.path,
      segments: [...current.path.segments].reverse().map(segment => ({
        start: [...segment.end],
        control1: [...segment.control2],
        control2: [...segment.control1],
        end: [...segment.start]
      }))
    }
  };
}

function transactionFixture() {
  return {
    map: {grid: {cells: {h: [20]}}, pack: {cells: {i: [0]}}, metadata: {trace: []}, trace: []},
    history: new EditHistory()
  };
}

async function runFixture(fixture, options = {}) {
  let stageCount = 0;
  return executeOceanCurrentWorldRebuild({
    map: fixture.map,
    editHistory: fixture.history,
    seed: "fixture",
    signal: options.signal,
    assertCurrent: options.assertCurrent,
    faultAt: options.faultAt,
    executePrepare: options.prepare ? () => {
      fixture.map.trace.push("seafloor");
      return {executed: true};
    } : null,
    executeStage(system) {
      fixture.map.trace.push(system);
      stageCount++;
      options.afterStage?.(system, stageCount);
      return {executed: true};
    },
    executeCommand(command) {
      fixture.history.execute(command, {map: fixture.map});
      return {executed: true, command};
    },
    yieldToMain: () => Promise.resolve()
  });
}

function round(value) {
  return Math.round(value * 100) / 100;
}
