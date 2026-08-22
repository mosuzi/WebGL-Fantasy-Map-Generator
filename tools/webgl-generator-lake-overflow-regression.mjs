#!/usr/bin/env node
import assert from "node:assert/strict";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {buildRivers, createRiverLakeDrainageExpectations} from "../app/webgl-generator/src/generator/rivers.js";
import {
  activateOverflowRoute,
  applyLakeOverflowDiagnostics,
  applyOverflowRouteOrdering,
  buildLakeEscapeField,
  createLakeOverflowPlan,
  evaluateLakeOverflow,
  normalizeLakeOverflowDiagnostics
} from "../app/webgl-generator/src/generator/lake-overflow.js";
import {createMapDocument, parseMapDocument, stringifyMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {resolveObject} from "../app/webgl-generator/src/runtime/object-resolver.js";

const synthetic = createSyntheticLake();
const escapeField = buildLakeEscapeField(synthetic.pack, synthetic.heights);
const plan = createLakeOverflowPlan(synthetic.pack, synthetic.heights, synthetic.lake, escapeField);
assert.deepEqual(plan.route, [1, 2, 3], "闭流湖应沿最低溢流鞍点找到出海路径");
assert.equal(plan.terminalCell, 4, "溢流路径应落到真实外海 cell");
assert.ok(plan.spillElevation > synthetic.lake.height, "夹具应覆盖从较低湖面进入较高平均地块");
assert.ok(plan.storageCapacity > 0, "有限湖盆必须计算正的蓄水容量指标");
assert.ok(plan.requiredIncision > 0, "超过被动涨水上限的鞍点应产生下切需求");

const overflowing = evaluateLakeOverflow({...synthetic.lake, flux: 15_338, evaporation: 200}, plan);
assert.equal(overflowing.overflows, true, "高净补给湖泊应蓄满后形成出流");
assert.equal(overflowing.status, "overflow-channel");
assert.ok(overflowing.incisionBudget >= plan.requiredIncision, "高流量应提供足够的有界下切预算");

const balanced = evaluateLakeOverflow({...synthetic.lake, flux: 150, evaporation: 200}, plan);
assert.equal(balanced.overflows, false, "蒸发可消纳来水时湖泊应保持稳定闭流");
assert.equal(balanced.status, "balanced-terminal");

const highDividePack = createSyntheticLake({barrierHeight: 60});
const highDivideField = buildLakeEscapeField(highDividePack.pack, highDividePack.heights);
const highDividePlan = createLakeOverflowPlan(highDividePack.pack, highDividePack.heights, highDividePack.lake, highDivideField);
const incisionLimited = evaluateLakeOverflow({...highDividePack.lake, flux: 600, evaporation: 100}, highDividePlan);
assert.equal(incisionLimited.overflows, false, "小河不得无界穿越高分水岭");
assert.equal(incisionLimited.status, "incision-limited");

const processingHeights = Array.from(synthetic.heights);
applyOverflowRouteOrdering(processingHeights, plan, synthetic.lake.height);
assert.ok(processingHeights[1] > processingHeights[2] && processingHeights[2] > processingHeights[3], "溢流河床应形成严格向下的处理顺序");
const activeDownstream = new Map();
activateOverflowRoute(activeDownstream, plan);
assert.deepEqual([...activeDownstream], [[1, 2], [2, 3], [3, 4]], "激活后的溢流路径应逐 cell 连续到外海");

applyLakeOverflowDiagnostics(synthetic.lake, plan, overflowing);
assert.equal(synthetic.lake.overflow.netFlux, 15_138);
assert.equal(synthetic.lake.overflow.spillCell, 1);

const integrated = createIntegratedOverflowFixture();
const integratedOptions = {
  seed: "integrated-lake-overflow",
  cellsTarget: integrated.pack.cells.i.length,
  heightExponent: 2
};
const integratedExpectation = createRiverLakeDrainageExpectations(integrated.grid, integrated.pack, integratedOptions).lakes.get(1);
assert.deepEqual(
  {closed: integratedExpectation.closed, overflows: integratedExpectation.overflows, status: integratedExpectation.status, outCell: integratedExpectation.outCell},
  {closed: true, overflows: true, status: "overflow-channel", outCell: 1},
  "正式河流地形与湖泊水文共享流水线应识别闭流湖的可下切出口"
);
const integratedRivers = buildRivers(integrated.grid, {features: integrated.pack.features}, integrated.pack, {
  ...integratedOptions
});
const integratedLake = integrated.pack.features[1];
const outletRiver = integratedRivers.rivers.find(river => river.i === integratedLake.outlet);
assert.equal(integratedLake.overflow.status, "overflow-channel", "生成主循环应实际消费深洼湖的溢流方案");
assert.ok(outletRiver, "跨越多 cell 湖面的新出口河不得被陆地河源门禁误删");
assert.ok(integrated.pack.cells.h[outletRiver.source] >= 20, "湖泊新出口河应从溢流岸 cell 起算");
assert.deepEqual(outletRiver.cells, [1, 2, 3, 4], "新出口河应从湖岸逐 cell 穿过下切河床到外海");
assert.equal(outletRiver.networkStatus, "ocean-mouth");

const seedResults = [];
let diagnosedLakes = 0;
let generatedOverflowChannels = 0;
let incisedTransitions = 0;
for (const seed of ["lake-overflow-a", "lake-overflow-b", "lake-overflow-c"]) {
  const map = generatePlaceholderMap({seed, cellsTarget: 10000, heightmapTemplate: "continents"});
  const lakes = (map.pack.features || []).filter(feature => feature?.type === "lake");
  assert.ok(lakes.every(lake => lake.overflow?.version === 1), `${seed}: 所有新湖泊都应有水量与溢流诊断`);
  assert.ok(lakes.every(lake => lake.overflow.status !== "unknown-legacy"), `${seed}: 新图不得留下旧图未知状态`);
  assert.ok(lakes.every(lake => lake.overflow.netFlux === null || Number.isFinite(lake.overflow.netFlux)), `${seed}: 湖泊净补给必须可解释`);
  diagnosedLakes += lakes.length;
  generatedOverflowChannels += lakes.filter(lake => lake.overflow.status === "overflow-channel").length;
  incisedTransitions += Number(map.rivers.metadata.incisedTransitions) || 0;
  seedResults.push({
    seed,
    lakes: lakes.length,
    overflowChannels: lakes.filter(lake => lake.overflow.status === "overflow-channel").length,
    naturalOutlets: lakes.filter(lake => lake.overflow.status === "natural-outlet").length,
    terminal: lakes.filter(lake => ["balanced-terminal", "incision-limited", "no-escape"].includes(lake.overflow.status)).length,
    incisedTransitions: Number(map.rivers.metadata.incisedTransitions) || 0,
    rivers: map.rivers.rivers.length
  });
}
assert.ok(diagnosedLakes > 0, "固定种子应生成湖泊以覆盖诊断");
assert.ok(incisedTransitions > 0, "固定种子应保留平均高度逆向但在下切预算内的真实河段");

const compatibilityMap = generatePlaceholderMap({seed: "lake-overflow-legacy", cellsTarget: 3000, heightmapTemplate: "continents"});
const legacyLake = compatibilityMap.pack.features.find(feature => feature?.type === "lake");
assert.ok(legacyLake, "旧图夹具需要湖泊");
delete legacyLake.overflow;
const document = createMapDocument(compatibilityMap);
for (const feature of document.map.pack.features || []) {
  if (feature?.type === "lake") delete feature.overflow;
}
const imported = parseMapDocument(stringifyMapDocument(document)).map;
const importedLake = imported.pack.features.find(feature => Number(feature?.i ?? feature?.id) === Number(legacyLake.i ?? legacyLake.id));
assert.equal(importedLake.overflow.version, 1, "旧图缺少溢流诊断时应安全回填");
assert.ok(["legacy-outlet", "unknown-legacy"].includes(importedLake.overflow.status));
const resolvedLake = resolveObject(imported, {kind: "lake", id: Number(importedLake.i ?? importedLake.id)});
assert.equal(resolvedLake.overflowStatus, importedLake.overflow.status, "对象查询应公开湖泊溢流状态");
assert.ok("storageCapacity" in resolvedLake && "requiredIncision" in resolvedLake, "对象查询应公开库容和下切基础字段");

const bareLegacy = createSyntheticLake();
delete bareLegacy.lake.overflow;
const normalizedLegacy = normalizeLakeOverflowDiagnostics(bareLegacy.pack);
assert.equal(normalizedLegacy.changed, 1);
assert.equal(bareLegacy.lake.overflow.status, "unknown-legacy");

console.log(JSON.stringify({
  ok: true,
  synthetic: {
    route: plan.route,
    terminalCell: plan.terminalCell,
    spillElevation: plan.spillElevation,
    storageCapacity: plan.storageCapacity,
    requiredIncision: plan.requiredIncision,
    incisionBudget: overflowing.incisionBudget,
    estimatedFillTime: overflowing.estimatedFillTime
  },
  integrated: {
    expectedStatus: integratedExpectation.status,
    lakeStatus: integratedLake.overflow.status,
    outletRiverId: outletRiver.id,
    outletCells: outletRiver.cells,
    outletStatus: outletRiver.networkStatus
  },
  fixedSeeds: seedResults,
  generatedOverflowChannels,
  incisedTransitions,
  legacy: {
    lakeId: importedLake.i ?? importedLake.id,
    status: importedLake.overflow.status
  }
}, null, 2));

function createSyntheticLake({barrierHeight = 26} = {}) {
  const lake = {
    i: 1,
    id: 1,
    type: "lake",
    height: 19.9,
    area: 12,
    cells: 1,
    firstCell: 0,
    shoreline: [1],
    closed: true,
    flux: 15_338,
    evaporation: 200
  };
  const heights = [10, 22, barrierHeight, 23, 10];
  return {
    lake,
    heights,
    pack: {
      features: [
        {i: 0, id: 0, type: "ocean", border: true},
        lake
      ],
      cells: {
        i: Uint16Array.from([0, 1, 2, 3, 4]),
        h: Uint8Array.from(heights),
        f: Uint16Array.from([1, 0, 0, 0, 0]),
        b: Uint8Array.from([0, 0, 0, 0, 0]),
        c: [[1], [0, 2], [1, 3], [2, 4], [3]]
      }
    }
  };
}

function createIntegratedOverflowFixture() {
  const heights = [10, 22, 40, 23, 10, 50, 30, 10, 10];
  const neighbors = [
    [1, 8],
    [0, 2],
    [1, 3],
    [2, 4],
    [3],
    [6],
    [5, 7],
    [6, 8],
    [7, 0]
  ];
  const points = heights.map((_, index) => [index * 10, index % 2 ? 10 : 20]);
  const lake = {
    i: 1,
    id: 1,
    type: "lake",
    land: false,
    border: false,
    cells: 3,
    firstCell: 0,
    area: 12,
    shoreline: [1, 6],
    height: 19.9,
    group: "freshwater"
  };
  const pack = {
    features: [
      {i: 0, id: 0, type: "ocean", land: false, border: true, cells: 1, firstCell: 4, height: 0, shoreline: [], group: "ocean"},
      lake,
      {i: 2, id: 2, type: "island", land: true, border: false, cells: 5, firstCell: 1, height: 0, shoreline: [], group: "island"}
    ],
    cells: {
      i: Uint16Array.from(heights.map((_, index) => index)),
      h: Uint8Array.from(heights),
      t: Int8Array.from(heights.map(height => height < 20 ? -1 : 1)),
      f: Uint16Array.from([1, 2, 2, 2, 0, 2, 2, 1, 1]),
      g: Uint16Array.from(heights.map((_, index) => index)),
      b: Uint8Array.from(heights.map(() => 0)),
      haven: Uint16Array.from(heights.map(() => 0)),
      area: Float32Array.from(heights.map(() => 1)),
      culture: Uint16Array.from(heights.map(() => 0)),
      c: neighbors,
      p: points
    },
    cultures: [{i: 0, name: "无"}],
    metadata: {cells: heights.length}
  };
  const precipitation = Float32Array.from([0, 10_000, 0, 0, 0, 100, 10_000, 0, 0]);
  const temperature = Int8Array.from(heights.map(() => 18));
  return {
    pack,
    grid: {
      points,
      metadata: {cellsDesired: heights.length},
      cells: {
        i: Uint16Array.from(heights.map((_, index) => index)),
        prec: precipitation,
        temp: temperature
      }
    }
  };
}
