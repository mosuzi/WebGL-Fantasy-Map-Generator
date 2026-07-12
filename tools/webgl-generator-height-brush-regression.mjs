#!/usr/bin/env node
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {getHeightBrushChanges} from "../app/webgl-generator/src/runtime/height-brush.js";
import {applyHeightBrushPreview, createApplyHeightBrushCommand} from "../app/webgl-generator/src/runtime/height-edit-commands.js";

const map = createSyntheticMap();
const stroke = {originals: new Map()};
const flatten = getHeightBrushChanges(map, {x: 10, y: 0}, {action: "flatten", radius: 25, strength: 4, falloff: false}, stroke);
assert(stroke.targetHeight === 20, `整平目标高度异常：${stroke.targetHeight}`);
assertChanges(flatten, [
  {gridCell: 0, before: 10, after: 14},
  {gridCell: 2, before: 30, after: 26},
  {gridCell: 3, before: 50, after: 46}
], "首次整平");

applyHeightBrushPreview(map, flatten);
const continued = getHeightBrushChanges(map, {x: 30, y: 0}, {action: "flatten", radius: 12, strength: 4, falloff: false}, stroke);
assert(stroke.targetHeight === 20, "拖动过程中整平目标被新的最近 cell 改写");
assert(continued.find(change => change.gridCell === 3)?.after === 42, "连续整平没有继续趋近落笔目标");

const history = new EditHistory();
const command = createApplyHeightBrushCommand(flatten, {label: "整平笔刷"});
history.execute(command, {map});
assert(history.getStats().lastDomain === "height", "整平没有复用高度命令领域");
history.undo({map});
assert([...map.grid.cells.h].join(",") === "10,20,30,50", `撤销整平没有恢复 grid：${[...map.grid.cells.h]}`);
assert([...map.pack.cells.h].join(",") === "10,20,30,50", `撤销整平没有恢复 pack：${[...map.pack.cells.h]}`);
history.redo({map});
assert([...map.grid.cells.h].join(",") === "14,20,26,46", `重做整平没有恢复结果：${[...map.grid.cells.h]}`);

const falloffStroke = {originals: new Map()};
const falloff = getHeightBrushChanges(createSyntheticMap(), {x: 10, y: 0}, {action: "flatten", radius: 20, strength: 8, falloff: true}, falloffStroke);
assert(!falloff.some(change => change.gridCell === 3), "整平衰减为零的边缘仍被计入变化");

const raise = getHeightBrushChanges(createSyntheticMap(), {x: 10, y: 0}, {action: "raise", radius: 10, strength: 4, falloff: false}, {originals: new Map()});
assert(raise.map(change => change.after).join(",") === "14,24,34", `抬升兼容结果异常：${raise.map(change => change.after)}`);
const smooth = getHeightBrushChanges(createSyntheticMap(), {x: 10, y: 0}, {action: "smooth", radius: 10, strength: 4, falloff: true}, {originals: new Map()});
assert(smooth.map(change => change.after).join(",") === "14,26", `平滑兼容结果异常：${smooth.map(change => change.after)}`);

console.log(JSON.stringify({
  ok: true,
  targetHeight: stroke.targetHeight,
  flattenAfter: flatten.map(change => change.after),
  continuedCell3: continued.find(change => change.gridCell === 3)?.after,
  falloffEdgeChanged: falloff.some(change => change.gridCell === 3),
  raiseAfter: raise.map(change => change.after),
  smoothAfter: smooth.map(change => change.after),
  history: history.getStats()
}, null, 2));

function createSyntheticMap() {
  return {
    metadata: {},
    grid: {
      points: [[0, 0], [10, 0], [20, 0], [30, 0]],
      cells: {
        p: Uint32Array.from([0, 1, 2, 3]),
        h: Uint8Array.from([10, 20, 30, 50])
      }
    },
    pack: {
      cells: {
        g: Uint32Array.from([0, 1, 2, 3]),
        h: Uint8Array.from([10, 20, 30, 50])
      }
    }
  };
}

function assertChanges(actual, expected, label) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label}变化异常：${JSON.stringify(actual)}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
