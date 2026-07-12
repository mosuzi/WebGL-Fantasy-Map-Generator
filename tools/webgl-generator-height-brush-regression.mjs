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

const disruptStroke = {originals: new Map(), seed: 17, iteration: 0};
const disrupt = getHeightBrushChanges(createSyntheticMap(), {x: 10, y: 0}, {action: "disrupt", scope: "all", radius: 25, strength: 8, falloff: false}, disruptStroke);
const repeatedDisrupt = getHeightBrushChanges(createSyntheticMap(), {x: 10, y: 0}, {action: "disrupt", scope: "all", radius: 25, strength: 8, falloff: false}, {originals: new Map(), seed: 17, iteration: 0});
assert(JSON.stringify(disrupt) === JSON.stringify(repeatedDisrupt), "相同 seed 的扰动结果不可复现");
assert(disruptStroke.iteration === 1, `扰动迭代没有推进：${disruptStroke.iteration}`);
assert(disrupt.some(change => change.after > change.before) && disrupt.some(change => change.after < change.before), "扰动没有同时产生局部抬升和降低");

const landScope = getHeightBrushChanges(createSyntheticMap(), {x: 10, y: 0}, {action: "raise", scope: "land", radius: 25, strength: 4, falloff: false}, {originals: new Map()});
assert(landScope.map(change => change.gridCell).join(",") === "1,2,3", `仅陆地范围包含了水域：${landScope.map(change => change.gridCell)}`);
const waterScope = getHeightBrushChanges(createSyntheticMap(), {x: 10, y: 0}, {action: "lower", scope: "water", radius: 25, strength: 4, falloff: false}, {originals: new Map()});
assert(waterScope.map(change => change.gridCell).join(",") === "0", `仅水域范围包含了陆地：${waterScope.map(change => change.gridCell)}`);

const stableScopeMap = createSyntheticMap();
const stableScopeStroke = {originals: new Map()};
const crossSeaLevel = getHeightBrushChanges(stableScopeMap, {x: 10, y: 0}, {action: "lower", scope: "land", radius: 1, strength: 4, falloff: false}, stableScopeStroke);
applyHeightBrushPreview(stableScopeMap, crossSeaLevel);
const continuedBelowSeaLevel = getHeightBrushChanges(stableScopeMap, {x: 10, y: 0}, {action: "lower", scope: "land", radius: 1, strength: 4, falloff: false}, stableScopeStroke);
assert(continuedBelowSeaLevel[0]?.gridCell === 1 && continuedBelowSeaLevel[0]?.after === 12, "陆地 cell 跨海平面后没有按首次修改前高度继续 stroke");

const enclosedWaterMap = createSquareMap(5, (x, y) => x > 0 && x < 4 && y > 0 && y < 4 ? 10 : 30);
const enclosedWaterStroke = {originals: new Map()};
const enclosedWaterFill = getHeightBrushChanges(enclosedWaterMap, {x: 2, y: 2}, {action: "fill", scope: "water", strength: 4}, enclosedWaterStroke);
assert(enclosedWaterFill.length === 9, `封闭水域填充数量异常：${enclosedWaterFill.length}`);
assert(enclosedWaterFill.find(change => change.gridCell === 12)?.after === 32, "封闭水域中心没有形成峰值");
assert(enclosedWaterFill.find(change => change.gridCell === 6)?.after === 21, "封闭水域边缘没有保持低坡脚");
assert(enclosedWaterStroke.notice === "已锥形填充 9 cells。", `封闭水域提示异常：${enclosedWaterStroke.notice}`);
assert(getHeightBrushChanges(enclosedWaterMap, {x: 2, y: 2}, {action: "fill", scope: "water", strength: 4}, enclosedWaterStroke).length === 0, "同一 stroke 重复执行了填充");

applyHeightBrushPreview(enclosedWaterMap, enclosedWaterFill);
const fillHistory = new EditHistory();
fillHistory.execute(createApplyHeightBrushCommand(enclosedWaterFill, {label: "锥形填充"}), {map: enclosedWaterMap});
fillHistory.undo({map: enclosedWaterMap});
assert(enclosedWaterMap.grid.cells.h[12] === 10 && enclosedWaterMap.pack.cells.h[12] === 10, "撤销锥形填充没有恢复 grid / pack 中心高度");
fillHistory.redo({map: enclosedWaterMap});
assert(enclosedWaterMap.grid.cells.h[12] === 32 && enclosedWaterMap.pack.cells.h[12] === 32, "重做锥形填充没有恢复 grid / pack 中心高度");

const openWaterStroke = {originals: new Map()};
const openWaterFill = getHeightBrushChanges(createSquareMap(5, () => 10), {x: 2, y: 2}, {action: "fill", scope: "water", strength: 4}, openWaterStroke);
assert(openWaterFill.length === 0 && openWaterStroke.notice.includes("开放海域"), `开放水域未被拒绝：${openWaterStroke.notice}`);

const missingBorderMap = createSquareMap(5, (x, y) => x > 0 && x < 4 && y > 0 && y < 4 ? 10 : 30);
delete missingBorderMap.grid.cells.b;
const missingBorderStroke = {originals: new Map()};
const missingBorderFill = getHeightBrushChanges(missingBorderMap, {x: 2, y: 2}, {action: "fill", scope: "water", strength: 4}, missingBorderStroke);
assert(missingBorderFill.length === 0 && missingBorderStroke.notice.includes("边界标记"), "缺少边界标记时仍执行了水域填充");

const landPlateauMap = createSquareMap(5, (x, y) => {
  if (x === 2 && y === 1) return 39;
  return (x === 2 && y === 2) || Math.abs(x - 2) + Math.abs(y - 2) === 1 ? 40 : 30;
});
const landFill = getHeightBrushChanges(landPlateauMap, {x: 2, y: 2}, {action: "fill", scope: "land", strength: 4, fillTolerance: 1}, {originals: new Map()});
assert(landFill.length === 5, `等高陆地填充数量异常：${landFill.length}`);
assert(landFill.find(change => change.gridCell === 12)?.after === 52, "等高陆地中心没有形成峰值");
assert(landFill.filter(change => change.gridCell !== 12).every(change => change.after === 41), "等高陆地坡脚高度异常");
assert(landFill.find(change => change.gridCell === 7)?.before === 39, "陆地 ±1 高度带没有纳入相邻近似等高 cell");

const defaultToleranceMap = createSquareMap(5, (x, y) => (x === 2 && y === 2) || Math.abs(x - 2) + Math.abs(y - 2) === 1 ? (x === 2 && y === 2 ? 40 : 35) : 20);
const defaultToleranceFill = getHeightBrushChanges(defaultToleranceMap, {x: 2, y: 2}, {action: "fill", scope: "land", strength: 4}, {originals: new Map()});
assert(defaultToleranceFill.length === 5, `默认高度容差 6 没有纳入差值 5 的邻接 cells：${defaultToleranceFill.length}`);

const highBandMap = createSquareMap(5, (x, y) => {
  if (x === 2 && y === 1) return 46;
  return (x === 2 && y === 2) || Math.abs(x - 2) + Math.abs(y - 2) === 1 ? 40 : 20;
});
const highBandFill = getHeightBrushChanges(highBandMap, {x: 2, y: 2}, {action: "fill", scope: "land", strength: 4, fillTolerance: 6}, {originals: new Map()});
assert(!highBandFill.some(change => change.gridCell === 7), "锥形填充降低了容差带内原本更高的 cell");

const mismatchedFillStroke = {originals: new Map()};
const mismatchedFillMap = createSquareMap(5, (x, y) => x > 0 && x < 4 && y > 0 && y < 4 ? 10 : 30);
const mismatchedFill = getHeightBrushChanges(mismatchedFillMap, {x: 2, y: 2}, {action: "fill", scope: "land", strength: 4}, mismatchedFillStroke);
assert(mismatchedFill.length === 0 && mismatchedFillStroke.notice.includes("作用范围"), "陆地范围没有拒绝水域落点");

const tinyFillStroke = {originals: new Map()};
const tinyFillMap = createSquareMap(5, (x, y) => x === 2 && y === 2 ? 50 : 30);
const tinyFill = getHeightBrushChanges(tinyFillMap, {x: 2, y: 2}, {action: "fill", scope: "land", strength: 4}, tinyFillStroke);
assert(tinyFill.length === 0 && tinyFillStroke.notice.includes("少于 3"), `过小连通域未被拒绝：${tinyFillStroke.notice}`);

const oversizedFillStroke = {originals: new Map()};
const oversizedFill = getHeightBrushChanges(createSquareMap(20, () => 40), {x: 10, y: 10}, {action: "fill", scope: "land", strength: 4, fillTolerance: 6}, oversizedFillStroke);
assert(oversizedFill.length === 0 && oversizedFillStroke.notice.includes("安全上限 80"), `过大连通域未被拒绝：${oversizedFillStroke.notice}`);

console.log(JSON.stringify({
  ok: true,
  targetHeight: stroke.targetHeight,
  flattenAfter: flatten.map(change => change.after),
  continuedCell3: continued.find(change => change.gridCell === 3)?.after,
  falloffEdgeChanged: falloff.some(change => change.gridCell === 3),
  raiseAfter: raise.map(change => change.after),
  smoothAfter: smooth.map(change => change.after),
  disruptAfter: disrupt.map(change => change.after),
  landScope: landScope.map(change => change.gridCell),
  waterScope: waterScope.map(change => change.gridCell),
  continuedBelowSeaLevel: continuedBelowSeaLevel[0]?.after,
  enclosedWaterFill: {cells: enclosedWaterFill.length, edge: enclosedWaterFill.find(change => change.gridCell === 6)?.after, center: enclosedWaterFill.find(change => change.gridCell === 12)?.after},
  openWaterNotice: openWaterStroke.notice,
  missingBorderNotice: missingBorderStroke.notice,
  tinyFillNotice: tinyFillStroke.notice,
  oversizedFillNotice: oversizedFillStroke.notice,
  landFill: {cells: landFill.length, center: landFill.find(change => change.gridCell === 12)?.after},
  defaultToleranceCells: defaultToleranceFill.length,
  preservedHighBandCell: !highBandFill.some(change => change.gridCell === 7),
  fillHistory: fillHistory.getStats(),
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

function createSquareMap(size, getHeight) {
  const points = [];
  const neighbors = [];
  const borders = new Uint8Array(size * size);
  const heights = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = y * size + x;
      points.push([x, y]);
      heights[cell] = getHeight(x, y);
      borders[cell] = x === 0 || y === 0 || x === size - 1 || y === size - 1 ? 1 : 0;
      neighbors[cell] = [
        x > 0 ? cell - 1 : null,
        x < size - 1 ? cell + 1 : null,
        y > 0 ? cell - size : null,
        y < size - 1 ? cell + size : null
      ].filter(Number.isInteger);
    }
  }
  return {
    metadata: {},
    grid: {
      points,
      cells: {
        i: Uint32Array.from(points, (_, index) => index),
        p: Uint32Array.from(points, (_, index) => index),
        c: neighbors,
        b: borders,
        h: heights
      }
    },
    pack: {
      cells: {
        g: Uint32Array.from(points, (_, index) => index),
        h: Uint8Array.from(heights)
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
