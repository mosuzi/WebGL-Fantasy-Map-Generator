import assert from "node:assert/strict";
import {compareAnalysisRegions, compareRegionPower, defineAnalysisRegion, diagnoseRegionPopulation, diagnoseRegionTerrain, explainRegionPrecipitation} from "../app/webgl-generator/src/runtime/map-analysis-api.js";

const map = createFixture();
const checksum = map.metadata.checksum;
const north = {cells: [0, 1, 2]};
const south = {cells: [3, 4, 5]};
const mountains = {cells: [1, 2, 4, 5]};

assert.deepEqual(defineAnalysisRegion(map, {kind: "state", id: 1}).cells, [0, 1, 2, 3, 4, 5]);
assert.deepEqual(defineAnalysisRegion(map, {operation: "difference", regions: [{kind: "state", id: 1}, south]}).cells, [0, 1, 2]);

const rainfall = explainRegionPrecipitation(map, north);
assert.equal(rainfall.metrics.precipitation.mean, 18);
assert.ok(rainfall.diagnosis.barrierCells.some(cell => cell.id === 2));

const population = diagnoseRegionPopulation(map, north);
assert.equal(population.diagnosis.code, "population-capacity-ready");
assert.ok(population.diagnosis.limitingFactors.includes("no-urban-anchor"));
assert.equal(population.diagnosis.candidateCells[0].id, 0);

const comparison = compareAnalysisRegions(map, north, south);
assert.equal(comparison.interpretation.morePopulous, "right");
assert.equal(comparison.interpretation.wetter, "right");

const power = compareRegionPower(map, north, south);
assert.ok(power.power.right > power.power.left);
assert.ok(power.power.ratio < 1);

const terrain = diagnoseRegionTerrain(map, mountains);
assert.equal(terrain.diagnosis.code, "terrain-gradient-ready");
assert.ok(terrain.diagnosis.abruptCells.length > 0);
assert.equal(terrain.diagnosis.suggestedTargets.preserveRelativeRelief, true);
assert.equal(map.metadata.checksum, checksum);

console.log("区域分析回归通过：集合区域、降水屏障、人口承载、国力比较与地形梯度诊断均符合预期。 ");

function createFixture() {
  return {
    metadata: {checksum: "analysis-fixture"},
    grid: {cells: {
      h: Uint8Array.from([22, 48, 78, 24, 45, 82]),
      prec: Uint8Array.from([30, 18, 6, 42, 34, 20]),
      temp: Int8Array.from([18, 12, 4, 20, 14, 5])
    }},
    pack: {cells: {
      i: Uint16Array.from([0, 1, 2, 3, 4, 5]),
      g: Uint16Array.from([0, 1, 2, 3, 4, 5]),
      h: Uint8Array.from([22, 48, 78, 24, 45, 82]),
      c: [[1, 3], [0, 2, 4], [1, 5], [0, 4], [1, 3, 5], [2, 4]],
      state: Uint8Array.from([1, 1, 1, 1, 1, 1]),
      province: Uint8Array.from([1, 1, 1, 2, 2, 2]),
      pop: Float32Array.from([12, 2, 0, 28, 18, 4]),
      s: Int16Array.from([18, 4, -10, 26, 14, -8]),
      burg: Uint8Array.from([0, 0, 0, 1, 0, 0]),
      road: Uint8Array.from([1, 0, 0, 1, 1, 0])
    }},
    settlements: {burgs: [null, {i: 1, cell: 3, population: 70}]},
    zones: {zones: []}
  };
}
