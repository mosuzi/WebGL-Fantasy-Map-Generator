#!/usr/bin/env node
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {getGlobalHeightChanges, getHeightBrushChanges, getHeightLineChanges, getHeightRangeTransformChanges, inspectHeightFillTarget, inspectHeightRangeTransform} from "../app/webgl-generator/src/runtime/height-brush.js";
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

const globalSmoothMap = createSquareMap(3, (x, y) => x === 1 && y === 1 ? 80 : Math.abs(x - 1) + Math.abs(y - 1) === 1 ? 20 : 10);
const globalSmooth = getGlobalHeightChanges(globalSmoothMap, {action: "smooth", scope: "land"});
assert(globalSmooth.find(change => change.gridCell === 4)?.after === 65, `全局平滑中心结果异常：${JSON.stringify(globalSmooth)}`);
assert([1, 3, 5, 7].every(gridCell => globalSmooth.find(change => change.gridCell === gridCell)?.after === 35), "全局平滑没有统一从修改前快照读取邻居");
assert(globalSmooth.every(change => change.before >= 20 && change.after >= 20), "仅陆地全局平滑跨越海平面或修改了水域");
applyHeightBrushPreview(globalSmoothMap, globalSmooth);
const globalHistory = new EditHistory();
globalHistory.execute(createApplyHeightBrushCommand(globalSmooth, {label: "全局平滑"}), {map: globalSmoothMap});
globalHistory.undo({map: globalSmoothMap});
assert(globalSmoothMap.grid.cells.h[4] === 80 && globalSmoothMap.pack.cells.h[4] === 80, "撤销全局平滑没有恢复 grid / pack");
globalHistory.redo({map: globalSmoothMap});
assert(globalSmoothMap.grid.cells.h[4] === 65 && globalSmoothMap.pack.cells.h[4] === 65, "重做全局平滑没有恢复 grid / pack");

const globalDisruptMap = createSquareMap(5, (x, y) => x === 0 && y === 0 ? 10 : 40);
const globalDisrupt = getGlobalHeightChanges(globalDisruptMap, {action: "disrupt", scope: "all", seed: 23});
const repeatedGlobalDisrupt = getGlobalHeightChanges(globalDisruptMap, {action: "disrupt", scope: "all", seed: 23});
const nextGlobalDisrupt = getGlobalHeightChanges(globalDisruptMap, {action: "disrupt", scope: "all", seed: 24});
assert(JSON.stringify(globalDisrupt) === JSON.stringify(repeatedGlobalDisrupt), "相同 seed 的全局扰动不可复现");
assert(JSON.stringify(globalDisrupt) !== JSON.stringify(nextGlobalDisrupt), "不同 seed 的全局扰动没有推进形态");
assert(!globalDisrupt.some(change => change.gridCell === 0), "全局扰动修改了低于 15 的深水 cell");
assert(getGlobalHeightChanges(globalDisruptMap, {action: "unknown", scope: "all"}).length === 0, "未知全局工具产生了高度变化");

const rangeTransformMap = createSyntheticMap();
const multiplyPreview = inspectHeightRangeTransform(rangeTransformMap, {scope: "land", lower: 20, upper: 50, operator: "multiply", operand: 0.5});
const multiplyChanges = getHeightRangeTransformChanges(rangeTransformMap, {scope: "land", lower: 20, upper: 50, operator: "multiply", operand: 0.5});
assert(multiplyPreview.valid && multiplyPreview.selectedCount === 3 && multiplyPreview.changeCount === 2, `条件乘算预检异常：${JSON.stringify(multiplyPreview)}`);
assert(!Object.hasOwn(multiplyPreview, "changes"), "公开条件变换预检暴露了完整 changes");
assert(multiplyPreview.beforeRange.join(",") === "20,50" && multiplyPreview.afterRange.join(",") === "20,35" && multiplyPreview.averageDelta === -10, `条件乘算摘要异常：${JSON.stringify(multiplyPreview)}`);
assertChanges(multiplyChanges, [
  {gridCell: 2, before: 30, after: 25},
  {gridCell: 3, before: 50, after: 35}
], "条件乘算");
const addChanges = getHeightRangeTransformChanges(createSyntheticMap(), {scope: "all", lower: 0, upper: 20, operator: "add", operand: 5});
assertChanges(addChanges, [
  {gridCell: 0, before: 10, after: 15},
  {gridCell: 1, before: 20, after: 25}
], "条件加高");
const subtractWater = getHeightRangeTransformChanges(createSyntheticMap(), {scope: "water", lower: 0, upper: 19, operator: "subtract", operand: 20});
assertChanges(subtractWater, [{gridCell: 0, before: 10, after: 0}], "条件水域降低");
const divideLand = getHeightRangeTransformChanges(createSyntheticMap(), {scope: "land", lower: 50, upper: 50, operator: "divide", operand: 2});
assertChanges(divideLand, [{gridCell: 3, before: 50, after: 35}], "条件除算");
const zeroMultiplyLand = getHeightRangeTransformChanges(createSyntheticMap(), {scope: "land", lower: 20, upper: 50, operator: "multiply", operand: 0});
assertChanges(zeroMultiplyLand, [
  {gridCell: 2, before: 30, after: 20},
  {gridCell: 3, before: 50, after: 20}
], "条件归零乘算");
const exponentLand = getHeightRangeTransformChanges(createSyntheticMap(), {scope: "land", lower: 30, upper: 30, operator: "exponent", operand: 2});
assertChanges(exponentLand, [{gridCell: 2, before: 30, after: 100}], "条件指数变换");
const invalidDivide = inspectHeightRangeTransform(createSyntheticMap(), {scope: "all", lower: 0, upper: 100, operator: "divide", operand: 0});
assert(!invalidDivide.valid && invalidDivide.notice.includes("大于 0"), `零除数未被拒绝：${JSON.stringify(invalidDivide)}`);
const invalidRange = inspectHeightRangeTransform(createSyntheticMap(), {scope: "all", lower: 80, upper: 20, operator: "add", operand: 1});
assert(!invalidRange.valid && invalidRange.notice.includes("下限"), "倒置高度区间未被拒绝");
const noopTransform = inspectHeightRangeTransform(createSyntheticMap(), {scope: "land", lower: 20, upper: 50, operator: "multiply", operand: 1});
assert(!noopTransform.valid && noopTransform.selectedCount === 3 && noopTransform.changeCount === 0 && noopTransform.notice.includes("不会变化"), "无变化条件变换仍被标记为可执行");

const rangeHistory = new EditHistory();
rangeHistory.execute(createApplyHeightBrushCommand(multiplyChanges, {label: "条件乘算"}), {map: rangeTransformMap});
rangeHistory.undo({map: rangeTransformMap});
assert(rangeTransformMap.grid.cells.h[3] === 50 && rangeTransformMap.pack.cells.h[3] === 50, "撤销条件乘算没有恢复 grid / pack");
rangeHistory.redo({map: rangeTransformMap});
assert(rangeTransformMap.grid.cells.h[3] === 35 && rangeTransformMap.pack.cells.h[3] === 35, "重做条件乘算没有恢复 grid / pack");

const stableScopeMap = createSyntheticMap();
const stableScopeStroke = {originals: new Map()};
const crossSeaLevel = getHeightBrushChanges(stableScopeMap, {x: 10, y: 0}, {action: "lower", scope: "land", radius: 1, strength: 4, falloff: false}, stableScopeStroke);
applyHeightBrushPreview(stableScopeMap, crossSeaLevel);
const continuedBelowSeaLevel = getHeightBrushChanges(stableScopeMap, {x: 10, y: 0}, {action: "lower", scope: "land", radius: 1, strength: 4, falloff: false}, stableScopeStroke);
assert(continuedBelowSeaLevel[0]?.gridCell === 1 && continuedBelowSeaLevel[0]?.after === 12, "陆地 cell 跨海平面后没有按首次修改前高度继续 stroke");

const enclosedWaterMap = createSquareMap(5, (x, y) => x > 0 && x < 4 && y > 0 && y < 4 ? 10 : 30);
const enclosedWaterPreview = inspectHeightFillTarget(enclosedWaterMap, 12, {scope: "water", fillTolerance: 6});
assert(enclosedWaterPreview.valid && enclosedWaterPreview.selectionCount === 9 && enclosedWaterPreview.notice.includes("可填充 9"), `封闭水域预检异常：${JSON.stringify(enclosedWaterPreview)}`);
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
const openWaterMap = createSquareMap(5, () => 10);
const openWaterPreview = inspectHeightFillTarget(openWaterMap, 12, {scope: "water", fillTolerance: 6});
assert(!openWaterPreview.valid && openWaterPreview.selectionCount === 25 && openWaterPreview.notice.includes("开放海域"), `开放水域预检异常：${JSON.stringify(openWaterPreview)}`);
const openWaterFill = getHeightBrushChanges(openWaterMap, {x: 2, y: 2}, {action: "fill", scope: "water", strength: 4}, openWaterStroke);
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
const defaultTolerancePreview = inspectHeightFillTarget(defaultToleranceMap, 12, {scope: "land"});
assert(defaultTolerancePreview.valid && defaultTolerancePreview.tolerance === 6 && defaultTolerancePreview.selectionCount === 5, `默认高度容差预检异常：${JSON.stringify(defaultTolerancePreview)}`);

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

const lineMap = createSquareMap(5, () => 40);
const lineStroke = {originals: new Map()};
const ridgeLine = getHeightLineChanges(lineMap, {x: 0, y: 2}, {x: 4, y: 2}, {linePower: 10, lineWidth: 0.4, scope: "land", falloff: false}, lineStroke);
assert(ridgeLine.length === 5 && ridgeLine.every(change => change.after === 50), `正 power 山脊结果异常：${JSON.stringify(ridgeLine)}`);
assert(lineStroke.notice === "已生成线段地形 5 cells。", `山脊提示异常：${lineStroke.notice}`);

applyHeightBrushPreview(lineMap, ridgeLine);
const lineHistory = new EditHistory();
lineHistory.execute(createApplyHeightBrushCommand(ridgeLine, {label: "线段山脊"}), {map: lineMap});
lineHistory.undo({map: lineMap});
assert(lineMap.grid.cells.h[12] === 40 && lineMap.pack.cells.h[12] === 40, "撤销线段山脊没有恢复 grid / pack");
lineHistory.redo({map: lineMap});
assert(lineMap.grid.cells.h[12] === 50 && lineMap.pack.cells.h[12] === 50, "重做线段山脊没有恢复 grid / pack");

const troughLine = getHeightLineChanges(createSquareMap(5, () => 40), {x: 0, y: 2}, {x: 4, y: 2}, {linePower: -8, lineWidth: 0.4, scope: "land", falloff: false}, {originals: new Map()});
assert(troughLine.length === 5 && troughLine.every(change => change.after === 32), "负 power 沟槽没有按 signed power 降低高度");

const falloffLine = getHeightLineChanges(createSquareMap(5, () => 40), {x: 0, y: 2}, {x: 4, y: 2}, {linePower: 10, lineWidth: 2, scope: "land", falloff: true}, {originals: new Map()});
assert(falloffLine.length === 15, `线宽衰减命中数量异常：${falloffLine.length}`);
assert(falloffLine.find(change => change.gridCell === 12)?.after === 50, "线段中心没有应用完整 power");
assert(falloffLine.find(change => change.gridCell === 7)?.after === 45, "线段侧缘没有应用横向衰减");

const zeroLineStroke = {originals: new Map()};
assert(getHeightLineChanges(createSquareMap(5, () => 40), {x: 0, y: 2}, {x: 4, y: 2}, {linePower: 0, lineWidth: 1, scope: "all"}, zeroLineStroke).length === 0 && zeroLineStroke.notice.includes("不能为 0"), "零 power 线段未被拒绝");
const shortLineStroke = {originals: new Map()};
assert(getHeightLineChanges(createSquareMap(5, () => 40), {x: 2, y: 2}, {x: 2.2, y: 2.2}, {linePower: 10, lineWidth: 1, scope: "all"}, shortLineStroke).length === 0 && shortLineStroke.notice.includes("过近"), "同 cell 短线段未被拒绝");
const scopeLineStroke = {originals: new Map()};
assert(getHeightLineChanges(createSquareMap(5, () => 40), {x: 0, y: 2}, {x: 4, y: 2}, {linePower: 10, lineWidth: 1, scope: "water"}, scopeLineStroke).length === 0 && scopeLineStroke.notice.includes("没有命中"), "线段没有遵守陆水范围");
const oversizedLineStroke = {originals: new Map()};
assert(getHeightLineChanges(createSquareMap(20, () => 40), {x: 0, y: 10}, {x: 19, y: 10}, {linePower: 10, lineWidth: 100, scope: "all"}, oversizedLineStroke).length === 0 && oversizedLineStroke.notice.includes("安全上限 80"), "过大线段选区未被拒绝");

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
  globalSmooth: {cells: globalSmooth.length, center: globalSmooth.find(change => change.gridCell === 4)?.after},
  globalDisrupt: {cells: globalDisrupt.length, first: globalDisrupt[0]?.after},
  globalHistory: globalHistory.getStats(),
  multiplyPreview,
  invalidDivideNotice: invalidDivide.notice,
  rangeHistory: rangeHistory.getStats(),
  continuedBelowSeaLevel: continuedBelowSeaLevel[0]?.after,
  enclosedWaterFill: {cells: enclosedWaterFill.length, edge: enclosedWaterFill.find(change => change.gridCell === 6)?.after, center: enclosedWaterFill.find(change => change.gridCell === 12)?.after},
  enclosedWaterPreview,
  openWaterNotice: openWaterStroke.notice,
  openWaterPreview,
  missingBorderNotice: missingBorderStroke.notice,
  tinyFillNotice: tinyFillStroke.notice,
  oversizedFillNotice: oversizedFillStroke.notice,
  landFill: {cells: landFill.length, center: landFill.find(change => change.gridCell === 12)?.after},
  defaultToleranceCells: defaultToleranceFill.length,
  defaultTolerancePreview,
  preservedHighBandCell: !highBandFill.some(change => change.gridCell === 7),
  fillHistory: fillHistory.getStats(),
  ridgeLine: {cells: ridgeLine.length, center: ridgeLine.find(change => change.gridCell === 12)?.after},
  troughLine: {cells: troughLine.length, center: troughLine.find(change => change.gridCell === 12)?.after},
  falloffLine: {cells: falloffLine.length, center: falloffLine.find(change => change.gridCell === 12)?.after, side: falloffLine.find(change => change.gridCell === 7)?.after},
  oversizedLineNotice: oversizedLineStroke.notice,
  lineHistory: lineHistory.getStats(),
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
