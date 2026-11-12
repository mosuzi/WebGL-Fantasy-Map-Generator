import assert from "node:assert/strict";
import {
  cellMetricInradius,
  createCellMetricDataBuilder,
  populationColumnHeight,
  precipitationDotRadius
} from "../app/webgl-generator/src/renderer/cell-metric-layer.js";

const vertices = [
  [0, 0], [10, 0], [10, 10], [0, 10],
  [12, 0], [22, 0], [22, 10], [12, 10],
  [24, 0], [34, 0], [34, 10], [24, 10]
];
const map = {
  grid: {
    points: [[5, 5], [17, 5], [29, 5]],
    vertices: {p: vertices},
    cells: {
      i: [0, 1, 2],
      p: [0, 1, 2],
      v: [[0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11]],
      h: [30, 30, 0],
      pop: [10, 100, 500],
      prec: [20, 80, 100]
    }
  }
};

assert.equal(cellMetricInradius([5, 5], map.grid.cells.v[0], vertices), 4.5);
assert.equal(cellMetricInradius([40, 40], map.grid.cells.v[0], vertices), 0);
assert.equal(cellMetricInradius([5, 5], [0, 1], vertices), 0);
const builder = createCellMetricDataBuilder(map);
assert.equal(builder.step(1), false);
assert.equal(builder.step(1), false);
assert.equal(builder.step(1), true);
const data = builder.finish();
assert.equal(data.populationCount, 2);
assert.equal(data.precipitationCount, 2);
assert.equal(data.maxPopulation, 100);
assert.equal(data.maxPrecipitation, 80);
assert.deepEqual([...data.population], [5, 5, 4.5, 10, 17, 5, 4.5, 100]);
assert.deepEqual([...data.precipitation], [5, 5, 4.5, 20, 17, 5, 4.5, 80]);

const radius = 4.5;
assert.ok(populationColumnHeight(radius, 10, 100) < populationColumnHeight(radius, 100, 100));
assert.ok(populationColumnHeight(radius, 100, 100) <= radius);
assert.ok(precipitationDotRadius(radius, 20, 80) < precipitationDotRadius(radius, 80, 80));
assert.ok(precipitationDotRadius(radius, 80, 80) < radius);
assert.equal(populationColumnHeight(radius, 0, 100), 0);
assert.equal(precipitationDotRadius(radius, 0, 80), 0);

const legacyMap = structuredClone(map);
delete legacyMap.grid.cells.pop;
delete legacyMap.grid.cells.prec;
const legacyBuilder = createCellMetricDataBuilder(legacyMap);
assert.equal(legacyBuilder.step(3), true);
assert.equal(legacyBuilder.finish().populationCount, 0);
assert.equal(legacyBuilder.finish().precipitationCount, 0);

console.log("cell 人口柱与降雨量圆点：零值、海格、旧数据、单调比例和 cell 尺寸约束通过");
